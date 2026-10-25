const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const { createPreviewServer, publicAssets } = require("../server.cjs");

function copiedDirectory(root, directory) {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const name = `${directory}/${entry.name}`;
    return entry.isDirectory() ? copiedDirectory(root, name) : [name];
  });
}

test("preview serves exactly the public Docker assets with safe response headers", async (t) => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
  const copied = dockerfile
    .match(/^COPY (.+) \/usr\/share\/nginx\/html\/$/m)[1]
    .split(" ");
  copied.push(...copiedDirectory(root, "ui"));
  copied.push(
    ...readdirSync(path.join(root, "assets")).map((name) => `assets/${name}`),
  );
  assert.deepEqual([...publicAssets].sort(), copied.sort());
  const server = createPreviewServer().listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const asset of ["", ...publicAssets]) {
    const response = await fetch(`${base}/${asset}`);
    assert.equal(response.status, 200, asset);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      readFileSync(path.join(root, asset || "index.html")),
    );
  }
});

test("preview rejects private paths, encoded traversal and unsupported methods", async (t) => {
  const server = createPreviewServer().listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const port = server.address().port;
  const request = (target, method = "GET") =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port, path: target, method },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (data) => {
            body += data;
          });
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, body }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  for (const target of [
    "/package.json",
    "/package-lock.json",
    "/server.cjs",
    "/node_modules/prettier/package.json",
    "/tests/server.test.cjs",
    "/.env",
    "/.env.example",
    "/.git/config",
    "/%2e%2e%2f.env",
    "/ui/%2e%2e%2fserver.cjs",
    "/ui\\..\\server.cjs",
    "/unknown-route",
  ])
    assert.equal((await request(target)).status, 404, target);
  assert.equal((await request("/%zz")).status, 400);
  const post = await request("/", "POST");
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");
  const head = await request("/app.js", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  const api = await request("/api/bookings");
  assert.equal(api.status, 503);
  assert.equal(api.headers["content-type"], "application/problem+json");
  assert.equal(typeof JSON.parse(api.body).detail, "string");
});
