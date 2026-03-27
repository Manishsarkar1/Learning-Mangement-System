const express = require("express");

const { me } = require("../controllers/dashboardController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/me", requireAuth, (req, res, next) => Promise.resolve(me(req, res)).catch(next));

module.exports = router;
