const express = require("express");

const { createAssignment, listAssignmentsByCourse, getAssignment } = require("../controllers/assignmentController");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");

const router = express.Router();

router.post("/", requireAuth, requireRole(["instructor", "admin"]), (req, res, next) =>
  Promise.resolve(createAssignment(req, res)).catch(next)
);
router.get("/course/:courseId", requireAuth, (req, res, next) => Promise.resolve(listAssignmentsByCourse(req, res)).catch(next));
router.get("/:id", requireAuth, (req, res, next) => Promise.resolve(getAssignment(req, res)).catch(next));

module.exports = router;

