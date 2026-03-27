const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { User } = require("../models/User");

function signToken(user) {
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  return jwt.sign({ id: String(user._id), role: user.role }, secret, { expiresIn: "7d" });
}

function sanitizeUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
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

  const existing = await User.findOne({ email }).lean();
  if (existing) return res.status(409).json({ message: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role });
  return res.status(201).json({ message: "User registered", user: sanitizeUser(user) });
}

async function login(req, res) {
  const email = String(req.body && req.body.email ? req.body.email : "").trim().toLowerCase();
  const password = req.body ? req.body.password : null;

  if (!isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });
  if (typeof password !== "string" || !password) return res.status(400).json({ message: "Password is required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ message: "Invalid password" });

  const token = signToken(user);
  return res.json({ token });
}

async function me(req, res) {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ user: { id: String(user._id), name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } });
}

module.exports = { register, login, me };

