# Repository organization and verification — 11 October 2026

The repository keeps stable Maven/Compose module paths and makes ownership explicit in the [architecture map](ARCHITECTURE.md). The browser entry point delegates to separate state, pages, dialogs, events, components, assistant and application modules. Operator entry points remain stable and have a [command catalogue](../scripts/README.md).

The English [overview](../README.md), Greek [setup guide](README.el.md), [documentation index](README.md) and [developer guide](../CONTRIBUTING.md) form the maintenance entry points. Earlier reports are grouped by domain under `docs/results/`; later security, performance, AI and cloud experiments retain their established directories.

## Conventions enforced locally and in CI

- Editor settings, Git newline rules, pinned Prettier and checksum-verified google-java-format define a common style. All 104 Java source files passed formatting checks. Applied SQL migrations and frozen reports/datasets are excluded from reformatting.
- Root commands cover source checks, formatting, Node tests and Kubernetes copy parity. Repository checks live in `scripts/quality/`, separate from command dispatch and operations that change infrastructure.
- Publication checks reject private/generated paths even if tracked, including `.aws`, environments, key stores and Terraform variable/state/plan files. They check local links/imports, Java package ownership, declared cross-service imports and browser imports of tooling. These convention checks do not replace a secret scan or complete dependency analysis.
- Node.js 24 is consistent across package engine declarations and workflow jobs. External Actions and security tool pins retain their existing policy.
- The deterministic AI harness now writes ignored current results, with an explicit `--output` option, instead of replacing historical evidence. Its report is not a real-model quality assessment.
- The pull request template asks for behavior, actual validation and relevant operational impact.

## Security fixes discovered during the new scan

The current evaluator lockfile overrides transitive `simple-git` to **4.0.2**, bringing `@simple-git/argv-parser` to **2.0.1**. Only these two installed dependency versions changed. The evaluator tests and actual deterministic promptfoo harness passed after the update. The publisher documents the security-related change in the [official release](https://github.com/steveukx/git-js/releases/tag/simple-git%404.0.2). No new real-model evaluation or external API call was performed.

Kubernetes configuration files containing database/broker/SMTP credential bindings moved from the general ConfigMap into a generated `padel-spring-config` Secret. The Config Server combines it with non-sensitive service configuration through a read-only projected volume. The rendered manifest was checked for correct hashed references and exact canonical file contents. No cluster operation took place; Secrets still need appropriate RBAC/encryption in a real cluster.

The source gate passed with **zero blocking findings** and the **six existing exact exceptions**, expiring **4 November 2026**. No exception was added to hide the new findings. MEDIUM/LOW findings remain visible. This source result does not replace a fresh image scan or establish deployment readiness.

## Current verification

[Machine-readable results](quality/2026-10-11.json) record the run scope:

- Full Maven `clean verify` with contracts and PostgreSQL integration profile: **135 tests**, zero failures/errors/skips.
- Combined web/evaluator/operations/repository Node suites: **92 tests**, zero failures/skips.
- Chromium browser suite: **54 tests** across desktop and two mobile viewports, zero failures/skips/flaky results.
- Source syntax/publication/structure checks, Kubernetes copy parity and formatting checks passed.
- Actionlint passed without local ShellCheck/Pyflakes. Workflow definitions were not executed on GitHub.
- Deterministic promptfoo positive/negative/cancellation checks passed; this is harness evidence, not AI quality approval.
- All **45 existing historical JSON reports and frozen AI inputs** matched their pre-organization byte hashes after accounting for documented path moves.

Tests used isolated Testcontainers and the browser preview on port 3177. Existing club containers/data were not targeted for rollout, restore or fixture mutation. No Docker images were rebuilt/deployed as part of this verification. No GitHub upload, signed release, AWS provisioning or public demo was performed. AI quality gates remain unresolved as recorded in the [evaluation history](ai-evals/SUMMARY.md).
