const fs = require("fs");
const path = require("path");

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function ensureDbShape(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  db.users = Array.isArray(db.users) ? db.users : [];
  db.courses = Array.isArray(db.courses) ? db.courses : [];
  db.enrollments = Array.isArray(db.enrollments) ? db.enrollments : [];
  db.quizzes = Array.isArray(db.quizzes) ? db.quizzes : [];
  db.quiz_questions = Array.isArray(db.quiz_questions) ? db.quiz_questions : [];
  db._meta = db._meta && typeof db._meta === "object" ? db._meta : {};
  db._meta.nextId = db._meta.nextId && typeof db._meta.nextId === "object" ? db._meta.nextId : {};
  return db;
}

function computeNextId(records) {
  const max = records.reduce((m, r) => (typeof r.id === "number" && r.id > m ? r.id : m), 0);
  return max + 1;
}

function initNextIds(db) {
  const tables = ["users", "courses", "enrollments", "quizzes", "quiz_questions"];
  for (const t of tables) {
    if (typeof db._meta.nextId[t] !== "number") db._meta.nextId[t] = computeNextId(db[t]);
  }
}

function createFileDb({ filePath }) {
  const resolvedPath = filePath ? path.resolve(filePath) : path.join(__dirname, "data.json");

  function load() {
    try {
      const text = fs.readFileSync(resolvedPath, "utf8");
      const parsed = JSON.parse(text);
      const db = ensureDbShape(parsed);
      initNextIds(db);
      return db;
    } catch (err) {
      const db = ensureDbShape({});
      initNextIds(db);
      return db;
    }
  }

  function save(db) {
    const dir = path.dirname(resolvedPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${resolvedPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmp, resolvedPath);
  }

  function nextId(db, table) {
    const id = db._meta.nextId[table];
    db._meta.nextId[table] = id + 1;
    return id;
  }

  function query(sql, params, cb) {
    const callback = typeof cb === "function" ? cb : () => {};
    const p = Array.isArray(params) ? params : [];
    const s = normalizeSql(sql);

    setImmediate(() => {
      try {
        const db = load();

        if (s === "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)") {
          const [name, email, password, role] = p;
          if (db.users.some((u) => u.email === email)) {
            const err = new Error("Duplicate email");
            err.code = "ER_DUP_ENTRY";
            return callback(err);
          }
          const user = { id: nextId(db, "users"), name, email, password, role };
          db.users.push(user);
          save(db);
          return callback(null, { insertId: user.id, affectedRows: 1 });
        }

        if (s === "SELECT * FROM users WHERE email = ?") {
          const [email] = p;
          const rows = db.users.filter((u) => u.email === email);
          return callback(null, rows);
        }

        if (s === "INSERT INTO courses (title, description, instructor_id) VALUES (?, ?, ?)") {
          const [title, description, instructor_id] = p;
          const course = { id: nextId(db, "courses"), title, description, instructor_id };
          db.courses.push(course);
          save(db);
          return callback(null, { insertId: course.id, affectedRows: 1 });
        }

        if (s === "SELECT * FROM courses") {
          return callback(null, db.courses);
        }

        if (s === "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)") {
          const [student_id, course_id] = p;
          const enrollment = { id: nextId(db, "enrollments"), student_id, course_id };
          db.enrollments.push(enrollment);
          save(db);
          return callback(null, { insertId: enrollment.id, affectedRows: 1 });
        }

        if (s === "INSERT INTO quizzes (course_id, title) VALUES (?, ?)") {
          const [course_id, title] = p;
          const quiz = { id: nextId(db, "quizzes"), course_id, title };
          db.quizzes.push(quiz);
          save(db);
          return callback(null, { insertId: quiz.id, affectedRows: 1 });
        }

        if (
          s ===
          "INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ) {
          const [quiz_id, question, option_a, option_b, option_c, option_d, correct_option] = p;
          const qq = { id: nextId(db, "quiz_questions"), quiz_id, question, option_a, option_b, option_c, option_d, correct_option };
          db.quiz_questions.push(qq);
          save(db);
          return callback(null, { insertId: qq.id, affectedRows: 1 });
        }

        if (s === "SELECT * FROM quiz_questions WHERE quiz_id=?") {
          const [quiz_id] = p;
          const rows = db.quiz_questions.filter((q) => String(q.quiz_id) === String(quiz_id));
          return callback(null, rows);
        }

        const err = new Error(`Unsupported query for file DB: ${s}`);
        err.code = "UNSUPPORTED_QUERY";
        return callback(err);
      } catch (err) {
        return callback(err);
      }
    });
  }

  return {
    _connected: true,
    _driver: "file",
    _filePath: resolvedPath,
    query,
  };
}

module.exports = { createFileDb };

