# Documentation index

Start with the [English overview](../README.md), [Greek setup and product guide](README.el.md) or [developer guide](../CONTRIBUTING.md). The application UI is Greek; the repository overview and maintenance entry points are English.

The [code map](CODE-MAP.md) locates implementation owners and extension points. Start with the directory guides for [backend](../backend/README.md), [web](../web/README.md), [infrastructure](../infra/README.md) and [operator tools](../scripts/README.md). The [folder organization](FOLDER-LAYOUT-2026-10-25.md) records path mappings and verification; the [earlier code refactoring](CODE-ORGANIZATION-2026-10-25.md) covers UI and operator composition.

[Recruiter demo — 1:44](recruiter-demo/README.md) includes the narrated walkthrough, storyboard, English/Greek captions, cover and recording/verification scope.

## Product and API

- [API and idempotency contracts](API.md)
- [Padel games, participation, waitlists and weekly series](PADEL-PLAY.md)
- [Reception, attendance, rescheduling and audit history](RECEPTION.md)
- [Database-enforced booking exclusions](BOOKING-CONSTRAINT.md)

## Frontend

- [Firefox, WebKit, accessibility and Greek polish verification](BROWSER-ACCESSIBILITY.md)
- [Greek authentication/notifications and mobile booking cards](INTERFACE-POLISH.md)
- [New member registration and complete experience walkthrough](UX-WALKTHROUGH.md)
- [Real user journey, regression checks and current limits](USER-VERIFICATION.md)
- [Module ownership, browser tests and responsive behavior](FRONTEND.md)
- [Current sports visual design and verification](SPORT-DESIGN.md)
- [Previous modern visual design, 2 October](MODERN-DESIGN.md)
- [Resource failure isolation and session recovery](FRONTEND-RESILIENCE.md)
- [Current dashboard screenshot](screenshots/sport-dashboard.png)

## Backend and reliability

- [Repository architecture and ownership](ARCHITECTURE.md)
- [Testcontainers and producer/consumer contracts](BACKEND-QUALITY.md)
- [Resilience4j and actual dependency fault tests](BACKEND-RESILIENCE.md)
- [Full-stack test setup](E2E.md)
- [k6/JFR/PostgreSQL performance experiment](PERFORMANCE.md)

## Applied AI

- [Natural Greek/English searches, new challenge questions and stricter scope](AI-NATURAL-SEARCH.md)
- [Current AI quality, cold-start and recovery improvements](AI-IMPROVEMENTS.md)
- [Local AI infrastructure](AI-LOCAL.md)
- [Spring AI assistant and read-only tools](AI-ASSISTANT.md)
- [Frozen evaluation datasets and quality gates](AI-EVALUATION.md)
- [Evaluation results and failed category gates](ai-evals/SUMMARY.md)

## Operations and security

- [Production preparation, TLS/MFA, backups and restore](PRODUCTION.md)
- [Supply chain, vulnerability exceptions and signed-release preparation](SUPPLY-CHAIN.md)
- [AWS architecture decision and activation runbook](CLOUD.md)
- [Operations command catalogue](../scripts/README.md)

## Evidence

- [Final security, clean backend, full browsers, real stack and AI audit — 25 October 2026](FINAL-AUDIT-2026-10-25.md)
- [Pre-publication audit, source-only snapshot and corrections](PREPUBLICATION.md)
- [Repository organization and fresh verification, 11 October 2026](REPOSITORY-QUALITY.md)

Historical JSON evidence is grouped under `results/backend/`, `results/frontend/`, `results/e2e/`, `results/production/` and `results/ai/`. Later experiments retain their established `ai-evals/`, `performance/`, `security/` and `cloud/` directories. These files are reports, not runtime configuration; do not edit or reformat them to manufacture current results.

The [verification history](VERIFICATION.md) links each result to its original date and scope. Local mocks and tests do not establish an AWS deployment or a successful GitHub release.
