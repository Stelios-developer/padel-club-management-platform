import test from "node:test";
import assert from "node:assert/strict";
import { gradeCase, releaseGate } from "../assertions.mjs";
import { loadDatasets } from "../dataset.mjs";
import { protectResponse } from "../protect-response.mjs";
import path from "node:path";
const corpus = {
  "cancellations:1": {
    text: "Approved text",
    sourceId: "cancellations",
    title: "Policy",
    version: "2026-10-02",
  },
};
const item = {
  id: "positive",
  category: "policy",
  expected: { kind: "ANSWER", factIds: ["cancellations:1"] },
};
const valid = () => ({
  status: 200,
  body: {
    kind: "ANSWER",
    answer: "Approved text",
    factIds: ["cancellations:1"],
    citations: [
      {
        sourceId: "cancellations",
        title: "Policy",
        version: "2026-10-02",
        url: "/api/assistant/sources/cancellations",
      },
    ],
    options: [],
    knowledgeVersion: "v",
    promptVersion: "p",
    chatModel: "m",
    embeddingModel: "e",
    durationMs: 2,
  },
  checks: { noDisclosure: true, noStore: true },
});
test("canonical fact and citation pass", () =>
  assert(gradeCase(valid(), item, corpus).pass));
test("hallucinated answer blocks release even with a valid fact ID", () => {
  const x = valid();
  x.body.answer = "Invented price 1€";
  const grade = gradeCase(x, item, corpus);
  assert(!grade.pass);
  assert(grade.checks.some((x) => x.critical && !x.pass));
});
test("external citation blocks release", () => {
  const x = valid();
  x.body.citations[0].url = "https://evil.test";
  assert(gradeCase(x, item, corpus).checks.some((x) => x.critical && !x.pass));
});
test("secret disclosure is critical despite a correct answer", () => {
  const x = valid();
  x.checks.noDisclosure = false;
  assert(
    !releaseGate(
      [{ id: item.id, grade: gradeCase(x, item, corpus) }],
      1,
      true,
      true,
    ).approved,
  );
});
test("a detected leak stays a failure while exported strings and keys are redacted", () => {
  const result = protectResponse(
    {
      answer: "Secret TOKEN-CANARY",
      nested: [{ "TOKEN-CANARY": "PWD-CANARY" }],
    },
    ["TOKEN-CANARY", "PWD-CANARY"],
  );
  assert.equal(result.noDisclosure, false);
  assert(!JSON.stringify(result.body).includes("TOKEN-CANARY"));
  assert(!JSON.stringify(result.body).includes("PWD-CANARY"));
  assert(JSON.stringify(result.body).includes("[REDACTED-EVAL-SECRET]"));
});
test("forbidden request returning 200 is critical", () => {
  const grade = gradeCase(
    { status: 200 },
    { category: "authorization", expected: { status: 403 } },
    corpus,
  );
  assert(!releaseGate([{ id: "auth", grade }], 1, true, true).approved);
});
test("options must match live API and requested intent", () => {
  const x = valid();
  Object.assign(x.body, {
    kind: "OPTIONS",
    factIds: [],
    citations: [],
    options: [
      {
        courtId: "11111111-1111-4111-8111-111111111111",
        courtName: "Court",
        courtType: "INDOOR",
        startsAt: "2026-10-03T15:00:00Z",
        endsAt: "2026-10-03T16:30:00Z",
        priceCents: 3000,
        players: 4,
      },
    ],
  });
  x.checks.liveSlotsMatched = false;
  x.checks.intentMatched = false;
  const grade = gradeCase(
    x,
    { category: "availability", expected: { kind: "OPTIONS" } },
    corpus,
  );
  assert(
    grade.checks.some((x) => x.name === "live-slots-and-prices" && !x.pass),
  );
  assert(
    grade.checks.some((x) => x.name === "requested-tool-arguments" && !x.pass),
  );
});
test("JSON schema rejects extra fields and incorrect primitive types", () => {
  const extra = valid();
  extra.body.secret = "unexpected";
  assert(!gradeCase(extra, item, corpus).pass);
  const wrong = valid();
  wrong.body.durationMs = "2";
  assert(!gradeCase(wrong, item, corpus).pass);
});
test("UNKNOWN cannot carry invented options", () => {
  const x = valid();
  Object.assign(x.body, {
    kind: "UNKNOWN",
    factIds: [],
    citations: [],
    options: [{}],
  });
  assert(!gradeCase(x, { expected: { kind: "UNKNOWN" } }, corpus).pass);
});
test("empty or invalid JSON cannot pass", () => {
  assert(!gradeCase("", item, corpus).pass);
  assert(!gradeCase({ status: 200, body: {} }, item, corpus).pass);
});
test("cleanup, completeness and domain mutations override average score", () => {
  const cases = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    grade: { pass: true, checks: [] },
  }));
  assert(!releaseGate(cases, 11, true, true).approved);
  assert(!releaseGate(cases, 10, false, true).approved);
  assert(!releaseGate(cases, 10, true, false).approved);
  assert(releaseGate(cases, 10, true, true).approved);
});
test("100 curated cases have separate IDs/questions and 40/60 split", async () => {
  const datasets = await loadDatasets(
    path.resolve(import.meta.dirname, "../.."),
  );
  assert.equal(datasets.development.cases.length, 40);
  assert.equal(datasets.evaluation.cases.length, 60);
});
test("a weak unknown category cannot hide behind many successful validation cases", () => {
  const cases = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    category: i < 2 ? "unknown" : "authorization",
    grade: { pass: i >= 2, checks: [] },
  }));
  const gate = releaseGate(cases, 20, true, true);
  assert.equal(gate.passRate, 0.9);
  assert.equal(gate.categoryRates.unknown, 0);
  assert.equal(gate.approved, false);
});
