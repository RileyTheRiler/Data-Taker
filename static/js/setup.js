// Home workspace: section navigation, fast setup, history, goal management, and settings.
// Clinical data persistence stays behind DataTaker; session-only navigation uses sessionStorage.

const selectedTargets = new Map();
let pendingIconTarget = null;
let pendingImport = null;
const openGoalGroups = new Set();

function byId(id) { return document.getElementById(id); }
function show(id, message) { byId(id).textContent = message || ""; }
function targetDisplay(target) {
  return typeof DataTaker.getTargetDisplayLabel === "function"
    ? DataTaker.getTargetDisplayLabel(target)
    : target.label;
}
function normalized(value) { return String(value || "").trim().toLowerCase(); }
function progressUrl(clientLabel, targetId) {
  const params = new URLSearchParams();
  if (clientLabel && clientLabel !== "all") { params.set("client", clientLabel); }
  if (targetId) { params.set("target", targetId); }
  const query = params.toString();
  return "/progress.html" + (query ? "?" + query : "");
}

function syncProgressLinks() {
  byId("selected-client-progress").href = progressUrl(byId("client-select").value);
  byId("client-progress-link").href = progressUrl(byId("history-client-filter").value);
}

// ---------- Accessible home sections ----------

const SECTION_NAMES = ["start", "sessions", "goals", "settings"];

