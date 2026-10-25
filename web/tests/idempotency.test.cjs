const { test } = require("node:test");
const assert = require("node:assert/strict");
const memory = () => {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
    values,
  };
};
const body = { memberId: "member-1", plan: "MONTHLY", startsOn: "2026-10-01" };

test("double submits are blocked while pending and default submit buttons recover afterwards", async () => {
  const { beginSubmission } = await import("../idempotency.js");
  const button = { disabled: false, isConnected: true },
    form = {
      dataset: {},
      querySelector: (selector) => {
        assert(selector.includes("button:not([type])"));
        return button;
      },
    };
  const finish = beginSubmission(form);
  assert.equal(button.disabled, true);
  assert.equal(beginSubmission(form), null);
  finish();
  assert.equal(button.disabled, false);
  assert.equal(form.dataset.submitting, undefined);
  assert.equal(typeof beginSubmission(form), "function");
});

test("a lost response and page reload reuse the pending key, regardless of field order", async () => {
  const { createMutationIntents } = await import("../idempotency.js"),
    storage = memory();
  const first = createMutationIntents(() => storage);
  let original;
  await assert.rejects(
    first({}, "staff", "/api/subscriptions", body, async (path, options) => {
      original = options.idempotencyKey;
      throw new Error("Connection lost after commit");
    }),
    /Connection lost/,
  );
  const reloaded = createMutationIntents(() => storage);
  const result = await reloaded(
    {},
    "staff",
    "/api/subscriptions",
    { startsOn: body.startsOn, plan: body.plan, memberId: body.memberId },
    async (path, options) => {
      assert.equal(options.idempotencyKey, original);
      return { id: "one-subscription" };
    },
  );
  assert.equal(result.id, "one-subscription");
  assert.equal(storage.values.size, 0);
});

test("actor, operation and edited payload get separate pending keys", async () => {
  const { createMutationIntents } = await import("../idempotency.js"),
    storage = memory(),
    mutate = createMutationIntents(() => storage),
    form = {},
    keys = [];
  const failed = async (path, options) => {
    keys.push(options.idempotencyKey);
    throw new Error("Timeout");
  };
  for (const [actor, path, payload] of [
    ["staff", "/api/subscriptions", body],
    ["other", "/api/subscriptions", body],
    ["staff", "/api/bookings", body],
    ["staff", "/api/subscriptions", { ...body, plan: "ANNUAL" }],
  ])
    await assert.rejects(mutate(form, actor, path, payload, failed), /Timeout/);
  assert.equal(new Set(keys).size, 4);
});

test("acknowledged form retries replay, while a new form creates a deliberate new purchase", async () => {
  const { createMutationIntents } = await import("../idempotency.js"),
    storage = memory(),
    mutate = createMutationIntents(() => storage),
    form = {},
    keys = [];
  const success = async (path, options) => {
    keys.push(options.idempotencyKey);
    return { id: "result" };
  };
  await mutate(form, "staff", "/api/subscriptions", body, success);
  await mutate(form, "staff", "/api/subscriptions", body, success);
  await mutate({}, "staff", "/api/subscriptions", body, success);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test("unavailable persistent storage prevents sending an unprotected mutation", async () => {
  const { createMutationIntents } = await import("../idempotency.js");
  let sent = false;
  const mutate = createMutationIntents(() => ({
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage disabled");
    },
  }));
  await assert.rejects(
    mutate({}, "staff", "/api/subscriptions", body, async () => {
      sent = true;
    }),
    /Storage disabled/,
  );
  assert.equal(sent, false);
});
