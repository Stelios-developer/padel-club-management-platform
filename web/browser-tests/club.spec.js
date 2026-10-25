import { test as base, expect } from "@playwright/test";

const test = base.extend({
  browserErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "No uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
});
const nav = (page) => page.getByRole("navigation", { name: "Κύρια πλοήγηση" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00Z"));
});
async function demo(page, staff = false) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Νέα κράτηση", exact: true }),
  ).toBeEnabled();
  if (staff)
    await page
      .getByRole("combobox", { name: "Ρόλος στην επίδειξη" })
      .selectOption("staff");
}
async function fits(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Page fits the viewport",
  ).toBe(true);
}
async function dialogFits(page) {
  const box = await page.getByRole("dialog").boundingBox(),
    viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.height).toBeLessThanOrEqual(viewport.height);
}

test("welcome and every member page fit the viewport", async ({ page }) => {
  await page.goto("/");
  await fits(page);
  await demo(page);
  for (const label of [
    "Επισκόπηση",
    "Γήπεδα",
    "Κρατήσεις",
    "Παιχνίδια",
    "Συνδρομές",
    "Ειδοποιήσεις",
  ]) {
    await nav(page)
      .getByRole("button", { name: label, exact: label !== "Κρατήσεις" })
      .click();
    await expect(page.locator("main h1")).toBeVisible();
    await fits(page);
  }
});

test("profile is reachable, saves and persists after reload", async ({
  page,
}) => {
  await demo(page);
  await page
    .getByRole("button", { name: "Το προφίλ μου", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Το προφίλ σου" });
  await expect(dialog).toBeVisible();
  await dialogFits(page);
  await dialog
    .getByRole("textbox", { name: "Ονοματεπώνυμο" })
    .fill("Δοκιμή Browser");
  await dialog
    .getByRole("textbox", { name: "Τηλέφωνο" })
    .fill("+30 690 999 0000");
  await dialog.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#toast")).toHaveText("Το προφίλ αποθηκεύτηκε.");
  await page.reload();
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Το προφίλ μου", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Ονοματεπώνυμο" }),
  ).toHaveValue("Δοκιμή Browser");
  await expect(page.getByRole("textbox", { name: "Τηλέφωνο" })).toHaveValue(
    "+30 690 999 0000",
  );
});

test("brand returns to overview with click and keyboard", async ({ page }) => {
  await demo(page);
  await nav(page)
    .getByRole("button", { name: "Συνδρομές", exact: true })
    .click();
  await page.getByRole("link", { name: "Padel Club — Επισκόπηση" }).click();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-page",
    "overview",
  );
  await nav(page).getByRole("button", { name: "Γήπεδα", exact: true }).click();
  await page.getByRole("link", { name: "Padel Club — Επισκόπηση" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-page",
    "overview",
  );
  await expect(
    nav(page).getByRole("button", { name: "Επισκόπηση", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("dialog closes with Escape and can reopen without stale slots", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Νέα κράτηση", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "08:00", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Επιβεβαίωση κράτησης" }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Νέα κράτηση", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Επιβεβαίωση κράτησης" }),
  ).toBeDisabled();
  await dialogFits(page);
});

test("booking, named roster and cancellation work through the UI", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Νέα κράτηση", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "08:00", exact: true })
    .click();
  await page.getByRole("button", { name: "Επιβεβαίωση κράτησης" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await nav(page)
    .getByRole("button", { name: /^Κρατήσεις/ })
    .click();
  const row = page.getByRole("row").filter({ hasText: "08:00" });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Παίκτες", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Διοργανωτής");
  await page.getByRole("button", { name: "Κλείσιμο", exact: true }).click();
  await row.getByRole("button", { name: "Ακύρωση", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ακύρωση κράτησης", exact: true })
    .click();
  await expect(row).toContainText("Ακυρώθηκε");
});

test("weekly booking summary and occupied-slot waitlist remain usable", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Νέα κράτηση", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "08:00", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Επανάληψη" }).selectOption("4");
  await expect(page.locator("#booking-summary")).toContainText("4 εβδομάδες");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "18:00", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Δεν θα γίνει αυτόματη κράτηση",
  );
  await page.getByRole("button", { name: "Προσθήκη στην αναμονή" }).click();
  await nav(page)
    .getByRole("button", { name: "Παιχνίδια", exact: true })
    .click();
  await expect(page.locator("main")).toContainText("Σε αναμονή");
});

