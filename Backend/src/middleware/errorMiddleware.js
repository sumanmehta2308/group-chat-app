export function errorHandler(err, req, res, next) {
  console.error(
    `[ERROR] ${req.method} ${req.originalUrl}:`,
    err.stack || err.message
  );

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Internal Server Error" : err.message,
  });
}
