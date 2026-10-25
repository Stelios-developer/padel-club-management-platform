import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const runtime = resolve(root, ".runtime/performance");
const read = (name) => JSON.parse(readFileSync(resolve(runtime, name), "utf8"));
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const metric = (summary, name, field) =>
  summary.metrics[name]?.values[field] ?? 0;
function requireEvidence(condition, message) {
  if (!condition) throw Error(message);
}
function bytes(text) {
  const match = String(text).match(/^([\d.]+)([KMGT]?i?B)/);
  if (!match) return null;
  const powers = {
    B: 1,
    kB: 1000,
    KB: 1000,
    MB: 1e6,
    GB: 1e9,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
  };
  return Number(match[1]) * (powers[match[2]] || 1);
}
function seconds(value) {
  return Number(String(value).match(/^PT([\d.]+)S$/)?.[1] || 0);
}
function method(frame) {
  const m = frame?.method;
  return m
    ? `${String(m.type?.name || "?").replaceAll("/", ".")}.${m.name}`
    : null;
}
function profile(name) {
  const events = read(`${name}.jfr.json`).recording.events;
  const execution = events.filter((e) => e.type === "jdk.ExecutionSample");
  const allocations = existsSync(resolve(runtime, `${name}.allocation.json`))
    ? read(`${name}.allocation.json`).recording.events
    : events.filter((e) => e.type === "jdk.ObjectAllocationSample");
  const top = new Map();
  let hibernate = 0,
    postgresDriver = 0;
  for (const event of execution) {
    const frames =
      event.values.stackTrace?.frames?.map(method).filter(Boolean) || [];
    if (frames.some((name) => name.startsWith("org.hibernate."))) hibernate++;
    if (frames.some((name) => name.startsWith("org.postgresql.")))
      postgresDriver++;
    if (frames[0]) top.set(frames[0], (top.get(frames[0]) || 0) + 1);
  }
  const gc = events.filter((e) => e.type === "jdk.GarbageCollection");
  const heaps = events
    .filter((e) => e.type === "jdk.GCHeapSummary")
    .map((e) => Number(e.values.heapUsed));
  return {
    recordingSha256: sha(resolve(runtime, `${name}.jfr`)),
    executionSamples: execution.length,
    samplesWithHibernate: hibernate,
    samplesWithPostgresDriver: postgresDriver,
    allocationSamples: allocations.length,
    estimatedAllocatedBytes: allocations.reduce(
      (n, e) => n + Number(e.values.weight || 0),
      0,
    ),
    gcCollections: gc.length,
    gcPauseMs: gc.reduce((n, e) => n + seconds(e.values.sumOfPauses) * 1000, 0),
    maximumObservedHeapBytes: heaps.length ? Math.max(...heaps) : null,
    topSampledMethods: [...top]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([method, samples]) => ({ method, samples })),
  };
}
function resources(run) {
  const services = new Map();
  for (const sample of run.samples)
    for (const c of sample.containers || []) {
      const name = c.Name.replace(/^padel-performance-/, "").replace(/-1$/, "");
      if (name.startsWith("k6-run-")) continue;
      if (!services.has(name)) services.set(name, { cpu: [], memory: [] });
      services.get(name).cpu.push(Number(c.CPUPerc.replace("%", "")));
      services.get(name).memory.push(bytes(c.MemUsage));
    }
  return [...services].map(([service, s]) => ({
    service,
    samples: s.cpu.length,
    meanCpuPercent: s.cpu.reduce((a, b) => a + b, 0) / s.cpu.length,
    peakCpuPercent: Math.max(...s.cpu),
    peakMemoryBytes: Math.max(...s.memory.filter((v) => v !== null)),
  }));
}
function collect(name) {
  const run = read(`${name}.run.json`),
    summary = read(`${name}.k6.json`);
  requireEvidence(run.exitCode === 0, `${name}: k6 failed`);
  requireEvidence(
    metric(summary, "correctness", "rate") === 1,
    `${name}: correctness failed`,
  );
  requireEvidence(
    metric(summary, "technical_errors", "rate") === 0,
    `${name}: technical errors`,
  );
  requireEvidence(
    metric(summary, "checks", "rate") === 1,
    `${name}: checks failed`,
  );
  requireEvidence(
    metric(summary, "dropped_iterations", "count") === 0,
    `${name}: dropped arrivals`,
  );
  requireEvidence(
    metric(summary, "contention_winners", "count") === 1 &&
      metric(summary, "expected_conflicts", "count") === 7,
    `${name}: contention failed`,
  );
  const writes = metric(summary, "successful_bookings", "count") + 1;
  const requestedBookings = metric(summary, "booking_requests", "count");
  requireEvidence(
    writes === requestedBookings + 1 &&
      requestedBookings >= 30 &&
      requestedBookings <= 31,
    `${name}: expected every scheduled booking and one contention winner`,
  );
  for (const key of [
    "writtenBookings",
    "auditEntries",
    "outboxEvents",
    "idempotencyRecords",
  ])
    requireEvidence(
      run.correctness[key] === writes,
      `${name}: mismatched persisted ${key}`,
    );
  requireEvidence(
    run.correctness.contentionBookings === 1 &&
      run.correctness.courtOverlaps === 0 &&
      run.correctness.playerOverlaps === 0,
    `${name}: SQL correctness failed`,
  );
  requireEvidence(
    run.limits.every((c) => !c.oomKilled && c.restarts === 0),
    `${name}: OOM/restart invalidates measurement`,
  );
  requireEvidence(
    run.samples.length >= 5 && run.samples.every((s) => !s.error),
    `${name}: incomplete resource evidence`,
  );
  const endpoints = {};
  for (const endpoint of [
    "availability",
    "membership",
    "booking",
    "contention",
  ]) {
    const values = summary.metrics[`${endpoint}_ms`]?.values;
    requireEvidence(
      values && Number.isFinite(values["p(99)"]),
      `${name}: missing latency samples`,
    );
    endpoints[endpoint] = {
      requests: metric(summary, `${endpoint}_requests`, "count"),
      p50Ms: values.med,
      p95Ms: values["p(95)"],
      p99Ms: values["p(99)"],
      averageMs: values.avg,
      maxMs: values.max,
    };
  }
  return {
    name,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    k6DurationMs: summary.state.testRunDurationMs,
    httpRequests: metric(summary, "http_reqs", "count"),
    httpRequestsPerSecond: metric(summary, "http_reqs", "rate"),
    technicalErrorRate: 0,
    expectedConflicts: 7,
    droppedIterations: 0,
    correctness: run.correctness,
    endpoints,
    resources: resources(run),
    jfr: profile(name),
    limits: run.limits,
    bookingJarSha256: run.bookingJarSha256,
    workloadSha256: run.workloadSha256,
    fixtureSha256: run.fixtureWithoutCredentialsSha256,
    configurationSha256: run.configurationSha256,
    rawSummarySha256: sha(resolve(runtime, `${name}.k6.json`)),
    rawRunSha256: sha(resolve(runtime, `${name}.run.json`)),
  };
}
function sqlVariant(name) {
  const data = read(`${name}.sql.json`);
  requireEvidence(data.plans.length === 5, "Five SQL measurements required");
  return {
    query: data.query,
    plans: data.plans,
    medianExecutionMs: median(data.plans.map((p) => p["Execution Time"])),
    medianReturnedRows: median(data.plans.map((p) => p.Plan["Actual Rows"])),
  };
}
function signature(run) {
  return JSON.stringify(
    run.limits
      .filter((c) => c.service !== "k6")
      .map(({ service, imageId, memoryBytes, nanoCpus }) => ({
        service,
        imageId,
        memoryBytes,
        nanoCpus,
      }))
      .sort((a, b) => a.service.localeCompare(b.service)),
  );
}
const before = [1, 2, 3].map((i) => collect(`baseline-${i}`)),
  after = [1, 2, 3].map((i) => collect(`optimized-${i}`));
