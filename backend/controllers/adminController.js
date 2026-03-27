const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const { User, USER_ROLES } = require("../models/User");
const { Course } = require("../models/Course");
const { Assignment } = require("../models/Assignment");
const { Submission } = require("../models/Submission");

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function listUsers(req, res) {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const role = typeof req.query.role === "string" ? req.query.role.trim().toLowerCase() : "";
  const filter = role && USER_ROLES.includes(role) ? { role } : {};

  const users = await User.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return res.json(
    users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }))
  );
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

  const existing = await User.findOne({ email }).lean();
  if (existing) return res.status(409).json({ message: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role });
  return res.status(201).json({ message: "User created", user: { id: String(user._id) } });
}

async function deleteUser(req, res) {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid userId" });
  const user = await User.findByIdAndDelete(id).lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ message: "User deleted" });
}

async function analytics(req, res) {
  const [userCounts, courseCount, assignmentCount, submissionCount] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    Course.countDocuments({}),
    Assignment.countDocuments({}),
    Submission.countDocuments({}),
  ]);

  const usersByRole = {};
  for (const r of userCounts) usersByRole[r._id] = r.count;

  // Activity last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [newUsers7d, newCourses7d, submissions7d] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: since } }),
    Course.countDocuments({ createdAt: { $gte: since } }),
    Submission.countDocuments({ createdAt: { $gte: since } }),
  ]);

  return res.json({
    usersByRole,
    totals: { courses: courseCount, assignments: assignmentCount, submissions: submissionCount },
    last7d: { newUsers: newUsers7d, newCourses: newCourses7d, submissions: submissions7d },
  });
}

async function listCourses(req, res) {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const rows = await Course.find({}).sort({ createdAt: -1 }).limit(limit).populate("instructor", "name email").lean();
  return res.json(
    rows.map((c) => ({
      id: String(c._id),
      title: c.title,
      instructor: c.instructor ? { id: String(c.instructor._id), name: c.instructor.name, email: c.instructor.email } : null,
      studentCount: Array.isArray(c.students) ? c.students.length : 0,
      createdAt: c.createdAt,
    }))
  );
}

async function deleteCourse(req, res) {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid courseId" });
  const course = await Course.findByIdAndDelete(id).lean();
  if (!course) return res.status(404).json({ message: "Course not found" });
  await Assignment.deleteMany({ course: id });
  await Submission.deleteMany({ course: id });
  return res.json({ message: "Course deleted" });
}

module.exports = { listUsers, createUser, deleteUser, analytics, listCourses, deleteCourse };

