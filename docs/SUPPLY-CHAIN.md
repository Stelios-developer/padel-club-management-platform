# Security and supply-chain verification

Original stage-6 implementation: **5 October 2026**, with **135 local tests**, zero failures/errors/skips. Historical reports below preserve that implementation snapshot.

**Latest release:** [v1.1.0](RELEASE-v1.1.0.md) includes Kubernetes runtime hardening and dependency maintenance, ten newly signed images and fresh independent verification. [Scan changes and remaining findings](SECURITY-MAINTENANCE.md).

**First verified release, 26 October 2026:** [v1.0.0](RELEASE-v1.0.0.md) published all **ten public application images**, with signed provenance and CycloneDX SBOMs. All 14 publisher jobs passed. Independent verification checked all ten manifest digests and both attestation types through the GitHub API and OCI registry (**40 successful signature checks**). The exact source commit also passed hosted CI, including **154 backend tests**.

Subsequent [stage-7 cloud preparation](CLOUD.md) added one resource-specific temporary HTTPS egress exception and a Terraform resource identity regression test, bringing that historical policy to six exceptions. The 25 October 2026 review removed two npm exceptions: GitHub withdrew the `braces` advisory, and the upgraded evaluator no longer includes `node-forge`. The four remaining infrastructure exceptions were closed on 26 October after actual read-only Kubernetes verification and deny-by-default HTTPS destination controls. The current executable policy has **zero exceptions**. [Changes and evidence](SECURITY-HARDENING.md). The stage-6 reports below retain their original five-exception snapshot and test counts.

## What the pipeline enforces

- All external Actions use reviewed full commit SHAs. Checkout does not persist credentials. Ordinary jobs receive `contents: read`; only CodeQL receives `security-events: write`; only the default-branch release job receives package/OIDC/attestation write permissions.
- Trivy **0.75.0**, Syft **1.54.0** and actionlint **1.7.12** are installed from pinned official archives with SHA-256 checks. No mutable scanner setup action or remote install script is executed. Checksums establish consistency with reviewed publisher metadata; they are not an independent audit or signature verification of the scanner.
- The source scan includes Maven POMs, both npm lockfiles **including development dependencies**, Dockerfiles and secret detection. Kubernetes is scanned after Kustomize rendering with **public fixture secrets**, because the existing JSON multi-document input was not recognized directly. Private `.env`, `.runtime`, `.tools`, `.git`, installed dependencies and generated test/build output are excluded; runtime dependencies are inventoried from built images separately.
- Each of the **10 owned release images**, including the assistant, is inventoried with Syft and scanned with Trivy before publication. CycloneDX includes package PURLs and file components; a count of all components is **not** a count of dependencies. Java SBOMs must contain Spring Boot runtime packages.
- **HIGH, CRITICAL and UNKNOWN vulnerabilities/misconfigurations block** unless an exact, documented, unexpired exception applies. Every detected secret blocks. Unfixed findings are included. MEDIUM/LOW findings remain in reports. Exceptions match the artifact, package/version or Kubernetes workload and expire automatically.
- CodeQL uses Java/Kotlin with a traced clean Maven build, JavaScript/TypeScript and `security-extended`. A SARIF gate blocks security scores >= 7 and error-level results. Malformed reports, missing rules and unsuccessful analysis fail closed.
- Release builds load one Linux/amd64 image, scan it, then push **that image**, rather than rebuilding after the scan. The registry pull must retain the scanned local image identity. The workflow then signs provenance and CycloneDX attestations for the **registry digest**, and verifies both against the expected repository, source commit, signer workflow and hosted-runner policy.
- Uploaded reports use explicit safe file patterns, including hidden `.runtime` paths. Raw secret matches, private generated secrets, Docker archives and the native Syft image configuration report are not uploaded.

The workflows are [`ci.yml`](../.github/workflows/ci.yml), [`security.yml`](../.github/workflows/security.yml) and [`publish-images.yml`](../.github/workflows/publish-images.yml). The scheduled security workflow checks the default branch weekly. Dependabot is configured for Actions, Maven, npm and Docker; generated PRs still require review and passing checks.

## Findings fixed

| Component            | Before            | Reviewed replacement                                          |
| -------------------- | ----------------- | ------------------------------------------------------------- |
| Jackson 3 BOM        | 3.1.5             | 3.1.7                                                         |
| Jackson 2 BOM        | 2.21.5            | 2.21.7                                                        |
| HTTP Core 5          | 5.3.6             | 5.4.3                                                         |
| Tomcat               | 11.0.24           | 11.0.26                                                       |
| RabbitMQ Java client | 5.27.1            | 5.34.0                                                        |
| FreeMarker           | 2.3.34            | 2.3.35                                                        |
| Evaluator basic-ftp  | 5.3.1             | 6.2.1 override                                                |
| Web runtime          | Nginx 1.28 Alpine | Nginx 1.30 Alpine, pinned base digest and OS security updates |

