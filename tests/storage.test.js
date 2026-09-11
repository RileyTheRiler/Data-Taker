const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const storageSource = fs.readFileSync(
  path.join(__dirname, "..", "static", "js", "storage.js"),
  "utf8"
);

function loadDataTaker(seed = {}) {
  const values = new Map(Object.entries(seed));
  let nextId = 0;
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const crypto = { randomUUID: () => "00000000-0000-0000-0000-" + String(++nextId).padStart(12, "0") };
  const context = vm.createContext({ console, crypto, localStorage, window: { crypto } });
  vm.runInContext(storageSource + "; globalThis.__dataTaker = DataTaker;", context);
  return { DataTaker: context.__dataTaker, values, context };
}

test("migrates v1 sessions to v2 without removing the recovery copy", () => {
  const legacy = [{
    id: "legacy-session",
    client_label: "Client A",
    target_ids: ["tgt-r-cvc"],
    start_time: "2026-08-23T17:00:00.000Z",
    end_time: "2026-08-23T17:10:00.000Z",
    datapoints: [],
  }];
  const rawLegacy = JSON.stringify(legacy);
  const { DataTaker, values } = loadDataTaker({ "dataTaker.sessions.v1": rawLegacy });

  const sessions = DataTaker.getSessions();

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].target_snapshots["tgt-r-cvc"].label, "Initial /r/ in CVC words");
  assert.equal(values.get("dataTaker.sessions.v1"), rawLegacy);
  assert.ok(values.has("dataTaker.sessions.v2"));
});

test("returns ended sessions for one client with target and duration summaries", () => {
  const { DataTaker } = loadDataTaker();
  DataTaker.addClient("Client A");
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []);
  const ended = DataTaker.endSession(session.id);

  const history = DataTaker.getPastSessions("client a");

  assert.equal(history.length, 1);
  assert.equal(history[0].id, ended.id);
  assert.equal(history[0].overall.percent, 100);
  assert.equal(history[0].targets[0].correct, 1);
  assert.ok(history[0].duration_seconds >= 0);
  assert.equal(DataTaker.getPastSessions("Client B").length, 0);
});

test("returns stable per-target history in chronological order without treating no trials as missing", () => {
  const sessions = [
    {
      id: "older",
      client_label: "Client A",
      target_ids: ["tgt-r-cvc"],
      target_snapshots: {
        "tgt-r-cvc": {
          id: "tgt-r-cvc",
          label: "Initial /r/ in CVC words",
          domain: "Articulation",
          long_term_goal: "Produce /r/ accurately",
          short_term_goal: "Produce initial /r/ at the word level",
        },
      },
      start_time: "2026-08-01T17:00:00.000Z",
      end_time: "2026-08-01T17:10:00.000Z",
      datapoints: [
        { id: "one", target_id: "tgt-r-cvc", result: "+", prompt_levels: [] },
        { id: "two", target_id: "tgt-r-cvc", result: "-", prompt_levels: [] },
      ],
    },
    {
      id: "newer",
      client_label: "Client A",
      target_ids: ["tgt-r-cvc"],
      target_snapshots: {
        "tgt-r-cvc": {
          id: "tgt-r-cvc",
          label: "Initial rhotic words",
          domain: "Articulation",
          long_term_goal: "Produce /r/ accurately",
          short_term_goal: "Produce initial /r/ at the word level",
        },
      },
      start_time: "2026-08-20T17:00:00.000Z",
      end_time: "2026-08-20T17:10:00.000Z",
      datapoints: [],
    },
  ];
  const { DataTaker } = loadDataTaker({
    "dataTaker.sessions.v2": JSON.stringify(sessions),
  });

  const history = DataTaker.getTargetHistory("client a", "tgt-r-cvc");

  assert.equal(history.client_label, "Client A");
  assert.equal(history.target.label, "Initial rhotic words");
  assert.equal(history.target.short_term_goal, "Produce initial /r/ at the word level");
  assert.deepEqual(Array.from(history.sessions, (session) => session.session_id), ["older", "newer"]);
  assert.deepEqual(Array.from(history.sessions, (session) => session.percent), [50, 0]);
  assert.deepEqual(Array.from(history.sessions, (session) => session.total), [2, 0]);
  assert.equal(DataTaker.getTargetHistory("Client B", "tgt-r-cvc"), null);
});

