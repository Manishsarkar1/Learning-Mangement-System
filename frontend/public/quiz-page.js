(function () {
  const app = document.getElementById("app");
  let activeQuiz = null;
  let activeUser = null;
  let timerHandle = null;
  let remainingSeconds = 0;
  let hasSubmitted = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusMarkup(id) {
    return `<div class="status" id="${id}"></div>`;
  }

  function setStatus(id, message, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.className = `status${type ? ` ${type}` : ""}`;
  }

  function topbar(title, subtitle) {
    return `
      <div class="topbar">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="topbar-actions">
          <a class="btn-secondary" href="/dashboard.html">Dashboard</a>
          <a class="btn-secondary" href="/course.html?id=${activeQuiz.courseId}">Course</a>
          <button class="btn-secondary" id="logout-btn" type="button">Sign out</button>
        </div>
      </div>
    `;
  }

  function formatTimer(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function renderInstructorView(quiz, attempts) {
    return `
      ${topbar(quiz.title, `${quiz.courseTitle} · ${quiz.isPublished ? "Published" : "Draft"}`)}
      <div class="page">
        <div class="grid two">
          <div class="card">
            <div class="card-header"><h2>Quiz settings</h2></div>
            <form id="quiz-meta-form" class="stack">
              <div class="field">
                <label>Quiz title</label>
                <input name="title" value="${escapeHtml(quiz.title)}" required />
              </div>
              <div class="field">
                <label>Instructions</label>
                <textarea name="instructions" placeholder="Explain the quiz flow, attempts, or expectations">${escapeHtml(quiz.instructions || "")}</textarea>
              </div>
              <div class="row">
                <div class="field">
                  <label>Time limit (minutes)</label>
                  <input name="timeLimitMinutes" type="number" min="1" placeholder="Optional" value="${quiz.timeLimitMinutes ?? ""}" />
                </div>
                <div class="field">
                  <label>Publish status</label>
                  <select name="isPublished">
                    <option value="false" ${quiz.isPublished ? "" : "selected"}>Draft</option>
                    <option value="true" ${quiz.isPublished ? "selected" : ""}>Published</option>
                  </select>
                </div>
              </div>
              <button class="btn" type="submit">Save quiz</button>
              ${statusMarkup("quiz-meta-status")}
            </form>
          </div>

          <div class="card">
            <div class="card-header"><h2>Quiz summary</h2></div>
            <div class="list">
              <div class="list-item">
                <strong>${quiz.questions.length} questions</strong>
                <div class="meta">${quiz.totalMarks} total marks</div>
              </div>
              <div class="list-item">
                <strong>${quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} minute limit` : "No time limit"}</strong>
                <div class="meta">${quiz.isPublished ? "Students can attempt this quiz now." : "Finish adding questions, then publish."}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid two" style="margin-top:20px;">
          <div class="card">
            <div class="card-header"><h2>Add question</h2></div>
            <form id="add-question-form" class="stack">
              <div class="field">
                <label>Question</label>
                <textarea name="question" required></textarea>
              </div>
              <div class="row">
                <div class="field"><label>Option A</label><input name="a" required /></div>
                <div class="field"><label>Option B</label><input name="b" required /></div>
              </div>
              <div class="row">
                <div class="field"><label>Option C</label><input name="c" required /></div>
                <div class="field"><label>Option D</label><input name="d" required /></div>
              </div>
              <div class="row">
                <div class="field">
                  <label>Correct option</label>
                  <select name="correct">
                    <option>A</option>
                    <option>B</option>
                    <option>C</option>
                    <option>D</option>
                  </select>
                </div>
                <div class="field">
                  <label>Marks</label>
                  <input name="marks" type="number" min="1" value="1" required />
                </div>
              </div>
              <button class="btn" type="submit">Add question</button>
              ${statusMarkup("add-question-status")}
            </form>
          </div>

          <div class="card">
            <div class="card-header"><h2>Student attempts</h2></div>
            <div class="list">
              ${
                attempts.length
                  ? attempts
                      .map(
                        (attempt) => `
                        <div class="list-item">
                          <strong>${escapeHtml(attempt.student.name)}</strong>
                          <div class="meta">${escapeHtml(attempt.student.email)} · ${attempt.score}/100 · ${escapeHtml(
                            window.Learnly.formatDate(attempt.submittedAt)
                          )}</div>
                        </div>
                      `
                      )
                      .join("")
                  : `<div class="empty">No attempts yet.</div>`
              }
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:20px;">
          <div class="card-header"><h2>Questions</h2></div>
          <div class="list">
            ${
              quiz.questions.length
                ? quiz.questions
                    .map(
                      (question, index) => `
                      <div class="list-item">
                        <strong>Q${index + 1}. ${escapeHtml(question.question)}</strong>
                        <div class="meta">${question.marks} mark${question.marks === 1 ? "" : "s"} · Correct answer: ${escapeHtml(
                          question.correct_option || "-"
                        )}</div>
                        <div class="muted" style="margin-top:8px;">A. ${escapeHtml(question.option_a)}</div>
                        <div class="muted">B. ${escapeHtml(question.option_b)}</div>
                        <div class="muted">C. ${escapeHtml(question.option_c)}</div>
                        <div class="muted">D. ${escapeHtml(question.option_d)}</div>
                      </div>
                    `
                    )
                    .join("")
                : `<div class="empty">No questions added yet.</div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function renderStudentIntro(quiz) {
    return `
      ${topbar(quiz.title, `${quiz.courseTitle} · ${quiz.questions.length} questions`)}
      <div class="page">
        <div class="card" style="max-width:760px;margin:0 auto;">
          <div class="card-header"><h2>Ready to start?</h2></div>
          <p class="muted">${escapeHtml(quiz.instructions || "Read each question carefully and submit when you are done.")}</p>
          <div class="grid cards" style="margin-top:18px;">
            <div class="card"><div class="kicker">Questions</div><div class="stat-value">${quiz.questions.length}</div></div>
            <div class="card"><div class="kicker">Total marks</div><div class="stat-value">${quiz.totalMarks}</div></div>
            <div class="card"><div class="kicker">Time limit</div><div class="stat-value">${quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes}m` : "Free"}</div></div>
          </div>
          <div class="actions" style="margin-top:20px;">
            <button class="btn" id="start-quiz-btn" type="button">Start quiz</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderStudentAttempt(quiz) {
    return `
      ${topbar(quiz.title, `${quiz.courseTitle} · Answer all questions you can`)}
      <div class="page">
        <div class="card" style="margin-bottom:20px;">
          <div class="card-header">
            <h2>Attempt in progress</h2>
            <span class="pill ${quiz.timeLimitMinutes ? "warn" : "success"}" id="quiz-timer-pill">${
              quiz.timeLimitMinutes ? `Time left: ${formatTimer(remainingSeconds)}` : "No time limit"
            }</span>
          </div>
          <p class="muted">${escapeHtml(quiz.instructions || "Select one option for each question and submit when ready.")}</p>
        </div>

        <form id="quiz-attempt-form" class="stack">
          ${quiz.questions
            .map(
              (question, index) => `
              <div class="card">
                <div class="card-header">
                  <h2>Question ${index + 1}</h2>
                  <span class="pill success">${question.marks} mark${question.marks === 1 ? "" : "s"}</span>
                </div>
                <p style="margin-top:0;">${escapeHtml(question.question)}</p>
                <div class="stack" style="margin-top:12px;">
                  ${["a", "b", "c", "d"]
                    .map(
                      (option) => `
                      <label class="option-card">
                        <input type="radio" name="q_${question.id}" value="${option.toUpperCase()}" />
                        <span>${escapeHtml(question[`option_${option}`])}</span>
                      </label>
                    `
                    )
                    .join("")}
                </div>
              </div>
            `
            )
            .join("")}
          <button class="btn" type="submit">Submit quiz</button>
          ${statusMarkup("quiz-attempt-status")}
        </form>
      </div>
    `;
  }

  function renderStudentResult(quiz, attempt) {
    return `
      ${topbar(quiz.title, `${quiz.courseTitle} · Results ready`)}
      <div class="page">
        <div class="card" style="max-width:760px;margin:0 auto;">
          <div class="card-header"><h2>Quiz submitted</h2></div>
          <div class="grid cards">
            <div class="card"><div class="kicker">Score</div><div class="stat-value">${attempt.score}%</div></div>
            <div class="card"><div class="kicker">Marks earned</div><div class="stat-value">${attempt.earnedMarks}/${attempt.totalMarks}</div></div>
            <div class="card"><div class="kicker">Answered</div><div class="stat-value">${attempt.answeredCount}/${attempt.totalQuestions}</div></div>
          </div>
          <div class="actions" style="margin-top:20px;">
            <a class="btn-secondary" href="/course.html?id=${quiz.courseId}">Back to course</a>
            <a class="btn-secondary" href="/dashboard.html">Go to dashboard</a>
          </div>
        </div>
      </div>
    `;
  }

  function stopTimer() {
    if (timerHandle) window.clearInterval(timerHandle);
    timerHandle = null;
  }

  function startTimer() {
    stopTimer();
    if (!activeQuiz.timeLimitMinutes) return;
    remainingSeconds = activeQuiz.timeLimitMinutes * 60;
    const tick = () => {
      const pill = document.getElementById("quiz-timer-pill");
      if (pill) pill.textContent = `Time left: ${formatTimer(remainingSeconds)}`;
      if (remainingSeconds <= 0) {
        stopTimer();
        const form = document.getElementById("quiz-attempt-form");
        if (form && !hasSubmitted) {
          form.requestSubmit();
        }
        return;
      }
      remainingSeconds -= 1;
    };
    tick();
    timerHandle = window.setInterval(tick, 1000);
  }

  async function submitQuiz(form) {
    const answers = {};
    activeQuiz.questions.forEach((question) => {
      const selected = form.querySelector(`input[name="q_${question.id}"]:checked`);
      if (selected) answers[question.id] = selected.value;
    });

    setStatus("quiz-attempt-status", "", "");
    try {
      hasSubmitted = true;
      const result = await window.Learnly.api(`/api/quizzes/${activeQuiz.id}/attempt`, {
        method: "POST",
        json: { answers },
      });
      stopTimer();
      app.innerHTML = renderStudentResult(activeQuiz, result.attempt);
      document.getElementById("logout-btn")?.addEventListener("click", () => window.Learnly.logout());
    } catch (error) {
      hasSubmitted = false;
      setStatus("quiz-attempt-status", error.message || "Unable to submit quiz", "error");
    }
  }

  async function renderStudentFlow(quiz) {
    app.innerHTML = renderStudentIntro(quiz);
    document.getElementById("logout-btn")?.addEventListener("click", () => window.Learnly.logout());
    document.getElementById("start-quiz-btn")?.addEventListener("click", () => {
      hasSubmitted = false;
      app.innerHTML = renderStudentAttempt(quiz);
      document.getElementById("logout-btn")?.addEventListener("click", () => window.Learnly.logout());
      document.getElementById("quiz-attempt-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await submitQuiz(event.currentTarget);
      });
      startTimer();
    });
  }

  async function renderInstructorFlow(quiz) {
    const attempts = await window.Learnly.api(`/api/quizzes/${quiz.id}/attempts`).catch(() => []);
    app.innerHTML = renderInstructorView(quiz, attempts);
    document.getElementById("logout-btn")?.addEventListener("click", () => window.Learnly.logout());

    document.getElementById("quiz-meta-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setStatus("quiz-meta-status", "", "");
      try {
        await window.Learnly.api(`/api/quizzes/${quiz.id}`, {
          method: "PATCH",
          json: {
            title: form.title.value.trim(),
            instructions: form.instructions.value.trim(),
            timeLimitMinutes: form.timeLimitMinutes.value.trim() || null,
            isPublished: form.isPublished.value === "true",
          },
        });
        setStatus("quiz-meta-status", "Quiz updated. Reloading...", "ok");
        window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        setStatus("quiz-meta-status", error.message || "Unable to save quiz", "error");
      }
    });

    document.getElementById("add-question-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setStatus("add-question-status", "", "");
      try {
        await window.Learnly.api(`/api/quizzes/${quiz.id}/questions`, {
          method: "POST",
          json: {
            question: form.question.value.trim(),
            a: form.a.value.trim(),
            b: form.b.value.trim(),
            c: form.c.value.trim(),
            d: form.d.value.trim(),
            correct: form.correct.value,
            marks: form.marks.value,
          },
        });
        setStatus("add-question-status", "Question added. Reloading...", "ok");
        window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        setStatus("add-question-status", error.message || "Unable to add question", "error");
      }
    });
  }

  async function init() {
    const quizId = window.Learnly.qs("id");
    if (!quizId) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Quiz not selected</h2><p class="muted">Open this page with a valid quiz id.</p><a class="btn" href="/dashboard.html">Back to dashboard</a></div></div>`;
      return;
    }

    try {
      const [me, quiz] = await Promise.all([window.Learnly.api("/api/auth/me"), window.Learnly.api(`/api/quizzes/${quizId}`)]);
      activeQuiz = quiz;
      activeUser = me.user;
      if (activeUser.role === "student") await renderStudentFlow(quiz);
      else await renderInstructorFlow(quiz);
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load quiz</h2><p class="muted">${escapeHtml(
        error.message || "Please sign in again."
      )}</p><a class="btn" href="/dashboard.html">Back to dashboard</a></div></div>`;
    }
  }

  window.addEventListener("beforeunload", stopTimer);
  init();
})();
