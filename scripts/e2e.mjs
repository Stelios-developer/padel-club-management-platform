// Real HTTP/OIDC, PostgreSQL, RabbitMQ and SMTP checks. No mocked services.
// Run ONLY against the dedicated padel-e2e Compose project (see docs/E2E.md).
import assert from "node:assert/strict";
import { notificationCopy } from "../web/ui/notifications.js";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { today, addDays, athensInstant } from "../web/utils.js";
import { verifyPadel } from "./e2e/padel.mjs";
import { verifyReception } from "./e2e/reception.mjs";

const exec = promisify(execFile);
const root = new URL("../", import.meta.url);
const settings = Object.fromEntries(
  (await readFile(new URL("../.env.example", import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const issuer = "http://localhost:8081/realms/padel";
const base = "http://localhost:3000";
const project = "padel-e2e";
const resilience = process.argv.includes("--resilience");
const runId = Date.now().toString(36) + randomBytes(3).toString("hex");
const results = [],
  users = [],
  clients = [],
  bookings = [],
  subscriptions = [];
const databaseBookings = [];
let databaseBase, databaseAdjacent, databaseOther;
let admin,
  member,
  stranger,
  profile,
  otherProfile,
  court,
  booking,
  liveBooking,
  subscription;
const subscriptionKey = randomUUID(),
  rollbackKey = randomUUID(),
  replayBookingKey = randomUUID();
let subscriptionBody, replayBookingBody, replayBooking;
let infraTouched = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function http(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}
async function compose(...args) {
  const result = await exec(
    "docker",
    ["compose", "--env-file", ".env.example", "-p", project, ...args],
    { cwd: root, timeout: 180000, maxBuffer: 2 * 1024 * 1024 },
  );
  return result.stdout.trim();
}
async function sql(db, query) {
  assert(
    [
      "padel_members",
      "padel_bookings",
      "padel_subscriptions",
      "padel_notifications",
      "padel_access",
    ].includes(db),
  );
  return compose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-U",
    settings.DB_USER,
    "-d",
    db,
    "-At",
    "-c",
    query,
  );
}
function databaseBooking(
  start,
  end,
  status = "CONFIRMED",
  courtId = court.id,
  memberId = profile.id,
) {
  const id = randomUUID();
  databaseBookings.push(id);
  return {
    id,
    query: `INSERT INTO bookings (id,court_id,member_id,member_name,starts_at,ends_at,players,status,price_cents) VALUES ('${id}','${courtId}','${memberId}','DB exclusion ${runId}','${start}','${end}',4,'${status}',2400);`,
  };
}
function assertExcluded(error) {
  assert.match(
    error.stderr || "",
    /\b23P01\b/,
    "PostgreSQL must report exclusion_violation",
  );
  assert.match(error.stderr, /bookings_no_confirmed_overlap/);
  return true;
}
async function until(check, description, timeout = 90000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error.message;
    }
    await sleep(1500);
  }
  throw new Error(`Timed out: ${description}${last ? ` (${last})` : ""}`);
}
async function test(name, work) {
  const started = Date.now();
  try {
    await work();
    results.push({ name, passed: true, durationMs: Date.now() - started });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      durationMs: Date.now() - started,
      error: error.message,
    });
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}
function form(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  };
}
async function masterToken() {
  const response = await http(
    "http://localhost:8081/realms/master/protocol/openid-connect/token",
    form({
      grant_type: "password",
      client_id: "admin-cli",
      username: settings.KEYCLOAK_ADMIN,
      password: settings.KEYCLOAK_ADMIN_PASSWORD,
    }),
  );
  assert.equal(response.status, 200, "Keycloak bootstrap admin login");
  return response.data.access_token;
}
async function identityAdmin(path, method = "GET", body) {
  return http("http://localhost:8081/admin/realms/padel" + path, {
    method,
    headers: {
      Authorization: "Bearer " + (await masterToken()),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function createUser(suffix, staff = false) {
  const username = `e2e-${runId}-${suffix}`,
    password = randomBytes(20).toString("base64url") + "aA1!";
  const response = await identityAdmin("/users", "POST", {
    username,
    email: username + "@padel.local",
    enabled: true,
    emailVerified: true,
    firstName: "E2E",
    lastName: suffix,
    credentials: [{ type: "password", value: password, temporary: false }],
  });
  assert.equal(response.status, 201, "Create isolated test identity");
  const id = response.headers.get("location").split("/").at(-1);
  users.push(id);
  if (staff) {
    const role = await identityAdmin("/roles/ADMIN");
    assert.equal(role.status, 200);
    assert.equal(
      (
        await identityAdmin(`/users/${id}/role-mappings/realm`, "POST", [
          role.data,
        ])
      ).status,
      204,
    );
  }
  const stored = await identityAdmin(`/users/${id}`);
  assert.equal(stored.status, 200);
  return {
    username: stored.data.username,
    password,
    email: stored.data.email,
    id,
  };
}
async function authorize(user, withChallenge = true, clientId = "padel-web") {
  const verifier = randomBytes(48).toString("base64url"),
    state = randomUUID();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: base + "/",
    response_type: "code",
    scope: "openid profile email",
    state,
  });
  if (withChallenge) {
    query.set("code_challenge_method", "S256");
    query.set(
      "code_challenge",
      createHash("sha256").update(verifier).digest("base64url"),
    );
  }
  const jar = new Map();
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: {
        ...options.headers,
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return response;
  };
  let response = await request(
    issuer + "/protocol/openid-connect/auth?" + query,
  );
  if (!withChallenge)
    return {
      status: response.status,
      body: await response.text(),
      location: response.headers.get("location"),
    };
  assert.equal(response.status, 200, "OIDC login form");
  const html = await response.text();
  const action = html
    .match(/<form[^>]+action="([^"]+)"/)?.[1]
    ?.replaceAll("&amp;", "&");
  assert(action, "Keycloak login action must be present");
  response = await request(
    action,
    form({
      username: user.username,
      password: user.password,
      credentialId: "",
    }),
  );
  if (response.status !== 302) {
    const page = await response.text();
    const heading = page
      .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]
      ?.replace(/<[^>]*>/g, "")
      .trim();
    const feedback = [
      ...page.matchAll(/(?:kc-feedback-text|input-error)[^>]*>([^<]*)</g),
    ]
      .map((m) => m[1].trim())
      .join(" ");
    assert.equal(
      response.status,
      302,
      `Login must issue authorization code (${heading || ""} ${feedback})`,
    );
  }
  const callback = new URL(response.headers.get("location"));
  assert.equal(callback.origin, base);
  assert.equal(callback.searchParams.get("state"), state);
  assert(callback.searchParams.get("code"), "Authorization code is required");
  return { code: callback.searchParams.get("code"), verifier };
}
async function exchange(code, verifier, clientId = "padel-web") {
  return http(
    issuer + "/protocol/openid-connect/token",
    form({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: base + "/",
      code,
      code_verifier: verifier,
    }),
  );
}
async function login(user) {
  const authorization = await authorize(user),
    response = await exchange(authorization.code, authorization.verifier);
  assert.equal(response.status, 200, "Code + PKCE token exchange");
  return {
    ...user,
    ...response.data,
    expiresAt: Date.now() + response.data.expires_in * 1000,
  };
}
async function api(
  identity,
  path,
  method = "GET",
  body,
  language = "el-GR",
  idempotencyKey = randomUUID(),
) {
  if (identity && Date.now() > identity.expiresAt - 30000) {
    const refreshed = await http(
      issuer + "/protocol/openid-connect/token",
      form({
        grant_type: "refresh_token",
        client_id: "padel-web",
        refresh_token: identity.refresh_token,
      }),
    );
    assert.equal(refreshed.status, 200);
    Object.assign(identity, refreshed.data, {
      expiresAt: Date.now() + refreshed.data.expires_in * 1000,
    });
  }
  return http(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": language,
      ...(method === "POST" &&
      (["/api/bookings", "/api/subscriptions", "/api/padel/series"].includes(
        path,
      ) ||
        /^\/api\/bookings\/[^/]+\/move$/.test(path)) &&
      idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : {}),
      ...(identity ? { Authorization: "Bearer " + identity.access_token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const date = addDays(today(), 2);
const bookingRequest = (hour = "16:00", courtId = court.id) => ({
  courtId,
  startsAt: athensInstant(date, hour),
  durationMinutes: 60,
  players: 4,
});
async function book(hour = "16:00") {
  const key = randomUUID(),
    body = bookingRequest(hour);
  // Registry/Feign caches can still be converging after a deliberate restart. Retry the SAME intent.
  const response = await until(
    async () => {
      const result = await api(
        member,
        "/api/bookings",
        "POST",
        body,
        "el-GR",
        key,
      );
      return result.status >= 500 ? false : result;
    },
    "Booking request after restart",
    180000,
  );
  assert.equal(response.status, 200, JSON.stringify(response.data));
  bookings.push(response.data.id);
  return response.data;
}
async function notificationsWith(title, timeout) {
  return until(
    async () => {
      const response = await api(member, "/api/notifications");
      return (
        response.status === 200 &&
        response.data.find((n) => n.title === title && n.status === "SENT")
      );
    },
    `Delivered notification '${title}'`,
    timeout,
  );
}
async function mailFor(notification) {
  const response = await http(
    "http://localhost:8025/api/v1/search?query=" +
      encodeURIComponent("to:" + member.email),
  );
  assert.equal(response.status, 200);
  return response.data.messages?.find(
    (m) => m.Subject === notificationCopy(notification).title,
  );
}
async function publish(event) {
  const response = await http(
    "http://localhost:15672/api/exchanges/%2F/padel.events/publish",
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${settings.RABBIT_USER}:${settings.RABBIT_PASSWORD}`,
          ).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: { delivery_mode: 2, content_type: "application/json" },
        routing_key: event.type,
        payload: JSON.stringify(event),
        payload_encoding: "string",
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.data.routed, true);
}

try {
  // Verify project ownership before the optional stop/restart operations.
  const container = await compose("ps", "-q", "postgres");
  assert(container, "Start padel-e2e Compose first");
  const inspection = JSON.parse(
    (await exec("docker", ["inspect", container], { cwd: root })).stdout,
  )[0];
  assert.equal(inspection.Config.Labels["com.docker.compose.project"], project);
  await test("Real stack readiness and web proxy", async () => {
    await until(
      async () =>
        (await http(issuer + "/.well-known/openid-configuration")).status ===
        200,
      "Keycloak ready",
      180000,
    );
    assert.equal((await http(base + "/")).status, 200);
    assert.equal((await http(base + "/app-config.json")).data.issuer, issuer);
  });
  await test("Keycloak authorization code + S256 PKCE, issuer, audience and roles", async () => {
    member = await login(await createUser("member"));
    stranger = await login(await createUser("other"));
    admin = await login(await createUser("admin", true));
    const claims = JSON.parse(
      Buffer.from(member.access_token.split(".")[1], "base64url"),
    );
    assert.equal(claims.iss, issuer);
    assert.equal(claims.sub, member.id);
    assert([claims.aud].flat().includes("padel-api"));
    assert(claims.realm_access.roles.includes("MEMBER"));
    const adminClaims = JSON.parse(
      Buffer.from(admin.access_token.split(".")[1], "base64url"),
    );
    assert(adminClaims.realm_access.roles.includes("ADMIN"));
    await until(
      async () =>
        (await api(member, "/api/subscriptions/plans")).status === 200,
      "Gateway discovery and routes",
      180000,
    );
  });
  await test("PKCE required, wrong verifier rejected and authorization code single-use", async () => {
    const missing = await authorize(member, false);
    assert(
      missing.status >= 400 ||
        new URL(missing.location).searchParams.has("error"),
      "No challenge must be rejected",
    );
    const wrong = await authorize(member);
    assert.equal(
      (await exchange(wrong.code, randomBytes(48).toString("base64url")))
        .status,
      400,
    );
    const valid = await authorize(member);
    assert.equal((await exchange(valid.code, valid.verifier)).status, 200);
    assert.equal((await exchange(valid.code, valid.verifier)).status, 400);
  });
  await test("Anonymous and tampered JWT rejected; member password grant disabled", async () => {
    assert.equal((await api(null, "/api/courts")).status, 401);
    const parts = member.access_token.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    assert.equal(
      (
        await api(
          { access_token: parts.join("."), expiresAt: Infinity },
          "/api/courts",
        )
      ).status,
      401,
    );
    const response = await http(
      issuer + "/protocol/openid-connect/token",
      form({
        client_id: "padel-web",
        grant_type: "password",
        username: member.username,
        password: member.password,
      }),
    );
    assert.equal(response.status, 400);
  });
  await test("Real refresh token produces a usable API token", async () => {
    member.expiresAt = 0;
    assert.equal((await api(member, "/api/subscriptions/plans")).status, 200);
  });
  await test("Real tokens with wrong issuer or missing padel-api audience rejected", async () => {
    assert.equal(
      (
        await api(
          { access_token: await masterToken(), expiresAt: Infinity },
          "/api/courts",
        )
      ).status,
      401,
    );
    const clientId = `e2e-no-audience-${runId}`;
    const created = await identityAdmin("/clients", "POST", {
      clientId,
      enabled: true,
      protocol: "openid-connect",
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: [base + "/"],
      defaultClientScopes: ["basic", "profile", "email", "roles"],
      attributes: { "pkce.code.challenge.method": "S256" },
    });
    assert.equal(created.status, 201);
    clients.push(created.headers.get("location").split("/").at(-1));
    const code = await authorize(member, true, clientId),
      response = await exchange(code.code, code.verifier, clientId);
    assert.equal(response.status, 200);
    const claims = JSON.parse(
      Buffer.from(response.data.access_token.split(".")[1], "base64url"),
    );
    assert.equal(claims.iss, issuer);
    assert(![claims.aud].flat().includes("padel-api"));
    assert.equal(
      (
        await api(
          { access_token: response.data.access_token, expiresAt: Infinity },
          "/api/courts",
        )
      ).status,
      401,
    );
  });
  await test("Real Keycloak token without subject rejected before profile creation", async () => {
    const clientId = `e2e-no-subject-${runId}`;
    const created = await identityAdmin("/clients", "POST", {
      clientId,
      enabled: true,
      protocol: "openid-connect",
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: [base + "/"],
      defaultClientScopes: ["profile", "email", "roles"],
      attributes: { "pkce.code.challenge.method": "S256" },
      protocolMappers: [
        {
          name: "padel-api-audience",
          protocol: "openid-connect",
          protocolMapper: "oidc-audience-mapper",
          config: {
            "included.custom.audience": "padel-api",
            "id.token.claim": "false",
            "access.token.claim": "true",
          },
        },
      ],
    });
    assert.equal(created.status, 201);
    clients.push(created.headers.get("location").split("/").at(-1));
    const code = await authorize(member, true, clientId),
      response = await exchange(code.code, code.verifier, clientId);
    assert.equal(response.status, 200);
    const claims = JSON.parse(
      Buffer.from(response.data.access_token.split(".")[1], "base64url"),
    );
    assert.equal(claims.iss, issuer);
    assert([claims.aud].flat().includes("padel-api"));
    assert.equal(claims.sub, undefined);
    assert.equal(
      (
        await api(
          { access_token: response.data.access_token, expiresAt: Infinity },
          "/api/members/me",
          "PUT",
          { fullName: "Rejected", phone: "123" },
        )
      ).status,
      401,
    );
  });
  await test("Member onboarding, PostgreSQL persistence and identity email", async () => {
    assert.equal((await api(member, "/api/members/me")).status, 404);
    const response = await api(member, "/api/members/me", "PUT", {
      fullName: `E2E Player ${runId}`,
      phone: "+30 690 000 0000",
      email: "forged@example.com",
    });
    assert.equal(response.status, 200);
    profile = response.data;
    assert.equal(profile.email, member.email);
    assert.equal(profile.subject, member.id);
    assert.equal(
      await sql(
        "padel_members",
        `SELECT count(*) FROM members WHERE id='${profile.id}' AND email='${member.email}';`,
      ),
      "1",
    );
    const other = await api(stranger, "/api/members/me", "PUT", {
      fullName: `Other Player ${runId}`,
      phone: "+30 690 000 0001",
    });
    assert.equal(other.status, 200);
    otherProfile = other.data;
  });
  await test("Member ownership and staff-only APIs enforced across services", async () => {
    for (const path of [
      "/api/members",
      "/api/access/audit",
      `/api/members/${profile.id}`,
      `/api/subscriptions?memberId=${profile.id}`,
    ]) {
      assert.equal((await api(stranger, path)).status, 403, path);
    }
    assert.equal(
      (
        await api(member, "/api/subscriptions", "POST", {
          memberId: profile.id,
          plan: "MONTHLY",
          startsOn: today(),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api(member, `/api/members/${profile.id}/enabled`, "PATCH", {
          enabled: false,
        })
      ).status,
      403,
    );
    assert.equal((await api(admin, "/api/members")).status, 200);
  });
  await test("Inactive subscription blocks a booking; staff activation enables it", async () => {
    const courts = await api(member, "/api/courts");
    assert.equal(courts.status, 200);
    assert.equal(courts.data.length, 3);
    court = courts.data.find((c) => c.enabled);
    assert.equal(
      (
        await api(
          member,
          "/api/bookings",
          "POST",
          bookingRequest("08:00"),
          "el-GR",
          rollbackKey,
        )
      ).status,
      409,
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM idempotency_requests WHERE request_key='${rollbackKey}';`,
      ),
      "0",
    );
    subscriptionBody = {
      memberId: profile.id,
      plan: "MONTHLY",
      startsOn: today(),
    };
    const activations = await Promise.all(
      Array.from({ length: 8 }, () =>
        api(
          admin,
          "/api/subscriptions",
          "POST",
          subscriptionBody,
          "el-GR",
          subscriptionKey,
        ),
      ),
    );
    for (const response of activations)
      if (response.status === 200 && !subscriptions.includes(response.data.id))
        subscriptions.push(response.data.id);
    const activated = activations[0];
    assert.equal(activated.status, 200, JSON.stringify(activated.data));
    subscription = activated.data;
    for (const response of activations) {
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.deepEqual(response.data, subscription);
    }
    assert.equal(
      (
        await api(
          member,
          `/api/subscriptions/eligibility/${profile.id}?date=${date}`,
        )
      ).data.eligible,
      true,
    );
    assert.equal(
      await sql(
        "padel_subscriptions",
        `SELECT count(*) FROM subscriptions WHERE id='${subscription.id}' AND status='ACTIVE';`,
      ),
      "1",
    );
  });
  await test("Missing or malformed idempotency headers reject both mutations without writing", async () => {
    for (const key of [null, "not-a-uuid"]) {
      assert.equal(
        (
          await api(
            admin,
            "/api/subscriptions",
            "POST",
            subscriptionBody,
            "el-GR",
            key,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await api(
            member,
            "/api/bookings",
            "POST",
            bookingRequest("08:00"),
            "el-GR",
            key,
          )
        ).status,
        400,
      );
    }
    assert.equal(
      await sql(
        "padel_subscriptions",
        `SELECT count(*) FROM subscriptions WHERE member_id='${profile.id}';`,
      ),
      "1",
    );
  });
  await test("Eight subscription retries return the original purchase and send one event", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        api(
          admin,
          "/api/subscriptions",
          "POST",
          {
            startsOn: subscriptionBody.startsOn,
            plan: subscriptionBody.plan,
            memberId: subscriptionBody.memberId,
          },
          "el-GR",
          subscriptionKey,
        ),
      ),
    );
    for (const response of responses) {
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.deepEqual(response.data, subscription);
    }
    assert.equal(
      await sql(
        "padel_subscriptions",
        `SELECT count(*) FROM subscriptions WHERE member_id='${profile.id}';`,
      ),
      "1",
    );
    await notificationsWith("Subscription activated");
    assert.equal(
      await sql(
        "padel_notifications",
        `SELECT count(*) FROM notifications WHERE member_id='${profile.id}' AND title='Subscription activated';`,
      ),
      "1",
    );
  });
  await test("Changed subscription payload conflicts; a member cannot replay a staff purchase", async () => {
    assert.equal(
      (
        await api(
          admin,
          "/api/subscriptions",
          "POST",
          { ...subscriptionBody, plan: "ANNUAL" },
          "el-GR",
          subscriptionKey,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await api(
          member,
          "/api/subscriptions",
          "POST",
          subscriptionBody,
          "el-GR",
          subscriptionKey,
        )
      ).status,
      403,
    );
  });
  await test("A rejected booking rolls its key back and can succeed after subscription activation", async () => {
    const response = await api(
      member,
      "/api/bookings",
      "POST",
      bookingRequest("08:00"),
      "el-GR",
      rollbackKey,
    );
    assert.equal(response.status, 200, JSON.stringify(response.data));
    bookings.push(response.data.id);
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM idempotency_requests WHERE request_key='${rollbackKey}' AND response IS NOT NULL;`,
      ),
      "1",
    );
  });
  await test("Eight concurrent retries create one booking, one outbox event and one notification", async () => {
    replayBookingBody = bookingRequest("09:00");
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        api(
          member,
          "/api/bookings",
          "POST",
          replayBookingBody,
          "el-GR",
          replayBookingKey,
        ),
      ),
    );
    for (const response of responses)
      if (response.status === 200 && !bookings.includes(response.data.id))
        bookings.push(response.data.id);
    replayBooking = responses[0].data;
    for (const response of responses) {
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.deepEqual(response.data, replayBooking);
    }
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE member_id='${profile.id}' AND court_id='${court.id}' AND starts_at='${replayBooking.startsAt}';`,
      ),
      "1",
    );
    await until(async () => {
      const response = await api(member, "/api/notifications");
      return (
        response.status === 200 &&
        response.data.find(
          (n) =>
            n.title === "Your court is booked" &&
            n.detail.includes(`${date}T09:00`) &&
            n.status === "SENT",
        )
      );
    }, "One booking notification delivered");
    assert.equal(
      await sql(
        "padel_notifications",
        `SELECT count(*) FROM notifications WHERE member_id='${profile.id}' AND title='Your court is booked' AND detail LIKE '%${date}T09:00%';`,
      ),
      "1",
    );
  });
  await test("Booking key rejects changed payload and never replays across users", async () => {
    assert.equal(
      (
        await api(
          member,
          "/api/bookings",
          "POST",
          { ...replayBookingBody, players: 2 },
          "el-GR",
          replayBookingKey,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await api(
          stranger,
          "/api/bookings",
          "POST",
          replayBookingBody,
          "el-GR",
          replayBookingKey,
        )
      ).status,
      409,
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM idempotency_requests WHERE request_key='${replayBookingKey}';`,
      ),
      "1",
    );
  });
  await test("Cancelled booking replay returns the original response without recreating it", async () => {
    assert.equal(
      (await api(member, `/api/bookings/${replayBooking.id}`, "DELETE")).status,
      200,
    );
    const replay = await api(
      member,
      "/api/bookings",
      "POST",
      replayBookingBody,
      "el-GR",
      replayBookingKey,
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data, replayBooking);
    assert.equal(
      (await api(member, `/api/bookings/${replayBooking.id}`)).data.status,
      "CANCELLED",
    );
  });
  await test("Eight concurrent PostgreSQL booking requests allow exactly one winner", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        api(member, "/api/bookings", "POST", bookingRequest()),
      ),
    );
    assert.deepEqual(
      responses.map((r) => r.status).sort(),
      [200, 409, 409, 409, 409, 409, 409, 409],
    );
    booking = responses.find((r) => r.status === 200).data;
    bookings.push(booking.id);
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE court_id='${court.id}' AND starts_at='${booking.startsAt}' AND status='CONFIRMED';`,
      ),
      "1",
    );
    assert.equal(booking.priceCents, court.hourlyPriceCents);
  });
  await test("Greek and British browser locales keep ISO dates and 90-minute bookings correct", async () => {
    const otherCourt = (await api(member, "/api/courts")).data.find(
      (c) => c.id !== court.id && c.enabled,
    );
    for (const [language, hour] of [
      ["el-GR", "12:00"],
      ["en-GB", "14:00"],
    ]) {
      const request = {
        ...bookingRequest(hour, otherCourt.id),
        durationMinutes: 90,
      };
      const response = await api(
        member,
        "/api/bookings",
        "POST",
        request,
        language,
      );
      assert.equal(
        response.status,
        200,
        language + ": " + JSON.stringify(response.data),
      );
      bookings.push(response.data.id);
      assert.equal(
        Date.parse(response.data.startsAt),
        Date.parse(request.startsAt),
      );
      assert.equal(
        Date.parse(response.data.endsAt) - Date.parse(response.data.startsAt),
        90 * 60000,
      );
      assert.equal(
        response.data.priceCents,
        (otherCourt.hourlyPriceCents * 90) / 60,
      );
      assert.equal(
        (
          await api(
            member,
            `/api/subscriptions/eligibility/${profile.id}?date=${date}`,
            "GET",
            undefined,
            language,
          )
        ).data.eligible,
        true,
      );
    }
  });
  await test("Availability reflects occupied slots; adjacent slots remain bookable", async () => {
    const response = await api(
      member,
      `/api/courts/${court.id}/availability?date=${date}&durationMinutes=60`,
    );
    assert.equal(response.status, 200);
    const occupied = response.data.find(
      (s) => Date.parse(s.startsAt) === Date.parse(booking.startsAt),
    );
    assert(occupied);
    assert.equal(occupied.available, false);
    assert.equal((await book("17:00")).status, "CONFIRMED");
    assert.equal(
      (await api(stranger, `/api/bookings/${booking.id}`)).status,
      403,
    );
    assert.equal(
      (await api(stranger, `/api/bookings/${booking.id}`, "DELETE")).status,
      403,
    );
    assert.equal((await api(stranger, "/api/bookings")).data.length, 0);
  });
  await test("Access denial persisted in PostgreSQL and visible to reception", async () => {
    assert.equal(
      (
        await api(member, "/api/access/validate", "POST", {
          bookingId: booking.id,
        })
      ).status,
      403,
    );
    // Liveness can be green before the initial Eureka registry has reached this Feign client.
    const response = await until(async () => {
      const result = await api(admin, "/api/access/validate", "POST", {
        bookingId: booking.id,
      });
      return result.status === 503 ? false : result;
    }, "Initial access-service downstream discovery");
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.allowed, false);
    assert.equal(response.data.reason, "OUTSIDE_BOOKING_WINDOW");
    assert.equal(
      await sql(
        "padel_access",
        `SELECT count(*) FROM access_audits WHERE id='${response.data.id}' AND allowed=false;`,
      ),
      "1",
    );
    assert(
      (await api(admin, "/api/access/audit")).data.some(
        (a) => a.id === response.data.id,
      ),
    );
  });
  await test("Disabled member and disabled court block new bookings", async () => {
    assert.equal(
      (
        await api(admin, `/api/members/${profile.id}/enabled`, "PATCH", {
          enabled: false,
        })
      ).status,
      200,
    );
    assert.equal(
      (await api(member, "/api/bookings", "POST", bookingRequest("18:00")))
        .status,
      403,
    );
    assert.equal(
      (
        await api(admin, "/api/access/validate", "POST", {
          bookingId: booking.id,
        })
      ).data.reason,
      "MEMBER_DISABLED",
    );
    assert.equal(
      (
        await api(admin, `/api/members/${profile.id}/enabled`, "PATCH", {
          enabled: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(admin, `/api/courts/${court.id}`, "PATCH", {
          enabled: false,
          hourlyPriceCents: court.hourlyPriceCents,
        })
      ).status,
      200,
    );
    assert.equal(
      (await api(member, "/api/bookings", "POST", bookingRequest("18:00")))
        .status,
      409,
    );
    assert.equal(
      (
        await api(admin, `/api/courts/${court.id}`, "PATCH", {
          enabled: true,
          hourlyPriceCents: court.hourlyPriceCents,
        })
      ).status,
      200,
    );
  });
  await test("Transactional outbox -> real RabbitMQ -> notification DB -> SMTP/Mailpit", async () => {
    for (const title of [
      "Welcome to Padel Club",
      "Subscription activated",
      "Your court is booked",
    ]) {
      const notification = await notificationsWith(title);
      await until(() => mailFor(notification), "Mailpit received " + title);
    }
    await until(
      async () =>
        (await sql(
          "padel_bookings",
          `SELECT count(*) FROM outbox_events WHERE payload::jsonb->>'memberId'='${profile.id}';`,
        )) === "0",
      "Current run outbox drained",
    );
    assert.equal(
      (await api(stranger, "/api/notifications")).data.some(
        (n) => n.memberId === profile.id,
      ),
      false,
    );
  });
  await test("Repeated RabbitMQ event is stored once and sends one email", async () => {
    const event = {
      id: randomUUID(),
      type: "e2e.duplicate",
      memberId: profile.id,
      email: member.email,
      title: `Dedup ${runId}`,
      detail: "Real RabbitMQ redelivery check",
      occurredAt: new Date().toISOString(),
    };
    await publish(event);
    await notificationsWith(event.title);
    await publish(event);
    await sleep(3500);
    assert.equal(
      await sql(
        "padel_notifications",
        `SELECT count(*) FROM notifications WHERE id='${event.id}';`,
      ),
      "1",
    );
    const mail = await http(
      "http://localhost:8025/api/v1/search?query=" +
        encodeURIComponent("to:" + member.email),
    );
    assert.equal(
      mail.data.messages.filter((m) => m.Subject === event.title).length,
      1,
    );
  });
  await test("Cancellation releases the court and emits an email", async () => {
    assert.equal(
      (await api(member, `/api/bookings/${booking.id}`, "DELETE")).status,
      200,
    );
    assert.equal(
      (await api(member, `/api/bookings/${booking.id}`)).data.status,
      "CANCELLED",
    );
    assert.equal(
      (
        await api(admin, "/api/access/validate", "POST", {
          bookingId: booking.id,
        })
      ).data.reason,
      "BOOKING_CANCELLED",
    );
    await notificationsWith("Booking cancelled");
    booking = await book();
  });
  await test("Valid entry allowed; late member cancellation blocked and staff override allowed", async () => {
    // Isolated fixture: exercise the real access window at any time of day, without changing the host clock.
    liveBooking = await book("20:00");
    await sql(
      "padel_bookings",
      `UPDATE bookings SET starts_at=now()+interval '5 minutes', ends_at=now()+interval '65 minutes' WHERE id='${liveBooking.id}';`,
    );
    const response = await api(admin, "/api/access/validate", "POST", {
      bookingId: liveBooking.id,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.allowed, true);
    assert.equal(response.data.reason, "ALLOWED");
    assert.equal(
      (await api(member, `/api/bookings/${liveBooking.id}`, "DELETE")).status,
      409,
    );
    const late = await book("21:00");
    await sql(
      "padel_bookings",
      `UPDATE bookings SET starts_at=now()+interval '75 minutes', ends_at=now()+interval '135 minutes' WHERE id='${late.id}';`,
    );
    assert.equal(
      (await api(member, `/api/bookings/${late.id}`, "DELETE")).status,
      409,
    );
    assert.equal(
      (await api(admin, `/api/bookings/${late.id}`, "DELETE")).status,
      200,
    );
  });
  if (resilience) {
    infraTouched = true;
    await test("Gateway container recreation keeps the existing Nginx proxy working", async () => {
      const webId = await compose("ps", "-q", "web"),
        gatewayId = await compose("ps", "-q", "api-gateway");
      await compose("up", "-d", "--no-deps", "--force-recreate", "api-gateway");
      assert.notEqual(await compose("ps", "-q", "api-gateway"), gatewayId);
      assert.equal(
        await compose("ps", "-q", "web"),
        webId,
        "Web must not need a restart",
      );
      await until(
        async () =>
          (await api(member, "/api/subscriptions/plans")).status === 200,
        "Existing Nginx routes to recreated gateway",
        180000,
      );
      assert.equal((await api(member, "/api/members/me")).data.id, profile.id);
    });
    await test("Booking persists across a booking-service restart", async () => {
      await compose("restart", "booking-service");
      await until(
        async () => {
          const response = await api(member, `/api/bookings/${booking.id}`);
          return response.status === 200 && response.data.id === booking.id;
        },
        "Booking survives service restart",
        180000,
      );
      const replay = await api(
        member,
        "/api/bookings",
        "POST",
        replayBookingBody,
        "el-GR",
        replayBookingKey,
      );
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.data, replayBooking);
      assert.equal(
        (await api(member, `/api/bookings/${replayBooking.id}`)).data.status,
        "CANCELLED",
      );
    });
    await test("Subscription response and idempotency key survive a service restart", async () => {
      await compose("restart", "subscription-service");
      await until(
        async () => {
          const response = await api(
            admin,
            `/api/subscriptions?memberId=${profile.id}`,
          );
          return (
            response.status === 200 &&
            response.data.some((s) => s.id === subscription.id)
          );
        },
        "Subscription route ready after restart",
        180000,
      );
      const replay = await api(
        admin,
        "/api/subscriptions",
        "POST",
        subscriptionBody,
        "el-GR",
        subscriptionKey,
      );
      assert.equal(replay.status, 200, JSON.stringify(replay.data));
      assert.deepEqual(replay.data, subscription);
      assert.equal(
        await sql(
          "padel_subscriptions",
          `SELECT count(*) FROM subscriptions WHERE member_id='${profile.id}';`,
        ),
        "1",
      );
    });
    await test("RabbitMQ outage preserves committed booking/outbox; recovery delivers event", async () => {
      await compose("stop", "rabbitmq");
      const created = await book("18:00");
      const payload = await sql(
        "padel_bookings",
        `SELECT payload FROM outbox_events WHERE routing_key='booking.confirmed' AND payload::jsonb->>'memberId'='${profile.id}' ORDER BY created_at DESC LIMIT 1;`,
      );
      const event = JSON.parse(payload);
      assert.equal(event.memberId, profile.id);
      await until(
        async () => {
          const response = await api(member, `/api/bookings/${created.id}`);
          return response.status === 200 && response.data.id === created.id;
        },
        "Read committed booking while RabbitMQ is down",
        180000,
      );
      await compose("start", "rabbitmq");
      await until(
        async () => {
          const response = await api(member, "/api/notifications");
          return (
            response.status === 200 &&
            response.data.some((n) => n.id === event.id && n.status === "SENT")
          );
        },
        "Event delivered after RabbitMQ recovery",
        180000,
      );
      await until(
        async () =>
          (await sql(
            "padel_bookings",
            `SELECT count(*) FROM outbox_events WHERE id='${event.id}';`,
          )) === "0",
        "Recovered event removed from outbox",
      );
    });
    await test("SMTP outage records a pending retry; recovery sends persisted email", async () => {
      await compose("stop", "mailpit");
      const title = `SMTP recovery ${runId}`;
      const event = {
        id: randomUUID(),
        type: "e2e.smtp",
        memberId: profile.id,
        email: member.email,
        title,
        detail: "Real SMTP retry check",
        occurredAt: new Date().toISOString(),
      };
      await publish(event);
      await until(
        async () =>
          (await sql(
            "padel_notifications",
            `SELECT count(*) FROM notifications WHERE id='${event.id}' AND status='PENDING' AND attempts>=1;`,
          )) === "1",
        "SMTP failure persisted",
      );
      await compose("start", "mailpit");
      await notificationsWith(title, 180000);
      assert(
        (await sql(
          "padel_notifications",
          `SELECT attempts FROM notifications WHERE id='${event.id}';`,
        )) >= 2,
      );
      await until(() => mailFor({ title }), "Recovered SMTP email received");
    });
  }
  await test("PostgreSQL Flyway migration installs a validated immediate exclusion constraint", async () => {
    assert.equal(
      await sql(
        "padel_bookings",
        "SELECT count(*) FROM pg_constraint WHERE conrelid='bookings'::regclass AND conname='bookings_no_confirmed_overlap' AND contype='x' AND convalidated AND NOT condeferrable;",
      ),
      "1",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        "SELECT count(*) FROM flyway_schema_history WHERE version='4' AND success;",
      ),
      "1",
    );
    assert.equal(
      await sql(
        "padel_bookings",
        "SELECT count(*) FROM pg_extension WHERE extname='btree_gist';",
      ),
      "1",
    );
  });
  await test("Direct SQL rejects equal, partial and contained overlaps, including equivalent timezone offsets", async () => {
    databaseBase = databaseBooking(
      "2035-01-10T10:00:00Z",
      "2035-01-10T11:00:00Z",
    );
    await sql("padel_bookings", databaseBase.query);
    for (const [start, end] of [
      ["10:00:00Z", "11:00:00Z"],
      ["10:30:00Z", "11:30:00Z"],
      ["10:15:00Z", "10:45:00Z"],
      ["09:00:00Z", "12:00:00Z"],
      ["12:00:00+02:00", "13:00:00+02:00"],
    ]) {
      const attempt = databaseBooking(
        "2035-01-10T" + start,
        "2035-01-10T" + end,
      );
      await assert.rejects(
        sql("padel_bookings", attempt.query),
        assertExcluded,
      );
      assert.equal(
        await sql(
          "padel_bookings",
          `SELECT count(*) FROM bookings WHERE id='${attempt.id}';`,
        ),
        "0",
      );
    }
  });
  await test("Direct SQL permits adjacent bookings and another player on a different court", async () => {
    databaseAdjacent = databaseBooking(
      "2035-01-10T11:00:00Z",
      "2035-01-10T12:00:00Z",
    );
    await sql("padel_bookings", databaseAdjacent.query);
    const preceding = databaseBooking(
      "2035-01-10T09:00:00Z",
      "2035-01-10T10:00:00Z",
    );
    await sql("padel_bookings", preceding.query);
    const otherCourt = (await api(member, "/api/courts")).data.find(
      (c) => c.id !== court.id,
    );
    databaseOther = databaseBooking(
      "2035-01-10T10:00:00Z",
      "2035-01-10T11:00:00Z",
      "CONFIRMED",
      otherCourt.id,
      otherProfile.id,
    );
    await sql("padel_bookings", databaseOther.query);
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE id IN ('${databaseAdjacent.id}','${preceding.id}','${databaseOther.id}') AND status='CONFIRMED';`,
      ),
      "3",
    );
  });
  await test("Direct SQL cannot introduce overlap by moving, extending or changing a court", async () => {
    for (const query of [
      `UPDATE bookings SET starts_at='2035-01-10T10:30:00Z' WHERE id='${databaseAdjacent.id}';`,
      `UPDATE bookings SET ends_at='2035-01-10T11:30:00Z' WHERE id='${databaseBase.id}';`,
      `UPDATE bookings SET court_id='${court.id}' WHERE id='${databaseOther.id}';`,
    ])
      await assert.rejects(sql("padel_bookings", query), assertExcluded);
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE id='${databaseBase.id}' AND ends_at='2035-01-10T11:00:00Z';`,
      ),
      "1",
    );
  });
  await test("SQL cancellation releases a slot; reactivation conflicting with its replacement is rejected", async () => {
    await sql(
      "padel_bookings",
      `UPDATE bookings SET status='CANCELLED' WHERE id='${databaseBase.id}';`,
    );
    const replacement = databaseBooking(
      "2035-01-10T10:00:00Z",
      "2035-01-10T11:00:00Z",
    );
    await sql("padel_bookings", replacement.query);
    const cancelled = databaseBooking(
      "2035-01-10T10:00:00Z",
      "2035-01-10T11:00:00Z",
      "CANCELLED",
    );
    await sql("padel_bookings", cancelled.query);
    await assert.rejects(
      sql(
        "padel_bookings",
        `UPDATE bookings SET status='CONFIRMED' WHERE id='${databaseBase.id}';`,
      ),
      assertExcluded,
    );
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT status FROM bookings WHERE id='${databaseBase.id}';`,
      ),
      "CANCELLED",
    );
  });
  await test("Eight concurrent direct SQL transactions bypass application locks but commit exactly one reservation", async () => {
    const attempts = Array.from({ length: 8 }, () =>
      databaseBooking("2035-01-10T15:00:00Z", "2035-01-10T16:00:00Z"),
    );
    const responses = await Promise.allSettled(
      attempts.map((row) =>
        sql(
          "padel_bookings",
          `BEGIN; ${row.query} SELECT pg_sleep(1); COMMIT;`,
        ),
      ),
    );
    assert.equal(responses.filter((r) => r.status === "fulfilled").length, 1);
    for (const response of responses)
      if (response.status === "rejected") assertExcluded(response.reason);
    assert.equal(
      await sql(
        "padel_bookings",
        `SELECT count(*) FROM bookings WHERE id IN (${attempts.map((row) => `'${row.id}'`).join(",")}) AND status='CONFIRMED';`,
      ),
      "1",
    );
  });
  await verifyPadel({
    test,
    api,
    sql,
    until,
    createUser,
    login,
    admin,
    member,
    stranger,
    profile,
    otherProfile,
    bookings,
    subscriptions,
    databaseBooking,
  });
  await verifyReception({
    test,
    api,
    sql,
    until,
    compose,
    resilience,
    admin,
    member,
    stranger,
    profile,
    otherProfile,
    bookings,
    liveBooking,
  });
  await test("Cancelled subscription blocks further bookings", async () => {
    assert.equal(
      (await api(admin, `/api/subscriptions/${subscription.id}`, "DELETE"))
        .status,
      200,
    );
    assert.equal(
      (
        await api(
          member,
          `/api/subscriptions/eligibility/${profile.id}?date=${date}`,
        )
      ).data.eligible,
      false,
    );
    assert.equal(
      (await api(member, "/api/bookings", "POST", bookingRequest("19:00")))
        .status,
      409,
    );
    assert.equal(
      (
        await api(admin, "/api/access/validate", "POST", {
          bookingId: liveBooking.id,
        })
      ).data.reason,
      "NO_ACTIVE_SUBSCRIPTION",
    );
    const replay = await api(
      admin,
      "/api/subscriptions",
      "POST",
      subscriptionBody,
      "el-GR",
      subscriptionKey,
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data, subscription);
    assert.equal(
      (
        await api(member, `/api/subscriptions?memberId=${profile.id}`)
      ).data.find((s) => s.id === subscription.id).status,
      "CANCELLED",
    );
  });
} catch (error) {
  console.error("E2E stopped:", error.message);
  process.exitCode = 1;
} finally {
  if (infraTouched) {
    try {
      await compose("start", "rabbitmq", "mailpit");
    } catch (error) {
      console.error("Restore infrastructure failed:", error.message);
      process.exitCode = 1;
    }
  }
  if (databaseBookings.length) {
    try {
      await sql(
        "padel_bookings",
        `UPDATE bookings SET status='CANCELLED' WHERE id IN (${databaseBookings.map((id) => `'${id}'`).join(",")});`,
      );
    } catch (error) {
      console.error("Could not cancel direct SQL fixtures:", error.message);
      process.exitCode = 1;
    }
  }
  // Cancel only this run's records. Preserve volumes and all unrelated projects.
  if (admin) {
    for (const path of [...new Set(bookings)]
      .map((id) => `/api/bookings/${id}`)
      .concat(
        [...new Set(subscriptions)].map((id) => `/api/subscriptions/${id}`),
      )) {
      try {
        await until(
          async () => {
            const response = await api(admin, path, "DELETE");
            return response.status === 200;
          },
          "Cancel isolated fixture " + path,
          180000,
        );
      } catch (error) {
        console.error(
          "Could not cancel isolated fixture:",
          path,
          error.message,
        );
        process.exitCode = 1;
      }
    }
  }
  for (const id of users) {
    try {
      assert.equal((await identityAdmin(`/users/${id}`, "DELETE")).status, 204);
    } catch {
      console.error("Could not remove isolated test identity:", id);
      process.exitCode = 1;
    }
  }
  for (const id of clients) {
    try {
      assert.equal(
        (await identityAdmin(`/clients/${id}`, "DELETE")).status,
        204,
      );
    } catch {
      console.error("Could not remove isolated test client:", id);
      process.exitCode = 1;
    }
  }
  await mkdir(new URL("../test-results/", import.meta.url), {
    recursive: true,
  });
  const report = {
    runId,
    finishedAt: new Date().toISOString(),
    project,
    resilience,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    completed: !process.exitCode,
    results,
  };
  await writeFile(
    new URL("../test-results/e2e.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `${report.passed} passed, ${report.failed} failed. Report: test-results/e2e.json`,
  );
}
