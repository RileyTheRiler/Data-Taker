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
- **Custom goals** — the Domain → Long-Term Goal → Short-Term Goal → Target
  hierarchy ships with SLP starter examples (Articulation, Fluency, Language),
  but a "Manage goals" panel lets you add and delete your own at every level —
  the starter examples can be edited away too.
- **Backup / restore** — export the whole local dataset to a JSON file and
  re-import it (useful before clearing browser data or moving devices, since
  everything is device-local).
- **Session engine** — start/end a session with an auto-running timer; total
  duration is computed for ASHA practicum-hour logging. Configured targets can
  be added during an active session, and the current target label can be edited
  without detaching any recorded trials.
- **Session history** — ended sessions are listed by anonymized client with
  duration, overall accuracy, and expandable per-target accuracy. Target labels
  and goal paths are snapshotted so later goal edits do not rewrite history.
- **Mobile & iPad-first** — anonymized client header, a swipeable/tappable
  carousel of the session's targets, large **+ / −** tap buttons, and an
  installable PWA (Add to Home Screen on iPad/iPhone for a full-screen,
  app-like experience — see `manifest.json`).
- **SLP cueing toggles** — Max, Mod, Min, Visual, Verbal, Tactile (replacing ABA
  prompt vocabulary) are included by default. Cue types can be added, renamed,
  or deleted on the home page. Arm cues before a tap; they attach to the recorded
  trial and persist for fast repeated entries. Later cue edits do not rewrite old trials.
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
index.html              # Home page (choose client, manage goals, pick targets)
session.html            # Live session screen
manifest.json           # PWA manifest (Add to Home Screen on iPad/iPhone)
vercel.json             # Static hosting config (clean URLs, cache headers)
static/css/style.css    # Mobile-first styling
static/js/storage.js    # localStorage data layer (goals/clients/sessions/backup)
static/js/setup.js      # Home page logic
static/js/app.js        # Live session screen logic
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

1. **Home:** pick a client label (or add one). Optionally tap **Manage goals**
   to add/remove domains, goals, and targets. Tap targets to add them to the
   session, then **Start Session**.
2. **Session:** the timer runs automatically. Arm cueing chips, then tap **+** or
   **−**. Swipe the carousel (or use the arrows) to switch targets. Watch the live
   accuracy and the last-5 log; tap **×** to undo a mis-tap.
3. **End** the session to see the total duration for hour logging.

## Data model (localStorage keys)

| Key | Contents |
|---|---|
| `dataTaker.goals.v1` | The goal hierarchy (domains → LTGs → STGs → targets) |
| `dataTaker.clients.v1` | Anonymized client labels |
| `dataTaker.cues.v1` | Editable cue type labels |
| `dataTaker.sessions.v2` | Sessions + embedded datapoints + target metadata snapshots |
| `dataTaker.activityLog.v1` | Action ledger |

Use the **Export backup** / **Import backup** buttons on the home page to move
this data between devices or back it up before clearing site data.

Session data migrates automatically from `dataTaker.sessions.v1` to `.v2` on
first load. The original `.v1` key remains untouched as a recovery copy.

## Future work (deferred)

These were part of the original master plan and are intentionally **out of scope**
for this build, but the data model (timestamps, prompt levels, session timing,
accuracy aggregation) is rich enough to layer them on later:

- Automated **SOAP note** drafting (auto-populate the Objective section).
- **ASHA practicum categorization** & export (adult vs. pediatric, eval vs. treatment).
- **Supervisor review** / signature workflow with flagging.
- **Multi-device sync** via a real backend/database — only if the project ever
  needs data shared across devices (still no PHI/HIPAA scope intended).
- Authentication & roles, and any PHI-handling / HIPAA layer (only if the
  project ever moves beyond educational use).
