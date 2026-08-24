// Small data-layer extensions for clinician customization.
// Loaded immediately after storage.js so setup/session/review code can share
// the same cue-template and target-icon behavior without external services.

(function () {
  const TARGET_ICON_KEY = "dataTaker.targetIcons.v1";
  const STARTER_CUES = ["Max", "Mod", "Min", "Visual", "Verbal", "Gestural", "Model", "Tactile"];
  const LEGACY_DEFAULT_CUES = ["Max", "Mod", "Min", "Visual", "Verbal", "Tactile"];

  function readIcons() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TARGET_ICON_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function writeIcons(icons) {
    localStorage.setItem(TARGET_ICON_KEY, JSON.stringify(icons));
  }

  function defaultTargetIcon(target) {
    const text = [target && target.domain, target && target.label]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (/voice|pitch|resonance|prosody/.test(text)) { return "🎙️"; }
    if (/fluency|stutter|easy onset|light contact/.test(text)) { return "🌊"; }
    if (/receptive|listen|auditory|hearing/.test(text)) { return "👂"; }
    if (/reading|literacy|decode|phonological awareness/.test(text)) { return "📖"; }
    if (/writing|written/.test(text)) { return "✍️"; }
    if (/language|grammar|pronoun|sentence|expressive/.test(text)) { return "💬"; }
    if (/artic|speech|sound|\/r\/|\/s\//.test(text)) { return "🗣️"; }
    return "🎯";
  }

  function normalizeIcon(icon) {
    const value = String(icon == null ? "" : icon).trim();
    if (!value) { return ""; }
    // Enough room for a multi-codepoint emoji while preventing target labels
    // from being stored in the icon slot.
    return value.slice(0, 16);
  }

  function sameCueSet(cues, labels) {
    if (cues.length !== labels.length) { return false; }
    const actual = cues.map(function (cue) { return cue.label.toLowerCase(); }).sort();
    const expected = labels.map(function (label) { return label.toLowerCase(); }).sort();
    return actual.every(function (label, index) { return label === expected[index]; });
  }

  DataTaker.getStarterCueLabels = function () {
    return STARTER_CUES.slice();
  };

  DataTaker.restoreStarterCues = function () {
    const existing = DataTaker.getCues();
    const labels = new Set(existing.map(function (cue) { return cue.label.toLowerCase(); }));
    STARTER_CUES.forEach(function (label) {
      if (!labels.has(label.toLowerCase())) {
        DataTaker.addCue(label);
        labels.add(label.toLowerCase());
      }
    });
    return DataTaker.getCues();
  };

  // Upgrade only the untouched legacy template. Customized cue lists are left
  // exactly as the clinician configured them.
  if (sameCueSet(DataTaker.getCues(), LEGACY_DEFAULT_CUES)) {
    DataTaker.restoreStarterCues();
  }

  DataTaker.getTargetIcon = function (targetOrId) {
    const target = typeof targetOrId === "object" && targetOrId
      ? targetOrId
      : (DataTaker.allTargets()[targetOrId] || { id: targetOrId });
    const icons = readIcons();
    return icons[target.id] || defaultTargetIcon(target);
  };

  DataTaker.setTargetIcon = function (targetId, icon) {
    if (!targetId) { throw new Error("A target is required."); }
    const icons = readIcons();
    const normalized = normalizeIcon(icon);
    if (normalized) {
      icons[targetId] = normalized;
    } else {
      delete icons[targetId];
    }
    writeIcons(icons);
    return DataTaker.getTargetIcon(targetId);
  };

  DataTaker.getTargetDisplayLabel = function (target) {
    return DataTaker.getTargetIcon(target) + " " + target.label;
  };

  // Include icon preferences in the existing JSON backup without changing the
  // core session schema. Older backups remain valid.
  const originalExportAll = DataTaker.exportAll;
  DataTaker.exportAll = function () {
    return { ...originalExportAll(), target_icons: readIcons() };
  };

  const originalImportAll = DataTaker.importAll;
  DataTaker.importAll = function (data) {
    originalImportAll(data);
    if (data && data.target_icons && typeof data.target_icons === "object" && !Array.isArray(data.target_icons)) {
      writeIcons(data.target_icons);
    }
  };
})();
