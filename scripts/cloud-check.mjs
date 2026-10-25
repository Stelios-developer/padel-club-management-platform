// Credential-free checks only: every plan/apply simulation must explicitly mock AWS.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const terraform = resolve(
  ".tools/security/terraform",
  process.platform === "win32" ? "terraform.exe" : "terraform",
);
const directory = resolve(".runtime/cloud");
await mkdir(directory, { recursive: true });
const report = {
  createdAt: new Date().toISOString(),
  completed: false,
  scope:
    "Terraform schema and mock-provider plan/apply simulations only; no AWS account, API calls, resources or GitHub OIDC execution",
  modules: [],
};
function run(args) {
  const p = spawnSync(terraform, args, {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      TF_IN_AUTOMATION: "true",
      AWS_EC2_METADATA_DISABLED: "true",
    },
  });
  if (p.status !== 0) throw new Error(p.stderr || p.stdout || String(p.error));
  return p.stdout;
}
try {
  run(["fmt", "-check", "-recursive", "infra/cloud"]);
  for (const module of ["bootstrap", "demo"]) {
    for (const name of await readdir(`infra/cloud/${module}/tests`)) {
      if (name.endsWith(".tftest.hcl")) {
        const text = await readFile(
          `infra/cloud/${module}/tests/${name}`,
          "utf8",
        );
        if (
          !text.includes('mock_provider "aws"') ||
          /\bprovider\s+"aws"/.test(text)
        )
          throw new Error(
            "Only mocked AWS tests are allowed by this local helper",
          );
      }
    }
    const prefix = `-chdir=infra/cloud/${module}`;
    const init = run([
      prefix,
      "init",
      "-backend=false",
      "-input=false",
      "-lockfile=readonly",
    ]);
    await writeFile(resolve(directory, `${module}-init.log`), init);
    const validation = JSON.parse(run([prefix, "validate", "-json"]));
    if (!validation.valid) throw new Error("Invalid Terraform module");
    const events = run([prefix, "test", "-json"]);
    await writeFile(resolve(directory, `${module}-tests.jsonl`), events);
    const parsed = events
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const summary = parsed.find(
      (event) => event.type === "test_summary",
    )?.test_summary;
    if (!summary || summary.failed || summary.errored || !summary.passed)
      throw new Error("Terraform mock tests did not pass");
    report.modules.push({ module, valid: true, ...summary });
  }
  report.completed = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
}
await writeFile(
  resolve(directory, "local-results.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
