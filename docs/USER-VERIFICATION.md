# User workflow verification — 12 October 2026

The local application was tested after the sports redesign using both isolated browser fixtures and real browser sessions against Nginx, the API gateway, Keycloak and the domain services. The final real-browser journey passed all 16 steps. A staff onboarding problem was found and corrected; an intermittent AI availability failure remains documented below.

## Results

| Check                     | Result                                | Scope                                                                                                                       |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Real browser journey      | **16 passed, 0 failed**               | Actual OIDC/PKCE login and UI actions at `localhost:3000`; no mocked transport                                              |
| Functional stack suite    | **54 passed, 0 failed**               | Real PostgreSQL, RabbitMQ, local SMTP, authorization and domain consistency; no outage/restart scenarios in this run        |
| Chromium regression suite | **60 passed, 0 failed/skipped/flaky** | 20 scenarios at desktop 1280×900, mobile 390×844 and small mobile 320×740, using demo data or controlled transport fixtures |
| Node suites               | **94 passed, 0 failed/skipped**       | Frontend helpers, preview boundary and repository/operations/evaluation tooling                                             |

The [dated result summary](results/frontend/user-verification-2026-10-12.json) preserves the actual timestamps, case names, final outcomes and the earlier AI failure. Earlier design and backend reports retain their original dates and counts.

## Actual user journey

The repeatable `scripts/user-journey.mjs` runner creates two temporary members and one administrator in the dedicated local `padel-e2e` environment. All three use the real web sign-in flow. Their passwords and access tokens stay in process memory and are omitted from reports. The runner verifies:

- Welcome page links, rejection of an incorrect password, and real authorization-code sign-in with S256 PKCE.
- Onboarding, persisted member name/email/phone, and rejection of staff-only access by a member.
- Rejection of a booking without an active subscription, while retaining a usable confirmation form and creating no booking.
- Reception recording an already-paid subscription through the UI for each test member, followed by the member seeing the active subscription.
- Selecting a free court slot, confirming a booking and reading the persisted record.
- An occupied slot offering a personal waitlist entry without making a booking; removal of that test entry.
- Opening a game, another member joining, the named roster, organizer-only cancellation and participant withdrawal.
- Cancellation releasing the court slot and delivering the real booking/cancellation notifications.
- Real authenticated member pages and profile at 390px and 320px, logout and re-login preserving the saved profile.
- One known cancellation question returning an AI answer with an authenticated source, while the booking count stays unchanged.

Existing member, booking and subscription row fingerprints matched before and after the final journey when excluding its registered fixtures. Cleanup cancelled the test bookings/subscriptions, disabled the test member profiles, cancelled its waitlist entry and removed the three temporary Keycloak identities. The synthetic inactive records and local notifications remain as test evidence. Emails stayed in local Mailpit; there were no external messages or online payments.

## Corrected problem

A newly created administrator may have no member profile. The UI previously requested their personal subscriptions, invitations and waitlist anyway, producing misleading service warnings.

`web/ui/application.js` now reads the profile before requesting profile-dependent resources. When the profile does not exist, it skips those personal requests and displays a profile-completion action. Staff can still search members, record subscriptions and manage reception. Once a profile is saved, its personal resources load normally. Actual service failures and expired authentication retain their existing error behavior.

A browser regression exercises the missing-profile case and subsequent profile creation at all three widths. The real browser journey also verifies that the new administrator has no service-warning banner. Only the local web image/container was rebuilt for this correction; Java services and database schemas were not changed.

## AI availability observation

An earlier live run received HTTP 200 with `kind: UNAVAILABLE` for the known cancellation question. That attempt failed the strict sourced-answer assertion and is retained in the dated summary. In two subsequent isolated read-only calls, the assistant returned `ANSWER` with one citation, taking approximately 9.9 and 5.1 seconds inside the service. The final browser journey also returned `ANSWER` with one citation.

These successful repeats do not remove the observed intermittent failure. The service has a 15-second workflow budget, and Ollama logs show substantial embedding/chat inference time around the failed attempt, but the precise exception cause was not established. No timeout was increased and no answer-quality gate was relaxed to make the test pass. The historical [failed model-quality gates](ai-evals/SUMMARY.md) remain unresolved. A single known-question smoke test does not certify general AI correctness or reliable availability under load.

## Repeat locally

Install the locked development dependencies and Chromium, then use the existing dedicated `padel-e2e` stack with the development fixtures in `.env.example`. The optional `padel-ai-local` assistant stack and installed models are required for the final AI step.

```sh
npm --prefix web ci
cd web
npx playwright install chromium
cd ..
node scripts/user-journey.mjs
```

The runner is an explicit operator command, outside `npm test`. It supports only the fixed local URLs and checks the Compose ownership of the test database before creating fixtures. Do not run it against a shared production deployment. It writes a fixture journal and sanitized progress report under ignored `test-results/user-journey/` and runs cleanup in `finally`; an abrupt process termination still requires reviewing that journal.

For the wider API suite, use `node scripts/e2e.mjs` as described in [E2E.md](E2E.md). The `--resilience` variant deliberately interrupts services and was not requested or run in this verification. For browser fixtures, use `npm --prefix web run test:browser`.

## Limits

The current UI checks use Chromium on simulated desktop/mobile viewports. Safari/WebKit, Firefox, physical phones, screen readers and a complete accessibility audit were not exercised. This run did not repeat Java unit/integration suites, load tests or security/release scans and does not establish a GitHub workflow or public deployment. Domain backend code was unchanged; the actual functional suite verified the running local services.
