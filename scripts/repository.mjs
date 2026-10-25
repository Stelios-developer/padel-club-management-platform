import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { syncConfig } from "./sync-k8s-config.mjs";
import { run, publicationFiles } from "./quality/process.mjs";
import { checkRepository } from "./quality/checks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
const allowed = ["check", "test", "format", "format:check"];
if (!allowed.includes(command) || process.argv.length !== 3)
  throw new Error(`Usage: repository.mjs ${allowed.join(" | ")}`);
process.chdir(root);

const files = publicationFiles();

if (command === "check") {
  await checkRepository(files);
} else if (command === "test") {
  const tests = files.filter((name) =>
    /^(scripts|web\/tests|evals\/tests)\/.*\.test\.(?:mjs|cjs)$/.test(name),
  );
  run(process.execPath, ["--test", ...tests]);
} else {
  const write = command === "format";
  const prettier = resolve("web/node_modules/prettier/bin/prettier.cjs");
  const policy = JSON.parse(
    await readFile("infra/quality/toolchain.json", "utf8"),
  );
  const installed = JSON.parse(
    await readFile("web/node_modules/prettier/package.json", "utf8"),
  );
  if (installed.version !== policy.prettier.version)
    throw new Error("Unexpected Prettier version. Run npm --prefix web ci.");
  const formatted = files.filter((file) =>
    /\.(?:js|mjs|cjs|json|ya?ml|css|html|md)$/.test(file),
  );
  for (let start = 0; start < formatted.length; start += 50)
    run(process.execPath, [
      prettier,
      write ? "--write" : "--check",
      ...formatted.slice(start, start + 50),
    ]);
  const tool = policy.googleJavaFormat;
  const directory = resolve(".tools/quality");
  const jar = resolve(directory, tool.file);
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  let bytes = await readFile(jar).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (!bytes || digest(bytes) !== tool.sha256) {
    const response = await fetch(tool.url, {
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok)
      throw new Error(`Formatter download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== tool.sha256)
      throw new Error("Java formatter checksum mismatch");
    await mkdir(directory, { recursive: true });
    await writeFile(jar, bytes);
  }
  const java = process.env.JAVA_HOME
    ? resolve(
        process.env.JAVA_HOME,
        "bin",
        process.platform === "win32" ? "java.exe" : "java",
      )
    : "java";
  const sources = files.filter((file) => file.endsWith(".java"));
  // Use argument batches rather than a shell or a platform-specific command line glob.
  for (let start = 0; start < sources.length; start += 30)
    run(java, [
      "-Xmx256m",
      "-jar",
      jar,
      "--skip-reflowing-long-strings",
      ...(write ? ["--replace"] : ["--dry-run", "--set-exit-if-changed"]),
      ...sources.slice(start, start + 30),
    ]);
  if (write) await syncConfig();
  console.log(
    `Repository ${command} completed, including ${sources.length} Java sources.`,
  );
}
