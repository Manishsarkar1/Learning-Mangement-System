const bcrypt = require("bcrypt");

const db = require("../config/db");
const { toId } = require("./courseController");
const { listPermissions, updatePermission } = require("../services/permissions");
const { writeAuditLog } = require("../services/auditLog");

const USER_ROLES = ["student", "instructor", "admin"];

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function buildLikeTerm(value) {
  return `%${String(value || "").trim()}%`;
}

async function listUsers(req, res) {
  const page = clamp(req.query.page, 1, 100000, 1);
  const limit = clamp(req.query.limit, 1, 200, 20);
  const role = typeof req.query.role === "string" ? req.query.role.trim().toLowerCase() : "";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const where = [];
  const params = [];
  if (role && USER_ROLES.includes(role)) {
    where.push("u.role = ?");
    params.push(role);
  }
  if (q) {
    where.push("(u.name LIKE ? OR u.email LIKE ?)");
    params.push(buildLikeTerm(q), buildLikeTerm(q));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [countRow] = await db.query(`SELECT COUNT(*) AS c FROM users u ${whereSql}`, params);
  const total = Number(countRow && countRow.c) || 0;
  const offset = (page - 1) * limit;

  const rows = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.created_at AS createdAt,
      p.title,
      p.timezone
    FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, limit, offset]
  );

  return res.json({
    items: (rows || []).map((u) => ({ ...u, id: String(u.id) })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

async function createUser(req, res) {
  const name = String(req.body && req.body.name ? req.body.name : "").trim();
  const email = String(req.body && req.body.email ? req.body.email : "").trim().toLowerCase();
  const password = req.body ? req.body.password : null;
  const role = String(req.body && req.body.role ? req.body.role : "").trim().toLowerCase();

  if (!name) return res.status(400).json({ message: "Name is required" });
  if (!isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });
  if (typeof password !== "string" || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
  if (!USER_ROLES.includes(role)) return res.status(400).json({ message: `Role must be one of: ${USER_ROLES.join(", ")}` });

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await db.exec("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)", [
      name,
      email,
      passwordHash,
      role,
    ]);
    await db.exec("INSERT INTO user_profiles (user_id, timezone) VALUES (?, ?)", [result.insertId, "Asia/Calcutta"]);

    await writeAuditLog({
      actorUserId: req.user.id,
      action: "admin.user_created",
      entityType: "user",
      entityId: result.insertId,
      message: `Admin created ${role} user ${email}`,
      meta: { email, role },
    });

    return res.status(201).json({ message: "User created", user: { id: String(result.insertId) } });
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Email already in use" });
    throw e;
  }
}

async function deleteUser(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid userId" });

  try {
    const result = await db.exec("DELETE FROM users WHERE id = ?", [id]);
    if (!result || result.affectedRows === 0) return res.status(404).json({ message: "User not found" });

    await writeAuditLog({
      actorUserId: req.user.id,
      action: "admin.user_deleted",
      entityType: "user",
      entityId: id,
      message: `Admin deleted user #${id}`,
    });

    return res.json({ message: "User deleted" });
  } catch (e) {
    if (e && e.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({ message: "Cannot delete user: referenced by other records (e.g., instructor owns courses)." });
    }
    throw e;
  }
}

async function analytics(req, res) {
  const usersByRoleRows = await db.query("SELECT role, COUNT(*) AS count FROM users GROUP BY role");
  const usersByRole = { student: 0, instructor: 0, admin: 0 };
  for (const row of usersByRoleRows || []) usersByRole[row.role] = Number(row.count) || 0;

  const [courseCountRow] = await db.query("SELECT COUNT(*) AS c FROM courses");
  const [assignmentCountRow] = await db.query("SELECT COUNT(*) AS c FROM assignments");
  const [submissionCountRow] = await db.query("SELECT COUNT(*) AS c FROM submissions");
  const [announcementCountRow] = await db.query("SELECT COUNT(*) AS c FROM announcements");
  const [attemptCountRow] = await db.query("SELECT COUNT(*) AS c FROM quiz_attempts");

  const [newUsers7dRow] = await db.query("SELECT COUNT(*) AS c FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
  const [newCourses7dRow] = await db.query("SELECT COUNT(*) AS c FROM courses WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
  const [submissions7dRow] = await db.query("SELECT COUNT(*) AS c FROM submissions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");

  const usersTrend = await db.query(
    `
    SELECT DATE(created_at) AS bucket, COUNT(*) AS count
    FROM users
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE(created_at)
    ORDER BY bucket ASC
  `
  );
  const submissionsTrend = await db.query(
    `
    SELECT DATE(created_at) AS bucket, COUNT(*) AS count
    FROM submissions
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE(created_at)
    ORDER BY bucket ASC
  `
  );
  const topCourses = await db.query(
    `
    SELECT
      c.id,
      c.title,
      u.name AS instructorName,
      COUNT(e.id) AS studentCount
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    LEFT JOIN enrollments e ON e.course_id = c.id
    GROUP BY c.id, c.title, u.name
    ORDER BY studentCount DESC, c.created_at DESC
    LIMIT 8
  `
  );

  return res.json({
    usersByRole,
    totals: {
      courses: Number(courseCountRow.c) || 0,
      assignments: Number(assignmentCountRow.c) || 0,
      submissions: Number(submissionCountRow.c) || 0,
      announcements: Number(announcementCountRow.c) || 0,
      quizAttempts: Number(attemptCountRow.c) || 0,
    },
    last7d: {
      newUsers: Number(newUsers7dRow.c) || 0,
      newCourses: Number(newCourses7dRow.c) || 0,
      submissions: Number(submissions7dRow.c) || 0,
    },
    charts: {
      users: usersTrend || [],
      submissions: submissionsTrend || [],
    },
    topCourses: (topCourses || []).map((course) => ({
      id: String(course.id),
      title: course.title,
      instructorName: course.instructorName,
      studentCount: Number(course.studentCount) || 0,
    })),
  });
}

async function listCourses(req, res) {
  const page = clamp(req.query.page, 1, 100000, 1);
  const limit = clamp(req.query.limit, 1, 200, 20);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const where = [];
  const params = [];
  if (q) {
    where.push("(c.title LIKE ? OR c.description LIKE ? OR u.name LIKE ?)");
    params.push(buildLikeTerm(q), buildLikeTerm(q), buildLikeTerm(q));
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
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      u.id AS instructorId,
      u.name AS instructorName,
      u.email AS instructorEmail,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      c.created_at AS createdAt
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ${whereSql}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, limit, offset]
  );

  return res.json({
    items: (rows || []).map((c) => ({
      id: String(c.id),
      title: c.title,
      description: c.description,
      instructor: { id: String(c.instructorId), name: c.instructorName, email: c.instructorEmail },
      studentCount: Number(c.studentCount) || 0,
      createdAt: c.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

async function deleteCourse(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid courseId" });

  const result = await db.exec("DELETE FROM courses WHERE id = ?", [id]);
  if (!result || result.affectedRows === 0) return res.status(404).json({ message: "Course not found" });

  await writeAuditLog({
    actorUserId: req.user.id,
    action: "admin.course_deleted",
    entityType: "course",
    entityId: id,
    message: `Admin deleted course #${id}`,
  });

  return res.json({ message: "Course deleted" });
}

async function getPermissionsController(req, res) {
  const items = await listPermissions();
  return res.json({ items });
}

async function updatePermissionController(req, res) {
  const key = String(req.params.key || "").trim();
  if (!key) return res.status(400).json({ message: "Permission key is required" });

  const item = await updatePermission(key, req.body || {});
  if (!item) return res.status(404).json({ message: "Permission not found" });

  await writeAuditLog({
    actorUserId: req.user.id,
    action: "admin.permission_updated",
    entityType: "permission",
    entityId: key,
    message: `Admin updated permission ${key}`,
    meta: item,
  });

  return res.json({ message: "Permission updated", item });
}

async function listAuditLogs(req, res) {
  const page = clamp(req.query.page, 1, 100000, 1);
  const limit = clamp(req.query.limit, 1, 200, 25);
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const where = [];
  const params = [];
  if (action) {
    where.push("l.action = ?");
    params.push(action);
  }
  if (q) {
    where.push("(l.message LIKE ? OR l.entity_type LIKE ? OR COALESCE(u.email, '') LIKE ?)");
    params.push(buildLikeTerm(q), buildLikeTerm(q), buildLikeTerm(q));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [countRow] = await db.query(
    `
    SELECT COUNT(*) AS c
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ${whereSql}
  `,
    params
  );

  const total = Number(countRow && countRow.c) || 0;
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `
    SELECT
      l.id,
      l.action,
      l.entity_type AS entityType,
      l.entity_id AS entityId,
      l.message,
      l.meta,
      l.created_at AS createdAt,
      u.id AS actorId,
      u.name AS actorName,
      u.email AS actorEmail
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, limit, offset]
  );

  return res.json({
    items: (rows || []).map((row) => ({
      id: String(row.id),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      message: row.message,
      meta: row.meta ? (typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta) : {},
      createdAt: row.createdAt,
      actor: row.actorId ? { id: String(row.actorId), name: row.actorName, email: row.actorEmail } : null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

module.exports = {
  listUsers,
  createUser,
  deleteUser,
  analytics,
  listCourses,
  deleteCourse,
  getPermissionsController,
  updatePermissionController,
  listAuditLogs,
};