test("recovers active sessions and persists ephemeral session controls", () => {
  const { DataTaker, values } = loadDataTaker();
  const older = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  const current = DataTaker.startSession("Client B", ["tgt-r-blends"]);

  const active = DataTaker.getActiveSessions();
  assert.equal(active.length, 2);
  assert.deepEqual(new Set(active.map((session) => session.id)), new Set([older.id, current.id]));

  DataTaker.saveSessionUi(current.id, {
    active_target_id: "tgt-r-blends",
    armed_cues: ["Min", "Visual"],
    hold_cues: false,
  });
  assert.deepEqual(Array.from(DataTaker.getSessionUi(current.id).armed_cues), ["Min", "Visual"]);
  assert.equal(DataTaker.getSessionUi(current.id).hold_cues, false);

  DataTaker.endSession(current.id);
  assert.equal(DataTaker.getActiveSessions().length, 1);
  assert.equal(DataTaker.getActiveSessions()[0].id, older.id);
  assert.deepEqual(JSON.parse(values.get("dataTaker.sessionUi.v1")), {});
});

test("accepts stable session operations idempotently", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  const operation = {
    id: "watch-operation-1",
    session_id: session.id,
    type: "trial",
    datapoint_id: "watch-operation-1",
    target_id: "tgt-r-cvc",
    result: "+",
    prompt_levels: ["Visual"],
    timestamp: "2026-08-24T12:00:00.000Z",
    source: "watch",
  };

  const first = DataTaker.applySessionOperation(operation);
  const retry = DataTaker.applySessionOperation(operation);

  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.session.datapoints.length, 1);
  assert.equal(retry.session.datapoints[0].operation_id, operation.id);
  assert.equal(retry.session.datapoints[0].source, "watch");
});

test("preserves committed order when a delayed operation is retried", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  const operation = (id, result) => ({
    id,
    session_id: session.id,
    type: "trial",
    datapoint_id: id,
    target_id: "tgt-r-cvc",
    result,
    prompt_levels: [],
    timestamp: "2026-08-24T12:00:00.000Z",
    source: "watch",
  });

  DataTaker.applySessionOperation(operation("operation-1", "+"));
  DataTaker.applySessionOperation(operation("operation-2", "-"));
  DataTaker.applySessionOperation(operation("operation-1", "+"));

  assert.deepEqual(
    Array.from(DataTaker.getSession(session.id).datapoints, (point) => point.id),
    ["operation-1", "operation-2"]
  );
});

test("target snapshots keep history readable after its goal is deleted", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", ["Min"]);
  DataTaker.deleteDomain("domain-articulation");
  DataTaker.endSession(session.id);

  const history = DataTaker.getPastSessions("Client A");

  assert.equal(history[0].targets[0].label, "Initial /r/ in CVC words");
  assert.equal(history[0].targets[0].domain, "Articulation");
});

test("supports custom cue labels without rewriting recorded trials", () => {
  const { DataTaker } = loadDataTaker();
  const cue = DataTaker.addCue("Gestural");
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", ["Gestural"]);

  DataTaker.renameCue(cue.id, "Gesture");
  DataTaker.deleteCue(cue.id);
  DataTaker.endSession(session.id);

  const history = DataTaker.getPastSessions("Client A");
  assert.deepEqual(Array.from(history[0].datapoints[0].prompt_levels), ["Gestural"]);
  assert.equal(DataTaker.getCues().some((item) => item.id === cue.id), false);
});

test("adds a target during a session without disturbing prior trials", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []);

  const updated = DataTaker.addSessionTarget(session.id, "tgt-r-blends");

  assert.deepEqual(Array.from(updated.target_ids), ["tgt-r-cvc", "tgt-r-blends"]);
  assert.equal(updated.datapoints.length, 1);
  assert.equal(updated.datapoints[0].target_id, "tgt-r-cvc");
  assert.equal(updated.targets[0].total, 1);
  assert.equal(updated.targets[1].total, 0);
});

