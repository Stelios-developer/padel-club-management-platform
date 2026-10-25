import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDatasets, renderCase, hash } from "../evals/dataset.mjs";
import { gradeCase, releaseGate, lexicalReply } from "../evals/assertions.mjs";
import { LocalSession } from "../evals/local-session.mjs";
import {
  loadPromptfoo,
  promptfooVersion,
} from "../evals/promptfoo-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (
    !["--split", "--output-dir"].includes(args[i]) ||
    !args[i + 1] ||
    options[args[i]]
  )
    throw Error(
      "Usage: evaluate-assistant.mjs --split development|evaluation [--output-dir docs/ai-evals/<new-run>]",
    );
  options[args[i]] = args[i + 1];
}
const split = options["--split"];
if (!["development", "evaluation"].includes(split))
  throw Error("Choose development or evaluation");
const datasets = await loadDatasets(root);
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "evals/dataset-manifest.json"), "utf8"),
);
for (const name of Object.keys(datasets))
  if (datasets[name].sha256 !== manifest.splits[name].sha256)
    throw Error("Frozen dataset hash mismatch: " + name);
const dataset = datasets[split];
const promptfoo = await loadPromptfoo(root);
const evidenceRoot = path.join(root, "docs/ai-evals");
const outputDir = path.resolve(
  root,
  options["--output-dir"] ||
    `docs/ai-evals/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
if (!outputDir.startsWith(evidenceRoot + path.sep))
  throw Error("Use a new directory under docs/ai-evals");
if (
  await fs.stat(path.join(outputDir, split + "-results.json")).catch(() => null)
)
  throw Error("A report already exists; choose a new run directory");
await fs.mkdir(outputDir, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  completed: false,
  split,
  datasetVersion: dataset.version,
  datasetSha256: dataset.sha256,
  promptfooVersion: await promptfooVersion(root),
  nodeVersion: process.version,
  cases: [],
  firstUseHoldout: false,
  notes: dataset.notes,
};
const firstUsePath = path.join(
  evidenceRoot,
  "evaluation-first-use-results.json",
);
report.firstUseHoldout =
  split === "evaluation" && !(await fs.stat(firstUsePath).catch(() => null));
const session = new LocalSession(root);
const cancellation = new AbortController();
process.once("SIGINT", () => {
  report.interrupted = true;
  cancellation.abort();
});
process.once("SIGTERM", () => {
  report.interrupted = true;
  cancellation.abort();
});
let unchanged = null,
  restored = false;
try {
  await session.open();
  session.evaluationSignal = cancellation.signal;
  report.modelDigests = session.modelDigests;
  report.status = session.status;
  report.environment = {
    execution: "local CPU Ollama, one concurrent inference",
    api: "localhost:3000",
    timezone: "Europe/Athens",
    evaluationDate: session.variables.today,
    cloudCalls: 0,
    cloudApiCharges: 0,
    tokenUsage: null,
    totalInfrastructureCost: null,
    costNotes:
      "No paid model API was called. Tokens are not exposed by the assistant API; hardware/electricity cost is unmeasured.",
  };
  report.implementationSha256 = hash(
    await fs.readFile(
      path.join(
        root,
        "backend/assistant-service/src/main/java/club/padel/assistant/AssistantService.java",
      ),
    ),
  );
  report.sourceSha256 = {};
  for (const filename of (
    await fs.readdir(
      path.join(
        root,
        "backend/assistant-service/src/main/java/club/padel/assistant",
      ),
    )
  ).filter((name) => name.endsWith(".java"))) {
    report.sourceSha256[filename] = hash(
      await fs.readFile(
        path.join(
          root,
          "backend/assistant-service/src/main/java/club/padel/assistant",
          filename,
        ),
      ),
    );
  }
  const items = dataset.cases.map((item) =>
    renderCase(item, session.variables),
  );
  const provider = async (_prompt, context) => {
    const item = items.find((x) => x.id === context.vars.caseId);
    let envelope;
    try {
      envelope = await session.call(item);
    } catch {
      envelope = {
        status: 0,
        body: null,
        checks: {},
        wallMs: 0,
        transportError: "Local evaluation transport failed",
      };
    }
    const grade = gradeCase(envelope, item, session.corpus);
    let retrieval;
    if (item.expected.factIds && envelope.body?.knowledgeVersion) {
      try {
        retrieval = await session.retrieval(
          item.question,
          envelope.body.knowledgeVersion,
          item.expected.factIds,
        );
      } catch {
        retrieval = { error: "Independent retrieval diagnostic unavailable" };
      }
    }
    report.cases.push({
      id: item.id,
      category: item.category,
      language: item.language,
      mode: item.mode,
      special: item.special,
      grade,
      status: envelope.status,
      response: envelope.body,
      checks: envelope.checks,
      wallMs: envelope.wallMs,
      retrieval,
    });
    await fs.writeFile(
      path.join(root, ".runtime/ai-evals/progress.json"),
      JSON.stringify({
        split,
        completed: report.cases.length,
        total: items.length,
        lastCase: item.id,
        lastPassed: grade.pass,
      }),
    );
    console.log(
      `${grade.pass ? "PASS" : "FAIL"} ${item.id}${grade.pass ? "" : " · " + grade.reason}`,
    );
    if (envelope.status === 0) {
      report.transportAbort = true;
      cancellation.abort();
    }
    return { output: JSON.stringify(envelope) };
  };
  const tests = items.map((item) => ({
    description: item.id,
    vars: { caseId: item.id, question: item.question },
    assert: [
      {
        type: "javascript",
        value: (output) => {
          const g = gradeCase(output, item, session.corpus);
          return { pass: g.pass, score: g.score, reason: g.reason };
        },
      },
    ],
  }));
  const record = await promptfoo.evaluate(
    {
      description: `Padel ${split} ${dataset.version}`,
      prompts: ["{{question}}"],
      providers: [provider],
      tests,
      writeLatestResults: false,
      sharing: false,
    },
    { maxConcurrency: 1, cache: false, abortSignal: cancellation.signal },
  );
  const summary = await record.toEvaluateSummary();
  if (cancellation.signal.aborted)
    throw Error(
      "Evaluation aborted; inspect recorded cases and cleanup status",
    );
  report.promptfooStats = summary.stats;
  // Same frozen positive policy questions for a deterministic keyword baseline; no LLM judge or cloud provider.
  const positives = items.filter((x) => x.category === "policy");
  const baseline = [];
  const baselineRecord = await promptfoo.evaluate(
    {
      description: "Padel token-overlap baseline",
      prompts: ["{{question}}"],
      providers: [
        async (_prompt, context) => {
          const item = positives.find((x) => x.id === context.vars.caseId);
          const body = lexicalReply(item.question, session.corpus, {
            knowledgeVersion:
              report.cases.find((c) => c.response?.knowledgeVersion)?.response
                .knowledgeVersion || "local",
          });
          const envelope = {
            status: 200,
            body,
            checks: { noStore: true, noDisclosure: true },
          };
          const grade = gradeCase(envelope, item, session.corpus);
          baseline.push({ id: item.id, grade, factIds: body.factIds });
          return { output: JSON.stringify(envelope) };
        },
      ],
      tests: positives.map((item) => ({
        vars: { caseId: item.id, question: item.question },
        assert: [
          {
            type: "javascript",
            value: (output) => {
              const g = gradeCase(output, item, session.corpus);
              return { pass: g.pass, score: g.score, reason: g.reason };
            },
          },
        ],
      })),
      writeLatestResults: false,
      sharing: false,
    },
    { maxConcurrency: 1, cache: false },
  );
  const baselineSummary = await baselineRecord.toEvaluateSummary();
  report.policyComparison = {
    count: positives.length,
    applicationPassRate:
      report.cases.filter((c) => c.category === "policy" && c.grade.pass)
        .length / positives.length,
    lexicalPassRate:
      baseline.filter((c) => c.grade.pass).length / positives.length,
    lexicalCases: baseline,
    promptfooStats: baselineSummary.stats,
    notes:
      "End-to-end fact selection accuracy on positive policy questions; simple accent-normalized token overlap, not BM25. Application includes retrieval and the relevance gate, so this is not isolated retrieval Recall@k.",
  };
  unchanged =
    JSON.stringify(await session.snapshot()) ===
    JSON.stringify(session.beforeEvaluation);
  report.domainUnchangedDuringEvaluation = unchanged;
  report.completed =
    report.cases.length === items.length &&
    summary.results.length === items.length;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  try {
    restored = await session.close();
    report.cleanupSucceeded = restored;
    if (!restored)
      report.cleanupError = "Domain snapshot differs from before fixture setup";
  } catch {
    report.cleanupSucceeded = false;
    report.cleanupError =
      "Temporary fixture cleanup failed; inspect ignored .runtime/ai-evals/fixtures.json";
  }
  report.releaseGate = releaseGate(
    report.cases,
    dataset.cases.length,
    unchanged,
    restored,
  );
  report.completed &&= restored;
  report.finishedAt = new Date().toISOString();
  report.categories = Object.fromEntries(
    [...new Set(dataset.cases.map((x) => x.category))].map((category) => {
      const c = report.cases.filter((x) => x.category === category);
      return [
        category,
        {
          total: dataset.cases.filter((x) => x.category === category).length,
          executed: c.length,
          passed: c.filter((x) => x.grade.pass).length,
        },
      ];
    }),
  );
  const sorted = report.cases
    .filter((x) => x.response?.kind && !x.special)
    .map((x) => x.response.durationMs)
    .sort((a, b) => a - b);
  const quantile = (q) =>
    sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? null;
  report.latency = {
    samples: sorted.length,
    p50Ms: quantile(0.5),
    p95Ms: quantile(0.95),
    p99Ms: quantile(0.99),
    notes:
      "Sequential mixed correctness workload on this CPU; not a load benchmark. Backend duration excludes the independent live-slot verification.",
  };
  const retrievalCases = report.cases.filter((x) => x.category === "policy");
  const retrievalMetrics = (key) => ({
    recallAt1:
      retrievalCases.filter((x) => x.retrieval?.[key] === 1).length /
      retrievalCases.length,
    recallAt6:
      retrievalCases.filter((x) => x.retrieval?.[key] > 0).length /
      retrievalCases.length,
    mrrAt6:
      retrievalCases.reduce(
        (sum, x) => sum + (x.retrieval?.[key] > 0 ? 1 / x.retrieval[key] : 0),
        0,
      ) / retrievalCases.length,
  });
  report.retrievalComparison = {
    queries: retrievalCases.length,
    diagnosticsCompleted: retrievalCases.filter(
      (x) => x.retrieval?.semanticTop6,
    ).length,
    semantic: retrievalMetrics("semanticRelevantRank"),
    lexical: retrievalMetrics("lexicalRelevantRank"),
    notes:
      "Independent real EmbeddingGemma 768-dimension queries and exact pgvector cosine ranking filtered by corpus version. Token overlap is not BM25. This is retrieval evidence separate from final answer relevance.",
  };
  await fs.writeFile(
    path.join(outputDir, split + "-results.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  if (report.firstUseHoldout)
    await fs.writeFile(firstUsePath, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
  console.log(
    JSON.stringify({
      split,
      completed: report.completed,
      passed: report.cases.filter((x) => x.grade.pass).length,
      total: dataset.cases.length,
      releaseApproved: report.releaseGate.approved,
      criticalFailures: report.releaseGate.criticalFailures.length,
      cleanupSucceeded: report.cleanupSucceeded,
    }),
  );
  if (!report.completed || !report.releaseGate.approved) process.exitCode = 1;
}
