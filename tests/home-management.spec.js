const { test, expect } = require("@playwright/test");

async function seedClient(page) {
  await page.addInitScript(() => {
    localStorage.setItem("dataTaker.clients.v1", JSON.stringify([
      { id: "client-a", label: "Client A" },
      { id: "client-b", label: "Client B" },
    ]));
  });
}

test("switches accessible home sections, supports direct hashes, and preserves the current section", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#tab-start")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-start")).toBeVisible();

  await page.locator("#tab-sessions").click();
  await expect(page).toHaveURL(/#sessions$/);
  await expect(page.locator("#panel-sessions .panel-title")).toBeFocused();
  await page.reload();
  await expect(page.locator("#panel-sessions")).toBeVisible();

  await page.goto("/#goals");
  await expect(page.locator("#toggle-edit-goals")).toHaveAttribute("aria-selected", "true");
  await page.locator("#toggle-edit-goals").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-settings")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-settings")).toBeVisible();
});

test("keeps recovery prominent and requires confirmation before a duplicate session", async ({ page }) => {
  await seedClient(page);
  await page.goto("/");
  const activeId = await page.evaluate(() =>
    DataTaker.startSession("Client A", ["tgt-r-cvc"]).id
  );
  await page.reload();
  await expect(page.locator("#active-session-card")).toBeVisible();
  await expect(page.locator("#resume-session")).toHaveAttribute("href", "/session.html?id=" + activeId);

  await page.locator('.target-select-row').first().click();
  await page.locator("#start-session").click();
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await expect(page.locator("#confirm-dialog-message")).toContainText("unfinished session");
  await page.locator("#confirm-dialog-cancel").click();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(await page.evaluate(() => DataTaker.getActiveSessions().length)).toBe(1);
});

test("repeats only available stable targets and explains archived or deleted targets", async ({ page }) => {
  await seedClient(page);
  await page.goto("/");
  await page.evaluate(() => {
    const session = DataTaker.startSession("Client A", [
      "tgt-r-cvc", "tgt-r-blends", "tgt-r-vocalic",
    ]);
    DataTaker.endSession(session.id);
    DataTaker.setGoalArchived("target", "tgt-r-cvc", true);
    DataTaker.deleteGoalNode("target", "tgt-r-blends");
  });
  await page.reload();
  await page.locator("#repeat-last-session").click();
  await expect(page.locator("#repeat-session-status")).toContainText("archived");
  await expect(page.locator("#repeat-session-status")).toContainText("no longer available");
  await expect(page.locator("#selected-target-count")).toHaveText("1 selected");
  await expect(page.locator("#selected-target-tray")).toContainText("Vocalic /r/");
});

test("searches targets and manages the selected-target tray", async ({ page }) => {
  await seedClient(page);
  await page.goto("/");
  await page.locator("#target-search").fill("vocalic");
  await expect(page.locator(".target-select-row")).toHaveCount(1);
  await page.locator(".target-select-row").click();
  await expect(page.locator("#selected-target-count")).toHaveText("1 selected");
  await expect(page.locator("#selected-target-tray")).toContainText("Vocalic /r/");
  await page.locator(".selected-remove").click();
  await expect(page.locator("#selected-target-count")).toHaveText("0 selected");
});

