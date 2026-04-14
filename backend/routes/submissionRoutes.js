const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const { submit, listByAssignment, mySubmission, listMine, grade } = require("../controllers/submissionController");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const uploadDir = path.join(__dirname, "..", "..", "uploads", "submissions");
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
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.post("/", requireAuth, requireRole(["student", "admin"]), upload.single("file"), (req, res, next) =>
  Promise.resolve(submit(req, res)).catch(next)
);
router.get("/assignment/:assignmentId", requireAuth, requireRole(["instructor", "admin"]), (req, res, next) =>
  Promise.resolve(listByAssignment(req, res)).catch(next)
);
router.get("/my", requireAuth, requireRole(["student", "admin"]), (req, res, next) => Promise.resolve(mySubmission(req, res)).catch(next));
router.get("/mine", requireAuth, requireRole(["student", "admin"]), (req, res, next) => Promise.resolve(listMine(req, res)).catch(next));
router.patch("/:id/grade", requireAuth, requireRole(["instructor", "admin"]), requirePermission("grade_submissions"), (req, res, next) =>
  Promise.resolve(grade(req, res)).catch(next)
);

module.exports = router;
