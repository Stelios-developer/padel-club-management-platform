import assert from "node:assert/strict";

// Invoke only after all concurrent transactions settle and exactly one commits.
// PostgreSQL may abort a competing raw writer with 40P01 before 23P01 is visible.
// Retry that rolled-back DML once; it must hit the named exclusion, never succeed.
export async function assertConcurrentExclusion(
  error,
  statement,
  sql,
  constraint,
) {
  const excluded = (failure) => {
    assert.match(failure.stderr || "", /\b23P01\b/);
    assert.match(failure.stderr, constraint);
    return true;
  };
  if (/\b40P01\b/.test(error.stderr || ""))
    await assert.rejects(() => sql("padel_bookings", statement), excluded);
  else excluded(error);
}
