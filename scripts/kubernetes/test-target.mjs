import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { kubernetesTool } from "../kubernetes-install.mjs";
import {
  namespace,
  clusterName,
  privatePath,
  phases,
  workload,
  verifyTarget,
} from "./policy.mjs";

export async function loadKubernetesTestTarget(path) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const file = privatePath(root, path),
    config = JSON.parse(await readFile(file, "utf8"));
  clusterName(config.cluster);
  assert.equal(config.namespace, namespace);
  assert.equal(config.context, "kind-" + config.cluster);
  assert.equal(
    resolve(config.kubeconfig),
    resolve(dirname(file), "kubeconfig"),
  );
  for (const [key, value] of Object.entries({
    webOrigin: "http://localhost:13000",
    identityOrigin: "http://localhost:18081",
    mailpitOrigin: "http://localhost:18025",
    rabbitOrigin: "http://localhost:18072",
  }))
    assert.equal(config[key], value, "Require isolated loopback endpoints");
  assert.equal(config.settings.DB_USER, "padel");
  assert.equal(config.settings.RABBIT_USER, "padel");
  assert.equal(config.settings.KEYCLOAK_ADMIN, "admin");
  const exec = promisify(execFile),
    known = new Set(phases.flat());
  async function kubectl(...args) {
    const r = await exec(
      kubernetesTool("kubectl"),
      ["--kubeconfig", config.kubeconfig, "--context", config.context, ...args],
      {
        cwd: root,
        windowsHide: true,
        timeout: 240000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return r.stdout.trim();
  }
  async function verify() {
    const view = JSON.parse(
        await kubectl("config", "view", "--minify", "-o", "json"),
      ),
      nodes = JSON.parse(await kubectl("get", "nodes", "-o", "json"));
    const node = JSON.parse(
      (
        await exec("docker", ["inspect", config.cluster + "-control-plane"], {
          windowsHide: true,
        })
      ).stdout,
    )[0];
    verifyTarget(
      config,
      view,
      nodes,
      node.Config.Labels["io.x-k8s.kind.cluster"],
    );
    const ns = JSON.parse(
      await kubectl("get", "namespace", namespace, "-o", "json"),
    );
    assert.equal(ns.metadata.annotations["padel.dev/cluster"], config.cluster);
    assert.equal(
      ns.metadata.labels["app.kubernetes.io/managed-by"],
      "padel-kind",
    );
  }
  async function command(...args) {
    const action = args[0];
    if (action === "exec" && args[1] === "-T") {
      const service = args[2];
      assert(known.has(service));
      assert(["psql", "wget"].includes(args[3]));
      return kubectl(
        "-n",
        namespace,
        "exec",
        workload(service),
        "--",
        ...args.slice(3),
      );
    }
    if (action === "ps" && args[1] === "-q") {
      assert(known.has(args[2]));
      const pods = JSON.parse(
        await kubectl(
          "-n",
          namespace,
          "get",
          "pods",
          "-l",
          "app=" + args[2],
          "-o",
          "json",
        ),
      );
      const live = pods.items.filter(
        (p) => !p.metadata.deletionTimestamp && p.status.phase === "Running",
      );
      assert.equal(live.length, 1, "Require one live test pod");
      return live[0].metadata.uid;
    }
    if (action === "restart" || action === "up") {
      const service = action === "restart" ? args[1] : args.at(-1);
      assert(known.has(service));
      await kubectl("-n", namespace, "rollout", "restart", workload(service));
      return kubectl(
        "-n",
        namespace,
        "rollout",
        "status",
        workload(service),
        "--timeout=180s",
      );
    }
    if (action === "stop" || action === "start") {
      const services = args.slice(1);
      assert(
        services.length > 0 &&
          services.every((s) => ["rabbitmq", "mailpit"].includes(s)),
      );
      for (const service of services) {
        await kubectl(
          "-n",
          namespace,
          "scale",
          workload(service),
          "--replicas=" + (action === "stop" ? 0 : 1),
        );
        if (action === "stop")
          await kubectl(
            "-n",
            namespace,
            "wait",
            "--for=delete",
            "pod",
            "-l",
            "app=" + service,
            "--timeout=120s",
          );
        else
          await kubectl(
            "-n",
            namespace,
            "rollout",
            "status",
            workload(service),
            "--timeout=180s",
          );
      }
      return "";
    }
    throw new Error(
      "Unsupported isolated Kubernetes test operation: " + action,
    );
  }
  async function postgresStorage() {
    const claim = JSON.parse(
      await kubectl(
        "-n",
        namespace,
        "get",
        "pvc",
        "data-postgres-0",
        "-o",
        "json",
      ),
    );
    assert.equal(claim.status.phase, "Bound");
    return { uid: claim.metadata.uid, volume: claim.spec.volumeName };
  }
  return { ...config, command, verify, postgresStorage };
}
