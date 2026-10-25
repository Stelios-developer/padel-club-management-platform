# Final source security and regression audit — 25 October 2026

The local pre-publication checks passed after correcting newly detected dependency findings and a Kubernetes scanner finding, and updating the browser test tooling. The first failing security scan and browser attempts are retained in the dated evidence. No commit, push, GitHub workflow execution or cloud deployment was performed.

The [machine-readable summary](quality/final-audit-2026-10-25.json) binds the counts, scope and source inventory. Historical reports and frozen AI datasets retain their original byte hashes.

## Verified results

| Check                     | Actual result and scope                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source security           | **PASSED**, **0 blocking findings**, **0 detected secrets**, with four existing scoped infrastructure exceptions                                                                                              |
| Backend                   | **150/150**, zero failures/errors/skips; clean Maven reactor build with `contracts,postgres-it`                                                                                                               |
| Real backend integrations | Included in the 150: **30 integration tests**, including PostgreSQL, RabbitMQ, pgvector and Toxiproxy; **13 producer** and **5 consumer contract tests**                                                      |
| Node suites               | **98/98**, zero failures/skips                                                                                                                                                                                |
| Browser suite             | **252/252**, 28 scenarios × nine projects; Chromium, Firefox and Windows WebKit at desktop, 390px and 320px; **0 retries/skips/flaky results** in the final run                                               |
| Real stack                | **60/60**, including authentication/authorization, booking concurrency, idempotency, transactional outbox, SMTP, reception and dependency recovery                                                            |
| New-user journey          | **17/17** in real Chromium, including public registration, validation, onboarding, subscription activation, booking, game participation, cancellation, mobile, logout/re-login and a sourced AI policy answer |
| Automated accessibility   | **117** controlled application scans and **4** real identity-form scans, with zero detected violations; incomplete/manual-review findings retained                                                            |
| Actual local AI           | **140/140 inspected regression cases**, comprising 40 development, 60 evaluation and 40 robustness cases; all quality gates and cleanup checks passed                                                         |
| Evaluation harness        | Clean `npm ci` followed by actual promptfoo positive, intentionally failing, critical-gate and cancellation checks; **promptfoo 0.125.0**                                                                     |
| Workflow syntax           | Local actionlint passed; this is not GitHub execution                                                                                                                                                         |
| Publication checks        | Private/generated paths, oversized files, links/imports, Java ownership, frozen datasets and Kubernetes source parity checked                                                                                 |

The [backend JUnit summary](results/backend/final-audit-2026-10-25.json) was exported after the complete clean build. Its integration/contract counts are subsets of the 150, not additional tests.

## Security corrections

The first scan, using the newly downloaded vulnerability database, found **nine blocking occurrences**: eight dependency findings and one Kubernetes configuration finding. There were no detected secrets. [Initial blockers and final findings](security/final-source-2026-10-25.json).

| Component               | Correction                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Evaluation engine       | promptfoo **0.123.1 → 0.125.0**, with a regenerated lockfile and clean installation                                             |
| MSAL Node               | Vulnerable **6.0.1 → 7.1.1** through an explicit override                                                                       |
| MCP SDK                 | **1.31.0 → 1.32.2**, covering two reported advisories                                                                           |
| body-parser             | **2.3.0 → 2.4.0**, with an override constrained to the 2.x line                                                                 |
| undici                  | **6.29.0 → 6.29.1** and **7.30.0 → 7.30.1**; the previous vulnerable 8.x dependency is no longer present                        |
| zod                     | **4.6.5 → 4.6.7** in the updated dependency graph                                                                               |
| Greek Keycloak messages | Moved password-like translation keys out of a ConfigMap into a dedicated Secret projection, preserving the expected theme paths |

The MSAL override also applies to an unused optional Azure provider whose parent still requests the old major version. Module-load/API-export smoke checks passed, and the local HTTP evaluator was exercised. Live Azure credential acquisition and other cloud providers were not tested. The override requires review when the provider adopts the patched major version.

The Kubernetes finding concerned **public translation labels**, including `password`, `showPassword` and `doForgotPassword`; it was not an actual credential disclosure. The message bundle now mounts from `padel-login-messages` alongside the public theme ConfigMap. A regression test checks the Secret reference, read-only mount and message path. No scanner rule or test assertion was disabled, and no Kubernetes deployment was performed.

Version reporting now reads and validates the installed promptfoo version against its pin. The historical 0.123.1 reports remain unchanged.

## Six exceptions reviewed; four remain

