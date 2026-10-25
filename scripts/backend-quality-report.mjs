import fs from "node:fs/promises";
import path from "node:path";

const modules = [
  "common",
  "api-gateway",
  "member-service",
  "subscription-service",
  "booking-service",
  "access-service",
  "notification-service",
  "assistant-service",
  "contract-tests",
];
const arg = process.argv.indexOf("--output");
const output =
  arg >= 0 ? process.argv[arg + 1] : "test-results/backend-quality.json";
if (!output) throw new Error("--output requires a filename");
const suites = [];
for (const module of modules) {
  for (const runner of ["surefire", "failsafe"]) {
    const directory = path.join(
      "backend",
      module,
      "target",
      `${runner}-reports`,
    );
    let files;
    try {
      files = await fs.readdir(directory);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const file of files.filter(
      (name) => name.startsWith("TEST-") && name.endsWith(".xml"),
    )) {
      const xml = await fs.readFile(path.join(directory, file), "utf8");
      const opening = xml.match(/<testsuite\s[^>]+>/)?.[0];
      if (!opening)
        throw new Error(`Invalid JUnit report: ${directory}/${file}`);
      const value = (key) =>
        opening.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1];
      const integer = (key) => {
        const raw = value(key);
        if (!/^\d+$/.test(raw ?? ""))
          throw new Error(`Missing ${key} in ${file}`);
        return Number(raw);
      };
      suites.push({
        module,
        runner,
        name: value("name"),
        tests: integer("tests"),
        failures: integer("failures"),
        errors: integer("errors"),
        skipped: integer("skipped"),
        seconds: Number(value("time")),
        file: path.join(directory, file),
      });
    }
  }
}
const total = (key) => suites.reduce((sum, suite) => sum + suite[key], 0);
const integration = suites.filter((suite) => suite.runner === "failsafe");
const producer = suites.filter(
  (suite) =>
    ["member-service", "subscription-service", "booking-service"].includes(
      suite.module,
    ) && /(?:^|\.)HttpTest$/.test(suite.name),
);
const consumer = suites.filter((suite) => suite.module === "contract-tests");
const expectedIntegration = [
  "BookingPostgresIT",
  "SubscriptionPostgresIT",
  "MessagingPostgresIT",
  "KnowledgePgvectorIT",
  "BookingResilienceIT",
  "AssistantResilienceIT",
];
const missing = expectedIntegration.filter(
  (name) => !integration.some((suite) => suite.name.endsWith(name)),
);
if (producer.length < 3)
  missing.push("producer contracts for all three services");
if (!consumer.length) missing.push("Feign consumer contracts");
const report = {
  generatedAt: new Date().toISOString(),
  note: "JUnit files found in this checkout; run Maven clean verify before exporting to exclude stale reports. A report is not evidence of GitHub execution.",
  completed:
    missing.length === 0 &&
    total("failures") === 0 &&
    total("errors") === 0 &&
    total("skipped") === 0,
  totals: Object.fromEntries(
    ["tests", "failures", "errors", "skipped"].map((key) => [key, total(key)]),
  ),
  categories: {
    integrationTests: integration.reduce((n, s) => n + s.tests, 0),
    producerContracts: producer.reduce((n, s) => n + s.tests, 0),
    consumerContracts: consumer.reduce((n, s) => n + s.tests, 0),
  },
  missing,
  suites,
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    completed: report.completed,
    totals: report.totals,
    categories: report.categories,
    missing,
  }),
);
if (!report.completed) process.exitCode = 1;
