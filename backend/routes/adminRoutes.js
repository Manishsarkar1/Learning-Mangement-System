const express = require("express");

const { listUsers, createUser, deleteUser, analytics, listCourses, deleteCourse } = require("../controllers/adminController");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");

const router = express.Router();

router.use(requireAuth, requireRole(["admin"]));

router.get("/users", (req, res, next) => Promise.resolve(listUsers(req, res)).catch(next));
router.post("/users", (req, res, next) => Promise.resolve(createUser(req, res)).catch(next));
router.delete("/users/:id", (req, res, next) => Promise.resolve(deleteUser(req, res)).catch(next));

router.get("/analytics", (req, res, next) => Promise.resolve(analytics(req, res)).catch(next));

router.get("/courses", (req, res, next) => Promise.resolve(listCourses(req, res)).catch(next));
router.delete("/courses/:id", (req, res, next) => Promise.resolve(deleteCourse(req, res)).catch(next));

module.exports = router;

