require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const db = require("../config/db");
const { ensureDefaultPermissions } = require("../services/permissions");
const { writeAuditLog } = require("../services/auditLog");

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
  const tables = [
    "audit_logs",
    "password_resets",
    "role_permissions",
    "quiz_attempts",
    "quiz_questions",
    "quizzes",
    "announcements",
    "notifications",
    "submissions",
    "assignments",
    "course_materials",
    "enrollments",
    "user_profiles",
    "courses",
    "users",
  ];
  await db.getPool().query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    await db.getPool().query(`DROP TABLE IF EXISTS ${table}`);
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

async function upsertProfile(userId, profile) {
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
    [userId, profile.title || null, profile.bio || null, profile.phone || null, profile.timezone || null, profile.avatarUrl || null]
  );
}

async function upsertCourse({ title, description, category, instructorId }) {
  const rows = await db.query("SELECT id FROM courses WHERE title = ? LIMIT 1", [title]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec("INSERT INTO courses (title, description, category, instructor_id) VALUES (?, ?, ?, ?)", [
    title,
    description,
    category || "General",
    instructorId,
  ]);
  return result.insertId;
}

async function ensureEnrollment(courseId, studentId) {
  try {
    await db.exec("INSERT INTO enrollments (course_id, student_id) VALUES (?, ?)", [courseId, studentId]);
  } catch (e) {
    if (!(e && e.code === "ER_DUP_ENTRY")) throw e;
  }
}

async function ensureMaterial(courseId, type, title, url, uploadedBy) {
  const rows = await db.query("SELECT id FROM course_materials WHERE course_id = ? AND title = ? LIMIT 1", [courseId, title]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec("INSERT INTO course_materials (course_id, type, title, url, uploaded_by) VALUES (?, ?, ?, ?, ?)", [
    courseId,
    type,
    title,
    url,
    uploadedBy,
  ]);
  return result.insertId;
}

async function ensureAssignment(courseId, title, description, dueDate, createdBy) {
  const rows = await db.query("SELECT id FROM assignments WHERE course_id = ? AND title = ? LIMIT 1", [courseId, title]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec("INSERT INTO assignments (course_id, title, description, due_date, created_by) VALUES (?, ?, ?, ?, ?)", [
    courseId,
    title,
    description,
    dueDate,
    createdBy,
  ]);
  return result.insertId;
}

async function ensureSubmission({ assignmentId, courseId, studentId, text, gradeScore = null, gradeFeedback = null, gradedBy = null }) {
  const rows = await db.query("SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ? LIMIT 1", [assignmentId, studentId]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec(
    `
    INSERT INTO submissions
      (assignment_id, course_id, student_id, text, submitted_at, grade_score, grade_feedback, graded_by, graded_at)
    VALUES (?, ?, ?, ?, NOW(3), ?, ?, ?, ?)
  `,
    [assignmentId, courseId, studentId, text, gradeScore, gradeFeedback, gradedBy, gradeScore !== null ? new Date() : null]
  );
  return result.insertId;
}

async function ensureQuiz(courseId, title, instructions, timeLimitMinutes, isPublished = true) {
  const rows = await db.query("SELECT id FROM quizzes WHERE course_id = ? AND title = ? LIMIT 1", [courseId, title]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec(
    "INSERT INTO quizzes (course_id, title, instructions, time_limit_minutes, is_published, published_at) VALUES (?, ?, ?, ?, ?, ?)",
    [courseId, title, instructions || null, timeLimitMinutes || null, isPublished ? 1 : 0, isPublished ? new Date() : null]
  );
  return result.insertId;
}

async function ensureQuestion(quizId, question, options, marks = 1) {
  const rows = await db.query("SELECT id FROM quiz_questions WHERE quiz_id = ? AND question = ? LIMIT 1", [quizId, question]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec(
    `
    INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option, marks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [quizId, question, options.a, options.b, options.c, options.d, options.correct, marks]
  );
  return result.insertId;
}

async function ensureQuizAttempt(quizId, studentId, answers, score, totalQuestions) {
  const rows = await db.query("SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ? LIMIT 1", [quizId, studentId]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec(
    `
    INSERT INTO quiz_attempts (quiz_id, student_id, answers, score, total_questions, submitted_at)
    VALUES (?, ?, ?, ?, ?, NOW(3))
  `,
    [quizId, studentId, JSON.stringify(answers), score, totalQuestions]
  );
  return result.insertId;
}

async function ensureAnnouncement(courseId, authorId, audience, title, body) {
  const rows = await db.query("SELECT id FROM announcements WHERE title = ? LIMIT 1", [title]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec(
    "INSERT INTO announcements (course_id, author_id, audience, title, body) VALUES (?, ?, ?, ?, ?)",
    [courseId, authorId, audience, title, body]
  );
  return result.insertId;
}

async function ensureNotification(userId, type, message, meta) {
  const rows = await db.query("SELECT id FROM notifications WHERE user_id = ? AND type = ? AND message = ? LIMIT 1", [userId, type, message]);
  if (rows && rows.length > 0) return rows[0].id;
  const result = await db.exec("INSERT INTO notifications (user_id, type, message, meta) VALUES (?, ?, ?, ?)", [
    userId,
    type,
    message,
    meta ? JSON.stringify(meta) : null,
  ]);
  return result.insertId;
}

async function run() {
  await db.initDb();

  const drop = String(process.env.SEED_DROP || "") === "1";
  if (drop) await dropAll();
  await applySchema();
  await ensureDefaultPermissions();

  const password = "Password123!";
  const passwordHash = await bcrypt.hash(password, 10);

  const adminId = await upsertUser({ name: "Sam Admin", email: "admin@learnly.local", role: "admin", passwordHash });
  const instructorId = await upsertUser({ name: "Dr. Priya Nair", email: "instructor@learnly.local", role: "instructor", passwordHash });
  const instructor2Id = await upsertUser({ name: "James Okafor", email: "james@learnly.local", role: "instructor", passwordHash });
  const studentId = await upsertUser({ name: "Alex Santos", email: "student@learnly.local", role: "student", passwordHash });
  const student2Id = await upsertUser({ name: "Riya Shah", email: "riya@learnly.local", role: "student", passwordHash });
  const student3Id = await upsertUser({ name: "Kwame Ofori", email: "kwame@learnly.local", role: "student", passwordHash });

  await upsertProfile(adminId, { title: "Super Admin", bio: "Oversees the platform.", timezone: "Asia/Calcutta" });
  await upsertProfile(instructorId, {
    title: "Machine Learning Instructor",
    bio: "Teaches AI, ML, and research workflows.",
    phone: "+91 90000 11111",
    timezone: "Asia/Calcutta",
  });
  await upsertProfile(instructor2Id, {
    title: "Frontend Instructor",
    bio: "Focuses on React and modern web tooling.",
    phone: "+91 90000 22222",
    timezone: "Asia/Calcutta",
  });
  await upsertProfile(studentId, { title: "Student", bio: "Learning ML and modern frontend development.", timezone: "Asia/Calcutta" });
  await upsertProfile(student2Id, { title: "Student", bio: "Interested in data storytelling.", timezone: "Asia/Calcutta" });
  await upsertProfile(student3Id, { title: "Student", bio: "Exploring cybersecurity and analytics.", timezone: "Asia/Calcutta" });

  const mlCourseId = await upsertCourse({
    title: "Machine Learning Fundamentals",
    description: "Core ML concepts, model evaluation, and practical notebook exercises.",
    category: "Data Science",
    instructorId,
  });
  const reactCourseId = await upsertCourse({
    title: "React & Modern Frontends",
    description: "Components, hooks, state, routing, and deployment workflows.",
    category: "Web Development",
    instructorId: instructor2Id,
  });
  const pythonCourseId = await upsertCourse({
    title: "Data Storytelling with Python",
    description: "Clean data, explore trends, and present findings with compelling visuals.",
    category: "Analytics",
    instructorId,
  });

  await ensureEnrollment(mlCourseId, studentId);
  await ensureEnrollment(mlCourseId, student2Id);
  await ensureEnrollment(reactCourseId, studentId);
  await ensureEnrollment(reactCourseId, student3Id);
  await ensureEnrollment(pythonCourseId, student2Id);
  await ensureEnrollment(pythonCourseId, student3Id);

  await ensureMaterial(mlCourseId, "pdf", "ML Syllabus", "https://example.com/ml-syllabus.pdf", instructorId);
  await ensureMaterial(mlCourseId, "video", "Linear Regression Walkthrough", "https://example.com/ml-video", instructorId);
  await ensureMaterial(reactCourseId, "link", "React Resource Pack", "https://example.com/react-pack", instructor2Id);
  await ensureMaterial(pythonCourseId, "pdf", "EDA Cheatsheet", "https://example.com/eda-cheatsheet.pdf", instructorId);

  const mlAssignment1 = await ensureAssignment(
    mlCourseId,
    "ML Quiz Prep Worksheet",
    "Complete the worksheet covering model metrics and validation strategy.",
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    instructorId
  );
  const mlAssignment2 = await ensureAssignment(
    mlCourseId,
    "Mini Model Report",
    "Train a simple classifier and submit a short evaluation report.",
    new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    instructorId
  );
  const reactAssignment = await ensureAssignment(
    reactCourseId,
    "Build a Component Library",
    "Create reusable UI primitives with documentation.",
    new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    instructor2Id
  );
  const pythonAssignment = await ensureAssignment(
    pythonCourseId,
    "EDA Presentation Deck",
    "Summarize dataset insights with charts and narrative.",
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    instructorId
  );

  const submission1Id = await ensureSubmission({
    assignmentId: mlAssignment1,
    courseId: mlCourseId,
    studentId,
    text: "Completed worksheet and attached key takeaways.",
    gradeScore: 91,
    gradeFeedback: "Strong understanding of recall/precision tradeoffs.",
    gradedBy: instructorId,
  });
  const submission2Id = await ensureSubmission({
    assignmentId: reactAssignment,
    courseId: reactCourseId,
    studentId,
    text: "Shared a component library repo and screenshots.",
    gradeScore: 86,
    gradeFeedback: "Solid structure. Improve accessibility labels.",
    gradedBy: instructor2Id,
  });
  await ensureSubmission({
    assignmentId: mlAssignment1,
    courseId: mlCourseId,
    studentId: student2Id,
    text: "Worksheet answers submitted for review.",
    gradeScore: 95,
    gradeFeedback: "Excellent work and clear reasoning.",
    gradedBy: instructorId,
  });
  await ensureSubmission({
    assignmentId: pythonAssignment,
    courseId: pythonCourseId,
    studentId: student2Id,
    text: "Added charts and executive summary.",
  });
  await ensureSubmission({
    assignmentId: pythonAssignment,
    courseId: pythonCourseId,
    studentId: student3Id,
    text: "Submitted draft findings with visualizations.",
  });

  const mlQuizId = await ensureQuiz(
    mlCourseId,
    "ML Fundamentals Quiz 1",
    "Answer all questions carefully. Focus on evaluation metrics and model generalization concepts.",
    15
  );
  const reactQuizId = await ensureQuiz(
    reactCourseId,
    "React Hooks Deep Dive",
    "This quiz checks your understanding of core hooks and state management basics.",
    10
  );

  const mlQuestion1Id = await ensureQuestion(mlQuizId, "Which metric is best for imbalanced classification?", {
    a: "Accuracy",
    b: "Precision/Recall",
    c: "Mean Absolute Error",
    d: "R-squared",
    correct: "B",
  }, 5);
  const mlQuestion2Id = await ensureQuestion(mlQuizId, "What does overfitting usually indicate?", {
    a: "Too much training signal",
    b: "Model memorizes training data",
    c: "Dataset has no labels",
    d: "Low variance",
    correct: "B",
  }, 5);
  const reactQuestion1Id = await ensureQuestion(reactQuizId, "Which hook handles local component state?", {
    a: "useMemo",
    b: "useReducer",
    c: "useState",
    d: "useRef",
    correct: "C",
  }, 10);

  await ensureQuizAttempt(
    mlQuizId,
    studentId,
    { [mlQuestion1Id]: "B", [mlQuestion2Id]: "B" },
    100,
    2
  );
  await ensureQuizAttempt(
    mlQuizId,
    student2Id,
    { [mlQuestion1Id]: "B", [mlQuestion2Id]: "A" },
    50,
    2
  );
  await ensureQuizAttempt(
    reactQuizId,
    studentId,
    { [reactQuestion1Id]: "C" },
    100,
    1
  );

  await ensureAnnouncement(mlCourseId, instructorId, "course", "ML Quiz #1 is live", "Please complete Quiz #1 before Friday night.");
  await ensureAnnouncement(reactCourseId, instructor2Id, "course", "React workshop rescheduled", "The live workshop now starts at 5pm IST tomorrow.");
  await ensureAnnouncement(null, adminId, "all", "Platform update", "New dashboards, quizzes, and announcements are now live.");

  await ensureNotification(instructorId, "submission_created", 'New submission for "ML Quiz Prep Worksheet"', {
    courseId: String(mlCourseId),
    assignmentId: String(mlAssignment1),
    submissionId: String(submission1Id),
  });
  await ensureNotification(studentId, "grade_posted", 'Graded: "ML Quiz Prep Worksheet" (91/100)', {
    courseId: String(mlCourseId),
    assignmentId: String(mlAssignment1),
    submissionId: String(submission1Id),
  });
  await ensureNotification(studentId, "grade_posted", 'Graded: "Build a Component Library" (86/100)', {
    courseId: String(reactCourseId),
    assignmentId: String(reactAssignment),
    submissionId: String(submission2Id),
  });

  await writeAuditLog({
    actorUserId: adminId,
    action: "seed.completed",
    entityType: "system",
    entityId: "seed",
    message: "Seed data prepared with LMS demo entities",
  });

  console.log("Seed complete.");
  console.log("Login credentials (all roles share same password):");
  console.log("- admin@learnly.local / Password123!");
  console.log("- instructor@learnly.local / Password123!");
  console.log("- student@learnly.local / Password123!");
  console.log("Extra demo users:");
  console.log("- james@learnly.local / Password123!");
  console.log("- riya@learnly.local / Password123!");
  console.log("- kwame@learnly.local / Password123!");
  console.log("Dashboards:");
  console.log("- http://localhost:5000/dashboard.html");

  await db.closeDb();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err.message || err);
  process.exit(1);
});
