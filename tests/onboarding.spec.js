const { test, expect } = require("@playwright/test");

async function openCleanInstall(page, path = "/") {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(path);
}

test("starts a new installation with a focused template empty state", async ({ page }) => {
  await openCleanInstall(page);

  await expect(page.locator("#goal-onboarding-card")).toBeVisible();
  await expect(page.locator("#client-card")).toBeHidden();
  await expect(page.locator("#target-selection-card")).toBeHidden();
  await expect(page.locator("#session-start-card")).toBeHidden();
  expect(await page.evaluate(() => Object.keys(DataTaker.allTargets()).length)).toBe(0);

  await page.getByRole("button", { name: "Create my own goal" }).click();
  await expect(page).toHaveURL(/#goals$/);
  await expect(page.locator("#new-domain-name")).toBeFocused();
  await expect(page.locator("#goal-empty-note")).toBeVisible();
});

test("adds only the selected editable template and reveals session setup", async ({ page }) => {
  await openCleanInstall(page);

  await page.getByRole("button", { name: "Choose a starter template" }).click();
  await expect(page.locator("#goal-template-dialog")).toBeVisible();
  await expect(page.locator(".goal-template-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Add Articulation template" }).click();

  await expect(page.locator("#goal-template-dialog")).toBeHidden();
  await expect(page.locator("#goal-onboarding-card")).toBeHidden();
  await expect(page.locator("#client-card")).toBeVisible();
  await expect(page.locator("#target-selection-card")).toBeVisible();
  await expect(page.locator(".target-select-row")).toHaveCount(4);

  const library = await page.evaluate(() => DataTaker.getGoals());
  expect(library.domains).toHaveLength(1);
  expect(library.domains[0].name).toBe("Articulation");
  expect(library.domains[0].long_term_goals[0].short_term_goals[0].targets[0].id)
    .not.toBe("tgt-r-cvc");
});

test("keeps the interactive example out of stored sessions and progress", async ({ page }) => {
  await openCleanInstall(page);

  await page.getByRole("button", { name: "Try an example session" }).click();
  await page.getByRole("button", { name: "Visual", exact: true }).click();
  await page.getByRole("button", { name: "Record correct" }).click();
  await page.getByRole("button", { name: "Record incorrect" }).click();

  await expect(page.locator("#demo-accuracy")).toHaveText("50%");
  await expect(page.locator("#demo-trial-count")).toHaveText("2 trials");
  await expect(page.locator("#demo-recent li")).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem("dataTaker.sessions.v2"))).toBeNull();
  expect(await page.evaluate(() => DataTaker.getPastSessions("Example Client"))).toEqual([]);
});

test("collapses long active libraries until the user asks for more", async ({ page }) => {
  await openCleanInstall(page);

  await page.getByRole("button", { name: "Choose a starter template" }).click();
  await page.getByRole("button", { name: "Add Articulation template" }).click();
  await page.evaluate(() => {
    DataTaker.applyGoalTemplate("expressive-language");
    refreshAll();
  });

  await expect(page.locator(".target-select-row")).toHaveCount(7);
  await expect(page.locator(".target-select-row:visible")).toHaveCount(5);
  await expect(page.locator("#toggle-all-targets")).toHaveText("Show 2 more targets");
  await page.locator("#toggle-all-targets").click();
  await expect(page.locator(".target-select-row:visible")).toHaveCount(7);
  await expect(page.locator("#toggle-all-targets")).toHaveText("Show fewer targets");
});