function activateSection(name, options) {
  const settings = options || {};
  if (!SECTION_NAMES.includes(name)) { name = "start"; }
  document.querySelectorAll(".home-tab").forEach(function (tab) {
    const selected = tab.dataset.section === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll(".home-panel").forEach(function (panel) {
    panel.classList.toggle("hidden", panel.dataset.panel !== name);
  });
  sessionStorage.setItem("dataTaker.homeSection", name);
  if (settings.updateHash !== false && window.location.hash !== "#" + name) {
    history.replaceState(null, "", "#" + name);
  }
  if (settings.focus) {
    const heading = document.querySelector('[data-panel="' + name + '"] .panel-title');
    if (heading) { heading.focus(); }
  }
  if (name === "sessions") { loadPastSessions(); }
  if (name === "goals") { renderGoalManager(); }
  if (name === "settings") { loadSettings(); }
}

function initialSection() {
  const hash = window.location.hash.slice(1);
  if (SECTION_NAMES.includes(hash)) { return hash; }
  const saved = sessionStorage.getItem("dataTaker.homeSection");
  return SECTION_NAMES.includes(saved) ? saved : "start";
}

document.querySelectorAll(".home-tab").forEach(function (tab, index, tabs) {
  tab.addEventListener("click", function () {
    activateSection(tab.dataset.section, { focus: true });
  });
  tab.addEventListener("keydown", function (event) {
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") { next = (index + 1) % tabs.length; }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { next = (index - 1 + tabs.length) % tabs.length; }
    if (event.key === "Home") { next = 0; }
    if (event.key === "End") { next = tabs.length - 1; }
    if (next === null) { return; }
    event.preventDefault();
    tabs[next].focus();
    activateSection(tabs[next].dataset.section, { focus: false });
  });
});
window.addEventListener("hashchange", function () {
  const name = window.location.hash.slice(1);
  if (SECTION_NAMES.includes(name)) { activateSection(name, { updateHash: false, focus: true }); }
});

// ---------- Inline confirmation dialog ----------

function confirmAction(title, message, confirmLabel, danger) {
  const dialog = byId("confirm-dialog");
  byId("confirm-dialog-title").textContent = title;
  byId("confirm-dialog-message").textContent = message;
  const accept = byId("confirm-dialog-accept");
  accept.textContent = confirmLabel || "Confirm";
  accept.classList.toggle("danger-confirm", Boolean(danger));
  dialog.returnValue = "";
  return new Promise(function (resolve) {
    function closed() {
      dialog.removeEventListener("close", closed);
      resolve(dialog.returnValue === "confirm");
    }
    dialog.addEventListener("close", closed);
    dialog.showModal();
  });
}

// ---------- Clients and active-session recovery ----------

function loadClients() {
  const clients = DataTaker.getClients();
  const select = byId("client-select");
  const filter = byId("history-client-filter");
  const previous = select.value || sessionStorage.getItem("dataTaker.selectedClient") || "";
  select.innerHTML = "";
  if (!clients.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "— add a client below —";
    select.appendChild(option);
  }
  clients.forEach(function (client) {
    const option = document.createElement("option");
    option.value = client.label;
    option.textContent = client.label;
    select.appendChild(option);
  });
  if (clients.some((client) => client.label === previous)) { select.value = previous; }

  const filterPrevious = filter.value || select.value || "all";
  filter.innerHTML = '<option value="all">All clients</option>';
  clients.forEach(function (client) {
    const option = document.createElement("option");
    option.value = client.label;
    option.textContent = client.label;
    filter.appendChild(option);
  });
  filter.value = Array.from(filter.options).some((option) => option.value === filterPrevious)
    ? filterPrevious
    : "all";
  syncProgressLinks();
}

function addClient() {
  const input = byId("new-client");
  show("client-error", "");
  if (!input.value.trim()) { return; }
  try {
    const client = DataTaker.addClient(input.value);
    input.value = "";
    loadClients();
    byId("client-select").value = client.label;
    clientChanged();
  } catch (error) {
    show("client-error", error.message);
  }
}

function loadActiveSession() {
  const card = byId("active-session-card");
  const active = DataTaker.getActiveSessions();
  if (!active.length) {
    card.classList.add("hidden");
    return;
  }
  const session = active[0];
  const started = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(session.start_time));
  const additional = active.length > 1
    ? " · " + (active.length - 1) + " other unfinished"
    : "";
  byId("active-session-meta").textContent =
    session.client_label + " · " + started + " · " + session.datapoints.length + " trials" + additional;
  byId("resume-session").href = "/session.html?id=" + encodeURIComponent(session.id);
  card.classList.remove("hidden");
}

function clientChanged() {
  const client = byId("client-select").value;
  sessionStorage.setItem("dataTaker.selectedClient", client);
  if (client && Array.from(byId("history-client-filter").options).some((option) => option.value === client)) {
    byId("history-client-filter").value = client;
  }
  syncProgressLinks();
  loadRepeatSession();
  loadRecentTargetSets();
  loadPastSessions();
}

// ---------- Fast target selection ----------

function configuredTargets() {
  return Object.values(DataTaker.allTargets()).sort(function (a, b) {
    return [a.domain, a.long_term_goal, a.short_term_goal, a.label].join("\n")
      .localeCompare([b.domain, b.long_term_goal, b.short_term_goal, b.label].join("\n"));
  });
}

function setTargetSelected(target, selected) {
  if (selected) { selectedTargets.set(target.id, target); }
  else { selectedTargets.delete(target.id); }
}

function renderTargetSelection() {
  const tree = byId("goal-tree");
  const availableById = DataTaker.allTargets();
  Array.from(selectedTargets.keys()).forEach(function (id) {
    if (!availableById[id]) { selectedTargets.delete(id); }
  });
  const query = normalized(byId("target-search").value);
  const targets = configuredTargets().filter(function (target) {
    return !query || normalized([
      target.label, target.domain, target.long_term_goal, target.short_term_goal,
    ].join(" ")).includes(query);
  });
  tree.innerHTML = "";
  byId("available-target-count").textContent =
    targets.length + " available target" + (targets.length === 1 ? "" : "s");

  if (!targets.length) {
    tree.innerHTML = '<p class="history-empty">No available targets match this search.</p>';
    updateSelectionSummary();
    return;
  }

  targets.forEach(function (target) {
    const button = document.createElement("button");
    const selected = selectedTargets.has(target.id);
    button.type = "button";
    button.className = "target-chip target-select-row" + (selected ? " selected" : "");
    button.setAttribute("aria-pressed", String(selected));

    const icon = document.createElement("span");
    icon.className = "target-row-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = DataTaker.getTargetIcon(target);
    button.appendChild(icon);

    const copy = document.createElement("span");
    copy.className = "target-row-copy";
    const label = document.createElement("strong");
    label.textContent = target.label;
    const path = document.createElement("small");
    path.textContent = [target.domain, target.long_term_goal, target.short_term_goal].filter(Boolean).join(" › ");
    copy.append(label, path);
    button.appendChild(copy);

    button.addEventListener("click", function () {
      setTargetSelected(target, !selectedTargets.has(target.id));
      renderTargetSelection();
      renderSelectedTray();
    });
    tree.appendChild(button);
  });
  updateSelectionSummary();
}

function renderSelectedTray() {
  const tray = byId("selected-target-tray");
  tray.innerHTML = "";
  if (!selectedTargets.size) {
    tray.innerHTML = '<p class="history-empty">No targets selected.</p>';
    updateSelectionSummary();
    return;
  }
  selectedTargets.forEach(function (target) {
    const row = document.createElement("div");
    row.className = "selected-target";
    const label = document.createElement("span");
    label.textContent = targetDisplay(target);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-secondary selected-remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + target.label);
    remove.addEventListener("click", function () {
      selectedTargets.delete(target.id);
      renderTargetSelection();
      renderSelectedTray();
    });
    row.append(label, remove);
    tray.appendChild(row);
  });
  updateSelectionSummary();
}

