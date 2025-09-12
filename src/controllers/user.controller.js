/**
 * User Management Controller
 * Handles user CRUD operations, profile management
 */

const User = require('../models/User.model');
const ApiResponse = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const emailService = require('../services/email.service');

/**
 * Get all users (Admin only)
 * GET /api/users
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = '',
    role = '',
    status = '',
    profileCompleted = '',
    sort = '-createdAt'
  } = req.query;

  // Build filter object
  const filter = {};

  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  if (role) filter.role = role;
  if (status) filter.status = status;
  if (profileCompleted !== '')
    filter.profileCompleted = profileCompleted === 'true';

  // Calculate skip value for pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Get total count for pagination
  const total = await User.countDocuments(filter);

  // Get users with pagination
  const users = await User.find(filter)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate('createdBy', 'fullName email')
    .lean();

  // Add statistics for each user
  const usersWithStats = await Promise.all(
    users.map(async user => {
      // Get user statistics (you can add more aggregations here later)
      const quotationCount = 0; // Will be implemented when quotation model is used
      const receiptCount = 0; // Will be implemented when receipt model is used

      return {
        ...user,
        statistics: {
          quotations: quotationCount,
          receipts: receiptCount,
          totalDocuments: quotationCount + receiptCount
        }
      };
    })
  );

  const pagination = {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
    totalPages: Math.ceil(total / parseInt(limit)),
    hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
    hasPrev: parseInt(page) > 1
  };

  ApiResponse.paginated(
    res,
    usersWithStats,
    pagination,
    'Users retrieved successfully'
  );
});

/**
 * Get user by ID
 * GET /api/users/:id
 */
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('createdBy', 'fullName email role')
    .lean();

  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  // Check permission - users can only view their own profile unless admin
  if (req.user.role !== 'admin' && req.user._id.toString() !== id) {
    return ApiResponse.forbidden(
      res,
      'Access denied. You can only view your own profile'
    );
  }

  // Get user statistics
  const quotationCount = 0; // Will be implemented when quotation model is used
  const receiptCount = 0; // Will be implemented when receipt model is used

  const userWithStats = {
    ...user,
    statistics: {
      quotations: quotationCount,
      receipts: receiptCount,
      totalDocuments: quotationCount + receiptCount
    },
    profileCompletionStatus: {
      isComplete: user.profileCompleted,
      missingFields: user.profileCompleted ? [] : getMissingProfileFields(user)
    }
  };

  ApiResponse.success(
    res,
    { user: userWithStats },
    'User retrieved successfully'
  );
});

/**
 * Create new user (Admin only)
 * POST /api/users
 */
const createUser = asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.validationError(res, errors.array());
  }

  const {
    email,
    fullName,
    password,
    role = 'user',
    phonePrimary,
    phoneSecondary,
    address,
    emergencyContact,
    sendWelcomeEmail = true
  } = req.body;

  // Check if user already exists
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    return ApiResponse.error(res, 'User with this email already exists', 409);
  }

  // Generate temporary password if not provided
  const tempPassword = password || generateTemporaryPassword();

  // Create user
  const userData = {
    email,
    fullName,
    password: tempPassword,
    role,
    phonePrimary,
    phoneSecondary,
    address,
    emergencyContact,
    createdBy: req.user._id,
    status: 'active'
  };

  const user = new User(userData);
  await user.save();

  // Send welcome email if requested
  if (sendWelcomeEmail) {
    try {
      await emailService.sendWelcomeEmail(user, tempPassword, !password); // isTemporary
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the user creation if email fails
    }
  }

  // Return safe user data
  const safeUserData = user.getSafeData();

  ApiResponse.success(
    res,
    {
      user: safeUserData,
      temporaryPassword: !password ? tempPassword : undefined,
      welcomeEmailSent: sendWelcomeEmail
    },
    'User created successfully',
    201
  );
});

/**
 * Update user profile
 * PUT /api/users/:id
 */
const updateUser = asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.validationError(res, errors.array());
  }

  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  // Check permission - users can only update their own profile unless admin
  if (req.user.role !== 'admin' && req.user._id.toString() !== id) {
    return ApiResponse.forbidden(
      res,
      'Access denied. You can only update your own profile'
    );
  }

  // Extract allowed fields for update
  const allowedUpdates = [
    'fullName',
    'phonePrimary',
    'phoneSecondary',
    'address',
    'emergencyContact',
    'bankDetails',
    'mobileMoneyDetails'
  ];

  // Admin can also update role and status
  if (req.user.role === 'admin') {
    allowedUpdates.push('role', 'status');
  }

  // Build update object with only allowed fields
  const updates = {};
  for (const field of allowedUpdates) {
    if (
      Object.prototype.hasOwnProperty.call(req.body, field) &&
      req.body[field] !== undefined
    ) {
      updates[field] = req.body[field];
    }
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true
  }).select(
    '-password -refreshToken -passwordResetToken -passwordResetExpires'
  );

  if (!updatedUser) {
    return ApiResponse.notFound(res, 'User not found');
  }

  const safeUserData = updatedUser.getSafeData();

  ApiResponse.success(
    res,
    {
      user: safeUserData,
      profileCompletionStatus: {
        isComplete: updatedUser.profileCompleted,
        missingFields: updatedUser.profileCompleted
          ? []
          : getMissingProfileFields(updatedUser)
      }
    },
    'User updated successfully'
  );
});

