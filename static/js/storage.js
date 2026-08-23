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
    sessions: "dataTaker.sessions.v1",
    activity: "dataTaker.activityLog.v1",
  };

  const PROMPT_LEVELS = new Set(["Max", "Mod", "Min", "Visual", "Verbal", "Tactile"]);

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
      write(KEYS.goals, goals);
    }
    return goals;
  }

  function saveGoals(goals) {
    write(KEYS.goals, goals);
  }

  function addDomain(name) {
    const goals = getGoals();
    const domain = { id: "domain-" + uid(), name: name, long_term_goals: [] };
    goals.domains.push(domain);
    saveGoals(goals);
    appendActivity("create", "domain", domain.id);
    return domain;
  }

  function addLongTermGoal(domainId, label) {
    const goals = getGoals();
    const domain = goals.domains.find((d) => d.id === domainId);
    if (!domain) { throw new Error("Unknown domain."); }
    const ltg = { id: "ltg-" + uid(), label: label, short_term_goals: [] };
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
    const stg = { id: "stg-" + uid(), label: label, targets: [] };
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
    const target = { id: "tgt-" + uid(), label: label };
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

  function allTargets() {
    const targets = {};
    getGoals().domains.forEach((domain) => {
      domain.long_term_goals.forEach((ltg) => {
        ltg.short_term_goals.forEach((stg) => {
          stg.targets.forEach((target) => {
            targets[target.id] = {
              id: target.id,
              label: target.label,
              domain: domain.name,
              long_term_goal: ltg.label,
              short_term_goal: stg.label,
            };
          });
        });
      });
    });
    return targets;
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

  // ---------- Sessions ----------

  function getSessions() {
    return read(KEYS.sessions, []);
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
    const known = allTargets();
    const datapoints = session.datapoints || [];

    const targets = (session.target_ids || []).map((tid) => {
      const tdps = datapoints.filter((dp) => dp.target_id === tid);
      const acc = accuracy(tdps);
      const meta = known[tid] || { id: tid, label: tid };
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

  function startSession(clientLabel, targetIds) {
    clientLabel = (clientLabel || "").trim();
    if (!clientLabel) { throw new Error("A client label is required."); }
    if (!targetIds || !targetIds.length) { throw new Error("Select at least one target."); }

    const known = allTargets();
    const invalid = targetIds.filter((t) => !known[t]);
    if (invalid.length) { throw new Error("Unknown target(s): " + invalid.join(", ")); }

    const session = {
      id: uid(),
      client_label: clientLabel,
      target_ids: targetIds,
      start_time: now(),
      end_time: null,
      datapoints: [],
    };
    const sessions = getSessions();
    sessions.push(session);
    saveSessions(sessions);
    appendActivity("create", "session", session.id);
    return sessionView(session);
  }

  function getSession(id) {
    const session = findSession(getSessions(), id);
    if (!session) { throw new Error("Session not found."); }
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
    return sessionView(session);
  }

  function addDatapoint(id, targetId, result, promptLevels) {
    const sessions = getSessions();
    const session = findSession(sessions, id);
    if (!session) { throw new Error("Session not found."); }
    if (session.end_time) { throw new Error("Session has ended; cannot add data."); }
    if (!session.target_ids.includes(targetId)) { throw new Error("Target is not part of this session."); }
    if (result !== "+" && result !== "-") { throw new Error("Result must be '+' or '-'."); }

    const prompts = (promptLevels || []).filter((p) => PROMPT_LEVELS.has(p));
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

  function exportAll() {
    return {
      exported_at: now(),
      goals: getGoals(),
      clients: getClients(),
      sessions: getSessions(),
      activity_log: read(KEYS.activity, []),
    };
  }

  function importAll(data) {
    if (!data || typeof data !== "object") { throw new Error("Invalid backup file."); }
    if (data.goals) { write(KEYS.goals, data.goals); }
    if (data.clients) { write(KEYS.clients, data.clients); }
    if (data.sessions) { write(KEYS.sessions, data.sessions); }
    if (data.activity_log) { write(KEYS.activity, data.activity_log); }
  }

  return {
    getGoals, addDomain, addLongTermGoal, addShortTermGoal, addTarget,
    deleteDomain, deleteLongTermGoal, deleteShortTermGoal, deleteTarget,
    allTargets,
    getClients, addClient,
    getSessions, getSession, startSession, endSession, addDatapoint, deleteDatapoint,
    exportAll, importAll,
  };
})();
