require("dotenv").config();

const bcrypt = require("bcrypt");
const { connectMongo } = require("../config/db");

const { User } = require("../models/User");
const { Course } = require("../models/Course");
const { Assignment } = require("../models/Assignment");
const { Submission } = require("../models/Submission");
const { Notification } = require("../models/Notification");

async function run() {
  await connectMongo({ mongoUri: process.env.MONGO_URI });

  const drop = String(process.env.SEED_DROP || "") === "1";
  if (drop) {
    await Promise.all([
      User.deleteMany({}),
      Course.deleteMany({}),
      Assignment.deleteMany({}),
      Submission.deleteMany({}),
      Notification.deleteMany({}),
    ]);
  }

  const password = "Password123!";
  const passwordHash = await bcrypt.hash(password, 10);

  async function upsertUser({ name, email, role }) {
    const normalized = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalized });
    if (existing) return existing;
    return User.create({ name, email: normalized, role, passwordHash });
  }

  const admin = await upsertUser({ name: "Admin", email: "admin@learnly.local", role: "admin" });
  const instructor = await upsertUser({ name: "Isha Instructor", email: "instructor@learnly.local", role: "instructor" });
  const student = await upsertUser({ name: "Sam Student", email: "student@learnly.local", role: "student" });

  let course = await Course.findOne({ title: "Intro to Web Development" });
  if (!course) {
    course = await Course.create({
      title: "Intro to Web Development",
      description: "HTML, CSS, JavaScript fundamentals with a practical mini-project.",
      instructor: instructor._id,
      students: [student._id],
      materials: [
        { type: "link", title: "Course outline", url: "https://example.com/course-outline", uploadedBy: instructor._id },
        { type: "video", title: "Welcome video", url: "https://example.com/welcome-video", uploadedBy: instructor._id },
      ],
    });
  }

  let assignment = await Assignment.findOne({ course: course._id, title: "Build a landing page" });
  if (!assignment) {
    assignment = await Assignment.create({
      course: course._id,
      title: "Build a landing page",
      description: "Create a responsive landing page using HTML/CSS. Submit a zip or a repo link.",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: instructor._id,
    });
    await Notification.create({
      user: student._id,
      type: "assignment_created",
      message: `New assignment: ${assignment.title}`,
      meta: { courseId: String(course._id), assignmentId: String(assignment._id) },
    });
  }

  const existingSubmission = await Submission.findOne({ assignment: assignment._id, student: student._id });
  if (!existingSubmission) {
    const submission = await Submission.create({
      assignment: assignment._id,
      course: course._id,
      student: student._id,
      text: "Here is my submission link: https://example.com/my-landing-page",
      submittedAt: new Date(),
      grade: { score: 92, feedback: "Nice spacing and typography. Great job!", gradedBy: instructor._id, gradedAt: new Date() },
    });
    await Notification.create({
      user: instructor._id,
      type: "submission_created",
      message: `New submission for "${assignment.title}"`,
      meta: { courseId: String(course._id), assignmentId: String(assignment._id), submissionId: String(submission._id) },
    });
    await Notification.create({
      user: student._id,
      type: "grade_posted",
      message: `Graded: "${assignment.title}" (92/100)`,
      meta: { courseId: String(course._id), assignmentId: String(assignment._id), submissionId: String(submission._id) },
    });
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
  // eslint-disable-next-line no-console
  console.log("Login credentials (all roles share same password):");
  // eslint-disable-next-line no-console
  console.log("- admin@learnly.local / Password123!");
  // eslint-disable-next-line no-console
  console.log("- instructor@learnly.local / Password123!");
  // eslint-disable-next-line no-console
  console.log("- student@learnly.local / Password123!");
  // eslint-disable-next-line no-console
  console.log("Dashboards:");
  // eslint-disable-next-line no-console
  console.log("- http://localhost:5000/dashboard.html");

  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", err);
  process.exit(1);
});

