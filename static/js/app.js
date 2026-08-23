// Live session screen: timer, target carousel, tap entry, dashboard, undo.

const sessionId = new URLSearchParams(window.location.search).get("id");

let state = null;          // latest session view (from DataTaker, backed by localStorage)
let activeIndex = 0;       // which target is showing in the carousel
let armedCues = new Set(); // cueing levels armed for the next tap(s)
let timerHandle = null;

function activeTarget() {
  if (!state || !state.targets.length) { return null; }
  if (activeIndex >= state.targets.length) { activeIndex = 0; }
  return state.targets[activeIndex];
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

// ---------- Carousel ----------

function renderCarousel() {
  const target = activeTarget();
  const track = document.getElementById("carousel-track");
  if (!target) {
    track.innerHTML = '<div class="carousel-target-label">No targets</div>';
    return;
  }
  track.innerHTML =
    '<div class="carousel-target-label"></div>' +
    '<div class="carousel-target-path"></div>';
  track.querySelector(".carousel-target-label").textContent = target.label;
  track.querySelector(".carousel-target-path").textContent =
    target.domain + " · " + target.short_term_goal;

  const dots = document.getElementById("carousel-dots");
  dots.innerHTML = "";
  state.targets.forEach(function (_t, i) {
    const dot = document.createElement("span");
    dot.className = "dot" + (i === activeIndex ? " active" : "");
    dots.appendChild(dot);
  });
}

function moveCarousel(delta) {
  if (!state || !state.targets.length) { return; }
  activeIndex = (activeIndex + delta + state.targets.length) % state.targets.length;
  renderCarousel();
  renderDashboard();
}

// ---------- Dashboard ----------

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

// ---------- Recent log ----------

function targetLabelById(id) {
  const t = state.targets.find(function (x) { return x.id === id; });
  return t ? t.label : id;
}

function renderRecent() {
  const log = document.getElementById("recent-log");
  log.innerHTML = "";
  const recent = state.datapoints.slice(-5).reverse();
  recent.forEach(function (dp) {
    const li = document.createElement("li");
    li.className = "recent-item";

    const badge = document.createElement("span");
    badge.className = "recent-badge " + (dp.result === "+" ? "correct" : "incorrect");
    badge.textContent = dp.result === "+" ? "+" : "−";
    li.appendChild(badge);

    const main = document.createElement("div");
    main.className = "recent-main";
    const tgt = document.createElement("div");
    tgt.className = "recent-target";
    tgt.textContent = targetLabelById(dp.target_id);
    main.appendChild(tgt);
    const cues = document.createElement("div");
    cues.className = "recent-cues";
    cues.textContent = dp.prompt_levels.length ? dp.prompt_levels.join(", ") : "independent";
    main.appendChild(cues);
    li.appendChild(main);

    const undo = document.createElement("button");
    undo.className = "recent-undo";
    undo.type = "button";
    undo.innerHTML = "&times;";
    undo.title = "Undo this trial";
    undo.addEventListener("click", function () { deleteDatapoint(dp.id); });
    li.appendChild(undo);

    log.appendChild(li);
  });
}

// ---------- Rendering glue ----------

function renderAll() {
  document.getElementById("client-label").textContent = state.client_label;
  renderCarousel();
  renderDashboard();
  renderRecent();
  tickTimer();

  if (state.end_time) {
    showEnded();
  }
}

function applyState(newState) {
  state = newState;
  renderAll();
}

// ---------- Actions ----------

function recordTap(result) {
  const target = activeTarget();
  if (!target || (state && state.end_time)) { return; }
  try {
    const updated = DataTaker.addDatapoint(sessionId, target.id, result, Array.from(armedCues));
    applyState(updated);
  } catch (e) {
    alert(e.message);
  }
}

function deleteDatapoint(dpId) {
  try {
    const updated = DataTaker.deleteDatapoint(sessionId, dpId);
    applyState(updated);
  } catch (e) {
    alert(e.message);
  }
}

function endSession() {
  if (!confirm("End this session? You won't be able to add more data.")) { return; }
  try {
    const updated = DataTaker.endSession(sessionId);
    applyState(updated);
  } catch (e) {
    alert(e.message);
  }
}

function showEnded() {
  document.getElementById("tap-correct").disabled = true;
  document.getElementById("tap-incorrect").disabled = true;
  document.getElementById("end-session").disabled = true;
  const banner = document.getElementById("ended-banner");
  banner.classList.remove("hidden");
  if (state.duration_seconds != null) {
    document.getElementById("final-duration").textContent =
      formatDuration(state.duration_seconds);
  }
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

// ---------- Cue toggles ----------

function renderCueToggles() {
  const container = document.getElementById("cue-toggles");
  const cues = DataTaker.getCues();
  container.innerHTML = "";

  if (!cues.length) {
    const empty = document.createElement("p");
    empty.className = "cues-empty";
    empty.textContent = "No cue types configured · trials will be recorded independently";
    container.appendChild(empty);
    return;
  }

  cues.forEach(function (cueType) {
    const btn = document.createElement("button");
    btn.className = "cue";
    btn.type = "button";
    btn.dataset.cue = cueType.label;
    btn.textContent = cueType.label;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", function () {
      const cue = btn.dataset.cue;
      if (armedCues.has(cue)) {
        armedCues.delete(cue);
        btn.classList.remove("active");
        btn.setAttribute("aria-pressed", "false");
      } else {
        armedCues.add(cue);
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }
    });
    container.appendChild(btn);
  });
}

// ---------- Wire up ----------

document.getElementById("tap-correct").addEventListener("click", function () { recordTap("+"); });
document.getElementById("tap-incorrect").addEventListener("click", function () { recordTap("-"); });
document.getElementById("prev-target").addEventListener("click", function () { moveCarousel(-1); });
document.getElementById("next-target").addEventListener("click", function () { moveCarousel(1); });
document.getElementById("end-session").addEventListener("click", endSession);

// Swipe support on the carousel track.
(function () {
  const track = document.getElementById("carousel-track");
  let startX = null;
  track.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener("touchend", function (e) {
    if (startX === null) { return; }
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) { moveCarousel(dx < 0 ? 1 : -1); }
    startX = null;
  }, { passive: true });
})();

function init() {
  if (!sessionId) {
    alert("No session specified.");
    window.location.href = "/";
    return;
  }
  try {
    renderCueToggles();
    const data = DataTaker.getSession(sessionId);
    applyState(data);
    timerHandle = setInterval(tickTimer, 1000);
  } catch (e) {
    alert("Could not load session: " + e.message);
    window.location.href = "/";
  }
}

init();
