const { test, expect } = require("@playwright/test");

const sessions = [
  {
    id: "target-old",
    client_label: "Client A",
    target_ids: ["tgt-r-cvc"],
    target_snapshots: {
      "tgt-r-cvc": {
        id: "tgt-r-cvc",
        label: "Initial /r/ in CVC words",
        domain: "Articulation",
        long_term_goal: "Produce /r/ accurately across word positions in conversation",
        short_term_goal: "Produce initial /r/ at the word level",
      },
    },
    start_time: "2026-08-01T17:00:00.000Z",
    end_time: "2026-08-01T17:20:00.000Z",
    datapoints: [
      { id: "old-1", target_id: "tgt-r-cvc", result: "+", prompt_levels: [] },
      { id: "old-2", target_id: "tgt-r-cvc", result: "-", prompt_levels: [] },
    ],
  },
  {
    id: "target-new",
    client_label: "Client A",
    target_ids: ["tgt-r-cvc", "tgt-r-blends"],
    target_snapshots: {
      "tgt-r-cvc": {
        id: "tgt-r-cvc",
        label: "Initial /r/ in CVC words",
        domain: "Articulation",
        long_term_goal: "Produce /r/ accurately across word positions in conversation",
        short_term_goal: "Produce initial /r/ at the word level",
      },
      "tgt-r-blends": {
        id: "tgt-r-blends",
        label: "Initial /r/ blends (br, cr, gr)",
        domain: "Articulation",
        long_term_goal: "Produce /r/ accurately across word positions in conversation",
        short_term_goal: "Produce initial /r/ at the word level",
      },
    },
    start_time: "2026-08-23T17:00:00.000Z",
    end_time: "2026-08-23T17:30:00.000Z",
    datapoints: [
      { id: "new-1", target_id: "tgt-r-cvc", result: "+", prompt_levels: [] },
      { id: "new-2", target_id: "tgt-r-cvc", result: "+", prompt_levels: [] },
      { id: "new-3", target_id: "tgt-r-blends", result: "-", prompt_levels: [] },
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((seedSessions) => {
    localStorage.setItem("dataTaker.clients.v1", JSON.stringify([
      { id: "client-a", label: "Client A" },
      { id: "client-b", label: "Client B" },
    ]));
    localStorage.setItem("dataTaker.sessions.v2", JSON.stringify(seedSessions));
  }, sessions);
});

test("graphs one stable target across sessions with its goal path and exact data", async ({ page }) => {
  await page.goto("/progress.html?client=Client%20A&target=tgt-r-cvc");

  await expect(page.locator("#progress-client")).toHaveValue("Client A");
  await expect(page.locator("#progress-target")).toHaveValue("tgt-r-cvc");
  await expect(page.locator("#progress-title")).toHaveText("Initial /r/ in CVC words");
  await expect(page.locator("#progress-path")).toContainText("Produce initial /r/ at the word level");
  await expect(page.locator("#progress-session-count")).toHaveText("2");
  await expect(page.locator("#progress-latest")).toHaveText("100%");
  await expect(page.locator("#progress-trials")).toHaveText("4");
  await expect(page.locator("#progress-change")).toHaveText("+50 pp");

  const chart = page.locator("#target-progress-chart .progress-svg");
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute("aria-label", /Initial \/r\/ in CVC words accuracy across 2 ended sessions/);
  await expect(chart.locator(".progress-point")).toHaveCount(2);
  await expect(chart.locator(".progress-line")).toHaveCount(1);
  await expect(page.locator("#progress-table-body tr")).toHaveCount(2);
  await expect(page.locator("#progress-table-body tr").first()).toContainText("100%");
  await expect(page.locator("#progress-table-body tr").first().getByRole("link", { name: /Review session/ }))
    .toHaveAttribute("href", "/review.html?id=target-new");

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

test("switches targets without pretending a one-session target has a trend", async ({ page }) => {
  await page.goto("/progress.html?client=Client%20A&target=tgt-r-cvc");
  await page.locator("#progress-target").selectOption("tgt-r-blends");

  await expect(page).toHaveURL(/target=tgt-r-blends$/);
  await expect(page.locator("#progress-title")).toContainText("Initial /r/ blends");
  await expect(page.locator("#progress-session-count")).toHaveText("1");
  await expect(page.locator("#progress-latest")).toHaveText("0%");
  await expect(page.locator("#progress-change")).toHaveText("Baseline");
  await expect(page.locator("#target-progress-chart .progress-point")).toHaveCount(1);
  await expect(page.locator("#target-progress-chart .progress-line")).toHaveCount(0);
});

test("explains empty history without throwing", async ({ page }) => {
  await page.goto("/progress.html?client=Client%20B");
  await expect(page.locator("#progress-empty")).toBeVisible();
  await expect(page.locator("#progress-empty-title")).toHaveText("No target history yet");
  await expect(page.locator("#progress-target")).toBeDisabled();
});