test("staff search and role changes clear staff-only screens", async ({
  page,
}) => {
  await demo(page, true);
  await nav(page).getByRole("button", { name: "Μέλη", exact: true }).click();
  await page.getByRole("textbox", { name: "Αναζήτηση μελών" }).fill("maria@");
  await page.getByRole("button", { name: "Αναζήτηση", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Μαρία Κωνσταντίνου");
  await expect(page.getByRole("table")).not.toContainText("Αλέξανδρος");
  await page
    .getByRole("combobox", { name: "Ρόλος στην επίδειξη" })
    .selectOption("member");
  await expect(
    nav(page).getByRole("button", { name: "Μέλη", exact: true }),
  ).toHaveCount(0);
  await expect(
    nav(page).getByRole("button", { name: "Υποδοχή", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Αποσύνδεση", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Δες την επίδειξη", exact: true }),
  ).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Γνώρισε τη λέσχη" }),
  ).toBeVisible();
});

test("staff calendar scrolls locally, filters and navigates weeks", async ({
  page,
}) => {
  await demo(page, true);
  await nav(page).getByRole("button", { name: "Υποδοχή", exact: true }).click();
  const table = page.getByRole("table", {
    name: "Εβδομαδιαίο πρόγραμμα ανά γήπεδο",
  });
  await expect(table.getByRole("row")).toHaveCount(4);
  await fits(page);
  await page
    .getByRole("combobox", { name: "Γήπεδο", exact: true })
    .selectOption({ label: "Court 01 · Panorama" });
  await expect(table.getByRole("row")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Επόμενη εβδομάδα", exact: true })
    .click();
  await expect(table).not.toContainText("Αλέξανδρος");
  await page
    .getByRole("button", { name: "Αυτή η εβδομάδα", exact: true })
    .click();
  await expect(table).toContainText("Αλέξανδρος");
  await fits(page);
});

test("staff moves a booking and reviews the resulting history", async ({
  page,
}) => {
  await demo(page, true);
  await nav(page)
    .getByRole("button", { name: /^Κρατήσεις/ })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "18:00" })
    .getByRole("button", { name: "Υποδοχή / Ιστορικό", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Μεταφορά κράτησης", exact: true })
    .click();
  await dialogFits(page);
  await page
    .getByRole("combobox", { name: "Νέο γήπεδο" })
    .selectOption({ label: "Court 03 · Arena" });
  await page
    .getByRole("textbox", { name: "Αιτιολογία" })
    .fill("Αίτημα από browser test");
  await expect(page.locator("#move-price")).toContainText("45");
  await page.getByRole("button", { name: "Επιβεβαίωση μεταφοράς" }).click();
  await expect(page.getByRole("dialog")).toContainText("Μεταφορά κράτησης");
  await expect(page.getByRole("dialog")).toContainText(
    "Αίτημα από browser test",
  );
  await page.getByText("Τι άλλαξε", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Court 03 · Arena");
  await expect(page.getByRole("dialog")).toContainText("Πριν");
});

test("touch targets and text inputs are usable on mobile", async ({ page }) => {
  await demo(page);
  const profile = page.getByRole("button", {
    name: "Το προφίλ μου",
    exact: true,
  });
  if (page.viewportSize().width <= 600) {
    const target = await profile.boundingBox();
    expect(target.height).toBeGreaterThanOrEqual(44);
    const contrast = await profile.evaluate((el) => {
      const luminance = (color) => {
        const rgb = color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const text = luminance(getComputedStyle(el).color);
      const background = luminance(
        getComputedStyle(el.closest(".club-header")).backgroundColor,
      );
      return (
        (Math.max(text, background) + 0.05) /
        (Math.min(text, background) + 0.05)
      );
    });
    expect(contrast, "Profile shortcut text contrast").toBeGreaterThanOrEqual(
      4.5,
    );
  }
  await profile.click();
  if (page.viewportSize().width <= 600) {
    const size = await page
      .getByRole("textbox", { name: "Τηλέφωνο" })
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(size)).toBeGreaterThanOrEqual(16);
  }
  await dialogFits(page);
});
