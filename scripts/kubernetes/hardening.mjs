import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { namespace } from "./policy.mjs";

const infrastructure = {
  postgres: {
    uid: 70,
    writable: ["/tmp", "/var/run/postgresql", "/var/lib/postgresql/data"],
  },
  rabbitmq: {
    uid: 100,
    writable: ["/tmp", "/var/log/rabbitmq", "/var/lib/rabbitmq"],
  },
  keycloak: { uid: 1000, writable: ["/tmp", "/opt/keycloak/data"] },
};
export function readOnlyMount(mounts, path) {
  const entries = mounts
    .trim()
    .split("\n")
    .map((line) => line.split(/\s+/));
  const matches = entries.filter((parts) => parts[1] === path);
  return matches.length === 1 && matches[0][3].split(",").includes("ro");
}
export function inspectInfrastructurePod(pod) {
  const service = pod.metadata.labels.app,
    policy = infrastructure[service];
  assert(policy, "Only the three owned infrastructure workloads are supported");
  assert.equal(pod.spec.automountServiceAccountToken, false);
  const main = pod.spec.containers[0];
  assert.equal(pod.spec.containers.length, 1);
  assert.equal(main.securityContext.runAsUser, policy.uid);
  const containers = [
    ...pod.spec.containers,
    ...(pod.spec.initContainers || []),
  ];
  for (const c of containers) {
    const security = c.securityContext;
    assert.equal(security.readOnlyRootFilesystem, true, c.name);
    assert.equal(security.runAsNonRoot, true, c.name);
    assert(security.runAsUser > 0, c.name);
    assert.equal(security.allowPrivilegeEscalation, false, c.name);
    assert(security.capabilities.drop.includes("ALL"), c.name);
    assert.equal(security.privileged ?? false, false, c.name);
    assert.match(c.image, /@sha256:[a-f0-9]{64}$/);
  }
  assert(
    main.volumeMounts.every(
      (m) => m.readOnly || policy.writable.includes(m.mountPath),
    ),
    "Writable mounts must be limited to declared data/runtime paths",
  );
  if (service === "keycloak") {
    assert.deepEqual(main.args, ["start", "--optimized", "--import-realm"]);
    assert(
      main.volumeMounts.some(
        (m) => m.mountPath === "/opt/keycloak/lib/quarkus" && m.readOnly,
      ),
    );
    assert.deepEqual(
      pod.spec.initContainers.map((c) => c.name),
      ["seed-keycloak-build", "optimize-keycloak"],
    );
    assert(pod.spec.initContainers.every((c) => c.image === main.image));
    assert(
      pod.spec.initContainers.every((c) =>
        c.volumeMounts.every(
          (m) =>
            m.readOnly ||
            [
              "/work/quarkus",
              "/opt/keycloak/lib/quarkus",
              "/opt/keycloak/data",
              "/tmp",
            ].includes(m.mountPath),
        ),
      ),
    );
  }
  return {
    service,
    expectedUid: policy.uid,
    declaredReadOnlyRoots: containers.length,
  };
}

export async function verifyInfrastructureHardening(kubectl, cluster) {
  const pods = JSON.parse(
    await kubectl("-n", namespace, "get", "pods", "-o", "json"),
  );
  const checks = [];
  for (const service of Object.keys(infrastructure)) {
    const live = pods.items.filter(
      (p) => p.metadata.labels.app === service && !p.metadata.deletionTimestamp,
    );
    assert.equal(
      live.length,
      1,
      "Require exactly one live " + service + " pod",
    );
    const pod = live[0],
      declared = inspectInfrastructurePod(pod);
    assert(
      pod.status.conditions.some(
        (c) => c.type === "Ready" && c.status === "True",
      ),
    );
    const exec = (...args) =>
      kubectl(
        "-n",
        namespace,
        "exec",
        "pod/" + pod.metadata.name,
        "-c",
        service,
        "--",
        ...args,
      );
    const uid = Number(await exec("id", "-u")),
      mounts = await exec("cat", "/proc/mounts");
    assert.equal(uid, declared.expectedUid);
    assert(
      readOnlyMount(mounts, "/"),
      "Kernel root mount must be read-only: " + service,
    );
    const marker = "/tmp/padel-hardening-" + randomUUID();
    await exec(
      "sh",
      "-ec",
      'printf test > "$1"; test "$(cat "$1")" = test; rm -- "$1"',
      "hardening-probe",
      marker,
    );
    if (service === "keycloak") {
      assert(
        readOnlyMount(mounts, "/opt/keycloak/lib/quarkus"),
        "Optimized server code must be mounted read-only",
      );
      assert.equal(pod.status.initContainerStatuses?.length, 2);
      assert(
        pod.status.initContainerStatuses.every(
          (c) => c.state.terminated?.exitCode === 0,
        ),
      );
    }
    checks.push({
      service,
      podUid: pod.metadata.uid,
      runtimeUid: uid,
      kernelRootReadOnly: true,
      temporaryVolumeWritable: true,
      declaredReadOnlyRoots: declared.declaredReadOnlyRoots,
      ...(service === "keycloak"
        ? { optimizedCodeReadOnly: true, successfulInitBuilds: 2 }
        : {}),
    });
  }
  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    cluster,
    scope:
      "Owned kind infrastructure; actual kernel mounts, process users, temporary writes and Keycloak init completion",
    checks,
    completed: checks.length === 3,
  };
}
