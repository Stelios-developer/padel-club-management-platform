import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const kubernetesToolchain = JSON.parse(
  await readFile(
    new URL("../infra/k8s/kind/toolchain.json", import.meta.url),
    "utf8",
  ),
);
export const kubernetesToolDirectory = fileURLToPath(
  new URL("../.tools/kubernetes/", import.meta.url),
);
export function kubernetesTool(name) {
  if (!["kind", "kubectl"].includes(name))
    throw new Error("Unknown Kubernetes tool");
  return resolve(
    kubernetesToolDirectory,
    name + (process.platform === "win32" ? ".exe" : ""),
  );
}
export async function installKubernetesTools() {
  const platform = process.platform + "-" + process.arch;
  await mkdir(kubernetesToolDirectory, { recursive: true });
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  for (const name of ["kind", "kubectl"]) {
    const pin = kubernetesToolchain[name].assets[platform];
    if (!pin) throw new Error("Unsupported platform: " + platform);
    const path = kubernetesTool(name),
      existing = await readFile(path).catch(() => null);
    if (!existing || hash(existing) !== pin.sha256) {
      const response = await fetch(pin.url, {
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok)
        throw new Error(name + " download HTTP " + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== pin.sha256)
        throw new Error(name + " checksum mismatch");
      await writeFile(path, bytes, { mode: 0o755 });
    }
    if (process.platform !== "win32") await chmod(path, 0o755);
    console.log(
      `${name} ${kubernetesToolchain[name].version}: official binary SHA-256 verified`,
    );
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await installKubernetesTools();
