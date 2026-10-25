import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { cpus, totalmem, platform, release } from "node:os";

const asyncExec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const runtime = resolve(root, ".runtime/performance");
const compose = ["compose", "-f", "infra/performance/compose.yml"];
const artifactsArg = process.argv.indexOf("--artifacts");
const artifacts =
  artifactsArg >= 0 ? resolve(root, process.argv[artifactsArg + 1]) : null;
const memberId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const uuid = (name) => {
  const hex = createHash("md5").update(name).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const save = (name, value) =>
  writeFileSync(resolve(runtime, name), JSON.stringify(value, null, 2) + "\n");
const docker = (args, input) =>
  execFileSync("docker", args, {
    cwd: root,
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
  });
const dc = (...args) => docker([...compose, ...args]);
function jfrToFile(args, path) {
  const fd = openSync(path, "w");
  const command =
    process.env.JFR_TOOL ||
    (process.env.JAVA_HOME
      ? resolve(
          process.env.JAVA_HOME,
          "bin",
          process.platform === "win32" ? "jfr.exe" : "jfr",
        )
      : "jfr");
  try {
    execFileSync(command, ["-J-Xmx256m", ...args], {
      cwd: root,
      stdio: ["ignore", fd, "pipe"],
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
  } finally {
    closeSync(fd);
  }
}
function sql(database, query) {
  if (
    !["padel_members", "padel_subscriptions", "padel_bookings"].includes(
      database,
    )
  )
    throw Error("Unexpected database");
  return docker(
    [
      ...compose,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "performance",
      "-d",
      database,
    ],
    query,
  ).trim();
}
function prepare() {
  mkdirSync(runtime, { recursive: true });
  const variant = artifacts
    ? readFileSync(resolve(artifacts, "variant.txt"), "utf8").trim()
    : "current-checkout";
  if (!["baseline", "optimized", "current-checkout"].includes(variant))
    throw Error("Unexpected artifact variant");
  const hashes = {};
  for (const service of ["member", "subscription", "booking"]) {
    const source = artifacts
      ? resolve(artifacts, `${service}.jar`)
      : resolve(
          root,
          `backend/${service}-service/target/${service}-service-1.0.0-SNAPSHOT.jar`,
        );
    hashes[service] = sha(source);
    copyFileSync(source, resolve(runtime, `${service}.jar`));
    if (service === "booking")
      copyFileSync(source, resolve(runtime, "baseline.jar"));
  }
  save("baseline-build.json", {
    createdAt: new Date().toISOString(),
    variant,
    jars: hashes,
    controller: sha(
      resolve(
        root,
        variant === "baseline"
          ? "infra/performance/baseline/CourtController.java"
          : "backend/booking-service/src/main/java/club/padel/booking/CourtController.java",
      ),
    ),
    repository: sha(
      resolve(
        root,
        "backend/booking-service/src/main/java/club/padel/booking/BookingRepository.java",
      ),
    ),
  });
  const info = JSON.parse(docker(["info", "--format", "{{json .}}"]));
  save("docker-host.json", {
    cpus: info.NCPU,
    memoryBytes: info.MemTotal,
    kernel: info.KernelVersion,
    operatingSystem: info.OperatingSystem,
    architecture: info.Architecture,
    serverVersion: info.ServerVersion,
    host: {
      cpuModel: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      platform: platform(),
      release: release(),
    },
  });
  console.log("Isolated baseline jars prepared.");
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const ids = dc(
        "ps",
        "-q",
        "member-service",
        "subscription-service",
        "booking-service",
      )
        .trim()
        .split(/\r?\n/);
      if (
        ids.length === 3 &&
        ids.every(
          (id) =>
            JSON.parse(docker(["inspect", id]))[0].State.Health?.Status ===
            "healthy",
        ) &&
        (
          await fetch(
            "http://localhost:9081/realms/performance/protocol/openid-connect/certs",
          )
        ).ok
      ) {
        console.log("Three isolated services are healthy.");
        return;
      }
    } catch {}
    await delay(2000);
  }
  throw Error(
    "Isolated services did not become healthy; inspect padel-performance logs.",
  );
}
// Club local dates are converted using the real Athens offset, including DST.
function datePlus(days) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
function athens(date, minute) {
  const utc = new Date(
    `${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00Z`,
  );
  const offsetName = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    timeZoneName: "shortOffset",
  })
    .formatToParts(utc)
    .find((part) => part.type === "timeZoneName").value;
  const offset = offsetName.match(/^GMT([+-])(\d+)(?::(\d+))?$/);
  if (!offset) throw Error("Unsupported Athens offset");
  const offsetMinutes =
    (Number(offset[2]) * 60 + Number(offset[3] || 0)) *
    (offset[1] === "+" ? 1 : -1);
  return new Date(utc.getTime() - offsetMinutes * 60000)
    .toISOString()
    .replace(".000Z", "Z");
}
async function seed() {
  const tokenResponse = await fetch(
    "http://localhost:9081/realms/performance/protocol/openid-connect/token",
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "performance-only",
        username: "performance-player",
        password: "isolated-performance-only",
      }),
    },
  );
  if (!tokenResponse.ok)
    throw Error(`Isolated token request failed: ${tokenResponse.status}`);
  const { access_token: token } = await tokenResponse.json();
  const subject = JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(subject)) throw Error("Unexpected subject");
  const date = datePlus(2),
    readCourt = uuid("read-court-1"),
    writeCourt = uuid("write-court"),
    contentionCourt = uuid("contention-court");
  sql(
    "padel_members",
    `INSERT INTO members VALUES ('${memberId}','${subject}','Performance Player','performance@example.invalid','123',true) ON CONFLICT(id) DO NOTHING;`,
  );
  sql(
    "padel_subscriptions",
    `INSERT INTO subscriptions VALUES ('${memberId}','${memberId}','ANNUAL',CURRENT_DATE-1,CURRENT_DATE+365,44900,'ACTIVE') ON CONFLICT(id) DO NOTHING;`,
  );
  sql(
    "padel_bookings",
    `
    TRUNCATE bookings, slot_waitlist, outbox_events, idempotency_requests CASCADE;
    INSERT INTO courts SELECT md5('read-court-'||i)::uuid, 'Performance '||i, 'OUTDOOR',2400,true FROM generate_series(1,40) i ON CONFLICT(id) DO NOTHING;
    INSERT INTO courts VALUES ('${writeCourt}','Write workload','OUTDOOR',2400,true),('${contentionCourt}','Contention workload','OUTDOOR',2400,true) ON CONFLICT(id) DO NOTHING;
    INSERT INTO bookings(id,court_id,member_id,member_name,starts_at,ends_at,players,status,price_cents)
      SELECT md5('confirmed-'||c||'-'||h)::uuid,md5('read-court-'||c)::uuid,md5('owner-'||c)::uuid,'Synthetic owner',
        ('${date}'::date + make_time(h,0,0)) AT TIME ZONE 'Europe/Athens',
        ('${date}'::date + make_time(h+1,0,0)) AT TIME ZONE 'Europe/Athens',4,'CONFIRMED',2400
      FROM generate_series(1,40) c CROSS JOIN generate_series(8,17) h;
    INSERT INTO bookings(id,court_id,member_id,member_name,starts_at,ends_at,players,status,price_cents)
      SELECT md5('cancelled-'||i)::uuid,md5('read-court-'||(1+i%40))::uuid,md5('cancel-owner-'||i)::uuid,'Cancelled synthetic owner',
        ('${date}'::date + make_time(8+i%10,0,0)) AT TIME ZONE 'Europe/Athens',
        ('${date}'::date + make_time(9+i%10,0,0)) AT TIME ZONE 'Europe/Athens',4,'CANCELLED',2400 FROM generate_series(1,20000) i;
    INSERT INTO bookings(id,court_id,member_id,member_name,starts_at,ends_at,players,status,price_cents)
      SELECT md5('history-'||i)::uuid,md5('read-court-'||(1+i%40))::uuid,md5('history-owner-'||i)::uuid,'Historical synthetic owner',
        CURRENT_DATE-(1+i%365)+TIME '08:00',CURRENT_DATE-(1+i%365)+TIME '09:00',4,'CANCELLED',2400 FROM generate_series(1,40000) i;
    VACUUM ANALYZE bookings; VACUUM ANALYZE booking_players;
  `,
  );
  const expectedSlots = [];
  for (let minute = 480; minute + 90 <= 1380; minute += 30)
    expectedSlots.push({
      courtId: readCourt,
      startsAt: athens(date, minute),
      endsAt: athens(date, minute + 90),
      available: minute >= 1080,
      priceCents: 3600,
    });
  const writeStarts = Array.from({ length: 120 }, (_, i) =>
    athens(datePlus(3 + Math.floor(i / 12)), 480 + (i % 12) * 60),
  );
  save("fixture.json", {
    token,
    subject,
    memberId,
    date,
    readCourt,
    writeCourt,
    contentionCourt,
    contentionStart: athens(datePlus(20), 600),
    writeStarts,
    expectedSlots,
  });
  save("dataset.json", {
    date,
    readCourt,
    totalBookings: 60400,
    dayBookings: 20400,
    confirmedPerReadCourt: 10,
    cancelledOnReadDay: 20000,
    historicalCancelled: 40000,
    syntheticReadCourts: 40,
    syntheticWriteCourts: 2,
    memberProfiles: 1,
    subscriptions: 1,
    ownerScheduleTriggerEnabled: true,
    seedSha256: sha(resolve(root, "scripts/performance.mjs")),
  });
  console.log(
    "Seeded 60,400 bookings in disposable PostgreSQL; core user data untouched.",
  );
}
function reset() {
  sql(
    "padel_bookings",
    `DELETE FROM bookings WHERE member_id='${memberId}'; TRUNCATE outbox_events,idempotency_requests;`,
  );
}
async function resources(samples) {
  try {
    const { stdout } = await asyncExec(
      "docker",
      ["stats", "--no-stream", "--format", "{{json .}}"],
      { cwd: root, timeout: 10000 },
    );
    samples.push({
      at: new Date().toISOString(),
      containers: stdout
        .trim()
        .split(/\r?\n/)
        .map((row) => JSON.parse(row))
        .filter((row) => row.Name.startsWith("padel-performance-")),
    });
  } catch (ex) {
    samples.push({
      at: new Date().toISOString(),
      error: ex.code || "stats-failed",
    });
  }
}
async function run(label, warmup = false) {
  if (!/^(baseline|optimized)-(warmup|[1-3])$/.test(label))
    throw Error("Use baseline/optimized plus warmup or 1..3");
  reset();
  const samples = [];
  const profile = !warmup;
  if (profile) {
    const started = dc(
      "exec",
      "-T",
      "booking-service",
      "jcmd",
      "1",
      "JFR.start",
      `name=${label}`,
      "settings=/config/performance.jfc",
      "disk=false",
      `filename=/tmp/${label}.jfr`,
    );
    if (!started.includes("Started recording"))
      throw Error("JFR did not start");
  }
  const startedAt = new Date().toISOString();
  let busy = false;
  const timer = setInterval(async () => {
    if (!busy) {
      busy = true;
      await resources(samples);
      busy = false;
    }
  }, 4000);
  let exitCode = 0;
  try {
    const { stdout } = await asyncExec(
      "docker",
      [
        ...compose,
        "run",
        "--rm",
        "-T",
        "k6",
        "run",
        "--quiet",
        "-e",
        `RUN_ID=${label}`,
        "-e",
        `WARMUP=${warmup}`,
        "-e",
        "DURATION=30s",
        "/scripts/workload.js",
      ],
      { cwd: root, timeout: 90000, maxBuffer: 1024 * 1024 },
    );
    if (stdout.trim()) console.log(stdout.trim());
  } catch (ex) {
    exitCode = Number(ex.code) || 1;
    writeFileSync(
      resolve(runtime, `${label}.error.log`),
      String(ex.stderr || "").replace(
        /Bearer [A-Za-z0-9._-]+/g,
        "Bearer [redacted]",
      ),
    );
    console.error(
      `k6 ${label} exited ${exitCode}; diagnostic saved under .runtime/performance.`,
    );
  } finally {
    clearInterval(timer);
  }
  await resources(samples);
  save(`${label}.observations.json`, { label, startedAt, exitCode, samples });
  if (profile) {
    dc(
      "exec",
      "-T",
      "booking-service",
      "jcmd",
      "1",
      "JFR.stop",
      `name=${label}`,
    );
    dc(
      "cp",
      `booking-service:/tmp/${label}.jfr`,
      resolve(runtime, `${label}.jfr`),
    );
    jfrToFile(
      [
        "print",
        "--json",
        "--stack-depth",
        "8",
        "--events",
        "jdk.ExecutionSample,jdk.GarbageCollection,jdk.GCHeapSummary",
        resolve(runtime, `${label}.jfr`),
      ],
      resolve(runtime, `${label}.jfr.json`),
    );
    jfrToFile(
      [
        "print",
        "--json",
        "--stack-depth",
        "1",
        "--events",
        "jdk.ObjectAllocationSample",
        resolve(runtime, `${label}.jfr`),
      ],
      resolve(runtime, `${label}.allocation.json`),
    );
  }
  const correctness = JSON.parse(
    sql(
      "padel_bookings",
      `SELECT json_build_object(
    'writtenBookings',(SELECT count(*) FROM bookings WHERE member_id='${memberId}'),
    'contentionBookings',(SELECT count(*) FROM bookings WHERE court_id='${uuid("contention-court")}' AND member_id='${memberId}'),
    'auditEntries',(SELECT count(*) FROM booking_changes),
    'outboxEvents',(SELECT count(*) FROM outbox_events),
    'idempotencyRecords',(SELECT count(*) FROM idempotency_requests),
    'courtOverlaps',(SELECT count(*) FROM bookings a JOIN bookings b ON a.id<b.id AND a.court_id=b.court_id AND a.status='CONFIRMED' AND b.status='CONFIRMED' AND a.starts_at<b.ends_at AND a.ends_at>b.starts_at),
    'playerOverlaps',(SELECT count(*) FROM booking_players a JOIN booking_players b ON a.id<b.id AND a.member_id=b.member_id AND a.status='ACCEPTED' AND b.status='ACCEPTED' AND a.starts_at<b.ends_at AND a.ends_at>b.starts_at));`,
    ),
  );
  const ids = dc("ps", "-q").trim().split(/\r?\n/);
  const inspected = JSON.parse(docker(["inspect", ...ids]));
  const limits = inspected.map((c) => ({
    service: c.Config.Labels["com.docker.compose.service"],
    image: c.Config.Image,
    imageId: c.Image,
    memoryBytes: c.HostConfig.Memory,
    nanoCpus: c.HostConfig.NanoCpus,
    oomKilled: c.State.OOMKilled,
    restarts: c.RestartCount,
  }));
  if (!warmup && exitCode === 0) {
    const summary = JSON.parse(
      readFileSync(resolve(runtime, `${label}.k6.json`)),
    );
    const value = (name, field) => summary.metrics[name]?.values[field] ?? 0;
    const expectedWrites =
      value("successful_bookings", "count") +
      value("contention_winners", "count");
    const valid =
      expectedWrites >= 31 &&
      expectedWrites <= 32 &&
      [
        "writtenBookings",
        "auditEntries",
        "outboxEvents",
        "idempotencyRecords",
      ].every((key) => correctness[key] === expectedWrites) &&
      correctness.contentionBookings === 1 &&
      correctness.courtOverlaps === 0 &&
      correctness.playerOverlaps === 0 &&
      limits.every((c) => !c.oomKilled && c.restarts === 0);
    if (!valid) {
      exitCode = 3;
      console.error(
        "Persisted SQL correctness or resource integrity check failed.",
      );
    }
  }
  const result = {
    label,
    startedAt,
    endedAt: new Date().toISOString(),
    exitCode,
    warmup,
    correctness,
    limits,
    samples,
    bookingJarSha256: sha(resolve(runtime, "booking.jar")),
    workloadSha256: sha(resolve(root, "infra/performance/workload.js")),
    configurationSha256: createHash("sha256")
      .update(
        [
          "infra/performance/compose.yml",
          "infra/performance/application.yml",
          "infra/performance/performance.jfc",
          "backend/config-repo/application.yml",
        ]
          .map((path) => sha(resolve(root, path)))
          .join(":"),
      )
      .digest("hex"),
    fixtureWithoutCredentialsSha256: createHash("sha256")
      .update(
        JSON.stringify({
          ...JSON.parse(readFileSync(resolve(runtime, "fixture.json"))),
          token: undefined,
        }),
      )
      .digest("hex"),
  };
  save(`${label}.run.json`, result);
  console.log(JSON.stringify({ label, exitCode, correctness }));
  if (exitCode !== 0) process.exitCode = exitCode;
}
function explain(label) {
  if (!["baseline", "optimized"].includes(label))
    throw Error("Unknown variant");
  reset();
  const { date, readCourt } = JSON.parse(
    readFileSync(resolve(runtime, "fixture.json")),
  );
  const time = `starts_at < ('${date}'::date+1)::timestamp AT TIME ZONE 'Europe/Athens' AND ends_at > '${date}'::date::timestamp AT TIME ZONE 'Europe/Athens'`;
  const query =
    label === "baseline"
      ? `SELECT * FROM bookings WHERE ${time} ORDER BY starts_at`
      : `SELECT starts_at,ends_at FROM bookings WHERE court_id='${readCourt}' AND status='CONFIRMED' AND ${time}`;
  const plans = Array.from(
    { length: 5 },
    () =>
      JSON.parse(
        sql(
          "padel_bookings",
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query};`,
        ),
      )[0],
  );
  const datasetCount = Number(
    sql("padel_bookings", "SELECT count(*) FROM bookings;"),
  );
  if (datasetCount !== 60400) throw Error("Unexpected dataset cardinality");
  save(`${label}.sql.json`, { query, plans, datasetCount });
  console.log(
    JSON.stringify({
      label,
      rows: plans.map((p) => p.Plan["Actual Rows"]),
      executionMs: plans.map((p) => p["Execution Time"]),
    }),
  );
}

const [command, label] = process.argv.slice(2);
if (command === "prepare") prepare();
else if (command === "ready") await ready();
else if (command === "seed") await seed();
else if (command === "run") await run(label, label?.endsWith("warmup"));
else if (command === "explain") explain(label);
else if (command === "install") {
  if (!["baseline", "optimized"].includes(label))
    throw Error("Unknown variant");
  const source =
    label === "baseline"
      ? resolve(runtime, "baseline.jar")
      : artifacts
        ? resolve(artifacts, "booking.jar")
        : resolve(
            root,
            "backend/booking-service/target/booking-service-1.0.0-SNAPSHOT.jar",
          );
  // Stop before replacing the bind-mounted file; never modify a running JVM's jar.
  dc("stop", "booking-service");
  copyFileSync(source, resolve(runtime, "booking.jar"));
  dc("up", "-d", "--force-recreate", "--no-deps", "booking-service");
  await ready();
} else
  throw Error(
    "Commands: prepare, ready, seed, run <variant-N|variant-warmup>, explain <variant>, install <variant>",
  );
