# Pre-publication audit — 11 October 2026

For current security and test results, see the [25 October final audit](FINAL-AUDIT-2026-10-25.md). The dated observations, counts and remaining limits below describe the original 11 October snapshot.

The reviewed source is ready for a first GitHub publication, with the limitations below. No upload, commit, GitHub execution or public deployment was performed. The machine-readable [audit summary](quality/prepublication-2026-10-11.json) records the scope.

## Corrections

- The local preview server now serves an explicit set of deployable assets. Package manifests, test/tooling files, environment files and encoded traversal requests return 404. Unsupported methods return 405. Two HTTP regression tests verify these boundaries and parity with the web Docker copy list.
- The backend Docker context excludes Git metadata, editor state and logs. The separate web context now allows only application assets and build configuration. Its image build passed with a 215.44 kB transferred context; the image was not deployed.
- README and contributor instructions now include Maven prerequisites and the first Chromium installation required by Playwright.

## Executed checks

| Check                            | Result and scope                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Source-only snapshot             | Only Git publication candidates copied; no original `.env`, dependencies, tools, build output or runtime data                         |
| Fresh dependency installation    | `npm ci` succeeded independently in snapshot `web/` and `evals/`, using their existing locks                                          |
| Backend snapshot build           | `clean package -DskipTests` passed for all default reactor modules, using the existing Maven download cache; no tests in this command |
| Node suites                      | **94 passed**, zero failures/skips, both in the workspace and source-only snapshot                                                    |
| Chromium                         | **54 passed**, zero unexpected/skipped/flaky results, across desktop and two mobile viewports in the snapshot                         |
| Deterministic AI harness         | Passed after fresh installation; fixtures only, including intended failures and cancellation; no real-model quality claim             |
| Formatting and repository checks | 104 Java files and formatted source passed; local links/imports, module ownership, frozen inputs and Kubernetes copies checked        |
| Compose                          | Configuration validated from `.env.example` in the snapshot; no containers started                                                    |
| Workflows                        | actionlint passed; local ShellCheck/Pyflakes were unavailable; no GitHub workflow was executed                                        |
| Source security                  | Trivy gate passed, **0 blocking findings**, **0 detected secrets**, **6 existing exception occurrences**; medium/low findings remain  |
| Publication content              | No oversized files, symbolic links, private-key/token patterns or personal machine paths found in publication candidates              |
| Screenshots                      | 31 visually reviewed: demo/test identities and contacts; no EXIF records. Public package maintainer metadata remains in SBOMs         |
| Preserved evidence               | SHA-256 checked against the pre-organization inventory: **45 historical/frozen files unchanged**                                      |

The earlier full backend run on the same unchanged Java sources passed **135 tests**, including PostgreSQL/RabbitMQ, fault scenarios and producer/consumer contracts. Its timestamp and detailed scope remain in [repository verification](REPOSITORY-QUALITY.md). The backend snapshot build does not count as a second test run.

The functional snapshot checks preceded the final changes to Docker ignore rules and audit documentation. The web context was verified by its image build; backend context exclusions were inspected without rebuilding backend images. The final snapshot was refreshed and its repository checks repeated. The final source inventory and raw logs stay in ignored `.runtime/prepublication/`.

## Remaining limits and first publication

Six precise temporary security exceptions remain until **4 November 2026**. Review their expiry and rerun the source gate before a later push. The new web image was built for checking its context; a full new ten-image security/release rehearsal was not performed. Real AI category quality gates remain unresolved. Kubernetes, AWS and a public deployment have not been exercised.

The repository has no commits or remote yet. After choosing the GitHub repository, review the staged file list, run the quality/security gates, then make the first commit and push. GitHub Actions, CodeQL and signed releases can only be verified after the repository exists. Configure repository environments and protections before enabling release/cloud workflows; cloud operations are already guarded by manual triggers and disabled-by-default activation variables.

There is no distribution license selected. Choose one before inviting external reuse. The development passwords and example accounts are intentional public fixtures and must be replaced for a shared deployment. The checks found no publication blocker under the current policy; they do not establish production readiness or guarantee the absence of every possible vulnerability.
