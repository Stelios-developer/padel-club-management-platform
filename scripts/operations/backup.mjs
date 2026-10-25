import { spawn, execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
export const databases = [
  "padel_members",
  "padel_subscriptions",
  "padel_bookings",
  "padel_access",
  "padel_notifications",
  "padel_identity",
];
export function options(argv = process.argv.slice(2)) {
  const get = (key, fallback) => {
    const index = argv.indexOf(key);
    return index < 0 ? fallback : argv[index + 1];
  };
  const project = get("--project", "padel-e2e");
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(project))
    throw new Error("Invalid compose project");
  const user = get("--user", "padel");
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(user))
    throw new Error("Invalid database user");
  return {
    get,
    project,
    user,
    compose: resolve(get("--compose", "compose.yml")),
    env: resolve(get("--env-file", ".env.example")),
  };
}
export const composeArgs = (config) => [
  "compose",
  "--env-file",
  config.env,
  "-f",
  config.compose,
  "-p",
  config.project,
];
export function processResult(child) {
  return new Promise((resolve, reject) => {
    let error = "";
    child.stderr.on("data", (chunk) => {
      if (error.length < 4000) error += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Docker/database operation failed (" + code + "): " + error,
            ),
          ),
    );
  });
}
export function command(config, args) {
  return spawn(
    "docker",
    [...composeArgs(config), "exec", "-T", "postgres", ...args],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
}
export async function textCommand(config, args, input) {
  const child = command(config, args);
  const done = processResult(child);
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stdin.end(input);
  await done;
  return Buffer.concat(chunks).toString("utf8").trim();
}
export async function encryptionKey(path) {
  if (!path) throw new Error("--key-file is required");
  const value = (await readFile(resolve(path), "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new Error("Backup key must contain 32 random bytes as hexadecimal");
  return Buffer.from(value, "hex");
}
export function safeRuntimePath(path) {
  const runtime = resolve(".runtime"),
    absolute = resolve(path),
    part = relative(runtime, absolute);
  if (
    part.startsWith("..") ||
    part === "" ||
    part.startsWith(sep) ||
    resolve(runtime, part) !== absolute
  )
    throw new Error("Output/work files must stay inside .runtime/");
  return absolute;
}
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export function protectDirectory(path) {
  if (process.platform === "win32")
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        resolve("scripts/protect-secrets.ps1"),
        "-Path",
        safeRuntimePath(path),
      ],
      { stdio: "inherit", windowsHide: true },
    );
}
export async function fingerprint(config, database) {
  const sql = `SET TIME ZONE 'UTC';
SELECT format('SELECT %L || chr(9) || count(*)::text || chr(9) || md5(coalesce(string_agg(md5(row_to_json(t)::text), '''' ORDER BY md5(row_to_json(t)::text)), '''')) FROM %I.%I t;', schemaname||'.'||tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename
\\gexec
`;
  const output = await textCommand(
    config,
    [
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      config.user,
      "-d",
      database,
    ],
    sql,
  );
  return output
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [table, count, digest] = row.split("\t");
      if (!table || !/^\d+$/.test(count) || !/^[a-f0-9]{32}$/.test(digest))
        throw new Error("Unexpected fingerprint format");
      return { table, rows: Number(count), digest };
    });
}
