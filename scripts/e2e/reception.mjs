import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { recoveredRead } from "./readiness.mjs";
import { today, addDays, athensInstant, localDate } from "../../web/utils.js";
export async function verifyReception({
  test,
  api,
  sql,
  until,
  compose,
  resilience,
  admin,
  member,
  stranger,
  profile,
  otherProfile,
  bookings,
  liveBooking,
}) {
  const courts = (await api(member, "/api/courts")).data,
    day = addDays(today(), 7),
    next = addDays(today(), 8);
  const make = async (who, hour, date = day, court = courts[0]) => {
    const r = await api(who, "/api/bookings", "POST", {
      courtId: court.id,
      startsAt: athensInstant(date, hour),
      durationMinutes: 90,
      players: 4,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    bookings.push(r.data.id);
    return r.data;
  };
  const move = (b, courtId, startsAt, reason = "Reception E2E move") => ({
    courtId,
    startsAt,
    expectedCourtId: b.courtId,
    expectedStartsAt: b.startsAt,
    expectedEndsAt: b.endsAt,
    reason,
  });
  const history = (id) => api(admin, "/api/bookings/" + id + "/history");
  let b, body, key, moved, wait;
  await test("Reception endpoints require staff and migration preserves previous bookings without fabricated history", async () => {
    assert.equal(
      await sql(
        "padel_bookings",
        "SELECT count(*) FROM flyway_schema_history WHERE version='7' AND success;",
      ),
      "1",
    );
    for (const p of [
      "/api/bookings/reception/week",
      "/api/bookings/" + liveBooking.id + "/history",
      "/api/bookings/" + liveBooking.id + "/attendance",
    ]) {
      assert.equal((await api(null, p)).status, 401);
      assert.equal((await api(member, p)).status, 403);
      assert.equal((await api(admin, p)).status, 200);
    }
    assert.equal(
      (
        await api(
          member,
          "/api/bookings/" + liveBooking.id + "/move",
          "POST",
          move(liveBooking, courts[0].id, athensInstant(day, "09:00")),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await api(
          member,
          "/api/bookings/" + liveBooking.id + "/attendance/" + profile.id,
          "PUT",
          { status: "PRESENT", reason: "Member is not staff" },
        )
      ).status,
      403,
    );
  });
  await test("Reception member search matches literal name email phone and denies members", async () => {
    for (const query of [
      profile.fullName.toLowerCase(),
      profile.email,
      profile.phone,
    ]) {
      const r = await api(
        admin,
        "/api/members?query=" + encodeURIComponent(query),
      );
      assert.equal(r.status, 200);
      assert(r.data.some((m) => m.id === profile.id));
    }
    assert.equal(
      (
        await api(
          member,
          "/api/members?query=" + encodeURIComponent(profile.fullName),
        )
      ).status,
      403,
    );
    assert.equal((await api(admin, "/api/members?page=-1")).status, 400);
    assert.equal((await api(admin, "/api/members?query=%25")).data.length, 0);
  });
  await test("Weekly reception calendar groups the real booking by Athens dates and named participants", async () => {
    b = await make(member, "09:00");
    const invite = await api(
      member,
      "/api/padel/games/" + b.id + "/invitations",
      "POST",
      { memberId: otherProfile.id },
    );
    assert.equal(invite.status, 200);
    assert.equal(
      (
        await api(stranger, "/api/padel/invitations/" + invite.data.id, "PUT", {
          status: "ACCEPTED",
        })
      ).status,
      200,
    );
    const r = await api(admin, "/api/bookings/reception/week?date=" + day);
    assert.equal(r.status, 200);
    assert.equal(new Date(r.data.from + "T12:00Z").getUTCDay(), 1);
    assert(r.data.from <= day && r.data.to >= day);
    assert.equal(
      localDate(r.data.bookings.find((x) => x.id === b.id).startsAt),
      day,
    );
    const a = await api(admin, "/api/bookings/" + b.id + "/attendance");
    assert.equal(a.data.players.length, 2);
    assert.equal(a.data.canRecord, false);
    assert(a.data.players.every((p) => p.status === "UNRECORDED"));
  });
  await test("A court conflict rolls back the move including roster, audit, outbox and idempotency claim", async () => {
    const blocker = await make(stranger, "11:00", next, courts[2]),
      attemptKey = randomUUID(),
      before = (await history(b.id)).data;
    const r = await api(
      admin,
      "/api/bookings/" + b.id + "/move",
      "POST",
      move(
        b,
        courts[2].id,
        blocker.startsAt,
        `Conflict rollback ${attemptKey}`,
      ),
      "el-GR",
      attemptKey,
    );
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.deepEqual((await api(member, "/api/bookings/" + b.id)).data, b);
    assert.deepEqual((await history(b.id)).data, before);
    // Successful background delivery deletes unrelated outbox rows. Follow this
    // attempt's unique reason in both pending events and durable notifications.
    for (const delay of [0, 3000]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      assert.equal(
        await sql(
          "padel_bookings",
          `SELECT count(*) FROM outbox_events WHERE payload::jsonb->>'detail' LIKE '%${attemptKey}%';`,
        ),
        "0",
      );
      assert.equal(
        await sql(
          "padel_notifications",
          `SELECT count(*) FROM notifications WHERE detail LIKE '%${attemptKey}%';`,
        ),
        "0",
      );
    }
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM idempotency_requests WHERE request_key='${attemptKey}';`,
      ),
      "0",
    );
    assert.equal(
      (await api(admin, "/api/bookings/" + blocker.id, "DELETE")).status,
      200,
    );
  });
  await test("A confirmed participant conflict or disabled profile blocks a move and preserves the original", async () => {
    const blocker = await make(stranger, "11:00", next, courts[1]);
    assert.equal(
      (
        await api(
          admin,
          "/api/bookings/" + b.id + "/move",
          "POST",
          move(b, courts[2].id, blocker.startsAt),
        )
      ).status,
      409,
    );
    assert.deepEqual((await api(member, "/api/bookings/" + b.id)).data, b);
    assert.equal(
      (await api(admin, "/api/bookings/" + blocker.id, "DELETE")).status,
      200,
    );
    assert.equal(
      (
        await api(
          admin,
          "/api/members/" + otherProfile.id + "/enabled",
          "PATCH",
          { enabled: false },
        )
      ).status,
      200,
    );
    try {
      assert.equal(
        (
          await api(
            admin,
            "/api/bookings/" + b.id + "/move",
            "POST",
            move(b, courts[2].id, athensInstant(next, "11:00")),
          )
        ).status,
        409,
      );
    } finally {
      assert.equal(
        (
          await api(
            admin,
            "/api/members/" + otherProfile.id + "/enabled",
            "PATCH",
            { enabled: true },
          )
        ).status,
        200,
      );
    }
  });
  await test("Eight concurrent move replays keep one booking, one change and notify the released slot once", async () => {
    wait = (
      await api(member, "/api/padel/waitlist", "PUT", {
        courtId: b.courtId,
        startsAt: b.startsAt,
        durationMinutes: 90,
      })
    ).data;
    assert(wait.id);
    key = randomUUID();
    body = move(b, courts[2].id, athensInstant(next, "11:00"));
    assert.equal(
      (
        await api(
          admin,
          "/api/bookings/" + b.id + "/move",
          "POST",
          body,
          "el-GR",
          null,
        )
      ).status,
      400,
    );
    const rs = await Promise.all(
      Array.from({ length: 8 }, () =>
        api(
          admin,
          "/api/bookings/" + b.id + "/move",
          "POST",
          body,
          "el-GR",
          key,
        ),
      ),
    );
    for (const r of rs) {
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.deepEqual(r.data, rs[0].data);
    }
    moved = rs[0].data;
    assert.equal(moved.id, b.id);
    assert.equal(moved.priceCents, 4500);
    assert.equal(
      Date.parse(moved.endsAt) - Date.parse(moved.startsAt),
      5400000,
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM booking_changes WHERE booking_id='${b.id}' AND action='BOOKING_MOVED';`,
      ),
      "1",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM booking_players WHERE booking_id='${b.id}' AND status='ACCEPTED' AND starts_at='${moved.startsAt}' AND ends_at='${moved.endsAt}';`,
      ),
      "2",
    );
    assert.equal(
      (await api(member, "/api/padel/waitlist")).data.find(
        (w) => w.id === wait.id,
      ).status,
      "NOTIFIED",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE court_id='${b.courtId}' AND starts_at='${b.startsAt}' AND status='CONFIRMED';`,
      ),
      "0",
    );
    assert.equal(
      (await api(member, "/api/padel/waitlist/" + wait.id, "DELETE")).status,
      200,
    );
    await until(
      async () =>
        (await sql(
          "padel_notifications",
          `SELECT count(*) FROM notifications WHERE member_id='${otherProfile.id}' AND title='Η κράτηση μεταφέρθηκε' AND detail LIKE '%Reception E2E move%' AND status='IN_APP';`,
        )) === "1",
      "Exactly one moved notice to participant",
    );
    assert.equal(
      (
        await api(
          admin,
          "/api/bookings/" + b.id + "/move",
          "POST",
          { ...body, reason: "Different intent" },
          "el-GR",
          key,
        )
      ).status,
      409,
    );
    assert.equal(
      (await api(admin, "/api/bookings/" + b.id + "/move", "POST", body))
        .status,
      409,
    );
  });
  await test("Two competing moves with different keys reject the stale edit and retain actor and before/after history", async () => {
    const rs = await Promise.all([
      api(
        admin,
        "/api/bookings/" + b.id + "/move",
        "POST",
        move(
          moved,
          courts[0].id,
          athensInstant(next, "14:00"),
          "Concurrent option A",
        ),
      ),
      api(
        admin,
        "/api/bookings/" + b.id + "/move",
        "POST",
        move(
          moved,
          courts[1].id,
          athensInstant(next, "16:00"),
          "Concurrent option B",
        ),
      ),
    ]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
    const h = (await history(b.id)).data.filter(
      (c) => c.action === "BOOKING_MOVED",
    );
    assert.equal(h.length, 2);
    for (const c of h) {
      assert.equal(c.actorSubject, admin.id);
      assert(c.actorName);
      assert(c.reason);
      assert(c.changedAt);
      assert(c.before.courtId);
      assert(c.after.startsAt);
    }
  });
  await test("Concurrent attendance records once, corrections retain history and outsiders cannot be marked", async () => {
    const path =
        "/api/bookings/" + liveBooking.id + "/attendance/" + profile.id,
      body = { status: "PRESENT", reason: "Reception arrival E2E" };
    assert.equal(
      (await api(admin, "/api/bookings/" + liveBooking.id + "/attendance")).data
        .canRecord,
      true,
    );
    const rs = await Promise.all(
      Array.from({ length: 8 }, () => api(admin, path, "PUT", body)),
    );
    assert(
      rs.every((r) => r.status === 200),
      JSON.stringify(rs.map(({ status, data }) => ({ status, data }))),
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM booking_attendance WHERE booking_id='${liveBooking.id}';`,
      ),
      "1",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM booking_changes WHERE booking_id='${liveBooking.id}' AND action='ATTENDANCE_RECORDED';`,
      ),
      "1",
    );
    assert.equal(
      (
        await api(
          admin,
          "/api/bookings/" + liveBooking.id + "/attendance/" + otherProfile.id,
          "PUT",
          body,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await api(admin, path, "PUT", {
          status: "ABSENT",
          reason: "Corrected by reception",
        })
      ).status,
      200,
    );
    assert.equal((await api(admin, path, "PUT", body)).status, 200);
    const h = (await history(liveBooking.id)).data.filter((c) =>
      c.action.startsWith("ATTENDANCE_"),
    );
    assert.equal(h.length, 3);
    assert(
      h.some(
        (c) => c.before?.status === "PRESENT" && c.after.status === "ABSENT",
      ),
    );
    assert(h.every((c) => c.actorSubject === admin.id));
    const a = (
      await api(admin, "/api/bookings/" + liveBooking.id + "/attendance")
    ).data;
    assert.equal(a.players[0].status, "PRESENT");
    assert.equal(a.players[0].recordedBy, admin.id);
    const current = (await api(admin, "/api/bookings/" + liveBooking.id)).data;
    assert.equal(
      (
        await api(
          admin,
          "/api/bookings/" + liveBooking.id + "/move",
          "POST",
          move(current, courts[1].id, athensInstant(next, "18:00")),
        )
      ).status,
      409,
    );
  });
  await test("Future and expired attendance windows reject marks; cancellation preserves attendance and history", async () => {
    assert.equal(
      (
        await api(
          admin,
          "/api/bookings/" + b.id + "/attendance/" + profile.id,
          "PUT",
          { status: "PRESENT", reason: "Too early E2E" },
        )
      ).status,
      409,
    );
    const expired = await make(member, "16:00", addDays(today(), 9), courts[2]);
    await sql(
      "padel_bookings",
      `UPDATE bookings SET starts_at=now()-interval '27 hours',ends_at=now()-interval '26 hours' WHERE id='${expired.id}';`,
    );
    assert.equal(
      (await api(admin, "/api/bookings/" + expired.id + "/attendance")).data
        .canRecord,
      false,
    );
    assert.equal(
      (
        await api(
          admin,
          "/api/bookings/" + expired.id + "/attendance/" + profile.id,
          "PUT",
          { status: "ABSENT", reason: "Expired E2E" },
        )
      ).status,
      409,
    );
    // A separate owned fixture exercises cancellation without affecting later access tests.
    const recorded = await make(
      member,
      "18:00",
      addDays(today(), 9),
      courts[1],
    );
    await sql(
      "padel_bookings",
      `UPDATE bookings SET starts_at=now()-interval '3 hours',ends_at=now()-interval '2 hours' WHERE id='${recorded.id}';`,
    );
    assert.equal(
      (
        await api(
          admin,
          "/api/bookings/" + recorded.id + "/attendance/" + profile.id,
          "PUT",
          { status: "ABSENT", reason: "No show E2E" },
        )
      ).status,
      200,
    );
    assert.equal(
      (await api(admin, "/api/bookings/" + recorded.id, "DELETE")).status,
      200,
    );
    const a = (await api(admin, "/api/bookings/" + recorded.id + "/attendance"))
      .data;
    assert.equal(a.canRecord, false);
    assert.equal(a.players[0].status, "ABSENT");
    assert(
      (await history(recorded.id)).data.some(
        (h) => h.action === "BOOKING_CANCELLED",
      ),
    );
  });
  if (resilience)
    await test("Reception audit, original move response and dependent access recover after booking restart", async () => {
      const available = (request, label) =>
        until(
          async () => {
            const response = await request();
            return [502, 503].includes(response.status) ? false : response;
          },
          label,
          180000,
        );
      await compose("restart", "booking-service");
      // The signed gateway maps a refused connection during endpoint handover
      // to 500. Permit that only in this initial positive bootstrap read;
      // business reads/writes below still reject 500 immediately.
      const restoredHistory = await until(
        async () => {
          const response = await history(b.id);
          return [500, 502, 503].includes(response.status) ? false : response;
        },
        "Reception after service restart",
        180000,
      );
      assert.equal(
        restoredHistory.status,
        200,
        JSON.stringify(restoredHistory.data),
      );
      assert.equal(
        restoredHistory.data.filter((h) => h.action === "BOOKING_MOVED").length,
        2,
      );
      const replay = await available(
        () =>
          api(
            admin,
            "/api/bookings/" + b.id + "/move",
            "POST",
            body,
            "el-GR",
            key,
          ),
        "Persisted move response after service restart",
      );
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.data, moved);
      // Gateway recovery does not imply the access-service Feign cache has
      // observed booking's re-registration. Prove that dependent path too.
      const access = await until(
        () =>
          recoveredRead(
            () =>
              api(admin, "/api/access/validate", "POST", {
                bookingId: liveBooking.id,
              }),
            () =>
              compose(
                "exec",
                "-T",
                "access-service",
                "wget",
                "-qO-",
                "http://localhost:8080/actuator/prometheus",
              ),
            "BookingClientget",
          ),
        "Access-service observes restarted booking-service",
        180000,
      );
      assert.equal(access.status, 200, JSON.stringify(access.data));
      assert.equal(access.data.allowed, true);
      // Functional first-write concurrency is verified before this deliberate
      // outage. Now separately prove persisted attendance and real write recovery;
      // a history read or idempotency replay alone never exercises Feign clients.
      const metrics = () =>
        compose(
          "exec",
          "-T",
          "booking-service",
          "wget",
          "-qO-",
          "http://localhost:8080/actuator/prometheus",
        );
      const owned = await until(
        () =>
          recoveredRead(
            () => api(member, "/api/bookings/" + liveBooking.id),
            metrics,
            "MemberClientme",
          ),
        "Booking ownership path and downstream circuit recover after restart",
        180000,
      );
      assert.equal(owned.status, 200, JSON.stringify(owned.data));
      assert.equal(owned.data.id, liveBooking.id);
      const attendancePath = "/api/bookings/" + liveBooking.id + "/attendance";
      const persisted = await until(
        async () => {
          const response = await api(admin, attendancePath);
          return [502, 503].includes(response.status) ? false : response;
        },
        "Persisted attendance route after restart",
        180000,
      );
      assert.equal(persisted.status, 200, JSON.stringify(persisted.data));
      assert.equal(persisted.data.players[0].status, "PRESENT");
      assert.equal(persisted.data.players[0].recordedBy, admin.id);
      const auditCount = async () => {
        const response = await available(
          () => history(liveBooking.id),
          "Attendance audit route after restart",
        );
        assert.equal(response.status, 200, JSON.stringify(response.data));
        return response.data.filter((c) => c.action.startsWith("ATTENDANCE_"))
          .length;
      };
      assert.equal(await auditCount(), 3);
      for (const status of ["ABSENT", "PRESENT"]) {
        // Same intent is idempotent in ReceptionService.mark: replaying a lost
        // success must not create another audit entry. Never retry auth/domain errors.
        const corrected = await until(
          async () => {
            const response = await api(
              admin,
              attendancePath + "/" + profile.id,
              "PUT",
              { status, reason: "Post-restart attendance recovery E2E" },
            );
            return [502, 503].includes(response.status) ? false : response;
          },
          "Attendance write and eligibility recover: " + status,
          180000,
        );
        assert.equal(corrected.status, 200, JSON.stringify(corrected.data));
      }
      assert.equal(await auditCount(), 5);
      const restored = await available(
        () => api(admin, attendancePath),
        "Restored attendance after correction",
      );
      assert.equal(restored.status, 200, JSON.stringify(restored.data));
      assert.equal(restored.data.players[0].status, "PRESENT");
    });
}
