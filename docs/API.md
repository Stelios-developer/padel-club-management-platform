# Padel Club API

Base URL: `http://localhost:8080`. All `/api/**` endpoints require a Keycloak bearer token with issuer `http://localhost:8081/realms/padel` and audience `padel-api`. Obtain it through the web application's authorization code + PKCE flow; password grants are disabled.

`ADMIN` and `STAFF` manage the club. Other authenticated users access their own private member records; the player directory exposes only enabled names and IDs, and open games expose their organizer and confirmed roster. Feign calls forward the current user's JWT; downstream services enforce ownership rules.

| Method | Path                                                               | Access / purpose                                                                                                                      |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/members/me`                                                  | Own profile, 404 before onboarding                                                                                                    |
| PUT    | `/api/members/me`                                                  | Create/update own name/phone; email and subject come from JWT                                                                         |
| GET    | `/api/members?page=0&query=`                                       | Staff; 100 profiles/page; literal case-insensitive name/email or phone search including disabled members; query max 120, page 0–10000 |
| GET    | `/api/members/{id}`                                                | Owner or staff                                                                                                                        |
| PATCH  | `/api/members/{id}/enabled`                                        | Staff; enable/disable member                                                                                                          |
| GET    | `/api/players?query=Alex`                                          | Enabled player names/IDs only; literal name search, 2–120 characters, maximum 20 results                                              |
| GET    | `/api/players/{id}`                                                | Minimal player ID/name/enabled state, no contact details or auth subject                                                              |
| GET    | `/api/subscriptions/plans`                                         | Subscription prices and duration                                                                                                      |
| GET    | `/api/subscriptions?memberId={id}`                                 | Owner or staff; defaults to own member                                                                                                |
| POST   | `/api/subscriptions`                                               | Staff; records an already paid subscription                                                                                           |
| DELETE | `/api/subscriptions/{id}`                                          | Staff; soft cancellation                                                                                                              |
| GET    | `/api/subscriptions/eligibility/{memberId}?date=2026-10-01`        | Owner/staff, inclusive validity dates                                                                                                 |
| GET    | `/api/courts`                                                      | Court catalog                                                                                                                         |
| PATCH  | `/api/courts/{id}`                                                 | Staff; enabled state and hourly price                                                                                                 |
| GET    | `/api/courts/{id}/availability?date=2026-10-01&durationMinutes=90` | Court slots; no other members' personal details                                                                                       |
| GET    | `/api/bookings?from=2026-10-01&to=2026-10-31`                      | Own bookings and accepted participations; staff see all. Inclusive dates, maximum 90-day difference                                   |
| GET    | `/api/bookings/{id}`                                               | Owner/accepted participant/staff                                                                                                      |
| POST   | `/api/bookings`                                                    | Create booking; own member by default                                                                                                 |
| DELETE | `/api/bookings/{id}`                                               | Owner/staff; soft cancellation                                                                                                        |
| POST   | `/api/access/validate`                                             | Staff; validate entry and persist audit                                                                                               |
| GET    | `/api/access/audit`                                                | Staff; last 100 access checks                                                                                                         |
| GET    | `/api/notifications`                                               | Own notifications; staff see last 100 club notifications                                                                              |
| GET    | `/api/padel/matches?level=ANY`                                     | Future open games with unreserved seats; level ANY/BEGINNER/INTERMEDIATE/ADVANCED                                                     |
| GET    | `/api/padel/games/{bookingId}`                                     | Owner/staff, pending or accepted participant, or any authenticated member for an open game                                            |
| PATCH  | `/api/padel/games/{bookingId}`                                     | Owner/staff; body `{openMatch:true,level:"INTERMEDIATE"}`                                                                             |
| POST   | `/api/padel/games/{bookingId}/invitations`                         | Owner/staff; body `{memberId:"UUID"}`; repeat invitation returns same `{id}`                                                          |
| GET    | `/api/padel/invitations`                                           | Own future pending invitations                                                                                                        |
| PUT    | `/api/padel/invitations/{playerRowId}`                             | Invitee only; body `{status:"ACCEPTED"}` or `{status:"DECLINED"}`                                                                     |
| PUT    | `/api/padel/games/{bookingId}/join`                                | Own participation in an open game; no body                                                                                            |
| DELETE | `/api/padel/games/{bookingId}/players/{playerRowId}`               | Participant withdrawing, organizer/staff removing a guest; organizer removed by cancelling booking                                    |
| GET    | `/api/padel/waitlist`                                              | Own waitlist; WAITING/NOTIFIED/CANCELLED/EXPIRED                                                                                      |
| PUT    | `/api/padel/waitlist`                                              | Own membership; body `{courtId,startsAt,durationMinutes}`; existing WAITING entry returned on repeat                                  |
| DELETE | `/api/padel/waitlist/{id}`                                         | Own membership only, soft cancellation                                                                                                |
| POST   | `/api/padel/series`                                                | Owner/staff; normal booking body plus `weeks:2..4`, mandatory UUID Idempotency-Key                                                    |

Examples:

`POST /api/subscriptions`, `POST /api/bookings`, `POST /api/padel/series` and `POST /api/bookings/{id}/move` require an `Idempotency-Key` header containing a UUID, for example `Idempotency-Key: 55f96521-1c10-47c5-b102-b3dac9501bc9`. Generate a new key for each deliberate creation or move and retain it for every retry. The web forms do this automatically. Other endpoints do not require this header.

```json
// PUT /api/members/me
{"fullName":"Alex Player","phone":"+30 690 123 4567"}

