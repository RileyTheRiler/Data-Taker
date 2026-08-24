// Client- and target-scoped longitudinal progress. Data stays behind DataTaker.

const progressClient = document.getElementById("progress-client");
const progressTarget = document.getElementById("progress-target");
const progressResult = document.getElementById("progress-result");
const progressEmpty = document.getElementById("progress-empty");
const requestedProgress = new URLSearchParams(window.location.search);
const SVG_NS = "http://www.w3.org/2000/svg";

function makeProgressSvg(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs || {}).forEach(function ([key, value]) {
    node.setAttribute(key, String(value));
  });
  return node;
}

function progressDate(isoDate, short) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) { return "Date unavailable"; }
  return new Intl.DateTimeFormat(undefined, short
    ? { month: "short", day: "numeric" }
    : { dateStyle: "medium" }).format(date);
}

function setProgressEmpty(title, message) {
  progressResult.classList.add("hidden");
  document.getElementById("progress-empty-title").textContent = title;
  document.getElementById("progress-empty-message").textContent = message;
  progressEmpty.classList.remove("hidden");
}

function endedClientLabels() {
  const labels = new Map();
  DataTaker.getClients().forEach(function (client) {
    labels.set(client.label.toLowerCase(), client.label);
  });
  DataTaker.getEndedSessions().forEach(function (session) {
    if (session.client_label) { labels.set(session.client_label.toLowerCase(), session.client_label); }
  });
  return Array.from(labels.values()).sort((a, b) => a.localeCompare(b));
}

function clientTargets(clientLabel) {
  const targets = new Map();
  DataTaker.getPastSessions(clientLabel).forEach(function (session) {
    session.targets.forEach(function (target) {
      if (!targets.has(target.id)) { targets.set(target.id, target); }
    });
  });
  return Array.from(targets.values()).sort(function (a, b) {
    return [a.domain, a.short_term_goal, a.label].join("\n")
      .localeCompare([b.domain, b.short_term_goal, b.label].join("\n"));
  });
}

function updateProgressUrl() {
  const params = new URLSearchParams();
  if (progressClient.value) { params.set("client", progressClient.value); }
  if (progressTarget.value) { params.set("target", progressTarget.value); }
  history.replaceState(null, "", "/progress.html" + (params.toString() ? "?" + params.toString() : ""));
}

function renderTargetProgressChart(history) {
  const container = document.getElementById("target-progress-chart");
  container.innerHTML = "";
  const points = history.sessions.filter((session) => session.total > 0);
  if (!points.length) {
    const empty = document.createElement("p");
    empty.className = "summary-chart-empty";
    empty.textContent = "No trials were recorded for this target.";
    container.appendChild(empty);
    return;
  }

  const width = 560;
  const height = 250;
  const left = 44;
  const right = 16;
  const top = 18;
  const bottom = 42;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const svg = makeProgressSvg("svg", {
    class: "progress-svg",
    viewBox: "0 0 " + width + " " + height,
    role: "img",
    "aria-label": history.target.label + " accuracy across " + points.length +
      " ended session" + (points.length === 1 ? "" : "s"),
  });

  [0, 25, 50, 75, 100].forEach(function (value) {
    const y = top + innerHeight - (value / 100) * innerHeight;
    svg.appendChild(makeProgressSvg("line", {
      x1: left, y1: y, x2: width - right, y2: y, class: "progress-grid",
    }));
    const label = makeProgressSvg("text", {
      x: left - 8, y: y + 4, class: "progress-axis-label", "text-anchor": "end",
    });
    label.textContent = value + "%";
    svg.appendChild(label);
  });

  const coordinates = points.map(function (point, index) {
    const x = points.length === 1
      ? left + innerWidth / 2
      : left + (index / (points.length - 1)) * innerWidth;
    const y = top + innerHeight - (point.percent / 100) * innerHeight;
    return { x, y, point };
  });
  if (coordinates.length > 1) {
    svg.appendChild(makeProgressSvg("polyline", {
      points: coordinates.map((item) => item.x + "," + item.y).join(" "),
      class: "progress-line",
      fill: "none",
    }));
  }
  coordinates.forEach(function (item, index) {
    const circle = makeProgressSvg("circle", {
      cx: item.x, cy: item.y, r: 6, class: "progress-point",
    });
    const title = makeProgressSvg("title");
    title.textContent = progressDate(item.point.end_time, false) + ": " + item.point.percent +
      "% (" + item.point.correct + "/" + item.point.total + ")";
    circle.appendChild(title);
    svg.appendChild(circle);

    if (points.length <= 7 || index === 0 || index === points.length - 1 ||
        index % Math.ceil(points.length / 6) === 0) {
      const dateLabel = makeProgressSvg("text", {
        x: item.x,
        y: height - 13,
        class: "progress-axis-label",
        "text-anchor": index === 0 && points.length > 1
          ? "start"
          : (index === points.length - 1 && points.length > 1 ? "end" : "middle"),
      });
      dateLabel.textContent = progressDate(item.point.end_time, true);
      svg.appendChild(dateLabel);
    }
  });
  container.appendChild(svg);
}

