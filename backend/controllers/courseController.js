const db = require("../config/db");
const { writeAuditLog } = require("../services/auditLog");
const { isInstructorLike, normalizeRole } = require("../utils/roles");

function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function buildLikeTerm(value) {
  return `%${String(value || "").trim()}%`;
}

function buildCompletionStatus(progressPercentage, totalLessons) {
  if (!totalLessons) return "not_started";
  if (progressPercentage >= 100) return "completed";
  if (progressPercentage > 0) return "in_progress";
  return "not_started";
}

async function getCourseAccess(courseId, user) {
  const rows = await db.query(
    `
    SELECT id, title, instructor_id AS instructorId
    FROM courses
    WHERE id = ?
    LIMIT 1
  `,
    [courseId]
  );
  if (!rows || rows.length === 0) return null;

  const course = rows[0];
  const userId = toId(user && user.id);
  const normalizedRole = normalizeRole(user && user.role);
  const isAdmin = normalizedRole === "admin";
  const isOwner = isInstructorLike(user && user.role) && Number(course.instructorId) === userId;
  const enrolledRows = userId
    ? await db.query("SELECT 1 AS ok FROM enrollments WHERE course_id = ? AND student_id = ? LIMIT 1", [courseId, userId])
    : [];
  const isEnrolled = normalizedRole === "student" && enrolledRows && enrolledRows.length > 0;

  return {
    course,
    userId,
    normalizedRole,
    isAdmin,
    isOwner,
    isEnrolled,
    canView: isAdmin || isOwner || isEnrolled,
  };
}

async function loadCourseDiscussions(courseId) {
  const threads = await db.query(
    `
    SELECT
      t.id,
      t.course_id AS courseId,
      t.author_id AS authorId,
      t.title,
      t.body,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt,
      u.name AS authorName,
      u.role AS authorRole,
      (
        SELECT COUNT(*)
        FROM discussion_replies r
        WHERE r.thread_id = t.id
      ) AS replyCount
    FROM discussion_threads t
    JOIN users u ON u.id = t.author_id
    WHERE t.course_id = ?
    ORDER BY t.updated_at DESC, t.created_at DESC
    LIMIT 30
  `,
    [courseId]
  );

  if (!threads || threads.length === 0) return [];

  const threadIds = threads.map((thread) => thread.id);
  const placeholders = threadIds.map(() => "?").join(", ");
  const replies = await db.query(
    `
    SELECT
      r.id,
      r.thread_id AS threadId,
      r.author_id AS authorId,
      r.body,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt,
      u.name AS authorName,
      u.role AS authorRole
    FROM discussion_replies r
    JOIN users u ON u.id = r.author_id
    WHERE r.thread_id IN (${placeholders})
    ORDER BY r.created_at ASC
  `,
    threadIds
  );

  const repliesByThreadId = new Map();
  for (const reply of replies || []) {
    const key = String(reply.threadId);
    if (!repliesByThreadId.has(key)) repliesByThreadId.set(key, []);
    repliesByThreadId.get(key).push({
      id: String(reply.id),
      threadId: String(reply.threadId),
      body: reply.body,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
      author: {
        id: String(reply.authorId),
        name: reply.authorName,
        role: normalizeRole(reply.authorRole),
      },
    });
  }

  return threads.map((thread) => ({
    id: String(thread.id),
    courseId: String(thread.courseId),
    title: thread.title,
    body: thread.body,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    replyCount: Number(thread.replyCount) || 0,
    author: {
      id: String(thread.authorId),
      name: thread.authorName,
      role: normalizeRole(thread.authorRole),
    },
    replies: repliesByThreadId.get(String(thread.id)) || [],
  }));
}

