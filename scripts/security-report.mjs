import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";

const root = resolve("."),
  input = resolve(".runtime/security");
const output = resolve(process.argv[2] || "docs/security/results.json");
const json = async (name) =>
  JSON.parse(await readFile(resolve(input, name), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sanitize = (value) =>
  JSON.parse(
    JSON.stringify(value)
      .replaceAll(root.replaceAll("\\", "\\\\"), "$WORKSPACE")
      .replaceAll(root.replaceAll("\\", "/"), "$WORKSPACE"),
  );
const source = await json("source.gate.json");
if (source.gate !== "PASSED") throw new Error("Source gate has not passed");
const services = [
  "config-server",
  "discovery-server",
  "api-gateway",
  "member-service",
  "subscription-service",
  "booking-service",
  "access-service",
  "notification-service",
  "assistant-service",
  "web",
];
const images = [];
for (const service of services) {
  const gate = await json(`${service}.gate.json`);
  if (
    gate.gate !== "PASSED" ||
    !gate.imageConfigDigest ||
    !gate.sbomSourceManifestDigest
  )
    throw new Error(`Missing verified image scan: ${service}`);
  const bytes = await readFile(resolve(input, `${service}.cdx.json`));
  images.push(
    sanitize({
      ...gate,
      service,
      sbomSha256: sha(bytes),
      localSbom: `.runtime/security/${service}.cdx.json`,
    }),
  );
}
const before = await json("source-before.gate.json");
const backend = await json("backend-quality-results.json");
if (
  !backend.completed ||
  backend.totals.failures ||
  backend.totals.errors ||
  backend.totals.skipped
)
  throw new Error("Backend verification incomplete");
const deployment = await json("local-deployment-results.json");
const installed = await json("installed-images.json");
const readonlyWeb = await json("readonly-web-results.json");
if (
  !deployment.completed ||
  !deployment.fixturesCleanedAndDomainUnchanged ||
  !installed.domainUnchanged ||
  !readonlyWeb.completed ||
  !readonlyWeb.temporaryContainerRemoved ||
  readonlyWeb.imageId !==
    images.find((image) => image.service === "web").imageId
)
  throw new Error("Local rollout verification incomplete");
for (const image of images) {
  const deployed = installed.images.find(
    (row) => row.service === image.service,
  );
  if (deployed?.imageId !== image.imageId || !deployed.running)
    throw new Error(`Running image does not match scan: ${image.service}`);
}
const database = JSON.parse(
  await readFile(resolve(".tools/security/trivy-cache/db/metadata.json")),
);
const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope:
    "Source and ten owned application images; local implementation, not GitHub execution",
  tools: JSON.parse(await readFile("infra/security/toolchain.json")),
  database,
  gates: {
    source: "PASSED",
    ownedImages: "10/10 PASSED",
    codeql: "CONFIGURED_NOT_EXECUTED",
    signedAttestations: "CONFIGURED_NOT_PRODUCED",
    signedReleaseVerification: "POLICY_TESTED_NO_SIGNED_RELEASE",
  },
  source: sanitize(source),
  sourceBefore: {
    scannedAt: before.scannedAt,
    blockingFindingOccurrences: before.findings.filter((f) => f.blocks).length,
    note: "Repeated Maven findings are occurrences, not distinct CVEs. This earlier scan did not include rendered Kubernetes.",
  },
  backend: {
    completed: backend.completed,
    totals: backend.totals,
    categories: backend.categories,
  },
  localTests: {
    securityPolicyAndIdentity: 17,
    evaluator: 13,
    webUnit: 37,
    productionConfig: 4,
    actionlint: "PASSED",
    promptfooHarness: "PASSED_WITH_DETERMINISTIC_FIXTURE_NOT_REAL_MODEL",
  },
  deployment,
  readonlyWeb,
  installed: sanitize(installed),
  images,
  limits: [
    source.findings.some((finding) => finding.exception)
      ? `${source.findings.filter((finding) => finding.exception).length} temporary exception occurrences; expiry dates: ${[...new Set(source.findings.filter((finding) => finding.exception).map((finding) => finding.exception.expires))].join(", ")}.`
      : "No accepted exception occurrences in this source scan; all blocking findings remain enforced.",
    "Medium/low findings do not block under this policy.",
    "No GitHub repository, CodeQL run, signed public release, Kubernetes deployment, penetration test or SLSA level verified.",
    "Infrastructure images, build-stage images and scanner binaries are outside the ten-image vulnerability result.",
    "Real-model AI quality remains failed; not rerun.",
  ],
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(summary, null, 2) + "\n");
await copyFile(
  resolve(input, "backend-quality-results.json"),
  resolve(dirname(output), "backend-quality-results.json"),
);
await mkdir(resolve(dirname(output), "sbom"), { recursive: true });
for (const service of ["booking-service", "web"])
  await copyFile(
    resolve(input, `${service}.cdx.json`),
    resolve(dirname(output), "sbom", `${service}.cdx.json`),
  );
console.log(
  JSON.stringify({
    output,
    images: images.length,
    allGatesPassed: true,
    githubVerified: false,
    exceptions: source.findings.filter((f) => f.exception).length,
  }),
);
