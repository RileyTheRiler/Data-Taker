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
  return { DataTaker: context.__dataTaker, values };
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
