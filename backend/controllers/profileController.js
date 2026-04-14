const bcrypt = require("bcrypt");

const db = require("../config/db");
const { writeAuditLog } = require("../services/auditLog");

async function getProfile(req, res) {
  const rows = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.created_at AS createdAt,
      p.title,
      p.bio,
      p.phone,
      p.timezone,
      p.avatar_url AS avatarUrl
    FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
  `,
    [req.user.id]
  );
  if (!rows || rows.length === 0) return res.status(404).json({ message: "User not found" });
  const row = rows[0];

  return res.json({
    user: {
      id: String(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt,
      profile: {
        title: row.title || "",
        bio: row.bio || "",
        phone: row.phone || "",
        timezone: row.timezone || "",
        avatarUrl: row.avatarUrl || "",
      },
    },
  });
}

async function updateProfile(req, res) {
  const name = String(req.body && req.body.name ? req.body.name : "").trim();
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const bio = String(req.body && req.body.bio ? req.body.bio : "").trim();
  const phone = String(req.body && req.body.phone ? req.body.phone : "").trim();
  const timezone = String(req.body && req.body.timezone ? req.body.timezone : "").trim();
  const avatarUrl = String(req.body && req.body.avatarUrl ? req.body.avatarUrl : "").trim();

  if (!name) return res.status(400).json({ message: "Name is required" });

  await db.exec("UPDATE users SET name = ? WHERE id = ?", [name, req.user.id]);
  await db.exec(
    `
    INSERT INTO user_profiles (user_id, title, bio, phone, timezone, avatar_url)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      bio = VALUES(bio),
      phone = VALUES(phone),
      timezone = VALUES(timezone),
      avatar_url = VALUES(avatar_url)
  `,
    [req.user.id, title || null, bio || null, phone || null, timezone || null, avatarUrl || null]
  );

  await writeAuditLog({
    actorUserId: req.user.id,
    action: "profile.updated",
    entityType: "profile",
    entityId: req.user.id,
    message: "Profile updated",
  });

  return getProfile(req, res);
}

async function changePassword(req, res) {
  const currentPassword = req.body && req.body.currentPassword ? String(req.body.currentPassword) : "";
  const newPassword = req.body && req.body.newPassword ? String(req.body.newPassword) : "";
  if (!currentPassword) return res.status(400).json({ message: "Current password is required" });
  if (newPassword.length < 6) return res.status(400).json({ message: "New password must be at least 6 characters" });

  const rows = await db.query("SELECT password_hash AS passwordHash FROM users WHERE id = ? LIMIT 1", [req.user.id]);
  if (!rows || rows.length === 0) return res.status(404).json({ message: "User not found" });
  const ok = await bcrypt.compare(currentPassword, rows[0].passwordHash);
  if (!ok) return res.status(400).json({ message: "Current password is incorrect" });

  const nextHash = await bcrypt.hash(newPassword, 10);
  await db.exec("UPDATE users SET password_hash = ? WHERE id = ?", [nextHash, req.user.id]);

  await writeAuditLog({
    actorUserId: req.user.id,
    action: "profile.password_changed",
    entityType: "profile",
    entityId: req.user.id,
    message: "Password changed",
  });

  return res.json({ message: "Password updated" });
}

module.exports = { getProfile, updateProfile, changePassword };
