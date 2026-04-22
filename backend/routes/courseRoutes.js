const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const {
  listCourses,
  createCourse,
  enroll,
  enrollLegacy,
  myCourses,
  getCourse,
  getCourseProgress,
  createDiscussionThread,
  createDiscussionReply,
  deleteDiscussionThread,
  deleteDiscussionReply,
  markLessonComplete,
  markLessonIncomplete,
  addMaterial,
} = require("../controllers/courseController");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const uploadDir = path.join(__dirname, "..", "..", "uploads", "materials");
ensureDir(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get("/", (req, res, next) => Promise.resolve(listCourses(req, res)).catch(next));
router.get("/my", requireAuth, (req, res, next) => Promise.resolve(myCourses(req, res)).catch(next));
router.get("/:courseId/progress", requireAuth, (req, res, next) => Promise.resolve(getCourseProgress(req, res)).catch(next));
router.post("/:courseId/materials/:materialId/progress", requireAuth, requireRole(["student", "admin"]), (req, res, next) =>
  Promise.resolve(markLessonComplete(req, res)).catch(next)
);
router.delete("/:courseId/materials/:materialId/progress", requireAuth, requireRole(["student", "admin"]), (req, res, next) =>
  Promise.resolve(markLessonIncomplete(req, res)).catch(next)
);
router.get("/:id", requireAuth, (req, res, next) => Promise.resolve(getCourse(req, res)).catch(next));

router.post("/", requireAuth, requireRole(["instructor", "admin"]), requirePermission("create_courses"), (req, res, next) =>
  Promise.resolve(createCourse(req, res)).catch(next)
);

// Back-compat for existing demo UI
router.post("/create", requireAuth, requireRole(["instructor", "admin"]), requirePermission("create_courses"), (req, res, next) =>
  Promise.resolve(createCourse(req, res)).catch(next)
);
router.post("/enroll", requireAuth, requireRole(["student", "admin"]), (req, res, next) =>
  Promise.resolve(enrollLegacy(req, res)).catch(next)
);

router.post("/:courseId/enroll", requireAuth, requireRole(["student", "admin"]), (req, res, next) =>
  Promise.resolve(enroll(req, res)).catch(next)
);

router.post("/:courseId/discussions", requireAuth, requireRole(["student", "faculty", "instructor", "admin"]), (req, res, next) =>
  Promise.resolve(createDiscussionThread(req, res)).catch(next)
);

router.post("/:courseId/discussions/:threadId/replies", requireAuth, requireRole(["student", "faculty", "instructor", "admin"]), (req, res, next) =>
  Promise.resolve(createDiscussionReply(req, res)).catch(next)
);
router.delete("/:courseId/discussions/:threadId", requireAuth, requireRole(["student", "faculty", "instructor", "admin"]), (req, res, next) =>
  Promise.resolve(deleteDiscussionThread(req, res)).catch(next)
);
router.delete(
  "/:courseId/discussions/:threadId/replies/:replyId",
  requireAuth,
  requireRole(["student", "faculty", "instructor", "admin"]),
  (req, res, next) => Promise.resolve(deleteDiscussionReply(req, res)).catch(next)
);

router.post("/:courseId/materials", requireAuth, requireRole(["faculty", "instructor", "admin"]), upload.single("file"), requirePermission("create_courses"), (req, res, next) =>
  Promise.resolve(addMaterial(req, res)).catch(next)
);

module.exports = router;
