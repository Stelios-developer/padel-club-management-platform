# Security maintenance — v1.1.0

This maintenance follows the [closure of all four infrastructure exceptions](SECURITY-HARDENING.md). The executable policy remains empty; severity thresholds, scanner rules, secret detection and CodeQL coverage are unchanged.

The local source/secrets and fixture-rendered Kubernetes scan passed with **30 findings (13 MEDIUM, 17 LOW)**, down from **138** in the hosted baseline at `18e6f17`. No dependency vulnerability remained in this source scan. Image scans and CodeQL have separate scopes and results. [Dated evidence](security/maintenance-2026-10-26.json).

## Dependency fixes

| Dependency              | Previous                   | Replacement                  |
| ----------------------- | -------------------------- | ---------------------------- |
| RabbitMQ Java client    | 5.34.0                     | 5.37.0                       |
| Apache HttpClient 5     | 5.5.2                      | 5.6.5                        |
| Apache HttpClient 4     | 4.5.3 transitive selection | 4.5.14 dependency management |
| Evaluator fast-uri 3    | 3.1.8                      | 3.1.9                        |
| Evaluator ip-address 10 | 10.7.3                     | 10.7.4                       |

The Java changes retain the supported Spring Boot/Cloud baseline. The two npm overrides stay within the installed major versions and the lockfile records package integrity. The evaluator's actual engine and negative quality/cancellation controls are checked separately from model-answer quality.

Official release information: [RabbitMQ 5.37.0](https://github.com/rabbitmq/rabbitmq-java-client/releases/tag/v5.37.0), [Apache HTTP Components releases](https://hc.apache.org/news.html), [fast-uri 3.1.9](https://github.com/fastify/fast-uri/releases/tag/v3.1.9), [ip-address 10.7.4](https://github.com/beaugunderson/ip-address/releases/tag/v10.7.4).

## Kubernetes and image defaults

- Canonical workloads and the generated kind profile now specify CPU limits. PostgreSQL and RabbitMQ also have explicit CPU/memory requests and memory limits in the canonical configuration. Restricted Keycloak init containers retain their bounded resources.
- Java application containers explicitly set GID 10001 as well as UID 10001.
- The Keycloak realm is generated as a Secret and mounted read-only, rather than stored in a ConfigMap. This is correct Kubernetes classification; base64 encoding is not encryption. Local demonstration identities remain public fixtures, and real deployments must generate private credentials and use appropriate API access/encryption controls.
- Java runtime Dockerfiles now expose a health check against their actual service ports, with a startup grace period. Kubernetes probes and Compose overrides remain authoritative for their environments.

## Remaining findings and follow-up

All remaining findings stay visible in the dated scan and CodeQL artifacts. No suppression or accepted exception is added for the following categories:

| Category                                           | Disposition                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendor container UIDs/GIDs below 10001             | Retain the non-root IDs supported by PostgreSQL, RabbitMQ, Keycloak, Nginx and Mailpit. Arbitrary renumbering requires image/volume permission review and migration testing.                                                                                                          |
| Trusted-registry heuristic on the generic scaffold | The local build scaffold deliberately uses local image names. The runnable kind profile substitutes reviewed digest-pinned infrastructure images and cryptographically verified application releases. Admission-time registry restrictions are a separate production-cluster control. |
| S3 server access logging                           | Terraform has private, encrypted and versioned buckets, but no access-log destination yet. Add a reviewed destination, permissions and retention policy before cloud deployment; no AWS resources or billing were introduced here.                                                    |
| Artifact-only performance Dockerfile               | The scratch output contains benchmark JARs and has no process to health-check. It is not a deployed application image.                                                                                                                                                                |
| CodeQL file/network flows in local tooling         | Findings remain reviewable in SARIF. They concern CLI-selected settings, evaluation credentials, report paths and pinned downloads. Each flow needs a dedicated trust-boundary review; passing the current gate does not close these warnings.                                        |

Counts represent scanner occurrences, including repeated transitive dependencies, rather than independent vulnerabilities. The [original release](RELEASE-v1.0.0.md) and dated reports are preserved. A passing scan is not a claim of vulnerability-free code or a production security certification.
