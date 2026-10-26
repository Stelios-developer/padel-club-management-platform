import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { applicationServices } from "./policy.mjs";
import { validateRelease } from "../cloud/release-policy.mjs";
import { verifyAttestations } from "../verify-release.mjs";

const manifest = JSON.parse(
  await readFile(
    new URL(
      "../../docs/security/releases/v1.1.0/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
validateRelease(manifest, { repo: manifest.repo, revision: manifest.revision });
for (const service of applicationServices) {
  verifyAttestations(
    {
      repo: manifest.repo,
      commit: manifest.revision,
      image: manifest.images[service],
    },
    (command, args) => {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 32 * 1024 * 1024,
      });
      if (result.status !== 0)
        throw new Error(
          service +
            " signature verification failed: " +
            (result.stderr || result.error),
        );
      return result.stdout;
    },
  );
  console.log(
    service +
      ": provenance and SBOM verified against release source and signer workflow",
  );
}
