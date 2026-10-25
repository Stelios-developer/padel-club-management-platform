import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const nav = (page) => page.getByRole("navigation", { name: "Κύρια πλοήγηση" });

test("WCAG automated checks cover public, member, staff and booking forms", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00Z"));
  const scans = [];
  async function scan(name) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    scans.push({
      name,
      violations: result.violations,
      incomplete: result.incomplete,
    });
  }
  await page.goto("/");
  await scan("welcome");
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  for (const label of [
    "Επισκόπηση",
    "Γήπεδα",
    "Κρατήσεις",
    "Παιχνίδια",
    "Συνδρομές",
    "Ειδοποιήσεις",
    "Βοηθός λέσχης",
  ]) {
    await nav(page)
      .getByRole("button", { name: label, exact: label !== "Κρατήσεις" })
      .click();
    await expect(page.locator("main h1")).toBeVisible();
    await scan(`member / ${label}`);
  }
  await page
    .getByRole("button", { name: "Το προφίλ μου", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await scan("profile form");
  await page.keyboard.press("Escape");
  await nav(page)
    .getByRole("button", { name: /^Κρατήσεις/ })
    .click();
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Νέα κράτηση", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Γήπεδο" })).toBeVisible();
  await scan("booking form");
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "Ρόλος στην επίδειξη" })
    .selectOption("staff");
  for (const label of ["Υποδοχή", "Μέλη", "Έλεγχος εισόδου"]) {
    await nav(page).getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator("main h1")).toBeVisible();
    await scan(`staff / ${label}`);
  }
  await info.attach("accessibility-scans", {
    body: JSON.stringify(scans, null, 2),
    contentType: "application/json",
  });
  expect(
    scans.flatMap(({ name, violations }) =>
      violations.map(({ id, nodes }) => ({
        name,
        id,
        nodes: nodes.map(({ target, failureSummary }) => ({
          target,
          failureSummary,
        })),
      })),
    ),
  ).toEqual([]);
});

test("keyboard users can navigate and close a focus-contained dialog", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00Z"));
  await page.goto("/");
  const demo = page.getByRole("button", {
    name: "Δες την επίδειξη",
    exact: true,
  });
  await demo.focus();
  await page.keyboard.press("Enter");
  await expect(nav(page)).toBeVisible();
  const bookings = nav(page).getByRole("button", { name: /^Κρατήσεις/ });
  await bookings.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-page",
    "bookings",
  );
  await expect(
    nav(page).getByRole("button", { name: /^Κρατήσεις/ }),
  ).toBeFocused();
  const profile = page.getByRole("button", {
    name: "Το προφίλ μου",
    exact: true,
  });
  await profile.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Το προφίλ σου" });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(profile).toBeFocused();
});

test("subscription history can be scrolled with the keyboard on narrow screens", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Δες την επίδειξη", exact: true })
    .click();
  await nav(page)
    .getByRole("button", { name: "Συνδρομές", exact: true })
    .click();
  const history = page.getByRole("region", {
    name: "Οι συνδρομές μου",
    exact: true,
  });
  await history.focus();
  await expect(history).toBeFocused();
  if (page.viewportSize().width <= 600) {
    expect(
      await history.evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => history.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
  }
});
