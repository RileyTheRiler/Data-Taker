"""Clinical Data Collection App — Flask backend.

A rapid-entry, trial-by-trial data collection tool for Speech-Language Pathology
(SLP) practicum work. EDUCATIONAL PRACTICE ONLY — no real database and no PHI is
ever stored. "Clients" are anonymized free-text labels (e.g. "Client A").
"""

import uuid
from datetime import datetime, timezone

from flask import Flask, abort, jsonify, render_template, request

import storage

app = Flask(__name__)

# Valid SLP cueing / prompting levels (replaces the ABA prompt vocabulary).
PROMPT_LEVELS = {"Max", "Mod", "Min", "Visual", "Verbal", "Tactile"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _find_session(sessions, session_id):
    for s in sessions:
        if s["id"] == session_id:
            return s
    return None


def _all_targets():
    """Flatten the goal hierarchy into {target_id: {label, path}}."""
    targets = {}
    goals = storage.get_goals()
    for domain in goals.get("domains", []):
        for ltg in domain.get("long_term_goals", []):
            for stg in ltg.get("short_term_goals", []):
                for target in stg.get("targets", []):
                    targets[target["id"]] = {
                        "id": target["id"],
                        "label": target["label"],
                        "domain": domain["name"],
                        "long_term_goal": ltg["label"],
                        "short_term_goal": stg["label"],
                    }
    return targets


def _accuracy(datapoints):
    """Return (correct, total, percent) for a list of datapoints."""
    total = len(datapoints)
    correct = sum(1 for dp in datapoints if dp["result"] == "+")
    percent = round(100 * correct / total) if total else 0
    return correct, total, percent


def _session_view(session):
    """Augment a stored session with computed accuracy and target metadata."""
    all_targets = _all_targets()
    datapoints = session.get("datapoints", [])

    per_target = {}
    for tid in session.get("target_ids", []):
        tdps = [dp for dp in datapoints if dp["target_id"] == tid]
        correct, total, percent = _accuracy(tdps)
        meta = all_targets.get(tid, {"id": tid, "label": tid})
        per_target[tid] = {
            **meta,
            "correct": correct,
            "total": total,
            "percent": percent,
        }

    overall_correct, overall_total, overall_percent = _accuracy(datapoints)

    duration_seconds = None
    if session.get("end_time"):
        start = datetime.fromisoformat(session["start_time"])
        end = datetime.fromisoformat(session["end_time"])
        duration_seconds = int((end - start).total_seconds())

    return {
        **session,
        "targets": [per_target[tid] for tid in session.get("target_ids", [])],
        "overall": {
            "correct": overall_correct,
            "total": overall_total,
            "percent": overall_percent,
        },
        "duration_seconds": duration_seconds,
    }


# --- Pages --------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/session/<session_id>")
def session_page(session_id):
    sessions = storage.get_sessions()
    if _find_session(sessions, session_id) is None:
        abort(404)
    return render_template("session.html", session_id=session_id)


# --- API: goals & clients -----------------------------------------------------

@app.route("/api/goals")
def api_goals():
    return jsonify(storage.get_goals())


@app.route("/api/clients", methods=["GET"])
def api_clients():
    return jsonify(storage.get_clients())


@app.route("/api/clients", methods=["POST"])
def api_add_client():
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "").strip()
    if not label:
        return jsonify({"error": "A client label is required."}), 400

    clients = storage.get_clients()
    if any(c["label"].lower() == label.lower() for c in clients):
        return jsonify({"error": "That client label already exists."}), 409

    client = {"id": uuid.uuid4().hex, "label": label}
    clients.append(client)
    storage.save_clients(clients)
    storage.append_activity("create", "client", client["id"])
    return jsonify(client), 201


# --- API: sessions ------------------------------------------------------------

@app.route("/api/sessions", methods=["POST"])
def api_start_session():
    data = request.get_json(silent=True) or {}
    client_label = (data.get("client_label") or "").strip()
    target_ids = data.get("target_ids") or []

    if not client_label:
        return jsonify({"error": "A client label is required."}), 400
    if not target_ids:
        return jsonify({"error": "Select at least one target."}), 400

    known = _all_targets()
    invalid = [t for t in target_ids if t not in known]
    if invalid:
        return jsonify({"error": "Unknown target(s): %s" % ", ".join(invalid)}), 400

    session = {
        "id": uuid.uuid4().hex,
        "client_label": client_label,
        "target_ids": target_ids,
        "start_time": _now(),
        "end_time": None,
        "datapoints": [],
    }
    sessions = storage.get_sessions()
    sessions.append(session)
    storage.save_sessions(sessions)
    storage.append_activity("create", "session", session["id"])
    return jsonify(_session_view(session)), 201


@app.route("/api/sessions/<session_id>", methods=["GET"])
def api_get_session(session_id):
    session = _find_session(storage.get_sessions(), session_id)
    if session is None:
        abort(404)
    return jsonify(_session_view(session))


@app.route("/api/sessions/<session_id>/end", methods=["POST"])
def api_end_session(session_id):
    sessions = storage.get_sessions()
    session = _find_session(sessions, session_id)
    if session is None:
        abort(404)
    if not session.get("end_time"):
        session["end_time"] = _now()
        storage.save_sessions(sessions)
        storage.append_activity("modify", "session", session_id)
    return jsonify(_session_view(session))


@app.route("/api/sessions/<session_id>/datapoints", methods=["POST"])
def api_add_datapoint(session_id):
    sessions = storage.get_sessions()
    session = _find_session(sessions, session_id)
    if session is None:
        abort(404)
    if session.get("end_time"):
        return jsonify({"error": "Session has ended; cannot add data."}), 409

    data = request.get_json(silent=True) or {}
    target_id = data.get("target_id")
    result = data.get("result")
    prompts = data.get("prompt_levels") or []

    if target_id not in session["target_ids"]:
        return jsonify({"error": "Target is not part of this session."}), 400
    if result not in ("+", "-"):
        return jsonify({"error": "Result must be '+' or '-'."}), 400
    prompts = [p for p in prompts if p in PROMPT_LEVELS]

    datapoint = {
        "id": uuid.uuid4().hex,
        "target_id": target_id,
        "result": result,
        "prompt_levels": prompts,
        "timestamp": _now(),
    }
    session["datapoints"].append(datapoint)
    storage.save_sessions(sessions)
    storage.append_activity("create", "datapoint", datapoint["id"])
    return jsonify(_session_view(session)), 201


@app.route("/api/sessions/<session_id>/datapoints/<datapoint_id>", methods=["DELETE"])
def api_delete_datapoint(session_id, datapoint_id):
    sessions = storage.get_sessions()
    session = _find_session(sessions, session_id)
    if session is None:
        abort(404)

    before = len(session["datapoints"])
    session["datapoints"] = [
        dp for dp in session["datapoints"] if dp["id"] != datapoint_id
    ]
    if len(session["datapoints"]) == before:
        abort(404)

    storage.save_sessions(sessions)
    storage.append_activity("delete", "datapoint", datapoint_id)
    return jsonify(_session_view(session))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
