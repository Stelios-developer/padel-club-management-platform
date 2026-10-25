import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { LocalSession } from "../evals/local-session.mjs";
import { hash, renderCase, loadDatasets } from "../evals/dataset.mjs";
import { gradeCase, releaseGate } from "../evals/assertions.mjs";
import { addDays } from "../web/utils.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: { split: { type: "string" }, "output-dir": { type: "string" } },
});
assert(
  ["discovery", "confirmation"].includes(values.split),
  "Choose discovery or confirmation",
);
const output = resolve(root, values["output-dir"] || "");
assert(
  output.startsWith(resolve(root, "docs/ai-evals") + sep),
  "Use a new output folder under docs/ai-evals",
);
await mkdir(output, { recursive: true });
const file = resolve(output, `${values.split}-results.json`);
// Reserve before creating runtime fixtures, and never replace prior evidence.
await writeFile(file, "{}\n", { flag: "wx" });
const manifest = JSON.parse(
  await readFile(resolve(root, "evals/robustness/manifest.json"), "utf8"),
);
const old = await loadDatasets(root);
const oldManifest = JSON.parse(
  await readFile(resolve(root, "evals/dataset-manifest.json"), "utf8"),
);
for (const [split, data] of Object.entries(old))
  assert.equal(
    data.sha256,
    oldManifest.splits[split].sha256,
    "Original frozen input changed",
  );
const seen = new Set(
  Object.values(old).flatMap((split) =>
    split.cases.map(
      (item) =>
        item.mode +
        ":" +
        item.question
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim(),
    ),
  ),
);
const datasets = {};
for (const split of ["discovery", "confirmation"]) {
  const bytes = await readFile(resolve(root, `evals/robustness/${split}.json`));
  assert.equal(
    hash(bytes),
    manifest.splits[split].sha256,
    "Frozen robustness input changed",
  );
  const data = JSON.parse(bytes);
  assert.equal(data.cases.length, manifest.splits[split].cases);
  for (const item of data.cases) {
    const key =
      item.mode +
      ":" +
      item.question
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    assert(
      !seen.has(key),
      "Repeated question across robustness or original datasets",
    );
    seen.add(key);
  }
  datasets[split] = data;
}
const dataset = datasets[values.split];
const session = new LocalSession(root);
const report = {
  startedAt: new Date().toISOString(),
  split: values.split,
  datasetSha256: manifest.splits[values.split].sha256,
  reviewStatus: manifest.reviewStatus,
  mockedTransport: false,
  completed: false,
  cases: [],
  sourceSha256: {},
};
const firstConfirmation = resolve(
  root,
  "docs/ai-evals/robustness-confirmation-first-use.json",
);
report.firstUseConfirmation =
  values.split === "confirmation" &&
  !(await readFile(firstConfirmation).then(
    () => true,
    () => false,
  ));
const cancellation = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => cancellation.abort());
const save = () => writeFile(file, JSON.stringify(report, null, 2) + "\n");
let unchanged = null,
  restored = false;
try {
  report.phase = "fixture-setup";
  await session.open();
  session.evaluationSignal = cancellation.signal;
  report.status = session.status;
  report.modelDigests = session.modelDigests;
  report.environment = {
    timezone: "Europe/Athens",
    today: session.variables.today,
    cloudCalls: 0,
    modelApiCharges: 0,
    execution: "Local CPU, sequential authenticated requests",
  };
  const day = new Date(session.variables.today + "T12:00:00Z").getUTCDay();
  session.variables.friday = addDays(
    session.variables.today,
    (5 - day + 7) % 7,
  );
  session.variables.saturday = addDays(
    session.variables.today,
    (6 - day + 7) % 7,
  );
  session.variables.nextMonday = addDays(
    session.variables.today,
    (1 - day + 7) % 7 || 7,
  );
  for (const name of (
    await readdir(
      resolve(
        root,
        "backend/assistant-service/src/main/java/club/padel/assistant",
      ),
    )
  ).filter((name) => name.endsWith(".java")))
    report.sourceSha256[name] = hash(
      await readFile(
        resolve(
          root,
          "backend/assistant-service/src/main/java/club/padel/assistant",
          name,
        ),
      ),
    );
  for (const raw of dataset.cases) {
    report.phase = "evaluation";
    if (cancellation.signal.aborted)
      throw Error("Interrupted; partial results retained");
    const item = renderCase(raw, session.variables);
    const envelope = await session.call(item);
    const grade = gradeCase(envelope, item, session.corpus);
    report.cases.push({
      id: item.id,
      category: item.category,
      question: item.question,
      expected: item.expected,
      grade,
      status: envelope.status,
      response: envelope.body,
      checks: envelope.checks,
      wallMs: envelope.wallMs,
    });
    console.log(
      `${grade.pass ? "PASS" : "FAIL"} ${item.id}${grade.pass ? "" : " · " + grade.reason}`,
    );
    await save();
  }
  unchanged =
    JSON.stringify(await session.snapshot()) ===
    JSON.stringify(session.beforeEvaluation);
  report.domainUnchangedDuringEvaluation = unchanged;
  report.completed = report.cases.length === dataset.cases.length;
} catch (error) {
  report.error =
    "Run interrupted or local evaluation failed; partial evidence retained";
  report.failure = { phase: report.phase, type: error.name };
  for (const key of ["actual", "expected"])
    if (["number", "boolean"].includes(typeof error[key]))
      report.failure[key] = error[key];
  process.exitCode = 1;
} finally {
  try {
    restored = await session.close();
  } catch {
    report.cleanupError =
      "Inspect private fixture journal before any further run";
  }
  report.cleanupSucceeded = restored;
  report.releaseGate = releaseGate(
    report.cases,
    dataset.cases.length,
    unchanged,
    restored,
  );
  report.completed &&= restored;
  report.finishedAt = new Date().toISOString();
  await save();
  if (report.firstUseConfirmation)
    await writeFile(firstConfirmation, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
  console.log(
    JSON.stringify({
      split: values.split,
      passed: report.cases.filter((item) => item.grade.pass).length,
      total: dataset.cases.length,
      gate: report.releaseGate.approved,
      cleanup: restored,
    }),
  );
  if (!report.completed || !report.releaseGate.approved) process.exitCode = 1;
}
