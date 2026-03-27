const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, trim: true, maxlength: 80 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    meta: { type: Object, default: {} },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

module.exports = { Notification: mongoose.model("Notification", notificationSchema) };

