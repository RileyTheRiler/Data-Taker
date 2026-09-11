// Dependency-free ended-session summaries and progress charts.
// Uses only DataTaker's existing localStorage-backed session views so the PWA
// remains fully offline-capable.

const SessionSummary = (function () {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const pad = function (value) { return String(value).padStart(2, "0"); };
    return pad(hours) + ":" + pad(minutes) + ":" + pad(remainingSeconds);
  }

  function formatShortDate(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) { return "—"; }
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }

  function makeSvg(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(function ([key, value]) {
      node.setAttribute(key, String(value));
    });
    return node;
  }

  function emptyChart(container, text) {
    container.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "summary-chart-empty";
    empty.textContent = text;
    container.appendChild(empty);
  }

  function renderBarChart(container, targets) {
    container.innerHTML = "";
    const rows = targets.filter(function (target) { return target.total > 0; });
    if (!rows.length) {
      emptyChart(container, "No target trials were recorded in this session.");
      return;
    }

    const list = document.createElement("div");
    list.className = "target-bars";
    rows.forEach(function (target) {
      const row = document.createElement("div");
      row.className = "target-bar-row";

      const head = document.createElement("div");
      head.className = "target-bar-head";
      const name = document.createElement("span");
      name.textContent = target.label;
      const value = document.createElement("strong");
      value.textContent = target.percent + "% · " + target.correct + "/" + target.total;
      head.append(name, value);

      const track = document.createElement("div");
      track.className = "target-bar-track";
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", target.label + ": " + target.percent + "% accuracy");
      const fill = document.createElement("div");
      fill.className = "target-bar-fill";
      fill.style.width = Math.max(0, Math.min(100, target.percent)) + "%";
      track.appendChild(fill);

      row.append(head, track);
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  function pointsForOverall(sessions) {
    return sessions
      .filter(function (session) { return session.overall.total > 0; })
      .map(function (session) {
        return { date: session.end_time, percent: session.overall.percent, total: session.overall.total };
      });
  }

  function renderLineChart(container, sessions) {
    container.innerHTML = "";
    const points = pointsForOverall(sessions).slice().reverse();
    if (points.length < 2) {
      emptyChart(container, "At least two ended sessions with trials are needed to graph progress over time.");
      return;
    }

    const width = 560;
    const height = 240;
    const left = 42;
    const right = 16;
    const top = 16;
    const bottom = 38;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const svg = makeSvg("svg", {
      class: "progress-svg",
      viewBox: "0 0 " + width + " " + height,
      role: "img",
      "aria-label": "Overall client accuracy across " + points.length + " ended sessions",
    });

    [0, 25, 50, 75, 100].forEach(function (value) {
      const y = top + innerHeight - (value / 100) * innerHeight;
      svg.appendChild(makeSvg("line", { x1: left, y1: y, x2: width - right, y2: y, class: "progress-grid" }));
      const label = makeSvg("text", { x: left - 8, y: y + 4, class: "progress-axis-label", "text-anchor": "end" });
      label.textContent = value + "%";
      svg.appendChild(label);
    });

    const coordinates = points.map(function (point, index) {
      const x = points.length === 1 ? left + innerWidth / 2 : left + (index / (points.length - 1)) * innerWidth;
      const y = top + innerHeight - (point.percent / 100) * innerHeight;
      return { x, y, point };
    });

    const polyline = makeSvg("polyline", {
      points: coordinates.map(function (item) { return item.x + "," + item.y; }).join(" "),
      class: "progress-line",
      fill: "none",
    });
    svg.appendChild(polyline);

    coordinates.forEach(function (item, index) {
      const circle = makeSvg("circle", { cx: item.x, cy: item.y, r: 5, class: "progress-point" });
      const title = makeSvg("title");
      title.textContent = formatShortDate(item.point.date) + ": " + item.point.percent + "% across " + item.point.total + " trials";
      circle.appendChild(title);
      svg.appendChild(circle);

      if (points.length <= 7 || index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 6) === 0) {
        const dateLabel = makeSvg("text", {
          x: item.x,
          y: height - 12,
          class: "progress-axis-label",
          "text-anchor": index === 0 ? "start" : (index === points.length - 1 ? "end" : "middle"),
        });
        dateLabel.textContent = formatShortDate(item.point.date);
        svg.appendChild(dateLabel);
      }
    });

    container.appendChild(svg);

    const latest = points[points.length - 1];
    const first = points[0];
    const delta = latest.percent - first.percent;
    const note = document.createElement("p");
    note.className = "progress-note";
    note.textContent = points.length + " sessions shown · first " + first.percent + "% · latest " + latest.percent + "% · " +
      (delta === 0 ? "no net change" : (delta > 0 ? "+" : "") + delta + " percentage points");
    container.appendChild(note);
  }

  function renderTargetTrendList(container, sessions, currentSession) {
    container.innerHTML = "";
    const targets = currentSession.targets.filter(function (target) { return target.total > 0; });
    if (!targets.length) { return; }

    targets.forEach(function (target) {
      const historic = sessions.slice().reverse().map(function (session) {
        const match = session.targets.find(function (candidate) { return candidate.id === target.id; });
        return match && match.total > 0 ? { percent: match.percent, date: session.end_time } : null;
      }).filter(Boolean);

      const row = document.createElement("div");
      row.className = "target-trend-row";
      const label = document.createElement("a");
      label.className = "target-trend-label";
      label.textContent = target.label;
      const params = new URLSearchParams({ client: currentSession.client_label, target: target.id });
      label.href = "/progress.html?" + params.toString();
      const metric = document.createElement("strong");
      if (historic.length < 2) {
        metric.textContent = "Current: " + target.percent + "%";
      } else {
        const delta = historic[historic.length - 1].percent - historic[0].percent;
        metric.textContent = historic[0].percent + "% → " + historic[historic.length - 1].percent + "% (" +
          (delta > 0 ? "+" : "") + delta + " pp)";
      }
      row.append(label, metric);
      container.appendChild(row);
    });
  }

  function renderInto(root, session) {
    if (!root || !session || !session.end_time) { return; }
    const sessions = DataTaker.getPastSessions(session.client_label);

    const client = root.querySelector("[data-summary-client]");
    const duration = root.querySelector("[data-summary-duration]");
    const overall = root.querySelector("[data-summary-overall]");
    const trials = root.querySelector("[data-summary-trials]");
    const sessionCount = root.querySelector("[data-summary-session-count]");
    if (client) { client.textContent = session.client_label; }
    if (duration) { duration.textContent = formatDuration(session.duration_seconds); }
    if (overall) { overall.textContent = session.overall.total ? session.overall.percent + "%" : "—"; }
    if (trials) { trials.textContent = String(session.overall.total); }
    if (sessionCount) { sessionCount.textContent = String(sessions.length); }

    const targetChart = root.querySelector("[data-summary-target-chart]");
    const progressChart = root.querySelector("[data-summary-progress-chart]");
    const targetTrends = root.querySelector("[data-summary-target-trends]");
    if (targetChart) { renderBarChart(targetChart, session.targets); }
    if (progressChart) { renderLineChart(progressChart, sessions); }
    if (targetTrends) { renderTargetTrendList(targetTrends, sessions, session); }
    root.classList.remove("hidden");
  }

  function currentSession() {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { return null; }
    try { return DataTaker.getSession(id); } catch (_error) { return null; }
  }

  function refresh() {
    const session = currentSession();
    if (!session || !session.end_time) { return; }
    document.querySelectorAll("[data-session-summary]").forEach(function (root) {
      renderInto(root, session);
    });
  }

  // Initial render handles already-ended sessions and the review page.
  refresh();

  // app.js registers its End handler before this file is loaded. Run after that
  // handler finishes so a newly ended session is summarized immediately.
  const endButton = document.getElementById("end-session");
  if (endButton) {
    endButton.addEventListener("click", function () {
      window.setTimeout(refresh, 0);
    });
  }

  return { refresh, renderInto };
})();