Boot **4.0.8** and Cloud **2025.1.3** remain aligned. Temporary BOM overrides are in the root POM; remove them once a supported Boot BOM supplies the fixes. Official Maven Central's `repo1.maven.org` endpoint avoids the rate limiting encountered at the alternate Central endpoint. A compiler/build-plugin dependency inventory is distinct from the dependencies shipped inside the application JAR.

Runtime Dockerfiles pin their base image digests and apply available Alpine package updates. The build's OS update layer can change as repository packages change; this is **not a claim of bit-for-bit reproducible builds**. The resulting image digest and SBOM record the actual output, and the gate blocks stale vulnerable images. Force a fresh OS update layer when new fixes are published rather than relying on an old build cache.

Java images run as UID/GID **10001**. Nginx runs as **101**, listens internally on **8080**, and keeps the public local address at `http://localhost:3000`. Compose, the production Caddy generator and Kubernetes target ports were updated together. Kubernetes application containers have a read-only root, writable bounded runtime directories, non-root identities, dropped capabilities, no privilege escalation, RuntimeDefault seccomp and no mounted service-account token. The later [kind deployment and exception closure](SECURITY-HARDENING.md) verified actual PostgreSQL/RabbitMQ/Keycloak read-only roots, non-root users and optimized identity startup. The table below preserves the original stage-6 snapshot.

The JWT scanner finding was an intentionally unsigned security-test fixture, not an authentication credential. It is now constructed from JSON in the test, preserving the negative test. Kubernetes password keys were removed from ConfigMaps and bound through `SPRING_DATASOURCE_PASSWORD` / `SPRING_RABBITMQ_PASSWORD` environment variables sourced from Secrets. For an authenticated external SMTP server, provide `SPRING_MAIL_PASSWORD` through a Secret; the scaffold uses unauthenticated local Mailpit.

## Historical stage-6 exceptions

The table below records the original 5 October stage-6 exceptions and their rationale at that time. It is historical evidence, not the current allowlist. [`infra/security/exceptions.json`](../infra/security/exceptions.json) is the executable policy and now contains no exceptions; the later [closure record](SECURITY-HARDENING.md) explains the fixes and withdrawn/upgraded npm findings.

| Exact finding                    | Scope and reason                                                                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVE-2026-93687, braces 3.0.3     | Evaluator lockfile only; optional chokidar peer through nunjucks. No fixed upstream release was available. Our CLI harness uses repository-owned configuration and does not expose a watch/glob endpoint. Review before enabling watch mode or accepting external configuration.                   |
| CVE-2026-85393, node-forge 1.4.0 | Evaluator lockfile only; optional jks-js integration, unused by the local HTTP provider. No fixed upstream release was available. No Java keystore import or forge signature verification is enabled. This package is absent from production application images. Review before changing providers. |
| KSV-0014, StatefulSet/postgres   | Undeployed Kubernetes scaffold; initialization, volume ownership and writable runtime paths require a real cluster rehearsal before enforcing a read-only root.                                                                                                                                    |
| KSV-0014, StatefulSet/rabbitmq   | Undeployed broker scaffold; validate entrypoint and writable-volume layout before cluster deployment.                                                                                                                                                                                              |
| KSV-0014, Deployment/keycloak    | `start-dev` performs augmentation/writes. A prebuilt optimized image and writable data layout need cluster validation first.                                                                                                                                                                       |

The npm audit tool reports propagation through parent packages as additional findings; that is not additional distinct root CVEs. We did not downgrade promptfoo or run `npm audit fix --force`. Any use outside the stated scope invalidates the relevant exception. Expired exceptions fail the gate until reviewed/removed, even if the corresponding code has since changed.

## Reproduce locally

Run from the repository root with Node 24, Docker and `kubectl` (client-side Kustomize only, no cluster required):

```powershell
node scripts/security-install.mjs
node --test scripts/security/*.test.mjs scripts/verify-release.test.mjs
node scripts/security-scan.mjs source
docker build --build-arg SERVICE=booking-service -t padel/booking-service:security .
node scripts/security-scan.mjs image padel/booking-service:security booking-service
docker build -t padel/web:security web
node scripts/security-scan.mjs image padel/web:security web
```

After installing the scanned images into the existing `padel-e2e` / `padel-ai-local` projects, record a private pre-rollout domain snapshot before making changes. The local deployment checker compares all running image IDs with their passing gates and all domain rows with that snapshot. For this run, the deployed smoke passed **14/14** through actual web/gateway/Keycloak; an isolated Nginx check passed **3/3** with a read-only root, dropped capabilities and bounded tmpfs mounts. The temporary container and exact smoke fixtures were removed. The initial Nginx rollout exposed a changed upstream PID path; this was fixed before acceptance, and an HTTP healthcheck now detects that failure.

```powershell
node scripts/security-deployment-check.mjs
node scripts/performance-local-smoke.mjs --output .runtime/security/local-deployment-results.json
node scripts/security-deployment-check.mjs
node scripts/security-web-smoke.mjs
node scripts/security-report.mjs
```

