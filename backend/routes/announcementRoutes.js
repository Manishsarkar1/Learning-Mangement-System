const express = require("express");

const { createAnnouncement, listAnnouncements } = require("../controllers/announcementController");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();

router.get("/", requireAuth, (req, res, next) => Promise.resolve(listAnnouncements(req, res)).catch(next));
router.post("/", requireAuth, requireRole(["instructor", "admin"]), requirePermission("post_announcements"), (req, res, next) =>
  Promise.resolve(createAnnouncement(req, res)).catch(next)
);

module.exports = router;
