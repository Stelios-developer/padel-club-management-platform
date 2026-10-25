import { test } from "node:test";
import assert from "node:assert/strict";
import { verificationCommands, verifyAttestations } from "./verify-release.mjs";
const input = {
  repo: "Owner/Padel",
  commit: "a".repeat(40),
  image: `ghcr.io/owner/padel/booking-service@sha256:${"b".repeat(64)}`,
};
test("mutable tags, another repository and malformed source commits are rejected", () => {
  for (const change of [
    { image: "ghcr.io/owner/padel/booking-service:dev" },
    { image: input.image.replace("owner/padel", "attacker/padel") },
    { commit: "main" },
    { repo: "../padel" },
  ])
    assert.throws(() => verificationCommands({ ...input, ...change }));
});
test("both predicates enforce digest, source commit, signer workflow and hosted runner", () => {
  const commands = verificationCommands(input);
  assert.equal(commands.length, 2);
  for (const args of commands) {
    assert.ok(args.includes(`oci://${input.image}`));
    assert.ok(args.includes(input.commit));
    assert.ok(
      args.includes("Owner/Padel/.github/workflows/publish-images.yml"),
    );
    assert.ok(args.includes("--deny-self-hosted-runners"));
  }
  assert.equal(commands[1].at(-1), "https://cyclonedx.org/bom");
});
test("invalid signature aborts before SBOM verification or any deployment action", () => {
  let calls = 0;
  assert.throws(
    () =>
      verifyAttestations(input, () => {
        calls++;
        throw new Error("invalid signature");
      }),
    /invalid signature/,
  );
  assert.equal(calls, 1);
});
test("missing SBOM attestation fails after valid provenance", () => {
  let calls = 0;
  assert.throws(
    () =>
      verifyAttestations(input, () => {
        if (++calls === 2) throw new Error("missing SBOM");
        return '[{"fixture":true}]';
      }),
    /missing SBOM/,
  );
  assert.equal(calls, 2);
});
test("zero verified attestations and malformed CLI output fail closed", () => {
  assert.throws(() => verifyAttestations(input, () => "[]"), /No verified/);
  assert.throws(() => verifyAttestations(input, () => "{}"), /No verified/);
  assert.throws(() => verifyAttestations(input, () => "not JSON"));
});