function updateSelectionSummary() {
  const count = selectedTargets.size;
  byId("selected-target-count").textContent = count + " selected";
  byId("selection-summary").textContent = count
    ? count + " target" + (count === 1 ? "" : "s") + " ready to review and start."
    : "No targets selected yet.";
  byId("start-session").disabled = count === 0;
  byId("clear-targets").disabled = count === 0;
}

function applyTargetSet(items, statusId) {
  const available = items.filter((item) => item.status === "available");
  const unavailable = items.filter((item) => item.status !== "available");
  available.forEach(function (item) {
    const target = DataTaker.allTargets()[item.id];
    if (target) { selectedTargets.set(item.id, target); }
  });
  renderTargetSelection();
  renderSelectedTray();
  const messages = [];
  if (available.length) {
    messages.push(available.length + " available target" + (available.length === 1 ? "" : "s") + " selected.");
  }
  if (unavailable.length) {
    messages.push(unavailable.map(function (item) {
      return item.label + " is " + (item.status === "archived" ? "archived" : "no longer available") + ".";
    }).join(" "));
  }
  show(statusId, messages.join(" "));
}

function loadRepeatSession() {
  const card = byId("repeat-session-card");
  const repeat = DataTaker.getRepeatLastSession(byId("client-select").value);
  if (!repeat) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(repeat.ended_at));
  byId("repeat-session-meta").textContent =
    repeat.targets.length + " target" + (repeat.targets.length === 1 ? "" : "s") + " · " + date;
  byId("repeat-last-session").onclick = function () {
    applyTargetSet(repeat.targets, "repeat-session-status");
  };
}

function loadRecentTargetSets() {
  const card = byId("recent-sets-card");
  const list = byId("recent-target-sets");
  const sets = DataTaker.getRecentTargetSets(byId("client-select").value);
  list.innerHTML = "";
  if (!sets.length) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  sets.slice(0, 3).forEach(function (set, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-set-button";
    const available = set.targets.filter((item) => item.status === "available").length;
    button.textContent = "Set " + (index + 1) + " · " + available + "/" + set.targets.length + " available";
    button.addEventListener("click", function () {
      applyTargetSet(set.targets, "repeat-session-status");
    });
    list.appendChild(button);
  });
}

async function startSession() {
  show("start-error", "");
  const clientLabel = byId("client-select").value;
  if (!clientLabel) {
    show("start-error", "Choose or add an anonymized client label.");
    byId("client-select").focus();
    return;
  }
  if (!selectedTargets.size) { return; }
  const active = DataTaker.getActiveSessions();
  if (active.length) {
    const proceed = await confirmAction(
      "Start another session?",
      "An unfinished session already exists. Resume it when possible to avoid duplicate session records. Start a separate session anyway?",
      "Start another",
      true
    );
    if (!proceed) { return; }
  }
  try {
    const session = DataTaker.startSession(clientLabel, Array.from(selectedTargets.keys()));
    window.location.href = "/session.html?id=" + encodeURIComponent(session.id);
  } catch (error) {
    show("start-error", error.message);
  }
}

