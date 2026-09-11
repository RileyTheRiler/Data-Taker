# Data Taker — SLP Clinical Data Collection (Practice Tool)

A rapid-entry, **trial-by-trial** data collection web app for Speech-Language
Pathology (SLP) practicum work. It adapts the granular behavioral-tracking style
of platforms like Central Reach into an SLP-specific workflow: tap out
correct/incorrect trials against a hierarchy of clinical targets, with SLP cueing
levels, a live accuracy dashboard, and automatic session timing for practicum-hour
logging.

> ⚠️ **Educational practice tool only.** This app is **not** for real clinical use.
> It stores **no PHI** and has **no database** — "clients" are anonymized free-text
> labels (e.g. "Client A"). Never enter a real name or any identifying information.

## Features (this build)

- **Goal hierarchy** — Domains → Long-Term Goals → Short-Term Goals → Targets,
  seeded with SLP examples (Articulation, Fluency, Language).
- **Session engine** — start/end a session with an auto-running timer; total
  duration is computed for ASHA practicum-hour logging.
- **Mobile-first data entry** — anonymized client header, a swipeable/tappable
  carousel of the session's targets, and two massive **+ / −** tap buttons.
- **SLP cueing toggles** — Max, Mod, Min, Visual, Verbal, Tactile (replacing ABA
  prompt vocabulary). Arm cues before a tap; they attach to the recorded trial and
  persist for fast repeated entries.
- **Session notes** — a free-text notes field is always on the session screen;
  it autosaves as you type and stays editable after the session ends, for the
  post-session write-up.
- **Real-time dashboard** — running % accuracy for the active target and overall,
  plus a scrolling **last-5** trial log with one-tap **undo** for error correction.
- **Activity log** — a lightweight ledger (`data/activity_log.json`) recording
  create/modify/delete actions (a simplified stand-in for an audit trail).

## Tech stack

| Layer    | Technology              |
|----------|-------------------------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Backend  | Python (Flask)          |
| Storage  | Local JSON files (no DB) |

All data I/O goes through `storage.py`, the single choke point — so a future swap
to a real database would only touch that one module.

## Project structure

```
app.py                 # Flask routes (pages) + JSON API
storage.py             # JSON load/save helpers (atomic writes)
requirements.txt
data/
  goals.json           # seeded goal hierarchy
  clients.json         # anonymized client labels
  sessions.json        # sessions + embedded datapoints
  activity_log.json    # action ledger
templates/             # base / index / session pages
static/css/style.css   # mobile-first styling
static/js/setup.js     # home page (pick client + targets)
static/js/app.js       # live session screen
```

## Running it

```bash
pip install -r requirements.txt
python app.py
```

Then open <http://localhost:5000>. It's designed for phones/tablets — use your
browser's device emulation (e.g. Chrome DevTools → toggle device toolbar) to feel
the large touch targets.

### Quick walkthrough

1. **Home:** pick a client label (or add one), tap targets to add them to the
   session, then **Start Session**.
2. **Session:** the timer runs automatically. Arm cueing chips, then tap **+** or
   **−**. Swipe the carousel (or use the arrows) to switch targets. Watch the live
   accuracy and the last-5 log; tap **×** to undo a mis-tap. Jot anything you
   need in **Session notes** — it saves itself a moment after you stop typing.
3. **End** the session to see the total duration for hour logging.

## API

| Method & path | Purpose |
|---|---|
| `GET /api/goals` | Full goal hierarchy |
| `GET /api/clients` · `POST /api/clients` | List / add anonymized client label |
| `POST /api/sessions` | Start a session (`client_label`, `target_ids`) |
| `GET /api/sessions/<id>` | Session data + computed accuracy |
| `POST /api/sessions/<id>/end` | End session, return duration |
| `PUT /api/sessions/<id>/notes` | Save the session's free-text notes (`notes`) |
| `POST /api/sessions/<id>/datapoints` | Record a trial (`target_id`, `result`, `prompt_levels`) |
| `DELETE /api/sessions/<id>/datapoints/<dp_id>` | Undo / error-correct a trial |

## Future work (deferred)

These were part of the original master plan and are intentionally **out of scope**
for this build, but the data model (timestamps, prompt levels, session timing,
accuracy aggregation) is rich enough to layer them on later:

- Automated **SOAP note** drafting (auto-populate the Objective section).
- **ASHA practicum categorization** & export (adult vs. pediatric, eval vs. treatment).
- **Supervisor review** / signature workflow with flagging.
- Authentication & roles, a real database, and any PHI-handling / HIPAA layer
  (only if the project ever moves beyond educational use).
