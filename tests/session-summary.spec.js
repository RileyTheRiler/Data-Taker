const { test, expect } = require("@playwright/test");

const sessions = [
  {
    id: "progress-old",
    client_label: "Client A",
    target_ids: ["tgt-r-cvc"],
    target_snapshots: {
      "tgt-r-cvc": { id: "tgt-r-cvc", label: "Initial /r/ in CVC words", domain: "Articulation", short_term_goal: "Produce initial /r/ at the word level" },
    },
    start_time: "2026-08-01T17:00:00.000Z",
    end_time: "2026-08-01T17:20:00.000Z",
    datapoints: [
      { id: "old-1", target_id: "tgt-r-cvc", result: "+", prompt_levels: [], timestamp: "2026-08-01T17:01:00.000Z" },
      { id: "old-2", target_id: "tgt-r-cvc", result: "-", prompt_levels: [], timestamp: "2026-08-01T17:02:00.000Z" },
    ],
  },
  {
    id: "progress-new",
    client_label: "Client A",
    target_ids: ["tgt-r-cvc", "tgt-r-blends"],
    target_snapshots: {
      "tgt-r-cvc": { id: "tgt-r-cvc", label: "Initial /r/ in CVC words", domain: "Articulation", short_term_goal: "Produce initial /r/ at the word level" },
      "tgt-r-blends": { id: "tgt-r-blends", label: "Initial /r/ blends (br, cr, gr)", domain: "Articulation", short_term_goal: "Produce initial /r/ at the word level" },
    },
    start_time: "2026-08-23T17:00:00.000Z",
    end_time: "2026-08-23T17:30:00.000Z",
    datapoints: [
      { id: "new-1", target_id: "tgt-r-cvc", result: "+", prompt_levels: [], timestamp: "2026-08-23T17:01:00.000Z" },
      { id: "new-2", target_id: "tgt-r-cvc", result: "+", prompt_levels: [], timestamp: "2026-08-23T17:02:00.000Z" },
      { id: "new-3", target_id: "tgt-r-blends", result: "-", prompt_levels: [], timestamp: "2026-08-23T17:03:00.000Z" },
    ],
  },
];

async function seed(page) {
  await page.addInitScript((seedSessions) => {
    localStorage.setItem("dataTaker.sessions.v2", JSON.stringify(seedSessions));
  }, sessions);
}

test("shows graphs and longitudinal progress on the review page", async ({ page }) => {
  await seed(page);
  await page.goto("/review.html?id=progress-new");

  const summary = page.locator("[data-session-summary]");
  await expect(summary).toBeVisible();
  await expect(summary.locator("[data-summary-client]")).toHaveText("Client A");
  await expect(summary.locator("[data-summary-overall]")).toHaveText("67%");
  await expect(summary.locator("[data-summary-trials]")).toHaveText("3");
  await expect(summary.locator("[data-summary-session-count]")).toHaveText("2");
  await expect(summary.locator(".target-bar-row")).toHaveCount(2);
  await expect(summary.locator(".progress-svg")).toBeVisible();
  await expect(summary.locator(".progress-note")).toContainText("50% · latest 67% · +17 percentage points");
  await expect(summary.locator(".target-trend-row").first()).toContainText("50% → 100% (+50 pp)");

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

test("shows the summary immediately on an already ended session screen", async ({ page }) => {
  await seed(page);
  await page.goto("/session.html?id=progress-new");

  await expect(page.locator("#ended-banner")).toBeVisible();
  const summary = page.locator("#ended-banner [data-session-summary]");
  await expect(summary).toBeVisible();
  await expect(summary.locator("[data-summary-duration]")).toHaveText("00:30:00");
  await expect(summary.locator(".progress-svg")).toBeVisible();
});
