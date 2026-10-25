const { test } = require("node:test");
const assert = require("node:assert/strict");
test("legacy booking notifications are Greek with Athens dates and original data stays intact", async () => {
  const { notificationCopy } = await import("../ui/notifications.js");
  const original = {
    title: "Your court is booked",
    detail:
      "Court 01 • 2026-10-13T08:00+03:00[Europe/Athens] • 60 minutes. Court fee payable at reception.",
  };
  const result = notificationCopy(original);
  assert.equal(result.title, "Η κράτηση επιβεβαιώθηκε");
  assert(result.detail.includes("08:00"));
  assert(result.detail.includes("60 λεπτά"));
  assert(result.detail.includes("στην υποδοχή"));
  assert(!result.detail.includes("Europe/Athens"));
  assert.equal(original.title, "Your court is booked");
});
test("registration and subscription notifications are translated, unknown content is preserved", async () => {
  const { notificationCopy } = await import("../ui/notifications.js");
  assert(
    notificationCopy({
      title: "Welcome to Padel Club",
      detail:
        "Your member profile is ready. Contact reception to activate a subscription.",
    }).detail.includes("Το προφίλ σου είναι έτοιμο"),
  );
  assert(
    notificationCopy({
      title: "Subscription activated",
      detail:
        "Club Monthly valid through 2026-11-12. Payment recorded at reception.",
    }).detail.includes("Μηνιαία συνδρομή"),
  );
  assert.equal(
    notificationCopy({ title: "Unknown <title>", detail: "custom detail" })
      .detail,
    "custom detail",
  );
  assert.equal(
    notificationCopy({
      title: "Your court is booked",
      detail: "Unexpected detail",
    }).detail,
    "Unexpected detail",
  );
});
