// Client-side data layer — replaces the old Flask/JSON-file backend so the
// app can run as a static site on Vercel (and offline on a phone/iPad).
//
// EDUCATIONAL PRACTICE ONLY — no real database and no PHI is ever stored.
// Everything lives in this browser's localStorage; nothing is sent to a
// server. "Clients" are anonymized free-text labels (e.g. "Client A").

const DataTaker = (function () {
  const KEYS = {
    goals: "dataTaker.goals.v1",
    clients: "dataTaker.clients.v1",
    cues: "dataTaker.cues.v1",
    sessions: "dataTaker.sessions.v2",
    sessionUi: "dataTaker.sessionUi.v1",
    activity: "dataTaker.activityLog.v1",
    recentTargetSets: "dataTaker.recentTargetSets.v1",
    preferences: "dataTaker.preferences.v1",
    backupMeta: "dataTaker.backupMeta.v1",
  };

  const LEGACY_KEYS = {
    sessions: "dataTaker.sessions.v1",
  };

  function uid() {
    if (window.crypto && crypto.randomUUID) { return crypto.randomUUID().replace(/-/g, ""); }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function defaultGoals() {
    return {
      domains: [
        {
          id: "domain-articulation",
          name: "Articulation",
          long_term_goals: [
            {
              id: "ltg-artic-r",
              label: "Produce /r/ accurately across word positions in conversation",
              short_term_goals: [
                {
                  id: "stg-r-initial",
                  label: "Produce initial /r/ at the word level",
                  targets: [
                    { id: "tgt-r-cvc", label: "Initial /r/ in CVC words" },
                    { id: "tgt-r-blends", label: "Initial /r/ blends (br, cr, gr)" },
                  ],
                },
                {
                  id: "stg-r-medial",
                  label: "Produce medial/final /r/ at the word level",
                  targets: [{ id: "tgt-r-vocalic", label: "Vocalic /r/ (er, ar, or)" }],
                },
              ],
            },
            {
              id: "ltg-artic-s",
              label: "Produce /s/ and /s/-blends accurately at the sentence level",
              short_term_goals: [
                {
                  id: "stg-s-word",
                  label: "Produce /s/ at the word level",
                  targets: [
                    { id: "tgt-s-initial", label: "Initial /s/ in words" },
                    { id: "tgt-s-blends", label: "/s/ blends (st, sp, sn)" },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "domain-fluency",
          name: "Fluency",
          long_term_goals: [
            {
              id: "ltg-fluency-strategies",
              label: "Use fluency-shaping strategies to reduce disfluencies in conversation",
              short_term_goals: [
                {
                  id: "stg-easy-onset",
                  label: "Apply easy onset at the phrase level",
                  targets: [{ id: "tgt-easy-onset", label: "Easy onset in 3-4 word phrases" }],
                },
                {
                  id: "stg-light-contact",
                  label: "Apply light articulatory contact in structured tasks",
                  targets: [{ id: "tgt-light-contact", label: "Light contact in reading aloud" }],
                },
              ],
            },
          ],
        },
        {
          id: "domain-language",
          name: "Language",
          long_term_goals: [
            {
              id: "ltg-expressive",
              label: "Improve expressive language for grammatical accuracy",
              short_term_goals: [
                {
                  id: "stg-past-tense",
                  label: "Use regular past-tense verbs in sentences",
                  targets: [{ id: "tgt-past-tense", label: "Regular past-tense -ed in sentences" }],
                },
                {
                  id: "stg-pronouns",
                  label: "Use subjective pronouns accurately",
                  targets: [{ id: "tgt-pronouns", label: "Subjective pronouns (he/she/they)" }],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  function normalizeGoals(input) {
    const source = input && typeof input === "object" && Array.isArray(input.domains)
      ? input
      : { domains: [] };

    function normalizeList(items, kind, childKey) {
      return (Array.isArray(items) ? items : []).map((item, index) => {
        const normalized = {
          ...item,
          id: item && item.id ? String(item.id) : kind + "-" + uid(),
          archived: Boolean(item && item.archived),
          order: index,
        };
        if (kind === "domain") { normalized.name = String(item && item.name || "Untitled domain"); }
        else { normalized.label = String(item && item.label || "Untitled"); }
        if (childKey) {
          const childKind = childKey === "long_term_goals" ? "ltg" :
            childKey === "short_term_goals" ? "stg" : "target";
          const nextChildKey = childKey === "long_term_goals" ? "short_term_goals" :
            childKey === "short_term_goals" ? "targets" : null;
          normalized[childKey] = normalizeList(item && item[childKey], childKind, nextChildKey);
        }
        return normalized;
      });
    }

    return { ...source, domains: normalizeList(source.domains, "domain", "long_term_goals") };
  }

  function defaultCues() {
    return ["Max", "Mod", "Min", "Visual", "Verbal", "Tactile"].map((label) => ({
      id: "cue-" + label.toLowerCase(),
      label: label,
    }));
  }

  function appendActivity(action, entity, entityId) {
    const log = read(KEYS.activity, []);
    log.push({ timestamp: now(), action: action, entity: entity, entity_id: entityId });
    write(KEYS.activity, log);
  }

  // ---------- Goals (with support for custom domains/goals/targets) ----------

  function getGoals() {
    let goals = read(KEYS.goals, null);
    if (!goals) {
      goals = defaultGoals();
    }
    const normalized = normalizeGoals(goals);
    if (JSON.stringify(normalized) !== JSON.stringify(goals)) { write(KEYS.goals, normalized); }
    goals = normalized;
    return goals;
  }

  function saveGoals(goals) {
    write(KEYS.goals, goals);
  }

  function addDomain(name) {
    const goals = getGoals();
    const domain = { id: "domain-" + uid(), name: name, archived: false, order: goals.domains.length, long_term_goals: [] };
    goals.domains.push(domain);
    saveGoals(goals);
    appendActivity("create", "domain", domain.id);
    return domain;
  }

  function addLongTermGoal(domainId, label) {
    const goals = getGoals();
    const domain = goals.domains.find((d) => d.id === domainId);
    if (!domain) { throw new Error("Unknown domain."); }
    const ltg = { id: "ltg-" + uid(), label: label, archived: false, order: domain.long_term_goals.length, short_term_goals: [] };
    domain.long_term_goals.push(ltg);
    saveGoals(goals);
    appendActivity("create", "long_term_goal", ltg.id);
    return ltg;
  }

  function addShortTermGoal(domainId, ltgId, label) {
    const goals = getGoals();
    const domain = goals.domains.find((d) => d.id === domainId);
    const ltg = domain && domain.long_term_goals.find((g) => g.id === ltgId);
    if (!ltg) { throw new Error("Unknown long-term goal."); }
    const stg = { id: "stg-" + uid(), label: label, archived: false, order: ltg.short_term_goals.length, targets: [] };
    ltg.short_term_goals.push(stg);
    saveGoals(goals);
    appendActivity("create", "short_term_goal", stg.id);
    return stg;
  }

  function addTarget(domainId, ltgId, stgId, label) {
    const goals = getGoals();
    const domain = goals.domains.find((d) => d.id === domainId);
    const ltg = domain && domain.long_term_goals.find((g) => g.id === ltgId);
    const stg = ltg && ltg.short_term_goals.find((s) => s.id === stgId);
    if (!stg) { throw new Error("Unknown short-term goal."); }
    const target = { id: "tgt-" + uid(), label: label, archived: false, order: stg.targets.length };
    stg.targets.push(target);
    saveGoals(goals);
    appendActivity("create", "target", target.id);
    return target;
  }

  function deleteDomain(domainId) {
    const goals = getGoals();
    goals.domains = goals.domains.filter((d) => d.id !== domainId);
    saveGoals(goals);
    appendActivity("delete", "domain", domainId);
  }

  function deleteLongTermGoal(domainId, ltgId) {
    const goals = getGoals();
    const domain = goals.domains.find((d) => d.id === domainId);
    if (domain) { domain.long_term_goals = domain.long_term_goals.filter((g) => g.id !== ltgId); }
    saveGoals(goals);
    appendActivity("delete", "long_term_goal", ltgId);
  }

  function deleteShortTermGoal(domainId, ltgId, stgId) {
    const goals = getGoals();
    const domain = goals.domains.find((d) => d.id === domainId);
    const ltg = domain && domain.long_term_goals.find((g) => g.id === ltgId);
    if (ltg) { ltg.short_term_goals = ltg.short_term_goals.filter((s) => s.id !== stgId); }
    saveGoals(goals);
    appendActivity("delete", "short_term_goal", stgId);
  }

  function deleteTarget(domainId, ltgId, stgId, targetId) {
    const goals = getGoals();
    const domain = goals.domains.find((d) => d.id === domainId);
    const ltg = domain && domain.long_term_goals.find((g) => g.id === ltgId);
    const stg = ltg && ltg.short_term_goals.find((s) => s.id === stgId);
    if (stg) { stg.targets = stg.targets.filter((t) => t.id !== targetId); }
    saveGoals(goals);
    appendActivity("delete", "target", targetId);
  }

  function locateGoalNode(goals, type, id) {
    for (const domain of goals.domains) {
      if (type === "domain" && domain.id === id) {
        return { node: domain, siblings: goals.domains, parent: null };
      }
      for (const ltg of domain.long_term_goals) {
        if (type === "ltg" && ltg.id === id) {
          return { node: ltg, siblings: domain.long_term_goals, parent: domain };
        }
        for (const stg of ltg.short_term_goals) {
          if (type === "stg" && stg.id === id) {
            return { node: stg, siblings: ltg.short_term_goals, parent: ltg };
          }
          const target = stg.targets.find((item) => item.id === id);
          if (type === "target" && target) {
            return { node: target, siblings: stg.targets, parent: stg };
          }
        }
      }
    }
    return null;
  }

  function refreshOrder(items) {
    items.forEach((item, index) => { item.order = index; });
  }

  function goalNodeLabel(type, node) {
    return type === "domain" ? node.name : node.label;
  }

  function renameGoalNode(type, id, label) {
    label = String(label || "").trim();
    if (!label) { throw new Error("A label is required."); }
    if (label.length > 200) { throw new Error("Labels must be 200 characters or fewer."); }
    const goals = getGoals();
    const located = locateGoalNode(goals, type, id);
    if (!located) { throw new Error("Goal item not found."); }
    if (type === "domain") { located.node.name = label; }
    else { located.node.label = label; }
    saveGoals(goals);
    appendActivity("modify", type, id);
    return located.node;
  }

  function cloneGoalNode(type, node) {
    const clone = { ...node, id: type + "-" + uid(), archived: false };
    if (type === "domain") {
      clone.long_term_goals = node.long_term_goals.map((item) => cloneGoalNode("ltg", item));
      refreshOrder(clone.long_term_goals);
    } else if (type === "ltg") {
      clone.short_term_goals = node.short_term_goals.map((item) => cloneGoalNode("stg", item));
      refreshOrder(clone.short_term_goals);
    } else if (type === "stg") {
      clone.targets = node.targets.map((item) => cloneGoalNode("target", item));
      refreshOrder(clone.targets);
    }
    if (type === "domain") { clone.name += " copy"; }
    else { clone.label += " copy"; }
    return clone;
  }

  function duplicateGoalNode(type, id) {
    const goals = getGoals();
    const located = locateGoalNode(goals, type, id);
    if (!located) { throw new Error("Goal item not found."); }
    const index = located.siblings.indexOf(located.node);
    const clone = cloneGoalNode(type, located.node);
    located.siblings.splice(index + 1, 0, clone);
    refreshOrder(located.siblings);
    saveGoals(goals);
    appendActivity("create", type, clone.id);
    return clone;
  }

  function reorderGoalNode(type, id, direction) {
    if (direction !== -1 && direction !== 1) { throw new Error("Invalid reorder direction."); }
    const goals = getGoals();
    const located = locateGoalNode(goals, type, id);
    if (!located) { throw new Error("Goal item not found."); }
    const index = located.siblings.indexOf(located.node);
    const next = index + direction;
    if (next < 0 || next >= located.siblings.length) { return located.node; }
    [located.siblings[index], located.siblings[next]] = [located.siblings[next], located.siblings[index]];
    refreshOrder(located.siblings);
    saveGoals(goals);
    appendActivity("modify", type, id);
    return located.node;
  }

  function setGoalArchived(type, id, archived) {
    const goals = getGoals();
    const located = locateGoalNode(goals, type, id);
    if (!located) { throw new Error("Goal item not found."); }
    located.node.archived = Boolean(archived);
    saveGoals(goals);
    appendActivity(archived ? "archive" : "restore", type, id);
    return located.node;
  }

  function goalNodeContents(type, node) {
    if (type === "target") { return { domains: 0, ltgs: 0, stgs: 0, targets: 1 }; }
    if (type === "stg") {
      return { domains: 0, ltgs: 0, stgs: 1, targets: node.targets.length };
    }
    if (type === "ltg") {
      return {
        domains: 0,
        ltgs: 1,
        stgs: node.short_term_goals.length,
        targets: node.short_term_goals.reduce((sum, item) => sum + item.targets.length, 0),
      };
    }
    return {
      domains: 1,
      ltgs: node.long_term_goals.length,
      stgs: node.long_term_goals.reduce((sum, item) => sum + item.short_term_goals.length, 0),
      targets: node.long_term_goals.reduce((sum, item) =>
        sum + item.short_term_goals.reduce((inner, stg) => inner + stg.targets.length, 0), 0),
    };
  }

  function describeGoalNode(type, id) {
    const located = locateGoalNode(getGoals(), type, id);
    if (!located) { throw new Error("Goal item not found."); }
    return { type, id, label: goalNodeLabel(type, located.node), ...goalNodeContents(type, located.node) };
  }

  function deleteGoalNode(type, id) {
    const goals = getGoals();
    const located = locateGoalNode(goals, type, id);
    if (!located) { throw new Error("Goal item not found."); }
    located.siblings.splice(located.siblings.indexOf(located.node), 1);
    refreshOrder(located.siblings);
    saveGoals(goals);
    appendActivity("delete", type, id);
  }

  function allTargets(includeArchived) {
    const targets = {};
    getGoals().domains.forEach((domain) => {
      domain.long_term_goals.forEach((ltg) => {
        ltg.short_term_goals.forEach((stg) => {
          stg.targets.forEach((target) => {
            const archived = Boolean(domain.archived || ltg.archived || stg.archived || target.archived);
            if (archived && !includeArchived) { return; }
            targets[target.id] = {
              id: target.id,
              label: target.label,
              domain: domain.name,
              long_term_goal: ltg.label,
              short_term_goal: stg.label,
              archived: archived,
            };
          });
        });
      });
    });
    return targets;
  }

  function findTargetInGoals(goals, targetId) {
    for (const domain of goals.domains) {
      for (const ltg of domain.long_term_goals) {
        for (const stg of ltg.short_term_goals) {
          const target = stg.targets.find((item) => item.id === targetId);
          if (target) { return target; }
        }
      }
    }
    return null;
  }

  // ---------- Clients ----------

  function getClients() {
    return read(KEYS.clients, []);
  }

  function addClient(label) {
    label = (label || "").trim();
    if (!label) { throw new Error("A client label is required."); }
    const clients = getClients();
    if (clients.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      throw new Error("That client label already exists.");
    }
    const client = { id: uid(), label: label };
    clients.push(client);
    write(KEYS.clients, clients);
    appendActivity("create", "client", client.id);
    return client;
  }

  // ---------- Cue types ----------

  function getCues() {
    let cues = read(KEYS.cues, null);
    if (!Array.isArray(cues)) {
      cues = defaultCues();
      write(KEYS.cues, cues);
    }
    return cues;
  }

  function normalizedCueLabel(label) {
    label = (label || "").trim();
    if (!label) { throw new Error("A cue label is required."); }
    if (label.length > 40) { throw new Error("Cue labels must be 40 characters or fewer."); }
    return label;
  }

  function assertUniqueCueLabel(cues, label, exceptId) {
    const duplicate = cues.some((cue) => cue.id !== exceptId &&
      cue.label.toLowerCase() === label.toLowerCase());
    if (duplicate) { throw new Error("That cue label already exists."); }
  }

  function addCue(label) {
    label = normalizedCueLabel(label);
    const cues = getCues();
    assertUniqueCueLabel(cues, label, null);
    const cue = { id: "cue-" + uid(), label: label };
    cues.push(cue);
    write(KEYS.cues, cues);
    appendActivity("create", "cue", cue.id);
    return cue;
  }

  function renameCue(id, label) {
    label = normalizedCueLabel(label);
    const cues = getCues();
    const cue = cues.find((item) => item.id === id);
    if (!cue) { throw new Error("Cue type not found."); }
    assertUniqueCueLabel(cues, label, id);
    cue.label = label;
    write(KEYS.cues, cues);
    appendActivity("modify", "cue", id);
    return cue;
  }

  function deleteCue(id) {
    const cues = getCues();
    if (!cues.some((cue) => cue.id === id)) { throw new Error("Cue type not found."); }
    write(KEYS.cues, cues.filter((cue) => cue.id !== id));
    appendActivity("delete", "cue", id);
  }

  // ---------- Sessions ----------

  function getSessions() {
    const sessions = read(KEYS.sessions, null);
    if (Array.isArray(sessions)) { return sessions; }

    // v2 adds immutable target metadata snapshots for reliable history. Keep
    // the v1 key intact so migration is recoverable, then write the upgraded
    // copy to the new key.
    const legacySessions = read(LEGACY_KEYS.sessions, []);
    const known = allTargets(true);
    const migrated = Array.isArray(legacySessions)
      ? legacySessions.map((session) => migrateSession(session, known))
      : [];
    write(KEYS.sessions, migrated);
    return migrated;
  }

  function migrateSession(session, knownTargets) {
    const migrated = { ...session };
    if (!migrated.target_snapshots || typeof migrated.target_snapshots !== "object") {
      migrated.target_snapshots = {};
    }
    (migrated.target_ids || []).forEach((targetId) => {
      if (!migrated.target_snapshots[targetId] && knownTargets[targetId]) {
        migrated.target_snapshots[targetId] = { ...knownTargets[targetId] };
      }
    });
    return migrated;
  }

  function saveSessions(sessions) {
    write(KEYS.sessions, sessions);
  }

  function findSession(sessions, id) {
    return sessions.find((s) => s.id === id) || null;
  }

  function accuracy(datapoints) {
    const total = datapoints.length;
    const correct = datapoints.filter((dp) => dp.result === "+").length;
    const percent = total ? Math.round((100 * correct) / total) : 0;
    return { correct, total, percent };
  }

  function sessionView(session) {
    const known = allTargets(true);
    const datapoints = session.datapoints || [];

    const targets = (session.target_ids || []).map((tid) => {
      const tdps = datapoints.filter((dp) => dp.target_id === tid);
      const acc = accuracy(tdps);
      const snapshot = session.target_snapshots && session.target_snapshots[tid];
      const meta = snapshot || known[tid] || { id: tid, label: "Target " + tid };
      return { ...meta, ...acc };
    });

    const overall = accuracy(datapoints);

    let duration_seconds = null;
    if (session.end_time) {
      duration_seconds = Math.floor(
        (new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 1000
      );
    }

    return { ...session, targets, overall, duration_seconds };
  }

  function getPastSessions(clientLabel) {
    const normalizedLabel = (clientLabel || "").trim().toLowerCase();
    if (!normalizedLabel) { return []; }
    return getSessions()
      .filter((session) => session.end_time &&
        (session.client_label || "").trim().toLowerCase() === normalizedLabel)
      .map(sessionView)
      .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());
  }

  function targetSetItem(targetId, snapshot) {
    const configured = allTargets(true)[targetId];
    return {
      id: targetId,
      label: configured ? configured.label : (snapshot && snapshot.label) || "Unavailable target",
      icon_target: configured || snapshot || { id: targetId, label: "Unavailable target" },
      status: !configured ? "missing" : configured.archived ? "archived" : "available",
    };
  }

  function getRepeatLastSession(clientLabel) {
    const session = getPastSessions(clientLabel)[0];
    if (!session) { return null; }
    return {
      source_session_id: session.id,
      ended_at: session.end_time,
      targets: session.target_ids.map((id) => targetSetItem(id, session.target_snapshots && session.target_snapshots[id])),
    };
  }

  function saveRecentTargetSet(clientLabel, targetIds, snapshots) {
    const all = read(KEYS.recentTargetSets, []);
    const normalizedClient = clientLabel.trim().toLowerCase();
    const record = {
      id: uid(),
      client_label: clientLabel,
      target_ids: targetIds.slice(),
      target_labels: targetIds.reduce((labels, id) => {
        labels[id] = snapshots[id] ? snapshots[id].label : id;
        return labels;
      }, {}),
      used_at: now(),
    };
    const deduped = all.filter((item) =>
      String(item.client_label || "").trim().toLowerCase() !== normalizedClient ||
      JSON.stringify(item.target_ids || []) !== JSON.stringify(record.target_ids));
    deduped.unshift(record);
    const kept = [];
    const perClient = {};
    deduped.forEach((item) => {
      const key = String(item.client_label || "").trim().toLowerCase();
      perClient[key] = (perClient[key] || 0) + 1;
      if (perClient[key] <= 5) { kept.push(item); }
    });
    write(KEYS.recentTargetSets, kept);
  }

  function getRecentTargetSets(clientLabel) {
    const normalizedClient = String(clientLabel || "").trim().toLowerCase();
    return read(KEYS.recentTargetSets, [])
      .filter((item) => String(item.client_label || "").trim().toLowerCase() === normalizedClient)
      .map((item) => ({
        ...item,
        targets: (item.target_ids || []).map((id) => targetSetItem(id, {
          id,
          label: item.target_labels && item.target_labels[id],
        })),
      }));
  }

  function getActiveSessions() {
    return getSessions()
      .filter((session) => !session.end_time)
      .map(sessionView)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }

  function getSessionUi(id) {
    const allUi = read(KEYS.sessionUi, {});
    const saved = allUi && typeof allUi === "object" ? allUi[id] : null;
    return {
      active_target_id: saved && saved.active_target_id ? saved.active_target_id : null,
      armed_cues: saved && Array.isArray(saved.armed_cues) ? saved.armed_cues : [],
      hold_cues: !saved || saved.hold_cues !== false,
    };
  }

  function saveSessionUi(id, ui) {
    const allUi = read(KEYS.sessionUi, {});
    const safeUi = allUi && typeof allUi === "object" && !Array.isArray(allUi) ? allUi : {};
    safeUi[id] = {
      active_target_id: ui && ui.active_target_id ? ui.active_target_id : null,
      armed_cues: ui && Array.isArray(ui.armed_cues) ? ui.armed_cues.slice() : [],
      hold_cues: !ui || ui.hold_cues !== false,
    };
    write(KEYS.sessionUi, safeUi);
    return safeUi[id];
  }

  function clearSessionUi(id) {
    const allUi = read(KEYS.sessionUi, {});
    if (!allUi || typeof allUi !== "object" || Array.isArray(allUi)) { return; }
    delete allUi[id];
    write(KEYS.sessionUi, allUi);
  }

  function formatDurationWords(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const parts = [];
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours) { parts.push(hours + " hour" + (hours === 1 ? "" : "s")); }
    if (minutes) { parts.push(minutes + " minute" + (minutes === 1 ? "" : "s")); }
    if (remainingSeconds || !parts.length) {
      parts.push(remainingSeconds + " second" + (remainingSeconds === 1 ? "" : "s"));
    }
    if (parts.length === 1) { return parts[0]; }
    return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  }

  function opportunityText(count) {
    return count + " opportunit" + (count === 1 ? "y" : "ies");
  }

  function cueSummary(datapoints) {
    const counts = new Map();
    let independent = 0;
    datapoints.forEach((datapoint) => {
      const prompts = Array.from(new Set(datapoint.prompt_levels || []));
      if (!prompts.length) { independent += 1; }
      prompts.forEach((prompt) => counts.set(prompt, (counts.get(prompt) || 0) + 1));
    });
    return {
      independent: independent,
      cues: Array.from(counts.entries()).map(([label, count]) => ({ label, count })),
    };
  }

  function getObjectiveDraft(id) {
    const session = getSession(id);
    if (!session.end_time) { throw new Error("End the session before drafting an Objective note."); }

    const targetCount = session.targets.length;
    const sentences = [
      "During a session lasting " + formatDurationWords(session.duration_seconds) +
        ", data were collected across " + targetCount + " target" + (targetCount === 1 ? "" : "s") + ".",
    ];

    if (!session.overall.total) {
      sentences.push("No trial data were recorded.");
    } else {
      sentences.push(
        "Across all targets, the client responded accurately in " + session.overall.correct + " of " +
        opportunityText(session.overall.total) + " (" + session.overall.percent + "%)."
      );

      session.targets.forEach((target) => {
        const datapoints = session.datapoints.filter((datapoint) => datapoint.target_id === target.id);
        if (!datapoints.length) {
          sentences.push("No trials were recorded for " + target.label + ".");
          return;
        }

        const prompts = cueSummary(datapoints);
        let cueSentence = "Performance was independent in " + prompts.independent + " of " +
          opportunityText(datapoints.length) + " (" +
          Math.round((100 * prompts.independent) / datapoints.length) + "%).";
        if (prompts.cues.length) {
          cueSentence += " Recorded cueing included " + prompts.cues.map((cue) =>
            cue.label + " on " + opportunityText(cue.count)
          ).join(", ") + ".";
        }

        sentences.push(
          "For " + target.label + ", the client responded accurately in " + target.correct + " of " +
          opportunityText(target.total) + " (" + target.percent + "%). " + cueSentence
        );
      });
    }

    sentences.push(
      "[Add the session activity or materials, skilled interventions or modifications, and the client's response. " +
      "Verify all details before using this draft.]"
    );
    return sentences.join(" ");
  }

  function startSession(clientLabel, targetIds) {
    clientLabel = (clientLabel || "").trim();
    if (!clientLabel) { throw new Error("A client label is required."); }
    if (!targetIds || !targetIds.length) { throw new Error("Select at least one target."); }

    const known = allTargets();
    const invalid = targetIds.filter((t) => !known[t]);
    if (invalid.length) { throw new Error("Unknown target(s): " + invalid.join(", ")); }

    const targetSnapshots = {};
    targetIds.forEach((targetId) => {
      targetSnapshots[targetId] = { ...known[targetId] };
    });

    const session = {
      id: uid(),
      client_label: clientLabel,
      target_ids: targetIds,
      target_snapshots: targetSnapshots,
      start_time: now(),
      end_time: null,
      datapoints: [],
    };
    const sessions = getSessions();
    sessions.push(session);
    saveSessions(sessions);
    saveRecentTargetSet(clientLabel, targetIds, targetSnapshots);
    appendActivity("create", "session", session.id);
    return sessionView(session);
  }

  function getSession(id) {
    const session = findSession(getSessions(), id);
    if (!session) { throw new Error("Session not found."); }
    return sessionView(session);
  }

  function addSessionTarget(id, targetId) {
    const sessions = getSessions();
    const session = findSession(sessions, id);
    if (!session) { throw new Error("Session not found."); }
    if (session.end_time) { throw new Error("Session has ended; targets cannot be changed."); }
    if (session.target_ids.includes(targetId)) { throw new Error("Target is already part of this session."); }

    const known = allTargets();
    if (!known[targetId]) { throw new Error("Target not found."); }
    session.target_ids.push(targetId);
    if (!session.target_snapshots || typeof session.target_snapshots !== "object") {
      session.target_snapshots = {};
    }
    session.target_snapshots[targetId] = { ...known[targetId] };
    saveSessions(sessions);
    appendActivity("modify", "session", id);
    return sessionView(session);
  }

  function renameSessionTarget(id, targetId, label) {
    label = (label || "").trim();
    if (!label) { throw new Error("A target label is required."); }
    if (label.length > 160) { throw new Error("Target labels must be 160 characters or fewer."); }

    const sessions = getSessions();
    const session = findSession(sessions, id);
    if (!session) { throw new Error("Session not found."); }
    if (session.end_time) { throw new Error("Session has ended; targets cannot be changed."); }
    if (!session.target_ids.includes(targetId)) { throw new Error("Target is not part of this session."); }

    const goals = getGoals();
    const target = findTargetInGoals(goals, targetId);
    if (target) {
      target.label = label;
      saveGoals(goals);
    }

    if (!session.target_snapshots || typeof session.target_snapshots !== "object") {
      session.target_snapshots = {};
    }
    const existing = session.target_snapshots[targetId] || { id: targetId };
    session.target_snapshots[targetId] = { ...existing, label: label };
    saveSessions(sessions);
    appendActivity("modify", target ? "target" : "session_target", targetId);
    return sessionView(session);
  }

  function endSession(id) {
    const sessions = getSessions();
    const session = findSession(sessions, id);
    if (!session) { throw new Error("Session not found."); }
    if (!session.end_time) {
      session.end_time = now();
      saveSessions(sessions);
      appendActivity("modify", "session", id);
    }
    clearSessionUi(id);
    return sessionView(session);
  }

  function addDatapoint(id, targetId, result, promptLevels) {
    const sessions = getSessions();
    const session = findSession(sessions, id);
    if (!session) { throw new Error("Session not found."); }
    if (session.end_time) { throw new Error("Session has ended; cannot add data."); }
    if (!session.target_ids.includes(targetId)) { throw new Error("Target is not part of this session."); }
    if (result !== "+" && result !== "-") { throw new Error("Result must be '+' or '-'."); }

    const cueLabels = new Set(getCues().map((cue) => cue.label));
    const prompts = (promptLevels || []).filter((prompt) => cueLabels.has(prompt));
    const datapoint = {
      id: uid(),
      target_id: targetId,
      result: result,
      prompt_levels: prompts,
      timestamp: now(),
    };
    session.datapoints.push(datapoint);
    saveSessions(sessions);
    appendActivity("create", "datapoint", datapoint.id);
    return sessionView(session);
  }

  function deleteDatapoint(id, datapointId) {
    const sessions = getSessions();
    const session = findSession(sessions, id);
    if (!session) { throw new Error("Session not found."); }
    const before = session.datapoints.length;
    session.datapoints = session.datapoints.filter((dp) => dp.id !== datapointId);
    if (session.datapoints.length === before) { throw new Error("Trial not found."); }
    saveSessions(sessions);
    appendActivity("delete", "datapoint", datapointId);
    return sessionView(session);
  }

  // ---------- Backup / restore ----------

  function getPreferences() {
    const value = read(KEYS.preferences, {});
    return {
      high_contrast: Boolean(value && value.high_contrast),
      reduce_motion: Boolean(value && value.reduce_motion),
    };
  }

  function savePreferences(preferences) {
    const value = {
      high_contrast: Boolean(preferences && preferences.high_contrast),
      reduce_motion: Boolean(preferences && preferences.reduce_motion),
    };
    write(KEYS.preferences, value);
    return value;
  }

  function getLastBackupDate() {
    const meta = read(KEYS.backupMeta, {});
    return meta && meta.last_successful_backup ? meta.last_successful_backup : null;
  }

  function markBackupSuccessful() {
    const value = now();
    write(KEYS.backupMeta, { last_successful_backup: value });
    return value;
  }

  function validateImport(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("This file is not a Data Taker backup.");
    }
    const arrayFields = ["clients", "cues", "sessions", "activity_log", "recent_target_sets"];
    arrayFields.forEach((field) => {
      if (data[field] !== undefined && !Array.isArray(data[field])) {
        throw new Error("Backup field '" + field + "' is invalid.");
      }
    });
    if (data.goals !== undefined &&
        (!data.goals || typeof data.goals !== "object" || !Array.isArray(data.goals.domains))) {
      throw new Error("Backup goals are invalid.");
    }
    if (data.target_icons !== undefined &&
        (!data.target_icons || typeof data.target_icons !== "object" || Array.isArray(data.target_icons))) {
      throw new Error("Backup target icons are invalid.");
    }
    if (!["goals", "clients", "cues", "sessions"].some((field) => data[field] !== undefined)) {
      throw new Error("The backup does not contain goals, clients, cues, or sessions.");
    }
    return {
      clients: Array.isArray(data.clients) ? data.clients.length : 0,
      domains: data.goals && Array.isArray(data.goals.domains) ? data.goals.domains.length : 0,
      cues: Array.isArray(data.cues) ? data.cues.length : 0,
      sessions: Array.isArray(data.sessions) ? data.sessions.length : 0,
    };
  }

  function exportAll() {
    return {
      schema_version: 3,
      exported_at: now(),
      goals: getGoals(),
      clients: getClients(),
      cues: getCues(),
      sessions: getSessions(),
      activity_log: read(KEYS.activity, []),
      recent_target_sets: read(KEYS.recentTargetSets, []),
      preferences: getPreferences(),
    };
  }

  function importAll(data) {
    validateImport(data);
    if (data.goals) { write(KEYS.goals, normalizeGoals(data.goals)); }
    if (data.clients) { write(KEYS.clients, data.clients); }
    if (Array.isArray(data.cues)) { write(KEYS.cues, data.cues); }
    if (data.sessions) {
      const known = allTargets(true);
      const sessions = Array.isArray(data.sessions)
        ? data.sessions.map((session) => migrateSession(session, known))
        : [];
      write(KEYS.sessions, sessions);
    }
    if (data.activity_log) { write(KEYS.activity, data.activity_log); }
    if (data.recent_target_sets) { write(KEYS.recentTargetSets, data.recent_target_sets); }
    if (data.preferences) { savePreferences(data.preferences); }
  }

  return {
    getGoals, addDomain, addLongTermGoal, addShortTermGoal, addTarget,
    deleteDomain, deleteLongTermGoal, deleteShortTermGoal, deleteTarget,
    renameGoalNode, duplicateGoalNode, reorderGoalNode, setGoalArchived, describeGoalNode, deleteGoalNode,
    allTargets,
    getClients, addClient,
    getCues, addCue, renameCue, deleteCue,
    getSessions, getPastSessions, getActiveSessions, getSession, getObjectiveDraft, startSession, endSession,
    getRepeatLastSession, getRecentTargetSets,
    getSessionUi, saveSessionUi, clearSessionUi,
    addSessionTarget, renameSessionTarget, addDatapoint, deleteDatapoint,
    getPreferences, savePreferences, getLastBackupDate, markBackupSuccessful,
    validateImport, exportAll, importAll,
  };
})();
