// A real deployment rehearsal. Never run against a live project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { request } from "node:https";
import {
  randomBytes,
  createHash,
  createHmac,
  createPublicKey,
  verify,
} from "node:crypto";
import {
  options,
  composeArgs,
  databases,
  processResult,
  textCommand,
} from "./operations/backup.mjs";

const config = options();
assert.equal(
  config.project,
  "padel-production-check",
  "Use the isolated padel-production-check project",
);
const bundle = new URL("../.runtime/production-check/", import.meta.url);
assert.equal(
  JSON.parse(await readFile(new URL("manifest.json", bundle))).localTest,
  true,
);
const results = [],
  users = [];
async function run(service, args, input) {
  const child = spawn(
    "docker",
    [...composeArgs(config), "exec", "-T", service, ...args],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  const done = processResult(child),
    chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stdin.end(input);
  await done;
  return Buffer.concat(chunks).toString().trim();
}
async function check(name, action) {
  await action();
  results.push({ name, passed: true });
  console.log("PASS " + name);
}
const ca = await run("caddy", [
  "cat",
  "/data/caddy/pki/authorities/local/root.crt",
]);
function https(url, { method = "GET", body, headers = {}, cookies } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        ca,
        method,
        headers: {
          ...headers,
          ...(cookies ? { Cookie: cookies } : {}),
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.setTimeout(20000, () => req.destroy(new Error("HTTPS timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
const kc = (...args) =>
  run("keycloak", [
    "/opt/keycloak/bin/kcadm.sh",
    ...args,
    "--config",
    "/tmp/padel-check.config",
  ]);
function updateCookies(jar, response) {
  for (const cookie of response.headers["set-cookie"] || []) {
    const part = cookie.split(";")[0],
      i = part.indexOf("=");
    jar.set(part.slice(0, i), part.slice(i + 1));
  }
}
const cookieHeader = (jar) =>
  [...jar].map(([key, value]) => key + "=" + value).join("; ");
function form(response) {
  const match = response.body.match(/<form[^>]*action="([^"]+)"/);
  assert.ok(match, "Expected Keycloak authentication form");
  return match[1].replaceAll("&amp;", "&");
}
async function post(response, jar, values) {
  let next = await https(form(response), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cookies: cookieHeader(jar),
    body: new URLSearchParams(values).toString(),
  });
  updateCookies(jar, next);
  for (
    let i = 0;
    i < 5 &&
    next.status === 302 &&
    !next.headers.location?.startsWith("https://localhost:8443/");
    i++
  ) {
    next = await https(
      new URL(next.headers.location, "https://localhost:8444"),
      { cookies: cookieHeader(jar) },
    );
    updateCookies(jar, next);
  }
  return next;
}
async function begin(jar = new Map()) {
  const verifier = randomBytes(32).toString("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = new URLSearchParams({
    client_id: "padel-web",
    redirect_uri: "https://localhost:8443/",
    response_type: "code",
    scope: "openid",
    state: randomBytes(16).toString("hex"),
    nonce: randomBytes(16).toString("hex"),
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  let response = await https(
    "https://localhost:8444/realms/padel/protocol/openid-connect/auth?" + query,
    { cookies: cookieHeader(jar) },
  );
  updateCookies(jar, response);
  for (
    let i = 0;
    i < 5 &&
    response.status === 302 &&
    !response.headers.location?.startsWith("https://localhost:8443/");
    i++
  ) {
    response = await https(
      new URL(response.headers.location, "https://localhost:8444"),
      { cookies: cookieHeader(jar) },
    );
    updateCookies(jar, response);
  }
  return { response, jar, verifier };
}
const authorized = (response) =>
  response.status === 302 &&
  new URL(response.headers.location).origin === "https://localhost:8443" &&
  new URL(response.headers.location).searchParams.has("code");
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac("sha1", Buffer.from(secret, "utf8"))
      .update(counter)
      .digest(),
    offset = mac[19] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      ready =
        (
          await https(
            "https://localhost:8444/realms/padel/.well-known/openid-configuration",
          )
        ).status === 200;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.ok(ready, "Keycloak must become ready");
  await check(
    "HTTPS certificate, security headers and private admin endpoint",
    async () => {
      const web = await https("https://localhost:8443/");
      assert.equal(web.status, 200);
      assert.match(
        web.headers["strict-transport-security"],
        /max-age=31536000/,
      );
      assert.match(
        web.headers["content-security-policy"],
        /frame-ancestors 'none'/,
      );
      const discovery = await https(
        "https://localhost:8444/realms/padel/.well-known/openid-configuration",
      );
      assert.equal(discovery.status, 200);
      assert.equal(
        JSON.parse(discovery.body).issuer,
        "https://localhost:8444/realms/padel",
      );
      assert.equal((await https("https://localhost:8444/admin/")).status, 403);
    },
  );
  await check(
    "Six database roles: own schema allowed, all 30 cross-database connections rejected",
    async () => {
      for (const role of databases) {
        const flags = await textCommand(config, [
          "psql",
          "-XAt",
          "-U",
          config.user,
          "-d",
          "postgres",
          "-c",
          `SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication FROM pg_roles WHERE rolname='${role}';`,
        ]);
        assert.equal(flags, "f");
        const own = await textCommand(config, [
          "psql",
          "-XAt",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          role,
          "-d",
          role,
          "-c",
          "BEGIN; CREATE TABLE public.permission_probe(id int); ROLLBACK; SELECT current_user;",
        ]);
        assert.match(own, new RegExp(role + "$"));
        for (const target of databases.filter((db) => db !== role)) {
          await assert.rejects(
            textCommand(config, [
              "psql",
              "-XAt",
              "-U",
              role,
              "-d",
              target,
              "-c",
              "SELECT 1;",
            ]),
            /permission denied for database/,
          );
        }
      }
    },
  );
  await check("RabbitMQ has only its restricted application user", async () => {
    const data = await run("rabbitmq", [
      "rabbitmqctl",
      "list_users",
      "--formatter",
      "json",
    ]);
    const parsed = JSON.parse(data.slice(data.indexOf("[")));
    assert.deepEqual(
      parsed.map((user) => user.user),
      ["padel_app"],
    );
    assert.deepEqual(parsed[0].tags, []);
  });
  await run("keycloak", [
    "/bin/bash",
    "-c",
    '/opt/keycloak/bin/kcadm.sh config credentials --config /tmp/padel-check.config --server http://localhost:8080 --realm master --user bootstrap-admin --password "$(cat /run/secrets/keycloak_admin)"',
  ]);
  for (const role of ["MEMBER", "ADMIN", "STAFF"]) {
    const username =
        "deployment-check-" +
        role.toLowerCase() +
        "-" +
        randomBytes(4).toString("hex") +
        "@padel.local",
      password = "Fixture!Aa" + randomBytes(12).toString("hex");
    const child = spawn(
      "docker",
      [
        ...composeArgs(config),
        "exec",
        "-T",
        "keycloak",
        "/opt/keycloak/bin/kcadm.sh",
        "create",
        "users",
        "-r",
        "padel",
        "-i",
        "-f",
        "-",
        "--config",
        "/tmp/padel-check.config",
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    const done = processResult(child),
      chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stdin.end(
      JSON.stringify({
        username,
        email: username,
        emailVerified: true,
        enabled: true,
        firstName: "Deployment",
        lastName: "Check",
        credentials: [{ type: "password", value: password, temporary: false }],
      }),
    );
    await done;
    const id = Buffer.concat(chunks)
      .toString()
      .match(/[a-f0-9-]{36}/)?.[0];
    assert.ok(id, "Expected created fixture UUID");
    users.push({ id });
    const created = JSON.parse(await kc("get", "users/" + id, "-r", "padel"));
    assert.equal(created.username, username);
    await kc("add-roles", "-r", "padel", "--uid", id, "--rolename", role);
    await check(
      role === "MEMBER"
        ? "Member sign-in completes without MFA"
        : role + " requires MFA enrollment and rejects incorrect OTP",
      async () => {
        const { response, jar, verifier } = await begin();
        let logged = await post(response, jar, {
          username,
          password,
          credentialId: "",
        });
        if (role === "MEMBER") {
          assert.ok(
            authorized(logged),
            "Member should receive an authorization code",
          );
          await check(
            "Public HTTPS token exchange validates PKCE, JWT signature, issuer and API audience",
            async () => {
              const code = new URL(logged.headers.location).searchParams.get(
                "code",
              );
              const tokens = await https(
                "https://localhost:8444/realms/padel/protocol/openid-connect/token",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: "padel-web",
                    redirect_uri: "https://localhost:8443/",
                    code,
                    code_verifier: verifier,
                  }).toString(),
                },
              );
              assert.equal(tokens.status, 200);
              const token = JSON.parse(tokens.body).access_token,
                [header, payload, signature] = token.split("."),
                claims = JSON.parse(Buffer.from(payload, "base64url")),
                metadata = JSON.parse(Buffer.from(header, "base64url"));
              assert.equal(metadata.alg, "RS256");
              assert.equal(claims.iss, "https://localhost:8444/realms/padel");
              assert.ok([claims.aud].flat().includes("padel-api"));
              assert.ok(claims.realm_access.roles.includes("MEMBER"));
              assert.ok(!claims.realm_access.roles.includes("ADMIN"));
              const keys = JSON.parse(
                  (
                    await https(
                      "https://localhost:8444/realms/padel/protocol/openid-connect/certs",
                    )
                  ).body,
                ).keys,
                key = keys.find((key) => key.kid === metadata.kid);
              assert.ok(key);
              assert.ok(
                verify(
                  "RSA-SHA256",
                  Buffer.from(header + "." + payload),
                  createPublicKey({ key, format: "jwk" }),
                  Buffer.from(signature, "base64url"),
                ),
              );
            },
          );
          await check(
            "An existing member SSO session cannot bypass MFA after promotion",
            async () => {
              await kc(
                "add-roles",
                "-r",
                "padel",
                "--uid",
                id,
                "--rolename",
                "ADMIN",
              );
              const promoted = await begin(jar);
              assert.equal(promoted.response.status, 200);
              assert.match(promoted.response.body, /name="totpSecret"/);
              assert.ok(!authorized(promoted.response));
            },
          );
          return;
        }
        assert.equal(logged.status, 200);
        assert.ok(!authorized(logged));
        const secret =
          logged.body.match(/name="totpSecret"[^>]*value="([^"]+)"/)?.[1] ||
          logged.body
            .match(/id="totp-secret"[^>]*>([^<]+)</)?.[1]
            ?.replaceAll(" ", "")
            .trim();
        assert.ok(secret, "Privileged user must enroll TOTP");
        const rejected = await post(logged, jar, {
          totp: "invalid",
          totpSecret: secret,
          userLabel: "Deployment check",
        });
        assert.equal(rejected.status, 200);
        assert.ok(!authorized(rejected));
        logged = await post(rejected, jar, {
          totp: totp(secret),
          totpSecret: secret,
          userLabel: "Deployment check",
        });
        assert.ok(
          authorized(logged),
          "Valid OTP enrollment should finish authorization",
        );
        const next = await begin();
        let otp = await post(next.response, next.jar, {
          username,
          password,
          credentialId: "",
        });
        assert.equal(otp.status, 200);
        assert.match(otp.body, /name="otp"/);
        otp = await post(otp, next.jar, { otp: "invalid" });
        assert.ok(!authorized(otp));
        // Keycloak rejects replay of the enrollment code within the same 30s period.
        await new Promise((resolve) =>
          setTimeout(resolve, 30000 - (Date.now() % 30000) + 1100),
        );
        otp = await post(otp, next.jar, { otp: totp(secret) });
        assert.ok(
          authorized(otp),
          "Valid fresh OTP should complete the next sign-in",
        );
      },
    );
  }
  await check("Operational alert reaches local SMTP mailbox", async () => {
    const name = "PadelDeploymentCheck" + randomBytes(4).toString("hex");
    const payload = JSON.stringify([
      {
        labels: {
          alertname: name,
          severity: "critical",
          service: "deployment-check",
        },
        annotations: { summary: "Local production alert delivery test" },
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 180000).toISOString(),
      },
    ]);
    await run("web", [
      "wget",
      "-q",
      "-O",
      "-",
      "--header=Content-Type: application/json",
      "--post-data=" + payload,
      "http://alertmanager:9093/api/v2/alerts",
    ]);
    const deadline = Date.now() + 70000;
    let found = false;
    while (Date.now() < deadline) {
      const messages = JSON.parse(
        await run("web", [
          "wget",
          "-q",
          "-O",
          "-",
          "http://mailpit:8025/api/v1/messages",
        ]),
      );
      found = messages.messages.some(
        (message) =>
          message.Subject.includes(name) &&
          message.To.some(
            (recipient) => recipient.Address === "operations@padel.local",
          ),
      );
      if (found) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    assert.ok(found, "Alertmanager must deliver the alert email");
  });
} finally {
  for (const user of users)
    await kc("delete", "users/" + user.id, "-r", "padel");
  await run("keycloak", ["/bin/bash", "-c", "rm -f /tmp/padel-check.config"]);
}
await writeFile(
  config.get("--report", "docs/results/production/production-results.json"),
  JSON.stringify(
    {
      completed: true,
      verifiedAt: new Date().toISOString(),
      project: config.project,
      results,
      fixtureCleanup: true,
    },
    null,
    2,
  ) + "\n",
);
