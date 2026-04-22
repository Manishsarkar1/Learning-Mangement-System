(function () {
  const app = document.getElementById("app");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function topBar(title, subtitle, courseId) {
    return `
      <div class="topbar">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="topbar-actions">
          <a class="btn-secondary" href="/course.html?id=${encodeURIComponent(courseId)}">Back to course</a>
          <a class="btn-secondary" href="/dashboard.html">Dashboard</a>
          <button class="btn-secondary" id="logout-btn" type="button">Sign out</button>
        </div>
      </div>
    `;
  }

  function studentMarkup(course, progress) {
    return `
      <div class="page">
        <div class="grid cards">
          <div class="card"><div class="kicker">Completed lessons</div><div class="stat-value">${progress.completedLessons}</div></div>
          <div class="card"><div class="kicker">Pending lessons</div><div class="stat-value">${progress.pendingLessons}</div></div>
          <div class="card"><div class="kicker">Progress</div><div class="stat-value">${progress.progressPercentage}%</div></div>
          <div class="card"><div class="kicker">Course status</div><div class="stat-value" style="font-size:22px;">${escapeHtml(progress.completionStatus.replace(/_/g, " "))}</div></div>
        </div>

        <div class="card" style="margin-top:20px;">
          <div class="card-header"><h2>Learning journey</h2></div>
          <div class="progress"><span style="width:${progress.progressPercentage}%"></span></div>
          <div class="list" style="margin-top:16px;">
            ${
              progress.lessons.length
                ? progress.lessons
                    .map(
                      (lesson) => `
                        <div class="list-item">
                          <strong>${escapeHtml(lesson.title)}</strong>
                          <div class="meta">${escapeHtml(lesson.type)} | ${lesson.completed ? "Completed" : "Pending"}</div>
                          ${
                            lesson.completedAt
                              ? `<div class="muted" style="margin-top:8px;">Completed ${escapeHtml(window.Learnly.formatDate(lesson.completedAt))}</div>`
                              : `<div class="muted" style="margin-top:8px;">Complete this lesson from the course page when you finish it.</div>`
                          }
                        </div>
                      `
                    )
                    .join("")
                : `<div class="empty">No lessons are available for this course yet.</div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function instructorMarkup(course, progress) {
    return `
      <div class="page">
        <div class="grid cards">
          <div class="card"><div class="kicker">Lessons</div><div class="stat-value">${progress.totalLessons}</div></div>
          <div class="card"><div class="kicker">Students tracked</div><div class="stat-value">${progress.studentsTracked}</div></div>
          <div class="card"><div class="kicker">Average progress</div><div class="stat-value">${progress.averageProgressPercentage}%</div></div>
          <div class="card"><div class="kicker">Completion rate</div><div class="stat-value">${progress.completionRate}%</div></div>
        </div>

        <div class="card" style="margin-top:20px;">
          <div class="card-header"><h2>Student completion dashboard</h2></div>
          ${
            progress.students.length
              ? `
                <div class="table-wrap">
                  <table>
                    <thead><tr><th>Student</th><th>Completed</th><th>Pending</th><th>Progress</th><th>Status</th><th>Last completion</th></tr></thead>
                    <tbody>
                      ${progress.students
                        .map(
                          (student) => `
                            <tr>
                              <td>${escapeHtml(student.name)}<div class="meta">${escapeHtml(student.email)}</div></td>
                              <td>${student.completedLessons}</td>
                              <td>${student.pendingLessons}</td>
                              <td>${student.progressPercentage}%</td>
                              <td>${escapeHtml(student.completionStatus.replace(/_/g, " "))}</td>
                              <td>${escapeHtml(student.lastCompletedAt ? window.Learnly.formatDate(student.lastCompletedAt) : "No activity yet")}</td>
                            </tr>
                          `
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              `
              : `<div class="empty">No students are enrolled in this course yet.</div>`
          }
        </div>

        <div class="card" style="margin-top:20px;">
          <div class="card-header"><h2>Lesson inventory</h2></div>
          <div class="list">
            ${
              course.materials.length
                ? course.materials
                    .map(
                      (material) => `
                        <div class="list-item">
                          <strong>${escapeHtml(material.title)}</strong>
                          <div class="meta">${escapeHtml(material.type)} | ${escapeHtml(window.Learnly.formatDate(material.createdAt))}</div>
                        </div>
                      `
                    )
                    .join("")
                : `<div class="empty">No lessons or materials have been uploaded yet.</div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  async function init() {
    const courseId = window.Learnly.qs("courseId");
    if (!courseId) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Course not selected</h2><p class="muted">Open this page with <code>/progress.html?courseId=1</code>.</p></div></div>`;
      return;
    }

    try {
      const [me, course, progress] = await Promise.all([
        window.Learnly.api("/api/auth/me"),
        window.Learnly.api(`/api/courses/${courseId}`),
        window.Learnly.api(`/api/courses/${courseId}/progress`),
      ]);

      app.innerHTML =
        topBar(course.title, `${course.instructor.name} | ${course.category}`, course.id) +
        (me.user.role === "student" ? studentMarkup(course, progress) : instructorMarkup(course, progress));

      document.getElementById("logout-btn")?.addEventListener("click", () => window.Learnly.logout());
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load progress</h2><p class="muted">${escapeHtml(error.message || "Please sign in again.")}</p><a class="btn" href="/dashboard.html">Back to dashboard</a></div></div>`;
    }
  }

  init();
})();
