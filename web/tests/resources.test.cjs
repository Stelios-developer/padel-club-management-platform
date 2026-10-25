const { test } = require("node:test");
const assert = require("node:assert/strict");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const failure = (status) => Object.assign(new Error("Unavailable"), { status });

test("healthy sections settle even while another request is pending or fails", async () => {
  const { createResourceStore } = await import("../resources.js"),
    slow = deferred(),
    changed = [];
  const store = createResourceStore(
    (path) => (path === "slow" ? slow.promise : Promise.resolve(["court"])),
    (name) => changed.push(name),
  );
  const pending = store.load("notifications", "slow");
  await store.load("courts", "healthy");
  assert.equal(store.get("courts").status, "success");
  assert.deepEqual(store.get("courts").data, ["court"]);
  assert.equal(store.get("notifications").status, "loading");
  slow.reject(failure(503));
  await pending;
  assert.equal(store.get("notifications").status, "error");
  assert.equal(store.get("courts").status, "success");
});
test("profile failure does not gate other resources and missing data differs from empty success", async () => {
  const { createResourceStore } = await import("../resources.js");
  const store = createResourceStore(async (path) => {
    if (path === "profile") throw failure(503);
    return [];
  });
  await Promise.all([
    store.load("profile", "profile"),
    store.load("bookings", "bookings"),
  ]);
  assert.equal(store.get("profile").data, null);
  assert.equal(store.get("profile").status, "error");
  assert.deepEqual(store.get("bookings").data, []);
  assert.equal(store.get("bookings").status, "success");
  assert.equal(store.get("unloaded").data, null);
  assert.equal(store.get("unloaded").status, "idle");
});
test("refresh failure preserves the last successful snapshot and its timestamp", async () => {
  const { createResourceStore } = await import("../resources.js");
  let fail = false;
  const store = createResourceStore(async () => {
    if (fail) throw failure(500);
    return ["booking"];
  });
  await store.load("bookings", "bookings");
  const updatedAt = store.get("bookings").updatedAt;
  fail = true;
  await store.load("bookings", "bookings");
  assert.equal(store.get("bookings").status, "error");
  assert.deepEqual(store.get("bookings").data, ["booking"]);
  assert.equal(store.get("bookings").updatedAt, updatedAt);
});
test("targeted retry sends one request and preserves unrelated successful data", async () => {
  const { createResourceStore } = await import("../resources.js"),
    calls = [];
  let fail = true;
  const store = createResourceStore(async (path) => {
    calls.push(path);
    if (path === "notifications" && fail) throw failure(503);
    return [path];
  });
  await Promise.all([
    store.load("courts", "courts"),
    store.load("notifications", "notifications"),
  ]);
  const original = store.get("courts").data;
  fail = false;
  calls.length = 0;
  await store.load("notifications", "notifications");
  assert.deepEqual(calls, ["notifications"]);
  assert.equal(store.get("courts").data, original);
  assert.equal(store.get("notifications").status, "success");
});
test("late superseded response cannot overwrite a newer refresh", async () => {
  const { createResourceStore } = await import("../resources.js"),
    old = deferred();
  let calls = 0,
    oldSignal;
  const store = createResourceStore((path, { signal }) => {
    if (++calls === 1) {
      oldSignal = signal;
      return old.promise;
    }
    return Promise.resolve(["new"]);
  });
  const pending = store.load("members", "page1");
  await store.load("members", "page2");
  assert.equal(oldSignal.aborted, true);
  old.resolve(["old"]);
  await pending;
  assert.deepEqual(store.get("members").data, ["new"]);
});
test("logout or actor change clears cached data and ignores an old response even if transport ignores abort", async () => {
  const { createResourceStore } = await import("../resources.js"),
    old = deferred();
  let calls = 0;
  const store = createResourceStore(() =>
    ++calls === 1 ? old.promise : Promise.resolve(["new actor"]),
  );
  const pending = store.load("members", "members");
  store.clear();
  assert.equal(store.get("members").data, null);
  await store.load("members", "members");
  old.resolve(["private old actor"]);
  await pending;
  assert.deepEqual(store.get("members").data, ["new actor"]);
});
test("changing a page invalidates only its cache and ignores late data", async () => {
  const { createResourceStore } = await import("../resources.js"),
    old = deferred();
  const store = createResourceStore((path) =>
    path === "old" ? old.promise : Promise.resolve([path]),
  );
  await store.load("courts", "courts");
  const pending = store.load("members", "old");
  store.clear("members");
  await store.load("members", "page2");
  old.resolve(["page1"]);
  await pending;
  assert.deepEqual(store.get("members").data, ["page2"]);
  assert.deepEqual(store.get("courts").data, ["courts"]);
});
test("revoked permissions and a deleted profile discard the old snapshot", async () => {
  const { createResourceStore } = await import("../resources.js");
  for (const status of [403, 404]) {
    let fail = false;
    const store = createResourceStore(async () => {
      if (fail) throw failure(status);
      return ["private"];
    });
    await store.load("profile", "profile");
    fail = true;
    await store.load("profile", "profile");
    assert.equal(store.get("profile").data, null);
    assert.equal(store.get("profile").error.status, status);
  }
});
test("401 clears all protected data, signals reauthentication once and ignores other in-flight results", async () => {
  const { createResourceStore } = await import("../resources.js"),
    late = deferred();
  let expired = 0;
  const store = createResourceStore(
    async (path) => {
      if (path === "expired") throw failure(401);
      if (path === "late") return late.promise;
      return ["private"];
    },
    () => {},
    () => expired++,
  );
  await store.load("courts", "courts");
  const pending = store.load("notifications", "late");
  await store.load("profile", "expired");
  late.resolve(["private"]);
  await pending;
  assert.equal(expired, 1);
  assert.equal(store.get("courts").data, null);
  assert.equal(store.get("notifications").data, null);
});
