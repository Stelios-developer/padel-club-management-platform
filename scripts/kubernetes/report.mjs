import { applicationServices } from "./policy.mjs";

export function deploymentReport({
  deployment,
  pods,
  claims,
  release,
  nodes,
  e2e,
  sourceRevision,
}) {
  const live = pods.items.filter((p) => !p.metadata.deletionTimestamp);
  const workloads = live.map((p) => ({
    name: p.metadata.name,
    service: p.metadata.labels.app,
    uid: p.metadata.uid,
    phase: p.status.phase,
    ready:
      p.status.conditions?.some(
        (c) => c.type === "Ready" && c.status === "True",
      ) ?? false,
    restarts: (p.status.containerStatuses || []).reduce(
      (n, c) => n + c.restartCount,
      0,
    ),
    images: p.spec.containers.map((c) => ({
      name: c.name,
      requested: c.image,
      running:
        p.status.containerStatuses?.find((s) => s.name === c.name)?.imageID ??
        null,
    })),
  }));
  const applications = applicationServices.map((service) => {
    const pod = workloads.find((p) => p.service === service),
      image = pod?.images[0],
      expected = release.images[service];
    return {
      service,
      expected,
      running: image?.running ?? null,
      digestMatches:
        !!image &&
        image.requested === expected &&
        image.running?.endsWith(expected.split("@")[1]) === true,
    };
  });
  const storage = claims.items.map((c) => ({
    name: c.metadata.name,
    uid: c.metadata.uid,
    volume: c.spec.volumeName,
    phase: c.status.phase,
  }));
  const nodeReady = nodes.items.every((n) =>
    n.status.conditions.some((c) => c.type === "Ready" && c.status === "True"),
  );
  const tests = e2e
    ? {
        project: e2e.project,
        target: e2e.target,
        passed: e2e.passed,
        failed: e2e.failed,
        completed: e2e.completed,
        postgresPodReplacementPassed: e2e.results.some(
          (r) => r.name.startsWith("PostgreSQL pod replacement") && r.passed,
        ),
      }
    : null;
  return {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    scope:
      "Single-node local/CI kind development cluster; no AWS or production Kubernetes deployment",
    sourceRevision: sourceRevision ?? null,
    configurationScope: sourceRevision
      ? "hosted CI checkout"
      : "local working tree",
    cluster: deployment.cluster,
    kubernetesVersion: nodes.items[0].status.nodeInfo.kubeletVersion,
    nodeImage: deployment.nodeImage,
    webOrigin: deployment.webOrigin,
    applicationReleaseSource: release.revision,
    optionalAIIncluded: false,
    nodeReady,
    workloads,
    applications,
    storage,
    e2e: tests,
    completed:
      nodeReady &&
      workloads.length === 13 &&
      workloads.every((p) => p.ready) &&
      applications.every((a) => a.digestMatches) &&
      storage.length === 2 &&
      storage.every((c) => c.phase === "Bound") &&
      tests?.target === "kubernetes" &&
      tests.project === deployment.cluster &&
      tests.completed &&
      tests.passed === 61 &&
      tests.failed === 0 &&
      tests.postgresPodReplacementPassed,
  };
}
