const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let utils, demo;
before(async () => {
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  utils = await import("../utils.js");
  demo = await import("../demo.js");
});
test("Athens summer and winter slots keep the requested local hour", () => {
  assert.equal(
    utils.athensInstant("2026-10-01", "18:00"),
    "2026-10-01T15:00:00.000Z",
  );
  assert.equal(
    utils.athensInstant("2026-12-01", "18:00"),
    "2026-12-01T16:00:00.000Z",
  );
  assert.equal(utils.time(utils.athensInstant("2026-10-25", "18:00")), "18:00");
});
test("DST transition days retain the requested calendar date", () => {
  for (const date of ["2026-03-29", "2026-10-25"]) {
    const instant = utils.athensInstant(date, "08:00");
    assert.equal(utils.localDate(instant), date);
    assert.equal(utils.time(instant), "08:00");
  }
});
test("HTML escaping protects user profile rendering", () =>
  assert.equal(
    utils.escape("<script>\"x\" & 'y'</script>"),
    "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
  ));
test("demo booking, conflict, cancellation and ownership follow the UI flow", async () => {
  demo.resetDemo();
  demo.demoRole(false);
  const courts = await demo.demoRequest("/api/courts"),
    date = utils.addDays(utils.today(), 1),
    start = utils.athensInstant(date, "20:00");
  const body = {
    courtId: courts[0].id,
    startsAt: start,
    durationMinutes: 90,
    players: 4,
  };
  const booking = await demo.demoRequest("/api/bookings", {
    method: "POST",
    body,
  });
  assert.equal(booking.priceCents, 3600);
  await assert.rejects(
    demo.demoRequest("/api/bookings", { method: "POST", body }),
    /ήδη κρατηθεί/,
  );
  let slots = await demo.demoRequest(
    `/api/courts/${courts[0].id}/availability?date=${date}&durationMinutes=90`,
  );
  assert.equal(slots.find((s) => s.startsAt === start).available, false);
  await demo.demoRequest("/api/bookings/" + booking.id, { method: "DELETE" });
  slots = await demo.demoRequest(
    `/api/courts/${courts[0].id}/availability?date=${date}&durationMinutes=90`,
  );
  assert.equal(slots.find((s) => s.startsAt === start).available, true);
  await assert.rejects(
    demo.demoRequest("/api/bookings", {
      method: "POST",
      body: { ...body, memberId: "demo-other" },
    }),
    /άλλο μέλος/,
  );
});
test("staff can grant subscriptions and cancelled subscriptions deny booking", async () => {
  demo.resetDemo();
  demo.demoRole(true);
  const sub = await demo.demoRequest("/api/subscriptions", {
    method: "POST",
    body: { memberId: "demo-other", plan: "MONTHLY", startsOn: utils.today() },
  });
  assert.equal(sub.paidCents, 4900);
  await demo.demoRequest("/api/subscriptions/" + sub.id, { method: "DELETE" });
  const court = (await demo.demoRequest("/api/courts"))[1];
  await assert.rejects(
    demo.demoRequest("/api/bookings", {
      method: "POST",
      body: {
        courtId: court.id,
        memberId: "demo-other",
        startsAt: utils.athensInstant(utils.addDays(utils.today(), 1), "18:00"),
        durationMinutes: 90,
        players: 4,
      },
    }),
    /ενεργή συνδρομή/,
  );
});
test("disabled members and courts cannot be booked", async () => {
  demo.resetDemo();
  demo.demoRole(true);
  const court = (await demo.demoRequest("/api/courts"))[0],
    body = {
      courtId: court.id,
      startsAt: utils.athensInstant(utils.addDays(utils.today(), 1), "20:00"),
      durationMinutes: 90,
      players: 4,
    };
  await demo.demoRequest("/api/courts/" + court.id, {
    method: "PATCH",
    body: { enabled: false, hourlyPriceCents: 2400 },
  });
  await assert.rejects(
    demo.demoRequest("/api/bookings", { method: "POST", body }),
    /διαθέσιμο/,
  );
  demo.resetDemo();
  demo.demoRole(true);
  await demo.demoRequest("/api/members/demo-member/enabled", {
    method: "PATCH",
    body: { enabled: false },
  });
  await assert.rejects(
    demo.demoRequest("/api/bookings", { method: "POST", body }),
    /ενεργή συνδρομή/,
  );
});
