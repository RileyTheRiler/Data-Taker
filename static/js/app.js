// Live session screen: resilient session recovery, target navigation, cueing, data entry, and undo.

const sessionId = new URLSearchParams(window.location.search).get("id");

let state = null;
let activeIndex = 0;
let armedCues = new Set();
let timerHandle = null;
let feedbackHandle = null;
let lastDatapointId = null;

const SUPPORT_LEVELS = new Set(["max", "maximum", "mod", "moderate", "min", "minimal"]);

function activeTarget() {
  if (!state || !state.targets.length) { return null; }
  if (activeIndex >= state.targets.length) { activeIndex = 0; }
  return state.targets[activeIndex];
}

function targetDisplayLabel(target) {
  return typeof DataTaker.getTargetDisplayLabel === "function"
    ? DataTaker.getTargetDisplayLabel(target)
    : target.label;
}

function scrollActiveTargetIntoView() {
  const strip = document.getElementById("carousel-dots");
  const button = strip.querySelector(".target-tab.active");
  if (!button) { return; }
  const left = Math.max(0, button.offsetLeft - (strip.clientWidth - button.clientWidth) / 2);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  strip.scrollTo({ left: left, behavior: reducedMotion ? "auto" : "smooth" });
}

function isSupportLevel(label) {
  return SUPPORT_LEVELS.has(String(label || "").trim().toLowerCase());
}

function cueDisplayLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized === "max") { return "Maximum"; }
  if (normalized === "mod") { return "Moderate"; }
  if (normalized === "min") { return "Minimal"; }
  return label;
}

function configuredCueLabels() {
  return new Set(DataTaker.getCues().map(function (cue) { return cue.label; }));
}

function persistSessionUi() {
  if (!sessionId || !state || state.end_time) { return; }
  const target = activeTarget();
  DataTaker.saveSessionUi(sessionId, {
    active_target_id: target ? target.id : null,
    armed_cues: Array.from(armedCues),
    hold_cues: document.getElementById("hold-cues").checked,
  });
}

// ---------- Timer ----------

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function tickTimer() {
  if (!state) { return; }
  const start = new Date(state.start_time).getTime();
  const end = state.end_time ? new Date(state.end_time).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  document.getElementById("timer").textContent = formatDuration(seconds);
}

// ---------- Target navigation ----------

function renderCarousel() {
  const target = activeTarget();
  const track = document.getElementById("carousel-track");
  const strip = document.getElementById("carousel-dots");
  strip.innerHTML = "";

  if (!target) {
    track.innerHTML = '<div class="carousel-target-label">No targets</div>';
    return;
  }

  track.innerHTML =
    '<div class="carousel-target-label"></div>' +
    '<div class="carousel-target-path"></div>';
  track.querySelector(".carousel-target-label").textContent = targetDisplayLabel(target);
  track.querySelector(".carousel-target-path").textContent =
    [target.domain, target.short_term_goal].filter(Boolean).join(" · ");

  state.targets.forEach(function (item, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "target-tab" + (index === activeIndex ? " active" : "");
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(index === activeIndex));
    button.setAttribute("aria-label",
      targetDisplayLabel(item) + ", " + item.total + " trial" + (item.total === 1 ? "" : "s"));
    button.textContent = targetDisplayLabel(item);
    button.addEventListener("click", function () {
      activeIndex = index;
      renderCarousel();
      renderDashboard();
      renderTargetManager();
      persistSessionUi();
      scrollActiveTargetIntoView();
    });
    strip.appendChild(button);
  });
}

function moveCarousel(delta) {
  if (!state || !state.targets.length) { return; }
  activeIndex = (activeIndex + delta + state.targets.length) % state.targets.length;
  renderCarousel();
  renderDashboard();
  renderTargetManager();
  persistSessionUi();
  scrollActiveTargetIntoView();
}

// ---------- Mid-session target management ----------

function showTargetManagerStatus(message, isError) {
  const status = document.getElementById("target-manager-status");
  status.textContent = message || "";
  status.classList.toggle("success", Boolean(message) && !isError);
}

function renderTargetManager() {
  const target = activeTarget();
  const toggle = document.getElementById("toggle-target-manager");
  const panel = document.getElementById("target-manager");
  const editInput = document.getElementById("edit-target-label");
  const select = document.getElementById("available-targets");
  const addButton = document.getElementById("add-session-target");
  const ended = Boolean(state && state.end_time);

  toggle.disabled = ended || !target;
  if (ended) {
    panel.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
    return;
  }

  editInput.value = target ? target.label : "";
  select.innerHTML = "";
  const included = new Set(state.target_ids);
  const available = Object.values(DataTaker.allTargets()).filter(function (item) {
    return !included.has(item.id);
  });
  if (!available.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "All configured targets are included";
    select.appendChild(option);
    addButton.disabled = true;
  } else {
    available.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = targetDisplayLabel(item) + (item.domain ? " · " + item.domain : "");
      select.appendChild(option);
    });
    addButton.disabled = false;
  }
}

