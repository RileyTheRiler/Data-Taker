"""Thin JSON-file persistence layer.

This module is the single choke point for all data I/O. There is intentionally
NO database: this is an educational practice tool and no PHI is ever stored.
Keeping every read/write here means a future swap to a real database would only
touch this file.
"""

import json
import os
import tempfile
import threading

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# Serialize writes so concurrent requests can't corrupt a JSON file.
_LOCK = threading.Lock()


def _path(name):
    return os.path.join(DATA_DIR, name)


def load(name, default=None):
    """Load a JSON file from the data directory, returning ``default`` if missing."""
    path = _path(name)
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save(name, data):
    """Atomically write ``data`` as JSON to the named file in the data directory."""
    os.makedirs(DATA_DIR, exist_ok=True)
    path = _path(name)
    with _LOCK:
        # Write to a temp file in the same dir, then os.replace for atomicity.
        fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2)
            os.replace(tmp, path)
        except Exception:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise


# --- Convenience accessors for the specific files this app uses ---------------

def get_goals():
    return load("goals.json", default={"domains": []})


def get_clients():
    return load("clients.json", default=[])


def save_clients(clients):
    save("clients.json", clients)


def get_sessions():
    return load("sessions.json", default=[])


def save_sessions(sessions):
    save("sessions.json", sessions)


def append_activity(action, entity, entity_id):
    """Append a record to the lightweight activity ledger (audit-lite)."""
    from datetime import datetime, timezone

    log = load("activity_log.json", default=[])
    log.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
        }
    )
    save("activity_log.json", log)
