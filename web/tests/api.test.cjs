const { test } = require("node:test");
const assert = require("node:assert/strict");
const never = () => new Promise(() => {});

test("missing membership explains the next step while other conflicts keep their detail", async () => {
  const { createApiClient } = await import("../api.js");
  for (const [detail, expected] of [
    [
      "An active subscription is required on the booking date.",
      "Χρειάζεται ενεργή συνδρομή την ημέρα του παιχνιδιού. Δες τα προγράμματα στις Συνδρομές και ενεργοποίησέ τη στην υποδοχή.",
    ],
    ["This slot was just booked.", "This slot was just booked."],
  ]) {
    const send = createApiClient({
      getToken: async () => "test",
      fetchImpl: async () =>
        new Response(JSON.stringify({ detail }), { status: 409 }),
    });
    await assert.rejects(
      send("/api/bookings", { method: "POST", body: { players: 2 } }),
      (error) => error.status === 409 && error.message === expected,
    );
  }
});

test("timeout aborts a stalled fetch and does not retry", async () => {
  const { createApiClient } = await import("../api.js");
  let calls = 0,
    signal;
  const send = createApiClient({
    getToken: async () => "test",
    timeoutMs: 20,
    fetchImpl: async (path, options) => {
      calls++;
      signal = options.signal;
      return never();
    },
  });
  await assert.rejects(
    send("/api/courts"),
    (error) => error.code === "TIMEOUT",
  );
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});
test("deadline also bounds token refresh and response-body reads", async () => {
  const { createApiClient } = await import("../api.js");
  let calls = 0;
  const waitingToken = createApiClient({
    getToken: never,
    timeoutMs: 20,
    fetchImpl: async () => {
      calls++;
    },
  });
  await assert.rejects(
    waitingToken("/api/bookings"),
    (error) => error.code === "TIMEOUT",
  );
  assert.equal(calls, 0);
  const waitingBody = createApiClient({
    getToken: async () => "test",
    timeoutMs: 20,
    fetchImpl: async () => ({ ok: true, text: never }),
  });
  await assert.rejects(
    waitingBody("/api/bookings"),
    (error) => error.code === "TIMEOUT",
  );
});
test("POST timeout warns about ambiguous completion and keeps the mutation key without retrying", async () => {
  const { createApiClient } = await import("../api.js");
  let options;
  const send = createApiClient({
    getToken: async () => "test",
    timeoutMs: 20,
    fetchImpl: async (path, input) => {
      options = input;
      return never();
    },
  });
  await assert.rejects(
    send("/api/bookings", {
      method: "POST",
      body: { players: 4 },
      idempotencyKey: "same-key",
    }),
    (error) =>
      error.code === "TIMEOUT" &&
      error.message.includes("μπορεί να έχει καταχωριστεί"),
  );
  assert.equal(options.headers["Idempotency-Key"], "same-key");
  assert.equal(options.body, '{"players":4}');
});
test("caller cancellation settles immediately and stops network work", async () => {
  const { createApiClient } = await import("../api.js");
  let networkSignal;
  const send = createApiClient({
      getToken: async () => "test",
      fetchImpl: async (path, options) => {
        networkSignal = options.signal;
        return never();
      },
    }),
    controller = new AbortController();
  const pending = send("/api/courts", { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(networkSignal.aborted, true);
});
test("an already cancelled request does not start fetch", async () => {
  const { createApiClient } = await import("../api.js");
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const send = createApiClient({
    getToken: async () => "test",
    fetchImpl: async () => {
      calls++;
    },
  });
  await assert.rejects(
    send("/api/courts", { signal: controller.signal }),
    (error) => error.name === "AbortError",
  );
  assert.equal(calls, 0);
});
test("HTML service errors preserve HTTP status and successful JSON or empty responses work", async () => {
  const { createApiClient } = await import("../api.js");
  for (const status of [401, 403, 500, 502, 503]) {
    const send = createApiClient({
      getToken: async () => "test",
      fetchImpl: async () => new Response("<html>Error</html>", { status }),
    });
    await assert.rejects(
      send("/api/courts"),
      (error) => error.status === status,
    );
  }
  const json = createApiClient({
    getToken: async () => "test",
    fetchImpl: async () => new Response('[{"id":"court"}]'),
  });
  assert.deepEqual(await json("/api/courts"), [{ id: "court" }]);
  const empty = createApiClient({
    getToken: async () => "test",
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.equal(await empty("/api/bookings/one", { method: "DELETE" }), null);
});
