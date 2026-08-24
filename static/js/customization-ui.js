// Shared UI enhancements for target icons and starter cue restoration.

(function () {
  function currentSessionId() {
    return new URLSearchParams(window.location.search).get("id");
  }

  function currentSessionView() {
    const id = currentSessionId();
    if (!id) { return null; }
    try { return DataTaker.getSession(id); } catch (_error) { return null; }
  }

  function orderedConfiguredTargets() {
    const result = [];
    DataTaker.getGoals().domains.forEach(function (domain) {
      domain.long_term_goals.forEach(function (ltg) {
        ltg.short_term_goals.forEach(function (stg) {
          stg.targets.forEach(function (target) {
            result.push({
              id: target.id,
              label: target.label,
              domain: domain.name,
              long_term_goal: ltg.label,
              short_term_goal: stg.label,
            });
          });
        });
      });
    });
    return result;
  }

  function setTextIfChanged(node, text) {
    if (node && node.textContent !== text) { node.textContent = text; }
  }

  function editTargetIcon(target) {
    const current = DataTaker.getTargetIcon(target);
    const next = window.prompt(
      "Enter an emoji or short icon for this target. Leave blank to use the automatic icon.",
      current
    );
    if (next === null) { return; }
    DataTaker.setTargetIcon(target.id, next);
    decorateAll();
  }

  function decorateGoalTree() {
    const tree = document.getElementById("goal-tree");
    if (!tree) { return; }
    const targets = orderedConfiguredTargets();
    const chips = Array.from(tree.querySelectorAll(".target-chip"));

    chips.forEach(function (chip, index) {
      const target = targets[index];
      if (!target) { return; }
      const icon = DataTaker.getTargetIcon(target);

      if (chip.classList.contains("target-chip-edit")) {
        let button = chip.querySelector(".target-icon-button");
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "target-icon-button";
          button.title = "Change target icon";
          button.setAttribute("aria-label", "Change icon for " + target.label);
          button.addEventListener("click", function (event) {
            event.stopPropagation();
            editTargetIcon(target);
          });
          chip.insertBefore(button, chip.firstChild);
        }
        setTextIfChanged(button, icon);
      } else {
        setTextIfChanged(chip, DataTaker.getTargetDisplayLabel(target));
      }
    });
  }

  function decoratePastSessions() {
    const list = document.getElementById("past-sessions");
    const select = document.getElementById("client-select");
    if (!list || !select || !select.value) { return; }
    const sessions = DataTaker.getPastSessions(select.value);
    const items = Array.from(list.querySelectorAll(".history-item"));
    items.forEach(function (item, sessionIndex) {
      const session = sessions[sessionIndex];
      if (!session) { return; }
      const names = Array.from(item.querySelectorAll(".history-target-name"));
      names.forEach(function (name, targetIndex) {
        const target = session.targets[targetIndex];
        if (target) { setTextIfChanged(name, DataTaker.getTargetDisplayLabel(target)); }
      });
    });
  }

  function decorateSession() {
    const session = currentSessionView();
    if (!session) { return; }

    let target = null;
    try {
      if (typeof activeTarget === "function") { target = activeTarget(); }
    } catch (_error) {
      target = null;
    }
    if (target) {
      setTextIfChanged(
        document.querySelector(".carousel-target-label"),
        DataTaker.getTargetDisplayLabel(target)
      );
    }

    const available = document.getElementById("available-targets");
    if (available) {
      const known = DataTaker.allTargets();
      Array.from(available.options).forEach(function (option) {
        const item = known[option.value];
        if (!item) { return; }
        const text = DataTaker.getTargetDisplayLabel(item) + (item.domain ? " · " + item.domain : "");
        setTextIfChanged(option, text);
      });
    }

    const recentRows = Array.from(document.querySelectorAll(".recent-item .recent-target"));
    const recentData = session.datapoints.slice(-5).reverse();
    recentRows.forEach(function (row, index) {
      const datapoint = recentData[index];
      if (!datapoint) { return; }
      const item = session.targets.find(function (candidate) { return candidate.id === datapoint.target_id; });
      if (item) { setTextIfChanged(row, DataTaker.getTargetDisplayLabel(item)); }
    });

    const restore = document.getElementById("restore-session-cues");
    if (restore) { restore.classList.toggle("hidden", DataTaker.getCues().length > 0); }

    // Defensive fallback: even if an older cached app.js failed to replace the
    // link's placeholder href, this newly versioned script points it at the
    // correct ended session.
    const reviewLink = document.getElementById("review-session");
    if (reviewLink && session.end_time) {
      reviewLink.href = "/review.html?id=" + encodeURIComponent(session.id);
    }
  }

  function decorateReviewAndGraphs() {
    const session = currentSessionView();
    if (!session || !session.end_time) { return; }

    const reviewNames = Array.from(document.querySelectorAll("#review-targets li > span:first-child"));
    reviewNames.forEach(function (name, index) {
      const target = session.targets[index];
      if (target) { setTextIfChanged(name, DataTaker.getTargetDisplayLabel(target)); }
    });

    const chartTargets = session.targets.filter(function (target) { return target.total > 0; });
    const barNames = Array.from(document.querySelectorAll(".target-bar-head > span"));
    barNames.forEach(function (name, index) {
      const target = chartTargets[index];
      if (target) { setTextIfChanged(name, DataTaker.getTargetDisplayLabel(target)); }
    });

    const trendNames = Array.from(document.querySelectorAll(".target-trend-label"));
    trendNames.forEach(function (name, index) {
      const target = chartTargets[index];
      if (target) { setTextIfChanged(name, DataTaker.getTargetDisplayLabel(target)); }
    });
  }

  function restoreStarterCues() {
    DataTaker.restoreStarterCues();
    try {
      if (typeof loadCues === "function") { loadCues(); }
    } catch (_error) { /* setup page only */ }
    try {
      if (typeof renderCueToggles === "function") { renderCueToggles(); }
    } catch (_error) { /* session page only */ }
    decorateAll();
  }

  function bindControls() {
    ["restore-starter-cues", "restore-session-cues"].forEach(function (id) {
      const button = document.getElementById(id);
      if (button && !button.dataset.customizationBound) {
        button.dataset.customizationBound = "true";
        button.addEventListener("click", restoreStarterCues);
      }
    });
  }

  function decorateAll() {
    bindControls();
    decorateGoalTree();
    decoratePastSessions();
    decorateSession();
    decorateReviewAndGraphs();
  }

  decorateAll();

  // The existing screens rebuild sections after client changes, target edits,
  // trial taps, and session end. Re-apply lightweight decoration after those
  // DOM updates while keeping each operation idempotent.
  const observer = new MutationObserver(function () { decorateAll(); });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "client-select") {
      window.setTimeout(decorateAll, 0);
    }
  });
})();
