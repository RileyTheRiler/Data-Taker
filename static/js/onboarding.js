// First-run onboarding, template picker, compact target browsing, and non-persistent demo.

(function () {
  const VISIBLE_TARGET_LIMIT = 5;
  let showAllTargets = false;
  let templateReturnSection = "start";
  let demoTrials = [];
  const demoCues = new Set();

  function id(name) { return document.getElementById(name); }

  function currentSection() {
    const selected = document.querySelector('.home-tab[aria-selected="true"]');
    return selected ? selected.dataset.section : "start";
  }

  function libraryIsEmpty() {
    return Object.keys(DataTaker.allTargets()).length === 0;
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

  function expandCreatedGoalHierarchy(domainIds) {
    const createdDomains = new Set(domainIds || []);
    if (!createdDomains.size || typeof openGoalGroups === "undefined") { return; }
    DataTaker.getGoals().domains.forEach(function (domain) {
      if (!createdDomains.has(domain.id)) { return; }
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
    expandCreatedGoalHierarchy(domainIds);
    activateSection("goals", { focus: true });
    renderGoalManager();
    const status = id("goal-editor-discovery-status");
    if (status) {
      status.textContent = message ||
        "Expand any goal to edit, archive, restore, duplicate, or permanently delete its contents.";
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

    const selectionHead = id("target-selection-card") && id("target-selection-card").querySelector(".card-head");
    if (selectionHead && !id("edit-goals-from-start")) {
      const edit = document.createElement("button");
      edit.id = "edit-goals-from-start";
      edit.type = "button";
      edit.className = "btn-link";
      edit.textContent = "Edit goals & objectives";
      edit.addEventListener("click", function () {
        openGoalEditor([], "Edit or remove any goal, objective, or target below.");
      });
      selectionHead.appendChild(edit);
    }
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
          openGoalEditor(
            created.domain_ids,
            created.title + " added. Edit or delete any goal, objective, or target below, then return to Start when ready."
          );
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
    templateReturnSection = currentSection();
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
