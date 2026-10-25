# Local AI improvements — 12–13 October 2026

The later [natural-search and scope follow-up](AI-NATURAL-SEARCH.md) preserves the v12 results below as historical evidence.

The assistant now uses **v12 / qwen3:0.6b** with the existing EmbeddingGemma/pgvector corpus. The final development and evaluation runs are linked in the dated evidence summary below. Historical reports and the original frozen questions/labels remain unchanged. These repeated datasets are regression evidence, not an independent new holdout or a production certification.

## Behavior changes

- Policy requests first check the supported subject area. Missing opening-hour details, precise refund timing/amounts and unrelated facilities receive `UNKNOWN` rather than an unrelated club rule.
- Semantic retrieval returns up to six approved facts. Small bilingual intent hints distinguish booking requirements from entry requirements, invitation acceptance, chat confirmation and the end of the access window. The small model checks relevance of the selected fact. Answer text, fact IDs and source URLs remain owned by the server.
- Availability dates, times, duration, player count and indoor/outdoor preference are parsed into a typed search on the server. Clear Greek/English numeric and written-number forms are supported. Conflicting dates/fields, unsupported time expressions, negative preferences and action/URL requests produce `CLARIFY`. The read-only adapter uses the caller's token and real booking API; availability does not call Ollama.
- The local CPU workflow has a **25-second HTTP budget**, with **20 seconds per model exchange** and **3 seconds per booking exchange**, bounded by the remaining workflow time. The browser has a 45-second deadline. This calibration addresses a measured cold-start timeout; no quality threshold was lowered, and inference is not automatically retried.
- Model context/output limits are smaller. Provider errors expose only a safe message; bounded failure metrics and exception type diagnostics distinguish timeouts from dependency/circuit failures without logging question text or tokens. Malformed model decisions produce `UNKNOWN`.
- Failed DNS lookups are not cached in the assistant JVM. A v10 run identified `UnresolvedAddressException` immediately after Docker restored Ollama; v11 then passed the same outage/recovery sequence. The setting follows the [JDK negative DNS caching property](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/InetAddress.html). Positive caching and the no-inference-retry policy are retained.

The model remains small because the current Docker environment also runs the club services and other applications. No larger-model deployment or paid model API was introduced.

## Evidence

See [dated summary](results/ai/ai-improvements-2026-10-12.json), [final development run](ai-evals/2026-10-12/v12-development/development-results.json) and [final evaluation regression](ai-evals/2026-10-12/v12-evaluation/evaluation-results.json). The same project gate requires at least 80% overall and separately in policy/unknown/availability, zero critical failures, unchanged domain data and successful cleanup.

The current baseline on the pre-change service scored 33/40. The multi-fact generative selection experiment scored 28/40 and was rejected. The subsequent v7 evaluation scored 51/60 and failed its policy gate. Those reports remain beside the final runs. Later corrections addressed explicit policy facets, the cold-start exchange cap and a membership/fee ambiguity; they did not alter expected answers.

The final scoped unit suite covers canonical citations, unsupported questions, malformed model output, typed field preservation, ambiguous input and outage handling. Separate Toxiproxy tests exercise real Spring AI HTTP timeouts, recovery, bulkhead rejection, circuit opening and booking-adapter failure with synthetic provider output. Those synthetic outputs are transport tests, not model-quality measurements.

For latency, use the per-mode/per-case values in the raw reports. The mixed workload includes very fast clarification and availability requests; its p95 is not an isolated policy-model benchmark or a production SLO. The successful v9 development cold request took about 18.6 seconds after the smaller 12-second exchange cap had failed in v8.

## Repeat

Use the dedicated local `padel-e2e` and `padel-ai-local` projects, their development fixtures and installed models. Run one domain-writing suite at a time.

```sh
node scripts/evaluate-assistant.mjs --split development --output-dir docs/ai-evals/<new-run>/development
node scripts/evaluate-assistant.mjs --split evaluation --output-dir docs/ai-evals/<new-run>/evaluation
```

The runner verifies frozen dataset hashes, uses temporary identities and exact synthetic fixture IDs, checks domain snapshots and cleans up in `finally`. The development outage case stops and restores only the local Ollama container. Reports now default to a new timestamped directory and refuse overwriting an existing report. The original first-use evaluation stays in its original location and later runs remain marked as regressions.

## Limits

Success on these curated regressions does not prove every paraphrase, unsupported topic or attack will be handled correctly. The labels have not received an independent human review. A fresh, separately reviewed evaluation and observation under real usage remain useful next steps. One active request is admitted per deployment; overload returns 429. This local verification does not establish public deployment, signed release, cloud availability or general production readiness.

The [interface polish](INTERFACE-POLISH.md) adds Greek authentication and notifications, including outbound email presentation, and mobile booking cards.
