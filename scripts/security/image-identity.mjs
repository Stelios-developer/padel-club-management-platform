// Docker's classic store reports a config digest; its containerd store can report
// an OCI index digest. Syft can reconstruct a different Docker manifest when
// reading the exported archive; validate its config and manifest hashes separately.
import { createHash } from "node:crypto";

export function archiveImageIdentities(manifest, index, readBlob) {
  if (!Array.isArray(manifest) || manifest.length !== 1)
    throw new Error("Expected one exported image");
  const config = manifest[0].Config;
  const match = config?.match(
    /^(?:blobs\/sha256\/)?([a-f0-9]{64})(?:\.json)?$/,
  );
  if (!match) throw new Error("Invalid Docker archive config digest");
  const identities = new Set([`sha256:${match[1]}`]);
  let count = 0;
  function visit(descriptor, depth) {
    if (
      depth > 4 ||
      ++count > 32 ||
      !/^sha256:[a-f0-9]{64}$/.test(descriptor.digest || "")
    )
      throw new Error("Invalid OCI descriptor graph");
    if (
      descriptor.platform &&
      (descriptor.platform.os !== "linux" ||
        descriptor.platform.architecture !== "amd64")
    )
      return;
    identities.add(descriptor.digest);
    const blob = JSON.parse(
      readBlob(`blobs/sha256/${descriptor.digest.slice(7)}`),
    );
    for (const child of blob.manifests || []) visit(child, depth + 1);
  }
  for (const descriptor of index?.manifests || []) visit(descriptor, 0);
  return identities;
}

export function verifySbomBinding(
  imageId,
  manifest,
  identities,
  native,
  cyclonedx,
) {
  const metadata = native.source?.metadata;
  const expectedConfig = `sha256:${manifest[0].Config.match(/([a-f0-9]{64})(?:\.json)?$/)?.[1]}`;
  if (
    !identities.has(imageId) ||
    native.source?.type !== "image" ||
    metadata?.imageID !== expectedConfig
  )
    throw new Error(
      "SBOM/Docker config identity does not match the exported image",
    );
  const configHash = `sha256:${createHash("sha256")
    .update(Buffer.from(metadata.config || "", "base64"))
    .digest("hex")}`;
  const manifestHash = `sha256:${createHash("sha256")
    .update(Buffer.from(metadata.manifest || "", "base64"))
    .digest("hex")}`;
  if (
    configHash !== expectedConfig ||
    manifestHash !== metadata.manifestDigest ||
    cyclonedx.metadata?.component?.version !== metadata.manifestDigest
  )
    throw new Error("SBOM metadata hashes or CycloneDX source identity differ");
  return {
    imageConfigDigest: expectedConfig,
    sbomSourceManifestDigest: metadata.manifestDigest,
  };
}
