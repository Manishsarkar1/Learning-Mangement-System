const express = require("express");

const { register, login, me } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", (req, res, next) => Promise.resolve(register(req, res)).catch(next));
router.post("/login", (req, res, next) => Promise.resolve(login(req, res)).catch(next));
router.get("/me", requireAuth, (req, res, next) => Promise.resolve(me(req, res)).catch(next));

module.exports = router;

