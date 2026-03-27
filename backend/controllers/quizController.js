const mongoose = require("mongoose");
const { Quiz } = require("../models/Quiz");

async function createQuiz(req, res) {
  const courseId = String(req.body && req.body.course_id ? req.body.course_id : "");
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid course_id" });
  if (!title) return res.status(400).json({ message: "Title is required" });

  const quiz = await Quiz.create({ course: courseId, title, questions: [] });
  return res.status(201).json({ message: "Quiz created", quiz: { id: String(quiz._id) } });
}

async function addQuestion(req, res) {
  const quizId = String(req.body && req.body.quiz_id ? req.body.quiz_id : "");
  if (!mongoose.isValidObjectId(quizId)) return res.status(400).json({ message: "Invalid quiz_id" });

  const question = String(req.body && req.body.question ? req.body.question : "").trim();
  const a = String(req.body && req.body.a ? req.body.a : "").trim();
  const b = String(req.body && req.body.b ? req.body.b : "").trim();
  const c = String(req.body && req.body.c ? req.body.c : "").trim();
  const d = String(req.body && req.body.d ? req.body.d : "").trim();
  const correct = String(req.body && req.body.correct ? req.body.correct : "").trim().toUpperCase();

  if (!question || !a || !b || !c || !d) return res.status(400).json({ message: "Question and all options are required" });
  if (!["A", "B", "C", "D"].includes(correct)) return res.status(400).json({ message: "correct must be A/B/C/D" });

  const quiz = await Quiz.findById(quizId);
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });

  quiz.questions.push({ question, optionA: a, optionB: b, optionC: c, optionD: d, correctOption: correct });
  await quiz.save();
  return res.json({ message: "Question added" });
}

async function getQuiz(req, res) {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid quiz id" });

  const quiz = await Quiz.findById(id).lean();
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });

  const rows = Array.isArray(quiz.questions) ? quiz.questions : [];
  return res.json(
    rows.map((q) => ({
      id: String(q._id),
      question: q.question,
      option_a: q.optionA,
      option_b: q.optionB,
      option_c: q.optionC,
      option_d: q.optionD,
      correct_option: q.correctOption,
    }))
  );
}

module.exports = { createQuiz, addQuestion, getQuiz };

