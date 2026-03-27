require("dotenv").config();

const { app } = require("./app");
const db = require("./config/db");

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  await db.initDb();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
