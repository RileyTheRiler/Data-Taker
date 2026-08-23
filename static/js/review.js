// Ended-session review and editable Objective draft export.

const reviewSessionId = new URLSearchParams(window.location.search).get("id");
let reviewedSession = null;

function reviewFormatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const pad = function (value) { return String(value).padStart(2, "0"); };
  return pad(hours) + ":" + pad(minutes) + ":" + pad(remainingSeconds);
}

function reviewFormatDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) { return "Date unavailable"; }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function currentObjectiveText() {
  return document.getElementById("objective-draft").value.trim();
}

function syncPrintView() {
  document.getElementById("objective-print-body").textContent = currentObjectiveText();
}

function downloadObjective() {
  const text = currentObjectiveText();
  const blob = new Blob([text + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date(reviewedSession.end_time);
  const stamp = Number.isNaN(date.getTime()) ? "session" : date.toISOString().slice(0, 10);
  link.href = url;
  link.download = "data-taker-objective-" + stamp + ".txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  document.getElementById("objective-status").textContent = "Text draft downloaded.";
}

function printObjective() {
  syncPrintView();
  window.print();
}

function renderReview(session) {
  reviewedSession = session;
  document.getElementById("review-meta").textContent =
    session.client_label + " · ended " + reviewFormatDate(session.end_time);
  document.getElementById("review-duration").textContent = reviewFormatDuration(session.duration_seconds);
  document.getElementById("review-accuracy").textContent = session.overall.total
    ? session.overall.percent + "% · " + session.overall.correct + "/" + session.overall.total
    : "No trials";
  document.getElementById("objective-print-date").textContent = reviewFormatDate(session.end_time);

  const targetList = document.getElementById("review-targets");
  session.targets.forEach(function (target) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = target.label;
    item.appendChild(label);
    const accuracy = document.createElement("strong");
    accuracy.textContent = target.total
      ? target.percent + "% · " + target.correct + "/" + target.total
      : "No trials";
    item.appendChild(accuracy);
    targetList.appendChild(item);
  });

  const draft = DataTaker.getObjectiveDraft(session.id);
  document.getElementById("objective-draft").value = draft;
  syncPrintView();
  document.getElementById("review-main").classList.remove("hidden");
}

function showReviewError(message) {
  document.getElementById("review-error-message").textContent = message;
  document.getElementById("review-error").classList.remove("hidden");
}

document.getElementById("download-objective").addEventListener("click", downloadObjective);
document.getElementById("print-objective").addEventListener("click", printObjective);
document.getElementById("objective-draft").addEventListener("input", syncPrintView);
window.addEventListener("beforeprint", syncPrintView);

if (!reviewSessionId) {
  showReviewError("Choose an ended session from Past sessions.");
} else {
  try {
    const session = DataTaker.getSession(reviewSessionId);
    if (!session.end_time) { throw new Error("End this session before preparing its Objective draft."); }
    renderReview(session);
  } catch (error) {
    showReviewError(error.message);
  }
}
