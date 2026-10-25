import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      ["node_modules", "test-results", "playwright-report"].includes(entry.name)
    )
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
await check(".");
console.log("All web JavaScript files passed syntax checks.");
