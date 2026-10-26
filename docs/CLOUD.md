# AWS demo preparation — local evidence and activation runbook

**Ενημέρωση 26/10/2026:** το δημόσιο GitHub CI και το [signed v1.0.0 release](RELEASE-v1.0.0.md) έχουν επαληθευτεί. Το [τοπικό Kubernetes/kind](KUBERNETES.md) πέρασε 61/61 integration/recovery cases. Η τρέχουσα πολιτική περιλαμβάνει τέσσερις προσωρινές εξαιρέσεις έως 04/11/2026. AWS/public hosting και production Kubernetes παραμένουν εκκρεμή. Οι παλαιότερες μετρήσεις και περιγραφές παρακάτω διατηρούν την αρχική ημερομηνία και ερμηνεία τους.

Prepared **5 October 2026**. The user chose **local preparation only**: there is no AWS account, approved region/budget or GitHub repository. No AWS resources, public demo, IAM sessions or charges were created. This is the local portion of roadmap stage 7; a real deployment and observed operation remain pending.

## Architecture decision

Use one x86_64 **EC2 / Amazon Linux 2023** host for the first demo, retaining the existing production Compose graph and its PostgreSQL, RabbitMQ, Keycloak, Eureka and Config Server behavior. This avoids migrating stateful services and changing discovery at the same time. The prepared instance choices have at least 8 GiB RAM; they are candidates for rehearsal, not a measured cloud sizing or price estimate. The AI assistant remains **local only** in this cloud graph: the manifest requires all ten signed release images, but the controller changes nine application services and does not install Ollama/pgvector or advertise a successful AI quality gate.

This is a single host in a single availability zone, with a public IP and only HTTP/HTTPS inbound security-group rules. Application services remain inside private Compose networks. Administration uses [SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html), with no inbound SSH rule or SSH key. EC2 termination protection, IMDSv2 with hop limit 1, encrypted root/data disks and standard CPU credits are configured. Changing the AMI/bootstrap can still replace the host; review the plan and retained disk before doing so. No high availability or production SLO is claimed.

The distinct retained EBS data disk has `prevent_destroy`; Terraform refuses a plan that would remove it. EC2 user data installs runtime packages and configures Docker's data directory, but **does not format any disk or start the application**. Docker's systemd unit refuses to start unless `/srv/padel-data` is mounted. Before activating a host, the operator must inspect the exact returned EBS volume, initialize it only if genuinely new/empty, mount it by filesystem UUID, check reboot persistence and test Docker data retention. No automated blanket disk format/delete is supplied.

