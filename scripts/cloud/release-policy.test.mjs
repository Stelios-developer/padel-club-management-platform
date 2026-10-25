import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRelease,
  validateReleaseRun,
  validateHost,
  composeOverride,
  releaseServices,
  rollout,
  rollbackAuthorized,
} from "./release-policy.mjs";
const repo = "fixture/padel",
  revision = "a".repeat(40);
const release = () => ({
  schemaVersion: 1,
  repo,
  revision,
  images: Object.fromEntries(
    releaseServices.map((s) => [
      s,
      `ghcr.io/${repo}/${s}@sha256:${"b".repeat(64)}`,
    ]),
  ),
});
test("rollback approval is bound to the exact source/previous pair, never a standing flag", () => {
  const approval = {
    rollbackAllowed: true,
    rollbackFromRevision: revision,
    rollbackToRevision: "c".repeat(40),
  };
  const previous = { revision: "c".repeat(40) };
  assert.equal(rollbackAuthorized(approval, previous, revision), true);
  assert.equal(
    rollbackAuthorized({ rollbackAllowed: true }, previous, revision),
    false,
  );
  assert.equal(
    rollbackAuthorized(approval, { revision: "d".repeat(40) }, revision),
    false,
  );
  assert.equal(rollbackAuthorized(approval, previous, "d".repeat(40)), false);
});
test("partial/failed releases and another publish run cannot supply deployment artifacts", () => {
  const run = {
    repository: { full_name: repo },
    head_sha: revision,
    path: ".github/workflows/publish-images.yml",
    event: "workflow_dispatch",
    conclusion: "success",
  };
  validateReleaseRun(run, { repo, revision });
  for (const patch of [
    { conclusion: "failure" },
    { path: ".github/workflows/ci.yml" },
    { head_sha: "c".repeat(40) },
    { repository: { full_name: "foreign/padel" } },
    { event: "pull_request" },
  ])
    assert.throws(() =>
      validateReleaseRun({ ...run, ...patch }, { repo, revision }),
    );
});
test("release rejects mutable tags, wrong repositories, commits and swapped services", () => {
  assert.equal(
    validateRelease(release(), { repo, revision }).revision,
    revision,
  );
  for (const image of [
    "ghcr.io/fixture/padel/web:latest",
    `ghcr.io/foreign/padel/web@sha256:${"b".repeat(64)}`,
    release().images["booking-service"],
  ]) {
    const manifest = release();
    manifest.images.web = image;
    assert.throws(() => validateRelease(manifest, { repo, revision }));
  }
  assert.throws(() =>
    validateRelease(release(), { repo, revision: "c".repeat(40) }),
  );
});
test("all ten images are required and unexpected services are rejected", () => {
  const missing = release();
  delete missing.images["assistant-service"];
  assert.throws(() => validateRelease(missing, { repo, revision }));
  const extra = release();
  extra.images.shell = extra.images.web;
  assert.throws(() => validateRelease(extra, { repo, revision }));
});
test("override changes only nine application images, never infrastructure, credentials or volumes", () => {
  const override = composeOverride(release());
  assert.equal(Object.keys(override.services).length, 9);
  assert.equal(override.services["assistant-service"], undefined);
  assert.equal(override.services.postgres, undefined);
  assert.deepEqual(Object.keys(override.services.web).sort(), [
    "image",
    "pull_policy",
  ]);
});
const host = () => ({
  approved: true,
  syntheticDataOnly: true,
  bootstrapValidated: true,
  repo,
  bucket: "fixture-padel-artifacts",
  region: "eu-central-1",
  project: "padel-cloud-demo",
  bundle: ".runtime/production",
  webOrigin: "https://club.example.com",
  identityOrigin: "https://identity.example.com",
});
test("unapproved bootstrap or real-user demo data blocks public rollout", () => {
  assert.equal(validateHost(host()).repo, repo);
  for (const key of ["approved", "syntheticDataOnly", "bootstrapValidated"])
    assert.throws(() => validateHost({ ...host(), [key]: false }));
  assert.throws(() => validateHost({ ...host(), project: "padel-e2e" }));
  assert.throws(() => validateHost({ ...host(), bundle: "../../private" }));
});
test("host requires exact distinct HTTPS origins and safe fixed bucket/region", () => {
  for (const webOrigin of [
    "http://club.example.com",
    "https://localhost",
    "https://club.example.com/path",
    "https://user:password@club.example.com",
  ])
    assert.throws(() => validateHost({ ...host(), webOrigin }));
  assert.throws(() =>
    validateHost({ ...host(), identityOrigin: host().webOrigin }),
  );
  assert.throws(() => validateHost({ ...host(), bucket: "$(command)" }));
});
test("deployment success invokes smoke before reporting success", async () => {
  const events = [];
  const result = await rollout({
    deploy: async () => events.push("deploy"),
    smoke: async () => events.push("smoke"),
  });
  assert.deepEqual(events, ["deploy", "smoke"]);
  assert.equal(result.status, "DEPLOYED");
});
test("failed rollout never retries or rolls back incompatible database migrations", async () => {
  let rollbackCount = 0;
  await assert.rejects(
    rollout({
      deploy: async () => {
        throw new Error("fixture");
      },
      smoke: async () => {},
      previous: release(),
      rollbackAllowed: false,
      rollback: async () => rollbackCount++,
    }),
    /rollback disabled/,
  );
  assert.equal(rollbackCount, 0);
});
test("explicit compatible rollback rechecks health and remains a failed release", async () => {
  const events = [];
  const result = await rollout({
    deploy: async () => events.push("deploy"),
    smoke: async () => {
      events.push("smoke");
      if (events.length === 2) throw new Error("bad health");
    },
    previous: release(),
    rollbackAllowed: true,
    rollback: async () => events.push("rollback"),
  });
  assert.deepEqual(events, ["deploy", "smoke", "rollback", "smoke"]);
  assert.deepEqual(result, { status: "ROLLED_BACK", failedRelease: true });
});
test("rollback failure propagates instead of reporting recovery", async () => {
  await assert.rejects(
    rollout({
      deploy: async () => {
        throw new Error("bad");
      },
      smoke: async () => {},
      previous: release(),
      rollbackAllowed: true,
      rollback: async () => {
        throw new Error("rollback failed");
      },
    }),
    /rollback failed/,
  );
});
