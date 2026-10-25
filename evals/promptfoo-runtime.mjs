import path from "node:path";
import { readFile } from "node:fs/promises";
export async function promptfooVersion(root) {
  const installed = JSON.parse(
    await readFile(
      path.join(root, "evals/node_modules/promptfoo/package.json"),
      "utf8",
    ),
  );
  const expected = JSON.parse(
    await readFile(path.join(root, "evals/package.json"), "utf8"),
  ).dependencies.promptfoo;
  if (installed.version !== expected)
    throw Error(
      "Installed promptfoo differs from the pinned version; run npm --prefix evals ci",
    );
  return installed.version;
}
export async function loadPromptfoo(root) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 22))
    throw Error("promptfoo requires Node >=22.22.0; use Node 24 LTS");
  await promptfooVersion(root);
  Object.assign(process.env, {
    PROMPTFOO_CONFIG_DIR: path.join(root, ".runtime/ai-evals/promptfoo"),
    PROMPTFOO_DISABLE_TELEMETRY: "1",
    PROMPTFOO_DISABLE_UPDATE: "1",
    PROMPTFOO_DISABLE_SHARING: "true",
    PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: "true",
    PROMPTFOO_DISABLE_REMOTE_GENERATION: "true",
    PROMPTFOO_CACHE_ENABLED: "false",
    PROMPTFOO_LOG_LEVEL: "error",
    PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: "true",
  });
  return (await import("promptfoo")).default;
}
