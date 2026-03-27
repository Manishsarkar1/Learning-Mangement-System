const mongoose = require("mongoose");

const courseMaterialSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["pdf", "video", "link"], required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, index: true },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    materials: [courseMaterialSchema],
  },
  { timestamps: true }
);

courseSchema.index({ title: "text", description: "text" });

module.exports = { Course: mongoose.model("Course", courseSchema) };

