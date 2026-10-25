import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function verificationCommands({ repo, commit, image }) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || "") ||
    repo.split("/").some((s) => s === "." || s === "..")
  )
    throw new Error("Expected OWNER/REPO");
  if (!/^[a-f0-9]{40}$/.test(commit || ""))
    throw new Error("Expected exact source commit SHA");
  const prefix = `ghcr.io/${repo.toLowerCase()}/`;
  if (
    !image?.startsWith(prefix) ||
    !/^[a-z0-9/-]+@sha256:[a-f0-9]{64}$/.test(image.slice("ghcr.io/".length))
  )
    throw new Error(
      "Expected this repository image pinned by sha256 digest (tags are rejected)",
    );
  const policy = [
    "attestation",
    "verify",
    `oci://${image}`,
    "--repo",
    repo,
    "--signer-workflow",
    `${repo}/.github/workflows/publish-images.yml`,
    "--source-digest",
    commit,
    "--deny-self-hosted-runners",
    "--format",
    "json",
  ];
  return [policy, [...policy, "--predicate-type", "https://cyclonedx.org/bom"]];
}
export function verifyAttestations(input, execute) {
  return verificationCommands(input).map((args) => {
    const verified = JSON.parse(execute("gh", args));
    if (!Array.isArray(verified) || !verified.length)
      throw new Error("No verified attestations returned");
    return verified;
  });
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2),
    options = {};
  while (args.length) {
    const key = args.shift();
    if (
      !["--repo", "--commit", "--image", "--report", "--container"].includes(
        key,
      ) ||
      !args.length
    )
      throw new Error(
        "Expected --repo OWNER/REPO --commit SHA --image IMAGE@sha256:DIGEST --report FILE [--container NAME]",
      );
    options[key.slice(2)] = args.shift();
  }
  if (!options.report)
    throw new Error("A verification report path is required");
  function execute(command, args) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0)
      throw new Error(
        `${command} verification failed: ${result.stderr || result.error}`,
      );
    return result.stdout;
  }
  const verified = verifyAttestations(options, execute);
  execute("docker", ["pull", options.image]);
  const imageInfo = JSON.parse(
    execute("docker", ["image", "inspect", options.image]),
  )[0];
  let installed = null;
  if (options.container) {
    if (!/^[A-Za-z0-9_.-]+$/.test(options.container))
      throw new Error("Invalid container name");
    const container = JSON.parse(
      execute("docker", ["container", "inspect", options.container]),
    )[0];
    if (container.Image !== imageInfo.Id)
      throw new Error("Running container differs from the verified image");
    installed = {
      container: options.container,
      imageId: container.Image,
      running: container.State.Running,
    };
    if (!installed.running) throw new Error("Expected a running deployment");
  }
  const report = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    repo: options.repo,
    commit: options.commit,
    image: options.image,
    imageId: imageInfo.Id,
    installed,
    provenance: verified[0],
    sbom: verified[1],
  };
  await mkdir(dirname(resolve(options.report)), { recursive: true });
  await writeFile(options.report, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `Provenance and SBOM verified for ${options.image}${installed ? " and running container" : ""}`,
  );
}
