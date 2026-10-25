import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveImageIdentities } from "./image-identity.mjs";
import { verifySbomBinding } from "./image-identity.mjs";
import { createHash } from "node:crypto";
const config = "a".repeat(64),
  root = "b".repeat(64),
  platform = "c".repeat(64);
test("classic Docker config and OCI index/platform identity are recognized", () => {
  assert.deepEqual(
    [...archiveImageIdentities([{ Config: `${config}.json` }], null)],
    [`sha256:${config}`],
  );
  const index = { manifests: [{ digest: `sha256:${root}` }] };
  const ids = archiveImageIdentities(
    [{ Config: `blobs/sha256/${config}` }],
    index,
    (path) =>
      path.endsWith(root)
        ? JSON.stringify({
            manifests: [
              {
                digest: `sha256:${platform}`,
                platform: { os: "linux", architecture: "amd64" },
              },
            ],
          })
        : "{}",
  );
  assert.ok(ids.has(`sha256:${config}`));
  assert.ok(ids.has(`sha256:${root}`));
  assert.ok(ids.has(`sha256:${platform}`));
  assert.ok(!ids.has(`sha256:${"d".repeat(64)}`));
});
test("descriptor traversal and multi-image archives are rejected", () => {
  assert.throws(() => archiveImageIdentities([{ Config: "../../file" }], null));
  assert.throws(() =>
    archiveImageIdentities([{ Config: config }, { Config: config }], null),
  );
  assert.throws(() =>
    archiveImageIdentities(
      [{ Config: config }],
      { manifests: [{ digest: "../../file" }] },
      () => "{}",
    ),
  );
});
test("native SBOM and CycloneDX bind to the exported config, including reconstructed manifest hashes", () => {
  const configBytes = Buffer.from('{"architecture":"amd64"}');
  const configId = `sha256:${createHash("sha256").update(configBytes).digest("hex")}`;
  const manifestBytes = Buffer.from(
    JSON.stringify({ config: { digest: configId } }),
  );
  const manifestId = `sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`;
  const exported = [{ Config: `blobs/sha256/${configId.slice(7)}` }];
  const native = {
    source: {
      type: "image",
      metadata: {
        imageID: configId,
        config: configBytes.toString("base64"),
        manifest: manifestBytes.toString("base64"),
        manifestDigest: manifestId,
      },
    },
  };
  const cdx = { metadata: { component: { version: manifestId } } };
  assert.equal(
    verifySbomBinding(configId, exported, new Set([configId]), native, cdx)
      .imageConfigDigest,
    configId,
  );
  assert.throws(() =>
    verifySbomBinding(configId, exported, new Set([configId]), native, {
      metadata: { component: { version: "other" } },
    }),
  );
  assert.throws(() =>
    verifySbomBinding(
      configId,
      exported,
      new Set([configId]),
      {
        source: {
          ...native.source,
          metadata: {
            ...native.source.metadata,
            config: Buffer.from("tampered").toString("base64"),
          },
        },
      },
      cdx,
    ),
  );
});
