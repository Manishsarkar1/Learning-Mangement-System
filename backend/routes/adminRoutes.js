const express = require("express");

const {
  listUsers,
  createUser,
  deleteUser,
  analytics,
  listCourses,
  deleteCourse,
  getPermissionsController,
  updatePermissionController,
  listAuditLogs,
} = require("../controllers/adminController");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();

router.use(requireAuth, requireRole(["admin"]));

router.get("/users", requirePermission("manage_users"), (req, res, next) => Promise.resolve(listUsers(req, res)).catch(next));
router.post("/users", requirePermission("manage_users"), (req, res, next) => Promise.resolve(createUser(req, res)).catch(next));
router.delete("/users/:id", requirePermission("manage_users"), (req, res, next) => Promise.resolve(deleteUser(req, res)).catch(next));

router.get("/analytics", (req, res, next) => Promise.resolve(analytics(req, res)).catch(next));

router.get("/courses", (req, res, next) => Promise.resolve(listCourses(req, res)).catch(next));
router.delete("/courses/:id", (req, res, next) => Promise.resolve(deleteCourse(req, res)).catch(next));
router.get("/permissions", (req, res, next) => Promise.resolve(getPermissionsController(req, res)).catch(next));
router.put("/permissions/:key", (req, res, next) => Promise.resolve(updatePermissionController(req, res)).catch(next));
router.get("/logs", requirePermission("view_audit_logs"), (req, res, next) => Promise.resolve(listAuditLogs(req, res)).catch(next));

module.exports = router;
