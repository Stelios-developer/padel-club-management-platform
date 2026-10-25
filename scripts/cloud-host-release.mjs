// Installed out of band from a reviewed immutable controller revision.
// SSM callers can select a signed image manifest, never a command/source script.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  validateHost,
  validateRelease,
  composeOverride,
  deployedServices,
  rollout,
  rollbackAuthorized,
} from "./cloud/release-policy.mjs";
import { verifyAttestations } from "./verify-release.mjs";
const args = process.argv.slice(2);
if (
  args.length !== 4 ||
  args[0] !== "--revision" ||
  args[2] !== "--manifest-sha256" ||
  !/^[a-f0-9]{40}$/.test(args[1]) ||
  !/^[a-f0-9]{64}$/.test(args[3])
)
  throw new Error("Require exact revision and manifest SHA-256");
assert.equal(
  process.platform,
  "linux",
  "Host controller requires the reviewed Linux runtime",
);
assert.equal(
  resolve("."),
  "/opt/padel",
  "Run from the preinstalled trusted controller directory",
);
function execute(command, args) {
  const p = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 20 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (p.status !== 0) throw new Error(`${command} operation failed`);
  return p.stdout.trim();
}
execute("mountpoint", ["-q", "/srv/padel-data"]);
const host = validateHost(
  JSON.parse(await readFile("/etc/padel-cloud/host.json", "utf8")),
);
const revision = args[1],
  directory = resolve(".runtime/cloud", revision);
await mkdir(directory, { recursive: true, mode: 0o700 });
const manifestPath = resolve(directory, "manifest.json");
execute("aws", [
  "s3api",
  "get-object",
  "--bucket",
  host.bucket,
  "--key",
  `releases/${revision}/manifest.json`,
  "--region",
  host.region,
  manifestPath,
]);
const bytes = await readFile(manifestPath);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  args[3],
  "Manifest transport identity mismatch",
);
const manifest = validateRelease(JSON.parse(bytes), {
  repo: host.repo,
  revision,
});
const production = JSON.parse(
  await readFile(resolve(host.bundle, "manifest.json")),
);
assert.equal(production.localTest, false);
assert.equal(production.webHost, host.webOrigin);
assert.equal(production.identityHost, host.identityOrigin);
// Validate private bundle credentials and SMTP before any application change.
execute("node", [
  "scripts/deploy-production.mjs",
  "--bundle",
  host.bundle,
  "--project",
  host.project,
  "--check-only",
]);
for (const service of deployedServices) {
  verifyAttestations(
    { repo: host.repo, commit: revision, image: manifest.images[service] },
    execute,
  );
  execute("docker", ["pull", manifest.images[service]]);
}
const overridePath = resolve(directory, "images.compose.json");
await writeFile(
  overridePath,
  JSON.stringify(composeOverride(manifest), null, 2) + "\n",
  { mode: 0o600 },
);
const base = [
  "compose",
  "--env-file",
  resolve(host.bundle, ".env"),
  "-f",
  resolve(host.bundle, "compose.yml"),
  "-p",
  host.project,
];
execute("docker", [...base, "-f", overridePath, "config", "--quiet"]);
const activePath = resolve(".runtime/cloud/active.json");
let previous = null;
try {
  previous = JSON.parse(await readFile(activePath));
  validateRelease(previous, { repo: host.repo, revision: previous.revision });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
async function smoke() {
  for (const [url, status] of [
    [host.webOrigin + "/", 200],
    [host.webOrigin + "/api/courts", 401],
    [
      host.identityOrigin + "/realms/padel/.well-known/openid-configuration",
      200,
    ],
    [host.identityOrigin + "/admin/", 403],
  ]) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, status);
    await response.arrayBuffer();
  }
}
const result = await rollout({
  deploy: async () => {
    execute("docker", [
      ...base,
      "-f",
      overridePath,
      "up",
      "-d",
      "--no-build",
      "--wait",
      "--wait-timeout",
      "480",
    ]);
    for (const service of deployedServices) {
      const [container] = JSON.parse(
        execute("docker", ["inspect", `${host.project}-${service}-1`]),
      );
      const [image] = JSON.parse(
        execute("docker", ["image", "inspect", manifest.images[service]]),
      );
      assert.equal(container.Image, image.Id);
      assert.equal(container.State.Running, true);
    }
  },
  smoke,
  previous,
  rollbackAllowed: rollbackAuthorized(host, previous, revision),
  rollback: async (previous) => {
    const previousPath = resolve(directory, "previous.compose.json");
    await writeFile(previousPath, JSON.stringify(composeOverride(previous)), {
      mode: 0o600,
    });
    execute("docker", [
      ...base,
      "-f",
      previousPath,
      "up",
      "-d",
      "--no-build",
      "--wait",
      "--wait-timeout",
      "480",
    ]);
  },
});
if (result.status === "DEPLOYED") {
  const pending = activePath + ".pending";
  await writeFile(pending, JSON.stringify(manifest, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(pending, activePath);
} else process.exitCode = 1;
await writeFile(
  resolve(directory, "deployment.json"),
  JSON.stringify(
    {
      ...result,
      revision,
      verifiedImages: deployedServices.length,
      scope:
        "Image identity, health and anonymous HTTPS smoke; authenticated roles/restore/availability require separate cloud rehearsal",
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ status: result.status, revision }));