Two entries were removed without extending any expiry:

- **braces / CVE-2026-93687:** GitHub [withdrew the advisory on 23 October](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The refreshed scanner no longer reports it. This is an advisory withdrawal, not a claimed package patch.
- **node-forge / CVE-2026-85393:** the new promptfoo dependency graph no longer includes the package; the old exception is unnecessary.

The remaining entries retain their exact matching scope and **4 November 2026** expiry:

| Existing exception    | Reviewed scope and remaining limit                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| AWS-0104              | Undeployed demo HTTPS egress to dynamic registry/AWS/package/certificate endpoints; TCP 443 destination restriction remains unresolved |
| KSV-0014 / PostgreSQL | Undeployed scaffold still requires validation of writable paths/volume ownership before enforcing a read-only root                     |
| KSV-0014 / RabbitMQ   | Undeployed scaffold still requires a tested writable-volume design                                                                     |
| KSV-0014 / Keycloak   | Development scaffold uses `start-dev`; optimized image/runtime paths require cluster validation                                        |

The final scan still contains one CRITICAL and three HIGH infrastructure occurrences accepted by these existing exceptions. MEDIUM/LOW findings remain in the linked report. **Zero blocking findings does not mean zero findings**, and this audit is not production certification. Review the exceptions before their expiry or any actual rollout.

## Browser failures investigated and corrected

The first Playwright **1.63.0** full run passed **250/252**, with two Firefox timeouts. Traces show completed keyboard assertions followed by a context-teardown timeout in one case, and a navigation timeout in the other. A second attempt reproduced the teardown problem and was stopped to upgrade the tooling.

The teardown symptoms matched the documented Windows Firefox [upstream issue #42641](https://github.com/microsoft/playwright/issues/42641), fixed in the 1.64 line. Playwright was upgraded to the verified stable **1.64.1** and its corresponding browser binaries installed. The complete final run passed **252/252** with two workers, unchanged assertions and timeouts, and no automatic retries. Application code was not changed to accommodate the driver problem.

Windows WebKit is not actual Safari/macOS/iPhone testing. Automated axe scans retain incomplete findings for manual review; no WCAG certification or screen-reader verification is claimed.

## Real-model regression and interruption recovery

The 140 AI cases use the existing frozen, inspected datasets and deterministic graders, with the real local Ollama model and authenticated services. They are regressions, not an independent holdout or a general accuracy guarantee. The AI prototype label remains appropriate.

After development completed, an environment interruption stopped the runtime before evaluation could finish. The unfinished attempt is not counted as a completed measurement. Its temporary fixtures were recovered using the existing journal, removed by their exact identifiers, and the original domain snapshot restored before continuing. The first recovery setup returned HTTP 503 before any evaluation case executed while services were registering; its [unsuccessful setup report](ai-evals/2026-10-25/final-evaluation-recovered/evaluation-results.json) remains intact. After service registration converged, the evaluation set was rerun in a separate output directory. Each completed AI run verified unchanged domain state and successful fixture cleanup.

The real e2e/user journey can leave inactive synthetic profiles, cancelled bookings and event/audit/email-test history as documented by those runners. Temporary identities are removed and test fixtures made inactive. No external email or payment processing was used.

## Reproduction and boundaries

```sh
npm run check
npm run format:check
npm test
mvn -B -s infra/security/maven-settings.xml -Pcontracts,postgres-it clean verify
npm --prefix evals ci
npm --prefix evals run test:harness
npm --prefix web ci
node web/node_modules/@playwright/test/cli.js install chromium firefox webkit
node web/node_modules/@playwright/test/cli.js test --config=web/playwright.config.js --workers=2
node scripts/security-scan.mjs source
node scripts/e2e.mjs --resilience
node scripts/user-journey.mjs --experience --browser chromium --accessibility
```

Use the dedicated **padel-e2e** stack for the last two commands, and run domain-writing/evaluation suites serially. The security command also requires the pinned tools and `kubectl`; see the [supply-chain runbook](SUPPLY-CHAIN.md). The dated AI run paths, case counts and hashes are listed in the [audit summary](quality/final-audit-2026-10-25.json); a repeat requires new output directories.

This audit covers the publication source, lockfiles, build/tests, and rendered fixture-only Kubernetes manifests. It does **not** establish a fresh scan of all built release images, actual CodeQL analysis, signed GitHub releases, public hosting or a Kubernetes/AWS deployment. Those checks belong to the repository/release pipeline once connected.
