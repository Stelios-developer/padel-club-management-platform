import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const compose = ["compose", "-f", "compose.ai-local.yml"];
function docker(args, input) {
  const result = spawnSync("docker", args, {
    cwd: root,
    input,
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Docker check failed: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  return result.stdout.trim();
}
const manifest = JSON.parse(
  await fs.readFile(
    path.join(root, ".runtime/ai-local/knowledge-manifest.json"),
    "utf8",
  ),
);
for (const source of manifest.sources) {
  const content = await fs.readFile(path.join(root, source.file));
  if (
    crypto.createHash("sha256").update(content).digest("hex") !== source.sha256
  )
    throw new Error(
      `Policy source changed: ${source.id}; run prepare-ai-local again.`,
    );
}
const config = JSON.parse(
  docker([...compose, "--profile", "models", "config", "--format", "json"]),
);
for (const name of ["vector-db", "ollama"]) {
  if (config.services[name].ports.some((port) => port.host_ip !== "127.0.0.1"))
    throw new Error(`Non-local port on ${name}`);
}
const sql = `
SELECT extversion FROM pg_extension WHERE extname='vector';
BEGIN;
CREATE TEMP TABLE ai_vector_probe(id integer PRIMARY KEY, embedding vector(3));
INSERT INTO ai_vector_probe VALUES(1,'[1,0,0]'),(2,'[0,1,0]'),(3,'[0,0,1]');
SELECT id FROM ai_vector_probe ORDER BY embedding <-> '[0,1,0]' LIMIT 1;
ROLLBACK;
`;
const lines = docker(
  [
    ...compose,
    "exec",
    "-T",
    "vector-db",
    "psql",
    "-U",
    "padel_assistant",
    "-d",
    "padel_assistant",
    "-v",
    "ON_ERROR_STOP=1",
    "-Atq",
  ],
  sql,
).split(/\r?\n/);
if (!/^0\.8\./.test(lines[0]) || lines[1] !== "2")
  throw new Error(
    "Vector extension or synthetic nearest-neighbor check failed",
  );
const report = {
  generatedAt: new Date().toISOString(),
  completed: true,
  extensionVersion: lines[0],
  localBindings: true,
  approvedPolicySources: manifest.sources.length,
  vectorStorageAndDistanceVerified: true,
  modelInferenceVerified: false,
  semanticRetrievalVerified: false,
  note: "Synthetic 3D vectors verify storage/distance operations only. No chat or embedding model is downloaded or evaluated by this check.",
};
await fs.writeFile(
  path.join(root, "docs", "ai-local-results.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report));
