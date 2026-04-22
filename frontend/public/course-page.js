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

  function topBar(title, subtitle, courseId) {
    return `
      <div class="topbar">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="topbar-actions">
          <a class="btn-secondary" href="/progress.html?courseId=${encodeURIComponent(courseId)}">Progress dashboard</a>
          <a class="btn-secondary" href="/dashboard.html">Dashboard</a>
          <a class="btn-secondary" href="/profile.html">Profile</a>
          <button class="btn-secondary" id="logout-btn" type="button">Sign out</button>
        </div>
      </div>
    `;
  }

  function submissionButton(assignment) {
    if (assignment.mySubmissionId) {
      return `
        <div class="actions" style="margin-top:12px;">
          <button class="btn-secondary" type="button" data-view-submission="${assignment.id}">View submission</button>
          ${
            assignment.myGradeScore !== null
              ? `<span class="pill success">${assignment.myGradeScore}/100</span>`
              : `<span class="pill warn">Submitted</span>`
          }
        </div>
        <div id="submission-view-${assignment.id}" class="stack" style="margin-top:12px;"></div>
      `;
    }

    if (assignment.isPastDue) {
      return `<div class="pill danger" style="margin-top:12px;">Deadline passed</div>`;
    }

    return `
      <form class="stack" data-submit-assignment="${assignment.id}" style="margin-top:12px;">
        <div class="field"><label>Text response</label><textarea name="text" placeholder="Write your response or share a supporting link"></textarea></div>
        <div class="field"><label>File upload</label><input type="file" name="file" /></div>
        <button class="btn" type="submit">Submit assignment</button>
        ${statusMarkup(`submit-status-${assignment.id}`)}
      </form>
    `;
  }

  function renderAssignment(assignment, isStudent) {
    return `
      <div class="list-item">
        <strong>${escapeHtml(assignment.title)}</strong>
        <div class="meta">
          Due ${escapeHtml(window.Learnly.formatDate(assignment.dueDate, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))}
          ${isStudent ? "" : ` | ${assignment.submissionCount} submissions`}
        </div>
        <div class="muted" style="margin-top:8px;">${escapeHtml(assignment.description)}</div>
        ${
          isStudent
            ? submissionButton(assignment)
            : `
              <div class="actions" style="margin-top:12px;">
                <button class="btn-secondary" type="button" data-load-submissions="${assignment.id}">Load submissions</button>
              </div>
              <div id="assignment-submissions-${assignment.id}" class="stack" style="margin-top:12px;"></div>
            `
        }
      </div>
    `;
  }

  function renderMaterials(course, isStudent) {
    const lessonState = new Map(((course.progress && course.progress.lessons) || []).map((lesson) => [lesson.id, lesson]));
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Lessons and materials</h2>
            <div class="muted">Course resources and lesson completion tracking.</div>
          </div>
        </div>
        <div class="list">
          ${
            course.materials.length
              ? course.materials
                  .map((item) => {
                    const lesson = lessonState.get(String(item.id));
                    return `
                      <div class="list-item">
                        <strong>${escapeHtml(item.title)}</strong>
                        <div class="meta">${escapeHtml(item.type)} | ${escapeHtml(window.Learnly.formatDate(item.createdAt))}</div>
                        <div class="actions" style="margin-top:12px;">
                          <a class="btn-secondary" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open resource</a>
                          ${
                            isStudent
                              ? `
                                <button
                                  class="${lesson && lesson.completed ? "btn-secondary" : "btn"}"
                                  type="button"
                                  data-toggle-lesson="${item.id}"
                                  data-completed="${lesson && lesson.completed ? "true" : "false"}"
                                >
                                  ${lesson && lesson.completed ? "Mark pending" : "Mark complete"}
                                </button>
                                ${
                                  lesson && lesson.completedAt
                                    ? `<span class="pill success">Completed ${escapeHtml(window.Learnly.formatDate(lesson.completedAt))}</span>`
                                    : `<span class="pill warn">Pending</span>`
                                }
                              `
                              : ""
                          }
                        </div>
                      </div>
                    `;
                  })
                  .join("")
              : `<div class="empty">No materials uploaded yet.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderStudentProgress(progress) {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Progress dashboard</h2>
            <div class="muted">Track completed lessons and course completion status.</div>
          </div>
          <a class="btn-secondary" href="/progress.html?courseId=${encodeURIComponent(window.Learnly.qs("id"))}">Open full dashboard</a>
        </div>
        <div class="grid cards">
          <div class="card"><div class="kicker">Completed lessons</div><div class="stat-value">${progress.completedLessons}</div></div>
          <div class="card"><div class="kicker">Pending lessons</div><div class="stat-value">${progress.pendingLessons}</div></div>
          <div class="card"><div class="kicker">Progress</div><div class="stat-value">${progress.progressPercentage}%</div></div>
          <div class="card"><div class="kicker">Status</div><div class="stat-value" style="font-size:22px;">${escapeHtml(progress.completionStatus.replace(/_/g, " "))}</div></div>
        </div>
        <div class="progress" style="margin-top:16px;"><span style="width:${progress.progressPercentage}%"></span></div>
      </div>
    `;
  }

  function renderInstructorProgress(progress) {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Student progress</h2>
            <div class="muted">Monitor engagement and completion rates across the course.</div>
          </div>
          <a class="btn-secondary" href="/progress.html?courseId=${encodeURIComponent(window.Learnly.qs("id"))}">Open full dashboard</a>
        </div>
        <div class="grid cards">
          <div class="card"><div class="kicker">Lessons</div><div class="stat-value">${progress.totalLessons}</div></div>
          <div class="card"><div class="kicker">Students tracked</div><div class="stat-value">${progress.studentsTracked}</div></div>
          <div class="card"><div class="kicker">Average progress</div><div class="stat-value">${progress.averageProgressPercentage}%</div></div>
          <div class="card"><div class="kicker">Completion rate</div><div class="stat-value">${progress.completionRate}%</div></div>
        </div>
        ${
          progress.students && progress.students.length
            ? `
              <div class="table-wrap" style="margin-top:16px;">
                <table>
                  <thead><tr><th>Student</th><th>Lessons</th><th>Progress</th><th>Status</th><th>Last activity</th></tr></thead>
                  <tbody>
                    ${progress.students
                      .map(
                        (student) => `
                          <tr>
                            <td>${escapeHtml(student.name)}<div class="meta">${escapeHtml(student.email)}</div></td>
                            <td>${student.completedLessons}/${student.totalLessons}</td>
                            <td>${student.progressPercentage}%</td>
                            <td>${escapeHtml(student.completionStatus.replace(/_/g, " "))}</td>
                            <td>${escapeHtml(student.lastCompletedAt ? window.Learnly.formatDate(student.lastCompletedAt) : "No lessons completed yet")}</td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            `
            : `<div class="empty" style="margin-top:16px;">No enrolled students yet.</div>`
        }
      </div>
    `;
  }

  function renderDiscussionThread(thread, me, canManage) {
    const canDeleteThread = canManage || String(thread.author.id) === String(me.user.id);
    return `
      <div class="list-item">
        <div class="actions" style="justify-content:space-between;align-items:flex-start;">
          <div>
            <strong>${escapeHtml(thread.title)}</strong>
            <div class="meta">${escapeHtml(thread.author.name)} | ${escapeHtml(window.Learnly.formatDate(thread.createdAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))} | ${thread.replyCount} replies</div>
          </div>
          ${
            canDeleteThread
              ? `<button class="btn-danger" type="button" data-delete-thread="${thread.id}">Remove</button>`
              : ""
          }
        </div>
        <div class="muted" style="margin-top:10px;">${escapeHtml(thread.body)}</div>
        <div class="stack" style="margin-top:14px;">
          ${
            thread.replies.length
              ? thread.replies
                  .map((reply) => {
                    const canDeleteReply = canManage || String(reply.author.id) === String(me.user.id);
                    return `
                      <div class="card">
                        <div class="actions" style="justify-content:space-between;align-items:flex-start;">
                          <div class="meta">${escapeHtml(reply.author.name)} | ${escapeHtml(window.Learnly.formatDate(reply.createdAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))}</div>
                          ${
                            canDeleteReply
                              ? `<button class="btn-danger" type="button" data-delete-reply="${thread.id}:${reply.id}">Remove</button>`
                              : ""
                          }
                        </div>
                        <div style="margin-top:8px;">${escapeHtml(reply.body)}</div>
                      </div>
                    `;
                  })
                  .join("")
              : `<div class="empty">No replies yet.</div>`
          }
        </div>
        <form class="stack" data-reply-thread="${thread.id}" style="margin-top:14px;">
          <div class="field"><label>Reply</label><textarea name="body" required placeholder="Write a helpful reply"></textarea></div>
          <button class="btn" type="submit">Post reply</button>
          ${statusMarkup(`reply-status-${thread.id}`)}
        </form>
      </div>
    `;
  }

  function pageMarkup(me, course) {
    const role = me.user.role;
    const isStudent = role === "student";
    const canManage = role === "instructor" || role === "faculty" || role === "admin";

    return `
      ${topBar(course.title, `${course.instructor.name} | ${course.category} | ${course.studentCount} students`, course.id)}
      <div class="page">
        <div class="grid cards">
          <div class="card"><div class="kicker">Lessons</div><div class="stat-value">${course.materials.length}</div></div>
          <div class="card"><div class="kicker">Assignments</div><div class="stat-value">${course.assignments.length}</div></div>
          <div class="card"><div class="kicker">Discussions</div><div class="stat-value">${course.discussions.length}</div></div>
          <div class="card"><div class="kicker">Quizzes</div><div class="stat-value">${course.quizzes.length}</div></div>
        </div>

        <div class="grid two" style="margin-top:20px;">
          ${renderMaterials(course, isStudent)}
          ${isStudent ? renderStudentProgress(course.progress) : renderInstructorProgress(course.progress)}
        </div>

        <div class="grid two" style="margin-top:20px;">
          <div class="card">
            <div class="card-header">
              <div>
                <h2>Assignments</h2>
                <div class="muted">Submit work before the deadline and review feedback here.</div>
              </div>
            </div>
            <div class="list">
              ${
                course.assignments.length
                  ? course.assignments.map((assignment) => renderAssignment(assignment, isStudent)).join("")
                  : `<div class="empty">No assignments created yet.</div>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <h2>Announcements</h2>
                <div class="muted">Recent updates from the teaching team.</div>
              </div>
            </div>
            <div class="list">
              ${
                course.announcements.length
                  ? course.announcements
                      .map(
                        (item) => `
                          <div class="list-item">
                            <strong>${escapeHtml(item.title)}</strong>
                            <div class="meta">${escapeHtml(item.authorName)} | ${escapeHtml(window.Learnly.formatDate(item.createdAt))}</div>
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
            <div class="card-header">
              <div>
                <h2>Discussion forum</h2>
                <div class="muted">Ask questions, reply to classmates, and keep conversations visible and accountable.</div>
              </div>
            </div>
            <form id="discussion-form" class="stack" style="margin-bottom:16px;">
              <div class="field"><label>Question title</label><input name="title" required placeholder="What do you need help with?" /></div>
              <div class="field"><label>Post</label><textarea name="body" required placeholder="Share your question or insight"></textarea></div>
              <button class="btn" type="submit">Start discussion</button>
              ${statusMarkup("discussion-status")}
            </form>
            <div class="list">
              ${
                course.discussions.length
                  ? course.discussions.map((thread) => renderDiscussionThread(thread, me, canManage)).join("")
                  : `<div class="empty">No discussions yet. Start the first conversation.</div>`
              }
            </div>
          </div>

          <div class="stack">
            ${
              canManage
                ? `
                  <div class="card">
                    <div class="card-header"><h2>Add material</h2></div>
                    <form id="material-form" class="stack">
                      <div class="row">
                        <div class="field"><label>Type</label><select name="type"><option value="pdf">PDF</option><option value="video">Video</option><option value="link">Link</option></select></div>
                        <div class="field"><label>Title</label><input name="title" required /></div>
                      </div>
                      <div class="field"><label>URL</label><input name="url" placeholder="https://example.com/resource" /></div>
                      <div class="field"><label>Upload file</label><input name="file" type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.zip,video/*" /></div>
                      <button class="btn" type="submit">Add material</button>
                      ${statusMarkup("material-status")}
                    </form>
                  </div>
                `
                : ""
            }

            <div class="card">
              <div class="card-header"><h2>Quizzes</h2></div>
              <div class="list">
                ${
                  course.quizzes.length
                    ? course.quizzes
                        .map(
                          (quiz) => `
                            <div class="list-item">
                              <strong>${escapeHtml(quiz.title)}</strong>
                              <div class="meta">${quiz.questionCount} questions | ${quiz.totalMarks} marks${quiz.timeLimitMinutes ? ` | ${quiz.timeLimitMinutes} min` : ""}</div>
                              ${quiz.instructions ? `<div class="muted" style="margin-top:8px;">${escapeHtml(quiz.instructions)}</div>` : ""}
                              <div class="actions" style="margin-top:12px;"><a class="btn-secondary" href="/quiz.html?id=${quiz.id}">${isStudent ? "Open quiz" : "Manage quiz"}</a></div>
                            </div>
                          `
                        )
                        .join("")
                    : `<div class="empty">No quizzes available yet.</div>`
                }
              </div>
            </div>

            ${
              canManage && course.students
                ? `
                  <div class="card">
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
        </div>
      </div>
    `;
  }

  async function loadSubmissionDetails(assignmentId) {
    const box = document.getElementById(`submission-view-${assignmentId}`);
    if (!box) return;
    box.innerHTML = `<div class="muted">Loading submission...</div>`;
    try {
      const submission = await window.Learnly.api(`/api/submissions/my?assignmentId=${assignmentId}`);
      box.innerHTML = `
        <div class="card">
          <div class="meta">${escapeHtml(window.Learnly.formatDate(submission.submittedAt))}</div>
          <div class="muted" style="margin-top:8px;">${escapeHtml(submission.text || "No text provided.")}</div>
          ${
            submission.file
              ? `<div class="actions" style="margin-top:12px;"><a class="btn-secondary" href="${escapeHtml(submission.file.url)}" target="_blank" rel="noreferrer">View uploaded file</a></div>`
              : ""
          }
          ${
            submission.grade
              ? `<div class="actions" style="margin-top:12px;"><span class="pill success">${submission.grade.score}/100</span><span class="muted">${escapeHtml(submission.grade.feedback || "No feedback provided.")}</span></div>`
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
    if (!box) return;
    box.innerHTML = `<div class="muted">Loading submissions...</div>`;
    try {
      const submissions = await window.Learnly.api(`/api/submissions/assignment/${assignmentId}`);
      box.innerHTML = submissions.length
        ? submissions
            .map(
              (submission) => `
                <div class="card">
                  <strong>${escapeHtml(submission.student.name)}</strong>
                  <div class="meta">${escapeHtml(submission.student.email)} | ${escapeHtml(window.Learnly.formatDate(submission.submittedAt))}</div>
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
            setStatus(`grade-status-${submissionId}`, error.message || "Unable to save grade.", "error");
          }
        });
      });
    } catch (error) {
      box.innerHTML = `<div class="empty">${escapeHtml(error.message || "Unable to load submissions.")}</div>`;
    }
  }

  async function reloadCoursePage() {
    window.location.reload();
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
            setStatus(`submit-status-${assignmentId}`, "Submission saved. Reloading...", "ok");
            setTimeout(reloadCoursePage, 500);
          } catch (error) {
            setStatus(`submit-status-${assignmentId}`, error.message || "Unable to submit assignment.", "error");
          }
        });
      });

      document.querySelectorAll("[data-load-submissions]").forEach((button) => {
        button.addEventListener("click", () => loadAssignmentSubmissions(button.getAttribute("data-load-submissions")));
      });

      document.querySelectorAll("[data-toggle-lesson]").forEach((button) => {
        button.addEventListener("click", async () => {
          const materialId = button.getAttribute("data-toggle-lesson");
          const completed = button.getAttribute("data-completed") === "true";
          button.disabled = true;
          try {
            await window.Learnly.api(`/api/courses/${courseId}/materials/${materialId}/progress`, {
              method: completed ? "DELETE" : "POST",
              json: {},
            });
            reloadCoursePage();
          } catch (error) {
            button.disabled = false;
            window.alert(error.message || "Unable to update lesson progress.");
          }
        });
      });

      document.getElementById("discussion-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("discussion-status", "", "");
        try {
          await window.Learnly.api(`/api/courses/${courseId}/discussions`, {
            method: "POST",
            json: { title: form.title.value.trim(), body: form.body.value.trim() },
          });
          setStatus("discussion-status", "Discussion posted. Reloading...", "ok");
          setTimeout(reloadCoursePage, 400);
        } catch (error) {
          setStatus("discussion-status", error.message || "Unable to post discussion.", "error");
        }
      });

      document.querySelectorAll("[data-reply-thread]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const threadId = form.getAttribute("data-reply-thread");
          setStatus(`reply-status-${threadId}`, "", "");
          try {
            await window.Learnly.api(`/api/courses/${courseId}/discussions/${threadId}/replies`, {
              method: "POST",
              json: { body: form.body.value.trim() },
            });
            setStatus(`reply-status-${threadId}`, "Reply posted. Reloading...", "ok");
            setTimeout(reloadCoursePage, 400);
          } catch (error) {
            setStatus(`reply-status-${threadId}`, error.message || "Unable to post reply.", "error");
          }
        });
      });

      document.querySelectorAll("[data-delete-thread]").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await window.Learnly.api(`/api/courses/${courseId}/discussions/${button.getAttribute("data-delete-thread")}`, { method: "DELETE" });
            reloadCoursePage();
          } catch (error) {
            window.alert(error.message || "Unable to delete discussion.");
          }
        });
      });

      document.querySelectorAll("[data-delete-reply]").forEach((button) => {
        button.addEventListener("click", async () => {
          const value = button.getAttribute("data-delete-reply") || "";
          const parts = value.split(":");
          if (parts.length !== 2) return;
          try {
            await window.Learnly.api(`/api/courses/${courseId}/discussions/${parts[0]}/replies/${parts[1]}`, { method: "DELETE" });
            reloadCoursePage();
          } catch (error) {
            window.alert(error.message || "Unable to delete reply.");
          }
        });
      });

      document.getElementById("material-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("material-status", "", "");
        try {
          const payload = new FormData();
          payload.append("type", form.type.value);
          payload.append("title", form.title.value.trim());
          payload.append("url", form.url.value.trim());
          if (form.file.files[0]) payload.append("file", form.file.files[0]);

          await window.Learnly.api(`/api/courses/${courseId}/materials`, { method: "POST", form: payload });
          setStatus("material-status", "Material added. Reloading...", "ok");
          setTimeout(reloadCoursePage, 500);
        } catch (error) {
          setStatus("material-status", error.message || "Unable to add material.", "error");
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
          setStatus("announcement-status", "Announcement posted. Reloading...", "ok");
          setTimeout(reloadCoursePage, 500);
        } catch (error) {
          setStatus("announcement-status", error.message || "Unable to post announcement.", "error");
        }
      });
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load course</h2><p class="muted">${escapeHtml(error.message || "Please sign in again.")}</p><a class="btn" href="/dashboard.html">Back to dashboard</a></div></div>`;
    }
  }

  init();
})();
