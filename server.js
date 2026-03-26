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
  res.json({ connected: Boolean(db._connected), driver: db._driver || "unknown" });
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

app.listen(5000, () => console.log("Server running on port 5000"));
