const { $, setStatus, apiPostJson, loadToken, clearToken } = window.LearnlyAuth;

function setElStatus(el, message, type) {
  if (!el) return;
  el.textContent = message || "";
  el.dataset.type = type || "";
}

async function apiGet(path, { auth } = {}) {
  const headers = {};
  if (auth) {
    const token = loadToken();
    if (token) headers.authorization = token;
  }
  const res = await fetch(path, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function apiPost(path, body, { auth } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = loadToken();
    if (token) headers.authorization = token;
  }
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function decodeJwt(token) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function renderSession() {
  const token = loadToken();
  const info = $("#session-info");

  if (!token) {
    info.innerHTML =
      'No token saved. <a href="/signup.html">Sign up</a> or <a href="/signin.html">sign in</a> to use protected actions.';
    return;
  }

  const payload = decodeJwt(token);
  const pretty = payload ? `userId=${payload.id}, role=${payload.role}` : "token present (unable to decode payload)";
  info.textContent = `Token saved. ${pretty}`;
}

async function refreshDbPill() {
  const pill = $("#db-pill");
  try {
    const data = await apiGet("/health/db");
    const driver = data && data.driver ? data.driver : "unknown";
    const connected = data && typeof data.connected === "boolean" ? data.connected : true;
    pill.textContent = `DB: ${driver} (${connected ? "up" : "down"})`;
  } catch {
    pill.textContent = "DB: unknown";
  }
}

async function refreshCourses() {
  const status = $("#courses-status");
  const list = $("#courses-list");
  setElStatus(status, "Loading…", "");
  list.innerHTML = "";

  try {
    const courses = await apiGet("/api/courses");
    if (!Array.isArray(courses) || courses.length === 0) {
      list.innerHTML = '<div class="muted" style="margin-top:10px;">No courses yet.</div>';
      setElStatus(status, "", "");
      return;
    }
    const ul = document.createElement("ul");
    for (const c of courses) {
      const li = document.createElement("li");
      li.textContent = `#${c.id} — ${c.title}`;
      ul.appendChild(li);
    }
    list.appendChild(ul);
    setElStatus(status, `Loaded ${courses.length} course(s).`, "ok");
  } catch (err) {
    setElStatus(status, err.message, "error");
  }
}

function wireEvents() {
  $("#btn-clear-token").addEventListener("click", () => {
    clearToken();
    setStatus("Token cleared.", "ok");
    renderSession();
  });

  $("#btn-refresh-courses").addEventListener("click", refreshCourses);

  $("#course-create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#course-create-status");
    setElStatus(status, "", "");
    try {
      await apiPost("/api/courses/create", { title: $("#course-title").value.trim(), description: $("#course-desc").value.trim() }, { auth: true });
      setElStatus(status, "Course created.", "ok");
      $("#course-title").value = "";
      $("#course-desc").value = "";
      refreshCourses();
    } catch (err) {
      setElStatus(status, err.message, "error");
    }
  });

  $("#enroll-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#enroll-status");
    setElStatus(status, "", "");
    try {
      await apiPost("/api/courses/enroll", { course_id: $("#enroll-course-id").value }, { auth: true });
      setElStatus(status, "Enrolled.", "ok");
    } catch (err) {
      setElStatus(status, err.message, "error");
    }
  });

  $("#quiz-create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#quiz-create-status");
    setElStatus(status, "", "");
    try {
      await apiPostJson("/api/quizzes/create", { course_id: $("#quiz-course-id").value, title: $("#quiz-title").value.trim() });
      setElStatus(status, "Quiz created.", "ok");
    } catch (err) {
      setElStatus(status, err.message, "error");
    }
  });

  $("#question-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#question-status");
    setElStatus(status, "", "");
    try {
      await apiPostJson("/api/quizzes/question", {
        quiz_id: $("#q-quiz-id").value,
        question: $("#q-text").value.trim(),
        a: $("#q-a").value.trim(),
        b: $("#q-b").value.trim(),
        c: $("#q-c").value.trim(),
        d: $("#q-d").value.trim(),
        correct: $("#q-correct").value,
      });
      setElStatus(status, "Question added.", "ok");
    } catch (err) {
      setElStatus(status, err.message, "error");
    }
  });

  $("#quiz-get-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#quiz-get-status");
    const out = $("#quiz-questions");
    setElStatus(status, "Loading…", "");
    out.innerHTML = "";
    try {
      const id = $("#quiz-get-id").value;
      const rows = await apiGet(`/api/quizzes/${encodeURIComponent(id)}`);
      if (!Array.isArray(rows) || rows.length === 0) {
        setElStatus(status, "No questions found.", "ok");
        return;
      }
      const ul = document.createElement("ul");
      for (const r of rows) {
        const li = document.createElement("li");
        li.textContent = r.question;
        ul.appendChild(li);
      }
      out.appendChild(ul);
      setElStatus(status, `Loaded ${rows.length} question(s).`, "ok");
    } catch (err) {
      setElStatus(status, err.message, "error");
    }
  });
}

async function init() {
  renderSession();
  await refreshDbPill();
  wireEvents();
  refreshCourses();
}

init();

