const express = require("express");

const {
  listCourses,
  createCourse,
  enroll,
  enrollLegacy,
  myCourses,
  getCourse,
  addMaterial,
} = require("../controllers/courseController");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();

router.get("/", (req, res, next) => Promise.resolve(listCourses(req, res)).catch(next));
router.get("/my", requireAuth, (req, res, next) => Promise.resolve(myCourses(req, res)).catch(next));
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

router.post("/:courseId/materials", requireAuth, requireRole(["instructor", "admin"]), requirePermission("create_courses"), (req, res, next) =>
  Promise.resolve(addMaterial(req, res)).catch(next)
);

module.exports = router;
