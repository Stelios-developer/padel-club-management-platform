import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import {
  installKubernetesTools,
  kubernetesTool,
  kubernetesToolchain,
} from "./kubernetes-install.mjs";
import { prepareBundle } from "./kubernetes/bundle.mjs";
import { deploymentReport } from "./kubernetes/report.mjs";
import {
  clusterName,
  namespace,
  phases,
  workload,
  parseJSONDocuments,
  verifyTarget,
  privatePath,
} from "./kubernetes/policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)),
  args = process.argv.slice(2),
  command = args.shift();
if (
  !["up", "status", "test", "diagnostics", "report"].includes(command) ||
  args.some((x, i) => i % 2 === 0 && x !== "--cluster") ||
  args.length > 2 ||
  args.length % 2
)
  throw new Error(
    "Usage: node scripts/kubernetes.mjs up|status|test|diagnostics|report [--cluster padel-local|padel-ci]",
  );
const name = clusterName(args[1] || "padel-local"),
  directory = privatePath(root, `.runtime/kubernetes/${name}`),
  kubeconfig = resolve(directory, "kubeconfig"),
  context = "kind-" + name;
const exec = promisify(execFile);
async function run(binary, argv, input) {
  if (input !== undefined)
    return new Promise((yes, no) => {
      const child = spawn(binary, argv, {
        cwd: root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "",
        err = "";
      const timer = setTimeout(() => child.kill(), 180000);
      child.stdout.on("data", (b) => (out += b));
      child.stderr.on("data", (b) => (err += b));
      child.on("error", no);
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0
          ? yes(out.trim())
          : no(new Error("Kubernetes operation failed: " + err.slice(-3000)));
      });
      child.stdin.end(input);
    });
  const r = await exec(binary, argv, {
    cwd: root,
    windowsHide: true,
    timeout: 600000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return r.stdout.trim();
}
const kubectl = (...argv) =>
  run(kubernetesTool("kubectl"), [
    "--kubeconfig",
    kubeconfig,
    "--context",
    context,
    ...argv,
  ]);
async function guard(checkNamespace = false) {
  const view = JSON.parse(
      await kubectl("config", "view", "--minify", "-o", "json"),
    ),
    nodes = JSON.parse(await kubectl("get", "nodes", "-o", "json"));
  const node = JSON.parse(
    await run("docker", ["inspect", name + "-control-plane"]),
  )[0];
  verifyTarget(
    { cluster: name, context, namespace },
    view,
    nodes,
    node.Config.Labels["io.x-k8s.kind.cluster"],
  );
  if (checkNamespace) {
    const ns = JSON.parse(
      await kubectl("get", "namespace", namespace, "-o", "json"),
    );
    assert.equal(ns.metadata.annotations["padel.dev/cluster"], name);
    assert.equal(
      ns.metadata.labels["app.kubernetes.io/managed-by"],
      "padel-kind",
    );
  }
}
async function apply(items) {
  await run(
    kubernetesTool("kubectl"),
    ["--kubeconfig", kubeconfig, "--context", context, "apply", "-f", "-"],
    JSON.stringify({ apiVersion: "v1", kind: "List", items }),
  );
}
async function up() {
  await installKubernetesTools();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const clusters = (
    await run(kubernetesTool("kind"), ["get", "clusters"])
  ).split(/\r?\n/);
  if (!clusters.includes(name)) {
    console.log("Creating isolated cluster " + name);
    console.log(
      await run(kubernetesTool("kind"), [
        "create",
        "cluster",
        "--name",
        name,
        "--kubeconfig",
        kubeconfig,
        "--config",
        "infra/k8s/kind/cluster.yml",
        "--image",
        kubernetesToolchain.nodeImage,
        "--wait",
        "180s",
      ]),
    );
  } else await access(kubeconfig);
  await guard();
  const existing = await kubectl(
    "get",
    "namespace",
    namespace,
    "--ignore-not-found",
    "-o",
    "json",
  );
  if (existing) {
    const ns = JSON.parse(existing);
    assert.equal(
      ns.metadata.annotations?.["padel.dev/cluster"],
      name,
      "Refuse to overwrite an unowned namespace",
    );
  }
  const dns = JSON.parse(
    await kubectl(
      "-n",
      "kube-system",
      "get",
      "service",
      "kube-dns",
      "-o",
      "json",
    ),
  ).spec.clusterIP;
  const bundle = await prepareBundle(root, name, dns);
  const rendered = await run(kubernetesTool("kubectl"), [
    "kustomize",
    bundle.source,
  ]);
  const renderedPath = resolve(directory, "rendered.yml");
  await writeFile(renderedPath, rendered, { mode: 0o600 });
  const json = await kubectl(
    "create",
    "--dry-run=client",
    "--validate=false",
    "-f",
    renderedPath,
    "-o",
    "json",
  );
  const documents = parseJSONDocuments(json),
    deployments = documents.filter((d) =>
      ["Deployment", "StatefulSet"].includes(d.kind),
    );
  assert.equal(
    deployments.length,
    13,
    "Expected the nine core application images and four infrastructure workloads",
  );
  await apply(
    documents.filter((d) => !["Deployment", "StatefulSet"].includes(d.kind)),
  );
  await guard(true);
  for (const stage of phases) {
    console.log("Deploying: " + stage.join(", "));
    await apply(deployments.filter((d) => stage.includes(d.metadata.name)));
    for (const service of stage)
      await kubectl(
        "-n",
        namespace,
        "rollout",
        "status",
        workload(service),
        "--timeout=420s",
      );
    console.log("Ready: " + stage.join(", "));
  }
  const state = {
    completed: true,
    at: new Date().toISOString(),
    cluster: name,
    context,
    namespace,
    webOrigin: bundle.target.webOrigin,
    identityOrigin: bundle.target.identityOrigin,
    nodeImage: kubernetesToolchain.nodeImage,
    applicationRelease: bundle.release.revision,
    applicationImages: 9,
    optionalAIIncluded: false,
  };
  await writeFile(
    resolve(directory, "deployment.json"),
    JSON.stringify(state, null, 2) + "\n",
  );
  console.log(JSON.stringify(state));
}
if (command === "up") await up();
else {
  await guard(true);
  if (command === "status")
    console.log(
      await kubectl("-n", namespace, "get", "pods,services,pvc", "-o", "wide"),
    );
  if (command === "test") {
    const settings = resolve(directory, "settings.json");
    await access(settings);
    const child = spawn(
      process.execPath,
      ["scripts/e2e.mjs", "--resilience", "--kubernetes", settings],
      { cwd: root, stdio: "inherit", windowsHide: true },
    );
    process.exitCode = await new Promise((yes, no) => {
      child.on("error", no);
      child.on("close", (code) => yes(code ?? 1));
    });
  }
  if (command === "report") {
    const read = async (path) => JSON.parse(await readFile(path, "utf8"));
    const e2e = await read(resolve(root, "test-results/e2e.json"));
    assert.equal(e2e.target, "kubernetes");
    assert.equal(e2e.project, name);
    const report = deploymentReport({
      deployment: await read(resolve(directory, "deployment.json")),
      release: await read(resolve(directory, "release-manifest.json")),
      pods: JSON.parse(
        await kubectl("-n", namespace, "get", "pods", "-o", "json"),
      ),
      claims: JSON.parse(
        await kubectl("-n", namespace, "get", "pvc", "-o", "json"),
      ),
      nodes: JSON.parse(await kubectl("get", "nodes", "-o", "json")),
      e2e,
      sourceRevision:
        process.env.GITHUB_ACTIONS === "true"
          ? process.env.GITHUB_SHA
          : undefined,
    });
    await writeFile(
      resolve(root, "test-results/kubernetes-e2e.json"),
      JSON.stringify(e2e, null, 2) + "\n",
    );
    await writeFile(
      resolve(root, "test-results/kubernetes-deployment.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        completed: report.completed,
        readyWorkloads: report.workloads.filter((p) => p.ready).length,
        verifiedApplicationImages: report.applications.filter(
          (a) => a.digestMatches,
        ).length,
        e2e: report.e2e,
      }),
    );
    if (!report.completed) process.exitCode = 1;
  }
  if (command === "diagnostics") {
    await writeFile(
      resolve(directory, "pods.json"),
      await kubectl("-n", namespace, "get", "pods", "-o", "json"),
    );
    await writeFile(
      resolve(directory, "events.txt"),
      await kubectl(
        "-n",
        namespace,
        "get",
        "events",
        "--sort-by=.lastTimestamp",
      ),
    );
    for (const service of phases.flat()) {
      const logs = await kubectl(
        "-n",
        namespace,
        "logs",
        workload(service),
        "--tail=150",
      ).catch((e) => e.message);
      await writeFile(resolve(directory, service + ".log"), logs);
    }
    console.log("Private diagnostics saved inside " + directory);
  }
}
