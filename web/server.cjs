const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const root = __dirname;
// Keep the preview boundary identical to the assets copied into the web image.
const publicAssets = new Set([
  "index.html",
  "assets/padel-court-blue.webp",
  "styles.css",
  "responsive.css",
  "clean.css",
  "assistant.css",
  "app.js",
  "api.js",
  "auth.js",
  "demo.js",
  "demo-play.js",
  "demo-reception.js",
  "utils.js",
  "idempotency.js",
  "resources.js",
  "play.js",
  "reception.js",
  "app-config.json",
  "ui/application.js",
  "ui/assistant.js",
  "ui/components.js",
  "ui/dialogs.js",
  "ui/dialogs/profile.js",
  "ui/dialogs/booking.js",
  "ui/dialogs/memberships.js",
  "ui/dialogs/games.js",
  "ui/dialogs/reception.js",
  "ui/events.js",
  "ui/events/actions.js",
  "ui/events/fields.js",
  "ui/events/forms.js",
  "ui/pages.js",
  "ui/notifications.js",
  "ui/state.js",
  "ui/view.js",
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
function createPreviewServer() {
  return http.createServer((req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    let requested;
    try {
      requested = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (requested.startsWith("/api/")) {
      res.writeHead(503, { "Content-Type": "application/problem+json" });
      return res.end(
        JSON.stringify({
          detail:
            "Το backend δεν έχει ξεκινήσει. Χρησιμοποίησε τη λειτουργία επίδειξης ή ξεκίνησε το Docker Compose.",
        }),
      );
    }
    const asset = requested === "/" ? "index.html" : requested.slice(1);
    if (!publicAssets.has(asset)) {
      res.writeHead(404);
      return res.end();
    }
    const file = path.join(root, asset);
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(data);
    });
  });
}

module.exports = { createPreviewServer, publicAssets };

if (require.main === module)
  createPreviewServer().listen(process.env.PORT || 3000, "127.0.0.1", () =>
    console.log(
      "Padel Club web: http://localhost:" + (process.env.PORT || 3000),
    ),
  );
