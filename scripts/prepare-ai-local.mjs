import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const directory = path.join(root, ".runtime", "ai-local");
await fs.mkdir(directory, { recursive: true });
const password = path.join(directory, "db_password");
try {
  await fs.writeFile(password, crypto.randomBytes(32).toString("hex"), {
    flag: "wx",
    mode: 0o600,
  });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const existing = await fs.readFile(password, "utf8");
  if (!/^[a-f0-9]{64}$/.test(existing))
    throw new Error(
      "Existing AI database password file is invalid; refusing to rotate credentials automatically.",
    );
}
const knowledge = path.join(root, "infra", "ai", "knowledge");
const sources = [];
for (const name of (await fs.readdir(knowledge))
  .filter((name) => name.endsWith(".md"))
  .sort()) {
  const content = await fs.readFile(path.join(knowledge, name), "utf8");
  sources.push({
    id: name.replace(/\.el\.md$/, ""),
    language: "el",
    version: "2026-10-02",
    file: `infra/ai/knowledge/${name}`,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
  });
}
await fs.writeFile(
  path.join(directory, "knowledge-manifest.json"),
  `${JSON.stringify({ sources }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    prepared: true,
    passwordCreatedOrPreserved: true,
    sources: sources.length,
    chatModelConfigured: false,
    embeddingModelConfigured: false,
    instruction:
      "docker compose -f compose.ai-local.yml up -d --wait vector-db",
  }),
);
