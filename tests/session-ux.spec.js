const { test, expect } = require("@playwright/test");

async function startSession(page, targets = ["tgt-r-cvc", "tgt-r-blends"]) {
  await page.goto("/");
  return page.evaluate((targetIds) =>
    DataTaker.startSession("Client A", targetIds).id
  , targets);
}

test("separates assistance level from cue types and clears cues when hold is off", async ({ page }) => {
  const sessionId = await startSession(page);
  await page.goto("/session.html?id=" + sessionId);

  const maximum = page.getByRole("radio", { name: "Maximum", exact: true });
  const minimum = page.getByRole("radio", { name: "Minimal", exact: true });
  await maximum.click();
  await expect(maximum).toHaveAttribute("aria-checked", "true");
  await minimum.click();
  await expect(maximum).toHaveAttribute("aria-checked", "false");
  await expect(minimum).toHaveAttribute("aria-checked", "true");

  await page.locator('.cue[data-cue="Visual"]').click();
  await expect(page.locator("#next-trial-summary")).toContainText("Minimal + Visual");
  await page.locator("#hold-cues").uncheck();
  await page.locator("#tap-correct").click();

  const prompts = await page.evaluate((id) =>
    DataTaker.getSession(id).datapoints[0].prompt_levels
  , sessionId);
  expect(prompts).toEqual(["Min", "Visual"]);
  await expect(page.locator("#next-trial-summary")).toContainText("Independent");
  await expect(page.locator("#trial-feedback")).toBeVisible();

  await page.locator("#undo-last-trial").click();
  expect(await page.evaluate((id) => DataTaker.getSession(id).datapoints.length, sessionId)).toBe(0);
});

test("uses target tabs for direct switching and remembers the active target", async ({ page }) => {
  const sessionId = await startSession(page);
  await page.goto("/session.html?id=" + sessionId);

  await expect(page.locator(".target-tab")).toHaveCount(2);
  await page.locator(".target-tab").nth(1).click();
  await expect(page.locator(".carousel-target-label")).toContainText("Initial /r/ blends");

  await page.reload();
  await expect(page.locator(".carousel-target-label")).toContainText("Initial /r/ blends");
});

test("offers a safe route back to every unfinished session", async ({ page }) => {
  const sessionId = await startSession(page, ["tgt-r-cvc"]);
  await page.goto("/");

  await expect(page.locator("#active-session-card")).toBeVisible();
  await expect(page.locator("#resume-session")).toHaveAttribute("href", "/session.html?id=" + sessionId);
  await page.locator("#resume-session").click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#exit-session").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(page.locator("#active-session-card")).toBeVisible();
});

test("replaces live controls with an accessible summary after ending", async ({ page }) => {
  const sessionId = await startSession(page, ["tgt-r-cvc"]);
  await page.goto("/session.html?id=" + sessionId);
  await page.locator("#tap-correct").click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#end-session").click();

  await expect(page.locator("#session-workspace")).toBeHidden();
  await expect(page.locator("#ended-banner")).toBeVisible();
  await expect(page.locator("#ended-banner")).toBeFocused();
  await expect(page.locator("#review-session")).toHaveAttribute("href", "/review.html?id=" + sessionId);
});

test("supports zoom, large touch targets, and responsive tablet use", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toContain("user-scalable=no");
  expect(viewport).not.toContain("maximum-scale");

  await page.locator("#toggle-edit-goals").click();
  await page.locator("#goal-search").fill("Initial /r/ in CVC words");
  const removeBox = await page.locator(".goal-action").filter({ hasText: /^Delete$/ }).first().boundingBox();
  const iconBox = await page.locator(".target-icon-button").first().boundingBox();
  expect(removeBox.width).toBeGreaterThanOrEqual(44);
  expect(removeBox.height).toBeGreaterThanOrEqual(44);
  expect(iconBox.width).toBeGreaterThanOrEqual(44);
  expect(iconBox.height).toBeGreaterThanOrEqual(44);

  const sessionId = await page.evaluate(() =>
    DataTaker.startSession("Client A", ["tgt-r-cvc"]).id
  );
  await page.goto("/session.html?id=" + sessionId);
  const columns = await page.locator("#session-workspace").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length
  );
  expect(columns).toBe(page.viewportSize().width >= 800 ? 2 : 1);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});
