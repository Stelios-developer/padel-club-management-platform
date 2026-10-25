import test from "node:test";
import assert from "node:assert/strict";
import { assertConcurrentExclusion } from "./sql-conflicts.mjs";

const failure = (stderr) => Object.assign(new Error("SQL failed"), { stderr });
const constraint = /players_no_confirmed_overlap/;
const excluded = () => failure("ERROR: 23P01: players_no_confirmed_overlap");

test("raw SQL deadlock recovery replays exactly the failed DML and still requires the named exclusion", async () => {
  const calls = [];
  await assertConcurrentExclusion(
    failure("ERROR: 40P01: deadlock detected"),
    "original INSERT",
    async (...args) => {
      calls.push(args);
      throw excluded();
    },
    constraint,
  );
  assert.deepEqual(calls, [["padel_bookings", "original INSERT"]]);
});

test("an already excluded writer is not retried", async () => {
  await assertConcurrentExclusion(
    excluded(),
    "INSERT",
    async () => assert.fail("Unexpected retry"),
    constraint,
  );
});

test("successful retries, persistent deadlocks and unrelated failures never pass as exclusions", async () => {
  for (const retry of [
    async () => "committed",
    async () => {
      throw failure("40P01: still deadlocked");
    },
    async () => {
      throw failure("23P01: another_constraint");
    },
  ])
    await assert.rejects(
      assertConcurrentExclusion(failure("40P01"), "INSERT", retry, constraint),
    );
  await assert.rejects(
    assertConcurrentExclusion(
      failure("23503: invalid member"),
      "INSERT",
      async () => assert.fail("Must not retry"),
      constraint,
    ),
  );
});
