import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateTrivy } from "./security-policy.mjs";
const directory = resolve(".runtime/cloud");
await mkdir(directory, { recursive: true });
const scanner = resolve(
  ".tools/security/trivy",
  process.platform === "win32" ? "trivy.exe" : "trivy",
);
const file = resolve(directory, "trivy.json");
const run = spawnSync(
  scanner,
  [
    "config",
    "--quiet",
    "--disable-telemetry",
    "--cache-dir",
    resolve(".tools/security/trivy-cache"),
    "--format",
    "json",
    "--output",
    file,
    "infra/cloud",
  ],
  {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GOMEMLIMIT: "512MiB" },
  },
);
if (run.status !== 0) throw new Error("Cloud configuration scan failed");
const report = JSON.parse(await readFile(file));
if (!report.Results?.length)
  throw new Error("Terraform templates were not analyzed");
report.Results = report.Results.map((result) => ({
  ...result,
  Target: `infra/cloud/${result.Target.replaceAll("\\", "/")}`,
}));
const { exceptions } = JSON.parse(
  await readFile("infra/security/exceptions.json"),
);
const gate = evaluateTrivy(report, exceptions);
await writeFile(
  resolve(directory, "configuration.gate.json"),
  JSON.stringify(gate, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    gate: gate.gate,
    blocking: gate.findings.filter((f) => f.blocks).length,
    exceptions: gate.findings.filter((f) => f.exception).length,
  }),
);
if (gate.gate !== "PASSED") process.exitCode = 1;
