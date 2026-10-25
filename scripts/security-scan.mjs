import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  access,
  cp,
  copyFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateTrivy } from "./security-policy.mjs";
import {
  archiveImageIdentities,
  verifySbomBinding,
} from "./security/image-identity.mjs";

const [mode, image, label] = process.argv.slice(2);
if (
  !["source", "image"].includes(mode) ||
  (mode === "image" && (!image || !/^[a-z0-9-]+$/.test(label || "")))
)
  throw new Error("Usage: security-scan.mjs source | image IMAGE SIMPLE-LABEL");
const output = resolve(".runtime/security");
await mkdir(output, { recursive: true });
const scanner = resolve(
  ".tools/security/trivy",
  `trivy${process.platform === "win32" ? ".exe" : ""}`,
);
const scanEnvironment = {
  ...process.env,
  GOMEMLIMIT: "512MiB",
  SYFT_CHECK_FOR_APP_UPDATE: "false",
};
try {
  await access(resolve(".tools/repository"));
  const mavenSettings = resolve(output, "maven");
  await mkdir(resolve(mavenSettings, "conf"), { recursive: true });
  const localRepository = resolve(".tools/repository")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;");
  await writeFile(
    resolve(mavenSettings, "conf/settings.xml"),
    `<settings><localRepository>${localRepository}</localRepository></settings>`,
  );
  scanEnvironment.MAVEN_HOME = mavenSettings;
} catch {
  /* CI uses the Maven cache populated by setup-java and mvn install. */
}
function run(command, args) {
  const p = spawnSync(command, args, {
    env: scanEnvironment,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
    shell: false,
  });
  if (p.status !== 0)
    throw new Error(
      `${command} failed (${p.status}): ${p.stderr || p.error || p.stdout}`,
    );
  return p.stdout.trim();
}
if (!run(scanner, ["--version"]).startsWith("Version: 0.75.0"))
  throw new Error("Unexpected Trivy version");
const shared = [
  "--quiet",
  "--disable-telemetry",
  "--cache-dir",
  resolve(".tools/security/trivy-cache"),
  "--timeout",
  "15m",
];
const name = mode === "source" ? "source" : label;
const reportPath = resolve(output, `${name}.trivy.json`);
const sbomPath = resolve(output, `${name}.cdx.json`);
const nativeSbomPath = resolve(output, `${name}.syft.json`);
let input,
  identity = {};