test("renames an active target without rewriting completed history or trial IDs", () => {
  const { DataTaker } = loadDataTaker();
  const completed = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.addDatapoint(completed.id, "tgt-r-cvc", "+", []);
  DataTaker.endSession(completed.id);

  const active = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.addDatapoint(active.id, "tgt-r-cvc", "-", ["Min"]);
  const renamed = DataTaker.renameSessionTarget(active.id, "tgt-r-cvc", "Initial rhotic words");

  assert.equal(renamed.targets[0].id, "tgt-r-cvc");
  assert.equal(renamed.targets[0].label, "Initial rhotic words");
  assert.equal(renamed.datapoints[0].target_id, "tgt-r-cvc");
  assert.equal(DataTaker.allTargets()["tgt-r-cvc"].label, "Initial rhotic words");
  assert.equal(DataTaker.getPastSessions("Client A")[0].targets[0].label, "Initial /r/ in CVC words");
});

test("rejects target changes after a session ends", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.endSession(session.id);

  assert.throws(() => DataTaker.addSessionTarget(session.id, "tgt-r-blends"), /ended/);
  assert.throws(() => DataTaker.renameSessionTarget(session.id, "tgt-r-cvc", "Changed"), /ended/);
});

test("drafts an Objective summary from ended-session accuracy and cueing", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc", "tgt-r-blends"]);
  DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []);
  DataTaker.addDatapoint(session.id, "tgt-r-cvc", "-", ["Min", "Visual"]);
  DataTaker.addDatapoint(session.id, "tgt-r-blends", "+", ["Visual"]);
  DataTaker.endSession(session.id);

  const draft = DataTaker.getObjectiveDraft(session.id);

  assert.match(draft, /data were collected across 2 targets/);
  assert.match(draft, /2 of 3 opportunities \(67%\)/);
  assert.match(draft, /Initial \/r\/ in CVC words/);
  assert.match(draft, /1 of 2 opportunities \(50%\)/);
  assert.match(draft, /independent in 1 of 2 opportunities \(50%\)/);
  assert.match(draft, /Min on 1 opportunity/);
  assert.match(draft, /Visual on 1 opportunity/);
  assert.match(draft, /Initial \/r\/ blends/);
  assert.match(draft, /Visual on 1 opportunity/);
  assert.match(draft, /Add the session activity or materials/);
});

test("requires an ended session before drafting an Objective summary", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);

  assert.throws(() => DataTaker.getObjectiveDraft(session.id), /End the session/);
});

test("normalizes older goals and preserves stable IDs through edits and ordering", () => {
  const olderGoals = {
    domains: [{
      id: "domain-old",
      name: "Voice",
      long_term_goals: [{
        id: "ltg-old",
        label: "Voice goal",
        short_term_goals: [{
          id: "stg-old",
          label: "Resonance goal",
          targets: [
            { id: "target-a", label: "Forward resonance" },
            { id: "target-b", label: "Balanced resonance" },
          ],
        }],
      }],
    }],
  };
  const { DataTaker } = loadDataTaker({
    "dataTaker.goals.v1": JSON.stringify(olderGoals),
  });

  const normalized = DataTaker.getGoals();
  assert.equal(normalized.domains[0].id, "domain-old");
  assert.equal(normalized.domains[0].archived, false);
  assert.equal(normalized.domains[0].long_term_goals[0].short_term_goals[0].targets[1].order, 1);

  DataTaker.renameGoalNode("target", "target-a", "Anterior resonance");
  DataTaker.reorderGoalNode("target", "target-a", 1);
  const edited = DataTaker.getGoals().domains[0].long_term_goals[0].short_term_goals[0].targets;
  assert.deepEqual(Array.from(edited, (target) => target.id), ["target-b", "target-a"]);
  assert.equal(edited[1].label, "Anterior resonance");
  assert.equal(edited[1].id, "target-a");
});

test("duplicates, archives, restores, and permanently deletes goal nodes", () => {
  const { DataTaker } = loadDataTaker();
  const duplicate = DataTaker.duplicateGoalNode("target", "tgt-r-cvc");
  assert.notEqual(duplicate.id, "tgt-r-cvc");
  assert.match(duplicate.label, /copy$/);

  DataTaker.setGoalArchived("target", "tgt-r-cvc", true);
  assert.equal(DataTaker.allTargets()["tgt-r-cvc"], undefined);
  assert.equal(DataTaker.allTargets(true)["tgt-r-cvc"].archived, true);
  DataTaker.setGoalArchived("target", "tgt-r-cvc", false);
  assert.ok(DataTaker.allTargets()["tgt-r-cvc"]);

  const description = DataTaker.describeGoalNode("domain", "domain-articulation");
  assert.ok(description.ltgs > 0);
  assert.ok(description.stgs > 0);
  assert.ok(description.targets > 0);
  DataTaker.deleteGoalNode("target", duplicate.id);
  assert.equal(DataTaker.allTargets(true)[duplicate.id], undefined);
});

