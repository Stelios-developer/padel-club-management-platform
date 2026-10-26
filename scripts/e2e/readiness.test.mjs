import test from "node:test";
import assert from "node:assert/strict";
import { dependencyRecovered, recoveredRead } from "./readiness.mjs";

const circuit = "MemberClientget";
const metrics = (state = "closed", failed = 0, name = circuit) =>
  `# TYPE resilience4j_circuitbreaker_state gauge\n` +
  `resilience4j_circuitbreaker_state{name="${name}",state="${state}"} 1.0\n` +
  `resilience4j_circuitbreaker_buffered_calls{kind="failed",name="${name}",} ${failed}\n`;

test("successful reads do not imply recovery while bootstrap failures remain or the circuit is open/half-open", async () => {
  for (const snapshot of [
    metrics("closed", 3),
    metrics("open", 3),
    metrics("half_open", 0),
  ])
    assert.equal(
      await recoveredRead(
        async () => ({ status: 200 }),
        async () => snapshot,
        circuit,
      ),
      false,
    );
  const ready = { status: 200, data: [] };
  assert.equal(
    await recoveredRead(
      async () => ready,
      async () => metrics(),
      circuit,
    ),
    ready,
  );
});

test("missing, foreign, invalid and ambiguous metrics fail closed", () => {
  for (const snapshot of [
    "",
    metrics("closed", 0, circuit + "Other"),
    metrics().split("\n").slice(0, 2).join("\n"),
    metrics("closed", "NaN"),
    metrics() + metrics(),
  ])
    assert.equal(dependencyRecovered(snapshot, circuit), false);
  assert.equal(
    dependencyRecovered(
      metrics().replace(
        `name="${circuit}",state="closed"`,
        `state="closed",application="test",name="${circuit}"`,
      ),
      circuit,
    ),
    true,
  );
});

test("only unavailable bootstrap reads retry; unexpected HTTP replies remain immediate failures at the caller", async () => {
  const unexpectedMetrics = async () =>
    assert.fail("Do not hide an HTTP failure behind metrics");
  assert.equal(
    await recoveredRead(
      async () => ({ status: 503 }),
      unexpectedMetrics,
      circuit,
    ),
    false,
  );
  for (const status of [400, 401, 403, 404, 409, 429, 500]) {
    const response = { status };
    assert.equal(
      await recoveredRead(async () => response, unexpectedMetrics, circuit),
      response,
    );
  }
});
