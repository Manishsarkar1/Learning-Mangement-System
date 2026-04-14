const { roleHasPermission } = require("../services/permissions");

function requirePermission(permissionKey) {
  return async function permissionMiddleware(req, res, next) {
    if (!req.user || !req.user.role) return res.status(401).json({ message: "Missing auth context" });
    const allowed = await roleHasPermission(req.user.role, permissionKey);
    if (!allowed) return res.status(403).json({ message: "Permission denied" });
    return next();
  };
}

module.exports = { requirePermission };
