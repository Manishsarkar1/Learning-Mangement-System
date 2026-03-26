const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const courseRoutes = require("./routes/courseRoutes");
const quizRoutes = require("./routes/quizRoutes");

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.send("OK");
});

app.get("/health/db", (req, res) => {
  const payload = { connected: Boolean(db._connected), driver: db._driver || "unknown" };
  if (db._driver === "file" && db._filePath) payload.filePath = db._filePath;
  res.json(payload);
});

app.use("/api", (req, res, next) => {
  if (db._connected) return next();
  return res.status(503).json({
    message: "Database not connected. Start MySQL and configure DB_* env vars or config/db.js.",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/quizzes", quizRoutes);

// Dev-only helper: list users (no password hashes). Enable by setting DEBUG_USERS=1
if (process.env.DEBUG_USERS === "1") {
  app.get("/api/debug/users", (req, res) => {
    if (db._driver === "file" && db._filePath) {
      try {
        const fs = require("fs");
        const raw = JSON.parse(fs.readFileSync(db._filePath, "utf8"));
        const users = Array.isArray(raw.users) ? raw.users : [];
        return res.json(users.map(({ password, ...rest }) => rest));
      } catch (e) {
        return res.status(500).json({ message: "Failed to load users", error: e.message });
      }
    }

    db.query("SELECT id, name, email, role FROM users", (err, rows) => {
      if (err) return res.status(500).json({ message: "Failed to list users", error: err.message });
      return res.json(rows || []);
    });
  });
}

app.listen(5000, () => console.log("Server running on port 5000"));
