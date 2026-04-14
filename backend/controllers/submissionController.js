const db = require("../config/db");
const { toId } = require("./courseController");
const { writeAuditLog } = require("../services/auditLog");

function mapFile(path, originalName, mimeType, size) {
  if (!path) return null;
  return {
    originalName,
    mimeType,
    size,
    path,
    url: `/${String(path).replace(/\\/g, "/")}`,
  };
}

async function loadAssignmentAndCourse(assignmentId) {
  const rows = await db.query(
    `
    SELECT
      a.id AS assignmentId,
      a.title AS assignmentTitle,
      a.course_id AS courseId,
      c.title AS courseTitle,
      c.instructor_id AS instructorId
    FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ?
    LIMIT 1
  `,
    [assignmentId]
  );
  if (!rows || rows.length === 0) {
    const err = new Error("Assignment not found");
    err.status = 404;
    throw err;
  }
  return rows[0];
}

async function ensureStudentEnrollment({ courseId, studentId }) {
  const enr = await db.query("SELECT 1 AS ok FROM enrollments WHERE course_id = ? AND student_id = ? LIMIT 1", [courseId, studentId]);
  return enr && enr.length > 0;
}

async function submit(req, res) {
  const assignmentId = toId(req.body && req.body.assignmentId);
  const text = req.body && typeof req.body.text === "string" ? req.body.text : "";

  if (!assignmentId) return res.status(400).json({ message: "Invalid assignmentId" });
  if (!text && !req.file) return res.status(400).json({ message: "Provide text or a file" });

  const info = await loadAssignmentAndCourse(assignmentId);
  const studentId = toId(req.user.id);

  if (req.user.role !== "admin") {
    const ok = await ensureStudentEnrollment({ courseId: Number(info.courseId), studentId });
    if (!ok) return res.status(403).json({ message: "You are not enrolled in this course" });
  }

  const filePath = req.file ? `uploads/submissions/${req.file.filename}` : null;
  const fileOriginal = req.file ? req.file.originalname : null;
  const fileMime = req.file ? req.file.mimetype : null;
  const fileSize = req.file ? req.file.size : null;

  try {
    const result = await db.exec(
      `
      INSERT INTO submissions
        (assignment_id, course_id, student_id, text, file_original_name, file_mime_type, file_size, file_path, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
    `,
      [assignmentId, info.courseId, studentId, text ? String(text).slice(0, 20000) : null, fileOriginal, fileMime, fileSize, filePath]
    );

    await db.exec("INSERT INTO notifications (user_id, type, message, meta) VALUES (?, ?, ?, ?)", [
      info.instructorId,
      "submission_created",
      `New submission for "${info.assignmentTitle}"`,
      JSON.stringify({ courseId: String(info.courseId), assignmentId: String(info.assignmentId), submissionId: String(result.insertId) }),
    ]);

    await writeAuditLog({
      actorUserId: studentId,
      action: "submission.created",
      entityType: "submission",
      entityId: result.insertId,
      message: `Submission created for ${info.assignmentTitle}`,
      meta: { courseId: String(info.courseId), assignmentId: String(info.assignmentId) },
    });

    return res.status(201).json({ message: "Submitted", submission: { id: String(result.insertId) } });
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "You already submitted this assignment" });
    throw e;
  }
}

async function listByAssignment(req, res) {
  const assignmentId = toId(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ message: "Invalid assignmentId" });

  const info = await loadAssignmentAndCourse(assignmentId);
  const userId = toId(req.user.id);
  const isAdmin = req.user.role === "admin";
  const isOwner = req.user.role === "instructor" && Number(info.instructorId) === userId;
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  const rows = await db.query(
    `
    SELECT
      s.id,
      s.assignment_id AS assignmentId,
      s.text,
      s.file_original_name AS fileOriginalName,
      s.file_mime_type AS mimeType,
      s.file_size AS size,
      s.file_path AS path,
      s.submitted_at AS submittedAt,
      s.grade_score AS gradeScore,
      s.grade_feedback AS gradeFeedback,
      s.graded_by AS gradedBy,
      s.graded_at AS gradedAt,
      u.id AS studentId,
      u.name AS studentName,
      u.email AS studentEmail
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    WHERE s.assignment_id = ?
    ORDER BY s.submitted_at DESC
  `,
    [assignmentId]
  );

  return res.json(
    (rows || []).map((r) => ({
      id: String(r.id),
      assignmentId: String(r.assignmentId),
      student: { id: String(r.studentId), name: r.studentName, email: r.studentEmail },
      text: r.text || "",
      file: mapFile(r.path, r.fileOriginalName, r.mimeType, r.size),
      submittedAt: r.submittedAt,
      grade:
        r.gradeScore !== null && r.gradeScore !== undefined
          ? { score: Number(r.gradeScore), feedback: r.gradeFeedback || "", gradedBy: r.gradedBy, gradedAt: r.gradedAt }
          : null,
    }))
  );
}

