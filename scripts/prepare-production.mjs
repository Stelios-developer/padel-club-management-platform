import { readFile, writeFile, mkdir, stat, chmod } from "node:fs/promises";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  password,
  services,
  rabbitDefinition,
  productionRealm,
  caddyConfig,
} from "./operations/production-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf(key);
  return index < 0 ? fallback : args[index + 1];
};
const localTest = args.includes("--local-test");
const output = resolve(root, option("--output", ".runtime/production"));
if (
  !relative(root, output).startsWith(
    ".runtime" + (process.platform === "win32" ? "\\" : "/"),
  )
)
  throw new Error("Generated secrets must stay inside .runtime/");
try {
  await stat(output);
  throw new Error(
    "Output already exists. Existing secrets are never overwritten.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const webHost = option(
  "--web-origin",
  localTest ? "https://localhost:8443" : null,
);
const identityHost = option(
  "--identity-origin",
  localTest ? "https://localhost:8444" : null,
);
if (webHost && webHost === identityHost)
  throw new Error("Web and identity must use distinct HTTPS origins");
for (const origin of [webHost, identityHost]) {
  if (!origin)
    throw new Error(
      "Specify --web-origin and --identity-origin after obtaining a domain",
    );
  const parsed = new URL(origin);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== origin
  )
    throw new Error("Use an exact HTTPS origin without paths or credentials");
  if (!localTest && ["localhost", "127.0.0.1"].includes(parsed.hostname))
    throw new Error("Public mode requires real DNS hostnames");
}
const smtpHost = option("--smtp-host", localTest ? "mailpit" : null),
  smtpUser = option("--smtp-user", localTest ? "" : null),
  sender = option("--mail-from", localTest ? "club@padel.local" : null),
  alertsTo = option("--alerts-to", localTest ? "operations@padel.local" : null);
if (!smtpHost || smtpUser === null || !sender || !alertsTo)
  throw new Error("Specify SMTP host/user, mail sender and alert destination");
if (
  [smtpHost, smtpUser, sender, alertsTo].some((value) => /[\r\n]/.test(value))
)
  throw new Error("Invalid configuration value");
await mkdir(join(output, "secrets"), { recursive: true, mode: 0o700 });
if (process.platform === "win32")
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(root, "scripts/protect-secrets.ps1"),
      "-Path",
      output,
    ],
    { stdio: "inherit", windowsHide: true },
  );
const save = async (file, body, secret = false) => {
  const path = join(output, file);
  await writeFile(path, body, { flag: "wx", mode: secret ? 0o600 : 0o644 });
  if (secret && process.platform !== "win32") await chmod(path, 0o600);
};
const secretNames = [
  "postgres_admin",
  "keycloak_admin",
  "rabbit_password",
  "smtp_password",
  "backup_key",
  ...services.map((service) => "db_" + service),
];
const secretValues = Object.fromEntries(
  secretNames.map((name) => [name, password()]),
);
if (!localTest)
  secretValues.smtp_password = "REPLACE_WITH_SMTP_PROVIDER_PASSWORD";
for (const [name, value] of Object.entries(secretValues))
  await save("secrets/" + name, value, true);
