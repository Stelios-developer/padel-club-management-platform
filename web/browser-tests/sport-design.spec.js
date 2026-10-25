import { test, expect } from "@playwright/test";

test("sports navigation stays above every club page and photo assets load", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00Z"));
  await page.goto("/");
  const image = await page.request.get("/assets/padel-court-blue.webp");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/webp");
  await page.evaluate(async () => {
    const image = new Image();
    image.src = "/assets/padel-court-blue.webp";
    await image.decode();
  });
  await page.screenshot({
    path: testInfo.outputPath("welcome.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Ρόλος στην επίδειξη" })
    .selectOption("staff");
  const nav = page.getByRole("navigation", { name: "Κύρια πλοήγηση" });
  for (const [tab, label] of [
    ["overview", "Επισκόπηση"],
    ["courts", "Γήπεδα"],
    ["bookings", "Κρατήσεις"],
    ["play", "Παιχνίδια"],
    ["subscriptions", "Συνδρομές"],
    ["assistant", "Βοηθός λέσχης"],
    ["reception", "Υποδοχή"],
    ["members", "Μέλη"],
    ["access", "Έλεγχος εισόδου"],
    ["notifications", "Ειδοποιήσεις"],
  ]) {
    const button = nav.getByRole("button", {
      name: label,
      exact: tab !== "bookings",
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".workspace")).toHaveAttribute("data-page", tab);
    await expect(page.locator("main h1")).toBeVisible();
    const box = await nav.boundingBox();
    const main = await page.locator("main").boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(main.y);
    expect(box.x).toBeLessThan(page.viewportSize().width / 3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".page-heading")
        .evaluate((el) => getComputedStyle(el).backgroundImage),
    ).toContain("padel-court-blue.webp");
    await page.screenshot({
      path: testInfo.outputPath(`${tab}.png`),
      fullPage: true,
    });
  }
  await nav.getByRole("button", { name: "Το προφίλ μου", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Το προφίλ σου" }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("profile.png") });
  expect(errors).toEqual([]);
});
