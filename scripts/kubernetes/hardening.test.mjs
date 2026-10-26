import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectInfrastructurePod, readOnlyMount } from "./hardening.mjs";

const resources = (
  await readFile(
    new URL("../../infra/k8s/resources.yml", import.meta.url),
    "utf8",
  )
)
  .split(/^---\s*$/m)
  .map(JSON.parse);
const pod = (name) => {
  const resource = resources.find(
    (r) => r.metadata.name === name && r.spec?.template,
  );
  return structuredClone({
    metadata: { labels: { app: name } },
    spec: resource.spec.template.spec,
  });
};
test("all infrastructure roots and init containers are restricted without writable code/data-root shortcuts", () => {
  for (const name of ["postgres", "rabbitmq", "keycloak"]) {
    assert.equal(inspectInfrastructurePod(pod(name)).service, name);
    for (const mutate of [
      (p) =>
        (p.spec.containers[0].securityContext.readOnlyRootFilesystem = false),
      (p) => (p.spec.containers[0].securityContext.runAsUser = 0),
      (p) =>
        (p.spec.containers[0].securityContext.allowPrivilegeEscalation = true),
      (p) => (p.spec.containers[0].securityContext.capabilities.drop = []),
      (p) => (p.spec.automountServiceAccountToken = true),
      (p) =>
        p.spec.containers[0].volumeMounts.push({
          name: "shortcut",
          mountPath: "/",
        }),
    ]) {
      const p = pod(name);
      mutate(p);
      assert.throws(() => inspectInfrastructurePod(p));
    }
  }
});
test("Keycloak must start optimized with read-only compiled code and matching pinned init images", () => {
  for (const mutate of [
    (p) => (p.spec.containers[0].args = ["start-dev", "--import-realm"]),
    (p) =>
      (p.spec.containers[0].volumeMounts.find((m) =>
        m.mountPath.endsWith("/quarkus"),
      ).readOnly = false),
    (p) =>
      (p.spec.initContainers[1].securityContext.readOnlyRootFilesystem = false),
    (p) =>
      (p.spec.initContainers[1].image = "different@sha256:" + "f".repeat(64)),
  ]) {
    const p = pod("keycloak");
    mutate(p);
    assert.throws(() => inspectInfrastructurePod(p));
  }
});
test("kernel mount checks require an exact single read-only mount rather than a lookalike or rw declaration", () => {
  assert(
    readOnlyMount(
      "overlay / overlay ro,relatime 0 0\ntmpfs /tmp tmpfs rw 0 0",
      "/",
    ),
  );
  for (const value of [
    "overlay / overlay rw 0 0",
    "tmpfs /tmp tmpfs ro 0 0",
    "overlay / overlay ro 0 0\noverlay / overlay rw 0 0",
    "",
  ])
    assert.equal(readOnlyMount(value, "/"), false);
});
