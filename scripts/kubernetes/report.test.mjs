import test from "node:test";
import assert from "node:assert/strict";
import { deploymentReport } from "./report.mjs";
import { applicationServices, phases } from "./policy.mjs";

function fixture() {
  const release = {
    revision: "a".repeat(40),
    images: Object.fromEntries(
      applicationServices.map((s) => [
        s,
        `ghcr.io/fixture/padel/${s}@sha256:${"b".repeat(64)}`,
      ]),
    ),
  };
  return {
    security: {
      cluster: "padel-ci",
      completed: true,
      checks: ["postgres", "rabbitmq", "keycloak"].map((service) => ({
        service,
        podUid: service + "-uid",
        runtimeUid: 1000,
        kernelRootReadOnly: true,
        temporaryVolumeWritable: true,
        ...(service === "keycloak"
          ? { optimizedCodeReadOnly: true, successfulInitBuilds: 2 }
          : {}),
      })),
    },
    deployment: {
      cluster: "padel-ci",
      nodeImage: "kindest/node@sha256:" + "c".repeat(64),
      webOrigin: "http://localhost:13000",
    },
    release,
    pods: {
      items: phases.flat().map((service) => ({
        metadata: {
          name: service + "-pod",
          uid: service + "-uid",
          labels: { app: service },
        },
        spec: {
          containers: [
            {
              name: service,
              image: release.images[service] ?? "third-party:fixture",
              env: [{ name: "PASSWORD", value: "PRIVATE-TEST-CREDENTIAL" }],
            },
          ],
        },
        status: {
          phase: "Running",
          podIP: "PRIVATE-ADDRESS",
          conditions: [{ type: "Ready", status: "True" }],
          containerStatuses: [
            {
              name: service,
              imageID: release.images[service] ?? "third-party:fixture",
              restartCount: 0,
            },
          ],
        },
      })),
    },
    claims: {
      items: ["postgres", "rabbitmq"].map((n) => ({
        metadata: { name: n, uid: n + "-uid" },
        spec: { volumeName: n + "-volume" },
        status: { phase: "Bound" },
      })),
    },
    nodes: {
      items: [
        {
          status: {
            conditions: [{ type: "Ready", status: "True" }],
            nodeInfo: { kubeletVersion: "v1.37.0" },
          },
        },
      ],
    },
    e2e: {
      target: "kubernetes",
      project: "padel-ci",
      completed: true,
      passed: 61,
      failed: 0,
      results: [
        { name: "PostgreSQL pod replacement retains its PVC", passed: true },
      ],
    },
  };
}
test("public Kubernetes evidence excludes environment credentials and addresses and requires the actual complete suite", () => {
  const input = fixture(),
    report = deploymentReport(input);
  assert.equal(report.completed, true);
  assert.equal(report.applications.length, 9);
  const text = JSON.stringify(report);
  assert(!text.includes("PRIVATE-TEST-CREDENTIAL"));
  assert(!text.includes("PRIVATE-ADDRESS"));
  for (const change of [
    (x) => (x.security.completed = false),
    (x) => (x.security.cluster = "another-cluster"),
    (x) => (x.security.checks[0].podUid = "old-replaced-pod"),
    (x) => (x.security.checks[0].kernelRootReadOnly = false),
    (x) => (x.security.checks[0].runtimeUid = 0),
    (x) => (x.security.checks[2].optimizedCodeReadOnly = false),
    (x) => (x.e2e.completed = false),
    (x) => (x.e2e.passed = 60),
    (x) => (x.e2e.target = "compose"),
    (x) => (x.e2e.results[0].passed = false),
    (x) => (x.pods.items[0].status.conditions[0].status = "False"),
    (x) => (x.claims.items[0].status.phase = "Pending"),
  ]) {
    const invalid = fixture();
    change(invalid);
    assert.equal(deploymentReport(invalid).completed, false);
  }
});
test("a tag or running digest that differs from the pinned application release never verifies", () => {
  for (const change of [
    (x) =>
      (x.pods.items.find(
        (p) => p.metadata.labels.app === "web",
      ).spec.containers[0].image = "ghcr.io/fixture/padel/web:latest"),
    (x) =>
      (x.pods.items.find(
        (p) => p.metadata.labels.app === "web",
      ).status.containerStatuses[0].imageID = "sha256:" + "d".repeat(64)),
  ]) {
    const invalid = fixture();
    change(invalid);
    assert.equal(deploymentReport(invalid).completed, false);
  }
});
