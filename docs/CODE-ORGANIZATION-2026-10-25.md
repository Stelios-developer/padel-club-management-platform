# Code organization and verification — 25 October 2026

This stage separated browser feature controllers, operator support code, and architecture/publication policies while retaining application behavior, CLI entry points and the then-current Maven paths. A subsequent [folder organization](FOLDER-LAYOUT-2026-10-25.md) moved those Maven modules under `backend/`; the results below describe this earlier stage. [Code map](CODE-MAP.md), [frontend maintenance](FRONTEND.md), [machine-readable evidence](quality/code-organization-2026-10-25.json).

## Changes

- `web/ui/dialogs.js` composes five factories for profile/onboarding, bookings, memberships, games and reception. Each factory receives only its required state and operations.
- `web/ui/events.js` composes action, field and form listeners. The common session/resource/submission guards, listener order, actor/request versions and error cleanup remain intact.
- The moved bodies of **14 functions/listeners** were compared with their original Acorn ASTs after formatting. Their semantic bodies match. This is additional structural evidence; the real browser tests remain the behavior check.
- The preview asset list and recursive Docker-parity test include the eight nested UI modules. The Docker context includes them, and the web image was rebuilt and installed locally.
- Shared operator modules and tests are grouped under `scripts/operations/`, `security/`, `cloud/`, `e2e/` and `quality/`. Root CLI commands retain their paths. Imports, targeted workflow commands and runbooks were updated together.
- The security CLI delegates to a pure policy module while retaining its exports and command behavior. Publication path policy, source checks and repository orchestration have separate modules.
- Source conventions now check Java package/directory correspondence, production imports of test libraries, all runtime browser modules' dependency boundaries, reserved UI directory contents and circular browser imports.
- The root overview has less repeated chronology. The code map, contribution guide, frontend guide and operator catalogue provide current extension points; dated reports retain the history.

The source checks complement compilation and tests; they are not a complete JavaScript parser, bytecode architecture analysis or security certification.

## Support module paths

| Previous path under `scripts/`             | Current path                                    |
| ------------------------------------------ | ----------------------------------------------- |
| `backup-lib.mjs`                           | `operations/backup.mjs`                         |
| `production-config.mjs` and its test       | `operations/production-config.mjs` and its test |
| `cloud-release-policy.mjs` and its test    | `cloud/release-policy.mjs` and its test         |
| `security-image-identity.mjs` and its test | `security/image-identity.mjs` and its test      |
| `security-policy.test.mjs`                 | `security/policy.test.mjs`                      |
| `e2e-padel.mjs`                            | `e2e/padel.mjs`                                 |
| `e2e-reception.mjs`                        | `e2e/reception.mjs`                             |

`security-policy.mjs` remains the root CLI/facade; pure decisions live in `security/policy.mjs`. Older JSON reports may name a support file's original path because they describe the source at their recorded date.

## Verification after the changes

| Check                              | Result                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root Node tests                    | **102/102**, zero failures/skips; includes nested policy tests and HTTP asset-boundary tests                                                                |
| Full Playwright suite              | **252/252**, Chromium/Firefox/Windows WebKit × three viewports, zero skips/retries/flaky results                                                            |
| Actual functional stack            | **54/54**, using the relocated game/reception suites without the optional fault/restart scenarios                                                           |
| Actual public-registration journey | **17/17**, including persisted profile/subscription/booking, participation, cancellation, mobile, re-login and one sourced AI policy answer; cleanup passed |
| Source security                    | Gate **PASSED**, **0 blocking findings**, **0 detected secrets**; four existing infrastructure exceptions retain their original expiry                      |
| Workflow syntax                    | actionlint passed; no GitHub job executed                                                                                                                   |
| Local web package                  | Image rebuilt, eight nested modules present, Nginx configuration passed, actual journey used port 3000                                                      |
| Repository checks                  | Syntax, published links/imports, source boundaries, browser cycles, frozen data and Kubernetes source parity passed                                         |

SHA-256 verification preserved **93 historical/frozen files**, **127 Java/Maven files**, **17 SQL files** and **3 dependency lockfiles** byte-for-byte. The groups can overlap and are not a total source-file count.

Backend Java/POMs, migrations and dependency versions were not changed. The earlier [150-test clean backend run and 60-case resilience run](FINAL-AUDIT-2026-10-25.md) remain their original evidence; they are not described as fresh runs here. The new live journey contains one AI policy smoke, while the earlier 140-case model regression remains the broader AI evidence. No new model-quality claim follows from organizing the UI.

Only the local web container was rebuilt for this change. No GitHub commit/push, signed release, cloud deployment, Kubernetes rollout or migration was performed. Windows WebKit is not actual Safari/iPhone testing, and automated accessibility checks retain their existing manual-review limits.

## Repeat

```sh
npm run check
npm run format:check
npm test
node web/node_modules/@playwright/test/cli.js test --config=web/playwright.config.js --workers=2
node scripts/e2e.mjs
node scripts/user-journey.mjs --experience --browser chromium --accessibility
node scripts/security-scan.mjs source
```

Run the two live suites serially against the dedicated `padel-e2e` stack. The [operator catalogue](../scripts/README.md) describes tools that need Docker, local models or pinned scanner dependencies. Private logs and transformation snapshots remain in ignored `.runtime/organization-2026-10-25/`.
