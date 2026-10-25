const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let demo, u;
before(async () => {
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  demo = await import("../demo.js");
  u = await import("../utils.js");
});
const call = (path, method = "GET", body) =>
  demo.demoRequest(path, { method, body });
test("demo invitation acceptance adds the game to personal calendar and blocks an overlapping court", async () => {
  demo.resetDemo();
  demo.demoRole(false);
  const invites = await call("/api/padel/invitations");
  assert.equal(invites.length, 1);
  const i = invites[0];
  assert(!(await call("/api/bookings")).some((b) => b.id === i.booking.id));
  await call("/api/padel/invitations/" + i.id, "PUT", { status: "ACCEPTED" });
  assert((await call("/api/bookings")).some((b) => b.id === i.booking.id));
  await call("/api/padel/invitations/" + i.id, "PUT", { status: "ACCEPTED" });
  const courts = await call("/api/courts");
  await assert.rejects(
    call("/api/bookings", "POST", {
      courtId: courts[2].id,
      startsAt: i.booking.startsAt,
      durationMinutes: 60,
      players: 2,
    }),
    /ήδη παιχνίδι/,
  );
  await assert.rejects(
    call("/api/bookings/" + i.booking.id, "DELETE"),
    /διοργανωτής/,
  );
});
test("demo pending invitations reserve capacity, duplicate sends are stable, and search hides contact details", async () => {
  demo.resetDemo();
  demo.demoRole(false);
  const b = (await call("/api/bookings"))[0];
  const player = (
    await call("/api/players?query=" + encodeURIComponent("Μαρία"))
  )[0];
  assert.deepEqual(Object.keys(player).sort(), ["enabled", "fullName", "id"]);
  const a = await call("/api/padel/games/" + b.id + "/invitations", "POST", {
      memberId: player.id,
    }),
    repeat = await call("/api/padel/games/" + b.id + "/invitations", "POST", {
      memberId: player.id,
    });
  assert.deepEqual(a, repeat);
  const d = await call("/api/padel/games/" + b.id);
  assert.equal(d.roster.filter((r) => r.status === "PENDING").length, 1);
  await call("/api/padel/games/" + b.id, "PATCH", {
    openMatch: true,
    level: "BEGINNER",
  });
  const matches = await call("/api/padel/matches?level=BEGINNER");
  assert.equal(matches.find((m) => m.booking.id === b.id).places, 2);
});
test("demo waiting sends one in-app notice when a court opens without creating a booking", async () => {
  demo.resetDemo();
  demo.demoRole(false);
  const b = (await call("/api/bookings"))[0],
    body = { courtId: b.courtId, startsAt: b.startsAt, durationMinutes: 90 };
  const w = await call("/api/padel/waitlist", "PUT", body);
  assert.deepEqual(await call("/api/padel/waitlist", "PUT", body), w);
  const before = (await call("/api/bookings")).length;
  await call("/api/bookings/" + b.id, "DELETE");
  await call("/api/bookings/" + b.id, "DELETE");
  assert.equal((await call("/api/padel/waitlist"))[0].status, "NOTIFIED");
  assert.equal((await call("/api/bookings")).length, before);
  assert.equal(
    (await call("/api/notifications")).filter(
      (n) =>
        n.title === "Ελευθερώθηκε η ώρα που περίμενες" && n.status === "IN_APP",
    ).length,
    1,
  );
});
test("demo weekly conflict rolls back earlier bookings and notices", async () => {
  demo.resetDemo();
  demo.demoRole(false);
  const court = (await call("/api/courts"))[2],
    first = u.addDays(u.today(), 3),
    body = {
      courtId: court.id,
      startsAt: u.athensInstant(first, "09:00"),
      durationMinutes: 60,
      players: 2,
      weeks: 3,
    };
  await call("/api/bookings", "POST", {
    ...body,
    startsAt: u.athensInstant(u.addDays(first, 7), "09:00"),
  });
  const before = await call("/api/bookings"),
    notices = await call("/api/notifications");
  await assert.rejects(call("/api/padel/series", "POST", body), /ήδη κρατηθεί/);
  assert.deepEqual(await call("/api/bookings"), before);
  assert.deepEqual(await call("/api/notifications"), notices);
  const series = await call("/api/padel/series", "POST", {
    ...body,
    startsAt: u.athensInstant(first, "10:00"),
  });
  assert.equal(series.bookings.length, 3);
  for (const b of series.bookings)
    assert.equal((await call("/api/padel/games/" + b.id)).seriesId, series.id);
});
test("play cards escape player names and describe total fees and reserved invitations", async () => {
  const { playPage } = await import("../play.js");
  const html = playPage({
    state: {
      matchLevel: "ANY",
      matches: [
        {
          level: "ANY",
          accepted: 1,
          reserved: 1,
          places: 2,
          booking: {
            id: "b",
            courtName: "Court",
            memberName: "<img src=x>",
            startsAt: "2026-10-04T15:00:00Z",
            endsAt: "2026-10-04T16:00:00Z",
            players: 4,
            priceCents: 2400,
          },
        },
      ],
      invitations: [],
      waitlist: [],
    },
    heading: () => "",
    sectionResource: (_, fn) => fn(),
    badge: (t) => t,
  });
  assert(html.includes("&lt;img src=x&gt;"));
  assert(html.includes("1 πρόσκληση"));
  assert(html.includes("συνολική χρέωση"));
  assert(!html.includes("<img"));
});
