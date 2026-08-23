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
  } catch (e) {
    show("client-error", e.message);
  }
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
      show("backup-status", "Backup restored.");
    } catch (e) {
      show("backup-status", "Could not read that backup file.");
    }
  };
  reader.readAsText(file);
}

// ---------- Wire up ----------

document.getElementById("add-client").addEventListener("click", addClient);
document.getElementById("new-client").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { addClient(); }
});
document.getElementById("start-session").addEventListener("click", startSession);
document.getElementById("toggle-edit-goals").addEventListener("click", toggleEditGoals);
document.getElementById("add-domain").addEventListener("click", addDomain);
document.getElementById("add-ltg").addEventListener("click", addLtg);
document.getElementById("add-stg").addEventListener("click", addStg);
document.getElementById("add-target").addEventListener("click", addTarget);
document.getElementById("export-data").addEventListener("click", exportData);
document.getElementById("import-data").addEventListener("change", function (e) {
  if (e.target.files && e.target.files[0]) { importData(e.target.files[0]); }
});

loadClients();
loadGoals();