These verification helpers target the named **existing local projects**, not a cloud/cluster rollout. They require the locally produced gates and `.runtime/security/deployment-snapshot-before.json`. Reusing an old snapshot after intentional user data changes fails the check; take a fresh read-only snapshot before each new rollout. `security-report.mjs` exports a sanitized public summary and two sample SBOMs, leaving private archive/configuration reports in `.runtime`.

Windows uses a digest-pinned Syft Linux container because its native Docker archive reader cannot create cache paths containing `sha256:`. The helper has no network or Docker socket, drops capabilities, uses a read-only root and limits CPU/memory; scratch space is an isolated private host directory. Both Linux and Windows use the **same exported image** for inventory and secret detection. Native Syft config/manifest hashes are verified against the export and CycloneDX metadata. Docker's config digest, OCI index digest and Syft's reconstructed archive manifest digest are recorded separately; they must not be confused with the signed registry digest.

Actual scan JSON, image archives, native inventory and all ten CycloneDX SBOMs are under ignored `.runtime/security/`. Public summary and selected sample SBOMs are under [`docs/security/`](security). Reports state their scanner database update time and artifact identities; a past passing report is not today's vulnerability assessment.

## GitHub release and deployment verification

1. Repository publication and hosted CI completed on 25 October 2026. Review the exact source run and the [published release evidence](RELEASE-v1.0.0.md), not merely the workflow definition.
2. Run CI and review both CodeQL languages, source gate, all ten image gates, integration/contracts, browser/E2E and production rehearsal artifacts. Configure branch rules around those checks. The local actionlint pass is **not** evidence of GitHub execution.
3. The `release` environment is restricted to `main` by an actual deployment branch policy. Required reviewers and main-branch protection are not configured; consider them when adding collaborators.
4. Manually dispatch `Publish verified container images` on the default branch. Inspect the signed provenance/SBOM and verification reports for every image. A failed matrix can leave some published images: treat the release as incomplete until all ten pass. Resolve images from the recorded digest, never a mutable label alone.
5. Before rollout, verify the intended image using a trusted source commit and repository. After rollout, repeat with the container name to compare the running image:

```powershell
node scripts/verify-release.mjs --repo OWNER/REPO --commit EXACT_40_CHAR_COMMIT --image ghcr.io/owner/repo/booking-service@sha256:EXACT_64_CHAR_DIGEST --report .runtime/security/deployment-verification.json --container padel-e2e-booking-service-1
```

The command rejects mutable tags, another repository, malformed commits, failed signatures, missing SBOM attestations and a different/stopped running image. It uses `gh attestation verify`; GitHub authentication and registry access are required. Policy tests use deliberate fixtures/mocks. The 26 October release additionally passed independent cryptographic verification of all ten published images. Verification of a future running deployment remains a separate check.

## Evidence and limits

See [`results.json`](security/results.json) for the historical local reports and [`backend-quality-results.json`](security/backend-quality-results.json) for the stage-6 135-test run. At that stage, the real-model AI quality gate had failed and was not rerun as part of the security work; later local results are recorded separately in [AI natural search](AI-NATURAL-SEARCH.md). The release's AI harness tests validate evaluation tooling, not new real-model quality. Performance results remain the historical, bounded benchmark in [`PERFORMANCE.md`](PERFORMANCE.md).

Scanning covers source configuration and the ten owned application release images. Third-party infrastructure images, build-stage images and scanner binaries are **not included in that ten-image vulnerability result**. Check the full deployment inventory before cloud/cluster rollout. Static dependency detection can miss shaded/native components and does not prove exploitability, absence of vulnerabilities, authorization correctness or production readiness. Completed GitHub CI and the signed public container release are linked above. No penetration test, deployed Kubernetes, public application hosting or SLSA level is claimed.

**CV wording supported by the verified release:**

> Published ten Java/web container images through a gated GitHub Actions pipeline with CodeQL, Trivy and CycloneDX SBOMs; independently verified digest-bound provenance and SBOM attestations against the source commit and signer workflow. The release source passed 154 backend tests, including integration and producer/consumer contracts.

[Release evidence and exact verification scope](RELEASE-v1.0.0.md). These results concern image publication and provenance; they do not claim a running cloud deployment.

Primary documentation: [GitHub attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [verification CLI policy](https://cli.github.com/manual/gh_attestation_verify), [CodeQL](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning), [Trivy Java coverage](https://trivy.dev/docs/latest/coverage/language/java/), [Trivy SBOM scanning](https://trivy.dev/docs/latest/guide/target/sbom/), [Syft inventory](https://oss.anchore.com/docs/guides/sbom/). Version/hash selections used the official publishers' release APIs and registries on 4–5 October 2026. The Trivy publisher's [March incident disclosure](https://github.com/aquasecurity/trivy/discussions/10425) was checked before selecting a later pinned release.
