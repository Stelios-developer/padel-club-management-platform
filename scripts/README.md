# Command catalogue

Run tools from the repository root. The root `package.json` is the common entry point; script paths remain stable for CI and existing operator runbooks.

`repository.mjs` dispatches the common commands. Its process/file-list support and source/publication policy live under `quality/`; the policy tests run with the other Node suites. Infrastructure-changing tools remain explicit commands, outside the default check/test tier.

## Development and checks

| Tool                                                       | Purpose                                                                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repository.mjs`                                           | `check`, `test`, `format` and `format:check`; default checks do not modify runtime data                                                                                                      |
| `sync-k8s-config.mjs`, `prepare-k8s.ps1`                   | Refresh canonical ConfigMap input copies or check drift; never deploy                                                                                                                        |
| `maven.ps1`                                                | Windows Maven launcher using the private `.tools` cache                                                                                                                                      |
| `backend-quality-report.mjs`, `resilience-report.mjs`      | Export actual Maven results; supply `--output` for the current run                                                                                                                           |
| `e2e.mjs`, `e2e.ps1`, `e2e/padel.mjs`, `e2e/reception.mjs` | Actual stack tests, including domain writes/fixture cleanup; use the dedicated project described in the E2E guide                                                                            |
| `user-journey.mjs`                                         | Real browser sign-in, onboarding, paid-subscription recording, booking/game/cancellation and mobile workflows; creates isolated fixtures and cleans them in the dedicated local test project |
| `apply-local-login-theme.mjs`, `repair-keycloak-basic.mjs` | Explicit local Keycloak maintenance; changes the local identity configuration                                                                                                                |

`node scripts/user-journey.mjs --experience` adds actual public registration, field validation, profile-completion guidance, visible booking-error checks and a mobile member journey. It uses the dedicated local stack, creates isolated fixtures and cleans them in `finally`. Results and the recovery journal are written under ignored `test-results/ux-walkthrough/`; see [experience walkthrough](../docs/UX-WALKTHROUGH.md).

Use `--browser chromium|firefox|webkit` to select the walkthrough engine and keep separate output folders. Add `--accessibility` to scan the real Greek identity forms with axe; incomplete findings are retained for human review. Run live walkthroughs serially. [Browser and accessibility scope](../docs/BROWSER-ACCESSIBILITY.md).

## Applied AI

`evaluate-assistant-robustness.mjs --split discovery|confirmation --output-dir docs/ai-evals/<new-run>` runs the separate frozen 40-question challenge set with the same real local session and graders. It preserves first-use confirmation even when the gate fails. [Scope, failed attempts and interpretation](../docs/AI-NATURAL-SEARCH.md).

| Tool                                         | Purpose                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `prepare-ai-local.mjs`, `check-ai-local.mjs` | Prepare private local AI configuration and check vector infrastructure                                        |
| `assistant-smoke.mjs`                        | Actual authenticated assistant/browser smoke; creates and cleans dedicated fixtures                           |
| `evaluate-assistant.mjs`, `ai-evals.ps1`     | Real-model evaluation of development or evaluation split; preserve first-use evidence and report failed gates |

See [AI setup](../docs/AI-ASSISTANT.md) and [evaluation rules](../docs/AI-EVALUATION.md). Model inference is not run by `npm test`.

## Performance

| Tool                          | Purpose                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `performance.mjs`             | Prepare, seed and measure the dedicated synthetic benchmark environment                          |
| `performance-report.mjs`      | Aggregate recorded comparative runs                                                              |
| `performance-local-smoke.mjs` | Check installed local booking behavior; pass a private `--output` to preserve historical reports |

Follow the [performance runbook](../docs/PERFORMANCE.md); benchmark volumes and fixtures are separate from club data.

## Production and recovery

| Tool                                                         | Purpose                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `prepare-production.mjs`, `operations/production-config.mjs` | Generate/validate a private production or explicitly local-test bundle             |
| `deploy-production.mjs`                                      | Deployment preflight/execution; `--check-only` validates without starting services |
| `production-check.mjs`, `production-services-check.mjs`      | Actual TLS/MFA/SMTP/service rehearsals with temporary fixtures                     |
| `backup.mjs`, `operations/backup.mjs`                        | Encrypted backup creation and shared backup support                                |
| `restore-check.mjs`, `backup-guards.mjs`                     | Restore into an isolated empty rehearsal target and verify rejection safeguards    |
| `protect-secrets.ps1`                                        | Restrict generated private files with Windows ACLs                                 |

Follow the [production runbook](../docs/PRODUCTION.md). These commands can change infrastructure or data and are deliberately absent from default development checks. Never run restore against the live project.

## Supply chain

| Tool                                       | Purpose                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `security-install.mjs`                     | Install pinned publisher-checksummed tools into `.tools/security/`                                   |
| `security-scan.mjs`, `security-policy.mjs` | Source/image scans and fail-closed exception/severity policy                                         |
| `security/image-identity.mjs`              | Bind exported image identities to native/CycloneDX inventory                                         |
| `security-deployment-check.mjs`            | Compare installed images and domain fingerprints to the prepared private snapshot                    |
| `security-web-smoke.mjs`                   | Isolated readonly/non-root Nginx smoke                                                               |
| `security-report.mjs`                      | Export a sanitized summary from a complete run; do not relabel historical evidence                   |
| `verify-release.mjs`                       | Verify real GitHub provenance/SBOM attestations for the exact repository, commit and registry digest |

Follow the [supply-chain runbook](../docs/SUPPLY-CHAIN.md). Unit policy fixtures are not cryptographic release evidence.

## Cloud

| Tool                                       | Purpose                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `cloud-check.mjs`, `cloud-config-scan.mjs` | Local Terraform schema/mock tests and configuration scan; no provisioning      |
| `cloud/release-policy.mjs`                 | Exact image manifest, host and rollback policy                                 |
| `cloud-release.mjs`                        | Verify a complete real GitHub release before producing the deployment manifest |
| `cloud-host-release.mjs`                   | Fixed Linux host controller for an approved AWS rollout                        |
| `cloud-report.mjs`                         | Export scoped local evidence and external-execution flags                      |

Follow the [cloud runbook](../docs/CLOUD.md). Cloud deployment remains disabled pending an account, budget and actual operator rehearsal.

All nested `scripts/**/*.test.mjs` run through the root `npm test` command. Private logs/downloads/backups belong under `.runtime/` or `.tools/`, not beside source files or in public documentation.