// ---------- Session history ----------

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const pad = function (value) { return String(value).padStart(2, "0"); };
  return pad(Math.floor(seconds / 3600)) + ":" +
    pad(Math.floor((seconds % 3600) / 60)) + ":" + pad(Math.floor(seconds % 60));
}
function formatSessionDate(isoDate) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? "Date unavailable" :
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function accuracyText(result) {
  return result.total ? result.percent + "% · " + result.correct + "/" + result.total + " correct" : "No trials";
}

function historySessions() {
  const client = byId("history-client-filter").value;
  let sessions;
  if (client && client !== "all") {
    sessions = DataTaker.getPastSessions(client);
  } else {
    sessions = DataTaker.getEndedSessions();
  }
  const query = normalized(byId("history-search").value);
  if (query) {
    sessions = sessions.filter(function (session) {
      return normalized([
        session.client_label,
        formatSessionDate(session.end_time),
        ...session.targets.map((target) => [target.label, target.domain, target.short_term_goal].join(" ")),
      ].join(" ")).includes(query);
    });
  }
  const direction = byId("history-sort").value === "oldest" ? 1 : -1;
  return sessions.sort((a, b) => direction *
    (new Date(a.end_time).getTime() - new Date(b.end_time).getTime()));
}

function loadPastSessions() {
  const list = byId("past-sessions");
  const sessions = historySessions();
  list.innerHTML = "";
  byId("past-session-count").textContent = sessions.length + " ended";
  if (!sessions.length) {
    list.innerHTML = '<p class="history-empty">No ended sessions match these filters.</p>';
    return;
  }
  sessions.forEach(function (session) {
    const item = document.createElement("details");
    item.className = "history-item";
    const summary = document.createElement("summary");
    summary.innerHTML =
      '<span class="history-summary-main"></span>' +
      '<span class="history-summary-metrics"></span>';
    summary.querySelector(".history-summary-main").textContent =
      formatSessionDate(session.end_time) + " · " + session.client_label;
    summary.querySelector(".history-summary-metrics").textContent =
      formatDuration(session.duration_seconds) + " · " + session.overall.total + " trials · " +
      accuracyText(session.overall);
    item.appendChild(summary);

    const targets = document.createElement("ul");
    targets.className = "history-targets";
    session.targets.forEach(function (target) {
      const row = document.createElement("li");
      const info = document.createElement("span");
      info.className = "history-target-info";
      const name = document.createElement("a");
      name.className = "history-target-name";
      name.textContent = targetDisplay(target);
      name.href = progressUrl(session.client_label, target.id);
      const path = document.createElement("span");
      path.className = "history-target-path";
      path.textContent = [target.domain, target.short_term_goal].filter(Boolean).join(" · ");
      info.append(name, path);
      const accuracy = document.createElement("span");
      accuracy.className = "history-target-accuracy";
      accuracy.textContent = accuracyText(target);
      row.append(info, accuracy);
      targets.appendChild(row);
    });
    item.appendChild(targets);

    const actions = document.createElement("div");
    actions.className = "history-actions";
    const review = document.createElement("a");
    review.className = "history-review-link";
    review.href = "/review.html?id=" + encodeURIComponent(session.id);
    review.textContent = "Review";
    const objective = document.createElement("a");
    objective.className = "history-review-link";
    objective.href = "/review.html?id=" + encodeURIComponent(session.id) + "#objective";
    objective.textContent = "Objective";
    const progress = document.createElement("a");
    progress.className = "history-review-link";
    progress.href = progressUrl(session.client_label, session.targets[0] && session.targets[0].id);
    progress.textContent = "Progress";
    actions.append(review, progress, objective);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

// ---------- Goal manager ----------

function goalMatches(query, parts) {
  return !query || normalized(parts.join(" ")).includes(query);
}

function preserveGoalGroup(details, id, forceOpen) {
  details.open = Boolean(forceOpen || openGoalGroups.has(id));
  details.addEventListener("toggle", function () {
    if (details.open) { openGoalGroups.add(id); }
    else { openGoalGroups.delete(id); }
  });
}

function makeActionButton(label, action, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "goal-action";
  button.textContent = label;
  button.disabled = Boolean(disabled);
  button.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    action(event);
  });
  return button;
}

function beginRename(type, node, row) {
  if (row.querySelector(".rename-form")) { return; }
  const form = document.createElement("form");
  form.className = "rename-form";
  const input = document.createElement("input");
  input.className = "field";
  input.value = type === "domain" ? node.name : node.label;
  input.setAttribute("aria-label", "New label");
  const save = document.createElement("button");
  save.className = "btn-secondary";
  save.type = "submit";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.className = "btn-secondary";
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", function () { form.remove(); });
  form.append(input, save, cancel);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    try {
      DataTaker.renameGoalNode(type, node.id, input.value);
      renderGoalManager();
      renderTargetSelection();
      renderSelectedTray();
    } catch (error) { show("goal-editor-error", error.message); }
  });
  row.after(form);
  input.focus();
  input.select();
}

