import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  options,
  composeArgs,
  processResult,
  textCommand,
} from "./operations/backup.mjs";
const config = options();
assert.equal(config.project, "padel-production-check");
const results = [];
async function docker(args, input) {
  const child = spawn("docker", [...composeArgs(config), ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    }),
    done = processResult(child),
    chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stdin.end(input);
  await done;
  return Buffer.concat(chunks).toString().trim();
}
const internal = (url) =>
  docker(["exec", "-T", "web", "wget", "-q", "-O", "-", url]);
const sql = (database, statement) =>
  textCommand(config, [
    "psql",
    "-XAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    config.user,
    "-d",
    database,
    "-c",
    statement,
  ]);
async function until(check, timeout = 90000) {
  const deadline = Date.now() + timeout;
  let error;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (e) {
      error = e;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw error || new Error("Deployment check timed out");
}
async function service(name, database) {
  await docker(["up", "-d", "--no-deps", name]);
  await until(
    async () =>
      JSON.parse(
        await internal("http://" + name + ":8080/actuator/health/liveness"),
      ).status === "UP",
  );
  if (database) {
    assert.ok(
      Number(
        await sql(
          database,
          `SELECT count(*) FROM pg_stat_activity WHERE usename='${database}' AND datname='${database}';`,
        ),
      ) > 0,
    );
    assert.equal(
      await sql(
        database,
        `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner<>'${database}';`,
      ),
      "0",
    );
    const metrics = await internal(
      "http://" + name + ":8080/actuator/prometheus",
    );
    assert.match(metrics, /padel_outbox_pending /);
  }
  if (name === "booking-service")
    assert.equal(
      await sql(
        database,
        "SELECT count(*) FROM pg_constraint WHERE contype='x' AND convalidated AND NOT condeferrable;",
      ),
      "2",
    );
  results.push({
    service: name,
    healthy: true,
    databaseRole: database || null,
    migrationsWithRestrictedOwner: Boolean(database),
  });
  console.log("PASS " + name + " with production configuration");
}
await service("notification-service", "padel_notifications");
const failed = randomUUID(),
  pending = randomUUID(),
  event = randomUUID();
let brokerStopped = false;
try {
  await docker(["stop", "rabbitmq"]);
  brokerStopped = true;
  await sql(
    "padel_notifications",
    `INSERT INTO notifications(id,member_id,email,title,detail,status,attempts,created_at,next_attempt_at) VALUES ('${failed}','${randomUUID()}','operations@padel.local','Deployment fixture','Local test','FAILED',5,NOW()-INTERVAL '20 minutes',NOW()), ('${pending}','${randomUUID()}','operations@padel.local','Deployment fixture','Local test','PENDING',0,NOW()-INTERVAL '20 minutes',NOW()+INTERVAL '1 day'); INSERT INTO outbox_events(id,routing_key,payload,created_at) VALUES ('${event}','deployment.check','{}',NOW()-INTERVAL '10 minutes');`,
  );
  await until(async () => {
    const data = await internal(
      "http://notification-service:8080/actuator/prometheus",
    );
    return (
      /padel_mail_failed 1\.0/.test(data) &&
      /padel_mail_pending 1\.0/.test(data) &&
      /padel_outbox_pending 1\.0/.test(data) &&
      /padel_mail_oldest_age_seconds 1[2-9]\d\d\./.test(data)
    );
  });
  console.log(
    "PASS real failure/delay metrics; waiting for unchanged production alert timers",
  );
  await until(async () => {
    const messages = JSON.parse(
      await internal("http://mailpit:8025/api/v1/messages"),
    );
    return ["PadelEmailFailed", "PadelEventsDelayed"].every((name) =>
      messages.messages.some(
        (message) =>
          message.Subject.includes(name) &&
          message.To.some(
            (recipient) => recipient.Address === "operations@padel.local",
          ),
      ),
    );
  }, 260000);
  console.log("PASS database metrics → Prometheus → Alertmanager → local SMTP");
} finally {
  await sql(
    "padel_notifications",
    `DELETE FROM notifications WHERE id IN ('${failed}','${pending}'); DELETE FROM outbox_events WHERE id='${event}';`,
  );
  if (brokerStopped) await docker(["start", "rabbitmq"]);
}
await docker(["stop", "notification-service"]);
for (const [name, database] of [
  ["member-service", "padel_members"],
  ["subscription-service", "padel_subscriptions"],
  ["booking-service", "padel_bookings"],
  ["access-service", "padel_access"],
  ["api-gateway", null],
]) {
  try {
    await service(name, database);
  } finally {
    await docker(["stop", name]);
  }
}
await writeFile(
  config.get(
    "--report",
    "docs/results/production/production-service-results.json",
  ),
  JSON.stringify(
    {
      completed: true,
      verifiedAt: new Date().toISOString(),
      project: config.project,
      services: results,
      realMetricsVerified: true,
      alertPipelineDelivered: ["PadelEmailFailed", "PadelEventsDelayed"],
      fixtureCleanup: true,
      execution:
        "Services started sequentially to keep the existing development stack available",
    },
    null,
    2,
  ) + "\n",
);
