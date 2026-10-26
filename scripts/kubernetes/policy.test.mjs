import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  clusterName,
  privatePath,
  verifyTarget,
  parseJSONDocuments,
} from "./policy.mjs";

test("cluster and workspace guards reject external targets and private files outside .runtime", () => {
  for (const name of ["production", "docker-desktop", "padel-local-other", ""])
    assert.throws(() => clusterName(name));
  const root = resolve(".");
  assert.equal(
    privatePath(root, ".runtime/kubernetes/padel-ci"),
    resolve(root, ".runtime/kubernetes/padel-ci"),
  );
  for (const path of [
    ".runtime",
    ".runtime-other/state",
    "../other",
    "infra/k8s/kubeconfig",
  ])
    assert.throws(() => privatePath(root, path));
});
test("only the exact isolated loopback kind context, node and Docker ownership are accepted", () => {
  const config = {
    cluster: "padel-local",
    context: "kind-padel-local",
    namespace: "padel",
  };
  const view = {
    "current-context": config.context,
    clusters: [{ cluster: { server: "https://127.0.0.1:12345" } }],
  };
  const nodes = {
    items: [{ metadata: { name: "padel-local-control-plane" } }],
  };
  verifyTarget(config, view, nodes, "padel-local");
  for (const server of [
    "https://example.com:12345",
    "http://127.0.0.1:12345",
  ]) {
    const changed = structuredClone(view);
    changed.clusters[0].cluster.server = server;
    assert.throws(() => verifyTarget(config, changed, nodes, "padel-local"));
  }
  assert.throws(() => verifyTarget(config, view, nodes, "another-cluster"));
  assert.throws(() =>
    verifyTarget(
      config,
      { ...view, "current-context": "production" },
      nodes,
      "padel-local",
    ),
  );
  assert.throws(() =>
    verifyTarget(
      config,
      view,
      { items: [{ metadata: { name: "production-node" } }] },
      "padel-local",
    ),
  );
});
test("kubectl output accepts Lists and concatenated JSON without splitting quoted braces or escapes", () => {
  const one = {
      kind: "ConfigMap",
      data: { text: 'nested { "value" } \\ path' },
    },
    two = { kind: "Service", metadata: { name: "web" } };
  assert.deepEqual(
    parseJSONDocuments(JSON.stringify(one) + "\n" + JSON.stringify(two)),
    [one, two],
  );
  assert.deepEqual(
    parseJSONDocuments(JSON.stringify({ kind: "List", items: [one, two] })),
    [one, two],
  );
  for (const input of ["", '{"kind":"List"', JSON.stringify(one) + "garbage"])
    assert.throws(() => parseJSONDocuments(input));
});
