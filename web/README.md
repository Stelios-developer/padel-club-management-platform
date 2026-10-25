# Web application

Responsive Greek interface for members, reception staff and administrators. Native JavaScript modules keep authentication, transport, data lifecycle and rendering separate. Nginx serves production assets; the Node preview server serves the same public asset set.

| Location                                 | Responsibility                                          |
| ---------------------------------------- | ------------------------------------------------------- |
| `index.html`, `styles.css`, `assets/`    | Page shell, design and static assets                    |
| `app.js`, `app-config.json`              | Startup and public runtime configuration                |
| `auth.js`, `api.js`                      | OIDC/PKCE session and HTTP transport                    |
| `resources.js`, `idempotency.js`         | Protected data lifecycle and mutation intents           |
| `ui/`                                    | State, pages, shared components and feature controllers |
| `ui/dialogs/`, `ui/events/`              | Feature-specific dialogs and event handlers             |
| `demo.js`                                | Isolated browser demo with synthetic data               |
| `tests/`                                 | Node unit tests and public-asset server checks          |
| `browser-tests/`                         | Playwright journeys and accessibility checks            |
| `tools/`                                 | Browser testing support                                 |
| `Dockerfile`, `nginx.conf`, `server.cjs` | Container serving and local preview                     |

## Preview and verify

From the repository root:

```sh
node web/server.cjs
# Open http://localhost:3000 and choose «Δες την επίδειξη».
```

```sh
npm --prefix web ci
npm run test:web
npm run test:browser
```

The demo uses localStorage; real sign-in and bookings require the root Compose stack. Install the Playwright engines before browser tests; see the [browser runbook](../docs/BROWSER-ACCESSIBILITY.md).

Publish new runtime modules explicitly in `server.cjs` and `.dockerignore`. Private reports, tests, credentials and tools must not be served. [Frontend lifecycle and maintenance](../docs/FRONTEND.md) explains the controllers, session guards and asset checks.
