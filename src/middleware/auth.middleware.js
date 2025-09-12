/**
 * Authentication Middleware
 * Handles JWT token verification and user authentication
 */

const User = require('../models/User.model');
const JWTUtils = require('../utils/jwt');
const ApiResponse = require('../utils/response');
const { asyncHandler } = require('./errorHandler.middleware');

/**
 * Middleware to authenticate requests using JWT tokens
 * Verifies the Bearer token in Authorization header
 */
const authenticate = asyncHandler(async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const token = JWTUtils.extractTokenFromHeader(req);

    if (!token) {
      return ApiResponse.unauthorized(res, 'Access token required');
    }

    // Verify the token
    const decoded = JWTUtils.verifyAccessToken(token);

    // Get user from database and attach to request
    const user = await User.findById(decoded.id).select(
      '-password -refreshToken'
    );

    if (!user) {
      return ApiResponse.unauthorized(res, 'User not found');
    }

    if (user.status !== 'active') {
      return ApiResponse.forbidden(res, 'Account is suspended or inactive');
    }

    // Attach user to request object
    req.user = user;
    req.tokenPayload = decoded;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return ApiResponse.unauthorized(res, 'Invalid token');
    }

    if (error.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, 'Token expired');
    }

    throw error;
  }
});

/**
 * Middleware to require specific role(s)
 * Must be used after authenticate middleware
 * @param {string|Array} roles - Required role(s)
 */
const requireRole = roles => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(req.user.role)) {
      return ApiResponse.forbidden(
        res,
        `Access denied. Required role: ${allowedRoles.join(' or ')}`
      );
    }

    next();
  });
};

/**
 * Middleware to require admin role
 * Shorthand for requireRole('admin')
 */
const requireAdmin = requireRole('admin');

/**
 * Optional authentication middleware
 * Attaches user to request if valid token present, but doesn't fail if no token
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  try {
    const token = JWTUtils.extractTokenFromHeader(req);

    if (!token) {
      return next();
    }

    const decoded = JWTUtils.verifyAccessToken(token);
    const user = await User.findById(decoded.id).select(
      '-password -refreshToken'
    );

    if (user && user.status === 'active') {
      req.user = user;
      req.tokenPayload = decoded;
    }

    next();
  } catch (error) {
    // For optional auth, ignore token errors and continue
    next();
  }
});

/**
 * Middleware to ensure user profile is complete
 * Must be used after authenticate middleware
 */
const requireCompleteProfile = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return ApiResponse.unauthorized(res, 'Authentication required');
  }

  if (!req.user.profileCompleted) {
    return ApiResponse.forbidden(
      res,
      'Please complete your profile before accessing this feature',
      {
        profileUrl: '/profile',
        missingFields: getMissingProfileFields(req.user)
      }
    );
  }

  next();
});

/**
 * Middleware to check resource ownership
 * Allows access if user is admin or owns the resource
 * @param {string} resourceUserField - Field name containing user ID in resource
 */
const requireOwnershipOrAdmin = (resourceUserField = 'createdBy') => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    // Admins can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    // For regular users, check ownership
    // This assumes the resource is attached to req object by previous middleware
    const resource = req.resource || req.document || req.item;

    if (!resource) {
      return ApiResponse.error(
        res,
        'Resource not found for ownership check',
        500
      );
    }

    const resourceUserId = resource[resourceUserField]?.toString();
    const currentUserId = req.user._id.toString();

    if (resourceUserId !== currentUserId) {
      return ApiResponse.forbidden(
        res,
        'Access denied. You can only access your own resources'
      );
    }

    next();
  });
};

/**
 * Middleware for rate limiting specific to authenticated users
 * Tracks attempts per user rather than per IP
 */
const authRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
  const attempts = new Map();

  return asyncHandler(async (req, res, next) => {
    const userId = req.user?._id?.toString() || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    if (attempts.has(userId)) {
      const userAttempts = attempts.get(userId);
      const validAttempts = userAttempts.filter(time => time > windowStart);
      attempts.set(userId, validAttempts);
    }

    const currentAttempts = attempts.get(userId) || [];

    if (currentAttempts.length >= max) {
      return ApiResponse.error(res, 'Rate limit exceeded', 429, {
        retryAfter: Math.ceil((currentAttempts[0] + windowMs - now) / 1000)
      });
    }

    currentAttempts.push(now);
    attempts.set(userId, currentAttempts);

    next();
  });
};

/**
 * Get missing profile fields for a user
 * @param {Object} user - User object
 * @returns {Array} Array of missing required fields
 */
function getMissingProfileFields(user) {
  const requiredFields = [
    { field: 'fullName', value: user.fullName },
    { field: 'email', value: user.email },
    { field: 'phonePrimary', value: user.phonePrimary },
    { field: 'emergencyContact', value: user.emergencyContact },
    {
      field: 'bankDetails.accountNumber',
      value: user.bankDetails?.accountNumber
    },
    { field: 'bankDetails.accountName', value: user.bankDetails?.accountName },
    { field: 'bankDetails.bankName', value: user.bankDetails?.bankName }
  ];

  return requiredFields
    .filter(item => !item.value || item.value.trim().length === 0)
    .map(item => item.field);
}

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  optionalAuth,
  requireCompleteProfile,
  requireOwnershipOrAdmin,
  authRateLimit
};
