const db = require("../config/db");

function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function listCourses(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = 100;

  let rows;
  if (q) {
    rows = await db.query(
      `
      SELECT
        c.id,
        c.title,
        c.description,
        c.instructor_id AS instructorId,
        u.name AS instructorName,
        (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt
      FROM courses c
      JOIN users u ON u.id = c.instructor_id
      WHERE c.title LIKE CONCAT('%', ?, '%') OR c.description LIKE CONCAT('%', ?, '%')
      ORDER BY c.created_at DESC
      LIMIT ?
    `,
      [q, q, limit]
    );
  } else {
    rows = await db.query(
      `
      SELECT
        c.id,
        c.title,
        c.description,
        c.instructor_id AS instructorId,
        u.name AS instructorName,
        (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt
      FROM courses c
      JOIN users u ON u.id = c.instructor_id
      ORDER BY c.created_at DESC
      LIMIT ?
    `,
      [limit]
    );
  }

  return res.json(rows || []);
}

async function createCourse(req, res) {
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const description = String(req.body && req.body.description ? req.body.description : "").trim();
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!description) return res.status(400).json({ message: "Description is required" });

  const instructorId = toId(req.user.id);
  if (!instructorId) return res.status(400).json({ message: "Invalid user id" });

  const result = await db.exec("INSERT INTO courses (title, description, instructor_id) VALUES (?, ?, ?)", [
    title,
    description,
    instructorId,
  ]);
  return res.status(201).json({ message: "Course created", course: { id: String(result.insertId) } });
}

async function enroll(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const studentId = toId(req.user.id);
  if (!studentId) return res.status(400).json({ message: "Invalid user id" });

  try {
    await db.exec("INSERT INTO enrollments (course_id, student_id) VALUES (?, ?)", [courseId, studentId]);
  } catch (e) {
    if (!(e && e.code === "ER_DUP_ENTRY")) throw e;
  }

  return res.json({ message: "Enrolled", course: { id: String(courseId) } });
}

async function enrollLegacy(req, res) {
  const courseId = toId(req.body && req.body.course_id);
  req.params.courseId = courseId;
  return enroll(req, res);
}

async function myCourses(req, res) {
  const userId = toId(req.user.id);
  if (!userId) return res.status(400).json({ message: "Invalid user id" });

  if (req.user.role === "student") {
    const rows = await db.query(
      `
      SELECT
        c.id,
        c.title,
        c.description,
        c.instructor_id AS instructorId,
        u.name AS instructorName,
        (SELECT COUNT(*) FROM enrollments e2 WHERE e2.course_id = c.id) AS studentCount,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN users u ON u.id = c.instructor_id
      WHERE e.student_id = ?
      ORDER BY c.created_at DESC
    `,
      [userId]
    );
    return res.json(rows || []);
  }

  if (req.user.role === "instructor") {
    const rows = await db.query(
      `
      SELECT
        c.id,
        c.title,
        c.description,
        c.instructor_id AS instructorId,
        u.name AS instructorName,
        (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt
      FROM courses c
      JOIN users u ON u.id = c.instructor_id
      WHERE c.instructor_id = ?
      ORDER BY c.created_at DESC
    `,
      [userId]
    );
    return res.json(rows || []);
  }

  // admin
  const rows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.instructor_id AS instructorId,
      u.name AS instructorName,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ORDER BY c.created_at DESC
  `
  );
  return res.json(rows || []);
}

async function getCourse(req, res) {
  const courseId = toId(req.params.id);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const rows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.instructor_id AS instructorId,
      u.name AS instructorName,
      u.email AS instructorEmail,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    WHERE c.id = ?
    LIMIT 1
  `,
    [courseId]
  );

  if (!rows || rows.length === 0) return res.status(404).json({ message: "Course not found" });
  const course = rows[0];

  const userId = toId(req.user.id);
  const isAdmin = req.user.role === "admin";
  const isOwner = req.user.role === "instructor" && Number(course.instructorId) === userId;
  const enrolledRows = await db.query("SELECT 1 AS ok FROM enrollments WHERE course_id = ? AND student_id = ? LIMIT 1", [
    courseId,
    userId,
  ]);
  const isEnrolled = req.user.role === "student" && enrolledRows && enrolledRows.length > 0;

  const base = {
    id: String(course.id),
    title: course.title,
    description: course.description,
    instructor: { id: String(course.instructorId), name: course.instructorName, email: course.instructorEmail },
    studentCount: Number(course.studentCount) || 0,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };

  if (!isAdmin && !isOwner && !isEnrolled) {
    return res.json({ ...base, materials: [] });
  }

  const materials = await db.query(
    "SELECT type, title, url, uploaded_by AS uploadedBy, created_at AS createdAt FROM course_materials WHERE course_id = ? ORDER BY created_at DESC",
    [courseId]
  );

  let students = undefined;
  if (isAdmin || isOwner) {
    students = await db.query("SELECT student_id AS id FROM enrollments WHERE course_id = ? ORDER BY created_at DESC", [courseId]);
  }

  return res.json({ ...base, materials: materials || [], students });
}

async function addMaterial(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const type = String(req.body && req.body.type ? req.body.type : "").trim().toLowerCase();
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const url = String(req.body && req.body.url ? req.body.url : "").trim();

  if (!["pdf", "video", "link"].includes(type)) return res.status(400).json({ message: "Invalid material type" });
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!url) return res.status(400).json({ message: "URL is required" });

  const userId = toId(req.user.id);
  const courseRows = await db.query("SELECT instructor_id AS instructorId FROM courses WHERE id = ? LIMIT 1", [courseId]);
  if (!courseRows || courseRows.length === 0) return res.status(404).json({ message: "Course not found" });

  const isAdmin = req.user.role === "admin";
  const isOwner = req.user.role === "instructor" && Number(courseRows[0].instructorId) === userId;
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  await db.exec("INSERT INTO course_materials (course_id, type, title, url, uploaded_by) VALUES (?, ?, ?, ?, ?)", [
    courseId,
    type,
    title,
    url,
    userId,
  ]);
  return res.status(201).json({ message: "Material added" });
}

module.exports = {
  listCourses,
  createCourse,
  enroll,
  enrollLegacy,
  myCourses,
  getCourse,
  addMaterial,
  toId,
};