const all = [...before, ...after];
requireEvidence(
  new Set(all.map((r) => r.workloadSha256)).size === 1,
  "Workload changed between variants",
);
requireEvidence(
  new Set(all.map((r) => r.fixtureSha256)).size === 1,
  "Dataset/expected slots changed between variants",
);
requireEvidence(
  all.every((r) => r.configurationSha256) &&
    new Set(all.map((r) => r.configurationSha256)).size === 1,
  "Configuration changed between variants",
);
requireEvidence(
  new Set(all.map(signature)).size === 1,
  "Limits/runtime images changed between variants",
);
requireEvidence(
  new Set(before.map((r) => r.bookingJarSha256)).size === 1 &&
    new Set(after.map((r) => r.bookingJarSha256)).size === 1,
  "Build changed within a variant",
);
requireEvidence(
  before[0].bookingJarSha256 !== after[0].bookingJarSha256,
  "No distinct optimized build",
);
requireEvidence(
  all[0].workloadSha256 === sha(resolve(root, "infra/performance/workload.js")),
  "Evidence uses a stale workload",
);
const baselineSql = sqlVariant("baseline"),
  optimizedSql = sqlVariant("optimized");
const baselineBuild = read("baseline-build.json");
requireEvidence(
  baselineBuild.controller ===
    sha(resolve(root, "infra/performance/baseline/CourtController.java")),
  "Archived baseline source differs from measured reference",
);
requireEvidence(
  baselineSql.medianReturnedRows === 20400 &&
    optimizedSql.medianReturnedRows === 10,
  "Unexpected SQL cardinalities",
);
const comparisons = {};
for (const endpoint of [
  "availability",
  "membership",
  "booking",
  "contention",
]) {
  const baselineP95Ms = median(before.map((r) => r.endpoints[endpoint].p95Ms));
  const optimizedP95Ms = median(after.map((r) => r.endpoints[endpoint].p95Ms));
  comparisons[endpoint] = {
    baselineP95Ms,
    optimizedP95Ms,
    p95ReductionPercent: 100 * (1 - optimizedP95Ms / baselineP95Ms),
  };
}
requireEvidence(
  comparisons.availability.p95ReductionPercent > 0,
  "No measured availability improvement",
);
const output = {
  stage: 5,
  completed: true,
  createdAt: new Date().toISOString(),
  scope:
    "Direct synchronous domain HTTP with real Keycloak/Feign/PostgreSQL and committed outbox; excludes gateway, broker delivery, SMTP, AI and frontend",
  host: read("docker-host.json"),
  dataset: read("dataset.json"),
  baselineBuild,
  optimizedSourceSha256: {
    controller: sha(
      resolve(
        root,
        "backend/booking-service/src/main/java/club/padel/booking/CourtController.java",
      ),
    ),
    repository: sha(
      resolve(
        root,
        "backend/booking-service/src/main/java/club/padel/booking/BookingRepository.java",
      ),
    ),
    projection: sha(
      resolve(
        root,
        "backend/booking-service/src/main/java/club/padel/booking/BookingWindow.java",
      ),
    ),
  },
  traffic: {
    durationSeconds: 30,
    warmupSecondsPerVariant: 30,
    repetitionsPerVariant: 3,
    availabilityPerSecond: 2,
    membershipPerSecond: 2,
    bookingPerSecond: 1,
    contentionRequests: 8,
    model:
      "Open constant-arrival-rate for steady traffic; one eight-VU contention burst",
  },
  variants: { baseline: before, optimized: after },
  comparison: {
    medianOfRunP95: comparisons,
    sql: { baseline: baselineSql, optimized: optimizedSql },
  },
  caveats: [
    "Shared Docker Desktop host; background containers remained active.",
    "Short warm-cache runs, single replicas, fixed modest arrival rate; no maximum capacity or production SLO claim.",
    "p95/p99 per run; medians of three run percentiles are not pooled percentiles. Only 30–31 writes and eight contention requests per run.",
    "JFR samples are statistical and allocation weights are estimates; profile overhead enabled identically for both measured variants.",
  ],
};
if (existsSync(resolve(root, "infra/performance/budgets.json"))) {
  const budgets = JSON.parse(
    readFileSync(resolve(root, "infra/performance/budgets.json")),
  );
  output.localRegressionBudget = {
    ...budgets,
    passed: after.every(
      (r) => r.endpoints.availability.p95Ms < budgets.availabilityP95Ms,
    ),
  };
  requireEvidence(
    output.localRegressionBudget.passed,
    "Optimized runs exceed documented local regression budget",
  );
}
const arg = process.argv.indexOf("--output");
const outputPath = resolve(
  root,
  arg >= 0 ? process.argv[arg + 1] : "docs/performance/results.json",
);
mkdirSync(resolve(outputPath, ".."), { recursive: true });
writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(
  JSON.stringify({
    completed: true,
    output: outputPath,
    availability: comparisons.availability,
    sqlRows: [20400, 10],
  }),
);
