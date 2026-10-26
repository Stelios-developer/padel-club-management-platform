# Verified container release v1.0.0 — 26 October 2026

[Published release and permanent evidence assets](https://github.com/Stelios-developer/padel-club-management-platform/releases/tag/v1.0.0) · [Successful publisher run](https://github.com/Stelios-developer/padel-club-management-platform/actions/runs/40295990074) · [Exact source commit](https://github.com/Stelios-developer/padel-club-management-platform/commit/201617b4886311982ccb7dfde9a8b6179c774ae8)

All **10 application images** were published to GHCR for **Linux/amd64**. Source commit: `201617b4886311982ccb7dfde9a8b6179c774ae8`. Documentation commits made after publication do not change this release's source identity. The [104-second demo](https://github.com/Stelios-developer/padel-club-management-platform/releases/tag/demo-v1) remains a separate media release.

## Evidence

- [Immutable image manifest](security/releases/v1.0.0/manifest.json): all ten image names and SHA-256 digests.
- [Independent verification summary](security/releases/v1.0.0/verification.json): per-image results, signer policy and source identity.
- Release assets include all ten CycloneDX SBOMs, scan gates, hosted verification reports, fresh independent verification output and SHA-256 checksums. The release assets preserve this evidence beyond the Actions artifact retention period.

The publisher passed all **14 jobs**: verification, source security, both CodeQL languages and the ten release jobs. Its source also passed [20/20 CI jobs](https://github.com/Stelios-developer/padel-club-management-platform/actions/runs/40231486708): **154 backend tests, 252 browser cases and 60 full-stack/recovery cases**, plus backup/restore and production-configuration rehearsals. These are hosted results for the stated commit; earlier dated local reports are preserved.

## What was checked

Each image was built once, scanned with the existing fail-closed gate, pushed and pulled back to compare its local image identity. Signed SLSA provenance and a signed CycloneDX SBOM were attached to the resulting registry digest.

Independent GitHub CLI **2.103.2** verification performed **40 cryptographic checks covering 20 signed attestations**: provenance and SBOM for each image, fetched separately from the GitHub API and OCI registry. The policy requires this repository, exact source commit, `refs/heads/main`, the `publish-images.yml` signer workflow and a GitHub-hosted runner. The verified certificate also binds each attestation to this exact publisher run and repository/owner IDs. Each signed SBOM was compared with its scan artifact. Anonymous HTTP reads recomputed all ten public registry manifest digests. The `release` environment is restricted to `main`; required reviewers and main-branch protection are not configured by this release.

| Image                | Verified registry digest                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| config-server        | `sha256:f8156ea2fc5a0eb896b4814fbe97a7b3ecfc6db8ed0293bae5b5b8da2daaa51f` |
| discovery-server     | `sha256:eacb413b34a749d78d745b045c18c1fab4a46d804765288a6479228535dd37dd` |
| api-gateway          | `sha256:36accf8f3fbd1cad0ce68c53db09be82a76f1f81bab931a133cd9d396560a994` |
| member-service       | `sha256:c49efa2fd12e4b88f4817bdbdee271a44e6947dbe1b9123135558dccb93a236c` |
| subscription-service | `sha256:eeabd4ea06b61645aade44dce4b08821685d54a153570e062ce2373b960d2b2d` |
| booking-service      | `sha256:322d14586c73f4c32a3ae59a848600dfc9c3b96853e035bb1ba7ece180f362f4` |
| access-service       | `sha256:c1dadc6e76d2b332a8c8507af84ea30009dec3c7d1f4361dfbcce1a7738fdf75` |
| notification-service | `sha256:2dce40b493160183ebb5d36a8d6718ebd82d49fa5293d7ce02ae847c8ede66c4` |
| assistant-service    | `sha256:a89ed266eacb01a4c6eeae891c5942f0610964c0f60d357917dcef5b100aec4b` |
| web                  | `sha256:e058b810ff8fde1bf03241dfcd9d6adc3e7aee1bcc100d0c725a3072e596d4c3` |

## Reverify an image

Use the immutable reference from the manifest. For example:

```sh
gh attestation verify oci://ghcr.io/stelios-developer/padel-club-management-platform/booking-service@sha256:322d14586c73f4c32a3ae59a848600dfc9c3b96853e035bb1ba7ece180f362f4 --repo Stelios-developer/padel-club-management-platform --signer-workflow Stelios-developer/padel-club-management-platform/.github/workflows/publish-images.yml --source-digest 201617b4886311982ccb7dfde9a8b6179c774ae8 --source-ref refs/heads/main --deny-self-hosted-runners
```

Add `--predicate-type https://cyclonedx.org/bom` for the SBOM. Add `--bundle-from-oci` to fetch the attestations from GHCR. GitHub authentication may be required for the GitHub API; the image manifests were verified as publicly readable.

## Scope

This publishes application containers; public application hosting and AWS/Kubernetes rollout remain separate work. Optional Ollama model weights and third-party infrastructure images are outside the ten-image release. Scan reports retain MEDIUM/LOW findings, and the same four undeployed-infrastructure exceptions expire on **4 November 2026**. A passing gate and valid provenance do not establish vulnerability-free code, a SLSA level or a production deployment.