S3 state and artifact/backup buckets have KMS encryption, blocked public access, versioning and TLS-only policies. State uses [S3 native locking](https://developer.hashicorp.com/terraform/language/backend/s3); the plan role can write/delete **only the `.tflock` object**, not state. The bootstrap module uses protected local state initially: after bootstrap, retain that state securely or migrate it to a separate key in the created bucket. Never lose bootstrap state or delete the KMS key while encrypted state/backups need recovery.

CloudWatch deployment logs and VPC flow logs are encrypted and retained for 30 days. Backup objects expire after 90 days and old versions after 30 days; the bucket is storage preparation, **not a tested scheduled backup job**. The existing [encrypted backup/restore tools](PRODUCTION.md) must be rehearsed on the real host. Upload only encrypted archives/metadata to `backups/` using explicit KMS headers; store the AES backup key separately off the host. Do not copy the current local user's databases into a public demo.

## Local verification

Terraform **1.16.5** and AWS provider **6.67.0** are pinned; provider lockfiles are committed. The Terraform installer uses the publisher's pinned archive SHA-256, not a remote shell installer. Checksums establish consistency with publisher metadata, not independent scanner/compiler authenticity. Code lives under [`infra/cloud/`](../infra/cloud).

```powershell
node scripts/security-install.mjs terraform trivy
node scripts/cloud-check.mjs
node scripts/cloud-config-scan.mjs
node --test scripts/cloud/*.test.mjs scripts/security/*.test.mjs scripts/verify-release.test.mjs scripts/operations/*.test.mjs
```

The helper initializes with `-backend=false`, validates both modules and runs only tests with an explicit mocked AWS provider. Mock apply operations simulate resource state; they make **no AWS provisioning calls**. Some assertions need computed policy values, so both mock applies and negative mock plans are used. Test cleanup applies only to simulated resources. Registry/tool downloads still need network access.

The nine Terraform scenarios cover state encryption/recovery/locking, compute disabled without an invented budget, exact OIDC repository/environment/audience, deploy/state grants, artifact retention/transport/flow logs, web-only ingress, configured host safeguards, missing budget and wildcard-repository rejection. Eleven release-policy tests cover incomplete releases, swapped images, digest/source binding, synthetic-demo approval, exact HTTPS origins, rollback compatibility and failure reporting. The full Node check includes seventeen shared security and four production-config tests. [Recorded results](cloud/results.json) distinguish mock evidence from cloud execution; earlier backend/performance reports remain historical.

Local actionlint checks all workflows. Shell syntax was checked with `bash -n`; neither this nor mocks execute EC2 bootstrap or establish that a real AWS role has every required API permission. The first real refresh/deployment must resolve any provider/API/OS integration issue.

## Vulnerability/configuration policy

The cloud Terraform scan passes the existing gate with **one exact temporary exception**, expiring **4 November 2026**: `AWS-0104` on `infra/cloud/demo/main.tf`, resource `aws_vpc_security_group_egress_rule.https`. TCP 443 can reach arbitrary destinations for dynamic AWS/GitHub/CDN/package/ACME endpoints. Normal TLS validation and restricted protocols do not eliminate the destination restriction gap. Before real deployment, review a destination-aware egress proxy / VPC endpoints and their operational cost. The exception does not match SMTP, another resource, another file or inbound management access. SMTP has no egress rule until specific provider CIDRs are supplied.

This is accepted temporary risk, **not a fixed finding or a false positive**. LOW findings (S3 access logging) remain visible. The executable [exception policy](../infra/security/exceptions.json) now has **six entries**: the five recorded during stage 6 plus this cloud-specific entry. Stage-6 snapshots keep their original five-exception scope; the new source/configuration snapshot records the current scope. Expiry fails the gate and requires review/removal. The policy cannot allow secret exceptions.

## GitHub identity and deployment boundaries

There is no CI Terraform apply role/workflow. Initial provisioning and later infrastructure changes are an operator task through short-lived AWS IAM Identity Center/SSO credentials, with reviewed plans and budget approval.

The read role trusts exactly `repo:OWNER/REPO:environment:cloud-plan`; the separate deployment role trusts exactly `repo:OWNER/REPO:environment:cloud-deploy`, both with audience `sts.amazonaws.com`. Existing account-wide GitHub OIDC providers can be reused. The [GitHub OIDC documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) explains the environment subject format. **Configure environment branch restrictions and required reviewers in GitHub**: a YAML environment name does not establish those protections, and the AWS subject alone does not constrain a workflow filename.

- [`cloud.yml`](../.github/workflows/cloud.yml) runs credential-free schema/mock/configuration checks.
- [`cloud-plan.yml`](../.github/workflows/cloud-plan.yml) performs a manual **refresh-only** drift assessment through OIDC. It never applies or uploads raw state/plan files.
- [`cloud-deploy.yml`](../.github/workflows/cloud-deploy.yml) is manual, restricted to the default branch, and disabled until `CLOUD_DEPLOY_ENABLED=true`. It downloads artifacts from a successful complete publish run for the exact source commit and re-verifies all ten provenance/SBOM attestations before assuming an AWS role. It uploads only the image manifest and invokes one fixed SSM document on one tagged instance. The role cannot write Terraform state, alter IAM, upload host scripts or run arbitrary shell documents.

The SSM document accepts only a 40-character revision and 64-character manifest hash, with [environment-variable interpolation](https://docs.aws.amazon.com/systems-manager/latest/userguide/documents-syntax-data-elements-parameters.html). It uses `flock` to serialize host rollouts. Old SSM agents without interpolation support fail rather than falling back to command-text substitution.

The host controller must be installed **out of band from a reviewed immutable code revision** in `/opt/padel`; manifest uploads cannot replace it. It verifies the manifest hash, repository, source and exact per-service digest, then verifies attestations again, validates private production credentials/origins, pulls images and writes an image-only Compose override. It compares running image identities, checks container health and anonymous public HTTPS/OIDC discovery/admin blocking, then atomically records the active manifest. It does not create accounts, change volume definitions, install AI weights or import real user data.

Automatic rollback defaults off. Enabling it requires `rollbackAllowed=true` **and** the exact `rollbackFromRevision` / `rollbackToRevision` pair in the private operator configuration, after verifying migration compatibility. A rolled-back deployment still fails the release job. There is no automatic database rollback; destructive migrations need a separately rehearsed recovery plan. A failed or timed-out SSM run must be inspected before another rollout. Anonymous HTTPS smoke is not a substitute for authenticated role/booking tests or real restore/availability evidence.

## Activation when prerequisites exist

1. Select a real account, region/AZ, reviewed AL2023 AMI, monthly budget/email, two DNS hosts and working SMTP. Price compute, disks/snapshots, public IPv4, transfer, S3/KMS and CloudWatch for the chosen region. Even `enable_compute=false` can create billable keys/storage/logs if an operator applies the module. [AWS Budgets notifications](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) can lag spending and **do not impose a hard spending cap**.
2. Use SSO to provision the bootstrap module with explicit variables. Keep its initial state private. Prepare the protected demo backend from `bootstrap` output and `backend.hcl.example`; put actual parameters in ignored local files, never credentials in Terraform variables/backend files. Initialize the demo with that backend. No apply command was run during this work.
3. Review the demo plan, budget and persistence layout before enabling compute. The illustrative `terraform.tfvars.example` has no approved account/AMI/budget. Initial GitHub OIDC roles must be created by the operator; a future CI role cannot bootstrap its own trust safely. Verify the read-only role with the first refresh-only run.
4. On the new isolated host, inspect/mount the retained disk, install reviewed versions of [Docker Compose](https://docs.docker.com/compose/install/linux/) and GitHub CLI, and configure registry/GitHub read access if a private repository requires it. Validate `node --version`, `aws --version`, `gh --version`, `docker compose version`, current SSM agent and reboot persistence. Bootstrap commands were only syntax-checked here.
5. Install the reviewed controller source and link its private `.runtime` directory into retained storage. Generate a **fresh production bundle** with the existing preparation tool; configure real SMTP and first privileged MFA identity through private SSM access. Inventory/pin/scan third-party infrastructure images as well; the stage-6 ten-image result does not cover them. Complete TLS, role/booking, backup/restore and temporary-fixture cleanup rehearsals before approving public synthetic data/demo access.
6. Set `/etc/padel-cloud/host.json` from `host.example.json` with root ownership/mode 0600. The three approval flags default false and must reflect completed operator checks. Configure GitHub environments, default-branch restrictions/reviewers and the variables below, then enable plan/deploy only after prerequisites pass.
7. Publish the signed release first, select its successful run ID and exact commit, and dispatch deployment. Record actual IAM/API results, authenticated smoke, rollout/rollback/reboot/restore behavior, observation interval and cost. None of these has been measured in AWS yet.

| GitHub variable                                                        | Value source                          |
| ---------------------------------------------------------------------- | ------------------------------------- |
| `AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_AVAILABILITY_ZONE`                | Selected account/region/AZ            |
| `TF_STATE_BUCKET`, `TF_STATE_KMS_KEY_ARN`                              | Bootstrap output                      |
| `AWS_GITHUB_OIDC_PROVIDER_ARN`                                         | Created/reused GitHub provider        |
| `AWS_PLAN_ROLE_ARN`, `AWS_DEPLOY_ROLE_ARN`                             | Demo outputs                          |
| `CLOUD_ARTIFACT_BUCKET`, `CLOUD_ARTIFACT_KMS_KEY_ARN`                  | Demo outputs                          |
| `CLOUD_INSTANCE_ID`, `CLOUD_DEPLOY_DOCUMENT`, `CLOUD_DEPLOY_LOG_GROUP` | Demo outputs                          |
| `CLOUD_PLAN_ENABLED`, `CLOUD_DEPLOY_ENABLED`                           | Explicit `true` after operator checks |

The public IP can change with host lifecycle; configure DNS/TTL and verify certificates after such changes. Retained EBS is tied to one AZ; it is not an independent backup or cross-AZ recovery strategy. Termination protection and `prevent_destroy` require deliberate handling at teardown, and retained resources can continue charging. Teardown and restore must be reviewed with the actual account inventory, not a blanket `terraform destroy` copied from a tutorial.

Actual AWS operation remains unverified until the activation evidence is recorded.
