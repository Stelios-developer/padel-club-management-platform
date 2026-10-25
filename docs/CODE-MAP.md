# Code map and extension points

Locate the owner before changing an implementation. [Architecture and invariants](ARCHITECTURE.md), [contribution commands](../CONTRIBUTING.md) and the [operator catalogue](../scripts/README.md) cover the surrounding workflow.

## Backend ownership

| Module                              | Responsibility and entry points                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `member-service`                    | Identity-linked profiles and activation: `MemberController`, member persistence and migrations                                           |
| `subscription-service`              | Plans, recorded payments and eligibility: `SubscriptionController` and subscription persistence                                          |
| `booking-service`                   | Courts/bookings: `BookingController`, `BookingService`, `BookingRules`, database exclusions                                              |
| `booking-service`                   | Games/invitations/series: `PadelController`, `PadelService`, `PlayerSchedule`; waitlists: `WaitlistService`                              |
| `booking-service`                   | Reception, moves, attendance and history: `ReceptionController`, `ReceptionService`, `BookingAudit`                                      |
| `access-service`                    | Check-in decisions, access controller and its own audit/persistence                                                                      |
| `notification-service`              | Event consumption, deduplication and SMTP: notification consumer/controller, `MailDispatcher`, `EmailCopy`                               |
| `assistant-service`                 | Approved knowledge, typed search, model budget: `AssistantService`, `KnowledgeService`, `AvailabilityService`, `AssistantResilience`     |
| `common`                            | API contracts/clients, caller identity and shared infrastructure: `Models`, clients, `Caller`, `Idempotency`, `club.padel.common.events` |
| `api-gateway`                       | Routing and external JWT validation                                                                                                      |
| `config-server`, `discovery-server` | Configuration and service discovery                                                                                                      |

All modules in this table live under `backend/`; see the [backend catalogue](../backend/README.md). Source, tests and migrations stay with their owning service in standard Maven trees. Producer contracts live in `src/contract-test`; `backend/contract-tests/` owns consumer verification. Shared code must not import another service's implementation. The root Maven reactor, Docker, Compose and CI use the nested paths.

For booking changes, follow domain rules and database constraints. For authorization, follow both caller/security and the endpoint. For schema changes, add a migration rather than editing an applied one. [Refactoring invariants](ARCHITECTURE.md#invariants-during-refactoring).

## Browser composition

`web/app.js` initializes authentication/configuration. `web/ui/application.js` composes state, resources, pages and controllers. The stable `dialogs.js` and `events.js` entry points compose:

```text
web/ui/
  application.js       state, resources and application composition
  state.js / view.js   state, focus and scroll preservation
  pages.js             page rendering
  components.js        shared visual/dialog primitives
  assistant.js         AI interface and confirmation handoff
  notifications.js     notification presentation
  dialogs/
    profile.js         profile and onboarding
    booking.js         booking form, slots and price summary
    memberships.js     member subscription management
    games.js           roster and invitations
    reception.js       schedule, moves and attendance
  events/
    actions.js         navigation, session and button actions
    fields.js          field/filter changes
    forms.js           submissions and error cleanup
```

Authentication, transport, resource storage and mutation intents remain separate root web modules. Factories receive dependencies explicitly. The [frontend guide](FRONTEND.md) covers lifecycle guards, asset publication and tests.

## Operator code and policies

Existing CLI entry points remain under `scripts/`. Support modules and tests are grouped by ownership:

| Directory             | Responsibility                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `scripts/operations/` | Backup process/path helpers, production configuration and its tests                                  |
| `scripts/security/`   | Pure vulnerability/SARIF policy, image identity and their tests                                      |
| `scripts/cloud/`      | Release completeness, provenance/digest scope and rollback policy/tests                              |
| `scripts/e2e/`        | Padel game and reception suites called by the root runner                                            |
| `scripts/quality/`    | Publication paths, source boundaries, browser cycles, process execution and repository orchestration |
| `evals/`              | Evaluation sessions, frozen datasets, graders, model/harness adapters and tests                      |

Pure policies do not parse CLI arguments or perform a rollout. Root CLI wrappers own explicit file/report operations. `npm test` discovers nested policy tests. Workflows and targeted runbook commands refer to the new locations.

## Configuration and evidence

Canonical configuration stays in `backend/config-repo/`, `infra/keycloak/`, `infra/postgres/init.sql` and `web/app-config.json`. `infra/k8s/config/` is synchronized output. Cloud/production preparation remains in `infra/` and explicit operator commands; organization does not deploy it.

Historical JSON reports, locked datasets and applied SQL migrations retain their bytes. New evidence receives a dated filename. `.runtime/`, `.tools/`, dependency/build output and private credentials stay outside publication. [Organization verification and path mapping](CODE-ORGANIZATION-2026-10-25.md).