// POST /api/subscriptions (staff, after payment at reception)
{"memberId":"UUID_FROM_MEMBER_PROFILE","plan":"QUARTERLY","startsOn":"2026-10-01"}

// POST /api/bookings (18:00 Europe/Athens in summer time)
{"courtId":"11111111-1111-1111-1111-111111111111","startsAt":"2026-10-01T15:00:00Z","durationMinutes":90,"players":4}

// PATCH /api/courts/{id}
{"enabled":true,"hourlyPriceCents":2400}

// PATCH /api/members/{id}/enabled
{"enabled":false}

// POST /api/access/validate
{"bookingId":"UUID_FROM_BOOKING"}
```

Staff can supply `memberId` when creating a booking for another member. Members cannot use it to bypass ownership. Store/send booking timestamps as ISO 8601 instants; the UI converts Athens local slots, including DST. Money is stored in integer euro cents.

The organizer counts as an accepted player. Pending invitations reserve capacity but enter a player's calendar only on acceptance. Acceptance/join requires an enabled member, a subscription valid on the game date and no overlapping accepted participation. Game row locks serialize capacity changes; PostgreSQL also protects the player schedule. Repeated joins/answers are no-ops once acknowledged. Guests cannot cancel the organizer's booking. Accepted withdrawals close two hours before play except for staff. Cancelling a booking cancels every participation and releases its schedule.

Series responses are `{id,bookings:[...]}`. Local Athens time is preserved across DST. Each date must pass the normal 30-day window and eligibility rules; one failure rolls back all bookings, events and the idempotency claim. Publish/invite/cancel affects one game, not the entire series.

Waitlist notifications are availability notices for all matching future waiters, not automatic reservations or a FIFO queue. A maximum of ten future WAITING entries per member applies. Notices are emitted when API cancellation or re-enabling a court frees the whole requested interval. In-app events have notification status `IN_APP` and never invoke SMTP. Direct SQL maintenance updates do not emit domain events. See [padel rules and migration](PADEL-PLAY.md).

Confirmed booking intervals are also protected by a PostgreSQL exclusion constraint, including direct database writes. Intervals use an inclusive start and exclusive end, so adjacent bookings are permitted. Cancelled rows release the slot. API creation converts a database exclusion violation to HTTP 409 and rolls back its booking, outbox and idempotency claim. See [database installation and tests](BOOKING-CONSTRAINT.md).

Validation/conflicts use RFC 9457 `application/problem+json` with `status` and `detail`. Typical responses: 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing record, 409 occupied court/inactive subscription/late cancellation, 503 downstream service unavailable. Successful writes return 200; cancellation returns an empty 200 response. An access denial is a successful validation request returning `allowed:false` plus a reason, not an HTTP authentication failure.

The development gateway forwards Authorization headers without exposing individual services on host ports. Public liveness and Prometheus endpoints are for internal monitoring; only gateway health/metrics are host-addressable in Compose.

## Reception endpoints

All endpoints below require ADMIN/STAFF, including idempotency replays. No personal member profile is required for the staff caller.

| Method | Path                                           | Purpose                                                                                                                      |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/bookings/reception/week?date=2026-10-01` | `{from,to,bookings}`; normalize date to Monday–Sunday in Europe/Athens; omitted date uses today; includes cancelled bookings |
| POST   | `/api/bookings/{id}/move`                      | Atomic reschedule; UUID Idempotency-Key required                                                                             |
| GET    | `/api/bookings/{id}/attendance`                | `{booking,canRecord,players}`; named accepted participants or retained attendance records; UNRECORDED/PRESENT/ABSENT         |
| PUT    | `/api/bookings/{id}/attendance/{memberId}`     | `{status:"PRESENT"                                                                                                           | "ABSENT",reason}`; same current status is a no-op; corrections append history |
| GET    | `/api/bookings/{id}/history?page=0`            | Up to 100 changes/page, newest first; `{id,action,actorSubject,actorName,reason,before,after,changedAt}`; page 0–10000       |

