const db = require("../config/db");

exports.createCourse = (req, res) => {
  const { title, description } = req.body;
  const instructor_id = req.user.id;

  db.query(
    "INSERT INTO courses (title, description, instructor_id) VALUES (?, ?, ?)",
    [title, description, instructor_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Failed to create course", error: err.message });
      return res.json({ message: "Course created" });
    }
  );
};

exports.getCourses = (req, res) => {
  db.query("SELECT * FROM courses", (err, result) => {
    if (err) return res.status(500).json({ message: "Failed to fetch courses", error: err.message });
    return res.json(result);
  });
};

exports.enroll = (req, res) => {
  const student_id = req.user.id;
  const { course_id } = req.body;

  db.query(
    "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
    [student_id, course_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Failed to enroll", error: err.message });
      return res.json({ message: "Enrolled" });
    }
  );
};
