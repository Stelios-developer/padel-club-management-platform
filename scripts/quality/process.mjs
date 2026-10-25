import { spawnSync } from "node:child_process";

export function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${executable} exited with status ${result.status}`);
  return result.stdout;
}

export function publicationFiles() {
  return [
    ...new Set(
      run(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      )
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
}
