import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { today, addDays, athensInstant, time } from "../../web/utils.js";
import { assertConcurrentExclusion } from "./sql-conflicts.mjs";
export async function verifyPadel({
  test,
  api,
  sql,
  until,
  createUser,
  login,
  admin,
  member,
  stranger,
  profile,
  otherProfile,
  bookings,
  subscriptions,
  databaseBooking,
}) {
  const courts = (await api(member, "/api/courts")).data,
    day = addDays(today(), 5);
  const make = async (
    hour,
    capacity = 2,
    courtId = courts[0].id,
    who = member,
    extra = {},
  ) => {
    const response = await api(who, "/api/bookings", "POST", {
      courtId,
      startsAt: athensInstant(day, hour),
      durationMinutes: 60,
      players: capacity,
      ...extra,
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    bookings.push(response.data.id);
    return response.data;
  };
  let inviteGame, invitation, openGame, waitingGame, wait, third, thirdProfile;
  await test("Padel migrations validate player exclusion and install owner schedule trigger", async () => {
    assert.equal(
      await sql(
        "padel_bookings",
        "SELECT count(*) FROM flyway_schema_history WHERE version IN ('5','6') AND success;",
      ),
      "2",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        "SELECT count(*) FROM pg_constraint WHERE conrelid='booking_players'::regclass AND conname='players_no_confirmed_overlap' AND contype='x' AND convalidated AND NOT condeferrable;",
      ),
      "1",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        "SELECT count(*) FROM pg_trigger WHERE tgrelid='bookings'::regclass AND tgname='booking_owner_schedule' AND NOT tgisinternal;",
      ),
      "1",
    );
  });
  await test("Player directory requires login, returns enabled names and never returns contact or identity details", async () => {
    assert.equal((await api(null, "/api/players?query=Player")).status, 401);
    assert.equal((await api(member, "/api/players?query=x")).status, 400);
    const search = await api(
      member,
      "/api/players?query=" + encodeURIComponent(otherProfile.fullName),
    );
    assert.equal(search.status, 200);
    assert.equal(search.data.length, 1);
    assert.deepEqual(Object.keys(search.data[0]).sort(), [
      "enabled",
      "fullName",
      "id",
    ]);
    assert.equal(search.data[0].id, otherProfile.id);
  });
  await test("Organizer roster is created; private games reject outsiders and staff can inspect without a member profile", async () => {
    inviteGame = await make("10:00");
    const details = await api(member, "/api/padel/games/" + inviteGame.id);
    assert.equal(details.status, 200);
    assert.equal(details.data.roster.length, 1);
    assert.equal(details.data.roster[0].status, "ACCEPTED");
    assert.equal(details.data.roster[0].owner, true);
    assert.equal(
      (await api(stranger, "/api/padel/games/" + inviteGame.id)).status,
      403,
    );
    assert.equal(
      (await api(admin, "/api/padel/games/" + inviteGame.id)).status,
      200,
    );
  });
  await test("Invitation reserves a seat, repeat sends are stable and only the invitee can answer", async () => {
    const body = { memberId: otherProfile.id };
    const response = await api(
      member,
      "/api/padel/games/" + inviteGame.id + "/invitations",
      "POST",
      body,
    );
    assert.equal(response.status, 200);
    invitation = response.data.id;
    assert.deepEqual(
      (
        await api(
          member,
          "/api/padel/games/" + inviteGame.id + "/invitations",
          "POST",
          body,
        )
      ).data,
      response.data,
    );
    assert.equal(
      (
        await api(member, "/api/padel/invitations/" + invitation, "PUT", {
          status: "ACCEPTED",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api(stranger, "/api/padel/invitations/" + invitation, "PUT", {
          status: "ACCEPTED",
        })
      ).status,
      409,
      "Inactive subscription cannot accept",
    );
    assert.equal(
      (await api(stranger, "/api/bookings")).data.some(
        (b) => b.id === inviteGame.id,
      ),
      false,
    );
    await until(
      async () =>
        (await sql(
          "padel_notifications",
          `SELECT count(*) FROM notifications WHERE member_id='${otherProfile.id}' AND title='Πρόσκληση για padel' AND status='IN_APP';`,
        )) === "1",
      "One in-app invitation",
    );
  });
  await test("Concurrent repeat acceptance confirms once and adds the game to the participant calendar", async () => {
    third = await login(await createUser("padel-third"));
    const response = await api(third, "/api/members/me", "PUT", {
      fullName: "Padel Third " + randomUUID(),
      phone: "+30 690 000 0003",
    });
    assert.equal(response.status, 200);
    thirdProfile = response.data;
    for (const p of [otherProfile, thirdProfile]) {
      const sub = await api(admin, "/api/subscriptions", "POST", {
        memberId: p.id,
        plan: "MONTHLY",
        startsOn: today(),
      });
      assert.equal(sub.status, 200);
      subscriptions.push(sub.data.id);
    }
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        api(stranger, "/api/padel/invitations/" + invitation, "PUT", {
          status: "ACCEPTED",
        }),
      ),
    );
    for (const r of responses)
      assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(
      (await api(stranger, "/api/bookings")).data.filter(
        (b) => b.id === inviteGame.id,
      ).length,
      1,
    );
    assert.equal(
      (await api(stranger, "/api/bookings/" + inviteGame.id)).status,
      200,
    );
    assert.equal(
      (await api(stranger, "/api/bookings/" + inviteGame.id, "DELETE")).status,
      403,
    );
    await until(
      async () =>
        (await sql(
          "padel_notifications",
          `SELECT count(*) FROM notifications WHERE member_id='${profile.id}' AND title='Η πρόσκληση έγινε δεκτή' AND status='IN_APP';`,
        )) === "1",
      "One answer event despite concurrent retries",
    );
  });
  await test("Accepted participant cannot book an overlapping court through HTTP or direct SQL", async () => {
    assert.equal(
      (
        await api(stranger, "/api/bookings", "POST", {
          courtId: courts[1].id,
          startsAt: inviteGame.startsAt,
          durationMinutes: 60,
          players: 2,
        })
      ).status,
      409,
    );
    const attempt = databaseBooking(
      inviteGame.startsAt,
      inviteGame.endsAt,
      "CONFIRMED",
      courts[1].id,
      otherProfile.id,
    );
    await assert.rejects(sql("padel_bookings", attempt.query), (error) => {
      assert.match(error.stderr, /23P01/);
      assert.match(error.stderr, /players_no_confirmed_overlap/);
      return true;
    });
  });
  await test("Two simultaneous joins compete for one open seat; level filters and owner permissions hold", async () => {
    openGame = await make("12:00");
    assert.equal(
      (
        await api(stranger, "/api/padel/games/" + openGame.id, "PATCH", {
          openMatch: true,
          level: "INTERMEDIATE",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api(member, "/api/padel/games/" + openGame.id, "PATCH", {
          openMatch: true,
          level: "INTERMEDIATE",
        })
      ).status,
      200,
    );
    assert(
      (await api(stranger, "/api/padel/matches?level=INTERMEDIATE")).data.some(
        (m) => m.booking.id === openGame.id,
      ),
    );
    assert(
      !(await api(stranger, "/api/padel/matches?level=BEGINNER")).data.some(
        (m) => m.booking.id === openGame.id,
      ),
    );
    const responses = await Promise.all(
      [stranger, third].map((who) =>
        api(who, "/api/padel/games/" + openGame.id + "/join", "PUT"),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM booking_players WHERE booking_id='${openGame.id}' AND status='ACCEPTED';`,
      ),
      "2",
    );
    assert(
      !(await api(member, "/api/padel/matches")).data.some(
        (m) => m.booking.id === openGame.id,
      ),
    );
  });
  await test("Withdrawing a participant reopens the match and releases their schedule", async () => {
    const d = (await api(member, "/api/padel/games/" + openGame.id)).data,
      row = d.roster.find((p) => !p.owner && p.status === "ACCEPTED"),
      who = row.memberId === otherProfile.id ? stranger : third;
    assert.equal(
      (
        await api(
          who,
          "/api/padel/games/" + openGame.id + "/players/" + row.id,
          "DELETE",
        )
      ).status,
      200,
    );
    assert(
      (await api(who, "/api/padel/matches")).data.some(
        (m) => m.booking.id === openGame.id && m.places === 1,
      ),
    );
    await make("12:00", 2, courts[1].id, who);
  });
  await test("Waitlist joins deduplicate, stay private and notify once when a cancellation opens the slot", async () => {
    waitingGame = await make("14:00");
    const body = {
      courtId: waitingGame.courtId,
      startsAt: waitingGame.startsAt,
      durationMinutes: 60,
    };
    const response = await api(stranger, "/api/padel/waitlist", "PUT", body);
    assert.equal(response.status, 200);
    wait = response.data;
    assert.deepEqual(
      (await api(stranger, "/api/padel/waitlist", "PUT", body)).data,
      wait,
    );
    assert.equal(
      (await api(member, "/api/padel/waitlist/" + wait.id, "DELETE")).status,
      403,
    );
    assert(
      !(await api(member, "/api/padel/waitlist")).data.some(
        (w) => w.id === wait.id,
      ),
    );
    assert.equal(
      (await api(member, "/api/bookings/" + waitingGame.id, "DELETE")).status,
      200,
    );
    assert.equal(
      (await api(member, "/api/bookings/" + waitingGame.id, "DELETE")).status,
      200,
    );
    assert.equal(
      (await api(stranger, "/api/padel/waitlist")).data.find(
        (w) => w.id === wait.id,
      ).status,
      "NOTIFIED",
    );
    await until(
      async () =>
        (await sql(
          "padel_notifications",
          `SELECT count(*) FROM notifications WHERE member_id='${otherProfile.id}' AND title='Ελευθερώθηκε ώρα στο γήπεδο' AND status='IN_APP';`,
        )) === "1",
      "One in-app availability notice",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE court_id='${waitingGame.courtId}' AND starts_at='${waitingGame.startsAt}' AND status='CONFIRMED';`,
      ),
      "0",
    );
    assert.equal(
      (await api(stranger, "/api/padel/waitlist/" + wait.id, "DELETE")).status,
      200,
    );
  });
  await test("Four weekly bookings retain Athens local time and concurrent replays return the same series", async () => {
    const first = addDays(today(), 3),
      body = {
        courtId: courts[2].id,
        startsAt: athensInstant(first, "09:00"),
        durationMinutes: 60,
        players: 4,
        weeks: 4,
      },
      key = randomUUID();
    assert.equal(
      (await api(member, "/api/padel/series", "POST", body, "el-GR", null))
        .status,
      400,
    );
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        api(member, "/api/padel/series", "POST", body, "el-GR", key),
      ),
    );
    for (const r of responses)
      if (r.status === 200)
        for (const b of r.data.bookings)
          if (!bookings.includes(b.id)) bookings.push(b.id);
    for (const r of responses) {
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.deepEqual(r.data, responses[0].data);
      assert.equal(r.data.bookings.length, 4);
    }
    const series = responses[0].data;
    for (let i = 0; i < 4; i++) {
      assert.equal(
        series.bookings[i].startsAt.replace(".000Z", "Z"),
        athensInstant(addDays(first, 7 * i), "09:00").replace(".000Z", "Z"),
      );
      assert.equal(time(series.bookings[i].startsAt), "09:00");
      assert.equal(
        (await api(member, "/api/padel/games/" + series.bookings[i].id)).data
          .seriesId,
        series.id,
      );
    }
    assert.equal(
      (
        await api(
          member,
          "/api/padel/series",
          "POST",
          { ...body, weeks: 3 },
          "el-GR",
          key,
        )
      ).status,
      409,
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE series_id='${series.id}';`,
      ),
      "4",
    );
  });
  await test("Conflict in week two rolls back the whole series, its outbox writes and idempotency claim", async () => {
    const first = addDays(today(), 4),
      body = {
        courtId: courts[2].id,
        startsAt: athensInstant(first, "11:00"),
        durationMinutes: 60,
        players: 2,
        weeks: 3,
      },
      key = randomUUID();
    const blocker = await api(member, "/api/bookings", "POST", {
      ...body,
      startsAt: athensInstant(addDays(first, 7), "11:00"),
    });
    assert.equal(blocker.status, 200);
    bookings.push(blocker.data.id);
    assert.equal(
      (await api(member, "/api/padel/series", "POST", body, "el-GR", key))
        .status,
      409,
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE member_id='${profile.id}' AND starts_at='${body.startsAt}';`,
      ),
      "0",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM idempotency_requests WHERE request_key='${key}';`,
      ),
      "0",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM outbox_events WHERE payload::jsonb->>'memberId'='${profile.id}' AND payload::jsonb->>'detail' LIKE '%${first}T11:00%';`,
      ),
      "0",
    );
  });
  await test("Three concurrent direct SQL reservations on different courts enforce one player schedule", async () => {
    const attempts = courts.map((c) =>
      databaseBooking(
        "2035-01-12T10:00:00Z",
        "2035-01-12T11:00:00Z",
        "CONFIRMED",
        c.id,
      ),
    );
    const responses = await Promise.allSettled(
      attempts.map((row) =>
        sql(
          "padel_bookings",
          `BEGIN; ${row.query} SELECT pg_sleep(1); COMMIT;`,
        ),
      ),
    );
    assert.equal(responses.filter((r) => r.status === "fulfilled").length, 1);
    for (const [index, r] of responses.entries())
      if (r.status === "rejected") {
        assert.equal(
          await sql(
            "padel_bookings",
            `SELECT count(*) FROM bookings WHERE id='${attempts[index].id}';`,
          ),
          "0",
        );
        await assertConcurrentExclusion(
          r.reason,
          attempts[index].query,
          sql,
          /players_no_confirmed_overlap/,
        );
      }
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM booking_players WHERE booking_id IN (${attempts.map((row) => `'${row.id}'`).join(",")}) AND status='ACCEPTED';`,
      ),
      "1",
    );
  });
}
