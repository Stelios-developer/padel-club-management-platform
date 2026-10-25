import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  releaseServices,
  validateRelease,
  validateReleaseRun,
} from "./cloud/release-policy.mjs";
import { verifyAttestations } from "./verify-release.mjs";
const options = {};
const args = process.argv.slice(2);
while (args.length) {
  const key = args.shift();
  if (
    ![
      "--artifacts",
      "--run-metadata",
      "--repo",
      "--revision",
      "--output",
    ].includes(key) ||
    !args.length
  )
    throw new Error(
      "Usage: cloud-release.mjs --artifacts DIR --run-metadata FILE --repo OWNER/REPO --revision SHA --output FILE",
    );
  options[key.slice(2)] = args.shift();
}
if (!options.artifacts || !options.output)
  throw new Error("Artifact directory and output are required");
if (!options["run-metadata"])
  throw new Error("Publisher run metadata is required");
validateReleaseRun(
  JSON.parse(await readFile(options["run-metadata"], "utf8")),
  { repo: options.repo, revision: options.revision },
);
const manifest = {
  schemaVersion: 1,
  repo: options.repo,
  revision: options.revision,
  images: {},
};
for (const service of releaseServices) {
  const file = resolve(
    options.artifacts,
    `release-${service}`,
    `${service}.image.txt`,
  );
  manifest.images[service] = (await readFile(file, "utf8")).trim();
}
validateRelease(manifest, { repo: options.repo, revision: options.revision });
function execute(command, args) {
  const p = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (p.status !== 0)
    throw new Error(`${command} failed signature verification`);
  return p.stdout;
}
// Do not trust an artifact's own "verified" flag. Reverify signatures now.
for (const service of releaseServices)
  verifyAttestations(
    {
      repo: manifest.repo,
      commit: manifest.revision,
      image: manifest.images[service],
    },
    execute,
  );
const bytes = JSON.stringify(manifest, null, 2) + "\n";
await mkdir(dirname(resolve(options.output)), { recursive: true });
await writeFile(options.output, bytes);
console.log(
  JSON.stringify({
    images: releaseServices.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }),
);
