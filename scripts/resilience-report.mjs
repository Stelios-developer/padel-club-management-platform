import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const suites = [
  ["booking-service", "booking", "BookingResilienceIT", 4],
  ["assistant-service", "assistant", "AssistantResilienceIT", 4],
  ["notification-service", "messaging", "MessagingPostgresIT", 5],
];
const expected = new Set([
  "eligibility-latency",
  "eligibility-disconnect",
  "expected-domain-responses",
  "eligibility-bulkhead",
  "provider-hang",
  "provider-disconnect",
  "assistant-bulkhead",
  "workflow-deadline",
  "rabbit-disconnect",
]);
const evidence = [];
const junit = [];
for (const [module, name, suite, count] of suites) {
  const data = JSON.parse(
    await fs.readFile(
      path.join("backend", module, "target", `resilience-${name}.json`),
      "utf8",
    ),
  );
  for (const row of data.cases) {
    assert(
      expected.delete(row.id),
      "Unexpected or duplicate scenario: " + row.id,
    );
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "boolean") assert(value, row.id + ": " + key);
      if (key.endsWith("Ms"))
        assert(Number.isFinite(value) && value >= 0, row.id + ": " + key);
    }
    evidence.push({ module, scope: data.scope, ...row });
  }
  const xml = await fs.readFile(
    path.join(
      "backend",
      module,
      "target/failsafe-reports",
      `TEST-club.padel.${module.replace("-service", "")}.${suite}.xml`,
    ),
    "utf8",
  );
  const header = xml.match(/<testsuite\s[^>]+>/)[0];
  const attr = (key) => header.match(new RegExp(`\\b${key}="([^"]+)"`))[1];
  assert.equal(Number(attr("tests")), count);
  for (const key of ["failures", "errors", "skipped"])
    assert.equal(Number(attr(key)), 0);
  junit.push({
    module,
    suite,
    tests: count,
    failures: 0,
    errors: 0,
    skipped: 0,
  });
}
assert.equal(expected.size, 0, "Missing resilience scenarios");
const index = process.argv.indexOf("--output");
const output =
  index < 0 ? "test-results/resilience.json" : process.argv[index + 1];
const report = {
  generatedAt: new Date().toISOString(),
  completed: true,
  scenarios: evidence,
  junit,
  newFaultScenarios: 9,
  notes:
    "Export after a fresh Maven clean verify. Isolated Testcontainers with real Toxiproxy network faults; synthetic HTTP member/subscription/model responses, real SQL/RabbitMQ consumer. Does not measure model quality, production SLO attainment, real Keycloak cryptography or SMTP exactly-once delivery. Open-state recovery includes the configured 15-second wait. GitHub execution is not claimed.",
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({ output, completed: true, scenarios: evidence.length }),
);
