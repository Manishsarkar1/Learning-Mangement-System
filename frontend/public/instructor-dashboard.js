(function () {
  const app = document.getElementById("app");
  const { escapeHtml, statusMarkup, setStatus, chartMarkup, statCards, renderLayout } = window.LearnlyDash;

  function content(data) {
    const options = data.courses.map((course) => `<option value="${course.id}">${escapeHtml(course.title)}</option>`).join("");
    const stats = [
      { label: "Active Courses", value: data.stats.activeCourses, help: "Courses you currently manage" },
      { label: "Total Students", value: data.stats.totalStudents, help: "Across your active cohorts" },
      { label: "Average Score", value: data.stats.averageScore ?? "—", help: "Across graded submissions" },
      { label: "Pending Reviews", value: data.stats.pendingReviews, help: "Need grading attention" },
    ];

    return `
      <div class="page">
        <section class="section-anchor" id="overview">${statCards(stats)}</section>

        <section class="section-anchor grid two" id="courses" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><div><h2>Your courses</h2><div class="muted">Open a course to manage materials, announcements, quizzes, and grading.</div></div></div>
            <div class="list">
              ${
                data.courses.length
                  ? data.courses
                      .map(
                        (course) => `
                        <div class="list-item">
                          <strong>${escapeHtml(course.title)}</strong>
                          <div class="meta">${course.studentCount} students · ${course.assignmentCount} assignments · ${course.announcementCount} announcements</div>
                          <div class="actions" style="margin-top:12px;">
                            <a class="btn-secondary" href="/course.html?id=${course.id}">Manage course</a>
                            <span class="pill warn">${course.pendingReviews} pending reviews</span>
                          </div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">You do not have any courses yet.</div>`
              }
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="card-header"><h2>Create course</h2></div>
              <form id="create-course-form" class="stack">
                <div class="field"><label>Title</label><input name="title" required /></div>
                <div class="field"><label>Description</label><textarea name="description" required></textarea></div>
                <button class="btn" type="submit">Create course</button>
                ${statusMarkup("create-course-status")}
              </form>
            </div>

            <div class="card">
              <div class="card-header"><h2>Create assignment</h2></div>
              <form id="create-assignment-form" class="stack">
                <div class="field"><label>Course</label><select name="courseId" required>${options}</select></div>
                <div class="field"><label>Title</label><input name="title" required /></div>
                <div class="field"><label>Description</label><textarea name="description" required></textarea></div>
                <div class="field"><label>Due date</label><input name="dueDate" type="datetime-local" required /></div>
                <button class="btn" type="submit">Publish assignment</button>
                ${statusMarkup("create-assignment-status")}
              </form>
            </div>
          </div>
        </section>

        <section class="section-anchor grid two" id="actions" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Post announcement</h2></div>
            <form id="announcement-form" class="stack">
              <div class="field"><label>Course</label><select name="courseId" required>${options}</select></div>
              <div class="field"><label>Title</label><input name="title" required /></div>
              <div class="field"><label>Message</label><textarea name="body" required></textarea></div>
              <button class="btn" type="submit">Post announcement</button>
              ${statusMarkup("announcement-status")}
            </form>
          </div>

          <div class="card">
            <div class="card-header"><h2>Create quiz</h2></div>
            <form id="quiz-form" class="stack">
              <div class="field"><label>Course</label><select name="courseId" required>${options}</select></div>
              <div class="field"><label>Quiz title</label><input name="title" required /></div>
              <div class="field"><label>Question</label><textarea name="question" required></textarea></div>
              <div class="row">
                <div class="field"><label>Option A</label><input name="a" required /></div>
                <div class="field"><label>Option B</label><input name="b" required /></div>
              </div>
              <div class="row">
                <div class="field"><label>Option C</label><input name="c" required /></div>
                <div class="field"><label>Option D</label><input name="d" required /></div>
              </div>
              <div class="field"><label>Correct option</label><select name="correct"><option>A</option><option>B</option><option>C</option><option>D</option></select></div>
              <button class="btn" type="submit">Create quiz with first question</button>
              ${statusMarkup("quiz-status")}
            </form>
          </div>
        </section>

        <section class="section-anchor grid two" id="grading" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Grading queue</h2></div>
            <div class="list">
              ${
                data.gradingQueue.length
                  ? data.gradingQueue
                      .map(
                        (item) => `
                        <div class="list-item">
                          <strong>${escapeHtml(item.assignmentTitle)}</strong>
                          <div class="meta">${escapeHtml(item.studentName)} · ${escapeHtml(item.courseTitle)} · ${escapeHtml(
                            window.Learnly.formatDate(item.submittedAt)
                          )}</div>
                          <div class="actions" style="margin-top:12px;"><a class="btn-secondary" href="/course.html?id=${
                            data.courses.find((course) => course.title === item.courseTitle)?.id || ""
                          }">Open grading view</a></div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">No pending grading right now.</div>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2>Top students</h2></div>
            <div class="list">
              ${
                data.topStudents.length
                  ? data.topStudents
                      .map(
                        (student) => `
                        <div class="list-item">
                          <strong>${escapeHtml(student.name)}</strong>
                          <div class="meta">${escapeHtml(student.email)} · ${student.averageScore}/100 average across ${student.gradedSubmissions} graded submissions</div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">Student performance data will show up after grading begins.</div>`
              }
            </div>
          </div>
        </section>

        <section class="section-anchor grid two" id="insights" style="margin-top:20px;">
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
                  : `<div class="empty">No announcements posted yet.</div>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2>Weekly submissions</h2></div>
            ${chartMarkup(data.analytics.weeklySubmissions)}
            <div class="card-header" style="margin-top:18px;"><h2>Recent quizzes</h2></div>
            <div class="list">
              ${
                data.quizzes.length
                  ? data.quizzes
                      .map(
                        (quiz) => `
                        <div class="list-item">
                          <strong>${escapeHtml(quiz.title)}</strong>
                          <div class="meta">${escapeHtml(quiz.courseTitle)} · ${quiz.questionCount} questions · ${quiz.attemptCount} attempts</div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">No quizzes created yet.</div>`
              }
            </div>
          </div>
        </section>
      </div>
    `;
  }

  async function init() {
    try {
      const me = await window.Learnly.api("/api/dashboard/me");
      if (me.role !== "instructor") {
        if (me.role === "student") window.location.replace("/student-dashboard.html");
        if (me.role === "admin") window.location.replace("/admin-dashboard.html");
        return;
      }

      renderLayout(
        app,
        me.profile,
        [
          { id: "overview", label: "Overview" },
          { id: "courses", label: "Courses" },
          { id: "actions", label: "Create content" },
          { id: "grading", label: "Grading" },
          { id: "insights", label: "Insights" },
        ],
        content(me.dashboard)
      );

      document.getElementById("create-course-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("create-course-status", "", "");
        try {
          await window.Learnly.api("/api/courses", {
            method: "POST",
            json: { title: form.title.value.trim(), description: form.description.value.trim() },
          });
          setStatus("create-course-status", "Course created. Reloading…", "ok");
          setTimeout(() => window.location.reload(), 500);
        } catch (error) {
          setStatus("create-course-status", error.message || "Unable to create course", "error");
        }
      });

      document.getElementById("create-assignment-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("create-assignment-status", "", "");
        try {
          await window.Learnly.api("/api/assignments", {
            method: "POST",
            json: {
              courseId: form.courseId.value,
              title: form.title.value.trim(),
              description: form.description.value.trim(),
              dueDate: new Date(form.dueDate.value).toISOString(),
            },
          });
          setStatus("create-assignment-status", "Assignment published. Reloading…", "ok");
          setTimeout(() => window.location.reload(), 500);
        } catch (error) {
          setStatus("create-assignment-status", error.message || "Unable to create assignment", "error");
        }
      });

      document.getElementById("announcement-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("announcement-status", "", "");
        try {
          await window.Learnly.api("/api/announcements", {
            method: "POST",
            json: { courseId: form.courseId.value, title: form.title.value.trim(), body: form.body.value.trim() },
          });
          setStatus("announcement-status", "Announcement posted. Reloading…", "ok");
          setTimeout(() => window.location.reload(), 500);
        } catch (error) {
          setStatus("announcement-status", error.message || "Unable to post announcement", "error");
        }
      });

      document.getElementById("quiz-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("quiz-status", "", "");
        try {
          const created = await window.Learnly.api("/api/quizzes", {
            method: "POST",
            json: { courseId: form.courseId.value, title: form.title.value.trim() },
          });
          await window.Learnly.api(`/api/quizzes/${created.quiz.id}/questions`, {
            method: "POST",
            json: {
              question: form.question.value.trim(),
              a: form.a.value.trim(),
              b: form.b.value.trim(),
              c: form.c.value.trim(),
              d: form.d.value.trim(),
              correct: form.correct.value,
            },
          });
          setStatus("quiz-status", "Quiz created. Add more questions from the course page if needed. Reloading…", "ok");
          setTimeout(() => window.location.reload(), 700);
        } catch (error) {
          setStatus("quiz-status", error.message || "Unable to create quiz", "error");
        }
      });
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load dashboard</h2><p class="muted">${escapeHtml(
        error.message || "Please sign in again."
      )}</p><a class="btn" href="/signin.html">Sign in</a></div></div>`;
    }
  }

  init();
})();
