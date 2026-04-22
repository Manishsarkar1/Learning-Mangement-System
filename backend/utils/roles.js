function normalizeRole(role) {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  if (value === "faculty") return "instructor";
  return value;
}

function isInstructorLike(role) {
  return normalizeRole(role) === "instructor";
}

function matchesAllowedRole(userRole, allowedRoles) {
  const normalizedUserRole = normalizeRole(userRole);
  return (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).some((allowedRole) => normalizeRole(allowedRole) === normalizedUserRole);
}

module.exports = {
  normalizeRole,
  isInstructorLike,
  matchesAllowedRole,
};
