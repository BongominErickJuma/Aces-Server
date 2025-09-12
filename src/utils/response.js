/**
 * Standardized API Response Utility
 * Provides consistent response formatting across all endpoints
 */

class ApiResponse {
  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {Object} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static success(
    res,
    data = {},
    message = 'Operation successful',
    statusCode = 200
  ) {
    return res.status(statusCode).json({
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {Object} details - Additional error details
   */
  static error(
    res,
    message = 'Internal server error',
    statusCode = 500,
    details = null
  ) {
    const response = {
      success: false,
      error: {
        code: this.getErrorCode(statusCode),
        message
      },
      timestamp: new Date().toISOString()
    };

    if (details) {
      response.error.details = details;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send paginated response
   * @param {Object} res - Express response object
   * @param {Array} items - Data items
   * @param {Object} pagination - Pagination info
   * @param {string} message - Success message
   */
  static paginated(
    res,
    items,
    pagination,
    message = 'Data retrieved successfully'
  ) {
    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: Math.ceil(pagination.total / pagination.limit),
          hasNext:
            pagination.page < Math.ceil(pagination.total / pagination.limit),
          hasPrev: pagination.page > 1
        }
      },
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send validation error response
   * @param {Object} res - Express response object
   * @param {Array} errors - Validation errors array
   */
  static validationError(res, errors) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'ERR_VALIDATION',
        message: 'Validation failed',
        details: errors
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send authentication error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static unauthorized(res, message = 'Authentication required') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'ERR_UNAUTHORIZED',
        message
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send forbidden error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static forbidden(res, message = 'Access denied') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'ERR_FORBIDDEN',
        message
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send not found error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static notFound(res, message = 'Resource not found') {
    return res.status(404).json({
      success: false,
      error: {
        code: 'ERR_NOT_FOUND',
        message
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get error code based on status code
   * @param {number} statusCode - HTTP status code
   * @returns {string} Error code
   */
  static getErrorCode(statusCode) {
    const errorCodes = {
      400: 'ERR_BAD_REQUEST',
      401: 'ERR_UNAUTHORIZED',
      403: 'ERR_FORBIDDEN',
      404: 'ERR_NOT_FOUND',
      409: 'ERR_CONFLICT',
      422: 'ERR_VALIDATION',
      429: 'ERR_RATE_LIMIT',
      500: 'ERR_INTERNAL_SERVER'
    };

    return errorCodes[statusCode] || 'ERR_UNKNOWN';
  }
}

module.exports = ApiResponse;