function setTargetManager(open) {
  const panel = document.getElementById("target-manager");
  const toggle = document.getElementById("toggle-target-manager");
  panel.classList.toggle("hidden", !open);
  toggle.setAttribute("aria-expanded", String(open));
  showTargetManagerStatus("", false);
  if (open) {
    renderTargetManager();
    document.getElementById("edit-target-label").focus();
  }
}

function saveTargetLabel() {
  const target = activeTarget();
  if (!target) { return; }
  try {
    const updated = DataTaker.renameSessionTarget(
      sessionId,
      target.id,
      document.getElementById("edit-target-label").value
    );
    applyState(updated);
    showTargetManagerStatus("Target label saved.", false);
  } catch (error) {
    showTargetManagerStatus(error.message, true);
  }
}

function addTargetToSession() {
  const select = document.getElementById("available-targets");
  if (!select.value) { return; }
  try {
    const targetId = select.value;
    const updated = DataTaker.addSessionTarget(sessionId, targetId);
    activeIndex = updated.targets.findIndex(function (target) { return target.id === targetId; });
    applyState(updated);
    persistSessionUi();
    showTargetManagerStatus("Target added to this session.", false);
  } catch (error) {
    showTargetManagerStatus(error.message, true);
  }
}

// ---------- Dashboard and recent entries ----------

function renderDashboard() {
  const target = activeTarget();
  if (target) {
    document.getElementById("target-accuracy").textContent = target.percent + "%";
    document.getElementById("target-count").textContent =
      target.total + " trial" + (target.total === 1 ? "" : "s");
  }
  document.getElementById("overall-accuracy").textContent = state.overall.percent + "%";
  document.getElementById("overall-count").textContent =
    state.overall.total + " trial" + (state.overall.total === 1 ? "" : "s");
}

function targetLabelById(id) {
  const target = state.targets.find(function (item) { return item.id === id; });
  return target ? targetDisplayLabel(target) : id;
}

function renderRecent() {
  const log = document.getElementById("recent-log");
  log.innerHTML = "";
  const recent = state.datapoints.slice(-5).reverse();

  if (!recent.length) {
    const empty = document.createElement("li");
    empty.className = "recent-empty";
    empty.textContent = "Recorded trials will appear here.";
    log.appendChild(empty);
    return;
  }

  recent.forEach(function (datapoint) {
    const item = document.createElement("li");
    item.className = "recent-item";

    const badge = document.createElement("span");
    badge.className = "recent-badge " + (datapoint.result === "+" ? "correct" : "incorrect");
    badge.textContent = datapoint.result === "+" ? "+" : "−";
    item.appendChild(badge);

    const main = document.createElement("div");
    main.className = "recent-main";
    const target = document.createElement("div");
    target.className = "recent-target";
    target.textContent = targetLabelById(datapoint.target_id);
    main.appendChild(target);
    const cues = document.createElement("div");
    cues.className = "recent-cues";
    cues.textContent = datapoint.prompt_levels.length ? datapoint.prompt_levels.join(", ") : "Independent";
    main.appendChild(cues);
    item.appendChild(main);

    const undo = document.createElement("button");
    undo.className = "recent-undo";
    undo.type = "button";
    undo.textContent = "Undo";
    undo.setAttribute("aria-label", "Undo " +
      (datapoint.result === "+" ? "correct" : "incorrect") + " trial for " + targetLabelById(datapoint.target_id));
    undo.addEventListener("click", function () { deleteDatapoint(datapoint.id); });
    item.appendChild(undo);
    log.appendChild(item);
  });
}

function renderAll() {
  document.getElementById("client-label").textContent = state.client_label;
  renderCarousel();
  renderDashboard();
  renderTargetManager();
  renderRecent();
  tickTimer();
  if (state.end_time) { showEnded(); }
}

function applyState(newState) {
  state = newState;
  renderAll();
}

// ---------- Cue model ----------

function selectedSupportLevel() {
  return DataTaker.getCues().find(function (cue) {
    return isSupportLevel(cue.label) && armedCues.has(cue.label);
  }) || null;
}

