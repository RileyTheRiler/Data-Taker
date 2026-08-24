// Shared icon decoration for live-session and review screens, plus starter-cue restoration.

(function () {
  function currentSession() {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { return null; }
    try { return DataTaker.getSession(id); } catch (_error) { return null; }
  }

  function setText(node, value) {
    if (node && node.textContent !== value) { node.textContent = value; }
  }

  function decorateSession() {
    const session = currentSession();
    if (!session) { return; }
    let target = null;
    try { if (typeof activeTarget === "function") { target = activeTarget(); } } catch (_error) { target = null; }
    if (target) {
      setText(document.querySelector(".carousel-target-label"), DataTaker.getTargetDisplayLabel(target));
    }

    const available = document.getElementById("available-targets");
    if (available) {
      const known = DataTaker.allTargets();
      Array.from(available.options).forEach(function (option) {
        const item = known[option.value];
        if (item) {
          setText(option, DataTaker.getTargetDisplayLabel(item) + (item.domain ? " · " + item.domain : ""));
        }
      });
    }

    const recentRows = Array.from(document.querySelectorAll(".recent-item .recent-target"));
    const recentData = session.datapoints.slice(-5).reverse();
    recentRows.forEach(function (row, index) {
      const datapoint = recentData[index];
      const item = datapoint && session.targets.find((candidate) => candidate.id === datapoint.target_id);
      if (item) { setText(row, DataTaker.getTargetDisplayLabel(item)); }
    });

    const restore = document.getElementById("restore-session-cues");
    if (restore) { restore.classList.toggle("hidden", DataTaker.getCues().length > 0); }
    const review = document.getElementById("review-session");
    if (review && session.end_time) {
      review.href = "/review.html?id=" + encodeURIComponent(session.id);
    }
  }

  function decorateReview() {
    const session = currentSession();
    if (!session || !session.end_time) { return; }
    Array.from(document.querySelectorAll("#review-targets li > span:first-child")).forEach(function (name, index) {
      if (session.targets[index]) { setText(name, DataTaker.getTargetDisplayLabel(session.targets[index])); }
    });
    const chartTargets = session.targets.filter((target) => target.total > 0);
    Array.from(document.querySelectorAll(".target-bar-head > span")).forEach(function (name, index) {
      if (chartTargets[index]) { setText(name, DataTaker.getTargetDisplayLabel(chartTargets[index])); }
    });
    Array.from(document.querySelectorAll(".target-trend-label")).forEach(function (name, index) {
      if (chartTargets[index]) { setText(name, DataTaker.getTargetDisplayLabel(chartTargets[index])); }
    });
  }

  function restoreStarterCues() {
    DataTaker.restoreStarterCues();
    try { if (typeof loadCues === "function") { loadCues(); } } catch (_error) { /* home only */ }
    try { if (typeof renderCueToggles === "function") { renderCueToggles(); } } catch (_error) { /* session only */ }
    decorate();
  }

  function bindRestoreButtons() {
    ["restore-starter-cues", "restore-session-cues"].forEach(function (id) {
      const button = document.getElementById(id);
      if (button && !button.dataset.customizationBound) {
        button.dataset.customizationBound = "true";
        button.addEventListener("click", restoreStarterCues);
      }
    });
  }

  function decorate() {
    bindRestoreButtons();
    decorateSession();
    decorateReview();
  }

  decorate();
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
})();
