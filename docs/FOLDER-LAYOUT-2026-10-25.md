# Repository folder organization — 25 October 2026

The repository groups application code, infrastructure, tools, evaluations and documentation into six top-level directories. [Root overview](../README.md), [backend catalogue](../backend/README.md), [web catalogue](../web/README.md), [infrastructure catalogue](../infra/README.md) and [code map](CODE-MAP.md) provide entry points for a reviewer.

## Path mapping

All previous root Java modules now live at `backend/<original-name>/`: `common`, `config-server`, `discovery-server`, `api-gateway`, `member-service`, `subscription-service`, `booking-service`, `access-service`, `notification-service`, `assistant-service` and `contract-tests`. `config-repo/` moved to `backend/config-repo/`.

The root `pom.xml` remains the parent/reactor. Root Compose files, Docker build context and command entry points remain available. Maven uses the nested module paths and explicit child parent paths. Targeted commands use `-pl :artifact-id`. Container/service IDs, published artifact coordinates, APIs and schemas retain their names.

Docker builds, Compose mounts, production preparation, Kubernetes sync, performance tooling, CI workflows and test report readers resolve the new paths. Four Java test fixtures resolve the repository root from the new module depth. Production Java sources and applied migrations are preserved.

## Evidence

| Check                  | Result and scope                                                                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean Maven reactor    | **150/150**, no failures/errors/skips; 30 real-dependency integration tests, 13 producer and 5 consumer contract cases. [JUnit summary](results/backend/folder-layout-2026-10-25.json)                                                                                                                                |
| Node                   | **103/103**; includes the guard against legacy root modules bypassing Java ownership checks                                                                                                                                                                                                                           |
| Real local stack       | **54/54** functional E2E cases after the new image build; live service restart/fault scenarios were not rerun. [Final report](results/backend/folder-layout-e2e-final-2026-10-25.json)                                                                                                                                |
| New-user journey       | **17/17**, Chromium, real public registration, subscription, booking, mobile view, notifications and one sourced local AI policy answer; cleanup passed. Four identity accessibility scans had zero automatic violations, with manual-review items retained. [Report](results/frontend/folder-layout-2026-10-25.json) |
| Source security        | Passed: **0 blocking findings, 0 detected secrets**, under the same four infrastructure exceptions expiring 4 November 2026. MEDIUM/LOW and accepted infrastructure findings remain. [Final scan](security/folder-layout-source-final-2026-10-25.json)                                                                |
| Repository conventions | Published links/imports, Java ownership, frozen datasets, Kubernetes sync, pinned formatting for 115 Java sources and actionlint passed                                                                                                                                                                               |
| Local containers       | Ten application images built/installed and healthy; Config Server serves canonical service/application configuration through the new read-only mount                                                                                                                                                                  |
| Deployment preparation | New private local-test bundle generated; main, AI and generated production Compose configurations validated. Production was not deployed                                                                                                                                                                              |

[Machine-readable summary and source hashes](quality/folder-layout-2026-10-25.json). Previous [code organization results](CODE-ORGANIZATION-2026-10-25.md) describe the earlier UI/operator refactoring and remain separate. The original Docker build was interrupted before rollout; the resumed build and health checks completed after Docker Desktop was started again.

## E2E test correction

The [first run](results/backend/folder-layout-e2e-initial-2026-10-25.json) passed 47 cases and failed one reception rollback assertion: the test expected the global outbox count to remain at four, while the asynchronous publisher delivered those rows and removed them, leaving zero. The publisher deliberately deletes confirmed events, so a global queue length is not a stable transaction assertion.

The corrected test sends a unique attempt marker in the move reason and requires zero matching pending events and zero matching delivered notifications, both immediately and after a publication interval. Booking, history and idempotency rollback assertions remain. The complete functional suite then passed 54/54. Production Java was not changed to accommodate the test.

## Preservation and limits

Move-aware SHA-256 comparison preserved **83 production Java sources**, **17 SQL files**, **88 pre-existing historical JSON reports**, **6 frozen evaluation inputs/manifests**, **3 lockfiles** and **58 existing non-Markdown web files**. Four Java test fixtures changed only their repository-relative paths; POMs and build/tool consumers changed to resolve the new layout.

The full 252-case browser matrix and 140-case AI regression were not repeated in this folder-only stage; their earlier dated reports remain available. The new real journey covers one policy smoke, not overall model quality. Chromium and automatic accessibility scans do not establish actual Safari/iPhone support or WCAG certification. GitHub CI, signed releases, public deployment, license selection and first publication remain separate work.

Historical JSON reports and frozen evaluation data retain their original bytes. Paths inside old reports describe the layout at the time of execution; apply the mapping above when inspecting source today. Private tools, logs and generated output stay ignored.
