const mongoose = require("mongoose");

const { Assignment } = require("../models/Assignment");
const { Course } = require("../models/Course");
const { Notification } = require("../models/Notification");

async function ensureCourseAccess({ courseId, user }) {
  const course = await Course.findById(courseId).lean();
  if (!course) {
    const err = new Error("Course not found");
    err.status = 404;
    throw err;
  }

  const isAdmin = user.role === "admin";
  const isOwner = user.role === "instructor" && String(course.instructor) === String(user.id);
  const isEnrolled = user.role === "student" && (course.students || []).some((id) => String(id) === String(user.id));

  return { course, isAdmin, isOwner, isEnrolled };
}

async function createAssignment(req, res) {
  const courseId = String(req.body && req.body.courseId ? req.body.courseId : "");
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const description = String(req.body && req.body.description ? req.body.description : "").trim();
  const dueDateRaw = req.body ? req.body.dueDate : null;

  if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid courseId" });
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!description) return res.status(400).json({ message: "Description is required" });

  const dueDate = new Date(dueDateRaw);
  if (!dueDateRaw || Number.isNaN(dueDate.getTime())) return res.status(400).json({ message: "Valid dueDate is required" });

  const { course, isAdmin, isOwner } = await ensureCourseAccess({ courseId, user: req.user });
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  const assignment = await Assignment.create({
    course: course._id,
    title,
    description,
    dueDate,
    createdBy: req.user.id,
  });

  // Basic notifications: push to enrolled students
  const students = Array.isArray(course.students) ? course.students : [];
  if (students.length > 0) {
    await Notification.insertMany(
      students.map((studentId) => ({
        user: studentId,
        type: "assignment_created",
        message: `New assignment: ${title}`,
        meta: { courseId: String(course._id), assignmentId: String(assignment._id) },
      }))
    );
  }

  return res.status(201).json({ message: "Assignment created", assignment: { id: String(assignment._id) } });
}

async function listAssignmentsByCourse(req, res) {
  const courseId = String(req.params.courseId || "");
  if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid courseId" });

  const { isAdmin, isOwner, isEnrolled } = await ensureCourseAccess({ courseId, user: req.user });
  if (!isAdmin && !isOwner && !isEnrolled) return res.status(403).json({ message: "Forbidden" });

  const rows = await Assignment.find({ course: courseId }).sort({ dueDate: 1 }).lean();
  return res.json(
    rows.map((a) => ({
      id: String(a._id),
      courseId: String(a.course),
      title: a.title,
      description: a.description,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }))
  );
}

async function getAssignment(req, res) {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid assignmentId" });

  const assignment = await Assignment.findById(id).lean();
  if (!assignment) return res.status(404).json({ message: "Assignment not found" });

  const { isAdmin, isOwner, isEnrolled } = await ensureCourseAccess({ courseId: String(assignment.course), user: req.user });
  if (!isAdmin && !isOwner && !isEnrolled) return res.status(403).json({ message: "Forbidden" });

  return res.json({
    id: String(assignment._id),
    courseId: String(assignment.course),
    title: assignment.title,
    description: assignment.description,
    dueDate: assignment.dueDate,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  });
}

module.exports = { createAssignment, listAssignmentsByCourse, getAssignment };

