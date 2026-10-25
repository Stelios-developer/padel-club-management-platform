# Developer guide

Run commands from the repository root unless a guide explicitly says otherwise. [Repository overview](README.md), [documentation](docs/README.md) and [script catalogue](scripts/README.md) are the entry points.

## Prerequisites

- Node.js 24+ for the workspace quality/operations tools.
- Java 21+ and Maven 3.9.x for the backend. `scripts/maven.ps1` supports the existing private Windows tool cache.
- Docker with Linux containers for Testcontainers and the full stack.
- `npm --prefix web ci` and `npm --prefix evals ci` for locked development dependencies. The root package is a command dispatcher and has no dependencies.

Browser tests require matching Chromium, Firefox and WebKit builds: run `npx playwright install chromium firefox webkit` from `web/` after installing its dependencies. On Linux, use `--with-deps` when system libraries are missing. The preview HTTP tests use ephemeral loopback ports; test environments must allow local connections.

## Module boundaries

The [architecture and ownership map](docs/ARCHITECTURE.md) identifies where each responsibility belongs. `npm run check` rejects cross-service Java imports, misplaced Java package declarations and browser imports of operator/test tooling. This static convention check complements compile, contract and integration tests.

Java modules live under `backend/`; the root POM declares the reactor and child POMs resolve `../../pom.xml`. Run targeted builds with `mvn -pl :booking-service -am verify`. Docker, Compose, contracts and CI resolve the same paths. See the [backend catalogue](backend/README.md). Each domain service owns its persistence and migrations. Cross-service calls go through explicit clients/API contracts, not another service's repository. Use `common` for DTOs and infrastructure needed by several services; do not turn it into shared domain persistence.

Existing Java packages are organized by service. Put a new substantial feature in its own package when that clarifies ownership; avoid moving every small controller/entity into generic technical folders. Web orchestration stays in `web/ui/`; dialog factories live under `web/ui/dialogs/` and action/form/field bindings under `web/ui/events/`. Authentication, request handling, idempotency, reception and game logic remain separate modules. See the [code map](docs/CODE-MAP.md) before adding a module.

Operator commands retain their root `scripts/` entry points. Shared implementation and policy tests belong under `scripts/operations/`, `scripts/security/`, `scripts/cloud/`, `scripts/e2e/` or `scripts/quality/`. Keep pure policy independent of the CLI that reads arguments or writes reports. Root `npm test` discovers the nested test files.

The repository check rejects browser cycles, browser imports of Node/npm/operator tooling, misplaced Java packages and production Java imports of test libraries. It is a source convention check, not a complete language parser or bytecode dependency analysis. Browser UI directories contain runtime JavaScript only. New UI modules must be added to the preview server's public asset list; its recursive Docker-parity test checks that the deployed and preview asset sets match.

## Formatting and generated files

`.editorconfig`, `.gitattributes`, `.prettierrc.json` and `infra/quality/toolchain.json` define repository conventions. Java uses google-java-format 1.28.0; JavaScript, CSS, HTML, YAML, JSON configuration and Markdown use the existing Prettier 3.9.9. Terraform retains its pinned `terraform fmt` workflow. SQL migrations are immutable after application; do not reformat or rewrite old migrations to satisfy a style preference.

```sh
npm run format
npm run format:check
npm run check
```

The Java formatter jar is downloaded into ignored `.tools/quality/` and verified against the pinned official release SHA-256 before execution. A publisher digest is not independent signature verification. On offline machines provision that same jar first. Commands fail if installed Prettier is not the pinned version.

`backend/config-repo/`, `infra/keycloak/`, `infra/postgres/init.sql` and `web/app-config.json` are the canonical Kubernetes input sources. Refresh copies with `npm run sync:k8s`; `npm run sync:k8s:check` detects drift. Never edit `infra/k8s/config/` directly. The PowerShell helper delegates to the same cross-platform implementation. No sync command contacts a cluster.

Frozen AI datasets, their manifest and historical JSON evidence are excluded from formatters and Git newline conversion. Their original byte hashes and timestamps matter. Generated `target/`, `.terraform/`, browser results, `.runtime/` and `.tools/` stay outside the published source.

The deterministic AI harness writes current evidence to ignored `test-results/ai-eval-harness.json`. Use `--output REPORT` to choose an explicit root-relative destination; it no longer replaces the historical report in `docs/ai-evals/`.

## Test tiers

| Command                                       | Scope                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run check`                               | Source syntax, published local Markdown links/imports, frozen dataset hashes and Kubernetes copy parity |
| `npm test`                                    | Node web, evaluator and operations-policy tests; no Docker or model inference                           |
| `mvn -B clean verify`                         | Backend unit/security/API tests                                                                         |
| `mvn -B -Pcontracts,postgres-it clean verify` | Producer/consumer contracts and isolated PostgreSQL/RabbitMQ/Toxiproxy/pgvector tests; Docker required  |
| `npm run test:browser`                        | Playwright against its dedicated synthetic preview server on port 3177                                  |
| `npm --prefix evals run test:harness`         | Deterministic promptfoo harness; does not establish real-model quality                                  |

Use `clean` when switching Maven profiles so generated classes and old test reports cannot be mistaken for current results. Run the tier affected by the change; full image/deployment/backup rehearsals are deliberate operations, not part of the default test command. AI evaluations, security scans, k6 and deployment tools have additional requirements in their guides.

## Changes and review

- Keep behavior refactors separate from dependency upgrades and historical evidence. Update the relevant tests when changing an invariant.
- Preserve booking exclusion constraints, persisted idempotency, JWT ownership checks, outbox transaction boundaries and human confirmation for AI actions.
- Add a new Flyway migration for a schema change. Check compatible deployment/rollback behavior; a container rollback does not undo a database migration.
- Do not import user databases into demos. Integration fixtures must be isolated and cleanup must target only fixtures created by that run.
- Record new evidence under a clearly dated report; preserve older results. Do not describe regression runs as first-use held-out evaluations.
- Update the guide, local link/import check, Docker copy list and command catalogue when changing paths. Avoid shell-built file paths or commands containing credentials.

## Before GitHub publication

Run fresh source/security checks and review the exact files being staged. Ignore rules are a first boundary, not secret detection. `.env.example` and realm passwords are intentional local fixtures; actual `.env*`, secret files, backups, state, plans, tokens and local runtime output must not be published.

The project uses the [MIT License](LICENSE). Do not invent a maintainer email, successful CI badge or deployed demo URL. Link published artifacts and hosted checks only after confirming they exist.
