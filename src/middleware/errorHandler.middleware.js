/**
 * Global Error Handling Middleware
 */

const ApiResponse = require('../utils/response');

/**
 * Global error handling middleware with logging
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandlerWithLogging = (err, req, res, next) => {
  // Log error details for debugging
  console.error(`Error occurred on ${req.method} ${req.path}:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    user: req.user?.id || 'anonymous',
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(error => ({
      field: error.path,
      message: error.message
    }));
    return ApiResponse.validationError(res, errors);
  }

  if (err.name === 'CastError') {
    return ApiResponse.error(res, 'Invalid resource ID format', 400);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return ApiResponse.error(res, `${field} already exists`, 409, {
      field,
      value: err.keyValue[field]
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.unauthorized(res, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return ApiResponse.unauthorized(res, 'Token expired');
  }

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return ApiResponse.error(res, 'File too large', 413);
    }
    return ApiResponse.error(res, `File upload error: ${err.message}`, 400);
  }

  // Handle MongoDB connection errors
  if (err.message && err.message.includes('ECONNREFUSED')) {
    return ApiResponse.error(res, 'Database connection failed', 503);
  }

  // Rate limiting errors
  if (err.status === 429) {
    return ApiResponse.error(
      res,
      'Too many requests, please try again later',
      429,
      {
        retryAfter: err.retryAfter || 60
      }
    );
  }

  // Default internal server error
  const message =
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'Something went wrong on our end';

  return ApiResponse.error(res, message, err.statusCode || 500);
};

/**
 * Handle 404 Not Found errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const handleNotFound = (req, res) => {
  ApiResponse.notFound(res, `Route ${req.method} ${req.path} not found`);
};

/**
 * Async error handler wrapper
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
const asyncHandler = fn => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandlerWithLogging,
  handleNotFound,
  asyncHandler
};
