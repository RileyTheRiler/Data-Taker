const { defineConfig, devices } = require("@playwright/test");
const { chromium } = require("playwright");

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: { executablePath: chromium.executablePath() },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
  projects: [
    { name: "iPhone 13", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    {
      name: "iPad Pro 11 landscape",
      use: { ...devices["iPad Pro 11 landscape"], browserName: "chromium" },
    },
  ],
});
