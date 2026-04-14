(function () {
  const app = document.getElementById("app");
  const { escapeHtml, statusMarkup, setStatus, chartMarkup, statCards, renderLayout } = window.LearnlyDash;

  function content(data) {
    const stats = [
      { label: "Enrolled Courses", value: data.stats.enrolledCourses, help: "Courses currently in progress" },
      { label: "Completed Assignments", value: data.stats.completedAssignments, help: "Submitted work so far" },
      { label: "Average Score", value: data.stats.averageScore ?? "—", help: "Across graded submissions" },
      { label: "Pending Assignments", value: data.stats.pendingAssignments, help: "Still waiting for submission" },
    ];

    return `
      <div class="page">
        <section class="section-anchor" id="overview">${statCards(stats)}</section>

        <section class="section-anchor grid two" id="courses" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><div><h2>Your courses</h2><div class="muted">Open any course to view materials, quizzes, and assignment submission forms.</div></div></div>
            <div class="list">
              ${
                data.courses.length
                  ? data.courses
                      .map(
                        (course) => `
                      <div class="list-item">
                        <strong>${escapeHtml(course.title)}</strong>
                        <div class="meta">${escapeHtml(course.instructorName)} · ${course.assignmentCount} assignments · ${course.materialCount} materials</div>
                        <div class="progress"><span style="width:${course.progress}%"></span></div>
                        <div class="actions" style="margin-top:12px;">
                          <a class="btn-secondary" href="/course.html?id=${course.id}">Open course</a>
                          <span class="pill success">${course.averageScore ?? "—"} avg</span>
                        </div>
                      </div>
                    `
                      )
                      .join("")
                  : `<div class="empty">No enrolled courses yet.</div>`
              }
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="card-header"><div><h2>Upcoming deadlines</h2><div class="muted">Closest pending assignments</div></div></div>
              <div class="list">
                ${
                  data.upcoming.length
                    ? data.upcoming
                        .map(
                          (item) => `
                        <div class="list-item">
                          <strong>${escapeHtml(item.title)}</strong>
                          <div class="meta">${escapeHtml(item.courseTitle)} · Due ${escapeHtml(item.dueLabel)}</div>
                          <div class="actions" style="margin-top:12px;"><a class="btn-secondary" href="/course.html?id=${item.courseId}">Open course</a></div>
                        </div>
                      `
                        )
                        .join("")
                    : `<div class="empty">No pending assignments right now.</div>`
                }
              </div>
            </div>

            <div class="card">
              <div class="card-header"><div><h2>Course search</h2><div class="muted">Search the catalogue and enroll from here</div></div></div>
              <form id="student-course-search" class="stack">
                <div class="field"><label for="student-course-query">Search courses</label><input id="student-course-query" name="q" placeholder="Machine learning, React, Python..." /></div>
                <button class="btn" type="submit">Search</button>
                ${statusMarkup("student-course-search-status")}
              </form>
              <div id="student-course-results" class="list" style="margin-top:14px;"></div>
            </div>
          </div>
        </section>

        <section class="section-anchor grid two" id="quizzes" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Recent grades</h2></div>
            <div class="list">
              ${
                data.recentGrades.length
                  ? data.recentGrades
                      .map(
                        (grade) => `
                        <div class="list-item">
                          <strong>${escapeHtml(grade.assignmentTitle)}</strong>
                          <div class="meta">${escapeHtml(grade.courseTitle)} · ${escapeHtml(grade.gradeScore)}/100</div>
                          <div class="muted" style="margin-top:8px;">${escapeHtml(grade.feedback || "No feedback yet.")}</div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">Grades will appear here as instructors review your work.</div>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2>Quizzes</h2></div>
            <div class="list">
              ${
                data.quizzes.length
                  ? data.quizzes
                      .map(
                        (quiz) => `
                        <div class="list-item">
                          <strong>${escapeHtml(quiz.title)}</strong>
                          <div class="meta">${escapeHtml(quiz.courseTitle)} · ${quiz.questionCount} questions · Latest score: ${quiz.latestScore ?? "—"}</div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">No quizzes available yet.</div>`
              }
            </div>
          </div>
        </section>

        <section class="section-anchor grid two" id="announcements" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Announcements</h2></div>
            <div class="list">
              ${
                data.announcements.length
                  ? data.announcements
                      .map(
                        (item) => `
                        <div class="list-item">
                          <strong>${escapeHtml(item.title)}</strong>
                          <div class="meta">${escapeHtml(item.courseTitle || "General")} · ${escapeHtml(item.authorName)}</div>
                          <div class="muted" style="margin-top:8px;">${escapeHtml(item.body)}</div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">No announcements yet.</div>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2>Weekly activity</h2></div>
            ${chartMarkup(data.analytics.weeklyActivity)}
          </div>
        </section>
      </div>
    `;
  }

  async function loadSearch(query) {
    const resultsBox = document.getElementById("student-course-results");
    resultsBox.innerHTML = `<div class="muted">Loading...</div>`;
    try {
      const res = await window.Learnly.api(`/api/courses?format=page&q=${encodeURIComponent(query || "")}&page=1&limit=6`);
      const items = res.items || [];
      resultsBox.innerHTML = items.length
        ? items
            .map(
              (course) => `
            <div class="list-item">
              <strong>${escapeHtml(course.title)}</strong>
              <div class="meta">${escapeHtml(course.instructorName)} · ${course.studentCount} students</div>
              <div class="muted" style="margin-top:8px;">${escapeHtml(course.description)}</div>
              <div class="actions" style="margin-top:12px;">
                <a class="btn-secondary" href="/course.html?id=${course.id}">View</a>
                <button class="btn" type="button" data-enroll-course="${course.id}">Enroll</button>
              </div>
            </div>
          `
            )
            .join("")
        : `<div class="empty">No matching courses found.</div>`;

      resultsBox.querySelectorAll("[data-enroll-course]").forEach((button) => {
        button.addEventListener("click", async () => {
          const courseId = button.getAttribute("data-enroll-course");
          button.disabled = true;
          try {
            await window.Learnly.api(`/api/courses/${courseId}/enroll`, { method: "POST", json: {} });
            setStatus("student-course-search-status", "Enrolled successfully. Reloading dashboard…", "ok");
            setTimeout(() => window.location.reload(), 500);
          } catch (error) {
            setStatus("student-course-search-status", error.message || "Enrollment failed", "error");
            button.disabled = false;
          }
        });
      });
    } catch (error) {
      resultsBox.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load search results.")}</div>`;
    }
  }

  async function init() {
    try {
      const me = await window.Learnly.api("/api/dashboard/me");
      if (me.role !== "student") {
        if (me.role === "instructor") window.location.replace("/instructor-dashboard.html");
        if (me.role === "admin") window.location.replace("/admin-dashboard.html");
        return;
      }

      renderLayout(
        app,
        me.profile,
        [
          { id: "overview", label: "Overview" },
          { id: "courses", label: "Courses" },
          { id: "quizzes", label: "Quizzes & grades" },
          { id: "announcements", label: "Announcements" },
        ],
        content(me.dashboard)
      );

      document.getElementById("student-course-search")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        setStatus("student-course-search-status", "", "");
        await loadSearch(event.currentTarget.q.value.trim());
      });
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load dashboard</h2><p class="muted">${escapeHtml(
        error.message || "Please sign in again."
      )}</p><a class="btn" href="/signin.html">Sign in</a></div></div>`;
    }
  }

  init();
})();
