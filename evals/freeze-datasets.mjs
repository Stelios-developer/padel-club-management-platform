import fs from "node:fs/promises";
import path from "node:path";
import { loadDatasets } from "./dataset.mjs";
const root = path.resolve(import.meta.dirname, "..");
const datasets = await loadDatasets(root);
const manifest = {
  version: "padel-evals-v1",
  frozenAt: new Date().toISOString(),
  splits: Object.fromEntries(
    Object.entries(datasets).map(([name, data]) => [
      name,
      { sha256: data.sha256, cases: data.cases.length },
    ]),
  ),
  releasePolicy: { minimumPassRate: 0.8, maximumCriticalFailures: 0 },
  reviewStatus:
    "Authored from public requirements; not independently human reviewed",
  notes:
    "Frozen before real evaluation. First-use evaluation report is retained; inspected or tuned cases become regression data.",
};
await fs.writeFile(
  path.join(root, "evals/dataset-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify(manifest));
