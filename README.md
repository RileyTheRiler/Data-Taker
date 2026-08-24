# Data Taker — SLP Clinical Data Collection (Practice Tool)

A rapid-entry, **trial-by-trial** data collection web app for Speech-Language
Pathology (SLP) practicum work. It adapts the granular behavioral-tracking style
of platforms like Central Reach into an SLP-specific workflow: tap out
correct/incorrect trials against a hierarchy of clinical targets, with SLP cueing
levels, a live accuracy dashboard, and automatic session timing for practicum-hour
logging.

> ⚠️ **Educational practice tool only.** This app is **not** for real clinical use.
> It stores **no PHI** and has **no server-side database** — "clients" are
> anonymized free-text labels (e.g. "Client A"). Never enter a real name or any
> identifying information.

## Features (this build)

- **Runs entirely client-side** — a static site, deployable to Vercel with zero
  configuration and no backend/database to provision. All data (goals, clients,
  sessions, trials) lives in the browser's `localStorage`; nothing is uploaded.
- **Organized home workspace** — Start, Sessions, Goals, and Settings are
  accessible, directly linkable sections. Start stays focused on resuming or
  beginning treatment; history, administration, and goal maintenance no longer
  compete in one long card sequence.
- **Custom goals** — the Domain → Long-Term Goal → Short-Term Goal → Target
  hierarchy ships with SLP starter examples and supports add, inline rename,
  duplicate, within-parent reorder, archive/restore, and confirmed permanent
  deletion. Stable IDs survive all non-delete edits. Archived items stay
  available to historical snapshots but do not appear in new-session setup.
- **Backup / restore** — export the whole local dataset to JSON. Imports are
  validated, summarized, and confirmed before replacement; the app downloads a
  safety backup first when browser support permits and reports results inline.
- **Appearance settings** — follow the device theme or explicitly choose Light
  or Dark mode, then select Calm Teal, Ocean Blue, Soft Violet, or Warm Rose.
  The browser-local choice applies before each page renders, is included in
  backups, and preserves high-contrast and reduced-motion preferences.
- **Session engine** — start/end a session with an auto-running timer; total
  duration is computed for ASHA practicum-hour logging. Configured targets can
  be added during an active session, and the current target label can be edited
  without detaching any recorded trials. Unfinished sessions remain recoverable
  from the home screen, including the active target and armed cue state.
- **Session history** — ended sessions are listed by anonymized client with
  client filtering, newest/oldest sorting, search, duration, total trials,
  overall accuracy, expandable per-target results, and direct Review/Objective
  actions. Target labels and goal paths are snapshotted so later goal edits do
  not rewrite history.
- **Per-target progress** — open a target directly from setup, session history,
  an ended session, or its review page. The client-scoped progress screen plots
  that stable target's accuracy across ended sessions, shows the current label
  and goal path, summarizes change and total trials, and provides an exact
  session table with review links. The dependency-free SVG remains usable
  offline and does not treat a session with no target trials as 0% accuracy.
- **Fast setup** — repeat the selected client's last session or reuse recent
  target sets by stable target ID, search configured targets and goal paths,
  then review an icon-labeled selected-target tray before starting. Deleted and
  archived targets are reported and never silently substituted.
- **Objective draft** — review any ended session and generate an editable
  Objective paragraph from duration, accuracy, independence, and recorded cueing.
  Download the edited draft as text or use the browser print sheet to save a PDF.
  The app clearly prompts the clinician to add activities, skilled interventions,
  and client response rather than inventing details that were not recorded.
- **Mobile & iPad-first** — anonymized client header, a swipeable/tappable
  target strip, persistent **+ / −** data-entry dock on phones, split workspace
  on tablets, large touch targets, and an
  installable PWA (Add to Home Screen on iPad/iPhone for a full-screen,
  app-like experience — see `manifest.json`).
- **Structured SLP cueing** — Independent/Minimal/Moderate/Maximum behave as one
  mutually exclusive assistance level, while Visual, Verbal, Gestural, Model,
  Tactile, and custom cue types can be combined. Clinicians can hold cues for
  repeated trials or clear them automatically after each response. Later cue
  edits do not rewrite old trials.
- **Real-time dashboard** — running % accuracy for the active target and overall,
  plus a scrolling **last-5** trial log with one-tap **undo** for error correction.
