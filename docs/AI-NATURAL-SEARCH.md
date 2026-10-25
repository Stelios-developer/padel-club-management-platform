# Natural search and stricter AI scope — 13 October 2026

The final **v15 passed 140/140 local regression cases**: the original 40 development + 60 evaluation cases and the new 24 discovery + 16 confirmation cases. All category gates passed, with zero critical failures, unchanged domain snapshots and successful fixture cleanup. Discovery increased from 14/24 on v12 to 24/24. First-use confirmation remained 14/16; its later 16/16 result is regression evidence after fixes, not a fresh holdout.

The final source passed **38 unit tests**, **97 repository Node tests**, **63 scoped assistant/accessibility browser checks** and **seven real mobile web checks** covering Greek sign-in, a draft example, natural availability, live slot/price validation, a populated confirmation form without booking, field-specific clarification and unsupported-topic handling. Four HTTP fault and two pgvector integration checks ran on v14 with the same transport/DNS settings; final v15 unit and actual-model runs verify its date/retrieval changes. [Dated result and exact scope](results/ai/ai-natural-search-2026-10-13.json).

The local assistant accepts more natural Greek and English searches and makes the interpreted date/time/duration/player count visible before booking confirmation. It stays on the existing local qwen3:0.6b model, approved corpus and authenticated read-only booking adapter.

## Behavior

- Explicit clocks such as `6 pm`, `six pm`, `7:30 μ.μ.` and `στις έξι το απόγευμα` become 24-hour times. A bare `στις έξι` remains ambiguous. Malformed clocks, conflicting times and time ranges produce clarification rather than silently becoming an 08:00 search.
- Exact durations such as `one hour`, `1.5 hours`, `μιάμιση ώρα` and `δύο ώρες` become 60/90/120 minutes. Unsupported fractional minutes are not rounded. Conflicting hour/minute quantities require clarification.
- Weekdays use the upcoming occurrence in Europe/Athens, including today. `next` / `επόμενη` / `ερχόμενη` means the strictly following occurrence. Multiple different dates are rejected. Recurring requests such as `κάθε Τρίτη` are directed to the existing booking workflow; they do not silently become a single date. The concrete date is shown in the response and the user still confirms through the booking form.
- Clarification explains whether the missing/conflicting field is time, date, duration, players, court preference or an unsupported action. The reply schema is unchanged.
- Retrieval combines the existing version-filtered semantic results with specific policy facets from the approved catalog. This recovers booking requirements for an expired membership and recognizes invitation wording. Numerical cancellation questions distinguish exactly 120 minutes from more than 120 minutes. The model still checks relevance; answer text and citations remain canonical and owned by the server. This is a small semantic/facet hybrid, not BM25 or a general-purpose reranker.
- Equipment, medical requirements, insurance and discounts have no approved facts in the current corpus. These subjects return `UNKNOWN`, even if a related membership or entry rule exists. The exclusion list must be reviewed if the corpus later adds approved policies for those subjects.
- Editable examples switch mode and focus the question field without sending a request. Results distinguish sourced answers, available times, clarification, unknown information and temporary unavailability.

The HTTP budget, provider timeouts, single-request bulkhead, no-model-retry policy, JWT audience/role checks and read-only tools are retained. No paid model API, larger-model download, cloud deployment or additional production traffic was introduced.

## New measurement design

Forty questions were frozen before implementation under `evals/robustness/`: 24 discovery cases and 16 confirmation cases. The runner checks their hashes and rejects duplicate normalized questions across these sets and the original 100 cases. It checks canonical facts/citations, actual live slots/prices, preserved caller arguments, no secret disclosure, no shared HTTP caching, domain snapshots and fixture cleanup using the existing graders.

These questions were written by the implementing assistant from the application requirements. They are not independently human reviewed. Discovery supports debugging; confirmation was first executed after the initial implementation. Once inspected or used for fixes, either set is regression data.

The v12 baseline passed **14/24 discovery cases**. The v13 passed **24/24 discovery**, then **14/16 on first-use confirmation**. Although the overall confirmation score was 87.5%, its gate failed because unsupported-topic accuracy was only 50%. Those reports and the first-use marker are retained. A v13 attempt with zero evaluated cases is also retained as a setup failure immediately following service replacement; cleanup succeeded. None of these reports is replaced by later successes.

The v14 addresses the uncovered equipment/medical topics. The original 40/60 sets, labels and quality thresholds remain unchanged; the robustness gate uses the same 80% overall/category thresholds, zero critical failures and successful integrity/cleanup requirements.

The v14 regression run passed 39/40 original development and 59/60 original evaluation. Its newly supported weekdays incorrectly treated a recurring request as one date, and broad chat facet hints admitted the assistant-role fact ahead of the booking-confirmation fact. These failures remain in the evidence. The v15 adds an explicit recurrence guard and narrows the chat facet to the approved conversation-confirmation rule. The unchanged HTTP/DNS settings passed four real Toxiproxy fault tests on v14; two real pgvector tests used deterministic synthetic embeddings. Final v15 unit/model runs verify the later date/retrieval changes.

## Repeat locally

```sh
node scripts/evaluate-assistant-robustness.mjs --split discovery --output-dir docs/ai-evals/<new-run>/discovery
node scripts/evaluate-assistant-robustness.mjs --split confirmation --output-dir docs/ai-evals/<new-run>/confirmation
node scripts/evaluate-assistant.mjs --split development --output-dir docs/ai-evals/<new-run>/original-development
node scripts/evaluate-assistant.mjs --split evaluation --output-dir docs/ai-evals/<new-run>/original-evaluation
```

Use the dedicated local stack and run domain-writing suites serially. Existing reports are never overwritten. The confirmation first-use report is retained even when its gate fails. Actual fixtures are journaled privately under `.runtime/ai-evals/` and removed in `finally`.

This work does not establish general language understanding, complete prompt-injection resistance, independent evaluation or production availability. Greeklish, arbitrary typos, multi-question conversation memory and unsupported time intervals are not claimed. The small curated corpus still needs ongoing review and real-user observation.
