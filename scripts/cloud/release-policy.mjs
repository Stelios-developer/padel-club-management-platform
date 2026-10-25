import { verificationCommands } from "../verify-release.mjs";
export const releaseServices = [
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
export const deployedServices = releaseServices.filter(
  (service) => service !== "assistant-service",
);
export function validateReleaseRun(run, { repo, revision }) {
  if (
    run.repository?.full_name !== repo ||
    run.head_sha !== revision ||
    run.path !== ".github/workflows/publish-images.yml" ||
    run.event !== "workflow_dispatch" ||
    run.conclusion !== "success"
  )
    throw new Error(
      "Require the successful complete publish workflow for this exact repository and source commit",
    );
}
export function validateRelease(manifest, { repo, revision }) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.repo !== repo ||
    manifest.revision !== revision ||
    !manifest.images ||
    Array.isArray(manifest.images)
  )
    throw new Error("Release repository/revision/schema mismatch");
  if (
    JSON.stringify(Object.keys(manifest.images).sort()) !==
    JSON.stringify([...releaseServices].sort())
  )
    throw new Error("Require exactly all ten signed application images");
  for (const service of releaseServices) {
    const image = manifest.images[service];
    verificationCommands({ repo, commit: revision, image });
    if (image.split("@")[0] !== `ghcr.io/${repo.toLowerCase()}/${service}`)
      throw new Error("Image belongs to a different service");
  }
  return manifest;
}
export function composeOverride(manifest) {
  return {
    services: Object.fromEntries(
      deployedServices.map((service) => [
        service,
        { image: manifest.images[service], pull_policy: "never" },
      ]),
    ),
  };
}
export function validateHost(host) {
  if (!host.approved || !host.syntheticDataOnly || !host.bootstrapValidated)
    throw new Error("Operator-approved synthetic demo/bootstrap is required");
  if (
    !/^[a-z][a-z0-9.-]{2,62}$/.test(host.bucket || "") ||
    !/^[a-z]{2}-[a-z]+-[0-9]$/.test(host.region || "")
  )
    throw new Error("Invalid bucket/region");
  if (
    host.project !== "padel-cloud-demo" ||
    host.bundle !== ".runtime/production"
  )
    throw new Error(
      "Require the isolated cloud project and private production bundle",
    );
  for (const origin of [host.webOrigin, host.identityOrigin]) {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error("Require exact public HTTPS origins");
  }
  if (host.webOrigin === host.identityOrigin)
    throw new Error("Origins must differ");
  verificationCommands({
    repo: host.repo,
    commit: "0".repeat(40),
    image: `ghcr.io/${host.repo.toLowerCase()}/web@sha256:${"0".repeat(64)}`,
  });
  return host;
}
export function rollbackAuthorized(host, previous, revision) {
  return (
    host.rollbackAllowed === true &&
    host.rollbackFromRevision === revision &&
    host.rollbackToRevision === previous?.revision
  );
}
// A safe automatic image rollback requires an explicit operator assertion about
// migration compatibility; no script can infer that from a passing healthcheck.
export async function rollout({
  deploy,
  smoke,
  previous,
  rollbackAllowed,
  rollback,
}) {
  try {
    await deploy();
    await smoke();
    return { status: "DEPLOYED" };
  } catch (error) {
    if (previous && rollbackAllowed) {
      await rollback(previous);
      await smoke();
      return { status: "ROLLED_BACK", failedRelease: true };
    }
    throw new Error(
      "Deployment failed; automatic rollback disabled without a verified compatible previous release",
      { cause: error },
    );
  }
}
