const express = require("express");

const {
  createQuiz,
  addQuestion,
  listByCourse,
  getQuiz,
  submitAttempt,
  listMyAttempts,
  listAttemptsByQuiz,
} = require("../controllers/quizController");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();

router.get("/course/:courseId", requireAuth, (req, res, next) => Promise.resolve(listByCourse(req, res)).catch(next));
router.get("/my/attempts", requireAuth, requireRole(["student", "admin"]), requirePermission("attempt_quizzes"), (req, res, next) =>
  Promise.resolve(listMyAttempts(req, res)).catch(next)
);
router.post("/", requireAuth, requireRole(["instructor", "admin"]), requirePermission("create_quizzes"), (req, res, next) =>
  Promise.resolve(createQuiz(req, res)).catch(next)
);
router.post("/create", requireAuth, requireRole(["instructor", "admin"]), requirePermission("create_quizzes"), (req, res, next) =>
  Promise.resolve(createQuiz(req, res)).catch(next)
);
router.post("/:id/questions", requireAuth, requireRole(["instructor", "admin"]), requirePermission("create_quizzes"), (req, res, next) =>
  Promise.resolve(addQuestion(req, res)).catch(next)
);
router.post("/question", requireAuth, requireRole(["instructor", "admin"]), requirePermission("create_quizzes"), (req, res, next) =>
  Promise.resolve(addQuestion(req, res)).catch(next)
);
router.post("/:id/attempt", requireAuth, requireRole(["student", "admin"]), requirePermission("attempt_quizzes"), (req, res, next) =>
  Promise.resolve(submitAttempt(req, res)).catch(next)
);
router.get("/:id/attempts", requireAuth, requireRole(["instructor", "admin"]), (req, res, next) =>
  Promise.resolve(listAttemptsByQuiz(req, res)).catch(next)
);
router.get("/:id", requireAuth, (req, res, next) => Promise.resolve(getQuiz(req, res)).catch(next));

module.exports = router;
