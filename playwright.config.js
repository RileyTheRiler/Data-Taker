const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    storageState: "tests/existing-install-state.json",
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
      name: "iPhone 13 landscape",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
      },
    },
    {
      name: "iPad Pro 11 portrait",
      use: {
        ...devices["iPad Pro 11 landscape"],
        browserName: "chromium",
        viewport: { width: 834, height: 1194 },
        screen: { width: 834, height: 1194 },
      },
    },
    {
      name: "iPad Pro 11 landscape",
      use: { ...devices["iPad Pro 11 landscape"], browserName: "chromium" },
    },
    { name: "Mobile Safari", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    {
      name: "Mobile Safari landscape",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
      },
    },
    {
      name: "iPad Safari portrait",
      use: {
        ...devices["iPad Pro 11 landscape"],
        browserName: "webkit",
        viewport: { width: 834, height: 1194 },
        screen: { width: 834, height: 1194 },
      },
    },
    {
      name: "iPad Safari landscape",
      use: { ...devices["iPad Pro 11 landscape"], browserName: "webkit" },
    },
  ],
});
