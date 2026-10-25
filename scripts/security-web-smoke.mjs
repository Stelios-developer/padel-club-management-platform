// Exercise the scanned Nginx image with the intended read-only runtime settings.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const directory = ".runtime/security";
const gate = JSON.parse(await readFile(`${directory}/web.gate.json`));
assert.equal(gate.gate, "PASSED");
const container = `padel-security-web-check-${randomBytes(6).toString("hex")}`;
const report = {
  createdAt: new Date().toISOString(),
  completed: false,
  checks: [],
  scope: "Isolated Docker Nginx runtime; not a Kubernetes deployment",
  imageId: gate.imageId,
};
function docker(...args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || String(result.error));
  return result.stdout.trim();
}
let created = false;
try {
  docker(
    "run",
    "-d",
    "--name",
    container,
    "--network",
    "padel-e2e_default",
    "--publish",
    "127.0.0.1::8080",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=128m,uid=101,gid=101",
    "--tmpfs",
    "/var/cache/nginx:rw,noexec,nosuid,size=64m,uid=101,gid=101",
    gate.imageId,
  );
  created = true;
  let inspection;
  for (let attempt = 0; attempt < 30; attempt++) {
    [inspection] = JSON.parse(docker("inspect", container));
    if (inspection.State.Health?.Status === "healthy") break;
    await new Promise((done) => setTimeout(done, 1000));
  }
  assert.equal(inspection.Image, gate.imageId);
  assert.equal(inspection.State.Health?.Status, "healthy");
  assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
  assert.equal(inspection.Config.User, "101:101");
  const port = inspection.NetworkSettings.Ports["8080/tcp"][0].HostPort;
  for (const [path, status] of [
    ["/", 200],
    ["/app.js", 200],
    ["/api/courts", 401],
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, status, `${path} response`);
    await response.arrayBuffer();
    report.checks.push({ path, status, passed: true });
  }
  report.completed = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  if (created) docker("rm", "-f", container);
  // Confirm cleanup by querying only this run's randomly generated name.
  report.temporaryContainerRemoved =
    docker(
      "ps",
      "-a",
      "--filter",
      `name=^/${container}$`,
      "--format",
      "{{.Names}}",
    ) === "";
  assert.equal(report.temporaryContainerRemoved, true);
  await writeFile(
    `${directory}/readonly-web-results.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      completed: report.completed,
      checks: report.checks.length,
      temporaryContainerRemoved: report.temporaryContainerRemoved,
    }),
  );
}