async function deleteGoal(type, node) {
  const description = DataTaker.describeGoalNode(type, node.id);
  const nested = [];
  if (description.ltgs) { nested.push(description.ltgs + " long-term goal" + (description.ltgs === 1 ? "" : "s")); }
  if (description.stgs) { nested.push(description.stgs + " short-term goal" + (description.stgs === 1 ? "" : "s")); }
  if (description.targets) { nested.push(description.targets + " target" + (description.targets === 1 ? "" : "s")); }
  const confirmed = await confirmAction(
    "Permanently delete " + description.label + "?",
    "This permanently deletes " + description.label + (nested.length ? " and " + nested.join(", ") : "") +
      ". Completed sessions keep their original snapshots. This cannot be undone.",
    "Permanently delete",
    true
  );
  if (!confirmed) { return; }
  DataTaker.deleteGoalNode(type, node.id);
  selectedTargets.delete(node.id);
  renderGoalManager();
  renderTargetSelection();
  renderSelectedTray();
}

function openIconPicker(target) {
  pendingIconTarget = target;
  byId("icon-dialog-target").textContent = target.label;
  byId("custom-icon").value = DataTaker.getTargetIcon(target);
  byId("icon-dialog").showModal();
}

function nodeRow(type, node, index, total) {
  const row = document.createElement("div");
  row.className = "goal-node-row";
  if (node.archived) { row.classList.add("archived"); }
  if (type === "target") {
    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "target-icon-button";
    icon.textContent = DataTaker.getTargetIcon(node);
    icon.setAttribute("aria-label", "Change icon for " + node.label);
    icon.addEventListener("click", function () { openIconPicker(node); });
    row.appendChild(icon);
  }
  const label = document.createElement("strong");
  label.className = "goal-node-label";
  label.textContent = type === "domain" ? node.name : node.label;
  row.appendChild(label);
  if (node.archived) {
    const badge = document.createElement("span");
    badge.className = "archive-badge";
    badge.textContent = "Archived";
    row.appendChild(badge);
  }
  const actions = document.createElement("div");
  actions.className = "goal-node-actions";
  actions.append(
    makeActionButton("Rename", () => beginRename(type, node, row)),
    makeActionButton("Duplicate", function () {
      DataTaker.duplicateGoalNode(type, node.id);
      renderGoalManager();
    }),
    makeActionButton("Up", function () {
      DataTaker.reorderGoalNode(type, node.id, -1);
      renderGoalManager();
    }, index === 0),
    makeActionButton("Down", function () {
      DataTaker.reorderGoalNode(type, node.id, 1);
      renderGoalManager();
    }, index === total - 1),
    makeActionButton(node.archived ? "Restore" : "Archive", function () {
      DataTaker.setGoalArchived(type, node.id, !node.archived);
      selectedTargets.delete(node.id);
      renderGoalManager();
      renderTargetSelection();
      renderSelectedTray();
    }),
    makeActionButton("Delete", () => deleteGoal(type, node))
  );
  row.appendChild(actions);
  return row;
}

function childForm(type, parentIds, placeholder, onAdd) {
  const form = document.createElement("form");
  form.className = "goal-child-form";
  const input = document.createElement("input");
  input.className = "field";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder);
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "btn-secondary";
  button.textContent = "Add";
  form.append(input, button);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!input.value.trim()) { return; }
    try {
      onAdd(input.value.trim(), parentIds);
      renderGoalManager();
      renderTargetSelection();
    } catch (error) { show("goal-editor-error", error.message); }
  });
  return form;
}