test("filters and sorts session history with separate Review and Objective actions", async ({ page }) => {
  await seedClient(page);
  await page.goto("/");
  await page.evaluate(() => {
    const first = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
    DataTaker.endSession(first.id);
    const sessions = DataTaker.getSessions();
    sessions[0].start_time = "2026-08-01T10:00:00.000Z";
    sessions[0].end_time = "2026-08-01T10:10:00.000Z";
    localStorage.setItem("dataTaker.sessions.v2", JSON.stringify(sessions));
    const second = DataTaker.startSession("Client B", ["tgt-easy-onset"]);
    DataTaker.endSession(second.id);
  });
  await page.reload();
  await page.locator("#tab-sessions").click();
  await page.locator("#history-client-filter").selectOption("all");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.locator("#history-sort").selectOption("oldest");
  await expect(page.locator(".history-item").first()).toContainText("Client A");
  await page.locator("#history-search").fill("easy onset");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.locator(".history-item")).toContainText("Client B");
  await page.locator(".history-item summary").click();
  await expect(page.getByRole("link", { name: "Review", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Objective", exact: true })).toHaveAttribute("href", /#objective$/);
  await expect(page.getByRole("link", { name: "Progress", exact: true })).toHaveAttribute(
    "href",
    /progress\.html\?client=Client\+B&target=tgt-easy-onset$/
  );
});

test("renames, duplicates, reorders, archives, restores, and deletes goals through the UI", async ({ page }) => {
  await page.goto("/#goals");
  const firstDomain = page.locator(".domain-group").first();
  await firstDomain.locator("summary").first().click();
  const firstLtg = firstDomain.locator(".ltg-group").first();
  await firstLtg.locator("summary").first().click();
  const firstStg = firstLtg.locator(".stg-group").first();
  await firstStg.locator("summary").first().click();
  const row = firstStg.locator(".target-manager-list > .goal-node-row").first();
  const originalId = await page.evaluate(() =>
    DataTaker.getGoals().domains[0].long_term_goals[0].short_term_goals[0].targets[0].id
  );

  await row.getByRole("button", { name: "Rename" }).click();
  await firstStg.locator(".rename-form input").fill("Renamed target");
  await firstStg.locator(".rename-form").getByRole("button", { name: "Save" }).click();
  expect(await page.evaluate((id) => DataTaker.allTargets(true)[id].label, originalId)).toBe("Renamed target");

  const renamedRow = page.locator(".goal-node-label").filter({ hasText: /^Renamed target$/ }).locator("..");
  await renamedRow.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.locator(".goal-node-label").filter({ hasText: /^Renamed target copy$/ })).toHaveCount(1);
  await page.locator(".goal-node-label").filter({ hasText: /^Renamed target$/ }).locator("..")
    .getByRole("button", { name: "Down" }).click();

  const movedRow = page.locator(".goal-node-label").filter({ hasText: /^Renamed target$/ }).locator("..");
  await movedRow.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator(".goal-node-label").filter({ hasText: /^Renamed target$/ }).locator(".."))
    .toContainText("Archived");
  await page.locator(".goal-node-label").filter({ hasText: /^Renamed target$/ }).locator("..")
    .getByRole("button", { name: "Restore" }).click();

  const copyRow = page.locator(".goal-node-label").filter({ hasText: /^Renamed target copy$/ }).locator("..");
  await copyRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#confirm-dialog-message")).toContainText("1 target");
  await page.locator("#confirm-dialog-accept").click();
  await expect(page.locator(".goal-node-label").filter({ hasText: /^Renamed target copy$/ })).toHaveCount(0);
});

test("uses an accessible icon picker without browser prompts", async ({ page }) => {
  await page.goto("/#goals");
  await page.locator("#goal-search").fill("Initial /r/ in CVC words");
  await page.locator(".target-icon-button").first().click();
  await expect(page.locator("#icon-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Use 🦷" }).click();
  await page.locator("#save-icon").click();
  await expect(page.locator(".target-icon-button").first()).toHaveText("🦷");
});

test("validates imports, confirms replacement, and reports failures inline", async ({ page }) => {
  await seedClient(page);
  await page.goto("/#settings");
  await page.locator("#import-data").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"sessions":{}}'),
  });
  await expect(page.locator("#backup-status")).toContainText("Import failed");
  await expect(page.locator("#backup-status")).toContainText("Current data was not changed");

  const backup = await page.evaluate(() => JSON.stringify(DataTaker.exportAll()));
  await page.locator("#import-data").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await expect(page.locator("#confirm-dialog-message")).toContainText("replaces the current");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#confirm-dialog-accept").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^data-taker-safety-backup-/);
  await expect(page.locator("#backup-status")).toHaveText("Backup imported successfully.");
  await expect(page.locator("#last-backup-date")).toContainText("Last successful backup");
});

test("resets reused confirmation state so Escape cannot repeat a destructive confirmation", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__confirmResults = [];
    confirmAction("First", "Confirm once", "Confirm", true)
      .then((result) => window.__confirmResults.push(result));
  });
  await page.locator("#confirm-dialog-accept").click();
  await expect.poll(() => page.evaluate(() => window.__confirmResults.length)).toBe(1);

  await page.evaluate(() => {
    confirmAction("Second", "Dismiss with Escape", "Confirm", true)
      .then((result) => window.__confirmResults.push(result));
  });
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__confirmResults.length)).toBe(2);
  expect(await page.evaluate(() => window.__confirmResults)).toEqual([true, false]);
});

test("keeps backup import keyboard-focusable and does not report a failed export as successful", async ({ page }) => {
  await page.goto("/#settings");
  const input = page.locator("#import-data");
  await expect(input).not.toHaveAttribute("hidden", "");
  await input.focus();
  await expect(input).toBeFocused();
  const focusOutline = await page.locator(".file-btn").evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(focusOutline).not.toBe("none");

  await page.evaluate(() => { URL.createObjectURL = undefined; });
  await page.locator("#export-data").click();
  await expect(page.locator("#backup-status")).toContainText("No backup was created");
  expect(await page.evaluate(() => localStorage.getItem("dataTaker.backupMeta.v1"))).toBeNull();
});

test("supports zoom, visible focus, 44px controls, text enlargement, and no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toContain("user-scalable=no");
  expect(viewport).not.toContain("maximum-scale");

  const tabBox = await page.locator("#tab-start").boundingBox();
  expect(tabBox.height).toBeGreaterThanOrEqual(44);
  await page.locator("#tab-start").focus();
  const focusStyle = await page.locator("#tab-start").evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(focusStyle).not.toBe("none");

  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});
