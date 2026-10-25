import { localTarget } from "./paths.mjs";

const javaOwners = {
  common: "common",
  "config-server": "config",
  "discovery-server": "discovery",
  "api-gateway": "api",
  "member-service": "member",
  "subscription-service": "subscription",
  "booking-service": "booking",
  "access-service": "access",
  "notification-service": "notification",
  "assistant-service": "assistant",
  "contract-tests": "contracts",
};

export function runtimeBrowserModule(file) {
  return (
    file.startsWith("web/") &&
    file.endsWith(".js") &&
    !/^web\/(?:tests|browser-tests|tools)\//.test(file) &&
    file !== "web/playwright.config.js"
  );
}

export function sourceImports(source) {
  const patterns = [
    /(?:^|\n)[ \t]*import\s+(?:[^;"'`]*?\bfrom\s*)?["']([^"'\r\n]+)["']/g,
    /(?:^|\n)[ \t]*export\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\s*["']([^"'\r\n]+)["']/g,
    /\b(?:import|require)\s*\(\s*["']([^"'\r\n]+)["']/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1]),
  );
}

export function browserCycles(sources) {
  const graph = new Map(
    [...sources]
      .filter(([file]) => runtimeBrowserModule(file))
      .map(([file, source]) => [
        file,
        sourceImports(source)
          .filter((ref) => ref.startsWith("."))
          .map((ref) => localTarget(file, ref.split(/[?#]/)[0])),
      ]),
  );
  const visited = new Set(),
    active = new Set(),
    stack = [],
    problems = [];
  function visit(file) {
    if (active.has(file)) {
      problems.push(
        `Circular browser import: ${[...stack.slice(stack.indexOf(file)), file].join(" -> ")}`,
      );
      return;
    }
    if (visited.has(file) || !graph.has(file)) return;
    active.add(file);
    stack.push(file);
    for (const dependency of graph.get(file)) visit(dependency);
    stack.pop();
    active.delete(file);
    visited.add(file);
  }
  for (const file of graph.keys()) visit(file);
  return problems;
}

export function sourceProblems(file, source, published) {
  const problems = [];
  if (file.startsWith("web/ui/") && !file.endsWith(".js"))
    problems.push(
      `${file}: UI directory is reserved for runtime JavaScript modules`,
    );
  if (file.endsWith(".md")) {
    // Ignore fenced examples; their sample Markdown is not a documentation link.
    const prose = source.replace(
      /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm,
      "",
    );
    for (const link of prose.matchAll(
      /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g,
    )) {
      const target = link[1].replace(/^<|>$/g, "").split("#")[0];
      if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      const relative = localTarget(file, target);
      if (relative === ".") continue;
      if (
        !relative ||
        (!published.has(relative) &&
          ![...published].some((name) => name.startsWith(relative + "/")))
      )
        problems.push(`${file}: unpublished/missing link ${target}`);
    }
  }
  if (/\.(?:js|mjs|cjs)$/.test(file)) {
    for (const specifier of sourceImports(source)) {
      if (!specifier.startsWith(".")) {
        if (runtimeBrowserModule(file))
          problems.push(
            `${file}: browser imports must use published local modules: ${specifier}`,
          );
        continue;
      }
      const target = specifier.split(/[?#]/)[0];
      const relative = localTarget(file, target);
      // Locked CLI dependencies are installed locally and never served to browsers.
      if (relative?.includes("/node_modules/") && !runtimeBrowserModule(file))
        continue;
      if (!relative || !published.has(relative))
        problems.push(`${file}: unpublished/missing import ${target}`);
      if (
        runtimeBrowserModule(file) &&
        relative &&
        (!relative.startsWith("web/") ||
          /^web\/(?:tests|browser-tests|tools|node_modules)\//.test(relative))
      )
        problems.push(`${file}: browser code imports tooling ${target}`);
    }
  }
  const segments = file.split("/");
  const module = segments[0] === "backend" ? segments[1] : segments[0];
  const owner = javaOwners[module];
  if (owner && file.endsWith(".java") && file.includes("/src/")) {
    if (segments[0] !== "backend")
      problems.push(`${file}: Java modules must live under backend/`);
    const declaration = source.match(/^package\s+club\.padel\.([\w]+)[\w.]*;/m);
    if (!declaration || declaration[1] !== owner)
      problems.push(`${file}: Java package does not belong to ${module}`);
    const declaredPackage = source.match(/^package\s+([\w.]+);/m)?.[1];
    const javaPath = file.match(
      /\/src\/(?:main|test|it|contract-test)\/java\/(.+)\/[^/]+\.java$/,
    )?.[1];
    if (
      declaredPackage &&
      javaPath &&
      declaredPackage.replaceAll(".", "/") !== javaPath
    )
      problems.push(
        `${file}: Java package does not match its source directory`,
      );
    if (
      file.includes("/src/main/java/") &&
      /^import\s+(?:static\s+)?(?:org\.junit\.|org\.mockito\.|org\.testcontainers\.)/m.test(
        source,
      )
    )
      problems.push(`${file}: production Java imports test tooling`);
    for (const match of source.matchAll(
      /^import\s+(?:static\s+)?club\.padel\.([\w]+)\./gm,
    )) {
      if (![owner, "common"].includes(match[1]))
        problems.push(
          `${file}: cross-service Java import ${match[1]}; use a client/API contract`,
        );
    }
  }
  return problems;
}
