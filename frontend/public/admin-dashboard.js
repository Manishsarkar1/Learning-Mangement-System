(function () {
  const app = document.getElementById("app");
  const { escapeHtml, statusMarkup, setStatus, chartMarkup, statCards, renderLayout, renderTable, paginationControls } = window.LearnlyDash;
  const state = {
    users: { page: 1, q: "", role: "" },
    courses: { page: 1, q: "" },
    logs: { page: 1, q: "" },
  };

  function content(data) {
    const stats = [
      { label: "Total Users", value: data.stats.totalUsers, help: "Students, instructors, and admins" },
      { label: "Courses", value: data.stats.totalCourses, help: "Published learning spaces" },
      { label: "Announcements", value: data.stats.totalAnnouncements, help: "Broadcasts and course notices" },
      { label: "Quiz Attempts", value: data.stats.totalQuizAttempts, help: "Stored learner quiz submissions" },
    ];

    return `
      <div class="page">
        <section class="section-anchor" id="overview">${statCards(stats)}</section>

        <section class="section-anchor grid two" id="users" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Create user</h2></div>
            <form id="admin-create-user-form" class="stack">
              <div class="row">
                <div class="field"><label>Name</label><input name="name" required /></div>
                <div class="field"><label>Email</label><input type="email" name="email" required /></div>
              </div>
              <div class="row">
                <div class="field"><label>Password</label><input name="password" type="password" required /></div>
                <div class="field"><label>Role</label><select name="role"><option>student</option><option>instructor</option><option>admin</option></select></div>
              </div>
              <button class="btn" type="submit">Create user</button>
              ${statusMarkup("admin-create-user-status")}
            </form>
          </div>

          <div class="card">
            <div class="card-header"><h2>Role distribution</h2></div>
            ${chartMarkup(
              Object.entries(data.analytics.usersByRole).map(([label, count]) => ({
                label: label.slice(0, 3).toUpperCase(),
                count,
              }))
            )}
          </div>
        </section>

        <section class="section-anchor card" id="user-table" style="margin-top:20px;">
          <div class="card-header"><div><h2>User management</h2><div class="muted">Search, filter, and paginate users.</div></div></div>
          <form id="admin-user-search" class="row" style="margin-bottom:14px;">
            <div class="field"><label>Search</label><input name="q" placeholder="Name or email" /></div>
            <div class="field"><label>Role</label><select name="role"><option value="">All</option><option value="student">Student</option><option value="instructor">Instructor</option><option value="admin">Admin</option></select></div>
            <div class="field" style="align-self:flex-end;"><button class="btn" type="submit">Load users</button></div>
          </form>
          <div id="admin-users-table"></div>
        </section>

        <section class="section-anchor card" id="courses" style="margin-top:20px;">
          <div class="card-header"><div><h2>Course catalogue</h2><div class="muted">Search and paginate all courses.</div></div></div>
          <form id="admin-course-search" class="row" style="margin-bottom:14px;">
            <div class="field"><label>Search</label><input name="q" placeholder="Course title, description, instructor" /></div>
            <div class="field" style="align-self:flex-end;"><button class="btn" type="submit">Load courses</button></div>
          </form>
          <div id="admin-courses-table"></div>
        </section>

        <section class="section-anchor grid two" id="permissions" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Role permissions</h2></div>
            <div id="permissions-list" class="list"></div>
          </div>
          <div class="card">
            <div class="card-header"><h2>Global announcement</h2></div>
            <form id="admin-announcement-form" class="stack">
              <div class="field"><label>Audience</label><select name="audience"><option value="all">All users</option><option value="students">Students</option><option value="instructors">Instructors</option><option value="admins">Admins</option></select></div>
              <div class="field"><label>Title</label><input name="title" required /></div>
              <div class="field"><label>Message</label><textarea name="body" required></textarea></div>
              <button class="btn" type="submit">Broadcast</button>
              ${statusMarkup("admin-announcement-status")}
            </form>
          </div>
        </section>

        <section class="section-anchor grid two" id="log-summary" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Top courses</h2></div>
            <div class="list">
              ${
                data.analytics.topCourses.length
                  ? data.analytics.topCourses
                      .map(
                        (course) => `
                        <div class="list-item">
                          <strong>${escapeHtml(course.title)}</strong>
                          <div class="meta">${escapeHtml(course.instructorName)} · ${course.studentCount} students</div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">No course data yet.</div>`
              }
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2>Recent alerts</h2></div>
            <div class="list">
              ${
                data.alerts.length
                  ? data.alerts
                      .map(
                        (alert) => `
                        <div class="list-item">
                          <strong>${escapeHtml(alert.title)}</strong>
                          <div class="meta">${escapeHtml(alert.level)}</div>
                          <div class="muted" style="margin-top:8px;">${escapeHtml(alert.message)}</div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">No active alerts right now.</div>`
              }
            </div>
          </div>
        </section>

        <section class="section-anchor card" id="audit" style="margin-top:20px;">
          <div class="card-header"><div><h2>Audit log</h2><div class="muted">Search through real system activity.</div></div></div>
          <form id="admin-log-search" class="row" style="margin-bottom:14px;">
            <div class="field"><label>Search</label><input name="q" placeholder="Action or actor" /></div>
            <div class="field" style="align-self:flex-end;"><button class="btn" type="submit">Load logs</button></div>
          </form>
          <div id="admin-logs-table"></div>
        </section>
      </div>
    `;
  }

  function bindPaginationButtons() {
    document.querySelectorAll("[data-page-kind]").forEach((button) => {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", async () => {
        const kind = button.getAttribute("data-page-kind");
        const dir = Number(button.getAttribute("data-page-dir")) || 0;
        if (kind === "users") state.users.page = Math.max(1, state.users.page + dir);
        if (kind === "courses") state.courses.page = Math.max(1, state.courses.page + dir);
        if (kind === "logs") state.logs.page = Math.max(1, state.logs.page + dir);
        if (kind === "users") await loadUsers();
        if (kind === "courses") await loadCourses();
        if (kind === "logs") await loadLogs();
      });
    });
  }

  async function loadUsers() {
    const target = document.getElementById("admin-users-table");
    target.innerHTML = `<div class="muted">Loading users...</div>`;
    const params = new URLSearchParams({ page: String(state.users.page), limit: "8" });
    if (state.users.q) params.set("q", state.users.q);
    if (state.users.role) params.set("role", state.users.role);
    try {
      const result = await window.Learnly.api(`/api/admin/users?${params.toString()}`);
      target.innerHTML =
        renderTable(result.items || [], [
          { label: "Name", render: (item) => `<strong>${escapeHtml(item.name)}</strong><div class="meta">${escapeHtml(item.email)}</div>` },
          { label: "Role", render: (item) => escapeHtml(item.role) },
          { label: "Joined", render: (item) => escapeHtml(window.Learnly.formatDate(item.createdAt)) },
        ]) + paginationControls("users", result.pagination);
      bindPaginationButtons();
    } catch (error) {
      target.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load users.")}</div>`;
    }
  }

  async function loadCourses() {
    const target = document.getElementById("admin-courses-table");
    target.innerHTML = `<div class="muted">Loading courses...</div>`;
    const params = new URLSearchParams({ page: String(state.courses.page), limit: "8" });
    if (state.courses.q) params.set("q", state.courses.q);
    try {
      const result = await window.Learnly.api(`/api/admin/courses?${params.toString()}`);
      target.innerHTML =
        renderTable(result.items || [], [
          { label: "Course", render: (item) => `<strong>${escapeHtml(item.title)}</strong><div class="meta">${escapeHtml(item.description || "")}</div>` },
          { label: "Instructor", render: (item) => escapeHtml(item.instructor.name) },
          { label: "Students", render: (item) => escapeHtml(item.studentCount) },
          { label: "Open", render: (item) => `<a href="/course.html?id=${item.id}">View</a>` },
        ]) + paginationControls("courses", result.pagination);
      bindPaginationButtons();
    } catch (error) {
      target.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load courses.")}</div>`;
    }
  }

  async function loadLogs() {
    const target = document.getElementById("admin-logs-table");
    target.innerHTML = `<div class="muted">Loading audit logs...</div>`;
    const params = new URLSearchParams({ page: String(state.logs.page), limit: "10" });
    if (state.logs.q) params.set("q", state.logs.q);
    try {
      const result = await window.Learnly.api(`/api/admin/logs?${params.toString()}`);
      target.innerHTML =
        renderTable(result.items || [], [
          { label: "Action", render: (item) => `<strong>${escapeHtml(item.action)}</strong><div class="meta">${escapeHtml(item.message)}</div>` },
          { label: "Actor", render: (item) => escapeHtml(item.actor?.email || "system") },
          {
            label: "When",
            render: (item) =>
              escapeHtml(window.Learnly.formatDate(item.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })),
          },
        ]) + paginationControls("logs", result.pagination);
      bindPaginationButtons();
    } catch (error) {
      target.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load logs.")}</div>`;
    }
  }

  async function init() {
    try {
      const me = await window.Learnly.api("/api/dashboard/me");
      if (me.role !== "admin") {
        if (me.role === "student") window.location.replace("/student-dashboard.html");
        if (me.role === "instructor") window.location.replace("/instructor-dashboard.html");
        return;
      }

      renderLayout(
        app,
        me.profile,
        [
          { id: "overview", label: "Overview" },
          { id: "users", label: "Users" },
          { id: "courses", label: "Courses" },
          { id: "permissions", label: "Permissions" },
          { id: "audit", label: "Audit log" },
        ],
        content(me.dashboard)
      );

      document.getElementById("permissions-list").innerHTML = me.dashboard.permissions
        .map(
          (permission) => `
          <div class="list-item" data-permission-row="${escapeHtml(permission.key)}">
            <strong>${escapeHtml(permission.label)}</strong>
            <div class="row" style="margin-top:12px;">
              <label><input type="checkbox" name="student" ${permission.student ? "checked" : ""}/> Student</label>
              <label><input type="checkbox" name="instructor" ${permission.instructor ? "checked" : ""}/> Instructor</label>
              <label><input type="checkbox" name="admin" ${permission.admin ? "checked" : ""}/> Admin</label>
              <button class="btn-secondary" type="button" data-permission-save="${escapeHtml(permission.key)}">Save</button>
            </div>
          </div>
        `
        )
        .join("");

      document.querySelectorAll("[data-permission-save]").forEach((button) => {
        button.addEventListener("click", async () => {
          const key = button.getAttribute("data-permission-save");
          const row = button.closest("[data-permission-row]");
          const payload = {
            student: row.querySelector('[name="student"]').checked,
            instructor: row.querySelector('[name="instructor"]').checked,
            admin: row.querySelector('[name="admin"]').checked,
          };
          button.disabled = true;
          try {
            await window.Learnly.api(`/api/admin/permissions/${encodeURIComponent(key)}`, { method: "PUT", json: payload });
            button.textContent = "Saved";
            setTimeout(() => {
              button.textContent = "Save";
              button.disabled = false;
            }, 800);
          } catch (error) {
            button.disabled = false;
            alert(error.message || "Unable to update permission");
          }
        });
      });

      document.getElementById("admin-create-user-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("admin-create-user-status", "", "");
        try {
          await window.Learnly.api("/api/admin/users", {
            method: "POST",
            json: {
              name: form.name.value.trim(),
              email: form.email.value.trim(),
              password: form.password.value,
              role: form.role.value,
            },
          });
          setStatus("admin-create-user-status", "User created successfully.", "ok");
          form.reset();
          await loadUsers();
        } catch (error) {
          setStatus("admin-create-user-status", error.message || "Unable to create user", "error");
        }
      });

      document.getElementById("admin-user-search")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        state.users.q = event.currentTarget.q.value.trim();
        state.users.role = event.currentTarget.role.value;
        state.users.page = 1;
        await loadUsers();
      });

      document.getElementById("admin-course-search")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        state.courses.q = event.currentTarget.q.value.trim();
        state.courses.page = 1;
        await loadCourses();
      });

      document.getElementById("admin-log-search")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        state.logs.q = event.currentTarget.q.value.trim();
        state.logs.page = 1;
        await loadLogs();
      });

      document.getElementById("admin-announcement-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("admin-announcement-status", "", "");
        try {
          await window.Learnly.api("/api/announcements", {
            method: "POST",
            json: { audience: form.audience.value, title: form.title.value.trim(), body: form.body.value.trim() },
          });
          setStatus("admin-announcement-status", "Announcement sent.", "ok");
        } catch (error) {
          setStatus("admin-announcement-status", error.message || "Unable to send announcement", "error");
        }
      });

      await loadUsers();
      await loadCourses();
      await loadLogs();
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load dashboard</h2><p class="muted">${escapeHtml(
        error.message || "Please sign in again."
      )}</p><a class="btn" href="/signin.html">Sign in</a></div></div>`;
    }
  }

  init();
})();
