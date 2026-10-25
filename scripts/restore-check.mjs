import { readFile, mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { join } from "node:path";
import { createDecipheriv, randomUUID } from "node:crypto";
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
  textCommand,
  protectDirectory,
} from "./operations/backup.mjs";

const config = options();
if (!config.project.endsWith("-restore-check"))
  throw new Error(
    "Restore rehearsals require an isolated project ending in -restore-check. Existing/live stacks are rejected.",
  );
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    await textCommand(config, [
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      config.user,
      "-d",
      "postgres",
    ]);
    ready = true;
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
if (!ready) throw new Error("Isolated PostgreSQL restore target is not ready");
const backup = safeRuntimePath(config.get("--backup", ""));
const key = await encryptionKey(config.get("--key-file"));
const manifest = JSON.parse(
  await readFile(join(backup, "manifest.json"), "utf8"),
);
if (
  manifest.format !== "padel-backup-v1" ||
  manifest.cipher !== "aes-256-gcm" ||
  !manifest.completed ||
  JSON.stringify(manifest.databases.map((entry) => entry.database)) !==
    JSON.stringify(databases)
)
  throw new Error("Incomplete or unsupported backup");
const work = safeRuntimePath(".runtime/restore-work-" + randomUUID());
await mkdir(work, { mode: 0o700 });
protectDirectory(work);
const paths = [];
try {
  // Authenticate EVERY encrypted archive before writing anything into PostgreSQL.
  for (const entry of manifest.databases) {
    if (
      entry.file !== entry.database + ".dump.enc" ||
      !/^([a-f0-9]{24})$/.test(entry.iv) ||
      !/^([a-f0-9]{32})$/.test(entry.tag)
    )
      throw new Error("Invalid backup metadata");
    const data = await readFile(join(backup, entry.file));
    if (sha256(data) !== entry.sha256)
      throw new Error("Archive checksum mismatch: " + entry.database);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(entry.iv, "hex"),
    );
    decipher.setAAD(Buffer.from(entry.database));
    decipher.setAuthTag(Buffer.from(entry.tag, "hex"));
    const path = join(work, entry.database + ".dump");
    paths.push(path);
    await pipeline(
      createReadStream(join(backup, entry.file)),
      decipher,
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
    );
  }
  for (const database of databases) {
    const count = await textCommand(config, [
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      config.user,
      "-d",
      database,
      "-c",
      "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');",
    ]);
    if (count !== "0")
      throw new Error("Restore target is not empty: " + database);
  }
  const results = [];
  for (const entry of manifest.databases) {
    const role = entry.database;
    const child = command(config, [
      "pg_restore",
      "-U",
      config.user,
      "-d",
      entry.database,
      "--role=" + role,
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "--single-transaction",
    ]);
    const done = processResult(child);
    child.stdout.resume();
    await Promise.all([
      pipeline(
        createReadStream(join(work, entry.database + ".dump")),
        child.stdin,
      ),
      done,
    ]);
    const restored = await fingerprint(config, entry.database);
    if (JSON.stringify(restored) !== JSON.stringify(entry.fingerprint))
      throw new Error("Restored table data differs: " + entry.database);
    results.push({
      database: entry.database,
      tables: restored.length,
      rows: restored.reduce((total, table) => total + table.rows, 0),
      verified: true,
    });
    console.log(
      "Verified " + entry.database + " (" + restored.length + " tables)",
    );
  }
  const report = {
    completed: true,
    verifiedAt: new Date().toISOString(),
    targetProject: config.project,
    sourceProject: manifest.sourceProject,
    databases: results,
  };
  await writeFile(
    config.get(
      "--report",
      "docs/results/production/backup-restore-results.json",
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Restore rehearsal passed for all six databases.");
} finally {
  for (const path of paths) await unlink(path).catch(() => {});
  await rmdir(work).catch(() => {});
}
