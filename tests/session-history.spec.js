const { test, expect } = require("@playwright/test");

const endedSessions = [
  {
    id: "session-a-new",
    client_label: "Client A",
    target_ids: ["tgt-r-cvc", "tgt-r-blends"],
    start_time: "2026-08-23T17:00:00.000Z",
    end_time: "2026-08-23T17:30:05.000Z",
    datapoints: [
      { id: "dp-1", target_id: "tgt-r-cvc", result: "+", prompt_levels: [], timestamp: "2026-08-23T17:01:00.000Z" },
      { id: "dp-2", target_id: "tgt-r-cvc", result: "-", prompt_levels: ["Min"], timestamp: "2026-08-23T17:02:00.000Z" },
      { id: "dp-3", target_id: "tgt-r-blends", result: "+", prompt_levels: ["Visual"], timestamp: "2026-08-23T17:03:00.000Z" },
    ],
  },
  {
    id: "session-b",
    client_label: "Client B",
    target_ids: ["tgt-easy-onset"],
    start_time: "2026-08-22T18:00:00.000Z",
    end_time: "2026-08-22T18:10:00.000Z",
    datapoints: [
      { id: "dp-4", target_id: "tgt-easy-onset", result: "+", prompt_levels: [], timestamp: "2026-08-22T18:01:00.000Z" },
    ],
  },
  {
    id: "session-active",
    client_label: "Client A",
    target_ids: ["tgt-r-cvc"],
    start_time: "2026-08-23T19:00:00.000Z",
    end_time: null,
    datapoints: [],
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((sessions) => {
    localStorage.setItem("dataTaker.clients.v1", JSON.stringify([
      { id: "client-a", label: "Client A" },
      { id: "client-b", label: "Client B" },
    ]));
    localStorage.setItem("dataTaker.sessions.v1", JSON.stringify(sessions));
  }, endedSessions);
  await page.goto("/");
});

test("filters ended session history and shows target accuracy", async ({ page }) => {
  await expect(page.locator("#past-session-count")).toHaveText("1 ended");
  const item = page.locator(".history-item");
  await expect(item).toHaveCount(1);
  await expect(item.locator("summary")).toContainText("00:30:05");
  await expect(item.locator("summary")).toContainText("67% · 2/3 correct");

  await item.locator("summary").click();
  await expect(item).toHaveAttribute("open", "");
  await expect(item.locator(".history-targets li").nth(0)).toContainText("Initial /r/ in CVC words");
  await expect(item.locator(".history-targets li").nth(0)).toContainText("50% · 1/2 correct");
  await expect(item.locator(".history-targets li").nth(1)).toContainText("100% · 1/1 correct");

  await page.locator("#client-select").selectOption("Client B");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.locator(".history-item")).toContainText("100% · 1/1 correct");

  const migration = await page.evaluate(() => ({
    legacy: localStorage.getItem("dataTaker.sessions.v1"),
    current: localStorage.getItem("dataTaker.sessions.v2"),
  }));
  expect(migration.legacy).not.toBeNull();
  expect(migration.current).not.toBeNull();
});

test("fits the configured phone and iPad viewport without horizontal overflow", async ({ page }) => {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

test("keeps a new session target label after the goal is deleted", async ({ page }) => {
  await page.evaluate(() => {
    const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
    DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []);
    DataTaker.deleteDomain("domain-articulation");
    DataTaker.endSession(session.id);
  });
  await page.reload();
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.locator(".history-item").first().locator("summary").click();
  await expect(page.locator(".history-item").first()).toContainText("Initial /r/ in CVC words");
});

test("adds and edits a custom cue used by the session screen", async ({ page }) => {
  await page.locator("#toggle-edit-cues").click();
  await page.locator("#new-cue-label").fill("Gestural");
  await page.locator("#add-cue").click();
  await expect(page.locator("#cue-editor-list input").last()).toHaveValue("Gestural");

  await page.locator("#cue-editor-list input").last().fill("Gesture");
  await page.locator("#cue-editor-list .cue-save").last().click();
  await expect(page.locator("#cue-editor-list input").last()).toHaveValue("Gesture");

  const sessionId = await page.evaluate(() =>
    DataTaker.startSession("Client A", ["tgt-r-cvc"]).id
  );
  await page.goto("/session.html?id=" + sessionId);
  await expect(page.locator('.cue[data-cue="Gesture"]')).toBeVisible();
});

test("adds and renames a target during a session without losing its trial", async ({ page }) => {
  const sessionId = await page.evaluate(() => {
    const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
    DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []);
    return session.id;
  });
  await page.goto("/session.html?id=" + sessionId);

  await page.locator("#toggle-target-manager").click();
  await page.locator("#available-targets").selectOption("tgt-r-blends");
  await page.locator("#add-session-target").click();
  await expect(page.locator(".carousel-target-label")).toHaveText("Initial /r/ blends (br, cr, gr)");

  await page.locator("#tap-incorrect").click();
  await page.locator("#edit-target-label").fill("Initial rhotic blends");
  await page.locator("#save-target-label").click();
  await expect(page.locator(".carousel-target-label")).toHaveText("Initial rhotic blends");
  await expect(page.locator(".recent-item").first()).toContainText("Initial rhotic blends");

  const session = await page.evaluate((id) => DataTaker.getSession(id), sessionId);
  expect(session.datapoints).toHaveLength(2);
  expect(session.datapoints[0].target_id).toBe("tgt-r-cvc");
  expect(session.datapoints[1].target_id).toBe("tgt-r-blends");
});