test("archiving current goals never rewrites completed-session snapshots", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []);
  DataTaker.endSession(session.id);
  const before = JSON.stringify(DataTaker.getSession(session.id).target_snapshots);

  DataTaker.renameGoalNode("target", "tgt-r-cvc", "Renamed current target");
  DataTaker.setGoalArchived("target", "tgt-r-cvc", true);

  const completed = DataTaker.getSession(session.id);
  assert.equal(JSON.stringify(completed.target_snapshots), before);
  assert.equal(completed.targets[0].label, "Initial /r/ in CVC words");
});

test("repeat-last and recent sets report missing or archived stable target IDs", () => {
  const { DataTaker } = loadDataTaker();
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc", "tgt-r-blends"]);
  DataTaker.endSession(session.id);
  DataTaker.setGoalArchived("target", "tgt-r-cvc", true);
  DataTaker.deleteGoalNode("target", "tgt-r-blends");

  const repeat = DataTaker.getRepeatLastSession("Client A");
  assert.deepEqual(Array.from(repeat.targets, (target) => target.id), ["tgt-r-cvc", "tgt-r-blends"]);
  assert.deepEqual(Array.from(repeat.targets, (target) => target.status), ["archived", "missing"]);

  const recent = DataTaker.getRecentTargetSets("client a")[0];
  assert.deepEqual(Array.from(recent.targets, (target) => target.status), ["archived", "missing"]);
  assert.equal(recent.datapoints, undefined);
});

test("backup migration and round trip preserve archive, order, and preferences", () => {
  const { DataTaker } = loadDataTaker();
  DataTaker.setGoalArchived("target", "tgt-r-cvc", true);
  DataTaker.reorderGoalNode("domain", "domain-language", -1);
  DataTaker.savePreferences({
    high_contrast: true,
    reduce_motion: true,
    appearance_mode: "dark",
    color_theme: "violet",
  });
  const backup = DataTaker.exportAll();

  assert.equal(backup.schema_version, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(DataTaker.validateImport(backup))), {
    clients: 0,
    domains: 3,
    cues: 6,
    sessions: 0,
  });

  const second = loadDataTaker();
  second.DataTaker.importAll(backup);
  const imported = second.DataTaker.getGoals();
  assert.equal(second.DataTaker.allTargets()["tgt-r-cvc"], undefined);
  assert.equal(second.DataTaker.allTargets(true)["tgt-r-cvc"].archived, true);
  assert.equal(imported.domains[1].id, "domain-language");
  assert.equal(second.DataTaker.getPreferences().high_contrast, true);
  assert.equal(second.DataTaker.getPreferences().reduce_motion, true);
  assert.equal(second.DataTaker.getPreferences().appearance_mode, "dark");
  assert.equal(second.DataTaker.getPreferences().color_theme, "violet");
});

test("appearance preferences default safely and reject unsupported values", () => {
  const { DataTaker, values } = loadDataTaker();
  assert.deepEqual(JSON.parse(JSON.stringify(DataTaker.getPreferences())), {
    high_contrast: false,
    reduce_motion: false,
    appearance_mode: "system",
    color_theme: "teal",
  });

  const saved = DataTaker.savePreferences({
    appearance_mode: "midnight",
    color_theme: "neon",
  });
  assert.equal(saved.appearance_mode, "system");
  assert.equal(saved.color_theme, "teal");
  assert.equal(JSON.parse(values.get("dataTaker.preferences.v1")).appearance_mode, "system");
});

