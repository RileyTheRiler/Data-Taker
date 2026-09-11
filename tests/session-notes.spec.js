const { test, expect } = require("@playwright/test");

async function startSession(page, targets = ["tgt-r-cvc"]) {
  await page.goto("/");
  return page.evaluate((targetIds) =>
    DataTaker.startSession("Client A", targetIds).id
  , targets);
}

test("keeps a notes field on screen and saves what is typed", async ({ page }) => {
  const sessionId = await startSession(page);
  await page.goto("/session.html?id=" + sessionId);

  const notes = page.locator("#session-notes");
  await expect(notes).toBeVisible();
  await expect(notes).toHaveValue("");
  await expect(page.locator("#notes-status")).toHaveText("Saved");

  await notes.fill("Easy onset cueing worked well.");
  await expect(page.locator("#notes-status")).toHaveText("Saved");
  expect(await page.evaluate((id) => DataTaker.getSession(id).notes, sessionId))
    .toBe("Easy onset cueing worked well.");

  await page.reload();
  await expect(page.locator("#session-notes")).toHaveValue("Easy onset cueing worked well.");
});

test("does not overwrite notes being typed when a trial is recorded", async ({ page }) => {
  const sessionId = await startSession(page);
  await page.goto("/session.html?id=" + sessionId);

  const notes = page.locator("#session-notes");
  await notes.fill("Mid-sentence when the tap lands");
  await page.locator("#tap-correct").click();

  await expect(page.locator("#overall-count")).toContainText("1 trial");
  await expect(notes).toHaveValue("Mid-sentence when the tap lands");
});

test("stays editable after the session ends", async ({ page }) => {
  const sessionId = await startSession(page);
  await page.goto("/session.html?id=" + sessionId);

  await page.locator("#session-notes").fill("During the session.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#end-session").click();

  await expect(page.locator("#ended-banner")).toBeVisible();
  const notes = page.locator("#session-notes");
  await expect(notes).toBeVisible();
  await expect(notes).toHaveValue("During the session.");

  await notes.fill("During the session. Wrote up the Objective afterwards.");
  await expect(page.locator("#notes-status")).toHaveText("Saved");
  expect(await page.evaluate((id) => DataTaker.getSession(id).notes, sessionId))
    .toBe("During the session. Wrote up the Objective afterwards.");
});

test("saves pending notes when leaving the session screen", async ({ page }) => {
  const sessionId = await startSession(page);
  await page.goto("/session.html?id=" + sessionId);

  // Type without blurring so the debounced save is still pending on exit.
  await page.locator("#session-notes").type("Leaving before the debounce fires.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#exit-session").click();

  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  expect(await page.evaluate((id) => DataTaker.getSession(id).notes, sessionId))
    .toBe("Leaving before the debounce fires.");
});
