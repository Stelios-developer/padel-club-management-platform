import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { loadPromptfoo, promptfooVersion } from "./promptfoo-runtime.mjs";
import { gradeCase, releaseGate } from "./assertions.mjs";
const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output" || !args[1]))
  throw new Error("Usage: harness-check.mjs [--output REPORT]");
const output = path.resolve(
  root,
  args[1] || "test-results/ai-eval-harness.json",
);
const promptfoo = await loadPromptfoo(root);
const corpus = {
  "access:2": {
    text: "15 minutes before play",
    sourceId: "access",
    title: "Access",
    version: "v1",
  },
};
const caseDefinition = {
  category: "policy",
  expected: { kind: "ANSWER", factIds: ["access:2"] },
};
const cases = [];
const record = await promptfoo.evaluate(
  {
    description: "Deterministic negative-gate verification; no model calls",
    prompts: ["{{variant}}"],
    providers: [
      async (_prompt, context) => {
        const variant = context.vars.variant;
        const output = {
          status: 200,
          body: {
            kind: "ANSWER",
            answer:
              variant === "fabricated"
                ? "I booked and refunded you"
                : "15 minutes before play",
            factIds: ["access:2"],
            citations: [
              {
                sourceId: "access",
                title: "Access",
                version: "v1",
                url: "/api/assistant/sources/access",
              },
            ],
            options: [],
            knowledgeVersion: "v",
            promptVersion: "test",
            chatModel: "fixture",
            embeddingModel: "fixture",
            durationMs: 0,
          },
          checks: { noStore: true, noDisclosure: variant !== "leak" },
        };
        cases.push({
          id: variant,
          grade: gradeCase(output, caseDefinition, corpus),
        });
        return { output: JSON.stringify(output) };
      },
    ],
    tests: ["valid", "fabricated", "leak"].map((variant) => ({
      vars: { variant },
      assert: [
        {
          type: "javascript",
          value: (output) => {
            const grade = gradeCase(output, caseDefinition, corpus);
            return {
              pass: grade.pass,
              score: grade.score,
              reason: grade.reason,
            };
          },
        },
      ],
    })),
    writeLatestResults: false,
    sharing: false,
  },
  { maxConcurrency: 1, cache: false },
);
const result = await record.toEvaluateSummary();
assert.equal(result.stats.successes, 1);
assert.equal(result.stats.failures, 2);
assert.equal(result.stats.errors, 0);
assert.equal(releaseGate(cases, 3, true, true).approved, false);
const cancellation = new AbortController();
let abortedCalls = 0;
try {
  await promptfoo.evaluate(
    {
      prompts: ["{{id}}"],
      providers: [
        async () => {
          abortedCalls++;
          cancellation.abort();
          return { output: "transport-failure" };
        },
      ],
      tests: [{ vars: { id: "first" } }, { vars: { id: "second" } }],
      writeLatestResults: false,
      sharing: false,
    },
    { maxConcurrency: 1, cache: false, abortSignal: cancellation.signal },
  );
} catch {}
assert.equal(
  abortedCalls,
  1,
  "Cancellation must prevent a second provider request",
);
const report = {
  generatedAt: new Date().toISOString(),
  completed: true,
  promptfooVersion: await promptfooVersion(root),
  realModel: false,
  positivePassed: 1,
  intentionallyFailingCasesRejected: 2,
  criticalGateRejected: true,
  cancellationPreventedFurtherCalls: true,
  notes:
    "Actual promptfoo engine with deterministic fixture output; not AI quality evidence.",
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
