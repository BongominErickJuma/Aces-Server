/**
 * User Management Routes
 * Handles user CRUD operations and profile management
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Import controllers and middleware
const userController = require('../controllers/user.controller');
const {
  authenticate,
  requireAdmin,
  requireOwnershipOrAdmin
} = require('../middleware/auth.middleware');
const {
  validateCreateUser,
  validateUpdateUser,
  validateObjectId,
  validatePagination,
  validateUserFilters,
  validateChangePassword
} = require('../middleware/validation.middleware');

// Rate limiting for user operations
const userOperationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window for authenticated users
  message: {
    success: false,
    error: {
      code: 'ERR_RATE_LIMIT',
      message: 'Too many requests, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

const passwordChangeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password changes per hour
  message: {
    success: false,
    error: {
      code: 'ERR_RATE_LIMIT',
      message: 'Too many password change attempts, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * GET /api/users
 * Get all users with pagination and filtering (Admin only)
 */
router.get(
  '/',
  authenticate,
  requireAdmin,
  userOperationRateLimit,
  validatePagination,
  validateUserFilters,
  userController.getAllUsers
);

/**
 * GET /api/users/profile
 * Get current user's profile (uses auth controller's getProfile)
 */
router.get(
  '/profile',
  authenticate,
  userOperationRateLimit,
  require('../controllers/auth.controller').getProfile
);

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put(
  '/profile',
  authenticate,
  userOperationRateLimit,
  validateUpdateUser,
  userController.updateProfile
);

/**
 * PUT /api/users/change-password
 * Change current user's password
 */
router.put(
  '/change-password',
  authenticate,
  passwordChangeRateLimit,
  validateChangePassword,
  userController.changePassword
);

/**
 * POST /api/users/upload-avatar
 * Upload user avatar (current user)
 */
router.post(
  '/upload-avatar',
  authenticate,
  userOperationRateLimit,
  userController.uploadAvatar
);

/**
 * GET /api/users/:id
 * Get user by ID (Admin or own profile)
 */
router.get(
  '/:id',
  authenticate,
  userOperationRateLimit,
  validateObjectId,
  userController.getUserById
);

/**
 * POST /api/users
 * Create new user (Admin only)
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  userOperationRateLimit,
  validateCreateUser,
  userController.createUser
);

/**
 * PUT /api/users/:id
 * Update user by ID (Admin or own profile)
 */
router.put(
  '/:id',
  authenticate,
  userOperationRateLimit,
  validateObjectId,
  validateUpdateUser,
  userController.updateUser
);

/**
 * DELETE /api/users/:id
 * Delete/suspend user (Admin only)
 */
router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  userOperationRateLimit,
  validateObjectId,
  userController.deleteUser
);

/**
 * GET /api/users/:id/statistics
 * Get user statistics (Admin or own statistics)
 */
router.get(
  '/:id/statistics',
  authenticate,
  userOperationRateLimit,
  validateObjectId,
  userController.getUserStatistics
);

module.exports = router;
