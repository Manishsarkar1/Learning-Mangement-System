const db = require("../config/db");
const { toId } = require("./courseController");
const { listPermissions } = require("../services/permissions");

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
  const rows = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.created_at AS createdAt,
      p.title,
      p.bio,
      p.phone,
      p.timezone,
      p.avatar_url AS avatarUrl
    FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
  `,
    [userId]
  );
  if (!rows || rows.length === 0) return null;
  const user = rows[0];
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    initials: initials(user.name),
    createdAt: user.createdAt,
    title: user.title || "",
    bio: user.bio || "",
    phone: user.phone || "",
    timezone: user.timezone || "",
    avatarUrl: user.avatarUrl || "",
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
    LIMIT 8
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

async function loadAnnouncementsForRole(userId, role) {
  let rows;
  if (role === "admin") {
    rows = await db.query(
      `
      SELECT a.id, a.course_id AS courseId, a.audience, a.title, a.body, a.created_at AS createdAt, c.title AS courseTitle, u.name AS authorName
      FROM announcements a
      LEFT JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.author_id
      ORDER BY a.created_at DESC
      LIMIT 6
    `
    );
  } else if (role === "instructor") {
    rows = await db.query(
      `
      SELECT a.id, a.course_id AS courseId, a.audience, a.title, a.body, a.created_at AS createdAt, c.title AS courseTitle, u.name AS authorName
      FROM announcements a
      LEFT JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.author_id
      WHERE (a.course_id IS NULL AND a.audience IN ('all', 'instructors'))
         OR c.instructor_id = ?
      ORDER BY a.created_at DESC
      LIMIT 6
    `,
      [userId]
    );
  } else {
    rows = await db.query(
      `
      SELECT a.id, a.course_id AS courseId, a.audience, a.title, a.body, a.created_at AS createdAt, c.title AS courseTitle, u.name AS authorName
      FROM announcements a
      LEFT JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.author_id
      WHERE (a.course_id IS NULL AND a.audience IN ('all', 'students'))
         OR EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.course_id = a.course_id AND e.student_id = ?
         )
      ORDER BY a.created_at DESC
      LIMIT 6
    `,
      [userId]
    );
  }

  return (rows || []).map((row) => ({
    id: String(row.id),
    courseId: row.courseId ? String(row.courseId) : null,
    courseTitle: row.courseTitle || "",
    audience: row.audience,
    title: row.title,
    body: row.body,
    authorName: row.authorName,
    createdAt: row.createdAt,
  }));
}

async function buildStudentDashboard(userId) {
  const courseRows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.category,
      u.name AS instructorName,
      c.created_at AS createdAt,
      (SELECT COUNT(*) FROM course_materials cm WHERE cm.course_id = c.id) AS materialCount,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
      (SELECT COUNT(*) FROM submissions s WHERE s.course_id = c.id AND s.student_id = ?) AS submissionCount,
      (
        SELECT ROUND(AVG(s.grade_score))
        FROM submissions s
        WHERE s.course_id = c.id AND s.student_id = ? AND s.grade_score IS NOT NULL
      ) AS averageScore,
      (
        SELECT qa.score
        FROM quiz_attempts qa
        JOIN quizzes q ON q.id = qa.quiz_id
        WHERE q.course_id = c.id AND qa.student_id = ?
        ORDER BY qa.submitted_at DESC
        LIMIT 1
      ) AS latestQuizScore
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    JOIN users u ON u.id = c.instructor_id
    WHERE e.student_id = ?
    ORDER BY c.created_at DESC
  `,
    [userId, userId, userId, userId]
  );

  const courses = (courseRows || []).map((row) => {
    const assignmentCount = Number(row.assignmentCount) || 0;
    const submissionCount = Number(row.submissionCount) || 0;
    return {
      id: String(row.id),
      title: row.title,
      description: row.description,
      category: row.category,
      instructorName: row.instructorName,
      materialCount: Number(row.materialCount) || 0,
      assignmentCount,
      submissionCount,
      averageScore: row.averageScore !== null ? Number(row.averageScore) : null,
      latestQuizScore: row.latestQuizScore !== null ? Number(row.latestQuizScore) : null,
      progress: assignmentCount > 0 ? Math.round((submissionCount / assignmentCount) * 100) : 0,
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
      q.is_published AS isPublished,
      q.time_limit_minutes AS timeLimitMinutes,
      q.created_at AS createdAt,
      c.title AS courseTitle,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questionCount,
      (
        SELECT qa.score
        FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.student_id = ?
        ORDER BY qa.submitted_at DESC
        LIMIT 1
      ) AS latestScore
    FROM quizzes q
    JOIN enrollments e ON e.course_id = q.course_id
    JOIN courses c ON c.id = q.course_id
    WHERE e.student_id = ? AND q.is_published = 1
    ORDER BY q.created_at DESC
    LIMIT 6
  `,
    [userId, userId]
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
      isPublished: Boolean(row.isPublished),
      timeLimitMinutes: row.timeLimitMinutes !== null ? Number(row.timeLimitMinutes) : null,
      questionCount: Number(row.questionCount) || 0,
      latestScore: row.latestScore !== null ? Number(row.latestScore) : null,
      createdAt: row.createdAt,
    })),
    announcements: await loadAnnouncementsForRole(userId, "student"),
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
      c.category,
      c.created_at AS createdAt,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
      (SELECT COUNT(*) FROM announcements an WHERE an.course_id = c.id) AS announcementCount,
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

  const quizzes = await db.query(
    `
    SELECT
      q.id,
      q.title,
      q.is_published AS isPublished,
      q.time_limit_minutes AS timeLimitMinutes,
      c.title AS courseTitle,
      q.created_at AS createdAt,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questionCount,
      (SELECT COALESCE(SUM(qq.marks), 0) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS totalMarks,
      (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) AS attemptCount
    FROM quizzes q
    JOIN courses c ON c.id = q.course_id
    WHERE c.instructor_id = ?
    ORDER BY q.created_at DESC
    LIMIT 6
  `,
    [userId]
  );

  return {
    stats: {
      activeCourses: courseRows.length,
      totalStudents: Number(studentCountRow && studentCountRow.c) || 0,
      averageScore: avgScoreRow && avgScoreRow.avgScore !== null ? Number(avgScoreRow.avgScore) : null,
      pendingReviews: Number(pendingRow && pendingRow.c) || 0,
    },
    courses: (courseRows || []).map((row) => ({
      id: String(row.id),
      title: row.title,
      description: row.description,
      category: row.category,
      studentCount: Number(row.studentCount) || 0,
      assignmentCount: Number(row.assignmentCount) || 0,
      announcementCount: Number(row.announcementCount) || 0,
      averageScore: row.averageScore !== null ? Number(row.averageScore) : null,
      pendingReviews: Number(row.pendingReviews) || 0,
      createdAt: row.createdAt,
    })),
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
    announcements: await loadAnnouncementsForRole(userId, "instructor"),
    quizzes: (quizzes || []).map((row) => ({
      id: String(row.id),
      title: row.title,
      courseTitle: row.courseTitle,
      isPublished: Boolean(row.isPublished),
      timeLimitMinutes: row.timeLimitMinutes !== null ? Number(row.timeLimitMinutes) : null,
      questionCount: Number(row.questionCount) || 0,
      totalMarks: Number(row.totalMarks) || 0,
      attemptCount: Number(row.attemptCount) || 0,
      createdAt: row.createdAt,
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
  const [announcementCountRow] = await db.query("SELECT COUNT(*) AS c FROM announcements");
  const [attemptCountRow] = await db.query("SELECT COUNT(*) AS c FROM quiz_attempts");

  const recentUsersRows = await db.query(
    `
    SELECT id, name, email, role, created_at AS createdAt
    FROM users
    ORDER BY created_at DESC
    LIMIT 10
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
    LIMIT 8
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

  const logRows = await db.query(
    `
    SELECT
      l.id,
      l.action,
      l.message,
      l.created_at AS createdAt,
      u.name AS actorName
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ORDER BY l.created_at DESC
    LIMIT 12
  `
  );

  const alerts = [];
  const pendingReviewsRow = await db.query("SELECT COUNT(*) AS c FROM submissions WHERE grade_score IS NULL");
  const pendingReviews = Number(pendingReviewsRow[0] && pendingReviewsRow[0].c) || 0;
  if (pendingReviews > 0) {
    alerts.push({
      level: "warning",
      title: "Ungraded submissions pending",
      message: `${pendingReviews} submission${pendingReviews === 1 ? "" : "s"} still need instructor review.`,
    });
  }
  alerts.push({
    level: "info",
    title: "Live admin telemetry enabled",
    message: "Analytics, audit logs, role permissions, quizzes, and announcements are backed by the database.",
  });

  return {
    stats: {
      totalUsers: Number(userCountRow && userCountRow.c) || 0,
      totalCourses: Number(courseCountRow && courseCountRow.c) || 0,
      totalEnrollments: Number(enrollmentCountRow && enrollmentCountRow.c) || 0,
      totalSubmissions: Number(submissionCountRow && submissionCountRow.c) || 0,
      totalAnnouncements: Number(announcementCountRow && announcementCountRow.c) || 0,
      totalQuizAttempts: Number(attemptCountRow && attemptCountRow.c) || 0,
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
    logs: (logRows || []).map((row) => ({
      id: String(row.id),
      action: row.action,
      message: row.message,
      actorName: row.actorName || "system",
      createdAt: row.createdAt,
    })),
    permissions: await listPermissions(),
    announcements: await loadAnnouncementsForRole(0, "admin"),
    billing: {
      currentPlan: "Enterprise",
      renewalDate: "2026-05-01",
      seatEstimate: Number(userCountRow && userCountRow.c) || 0,
      monthlyEstimateUsd: (Number(userCountRow && userCountRow.c) || 0) * 24,
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
