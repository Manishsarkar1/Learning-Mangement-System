const path = require("path");
const express = require("express");
const cors = require("cors");

const { notFound, errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/authRoutes");
const courseRoutes = require("./routes/courseRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const submissionRoutes = require("./routes/submissionRoutes");
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const quizRoutes = require("./routes/quizRoutes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Serve frontend (includes existing landing + login pages; treated as read-only)
app.use(express.static(path.join(__dirname, "..", "frontend", "public")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (req, res) => res.send("OK"));
app.get("/health/db", (req, res) => {
  const mongoose = require("mongoose");
  const readyState = mongoose.connection ? mongoose.connection.readyState : 0;
  res.json({ driver: "mongo", connected: readyState === 1 });
});

app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/quizzes", quizRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = { app };
