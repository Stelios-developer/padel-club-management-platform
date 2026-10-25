import { test, expect } from "@playwright/test";

// Test the real resource store and UI against a deterministic HTTP-served transport.
// The injected transport uses the same demo fixtures, while the app remains in authenticated mode.
async function authenticatedFixture(page, mode = "notifications") {
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00Z"));
  await page.route(/\/auth\.js(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    import {demoUser} from '/demo.js';
    export const configureAuth=async()=>{};
    export const callback=async()=>({...demoUser,realm_access:{roles:['MEMBER']}});
    export const login=async()=>{};
    export const logout=()=>location.reload();
  `,
    }),
  );
  await page.route(/\/api\.js(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    import {demoRequest} from '/demo.js';
    let failed=false;
    export const configureApi=()=>{};
    export async function request(path, options){
      if(${JSON.stringify(mode)}==='notifications' && path==='/api/notifications' && !failed){
        failed=true;throw Object.assign(new Error('Δοκιμαστική διακοπή ειδοποιήσεων'),{status:503});
      }
      if(${JSON.stringify(mode)}==='expired' && path==='/api/members/me'){
        throw Object.assign(new Error('Η σύνδεση έληξε'),{status:401});
      }
      if(${JSON.stringify(mode)}==='booking' && path==='/api/bookings' && options?.method==='POST' && !failed){
        failed=true;throw Object.assign(new Error('Χρειάζεται ενεργή συνδρομή. Επικοινώνησε με την υποδοχή.'),{status:409});
      }
      return demoRequest(path,options);
    }
  `,
    }),
  );
  await page.goto("/");
}

test("a rejected booking shows readable feedback inside the modal and can recover", async ({
  page,
}) => {
  await authenticatedFixture(page, "booking");
  await page.getByRole("button", { name: "Νέα κράτηση", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "08:00", exact: true }).click();
  await dialog.getByRole("button", { name: "Επιβεβαίωση κράτησης" }).click();
  const alert = dialog.getByRole("alert");
  await expect(alert).toHaveText(
    "Χρειάζεται ενεργή συνδρομή. Επικοινώνησε με την υποδοχή.",
  );
  await expect(alert).toBeInViewport();
  expect(
    await alert.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ),
      );
    }),
    "Feedback is above the modal backdrop",
  ).toBe(true);
  await dialog.getByRole("button", { name: "08:00", exact: true }).click();
  await dialog.getByRole("button", { name: "Επιβεβαίωση κράτησης" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("Η κράτηση επιβεβαιώθηκε");
});

test("a failed service leaves bookings usable and targeted retry recovers", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await authenticatedFixture(page);
  await expect(
    page.getByRole("button", { name: "Νέα κράτηση", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Ενότητες με πρόβλημα")).toContainText(
    "Ειδοποιήσεις",
  );
  await page.getByRole("button", { name: "Νέα κράτηση", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "08:00", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Κλείσιμο", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Ειδοποιήσεις", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Δοκιμαστική διακοπή");
  await page
    .getByRole("button", { name: "Επανάληψη · Ειδοποιήσεις", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Ραντεβού στο γήπεδο!");
  expect(errors).toEqual([]);
});

test("expired authentication clears protected content and disables profile actions", async ({
  page,
}) => {
  await authenticatedFixture(page, "expired");
  await expect(page.getByRole("alert")).toContainText("Η σύνδεση έληξε");
  await expect(
    page.getByRole("button", { name: "Σύνδεση", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Το προφίλ μου", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("main")).not.toContainText("Court 01");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("refresh preserves horizontal navigation and keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  const notifications = page
    .getByRole("navigation")
    .getByRole("button", { name: "Ειδοποιήσεις", exact: true });
  await notifications.click();
  const left = await page
    .getByRole("navigation")
    .evaluate((el) => el.scrollLeft);
  const refresh = page.getByRole("button", { name: "Ανανέωση", exact: true });
  // WebKit does not focus buttons on pointer clicks. Exercise actual keyboard use.
  await refresh.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Ανανέωση", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Ανανέωση", exact: true }),
  ).toBeFocused();
  const after = await page
    .getByRole("navigation")
    .evaluate((el) => el.scrollLeft);
  expect(Math.abs(after - left)).toBeLessThanOrEqual(1);
});
