// Home/setup page: choose client, pick targets, start a session.

const selectedTargets = new Map(); // id -> label

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try { body = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const msg = (body && body.error) || ("Request failed (" + res.status + ")");
    throw new Error(msg);
  }
  return body;
}

function show(id, msg) {
  document.getElementById(id).textContent = msg || "";
}

async function loadClients() {
  const select = document.getElementById("client-select");
  const clients = await jsonFetch("/api/clients");
  select.innerHTML = "";
  if (!clients.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— add a client below —";
    select.appendChild(opt);
  }
  clients.forEach(function (c) {
    const opt = document.createElement("option");
    opt.value = c.label;
    opt.textContent = c.label;
    select.appendChild(opt);
  });
}

async function addClient() {
  const input = document.getElementById("new-client");
  const label = input.value.trim();
  show("client-error", "");
  if (!label) { return; }
  try {
    const client = await jsonFetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label }),
    });
    input.value = "";
    await loadClients();
    document.getElementById("client-select").value = client.label;
  } catch (e) {
    show("client-error", e.message);
  }
}

async function loadGoals() {
  const tree = document.getElementById("goal-tree");
  const goals = await jsonFetch("/api/goals");
  tree.innerHTML = "";

  goals.domains.forEach(function (domain) {
    const dEl = document.createElement("div");
    dEl.className = "domain";
    const name = document.createElement("div");
    name.className = "domain-name";
    name.textContent = domain.name;
    dEl.appendChild(name);

    domain.long_term_goals.forEach(function (ltg) {
      const ltgEl = document.createElement("div");
      ltgEl.className = "ltg";
      const ltgLabel = document.createElement("div");
      ltgLabel.className = "ltg-label";
      ltgLabel.textContent = ltg.label;
      ltgEl.appendChild(ltgLabel);

      ltg.short_term_goals.forEach(function (stg) {
        const stgLabel = document.createElement("div");
        stgLabel.className = "stg-label";
        stgLabel.textContent = stg.label;
        ltgEl.appendChild(stgLabel);

        stg.targets.forEach(function (target) {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "target-chip";
          chip.textContent = target.label;
          chip.addEventListener("click", function () {
            if (selectedTargets.has(target.id)) {
              selectedTargets.delete(target.id);
              chip.classList.remove("selected");
            } else {
              selectedTargets.set(target.id, target.label);
              chip.classList.add("selected");
            }
            updateSummary();
          });
          ltgEl.appendChild(chip);
        });
      });
      dEl.appendChild(ltgEl);
    });
    tree.appendChild(dEl);
  });
}

function updateSummary() {
  const count = selectedTargets.size;
  const summary = document.getElementById("selection-summary");
  const startBtn = document.getElementById("start-session");
  if (count === 0) {
    summary.textContent = "No targets selected yet.";
    startBtn.disabled = true;
  } else {
    summary.textContent = count + " target" + (count === 1 ? "" : "s") + " selected.";
    startBtn.disabled = false;
  }
}

async function startSession() {
  show("start-error", "");
  const clientLabel = document.getElementById("client-select").value;
  if (!clientLabel) {
    show("start-error", "Please choose or add a client first.");
    return;
  }
  if (selectedTargets.size === 0) { return; }

  try {
    const session = await jsonFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_label: clientLabel,
        target_ids: Array.from(selectedTargets.keys()),
      }),
    });
    window.location.href = "/session/" + session.id;
  } catch (e) {
    show("start-error", e.message);
  }
}

document.getElementById("add-client").addEventListener("click", addClient);
document.getElementById("new-client").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { addClient(); }
});
document.getElementById("start-session").addEventListener("click", startSession);

loadClients().catch(function (e) { show("client-error", e.message); });
loadGoals().catch(function (e) { show("start-error", e.message); });
