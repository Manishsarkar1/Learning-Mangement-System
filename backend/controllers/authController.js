const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const { writeAuditLog } = require("../services/auditLog");

function signToken(user) {
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  return jwt.sign({ id: String(user.id), role: user.role }, secret, { expiresIn: "7d" });
}

function setAuthCookie(res, token) {
  res.cookie("learnly_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: String(process.env.NODE_ENV || "").toLowerCase() === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie("learnly_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: String(process.env.NODE_ENV || "").toLowerCase() === "production",
    path: "/",
  });
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function loadUserById(id) {
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
    [id]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

async function register(req, res) {
  const name = String(req.body && req.body.name ? req.body.name : "").trim();
  const email = String(req.body && req.body.email ? req.body.email : "").trim().toLowerCase();
  const password = req.body ? req.body.password : null;
  const role = String(req.body && req.body.role ? req.body.role : "student").trim().toLowerCase();

  if (!name) return res.status(400).json({ message: "Name is required" });
  if (!isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });
  if (typeof password !== "string" || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
  if (!["student", "instructor"].includes(role)) return res.status(400).json({ message: "Role must be student or instructor" });

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await db.exec("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)", [name, email, passwordHash, role]);
    await db.exec("INSERT INTO user_profiles (user_id, timezone) VALUES (?, ?)", [result.insertId, "Asia/Calcutta"]);

    await writeAuditLog({
      actorUserId: result.insertId,
      action: "user.register",
      entityType: "user",
      entityId: result.insertId,
      message: `New ${role} account registered`,
      meta: { email, role },
    });

    return res.status(201).json({ message: "User registered", user: { id: String(result.insertId), name, email, role } });
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Email already in use" });
    throw e;
  }
}

async function login(req, res) {
  const email = String(req.body && req.body.email ? req.body.email : "").trim().toLowerCase();
  const password = req.body ? req.body.password : null;

  if (!isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });
  if (typeof password !== "string" || !password) return res.status(400).json({ message: "Password is required" });

  const rows = await db.query("SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1", [email]);
  if (!rows || rows.length === 0) return res.status(400).json({ message: "User not found" });

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ message: "Invalid password" });

  const token = signToken({ id: user.id, role: user.role });
  setAuthCookie(res, token);

  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.login",
    entityType: "session",
    entityId: user.id,
    message: `${user.email} signed in`,
    meta: { role: user.role },
  });

  return res.json({
    message: "Signed in",
    token,
    user: { id: String(user.id), name: user.name, email: user.email, role: user.role },
  });
}

async function logout(req, res) {
  const actorId = req.user && req.user.id ? Number(req.user.id) : null;
  clearAuthCookie(res);

  if (actorId) {
    await writeAuditLog({
      actorUserId: actorId,
      action: "auth.logout",
      entityType: "session",
      entityId: actorId,
      message: "User signed out",
    });
  }

  return res.json({ message: "Signed out" });
}

async function forgotPassword(req, res) {
  const email = String(req.body && req.body.email ? req.body.email : "").trim().toLowerCase();
  if (!isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });

  const rows = await db.query("SELECT id, email FROM users WHERE email = ? LIMIT 1", [email]);
  if (!rows || rows.length === 0) {
    return res.json({ message: "If that account exists, a reset link has been generated." });
  }

  const user = rows[0];
  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db.exec("UPDATE password_resets SET used_at = COALESCE(used_at, NOW(3)) WHERE user_id = ? AND used_at IS NULL", [user.id]);
  await db.exec("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)", [user.id, tokenHash, expiresAt]);

  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.password_reset_requested",
    entityType: "password_reset",
    entityId: user.id,
    message: `Password reset requested for ${user.email}`,
  });

  const payload = { message: "If that account exists, a reset link has been generated." };
  if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
    payload.debugResetToken = rawToken;
    payload.debugResetUrl = `/reset-password.html?token=${rawToken}`;
  }
  return res.json(payload);
}

async function resetPassword(req, res) {
  const rawToken = String(req.body && req.body.token ? req.body.token : "").trim();
  const password = req.body ? req.body.password : null;
  if (!rawToken) return res.status(400).json({ message: "Reset token is required" });
  if (typeof password !== "string" || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

  const tokenHash = hashResetToken(rawToken);
  const rows = await db.query(
    `
    SELECT id, user_id AS userId
    FROM password_resets
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW(3)
    LIMIT 1
  `,
    [tokenHash]
  );
  if (!rows || rows.length === 0) return res.status(400).json({ message: "Reset token is invalid or expired" });

  const resetRow = rows[0];
  const passwordHash = await bcrypt.hash(password, 10);
  await db.exec("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, resetRow.userId]);
  await db.exec("UPDATE password_resets SET used_at = NOW(3) WHERE id = ?", [resetRow.id]);

  await writeAuditLog({
    actorUserId: resetRow.userId,
    action: "auth.password_reset_completed",
    entityType: "password_reset",
    entityId: resetRow.userId,
    message: "Password reset completed",
  });

  return res.json({ message: "Password updated. You can sign in now." });
}

async function me(req, res) {
  const user = await loadUserById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({
    user: {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      profile: {
        title: user.title || "",
        bio: user.bio || "",
        phone: user.phone || "",
        timezone: user.timezone || "",
        avatarUrl: user.avatarUrl || "",
      },
    },
  });
}

module.exports = { register, login, logout, forgotPassword, resetPassword, me, clearAuthCookie, setAuthCookie };
