const bcrypt = require("bcrypt");

const db = require("../config/db");
const { toId } = require("./courseController");

const USER_ROLES = ["student", "instructor", "admin"];

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function listUsers(req, res) {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const role = typeof req.query.role === "string" ? req.query.role.trim().toLowerCase() : "";

  const where = role && USER_ROLES.includes(role) ? "WHERE role = ?" : "";
  const params = role && USER_ROLES.includes(role) ? [role, limit] : [limit];

  const rows = await db.query(
    `
    SELECT id, name, email, role, created_at AS createdAt
    FROM users
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `,
    params
  );

  return res.json((rows || []).map((u) => ({ ...u, id: String(u.id) })));
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
  const usersByRole = {};
  for (const r of usersByRoleRows || []) usersByRole[r.role] = Number(r.count) || 0;

  const [courseCountRow] = await db.query("SELECT COUNT(*) AS c FROM courses");
  const [assignmentCountRow] = await db.query("SELECT COUNT(*) AS c FROM assignments");
  const [submissionCountRow] = await db.query("SELECT COUNT(*) AS c FROM submissions");

  const [newUsers7dRow] = await db.query("SELECT COUNT(*) AS c FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
  const [newCourses7dRow] = await db.query("SELECT COUNT(*) AS c FROM courses WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
  const [submissions7dRow] = await db.query("SELECT COUNT(*) AS c FROM submissions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");

  return res.json({
    usersByRole,
    totals: {
      courses: Number(courseCountRow.c) || 0,
      assignments: Number(assignmentCountRow.c) || 0,
      submissions: Number(submissionCountRow.c) || 0,
    },
    last7d: {
      newUsers: Number(newUsers7dRow.c) || 0,
      newCourses: Number(newCourses7dRow.c) || 0,
      submissions: Number(submissions7dRow.c) || 0,
    },
  });
}

async function listCourses(req, res) {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const rows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      u.id AS instructorId,
      u.name AS instructorName,
      u.email AS instructorEmail,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      c.created_at AS createdAt
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ORDER BY c.created_at DESC
    LIMIT ?
  `,
    [limit]
  );

  return res.json(
    (rows || []).map((c) => ({
      id: String(c.id),
      title: c.title,
      instructor: { id: String(c.instructorId), name: c.instructorName, email: c.instructorEmail },
      studentCount: Number(c.studentCount) || 0,
      createdAt: c.createdAt,
    }))
  );
}

async function deleteCourse(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid courseId" });

  const result = await db.exec("DELETE FROM courses WHERE id = ?", [id]);
  if (!result || result.affectedRows === 0) return res.status(404).json({ message: "Course not found" });
  return res.json({ message: "Course deleted" });
}

module.exports = { listUsers, createUser, deleteUser, analytics, listCourses, deleteCourse };

