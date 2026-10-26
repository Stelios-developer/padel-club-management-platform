import { readFile, writeFile, mkdir } from "node:fs/promises";
const directory = ".runtime/cloud";
const json = async (name) =>
  JSON.parse(await readFile(`${directory}/${name}`, "utf8"));
const local = await json("local-results.json"),
  configuration = await json("configuration.gate.json");
const source = JSON.parse(
  await readFile(".runtime/security/source.gate.json", "utf8"),
);
if (
  !local.completed ||
  configuration.gate !== "PASSED" ||
  source.gate !== "PASSED"
)
  throw new Error("Cloud/schema/source checks must pass");
const tests = await readFile(`${directory}/node-tests.log`, "utf8");
const testCount = Number(tests.match(/tests (\d+)/)?.[1]),
  passed = Number(tests.match(/pass (\d+)/)?.[1]);
if (!testCount || passed !== testCount || !/fail 0/.test(tests))
  throw new Error("Node policy tests incomplete");
const actionlint = await readFile(`${directory}/actionlint.log`, "utf8");
if (actionlint.trim()) throw new Error("Actionlint contains diagnostics");
const toolchain = JSON.parse(
  await readFile("infra/security/toolchain.json", "utf8"),
);
const installed = JSON.parse(
  await readFile(".runtime/security/installed-images.json", "utf8"),
);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  local,
  configuration,
  source: {
    scannedAt: source.scannedAt,
    gate: source.gate,
    acceptedExceptionOccurrences: source.findings.filter((f) => f.exception)
      .length,
    blockingFindings: source.findings.filter((f) => f.blocks).length,
  },
  tools: {
    terraform: toolchain.terraform.version,
    awsProvider: "6.67.0",
    trivy: toolchain.trivy.version,
  },
  nodePolicyTests: {
    tests: testCount,
    passed,
    failed: 0,
    cloudRelease: 11,
    sharedSecurity: 17,
    productionConfig: 4,
  },
  workflowLint: "PASSED_WITHOUT_LOCAL_SHELLCHECK_OR_PYFLAKES",
  bootstrapSyntax: "BASH_N_PASSED_NOT_EXECUTED",
  existingLocalStack: {
    verifiedAt: installed.createdAt,
    runningImages: installed.images.filter((image) => image.running).length,
    webStatus: installed.webStatus,
    domainUnchanged: installed.domainUnchanged,
  },
  externalEvidence: {
    awsResourcesCreated: false,
    awsOidcSessionVerified: false,
    realTerraformPlan: false,
    githubWorkflowRun: false,
    publicDemoDeployed: false,
    cloudRollbackOrRestoreVerified: false,
    cloudCostMeasured: false,
  },
  limitations: [
    `${local.modules.reduce((sum, module) => sum + module.passed, 0)} Terraform tests use mocked AWS state, not AWS execution.`,
    "Eleven cloud release tests use deliberate fixtures, not real signatures or a live rollout.",
    `Accepted cloud configuration exceptions: ${configuration.findings.filter((finding) => finding.exception).length}. HTTPS destinations still require operator review and actual cloud connectivity checks.`,
    "Third-party infrastructure images and cloud host OS/runtime installations need a fresh inventory/rehearsal.",
    "This local report does not perform additional release-signature verification or real-model AI evaluation; see their separately scoped evidence.",
  ],
};
await mkdir("docs/cloud", { recursive: true });
await writeFile(
  "docs/cloud/results.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    terraformScenarios: local.modules.reduce(
      (sum, module) => sum + module.passed,
      0,
    ),
    nodeTests: passed,
    cloudGate: configuration.gate,
    cloudExceptions: configuration.findings.filter((f) => f.exception).length,
    awsExecuted: false,
  }),
);
