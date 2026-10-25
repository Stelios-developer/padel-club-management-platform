// Real browser journey against the dedicated local padel-e2e stack. No mocks.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify, parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  chromium,
  firefox,
  webkit,
  expect,
} from "../web/node_modules/@playwright/test/index.mjs";
import { today, addDays } from "../web/utils.js";
import AxeBuilder from "../web/node_modules/@axe-core/playwright/dist/index.mjs";

const { values, tokens } = parseArgs({
  options: {
    experience: { type: "boolean", default: false },
    browser: { type: "string", default: "chromium" },
    accessibility: { type: "boolean", default: false },
  },
  tokens: true,
});
const experience = values.experience;
const browserName = values.browser;
const selectedBrowser = tokens.some((token) => token.name === "browser");
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, browserName))
  throw new Error(
    "Usage: node scripts/user-journey.mjs [--experience] [--browser chromium|firefox|webkit] [--accessibility]",
  );
const exec = promisify(execFile);
const root = new URL("../", import.meta.url);
const outputName =
  (experience ? "ux-walkthrough" : "user-journey") +
  (selectedBrowser ? `-${browserName}` : "");
const output = new URL(`../test-results/${outputName}/`, import.meta.url);
const base = "http://localhost:3000";
const identity = "http://localhost:8081";
const settings = Object.fromEntries(
  (await readFile(new URL("../.env.example", import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const runId = randomBytes(6).toString("hex");
const actors = [];
const journal = {
  runId,
  identities: [],
  registrationEmails: [],
  profiles: [],
  bookings: [],
  subscriptions: [],
  waitlist: [],
};
const report = {
  startedAt: new Date().toISOString(),
  runId,
  completed: false,
  mockedTransport: false,
  publicRegistration: experience,
  browserEngine: browserName,
  project: "padel-e2e",
  steps: [],
  cleanup: [],
  observations: {},
  screenshots: [],
};
let browser, member, partner, staff, game, before;
const errors = [];
const nav = (page) => page.getByRole("navigation", { name: "Κύρια πλοήγηση" });
const scrub = (error) => {
  let message = error.message || String(error);
  for (const actor of actors)
    for (const secret of [actor.password, actor.token])
      if (secret) message = message.replaceAll(secret, "[redacted]");
  return message;
};
async function save() {
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL("fixtures.json", output),
    JSON.stringify(journal, null, 2) + "\n",
  );
  await writeFile(
    new URL("results.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
}
async function snapshot(actor, name) {
  if (!experience) return;
  await mkdir(output, { recursive: true });
  const filename = `${name}.png`;
  await actor.page.screenshot({
    path: fileURLToPath(new URL(filename, output)),
    fullPage: true,
  });
  report.screenshots.push(filename);
}
async function accessibility(page, name) {
  if (!values.accessibility) return;
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  report.observations.accessibility ||= [];
  report.observations.accessibility.push({
    name,
    violations: result.violations,
    incomplete: result.incomplete,
  });
  await save();
  assert.equal(result.violations.length, 0, `Accessibility scan: ${name}`);
}
async function step(name, work) {
  const started = Date.now();
  try {
    await work();
    report.steps.push({ name, passed: true, durationMs: Date.now() - started });
    console.log("PASS " + name);
  } catch (error) {
    for (const [index, actor] of actors.entries()) {
      if (actor.page && !actor.page.isClosed())
        await actor.page
          .screenshot({
            path: new URL(`failure-${index}.png`, output).pathname.replace(
              /^\/([A-Z]:)/,
              "$1",
            ),
            fullPage: true,
          })
          .catch(() => {});
    }
    report.steps.push({
      name,
      passed: false,
      durationMs: Date.now() - started,
      error: scrub(error),
    });
    throw error;
  } finally {
    await save();
  }
}
async function http(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, headers: response.headers, data };
}
async function admin(path, method = "GET", body) {
  const login = await http(
    identity + "/realms/master/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: settings.KEYCLOAK_ADMIN,
        password: settings.KEYCLOAK_ADMIN_PASSWORD,
      }),
    },
  );
  assert.equal(login.status, 200, "Development identity admin login");
  return http(identity + "/admin/realms/padel" + path, {
    method,
    headers: {
      Authorization: "Bearer " + login.data.access_token,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function api(actor, path, method = "GET", body) {
  assert(actor.token, "Browser must obtain its real OIDC token");
  return http(base + path, {
    method,
    headers: {
      Authorization: "Bearer " + actor.token,
      "Content-Type": "application/json",
      "Accept-Language": "el-GR",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function database(db, query) {
  assert(
    ["padel_members", "padel_bookings", "padel_subscriptions"].includes(db),
  );
  const { stdout } = await exec(
    "docker",
    [
      "exec",
      "padel-e2e-postgres-1",
      "psql",
      "-U",
      settings.DB_USER,
      "-d",
      db,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    { cwd: root, windowsHide: true, timeout: 20000 },
  );
  return stdout.trim();
}
async function fingerprints() {
  const result = {};
  for (const [db, table, ids] of [
    ["padel_members", "members", journal.profiles],
    ["padel_bookings", "bookings", journal.bookings],
    ["padel_subscriptions", "subscriptions", journal.subscriptions],
  ]) {
    for (const id of ids) assert.match(id, /^[a-f0-9-]{36}$/);
    result[table] = await database(
      db,
      `SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY id), '')) FROM ${table} t ${ids.length ? `WHERE id NOT IN (${ids.map((id) => `'${id}'`).join(",")})` : ""};`,
    );
  }
  return result;
}
async function createActor(suffix, administrator = false, register = false) {
  const actor = {
    name: `Δοκιμή ${suffix} ${runId}`,
    password: randomBytes(24).toString("base64url") + "aA1!",
    token: null,
  };
  actors.push(actor);
  const username = `journey-${runId}-${suffix}`;
  actor.email = username + "@example.invalid";
  actor.username = actor.email;
  actor.registrationPending = register;
  if (register) {
    journal.registrationEmails.push(actor.email);
    await save();
  }
  if (!register) {
    const created = await admin("/users", "POST", {
      username,
      email: username + "@example.invalid",
      enabled: true,
      emailVerified: true,
      firstName: "Journey",
      lastName: suffix,
      credentials: [
        { type: "password", value: actor.password, temporary: false },
      ],
    });
    assert.equal(created.status, 201);
    actor.id = created.headers.get("location").split("/").at(-1);
    journal.identities.push(actor.id);
    await save();
    if (administrator) {
      const role = await admin("/roles/ADMIN");
      assert.equal(role.status, 200);
      assert.equal(
        (
          await admin(`/users/${actor.id}/role-mappings/realm`, "POST", [
            role.data,
          ])
        ).status,
        204,
      );
    }
    const stored = await admin(`/users/${actor.id}`);
    assert.equal(stored.status, 200);
    actor.username = stored.data.username;
    actor.email = stored.data.email;
  }
  actor.context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  actor.page = await actor.context.newPage();
  actor.page.on("pageerror", (error) => errors.push(scrub(error)));
  return actor;
}
async function findRegisteredActor(actor) {
  const found = await admin(
    `/users?email=${encodeURIComponent(actor.email)}&exact=true`,
  );
  assert.equal(found.status, 200);
  const matches = found.data.filter((user) => user.email === actor.email);
  assert.equal(
    matches.length,
    1,
    "Exactly one identity created by public registration",
  );
  actor.id = matches[0].id;
  actor.username = matches[0].username;
  journal.identities.push(actor.id);
  actor.registrationPending = false;
  await save();
}
async function registerMember(actor) {
  const page = actor.page;
  await page.goto(base);
  await snapshot(actor, "01-welcome");
  await page
    .getByRole("button", { name: "Μπες στο παιχνίδι", exact: true })
    .click();
  await page.waitForURL((url) => url.origin === identity);
  assert.equal(
    new URL(page.url()).searchParams.get("code_challenge_method"),
    "S256",
  );
  await accessibility(page, "Greek login");
  await page.getByRole("link", { name: /^(Εγγραφή|Register)$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Δημιουργία λογαριασμού", exact: true }),
  ).toBeVisible();
  await accessibility(page, "Greek registration");
  await page.locator('input[type="submit"]').click();
  await expect(
    page.getByText("Συμπλήρωσε το email σου.", { exact: true }),
  ).toBeVisible();
  await accessibility(page, "Greek registration errors");
  actor.name = `Νέο Μέλος ${runId}`;
  const fill = async (confirmation) => {
    await page.locator("#email").fill(actor.email);
    await page.locator("#password").fill(actor.password);
    await page.locator("#password-confirm").fill(confirmation);
    await page.locator("#firstName").fill("Νέο");
    await page.locator("#lastName").fill(`Μέλος ${runId}`);
  };
  await fill("Different-test-password-aA1!");
  await page.locator('input[type="submit"]').click();
  await expect(
    page.getByText("Οι δύο κωδικοί δεν ταιριάζουν.", { exact: true }),
  ).toBeVisible();
  const absent = await admin(
    `/users?email=${encodeURIComponent(actor.email)}&exact=true`,
  );
  assert.equal(absent.status, 200);
  assert.equal(
    absent.data.length,
    0,
    "Invalid registration creates no identity",
  );
  await snapshot(actor, "02-registration-validation");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Registration fits mobile viewport",
  );
  await snapshot(actor, "02-registration-mobile");
  await accessibility(page, "Greek registration at 390px");
  await fill(actor.password);
  const token = page.waitForResponse(
    (r) =>
      r.url().endsWith("/protocol/openid-connect/token") && r.status() === 200,
  );
  await page.locator('input[type="submit"]').click();
  actor.token = (await (await token).json()).access_token;
  await findRegisteredActor(actor);
  await expect(nav(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  report.observations.registration = {
    missingEmailRejected: true,
    passwordMismatchRejected: true,
    invalidSubmissionCreatesNoIdentity: true,
    authenticatedAfterRegistration: true,
    primaryMemberViewport: { width: 390, height: 844 },
    language: "Greek identity form and application; optional English locale",
  };
  report.observations.registration.initialWarnings = await page
    .getByLabel("Ενότητες με πρόβλημα")
    .allTextContents();
  await expect(page.getByLabel("Ενότητες με πρόβλημα")).toHaveCount(0);
  report.observations.registration.noMisleadingServiceWarnings = true;
}
async function login(actor, wrongPassword = false) {
  const page = actor.page;
  await page.goto(base);
  await page.getByRole("button", { name: "Σύνδεση", exact: true }).click();
  await page.waitForURL((url) => url.origin === identity);
  const url = new URL(page.url());
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("client_id"), "padel-web");
  await page.locator("#username").fill(actor.username);
  if (wrongPassword) {
    await page.locator("#password").fill("Incorrect-test-password-aA1!");
    await page.locator("#kc-login").click();
    await expect(
      page.getByText(
        /Το email ή ο κωδικός δεν είναι σωστός\.|Invalid username or password/i,
      ),
    ).toBeVisible();
    assert.equal(new URL(page.url()).origin, identity);
  }
  await page.locator("#password").fill(actor.password);
  const token = page.waitForResponse(
    (response) =>
      response.url().endsWith("/protocol/openid-connect/token") &&
      response.request().method() === "POST" &&
      response.status() === 200,
  );
  await page.locator("#kc-login").click();
  actor.token = (await (await token).json()).access_token;
  await expect(nav(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
}
async function onboard(actor) {
  const page = actor.page;
  await expect(
    page.getByRole("dialog", { name: "Καλωσήρθες στην παρέα" }),
  ).toBeVisible();
  if (experience && actor === member) {
    await expect(page.getByLabel("Ονοματεπώνυμο")).toHaveValue(actor.name);
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
      actor.email,
    );
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
    assert.equal(
      await page
        .getByLabel("Τηλέφωνο")
        .evaluate((input) => input.validity.valueMissing),
      true,
    );
    assert.equal((await api(actor, "/api/members/me")).status, 404);
    await snapshot(actor, "03-onboarding");
    report.observations.onboarding = {
      namePrefilled: true,
      identityEmailReadOnly: true,
      requiredPhoneBlocksSave: true,
    };
  }
  await page.getByLabel("Ονοματεπώνυμο").fill(actor.name);
  await page.getByLabel("Τηλέφωνο").fill("+30 690 111 0000");
  await page.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const profile = await api(actor, "/api/members/me");
  assert.equal(profile.status, 200);
  assert.equal(profile.data.fullName, actor.name);
  assert.equal(profile.data.email, actor.email);
  actor.profile = profile.data;
  journal.profiles.push(profile.data.id);
  await save();
}
async function grant(actor) {
  const page = staff.page;
  await nav(page).getByRole("button", { name: "Μέλη", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Αναζήτηση μελών" })
    .fill(actor.email);
  await page.getByRole("button", { name: "Αναζήτηση", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: actor.name });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Συνδρομές ↗", exact: true }).click();
  const response = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/subscriptions" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Καταχώριση πληρωμής", exact: true })
    .click();
  const purchase = await response;
  assert.equal(purchase.status(), 200);
  journal.subscriptions.push((await purchase.json()).id);
  await save();
  await expect(
    page.getByRole("dialog").locator(".subscription-history"),
  ).toContainText("Ενεργή");
  await page.getByRole("button", { name: "Κλείσιμο", exact: true }).click();
}
async function refresh(actor) {
  await actor.page
    .getByRole("button", { name: "Ανανέωση", exact: true })
    .click();
  await actor.page.waitForLoadState("networkidle");
}
async function bookingForm(actor, exactGame) {
  const page = actor.page;
  await nav(page)
    .getByRole("button", { name: "Επισκόπηση", exact: true })
    .click();
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Νέα κράτηση", exact: true })
    .click();
  if (exactGame)
    await page.getByLabel("Γήπεδο").selectOption(exactGame.courtId);
  await page.getByLabel("Διάρκεια").selectOption("60");
  await page.getByLabel("Παίκτες").selectOption("2");
  await page.locator("#book-date").fill(addDays(today(), 1));
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#slots .slot").first()).toBeVisible();
}
async function rowFor(actor) {
  await nav(actor.page)
    .getByRole("button", { name: /^Κρατήσεις/ })
    .click();
  return actor.page.getByRole("row").filter({
    has: actor.page.locator(`[data-action="game"][data-id="${game.id}"]`),
  });
}

try {
  const { stdout } = await exec(
    "docker",
    [
      "inspect",
      "padel-e2e-postgres-1",
      "--format",
      '{{ index .Config.Labels "com.docker.compose.project" }}',
    ],
    { cwd: root, windowsHide: true },
  );
  assert.equal(
    stdout.trim(),
    "padel-e2e",
    "Only the dedicated local test project is supported",
  );
  before = await fingerprints();
  browser = await engines[browserName].launch({ headless: true });
  await step("Public welcome links and real server load", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    assert.equal((await page.goto(base)).status(), 200);
    for (const [label, id] of [
      ["Γήπεδα", "welcome-courts"],
      ["Η παρέα μας", "welcome-community"],
      ["Συνδρομές", "welcome-membership"],
    ]) {
      await page
        .getByRole("navigation", { name: "Γνώρισε τη λέσχη" })
        .getByRole("link", { name: label, exact: true })
        .click();
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await context.close();
  });
  member = await createActor("member", false, experience);
  partner = await createActor("partner");
  staff = await createActor("staff", true);
  await login(staff);
  await expect(staff.page.getByLabel("Ενότητες με πρόβλημα")).toHaveCount(0);
  await step(
    experience
      ? "Public registration rejects invalid fields and signs the new member in"
      : "Incorrect password rejected, then real browser PKCE sign-in succeeds",
    () => (experience ? registerMember(member) : login(member, true)),
  );
  await step(
    "Member onboarding persists the profile through the real API",
    () => onboard(member),
  );
  await step("Second member signs in and completes onboarding", async () => {
    await login(partner);
    await onboard(partner);
  });
  if (experience)
    await step(
      "New member sees reception activation and separate court pricing before booking",
      async () => {
        await nav(member.page)
          .getByRole("button", { name: "Συνδρομές", exact: true })
          .click();
        await expect(member.page.locator("main")).toContainText(
          "Ενεργοποίηση στη reception",
        );
        await expect(member.page.locator("main")).toContainText(
          "Η χρέωση γηπέδου είναι ξεχωριστή",
        );
        await expect(member.page.locator("main")).toContainText(
          "Επίλεξε πρόγραμμα και η ομάδα μας θα ενεργοποιήσει τη συνδρομή σου.",
        );
        await snapshot(member, "04-membership-before-activation");
        await nav(member.page)
          .getByRole("button", { name: "Γήπεδα", exact: true })
          .click();
        await member.page.locator(".club-header .brand").click();
        report.observations.brandReturnsToOverview =
          (await member.page.locator('[data-page="overview"]').count()) === 1;
        assert.equal(
          report.observations.brandReturnsToOverview,
          true,
          "Brand returns to overview",
        );
      },
    );
  await step(
    "Member navigation and API deny staff-only functions",
    async () => {
      await expect(
        nav(member.page).getByRole("button", { name: "Μέλη", exact: true }),
      ).toHaveCount(0);
      await expect(
        nav(member.page).getByRole("button", { name: "Υποδοχή", exact: true }),
      ).toHaveCount(0);
      assert.equal((await api(member, "/api/members")).status, 403);
    },
  );
  await step(
    "Booking without a subscription fails and leaves the confirmation form usable",
    async () => {
      await bookingForm(member);
      await member.page.locator("#slots [data-slot]").first().click();
      if (experience) {
        await expect(member.page.locator("#booking-summary")).toContainText(
          "/ γήπεδο",
        );
        await snapshot(member, "05-booking-price-before-confirmation");
      }
      const response = member.page.waitForResponse(
        (r) =>
          r.url() === base + "/api/bookings" && r.request().method() === "POST",
      );
      await member.page
        .getByRole("button", { name: "Επιβεβαίωση κράτησης" })
        .click();
      assert.equal((await response).status(), 409);
      if (experience) {
        report.observations.noSubscriptionMessage = await member.page
          .locator("#toast")
          .innerText();
        await expect(
          member.page.getByRole("dialog").getByRole("alert"),
        ).toContainText("ενεργοποίησέ τη στην υποδοχή");
        await expect(
          member.page.getByRole("dialog").getByRole("alert"),
        ).toBeInViewport();
        report.observations.bookingErrorVisibleInsideDialog = true;
        await snapshot(member, "06-inactive-membership-message");
      }
      await expect(member.page.locator("#confirm-booking")).toBeEnabled();
      assert.equal((await api(member, "/api/bookings")).data.length, 0);
      await member.page
        .getByRole("button", { name: "Κλείσιμο", exact: true })
        .click();
    },
  );
  await step(
    "Reception sign-in and UI-recorded paid subscriptions activate both members",
    async () => {
      await grant(member);
      await grant(partner);
    },
  );
  await step(
    "Member refresh displays the real active subscription",
    async () => {
      await refresh(member);
      await refresh(partner);
      await nav(member.page)
        .getByRole("button", { name: "Συνδρομές", exact: true })
        .click();
      await expect(member.page.locator("main table")).toContainText("Ενεργή");
      await snapshot(member, "07-active-membership");
    },
  );
  await step(
    "Member books a free slot in the real UI and sees the persisted booking",
    async () => {
      await bookingForm(member);
      await member.page.locator("#slots [data-slot]").first().click();
      const response = member.page.waitForResponse(
        (r) =>
          r.url() === base + "/api/bookings" && r.request().method() === "POST",
      );
      await member.page
        .getByRole("button", { name: "Επιβεβαίωση κράτησης" })
        .click();
      const created = await response;
      assert.equal(created.status(), 200);
      game = await created.json();
      journal.bookings.push(game.id);
      await save();
      await expect(member.page.getByRole("dialog")).not.toBeVisible();
      await expect(await rowFor(member)).toContainText("Επιβεβαιώθηκε");
      await snapshot(member, "08-confirmed-booking");
      assert.equal(
        (await api(member, `/api/bookings/${game.id}`)).data.status,
        "CONFIRMED",
      );
    },
  );
  await step(
    "Occupied slot offers waitlist without automatically making a booking",
    async () => {
      await bookingForm(partner, game);
      const occupied = partner.page.locator(
        `#slots [data-start="${game.startsAt}"]`,
      );
      await expect(occupied).toHaveClass(/occupied/);
      await occupied.click();
      await expect(partner.page.getByRole("dialog")).toContainText(
        "Δεν θα γίνει αυτόματη κράτηση",
      );
      const response = partner.page.waitForResponse(
        (r) =>
          r.url() === base + "/api/padel/waitlist" &&
          r.request().method() === "PUT",
      );
      await partner.page
        .getByRole("button", { name: "Προσθήκη στην αναμονή" })
        .click();
      const joined = await response;
      assert.equal(joined.status(), 200);
      journal.waitlist.push((await joined.json()).id);
      await save();
      assert.equal((await api(partner, "/api/bookings")).data.length, 0);
      await nav(partner.page)
        .getByRole("button", { name: "Παιχνίδια", exact: true })
        .click();
      await expect(partner.page.locator("main")).toContainText("Σε αναμονή");
      await partner.page
        .getByRole("button", { name: "Αφαίρεση", exact: true })
        .click();
    },
  );
  await step(
    "Organizer opens the game and a second member joins through the real UI",
    async () => {
      await (
        await rowFor(member)
      )
        .getByRole("button", { name: "Παίκτες", exact: true })
        .click();
      await member.page.getByLabel("Ορατότητα").selectOption("true");
      await member.page
        .getByRole("button", { name: "Αποθήκευση παιχνιδιού", exact: true })
        .click();
      await expect(member.page.locator("#toast")).toHaveText(
        "Το παιχνίδι ενημερώθηκε.",
      );
      await member.page
        .getByRole("button", { name: "Κλείσιμο", exact: true })
        .click();
      await refresh(partner);
      await nav(partner.page)
        .getByRole("button", { name: "Παιχνίδια", exact: true })
        .click();
      const card = partner.page
        .locator(".match-card")
        .filter({ hasText: member.name });
      await card
        .getByRole("button", { name: "Συμμετοχή", exact: true })
        .click();
      const row = await rowFor(partner);
      await expect(row).toContainText("Επιβεβαιώθηκε");
      await expect(
        row.getByRole("button", { name: "Ακύρωση", exact: true }),
      ).toHaveCount(0);
      await row.getByRole("button", { name: "Παίκτες", exact: true }).click();
      await expect(partner.page.getByRole("dialog")).toContainText(member.name);
      await expect(partner.page.getByRole("dialog")).toContainText(
        partner.name,
      );
      await partner.page
        .getByRole("button", { name: "Αποχώρηση", exact: true })
        .click();
      await expect(partner.page.locator("#toast")).toHaveText(
        "Η συμμετοχή ακυρώθηκε.",
      );
      await partner.page
        .getByRole("button", { name: "Κλείσιμο", exact: true })
        .click();
    },
  );
  await step(
    "Cancellation releases the booked slot and is persisted",
    async () => {
      await refresh(member);
      await (
        await rowFor(member)
      )
        .getByRole("button", { name: "Ακύρωση", exact: true })
        .click();
      await member.page
        .getByRole("dialog")
        .getByRole("button", { name: "Ακύρωση κράτησης", exact: true })
        .click();
      await expect(member.page.locator("main table")).toContainText(
        "Ακυρώθηκε",
      );
      await snapshot(member, "09-cancelled-booking");
      assert.equal(
        (await api(member, `/api/bookings/${game.id}`)).data.status,
        "CANCELLED",
      );
      await bookingForm(member, game);
      await expect(
        member.page.locator(`#slots [data-slot="${game.startsAt}"]`),
      ).toBeEnabled();
      await member.page
        .getByRole("button", { name: "Κλείσιμο", exact: true })
        .click();
    },
  );
  await step(
    "Member notification page receives the real booking and cancellation events",
    async () => {
      await expect
        .poll(
          async () =>
            (await api(member, "/api/notifications")).data.some(
              (n) => n.title === "Booking cancelled",
            ),
          { timeout: 20000 },
        )
        .toBe(true);
      await refresh(member);
      await nav(member.page)
        .getByRole("button", { name: "Ειδοποιήσεις", exact: true })
        .click();
      await expect(member.page.locator("main")).toContainText(
        "Η κράτηση ακυρώθηκε",
      );
      await expect(member.page.locator("main")).toContainText(
        "Η κράτηση επιβεβαιώθηκε",
      );
    },
  );
  await step(
    "Real authenticated member pages and profile fit 390px and 320px",
    async () => {
      for (const width of [390, 320]) {
        await member.page.setViewportSize({ width, height: 844 });
        for (const label of [
          "Επισκόπηση",
          "Γήπεδα",
          "Κρατήσεις",
          "Παιχνίδια",
          "Συνδρομές",
          "Βοηθός λέσχης",
          "Ειδοποιήσεις",
        ]) {
          await nav(member.page)
            .getByRole("button", { name: label, exact: label !== "Κρατήσεις" })
            .click();
          await expect(member.page.locator("main h1")).toBeVisible();
          assert(
            await member.page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
        }
        await nav(member.page)
          .getByRole("button", { name: "Το προφίλ μου", exact: true })
          .click();
        await expect(member.page.getByLabel("Ονοματεπώνυμο")).toHaveValue(
          member.name,
        );
        const box = await member.page.getByRole("dialog").boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width + 1);
        await member.page
          .getByRole("button", { name: "Κλείσιμο", exact: true })
          .click();
        await snapshot(member, `10-mobile-${width}`);
      }
      assert.deepEqual(errors, []);
    },
  );
  await step(
    "Real logout returns to the welcome page and re-login restores the saved profile",
    async () => {
      await member.page
        .getByRole("button", { name: "Αποσύνδεση", exact: true })
        .click();
      await member.page.waitForURL((url) => url.origin === identity);
      await member.page.locator("#kc-logout").click();
      await expect(
        member.page.getByRole("button", {
          name: "Δες την επίδειξη",
          exact: true,
        }),
      ).toBeVisible();
      await expect(nav(member.page)).toHaveCount(0);
      await snapshot(member, "11-logged-out");
      await login(member, experience);
      await nav(member.page)
        .getByRole("button", { name: "Το προφίλ μου", exact: true })
        .click();
      await expect(member.page.getByLabel("Ονοματεπώνυμο")).toHaveValue(
        member.name,
      );
      await member.page
        .getByRole("button", { name: "Κλείσιμο", exact: true })
        .click();
    },
  );
  await step(
    "Local AI returns a sourced cancellation answer without changing bookings",
    async () => {
      const count = (await api(member, "/api/bookings")).data.length;
      await nav(member.page)
        .getByRole("button", { name: "Βοηθός λέσχης", exact: true })
        .click();
      await member.page
        .getByLabel("Η ερώτησή σου")
        .fill("Πότε μπορώ να ακυρώσω την κράτησή μου;");
      const response = member.page.waitForResponse(
        (r) => r.url() === base + "/api/assistant/chat",
        { timeout: 140000 },
      );
      await member.page
        .getByRole("button", { name: "Στείλε ερώτηση", exact: true })
        .click();
      const answer = await response;
      assert.equal(answer.status(), 200);
      const data = await answer.json();
      report.observations.ai = {
        kind: data.kind,
        citations: data.citations?.length || 0,
        scope: "One known policy question; not a model quality evaluation",
      };
      assert.equal(data.kind, "ANSWER");
      assert(data.citations.length > 0);
      await expect(member.page.locator(".assistant-copy")).toBeVisible();
      await member.page.locator("[data-assistant-source]").first().click();
      await expect(member.page.locator(".assistant-source-text")).toContainText(
        "Εγκεκριμένη πηγή",
      );
      assert.equal((await api(member, "/api/bookings")).data.length, count);
    },
  );
  assert.deepEqual(
    errors,
    [],
    "No uncaught browser errors during the live journey",
  );
  report.completed = true;
} catch (error) {
  console.error("Journey failed: " + scrub(error));
  process.exitCode = 1;
} finally {
  async function cleanup(name, work) {
    try {
      await work();
      report.cleanup.push({ name, passed: true });
    } catch (error) {
      report.cleanup.push({ name, passed: false, error: scrub(error) });
      process.exitCode = 1;
    }
    await save();
  }
  for (const actor of actors.filter((actor) => actor.registrationPending))
    await cleanup(
      "Recover public-registration identity for cleanup",
      async () => {
        const found = await admin(
          `/users?email=${encodeURIComponent(actor.email)}&exact=true`,
        );
        assert.equal(found.status, 200);
        const matches = found.data.filter((user) => user.email === actor.email);
        assert(matches.length <= 1);
        if (matches.length) await findRegisteredActor(actor);
      },
    );
  if (staff?.token) {
    for (const id of journal.bookings)
      await cleanup("Cancel isolated booking " + id, async () =>
        assert.equal(
          (await api(staff, "/api/bookings/" + id, "DELETE")).status,
          200,
        ),
      );
    for (const id of journal.subscriptions)
      await cleanup("Cancel isolated subscription " + id, async () =>
        assert.equal(
          (await api(staff, "/api/subscriptions/" + id, "DELETE")).status,
          200,
        ),
      );
    for (const id of journal.profiles)
      await cleanup("Disable isolated profile " + id, async () =>
        assert.equal(
          (
            await api(staff, `/api/members/${id}/enabled`, "PATCH", {
              enabled: false,
            })
          ).status,
          200,
        ),
      );
  }
  if (partner?.token)
    for (const id of journal.waitlist)
      await cleanup("Cancel isolated waitlist " + id, async () =>
        assert.equal(
          (await api(partner, "/api/padel/waitlist/" + id, "DELETE")).status,
          200,
        ),
      );
  for (const id of journal.identities)
    await cleanup("Remove isolated identity " + id, async () =>
      assert.equal((await admin(`/users/${id}`, "DELETE")).status, 204),
    );
  if (before)
    await cleanup(
      "Existing member, booking and subscription rows unchanged",
      async () => assert.deepEqual(await fingerprints(), before),
    );
  if (browser) await browser.close();
  report.finishedAt = new Date().toISOString();
  report.passed = report.steps.filter((s) => s.passed).length;
  report.failed = report.steps.filter((s) => !s.passed).length;
  report.completed = report.completed && !process.exitCode;
  report.browserErrors = errors;
  report.notes = [
    "Synthetic profile/audit/cancelled records remain as test evidence; identities are removed and fixtures are inactive",
    "No external email or payment processing",
    "No service restart or interruption",
    "One AI policy smoke is not a model quality evaluation",
  ];
  await save();
  console.log(
    `${report.passed} passed, ${report.failed} failed; cleanup ${report.cleanup.filter((c) => !c.passed).length} failures. Report: test-results/${outputName}/results.json`,
  );
}
