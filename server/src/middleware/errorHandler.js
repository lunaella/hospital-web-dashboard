export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status ?? 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error." : err.message,
  });
}
