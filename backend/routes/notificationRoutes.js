const express = require("express");

const { listNotifications, markRead } = require("../controllers/notificationController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, (req, res, next) => Promise.resolve(listNotifications(req, res)).catch(next));
router.post("/:id/read", requireAuth, (req, res, next) => Promise.resolve(markRead(req, res)).catch(next));

module.exports = router;

