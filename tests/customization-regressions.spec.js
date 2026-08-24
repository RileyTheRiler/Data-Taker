const { test, expect } = require("@playwright/test");

test("starter cues appear in-session and can be restored after removal", async ({ page }) => {
  await page.goto("/");

  await page.locator("#toggle-edit-cues").click();
  const cueInputs = page.locator("#cue-editor-list input");
  await expect(cueInputs).toHaveCount(8);
  const labels = await cueInputs.evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(labels).toEqual(expect.arrayContaining([
    "Max", "Mod", "Min", "Visual", "Verbal", "Gestural", "Model", "Tactile",
  ]));

  await page.evaluate(() => {
    DataTaker.getCues().forEach((cue) => DataTaker.deleteCue(cue.id));
  });
  await page.reload();
  await page.locator("#toggle-edit-cues").click();
  await expect(page.locator("#cue-editor-list input")).toHaveCount(0);
  await expect(page.locator("#restore-starter-cues")).toBeVisible();
  await page.locator("#restore-starter-cues").click();
  await expect(page.locator("#cue-editor-list input")).toHaveCount(8);

  const sessionId = await page.evaluate(() =>
    DataTaker.startSession("Client A", ["tgt-r-cvc"]).id
  );
  await page.goto("/session.html?id=" + sessionId);
  await expect(page.locator("#support-levels .cue-level")).toHaveCount(4);
  await expect(page.locator("#cue-toggles .cue")).toHaveCount(5);
  await expect(page.locator('.cue[data-cue="Gestural"]')).toBeVisible();
  await expect(page.locator('.cue[data-cue="Model"]')).toBeVisible();
  await expect(page.locator("#restore-session-cues")).toBeHidden();
});

test("empty cue configuration can be restored directly from the session screen", async ({ page }) => {
  await page.goto("/");
  const sessionId = await page.evaluate(() => {
    DataTaker.getCues().forEach((cue) => DataTaker.deleteCue(cue.id));
    return DataTaker.startSession("Client A", ["tgt-r-cvc"]).id;
  });

  await page.goto("/session.html?id=" + sessionId);
  await expect(page.locator("#cue-toggles .cue")).toHaveCount(0);
  await expect(page.locator("#restore-session-cues")).toBeVisible();
  await page.locator("#restore-session-cues").click();
  await expect(page.locator("#support-levels .cue-level")).toHaveCount(4);
  await expect(page.locator("#cue-toggles .cue")).toHaveCount(5);
  await expect(page.locator("#restore-session-cues")).toBeHidden();
});

test("custom target icons persist into sessions, review graphs, and backups", async ({ page }) => {
  await page.goto("/");
  await page.locator("#toggle-edit-goals").click();

  const firstIcon = page.locator(".target-chip-edit .target-icon-button").first();
  await expect(firstIcon).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("🦷"));
  await firstIcon.click();
  await expect(page.locator(".target-chip-edit .target-icon-button").first()).toHaveText("🦷");

  const backupRoundTrip = await page.evaluate(() => {
    const backup = DataTaker.exportAll();
    DataTaker.setTargetIcon("tgt-r-cvc", "");
    const afterClear = DataTaker.getTargetIcon("tgt-r-cvc");
    DataTaker.importAll(backup);
    return {
      afterClear,
      restored: DataTaker.getTargetIcon("tgt-r-cvc"),
      exported: backup.target_icons["tgt-r-cvc"],
    };
  });
  expect(backupRoundTrip.exported).toBe("🦷");
  expect(backupRoundTrip.restored).toBe("🦷");
  expect(backupRoundTrip.afterClear).not.toBe("🦷");

  const currentSessionId = await page.evaluate(() => {
    const prior = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
    DataTaker.addDatapoint(prior.id, "tgt-r-cvc", "+", []);
    DataTaker.addDatapoint(prior.id, "tgt-r-cvc", "-", ["Min"]);
    DataTaker.endSession(prior.id);

    const current = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
    DataTaker.addDatapoint(current.id, "tgt-r-cvc", "+", []);
    DataTaker.addDatapoint(current.id, "tgt-r-cvc", "+", ["Visual"]);
    DataTaker.endSession(current.id);
    return current.id;
  });

  await page.goto("/session.html?id=" + currentSessionId);
  await expect(page.locator(".carousel-target-label")).toContainText("🦷");
  await expect(page.locator("[data-session-summary]")).toBeVisible();
  await expect(page.locator(".target-bar-head > span").first()).toContainText("🦷");
  await expect(page.locator(".progress-svg")).toBeVisible();

  const reviewLink = page.locator("#review-session");
  await expect(reviewLink).toHaveAttribute("href", "/review.html?id=" + currentSessionId);
  await reviewLink.click();
  await expect(page).toHaveURL(new RegExp("/review\\.html\\?id=" + currentSessionId + "$"));
  await expect(page.locator("#review-main")).toBeVisible();
  await expect(page.locator("#review-targets li").first()).toContainText("🦷");
  await expect(page.locator(".target-bar-head > span").first()).toContainText("🦷");
  await expect(page.locator(".progress-svg")).toBeVisible();
});

test("HTML uses versioned mutable assets so stale immutable JS cannot survive a deploy", async ({ page }) => {
  await page.goto("/");
  const scriptSources = await page.locator('script[src^="/static/js/"]').evaluateAll((scripts) =>
    scripts.map((script) => script.getAttribute("src"))
  );
  expect(scriptSources.length).toBeGreaterThan(0);
  scriptSources.forEach((src) => expect(src).toContain("?v=20260824b"));

  const stylesheetSources = await page.locator('link[rel="stylesheet"][href^="/static/css/"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href"))
  );
  stylesheetSources.forEach((href) => expect(href).toContain("?v=20260824b"));
});