test("rejects malformed imports before replacing current data", () => {
  const { DataTaker } = loadDataTaker();
  const before = JSON.stringify(DataTaker.exportAll());
  assert.throws(() => DataTaker.importAll({ sessions: {} }), /sessions/);
  assert.equal(JSON.stringify(DataTaker.exportAll()).replace(/"exported_at":"[^"]+"/, '"exported_at":"x"'),
    before.replace(/"exported_at":"[^"]+"/, '"exported_at":"x"'));
});

test("saves session notes, keeps them through trials, and survives a reload", () => {
  const { DataTaker } = loadDataTaker();
  DataTaker.addClient("Client A");
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  assert.equal(session.notes, "");

  const saved = DataTaker.saveSessionNotes(session.id, "Hoarse quality; try easy onset.");
  assert.equal(saved.notes, "Hoarse quality; try easy onset.");

  DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []);
  assert.equal(DataTaker.getSession(session.id).notes, "Hoarse quality; try easy onset.");

  // Notes live in the stored session, so a backup round-trip carries them.
  const exported = JSON.parse(JSON.stringify(DataTaker.exportAll()));
  const reloaded = loadDataTaker().DataTaker;
  reloaded.importAll(exported);
  assert.equal(reloaded.getSession(session.id).notes, "Hoarse quality; try easy onset.");
});

test("keeps session notes editable after the session ends", () => {
  const { DataTaker } = loadDataTaker();
  DataTaker.addClient("Client A");
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.endSession(session.id);

  const saved = DataTaker.saveSessionNotes(session.id, "Wrote the Objective after the session.");
  assert.equal(saved.notes, "Wrote the Objective after the session.");
  assert.equal(DataTaker.getSession(session.id).notes, "Wrote the Objective after the session.");

  // Trial data stays locked even though notes are not.
  assert.throws(() => DataTaker.addDatapoint(session.id, "tgt-r-cvc", "+", []), /ended/);
});

test("rejects notes that are not text or exceed the length cap", () => {
  const { DataTaker } = loadDataTaker();
  DataTaker.addClient("Client A");
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);

  assert.throws(() => DataTaker.saveSessionNotes(session.id, 42), /text/);
  assert.throws(() => DataTaker.saveSessionNotes(session.id, "x".repeat(10001)), /10000/);
  assert.throws(() => DataTaker.saveSessionNotes("missing-session", "hi"), /not found/);

  assert.equal(DataTaker.saveSessionNotes(session.id, "x".repeat(10000)).notes.length, 10000);
});

test("only logs a notes activity entry when the text actually changed", () => {
  const { DataTaker, values } = loadDataTaker();
  DataTaker.addClient("Client A");
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);

  const noteEntries = () => JSON.parse(values.get("dataTaker.activityLog.v1") || "[]")
    .filter((entry) => entry.entity === "session_notes").length;

  DataTaker.saveSessionNotes(session.id, "First pass.");
  assert.equal(noteEntries(), 1);
  DataTaker.saveSessionNotes(session.id, "First pass.");
  assert.equal(noteEntries(), 1);
  DataTaker.saveSessionNotes(session.id, "Second pass.");
  assert.equal(noteEntries(), 2);
});

test("keeps locally typed notes when the native authority replays a session", () => {
  const { DataTaker, context } = loadDataTaker();
  DataTaker.addClient("Client A");
  const session = DataTaker.startSession("Client A", ["tgt-r-cvc"]);
  DataTaker.saveSessionNotes(session.id, "Typed on the phone's web view.");

  // The phone authority snapshots the session at start and knows nothing about
  // notes, so it answers a trial with its own copy, which carries no notes key.
  const authoritative = JSON.parse(JSON.stringify(DataTaker.getSessions()[0]));
  delete authoritative.notes;
  authoritative.datapoints.push({
    id: "watch-1",
    operation_id: "op-1",
    target_id: "tgt-r-cvc",
    result: "+",
    prompt_levels: [],
    timestamp: "2026-09-11T17:00:00.000Z",
    source: "watch",
  });
  context.window.DataTakerNative = {
    applyOperation: () => JSON.stringify({
      accepted: true,
      duplicate: false,
      session: authoritative,
    }),
  };

  const result = DataTaker.applySessionOperation({
    id: "op-1",
    session_id: session.id,
    type: "trial",
    datapoint_id: "watch-1",
    target_id: "tgt-r-cvc",
    result: "+",
    prompt_levels: [],
    source: "watch",
  });

  assert.equal(result.session.datapoints.length, 1);
  assert.equal(result.session.notes, "Typed on the phone's web view.");
  assert.equal(DataTaker.getSession(session.id).notes, "Typed on the phone's web view.");
});
