const db = require("../config/db");

const DEFAULT_PERMISSIONS = [
  { key: "view_courses", label: "View courses", student: true, instructor: true, admin: true },
  { key: "create_courses", label: "Create courses", student: false, instructor: true, admin: true },
  { key: "grade_submissions", label: "Grade submissions", student: false, instructor: true, admin: true },
  { key: "manage_users", label: "Manage users", student: false, instructor: false, admin: true },
  { key: "view_audit_logs", label: "View audit logs", student: false, instructor: false, admin: true },
  { key: "post_announcements", label: "Post announcements", student: false, instructor: true, admin: true },
  { key: "create_quizzes", label: "Create quizzes", student: false, instructor: true, admin: true },
  { key: "attempt_quizzes", label: "Attempt quizzes", student: true, instructor: false, admin: true },
];

function normalizeRow(row) {
  return {
    key: row.permission_key,
    label: row.label,
    student: Boolean(row.student_allowed),
    instructor: Boolean(row.instructor_allowed),
    admin: Boolean(row.admin_allowed),
    updatedAt: row.updated_at,
  };
}

async function ensureDefaultPermissions() {
  for (const permission of DEFAULT_PERMISSIONS) {
    // eslint-disable-next-line no-await-in-loop
    await db.exec(
      `
      INSERT INTO role_permissions
        (permission_key, label, student_allowed, instructor_allowed, admin_allowed)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label)
    `,
      [permission.key, permission.label, permission.student ? 1 : 0, permission.instructor ? 1 : 0, permission.admin ? 1 : 0]
    );
  }
}

async function listPermissions() {
  await ensureDefaultPermissions();
  const rows = await db.query(
    `
    SELECT permission_key, label, student_allowed, instructor_allowed, admin_allowed, updated_at
    FROM role_permissions
    ORDER BY permission_key ASC
  `
  );
  return (rows || []).map(normalizeRow);
}

async function getPermission(key) {
  await ensureDefaultPermissions();
  const rows = await db.query(
    `
    SELECT permission_key, label, student_allowed, instructor_allowed, admin_allowed, updated_at
    FROM role_permissions
    WHERE permission_key = ?
    LIMIT 1
  `,
    [key]
  );
  if (!rows || rows.length === 0) return null;
  return normalizeRow(rows[0]);
}

async function updatePermission(key, payload) {
  await ensureDefaultPermissions();
  const current = await getPermission(key);
  if (!current) return null;

  const next = {
    label: payload.label ? String(payload.label).trim() : current.label,
    student: payload.student !== undefined ? Boolean(payload.student) : current.student,
    instructor: payload.instructor !== undefined ? Boolean(payload.instructor) : current.instructor,
    admin: payload.admin !== undefined ? Boolean(payload.admin) : current.admin,
  };

  await db.exec(
    `
    UPDATE role_permissions
    SET label = ?, student_allowed = ?, instructor_allowed = ?, admin_allowed = ?
    WHERE permission_key = ?
  `,
    [next.label, next.student ? 1 : 0, next.instructor ? 1 : 0, next.admin ? 1 : 0, key]
  );

  return getPermission(key);
}

async function roleHasPermission(role, key) {
  const permission = await getPermission(key);
  if (!permission) return false;
  if (role === "student") return permission.student;
  if (role === "instructor") return permission.instructor;
  if (role === "admin") return permission.admin;
  return false;
}

module.exports = {
  DEFAULT_PERMISSIONS,
  ensureDefaultPermissions,
  listPermissions,
  getPermission,
  updatePermission,
  roleHasPermission,
};
