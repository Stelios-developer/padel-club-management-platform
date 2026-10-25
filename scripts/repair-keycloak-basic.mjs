// Add the Keycloak basic scope to an already imported LOCAL padel-web client.
// Realm imports do not update existing realms. Does not replace other scopes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const file = process.argv.includes("--example-env") ? ".env.example" : ".env";
const settings = Object.fromEntries(
  (await readFile(new URL("../" + file, import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const base = "http://localhost:8081";
const response = await fetch(
  base + "/realms/master/protocol/openid-connect/token",
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "admin-cli",
      grant_type: "password",
      username: settings.KEYCLOAK_ADMIN,
      password: settings.KEYCLOAK_ADMIN_PASSWORD,
    }),
  },
);
assert.equal(response.status, 200, "Keycloak admin authentication failed");
const token = (await response.json()).access_token;
const request = async (path, method = "GET") => {
  const result = await fetch(base + "/admin/realms/padel" + path, {
    method,
    headers: { Authorization: "Bearer " + token },
  });
  assert(result.ok, `Keycloak returned ${result.status} for ${path}`);
  return result.status === 204 ? null : result.json();
};
const client = (await request("/clients?clientId=padel-web")).find(
  (c) => c.clientId === "padel-web",
);
assert(client, "padel-web client not found");
const scope = (await request("/client-scopes")).find((s) => s.name === "basic");
assert(scope, "Keycloak basic scope not found");
const assigned = await request(`/clients/${client.id}/default-client-scopes`);
if (!assigned.some((s) => s.id === scope.id)) {
  await request(
    `/clients/${client.id}/default-client-scopes/${scope.id}`,
    "PUT",
  );
  console.log(
    "Added basic scope to local padel-web. Sign in again to obtain a token with sub.",
  );
} else console.log("Local padel-web already includes basic scope.");
