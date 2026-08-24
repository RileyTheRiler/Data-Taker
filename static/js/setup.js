// Home/setup page: choose client, manage goals, pick targets, start a session.
// All data lives in localStorage via storage.js (DataTaker) — no server calls.

const selectedTargets = new Map(); // id -> label
let editMode = false;

function show(id, msg) {
  document.getElementById(id).textContent = msg || "";
}

function loadClients() {
  const select = document.getElementById("client-select");
  const clients = DataTaker.getClients();
  const previous = select.value;
  select.innerHTML = "";
  if (!clients.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— add a client below —";
    select.appendChild(opt);
  }
  clients.forEach(function (c) {
    const opt = document.createElement("option");
    opt.value = c.label;
    opt.textContent = c.label;
    select.appendChild(opt);
  });
  if (previous && clients.some((c) => c.label === previous)) { select.value = previous; }
}

function addClient() {
  const input = document.getElementById("new-client");
  const label = input.value.trim();
  show("client-error", "");
  if (!label) { return; }
  try {
    const client = DataTaker.addClient(label);
    input.value = "";
    loadClients();
    document.getElementById("client-select").value = client.label;
    loadPastSessions();
  } catch (e) {
    show("client-error", e.message);
  }
}

// ---------- Active session recovery ----------

function loadActiveSession() {
  const card = document.getElementById("active-session-card");
  const link = document.getElementById("resume-session");
  const meta = document.getElementById("active-session-meta");
  const active = DataTaker.getActiveSessions();

  if (!active.length) {
    card.classList.add("hidden");
    link.href = "/session";
    meta.textContent = "";
    return;
  }

  const session = active[0];
  const started = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.start_time));
  const additional = active.length > 1
    ? " · " + (active.length - 1) + " other unfinished session" + (active.length === 2 ? "" : "s")
    : "";

  meta.textContent = session.client_label + " · started " + started + " · " +
    session.datapoints.length + " trial" + (session.datapoints.length === 1 ? "" : "s") + additional;
  link.href = "/session?id=" + encodeURIComponent(session.id);
  card.classList.remove("hidden");
}

// ---------- Past sessions ----------

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const pad = function (value) { return String(value).padStart(2, "0"); };
  return pad(hours) + ":" + pad(minutes) + ":" + pad(remainingSeconds);
}

function formatSessionDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) { return "Date unavailable"; }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function accuracyText(result) {
  if (!result.total) { return "No trials"; }
  return result.percent + "% · " + result.correct + "/" + result.total + " correct";
}

function loadPastSessions() {
  const list = document.getElementById("past-sessions");
  const count = document.getElementById("past-session-count");
  const clientLabel = document.getElementById("client-select").value;
  list.innerHTML = "";
  count.textContent = "";

  if (!clientLabel) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Choose a client to review prior sessions.";
    list.appendChild(empty);
    return;
  }

  const sessions = DataTaker.getPastSessions(clientLabel);
  count.textContent = sessions.length + " ended";
  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No ended sessions for this client yet.";
    list.appendChild(empty);
    return;
  }

  sessions.forEach(function (session) {
    const item = document.createElement("details");
    item.className = "history-item";

    const summary = document.createElement("summary");
    const summaryMain = document.createElement("span");
    summaryMain.className = "history-summary-main";
    summaryMain.textContent = formatSessionDate(session.end_time);
    summary.appendChild(summaryMain);

    const summaryMetrics = document.createElement("span");
    summaryMetrics.className = "history-summary-metrics";
    summaryMetrics.textContent = formatDuration(session.duration_seconds) + " · " +
      accuracyText(session.overall);
    summary.appendChild(summaryMetrics);
    item.appendChild(summary);

    const targets = document.createElement("ul");
    targets.className = "history-targets";
    session.targets.forEach(function (target) {
      const row = document.createElement("li");
      const targetInfo = document.createElement("span");
      targetInfo.className = "history-target-info";

      const targetName = document.createElement("span");
      targetName.className = "history-target-name";
      targetName.textContent = target.label;
      targetInfo.appendChild(targetName);

      if (target.domain || target.short_term_goal) {
        const targetPath = document.createElement("span");
        targetPath.className = "history-target-path";
        targetPath.textContent = [target.domain, target.short_term_goal].filter(Boolean).join(" · ");
        targetInfo.appendChild(targetPath);
      }
      row.appendChild(targetInfo);

      const targetAccuracy = document.createElement("span");
      targetAccuracy.className = "history-target-accuracy";
      targetAccuracy.textContent = accuracyText(target);
      row.appendChild(targetAccuracy);
      targets.appendChild(row);
    });
    item.appendChild(targets);

    const reviewLink = document.createElement("a");
    reviewLink.className = "history-review-link";
    reviewLink.href = "/review.html?id=" + encodeURIComponent(session.id);
    reviewLink.textContent = "Review session & draft Objective";
    item.appendChild(reviewLink);
    list.appendChild(item);
  });
}