Move body: `{courtId,startsAt,expectedCourtId,expectedStartsAt,expectedEndsAt,reason}`. All fields are required; reason is 3–240 trimmed characters. Expected fields describe the booking loaded by the caller; a stale edit returns 409. Only future CONFIRMED bookings without attendance can move. Duration, participants, pending invitations, visibility and series ID remain; price is recomputed from the destination's current rate. New dates follow ordinary 30-day/hour/duration rules. All ACCEPTED participants must be enabled, eligible on the new date and free of schedule conflicts. Pending participants recheck eligibility on acceptance. Domain writes, player times, history, outbox, released-slot notices and idempotency claim commit or roll back together. Active participants/invitees receive IN_APP notices; waiters are not auto-booked.

Attendance is writable from start minus 15 minutes until end plus 24 hours, exclusive. Only ACCEPTED participants may be marked; PRESENT also requires an enabled profile and eligibility on the booking date. ABSENT records a no-show. Cancellation preserves previously recorded attendance and closes writes. Attendance is distinct from `/api/access/validate`, which still checks the organizer and the original entry window.

History covers application booking/roster/attendance mutations from V7 onward. Earlier changes and direct SQL maintenance are not fabricated or audited. It is read-only through the API. See [RECEPTION.md](RECEPTION.md) for the UI and rules.

## Idempotency contract

Keys are scoped to the authenticated JWT subject and operation. The same key and parsed request body return the original successful HTTP 200 response, including the original record ID. JSON field order does not matter. A different parsed body with an already committed key returns HTTP 409; a missing or malformed key returns HTTP 400. Existing authentication, role and ownership checks still apply on replay.

The PostgreSQL claim, response snapshot, domain record and transactional outbox event commit together. Concurrent repeats wait for the first transaction. A failed transaction rolls everything back, allowing the same request/key to be retried after the failure is resolved. Records survive service restarts and are retained without automatic expiry. Do not delete these records while old client retries may still arrive; a retention policy must explicitly define that retry window.

Replay returns the original response even if the subscription or booking was subsequently cancelled. It never reactivates or recreates it. Use GET to obtain its current state. A new key represents a new intent: booking overlap rules still apply, while a staff member can deliberately record a second subscription. No payment provider is involved.

The browser stores only a hash of the actor/operation/payload and the pending UUID in sessionStorage until it receives success. Refreshing and signing back in as the same actor preserves that pending intent within the tab. Changing the payload creates a new intent. A fresh form after acknowledged success creates a new intent. Closing the tab, clearing browser storage or retrying with another client's fresh key is outside this client recovery guarantee.
