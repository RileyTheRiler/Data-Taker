// Apply browser-local appearance preferences before styles render.

(function () {
  const STORAGE_KEY = "dataTaker.preferences.v1";
  const MODES = new Set(["system", "light", "dark"]);
  const COLOR_THEMES = new Set(["teal", "ocean", "violet", "rose"]);
  const THEME_COLORS = {
    teal: { light: "#0f766e", dark: "#115e59" },
    ocean: { light: "#1d4ed8", dark: "#1e40af" },
    violet: { light: "#6d28d9", dark: "#5b21b6" },
    rose: { light: "#be123c", dark: "#9f1239" },
  };
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let currentPreferences = null;

  function normalize(preferences) {
    const value = preferences && typeof preferences === "object" ? preferences : {};
    return {
      appearance_mode: MODES.has(value.appearance_mode) ? value.appearance_mode : "system",
      color_theme: COLOR_THEMES.has(value.color_theme) ? value.color_theme : "teal",
    };
  }

  function storedPreferences() {
    try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")); }
    catch (_error) { return normalize({}); }
  }

  function resolvedMode(mode) {
    return mode === "system" ? (media.matches ? "dark" : "light") : mode;
  }

  function syncThemeColor(mode, colorTheme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.content = THEME_COLORS[colorTheme][mode]; }
  }

  function apply(preferences) {
    currentPreferences = normalize(preferences);
    const mode = resolvedMode(currentPreferences.appearance_mode);
    const root = document.documentElement;
    root.dataset.appearanceMode = currentPreferences.appearance_mode;
    root.dataset.theme = mode;
    root.dataset.colorTheme = currentPreferences.color_theme;
    root.style.colorScheme = mode;
    syncThemeColor(mode, currentPreferences.color_theme);
    return { ...currentPreferences, resolved_mode: mode };
  }

  function systemChanged() {
    if (currentPreferences && currentPreferences.appearance_mode === "system") {
      apply(currentPreferences);
    }
  }

  if (media.addEventListener) { media.addEventListener("change", systemChanged); }
  else if (media.addListener) { media.addListener(systemChanged); }

  window.DataTakerAppearance = { apply: apply, normalize: normalize };
  apply(storedPreferences());
})();
