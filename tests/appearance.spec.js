const { test, expect } = require("@playwright/test");

test("saves explicit dark mode and a named color template", async ({ page }) => {
  await page.goto("/#settings");

  await expect(page.getByRole("radio", { name: "System Follow this device" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Calm Teal" })).toBeChecked();

  await page.getByRole("radio", { name: "Dark Always dark" }).check();
  await page.getByRole("radio", { name: "Ocean Blue" }).check();

  await expect(page.locator("html")).toHaveAttribute("data-appearance-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "ocean");
  await expect(page.locator("#appearance-status")).toHaveText("Appearance saved for this browser.");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1e40af");

  const colors = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    card: getComputedStyle(document.querySelector(".appearance-card")).backgroundColor,
    primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
  }));
  expect(colors).toEqual({ page: "rgb(15, 23, 42)", card: "rgb(24, 34, 53)", primary: "#1d4ed8" });

  const optionBoxes = await page.locator(".appearance-option, .color-template-option")
    .evaluateAll((options) => options.map((option) => option.getBoundingClientRect().height));
  optionBoxes.forEach((height) => expect(height).toBeGreaterThanOrEqual(44));

  await page.reload();
  await expect(page.getByRole("radio", { name: "Dark Always dark" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Ocean Blue" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("system mode follows the device while explicit light mode overrides it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/#settings");
  await expect(page.locator("html")).toHaveAttribute("data-appearance-mode", "system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("radio", { name: "Light Always light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("radio", { name: "System Follow this device" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("applies appearance consistently to live, review, and progress screens", async ({ page }) => {
  await page.goto("/");
  const sessionId = await page.evaluate(() => {
    DataTaker.savePreferences({ appearance_mode: "dark", color_theme: "rose" });
    const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
    DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []);
    DataTaker.endSession(session.id);
    return session.id;
  });

  const urls = [
    "/session.html?id=" + sessionId,
    "/review.html?id=" + sessionId,
    "/progress.html?client=Client+A&target=tgt-r-cvc",
  ];
  for (const url of urls) {
    await page.goto(url);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-color-theme", "rose");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#9f1239");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
  }

  await expect(page.locator(".progress-line")).toHaveCSS("stroke", "rgb(190, 18, 60)");
  await expect(page.locator(".progress-svg")).toHaveCSS("background-color", "rgb(24, 34, 53)");
});

test("keeps appearance choices keyboard-visible and text-labeled", async ({ page }) => {
  await page.goto("/#settings");
  const violet = page.getByRole("radio", { name: "Soft Violet" });
  await violet.focus();
  await expect(violet).toBeFocused();
  const outline = await violet.locator("..").evaluate((label) => getComputedStyle(label).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Space");
  await expect(violet).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "violet");

  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
});
