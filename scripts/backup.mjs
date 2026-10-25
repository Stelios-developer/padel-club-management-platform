import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { randomBytes, createCipheriv } from "node:crypto";
import { pipeline } from "node:stream/promises";
import {
  options,
  databases,
  encryptionKey,
  safeRuntimePath,
  command,
  processResult,
  sha256,
  fingerprint,
  protectDirectory,
} from "./operations/backup.mjs";

const config = options(),
  key = await encryptionKey(config.get("--key-file"));
const output = safeRuntimePath(
  config.get(
    "--output",
    ".runtime/backups/" + new Date().toISOString().replaceAll(":", "-"),
  ),
);
await mkdir(output, { recursive: false, mode: 0o700 }).catch(async (error) => {
  if (error.code !== "ENOENT") throw error;
  await mkdir(join(output, ".."), { recursive: true, mode: 0o700 });
  await mkdir(output, { mode: 0o700 });
});
protectDirectory(output);
const manifest = {
  format: "padel-backup-v1",
  cipher: "aes-256-gcm",
  createdAt: new Date().toISOString(),
  sourceProject: config.project,
  completed: false,
  databases: [],
};
for (const database of databases) {
  const before = await fingerprint(config, database);
  const file = database + ".dump.enc",
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(database));
  const child = command(config, [
    "pg_dump",
    "-U",
    config.user,
    "-d",
    database,
    "-Fc",
    "--no-owner",
    "--no-acl",
  ]);
  child.stdin.end();
  const done = processResult(child);
  await Promise.all([
    pipeline(
      child.stdout,
      cipher,
      createWriteStream(join(output, file), { flags: "wx", mode: 0o600 }),
    ),
    done,
  ]);
  const after = await fingerprint(config, database);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(
      "Database changed during backup: " +
        database +
        ". Quiesce writes and retry into a new directory.",
    );
  manifest.databases.push({
    database,
    file,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    sha256: sha256(await readFile(join(output, file))),
    fingerprint: after,
  });
  console.log("Encrypted " + database + " (" + after.length + " tables)");
}
manifest.completed = true;
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  { flag: "wx", mode: 0o600 },
);
console.log("Complete encrypted backup: " + output);