function updateCueSummary() {
  const summary = document.getElementById("next-trial-summary");
  const labels = Array.from(armedCues);
  const text = labels.length ? labels.map(cueDisplayLabel).join(" + ") : "Independent";
  summary.innerHTML = "";
  summary.append("Next trial: ");
  const strong = document.createElement("strong");
  strong.textContent = text;
  summary.appendChild(strong);
}

function setIndependent() {
  armedCues.clear();
  renderCueToggles();
  persistSessionUi();
}

function chooseSupportLevel(label) {
  DataTaker.getCues().forEach(function (cue) {
    if (isSupportLevel(cue.label)) { armedCues.delete(cue.label); }
  });
  if (label) { armedCues.add(label); }
  renderCueToggles();
  persistSessionUi();
}

function renderCueToggles() {
  const levelContainer = document.getElementById("support-levels");
  const typeContainer = document.getElementById("cue-toggles");
  const cues = DataTaker.getCues();
  const levels = cues.filter(function (cue) { return isSupportLevel(cue.label); });
  const types = cues.filter(function (cue) { return !isSupportLevel(cue.label); });
  const validLabels = new Set(cues.map(function (cue) { return cue.label; }));

  Array.from(armedCues).forEach(function (label) {
    if (!validLabels.has(label)) { armedCues.delete(label); }
  });

  levelContainer.innerHTML = "";
  typeContainer.innerHTML = "";

  const independent = document.createElement("button");
  independent.className = "cue cue-level" + (selectedSupportLevel() ? "" : " active");
  independent.type = "button";
  independent.textContent = "Independent";
  independent.setAttribute("role", "radio");
  independent.setAttribute("aria-checked", String(!selectedSupportLevel()));
  independent.addEventListener("click", setIndependent);
  levelContainer.appendChild(independent);

  levels.forEach(function (cueType) {
    const button = document.createElement("button");
    const active = armedCues.has(cueType.label);
    button.className = "cue cue-level" + (active ? " active" : "");
    button.type = "button";
    button.textContent = cueDisplayLabel(cueType.label);
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(active));
    button.addEventListener("click", function () { chooseSupportLevel(cueType.label); });
    levelContainer.appendChild(button);
  });

  if (!types.length) {
    const empty = document.createElement("p");
    empty.className = "cues-empty";
    empty.textContent = cues.length
      ? "No additional cue types configured."
      : "No cue types configured · trials will be recorded independently.";
    typeContainer.appendChild(empty);
  } else {
    types.forEach(function (cueType) {
      const button = document.createElement("button");
      const active = armedCues.has(cueType.label);
      button.className = "cue" + (active ? " active" : "");
      button.type = "button";
      button.dataset.cue = cueType.label;
      button.textContent = cueType.label;
      button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", function () {
        if (armedCues.has(cueType.label)) {
          armedCues.delete(cueType.label);
        } else {
          armedCues.add(cueType.label);
        }
        renderCueToggles();
        persistSessionUi();
      });
      typeContainer.appendChild(button);
    });
  }

  updateCueSummary();
}

// ---------- Recording, feedback, and lifecycle ----------

function hideFeedback() {
  document.getElementById("trial-feedback").classList.add("hidden");
  if (feedbackHandle) {
    clearTimeout(feedbackHandle);
    feedbackHandle = null;
  }
}

function showFeedback(result, target) {
  const feedback = document.getElementById("trial-feedback");
  const resultLabel = result === "+" ? "Correct" : "Incorrect";
  document.getElementById("trial-feedback-text").textContent =
    resultLabel + " recorded · " + targetDisplayLabel(target);
  feedback.classList.remove("hidden");
  if (feedbackHandle) { clearTimeout(feedbackHandle); }
  feedbackHandle = setTimeout(hideFeedback, 3500);
}

function recordTap(result) {
  const target = activeTarget();
  if (!target || (state && state.end_time)) { return; }
  try {
    const updated = DataTaker.addDatapoint(sessionId, target.id, result, Array.from(armedCues));
    lastDatapointId = updated.datapoints[updated.datapoints.length - 1].id;
    applyState(updated);
    showFeedback(result, target);
    if (!document.getElementById("hold-cues").checked) {
      armedCues.clear();
      renderCueToggles();
      persistSessionUi();
    }
  } catch (error) {
    document.getElementById("trial-feedback-text").textContent = error.message;
    document.getElementById("trial-feedback").classList.remove("hidden");
  }
}

