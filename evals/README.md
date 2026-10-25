# AI evaluation harness

Local, reproducible checks for the optional assistant. This package owns the evaluation protocol and graders; model orchestration lives in [backend/assistant-service](../backend/assistant-service/). It uses locked development dependencies independently of the web application.

| Location                              | Responsibility                                             |
| ------------------------------------- | ---------------------------------------------------------- |
| `datasets/`, `dataset-manifest.json`  | Frozen development/evaluation cases and SHA-256 identities |
| `robustness/`                         | Additional discovery/confirmation cases                    |
| `assertions.mjs`, `reply.schema.json` | Deterministic grading and response shape                   |
| `local-session.mjs`                   | Real local session, fixtures, snapshot checks and cleanup  |
| `promptfoo-runtime.mjs`               | Pinned evaluator integration and runtime identity          |
| `protect-response.mjs`                | Response handling for evaluation                           |
| `harness-check.mjs`, `tests/`         | Harness negative controls and unit regressions             |

## Run checks

From the repository root, using Node.js 24+:

```sh
npm --prefix evals ci
npm run test:evals
npm --prefix evals run test:harness
```

Real evaluations also require the ready local application, model and knowledge index. Run them serially with other suites that write domain fixtures. See the [evaluation protocol](../docs/AI-EVALUATION.md) for commands, gates, cleanup and output selection, and the [AI setup](../docs/AI-ASSISTANT.md) for prerequisites.

Do not regenerate the frozen inputs to improve a score. Cases inspected during tuning are regression evidence, including the package's historically named `eval:holdout` command. Fresh independent questions and human assessment remain separate from passing these regressions. Historical results under [docs/ai-evals](../docs/ai-evals/) retain their timestamps and scope; transient output stays ignored.
