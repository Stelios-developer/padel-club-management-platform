// Validate the deployed optimized endpoint through web/gateway with real OIDC.
// The shared session journals exact temporary fixture IDs and cleans them in finally.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LocalSession } from "../evals/local-session.mjs";
import { today, addDays, athensInstant } from "../web/utils.js";

const root = resolve(import.meta.dirname, ".."),
  session = new LocalSession(root);
const outputArgs = process.argv.slice(2);
if (
  outputArgs.length &&
  (outputArgs.length !== 2 || outputArgs[0] !== "--output")
)
  throw new Error("Usage: performance-local-smoke.mjs [--output FILE]");
const output = outputArgs.length
  ? resolve(root, outputArgs[1])
  : resolve(root, "docs/performance/local-deployment-results.json");
const report = {
  createdAt: new Date().toISOString(),
  completed: false,
  checks: [],
  scope:
    "Live web/gateway/Keycloak/booking deployment; no model generation or business writes",
};
const check = (name, task) => {
  assert.ok(task, name);
  report.checks.push({ name, passed: true });
};
try {
  await session.open();
  let response;
  for (let attempt = 0; attempt < 20; attempt++) {
    response = await session.auth("/api/courts");
    if (response.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(response.status, 200);
  const courts = response.body,
    date = addDays(today(), 1);
  const rows = JSON.parse(
    await session.sql(
      "padel_bookings",
      `SELECT coalesce(json_agg(json_build_object(
    'courtId',court_id,'status',status,'startsAt',starts_at,'endsAt',ends_at)),'[]'::json)
    FROM bookings WHERE starts_at < ('${date}'::date+1)::timestamp AT TIME ZONE 'Europe/Athens'
    AND ends_at > '${date}'::date::timestamp AT TIME ZONE 'Europe/Athens';`,
    ),
  );
  for (const court of courts)
    for (const minutes of [60, 90, 120]) {
      const expected = [];
      const occupied = rows.filter(
        (b) => b.courtId === court.id && b.status === "CONFIRMED",
      );
      for (let minute = 480; minute + minutes <= 1380; minute += 30) {
        const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
        const startsAt = athensInstant(date, time).replace(".000Z", "Z");
        const endsAt = new Date(Date.parse(startsAt) + minutes * 60000)
          .toISOString()
          .replace(".000Z", "Z");
        expected.push({
          courtId: court.id,
          startsAt,
          endsAt,
          available:
            court.enabled &&
            !occupied.some(
              (b) =>
                Date.parse(b.startsAt) < Date.parse(endsAt) &&
                Date.parse(b.endsAt) > Date.parse(startsAt),
            ),
          priceCents: Math.trunc((court.hourlyPriceCents * minutes) / 60),
        });
      }
      const actual = await session.auth(
        `/api/courts/${court.id}/availability?date=${date}&durationMinutes=${minutes}`,
      );
      assert.equal(actual.status, 200);
      assert.deepEqual(actual.body, expected);
      check(
        `${court.name}: ${minutes} minute slots match original semantics`,
        true,
      );
    }
  const route = `/api/courts/${courts[0].id}/availability?date=${date}`;
  check(
    "Anonymous availability rejected",
    (await session.http(session.base + route)).status === 401,
  );
  check(
    "Unsupported duration rejected",
    (await session.auth(route + "&durationMinutes=75")).status === 400,
  );
  check(
    "Owned cancelled fixture remains visible",
    (await session.auth("/api/bookings/" + session.bookingId)).status === 200,
  );
  check(
    "Foreign fixture booking remains forbidden",
    (await session.auth("/api/bookings/" + session.bookingId, {}, 1)).status ===
      403,
  );
  report.originalBookingStatus = await session.sql(
    "padel_bookings",
    "SELECT status FROM bookings WHERE id='8b5089a1-000b-44cd-8c97-dd93d5c046b5'",
  );
  check(
    "Original user booking preserved",
    report.originalBookingStatus === "CONFIRMED",
  );
  report.completed = true;
} catch (error) {
  report.completed = false;
  report.error = error.name + ": live endpoint verification failed";
  process.exitCode = 1;
} finally {
  try {
    report.fixturesCleanedAndDomainUnchanged = await session.close();
    if (!report.fixturesCleanedAndDomainUnchanged) {
      report.completed = false;
      process.exitCode = 1;
    }
  } catch {
    report.completed = false;
    report.cleanupFailed = true;
    process.exitCode = 1;
  }
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      completed: report.completed,
      checks: report.checks.length,
      cleaned: report.fixturesCleanedAndDomainUnchanged,
    }),
  );
}
