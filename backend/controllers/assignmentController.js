const db = require("../config/db");
const { toId } = require("./courseController");

async function ensureCourseAccess({ courseId, user }) {
  const rows = await db.query("SELECT id, instructor_id AS instructorId FROM courses WHERE id = ? LIMIT 1", [courseId]);
  if (!rows || rows.length === 0) {
    const err = new Error("Course not found");
    err.status = 404;
    throw err;
  }
  const course = rows[0];

  const userId = toId(user.id);
  const isAdmin = user.role === "admin";
  const isOwner = user.role === "instructor" && Number(course.instructorId) === userId;
  let isEnrolled = false;
  if (user.role === "student") {
    const enr = await db.query("SELECT 1 AS ok FROM enrollments WHERE course_id = ? AND student_id = ? LIMIT 1", [courseId, userId]);
    isEnrolled = enr && enr.length > 0;
  }

  return { course, isAdmin, isOwner, isEnrolled };
}

async function createAssignment(req, res) {
  const courseId = toId(req.body && req.body.courseId);
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const description = String(req.body && req.body.description ? req.body.description : "").trim();
  const dueDateRaw = req.body ? req.body.dueDate : null;

  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!description) return res.status(400).json({ message: "Description is required" });

  const dueDate = new Date(dueDateRaw);
  if (!dueDateRaw || Number.isNaN(dueDate.getTime())) return res.status(400).json({ message: "Valid dueDate is required" });

  const { isAdmin, isOwner } = await ensureCourseAccess({ courseId, user: req.user });
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  const creatorId = toId(req.user.id);
  const result = await db.exec(
    "INSERT INTO assignments (course_id, title, description, due_date, created_by) VALUES (?, ?, ?, ?, ?)",
    [courseId, title, description, dueDate, creatorId]
  );

  // Notify enrolled students
  const students = await db.query("SELECT student_id AS studentId FROM enrollments WHERE course_id = ?", [courseId]);
  if (students && students.length > 0) {
    const values = students.map((s) => [
      s.studentId,
      "assignment_created",
      `New assignment: ${title}`,
      JSON.stringify({ courseId: String(courseId), assignmentId: String(result.insertId) }),
    ]);
    // eslint-disable-next-line no-unused-vars
    await db.getPool().query("INSERT INTO notifications (user_id, type, message, meta) VALUES ?", [values]);
  }

  return res.status(201).json({ message: "Assignment created", assignment: { id: String(result.insertId) } });
}

async function listAssignmentsByCourse(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const { isAdmin, isOwner, isEnrolled } = await ensureCourseAccess({ courseId, user: req.user });
  if (!isAdmin && !isOwner && !isEnrolled) return res.status(403).json({ message: "Forbidden" });

  const rows = await db.query(
    "SELECT id, course_id AS courseId, title, description, due_date AS dueDate, created_at AS createdAt, updated_at AS updatedAt FROM assignments WHERE course_id = ? ORDER BY due_date ASC",
    [courseId]
  );
  return res.json(rows || []);
}

async function getAssignment(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid assignmentId" });

  const rows = await db.query(
    "SELECT id, course_id AS courseId, title, description, due_date AS dueDate, created_at AS createdAt, updated_at AS updatedAt FROM assignments WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows || rows.length === 0) return res.status(404).json({ message: "Assignment not found" });

  const assignment = rows[0];
  const { isAdmin, isOwner, isEnrolled } = await ensureCourseAccess({ courseId: Number(assignment.courseId), user: req.user });
  if (!isAdmin && !isOwner && !isEnrolled) return res.status(403).json({ message: "Forbidden" });

  return res.json(assignment);
}

module.exports = { createAssignment, listAssignmentsByCourse, getAssignment };

