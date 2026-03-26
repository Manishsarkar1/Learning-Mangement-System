const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  let token = req.headers["authorization"];
  if (!token) return res.sendStatus(403);

  if (typeof token === "string" && token.toLowerCase().startsWith("bearer ")) {
    token = token.slice(7);
  }

  jwt.verify(token, "secret", (err, decoded) => {
    if (err) return res.sendStatus(403);
    req.user = decoded;
    next();
  });
};
