# Infrastructure exception closure — 26 October 2026

The four infrastructure exceptions previously expiring on **4 November 2026** are removed from the executable [policy](../infra/security/exceptions.json). No expiry was extended and no scanner rule or severity threshold was disabled. Historical release/scan reports retain the policy that actually applied to their source revisions.

## Kubernetes: constrained writable storage

PostgreSQL, RabbitMQ and Keycloak now run with a read-only root, explicit non-root UIDs **70**, **100** and **1000**, dropped capabilities, no privilege escalation and no mounted service-account token. Existing PVCs remain attached. PostgreSQL's socket directory and bounded temporary directories are separate `emptyDir` mounts; RabbitMQ also has a bounded log directory. Pod filesystem groups make the existing data volumes accessible without a privileged ownership-changing init container.

Keycloak no longer runs `start-dev`. Two restricted init containers use the same digest-pinned upstream image to seed and optimize its Quarkus directory for PostgreSQL, health and metrics. The server starts with `start --optimized --import-realm`, mounts that generated code **read-only**, and writes only to bounded data/temp volumes. Existing realms are preserved. The single-node local cache remains a development choice.

This profile performs optimization once per pod, adding startup time. It does not claim a prebuilt production image, HA or a production identity deployment. The upstream [Keycloak container guide](https://www.keycloak.org/server/containers) describes build-time optimization and optimized startup; the initialization here keeps the local profile on one pinned upstream artifact without publishing an additional custom image.

```sh
node scripts/kubernetes.mjs up
node scripts/kubernetes.mjs test
node scripts/kubernetes.mjs security
node scripts/kubernetes.mjs report
```

The security command reads **actual kernel mount flags and process UIDs**, writes/removes an isolated marker in `/tmp`, and verifies successful Keycloak init completion and the read-only compiled-code mount. A complete deployment report requires this proof for the **same live pod UIDs** as the reported deployment. Negative controls reject writable roots, root users, expanded capabilities, writable code, unexpected writable paths, mismatched init images and stale/foreign proof.

Before the local rollout, an authenticated encrypted database dump was retained privately. All **17 domain-table fingerprints across three databases** were unchanged after the rollout. Both original PVC identities were retained. The complete hardened suite passed **61/61**, including PostgreSQL pod replacement, OIDC/PKCE, messaging/SMTP, attendance corrections and exact audit counts. [Dated evidence](security/hardening-2026-10-26.json).

## AWS: HTTPS destinations must be reviewed

`https_egress_cidrs` defaults to an empty set: no HTTPS egress rule exists until an operator supplies destinations. Compute activation also requires a nonempty list. Only valid IPv4 `/24` or narrower ranges are accepted; world-wide, split-world, broad-network, malformed and IPv6 inputs are rejected. Rules allow TCP **443** only. No alternative allow-all rule or scanner suppression was added.

The operator must review the actual service/proxy destination ranges and verify reachability for bootstrap packages, SSM, AWS APIs, GHCR/GitHub and certificate services before a real deployment. The documentation-only test ranges are not usable cloud configuration. Dynamic CDN addresses are not automatically discovered or trusted; changes require another review. An empty list deliberately prevents a working cloud bootstrap rather than silently opening internet egress.

The Terraform tests use mock providers only: **14 demo scenarios plus one state-bootstrap scenario**. They verify default deny, exact allowed destinations/port, rejection controls, missing-budget safeguards and retained-volume protection. No AWS provisioning, public-host connectivity or destination availability was tested, and no cloud resources were created.

## Gates and evidence

Source/secrets, canonical rendered Kubernetes, actual private kind manifests and Terraform configuration pass the existing gates with **zero active exceptions**. MEDIUM/LOW findings remain visible; a passing gate is not a claim of vulnerability-free code. Private manifests, database dumps, credentials and raw mount output remain outside publication.

The [Kubernetes CI job](../.github/workflows/ci.yml) repeats the full integration suite and actual mount/user proof in a fresh disposable cluster. The [cloud workflow](../.github/workflows/cloud.yml) repeats schema, mock and configuration checks. Only redacted reports are uploaded.
