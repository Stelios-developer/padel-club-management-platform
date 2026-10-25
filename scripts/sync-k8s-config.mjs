import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function configSources(root = repositoryRoot) {
  const configs = (await readdir(resolve(root, "backend/config-repo")))
    .filter((name) => name.endsWith(".yml"))
    .sort()
    .map((name) => [`backend/config-repo/${name}`, name]);
  return [
    ...configs,
    ["infra/keycloak/padel-realm.json", "padel-realm.json"],
    [
      "infra/keycloak/themes/padel/login/theme.properties",
      "padel-theme.properties",
    ],
    [
      "infra/keycloak/themes/padel/login/resources/css/padel.css",
      "padel-theme.css",
    ],
    [
      "infra/keycloak/themes/padel/login/resources/img/court.svg",
      "padel-court.svg",
    ],
    [
      "infra/keycloak/themes/padel/login/messages/messages_el.properties",
      "padel-messages-el.properties",
    ],
    ["infra/postgres/init.sql", "init.sql"],
    ["web/app-config.json", "app-config.json"],
  ];
}

export async function syncConfig({
  root = repositoryRoot,
  check = false,
} = {}) {
  const destination = resolve(root, "infra/k8s/config");
  if (!check) await mkdir(destination, { recursive: true });
  const drift = [];
  for (const [source, name] of await configSources(root)) {
    const target = resolve(destination, name);
    if (check) {
      const actual = await readFile(target).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (!actual || !actual.equals(await readFile(resolve(root, source))))
        drift.push(name);
    } else {
      await copyFile(resolve(root, source), target);
    }
  }
  if (drift.length)
    throw new Error(
      `Stale Kubernetes copies: ${drift.join(", ")}. Run npm run sync:k8s.`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.slice(2).some((arg) => arg !== "--check"))
    throw new Error("Usage: sync-k8s-config.mjs [--check]");
  await syncConfig({ check: process.argv.includes("--check") });
  console.log(
    process.argv.includes("--check")
      ? "Kubernetes inputs match their source files."
      : "Kubernetes inputs refreshed. No cluster operation performed.",
  );
}