/**
 * Update user profile (current user)
 * PUT /api/users/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.validationError(res, errors.array());
  }

  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  // Extract allowed fields for profile update
  const allowedUpdates = [
    'fullName',
    'phonePrimary',
    'phoneSecondary',
    'address',
    'emergencyContact',
    'bankDetails',
    'mobileMoneyDetails'
  ];

  // Build update object with only allowed fields
  const updates = {};
  for (const field of allowedUpdates) {
    if (
      Object.prototype.hasOwnProperty.call(req.body, field) &&
      req.body[field] !== undefined
    ) {
      updates[field] = req.body[field];
    }
  }

  // Update user profile
  const updatedUser = await User.findByIdAndUpdate(userId, updates, {
    new: true,
    runValidators: true
  }).select(
    '-password -refreshToken -passwordResetToken -passwordResetExpires'
  );

  const safeUserData = updatedUser.getSafeData();

  ApiResponse.success(
    res,
    {
      user: safeUserData,
      profileCompletionStatus: {
        isComplete: updatedUser.profileCompleted,
        missingFields: updatedUser.profileCompleted
          ? []
          : getMissingProfileFields(updatedUser)
      }
    },
    'Profile updated successfully'
  );
});

/**
 * Delete user (Admin only)
 * DELETE /api/users/:id
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  // Prevent admin from deleting themselves
  if (req.user._id.toString() === id) {
    return ApiResponse.error(res, 'You cannot delete your own account', 400);
  }

  // Soft delete - change status to suspended instead of actual deletion
  // This preserves data integrity for documents created by this user
  user.status = 'suspended';
  await user.save();

  ApiResponse.success(res, {}, 'User suspended successfully');
});

/**
 * Change user password (current user)
 * PUT /api/users/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.validationError(res, errors.array());
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.user._id;

  // Get user with password for verification
  const user = await User.findById(userId).select('+password +refreshToken');
  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  // Verify current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return ApiResponse.unauthorized(res, 'Current password is incorrect');
  }

  // Update password and clear refresh tokens to force re-login
  user.password = newPassword;
  user.refreshToken = undefined;
  await user.save();

  // Send confirmation email
  try {
    await emailService.sendPasswordChangedEmail(user);
  } catch (emailError) {
    console.error(
      'Failed to send password change confirmation email:',
      emailError
    );
  }

  ApiResponse.success(
    res,
    {},
    'Password changed successfully. Please login again.'
  );
});

/**
 * Get user statistics
 * GET /api/users/:id/statistics
 */
const getUserStatistics = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  // Check permission
  if (req.user.role !== 'admin' && req.user._id.toString() !== id) {
    return ApiResponse.forbidden(res, 'Access denied');
  }

  // TODO: Implement actual statistics when quotation and receipt models are integrated
  const statistics = {
    documents: {
      quotations: {
        total: 0,
        thisMonth: 0,
        thisWeek: 0
      },
      receipts: {
        total: 0,
        thisMonth: 0,
        thisWeek: 0
      }
    },
    performance: {
      totalDocuments: 0,
      averageDocumentsPerWeek: 0,
      mostActiveDay: 'Monday',
      joinDate: user.createdAt,
      lastActive: user.lastLogin
    }
  };

  ApiResponse.success(
    res,
    { statistics },
    'User statistics retrieved successfully'
  );
});

/**
 * Upload user avatar
 * POST /api/users/upload-avatar
 */
const uploadAvatar = asyncHandler(async (req, res) => {
  // TODO: Implement file upload using Cloudinary
  // This will be implemented when file upload system is created
  ApiResponse.error(res, 'Avatar upload not yet implemented', 501);
});

// Utility Functions

/**
 * Generate temporary password
 * @returns {string} Temporary password
 */
function generateTemporaryPassword() {
  return crypto.randomBytes(8).toString('hex');
}

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
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateProfile,
  deleteUser,
  changePassword,
  getUserStatistics,
  uploadAvatar
};
