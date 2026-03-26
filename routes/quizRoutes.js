const express = require("express");
const { createQuiz, addQuestion, getQuiz } = require("../controllers/quizController");

const router = express.Router();

router.post("/create", createQuiz);
router.post("/question", addQuestion);
router.get("/:id", getQuiz);

module.exports = router;