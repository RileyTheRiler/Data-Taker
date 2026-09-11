// First-run onboarding, template picker, compact target browsing, and non-persistent demo.

(function () {
  const VISIBLE_TARGET_LIMIT = 5;
  let showAllTargets = false;
  let demoTrials = [];
  const demoCues = new Set();

  function id(name) { return document.getElementById(name); }

  function libraryIsEmpty() {
    return Object.keys(DataTaker.allTargets()).length === 0;
  }

  function goalLibraryCounts() {
    const counts = { goals: 0, objectives: 0, targets: 0 };
    DataTaker.getGoals().domains.forEach(function (domain) {
      domain.long_term_goals.forEach(function (ltg) {
        counts.goals += 1;
        ltg.short_term_goals.forEach(function (stg) {
          counts.objectives += 1;
          counts.targets += stg.targets.length;
        });
      });
    });
    return counts;
  }

  function refreshHomeGoalManager() {
    const card = id("home-goal-management-card");
    if (!card) { return; }
    const empty = libraryIsEmpty();
    card.classList.toggle("hidden", empty);
    if (empty) { return; }
    const counts = goalLibraryCounts();
    id("home-goal-summary").textContent =
      counts.goals + " goal" + (counts.goals === 1 ? "" : "s") + " · " +
      counts.objectives + " objective" + (counts.objectives === 1 ? "" : "s") + " · " +
      counts.targets + " target" + (counts.targets === 1 ? "" : "s");
  }

  function refreshOnboarding() {
    const empty = libraryIsEmpty();
    id("goal-onboarding-card").classList.toggle("hidden", !empty);
    id("client-card").classList.toggle("hidden", empty);
    id("target-selection-card").classList.toggle("hidden", empty);
    id("session-start-card").classList.toggle("hidden", empty);
    id("goal-empty-note").classList.toggle("hidden", !empty);
    if (empty) {
      id("repeat-session-card").classList.add("hidden");
      id("recent-sets-card").classList.add("hidden");
    }
    refreshHomeGoalManager();
    compactTargetRows();
  }

  function compactTargetRows() {
    const tree = id("goal-tree");
    const toggle = id("toggle-all-targets");
    const rows = Array.from(tree.querySelectorAll(".target-select-row"));
    const searching = Boolean(id("target-search").value.trim());
    const shouldCollapse = !showAllTargets && !searching && rows.length > VISIBLE_TARGET_LIMIT;

    rows.forEach(function (row, index) {
      row.classList.toggle("target-row-collapsed", shouldCollapse && index >= VISIBLE_TARGET_LIMIT);
    });

    toggle.classList.toggle("hidden", searching || rows.length <= VISIBLE_TARGET_LIMIT);
    if (!searching && rows.length > VISIBLE_TARGET_LIMIT) {
      const remaining = rows.length - VISIBLE_TARGET_LIMIT;
      toggle.textContent = showAllTargets
        ? "Show fewer targets"
        : "Show " + remaining + " more target" + (remaining === 1 ? "" : "s");
      toggle.setAttribute("aria-expanded", String(showAllTargets));
    }
  }

  function expandGoalHierarchy(domainIds) {
    if (typeof openGoalGroups === "undefined") { return; }
    const requestedDomains = new Set(domainIds || []);
    const expandAll = requestedDomains.size === 0;
    DataTaker.getGoals().domains.forEach(function (domain) {
      if (!expandAll && !requestedDomains.has(domain.id)) { return; }
      openGoalGroups.add(domain.id);
      domain.long_term_goals.forEach(function (ltg) {
        openGoalGroups.add(ltg.id);
        ltg.short_term_goals.forEach(function (stg) {
          openGoalGroups.add(stg.id);
        });
      });
    });
  }

  function openGoalEditor(domainIds, message) {
    const search = id("goal-search");
    if (search) { search.value = ""; }
    expandGoalHierarchy(domainIds);
    activateSection("goals", { focus: true });
    renderGoalManager();
    const status = id("goal-editor-discovery-status");
    if (status) {
      status.textContent = message ||
        "Rename or permanently delete any goal, objective, or target below. You can also add new items at each level.";
    }
  }

  function installGoalEditDiscoverability() {
    const managerCard = id("goal-editor-tree") && id("goal-editor-tree").closest(".card");
    if (managerCard) {
      const hint = managerCard.querySelector(":scope > .hint");
      if (hint) {
        hint.textContent =
          "Template content is fully editable. Expand each level to rename or delete domains, long-term goals, short-term objectives, and targets. Completed-session snapshots stay unchanged.";
      }
      if (!id("goal-editor-discovery-status")) {
        const status = document.createElement("p");
        status.id = "goal-editor-discovery-status";
        status.className = "inline-status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        if (hint) { hint.after(status); }
        else { managerCard.prepend(status); }
      }
    }

    if (!id("home-goal-management-card")) {
      const card = document.createElement("section");
      card.id = "home-goal-management-card";
      card.className = "card home-goal-management-card hidden";
      card.setAttribute("aria-labelledby", "home-goal-management-title");
      card.innerHTML =
        '<div class="card-head home-goal-management-head">' +
          '<div>' +
            '<p class="eyebrow">Goal library</p>' +
            '<h3 id="home-goal-management-title">Goals &amp; objectives</h3>' +
            '<p id="home-goal-summary" class="hint"></p>' +
          '</div>' +
        '</div>' +
        '<p class="home-goal-help">Add another goal, change template wording, or remove goals and objectives before starting a session.</p>' +
        '<div class="goal-home-actions">' +
          '<button id="add-template-goal-home" class="btn-secondary" type="button">Add from template</button>' +
          '<button id="add-custom-goal-home" class="btn-secondary" type="button">Add custom goal</button>' +
          '<button id="edit-remove-goals-home" class="btn-primary" type="button">Edit or remove goals</button>' +
        '</div>' +
        '<p id="home-goal-status" class="inline-status" role="status" aria-live="polite"></p>';
      id("target-selection-card").before(card);

      id("add-template-goal-home").addEventListener("click", openTemplates);
      id("add-custom-goal-home").addEventListener("click", openCustomGoal);
      id("edit-remove-goals-home").addEventListener("click", function () {
        openGoalEditor([], "Edit, add, or remove any goal, objective, or target below.");
      });
    }
    refreshHomeGoalManager();
  }

  function renderTemplates() {
    const list = id("goal-template-list");
    list.innerHTML = "";
    DataTaker.getGoalTemplates().forEach(function (template) {
      const article = document.createElement("article");
      article.className = "goal-template-card";

      const heading = document.createElement("div");
      heading.className = "goal-template-heading";
      const icon = document.createElement("span");
      icon.className = "goal-template-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = template.icon;
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = template.title;
      const count = document.createElement("p");
      count.className = "goal-template-count";
      count.textContent = template.target_count + " editable target" + (template.target_count === 1 ? "" : "s");
      copy.append(title, count);
      heading.append(icon, copy);

      const description = document.createElement("p");
      description.className = "goal-template-description";
      description.textContent = template.description;

      const preview = document.createElement("ul");
      preview.className = "goal-template-preview";
      template.preview.forEach(function (label) {
        const item = document.createElement("li");
        item.textContent = label;
        preview.appendChild(item);
      });

      const add = document.createElement("button");
      add.type = "button";
      add.className = "btn-secondary goal-template-add";
      add.textContent = "Add template";
      add.setAttribute("aria-label", "Add " + template.title + " template");
      add.addEventListener("click", function () {
        add.disabled = true;
        try {
          const created = DataTaker.applyGoalTemplate(template.id);
          id("template-status").textContent =
            created.title + " added with " + created.target_ids.length + " editable targets.";
          refreshAll();
          refreshOnboarding();
          id("goal-template-dialog").close();
          activateSection("start", { focus: true });
          refreshHomeGoalManager();
          id("home-goal-status").textContent =
            created.title + " added. Use the controls above to add, edit, or remove goals and objectives.";
          id("home-goal-management-card").scrollIntoView({ block: "nearest" });
          id("edit-remove-goals-home").focus();
        } catch (error) {
          id("template-status").textContent = error.message;
          add.disabled = false;
        }
      });

      article.append(heading, description, preview, add);
      list.appendChild(article);
    });
  }

  function openTemplates() {
    id("template-status").textContent = "";
    renderTemplates();
    id("goal-template-dialog").showModal();
  }

  function openCustomGoal() {
    activateSection("goals", { focus: true });
    window.setTimeout(function () { id("new-domain-name").focus(); }, 0);
  }

  function updateDemo() {
    const correct = demoTrials.filter(function (trial) { return trial.result === "+"; }).length;
    const total = demoTrials.length;
    const percent = total ? Math.round((100 * correct) / total) : 0;
    id("demo-accuracy").textContent = percent + "%";
    id("demo-trial-count").textContent = total + " trial" + (total === 1 ? "" : "s");
    id("demo-correct-bar").style.width = percent + "%";
    id("demo-incorrect-bar").style.width = (total ? 100 - percent : 0) + "%";

    const recent = id("demo-recent");
    recent.innerHTML = "";
    if (!total) {
      const empty = document.createElement("li");
      empty.className = "demo-empty";
      empty.textContent = "Tap + or − to record a practice trial.";
      recent.appendChild(empty);
      return;
    }

    demoTrials.slice(-5).reverse().forEach(function (trial) {
      const item = document.createElement("li");
      const badge = document.createElement("strong");
      badge.className = trial.result === "+" ? "demo-result-correct" : "demo-result-incorrect";
      badge.textContent = trial.result;
      const copy = document.createElement("span");
      copy.textContent = trial.cues.length ? trial.cues.join(", ") : "Independent";
      item.append(badge, copy);
      recent.appendChild(item);
    });
  }

  function resetDemo() {
    demoTrials = [];
    demoCues.clear();
    document.querySelectorAll(".demo-cue").forEach(function (button) {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    });
    updateDemo();
  }

  function openDemo() {
    resetDemo();
    id("example-session-dialog").showModal();
  }

  document.querySelectorAll("[data-open-templates]").forEach(function (button) {
    button.addEventListener("click", openTemplates);
  });
  document.querySelectorAll("[data-create-custom-goal]").forEach(function (button) {
    button.addEventListener("click", openCustomGoal);
  });
  id("open-example-session").addEventListener("click", openDemo);

  id("toggle-all-targets").addEventListener("click", function () {
    showAllTargets = !showAllTargets;
    compactTargetRows();
  });

  id("target-search").addEventListener("input", compactTargetRows);
  new MutationObserver(function () {
    refreshOnboarding();
  }).observe(id("goal-tree"), { childList: true });

  document.querySelectorAll(".demo-cue").forEach(function (button) {
    button.addEventListener("click", function () {
      const cue = button.dataset.demoCue;
      if (demoCues.has(cue)) { demoCues.delete(cue); }
      else { demoCues.add(cue); }
      const active = demoCues.has(cue);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  });

  document.querySelectorAll("[data-demo-result]").forEach(function (button) {
    button.addEventListener("click", function () {
      demoTrials.push({ result: button.dataset.demoResult, cues: Array.from(demoCues) });
      updateDemo();
    });
  });
  id("reset-example-session").addEventListener("click", resetDemo);

  installGoalEditDiscoverability();
  renderTemplates();
  refreshOnboarding();
  updateDemo();
})();
