import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { isIPv4 } from "node:net";
import assert from "node:assert/strict";
import { protectDirectory } from "../operations/backup.mjs";
import {
  applicationServices,
  clusterName,
  namespace,
  privatePath,
} from "./policy.mjs";

export async function prepareBundle(root, name, dnsIP) {
  clusterName(name);
  assert(isIPv4(dnsIP));
  const directory = privatePath(root, `.runtime/kubernetes/${name}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  protectDirectory(directory);
  const settingsPath = resolve(directory, "settings.json");
  let target = await readFile(settingsPath, "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
  if (!target) {
    const password = () => randomBytes(32).toString("hex");
    target = {
      cluster: name,
      context: "kind-" + name,
      namespace,
      kubeconfig: resolve(directory, "kubeconfig"),
      webOrigin: "http://localhost:13000",
      identityOrigin: "http://localhost:18081",
      mailpitOrigin: "http://localhost:18025",
      rabbitOrigin: "http://localhost:18072",
      settings: {
        DB_USER: "padel",
        DB_PASSWORD: password(),
        RABBIT_USER: "padel",
        RABBIT_PASSWORD: password(),
        KEYCLOAK_ADMIN: "admin",
        KEYCLOAK_ADMIN_PASSWORD: password(),
      },
    };
    await writeFile(settingsPath, JSON.stringify(target, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
  }
  assert.equal(target.cluster, name);
  assert.equal(target.namespace, namespace);
  const source = resolve(directory, "source");
  await mkdir(source, { recursive: true, mode: 0o700 });
  await cp(resolve(root, "infra/k8s/config"), resolve(source, "config"), {
    recursive: true,
  });
  let kustomization = await readFile(
    resolve(root, "infra/k8s/kustomization.yaml"),
    "utf8",
  );
  assert(kustomization.includes("resources: [resources.yml]"));
  kustomization = kustomization.replace(
    "resources: [resources.yml]",
    "resources: [resources.yml, nginx.yml]",
  );
  await writeFile(resolve(source, "kustomization.yaml"), kustomization);
  await writeFile(
    resolve(source, "secrets.env"),
    ["DB_PASSWORD", "RABBIT_PASSWORD", "KEYCLOAK_ADMIN_PASSWORD"]
      .map((k) => k + "=" + target.settings[k])
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  const realm = JSON.parse(
    await readFile(resolve(source, "config/padel-realm.json"), "utf8"),
  );
  const client = realm.clients.find((c) => c.clientId === "padel-web");
  assert(client);
  client.redirectUris = [target.webOrigin + "/*"];
  client.webOrigins = [target.webOrigin];
  client.attributes["post.logout.redirect.uris"] = target.webOrigin + "/*";
  await writeFile(
    resolve(source, "config/padel-realm.json"),
    JSON.stringify(realm, null, 2) + "\n",
  );
  await writeFile(
    resolve(source, "config/app-config.json"),
    JSON.stringify(
      {
        issuer: target.identityOrigin + "/realms/padel",
        clientId: "padel-web",
        apiBase: "",
      },
      null,
      2,
    ) + "\n",
  );
  const nginx = (await readFile(resolve(root, "web/nginx.conf"), "utf8"))
    .replace("resolver 127.0.0.11", "resolver " + dnsIP)
    .replace(
      "http://api-gateway:8080",
      "http://api-gateway.padel.svc.cluster.local:8080",
    );
  assert(nginx.includes("resolver " + dnsIP));
  await writeFile(
    resolve(source, "nginx.yml"),
    JSON.stringify({
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "padel-kind-nginx" },
      data: { "default.conf": nginx },
    }),
  );
  const release = JSON.parse(
    await readFile(
      resolve(root, "docs/security/releases/v1.0.0/manifest.json"),
      "utf8",
    ),
  );
  const toolchain = JSON.parse(
    await readFile(resolve(root, "infra/k8s/kind/toolchain.json"), "utf8"),
  );
  const docs = (
    await readFile(resolve(root, "infra/k8s/resources.yml"), "utf8")
  )
    .split(/^---\s*$/m)
    .map((s) => JSON.parse(s));
  for (const resource of docs) {
    const service = resource.metadata.name;
    resource.metadata.labels = {
      ...resource.metadata.labels,
      "app.kubernetes.io/part-of": "padel",
      "app.kubernetes.io/managed-by": "padel-kind",
    };
    if (resource.kind === "Namespace")
      resource.metadata.annotations = {
        ...resource.metadata.annotations,
        "padel.dev/cluster": name,
      };
    if (resource.kind === "Service") {
      const ports = { web: [80, 8080, 30000], keycloak: [8080, 8080, 30081] };
      if (ports[service]) {
        const [port, targetPort, nodePort] = ports[service];
        resource.spec.type = "NodePort";
        resource.spec.ports = [{ name: "http", port, targetPort, nodePort }];
      }
      if (service === "mailpit") {
        resource.spec.type = "NodePort";
        resource.spec.ports = [
          { name: "smtp", port: 1025, targetPort: 1025 },
          { name: "http", port: 8025, targetPort: 8025, nodePort: 30025 },
        ];
      }
      if (service === "rabbitmq") {
        resource.spec.type = "NodePort";
        resource.spec.ports = [
          { name: "amqp", port: 5672, targetPort: 5672 },
          {
            name: "management",
            port: 15672,
            targetPort: 15672,
            nodePort: 30672,
          },
        ];
      }
    }
    const pod = resource.spec?.template?.spec;
    if (!pod) continue;
    const container = pod.containers[0];
    if (toolchain.infrastructureImages[service]) {
      container.image = toolchain.infrastructureImages[service];
      container.imagePullPolicy = "IfNotPresent";
    }
    const env = (key, value) => {
      container.env ??= [];
      container.env = container.env
        .filter((e) => e.name !== key)
        .concat({ name: key, value });
    };
    if (applicationServices.includes(service)) {
      assert(release.images[service]?.includes("@sha256:"));
      container.image = release.images[service];
      container.imagePullPolicy = "IfNotPresent";
      if (service !== "web") {
        const small = ["config-server", "discovery-server"].includes(service);
        env(
          "JAVA_TOOL_OPTIONS",
          `-Xms32m -Xmx${small ? 128 : 256}m -XX:ActiveProcessorCount=2 -XX:+UseSerialGC`,
        );
        env("MANAGEMENT_ENDPOINT_HEALTH_PROBES_ENABLED", "true");
        env("OTEL_TRACES_EXPORTER", "none");
        env("OTEL_METRICS_EXPORTER", "none");
        env("OTEL_LOGS_EXPORTER", "none");
        container.resources = {
          requests: { cpu: "100m", memory: small ? "128Mi" : "256Mi" },
          limits: { cpu: "1000m", memory: small ? "384Mi" : "512Mi" },
        };
        if (!small) {
          env("KEYCLOAK_ISSUER", target.identityOrigin + "/realms/padel");
          env("EUREKA_INSTANCE_HOSTNAME", service);
          env("EUREKA_INSTANCE_PREFER_IP_ADDRESS", "false");
        }
        if (service === "notification-service") {
          env("SMTP_HOST", "mailpit");
          env("SMTP_PORT", "1025");
        }
      }
    }
    if (service === "web") {
      resource.spec.template.metadata.annotations = {
        ...resource.spec.template.metadata.annotations,
        "padel.dev/nginx-config": createHash("sha256")
          .update(nginx)
          .digest("hex"),
      };
      pod.volumes.push({
        name: "kind-nginx",
        configMap: { name: "padel-kind-nginx" },
      });
      container.volumeMounts.push({
        name: "kind-nginx",
        mountPath: "/etc/nginx/conf.d/default.conf",
        subPath: "default.conf",
        readOnly: true,
      });
      container.readinessProbe = {
        httpGet: { path: "/", port: 8080 },
        periodSeconds: 5,
      };
      container.livenessProbe = {
        httpGet: { path: "/", port: 8080 },
        periodSeconds: 15,
      };
    }
    if (service === "postgres") {
      container.resources = {
        requests: { cpu: "100m", memory: "128Mi" },
        limits: { cpu: "1000m", memory: "384Mi" },
      };
      container.startupProbe = {
        exec: { command: ["pg_isready", "-U", "padel", "-d", "postgres"] },
        periodSeconds: 3,
        failureThreshold: 60,
      };
      container.readinessProbe = {
        exec: { command: ["pg_isready", "-U", "padel", "-d", "postgres"] },
        periodSeconds: 5,
      };
    }
    if (service === "rabbitmq") {
      container.resources = {
        requests: { cpu: "100m", memory: "128Mi" },
        limits: { cpu: "1000m", memory: "384Mi" },
      };
      env("RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS", "+S 2:2");
      container.startupProbe = {
        exec: { command: ["rabbitmq-diagnostics", "-q", "ping"] },
        periodSeconds: 5,
        timeoutSeconds: 5,
        failureThreshold: 36,
      };
      container.readinessProbe = {
        exec: { command: ["rabbitmq-diagnostics", "-q", "check_running"] },
        periodSeconds: 10,
        timeoutSeconds: 5,
      };
    }
    if (service === "mailpit") {
      container.resources = {
        requests: { cpu: "20m", memory: "32Mi" },
        limits: { cpu: "250m", memory: "96Mi" },
      };
      container.readinessProbe = {
        httpGet: { path: "/", port: 8025 },
        periodSeconds: 5,
      };
    }
    if (service === "keycloak") {
      env("KC_HOSTNAME", target.identityOrigin);
      env("KC_HEALTH_ENABLED", "true");
      env("KC_METRICS_ENABLED", "true");
      env("JAVA_OPTS_APPEND", "-Xms64m -Xmx256m -XX:ActiveProcessorCount=2");
      container.resources = {
        requests: { cpu: "100m", memory: "256Mi" },
        limits: { cpu: "1000m", memory: "640Mi" },
      };
      container.startupProbe = {
        httpGet: { path: "/health/started", port: 9000 },
        periodSeconds: 5,
        failureThreshold: 72,
      };
      container.readinessProbe = {
        httpGet: { path: "/health/ready", port: 9000 },
        periodSeconds: 5,
      };
      container.livenessProbe = {
        httpGet: { path: "/health/live", port: 9000 },
        periodSeconds: 15,
      };
    }
  }
  await writeFile(
    resolve(source, "resources.yml"),
    docs.map((d) => JSON.stringify(d, null, 2)).join("\n---\n") + "\n",
  );
  await writeFile(
    resolve(directory, "release-manifest.json"),
    JSON.stringify(release, null, 2) + "\n",
  );
  return { directory, source, target, release };
}
