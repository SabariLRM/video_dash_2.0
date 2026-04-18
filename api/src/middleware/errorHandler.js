/**
 * HUB 2.0 — Global Error Handler Middleware
 *
 * Catches all errors passed via next(err) and returns a consistent
 * JSON error response. Never leaks stack traces in production.
 */
'use strict';

const logger = require('../logger');

/**
 * Custom API error class — thrown inside route handlers for controlled errors.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message    - Human-readable error message
   * @param {string} [code]     - Machine-readable error code
   */
  constructor(statusCode, message, code = 'API_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code       = code;
    this.isApiError = true;
  }

  static badRequest(msg, code)  { return new ApiError(400, msg, code || 'BAD_REQUEST'); }
  static unauthorized(msg)       { return new ApiError(401, msg || 'Unauthorized', 'UNAUTHORIZED'); }
  static forbidden(msg)          { return new ApiError(403, msg || 'Forbidden', 'FORBIDDEN'); }
  static notFound(msg)           { return new ApiError(404, msg || 'Not found', 'NOT_FOUND'); }
  static internal(msg)           { return new ApiError(500, msg || 'Internal server error', 'INTERNAL'); }
}

/**
 * Express error handler — must be the LAST middleware registered.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isProd = process.env.NODE_ENV === 'production';

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: messages.join('; ') });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({ success: false, code: 'DUPLICATE', message: `${field} already exists` });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', message: 'Token expired' });
  }

  // Our own ApiError
  if (err.isApiError) {
    return res.status(err.statusCode).json({
      success: false,
      code:    err.code,
      message: err.message,
    });
  }

  // Multer file size limit
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE', message: err.message });
  }

  // Unknown — log fully, return generic message
  logger.error('Unhandled server error', {
    method: req.method,
    url:    req.originalUrl,
    error:  err.message,
    stack:  isProd ? undefined : err.stack,
  });

  return res.status(500).json({
    success: false,
    code:    'INTERNAL',
    message: isProd ? 'Internal server error' : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}

module.exports = { errorHandler, ApiError };
