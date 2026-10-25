import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { unlink, rmdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  rabbitDefinition,
  password,
  productionRealm,
} from "./production-config.mjs";
import { safeRuntimePath } from "./backup.mjs";
test("RabbitMQ password hash authenticates the generated credential and rejects a different one", () => {
  const credential = password(),
    definition = rabbitDefinition(credential),
    bytes = Buffer.from(definition.users[0].password_hash, "base64"),
    salt = bytes.subarray(0, 4),
    expected = bytes.subarray(4);
  assert.deepEqual(
    createHash("sha256").update(salt).update(credential).digest(),
    expected,
  );
  assert.notDeepEqual(
    createHash("sha256").update(salt).update(password()).digest(),
    expected,
  );
  const rights = definition.permissions[0];
  for (const pattern of [rights.configure, rights.write, rights.read]) {
    for (const name of [
      "padel.events",
      "padel.dead",
      "padel.notifications",
      "padel.notifications.dead",
    ])
      assert.match(name, new RegExp(pattern));
    for (const name of ["amq.topic", "other.events"])
      assert.doesNotMatch(name, new RegExp(pattern));
  }
});
test("Production authentication import keeps exact client origin and contains no demo accounts", async () => {
  const original = JSON.parse(
      await readFile(
        new URL("../../infra/keycloak/padel-realm.json", import.meta.url),
      ),
    ),
    realm = productionRealm(original, "https://club.example.test");
  assert.ok(original.users.length);
  assert.equal(realm.users, undefined);
  const client = realm.clients.find((item) => item.clientId === "padel-web");
  assert.deepEqual(client.redirectUris, ["https://club.example.test/"]);
  assert.deepEqual(client.webOrigins, ["https://club.example.test"]);
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.serviceAccountsEnabled, false);
  assert.equal(client.attributes["pkce.code.challenge.method"], "S256");
});
test("Backup output rejects paths outside the private runtime directory", () => {
  for (const path of [
    ".runtime",
    "README.md",
    ".runtime/../../outside",
    ".runtime/../docs",
  ])
    assert.throws(() => safeRuntimePath(path));
  assert.ok(safeRuntimePath(".runtime/backups/test").endsWith("test"));
});
test("Generated secrets stay out of environment values, existing bundles are preserved and SMTP placeholders block deployment", async () => {
  const directories = [];
  const run = (args) =>
    spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true });
  try {
    const local = ".runtime/prepare-test-" + randomUUID();
    directories.push(local);
    const first = run([
      "scripts/prepare-production.mjs",
      "--local-test",
      "--output",
      local,
    ]);
    assert.equal(first.status, 0, first.stderr);
    const manifest = JSON.parse(await readFile(join(local, "manifest.json"))),
      environment = await readFile(join(local, ".env"), "utf8"),
      values = [];
    for (const file of manifest.secretFiles) {
      const value = await readFile(join(local, file), "utf8");
      assert.match(value, /^[a-f0-9]{64}$/);
      assert.ok(!environment.includes(value));
      values.push(value);
    }
    assert.equal(new Set(values).size, values.length);
    const repeated = run([
      "scripts/prepare-production.mjs",
      "--local-test",
      "--output",
      local,
    ]);
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /Existing secrets are never overwritten/);
    assert.equal(
      await readFile(join(local, manifest.secretFiles[0]), "utf8"),
      values[0],
    );
    const publicPath = ".runtime/prepare-public-test-" + randomUUID();
    directories.push(publicPath);
    const prepared = run([
      "scripts/prepare-production.mjs",
      "--output",
      publicPath,
      "--web-origin",
      "https://club.example.test",
      "--identity-origin",
      "https://identity.example.test",
      "--smtp-host",
      "smtp.example.test",
      "--smtp-user",
      "club@example.test",
      "--mail-from",
      "club@example.test",
      "--alerts-to",
      "operations@example.test",
    ]);
    assert.equal(prepared.status, 0, prepared.stderr);
    const blocked = run([
      "scripts/deploy-production.mjs",
      "--bundle",
      publicPath,
      "--check-only",
    ]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /Configure the SMTP provider password/);
  } finally {
    for (const directory of directories) {
      const absolute = safeRuntimePath(directory),
        manifest = JSON.parse(await readFile(join(absolute, "manifest.json")));
      for (const file of [
        ...manifest.secretFiles,
        ".env",
        "manifest.json",
        "compose.yml",
        "Caddyfile",
        "padel-realm.json",
        "app-config.json",
        "rabbit-definitions.json",
        "rabbitmq.conf",
        "alertmanager.yml",
        "prometheus.yml",
      ])
        await unlink(join(absolute, file));
      await rmdir(join(absolute, "secrets"));
      await rmdir(absolute);
    }
  }
});