function renderGoalManager() {
  const tree = byId("goal-editor-tree");
  const query = normalized(byId("goal-search").value);
  const goals = DataTaker.getGoals();
  tree.innerHTML = "";
  goals.domains.forEach(function (domain, domainIndex) {
    const domainPaths = [];
    domain.long_term_goals.forEach((ltg) => ltg.short_term_goals.forEach((stg) =>
      stg.targets.forEach((target) => domainPaths.push([domain.name, ltg.label, stg.label, target.label].join(" ")))));
    if (!goalMatches(query, [domain.name, ...domainPaths])) { return; }
    const domainEl = document.createElement("details");
    domainEl.className = "goal-group domain-group";
    preserveGoalGroup(domainEl, domain.id, Boolean(query));
    const summary = document.createElement("summary");
    summary.appendChild(nodeRow("domain", domain, domainIndex, goals.domains.length));
    domainEl.appendChild(summary);

    const domainBody = document.createElement("div");
    domainBody.className = "goal-group-body";
    domain.long_term_goals.forEach(function (ltg, ltgIndex) {
      const ltgPaths = [];
      ltg.short_term_goals.forEach((stg) => stg.targets.forEach((target) =>
        ltgPaths.push([domain.name, ltg.label, stg.label, target.label].join(" "))));
      if (!goalMatches(query, [domain.name, ltg.label, ...ltgPaths])) { return; }
      const ltgEl = document.createElement("details");
      ltgEl.className = "goal-group ltg-group";
      preserveGoalGroup(ltgEl, ltg.id, Boolean(query));
      const ltgSummary = document.createElement("summary");
      ltgSummary.appendChild(nodeRow("ltg", ltg, ltgIndex, domain.long_term_goals.length));
      ltgEl.appendChild(ltgSummary);
      const ltgBody = document.createElement("div");
      ltgBody.className = "goal-group-body";

      ltg.short_term_goals.forEach(function (stg, stgIndex) {
        const stgPaths = stg.targets.map((target) =>
          [domain.name, ltg.label, stg.label, target.label].join(" "));
        if (!goalMatches(query, [domain.name, ltg.label, stg.label, ...stgPaths])) { return; }
        const stgEl = document.createElement("details");
        stgEl.className = "goal-group stg-group";
        preserveGoalGroup(stgEl, stg.id, Boolean(query));
        const stgSummary = document.createElement("summary");
        stgSummary.appendChild(nodeRow("stg", stg, stgIndex, ltg.short_term_goals.length));
        stgEl.appendChild(stgSummary);
        const targetList = document.createElement("div");
        targetList.className = "target-manager-list";
        stg.targets.forEach(function (target, targetIndex) {
          if (!goalMatches(query, [domain.name, ltg.label, stg.label, target.label])) { return; }
          const targetRow = nodeRow("target", target, targetIndex, stg.targets.length);
          targetRow.classList.add("target-chip-edit");
          targetList.appendChild(targetRow);
        });
        targetList.appendChild(childForm("target", [domain.id, ltg.id, stg.id], "New target", function (label) {
          DataTaker.addTarget(domain.id, ltg.id, stg.id, label);
        }));
        stgEl.appendChild(targetList);
        ltgBody.appendChild(stgEl);
      });
      ltgBody.appendChild(childForm("stg", [domain.id, ltg.id], "New short-term goal", function (label) {
        DataTaker.addShortTermGoal(domain.id, ltg.id, label);
      }));
      ltgEl.appendChild(ltgBody);
      domainBody.appendChild(ltgEl);
    });
    domainBody.appendChild(childForm("ltg", [domain.id], "New long-term goal", function (label) {
      DataTaker.addLongTermGoal(domain.id, label);
    }));
    domainEl.appendChild(domainBody);
    tree.appendChild(domainEl);
  });
  if (!tree.children.length) {
    tree.innerHTML = '<p class="history-empty">No goals match this search.</p>';
  }
}

// ---------- Cue management ----------

