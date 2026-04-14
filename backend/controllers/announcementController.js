const db = require("../config/db");
const { toId } = require("./courseController");
const { writeAuditLog } = require("../services/auditLog");

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

async function createAnnouncement(req, res) {
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const body = String(req.body && req.body.body ? req.body.body : "").trim();
  const courseId = toId(req.body && req.body.courseId);
  let audience = String(req.body && req.body.audience ? req.body.audience : courseId ? "course" : "all")
    .trim()
    .toLowerCase();

  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!body) return res.status(400).json({ message: "Body is required" });
  if (!["all", "students", "instructors", "admins", "course"].includes(audience)) {
    return res.status(400).json({ message: "Invalid audience" });
  }

  const authorId = toId(req.user.id);
  let course = null;
  if (courseId) {
    const courseRows = await db.query("SELECT id, title, instructor_id AS instructorId FROM courses WHERE id = ? LIMIT 1", [courseId]);
    if (!courseRows || courseRows.length === 0) return res.status(404).json({ message: "Course not found" });
    course = courseRows[0];
    const isAdmin = req.user.role === "admin";
    const isOwner = req.user.role === "instructor" && Number(course.instructorId) === authorId;
    if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });
    audience = "course";
  } else if (req.user.role !== "admin") {
    return res.status(400).json({ message: "Instructors must post announcements to a course" });
  }

  const result = await db.exec(
    `
    INSERT INTO announcements (course_id, author_id, audience, title, body)
    VALUES (?, ?, ?, ?, ?)
  `,
    [courseId, authorId, audience, title, body]
  );

  let recipients = [];
  if (courseId) {
    recipients = await db.query("SELECT student_id AS userId FROM enrollments WHERE course_id = ?", [courseId]);
  } else if (audience === "all") {
    recipients = await db.query("SELECT id AS userId FROM users");
  } else if (audience === "students" || audience === "instructors" || audience === "admins") {
    const role = audience === "admins" ? "admin" : audience.slice(0, -1);
    recipients = await db.query("SELECT id AS userId FROM users WHERE role = ?", [role]);
  }

  for (const recipient of recipients || []) {
    // eslint-disable-next-line no-await-in-loop
    await db.exec("INSERT INTO notifications (user_id, type, message, meta) VALUES (?, ?, ?, ?)", [
      recipient.userId,
      "announcement_posted",
      title,
      JSON.stringify({ announcementId: String(result.insertId), courseId: courseId ? String(courseId) : null }),
    ]);
  }

  await writeAuditLog({
    actorUserId: authorId,
    action: "announcement.created",
    entityType: "announcement",
    entityId: result.insertId,
    message: `Announcement posted: ${title}`,
    meta: { courseId: courseId ? String(courseId) : null, audience },
  });

  return res.status(201).json({ message: "Announcement posted", announcement: { id: String(result.insertId) } });
}

async function listAnnouncements(req, res) {
  const courseId = toId(req.query.courseId);
  const page = clamp(req.query.page, 1, 100000, 1);
  const limit = clamp(req.query.limit, 1, 100, 20);
  const role = req.user.role;

  let rows;
  let total = 0;
  if (role === "admin") {
    const where = courseId ? "WHERE a.course_id = ?" : "";
    const countRows = await db.query(`SELECT COUNT(*) AS c FROM announcements a ${where}`, courseId ? [courseId] : []);
    total = Number(countRows[0] && countRows[0].c) || 0;
    rows = await db.query(
      `
      SELECT
        a.id,
        a.course_id AS courseId,
        a.audience,
        a.title,
        a.body,
        a.created_at AS createdAt,
        c.title AS courseTitle,
        u.name AS authorName
      FROM announcements a
      LEFT JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.author_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `,
      courseId ? [courseId, limit, (page - 1) * limit] : [limit, (page - 1) * limit]
    );
  } else if (role === "instructor") {
    const countRows = await db.query(
      `
      SELECT COUNT(*) AS c
      FROM announcements a
      LEFT JOIN courses c ON c.id = a.course_id
      WHERE (a.course_id IS NULL AND a.audience IN ('all', 'instructors'))
         OR (c.instructor_id = ?)
  `,
      [req.user.id]
    );
    total = Number(countRows[0] && countRows[0].c) || 0;
    rows = await db.query(
      `
      SELECT
        a.id,
        a.course_id AS courseId,
        a.audience,
        a.title,
        a.body,
        a.created_at AS createdAt,
        c.title AS courseTitle,
        u.name AS authorName
      FROM announcements a
      LEFT JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.author_id
      WHERE (a.course_id IS NULL AND a.audience IN ('all', 'instructors'))
         OR (c.instructor_id = ?)
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [req.user.id, limit, (page - 1) * limit]
    );
  } else {
    const countRows = await db.query(
      `
      SELECT COUNT(*) AS c
      FROM announcements a
      LEFT JOIN courses c ON c.id = a.course_id
      WHERE (a.course_id IS NULL AND a.audience IN ('all', 'students'))
         OR EXISTS (
           SELECT 1
           FROM enrollments e
           WHERE e.course_id = a.course_id AND e.student_id = ?
         )
  `,
      [req.user.id]
    );
    total = Number(countRows[0] && countRows[0].c) || 0;
    rows = await db.query(
      `
      SELECT
        a.id,
        a.course_id AS courseId,
        a.audience,
        a.title,
        a.body,
        a.created_at AS createdAt,
        c.title AS courseTitle,
        u.name AS authorName
      FROM announcements a
      LEFT JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.author_id
      WHERE (a.course_id IS NULL AND a.audience IN ('all', 'students'))
         OR EXISTS (
           SELECT 1
           FROM enrollments e
           WHERE e.course_id = a.course_id AND e.student_id = ?
         )
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [req.user.id, limit, (page - 1) * limit]
    );
  }

  return res.json({
    items: (rows || []).map((row) => ({
      id: String(row.id),
      courseId: row.courseId ? String(row.courseId) : null,
      courseTitle: row.courseTitle || "",
      audience: row.audience,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      authorName: row.authorName,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

module.exports = { createAnnouncement, listAnnouncements };
