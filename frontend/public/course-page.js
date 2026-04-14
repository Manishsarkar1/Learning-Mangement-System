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

  function setStatus(id, message, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.className = `status${type ? ` ${type}` : ""}`;
  }

  function statusMarkup(id) {
    return `<div class="status" id="${id}"></div>`;
  }

  function topBar(title, subtitle) {
    return `
      <div class="topbar">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="topbar-actions">
          <a class="btn-secondary" href="/dashboard.html">Dashboard</a>
          <a class="btn-secondary" href="/profile.html">Profile</a>
          <button class="btn-secondary" id="logout-btn" type="button">Sign out</button>
        </div>
      </div>
    `;
  }

  function renderStudentAssignment(assignment) {
    return `
      <div class="list-item">
        <strong>${escapeHtml(assignment.title)}</strong>
        <div class="meta">Due ${escapeHtml(window.Learnly.formatDate(assignment.dueDate))}</div>
        <div class="muted" style="margin-top:8px;">${escapeHtml(assignment.description)}</div>
        ${
          assignment.mySubmissionId
            ? `<div class="actions" style="margin-top:12px;"><button class="btn-secondary" type="button" data-view-submission="${assignment.id}">View submission</button>${
                assignment.myGradeScore !== null ? `<span class="pill success">${assignment.myGradeScore}/100</span>` : `<span class="pill warn">Submitted</span>`
              }</div><div id="submission-view-${assignment.id}" class="stack" style="margin-top:12px;"></div>`
            : `
            <form class="stack" data-submit-assignment="${assignment.id}" style="margin-top:12px;">
              <div class="field"><label>Text response</label><textarea name="text" placeholder="Write a short summary or add your submission link"></textarea></div>
              <div class="field"><label>File upload</label><input type="file" name="file" /></div>
              <button class="btn" type="submit">Submit assignment</button>
              ${statusMarkup(`submit-status-${assignment.id}`)}
            </form>
          `
        }
      </div>
    `;
  }

  function renderInstructorAssignment(assignment) {
    return `
      <div class="list-item">
        <strong>${escapeHtml(assignment.title)}</strong>
        <div class="meta">Due ${escapeHtml(window.Learnly.formatDate(assignment.dueDate))} · ${assignment.submissionCount} submissions</div>
        <div class="muted" style="margin-top:8px;">${escapeHtml(assignment.description)}</div>
        <div class="actions" style="margin-top:12px;">
          <button class="btn-secondary" type="button" data-load-submissions="${assignment.id}">Load submissions</button>
        </div>
        <div id="assignment-submissions-${assignment.id}" class="stack" style="margin-top:12px;"></div>
      </div>
    `;
  }

  function renderQuizItem(quiz, role) {
    return `
      <div class="list-item">
        <strong>${escapeHtml(quiz.title)}</strong>
        <div class="meta">${quiz.questionCount} questions${quiz.myLatestScore !== null ? ` · Latest score: ${quiz.myLatestScore}` : ""}</div>
        <div class="actions" style="margin-top:12px;">
          <button class="btn-secondary" type="button" data-open-quiz="${quiz.id}">${role === "student" ? "Take quiz" : "View quiz"}</button>
          ${role !== "student" ? `<button class="btn-secondary" type="button" data-open-attempts="${quiz.id}">View attempts</button>` : ""}
        </div>
        <div id="quiz-panel-${quiz.id}" class="stack" style="margin-top:12px;"></div>
      </div>
    `;
  }

  function pageMarkup(me, course) {
    const isStudent = me.user.role === "student";
    const canManage = me.user.role === "instructor" || me.user.role === "admin";

    return `
      ${topBar(course.title, `${course.instructor.name} · ${course.studentCount} students`)}
      <div class="page">
        <div class="grid cards">
          <div class="card"><div class="kicker">Materials</div><div class="stat-value">${course.materials.length}</div></div>
          <div class="card"><div class="kicker">Assignments</div><div class="stat-value">${course.assignments.length}</div></div>
          <div class="card"><div class="kicker">Announcements</div><div class="stat-value">${course.announcements.length}</div></div>
          <div class="card"><div class="kicker">Quizzes</div><div class="stat-value">${course.quizzes.length}</div></div>
        </div>

        <div class="grid two" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Materials</h2></div>
            <div class="list">
              ${
                course.materials.length
                  ? course.materials
                      .map(
                        (item) => `
                      <div class="list-item">
                        <strong>${escapeHtml(item.title)}</strong>
                        <div class="meta">${escapeHtml(item.type)} · <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open resource</a></div>
                      </div>
                    `
                      )
                      .join("")
                  : `<div class="empty">No materials uploaded yet.</div>`
              }
            </div>
            ${
              canManage
                ? `
                <form id="material-form" class="stack" style="margin-top:16px;">
                  <div class="row">
                    <div class="field"><label>Type</label><select name="type"><option value="pdf">PDF</option><option value="video">Video</option><option value="link">Link</option></select></div>
                    <div class="field"><label>Title</label><input name="title" required /></div>
                  </div>
                  <div class="field"><label>URL</label><input name="url" required /></div>
                  <button class="btn" type="submit">Add material</button>
                  ${statusMarkup("material-status")}
                </form>
              `
                : ""
            }
          </div>

          <div class="card">
            <div class="card-header"><h2>Announcements</h2></div>
            <div class="list">
              ${
                course.announcements.length
                  ? course.announcements
                      .map(
                        (item) => `
                      <div class="list-item">
                        <strong>${escapeHtml(item.title)}</strong>
                        <div class="meta">${escapeHtml(item.authorName)} · ${escapeHtml(window.Learnly.formatDate(item.createdAt))}</div>
                        <div class="muted" style="margin-top:8px;">${escapeHtml(item.body)}</div>
                      </div>
                    `
                      )
                      .join("")
                  : `<div class="empty">No announcements yet.</div>`
              }
            </div>
            ${
              canManage
                ? `
                <form id="announcement-form" class="stack" style="margin-top:16px;">
                  <div class="field"><label>Title</label><input name="title" required /></div>
                  <div class="field"><label>Message</label><textarea name="body" required></textarea></div>
                  <button class="btn" type="submit">Post announcement</button>
                  ${statusMarkup("announcement-status")}
                </form>
              `
                : ""
            }
          </div>
        </div>

        <div class="grid two" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Assignments</h2></div>
            <div class="list">
              ${
                course.assignments.length
                  ? course.assignments.map((assignment) => (isStudent ? renderStudentAssignment(assignment) : renderInstructorAssignment(assignment))).join("")
                  : `<div class="empty">No assignments created yet.</div>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2>Quizzes</h2></div>
            <div class="list">
              ${
                course.quizzes.length
                  ? course.quizzes.map((quiz) => renderQuizItem(quiz, me.user.role)).join("")
                  : `<div class="empty">No quizzes available yet.</div>`
              }
            </div>
          </div>
        </div>

        ${
          canManage && course.students
            ? `
            <div class="card" style="margin-top:20px;">
              <div class="card-header"><h2>Roster</h2></div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Email</th><th>Enrolled</th></tr></thead>
                  <tbody>
                    ${course.students
                      .map(
                        (student) => `
                        <tr>
                          <td>${escapeHtml(student.name)}</td>
                          <td>${escapeHtml(student.email)}</td>
                          <td>${escapeHtml(window.Learnly.formatDate(student.enrolledAt))}</td>
                        </tr>
                      `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>
          `
            : ""
        }
      </div>
    `;
  }

  async function loadSubmissionDetails(assignmentId) {
    const box = document.getElementById(`submission-view-${assignmentId}`);
    box.innerHTML = `<div class="muted">Loading submission...</div>`;
    try {
      const submission = await window.Learnly.api(`/api/submissions/my?assignmentId=${assignmentId}`);
      box.innerHTML = `
        <div class="card">
          <div class="muted">${escapeHtml(submission.text || "No text provided.")}</div>
          ${
            submission.file
              ? `<div class="actions" style="margin-top:12px;"><a class="btn-secondary" href="${escapeHtml(submission.file.url)}" target="_blank" rel="noreferrer">View uploaded file</a></div>`
              : ""
          }
          ${
            submission.grade
              ? `<div class="actions" style="margin-top:12px;"><span class="pill success">${submission.grade.score}/100</span><span class="muted">${escapeHtml(
                  submission.grade.feedback || ""
                )}</span></div>`
              : `<div class="pill warn" style="margin-top:12px;">Awaiting grading</div>`
          }
        </div>
      `;
    } catch (error) {
      box.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load submission.")}</div>`;
    }
  }

  async function loadAssignmentSubmissions(assignmentId) {
    const box = document.getElementById(`assignment-submissions-${assignmentId}`);
    box.innerHTML = `<div class="muted">Loading submissions...</div>`;
    try {
      const submissions = await window.Learnly.api(`/api/submissions/assignment/${assignmentId}`);
      box.innerHTML = submissions.length
        ? submissions
            .map(
              (submission) => `
              <div class="card">
                <strong>${escapeHtml(submission.student.name)}</strong>
                <div class="meta">${escapeHtml(submission.student.email)} · ${escapeHtml(window.Learnly.formatDate(submission.submittedAt))}</div>
                <div class="muted" style="margin-top:8px;">${escapeHtml(submission.text || "No text provided.")}</div>
                ${
                  submission.file
                    ? `<div class="actions" style="margin-top:12px;"><a class="btn-secondary" href="${escapeHtml(submission.file.url)}" target="_blank" rel="noreferrer">View file</a></div>`
                    : ""
                }
                <form class="stack" data-grade-submission="${submission.id}" style="margin-top:12px;">
                  <div class="row">
                    <div class="field"><label>Score</label><input name="score" type="number" min="0" max="100" value="${submission.grade ? submission.grade.score : ""}" required /></div>
                    <div class="field"><label>Feedback</label><input name="feedback" value="${escapeHtml(submission.grade ? submission.grade.feedback : "")}" /></div>
                  </div>
                  <button class="btn" type="submit">Save grade</button>
                  ${statusMarkup(`grade-status-${submission.id}`)}
                </form>
              </div>
            `
            )
            .join("")
        : `<div class="empty">No submissions yet.</div>`;

      box.querySelectorAll("[data-grade-submission]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submissionId = form.getAttribute("data-grade-submission");
          setStatus(`grade-status-${submissionId}`, "", "");
          try {
            await window.Learnly.api(`/api/submissions/${submissionId}/grade`, {
              method: "PATCH",
              json: { score: form.score.value, feedback: form.feedback.value },
            });
            setStatus(`grade-status-${submissionId}`, "Grade saved.", "ok");
          } catch (error) {
            setStatus(`grade-status-${submissionId}`, error.message || "Unable to save grade", "error");
          }
        });
      });
    } catch (error) {
      box.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load submissions.")}</div>`;
    }
  }

  async function loadQuizPanel(quizId, role) {
    const box = document.getElementById(`quiz-panel-${quizId}`);
    box.innerHTML = `<div class="muted">Loading quiz...</div>`;
    try {
      const quiz = await window.Learnly.api(`/api/quizzes/${quizId}`);
      if (role === "student") {
        box.innerHTML = `
          <form class="stack" data-quiz-attempt="${quizId}">
            ${quiz.questions
              .map(
                (question) => `
                <div class="card">
                  <strong>${escapeHtml(question.question)}</strong>
                  <div class="stack" style="margin-top:10px;">
                    ${["a", "b", "c", "d"]
                      .map(
                        (option) => `
                        <label><input type="radio" name="q_${question.id}" value="${option.toUpperCase()}" /> ${escapeHtml(question[`option_${option}`])}</label>
                      `
                      )
                      .join("")}
                  </div>
                </div>
              `
              )
              .join("")}
            <button class="btn" type="submit">Submit quiz</button>
            ${statusMarkup(`quiz-status-${quizId}`)}
          </form>
        `;

        box.querySelector(`[data-quiz-attempt="${quizId}"]`)?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const answers = {};
          quiz.questions.forEach((question) => {
            const selected = box.querySelector(`input[name="q_${question.id}"]:checked`);
            if (selected) answers[question.id] = selected.value;
          });
          setStatus(`quiz-status-${quizId}`, "", "");
          try {
            const result = await window.Learnly.api(`/api/quizzes/${quizId}/attempt`, { method: "POST", json: { answers } });
            setStatus(`quiz-status-${quizId}`, `Quiz submitted. Score: ${result.attempt.score}/100`, "ok");
          } catch (error) {
            setStatus(`quiz-status-${quizId}`, error.message || "Unable to submit quiz", "error");
          }
        });
      } else {
        box.innerHTML = `
          <div class="list">
            ${quiz.questions
              .map(
                (question) => `
                <div class="list-item">
                  <strong>${escapeHtml(question.question)}</strong>
                  <div class="meta">A: ${escapeHtml(question.option_a)} · B: ${escapeHtml(question.option_b)}</div>
                  <div class="meta">C: ${escapeHtml(question.option_c)} · D: ${escapeHtml(question.option_d)}</div>
                  <div class="pill success" style="margin-top:10px;">Correct: ${escapeHtml(question.correct_option || "—")}</div>
                </div>
              `
              )
              .join("")}
          </div>
        `;
      }
    } catch (error) {
      box.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load quiz.")}</div>`;
    }
  }

  async function loadQuizAttempts(quizId) {
    const box = document.getElementById(`quiz-panel-${quizId}`);
    box.innerHTML = `<div class="muted">Loading attempts...</div>`;
    try {
      const attempts = await window.Learnly.api(`/api/quizzes/${quizId}/attempts`);
      box.innerHTML = attempts.length
        ? attempts
            .map(
              (attempt) => `
              <div class="list-item">
                <strong>${escapeHtml(attempt.student.name)}</strong>
                <div class="meta">${escapeHtml(attempt.student.email)} · ${attempt.score}/100 · ${escapeHtml(window.Learnly.formatDate(attempt.submittedAt))}</div>
              </div>
            `
            )
            .join("")
        : `<div class="empty">No attempts yet.</div>`;
    } catch (error) {
      box.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load attempts.")}</div>`;
    }
  }

  async function init() {
    const courseId = window.Learnly.qs("id");
    if (!courseId) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Course not selected</h2><p class="muted">Open this page with a valid course id, for example <code>/course.html?id=1</code>.</p><a class="btn" href="/dashboard.html">Back to dashboard</a></div></div>`;
      return;
    }

    try {
      const [me, course] = await Promise.all([window.Learnly.api("/api/auth/me"), window.Learnly.api(`/api/courses/${courseId}`)]);
      app.innerHTML = pageMarkup(me, course);
      document.getElementById("logout-btn")?.addEventListener("click", () => window.Learnly.logout());

      document.querySelectorAll("[data-view-submission]").forEach((button) => {
        button.addEventListener("click", () => loadSubmissionDetails(button.getAttribute("data-view-submission")));
      });

      document.querySelectorAll("[data-submit-assignment]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const assignmentId = form.getAttribute("data-submit-assignment");
          const payload = new FormData();
          payload.append("assignmentId", assignmentId);
          payload.append("text", form.text.value);
          if (form.file.files[0]) payload.append("file", form.file.files[0]);
          setStatus(`submit-status-${assignmentId}`, "", "");
          try {
            await window.Learnly.api("/api/submissions", { method: "POST", form: payload });
            setStatus(`submit-status-${assignmentId}`, "Submitted successfully. Reloading…", "ok");
            setTimeout(() => window.location.reload(), 700);
          } catch (error) {
            setStatus(`submit-status-${assignmentId}`, error.message || "Unable to submit assignment", "error");
          }
        });
      });

      document.querySelectorAll("[data-load-submissions]").forEach((button) => {
        button.addEventListener("click", () => loadAssignmentSubmissions(button.getAttribute("data-load-submissions")));
      });

      document.querySelectorAll("[data-open-quiz]").forEach((button) => {
        button.addEventListener("click", () => loadQuizPanel(button.getAttribute("data-open-quiz"), me.user.role));
      });

      document.querySelectorAll("[data-open-attempts]").forEach((button) => {
        button.addEventListener("click", () => loadQuizAttempts(button.getAttribute("data-open-attempts")));
      });

      document.getElementById("material-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("material-status", "", "");
        try {
          await window.Learnly.api(`/api/courses/${courseId}/materials`, {
            method: "POST",
            json: { type: form.type.value, title: form.title.value.trim(), url: form.url.value.trim() },
          });
          setStatus("material-status", "Material added. Reloading…", "ok");
          setTimeout(() => window.location.reload(), 500);
        } catch (error) {
          setStatus("material-status", error.message || "Unable to add material", "error");
        }
      });

      document.getElementById("announcement-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("announcement-status", "", "");
        try {
          await window.Learnly.api("/api/announcements", {
            method: "POST",
            json: { courseId, title: form.title.value.trim(), body: form.body.value.trim() },
          });
          setStatus("announcement-status", "Announcement posted. Reloading…", "ok");
          setTimeout(() => window.location.reload(), 500);
        } catch (error) {
          setStatus("announcement-status", error.message || "Unable to post announcement", "error");
        }
      });
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load course</h2><p class="muted">${escapeHtml(
        error.message || "Please sign in again."
      )}</p><a class="btn" href="/dashboard.html">Back to dashboard</a></div></div>`;
    }
  }

  init();
})();
