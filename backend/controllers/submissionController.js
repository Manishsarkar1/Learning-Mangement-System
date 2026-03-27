const mongoose = require("mongoose");

const { Submission } = require("../models/Submission");
const { Assignment } = require("../models/Assignment");
const { Course } = require("../models/Course");
const { Notification } = require("../models/Notification");

async function loadAssignmentAndCourse(assignmentId) {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) {
    const err = new Error("Assignment not found");
    err.status = 404;
    throw err;
  }
  const course = await Course.findById(assignment.course).lean();
  if (!course) {
    const err = new Error("Course not found");
    err.status = 404;
    throw err;
  }
  return { assignment, course };
}

function isStudentEnrolled(course, userId) {
  return (course.students || []).some((id) => String(id) === String(userId));
}

async function submit(req, res) {
  const assignmentId = String(req.body && req.body.assignmentId ? req.body.assignmentId : "");
  const text = req.body && typeof req.body.text === "string" ? req.body.text : "";

  if (!mongoose.isValidObjectId(assignmentId)) return res.status(400).json({ message: "Invalid assignmentId" });
  if (!text && !req.file) return res.status(400).json({ message: "Provide text or a file" });

  const { assignment, course } = await loadAssignmentAndCourse(assignmentId);
  if (!isStudentEnrolled(course, req.user.id) && req.user.role !== "admin") {
    return res.status(403).json({ message: "You are not enrolled in this course" });
  }

  const payload = {
    assignment: assignment._id,
    course: course._id,
    student: req.user.id,
    text: text ? String(text).slice(0, 20000) : "",
    submittedAt: new Date(),
  };

  if (req.file) {
    payload.file = {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `uploads/submissions/${req.file.filename}`,
    };
  }

  try {
    const row = await Submission.create(payload);

    // Notify instructor
    await Notification.create({
      user: course.instructor,
      type: "submission_created",
      message: `New submission for "${assignment.title}"`,
      meta: { courseId: String(course._id), assignmentId: String(assignment._id), submissionId: String(row._id) },
    });

    return res.status(201).json({ message: "Submitted", submission: { id: String(row._id) } });
  } catch (e) {
    if (e && e.code === 11000) return res.status(409).json({ message: "You already submitted this assignment" });
    throw e;
  }
}

async function listByAssignment(req, res) {
  const assignmentId = String(req.params.assignmentId || "");
  if (!mongoose.isValidObjectId(assignmentId)) return res.status(400).json({ message: "Invalid assignmentId" });

  const { assignment, course } = await loadAssignmentAndCourse(assignmentId);
  const isAdmin = req.user.role === "admin";
  const isOwner = req.user.role === "instructor" && String(course.instructor) === String(req.user.id);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  const rows = await Submission.find({ assignment: assignmentId })
    .sort({ submittedAt: -1 })
    .populate("student", "name email")
    .lean();

  return res.json(
    rows.map((s) => ({
      id: String(s._id),
      assignmentId: String(s.assignment),
      student: s.student ? { id: String(s.student._id), name: s.student.name, email: s.student.email } : null,
      text: s.text || "",
      file: s.file || null,
      submittedAt: s.submittedAt,
      grade: s.grade || null,
    }))
  );
}

async function mySubmission(req, res) {
  const assignmentId = String(req.query.assignmentId || "");
  if (!mongoose.isValidObjectId(assignmentId)) return res.status(400).json({ message: "Invalid assignmentId" });

  const row = await Submission.findOne({ assignment: assignmentId, student: req.user.id }).lean();
  if (!row) return res.status(404).json({ message: "Submission not found" });
  return res.json({
    id: String(row._id),
    assignmentId: String(row.assignment),
    text: row.text || "",
    file: row.file || null,
    submittedAt: row.submittedAt,
    grade: row.grade || null,
  });
}

async function grade(req, res) {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid submissionId" });

  const score = req.body && req.body.score !== undefined ? Number(req.body.score) : NaN;
  const feedback = req.body && typeof req.body.feedback === "string" ? req.body.feedback : "";
  if (Number.isNaN(score) || score < 0 || score > 100) return res.status(400).json({ message: "Score must be 0-100" });

  const submission = await Submission.findById(id).lean();
  if (!submission) return res.status(404).json({ message: "Submission not found" });

  const { assignment, course } = await loadAssignmentAndCourse(String(submission.assignment));
  const isAdmin = req.user.role === "admin";
  const isOwner = req.user.role === "instructor" && String(course.instructor) === String(req.user.id);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  await Submission.updateOne(
    { _id: id },
    { $set: { grade: { score, feedback: String(feedback).slice(0, 5000), gradedBy: req.user.id, gradedAt: new Date() } } }
  );

  await Notification.create({
    user: submission.student,
    type: "grade_posted",
    message: `Graded: "${assignment.title}" (${score}/100)`,
    meta: { courseId: String(course._id), assignmentId: String(assignment._id), submissionId: String(id) },
  });

  return res.json({ message: "Graded" });
}

module.exports = { submit, listByAssignment, mySubmission, grade };
