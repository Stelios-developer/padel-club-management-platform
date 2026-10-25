import test from "node:test";
import assert from "node:assert/strict";
import {
  localTarget,
  privatePublicationPath,
  sourceProblems,
} from "./checks.mjs";
import { browserCycles, sourceImports } from "./source.mjs";

const statement = (prefix, path) => `${prefix} ${JSON.stringify(path)};`;

test("publication rejects generated output and nested credentials but keeps examples and evidence", () => {
  for (const file of [
    ".aws/credentials",
    "web/.env.production",
    "infra/cloud/staging.tfvars",
    "infra/cloud/terraform.tfstate.backup",
    "ops/auth.p12",
    "ops/auth.jks",
    "backend/common/target/Classes.class",
    "web/node_modules/module.js",
  ])
    assert.equal(privatePublicationPath(file), true, file);
  for (const file of [
    ".env.example",
    "web/.env.production.example",
    "infra/cloud/demo/terraform.tfvars.example",
    "docs/results/backend/result.json",
    "web/app.js",
  ])
    assert.equal(privatePublicationPath(file), false, file);
});

test("local references reject repository escapes and malformed encoded paths", () => {
  assert.equal(localTarget("docs/README.md", "../web/app.js"), "web/app.js");
  assert.equal(
    localTarget("README.md", "docs/My%20Guide.md"),
    "docs/My Guide.md",
  );
  for (const target of [
    "../secret",
    "%2e%2e/secret",
    "bad%escape",
    "/outside",
    "..\\outside",
    "secret%00file",
  ])
    assert.equal(localTarget("README.md", target), null, target);
});

test("documentation links must ship with the repository rather than point to local results", () => {
  const published = new Set(["docs/API.md", "docs/My Guide.md", "README.md"]);
  assert.deepEqual(
    sourceProblems(
      "README.md",
      "[API](docs/API.md#idempotency) [Guide](<docs/My Guide.md>) [Web](https://example.com)\n```md\n[Example](does-not-exist)\n```",
      published,
    ),
    [],
  );
  assert.match(
    sourceProblems("README.md", "[Result](.runtime/run.json)", published)[0],
    /unpublished/,
  );
});

test("ESM side-effect, query-versioned and dynamic imports require published source", () => {
  const published = new Set(["web/api.js"]);
  assert.deepEqual(
    sourceProblems(
      "web/app.js",
      statement("import { request } from", "./api.js?v=4"),
      published,
    ),
    [],
  );
  assert.equal(
    sourceProblems(
      "web/app.js",
      statement("import", "./missing.js") + statement("import(", "./other.js"),
      published,
    ).length,
    2,
  );
});

test("browser modules cannot import tooling even when the file is published", () => {
  assert.match(
    sourceProblems(
      "web/ui/pages.js",
      statement(
        "import { deploy } from",
        "../../scripts/deploy-production.mjs",
      ),
      new Set(["scripts/deploy-production.mjs"]),
    )[0],
    /browser code imports tooling/,
  );
});

test("Java services own their packages and communicate through common contracts", () => {
  const file =
    "backend/booking-service/src/main/java/club/padel/booking/BookingService.java";
  assert.deepEqual(
    sourceProblems(
      file,
      "package club.padel.booking;\nimport club.padel.common.MemberClient;",
      new Set(),
    ),
    [],
  );
  assert.match(
    sourceProblems(
      file,
      "package club.padel.booking;\nimport club.padel.member.MemberRepository;",
      new Set(),
    )[0],
    /cross-service Java import/,
  );
  assert.match(
    sourceProblems(file, "package club.padel.member;", new Set())[0],
    /Java package does not belong/,
  );
});

test("Java ownership checks reject legacy root modules instead of bypassing backend boundaries", () => {
  assert.match(
    sourceProblems(
      "booking-service/src/main/java/club/padel/booking/BookingService.java",
      "package club.padel.booking;",
      new Set(),
    )[0],
    /must live under backend/,
  );
});

test("all runtime browser modules reject Node, npm and operator imports", () => {
  for (const file of [
    "web/api.js",
    "web/demo.js",
    "web/ui/dialogs/booking.js",
  ]) {
    for (const specifier of [
      "node:fs",
      "lodash",
      "../".repeat(file.split("/").length - 1) +
        "scripts/deploy-production.mjs",
    ]) {
      const problems = sourceProblems(
        file,
        statement("import", specifier),
        new Set(["scripts/deploy-production.mjs"]),
      );
      assert(
        problems.some((problem) => /browser/.test(problem)),
        `${file}: ${specifier}`,
      );
    }
  }
  assert.match(
    sourceProblems("web/ui/private.json", "{}", new Set())[0],
    /runtime JavaScript/,
  );
});

test("browser cycle checks allow shared dependencies but reject cycles", () => {
  const valid = new Map([
    ["web/app.js", "import './ui/a.js'; import './ui/b.js';"],
    ["web/ui/a.js", "import '../utils.js';"],
    ["web/ui/b.js", "import '../utils.js';"],
    ["web/utils.js", "export const value = 1;"],
  ]);
  assert.deepEqual(browserCycles(valid), []);
  valid.set("web/utils.js", "import './ui/a.js?v=1';");
  assert.match(
    browserCycles(valid)[0],
    /web\/ui\/a.js -> web\/utils.js -> web\/ui\/a.js/,
  );
});

test("module references distinguish imports from ordinary from query keys", () => {
  const source = [
    statement("import { value } from", "./value.js"),
    statement("export { value } from", "./value.js"),
    statement("import(", "./lazy.js"),
    'const start = query.get("from"); const end = query.get("to");',
  ].join("\n");
  assert.deepEqual(sourceImports(source), [
    "./value.js",
    "./value.js",
    "./lazy.js",
  ]);
});

test("Java packages match their directories and production code excludes test tooling", () => {
  const file =
    "backend/booking-service/src/main/java/club/padel/booking/BookingService.java";
  assert.match(
    sourceProblems(file, "package club.padel.booking.internal;", new Set())[0],
    /source directory/,
  );
  for (const dependency of [
    "org.junit.jupiter.api.Test",
    "org.mockito.Mockito",
    "org.testcontainers.containers.PostgreSQLContainer",
  ]) {
    assert.match(
      sourceProblems(
        file,
        `package club.padel.booking;\nimport ${dependency};`,
        new Set(),
      )[0],
      /test tooling/,
    );
  }
  assert.deepEqual(
    sourceProblems(
      file.replace("/main/", "/test/"),
      "package club.padel.booking;\nimport org.junit.jupiter.api.Test;",
      new Set(),
    ),
    [],
  );
});