function loadCues() {
  const cues = DataTaker.getCues();
  const list = byId("cue-editor-list");
  byId("cue-summary").textContent = cues.length + " cue type" + (cues.length === 1 ? "" : "s") + " available.";
  list.innerHTML = "";
  if (!cues.length) {
    list.innerHTML = '<p class="history-empty">No cues configured. Trials can still be recorded independently.</p>';
    return;
  }
  cues.forEach(function (cue) {
    const row = document.createElement("div");
    row.className = "cue-editor-row";
    const input = document.createElement("input");
    input.className = "field";
    input.value = cue.label;
    input.maxLength = 40;
    input.setAttribute("aria-label", "Cue label");
    const save = document.createElement("button");
    save.className = "btn-secondary cue-save";
    save.type = "button";
    save.textContent = "Save";
    save.addEventListener("click", function () {
      try { DataTaker.renameCue(cue.id, input.value); loadCues(); }
      catch (error) { show("cue-editor-error", error.message); }
    });
    const remove = document.createElement("button");
    remove.className = "btn-danger-small";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async function () {
      if (await confirmAction(
        "Delete " + cue.label + "?",
        "Future sessions will no longer offer this cue. Recorded trials keep the original label.",
        "Delete cue",
        true
      )) {
        DataTaker.deleteCue(cue.id);
        loadCues();
      }
    });
    row.append(input, save, remove);
    list.appendChild(row);
  });
}

function addCue() {
  const input = byId("new-cue-label");
  try {
    DataTaker.addCue(input.value);
    input.value = "";
    loadCues();
  } catch (error) { show("cue-editor-error", error.message); }
}

function loadSettings() {
  loadCues();
  const preferences = DataTaker.getPreferences();
  byId("pref-high-contrast").checked = preferences.high_contrast;
  byId("pref-reduce-motion").checked = preferences.reduce_motion;
  const appearanceMode = document.querySelector(
    'input[name="appearance-mode"][value="' + preferences.appearance_mode + '"]'
  );
  const colorTheme = document.querySelector(
    'input[name="color-theme"][value="' + preferences.color_theme + '"]'
  );
  if (appearanceMode) { appearanceMode.checked = true; }
  if (colorTheme) { colorTheme.checked = true; }
  const last = DataTaker.getLastBackupDate();
  byId("last-backup-date").textContent = last
    ? "Last successful backup: " + formatSessionDate(last)
    : "No successful backup recorded in this browser.";
}

function applyPreferences() {
  const appearanceMode = document.querySelector('input[name="appearance-mode"]:checked');
  const colorTheme = document.querySelector('input[name="color-theme"]:checked');
  const preferences = DataTaker.savePreferences({
    high_contrast: byId("pref-high-contrast").checked,
    reduce_motion: byId("pref-reduce-motion").checked,
    appearance_mode: appearanceMode ? appearanceMode.value : "system",
    color_theme: colorTheme ? colorTheme.value : "teal",
  });
  document.documentElement.classList.toggle("user-high-contrast", preferences.high_contrast);
  document.documentElement.classList.toggle("user-reduce-motion", preferences.reduce_motion);
  if (window.DataTakerAppearance) { window.DataTakerAppearance.apply(preferences); }
}

// ---------- Backup and import ----------