// ---------- Cue type editor ----------

function loadCues() {
  const cues = DataTaker.getCues();
  const list = document.getElementById("cue-editor-list");
  const summary = document.getElementById("cue-summary");
  summary.textContent = cues.length + " cue type" + (cues.length === 1 ? "" : "s") +
    " available during sessions.";
  list.innerHTML = "";

  if (!cues.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No cue types configured. Trials can still be recorded independently.";
    list.appendChild(empty);
    return;
  }

  cues.forEach(function (cue) {
    const row = document.createElement("div");
    row.className = "cue-editor-row";

    const input = document.createElement("input");
    input.className = "field";
    input.type = "text";
    input.maxLength = 40;
    input.value = cue.label;
    input.setAttribute("aria-label", "Cue label");
    row.appendChild(input);

    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn-secondary cue-save";
    save.textContent = "Save";
    save.addEventListener("click", function () {
      show("cue-editor-error", "");
      try {
        DataTaker.renameCue(cue.id, input.value);
        loadCues();
      } catch (e) {
        show("cue-editor-error", e.message);
      }
    });
    row.appendChild(save);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-danger-small";
    remove.textContent = "Delete";
    remove.addEventListener("click", function () {
      if (!confirm('Delete cue type "' + cue.label + '"? Existing trials will keep the label.')) { return; }
      show("cue-editor-error", "");
      try {
        DataTaker.deleteCue(cue.id);
        loadCues();
      } catch (e) {
        show("cue-editor-error", e.message);
      }
    });
    row.appendChild(remove);
    list.appendChild(row);
  });
}

function addCue() {
  const input = document.getElementById("new-cue-label");
  show("cue-editor-error", "");
  try {
    DataTaker.addCue(input.value);
    input.value = "";
    loadCues();
  } catch (e) {
    show("cue-editor-error", e.message);
  }
}

function toggleCueEditor() {
  const editor = document.getElementById("cue-editor");
  const btn = document.getElementById("toggle-edit-cues");
  const opening = editor.classList.contains("hidden");
  editor.classList.toggle("hidden");
  btn.textContent = opening ? "Done" : "Manage cues";
  btn.setAttribute("aria-expanded", String(opening));
  if (opening) { loadCues(); }
}

// ---------- Goal tree (selection view) ----------

