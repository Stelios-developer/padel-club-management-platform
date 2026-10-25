import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  unlink,
  rmdir,
} from "node:fs/promises";
import { join } from "node:path";
import {
  options,
  databases,
  fingerprint,
  safeRuntimePath,
  protectDirectory,
  sha256,
} from "./operations/backup.mjs";
const config = options();
assert.ok(config.project.endsWith("-restore-check"));
const backup = safeRuntimePath(config.get("--backup"));
const work = safeRuntimePath(".runtime/backup-guard-" + randomUUID());
await mkdir(work, { mode: 0o700 });
protectDirectory(work);
const files = [];
const before = await Promise.all(
  databases.map((database) => fingerprint(config, database)),
);
assert.ok(
  before.every((tables) => tables.length > 0),
  "First complete a real restore rehearsal",
);
const args = [
  "scripts/restore-check.mjs",
  "--project",
  config.project,
  "--compose",
  config.compose,
  "--env-file",
  config.env,
  "--user",
  config.user,
  "--key-file",
  config.get("--key-file"),
  "--backup",
  backup,
];
function rejected(argv, pattern) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        assert.notEqual(code, 0);
        assert.match(stderr, pattern);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}
try {
  const live = [...args];
  live[live.indexOf("--project") + 1] = "padel-e2e";
  await rejected(live, /Existing\/live stacks are rejected/);
  await rejected(args, /Restore target is not empty/);
  const wrongKey = join(work, "wrong-key");
  files.push(wrongKey);
  await writeFile(wrongKey, randomBytes(32).toString("hex"), { mode: 0o600 });
  const wrong = [...args];
  wrong[wrong.indexOf("--key-file") + 1] = wrongKey;
  await rejected(wrong, /unable to authenticate data/);
  const manifest = JSON.parse(await readFile(join(backup, "manifest.json")));
  for (const entry of manifest.databases) {
    const target = join(work, entry.file);
    files.push(target);
    await copyFile(join(backup, entry.file), target);
  }
  // Recompute the ordinary checksum: the GCM authentication tag must still reject tampering.
  const last = manifest.databases.at(-1),
    path = join(work, last.file),
    data = await readFile(path);
  data[0] ^= 1;
  await writeFile(path, data);
  last.sha256 = sha256(data);
  const manifestPath = join(work, "manifest.json");
  files.push(manifestPath);
  await writeFile(manifestPath, JSON.stringify(manifest));
  const tampered = [...args];
  tampered[tampered.indexOf("--backup") + 1] = work;
  await rejected(tampered, /unable to authenticate data/);
  assert.deepEqual(
    await Promise.all(
      databases.map((database) => fingerprint(config, database)),
    ),
    before,
    "Rejected restores must leave all six databases unchanged",
  );
  await writeFile(
    config.get("--report", "docs/results/production/backup-guard-results.json"),
    JSON.stringify(
      {
        completed: true,
        verifiedAt: new Date().toISOString(),
        targetProject: config.project,
        checks: [
          "live project rejected",
          "nonempty target rejected",
          "wrong encryption key rejected",
          "tampered final archive rejected before any database write",
        ],
        targetDataUnchanged: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Four restore guards passed; every target table remained unchanged.",
  );
} finally {
  for (const path of files) await unlink(path).catch(() => {});
  await rmdir(work);
}
