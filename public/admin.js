const LS_ADMIN_TOKEN = "secplus_admin_token_v1";
const el = (id) => document.getElementById(id);

function fmt(dt) {
  if (!dt) return "—";
  try { return new Date(dt).toLocaleString(); } catch { return String(dt); }
}

function setError(msg) {
  const box = el("error");
  if (!msg) { box.style.display = "none"; box.textContent = ""; return; }
  box.style.display = "block";
  box.textContent = msg;
}

async function loadSummary(token) {
  const res = await fetch("/api/admin/summary", {
    headers: { "x-admin-token": token }
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || data?.details || `HTTP_${res.status}`);
  return data;
}

function renderUsers(rows) {
  const body = el("usersBody");
  body.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${fmt(r.created_at)}</td><td>${r.email}</td><td class="muted">${r.id}</td>`;
    body.appendChild(tr);
  }
}

function renderUserStats(rows) {
  const body = el("userStatsBody");
  body.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    const bestPct = (r.best_pct != null) ? `${r.best_pct}%` : "—";
    const avgPct = (r.avg_pct != null) ? `${r.avg_pct}%` : "—";
    tr.innerHTML = `
      <td>${r.email}</td>
      <td>${r.attempts ?? 0}</td>
      <td>${bestPct}</td>
      <td>${avgPct}</td>
      <td>${fmt(r.last_attempt_at)}</td>
    `;
    body.appendChild(tr);
  }
}

function renderRecentExams(rows) {
  const body = el("recentExamsBody");
  body.innerHTML = "";
  for (const r of rows) {
    const score = (r.submitted_at == null)
      ? "Not submitted"
      : `${r.score} / ${r.answered_count ?? "?"} answered`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmt(r.started_at)}</td>
      <td>${r.email || "(unknown)"}</td>
      <td>${r.is_retake_missed ? "retake-missed" : "random"}</td>
      <td>${score}</td>
      <td>${fmt(r.submitted_at)}</td>
      <td class="muted">${r.exam_id}</td>
    `;
    body.appendChild(tr);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem(LS_ADMIN_TOKEN);
  if (saved) el("adminToken").value = saved;

  el("clearBtn").addEventListener("click", () => {
    localStorage.removeItem(LS_ADMIN_TOKEN);
    el("adminToken").value = "";
    el("status").textContent = "Token cleared.";
    setError("");
  });

  el("loadBtn").addEventListener("click", async () => {
    setError("");
    const token = el("adminToken").value.trim();
    if (!token) { setError("Enter ADMIN_TOKEN from .env"); return; }

    localStorage.setItem(LS_ADMIN_TOKEN, token);
    el("status").textContent = "Loading…";

    try {
      const data = await loadSummary(token);

      el("userCount").textContent = `${data.users.length} users`;
      el("examCount").textContent = `${data.recentExams.length} exams`;

      renderUsers(data.users);
      renderUserStats(data.userStats);
      renderRecentExams(data.recentExams);

      el("status").textContent = `Loaded. DB tables: ${data.tables.join(", ")}`;
    } catch (e) {
      el("status").textContent = "Failed.";
      setError(String(e.message || e));
    }
  });
});
