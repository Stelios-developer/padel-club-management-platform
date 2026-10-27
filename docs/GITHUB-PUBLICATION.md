# GitHub publication — 25 October 2026

The project is public at **[Stelios-developer/padel-club-management-platform](https://github.com/Stelios-developer/padel-club-management-platform)**, with `main` as the default branch and the [MIT License](../LICENSE) selected by the owner.

**Current status — 27 October 2026:** [v1.1.0](RELEASE-v1.1.0.md) is the latest signed container release, with ten public images and verified local/CI Kubernetes deployment. All four infrastructure exceptions are [closed](SECURITY-HARDENING.md); [remaining security findings](SECURITY-MAINTENANCE.md) retain their scope. The active [main-protection ruleset](https://github.com/Stelios-developer/padel-club-management-platform/rules/25941018) requires pull requests, 22 GitHub Actions checks and up-to-date branches, with zero required approvals and no bypass actors. Force pushes and main deletion are blocked. The first-publication checks below retain their original date and policy.

## Presentation

- Original navy/lime SVG banner and conceptual architecture graphic, with no embedded scripts or external fonts.
- Twelve technology badges linking to implementation/configuration, plus actual GitHub Actions status badges.
- Current member, reception and mobile screenshots captured with isolated synthetic browser-demo data.
- A technology table explains each tool's role; code-review links connect technical claims to source and dated results.
- Repository description and twenty topics identify the Java, distributed-systems and local-AI scope.

[Asset sources and capture scope](assets/github/README.md) · [Service ownership](ARCHITECTURE.md) · [Code map](CODE-MAP.md).

## Public demo

The [demo-v1 release](https://github.com/Stelios-developer/padel-club-management-platform/releases/tag/demo-v1) contains the 104-second MP4, English/Greek subtitles and SHA-256 checksums. The uploaded bytes were verified against the local originals and GitHub asset digests. The video digest matches the [original media report](results/frontend/recruiter-demo-2026-10-13.json).

This is a portfolio-media release based on the 13 October localhost recording. It is separate from the manual signed-image publishing workflow. [Recording and narration details](recruiter-demo/README.md).

## Verification and hosted status

Before the first push, repository checks, formatting (including 115 Java sources), actionlint and all **103 Node tests** passed. The source scan passed with zero blocking findings and zero detected secrets, under the same four infrastructure exceptions expiring 4 November 2026; accepted and MEDIUM/LOW findings remain. The README was rendered with GitHub's Markdown API and checked for broken local images. The application source was not changed by this presentation work.

The earlier [folder verification](FOLDER-LAYOUT-2026-10-25.md) separately records the clean **150-test backend reactor**, **54 real functional E2E cases**, **17-step real user journey**, new local images and source/data preservation. Those results are local evidence, not a hosted CI substitute.

Actual execution is available in [Padel CI](https://github.com/Stelios-developer/padel-club-management-platform/actions/workflows/ci.yml) and [infrastructure checks](https://github.com/Stelios-developer/padel-club-management-platform/actions/workflows/cloud.yml). Consult the run for the current commit; a workflow file or queued run does not establish a passing result. The [v1.0.0 container release](RELEASE-v1.0.0.md) followed on **26 October 2026**, with ten public GHCR images and independent provenance/SBOM verification. The subsequent [v1.1.0 release](RELEASE-v1.1.0.md) records new signed images, dependency maintenance and hardened Kubernetes verification. Public cloud deployment and production cluster operation remain separate work.
