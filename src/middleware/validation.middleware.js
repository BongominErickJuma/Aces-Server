/**
 * Validation Middleware
 * Input validation using express-validator
 */

const { body, param, query } = require('express-validator');
const ApiResponse = require('../utils/response');

/**
 * Middleware to validate profile completion before allowing document operations
 */
const validateProfileCompletion = (req, res, next) => {
  if (!req.user) {
    return ApiResponse.error(res, 'Authentication required', 401);
  }

  if (!req.user.profileCompleted) {
    return ApiResponse.error(
      res,
      'Profile must be completed before performing this action. Please complete your profile first.',
      400
    );
  }

  next();
};

/**
 * Login validation
 */
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),

  body('rememberMe')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be a boolean value')
];

/**
 * Forgot password validation
 */
const validateForgotPassword = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
];

/**
 * Reset password validation
 */
const validateResetPassword = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid reset token format'),

  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    )
];

/**
 * Create user validation
 */
const validateCreateUser = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Full name can only contain letters and spaces'),

  body('password')
    .optional()
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters'),

  body('role')
    .optional()
    .isIn(['admin', 'user'])
    .withMessage('Role must be either admin or user'),

  body('phonePrimary')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number'),

  body('phoneSecondary')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid secondary phone number'),

  body('address')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Address cannot exceed 500 characters'),

  body('emergencyContact')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid emergency contact number'),

  body('sendWelcomeEmail')
    .optional()
    .isBoolean()
    .withMessage('Send welcome email must be a boolean value')
];

/**
 * Update user validation
 */
const validateUpdateUser = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Full name can only contain letters and spaces'),

  body('phonePrimary')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number'),

  body('phoneSecondary')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid secondary phone number'),

  body('address')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Address cannot exceed 500 characters'),

  body('emergencyContact')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid emergency contact number'),

  body('bankDetails.accountNumber')
    .optional()
    .trim()
    .isLength({ min: 5, max: 30 })
    .withMessage('Account number must be between 5 and 30 characters')
    .isAlphanumeric()
    .withMessage('Account number can only contain letters and numbers'),

  body('bankDetails.accountName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Account name must be between 2 and 100 characters'),

  body('bankDetails.bankName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Bank name must be between 2 and 100 characters'),

  body('bankDetails.swiftCode')
    .optional()
    .trim()
    .isLength({ min: 8, max: 11 })
    .withMessage('SWIFT code must be between 8 and 11 characters')
    .isAlphanumeric()
    .withMessage('SWIFT code can only contain letters and numbers'),

  body('bankDetails.branch')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Branch cannot exceed 100 characters'),

  body('mobileMoneyDetails.mtnNumber')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid MTN number'),

  body('mobileMoneyDetails.airtelNumber')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid Airtel number')
];

/**
 * Update user role validation (Admin only)
 */
const validateUpdateUserRole = [
  param('id').isMongoId().withMessage('Invalid user ID'),

  body('role')
    .isIn(['admin', 'user'])
    .withMessage('Role must be either admin or user')
];

/**
 * Update user status validation (Admin only)
 */
const validateUpdateUserStatus = [
  param('id').isMongoId().withMessage('Invalid user ID'),

  body('status')
    .isIn(['active', 'inactive', 'suspended'])
    .withMessage('Status must be active, inactive, or suspended'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

/**
 * MongoDB ObjectId validation
 */
const validateObjectId = [
  param('id').isMongoId().withMessage('Invalid ID format')
];

/**
 * Pagination validation
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),

  query('sort')
    .optional()
    .isIn([
      'createdAt',
      '-createdAt',
      'fullName',
      '-fullName',
      'email',
      '-email',
      'lastLogin',
      '-lastLogin'
    ])
    .withMessage('Invalid sort field'),

  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search term cannot exceed 100 characters')
];

/**
 * User search/filter validation
 */
const validateUserFilters = [
  query('role')
    .optional()
    .isIn(['admin', 'user'])
    .withMessage('Role filter must be admin or user'),

  query('status')
    .optional()
    .isIn(['active', 'inactive', 'suspended'])
    .withMessage('Status filter must be active, inactive, or suspended'),

  query('profileCompleted')
    .optional()
    .isBoolean()
    .withMessage('Profile completed filter must be a boolean value')
    .toBoolean()
];

/**
 * Change password validation
 */
const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),

  body('newPassword')
    .isLength({ min: 6, max: 128 })
    .withMessage('New password must be between 6 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'New password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),

  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match new password');
    }
    return true;
  })
];

module.exports = {
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateCreateUser,
  validateUpdateUser,
  validateUpdateUserRole,
  validateUpdateUserStatus,
  validateObjectId,
  validatePagination,
  validateUserFilters,
  validateChangePassword,
  validateProfileCompletion
};
