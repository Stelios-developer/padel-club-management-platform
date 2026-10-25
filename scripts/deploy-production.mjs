import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { safeRuntimePath, processResult } from "./operations/backup.mjs";
const args = process.argv.slice(2),
  get = (key, fallback) =>
    args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const bundle = safeRuntimePath(get("--bundle", ".runtime/production"));
const manifest = JSON.parse(
  await readFile(join(bundle, "manifest.json"), "utf8"),
);
const local = args.includes("--local-test");
if (manifest.localTest !== local)
  throw new Error(
    "Explicit --local-test is required for a test bundle; public deployments require a public bundle",
  );
const project = get(
  "--project",
  local ? "padel-production-check" : "padel-production",
);
if (
  !/^padel-[a-z0-9-]+$/.test(project) ||
  ["padel-e2e", "padel-restore-check"].includes(project)
)
  throw new Error("Invalid or protected deployment project");
for (const name of manifest.secretFiles) {
  if (!/^secrets\/[a-z_]+$/.test(name))
    throw new Error("Invalid secret filename");
  const value = (await readFile(join(bundle, name), "utf8")).trim();
  if (!value || value.includes("REPLACE_WITH_"))
    throw new Error(
      "Configure the SMTP provider password before public deployment",
    );
  if (!name.endsWith("/smtp_password") && !/^[a-f0-9]{64}$/.test(value))
    throw new Error("Invalid generated credential");
}
const compose = [
  "compose",
  "--env-file",
  join(bundle, ".env"),
  "-f",
  join(bundle, "compose.yml"),
  "-p",
  project,
];
await processResult(
  spawn("docker", [...compose, "config", "--quiet"], {
    stdio: ["ignore", "inherit", "pipe"],
    windowsHide: true,
  }),
);
if (args.includes("--check-only")) console.log("Deployment preflight passed.");
else
  await processResult(
    spawn(
      "docker",
      [...compose, "up", "-d", "--wait", "--wait-timeout", "480"],
      { stdio: ["ignore", "inherit", "pipe"], windowsHide: true },
    ),
  );
