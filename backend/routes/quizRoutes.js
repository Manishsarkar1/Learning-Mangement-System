const express = require("express");

const { createQuiz, addQuestion, getQuiz } = require("../controllers/quizController");

const router = express.Router();

// Kept public for compatibility with the existing static demo UI.
router.post("/create", (req, res, next) => Promise.resolve(createQuiz(req, res)).catch(next));
router.post("/question", (req, res, next) => Promise.resolve(addQuestion(req, res)).catch(next));
router.get("/:id", (req, res, next) => Promise.resolve(getQuiz(req, res)).catch(next));

module.exports = router;