function renderProgressTable(history) {
  const body = document.getElementById("progress-table-body");
  body.innerHTML = "";
  history.sessions.slice().reverse().forEach(function (session) {
    const row = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = progressDate(session.end_time, false);
    const correct = document.createElement("td");
    correct.textContent = String(session.correct);
    const total = document.createElement("td");
    total.textContent = String(session.total);
    const accuracy = document.createElement("td");
    accuracy.textContent = session.total ? session.percent + "%" : "No trials";
    const action = document.createElement("td");
    const review = document.createElement("a");
    review.className = "progress-review-link";
    review.href = "/review.html?id=" + encodeURIComponent(session.session_id);
    review.textContent = "Review";
    review.setAttribute("aria-label", "Review session from " + progressDate(session.end_time, false));
    action.appendChild(review);
    row.append(date, correct, total, accuracy, action);
    body.appendChild(row);
  });
}

function renderProgress() {
  updateProgressUrl();
  const history = DataTaker.getTargetHistory(progressClient.value, progressTarget.value);
  if (!history) {
    setProgressEmpty("No target history yet", "End a session with this target to see progress.");
    return;
  }

  const plotted = history.sessions.filter((session) => session.total > 0);
  const trialCount = plotted.reduce((sum, session) => sum + session.total, 0);
  const first = plotted[0] || null;
  const latest = plotted[plotted.length - 1] || null;
  const delta = first && latest ? latest.percent - first.percent : null;
  document.getElementById("progress-client-label").textContent = history.client_label;
  document.getElementById("progress-title").textContent = history.target.label;
  document.getElementById("progress-path").textContent = [
    history.target.domain,
    history.target.long_term_goal,
    history.target.short_term_goal,
  ].filter(Boolean).join(" › ");
  document.getElementById("progress-session-count").textContent = String(plotted.length);
  document.getElementById("progress-latest").textContent = latest ? latest.percent + "%" : "—";
  document.getElementById("progress-trials").textContent = String(trialCount);
  document.getElementById("progress-change").textContent = delta === null
    ? "—"
    : (plotted.length === 1 ? "Baseline" : (delta > 0 ? "+" : "") + delta + " pp");
  renderTargetProgressChart(history);
  renderProgressTable(history);
  progressEmpty.classList.add("hidden");
  progressResult.classList.remove("hidden");
}

function loadTargets(preferredTarget) {
  const targets = clientTargets(progressClient.value);
  progressTarget.innerHTML = "";
  targets.forEach(function (target) {
    const option = document.createElement("option");
    option.value = target.id;
    option.textContent = target.label + (target.short_term_goal ? " — " + target.short_term_goal : "");
    progressTarget.appendChild(option);
  });
  if (!targets.length) {
    progressTarget.disabled = true;
    setProgressEmpty("No target history yet", "This client has no ended sessions with targets.");
    updateProgressUrl();
    return;
  }
  progressTarget.disabled = false;
  if (targets.some((target) => target.id === preferredTarget)) { progressTarget.value = preferredTarget; }
  renderProgress();
}

function initProgress() {
  const clients = endedClientLabels();
  progressClient.innerHTML = "";
  clients.forEach(function (label) {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    progressClient.appendChild(option);
  });
  if (!clients.length) {
    progressClient.disabled = true;
    progressTarget.disabled = true;
    setProgressEmpty("No session history yet", "End a session to see progress by target.");
    return;
  }
  const requestedClient = requestedProgress.get("client");
  const matchingClient = clients.find((label) => label.toLowerCase() === String(requestedClient || "").toLowerCase());
  if (matchingClient) { progressClient.value = matchingClient; }
  loadTargets(requestedProgress.get("target"));
}

progressClient.addEventListener("change", function () { loadTargets(null); });
progressTarget.addEventListener("change", renderProgress);
initProgress();
