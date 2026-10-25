# Padel Club — recruiter demo

A **1 minute 44 second** engineering demo of the working Padel Club application. It follows a real member journey from live AI availability to a human-confirmed reservation, then shows the same booking on mobile, approved policy sources, asynchronous notifications and the system design.

![Padel Club demo cover](cover.jpg)

## Deliverables

- **Video:** `padel-club-recruiter-demo-en.mp4`, 1920×1080, 30 fps, H.264/AAC, approximately 10 MB, with burned-in English captions.
- **Narration:** English, generated locally with the Windows Microsoft Zira Desktop synthetic voice. No paid API or external voice service was used.
- **Captions:** [English SRT](captions-en.srt) and [Greek SRT](captions-el.srt). Separate subtitle phrase timings are aligned approximately to the synthetic narration.
- **Script:** [English narration](narration-en.txt) and [editable storyboard](storyboard.json).
- **Evidence:** [capture and media verification](../results/frontend/recruiter-demo-2026-10-13.json).

The delivered MP4 and copies of the captions/cover are in `.runtime/recruiter-demo-2026-10-13/output/` on the project computer. Generated footage and media builds remain ignored by Git. When the repository exists, the MP4 can be attached as a release asset or uploaded to a video host; the resulting actual video link can then be added to the repository overview. No public video URL exists yet.

## What the recruiter sees

| Approximate time | Demonstration                           | Engineering point                                         |
| ---------------- | --------------------------------------- | --------------------------------------------------------- |
| 00:00–00:07      | Product introduction                    | A complete working application                            |
| 00:07–00:14      | Public sports interface                 | Clear visual identity and navigation                      |
| 00:14–00:20      | Authenticated member and courts         | OIDC/PKCE; membership eligibility; pricing                |
| 00:20–00:32      | Natural Greek availability question     | Real local model and live read-only API results           |
| 00:32–00:44      | Price review and confirmed reservation  | Human confirmation and persisted backend state            |
| 00:44–00:52      | The same booking on mobile              | Readable cards in a 390-pixel viewport                    |
| 00:52–01:02      | Cancellation policy and approved source | Grounded answers and explicit AI prototype scope          |
| 01:02–01:08      | Member notification                     | Real asynchronous booking event                           |
| 01:08–01:15      | Reception schedule and details          | Staff operations, using isolated demonstration data       |
| 01:15–01:27      | Architecture                            | Service boundaries, identity, databases, messaging and AI |
| 01:27–01:36      | Dated verification                      | Measured results with their limitations                   |
| 01:36–01:44      | Technical discussion invitation         | Inspect the implementation and reports                    |

## Suggested video title and description

**Padel Club — Java Microservices & Local AI | 104-second Engineering Demo**

> A working padel club platform with a Greek web interface, Spring Boot microservices, Keycloak authentication, PostgreSQL and RabbitMQ. This demo follows a real local AI availability search through a human-confirmed booking, mobile booking cards, sourced policy answers and asynchronous notifications. It also explains the architecture and dated local verification results. The AI remains a prototype; the reception footage uses isolated demo data. Source code, architecture decisions and verification reports accompany the project.

For a short portfolio introduction:

> Padel Club connects a usable booking experience with backend engineering: authenticated service boundaries, database booking constraints, transactional-outbox notifications and a local AI assistant with approved sources and read-only tools.

## Evidence behind the claims

- [Architecture and implementation boundaries](../ARCHITECTURE.md): services, ownership checks, PostgreSQL booking constraints, transactional outbox and delivery semantics.
- [Latest AI verification](../AI-NATURAL-SEARCH.md): **140/140 inspected regression cases** on the real local model; this is not an independent holdout or a general accuracy guarantee.
- [Browser verification](../BROWSER-ACCESSIBILITY.md): the last full run passed **243/243 checks** across Chromium, Firefox and Windows WebKit at three viewport sizes. This does not establish actual Safari/iPhone support.
- [Latest scoped AI/UI checks](../results/ai/ai-natural-search-2026-10-13.json): **63/63 checks**, including **117 automated accessibility scans** of the scoped application pages with zero detected violations. Manual-review findings remain recorded; this is not a WCAG certification.

The video uses actual localhost screen recordings. Main member, AI, booking, policy and notification footage uses authenticated temporary synthetic identities and real backend/model responses, without mocked transport. The booking take was refined to hold the price review on screen. Reception uses the existing browser-local product demo to avoid exposing other users' records. Identity credentials, browser address bars and raw IDs are excluded from the edit. Temporary members, subscriptions, bookings and identities were removed, and the original member/booking/subscription snapshots were restored. Normal synthetic event and email-test history can remain in the local event pipeline.

The edit trims setup and waiting and holds some results for readability; it is not a latency benchmark. No public hosting, AWS deployment or successful GitHub CI/CD execution is claimed. The current source has more browser scenarios than the historical 243-check run; the later 63-check run covers the AI/interface changes, not a rerun of the entire expanded suite.

## Technical walkthrough

Start with the member's request and the saved booking. Then explain one concrete design decision: why the database is the final concurrency guard, why notifications use an outbox, or why the AI proposes options but cannot create a booking. Use the linked reports to explain what was tested and what still needs independent or external validation.
