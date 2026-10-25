// Read-only verification of the exact images installed locally and domain preservation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const directory = ".runtime/security";
const json = async (name) =>
  JSON.parse(await readFile(`${directory}/${name}`, "utf8"));
function docker(...args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `Docker verification failed: ${result.stderr || result.error}`,
    );
  return result.stdout.trim();
}
const services = [
  "config-server",
  "discovery-server",
  "api-gateway",
  "member-service",
  "subscription-service",
  "booking-service",
  "access-service",
  "notification-service",
  "assistant-service",
  "web",
];
const images = [];
for (const service of services) {
  const container = `${service === "assistant-service" ? "padel-ai-local" : "padel-e2e"}-${service}-1`;
  const [inspection] = JSON.parse(docker("inspect", container));
  const gate = await json(`${service}.gate.json`);
  assert.equal(gate.gate, "PASSED");
  assert.equal(
    inspection.Image,
    gate.imageId,
    `Scanned image mismatch: ${service}`,
  );
  assert.equal(inspection.State.Running, true, `Stopped service: ${service}`);
  if (inspection.State.Health)
    assert.equal(
      inspection.State.Health.Status,
      "healthy",
      `Unhealthy service: ${service}`,
    );
  assert.equal(
    inspection.Config.User,
    service === "web" ? "101:101" : "10001:10001",
  );
  images.push({
    service,
    container,
    imageId: inspection.Image,
    running: true,
    health: inspection.State.Health?.Status || "HTTP_CHECKED",
    user: inspection.Config.User,
  });
}
const web = await fetch("http://localhost:3000/", {
  signal: AbortSignal.timeout(10000),
});
assert.equal(web.status, 200);
const snapshot = {};
for (const table of ["members", "subscriptions", "bookings"]) {
  const sql = `SELECT count(*)||':'||md5(coalesce(string_agg(md5(to_jsonb(t)::text),',' ORDER BY id),'')) FROM ${table} t`;
  snapshot[table] = docker(
    "exec",
    "padel-e2e-postgres-1",
    "psql",
    "-U",
    "padel",
    "-d",
    `padel_${table}`,
    "-At",
    "-c",
    sql,
  );
}
assert.deepEqual(
  snapshot,
  await json("deployment-snapshot-before.json"),
  "Domain rows changed during rollout or smoke checks",
);
const result = {
  createdAt: new Date().toISOString(),
  domainUnchanged: true,
  webStatus: web.status,
  images,
};
await writeFile(
  `${directory}/installed-images.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    installedImages: images.length,
    matchScans: true,
    domainUnchanged: true,
    webStatus: web.status,
  }),
);
