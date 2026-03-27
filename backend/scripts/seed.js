require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const db = require("../config/db");

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

async function applySchema() {
  const schemaPath = path.join(__dirname, "schema.mysql.sql");
  const raw = fs.readFileSync(schemaPath, "utf8");
  const cleaned = stripSqlComments(raw);
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    // eslint-disable-next-line no-await-in-loop
    await db.getPool().query(stmt);
  }
}

async function dropAll() {
  const tables = ["quiz_questions", "quizzes", "notifications", "submissions", "assignments", "course_materials", "enrollments", "courses", "users"];
  await db.getPool().query("SET FOREIGN_KEY_CHECKS=0");
  for (const t of tables) {
    // eslint-disable-next-line no-await-in-loop
    await db.getPool().query(`DROP TABLE IF EXISTS ${t}`);
  }
  await db.getPool().query("SET FOREIGN_KEY_CHECKS=1");
}

async function upsertUser({ name, email, role, passwordHash }) {
  const normalized = email.trim().toLowerCase();
  const rows = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalized]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)", [
    name,
    normalized,
    passwordHash,
    role,
  ]);
  return result.insertId;
}

async function run() {
  await db.initDb();

  const drop = String(process.env.SEED_DROP || "") === "1";
  if (drop) await dropAll();
  await applySchema();

  const password = "Password123!";
  const passwordHash = await bcrypt.hash(password, 10);

  const adminId = await upsertUser({ name: "Admin", email: "admin@learnly.local", role: "admin", passwordHash });
  const instructorId = await upsertUser({
    name: "Isha Instructor",
    email: "instructor@learnly.local",
    role: "instructor",
    passwordHash,
  });
  const studentId = await upsertUser({ name: "Sam Student", email: "student@learnly.local", role: "student", passwordHash });

  let courseId = null;
  const courseRows = await db.query("SELECT id FROM courses WHERE title = ? LIMIT 1", ["Intro to Web Development"]);
  if (courseRows && courseRows.length > 0) {
    courseId = courseRows[0].id;
  } else {
    const r = await db.exec("INSERT INTO courses (title, description, instructor_id) VALUES (?, ?, ?)", [
      "Intro to Web Development",
      "HTML, CSS, JavaScript fundamentals with a practical mini-project.",
      instructorId,
    ]);
    courseId = r.insertId;
  }

  try {
    await db.exec("INSERT INTO enrollments (course_id, student_id) VALUES (?, ?)", [courseId, studentId]);
  } catch (e) {
    if (!(e && e.code === "ER_DUP_ENTRY")) throw e;
  }

  const matRows = await db.query("SELECT id FROM course_materials WHERE course_id = ? LIMIT 1", [courseId]);
  if (!matRows || matRows.length === 0) {
    await db.exec("INSERT INTO course_materials (course_id, type, title, url, uploaded_by) VALUES (?, ?, ?, ?, ?)", [
      courseId,
      "link",
      "Course outline",
      "https://example.com/course-outline",
      instructorId,
    ]);
    await db.exec("INSERT INTO course_materials (course_id, type, title, url, uploaded_by) VALUES (?, ?, ?, ?, ?)", [
      courseId,
      "video",
      "Welcome video",
      "https://example.com/welcome-video",
      instructorId,
    ]);
  }

  let assignmentId = null;
  const assignRows = await db.query("SELECT id FROM assignments WHERE course_id = ? AND title = ? LIMIT 1", [
    courseId,
    "Build a landing page",
  ]);
  if (assignRows && assignRows.length > 0) {
    assignmentId = assignRows[0].id;
  } else {
    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const r = await db.exec("INSERT INTO assignments (course_id, title, description, due_date, created_by) VALUES (?, ?, ?, ?, ?)", [
      courseId,
      "Build a landing page",
      "Create a responsive landing page using HTML/CSS. Submit a zip or a repo link.",
      due,
      instructorId,
    ]);
    assignmentId = r.insertId;
  }

  const subRows = await db.query("SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ? LIMIT 1", [assignmentId, studentId]);
  if (!subRows || subRows.length === 0) {
    const r = await db.exec(
      `
      INSERT INTO submissions
        (assignment_id, course_id, student_id, text, submitted_at, grade_score, grade_feedback, graded_by, graded_at)
      VALUES (?, ?, ?, ?, NOW(3), ?, ?, ?, NOW(3))
    `,
      [
        assignmentId,
        courseId,
        studentId,
        "Here is my submission link: https://example.com/my-landing-page",
        92,
        "Nice spacing and typography. Great job!",
        instructorId,
      ]
    );

    await db.exec("INSERT INTO notifications (user_id, type, message, meta) VALUES (?, ?, ?, ?)", [
      instructorId,
      "submission_created",
      'New submission for "Build a landing page"',
      JSON.stringify({ courseId: String(courseId), assignmentId: String(assignmentId), submissionId: String(r.insertId) }),
    ]);
    await db.exec("INSERT INTO notifications (user_id, type, message, meta) VALUES (?, ?, ?, ?)", [
      studentId,
      "grade_posted",
      'Graded: "Build a landing page" (92/100)',
      JSON.stringify({ courseId: String(courseId), assignmentId: String(assignmentId), submissionId: String(r.insertId) }),
    ]);
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

  await db.closeDb();
  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", err.message || err);
  process.exit(1);
});

