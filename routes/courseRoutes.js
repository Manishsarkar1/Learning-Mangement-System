const express = require("express");
const { createCourse, getCourses, enroll } = require("../controllers/courseController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/create", auth, createCourse);
router.get("/", getCourses);
router.post("/enroll", auth, enroll);

module.exports = router;