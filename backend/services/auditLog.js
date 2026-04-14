const db = require("../config/db");

async function writeAuditLog({ actorUserId = null, action, entityType, entityId = null, message, meta = null }) {
  if (!action || !entityType || !message) return;

  try {
    await db.exec(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, message, meta)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [actorUserId, action, entityType, entityId !== null ? String(entityId) : null, String(message).slice(0, 500), meta ? JSON.stringify(meta) : null]
    );
  } catch {
    // Ignore audit log failures so user-facing actions still succeed.
  }
}

module.exports = { writeAuditLog };
