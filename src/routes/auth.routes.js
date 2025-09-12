/**
 * Authentication Routes
 * Handles user authentication endpoints
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Import controllers and middleware
const authController = require('../controllers/auth.controller');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');
const {
  validateLogin,
  validateForgotPassword,
  validateResetPassword
} = require('../middleware/validation.middleware');

// Rate limiting for authentication endpoints
// const authRateLimit = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 15, // 15 attempts per window
//   message: {
//     success: false,
//     error: {
//       code: 'ERR_RATE_LIMIT',
//       message: 'Too many authentication attempts, please try again later'
//     }
//   },
//   standardHeaders: true,
//   legacyHeaders: false
// });
const authRateLimit = (req, res, next) => next(); // Disabled for now

// const passwordResetRateLimit = rateLimit({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 3, // 3 attempts per hour
//   message: {
//     success: false,
//     error: {
//       code: 'ERR_RATE_LIMIT',
//       message: 'Too many password reset attempts, please try again later'
//     }
//   },
//   standardHeaders: true,
//   legacyHeaders: false
// });
const passwordResetRateLimit = (req, res, next) => next(); // Disabled for now

/**
 * POST /api/auth/login
 * User login endpoint
 */
router.post('/login', authRateLimit, validateLogin, authController.login);

/**
 * POST /api/auth/logout
 * User logout endpoint (requires authentication)
 */
router.post('/logout', optionalAuth, authController.logout);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token from cookies
 */
router.post('/refresh', authController.refresh);

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post(
  '/forgot-password',
  passwordResetRateLimit,
  validateForgotPassword,
  authController.forgotPassword
);

/**
 * POST /api/auth/reset-password
 * Reset password using token from email
 */
router.post(
  '/reset-password',
  validateResetPassword,
  authController.resetPassword
);

/**
 * GET /api/auth/profile
 * Get current user profile (requires authentication)
 */
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;