async function mySubmission(req, res) {
  const assignmentId = toId(req.query.assignmentId);
  if (!assignmentId) return res.status(400).json({ message: "Invalid assignmentId" });

  const studentId = toId(req.user.id);
  const rows = await db.query(
    `
    SELECT
      id,
      assignment_id AS assignmentId,
      text,
      file_original_name AS fileOriginalName,
      file_mime_type AS mimeType,
      file_size AS size,
      file_path AS path,
      submitted_at AS submittedAt,
      grade_score AS gradeScore,
      grade_feedback AS gradeFeedback,
      graded_by AS gradedBy,
      graded_at AS gradedAt
    FROM submissions
    WHERE assignment_id = ? AND student_id = ?
    LIMIT 1
  `,
    [assignmentId, studentId]
  );

  if (!rows || rows.length === 0) return res.status(404).json({ message: "Submission not found" });
  const r = rows[0];
  return res.json({
    id: String(r.id),
    assignmentId: String(r.assignmentId),
    text: r.text || "",
    file: mapFile(r.path, r.fileOriginalName, r.mimeType, r.size),
    submittedAt: r.submittedAt,
    grade:
      r.gradeScore !== null && r.gradeScore !== undefined
        ? { score: Number(r.gradeScore), feedback: r.gradeFeedback || "", gradedBy: r.gradedBy, gradedAt: r.gradedAt }
        : null,
  });
}

async function listMine(req, res) {
  const studentId = toId(req.user.id);
  const rows = await db.query(
    `
    SELECT
      s.id,
      s.assignment_id AS assignmentId,
      s.course_id AS courseId,
      s.text,
      s.file_original_name AS fileOriginalName,
      s.file_mime_type AS mimeType,
      s.file_size AS size,
      s.file_path AS path,
      s.submitted_at AS submittedAt,
      s.grade_score AS gradeScore,
      s.grade_feedback AS gradeFeedback,
      s.graded_at AS gradedAt,
      a.title AS assignmentTitle,
      c.title AS courseTitle
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = s.course_id
    WHERE s.student_id = ?
    ORDER BY s.submitted_at DESC
  `,
    [studentId]
  );

  return res.json(
    (rows || []).map((r) => ({
      id: String(r.id),
      assignmentId: String(r.assignmentId),
      courseId: String(r.courseId),
      assignmentTitle: r.assignmentTitle,
      courseTitle: r.courseTitle,
      text: r.text || "",
      file: mapFile(r.path, r.fileOriginalName, r.mimeType, r.size),
      submittedAt: r.submittedAt,
      gradeScore: r.gradeScore !== null ? Number(r.gradeScore) : null,
      gradeFeedback: r.gradeFeedback || "",
      gradedAt: r.gradedAt,
    }))
  );
}

async function grade(req, res) {
  const submissionId = toId(req.params.id);
  if (!submissionId) return res.status(400).json({ message: "Invalid submissionId" });

  const score = req.body && req.body.score !== undefined ? Number(req.body.score) : NaN;
  const feedback = req.body && typeof req.body.feedback === "string" ? req.body.feedback : "";
  if (Number.isNaN(score) || score < 0 || score > 100) return res.status(400).json({ message: "Score must be 0-100" });

  const rows = await db.query(
    `
    SELECT
      s.id AS submissionId,
      s.student_id AS studentId,
      s.assignment_id AS assignmentId,
      a.title AS assignmentTitle,
      a.course_id AS courseId,
      c.instructor_id AS instructorId
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.id = ?
    LIMIT 1
  `,
    [submissionId]
  );
  if (!rows || rows.length === 0) return res.status(404).json({ message: "Submission not found" });

  const info = rows[0];
  const userId = toId(req.user.id);
  const isAdmin = req.user.role === "admin";
  const isOwner = req.user.role === "instructor" && Number(info.instructorId) === userId;
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  await db.exec("UPDATE submissions SET grade_score = ?, grade_feedback = ?, graded_by = ?, graded_at = NOW(3) WHERE id = ?", [
    Math.round(score),
    String(feedback).slice(0, 5000),
    userId,
    submissionId,
  ]);

  await db.exec("INSERT INTO notifications (user_id, type, message, meta) VALUES (?, ?, ?, ?)", [
    info.studentId,
    "grade_posted",
    `Graded: "${info.assignmentTitle}" (${Math.round(score)}/100)`,
    JSON.stringify({ courseId: String(info.courseId), assignmentId: String(info.assignmentId), submissionId: String(submissionId) }),
  ]);

  await writeAuditLog({
    actorUserId: userId,
    action: "submission.graded",
    entityType: "submission",
    entityId: submissionId,
    message: `Submission graded for ${info.assignmentTitle}`,
    meta: { score: Math.round(score), assignmentId: String(info.assignmentId) },
  });

  return res.json({ message: "Graded" });
}

module.exports = { submit, listByAssignment, mySubmission, listMine, grade };
