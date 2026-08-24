const { test, expect } = require("@playwright/test");

function runOnceForDesktopLayout(testInfo) {
  test.skip(
    testInfo.project.name !== "iPhone 13",
    "This spec sets its own desktop viewport and only needs one Chromium run."
  );
}

async function useDesktopViewport(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

test("keeps desktop session actions near the cue controls and bounds the recent-trials sidebar", async ({ page }, testInfo) => {
  runOnceForDesktopLayout(testInfo);
  await useDesktopViewport(page);
  await page.goto("/");

  const sessionId = await page.evaluate(() =>
    DataTaker.startSession("Client A", ["tgt-r-cvc"]).id
  );
  await page.goto("/session.html?id=" + sessionId);

  const cuesBox = await page.locator(".cues").boundingBox();
  const dockBox = await page.locator(".action-dock").boundingBox();
  const workspaceBox = await page.locator("#session-workspace").boundingBox();
  expect(cuesBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();

  const gapAfterCues = dockBox.y - (cuesBox.y + cuesBox.height);
  expect(gapAfterCues).toBeGreaterThanOrEqual(0);
  expect(gapAfterCues).toBeLessThan(40);
  expect(workspaceBox.height).toBeLessThan(800);

  const surfaceColors = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    sidebar: getComputedStyle(document.querySelector(".session-secondary")).backgroundColor,
    recent: getComputedStyle(document.querySelector(".session-secondary .recent")).backgroundColor,
  }));
  expect(surfaceColors.sidebar).toBe(surfaceColors.page);
  expect(surfaceColors.recent).not.toBe(surfaceColors.page);
  await assertNoHorizontalOverflow(page);
});

test("keeps the Objective draft directly under the desktop summary while graphs use the right column", async ({ page }, testInfo) => {
  runOnceForDesktopLayout(testInfo);
  await useDesktopViewport(page);
  await page.addInitScript(() => {
    localStorage.setItem("dataTaker.sessions.v2", JSON.stringify([
      {
        id: "desktop-review",
        client_label: "Client A",
        target_ids: ["tgt-r-cvc"],
        target_snapshots: {
          "tgt-r-cvc": {
            id: "tgt-r-cvc",
            label: "Initial /r/ in CVC words",
            domain: "Articulation",
            short_term_goal: "Produce initial /r/ at the word level",
          },
        },
        start_time: "2026-08-24T17:00:00.000Z",
        end_time: "2026-08-24T17:30:00.000Z",
        datapoints: [
          { id: "desk-1", target_id: "tgt-r-cvc", result: "+", prompt_levels: [], timestamp: "2026-08-24T17:01:00.000Z" },
          { id: "desk-2", target_id: "tgt-r-cvc", result: "+", prompt_levels: ["Min"], timestamp: "2026-08-24T17:02:00.000Z" },
          { id: "desk-3", target_id: "tgt-r-cvc", result: "-", prompt_levels: ["Verbal"], timestamp: "2026-08-24T17:03:00.000Z" },
        ],
      },
    ]));
  });

  await page.goto("/review.html?id=desktop-review");
  await expect(page.locator("#review-main")).toBeVisible();
  await expect(page.locator(".review-progress-card")).toBeVisible();

  const summaryBox = await page.locator(".review-summary-card").boundingBox();
  const objectiveBox = await page.locator(".objective-card").boundingBox();
  const progressBox = await page.locator(".review-progress-card").boundingBox();
  expect(summaryBox).not.toBeNull();
  expect(objectiveBox).not.toBeNull();
  expect(progressBox).not.toBeNull();

  expect(Math.abs(progressBox.y - summaryBox.y)).toBeLessThan(3);
  expect(progressBox.x).toBeGreaterThan(summaryBox.x + summaryBox.width);
  expect(Math.abs(objectiveBox.x - summaryBox.x)).toBeLessThan(3);
  const railGap = objectiveBox.y - (summaryBox.y + summaryBox.height);
  expect(railGap).toBeGreaterThanOrEqual(0);
  expect(railGap).toBeLessThan(40);

  await assertNoHorizontalOverflow(page);
});
