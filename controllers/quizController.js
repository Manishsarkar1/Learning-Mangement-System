const db = require("../config/db");

exports.createQuiz = (req, res) => {
  const { course_id, title } = req.body;

  db.query(
    "INSERT INTO quizzes (course_id, title) VALUES (?, ?)",
    [course_id, title],
    (err) => {
      if (err) return res.status(500).json({ message: "Failed to create quiz", error: err.message });
      return res.json({ message: "Quiz created" });
    }
  );
};

exports.addQuestion = (req, res) => {
  const { quiz_id, question, a, b, c, d, correct } = req.body;

  db.query(
    `INSERT INTO quiz_questions 
    (quiz_id, question, option_a, option_b, option_c, option_d, correct_option)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [quiz_id, question, a, b, c, d, correct],
    (err) => {
      if (err) return res.status(500).json({ message: "Failed to add question", error: err.message });
      return res.json({ message: "Question added" });
    }
  );
};

exports.getQuiz = (req, res) => {
  const { id } = req.params;

  db.query("SELECT * FROM quiz_questions WHERE quiz_id=?", [id], (err, result) => {
    if (err) return res.status(500).json({ message: "Failed to fetch quiz", error: err.message });
    return res.json(result);
  });
};