function loadGoals() {
  const tree = document.getElementById("goal-tree");
  const goals = DataTaker.getGoals();
  tree.innerHTML = "";

  if (!goals.domains.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No goals yet — tap \"Manage goals\" to add your first domain.";
    tree.appendChild(empty);
    return;
  }

  function removeBtn(title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "node-remove";
    btn.innerHTML = "&times;";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  goals.domains.forEach(function (domain) {
    const dEl = document.createElement("div");
    dEl.className = "domain";
    const name = document.createElement("div");
    name.className = "domain-name";
    if (editMode) {
      const nameText = document.createElement("span");
      nameText.textContent = domain.name;
      name.appendChild(nameText);
      name.appendChild(removeBtn("Delete domain (and everything in it)", function () {
        if (!confirm('Delete domain "' + domain.name + '" and everything under it?')) { return; }
        DataTaker.deleteDomain(domain.id);
        refreshEverything();
      }));
    } else {
      name.textContent = domain.name;
    }
    dEl.appendChild(name);

    domain.long_term_goals.forEach(function (ltg) {
      const ltgEl = document.createElement("div");
      ltgEl.className = "ltg";
      const ltgLabel = document.createElement("div");
      ltgLabel.className = "ltg-label";
      if (editMode) {
        const t = document.createElement("span");
        t.textContent = ltg.label;
        ltgLabel.appendChild(t);
        ltgLabel.appendChild(removeBtn("Delete long-term goal", function () {
          if (!confirm('Delete this long-term goal and its short-term goals/targets?')) { return; }
          DataTaker.deleteLongTermGoal(domain.id, ltg.id);
          refreshEverything();
        }));
      } else {
        ltgLabel.textContent = ltg.label;
      }
      ltgEl.appendChild(ltgLabel);

      ltg.short_term_goals.forEach(function (stg) {
        const stgLabel = document.createElement("div");
        stgLabel.className = "stg-label";
        if (editMode) {
          const t = document.createElement("span");
          t.textContent = stg.label;
          stgLabel.appendChild(t);
          stgLabel.appendChild(removeBtn("Delete short-term goal", function () {
            if (!confirm('Delete this short-term goal and its targets?')) { return; }
            DataTaker.deleteShortTermGoal(domain.id, ltg.id, stg.id);
            refreshEverything();
          }));
        } else {
          stgLabel.textContent = stg.label;
        }
        ltgEl.appendChild(stgLabel);

        stg.targets.forEach(function (target) {
          if (editMode) {
            const wrap = document.createElement("span");
            wrap.className = "target-chip target-chip-edit";
            const t = document.createElement("span");
            t.textContent = target.label;
            wrap.appendChild(t);
            wrap.appendChild(removeBtn("Delete target", function () {
              if (!confirm('Delete target "' + target.label + '"?')) { return; }
              DataTaker.deleteTarget(domain.id, ltg.id, stg.id, target.id);
              selectedTargets.delete(target.id);
              refreshEverything();
            }));
            ltgEl.appendChild(wrap);
            return;
          }
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "target-chip";
          chip.textContent = target.label;
          if (selectedTargets.has(target.id)) { chip.classList.add("selected"); }
          chip.addEventListener("click", function () {
            if (selectedTargets.has(target.id)) {
              selectedTargets.delete(target.id);
              chip.classList.remove("selected");
            } else {
              selectedTargets.set(target.id, target.label);
              chip.classList.add("selected");
            }
            updateSummary();
          });
          ltgEl.appendChild(chip);
        });
      });
      dEl.appendChild(ltgEl);
    });
    tree.appendChild(dEl);
  });
}

function updateSummary() {
  const count = selectedTargets.size;
  const summary = document.getElementById("selection-summary");
  const startBtn = document.getElementById("start-session");
  if (count === 0) {
    summary.textContent = "No targets selected yet.";
    startBtn.disabled = true;
  } else {
    summary.textContent = count + " target" + (count === 1 ? "" : "s") + " selected.";
    startBtn.disabled = false;
  }
}

function startSession() {
  show("start-error", "");
  const clientLabel = document.getElementById("client-select").value;
  if (!clientLabel) {
    show("start-error", "Please choose or add a client first.");
    return;
  }
  if (selectedTargets.size === 0) { return; }
  const activeSessions = DataTaker.getActiveSessions();
  if (activeSessions.length && !confirm(
    "An unfinished session is still running. Start another session anyway?"
  )) {
    return;
  }

  try {
    const session = DataTaker.startSession(clientLabel, Array.from(selectedTargets.keys()));
    window.location.href = "/session?id=" + session.id;
  } catch (e) {
    show("start-error", e.message);
  }
}

// ---------- Goal editor (custom goals) ----------

function fillOptions(select, items, labelKey) {
  select.innerHTML = "";
  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— none yet —";
    select.appendChild(opt);
    return;
  }
  items.forEach(function (item) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item[labelKey];
    select.appendChild(opt);
  });
}

function refreshEditorSelects() {
  const goals = DataTaker.getGoals();
  const domains = goals.domains;

  fillOptions(document.getElementById("ltg-domain-select"), domains, "name");
  fillOptions(document.getElementById("stg-domain-select"), domains, "name");
  fillOptions(document.getElementById("target-domain-select"), domains, "name");

  refreshLtgSelect("stg-domain-select", "stg-ltg-select");
  refreshLtgSelect("target-domain-select", "target-ltg-select");
  refreshStgSelect();

  document.getElementById("stg-domain-select").onchange = function () {
    refreshLtgSelect("stg-domain-select", "stg-ltg-select");
  };
  document.getElementById("target-domain-select").onchange = function () {
    refreshLtgSelect("target-domain-select", "target-ltg-select");
    refreshStgSelect();
  };
  document.getElementById("target-ltg-select").onchange = refreshStgSelect;
}

function refreshLtgSelect(domainSelectId, ltgSelectId) {
  const goals = DataTaker.getGoals();
  const domainId = document.getElementById(domainSelectId).value;
  const domain = goals.domains.find((d) => d.id === domainId);
  fillOptions(document.getElementById(ltgSelectId), domain ? domain.long_term_goals : [], "label");
}

