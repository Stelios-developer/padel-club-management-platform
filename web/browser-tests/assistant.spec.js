import { test, expect } from "@playwright/test";

async function fixture(page, kind = "ANSWER") {
  await page.clock.setFixedTime(new Date("2026-10-02T09:00:00Z"));
  await page.route(/\/auth\.js(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `import {demoUser} from '/demo.js';export const configureAuth=async()=>{};export const callback=async()=>({...demoUser,realm_access:{roles:['MEMBER']}});export const login=async()=>{};export const logout=()=>location.reload();`,
    }),
  );
  await page.route(/\/api\.js(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `import {demoRequest} from '/demo.js';export const configureApi=()=>{};
      window.assistantMutations=[];
      window.assistantRequests=0;
      export async function request(path, options={}) {
        if(path==='/api/assistant/chat') { window.assistantRequests++; return {kind:${JSON.stringify(kind)},answer:'Περισσότερες από δύο ώρες. <img src=x onerror=alert(1)>',citations:${kind === "ANSWER" ? "[{sourceId:'cancellations',title:'Ακύρωση',version:'2026-10-02',url:'https://untrusted.invalid'}]" : "[]"},options:${kind === "OPTIONS" ? `[{courtId:'11111111-1111-1111-1111-111111111111',courtName:'Court 01',startsAt:'2026-10-03T15:00:00Z',endsAt:'2026-10-03T16:30:00Z',priceCents:3600,players:2}]` : "[]"}}; }
        if(path==='/api/assistant/sources/cancellations') return '# Εγκεκριμένη πηγή\\n<script>alert(1)</script>';
        if(options.method && options.method!=='GET') window.assistantMutations.push(path);
        return demoRequest(path,options);
      }`,
    }),
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Βοηθός λέσχης", exact: true })
    .click();
}

test("policy text and sources are escaped and source URLs stay authenticated", async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel("Η ερώτησή σου").fill("Πότε μπορώ να ακυρώσω;");
  await page
    .getByRole("button", { name: "Στείλε ερώτηση", exact: true })
    .click();
  await expect(page.locator(".assistant-copy")).toContainText("<img src=x");
  await expect(page.locator(".assistant-answer img")).toHaveCount(0);
  await page.getByRole("button", { name: "Ακύρωση · 2026-10-02 ↗" }).click();
  await expect(page.locator(".assistant-source-text")).toContainText(
    "<script>alert(1)</script>",
  );
  await expect(page.locator(".assistant-source-text script")).toHaveCount(0);
  expect(await page.evaluate(() => window.assistantMutations)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an AI option opens the confirmation form without creating a booking", async ({
  page,
}) => {
  await fixture(page, "OPTIONS");
  await page.getByLabel("Θέλω να").selectOption("AVAILABILITY");
  await page.getByLabel("Η ερώτησή σου").fill("Αύριο στις 18:00 για 2 παίκτες");
  await page
    .getByRole("button", { name: "Στείλε ερώτηση", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Έλεγχος & κράτηση", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#book-date")).toHaveValue("2026-10-03");
  await expect(page.locator('#booking-form [name="players"]')).toHaveValue("2");
  expect(await page.evaluate(() => window.assistantMutations)).toEqual([]);
});

test("demo mode explains that real AI needs authenticated access", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Βοηθός λέσχης", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Στείλε ερώτηση", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("main")).toContainText(
    "χρειάζεται κανονική σύνδεση",
  );
});

test("examples prepare an editable draft without sending and clarification stays distinct", async ({
  page,
}) => {
  await fixture(page, "CLARIFY");
  await page
    .getByRole("button", { name: "Βρες ώρα για παιχνίδι", exact: true })
    .click();
  await expect(page.getByLabel("Θέλω να")).toHaveValue("AVAILABILITY");
  const question = page.getByLabel("Η ερώτησή σου");
  await expect(question).toBeFocused();
  await expect(question).toHaveValue(/μιάμιση ώρα/);
  expect(await page.evaluate(() => window.assistantRequests)).toBe(0);
  await page
    .getByRole("button", { name: "Κανόνες ακύρωσης", exact: true })
    .click();
  await expect(page.getByLabel("Θέλω να")).toHaveValue("POLICY");
  await question.fill("Ασαφής ερώτηση που χρειάζεται διευκρίνιση");
  await page
    .getByRole("button", { name: "Στείλε ερώτηση", exact: true })
    .click();
  await expect(page.locator(".assistant-answer")).toContainText(
    "ΧΡΕΙΑΖΕΤΑΙ ΜΙΑ ΔΙΕΥΚΡΙΝΙΣΗ",
  );
  await expect(question).toHaveValue(
    "Ασαφής ερώτηση που χρειάζεται διευκρίνιση",
  );
  expect(await page.evaluate(() => window.assistantRequests)).toBe(1);
  expect(await page.evaluate(() => window.assistantMutations)).toEqual([]);
});
