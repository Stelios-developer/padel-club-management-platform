import { test, expect } from "@playwright/test";

for (const role of ["ADMIN", "MEMBER"]) {
  test(`${role === "ADMIN" ? "staff" : "member"} without a member profile avoids personal requests and can create a profile`, async ({
    page,
  }) => {
    await page.route(/\/auth\.js(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `import {demoUser} from '/demo.js'; export const configureAuth=async()=>{}; export const callback=async()=>({...demoUser,realm_access:{roles:[${JSON.stringify(role)}]}}); export const login=async()=>{}; export const logout=()=>location.reload();`,
      }),
    );
    await page.route(/\/api\.js(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `import {demoRequest,demoRole} from '/demo.js'; demoRole(${role === "ADMIN"}); let created=false; window.personalRequests=[]; window.bookingRequests=0; export const configureApi=()=>{}; export async function request(path,options={}) {
      if(path==='/api/members/me' && options.method==='PUT') created=true;
      if(path==='/api/members/me' && !created) throw Object.assign(new Error('Δεν υπάρχει προφίλ μέλους.'),{status:404});
      if(path==='/api/bookings') window.bookingRequests++;
      if(['/api/subscriptions','/api/padel/invitations','/api/padel/waitlist',...(${role === "MEMBER"} ? ['/api/bookings','/api/notifications'] : [])].includes(path)) { window.personalRequests.push(path); if(!created) throw Object.assign(new Error('Personal endpoint must not run without profile'),{status:404}); }
      return demoRequest(path,options);
    }`,
      }),
    );
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Κύρια πλοήγηση" });
    await expect(nav).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Ενότητες με πρόβλημα")).toHaveCount(0);
    expect(await page.evaluate(() => window.personalRequests)).toEqual([]);
    expect(await page.evaluate(() => window.bookingRequests)).toBe(
      role === "ADMIN" ? 1 : 0,
    );
    if (role === "MEMBER") {
      await expect(
        page.getByRole("dialog", { name: "Καλωσήρθες στην παρέα" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Κλείσιμο", exact: true }).click();
      await nav.getByRole("button", { name: /^Κρατήσεις/ }).click();
      await expect(page.locator("main")).toContainText(
        "Συμπλήρωσε το προφίλ σου",
      );
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
    await nav.getByRole("button", { name: "Συνδρομές", exact: true }).click();
    await expect(page.locator("main")).toContainText(
      "Συμπλήρωσε το προφίλ σου",
    );
    await expect(
      page
        .locator("main section")
        .getByRole("button", { name: "Συμπλήρωση προφίλ", exact: true }),
    ).toBeEnabled();
    await nav
      .getByRole("button", { name: "Το προφίλ μου", exact: true })
      .click();
    await page.getByLabel("Ονοματεπώνυμο").fill("Προσωπικό προφίλ διαχειριστή");
    await page.getByLabel("Τηλέφωνο").fill("+30 690 111 0000");
    await page.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => window.personalRequests.slice().sort()),
    ).toEqual([
      ...(role === "MEMBER" ? ["/api/bookings", "/api/notifications"] : []),
      "/api/padel/invitations",
      "/api/padel/waitlist",
      "/api/subscriptions",
    ]);
    await expect(page.getByLabel("Ενότητες με πρόβλημα")).toHaveCount(0);
  });
}
async function staff(page) {
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Ρόλος στην επίδειξη" })
    .selectOption("staff");
}
test("member subscriptions can be granted and cancelled from their dialog", async ({
  page,
}) => {
  await staff(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Μέλη", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Μαρία Κωνσταντίνου" })
    .getByRole("button", { name: "Συνδρομές ↗" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Πρόγραμμα" })
    .selectOption("MONTHLY");
  await dialog.getByRole("button", { name: "Καταχώριση πληρωμής" }).click();
  const subscription = dialog
    .locator(".subscription-history > div")
    .filter({ hasText: "MONTHLY" });
  await expect(subscription).toContainText("Ενεργή");
  await subscription
    .getByRole("button", { name: "Ακύρωση", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Επιβεβαίωση ακύρωσης" }).click();
  await expect(subscription).toContainText("Ακυρώθηκε");
});

test("court settings update availability and price through the UI", async ({
  page,
}) => {
  await staff(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Γήπεδα", exact: true })
    .click();
  const court = page
    .getByRole("article")
    .filter({ hasText: "Court 03 · Arena" });
  await court.getByRole("button", { name: "Ρυθμίσεις γηπέδου" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("spinbutton", { name: "Χρέωση ανά ώρα (€)" })
    .fill("35");
  await dialog
    .getByRole("combobox", { name: "Λειτουργία" })
    .selectOption("false");
  await dialog.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
  await expect(court).toContainText("35,00");
  await expect(
    court.getByRole("button", { name: "Κράτηση", exact: true }),
  ).toBeDisabled();
});

test("attendance corrections and access checks remain separate", async ({
  page,
}) => {
  await staff(page);
  await page.clock.setFixedTime(new Date("2026-10-02T14:55:00Z"));
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^Κρατήσεις/ })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "18:00" })
    .getByRole("button", { name: "Υποδοχή / Ιστορικό", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Παρών", exact: true }).click();
  await dialog.getByRole("button", { name: "Αποθήκευση παρουσίας" }).click();
  await expect(dialog).toContainText("Καταγραφή παρουσίας");
  await expect(
    dialog.getByRole("button", { name: "Παρών", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Απών", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Αιτιολογία" })
    .fill("Διόρθωση από browser test");
  await dialog.getByRole("button", { name: "Αποθήκευση παρουσίας" }).click();
  await expect(dialog).toContainText("Διόρθωση παρουσίας");
  await dialog
    .getByRole("button", { name: "Έλεγχος εισόδου", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Κωδικός κράτησης", exact: true }),
  ).toHaveValue("demo-booking");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Έλεγχος εισόδου", exact: true })
    .click();
  await expect(page.locator("#access-result")).toContainText("Καλό παιχνίδι!");
  await expect(page.getByRole("main")).toContainText("Επιτράπηκε η είσοδος");
});
