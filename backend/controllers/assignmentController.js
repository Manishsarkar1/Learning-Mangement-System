const db = require("../config/db");
const { toId } = require("./courseController");
const { writeAuditLog } = require("../services/auditLog");

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

async function ensureCourseAccess({ courseId, user }) {
  const rows = await db.query("SELECT id, title, instructor_id AS instructorId FROM courses WHERE id = ? LIMIT 1", [courseId]);
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

  const { course, isAdmin, isOwner } = await ensureCourseAccess({ courseId, user: req.user });
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  const creatorId = toId(req.user.id);
  const result = await db.exec(
    "INSERT INTO assignments (course_id, title, description, due_date, created_by) VALUES (?, ?, ?, ?, ?)",
    [courseId, title, description, dueDate, creatorId]
  );

  const students = await db.query("SELECT student_id AS studentId FROM enrollments WHERE course_id = ?", [courseId]);
  for (const student of students || []) {
    // eslint-disable-next-line no-await-in-loop
    await db.exec("INSERT INTO notifications (user_id, type, message, meta) VALUES (?, ?, ?, ?)", [
      student.studentId,
      "assignment_created",
      `New assignment in ${course.title}: ${title}`,
      JSON.stringify({ courseId: String(courseId), assignmentId: String(result.insertId) }),
    ]);
  }

  await writeAuditLog({
    actorUserId: creatorId,
    action: "assignment.created",
    entityType: "assignment",
    entityId: result.insertId,
    message: `Assignment created in ${course.title}: ${title}`,
    meta: { courseId, dueDate },
  });

  return res.status(201).json({ message: "Assignment created", assignment: { id: String(result.insertId) } });
}

async function listAssignments(req, res) {
  const page = clamp(req.query.page, 1, 100000, 1);
  const limit = clamp(req.query.limit, 1, 100, 20);
  const courseId = toId(req.query.courseId);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";

  const where = [];
  const params = [];

  if (req.user.role === "student") {
    where.push("EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = a.course_id AND e.student_id = ?)");
    params.push(req.user.id);
  } else if (req.user.role === "instructor") {
    where.push("c.instructor_id = ?");
    params.push(req.user.id);
  }

  if (courseId) {
    where.push("a.course_id = ?");
    params.push(courseId);
  }
  if (q) {
    where.push("(a.title LIKE ? OR a.description LIKE ? OR c.title LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === "pending" && req.user.role === "student") {
    where.push("NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?)");
    params.push(req.user.id);
  }
  if (status === "submitted" && req.user.role === "student") {
    where.push("EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?)");
    params.push(req.user.id);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [countRow] = await db.query(
    `
    SELECT COUNT(*) AS c
    FROM assignments a
    JOIN courses c ON c.id = a.course_id
    ${whereSql}
  `,
    params
  );
  const total = Number(countRow && countRow.c) || 0;

  const rows = await db.query(
    `
    SELECT
      a.id,
      a.course_id AS courseId,
      a.title,
      a.description,
      a.due_date AS dueDate,
      a.created_at AS createdAt,
      c.title AS courseTitle,
      (
        SELECT COUNT(*)
        FROM submissions s
        WHERE s.assignment_id = a.id
      ) AS submissionCount,
      (
        SELECT s.id
        FROM submissions s
        WHERE s.assignment_id = a.id AND s.student_id = ?
        LIMIT 1
      ) AS mySubmissionId,
      (
        SELECT s.grade_score
        FROM submissions s
        WHERE s.assignment_id = a.id AND s.student_id = ?
        LIMIT 1
      ) AS myGradeScore
    FROM assignments a
    JOIN courses c ON c.id = a.course_id
    ${whereSql}
    ORDER BY a.due_date ASC
    LIMIT ? OFFSET ?
  `,
    [req.user.id, req.user.id, ...params, limit, (page - 1) * limit]
  );

  return res.json({
    items: (rows || []).map((row) => ({
      id: String(row.id),
      courseId: String(row.courseId),
      courseTitle: row.courseTitle,
      title: row.title,
      description: row.description,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      submissionCount: Number(row.submissionCount) || 0,
      mySubmissionId: row.mySubmissionId ? String(row.mySubmissionId) : null,
      myGradeScore: row.myGradeScore !== null ? Number(row.myGradeScore) : null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

async function listAssignmentsByCourse(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const { isAdmin, isOwner, isEnrolled } = await ensureCourseAccess({ courseId, user: req.user });
  if (!isAdmin && !isOwner && !isEnrolled) return res.status(403).json({ message: "Forbidden" });

  const rows = await db.query(
    `
    SELECT
      id,
      course_id AS courseId,
      title,
      description,
      due_date AS dueDate,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM assignments
    WHERE course_id = ?
    ORDER BY due_date ASC
  `,
    [courseId]
  );
  return res.json((rows || []).map((row) => ({ ...row, id: String(row.id), courseId: String(row.courseId) })));
}

async function getAssignment(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid assignmentId" });

  const rows = await db.query(
    `
    SELECT
      a.id,
      a.course_id AS courseId,
      a.title,
      a.description,
      a.due_date AS dueDate,
      a.created_at AS createdAt,
      a.updated_at AS updatedAt,
      c.title AS courseTitle
    FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ?
    LIMIT 1
  `,
    [id]
  );
  if (!rows || rows.length === 0) return res.status(404).json({ message: "Assignment not found" });

  const assignment = rows[0];
  const { isAdmin, isOwner, isEnrolled } = await ensureCourseAccess({ courseId: Number(assignment.courseId), user: req.user });
  if (!isAdmin && !isOwner && !isEnrolled) return res.status(403).json({ message: "Forbidden" });

  return res.json({
    ...assignment,
    id: String(assignment.id),
    courseId: String(assignment.courseId),
  });
}

module.exports = { createAssignment, listAssignments, listAssignmentsByCourse, getAssignment };
