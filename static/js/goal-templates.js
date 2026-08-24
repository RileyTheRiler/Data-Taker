// First-run goal onboarding and editable SLP starter templates.
// Loaded before setup.js so a genuinely new installation starts empty.
// Existing localStorage data is never replaced or migrated here.

(function () {
  const GOALS_KEY = "dataTaker.goals.v1";
  const EXISTING_DATA_KEYS = [
    GOALS_KEY,
    "dataTaker.clients.v1",
    "dataTaker.sessions.v1",
    "dataTaker.sessions.v2",
    "dataTaker.activityLog.v1",
    "dataTaker.recentTargetSets.v1",
    "dataTaker.preferences.v1",
    "dataTaker.cues.v1",
  ];

  const hasExistingData = EXISTING_DATA_KEYS.some(function (key) {
    return localStorage.getItem(key) !== null;
  });

  if (!hasExistingData) {
    localStorage.setItem(GOALS_KEY, JSON.stringify({ domains: [] }));
  }

  const TEMPLATES = [
    {
      id: "articulation",
      icon: "🗣️",
      title: "Articulation",
      description: "Speech-sound targets organized from structured practice toward connected speech.",
      domains: [{
        name: "Articulation",
        long_term_goals: [{
          label: "Improve speech-sound accuracy for functional communication",
          short_term_goals: [
            {
              label: "Produce selected sounds in words",
              targets: [
                "Initial /r/ in words",
                "Vocalic /r/ in words",
                "/s/ blends in words",
              ],
            },
            {
              label: "Carry accurate productions into longer utterances",
              targets: ["Selected sound in self-generated sentences"],
            },
          ],
        }],
      }],
    },
    {
      id: "expressive-language",
      icon: "💬",
      title: "Expressive language",
      description: "Editable grammar and sentence-formulation examples.",
      domains: [{
        name: "Expressive Language",
        long_term_goals: [{
          label: "Increase expressive-language accuracy and complexity",
          short_term_goals: [
            {
              label: "Use targeted grammatical forms",
              targets: [
                "Regular past-tense verbs in sentences",
                "Subjective pronouns in sentences",
              ],
            },
            {
              label: "Formulate complete, organized messages",
              targets: ["Complete sentence from a picture or event"],
            },
          ],
        }],
      }],
    },
    {
      id: "receptive-language",
      icon: "👂",
      title: "Receptive language",
      description: "Directions, concepts, and comprehension examples.",
      domains: [{
        name: "Receptive Language",
        long_term_goals: [{
          label: "Improve comprehension for functional and academic activities",
          short_term_goals: [
            {
              label: "Follow spoken directions containing key concepts",
              targets: [
                "Two-step directions",
                "Spatial and temporal concepts in directions",
              ],
            },
            {
              label: "Answer questions about spoken information",
              targets: ["WH questions after a short passage"],
            },
          ],
        }],
      }],
    },
    {
      id: "fluency",
      icon: "🌊",
      title: "Fluency",
      description: "Client-selected fluency strategy and self-advocacy examples.",
      domains: [{
        name: "Fluency",
        long_term_goals: [{
          label: "Support comfortable, effective communication across settings",
          short_term_goals: [
            {
              label: "Use selected speech-management strategies when helpful",
              targets: [
                "Easy onset in short phrases",
                "Light articulatory contact in reading",
                "Intentional pausing in conversation",
              ],
            },
            {
              label: "Communicate preferences and needs",
              targets: ["Self-advocacy statement in a structured scenario"],
            },
          ],
        }],
      }],
    },
    {
      id: "social-communication",
      icon: "🤝",
      title: "Social communication",
      description: "Participation, perspective, and communication-repair examples.",
      domains: [{
        name: "Social Communication",
        long_term_goals: [{
          label: "Increase effective participation in personally relevant interactions",
          short_term_goals: [
            {
              label: "Maintain and repair interactions",
              targets: [
                "Maintain a selected topic across three turns",
                "Request clarification when a message is unclear",
              ],
            },
            {
              label: "Interpret perspectives and context",
              targets: ["Explain two possible perspectives in a scenario"],
            },
          ],
        }],
      }],
    },
    {
      id: "voice",
      icon: "🎙️",
      title: "Voice",
      description: "Client-directed resonance, prosody, and vocal-efficiency examples.",
      domains: [{
        name: "Voice",
        long_term_goals: [{
          label: "Use a comfortable voice that supports the client's communication goals",
          short_term_goals: [
            {
              label: "Practice selected voice features without strain",
              targets: [
                "Resonance pattern in short phrases",
                "Pitch variation in functional sentences",
                "Efficient voicing during a structured task",
              ],
            },
          ],
        }],
      }],
    },
  ];

  function templateTargetCount(template) {
    return template.domains.reduce(function (domainTotal, domain) {
      return domainTotal + domain.long_term_goals.reduce(function (ltgTotal, ltg) {
        return ltgTotal + ltg.short_term_goals.reduce(function (stgTotal, stg) {
          return stgTotal + stg.targets.length;
        }, 0);
      }, 0);
    }, 0);
  }

  function templatePreview(template) {
    const labels = [];
    template.domains.forEach(function (domain) {
      domain.long_term_goals.forEach(function (ltg) {
        ltg.short_term_goals.forEach(function (stg) {
          stg.targets.forEach(function (label) { labels.push(label); });
        });
      });
    });
    return labels.slice(0, 3);
  }

  DataTaker.getGoalTemplates = function () {
    return TEMPLATES.map(function (template) {
      return {
        id: template.id,
        icon: template.icon,
        title: template.title,
        description: template.description,
        target_count: templateTargetCount(template),
        preview: templatePreview(template),
      };
    });
  };

  DataTaker.applyGoalTemplate = function (templateId) {
    const template = TEMPLATES.find(function (item) { return item.id === templateId; });
    if (!template) { throw new Error("Goal template not found."); }

    const created = { template_id: template.id, title: template.title, domain_ids: [], target_ids: [] };
    template.domains.forEach(function (domainTemplate) {
      const domain = DataTaker.addDomain(domainTemplate.name);
      created.domain_ids.push(domain.id);
      domainTemplate.long_term_goals.forEach(function (ltgTemplate) {
        const ltg = DataTaker.addLongTermGoal(domain.id, ltgTemplate.label);
        ltgTemplate.short_term_goals.forEach(function (stgTemplate) {
          const stg = DataTaker.addShortTermGoal(domain.id, ltg.id, stgTemplate.label);
          stgTemplate.targets.forEach(function (targetLabel) {
            const target = DataTaker.addTarget(domain.id, ltg.id, stg.id, targetLabel);
            created.target_ids.push(target.id);
          });
        });
      });
    });
    return created;
  };
})();
