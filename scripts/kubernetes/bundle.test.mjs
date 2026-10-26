import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, copyFile, readFile, rm } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { prepareBundle } from "./bundle.mjs";
import { applicationServices } from "./policy.mjs";

test("kind preparation preserves canonical inputs, private credentials and persistent storage while binding release images and cluster DNS", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url)),
    runtime = resolve(root, ".runtime");
  await mkdir(runtime, { recursive: true });
  const fixture = await mkdtemp(resolve(runtime, "kubernetes-bundle-test-"));
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  try {
    for (const path of [
      "infra/k8s/resources.yml",
      "infra/k8s/kustomization.yaml",
      "infra/k8s/kind/toolchain.json",
      "docs/security/releases/v1.0.0/manifest.json",
      "web/nginx.conf",
    ]) {
      await mkdir(dirname(resolve(fixture, path)), { recursive: true });
      await copyFile(resolve(root, path), resolve(fixture, path));
    }
    await cp(
      resolve(root, "infra/k8s/config"),
      resolve(fixture, "infra/k8s/config"),
      { recursive: true },
    );
    const original = await readFile(
      resolve(fixture, "infra/k8s/resources.yml"),
    );
    const first = await prepareBundle(fixture, "padel-ci", "10.96.0.10"),
      again = await prepareBundle(fixture, "padel-ci", "10.96.0.10");
    assert.equal(
      hash(Buffer.from(JSON.stringify(first.target.settings))),
      hash(Buffer.from(JSON.stringify(again.target.settings))),
      "Repeated preparation must not rotate database credentials",
    );
    assert.equal(
      hash(await readFile(resolve(fixture, "infra/k8s/resources.yml"))),
      hash(original),
    );
    const docs = (
      await readFile(resolve(first.source, "resources.yml"), "utf8")
    )
      .split(/^---\s*$/m)
      .map((s) => JSON.parse(s));
    const deployments = docs.filter((d) =>
      ["Deployment", "StatefulSet"].includes(d.kind),
    );
    assert.equal(deployments.length, 13);
    for (const deployment of deployments) {
      const pod = deployment.spec.template.spec;
      for (const container of [
        ...pod.containers,
        ...(pod.initContainers || []),
      ]) {
        assert(container.resources.requests.cpu);
        assert(container.resources.requests.memory);
        assert(container.resources.limits.cpu);
        assert(container.resources.limits.memory);
      }
    }
    const keycloakPod = deployments.find((d) => d.metadata.name === "keycloak")
      .spec.template.spec;
    assert.deepEqual(
      keycloakPod.volumes.find((v) => v.name === "realm"),
      {
        name: "realm",
        secret: { secretName: "padel-realm" },
      },
    );
    for (const service of applicationServices) {
      const d = deployments.find((d) => d.metadata.name === service);
      assert.equal(
        d.spec.template.spec.containers[0].image,
        first.release.images[service],
      );
    }
    const postgres = deployments.find((d) => d.metadata.name === "postgres");
    assert.equal(postgres.spec.volumeClaimTemplates[0].metadata.name, "data");
    assert(postgres.spec.template.spec.containers[0].readinessProbe.exec);
    const booking = deployments.find(
      (d) => d.metadata.name === "booking-service",
    ).spec.template.spec.containers[0];
    assert(
      booking.env.some(
        (e) =>
          e.name === "KEYCLOAK_ISSUER" &&
          e.value === "http://localhost:18081/realms/padel",
      ),
    );
    assert(
      booking.env.some(
        (e) =>
          e.name === "EUREKA_INSTANCE_PREFER_IP_ADDRESS" && e.value === "false",
      ),
    );
    assert.equal(booking.securityContext.readOnlyRootFilesystem, true);
    const nginx = JSON.parse(
      await readFile(resolve(first.source, "nginx.yml"), "utf8"),
    );
    assert.match(nginx.data["default.conf"], /resolver 10\.96\.0\.10/);
    assert.match(
      nginx.data["default.conf"],
      /api-gateway\.padel\.svc\.cluster\.local/,
    );
    assert(!nginx.data["default.conf"].includes("127.0.0.11"));
    assert.equal(
      JSON.parse(
        await readFile(resolve(first.source, "config/app-config.json"), "utf8"),
      ).issuer,
      "http://localhost:18081/realms/padel",
    );
  } finally {
    const part = relative(runtime, resolve(fixture));
    assert(
      part &&
        !part.startsWith("..") &&
        part.startsWith("kubernetes-bundle-test-"),
    );
    await rm(resolve(fixture), { recursive: true, force: true });
  }
});
