const db = require("../config/db");
const { toId } = require("./courseController");
const { writeAuditLog } = require("../services/auditLog");

async function loadQuiz(quizId) {
  const rows = await db.query(
    `
    SELECT
      q.id,
      q.course_id AS courseId,
      q.title,
      q.created_at AS createdAt,
      c.title AS courseTitle,
      c.instructor_id AS instructorId
    FROM quizzes q
    JOIN courses c ON c.id = q.course_id
    WHERE q.id = ?
    LIMIT 1
  `,
    [quizId]
  );
  if (!rows || rows.length === 0) {
    const err = new Error("Quiz not found");
    err.status = 404;
    throw err;
  }
  return rows[0];
}

async function ensureQuizAccess(quizId, user) {
  const quiz = await loadQuiz(quizId);
  const userId = toId(user.id);
  const isAdmin = user.role === "admin";
  const isOwner = user.role === "instructor" && Number(quiz.instructorId) === userId;
  let isEnrolled = false;
  if (user.role === "student") {
    const enrolled = await db.query("SELECT 1 AS ok FROM enrollments WHERE course_id = ? AND student_id = ? LIMIT 1", [quiz.courseId, userId]);
    isEnrolled = enrolled && enrolled.length > 0;
  }
  return { quiz, isAdmin, isOwner, isEnrolled };
}

async function createQuiz(req, res) {
  const courseId = toId(req.body && (req.body.courseId || req.body.course_id));
  const title = String(req.body && req.body.title ? req.body.title : "").trim();

  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });
  if (!title) return res.status(400).json({ message: "Title is required" });

  const courseRows = await db.query("SELECT id, title, instructor_id AS instructorId FROM courses WHERE id = ? LIMIT 1", [courseId]);
  if (!courseRows || courseRows.length === 0) return res.status(404).json({ message: "Course not found" });

  const course = courseRows[0];
  const userId = toId(req.user.id);
  const isAdmin = req.user.role === "admin";
  const isOwner = req.user.role === "instructor" && Number(course.instructorId) === userId;
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  const result = await db.exec("INSERT INTO quizzes (course_id, title) VALUES (?, ?)", [courseId, title]);

  await writeAuditLog({
    actorUserId: userId,
    action: "quiz.created",
    entityType: "quiz",
    entityId: result.insertId,
    message: `Quiz created in ${course.title}: ${title}`,
  });

  return res.status(201).json({ message: "Quiz created", quiz: { id: String(result.insertId) } });
}

