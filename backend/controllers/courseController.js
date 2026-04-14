const db = require("../config/db");
const { writeAuditLog } = require("../services/auditLog");

function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function buildLikeTerm(value) {
  return `%${String(value || "").trim()}%`;
}

async function listCourses(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const instructorId = toId(req.query.instructorId);
  const page = clamp(req.query.page, 1, 100000, 1);
  const limit = clamp(req.query.limit, 1, 100, 20);
  const usePagination = req.query.format === "page" || req.query.page !== undefined || req.query.limit !== undefined;

  const where = [];
  const params = [];
  if (q) {
    where.push("(c.title LIKE ? OR c.description LIKE ? OR u.name LIKE ?)");
    params.push(buildLikeTerm(q), buildLikeTerm(q), buildLikeTerm(q));
  }
  if (instructorId) {
    where.push("c.instructor_id = ?");
    params.push(instructorId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRow] = await db.query(
    `
    SELECT COUNT(*) AS c
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ${whereSql}
  `,
    params
  );
  const total = Number(countRow && countRow.c) || 0;

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
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
      (SELECT COUNT(*) FROM announcements an WHERE an.course_id = c.id) AS announcementCount,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ${whereSql}
    ORDER BY c.created_at DESC
    ${usePagination ? "LIMIT ? OFFSET ?" : "LIMIT 100"}
  `,
    usePagination ? [...params, limit, (page - 1) * limit] : params
  );

  const items = (rows || []).map((row) => ({
    id: String(row.id),
    title: row.title,
    description: row.description,
    instructorId: String(row.instructorId),
    instructorName: row.instructorName,
    instructorEmail: row.instructorEmail,
    studentCount: Number(row.studentCount) || 0,
    assignmentCount: Number(row.assignmentCount) || 0,
    announcementCount: Number(row.announcementCount) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  if (!usePagination) return res.json(items);
  return res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

async function createCourse(req, res) {
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const description = String(req.body && req.body.description ? req.body.description : "").trim();
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!description) return res.status(400).json({ message: "Description is required" });

  const instructorId = toId(req.user.id);
  if (!instructorId) return res.status(400).json({ message: "Invalid user id" });

  const result = await db.exec("INSERT INTO courses (title, description, instructor_id) VALUES (?, ?, ?)", [title, description, instructorId]);

  await writeAuditLog({
    actorUserId: instructorId,
    action: "course.created",
    entityType: "course",
    entityId: result.insertId,
    message: `Course created: ${title}`,
  });

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

  await writeAuditLog({
    actorUserId: studentId,
    action: "course.enrolled",
    entityType: "course",
    entityId: courseId,
    message: `User enrolled in course #${courseId}`,
  });

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
        (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
        (SELECT COUNT(*) FROM submissions s WHERE s.course_id = c.id AND s.student_id = ?) AS submissionCount,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN users u ON u.id = c.instructor_id
      WHERE e.student_id = ?
      ORDER BY c.created_at DESC
    `,
      [userId, userId]
    );
    return res.json(
      (rows || []).map((row) => ({
        ...row,
        id: String(row.id),
        progress:
          Number(row.assignmentCount) > 0
            ? Math.round(((Number(row.submissionCount) || 0) / Number(row.assignmentCount)) * 100)
            : 0,
      }))
    );
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
        (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
        (SELECT COUNT(*) FROM announcements an WHERE an.course_id = c.id) AS announcementCount,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt
      FROM courses c
      JOIN users u ON u.id = c.instructor_id
      WHERE c.instructor_id = ?
      ORDER BY c.created_at DESC
    `,
      [userId]
    );
    return res.json((rows || []).map((row) => ({ ...row, id: String(row.id) })));
  }

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
  return res.json((rows || []).map((row) => ({ ...row, id: String(row.id) })));
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
  const enrolledRows = await db.query("SELECT 1 AS ok FROM enrollments WHERE course_id = ? AND student_id = ? LIMIT 1", [courseId, userId]);
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
    return res.json({ ...base, materials: [], assignments: [], announcements: [], quizzes: [] });
  }

  const materials = await db.query(
    `
    SELECT id, type, title, url, uploaded_by AS uploadedBy, created_at AS createdAt
    FROM course_materials
    WHERE course_id = ?
    ORDER BY created_at DESC
  `,
    [courseId]
  );

  const assignments = await db.query(
    `
    SELECT
      a.id,
      a.title,
      a.description,
      a.due_date AS dueDate,
      a.created_at AS createdAt,
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
    WHERE a.course_id = ?
    ORDER BY a.due_date ASC
  `,
    [userId, userId, courseId]
  );

  const announcements = await db.query(
    `
    SELECT
      a.id,
      a.title,
      a.body,
      a.audience,
      a.created_at AS createdAt,
      u.name AS authorName
    FROM announcements a
    JOIN users u ON u.id = a.author_id
    WHERE a.course_id = ? OR (a.course_id IS NULL AND a.audience IN ('all', ?, 'admins'))
    ORDER BY a.created_at DESC
    LIMIT 10
  `,
    [courseId, req.user.role]
  );

  const quizzes = await db.query(
    `
    SELECT
      q.id,
      q.title,
      q.created_at AS createdAt,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questionCount,
      (
        SELECT qa.score
        FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.student_id = ?
        ORDER BY qa.submitted_at DESC
        LIMIT 1
      ) AS myLatestScore
    FROM quizzes q
    WHERE q.course_id = ?
    ORDER BY q.created_at DESC
  `,
    [userId, courseId]
  );

  let students = undefined;
  if (isAdmin || isOwner) {
    students = await db.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        e.created_at AS enrolledAt
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      WHERE e.course_id = ?
      ORDER BY e.created_at DESC
    `,
      [courseId]
    );
  }

  return res.json({
    ...base,
    materials: (materials || []).map((item) => ({ ...item, id: String(item.id) })),
    assignments: (assignments || []).map((item) => ({
      id: String(item.id),
      title: item.title,
      description: item.description,
      dueDate: item.dueDate,
      createdAt: item.createdAt,
      submissionCount: Number(item.submissionCount) || 0,
      mySubmissionId: item.mySubmissionId ? String(item.mySubmissionId) : null,
      myGradeScore: item.myGradeScore !== null ? Number(item.myGradeScore) : null,
    })),
    announcements: (announcements || []).map((item) => ({ ...item, id: String(item.id) })),
    quizzes: (quizzes || []).map((item) => ({
      id: String(item.id),
      title: item.title,
      createdAt: item.createdAt,
      questionCount: Number(item.questionCount) || 0,
      myLatestScore: item.myLatestScore !== null ? Number(item.myLatestScore) : null,
    })),
    students: students
      ? students.map((student) => ({
          id: String(student.id),
          name: student.name,
          email: student.email,
          enrolledAt: student.enrolledAt,
        }))
      : undefined,
  });
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
  const courseRows = await db.query("SELECT instructor_id AS instructorId, title FROM courses WHERE id = ? LIMIT 1", [courseId]);
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

  await writeAuditLog({
    actorUserId: userId,
    action: "course.material_added",
    entityType: "course",
    entityId: courseId,
    message: `Material added to ${courseRows[0].title}: ${title}`,
    meta: { type, url },
  });

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
