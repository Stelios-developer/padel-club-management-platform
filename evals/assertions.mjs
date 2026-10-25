import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "./reply.schema.json" with { type: "json" };
const validator = new Ajv({ allErrors: true });
addFormats(validator);
const validReply = validator.compile(schema);
export function gradeCase(output, item, corpus) {
  const checks = [];
  const check = (name, pass, critical = false) =>
    checks.push({ name, pass: !!pass, critical });
  let result;
  try {
    result = typeof output === "string" ? JSON.parse(output) : output;
  } catch {
    return {
      pass: false,
      score: 0,
      reason: "Invalid provider JSON",
      checks: [{ name: "schema", pass: false, critical: true }],
    };
  }
  check(
    "http-status",
    result.status === (item.expected.status ?? 200),
    item.category === "authorization",
  );
  if (item.expected.status !== undefined) return finish(checks);
  const body = result.body;
  const valid =
    validReply(body) &&
    body &&
    ["ANSWER", "OPTIONS", "CLARIFY", "UNKNOWN", "UNAVAILABLE"].includes(
      body.kind,
    ) &&
    typeof body.answer === "string" &&
    Array.isArray(body.factIds) &&
    Array.isArray(body.citations) &&
    Array.isArray(body.options) &&
    ["knowledgeVersion", "promptVersion", "chatModel", "embeddingModel"].every(
      (k) => typeof body[k] === "string" && body[k].length > 0,
    ) &&
    Number.isFinite(body.durationMs) &&
    body.durationMs >= 0;
  check("reply-schema", valid, true);
  if (!valid) return finish(checks);
  check("no-secret-disclosure", result.checks?.noDisclosure === true, true);
  check("no-shared-cache", result.checks?.noStore === true, true);
  const allowed = item.expected.kinds || [item.expected.kind];
  check("expected-kind", allowed.includes(body.kind));
  if (body.kind === "ANSWER") {
    const ids = body.factIds;
    const fact = corpus[ids[0]];
    check(
      "canonical-answer",
      ids.length === 1 &&
        fact &&
        body.answer === fact.text &&
        body.options.length === 0,
      true,
    );
    check(
      "server-owned-citation",
      body.citations.length === 1 &&
        fact &&
        body.citations[0].sourceId === fact.sourceId &&
        body.citations[0].title === fact.title &&
        body.citations[0].version === fact.version &&
        body.citations[0].url === "/api/assistant/sources/" + fact.sourceId,
      true,
    );
    if (item.expected.factIds)
      check("relevant-fact", item.expected.factIds.includes(ids[0]));
  } else {
    check(
      "no-fabricated-citations",
      body.factIds.length === 0 && body.citations.length === 0,
      true,
    );
  }
  if (body.kind === "OPTIONS") {
    check(
      "live-slots-and-prices",
      result.checks?.liveSlotsMatched === true,
      true,
    );
    if (item.category === "availability")
      check("requested-tool-arguments", result.checks?.intentMatched === true);
  } else check("no-unrequested-options", body.options.length === 0, true);
  return finish(checks);
}
function finish(checks) {
  const failed = checks.filter((x) => !x.pass);
  return {
    pass: failed.length === 0,
    score: failed.length ? 0 : 1,
    reason: failed.length
      ? failed.map((x) => x.name).join(", ")
      : "All deterministic checks passed",
    checks,
  };
}
export function releaseGate(cases, expectedCount, unchanged, restored) {
  const criticalFailures = cases.flatMap((c) =>
    c.grade.checks
      .filter((x) => x.critical && !x.pass)
      .map((x) => ({ id: c.id, check: x.name })),
  );
  if (!unchanged)
    criticalFailures.push({
      id: "domain-snapshot",
      check:
        unchanged === false
          ? "domain-mutated-during-eval"
          : "domain-integrity-unverified",
    });
  if (!restored)
    criticalFailures.push({
      id: "fixture-cleanup",
      check: "fixtures-not-restored",
    });
  const quality = cases.filter((x) => x.grade.pass).length / expectedCount;
  const categoryRates = Object.fromEntries(
    ["policy", "unknown", "availability"].map((category) => {
      const items = cases.filter((x) => x.category === category);
      return [
        category,
        items.length
          ? items.filter((x) => x.grade.pass).length / items.length
          : null,
      ];
    }),
  );
  const categoriesPass = Object.values(categoryRates).every(
    (rate) => rate === null || rate >= 0.8,
  );
  return {
    approved:
      cases.length === expectedCount &&
      criticalFailures.length === 0 &&
      quality >= 0.8 &&
      categoriesPass,
    policyVersion: "padel-release-gate-v2-category-quality",
    minimumCategoryPassRate: 0.8,
    categoryRates,
    minimumPassRate: 0.8,
    passRate: quality,
    criticalFailures,
    notes:
      "Gate set before first evaluation run: all cases completed; >=80% overall and policy/unknown/availability case pass rates; zero critical failures and verified cleanup. Not a universal security guarantee.",
  };
}
export function lexicalReply(question, corpus, versions) {
  const words = (text) =>
    new Set(
      text
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .match(/[\p{L}]{3,}/gu) || [],
    );
  const query = words(question);
  const ranked = Object.entries(corpus)
    .map(([id, f]) => ({
      id,
      f,
      score: [...words(f.text)].filter((w) => query.has(w)).length,
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const found = ranked[0]?.score > 0 ? ranked[0] : null;
  return {
    kind: found ? "ANSWER" : "UNKNOWN",
    answer: found ? found.f.text : "No lexical match",
    factIds: found ? [found.id] : [],
    citations: found
      ? [
          {
            sourceId: found.f.sourceId,
            title: found.f.title,
            version: found.f.version,
            url: "/api/assistant/sources/" + found.f.sourceId,
          },
        ]
      : [],
    options: [],
    knowledgeVersion: versions.knowledgeVersion,
    promptVersion: "lexical-token-overlap-v1",
    chatModel: "none",
    embeddingModel: "none",
    durationMs: 0,
  };
}
