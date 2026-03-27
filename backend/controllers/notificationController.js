const mongoose = require("mongoose");
const { Notification } = require("../models/Notification");

async function listNotifications(req, res) {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
  const unread = String(req.query.unread || "") === "1";

  const filter = { user: req.user.id };
  if (unread) filter.readAt = null;

  const rows = await Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return res.json(
    rows.map((n) => ({
      id: String(n._id),
      type: n.type,
      message: n.message,
      meta: n.meta || {},
      readAt: n.readAt,
      createdAt: n.createdAt,
    }))
  );
}

async function markRead(req, res) {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid notificationId" });

  const row = await Notification.findOne({ _id: id, user: req.user.id });
  if (!row) return res.status(404).json({ message: "Notification not found" });
  if (!row.readAt) {
    row.readAt = new Date();
    await row.save();
  }
  return res.json({ message: "Marked read" });
}

module.exports = { listNotifications, markRead };