const realm = productionRealm(
  JSON.parse(
    await readFile(join(root, "infra/keycloak/padel-realm.json"), "utf8"),
  ),
  webHost,
);
await save("padel-realm.json", JSON.stringify(realm, null, 2) + "\n");
await save(
  "app-config.json",
  JSON.stringify(
    {
      issuer: identityHost + "/realms/padel",
      clientId: "padel-web",
      apiBase: "",
    },
    null,
    2,
  ) + "\n",
);
await save("Caddyfile", caddyConfig({ webHost, identityHost, localTest }));
await save(
  "rabbit-definitions.json",
  JSON.stringify(rabbitDefinition(secretValues.rabbit_password), null, 2) +
    "\n",
  true,
);
await save(
  "rabbitmq.conf",
  "management.load_definitions = /etc/rabbitmq/definitions.json\n",
);
await save(
  "alertmanager.yml",
  `global:\n  smtp_smarthost: ${JSON.stringify(smtpHost + ":" + (localTest ? "1025" : "587"))}\n  smtp_from: ${JSON.stringify(sender)}\n  smtp_require_tls: ${!localTest}\n${localTest ? "" : `  smtp_auth_username: ${JSON.stringify(smtpUser)}\n  smtp_auth_password_file: /run/secrets/smtp_password\n`}route:\n  receiver: operations\n  group_by: [alertname, service]\n  group_wait: 30s\n  group_interval: 5m\n  repeat_interval: 4h\nreceivers:\n  - name: operations\n    email_configs:\n      - to: ${JSON.stringify(alertsTo)}\n        send_resolved: true\n`,
);
await save(
  "prometheus.yml",
  `global:\n  scrape_interval: 15s\nrule_files: [/etc/prometheus/alerts.yml]\nalerting:\n  alertmanagers:\n    - static_configs:\n        - targets: [alertmanager:9093]\nscrape_configs:\n  - job_name: padel-services\n    metrics_path: /actuator/prometheus\n    static_configs:\n      - targets: [api-gateway:8080, member-service:8080, subscription-service:8080, booking-service:8080, access-service:8080, notification-service:8080]\n    relabel_configs:\n      - source_labels: [__address__]\n        regex: '([^:]+):.*'\n        target_label: service\n        replacement: '$1'\n`,
);
const env = {
  WEB_ORIGIN: webHost,
  IDENTITY_ORIGIN: identityHost,
  SMTP_HOST: smtpHost,
  SMTP_USER: smtpUser,
  MAIL_FROM: sender,
  SMTP_PORT: localTest ? "1025" : "587",
  SMTP_AUTH: String(!localTest),
  SMTP_STARTTLS: String(!localTest),
};
await save(
  ".env",
  Object.entries(env)
    .map(([key, value]) => key + "=" + JSON.stringify(value))
    .join("\n") + "\n",
  true,
);
const rel = (path) => relative(output, join(root, path)).replaceAll("\\", "/");
const databaseServiceMap = {
  "member-service": "members",
  "subscription-service": "subscriptions",
  "booking-service": "bookings",
  "access-service": "access",
  "notification-service": "notifications",
};
let compose = `name: padel-production\nservices:\n  postgres:\n    image: postgres:17-alpine\n    environment:\n      POSTGRES_USER: padel_admin\n      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_admin\n      POSTGRES_DB: postgres\n    secrets: [postgres_admin, ${services.map((service) => "db_" + service).join(", ")}]\n    volumes:\n      - postgres-data:/var/lib/postgresql/data\n      - ${rel("infra/production/postgres-init.sh")}:/docker-entrypoint-initdb.d/01-init.sh:ro\n    healthcheck:\n      test: [CMD-SHELL, 'pg_isready -U padel_admin -d postgres']\n      interval: 5s\n      retries: 20\n    networks: [backplane]\n    restart: unless-stopped\n  rabbitmq:\n    image: rabbitmq:4.1-management-alpine\n    volumes:\n      - rabbit-data:/var/lib/rabbitmq\n      - ./rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro\n      - ./rabbit-definitions.json:/etc/rabbitmq/definitions.json:ro\n    healthcheck:\n      test: [CMD, rabbitmq-diagnostics, -q, ping]\n      interval: 10s\n      retries: 20\n    networks: [backplane]\n    restart: unless-stopped\n  keycloak:\n    image: quay.io/keycloak/keycloak:26.7.4\n    entrypoint: [/bin/bash, /opt/keycloak/prod-start.sh]\n    environment:\n      KC_DB: postgres\n      KC_DB_URL: jdbc:postgresql://postgres:5432/padel_identity\n      KC_DB_USERNAME: padel_identity\n      KC_BOOTSTRAP_ADMIN_USERNAME: bootstrap-admin\n      KC_HOSTNAME: \${IDENTITY_ORIGIN}\n      KC_HTTP_ENABLED: 'true'\n      KC_PROXY_HEADERS: xforwarded\n      KC_HEALTH_ENABLED: 'true'\n      JAVA_OPTS_APPEND: '-Xms128m -Xmx384m'\n      SMTP_HOST: \${SMTP_HOST}\n      SMTP_PORT: \${SMTP_PORT}\n      SMTP_USER: \${SMTP_USER}\n      SMTP_AUTH: \${SMTP_AUTH}\n      SMTP_STARTTLS: \${SMTP_STARTTLS}\n      MAIL_FROM: \${MAIL_FROM}\n    mem_limit: 768m\n    secrets: [db_identity, keycloak_admin, smtp_password]\n    volumes:\n      - ${rel("infra/production/keycloak-start.sh")}:/opt/keycloak/prod-start.sh:ro\n      - ./padel-realm.json:/opt/keycloak/data/import/padel-realm.json:ro\n      - ${rel("infra/keycloak/themes/padel")}:/opt/keycloak/themes/padel:ro\n      - ${rel("infra/production/keycloak-ready.sh")}:/opt/keycloak/prod-ready.sh:ro\n    healthcheck:\n      test: [CMD, /bin/bash, /opt/keycloak/prod-ready.sh]\n      interval: 10s\n      timeout: 5s\n      start_period: 60s\n      retries: 20\n    depends_on:\n      postgres: {condition: service_healthy}\n    networks: [backplane, egress]\n    restart: unless-stopped\n  config-server:\n    image: padel/config-server:local\n    volumes: [${rel("backend/config-repo")}:/app/config-repo:ro]\n    environment: {OTEL_TRACES_EXPORTER: none, JAVA_TOOL_OPTIONS: '-Xms64m -Xmx256m'}\n    mem_limit: 512m\n    healthcheck:\n      test: [CMD, wget, -q, -O, /dev/null, http://localhost:8888/actuator/health]\n      interval: 10s\n      start_period: 40s\n      retries: 20\n    networks: [backplane]\n    restart: unless-stopped\n  discovery-server:\n    image: padel/discovery-server:local\n    environment: {JAVA_TOOL_OPTIONS: '-Xms64m -Xmx256m'}\n    mem_limit: 512m\n    healthcheck:\n      test: [CMD, wget, -q, -O, /dev/null, http://localhost:8761/actuator/health]\n      interval: 10s\n      start_period: 40s\n      retries: 20\n    networks: [backplane]\n    restart: unless-stopped\n`;
for (const name of ["api-gateway", ...Object.keys(databaseServiceMap)]) {
  const db = databaseServiceMap[name];
  compose += `  ${name}:\n    image: padel/${name}:local\n    environment:\n      CONFIG_SERVER_URL: http://config-server:8888\n      SPRING_CONFIG_IMPORT: 'configserver:http://config-server:8888,configtree:/run/secrets/'\n      EUREKA_URL: http://discovery-server:8761/eureka/\n      DB_HOST: postgres\n      DB_USER: padel_${db || "unused"}\n      RABBIT_HOST: rabbitmq\n      RABBIT_USER: padel_app\n      SPRING_RABBITMQ_VIRTUAL_HOST: /padel\n      KEYCLOAK_ISSUER: \${IDENTITY_ORIGIN}/realms/padel\n      KEYCLOAK_JWK_URI: http://keycloak:8080/realms/padel/protocol/openid-connect/certs\n      OTEL_TRACES_EXPORTER: none\n      JAVA_TOOL_OPTIONS: '-Xms96m -Xmx384m'\n${name === "notification-service" ? `      SMTP_HOST: \${SMTP_HOST}\n      SMTP_PORT: \${SMTP_PORT}\n      SMTP_USER: \${SMTP_USER}\n      SMTP_AUTH: \${SMTP_AUTH}\n      SMTP_STARTTLS: \${SMTP_STARTTLS}\n      SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_REQUIRED: \${SMTP_STARTTLS}\n      PADEL_MAIL_FROM: \${MAIL_FROM}\n` : ""}    mem_limit: 768m\n    secrets:\n${db ? `      - source: db_${db}\n        target: DB_PASSWORD\n` : ""}      - source: rabbit_password\n        target: RABBIT_PASSWORD\n${name === "notification-service" ? `      - source: smtp_password\n        target: SMTP_PASSWORD\n` : ""}    depends_on:\n      config-server: {condition: service_healthy}\n      discovery-server: {condition: service_healthy}\n      postgres: {condition: service_healthy}\n      rabbitmq: {condition: service_healthy}\n      keycloak: {condition: service_healthy}\n    healthcheck:\n      test: [CMD, wget, -q, -O, /dev/null, http://localhost:8080/actuator/health/liveness]\n      interval: 15s\n      start_period: 100s\n      retries: 12\n    networks: [backplane${name === "notification-service" ? ", egress" : ""}]\n    restart: unless-stopped\n`;
}
compose += `  web:\n    image: padel/web:local\n    volumes: [./app-config.json:/usr/share/nginx/html/app-config.json:ro]\n    networks: [backplane]\n    restart: unless-stopped\n  caddy:\n    image: caddy:2.10.2-alpine\n    ports: [${localTest ? "127.0.0.1:8443:8443, 127.0.0.1:8444:8444" : "80:80, 443:443, 443:443/udp"}]\n    volumes: [./Caddyfile:/etc/caddy/Caddyfile:ro, caddy-data:/data, caddy-config:/config]\n    networks: [backplane, egress]\n    restart: unless-stopped\n  prometheus:\n    image: prom/prometheus:v3.5.0\n    volumes:\n      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro\n      - ${rel("infra/production/alerts.yml")}:/etc/prometheus/alerts.yml:ro\n      - prometheus-data:/prometheus\n    networks: [backplane]\n    restart: unless-stopped\n  alertmanager:\n    image: prom/alertmanager:v0.28.1\n    secrets: [smtp_password]\n    volumes: [./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro, alertmanager-data:/alertmanager]\n    networks: [backplane, egress]\n    restart: unless-stopped\n`;
if (localTest)
  compose += `  mailpit:\n    image: axllent/mailpit:v1.27\n    networks: [backplane]\n    restart: unless-stopped\n`;
compose += `networks:\n  backplane: {internal: true}\n  egress: {}\nvolumes:\n  postgres-data: {}\n  rabbit-data: {}\n  caddy-data: {}\n  caddy-config: {}\n  prometheus-data: {}\n  alertmanager-data: {}\nsecrets:\n`;
for (const name of secretNames.filter((name) => name !== "backup_key"))
  compose += `  ${name}:\n    file: ./secrets/${name}\n`;
await save("compose.yml", compose);
await save(
  "manifest.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      localTest,
      webHost,
      identityHost,
      secretFiles: secretNames.map((name) => "secrets/" + name),
      smtpPasswordConfigured: localTest,
    },
    null,
    2,
  ) + "\n",
);
console.log("Prepared isolated deployment bundle: " + relative(root, output));
console.log(
  localTest
    ? "Local test mode: TLS uses a private test CA; SMTP uses Mailpit."
    : "Before deployment: replace secrets/smtp_password with the SMTP provider credential.",
);
