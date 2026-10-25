import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import exec from "k6/execution";

const fixture = JSON.parse(open("/results/fixture.json"));
const duration = __ENV.DURATION || "30s";
const warmup = __ENV.WARMUP === "true";
const latency = {
  availability: new Trend("availability_ms", true),
  membership: new Trend("membership_ms", true),
  booking: new Trend("booking_ms", true),
  contention: new Trend("contention_ms", true),
};
const technicalErrors = new Rate("technical_errors");
const correctness = new Rate("correctness");
const successfulBookings = new Counter("successful_bookings");
const contentionWinners = new Counter("contention_winners");
const conflicts = new Counter("expected_conflicts");
const counts = {
  availability: new Counter("availability_requests"),
  membership: new Counter("membership_requests"),
  booking: new Counter("booking_requests"),
  contention: new Counter("contention_requests"),
};
const iterations = (rate, fn) => ({
  executor: "constant-arrival-rate",
  rate,
  timeUnit: "1s",
  duration,
  preAllocatedVUs: 16,
  maxVUs: 32,
  exec: fn,
  gracefulStop: "10s",
});

export const options = {
  scenarios: warmup
    ? {
        availability: iterations(2, "availability"),
        membership: iterations(2, "membership"),
      }
    : {
        availability: iterations(2, "availability"),
        membership: iterations(2, "membership"),
        booking: iterations(1, "booking"),
        contention: {
          executor: "per-vu-iterations",
          vus: 8,
          iterations: 1,
          startTime: "10.5s",
          maxDuration: "10s",
          exec: "contention",
        },
      },
  thresholds: {
    technical_errors: ["rate==0"],
    correctness: ["rate==1"],
    checks: ["rate==1"],
    dropped_iterations: ["count==0"],
    ...(!warmup
      ? {
          contention_winners: ["count==1"],
          expected_conflicts: ["count==7"],
          successful_bookings: ["count>0"],
        }
      : {}),
  },
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
  systemTags: ["status", "method", "name", "scenario", "expected_response"],
};

function params(name, conflict = false) {
  return {
    headers: {
      Authorization: `Bearer ${fixture.token}`,
      "Content-Type": "application/json",
    },
    tags: { name },
    timeout: "5s",
    responseCallback: http.expectedStatuses(...(conflict ? [200, 409] : [200])),
  };
}
function observe(response, name, valid) {
  counts[name].add(1);
  latency[name].add(response.timings.duration);
  technicalErrors.add(response.status === 0 || response.status >= 500);
  correctness.add(valid);
  check(response, { [`${name}: expected status and content`]: () => valid });
}
function json(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}
function requestKey(channel, index) {
  // Valid distinct UUIDs; the isolated idempotency table is reset between runs.
  return `00000000-0000-4000-${channel === "booking" ? "8000" : "8001"}-${index.toString(16).padStart(12, "0")}`;
}

export function availability() {
  const response = http.get(
    `http://booking-service:8080/api/courts/${fixture.readCourt}/availability?date=${fixture.date}&durationMinutes=90`,
    params("availability"),
  );
  const rows = json(response);
  // Exact expected slots, prices, boundaries and occupancy; not just HTTP 200.
  const valid =
    response.status === 200 &&
    Array.isArray(rows) &&
    rows.length === fixture.expectedSlots.length &&
    rows.every((row, i) =>
      Object.keys(fixture.expectedSlots[i]).every(
        (key) => row[key] === fixture.expectedSlots[i][key],
      ),
    );
  observe(response, "availability", valid);
}
export function membership() {
  const response = http.get(
    "http://member-service:8080/api/members/me",
    params("membership"),
  );
  const member = json(response);
  observe(
    response,
    "membership",
    response.status === 200 &&
      member?.id === fixture.memberId &&
      member?.subject === fixture.subject &&
      member?.enabled === true,
  );
}
export function booking() {
  const index = exec.scenario.iterationInTest;
  const startsAt = fixture.writeStarts[index];
  if (!startsAt) {
    correctness.add(false);
    return;
  }
  const request = {
    courtId: fixture.writeCourt,
    startsAt,
    durationMinutes: 60,
    players: 4,
  };
  const p = params("booking");
  p.headers["Idempotency-Key"] = requestKey("booking", index);
  const response = http.post(
    "http://booking-service:8080/api/bookings",
    JSON.stringify(request),
    p,
  );
  const row = json(response);
  const valid =
    response.status === 200 &&
    row?.status === "CONFIRMED" &&
    row?.memberId === fixture.memberId &&
    row?.courtId === fixture.writeCourt &&
    row?.startsAt === startsAt &&
    row?.priceCents === 2400 &&
    Date.parse(row?.endsAt) - Date.parse(startsAt) === 3600000;
  if (valid) successfulBookings.add(1);
  observe(response, "booking", valid);
}
export function contention() {
  const p = params("contention", true);
  p.headers["Idempotency-Key"] = requestKey("contention", exec.vu.idInTest);
  const response = http.post(
    "http://booking-service:8080/api/bookings",
    JSON.stringify({
      courtId: fixture.contentionCourt,
      startsAt: fixture.contentionStart,
      durationMinutes: 60,
      players: 4,
    }),
    p,
  );
  const row = json(response);
  let valid = false;
  if (response.status === 200) {
    valid =
      row?.status === "CONFIRMED" &&
      row?.memberId === fixture.memberId &&
      row?.courtId === fixture.contentionCourt &&
      row?.startsAt === fixture.contentionStart;
    if (valid) contentionWinners.add(1);
  } else if (response.status === 409) {
    // Verify the actual court conflict, rather than accepting every 409 as success.
    valid = JSON.stringify(row).includes("This court has just been booked");
    if (valid) conflicts.add(1);
  }
  observe(response, "contention", valid);
}
export function handleSummary(data) {
  return {
    [`/results/${__ENV.RUN_ID}.k6.json`]: JSON.stringify(data, null, 2),
  };
}
