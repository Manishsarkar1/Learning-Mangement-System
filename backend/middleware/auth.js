const jwt = require("jsonwebtoken");

function getTokenFromReq(req) {
  let token = req.headers.authorization;
  if (!token) return null;
  if (typeof token !== "string") return null;
  if (token.toLowerCase().startsWith("bearer ")) token = token.slice(7);
  return token.trim() || null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ message: "Missing token" });

  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = { requireAuth, getTokenFromReq };

