import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { run } from "./process.mjs";
import { syncConfig } from "../sync-k8s-config.mjs";
import { privateExamples, privatePublicationPath } from "./paths.mjs";
import { sourceProblems, browserCycles } from "./source.mjs";
export { privatePublicationPath, localTarget } from "./paths.mjs";
export { sourceProblems } from "./source.mjs";

export async function checkRepository(files) {
  const problems = [];
  const published = new Set(files);
  const sources = new Map();
  for (const file of files) {
    if (privatePublicationPath(file))
      problems.push(`Private/generated file in publication list: ${file}`);
    if ((await stat(file)).size >= 100 * 1024 * 1024)
      problems.push(`Oversized source file: ${file}`);
    if (/\.(?:js|mjs|cjs)$/.test(file))
      run(process.execPath, ["--check", file]);
    if (/\.(?:md|js|mjs|cjs|java)$/.test(file) || file.startsWith("web/ui/")) {
      const source = await readFile(file, "utf8");
      sources.set(file, source);
      problems.push(...sourceProblems(file, source, published));
    }
  }
  problems.push(...browserCycles(sources));
  const ignored = new Set(
    run("git", ["check-ignore", "--no-index", "--stdin", "-z"], {
      encoding: "utf8",
      stdio: "pipe",
      input: privateExamples.join("\0") + "\0",
    })
      .split("\0")
      .filter(Boolean),
  );
  for (const file of privateExamples)
    if (!ignored.has(file))
      problems.push(`Missing private-file ignore rule: ${file}`);
  const manifest = JSON.parse(
    await readFile("evals/dataset-manifest.json", "utf8"),
  );
  for (const [split, entry] of Object.entries(manifest.splits)) {
    const hash = createHash("sha256")
      .update(await readFile(`evals/datasets/${split}.json`))
      .digest("hex");
    if (hash !== entry.sha256)
      problems.push(`Frozen evaluation dataset changed: ${split}`);
  }
  await syncConfig({ check: true });
  if (problems.length) throw new Error(problems.join("\n"));
  console.log(
    `Repository checks passed: ${files.length} source files, publication paths, links/imports, Java boundaries, frozen datasets and Kubernetes copies.`,
  );
}