if (mode === "image") {
  const info = JSON.parse(run("docker", ["image", "inspect", image]))[0];
  identity = {
    image,
    imageId: info.Id,
    repoDigests: info.RepoDigests || [],
    created: info.Created,
  };
  // Use one immutable Docker archive for Syft inventory and Trivy secret scanning.
  // The SBOM vulnerability scan avoids a second, large Java package index download.
  const archive = resolve(output, `${name}.image.tar`);
  run("docker", ["image", "save", "--output", archive, info.Id]);
  const syft = resolve(
    ".tools/security/syft",
    `syft${process.platform === "win32" ? ".exe" : ""}`,
  );
  if (!run(syft, ["version"]).includes("1.54.0"))
    throw new Error("Unexpected Syft version");
  if (process.platform === "win32") {
    const toolchain = JSON.parse(
      await readFile(
        new URL("../infra/security/toolchain.json", import.meta.url),
      ),
    );
    const scratch = resolve(output, "syft-tmp");
    await mkdir(scratch, { recursive: true });
    run("docker", [
      "run",
      "--rm",
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--env",
      "SYFT_CHECK_FOR_APP_UPDATE=false",
      "--env",
      "XDG_CACHE_HOME=/tmp/.cache",
      "--mount",
      `type=bind,source=${scratch},target=/tmp`,
      "--mount",
      `type=bind,source=${archive},target=/scan/image.tar,readonly`,
      "--mount",
      `type=bind,source=${output},target=/output`,
      toolchain.syft.container,
      "scan",
      "docker-archive:/scan/image.tar",
      "-o",
      `cyclonedx-json=/output/${name}.cdx.json`,
      "-o",
      `syft-json=/output/${name}.syft.json`,
    ]);
  } else
    run(syft, [
      "scan",
      `docker-archive:${archive}`,
      "-o",
      `cyclonedx-json=${sbomPath}`,
      "-o",
      `syft-json=${nativeSbomPath}`,
    ]);
  const sbom = JSON.parse(await readFile(sbomPath));
  if (sbom.bomFormat !== "CycloneDX" || !sbom.components?.length)
    throw new Error("Empty/invalid image SBOM");
  const archiveManifest = JSON.parse(
    run("tar", ["-xOf", archive, "manifest.json"]),
  );
  const archiveFiles = run("tar", ["-tf", archive]).split(/\r?\n/);
  const archiveIndex = archiveFiles.includes("index.json")
    ? JSON.parse(run("tar", ["-xOf", archive, "index.json"]))
    : null;
  const identities = archiveImageIdentities(
    archiveManifest,
    archiveIndex,
    (path) => run("tar", ["-xOf", archive, path]),
  );
  Object.assign(
    identity,
    verifySbomBinding(
      info.Id,
      archiveManifest,
      identities,
      JSON.parse(await readFile(nativeSbomPath)),
      sbom,
    ),
  );
  if (
    name !== "web" &&
    !sbom.components.some((c) =>
      c.purl?.includes("pkg:maven/org.springframework.boot/"),
    )
  )
    throw new Error("Image SBOM omitted Spring Boot runtime dependencies");
  identity.sbomComponents = sbom.components.length;
  identity.packageComponents = sbom.components.filter((c) => c.purl).length;
  run(scanner, [
    "sbom",
    ...shared,
    "--scanners",
    "vuln",
    "--format",
    "json",
    "--output",
    reportPath,
    sbomPath,
  ]);
  const secretPath = resolve(output, `${name}.secrets.json`);
  run(scanner, [
    "image",
    ...shared,
    "--input",
    archive,
    "--scanners",
    "secret",
    "--format",
    "json",
    "--output",
    secretPath,
  ]);
  const vulnerabilityReport = JSON.parse(await readFile(reportPath));
  const secretReport = JSON.parse(await readFile(secretPath));
  if (secretReport.SchemaVersion !== 2 || !secretReport.ArtifactName)
    throw new Error("Invalid image secret scan report");
  vulnerabilityReport.Results.push(...(secretReport.Results || []));
  await writeFile(reportPath, JSON.stringify(vulnerabilityReport));
} else {
  input = [
    "fs",
    ...shared,
    "--include-dev-deps",
    "--skip-dirs",
    ".tools",
    "--skip-dirs",
    ".runtime",
    "--skip-dirs",
    ".git",
    "--skip-dirs",
    "**/node_modules",
    "--skip-dirs",
    "**/.terraform",
    "--skip-dirs",
    "**/target",
    "--skip-dirs",
    "**/test-results",
    "--skip-dirs",
    "**/playwright-report",
    "--skip-files",
    ".env",
    "--skip-files",
    "**/terraform.tfstate*",
    "--skip-files",
    "**/*.tfplan",
    "--skip-files",
    "**/terraform.tfvars",
    "--skip-files",
    "**/*.auto.tfvars",
  ];
  run(scanner, [
    ...input,
    "--scanners",
    "vuln,misconfig,secret",
    "--format",
    "json",
    "--output",
    reportPath,
    ".",
  ]);
  run(scanner, [...input, "--format", "cyclonedx", "--output", sbomPath, "."]);
  // Trivy does not recognize the existing JSON multi-document resources.yml.
  // Render Kustomize with public fixture secrets, never the developer's secrets.env.
  const k8s = resolve(output, "k8s-source");
  await mkdir(k8s, { recursive: true });
  for (const file of ["resources.yml", "kustomization.yaml"])
    await copyFile(resolve("infra/k8s", file), resolve(k8s, file));
  await cp(resolve("infra/k8s/config"), resolve(k8s, "config"), {
    recursive: true,
  });
  await copyFile(
    resolve("infra/k8s/secrets.env.example"),
    resolve(k8s, "secrets.env"),
  );
  const rendered = resolve(output, "rendered-k8s.yml");
  await writeFile(rendered, run("kubectl", ["kustomize", k8s]));
  const k8sReport = resolve(output, "kubernetes.trivy.json");
  run(scanner, [
    "config",
    ...shared,
    "--format",
    "json",
    "--output",
    k8sReport,
    rendered,
  ]);
  const sourceReport = JSON.parse(await readFile(reportPath));
  const configuration = JSON.parse(await readFile(k8sReport));
  if (!configuration.Results?.length)
    throw new Error("Rendered Kubernetes manifest was not analyzed");
  sourceReport.Results.push(
    ...configuration.Results.map((r) => ({
      ...r,
      Target: "infra/k8s (Kustomize rendered with fixture secrets)",
    })),
  );
  await writeFile(reportPath, JSON.stringify(sourceReport));
}
const report = JSON.parse(await readFile(reportPath));
const exceptions = JSON.parse(
  await readFile(new URL("../infra/security/exceptions.json", import.meta.url)),
).exceptions;
const gate = { ...evaluateTrivy(report, exceptions), ...identity };
await writeFile(
  resolve(output, `${name}.gate.json`),
  JSON.stringify(gate, null, 2) + "\n",
);
console.log(
  `${name}: ${gate.gate}; ${gate.findings.filter((f) => f.blocks).length} blocking findings; ${identity.sbomComponents || "source"} components`,
);
if (gate.gate !== "PASSED") process.exitCode = 1;
