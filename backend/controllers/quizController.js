const db = require("../config/db");
const { toId } = require("./courseController");

async function createQuiz(req, res) {
  const courseId = toId(req.body && req.body.course_id);
  const title = String(req.body && req.body.title ? req.body.title : "").trim();

  if (!courseId) return res.status(400).json({ message: "Invalid course_id" });
  if (!title) return res.status(400).json({ message: "Title is required" });

  const result = await db.exec("INSERT INTO quizzes (course_id, title) VALUES (?, ?)", [courseId, title]);
  return res.status(201).json({ message: "Quiz created", quiz: { id: String(result.insertId) } });
}

async function addQuestion(req, res) {
  const quizId = toId(req.body && req.body.quiz_id);
  if (!quizId) return res.status(400).json({ message: "Invalid quiz_id" });

  const question = String(req.body && req.body.question ? req.body.question : "").trim();
  const a = String(req.body && req.body.a ? req.body.a : "").trim();
  const b = String(req.body && req.body.b ? req.body.b : "").trim();
  const c = String(req.body && req.body.c ? req.body.c : "").trim();
  const d = String(req.body && req.body.d ? req.body.d : "").trim();
  const correct = String(req.body && req.body.correct ? req.body.correct : "").trim().toUpperCase();

  if (!question || !a || !b || !c || !d) return res.status(400).json({ message: "Question and all options are required" });
  if (!["A", "B", "C", "D"].includes(correct)) return res.status(400).json({ message: "correct must be A/B/C/D" });

  const quizRows = await db.query("SELECT id FROM quizzes WHERE id = ? LIMIT 1", [quizId]);
  if (!quizRows || quizRows.length === 0) return res.status(404).json({ message: "Quiz not found" });

  await db.exec(
    "INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [quizId, question, a, b, c, d, correct]
  );
  return res.json({ message: "Question added" });
}

async function getQuiz(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid quiz id" });

  const quizRows = await db.query("SELECT id FROM quizzes WHERE id = ? LIMIT 1", [id]);
  if (!quizRows || quizRows.length === 0) return res.status(404).json({ message: "Quiz not found" });

  const rows = await db.query(
    "SELECT id, question, option_a AS a, option_b AS b, option_c AS c, option_d AS d, correct_option AS correct FROM quiz_questions WHERE quiz_id = ? ORDER BY created_at ASC",
    [id]
  );

  return res.json(
    (rows || []).map((r) => ({
      id: String(r.id),
      question: r.question,
      option_a: r.a,
      option_b: r.b,
      option_c: r.c,
      option_d: r.d,
      correct_option: r.correct,
    }))
  );
}

module.exports = { createQuiz, addQuestion, getQuiz };

