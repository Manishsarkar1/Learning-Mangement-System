const mongoose = require("mongoose");

async function connectMongo({ mongoUri }) {
  if (!mongoUri) throw new Error("Missing MONGO_URI");
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}

module.exports = { connectMongo };