- **Activity log** — a lightweight ledger (`dataTaker.activityLog.v1` in
  `localStorage`) recording create/modify/delete actions (a simplified stand-in
  for an audit trail).

## Tech stack

| Layer    | Technology                          |
|----------|--------------------------------------|
| Frontend | HTML5, CSS3, Vanilla JS             |
| Storage  | Browser `localStorage` (no server)  |
| Hosting  | Static site (Vercel-ready)          |

All data I/O goes through `static/js/storage.js`, the single choke point — so a
future swap to a real backend (e.g. for multi-device sync) would only touch
that one module and the fetch-style calls made from `setup.js` / `app.js`.

## Project structure

```
index.html              # Start / Sessions / Goals / Settings workspace
session.html            # Live session screen
review.html             # Ended-session review and Objective draft export
progress.html           # Client/target longitudinal accuracy explorer
manifest.json           # PWA manifest (Add to Home Screen on iPad/iPhone)
vercel.json             # Static hosting config (clean URLs, cache headers)
static/css/style.css    # Mobile-first styling
static/js/appearance.js # Early light/dark and color-template application
static/js/storage.js    # localStorage data layer (goals/clients/sessions/backup)
static/js/setup.js      # Home page logic
static/js/app.js        # Live session screen logic
static/js/review.js     # Review screen and text/PDF export logic
static/js/progress.js   # Per-target history chart and exact data table
static/icons/           # App icons (favicon, apple-touch-icon, PWA icons)
```

## Running it locally

No build step or server required — just serve the static files, e.g.:

```bash
python3 -m http.server 5000
```

Then open <http://localhost:5000>. It's designed for phones/tablets — use your
browser's device emulation (e.g. Chrome DevTools → toggle device toolbar) to feel
the large touch targets.

## Deploying to Vercel

This is a static site, so deployment is zero-config:

1. Push this repo to GitHub (or connect it directly).
2. In Vercel, "Add New Project" → import the repo. No framework preset, build
   command, or environment variables are needed.
3. Deploy. Vercel serves `index.html`, `session.html`, and `static/` as-is.

On an iPad or iPhone, open the deployed URL in Safari and use **Share → Add to
Home Screen** to install it as a full-screen app (per `manifest.json`).

### Quick walkthrough

1. **Start:** pick an anonymized client label, repeat a prior target set or
   search/select targets, review the selected-target tray, then **Start Session**.
   Use the bottom navigation for **Sessions**, **Goals**, and **Settings**.
2. **Session:** the timer runs automatically. Arm cueing chips, then tap **+** or
   **−**. Swipe the carousel (or use the arrows) to switch targets. Watch the live
   accuracy and the last-5 log; tap **×** to undo a mis-tap.
3. **End** the session to see its summary, open target progress, or edit and
   export an Objective draft from the review screen.

## Data model (localStorage keys)

| Key | Contents |
|---|---|
| `dataTaker.goals.v1` | The goal hierarchy (domains → LTGs → STGs → targets) |
| `dataTaker.clients.v1` | Anonymized client labels |
| `dataTaker.cues.v1` | Editable cue type labels |
| `dataTaker.sessions.v2` | Sessions + embedded datapoints + target metadata snapshots |
| `dataTaker.activityLog.v1` | Action ledger |
| `dataTaker.recentTargetSets.v1` | Recent stable target-ID sets by anonymized client label |
| `dataTaker.preferences.v1` | Supported accessibility preferences |
| `dataTaker.backupMeta.v1` | Last successful backup timestamp |

Use the **Export backup** / **Import backup** buttons on the home page to move
this data between devices or back it up before clearing site data.

Session data migrates automatically from `dataTaker.sessions.v1` to `.v2` on
first load. The original `.v1` key remains untouched as a recovery copy. Goal
objects are normalized in place so older backups gain archive/order defaults
without changing existing IDs. Current exports use backup schema version 3;
older backups remain importable.

## Future work (deferred)

These were part of the original master plan and are intentionally **out of scope**
for this build, but the data model (timestamps, prompt levels, session timing,
accuracy aggregation) is rich enough to layer them on later:

- **ASHA practicum categorization** & export (adult vs. pediatric, eval vs. treatment).
- **Supervisor review** / signature workflow with flagging.
- **Multi-device sync** via a real backend/database — only if the project ever
  needs data shared across devices (still no PHI/HIPAA scope intended).
- Authentication & roles, and any PHI-handling / HIPAA layer (only if the
  project ever moves beyond educational use).