async function loadCourseProgress(courseId, access, materialsInput) {
  const materials =
    materialsInput ||
    (await db.query(
      `
      SELECT id, type, title, url, uploaded_by AS uploadedBy, created_at AS createdAt
      FROM course_materials
      WHERE course_id = ?
      ORDER BY created_at ASC, id ASC
    `,
      [courseId]
    ));

  const totalLessons = (materials || []).length;

  if (access.normalizedRole === "student" && access.userId) {
    const progressRows = await db.query(
      `
      SELECT material_id AS materialId, completed_at AS completedAt
      FROM lesson_progress
      WHERE course_id = ? AND student_id = ?
    `,
      [courseId, access.userId]
    );

    const progressByMaterial = new Map(
      (progressRows || []).map((row) => [String(row.materialId), row.completedAt])
    );

    const lessons = (materials || []).map((material) => ({
      id: String(material.id),
      title: material.title,
      type: material.type,
      url: material.url,
      createdAt: material.createdAt,
      completed: progressByMaterial.has(String(material.id)),
      completedAt: progressByMaterial.get(String(material.id)) || null,
    }));

    const completedLessons = lessons.filter((lesson) => lesson.completed).length;
    const progressPercentage = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;

    return {
      totalLessons,
      completedLessons,
      pendingLessons: Math.max(0, totalLessons - completedLessons),
      progressPercentage,
      completionStatus: buildCompletionStatus(progressPercentage, totalLessons),
      lessons,
    };
  }

  if (access.isAdmin || access.isOwner) {
    const studentRows = await db.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        e.created_at AS enrolledAt,
        COUNT(DISTINCT lp.material_id) AS completedLessons,
        MAX(lp.completed_at) AS lastCompletedAt
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN lesson_progress lp ON lp.course_id = e.course_id AND lp.student_id = e.student_id
      WHERE e.course_id = ?
      GROUP BY u.id, u.name, u.email, e.created_at
      ORDER BY u.name ASC
    `,
        [courseId]
    );

    const students = (studentRows || []).map((student) => {
      const completedLessons = Number(student.completedLessons) || 0;
      const progressPercentage = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
      return {
        id: String(student.id),
        name: student.name,
        email: student.email,
        enrolledAt: student.enrolledAt,
        completedLessons,
        totalLessons,
        pendingLessons: Math.max(0, totalLessons - completedLessons),
        progressPercentage,
        completionStatus: buildCompletionStatus(progressPercentage, totalLessons),
        lastCompletedAt: student.lastCompletedAt,
      };
    });

    const completedStudents = students.filter((student) => student.completionStatus === "completed").length;
    const averageProgressPercentage = students.length
      ? Math.round(students.reduce((sum, student) => sum + student.progressPercentage, 0) / students.length)
      : 0;

    return {
      totalLessons,
      studentsTracked: students.length,
      completedStudents,
      averageProgressPercentage,
      completionRate: students.length ? Math.round((completedStudents / students.length) * 100) : 0,
      students,
    };
  }

  return {
    totalLessons,
    completedLessons: 0,
    pendingLessons: totalLessons,
    progressPercentage: 0,
    completionStatus: buildCompletionStatus(0, totalLessons),
    lessons: (materials || []).map((material) => ({
      id: String(material.id),
      title: material.title,
      type: material.type,
      url: material.url,
      createdAt: material.createdAt,
      completed: false,
      completedAt: null,
    })),
  };
}

async function listCourses(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const instructorId = toId(req.query.instructorId);
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const page = clamp(req.query.page, 1, 100000, 1);
  const limit = clamp(req.query.limit, 1, 100, 20);
  const usePagination = req.query.format === "page" || req.query.page !== undefined || req.query.limit !== undefined;

  const where = [];
  const params = [];
  if (q) {
    where.push("(c.title LIKE ? OR c.description LIKE ? OR u.name LIKE ?)");
    params.push(buildLikeTerm(q), buildLikeTerm(q), buildLikeTerm(q));
  }
  if (instructorId) {
    where.push("c.instructor_id = ?");
    params.push(instructorId);
  }
  if (category) {
    where.push("c.category = ?");
    params.push(category);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRow] = await db.query(
    `
    SELECT COUNT(*) AS c
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ${whereSql}
  `,
    params
  );
  const total = Number(countRow && countRow.c) || 0;

  const rows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.category,
      c.instructor_id AS instructorId,
      u.name AS instructorName,
      u.email AS instructorEmail,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
      (SELECT COUNT(*) FROM announcements an WHERE an.course_id = c.id) AS announcementCount,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ${whereSql}
    ORDER BY c.created_at DESC
    ${usePagination ? "LIMIT ? OFFSET ?" : "LIMIT 100"}
  `,
    usePagination ? [...params, limit, (page - 1) * limit] : params
  );

  const items = (rows || []).map((row) => ({
    id: String(row.id),
    title: row.title,
    description: row.description,
    category: row.category,
    instructorId: String(row.instructorId),
    instructorName: row.instructorName,
    instructorEmail: row.instructorEmail,
    studentCount: Number(row.studentCount) || 0,
    assignmentCount: Number(row.assignmentCount) || 0,
    announcementCount: Number(row.announcementCount) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  if (!usePagination) return res.json(items);
  return res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

async function createCourse(req, res) {
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const description = String(req.body && req.body.description ? req.body.description : "").trim();
  const category = String(req.body && req.body.category ? req.body.category : "General").trim();
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!description) return res.status(400).json({ message: "Description is required" });
  if (!category) return res.status(400).json({ message: "Category is required" });
  if (category.length > 120) return res.status(400).json({ message: "Category is too long" });

  const instructorId = toId(req.user.id);
  if (!instructorId) return res.status(400).json({ message: "Invalid user id" });

  const result = await db.exec("INSERT INTO courses (title, description, category, instructor_id) VALUES (?, ?, ?, ?)", [
    title,
    description,
    category,
    instructorId,
  ]);

  await writeAuditLog({
    actorUserId: instructorId,
    action: "course.created",
    entityType: "course",
    entityId: result.insertId,
    message: `Course created: ${title}`,
  });

  return res.status(201).json({ message: "Course created", course: { id: String(result.insertId) } });
}

async function enroll(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const studentId = toId(req.user.id);
  if (!studentId) return res.status(400).json({ message: "Invalid user id" });

  try {
    await db.exec("INSERT INTO enrollments (course_id, student_id) VALUES (?, ?)", [courseId, studentId]);
  } catch (e) {
    if (!(e && e.code === "ER_DUP_ENTRY")) throw e;
  }

  await writeAuditLog({
    actorUserId: studentId,
    action: "course.enrolled",
    entityType: "course",
    entityId: courseId,
    message: `User enrolled in course #${courseId}`,
  });

  return res.json({ message: "Enrolled", course: { id: String(courseId) } });
}

async function enrollLegacy(req, res) {
  const courseId = toId(req.body && req.body.course_id);
  req.params.courseId = courseId;
  return enroll(req, res);
}

async function myCourses(req, res) {
  const userId = toId(req.user.id);
  if (!userId) return res.status(400).json({ message: "Invalid user id" });

  if (normalizeRole(req.user.role) === "student") {
    const rows = await db.query(
      `
      SELECT
        c.id,
        c.title,
        c.description,
        c.category,
        c.instructor_id AS instructorId,
        u.name AS instructorName,
        (SELECT COUNT(*) FROM enrollments e2 WHERE e2.course_id = c.id) AS studentCount,
        (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
        (SELECT COUNT(*) FROM submissions s WHERE s.course_id = c.id AND s.student_id = ?) AS submissionCount,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN users u ON u.id = c.instructor_id
      WHERE e.student_id = ?
      ORDER BY c.created_at DESC
    `,
      [userId, userId]
    );
    return res.json(
      (rows || []).map((row) => ({
        ...row,
        id: String(row.id),
        progress:
          Number(row.assignmentCount) > 0
            ? Math.round(((Number(row.submissionCount) || 0) / Number(row.assignmentCount)) * 100)
            : 0,
      }))
    );
  }

  if (isInstructorLike(req.user.role)) {
    const rows = await db.query(
      `
      SELECT
        c.id,
        c.title,
        c.description,
        c.category,
        c.instructor_id AS instructorId,
        u.name AS instructorName,
        (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
        (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentCount,
        (SELECT COUNT(*) FROM announcements an WHERE an.course_id = c.id) AS announcementCount,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt
      FROM courses c
      JOIN users u ON u.id = c.instructor_id
      WHERE c.instructor_id = ?
      ORDER BY c.created_at DESC
    `,
      [userId]
    );
    return res.json((rows || []).map((row) => ({ ...row, id: String(row.id) })));
  }

  const rows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.category,
      c.instructor_id AS instructorId,
      u.name AS instructorName,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    ORDER BY c.created_at DESC
  `
  );
  return res.json((rows || []).map((row) => ({ ...row, id: String(row.id) })));
}

async function getCourse(req, res) {
  const courseId = toId(req.params.id);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const rows = await db.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.category,
      c.instructor_id AS instructorId,
      u.name AS instructorName,
      u.email AS instructorEmail,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt
    FROM courses c
    JOIN users u ON u.id = c.instructor_id
    WHERE c.id = ?
    LIMIT 1
  `,
    [courseId]
  );
  if (!rows || rows.length === 0) return res.status(404).json({ message: "Course not found" });
  const course = rows[0];

  const access = await getCourseAccess(courseId, req.user);
  const userId = access.userId;
  const normalizedRole = access.normalizedRole;
  const isAdmin = access.isAdmin;
  const isOwner = access.isOwner;
  const isEnrolled = access.isEnrolled;

  const base = {
    id: String(course.id),
    title: course.title,
    description: course.description,
    category: course.category,
    instructor: { id: String(course.instructorId), name: course.instructorName, email: course.instructorEmail },
    studentCount: Number(course.studentCount) || 0,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };

  if (!isAdmin && !isOwner && !isEnrolled) {
    return res.json({
      ...base,
      materials: [],
      assignments: [],
      announcements: [],
      quizzes: [],
      discussions: [],
      progress: {
        totalLessons: 0,
        completedLessons: 0,
        pendingLessons: 0,
        progressPercentage: 0,
        completionStatus: "not_started",
        lessons: [],
      },
    });
  }

  const materials = await db.query(
    `
    SELECT id, type, title, url, uploaded_by AS uploadedBy, created_at AS createdAt
    FROM course_materials
    WHERE course_id = ?
    ORDER BY created_at DESC
  `,
    [courseId]
  );

  const assignments = await db.query(
    `
    SELECT
      a.id,
      a.title,
      a.description,
      a.due_date AS dueDate,
      a.created_at AS createdAt,
      (
        SELECT COUNT(*)
        FROM submissions s
        WHERE s.assignment_id = a.id
      ) AS submissionCount,
      (
        SELECT s.id
        FROM submissions s
        WHERE s.assignment_id = a.id AND s.student_id = ?
        LIMIT 1
      ) AS mySubmissionId,
      (
        SELECT s.grade_score
        FROM submissions s
        WHERE s.assignment_id = a.id AND s.student_id = ?
        LIMIT 1
      ) AS myGradeScore
    FROM assignments a
    WHERE a.course_id = ?
    ORDER BY a.due_date ASC
  `,
    [userId, userId, courseId]
  );

  const announcements = await db.query(
    `
    SELECT
      a.id,
      a.title,
      a.body,
      a.audience,
      a.created_at AS createdAt,
      u.name AS authorName
    FROM announcements a
    JOIN users u ON u.id = a.author_id
      WHERE a.course_id = ? OR (a.course_id IS NULL AND a.audience IN ('all', ?, 'admins'))
    ORDER BY a.created_at DESC
    LIMIT 10
  `,
    [courseId, normalizedRole]
  );

  const quizzes = await db.query(
    `
    SELECT
      q.id,
      q.title,
      q.instructions,
      q.time_limit_minutes AS timeLimitMinutes,
      q.is_published AS isPublished,
      q.published_at AS publishedAt,
      q.created_at AS createdAt,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questionCount,
      (SELECT COALESCE(SUM(qq.marks), 0) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS totalMarks,
      (
        SELECT qa.score
        FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.student_id = ?
        ORDER BY qa.submitted_at DESC
        LIMIT 1
      ) AS myLatestScore
    FROM quizzes q
    WHERE q.course_id = ?
      ${isAdmin || isOwner ? "" : "AND q.is_published = 1"}
    ORDER BY q.created_at DESC
  `,
    [userId, courseId]
  );

  const discussions = await loadCourseDiscussions(courseId);
  const progress = await loadCourseProgress(courseId, access, materials);

  let students = undefined;
  if (isAdmin || isOwner) {
    students = await db.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        e.created_at AS enrolledAt
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      WHERE e.course_id = ?
      ORDER BY e.created_at DESC
    `,
      [courseId]
    );
  }

  return res.json({
    ...base,
    materials: (materials || []).map((item) => ({ ...item, id: String(item.id) })),
    assignments: (assignments || []).map((item) => ({
      id: String(item.id),
      title: item.title,
      description: item.description,
      dueDate: item.dueDate,
      createdAt: item.createdAt,
      submissionCount: Number(item.submissionCount) || 0,
      mySubmissionId: item.mySubmissionId ? String(item.mySubmissionId) : null,
      myGradeScore: item.myGradeScore !== null ? Number(item.myGradeScore) : null,
      isPastDue: item.dueDate ? new Date(item.dueDate).getTime() < Date.now() : false,
    })),
    announcements: (announcements || []).map((item) => ({ ...item, id: String(item.id) })),
    quizzes: (quizzes || []).map((item) => ({
      id: String(item.id),
      title: item.title,
      instructions: item.instructions || "",
      timeLimitMinutes: item.timeLimitMinutes !== null ? Number(item.timeLimitMinutes) : null,
      isPublished: Boolean(item.isPublished),
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
      questionCount: Number(item.questionCount) || 0,
      totalMarks: Number(item.totalMarks) || 0,
      myLatestScore: item.myLatestScore !== null ? Number(item.myLatestScore) : null,
    })),
    discussions,
    progress,
    students: students
      ? students.map((student) => ({
          id: String(student.id),
          name: student.name,
          email: student.email,
          enrolledAt: student.enrolledAt,
        }))
      : undefined,
  });
}

async function getCourseProgress(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const access = await getCourseAccess(courseId, req.user);
  if (!access) return res.status(404).json({ message: "Course not found" });
  if (!access.canView && !access.isAdmin && !access.isOwner) return res.status(403).json({ message: "Forbidden" });

  const progress = await loadCourseProgress(courseId, access);
  return res.json(progress);
}

async function createDiscussionThread(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  const access = await getCourseAccess(courseId, req.user);
  if (!access) return res.status(404).json({ message: "Course not found" });
  if (!access.canView) return res.status(403).json({ message: "Forbidden" });

  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const body = String(req.body && req.body.body ? req.body.body : "").trim();

  if (!title) return res.status(400).json({ message: "Discussion title is required" });
  if (!body) return res.status(400).json({ message: "Discussion message is required" });
  if (title.length > 200) return res.status(400).json({ message: "Discussion title is too long" });

  const result = await db.exec("INSERT INTO discussion_threads (course_id, author_id, title, body) VALUES (?, ?, ?, ?)", [
    courseId,
    access.userId,
    title,
    body,
  ]);

  await writeAuditLog({
    actorUserId: access.userId,
    action: "discussion.thread_created",
    entityType: "discussion_thread",
    entityId: result.insertId,
    message: `Discussion started in ${access.course.title}: ${title}`,
    meta: { courseId },
  });

  return res.status(201).json({ message: "Discussion thread created", threadId: String(result.insertId) });
}

async function createDiscussionReply(req, res) {
  const courseId = toId(req.params.courseId);
  const threadId = toId(req.params.threadId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });
  if (!threadId) return res.status(400).json({ message: "Invalid threadId" });

  const access = await getCourseAccess(courseId, req.user);
  if (!access) return res.status(404).json({ message: "Course not found" });
  if (!access.canView) return res.status(403).json({ message: "Forbidden" });

  const threadRows = await db.query(
    `
    SELECT id, title
    FROM discussion_threads
    WHERE id = ? AND course_id = ?
    LIMIT 1
  `,
    [threadId, courseId]
  );
  if (!threadRows || threadRows.length === 0) return res.status(404).json({ message: "Discussion thread not found" });

  const body = String(req.body && req.body.body ? req.body.body : "").trim();
  if (!body) return res.status(400).json({ message: "Reply message is required" });

  const result = await db.exec("INSERT INTO discussion_replies (thread_id, author_id, body) VALUES (?, ?, ?)", [threadId, access.userId, body]);
  await db.exec("UPDATE discussion_threads SET updated_at = NOW(3) WHERE id = ?", [threadId]);

  await writeAuditLog({
    actorUserId: access.userId,
    action: "discussion.reply_created",
    entityType: "discussion_reply",
    entityId: result.insertId,
    message: `Reply added to discussion in ${access.course.title}: ${threadRows[0].title}`,
    meta: { courseId, threadId },
  });

  return res.status(201).json({ message: "Reply posted", replyId: String(result.insertId) });
}

async function deleteDiscussionThread(req, res) {
  const courseId = toId(req.params.courseId);
  const threadId = toId(req.params.threadId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });
  if (!threadId) return res.status(400).json({ message: "Invalid threadId" });

  const access = await getCourseAccess(courseId, req.user);
  if (!access) return res.status(404).json({ message: "Course not found" });

  const rows = await db.query(
    `
    SELECT id, author_id AS authorId, title
    FROM discussion_threads
    WHERE id = ? AND course_id = ?
    LIMIT 1
  `,
    [threadId, courseId]
  );
  if (!rows || rows.length === 0) return res.status(404).json({ message: "Discussion thread not found" });

  const thread = rows[0];
  const isAuthor = access.userId && Number(thread.authorId) === access.userId;
  if (!access.isAdmin && !access.isOwner && !isAuthor) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await db.exec("DELETE FROM discussion_threads WHERE id = ?", [threadId]);

  await writeAuditLog({
    actorUserId: access.userId,
    action: "discussion.thread_deleted",
    entityType: "discussion_thread",
    entityId: threadId,
    message: `Discussion removed from ${access.course.title}: ${thread.title}`,
    meta: { courseId },
  });

  return res.json({ message: "Discussion deleted" });
}

async function deleteDiscussionReply(req, res) {
  const courseId = toId(req.params.courseId);
  const threadId = toId(req.params.threadId);
  const replyId = toId(req.params.replyId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });
  if (!threadId) return res.status(400).json({ message: "Invalid threadId" });
  if (!replyId) return res.status(400).json({ message: "Invalid replyId" });

  const access = await getCourseAccess(courseId, req.user);
  if (!access) return res.status(404).json({ message: "Course not found" });

  const rows = await db.query(
    `
    SELECT r.id, r.author_id AS authorId, r.body
    FROM discussion_replies r
    JOIN discussion_threads t ON t.id = r.thread_id
    WHERE r.id = ? AND r.thread_id = ? AND t.course_id = ?
    LIMIT 1
  `,
    [replyId, threadId, courseId]
  );
  if (!rows || rows.length === 0) return res.status(404).json({ message: "Discussion reply not found" });

  const reply = rows[0];
  const isAuthor = access.userId && Number(reply.authorId) === access.userId;
  if (!access.isAdmin && !access.isOwner && !isAuthor) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await db.exec("DELETE FROM discussion_replies WHERE id = ?", [replyId]);
  await db.exec("UPDATE discussion_threads SET updated_at = NOW(3) WHERE id = ?", [threadId]);

  await writeAuditLog({
    actorUserId: access.userId,
    action: "discussion.reply_deleted",
    entityType: "discussion_reply",
    entityId: replyId,
    message: `Discussion reply removed from ${access.course.title}`,
    meta: { courseId, threadId },
  });

  return res.json({ message: "Reply deleted" });
}

async function markLessonComplete(req, res) {
  const courseId = toId(req.params.courseId);
  const materialId = toId(req.params.materialId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });
  if (!materialId) return res.status(400).json({ message: "Invalid materialId" });

  const access = await getCourseAccess(courseId, req.user);
  if (!access) return res.status(404).json({ message: "Course not found" });
  if (access.normalizedRole !== "student" || !access.isEnrolled) {
    return res.status(403).json({ message: "Only enrolled students can update progress" });
  }

  const materialRows = await db.query(
    `
    SELECT id, title
    FROM course_materials
    WHERE id = ? AND course_id = ?
    LIMIT 1
  `,
    [materialId, courseId]
  );
  if (!materialRows || materialRows.length === 0) return res.status(404).json({ message: "Lesson not found" });

  try {
    await db.exec("INSERT INTO lesson_progress (course_id, material_id, student_id, completed_at) VALUES (?, ?, ?, NOW(3))", [
      courseId,
      materialId,
      access.userId,
    ]);
  } catch (error) {
    if (!(error && error.code === "ER_DUP_ENTRY")) throw error;
    await db.exec("UPDATE lesson_progress SET completed_at = NOW(3) WHERE course_id = ? AND material_id = ? AND student_id = ?", [
      courseId,
      materialId,
      access.userId,
    ]);
  }

  const progress = await loadCourseProgress(courseId, access);
  return res.json({ message: "Lesson marked complete", progress });
}

async function markLessonIncomplete(req, res) {
  const courseId = toId(req.params.courseId);
  const materialId = toId(req.params.materialId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });
  if (!materialId) return res.status(400).json({ message: "Invalid materialId" });

  const access = await getCourseAccess(courseId, req.user);
  if (!access) return res.status(404).json({ message: "Course not found" });
  if (access.normalizedRole !== "student" || !access.isEnrolled) {
    return res.status(403).json({ message: "Only enrolled students can update progress" });
  }

  await db.exec("DELETE FROM lesson_progress WHERE course_id = ? AND material_id = ? AND student_id = ?", [
    courseId,
    materialId,
    access.userId,
  ]);

  const progress = await loadCourseProgress(courseId, access);
  return res.json({ message: "Lesson marked pending", progress });
}

async function addMaterial(req, res) {
  const courseId = toId(req.params.courseId);
  if (!courseId) return res.status(400).json({ message: "Invalid courseId" });

  let type = String(req.body && req.body.type ? req.body.type : "").trim().toLowerCase();
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  let url = String(req.body && req.body.url ? req.body.url : "").trim();

  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!url && !req.file) return res.status(400).json({ message: "Provide a URL or upload a file" });

  if (req.file) {
    if (!type) {
      type = String(req.file.mimetype || "").startsWith("video/") ? "video" : "pdf";
    }
    url = `uploads/materials/${req.file.filename}`;
  }
  if (!["pdf", "video", "link"].includes(type)) return res.status(400).json({ message: "Invalid material type" });

  const userId = toId(req.user.id);
  const courseRows = await db.query("SELECT instructor_id AS instructorId, title FROM courses WHERE id = ? LIMIT 1", [courseId]);
  if (!courseRows || courseRows.length === 0) return res.status(404).json({ message: "Course not found" });

  const isAdmin = normalizeRole(req.user.role) === "admin";
  const isOwner = isInstructorLike(req.user.role) && Number(courseRows[0].instructorId) === userId;
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "Forbidden" });

  await db.exec("INSERT INTO course_materials (course_id, type, title, url, uploaded_by) VALUES (?, ?, ?, ?, ?)", [
    courseId,
    type,
    title,
    url,
    userId,
  ]);

  await writeAuditLog({
    actorUserId: userId,
    action: "course.material_added",
    entityType: "course",
    entityId: courseId,
    message: `Material added to ${courseRows[0].title}: ${title}`,
    meta: { type, url },
  });

  return res.status(201).json({ message: "Material added" });
}

module.exports = {
  listCourses,
  createCourse,
  enroll,
  enrollLegacy,
  myCourses,
  getCourse,
  getCourseProgress,
  createDiscussionThread,
  createDiscussionReply,
  deleteDiscussionThread,
  deleteDiscussionReply,
  markLessonComplete,
  markLessonIncomplete,
  addMaterial,
  toId,
};
