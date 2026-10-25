import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateTrivy, evaluateSarif } from "./security/policy.mjs";
export { evaluateTrivy, evaluateSarif } from "./security/policy.mjs";

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [kind, input, output] = process.argv.slice(2);
  if (!["trivy", "sarif"].includes(kind) || !input || !output)
    throw new Error("Usage: security-policy.mjs trivy|sarif INPUT OUTPUT");
  const report = JSON.parse(await readFile(input, "utf8"));
  const exceptions = JSON.parse(
    await readFile(
      new URL("../infra/security/exceptions.json", import.meta.url),
    ),
  ).exceptions;
  const summary =
    kind === "trivy"
      ? evaluateTrivy(report, exceptions)
      : evaluateSarif(report);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(summary, null, 2) + "\n");
  console.log(
    `${summary.gate}: ${summary.findings.filter((f) => f.blocks).length} blocking findings (${summary.findings.length} total); ${output}`,
  );
  if (summary.gate !== "PASSED") process.exitCode = 1;
}
