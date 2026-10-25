const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let demo, u, ui;
before(async () => {
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  demo = await import("../demo.js");
  u = await import("../utils.js");
  ui = await import("../reception.js");
});
const call = (p, method = "GET", body) => demo.demoRequest(p, { method, body });
const moveBody = (b, courtId, startsAt) => ({
  courtId,
  startsAt,
  expectedCourtId: b.courtId,
  expectedStartsAt: b.startsAt,
  expectedEndsAt: b.endsAt,
  reason: "Αίτημα διοργανωτή",
});
test("week dates remain Monday through Sunday across Athens DST and the calendar hides cancelled bookings by default", () => {
  assert.equal(ui.weekStart("2026-10-25"), "2026-10-19");
  assert.equal(ui.weekStart("2026-10-26"), "2026-10-26");
  assert.equal(ui.weekStart("2026-03-29"), "2026-03-23");
  const state = {
    staff: true,
    receptionWeek: "2026-10-19",
    courts: [{ id: "court", name: "Court", enabled: true }],
    reception: {
      bookings: [
        {
          id: "b",
          courtId: "court",
          memberName: "<img src=x>",
          startsAt: "2026-10-25T09:00:00Z",
          endsAt: "2026-10-25T10:00:00Z",
          players: 4,
          priceCents: 2400,
          status: "CONFIRMED",
        },
        {
          id: "cancel",
          courtId: "court",
          memberName: "CANCELLED FIXTURE",
          startsAt: "2026-10-24T09:00:00Z",
          endsAt: "2026-10-24T10:00:00Z",
          players: 4,
          priceCents: 2400,
          status: "CANCELLED",
        },
      ],
    },
  };
  const render = () =>
    ui.receptionPage({
      state,
      heading: () => "",
      sectionResource: (_, fn) => fn(),
    });
  assert(render().includes("&lt;img src=x&gt;"));
  assert(!render().includes("CANCELLED FIXTURE"));
  state.receptionCancelled = true;
  assert(render().includes("CANCELLED FIXTURE"));
  state.staff = false;
  assert.equal(render(), "");
});
test("reception member search supports names, email and phone including disabled members and literal wildcards", async () => {
  demo.resetDemo();
  demo.demoRole(true);
  await call("/api/members/demo-other/enabled", "PATCH", { enabled: false });
  for (const query of ["Μαρία", "maria@", "690 111"]) {
    const members = await call(
      "/api/members?query=" + encodeURIComponent(query),
    );
    assert.equal(members.length, 1);
    assert.equal(members[0].id, "demo-other");
    assert.equal(members[0].enabled, false);
  }
  assert.equal((await call("/api/members?query=%25")).length, 0);
  demo.demoRole(false);
  await assert.rejects(call("/api/members?query=alex"), /διαχειριστή/);
});
test("moving a booking preserves its identity and duration, recomputes fees and produces one auditable change", async () => {
  demo.resetDemo();
  demo.demoRole(true);
  const b = (await call("/api/bookings")).find((b) => b.id === "demo-booking"),
    courts = await call("/api/courts"),
    body = moveBody(
      b,
      courts[2].id,
      u.athensInstant(u.addDays(u.today(), 3), "11:00"),
    );
  const count = (await call("/api/bookings")).length;
  const moved = await call("/api/bookings/" + b.id + "/move", "POST", body);
  assert.equal(moved.id, b.id);
  assert.equal(moved.priceCents, 4500);
  assert.equal(Date.parse(moved.endsAt) - Date.parse(moved.startsAt), 5400000);
  assert.equal((await call("/api/bookings")).length, count);
  const h = await call("/api/bookings/" + b.id + "/history");
  assert.equal(h.length, 1);
  assert.equal(h[0].action, "BOOKING_MOVED");
  assert.equal(h[0].before.courtId, b.courtId);
  assert.equal(h[0].after.courtId, courts[2].id);
  assert.equal(h[0].actorSubject, "demo-staff");
  await assert.rejects(
    call("/api/bookings/" + b.id + "/move", "POST", body),
    /άλλαξε/,
  );
  assert.equal((await call("/api/bookings/" + b.id + "/history")).length, 1);
});
test("a conflicting move leaves the original booking, notices and history unchanged; members cannot move", async () => {
  demo.resetDemo();
  demo.demoRole(true);
  const b = (await call("/api/bookings")).find((b) => b.id === "demo-booking"),
    courts = await call("/api/courts"),
    start = u.athensInstant(u.addDays(u.today(), 4), "10:00");
  await call("/api/bookings", "POST", {
    courtId: courts[2].id,
    startsAt: start,
    durationMinutes: 90,
    players: 4,
  });
  const before = await call("/api/bookings/" + b.id),
    notices = await call("/api/notifications"),
    history = await call("/api/bookings/" + b.id + "/history");
  await assert.rejects(
    call(
      "/api/bookings/" + b.id + "/move",
      "POST",
      moveBody(b, courts[2].id, start),
    ),
    /ήδη κρατηθεί/,
  );
  assert.deepEqual(await call("/api/bookings/" + b.id), before);
  assert.deepEqual(await call("/api/notifications"), notices);
  assert.deepEqual(await call("/api/bookings/" + b.id + "/history"), history);
  demo.demoRole(false);
  await assert.rejects(
    call(
      "/api/bookings/" + b.id + "/move",
      "POST",
      moveBody(b, courts[2].id, start),
    ),
    /υποδοχής/,
  );
});
test("attendance is per confirmed player, repeated marks do not duplicate history, corrections remain and expired windows reject writes", async (t) => {
  demo.resetDemo();
  demo.demoRole(true);
  const b = (await call("/api/bookings")).find((b) => b.id === "demo-booking"),
    path = "/api/bookings/" + b.id + "/attendance/demo-member",
    present = { status: "PRESENT", reason: "Προσέλευση στη reception" };
  await assert.rejects(call(path, "PUT", present), /15 λεπτά/);
  let now = Date.parse(b.startsAt) - 900000;
  t.mock.method(Date, "now", () => now);
  await call(path, "PUT", present);
  await call(path, "PUT", present);
  assert.equal((await call("/api/bookings/" + b.id + "/history")).length, 1);
  await call(path, "PUT", { status: "ABSENT", reason: "Διόρθωση καταγραφής" });
  const h = await call("/api/bookings/" + b.id + "/history");
  assert.equal(h.length, 2);
  assert.equal(h[0].action, "ATTENDANCE_CORRECTED");
  assert.equal(h[0].before.status, "PRESENT");
  assert.equal(h[0].after.status, "ABSENT");
  assert.equal(
    (await call("/api/bookings/" + b.id + "/attendance")).players[0].status,
    "ABSENT",
  );
  await assert.rejects(
    call("/api/bookings/" + b.id + "/attendance/stranger", "PUT", present),
    /επιβεβαιωμένων/,
  );
  now = Date.parse(b.endsAt) + 86400000;
  assert.equal(
    (await call("/api/bookings/" + b.id + "/attendance")).canRecord,
    false,
  );
  await assert.rejects(call(path, "PUT", present), /24 ώρες/);
  t.mock.restoreAll();
});
test("history safely renders reasons and before/after values, and old bookings show no fabricated history", () => {
  const html = ui.historyMarkup(
    [
      {
        action: "BOOKING_MOVED",
        actorName: "<b>staff</b>",
        reason: "<img onerror=x>",
        changedAt: "2026-10-01T12:00:00Z",
        before: {
          courtId: "a",
          startsAt: "2026-10-04T08:00:00Z",
          endsAt: "2026-10-04T09:00:00Z",
          priceCents: 2400,
          status: "CONFIRMED",
        },
        after: {
          courtId: "b",
          startsAt: "2026-10-04T09:00:00Z",
          endsAt: "2026-10-04T10:00:00Z",
          priceCents: 3000,
          status: "CONFIRMED",
        },
      },
    ],
    [
      { id: "a", name: "Court A" },
      { id: "b", name: "Court B" },
    ],
  );
  assert(html.includes("&lt;img onerror=x&gt;"));
  assert(!html.includes("<img"));
  assert(html.includes("Court A"));
  assert(html.includes("Court B"));
  assert(html.includes("Πριν"));
  assert(ui.historyMarkup([], []).includes("δεν ανακατασκευάζονται"));
});