function deleteDatapoint(datapointId) {
  if (!datapointId) { return; }
  try {
    const updated = DataTaker.deleteDatapoint(sessionId, datapointId);
    if (lastDatapointId === datapointId) { lastDatapointId = null; }
    applyState(updated);
    hideFeedback();
  } catch (error) {
    document.getElementById("trial-feedback-text").textContent = error.message;
    document.getElementById("trial-feedback").classList.remove("hidden");
  }
}

function exitSession() {
  if (state && !state.end_time) {
    const leave = confirm("Leave this screen? The session will keep running and can be resumed from the home screen.");
    if (!leave) { return; }
    persistSessionUi();
  }
  window.location.href = "/";
}

function endSession() {
  if (!confirm("End this session? You won't be able to add more data.")) { return; }
  try {
    applyState(DataTaker.endSession(sessionId));
  } catch (error) {
    document.getElementById("trial-feedback-text").textContent = error.message;
    document.getElementById("trial-feedback").classList.remove("hidden");
  }
}

function showEnded() {
  document.getElementById("tap-correct").disabled = true;
  document.getElementById("tap-incorrect").disabled = true;
  document.getElementById("end-session").disabled = true;
  document.getElementById("toggle-target-manager").disabled = true;
  document.getElementById("session-workspace").classList.add("hidden");
  const banner = document.getElementById("ended-banner");
  const wasHidden = banner.classList.contains("hidden");
  banner.classList.remove("hidden");
  if (state.duration_seconds != null) {
    document.getElementById("final-duration").textContent = formatDuration(state.duration_seconds);
  }
  document.getElementById("review-session").href =
    "/review.html?id=" + encodeURIComponent(sessionId);
  const progressParams = new URLSearchParams({ client: state.client_label });
  if (state.targets[0]) { progressParams.set("target", state.targets[0].id); }
  document.getElementById("progress-session").href =
    "/progress.html?" + progressParams.toString();
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  if (wasHidden) { banner.focus(); }
}

// ---------- Events and initialization ----------

document.getElementById("tap-correct").addEventListener("click", function () { recordTap("+"); });
document.getElementById("tap-incorrect").addEventListener("click", function () { recordTap("-"); });
document.getElementById("prev-target").addEventListener("click", function () { moveCarousel(-1); });
document.getElementById("next-target").addEventListener("click", function () { moveCarousel(1); });
document.getElementById("exit-session").addEventListener("click", exitSession);
document.getElementById("end-session").addEventListener("click", endSession);
document.getElementById("clear-cues").addEventListener("click", setIndependent);
document.getElementById("hold-cues").addEventListener("change", persistSessionUi);
document.getElementById("undo-last-trial").addEventListener("click", function () {
  deleteDatapoint(lastDatapointId);
});
document.getElementById("toggle-target-manager").addEventListener("click", function () {
  const panel = document.getElementById("target-manager");
  setTargetManager(panel.classList.contains("hidden"));
});
document.getElementById("close-target-manager").addEventListener("click", function () {
  setTargetManager(false);
});
document.getElementById("save-target-label").addEventListener("click", saveTargetLabel);
document.getElementById("edit-target-label").addEventListener("keydown", function (event) {
  if (event.key === "Enter") { saveTargetLabel(); }
});
document.getElementById("add-session-target").addEventListener("click", addTargetToSession);

(function () {
  const track = document.getElementById("carousel-track");
  let startX = null;
  track.addEventListener("touchstart", function (event) {
    startX = event.touches[0].clientX;
  }, { passive: true });
  track.addEventListener("touchend", function (event) {
    if (startX === null) { return; }
    const dx = event.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) { moveCarousel(dx < 0 ? 1 : -1); }
    startX = null;
  }, { passive: true });
})();

window.addEventListener("pagehide", persistSessionUi);

function init() {
  if (!sessionId) {
    window.location.href = "/";
    return;
  }

  try {
    state = DataTaker.getSession(sessionId);
    const savedUi = DataTaker.getSessionUi(sessionId);
    const savedIndex = state.targets.findIndex(function (target) {
      return target.id === savedUi.active_target_id;
    });
    if (savedIndex >= 0) { activeIndex = savedIndex; }

    const validCues = configuredCueLabels();
    armedCues = new Set(savedUi.armed_cues.filter(function (cue) { return validCues.has(cue); }));
    document.getElementById("hold-cues").checked = savedUi.hold_cues;
    renderCueToggles();
    renderAll();

    if (!state.end_time) {
      persistSessionUi();
      timerHandle = setInterval(tickTimer, 1000);
    }
  } catch (_error) {
    window.location.href = "/";
  }
}

init();