function refreshStgSelect() {
  const goals = DataTaker.getGoals();
  const domainId = document.getElementById("target-domain-select").value;
  const ltgId = document.getElementById("target-ltg-select").value;
  const domain = goals.domains.find((d) => d.id === domainId);
  const ltg = domain && domain.long_term_goals.find((g) => g.id === ltgId);
  fillOptions(document.getElementById("target-stg-select"), ltg ? ltg.short_term_goals : [], "label");
}

function refreshEverything() {
  loadGoals();
  refreshEditorSelects();
}

function addDomain() {
  show("goal-editor-error", "");
  const input = document.getElementById("new-domain-name");
  const name = input.value.trim();
  if (!name) { return; }
  DataTaker.addDomain(name);
  input.value = "";
  refreshEverything();
}

function addLtg() {
  show("goal-editor-error", "");
  const domainId = document.getElementById("ltg-domain-select").value;
  const input = document.getElementById("new-ltg-label");
  const label = input.value.trim();
  if (!domainId) { show("goal-editor-error", "Add a domain first."); return; }
  if (!label) { return; }
  try {
    DataTaker.addLongTermGoal(domainId, label);
    input.value = "";
    refreshEverything();
  } catch (e) {
    show("goal-editor-error", e.message);
  }
}

function addStg() {
  show("goal-editor-error", "");
  const domainId = document.getElementById("stg-domain-select").value;
  const ltgId = document.getElementById("stg-ltg-select").value;
  const input = document.getElementById("new-stg-label");
  const label = input.value.trim();
  if (!domainId || !ltgId) { show("goal-editor-error", "Add a long-term goal first."); return; }
  if (!label) { return; }
  try {
    DataTaker.addShortTermGoal(domainId, ltgId, label);
    input.value = "";
    refreshEverything();
  } catch (e) {
    show("goal-editor-error", e.message);
  }
}

function addTarget() {
  show("goal-editor-error", "");
  const domainId = document.getElementById("target-domain-select").value;
  const ltgId = document.getElementById("target-ltg-select").value;
  const stgId = document.getElementById("target-stg-select").value;
  const input = document.getElementById("new-target-label");
  const label = input.value.trim();
  if (!domainId || !ltgId || !stgId) { show("goal-editor-error", "Add a short-term goal first."); return; }
  if (!label) { return; }
  try {
    DataTaker.addTarget(domainId, ltgId, stgId, label);
    input.value = "";
    refreshEverything();
  } catch (e) {
    show("goal-editor-error", e.message);
  }
}

function toggleEditGoals() {
  const editor = document.getElementById("goal-editor");
  const btn = document.getElementById("toggle-edit-goals");
  const opening = editor.classList.contains("hidden");
  editor.classList.toggle("hidden");
  btn.textContent = opening ? "Done" : "Manage goals";
  editMode = opening;
  loadGoals();
  if (opening) { refreshEditorSelects(); }
}

// ---------- Backup / restore ----------

function exportData() {
  const data = DataTaker.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = "data-taker-backup-" + stamp + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  show("backup-status", "Backup downloaded.");
}

function importData(file) {
  show("backup-status", "");
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const data = JSON.parse(reader.result);
      DataTaker.importAll(data);
      refreshEverything();
      loadClients();
      loadPastSessions();
      loadCues();
      loadActiveSession();
      show("backup-status", "Backup restored.");
    } catch (e) {
      show("backup-status", "Could not read that backup file.");
    }
  };
  reader.readAsText(file);
}

// ---------- Wire up ----------

document.getElementById("add-client").addEventListener("click", addClient);
document.getElementById("client-select").addEventListener("change", loadPastSessions);
document.getElementById("new-client").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { addClient(); }
});
document.getElementById("start-session").addEventListener("click", startSession);
document.getElementById("toggle-edit-goals").addEventListener("click", toggleEditGoals);
document.getElementById("toggle-edit-cues").addEventListener("click", toggleCueEditor);
document.getElementById("add-domain").addEventListener("click", addDomain);
document.getElementById("add-ltg").addEventListener("click", addLtg);
document.getElementById("add-stg").addEventListener("click", addStg);
document.getElementById("add-target").addEventListener("click", addTarget);
document.getElementById("add-cue").addEventListener("click", addCue);
document.getElementById("new-cue-label").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { addCue(); }
});
document.getElementById("export-data").addEventListener("click", exportData);
document.getElementById("import-data").addEventListener("change", function (e) {
  if (e.target.files && e.target.files[0]) { importData(e.target.files[0]); }
});

loadClients();
loadActiveSession();
loadGoals();
loadPastSessions();
loadCues();
