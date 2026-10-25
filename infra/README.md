# Infrastructure and operational configuration

The root [compose.yml](../compose.yml) starts the local application; [compose.ai-local.yml](../compose.ai-local.yml) adds the optional local AI stack. This directory owns supporting configuration and repeatable deployment/test inputs.

| Directory        | Contents and runbook                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `keycloak/`      | Local realm fixtures and Greek login theme; [production security](../docs/PRODUCTION.md)                    |
| `postgres/`      | Local database initialization; service migrations stay in `backend/`                                        |
| `observability/` | Prometheus, Grafana, Loki, Tempo and alert configuration                                                    |
| `ai/`            | Approved knowledge sources and local retrieval setup; [AI assistant](../docs/AI-ASSISTANT.md)               |
| `testing/`       | Isolated integration-test upstream fixtures                                                                 |
| `performance/`   | Reproducible baseline/optimized comparison; [performance](../docs/PERFORMANCE.md)                           |
| `quality/`       | Pinned formatting toolchain policy                                                                          |
| `security/`      | Scanner policy, tool pins, Maven settings and temporary exceptions; [supply chain](../docs/SUPPLY-CHAIN.md) |
| `production/`    | Production preparation templates; [production runbook](../docs/PRODUCTION.md)                               |
| `cloud/`         | AWS Terraform and mock tests; [cloud runbook](../docs/CLOUD.md)                                             |
| `k8s/`           | Kubernetes manifests and generated configuration copies; undeployed scaffold                                |

## Configuration ownership

Canonical application configuration lives in [backend/config-repo](../backend/config-repo/), `keycloak/`, `postgres/init.sql` and [web/app-config.json](../web/app-config.json). Refresh Kubernetes copies from the root:

```sh
npm run sync:k8s
npm run sync:k8s:check
```

Do not edit `k8s/config/` directly. Keep credentials, Terraform state/plans, runtime bundles and backups outside publication. Example files contain local fixtures only. Production/cloud templates are preparation; the repository does not claim a deployed cluster or AWS environment.

[Operator commands](../scripts/README.md) · [Architecture](../docs/ARCHITECTURE.md) · [Documentation index](../docs/README.md)
