const mongoose = require("mongoose");

const quizQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 500 },
    optionA: { type: String, required: true, trim: true, maxlength: 200 },
    optionB: { type: String, required: true, trim: true, maxlength: 200 },
    optionC: { type: String, required: true, trim: true, maxlength: 200 },
    optionD: { type: String, required: true, trim: true, maxlength: 200 },
    correctOption: { type: String, enum: ["A", "B", "C", "D"], required: true },
  },
  { timestamps: true }
);

const quizSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    questions: [quizQuestionSchema],
  },
  { timestamps: true }
);

module.exports = { Quiz: mongoose.model("Quiz", quizSchema) };

