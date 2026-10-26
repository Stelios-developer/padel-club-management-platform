# Padel Club v1.1.0 — Kubernetes and security maintenance

[Official release and permanent evidence](https://github.com/Stelios-developer/padel-club-management-platform/releases/tag/v1.1.0) · [Verified publisher](https://github.com/Stelios-developer/padel-club-management-platform/actions/runs/40390184189) · [Image source](https://github.com/Stelios-developer/padel-club-management-platform/commit/42632642774092717e7147d4eea35dd5696789c9)

All **10 application images** are public on GHCR for **Linux/amd64**, with signed provenance and CycloneDX SBOMs bound to exact registry digests. Image source: `42632642774092717e7147d4eea35dd5696789c9`. The release tag also includes the verified Kubernetes digest binding and documentation; its commit differs from the signed image source. Application sources are unchanged between these commits. The [v1.0.0 evidence](RELEASE-v1.0.0.md) and [recruiter video](https://github.com/Stelios-developer/padel-club-management-platform/releases/tag/demo-v1) are preserved.

## Changes

- Real single-node kind Kubernetes deployment, nine core signed application images, 13 ready workloads, staged startup and PostgreSQL pod/PVC recovery.
- All four infrastructure exceptions removed: actual read-only roots/non-root identities for PostgreSQL, RabbitMQ and Keycloak; restricted Keycloak optimization/init and read-only compiled code; reviewed HTTPS egress destinations required before AWS compute activation.
- RabbitMQ Java 5.37.0, HttpClient 5.6.5/4.5.14 and evaluator fast-uri 3.1.9/ip-address 10.7.4.
- Explicit Kubernetes CPU/memory budgets, Java GID 10001, realm import from a Secret and Java image health checks.

[Hardening and data-preservation evidence](SECURITY-HARDENING.md) · [Security maintenance, scan comparison and remaining findings](SECURITY-MAINTENANCE.md).

## Verification

The [source CI](https://github.com/Stelios-developer/padel-club-management-platform/actions/runs/40387977736) passed **21/21 jobs**, including **154 backend, 252 browser, 60 Compose integration and 61 Kubernetes cases**, plus six-database encrypted restore, four backup guards and production-configuration rehearsals. Kubernetes and cloud mock validation are separate scopes. The release assets also include the subsequent CI evidence that tests this release's new image digests in Kubernetes.

The publisher passed all **14 jobs**. Independent verification performed **40 cryptographic checks**: provenance and SBOM for each image, fetched separately from GitHub and GHCR. Verification requires the exact repository/owner IDs, source commit, main branch, publisher workflow, GitHub-hosted runner and publisher run invocation. Each signed SBOM matches its scan artifact; anonymous registry reads recomputed all ten manifest digests and checked the scanned image configuration identity.

- [Immutable image manifest](security/releases/v1.1.0/manifest.json).
- [Per-image independent verification](security/releases/v1.1.0/verification.json).
- [Exact image-source CI report](security/releases/v1.1.0/source-ci.json).
- Permanent release assets contain scan gates, SBOMs, hosted/independent signature reports, both CI verification summaries and SHA-256 checksums.

| Image                | Immutable digest                                                          |
| -------------------- | ------------------------------------------------------------------------- |
| config-server        | `sha256:451720994795806e32e7537d30d2b16294c93c76bcc952d31ec2555d7bbadae0` |
| discovery-server     | `sha256:7d8633f652cba43b22a8bd8533a67b4d68305045619276466be7d09b95c4430e` |
| api-gateway          | `sha256:88793207f3c1c6a21a8efb68d18059066042375f00a2be7413fac5c44a4f2bc1` |
| member-service       | `sha256:0648eb17e60be82397dce09a8b4a4a8abd40eeef68968ca668369b374a95b180` |
| subscription-service | `sha256:54678ec7c87ca8f1ebf18b3c5f69f60572572c54ce971c108d41c45ecd606bf6` |
| booking-service      | `sha256:c0288c3695c496adc3754d00713aa705d20b9171881cec9bbeb60b96ebc96256` |
| access-service       | `sha256:fd26fdc1eeaa2edfeea34399191129b3587ff2d56dd8de5ddc74b01283b6335a` |
| notification-service | `sha256:bebc327665e72a33c91f994869d50653edda01f129872a51085ac4db0e300022` |
| assistant-service    | `sha256:e85240976e531bc105988d611f2149f4ff3600de2b035742fc6df3f90a98bbcd` |
| web                  | `sha256:e058b810ff8fde1bf03241dfcd9d6adc3e7aee1bcc100d0c725a3072e596d4c3` |

## Scope

This is a signed application-container release and verified local/CI Kubernetes profile. Public hosting, production HA, AWS provisioning and network-policy enforcement are not claimed. Optional third-party Ollama/model/database images are outside the ten published application images. MEDIUM/LOW configuration findings and tooling CodeQL warnings remain visible, with no accepted security exceptions. A clean dependency scan and valid signatures do not establish vulnerability-free code or a production security certification.
