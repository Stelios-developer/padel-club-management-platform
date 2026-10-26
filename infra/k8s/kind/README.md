# Isolated kind profile

`cluster.yml` defines the single-node, loopback-only mappings. `toolchain.json` pins official kind/kubectl downloads, the Kubernetes node image and the four infrastructure images.

Run `node scripts/kubernetes.mjs up` from the repository root. Credentials, generated Kustomize input and cluster kubeconfig stay under ignored `.runtime/kubernetes/`. The user's default kubeconfig and canonical `../config/` copies are preserved.

[Deployment, tests, scope and operational details](../../../docs/KUBERNETES.md).
