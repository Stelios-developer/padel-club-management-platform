import assert from "node:assert/strict";
import { resolve, relative, isAbsolute } from "node:path";

export const namespace = "padel";
export const applicationServices = [
  "config-server",
  "discovery-server",
  "api-gateway",
  "member-service",
  "subscription-service",
  "booking-service",
  "access-service",
  "notification-service",
  "web",
];
export const phases = [
  ["postgres", "rabbitmq", "mailpit"],
  ["config-server", "discovery-server"],
  ["keycloak"],
  ["member-service", "subscription-service"],
  ["booking-service", "access-service", "notification-service"],
  ["api-gateway", "web"],
];
export const statefulServices = new Set(["postgres", "rabbitmq"]);
export const workload = (name) =>
  (statefulServices.has(name) ? "statefulset/" : "deployment/") + name;
export function clusterName(name) {
  if (!["padel-local", "padel-ci"].includes(name))
    throw new Error(
      "Only the isolated padel-local / padel-ci clusters are supported",
    );
  return name;
}
export function privatePath(root, path) {
  const runtime = resolve(root, ".runtime"),
    absolute = resolve(root, path),
    part = relative(runtime, absolute);
  if (!part || part.startsWith("..") || isAbsolute(part))
    throw new Error(
      "Kubernetes state must stay inside this workspace's .runtime directory",
    );
  return absolute;
}
export function verifyTarget(config, view, nodes, ownership) {
  const name = clusterName(config.cluster);
  assert.equal(config.context, "kind-" + name);
  assert.equal(config.namespace, namespace);
  assert.equal(view["current-context"], config.context);
  const server = new URL(view.clusters[0].cluster.server);
  assert.equal(server.protocol, "https:");
  assert.equal(server.hostname, "127.0.0.1");
  assert.deepEqual(
    nodes.items.map((n) => n.metadata.name),
    [name + "-control-plane"],
  );
  assert.equal(
    ownership,
    name,
    "Docker kind node label must match this cluster",
  );
}
export function parseJSONDocuments(text) {
  const documents = [];
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start < 0) {
      if (/\s/.test(ch)) continue;
      if (ch !== "{") throw new Error("Expected kubectl JSON object");
      start = i;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      const doc = JSON.parse(text.slice(start, i + 1));
      documents.push(...(doc.kind === "List" ? doc.items : [doc]));
      start = -1;
    }
  }
  if (start >= 0 || !documents.length)
    throw new Error("Incomplete kubectl JSON output");
  return documents;
}
