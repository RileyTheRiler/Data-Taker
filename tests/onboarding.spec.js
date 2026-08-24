const { test, expect } = require("@playwright/test");

async function openCleanInstall(page, path = "/") {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(path);
}

async function addArticulationTemplate(page) {
  await page.getByRole("button", { name: "Choose a starter template" }).click();
  await expect(page.locator("#goal-template-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Add Articulation template" }).click();
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

test("adds only the selected template, opens its editor, and keeps editing reachable from Start", async ({ page }) => {
  await openCleanInstall(page);

  await page.getByRole("button", { name: "Choose a starter template" }).click();
  await expect(page.locator("#goal-template-dialog")).toBeVisible();
  await expect(page.locator(".goal-template-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Add Articulation template" }).click();

  await expect(page.locator("#goal-template-dialog")).toBeHidden();
  await expect(page).toHaveURL(/#goals$/);
  await expect(page.locator("#goal-editor-discovery-status")).toContainText(
    "Edit or delete any goal, objective, or target"
  );
  await expect(page.locator(".domain-group").first()).toHaveAttribute("open", "");
  await expect(page.locator(".ltg-group").first()).toHaveAttribute("open", "");
  const firstObjective = page.locator(".stg-group").first();
  await expect(firstObjective).toHaveAttribute("open", "");
  const firstObjectiveSummary = firstObjective.locator(":scope > summary");
  await expect(firstObjectiveSummary.getByRole("button", { name: "Rename" })).toBeVisible();
  await expect(firstObjectiveSummary.getByRole("button", { name: "Delete" })).toBeVisible();

  const library = await page.evaluate(() => DataTaker.getGoals());
  expect(library.domains).toHaveLength(1);
  expect(library.domains[0].name).toBe("Articulation");
  expect(library.domains[0].long_term_goals[0].short_term_goals[0].targets[0].id)
    .not.toBe("tgt-r-cvc");

  await page.locator("#tab-start").click();
  await expect(page.locator("#goal-onboarding-card")).toBeHidden();
  await expect(page.locator("#client-card")).toBeVisible();
  await expect(page.locator("#target-selection-card")).toBeVisible();
  await expect(page.locator(".target-select-row")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Edit goals & objectives" })).toBeVisible();
  await page.getByRole("button", { name: "Edit goals & objectives" }).click();
  await expect(page).toHaveURL(/#goals$/);
});

test("template goals and objectives can be renamed and removed immediately", async ({ page }) => {
  await openCleanInstall(page);
  await addArticulationTemplate(page);

  const firstObjective = page.locator(".stg-group").first();
  await firstObjective.locator(":scope > summary").getByRole("button", { name: "Rename" }).click();
  const renameForm = firstObjective.locator(":scope > summary .rename-form");
  await renameForm.locator("input").fill("Custom word-level objective");
  await renameForm.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".goal-node-label").filter({ hasText: /^Custom word-level objective$/ })).toHaveCount(1);

  const secondObjectiveLabel = "Carry accurate productions into longer utterances";
  const secondObjectiveRow = page.locator(".goal-node-label")
    .filter({ hasText: new RegExp("^" + secondObjectiveLabel + "$") })
    .locator("..");
  await secondObjectiveRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#confirm-dialog-message")).toContainText(secondObjectiveLabel);
  await page.locator("#confirm-dialog-accept").click();
  await expect(page.locator(".goal-node-label").filter({ hasText: new RegExp("^" + secondObjectiveLabel + "$") })).toHaveCount(0);

  const result = await page.evaluate(() => {
    const goal = DataTaker.getGoals().domains[0].long_term_goals[0];
    return {
      objectiveLabels: goal.short_term_goals.map((item) => item.label),
      targetCount: Object.keys(DataTaker.allTargets()).length,
    };
  });
  expect(result.objectiveLabels).toEqual(["Custom word-level objective"]);
  expect(result.targetCount).toBe(3);
});

test("keeps the interactive example out of stored sessions and progress", async ({ page }) => {
  await openCleanInstall(page);

  const sessionsBefore = await page.evaluate(() => localStorage.getItem("dataTaker.sessions.v2"));
  await page.getByRole("button", { name: "Try an example session" }).click();
  await page.getByRole("button", { name: "Visual", exact: true }).click();
  await page.getByRole("button", { name: "Record correct" }).click();
  await page.getByRole("button", { name: "Record incorrect" }).click();

  await expect(page.locator("#demo-accuracy")).toHaveText("50%");
  await expect(page.locator("#demo-trial-count")).toHaveText("2 trials");
  await expect(page.locator("#demo-recent li")).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem("dataTaker.sessions.v2"))).toBe(sessionsBefore);
  expect(await page.evaluate(() => DataTaker.getPastSessions("Example Client"))).toEqual([]);
});

test("collapses long active libraries until the user asks for more", async ({ page }) => {
  await openCleanInstall(page);

  await addArticulationTemplate(page);
  await page.locator("#tab-start").click();
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
