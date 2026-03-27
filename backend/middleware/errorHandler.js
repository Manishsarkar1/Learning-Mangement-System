function notFound(req, res) {
  res.status(404).json({ message: "Not found" });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = Number(err && err.status) || 500;
  const message = err && err.message ? err.message : "Server error";
  res.status(status).json({ message });
}

module.exports = { notFound, errorHandler };

