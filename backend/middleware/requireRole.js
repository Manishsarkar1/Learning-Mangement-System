const { matchesAllowedRole } = require("../utils/roles");

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    const role = req.user && req.user.role ? req.user.role : null;
    if (!role) return res.status(401).json({ message: "Unauthorized" });
    if (!matchesAllowedRole(role, allowed)) return res.status(403).json({ message: "Forbidden" });
    return next();
  };
}

module.exports = { requireRole };
