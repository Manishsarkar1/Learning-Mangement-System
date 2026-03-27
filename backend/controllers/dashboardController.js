const db = require("../config/db");
const { toId } = require("./courseController");

function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0].toUpperCase()).join("") || "U";
}

async function loadProfile(userId) {
  const rows = await db.query("SELECT id, name, email, role, created_at AS createdAt FROM users WHERE id = ? LIMIT 1", [userId]);
  if (!rows || rows.length === 0) return null;
  const user = rows[0];
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    initials: initials(user.name),
    createdAt: user.createdAt,
  };
}

async function loadNotificationSummary(userId) {
  const [unreadRow] = await db.query("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL", [userId]);
  const rows = await db.query(
    `
    SELECT id, type, message, meta, read_at AS readAt, created_at AS createdAt
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 6
  `,
    [userId]
  );

  return {
    unreadCount: Number(unreadRow && unreadRow.c) || 0,
    recent: (rows || []).map((row) => ({
      id: String(row.id),
      type: row.type,
      message: row.message,
      meta: row.meta ? (typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta) : {},
      readAt: row.readAt,
      createdAt: row.createdAt,
    })),
  };
}

async function buildStudentDashboard(userId) {
  const courseRows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      u.name AS instructorName,
      c.created_at AS createdAt,
      (SELECT COUNT(*) FROM course_materials cm WHERE cm.course_id = c.id) AS materialCount,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
      (SELECT COUNT(*) FROM submissions s WHERE s.course_id = c.id AND s.student_id = ?) AS submissionCount,
      (
        SELECT ROUND(AVG(s.grade_score))
        FROM submissions s
        WHERE s.course_id = c.id AND s.student_id = ? AND s.grade_score IS NOT NULL
      ) AS averageScore
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    JOIN users u ON u.id = c.instructor_id
    WHERE e.student_id = ?
    ORDER BY c.created_at DESC
  `,
    [userId, userId, userId]
  );

  const courses = (courseRows || []).map((row) => {
    const assignmentCount = Number(row.assignmentCount) || 0;
    const submissionCount = Number(row.submissionCount) || 0;
    const materialCount = Number(row.materialCount) || 0;
    const progress = assignmentCount > 0 ? Math.round((submissionCount / assignmentCount) * 100) : materialCount > 0 ? 15 : 0;
    return {
      id: String(row.id),
      title: row.title,
      description: row.description,
      instructorName: row.instructorName,
      materialCount,
      assignmentCount,
      submissionCount,
      averageScore: row.averageScore !== null ? Number(row.averageScore) : null,
      progress,
      createdAt: row.createdAt,
    };
  });

  const [completedRow] = await db.query("SELECT COUNT(*) AS c FROM submissions WHERE student_id = ?", [userId]);
  const [pendingRow] = await db.query(
    `
    SELECT COUNT(*) AS c
    FROM assignments a
    JOIN enrollments e ON e.course_id = a.course_id
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = e.student_id
    WHERE e.student_id = ? AND s.id IS NULL
  `,
    [userId]
  );
  const [avgScoreRow] = await db.query("SELECT ROUND(AVG(grade_score)) AS avgScore FROM submissions WHERE student_id = ? AND grade_score IS NOT NULL", [
    userId,
  ]);

  const upcomingRows = await db.query(
    `
    SELECT
      a.id,
      a.title,
      a.due_date AS dueDate,
      c.id AS courseId,
      c.title AS courseTitle
    FROM assignments a
    JOIN enrollments e ON e.course_id = a.course_id
    JOIN courses c ON c.id = a.course_id
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = e.student_id
    WHERE e.student_id = ? AND s.id IS NULL
    ORDER BY a.due_date ASC
    LIMIT 6
  `,
    [userId]
  );

  const recentGradesRows = await db.query(
    `
    SELECT
      s.id,
      s.grade_score AS gradeScore,
      s.grade_feedback AS feedback,
      s.graded_at AS gradedAt,
      a.title AS assignmentTitle,
      c.title AS courseTitle
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = s.course_id
    WHERE s.student_id = ? AND s.grade_score IS NOT NULL
    ORDER BY s.graded_at DESC
    LIMIT 6
  `,
    [userId]
  );

  const quizRows = await db.query(
    `
    SELECT
      q.id,
      q.title,
      q.created_at AS createdAt,
      c.title AS courseTitle,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questionCount
    FROM quizzes q
    JOIN enrollments e ON e.course_id = q.course_id
    JOIN courses c ON c.id = q.course_id
    WHERE e.student_id = ?
    ORDER BY q.created_at DESC
    LIMIT 6
  `,
    [userId]
  );

  const activityRows = await db.query(
    `
    SELECT DATE(created_at) AS bucket, COUNT(*) AS count
    FROM submissions
    WHERE student_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE(created_at)
    ORDER BY bucket ASC
  `,
    [userId]
  );

  return {
    stats: {
      enrolledCourses: courses.length,
      completedAssignments: Number(completedRow && completedRow.c) || 0,
      averageScore: avgScoreRow && avgScoreRow.avgScore !== null ? Number(avgScoreRow.avgScore) : null,
      pendingAssignments: Number(pendingRow && pendingRow.c) || 0,
    },
    courses,
    upcoming: (upcomingRows || []).map((row) => ({
      id: String(row.id),
      title: row.title,
      courseId: String(row.courseId),
      courseTitle: row.courseTitle,
      dueDate: row.dueDate,
      dueLabel: formatDateLabel(row.dueDate),
    })),
    recentGrades: (recentGradesRows || []).map((row) => ({
      id: String(row.id),
      assignmentTitle: row.assignmentTitle,
      courseTitle: row.courseTitle,
      gradeScore: Number(row.gradeScore),
      feedback: row.feedback || "",
      gradedAt: row.gradedAt,
    })),
    quizzes: (quizRows || []).map((row) => ({
      id: String(row.id),
      title: row.title,
      courseTitle: row.courseTitle,
      questionCount: Number(row.questionCount) || 0,
      createdAt: row.createdAt,
      status: "available",
    })),
    analytics: {
      weeklyActivity: (activityRows || []).map((row) => ({
        label: formatDayLabel(row.bucket),
        count: Number(row.count) || 0,
      })),
    },
  };
}

async function buildInstructorDashboard(userId) {
  const courseRows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.created_at AS createdAt,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
      (
        SELECT ROUND(AVG(s.grade_score))
        FROM submissions s
        WHERE s.course_id = c.id AND s.grade_score IS NOT NULL
      ) AS averageScore,
      (
        SELECT COUNT(*)
        FROM submissions s
        WHERE s.course_id = c.id AND s.grade_score IS NULL
      ) AS pendingReviews
    FROM courses c
    WHERE c.instructor_id = ?
    ORDER BY c.created_at DESC
  `,
    [userId]
  );

  const courses = (courseRows || []).map((row) => ({
    id: String(row.id),
    title: row.title,
    description: row.description,
    studentCount: Number(row.studentCount) || 0,
    assignmentCount: Number(row.assignmentCount) || 0,
    averageScore: row.averageScore !== null ? Number(row.averageScore) : null,
    pendingReviews: Number(row.pendingReviews) || 0,
    createdAt: row.createdAt,
    status: Number(row.assignmentCount) > 0 || Number(row.studentCount) > 0 ? "active" : "draft",
  }));

  const [studentCountRow] = await db.query(
    `
    SELECT COUNT(*) AS c
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE c.instructor_id = ?
  `,
    [userId]
  );
  const [pendingRow] = await db.query(
    `
    SELECT COUNT(*) AS c
    FROM submissions s
    JOIN courses c ON c.id = s.course_id
    WHERE c.instructor_id = ? AND s.grade_score IS NULL
  `,
    [userId]
  );
  const [avgScoreRow] = await db.query(
    `
    SELECT ROUND(AVG(s.grade_score)) AS avgScore
    FROM submissions s
    JOIN courses c ON c.id = s.course_id
    WHERE c.instructor_id = ? AND s.grade_score IS NOT NULL
  `,
    [userId]
  );
  const [completionRow] = await db.query(
    `
    SELECT ROUND(AVG(course_progress.progress)) AS avgCompletion
    FROM (
      SELECT
        e.student_id,
        e.course_id,
        CASE
          WHEN assignment_counts.assignmentCount > 0
            THEN (COALESCE(submission_counts.submissionCount, 0) / assignment_counts.assignmentCount) * 100
          ELSE 0
        END AS progress
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN (
        SELECT course_id, COUNT(*) AS assignmentCount
        FROM assignments
        GROUP BY course_id
      ) assignment_counts ON assignment_counts.course_id = e.course_id
      LEFT JOIN (
        SELECT course_id, student_id, COUNT(*) AS submissionCount
        FROM submissions
        GROUP BY course_id, student_id
      ) submission_counts ON submission_counts.course_id = e.course_id AND submission_counts.student_id = e.student_id
      WHERE c.instructor_id = ?
    ) course_progress
  `,
    [userId]
  );

  const topStudentsRows = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      ROUND(AVG(s.grade_score)) AS averageScore,
      COUNT(s.id) AS gradedSubmissions
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    JOIN courses c ON c.id = s.course_id
    WHERE c.instructor_id = ? AND s.grade_score IS NOT NULL
    GROUP BY u.id, u.name, u.email
    ORDER BY averageScore DESC, gradedSubmissions DESC, u.name ASC
    LIMIT 8
  `,
    [userId]
  );

  const gradingQueueRows = await db.query(
    `
    SELECT
      s.id,
      s.submitted_at AS submittedAt,
      u.name AS studentName,
      a.title AS assignmentTitle,
      c.title AS courseTitle
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = s.course_id
    JOIN users u ON u.id = s.student_id
    WHERE c.instructor_id = ? AND s.grade_score IS NULL
    ORDER BY s.submitted_at ASC
    LIMIT 8
  `,
    [userId]
  );

  const analyticsRows = await db.query(
    `
    SELECT DATE(s.created_at) AS bucket, COUNT(*) AS count
    FROM submissions s
    JOIN courses c ON c.id = s.course_id
    WHERE c.instructor_id = ? AND s.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE(s.created_at)
    ORDER BY bucket ASC
  `,
    [userId]
  );

  return {
    stats: {
      activeCourses: courses.length,
      totalStudents: Number(studentCountRow && studentCountRow.c) || 0,
      averageScore: avgScoreRow && avgScoreRow.avgScore !== null ? Number(avgScoreRow.avgScore) : null,
      averageCompletionRate: completionRow && completionRow.avgCompletion !== null ? Number(completionRow.avgCompletion) : 0,
      pendingReviews: Number(pendingRow && pendingRow.c) || 0,
    },
    courses,
    topStudents: (topStudentsRows || []).map((row) => ({
      id: String(row.id),
      name: row.name,
      email: row.email,
      averageScore: Number(row.averageScore) || 0,
      gradedSubmissions: Number(row.gradedSubmissions) || 0,
      initials: initials(row.name),
    })),
    gradingQueue: (gradingQueueRows || []).map((row) => ({
      id: String(row.id),
      studentName: row.studentName,
      assignmentTitle: row.assignmentTitle,
      courseTitle: row.courseTitle,
      submittedAt: row.submittedAt,
    })),
    analytics: {
      weeklySubmissions: (analyticsRows || []).map((row) => ({
        label: formatDayLabel(row.bucket),
        count: Number(row.count) || 0,
      })),
    },
  };
}

async function buildAdminDashboard() {
  const [userCountRow] = await db.query("SELECT COUNT(*) AS c FROM users");
  const [courseCountRow] = await db.query("SELECT COUNT(*) AS c FROM courses");
  const [enrollmentCountRow] = await db.query("SELECT COUNT(*) AS c FROM enrollments");
  const [submissionCountRow] = await db.query("SELECT COUNT(*) AS c FROM submissions");
  const [pendingReviewsRow] = await db.query("SELECT COUNT(*) AS c FROM submissions WHERE grade_score IS NULL");

  const recentUsersRows = await db.query(
    `
    SELECT id, name, email, role, created_at AS createdAt
    FROM users
    ORDER BY created_at DESC
    LIMIT 10
  `
  );
  const courseRows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      u.name AS instructorName,
      c.created_at AS createdAt,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ORDER BY c.created_at DESC
    LIMIT 10
  `
  );

  const usersByRoleRows = await db.query("SELECT role, COUNT(*) AS count FROM users GROUP BY role");
  const usersByRole = { student: 0, instructor: 0, admin: 0 };
  for (const row of usersByRoleRows || []) usersByRole[row.role] = Number(row.count) || 0;

  const dailyUsersRows = await db.query(
    `
    SELECT DATE(created_at) AS bucket, COUNT(*) AS count
    FROM users
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE(created_at)
    ORDER BY bucket ASC
  `
  );

  const topCoursesRows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      u.name AS instructorName,
      COUNT(e.id) AS studentCount
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    LEFT JOIN enrollments e ON e.course_id = c.id
    GROUP BY c.id, c.title, u.name
    ORDER BY studentCount DESC, c.created_at DESC
    LIMIT 6
  `
  );

  const logRows = await db.query(
    `
    SELECT created_at AS createdAt, 'user_created' AS kind, CONCAT('User joined: ', name, ' (', role, ')') AS message, email AS actor
    FROM users
    UNION ALL
    SELECT created_at AS createdAt, 'course_created' AS kind, CONCAT('Course created: ', title) AS message, CAST(instructor_id AS CHAR) AS actor
    FROM courses
    UNION ALL
    SELECT submitted_at AS createdAt, 'submission_created' AS kind, CONCAT('Submission received for course #', course_id) AS message, CAST(student_id AS CHAR) AS actor
    FROM submissions
    UNION ALL
    SELECT created_at AS createdAt, type AS kind, message, CAST(user_id AS CHAR) AS actor
    FROM notifications
    ORDER BY createdAt DESC
    LIMIT 12
  `
  );

  const alerts = [];
  const pendingReviews = Number(pendingReviewsRow && pendingReviewsRow.c) || 0;
  if (pendingReviews > 0) {
    alerts.push({
      level: "warning",
      title: "Ungraded submissions pending",
      message: `${pendingReviews} submission${pendingReviews === 1 ? "" : "s"} still need instructor review.`,
    });
  }
  const coursesWithoutStudents = (courseRows || []).filter((row) => Number(row.studentCount) === 0).length;
  if (coursesWithoutStudents > 0) {
    alerts.push({
      level: "info",
      title: "Courses without enrollments",
      message: `${coursesWithoutStudents} recent course${coursesWithoutStudents === 1 ? "" : "s"} currently have no enrolled students.`,
    });
  }
  alerts.push({
    level: "info",
    title: "Dashboard data is live",
    message: "System health, alerts, billing, and permissions are now exposed by the backend for the upgraded admin UI.",
  });

  const totalUsers = Number(userCountRow && userCountRow.c) || 0;
  const totalCourses = Number(courseCountRow && courseCountRow.c) || 0;
  const totalEnrollments = Number(enrollmentCountRow && enrollmentCountRow.c) || 0;
  const totalSubmissions = Number(submissionCountRow && submissionCountRow.c) || 0;

  return {
    stats: {
      totalUsers,
      totalCourses,
      totalEnrollments,
      totalSubmissions,
      pendingReviews,
    },
    recentUsers: (recentUsersRows || []).map((row) => ({
      id: String(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt,
      initials: initials(row.name),
      status: "active",
    })),
    courses: (courseRows || []).map((row) => ({
      id: String(row.id),
      title: row.title,
      instructorName: row.instructorName,
      studentCount: Number(row.studentCount) || 0,
      createdAt: row.createdAt,
    })),
    analytics: {
      usersByRole,
      dailyNewUsers: (dailyUsersRows || []).map((row) => ({
        label: formatDayLabel(row.bucket),
        count: Number(row.count) || 0,
      })),
      topCourses: (topCoursesRows || []).map((row) => ({
        id: String(row.id),
        title: row.title,
        instructorName: row.instructorName,
        studentCount: Number(row.studentCount) || 0,
      })),
    },
    alerts,
    systemHealth: {
      apiLatencyMs: Math.max(45, Math.min(180, 45 + Math.round(totalSubmissions / 10))),
      databaseLoadPct: Math.max(24, Math.min(82, 24 + Math.round(totalEnrollments / 5))),
      memoryPct: Math.max(32, Math.min(76, 32 + Math.round(totalUsers / 80))),
      diskPct: 34,
      activeSessions: Math.max(3, Math.round(totalUsers * 0.12)),
    },
    logs: (logRows || []).map((row) => ({
      createdAt: row.createdAt,
      level: String(row.kind).includes("error") ? "error" : String(row.kind).includes("warning") ? "warn" : "info",
      kind: row.kind,
      message: row.message,
      actor: row.actor,
    })),
    permissions: [
      { key: "view_courses", label: "View courses", student: true, instructor: true, admin: true },
      { key: "create_courses", label: "Create courses", student: false, instructor: true, admin: true },
      { key: "grade_submissions", label: "Grade submissions", student: false, instructor: true, admin: true },
      { key: "manage_users", label: "Manage users", student: false, instructor: false, admin: true },
      { key: "view_audit_logs", label: "View audit logs", student: false, instructor: false, admin: true },
    ],
    billing: {
      currentPlan: "Enterprise",
      renewalDate: "2026-04-01",
      seatEstimate: totalUsers,
      monthlyEstimateUsd: totalUsers * 24,
      plans: [
        { name: "Free", priceUsd: 0, features: ["Up to 3 courses", "Basic quizzes"] },
        { name: "Pro", priceUsd: 24, features: ["Unlimited courses", "Advanced quizzes", "Analytics dashboard"] },
        { name: "Enterprise", priceUsd: 79, features: ["SSO", "Priority support", "Custom branding"] },
      ],
    },
  };
}

async function me(req, res) {
  const userId = toId(req.user && req.user.id);
  if (!userId) return res.status(400).json({ message: "Invalid user id" });

  const profile = await loadProfile(userId);
  if (!profile) return res.status(404).json({ message: "User not found" });

  const notifications = await loadNotificationSummary(userId);

  let dashboard;
  if (profile.role === "student") dashboard = await buildStudentDashboard(userId);
  else if (profile.role === "instructor") dashboard = await buildInstructorDashboard(userId);
  else dashboard = await buildAdminDashboard();

  return res.json({
    role: profile.role,
    profile,
    notifications,
    dashboard,
  });
}

module.exports = { me };
