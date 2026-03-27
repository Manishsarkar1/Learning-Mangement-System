const db = require("../config/db");
const { toId } = require("./courseController");

async function listNotifications(req, res) {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
  const unread = String(req.query.unread || "") === "1";
  const userId = toId(req.user.id);

  const rows = await db.query(
    `
    SELECT
      id,
      type,
      message,
      meta,
      read_at AS readAt,
      created_at AS createdAt
    FROM notifications
    WHERE user_id = ?
      ${unread ? "AND read_at IS NULL" : ""}
    ORDER BY created_at DESC
    LIMIT ?
  `,
    [userId, limit]
  );

  return res.json(
    (rows || []).map((n) => ({
      id: String(n.id),
      type: n.type,
      message: n.message,
      meta: n.meta ? (typeof n.meta === "string" ? JSON.parse(n.meta) : n.meta) : {},
      readAt: n.readAt,
      createdAt: n.createdAt,
    }))
  );
}

async function markRead(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid notificationId" });
  const userId = toId(req.user.id);

  const result = await db.exec("UPDATE notifications SET read_at = COALESCE(read_at, NOW(3)) WHERE id = ? AND user_id = ?", [
    id,
    userId,
  ]);

  if (!result || result.affectedRows === 0) return res.status(404).json({ message: "Notification not found" });
  return res.json({ message: "Marked read" });
}

module.exports = { listNotifications, markRead };