function downloadBackup(data, prefix) {
  if (!window.Blob || !window.URL || !URL.createObjectURL) { return false; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = prefix + "-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

function exportData() {
  if (!downloadBackup(DataTaker.exportAll(), "data-taker-backup")) {
    show("backup-status", "Export failed: this browser cannot download files. No backup was created.");
    return;
  }
  DataTaker.markBackupSuccessful();
  show("backup-status", "Backup downloaded.");
  loadSettings();
}

function importFile(file) {
  show("backup-status", "Validating backup…");
  const reader = new FileReader();
  reader.onload = async function () {
    try {
      const data = JSON.parse(reader.result);
      const summary = DataTaker.validateImport(data);
      pendingImport = data;
      const confirmed = await confirmAction(
        "Replace current browser data?",
        "This valid backup contains " + summary.clients + " clients, " + summary.domains +
          " domains, " + summary.cues + " cues, and " + summary.sessions +
          " sessions. Importing replaces the current supported data. A safety backup will download first when supported.",
        "Create safety backup and import",
        true
      );
      if (!confirmed) {
        pendingImport = null;
        show("backup-status", "Import cancelled. Current data was not changed.");
        return;
      }
      downloadBackup(DataTaker.exportAll(), "data-taker-safety-backup");
      DataTaker.importAll(pendingImport);
      pendingImport = null;
      DataTaker.markBackupSuccessful();
      selectedTargets.clear();
      refreshAll();
      show("backup-status", "Backup imported successfully.");
      activateSection("settings", { focus: false });
    } catch (error) {
      pendingImport = null;
      show("backup-status", "Import failed: " + error.message + " Current data was not changed.");
    } finally {
      byId("import-data").value = "";
    }
  };
  reader.onerror = function () {
    show("backup-status", "Import failed: the file could not be read. Current data was not changed.");
    byId("import-data").value = "";
  };
  reader.readAsText(file);
}

// ---------- Wiring and initialization ----------

function refreshAll() {
  loadClients();
  loadActiveSession();
  renderTargetSelection();
  renderSelectedTray();
  loadRepeatSession();
  loadRecentTargetSets();
  loadPastSessions();
  renderGoalManager();
  loadSettings();
  applyPreferences();
}

byId("add-client").addEventListener("click", addClient);
byId("new-client").addEventListener("keydown", (event) => { if (event.key === "Enter") { addClient(); } });
byId("client-select").addEventListener("change", clientChanged);
byId("target-search").addEventListener("input", renderTargetSelection);
byId("clear-targets").addEventListener("click", function () {
  selectedTargets.clear();
  renderTargetSelection();
  renderSelectedTray();
});
byId("start-session").addEventListener("click", startSession);
byId("history-client-filter").addEventListener("change", function () {
  syncProgressLinks();
  loadPastSessions();
});
byId("history-sort").addEventListener("change", loadPastSessions);
byId("history-search").addEventListener("input", loadPastSessions);
byId("goal-search").addEventListener("input", renderGoalManager);
byId("add-domain-form").addEventListener("submit", function (event) {
  event.preventDefault();
  const input = byId("new-domain-name");
  if (!input.value.trim()) { return; }
  DataTaker.addDomain(input.value.trim());
  input.value = "";
  renderGoalManager();
  renderTargetSelection();
});
byId("toggle-edit-cues").addEventListener("click", function () {
  const editor = byId("cue-editor");
  const opening = editor.classList.contains("hidden");
  editor.classList.toggle("hidden");
  byId("toggle-edit-cues").textContent = opening ? "Done" : "Manage cues";
  byId("toggle-edit-cues").setAttribute("aria-expanded", String(opening));
  if (opening) { loadCues(); }
});
byId("add-cue").addEventListener("click", addCue);
byId("new-cue-label").addEventListener("keydown", (event) => { if (event.key === "Enter") { addCue(); } });
byId("export-data").addEventListener("click", exportData);
byId("import-data").addEventListener("change", function (event) {
  if (event.target.files && event.target.files[0]) { importFile(event.target.files[0]); }
});
byId("pref-high-contrast").addEventListener("change", applyPreferences);
byId("pref-reduce-motion").addEventListener("change", applyPreferences);
document.querySelectorAll('input[name="appearance-mode"], input[name="color-theme"]').forEach(function (input) {
  input.addEventListener("change", function () {
    applyPreferences();
    show("appearance-status", "Appearance saved for this browser.");
  });
});

const iconChoices = ["🎯", "🗣️", "💬", "👂", "🎙️", "🌊", "📖", "✍️", "🧠", "🦷", "👄", "⭐"];
iconChoices.forEach(function (choice) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-option";
  button.textContent = choice;
  button.setAttribute("aria-label", "Use " + choice);
  button.addEventListener("click", function () {
    byId("custom-icon").value = choice;
  });
  byId("icon-options").appendChild(button);
});
byId("save-icon").addEventListener("click", function () {
  if (!pendingIconTarget) { return; }
  DataTaker.setTargetIcon(pendingIconTarget.id, byId("custom-icon").value);
  byId("icon-dialog").close();
  pendingIconTarget = null;
  renderGoalManager();
  renderTargetSelection();
  renderSelectedTray();
});
byId("use-auto-icon").addEventListener("click", function () {
  if (!pendingIconTarget) { return; }
  DataTaker.setTargetIcon(pendingIconTarget.id, "");
  byId("icon-dialog").close();
  pendingIconTarget = null;
  renderGoalManager();
  renderTargetSelection();
  renderSelectedTray();
});

activateSection(initialSection(), { updateHash: true, focus: false });
refreshAll();
