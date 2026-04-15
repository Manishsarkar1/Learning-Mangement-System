const mysql = require("mysql2/promise");

let pool = null;
let connected = false;

async function hasTable(database, tableName) {
  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS c
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  `,
    [database, tableName]
  );
  return Number(rows && rows[0] && rows[0].c) > 0;
}

async function hasColumn(database, tableName, columnName) {
  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS c
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `,
    [database, tableName, columnName]
  );
  return Number(rows && rows[0] && rows[0].c) > 0;
}

async function ensureColumn(database, tableName, columnName, ddl, postSql) {
  const tableExists = await hasTable(database, tableName);
  if (!tableExists) return;
  const exists = await hasColumn(database, tableName, columnName);
  if (!exists) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
  }
  if (postSql) await pool.query(postSql);
}

async function runDbUpgrades(database) {
  await ensureColumn(database, "courses", "category", "category VARCHAR(120) NOT NULL DEFAULT 'General' AFTER description");
  await ensureColumn(database, "quizzes", "instructions", "instructions TEXT NULL AFTER title");
  await ensureColumn(database, "quizzes", "time_limit_minutes", "time_limit_minutes INT UNSIGNED NULL AFTER instructions");
  await ensureColumn(database, "quizzes", "is_published", "is_published TINYINT(1) NOT NULL DEFAULT 0 AFTER time_limit_minutes", `
    UPDATE quizzes
    SET is_published = 1
    WHERE is_published IS NULL OR is_published = 0
  `);
  await ensureColumn(database, "quizzes", "published_at", "published_at DATETIME(3) NULL AFTER is_published", `
    UPDATE quizzes
    SET published_at = COALESCE(published_at, created_at)
    WHERE is_published = 1
  `);
  await ensureColumn(database, "quiz_questions", "marks", "marks INT UNSIGNED NOT NULL DEFAULT 1 AFTER correct_option", `
    UPDATE quiz_questions
    SET marks = 1
    WHERE marks IS NULL OR marks < 1
  `);
}

function getMysqlConfigFromEnv() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "learnly_lms",
  };
}

async function initDb() {
  const cfg = getMysqlConfigFromEnv();
  pool = mysql.createPool({
    ...cfg,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    queueLimit: 0,
    dateStrings: false,
  });

  await pool.query("SELECT 1");
  await runDbUpgrades(cfg.database);
  connected = true;
  return pool;
}

function getPool() {
  if (!pool) throw new Error("DB not initialized");
  return pool;
}

async function query(sql, params) {
  const p = getPool();
  const [rows] = await p.query(sql, params || []);
  return rows;
}

async function exec(sql, params) {
  const p = getPool();
  const [result] = await p.execute(sql, params || []);
  return result;
}

async function closeDb() {
  if (pool) await pool.end();
  pool = null;
  connected = false;
}

module.exports = {
  initDb,
  closeDb,
  getPool,
  query,
  exec,
  get connected() {
    return connected;
  },
  get config() {
    return getMysqlConfigFromEnv();
  },
  driver: "mysql",
};
