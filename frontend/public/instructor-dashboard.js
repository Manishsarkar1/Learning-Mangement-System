(function () {
  const app = document.getElementById("app");
  const { escapeHtml, statusMarkup, setStatus, chartMarkup, statCards, renderLayout } = window.LearnlyDash;
  const section = {
    "/instructor-dashboard.html": "overview",
    "/instructor-courses.html": "courses",
    "/instructor-create.html": "actions",
    "/instructor-grading.html": "grading",
    "/instructor-insights.html": "insights",
  }[window.location.pathname] || "overview";

  const pages = [
    { id: "overview", label: "Overview", href: "/instructor-dashboard.html", title: "Instructor overview", description: "Monitor your courses, students, and pending work." },
    { id: "courses", label: "Courses", href: "/instructor-courses.html", title: "Course management", description: "Manage courses and create assignments." },
    { id: "actions", label: "Create content", href: "/instructor-create.html", title: "Create content", description: "Post announcements and build quizzes." },
    { id: "grading", label: "Grading", href: "/instructor-grading.html", title: "Grading", description: "Review pending submissions and student performance." },
    { id: "insights", label: "Insights", href: "/instructor-insights.html", title: "Insights", description: "Review announcements, quiz usage, and weekly submission trends." },
  ];

  function courseOptions(data) {
    return data.courses.map((course) => `<option value="${course.id}">${escapeHtml(course.title)}</option>`).join("");
  }

  function renderOverview(data) {
    const stats = [
      { label: "Active Courses", value: data.stats.activeCourses, help: "Courses you currently manage" },
      { label: "Total Students", value: data.stats.totalStudents, help: "Across your active cohorts" },
      { label: "Average Score", value: data.stats.averageScore ?? "-", help: "Across graded submissions" },
      { label: "Pending Reviews", value: data.stats.pendingReviews, help: "Need grading attention" },
    ];

    return `<div class="page">${statCards(stats)}</div>`;
  }

  function renderCourses(data) {
    const options = courseOptions(data);
    return `
      <div class="page">
        <section class="grid two">
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
                            <div class="meta">${escapeHtml(course.category || "General")} | ${course.studentCount} students | ${course.assignmentCount} assignments | ${course.announcementCount} announcements</div>
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
                <div class="field"><label>Category</label><input name="category" placeholder="Web Development, Design, Analytics..." required /></div>
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
      </div>
    `;
  }

  function renderActions(data) {
    const options = courseOptions(data);
    return `
      <div class="page">
        <section class="grid two">
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
              <div class="field"><label>Instructions</label><textarea name="instructions" placeholder="Explain the quiz goals or rules"></textarea></div>
              <div class="field"><label>Time limit (minutes)</label><input name="timeLimitMinutes" type="number" min="1" placeholder="Optional" /></div>
              <button class="btn" type="submit">Create draft quiz</button>
              ${statusMarkup("quiz-status")}
            </form>
          </div>
        </section>
      </div>
    `;
  }

  function renderGrading(data) {
    return `
      <div class="page">
        <section class="grid two">
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
                            <div class="meta">${escapeHtml(item.studentName)} | ${escapeHtml(item.courseTitle)} | ${escapeHtml(window.Learnly.formatDate(item.submittedAt))}</div>
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
                            <div class="meta">${escapeHtml(student.email)} | ${student.averageScore}/100 average across ${student.gradedSubmissions} graded submissions</div>
                          </div>
                        `
                      )
                      .join("")
                  : `<div class="empty">Student performance data will show up after grading begins.</div>`
              }
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderInsights(data) {
    return `
      <div class="page">
        <section class="grid two">
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
                            <div class="meta">${escapeHtml(item.courseTitle || "General")} | ${escapeHtml(item.authorName)}</div>
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
                            <div class="meta">${escapeHtml(quiz.courseTitle)} | ${quiz.questionCount} questions | ${quiz.totalMarks} marks | ${quiz.attemptCount} attempts | ${
                              quiz.isPublished ? "Published" : "Draft"
                            }</div>
                            <div class="actions" style="margin-top:12px;"><a class="btn-secondary" href="/quiz.html?id=${quiz.id}">Manage quiz</a></div>
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

  function bindForms() {
    document.getElementById("create-course-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setStatus("create-course-status", "", "");
      try {
        await window.Learnly.api("/api/courses", {
          method: "POST",
          json: { title: form.title.value.trim(), description: form.description.value.trim(), category: form.category.value.trim() },
        });
        setStatus("create-course-status", "Course created. Reloading...", "ok");
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
        setStatus("create-assignment-status", "Assignment published. Reloading...", "ok");
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
        setStatus("announcement-status", "Announcement posted. Reloading...", "ok");
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
          json: {
            courseId: form.courseId.value,
            title: form.title.value.trim(),
            instructions: form.instructions.value.trim(),
            timeLimitMinutes: form.timeLimitMinutes.value.trim() || null,
            isPublished: false,
          },
        });
        setStatus("quiz-status", "Quiz draft created. Opening builder...", "ok");
        setTimeout(() => {
          window.location.href = `/quiz.html?id=${created.quiz.id}`;
        }, 500);
      } catch (error) {
        setStatus("quiz-status", error.message || "Unable to create quiz", "error");
      }
    });
  }

  async function init() {
    try {
      const me = await window.Learnly.api("/api/dashboard/me");
      if (me.role !== "instructor") {
        if (me.role === "student") window.location.replace("/student-dashboard.html");
        if (me.role === "admin") window.location.replace("/admin-dashboard.html");
        return;
      }

      const currentPage = pages.find((page) => page.id === section) || pages[0];
      const content = {
        overview: renderOverview,
        courses: renderCourses,
        actions: renderActions,
        grading: renderGrading,
        insights: renderInsights,
      }[section];

      renderLayout(app, me.profile, pages, content(me.dashboard), {
        activeId: currentPage.id,
        pageTitle: currentPage.title,
        pageDescription: currentPage.description,
      });

      bindForms();
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load dashboard</h2><p class="muted">${escapeHtml(
        error.message || "Please sign in again."
      )}</p><a class="btn" href="/signin.html">Sign in</a></div></div>`;
    }
  }

  init();
})();
