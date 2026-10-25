// Apply presentation only to an existing local realm; import skips existing realms.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const file = process.argv.includes("--example-env") ? ".env.example" : ".env";
const settings = Object.fromEntries(
  (await readFile(new URL("../" + file, import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
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
assert.equal(
  response.status,
  200,
  "Local Keycloak admin authentication failed",
);
const token = (await response.json()).access_token;
const headers = {
  Authorization: "Bearer " + token,
  "Content-Type": "application/json",
};
const result = await fetch(base + "/admin/realms/padel", {
  method: "PUT",
  headers,
  body: JSON.stringify({
    loginTheme: "padel",
    internationalizationEnabled: true,
    supportedLocales: ["el", "en"],
    defaultLocale: "el",
  }),
});
assert.equal(result.status, 204, "Could not apply local login theme");
const verified = await fetch(base + "/admin/realms/padel", { headers });
assert(verified.ok);
const realm = await verified.json();
assert.equal(realm.loginTheme, "padel");
assert.equal(realm.defaultLocale, "el");
assert.equal(realm.internationalizationEnabled, true);
console.log(
  "Applied Padel login theme and Greek default locale to the local realm.",
);
