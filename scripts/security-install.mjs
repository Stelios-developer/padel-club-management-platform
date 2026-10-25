import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// No remote install script or nested setup action. Review version/checksum changes together.
const manifest = JSON.parse(
  await readFile(new URL("../infra/security/toolchain.json", import.meta.url)),
);
for (const name of process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["trivy", "syft", "actionlint"]) {
  const tool = manifest[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const asset = tool.assets[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error("Supported hosts: Linux/Windows x64");
  const directory = resolve(".tools/security", name);
  await mkdir(directory, { recursive: true });
  const archive = resolve(directory, asset.name);
  let bytes;
  try {
    bytes = await readFile(archive);
  } catch {
    /* Download on first use. */
  }
  if (
    !bytes ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  ) {
    const url =
      asset.url ||
      `https://github.com/${tool.repository}/releases/download/v${tool.version}/${asset.name}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok)
      throw new Error(`Download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      throw new Error("Tool checksum mismatch");
    await writeFile(archive, bytes);
  }
  // GNU tar on Linux cannot extract ZIP; Windows' bundled BSD tar can.
  const zipOnLinux =
    process.platform === "linux" && asset.name.endsWith(".zip");
  const result = spawnSync(
    zipOnLinux ? "unzip" : "tar",
    zipOnLinux
      ? ["-q", "-o", archive, "-d", directory]
      : ["-xf", archive, "-C", directory],
    {
      stdio: "inherit",
    },
  );
  if (result.status !== 0) throw new Error(`Extraction failed: ${name}`);
  const executable = resolve(
    directory,
    `${name}${process.platform === "win32" ? ".exe" : ""}`,
  );
  if (process.platform !== "win32") await chmod(executable, 0o755);
  console.log(`${name} ${tool.version}: publisher archive SHA-256 verified`);
}
