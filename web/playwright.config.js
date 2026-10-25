import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3177",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: ["chromium", "firefox", "webkit"].flatMap((browserName) =>
    [
      ["desktop", { width: 1280, height: 900 }],
      ["mobile", { width: 390, height: 844 }],
      ["small-mobile", { width: 320, height: 740 }],
    ].map(([size, viewport]) => ({
      name: `${size}-${browserName}`,
      use: {
        browserName,
        viewport,
        ...(size !== "desktop"
          ? {
              hasTouch: true,
              // Firefox supports narrow viewports, but not isMobile emulation.
              ...(browserName !== "firefox" ? { isMobile: true } : {}),
            }
          : {}),
      },
    })),
  ),
  webServer: {
    command: "node server.cjs",
    env: { PORT: "3177" },
    url: "http://127.0.0.1:3177",
    reuseExistingServer: false,
  },
});
