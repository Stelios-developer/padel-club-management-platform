# Local Kubernetes with kind

The `padel-local` profile deploys nine core application images from the verified [v1.0.0 release](RELEASE-v1.0.0.md), plus PostgreSQL, RabbitMQ, Keycloak and Mailpit. It uses a real, single-node Kubernetes **1.37.0** cluster with **kind 0.33.0**. CI uses a separate `padel-ci` cluster.

This is local development and integration-test infrastructure. Public hosting, production Kubernetes, high availability, the optional Ollama/pgvector/assistant stack and the Compose observability stack are outside this profile.

## Start and inspect

Requirements: Node.js 24+, Docker with Linux containers, free disk space for pinned images and approximately 8 GiB allocated to Docker. On a small workstation, pause existing Padel Compose/AI stacks before running a second full application stack. The scripts do not stop other projects.

```sh
node scripts/kubernetes.mjs up
node scripts/kubernetes.mjs status
```

The installer verifies official kind/kubectl download SHA-256 hashes. [Toolchain and image pins](../infra/k8s/kind/toolchain.json) record versions, publishers and exact digests. Tools stay in `.tools/kubernetes/`; the existing system kubectl and default kubeconfig are preserved.

| Endpoint            | Local address            |
| ------------------- | ------------------------ |
| Application         | <http://localhost:13000> |
| Keycloak            | <http://localhost:18081> |
| Mailpit test inbox  | <http://localhost:18025> |
| RabbitMQ management | <http://localhost:18072> |

Mappings bind to **127.0.0.1**. The development realm retains its documented synthetic member/staff fixtures. Infrastructure credentials are random and stored only in `.runtime/kubernetes/padel-local/settings.json`; they are not printed or committed.

## Configuration and ownership

Canonical `infra/k8s/config/` copies remain synchronized with their source files. The preparer writes a private Kustomize bundle under `.runtime/kubernetes/<cluster>/source/`:

- Nine application images use signed release digests; infrastructure and the kind node image are also digest-pinned.
- Nginx uses CoreDNS and the gateway's fully qualified Kubernetes Service name. Its configuration checksum triggers a web rollout when DNS configuration changes.
- Eureka registers clients with stable Kubernetes Service hostnames, avoiding stale replacement-pod IP destinations.
- Keycloak issuer, browser origins and redirects match the dedicated localhost ports. Enabled health/metrics provide database readiness checks.
- PostgreSQL and RabbitMQ have separate PVCs. Startup/readiness probes and staged rollout bring dependencies up before clients. Java heap/processor settings bound workstation resource use.
- Application containers retain non-root identities, read-only roots, dropped capabilities and disabled service-account token mounts.

Repeated preparation preserves private passwords. Windows applies and verifies an owner/SYSTEM/Administrators-only DACL. Linux private directories use `0700` and secret files `0600`.

Every operation names the workspace kubeconfig and exact context. Guards require the loopback API server, expected kind Docker label/node name and owned `padel` namespace. Arbitrary remote clusters and an existing unowned namespace are rejected.

The three existing writable-root exceptions for PostgreSQL/RabbitMQ/Keycloak remain development limitations, expiring **4 November 2026**. This profile does not claim production hardening or network-policy enforcement. PVC persistence across pod replacement does not make a kind node a backup: deleting the cluster removes this local infrastructure.

## Integration and recovery tests

```sh
node scripts/kubernetes.mjs test
node scripts/kubernetes.mjs report
```

The shared HTTP suite uses actual OIDC/PKCE, JWT/ownership rules, PostgreSQL constraints/idempotency, outbox/RabbitMQ, SMTP and domain workflows. The Kubernetes adapter targets only the owned cluster; the Compose path remains the default.

Kubernetes runs **61 cases**: the shared 60 scenarios plus PostgreSQL pod replacement. The extra case requires a new pod UID, unchanged bound PVC/volume, unchanged booking fingerprints and recovery of booking HTTP access and Keycloak database access. Gateway/service replacements, broker/SMTP outages and persisted idempotency are also exercised.

Fixture cleanup retries transient server failures, handles idempotent DELETE replay and separately proves GET `404`. Surviving identities, persistent errors and unauthorized replies fail the run even if functional cases pass. Failed attempts remain separate from later evidence.

`test-results/kubernetes-*.json` records exact running image identities, ready workloads, PVCs and results. Reports omit environment credentials, kubeconfig material and private addresses; negative controls test this redaction. `node scripts/kubernetes.mjs diagnostics` saves additional private diagnostics in `.runtime/`.

## GitHub Actions

The `kubernetes` job in [CI](../.github/workflows/ci.yml) checks target guards, independently reverifies provenance/SBOM attestations for the nine deployed images, creates disposable `padel-ci` and runs the real suite. Only the two redacted reports are uploaded. Cleanup removes only this GitHub runner's disposable cluster. Local commands do not delete cluster volumes.

Application release source is `201617b4886311982ccb7dfde9a8b6179c774ae8`; Kubernetes tooling/configuration is versioned separately by the current checkout. A hosted report records its GitHub source revision; a local report explicitly identifies a local working tree.
