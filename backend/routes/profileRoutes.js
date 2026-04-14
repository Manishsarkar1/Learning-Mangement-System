const express = require("express");

const { getProfile, updateProfile, changePassword } = require("../controllers/profileController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/", (req, res, next) => Promise.resolve(getProfile(req, res)).catch(next));
router.patch("/", (req, res, next) => Promise.resolve(updateProfile(req, res)).catch(next));
router.post("/password", (req, res, next) => Promise.resolve(changePassword(req, res)).catch(next));

module.exports = router;
