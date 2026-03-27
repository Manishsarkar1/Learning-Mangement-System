const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const db = require("../config/db");

function signToken(user) {
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  return jwt.sign({ id: String(user.id), role: user.role }, secret, { expiresIn: "7d" });
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const result = await db.exec("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)", [
      name,
      email,
      passwordHash,
      role,
    ]);
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

  const rows = await db.query("SELECT id, email, password_hash, role FROM users WHERE email = ? LIMIT 1", [email]);
  if (!rows || rows.length === 0) return res.status(400).json({ message: "User not found" });

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ message: "Invalid password" });

  const token = signToken({ id: user.id, role: user.role });
  return res.json({ token });
}

async function me(req, res) {
  const rows = await db.query("SELECT id, name, email, role, created_at AS createdAt FROM users WHERE id = ? LIMIT 1", [req.user.id]);
  if (!rows || rows.length === 0) return res.status(404).json({ message: "User not found" });
  return res.json({ user: rows[0] });
}

module.exports = { register, login, me };

