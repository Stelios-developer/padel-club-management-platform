import { test, expect } from "@playwright/test";
test("mobile bookings expose every field and action without horizontal scrolling", async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Κύρια πλοήγηση" })
    .getByRole("button", { name: /^Κρατήσεις/ })
    .click();
  const row = page.locator(".booking-table tbody tr").first();
  await expect(row).toContainText("Επιβεβαιώθηκε");
  if (page.viewportSize().width <= 600) {
    expect(
      await page
        .locator(".booking-scroll")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    for (const label of [
      "Γήπεδο",
      "Ημερομηνία",
      "Ώρα",
      "Σύνολο",
      "Κατάσταση",
      "Ενέργειες",
    ]) {
      const cell = row.locator(`[data-label="${label}"]`);
      await cell.scrollIntoViewIfNeeded();
      const box = await cell.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(
        page.viewportSize().width + 1,
      );
    }
  }
  await row.getByRole("button", { name: "Παίκτες", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Κλείσιμο", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("bookings.png"),
    fullPage: true,
  });
});
