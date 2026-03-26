const path = require("path");
const { createFileDb } = require("../data/fileDb");

const dbDriver = (process.env.DB_DRIVER || "").toLowerCase();
const fileDbPath = process.env.DB_FILE_PATH || path.join(__dirname, "..", "data", "data.json");

function createSwitchableDb() {
  const fileDb = createFileDb({ filePath: fileDbPath });

  let activeDb = fileDb;
  let driver = "file";

  function preferMysql() {
    if (dbDriver === "file") return false;
    if (dbDriver === "mysql") return true;
    return false;
  }

  if (preferMysql()) {
    try {
      const mysql = require("mysql2");
      const mysqlDb = mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "#Password",
        database: process.env.DB_NAME || "#DatabaseNmae",
      });

      mysqlDb.connect((err) => {
        if (err) {
          console.error("MySQL connection failed:", err.message);
          console.error("Continuing with file database:", fileDbPath);
          return;
        }
        activeDb = mysqlDb;
        driver = "mysql";
        console.log("MySQL Connected");
      });
    } catch (err) {
      console.error("MySQL driver not available; continuing with file database:", err.message);
    }
  } else if (dbDriver !== "file") {
    console.log("No DB_DRIVER set: using file database (set DB_DRIVER=mysql to use MySQL).");
  }

  return {
    get _connected() {
      return Boolean(activeDb && activeDb._connected !== false);
    },
    get _driver() {
      return driver;
    },
    query(sql, params, cb) {
      return activeDb.query(sql, params, cb);
    },
  };
}

module.exports = createSwitchableDb();
