import test from "node:test";
import assert from "node:assert/strict";
import { removeIsolatedIdentity } from "./cleanup.mjs";
const path = "/users/11111111-1111-4111-8111-111111111111";
async function until(check) {
  for (let i = 0; i < 6; i++) {
    const result = await check();
    if (result) return result;
  }
  throw new Error("Timed out");
}
test("identity cleanup recovers transient upstream failures and independently confirms absence", async () => {
  const calls = [],
    statuses = [500, 204, 503, 404];
  await removeIsolatedIdentity(
    async (actual, method) => {
      assert.equal(actual, path);
      calls.push(method);
      return { status: statuses.shift() };
    },
    until,
    path,
  );
  assert.deepEqual(calls, ["DELETE", "DELETE", "GET", "GET"]);
});
test("a replayed delete of an already absent fixture still requires GET 404", async () => {
  const calls = [];
  await removeIsolatedIdentity(
    async (_, method) => {
      calls.push(method);
      return { status: 404 };
    },
    until,
    path,
  );
  assert.deepEqual(calls, ["DELETE", "GET"]);
});
test("unauthorized cleanup, persistent failure, a surviving identity and unscoped paths cannot pass", async () => {
  await assert.rejects(
    removeIsolatedIdentity(async () => ({ status: 403 }), until, path),
  );
  await assert.rejects(
    removeIsolatedIdentity(async () => ({ status: 503 }), until, path),
    /Timed out/,
  );
  await assert.rejects(
    removeIsolatedIdentity(
      async (_, method) => ({ status: method === "DELETE" ? 204 : 200 }),
      until,
      path,
    ),
  );
  await assert.rejects(
    removeIsolatedIdentity(
      async () => assert.fail("No request permitted"),
      until,
      "/users",
    ),
  );
});
