import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  configSources,
  syncConfig,
  repositoryRoot,
} from "./sync-k8s-config.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "padel-config-parity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "backend/config-repo"), { recursive: true });
  await writeFile(
    join(root, "backend/config-repo/booking-service.yml"),
    "server:\n  port: 8080\n",
  );
  for (const [source] of await configSources(root)) {
    if (source.startsWith("backend/config-repo/")) continue;
    const path = join(root, source);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `synthetic fixture: ${source}\n`);
  }
  return root;
}

test("refresh discovers canonical service configs and preserves source bytes", async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, "backend/config-repo/assistant-service.yml"),
    "assistant: true\r\n",
  );
  await syncConfig({ root });
  for (const [source, target] of await configSources(root))
    assert.deepEqual(
      await readFile(join(root, "infra/k8s/config", target)),
      await readFile(join(root, source)),
    );
  await syncConfig({ root, check: true });
});

test("check reports changed generated config without overwriting it", async (t) => {
  const root = await fixture(t);
  await syncConfig({ root });
  const path = join(root, "infra/k8s/config/padel-realm.json");
  await writeFile(path, "unexpected manual edit");
  await assert.rejects(
    syncConfig({ root, check: true }),
    /Stale Kubernetes copies: padel-realm.json/,
  );
  assert.equal(await readFile(path, "utf8"), "unexpected manual edit");
});

test("missing generated copy fails the check and refresh can repair it", async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    syncConfig({ root, check: true }),
    /Stale Kubernetes copies/,
  );
  await syncConfig({ root });
  await syncConfig({ root, check: true });
});

test("Config Server projects service configs and credential bindings into the same read-only directory", async () => {
  const source = await readFile(
    join(repositoryRoot, "infra/k8s/resources.yml"),
    "utf8",
  );
  const objects = source
    .split(/^---\s*$/m)
    .filter((document) => document.trim())
    .map((document) => JSON.parse(document));
  const pod = objects.find(
    (resource) =>
      resource.kind === "Deployment" &&
      resource.metadata.name === "config-server",
  ).spec.template.spec;
  assert.deepEqual(
    pod.volumes.find((volume) => volume.name === "config").projected.sources,
    [
      { configMap: { name: "padel-config" } },
      { secret: { name: "padel-spring-config" } },
    ],
  );
  assert.ok(
    pod.containers[0].volumeMounts.some(
      (mount) =>
        mount.name === "config" &&
        mount.mountPath === "/app/config-repo" &&
        mount.readOnly,
    ),
  );
  const kustomization = await readFile(
    join(repositoryRoot, "infra/k8s/kustomization.yaml"),
    "utf8",
  );
  assert.equal(
    kustomization
      .split("secretGenerator:")[0]
      .includes("config/application.yml"),
    false,
  );
  assert.match(
    kustomization.split("secretGenerator:")[1],
    /name: padel-spring-config\s+files: \[config\/application.yml, config\/notification-service.yml\]/,
  );
  assert.equal(
    kustomization
      .split("secretGenerator:")[0]
      .includes("config/notification-service.yml"),
    false,
  );
});

test("Greek login messages use a read-only Secret projection at the Keycloak theme path", async () => {
  const source = await readFile(
    join(repositoryRoot, "infra/k8s/resources.yml"),
    "utf8",
  );
  const resources = source
    .split(/^---\s*$/m)
    .filter((s) => s.trim())
    .map((s) => JSON.parse(s));
  const pod = resources.find(
    (r) => r.kind === "Deployment" && r.metadata.name === "keycloak",
  ).spec.template.spec;
  const volume = pod.volumes.find((v) => v.name === "login-theme");
  const secret = volume.projected.sources.find((s) => s.secret)?.secret;
  assert.equal(secret.name, "padel-login-messages");
  assert.deepEqual(secret.items, [
    {
      key: "padel-messages-el.properties",
      path: "login/messages/messages_el.properties",
    },
  ]);
  assert(
    pod.containers[0].volumeMounts.some(
      (m) => m.name === volume.name && m.readOnly,
    ),
  );
  const kustomization = await readFile(
    join(repositoryRoot, "infra/k8s/kustomization.yaml"),
    "utf8",
  );
  assert(
    !kustomization
      .split("secretGenerator:")[0]
      .includes("padel-messages-el.properties"),
  );
  assert.match(
    kustomization.split("secretGenerator:")[1],
    /name: padel-login-messages\s+files: \[config\/padel-messages-el.properties\]/,
  );
});
