const mongoose = require("mongoose");

const { Course } = require("../models/Course");
const { User } = require("../models/User");

function toCourseDto(course) {
  return {
    id: String(course._id),
    title: course.title,
    description: course.description,
    instructorId: course.instructor ? String(course.instructor._id || course.instructor) : null,
    instructorName: course.instructor && course.instructor.name ? course.instructor.name : undefined,
    studentCount: Array.isArray(course.students) ? course.students.length : 0,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

async function listCourses(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const filter = q ? { $text: { $search: q } } : {};
  const rows = await Course.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("instructor", "name")
    .lean();

  return res.json(rows.map(toCourseDto));
}

async function createCourse(req, res) {
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const description = String(req.body && req.body.description ? req.body.description : "").trim();
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!description) return res.status(400).json({ message: "Description is required" });

  const instructor = await User.findById(req.user.id).lean();
  if (!instructor) return res.status(404).json({ message: "User not found" });

  const course = await Course.create({ title, description, instructor: instructor._id, students: [], materials: [] });
  return res.status(201).json({ message: "Course created", course: { id: String(course._id) } });
}

async function enroll(req, res) {
  const courseId = req.params.courseId ? String(req.params.courseId) : null;
  if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid courseId" });

  const course = await Course.findById(courseId);
  if (!course) return res.status(404).json({ message: "Course not found" });

  const studentId = req.user.id;
  const already = course.students.some((id) => String(id) === String(studentId));
  if (!already) course.students.push(studentId);
  await course.save();

  return res.json({ message: "Enrolled", course: { id: String(course._id) } });
}

async function enrollLegacy(req, res) {
  const courseId = req.body && req.body.course_id ? String(req.body.course_id) : "";
  req.params.courseId = courseId;
  return enroll(req, res);
}

async function myCourses(req, res) {
  if (req.user.role === "student") {
    const rows = await Course.find({ students: req.user.id }).populate("instructor", "name").lean();
    return res.json(rows.map(toCourseDto));
  }

  if (req.user.role === "instructor") {
    const rows = await Course.find({ instructor: req.user.id }).populate("instructor", "name").lean();
    return res.json(rows.map(toCourseDto));
  }

  const rows = await Course.find({}).populate("instructor", "name").lean();
  return res.json(rows.map(toCourseDto));
}

async function getCourse(req, res) {
  const courseId = String(req.params.id || "");
  if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid courseId" });

  const course = await Course.findById(courseId).populate("instructor", "name email role").lean();
  if (!course) return res.status(404).json({ message: "Course not found" });

  const isAdmin = req.user && req.user.role === "admin";
  const isInstructorOwner = req.user && req.user.role === "instructor" && String(course.instructor._id) === String(req.user.id);
  const isEnrolled = req.user && req.user.role === "student" && (course.students || []).some((id) => String(id) === String(req.user.id));

  const base = {
    id: String(course._id),
    title: course.title,
    description: course.description,
    instructor: course.instructor
      ? { id: String(course.instructor._id), name: course.instructor.name, email: course.instructor.email }
      : null,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };

  if (!isAdmin && !isInstructorOwner && !isEnrolled) {
    return res.json({ ...base, materials: [], studentCount: (course.students || []).length });
  }

  return res.json({
    ...base,
    materials: course.materials || [],
    students: isAdmin || isInstructorOwner ? course.students || [] : undefined,
    studentCount: (course.students || []).length,
  });
}

async function addMaterial(req, res) {
  const courseId = String(req.params.courseId || "");
  if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid courseId" });

  const type = String(req.body && req.body.type ? req.body.type : "").trim().toLowerCase();
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const url = String(req.body && req.body.url ? req.body.url : "").trim();

  if (!["pdf", "video", "link"].includes(type)) return res.status(400).json({ message: "Invalid material type" });
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!url) return res.status(400).json({ message: "URL is required" });

  const course = await Course.findById(courseId);
  if (!course) return res.status(404).json({ message: "Course not found" });

  const isAdmin = req.user.role === "admin";
  const isOwner = String(course.instructor) === String(req.user.id);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  course.materials.push({ type, title, url, uploadedBy: req.user.id });
  await course.save();
  return res.status(201).json({ message: "Material added" });
}

module.exports = {
  listCourses,
  createCourse,
  enroll,
  enrollLegacy,
  myCourses,
  getCourse,
  addMaterial,
};