async function addQuestion(req, res) {
  const quizId = toId(req.params.id || (req.body && req.body.quizId) || (req.body && req.body.quiz_id));
  if (!quizId) return res.status(400).json({ message: "Invalid quizId" });

  const question = String(req.body && req.body.question ? req.body.question : "").trim();
  const a = String(req.body && (req.body.a || req.body.option_a) ? req.body.a || req.body.option_a : "").trim();
  const b = String(req.body && (req.body.b || req.body.option_b) ? req.body.b || req.body.option_b : "").trim();
  const c = String(req.body && (req.body.c || req.body.option_c) ? req.body.c || req.body.option_c : "").trim();
  const d = String(req.body && (req.body.d || req.body.option_d) ? req.body.d || req.body.option_d : "").trim();
  const correct = String(req.body && (req.body.correct || req.body.correct_option) ? req.body.correct || req.body.correct_option : "").trim().toUpperCase();

  if (!question || !a || !b || !c || !d) return res.status(400).json({ message: "Question and all options are required" });
  if (!["A", "B", "C", "D"].includes(correct)) return res.status(400).json({ message: "Correct option must be A, B, C, or D" });

  const { quiz, isAdmin, isOwner } = await ensureQuizAccess(quizId, req.user);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  const result = await db.exec(
    `
    INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [quizId, question, a, b, c, d, correct]
  );

  await writeAuditLog({
    actorUserId: req.user.id,
    action: "quiz.question_added",
    entityType: "quiz_question",
    entityId: result.insertId,
    message: `Question added to quiz ${quiz.title}`,
  });

  return res.status(201).json({ message: "Question added", question: { id: String(result.insertId) } });
}

async function listByCourse(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const courseRows = await db.query("SELECT instructor_id AS instructorId FROM courses WHERE id = ? LIMIT 1", [courseId]);
  if (!courseRows || courseRows.length === 0) return res.status(404).json({ message: "Course not found" });

  const userId = toId(req.user.id);
  const isAdmin = req.user.role === "admin";
  const isOwner = req.user.role === "instructor" && Number(courseRows[0].instructorId) === userId;
  let isEnrolled = false;
  if (req.user.role === "student") {
    const enrolled = await db.query("SELECT 1 AS ok FROM enrollments WHERE course_id = ? AND student_id = ? LIMIT 1", [courseId, userId]);
    isEnrolled = enrolled && enrolled.length > 0;
  }
  if (!isAdmin && !isOwner && !isEnrolled) return res.status(403).json({ message: "Forbidden" });

  const rows = await db.query(
    `
    SELECT
      q.id,
      q.title,
      q.created_at AS createdAt,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questionCount,
      (
        SELECT qa.score
        FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.student_id = ?
        ORDER BY qa.submitted_at DESC
        LIMIT 1
      ) AS myLatestScore
    FROM quizzes q
    WHERE q.course_id = ?
    ORDER BY q.created_at DESC
  `,
    [userId, courseId]
  );

  return res.json(
    (rows || []).map((row) => ({
      id: String(row.id),
      title: row.title,
      createdAt: row.createdAt,
      questionCount: Number(row.questionCount) || 0,
      myLatestScore: row.myLatestScore !== null ? Number(row.myLatestScore) : null,
    }))
  );
}

async function getQuiz(req, res) {
  const quizId = toId(req.params.id);
  if (!quizId) return res.status(400).json({ message: "Invalid quiz id" });

  const { quiz, isAdmin, isOwner, isEnrolled } = await ensureQuizAccess(quizId, req.user);
  if (!isAdmin && !isOwner && !isEnrolled) return res.status(403).json({ message: "Forbidden" });

  const rows = await db.query(
    `
    SELECT
      id,
      question,
      option_a AS a,
      option_b AS b,
      option_c AS c,
      option_d AS d,
      correct_option AS correct
    FROM quiz_questions
    WHERE quiz_id = ?
    ORDER BY created_at ASC
  `,
    [quizId]
  );

  return res.json({
    id: String(quiz.id),
    title: quiz.title,
    courseId: String(quiz.courseId),
    courseTitle: quiz.courseTitle,
    createdAt: quiz.createdAt,
    questions: (rows || []).map((row) => ({
      id: String(row.id),
      question: row.question,
      option_a: row.a,
      option_b: row.b,
      option_c: row.c,
      option_d: row.d,
      correct_option: isAdmin || isOwner ? row.correct : undefined,
    })),
  });
}

async function submitAttempt(req, res) {
  const quizId = toId(req.params.id);
  if (!quizId) return res.status(400).json({ message: "Invalid quiz id" });

  const { quiz, isAdmin, isEnrolled } = await ensureQuizAccess(quizId, req.user);
  if (!isAdmin && !isEnrolled) return res.status(403).json({ message: "Only enrolled students can attempt quizzes" });

  const answers = req.body && typeof req.body.answers === "object" && req.body.answers ? req.body.answers : null;
  if (!answers) return res.status(400).json({ message: "answers object is required" });

  const questions = await db.query(
    `
    SELECT id, correct_option AS correct
    FROM quiz_questions
    WHERE quiz_id = ?
    ORDER BY created_at ASC
  `,
    [quizId]
  );
  if (!questions || questions.length === 0) return res.status(400).json({ message: "Quiz has no questions yet" });

  let score = 0;
  for (const question of questions) {
    const answer = String(answers[String(question.id)] || answers[question.id] || "").trim().toUpperCase();
    if (answer && answer === question.correct) score += 1;
  }

  const totalQuestions = questions.length;
  const percent = Math.round((score / totalQuestions) * 100);
  const result = await db.exec(
    `
    INSERT INTO quiz_attempts (quiz_id, student_id, answers, score, total_questions, submitted_at)
    VALUES (?, ?, ?, ?, ?, NOW(3))
  `,
    [quizId, req.user.id, JSON.stringify(answers), percent, totalQuestions]
  );

  await writeAuditLog({
    actorUserId: req.user.id,
    action: "quiz.attempted",
    entityType: "quiz_attempt",
    entityId: result.insertId,
    message: `Quiz attempted: ${quiz.title}`,
    meta: { quizId: String(quizId), score: percent, totalQuestions },
  });

  return res.status(201).json({
    message: "Quiz submitted",
    attempt: {
      id: String(result.insertId),
      quizId: String(quizId),
      score: percent,
      totalQuestions,
    },
  });
}

async function listMyAttempts(req, res) {
  const quizId = toId(req.query.quizId);
  const rows = await db.query(
    `
    SELECT
      qa.id,
      qa.quiz_id AS quizId,
      qa.score,
      qa.total_questions AS totalQuestions,
      qa.submitted_at AS submittedAt,
      q.title AS quizTitle,
      q.course_id AS courseId,
      c.title AS courseTitle
    FROM quiz_attempts qa
    JOIN quizzes q ON q.id = qa.quiz_id
    JOIN courses c ON c.id = q.course_id
    WHERE qa.student_id = ?
      ${quizId ? "AND qa.quiz_id = ?" : ""}
    ORDER BY qa.submitted_at DESC
  `,
    quizId ? [req.user.id, quizId] : [req.user.id]
  );

  return res.json(
    (rows || []).map((row) => ({
      id: String(row.id),
      quizId: String(row.quizId),
      quizTitle: row.quizTitle,
      courseId: String(row.courseId),
      courseTitle: row.courseTitle,
      score: Number(row.score) || 0,
      totalQuestions: Number(row.totalQuestions) || 0,
      submittedAt: row.submittedAt,
    }))
  );
}

async function listAttemptsByQuiz(req, res) {
  const quizId = toId(req.params.id);
  if (!quizId) return res.status(400).json({ message: "Invalid quiz id" });

  const { isAdmin, isOwner } = await ensureQuizAccess(quizId, req.user);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  const rows = await db.query(
    `
    SELECT
      qa.id,
      qa.student_id AS studentId,
      qa.score,
      qa.total_questions AS totalQuestions,
      qa.submitted_at AS submittedAt,
      u.name AS studentName,
      u.email AS studentEmail
    FROM quiz_attempts qa
    JOIN users u ON u.id = qa.student_id
    WHERE qa.quiz_id = ?
    ORDER BY qa.submitted_at DESC
  `,
    [quizId]
  );

  return res.json(
    (rows || []).map((row) => ({
      id: String(row.id),
      student: { id: String(row.studentId), name: row.studentName, email: row.studentEmail },
      score: Number(row.score) || 0,
      totalQuestions: Number(row.totalQuestions) || 0,
      submittedAt: row.submittedAt,
    }))
  );
}

module.exports = { createQuiz, addQuestion, listByCourse, getQuiz, submitAttempt, listMyAttempts, listAttemptsByQuiz };
