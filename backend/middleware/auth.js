const jwt = require("jsonwebtoken");

function parseCookies(headerValue) {
  const map = {};
  if (!headerValue || typeof headerValue !== "string") return map;

  for (const chunk of headerValue.split(";")) {
    const [name, ...rest] = chunk.split("=");
    if (!name) continue;
    map[name.trim()] = decodeURIComponent(rest.join("=").trim());
  }
  return map;
}

function getTokenFromReq(req) {
  let token = req.headers.authorization;
  if (typeof token === "string" && token.trim()) {
    if (token.toLowerCase().startsWith("bearer ")) token = token.slice(7);
    return token.trim() || null;
  }

  const cookies = parseCookies(req.headers.cookie);
  return cookies.learnly_token || null;
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
