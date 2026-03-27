const mysql = require("mysql2/promise");

let pool = null;
let connected = false;

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

