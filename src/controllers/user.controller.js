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
    limit = 10,
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

  // Trigger notification for new user creation - notify all users
  try {
    const Notification = require('../models/Notification.model');
    const allUsers = await User.find({ status: 'active' });
    const allUserIds = allUsers.map(u => u._id);

    await Notification.createUserNotification(
      'user_created',
      user.fullName,
      user._id,
      req.user._id,
      allUserIds
    );

    // Also notify user to complete profile if incomplete
    if (!user.profileCompleted) {
      await Notification.createUserNotification(
        'profile_incomplete',
        user.fullName,
        user._id,
        null,
        [user._id]
      );
    }
  } catch (notifError) {
    console.error('Failed to trigger user creation notification:', notifError);
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
    'emergencyContact'
  ];

  // Admin can also update role and status
  if (req.user.role === 'admin') {
    allowedUpdates.push('role', 'status');
  }

  // Build update object with only allowed fields
  const updates = {};
  const previousValues = {};
  for (const field of allowedUpdates) {
    if (
      Object.prototype.hasOwnProperty.call(req.body, field) &&
      req.body[field] !== undefined
    ) {
      // Store previous value if it's different
      if (user[field] !== req.body[field]) {
        previousValues[field] = user[field];
        updates[field] = req.body[field];
      }
    }
  }

  // Only proceed if there are actual changes
  if (Object.keys(updates).length === 0) {
    const safeUserData = user.getSafeData();
    return ApiResponse.success(
      res,
      {
        user: safeUserData,
        profileCompletionStatus: {
          isComplete: user.profileCompleted,
          missingFields: user.profileCompleted
            ? []
            : getMissingProfileFields(user)
        }
      },
      'No changes to update'
    );
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true
  }).select(
    '-password -refreshToken -passwordResetToken -passwordResetExpires'
  );

  // Create detailed notification for profile changes
  if (Object.keys(previousValues).length > 0) {
    try {
      const Notification = require('../models/Notification.model');
      const admins = await User.find({ role: 'admin', status: 'active' });
      const adminIds = admins.map(admin => admin._id);

      // Create detailed field changes
      const changes = Object.entries(updates).map(([field, newValue]) => {
        const oldValue = previousValues[field] || 'Not set';
        const fieldMappings = {
          fullName: 'Full Name',
          phonePrimary: 'Primary Phone',
          phoneSecondary: 'Secondary Phone',
          address: 'Address',
          emergencyContact: 'Emergency Contact',
          role: 'Role',
          status: 'Status'
        };
        const fieldLabel = fieldMappings[field] || field;
        return {
          field: fieldLabel,
          oldValue: oldValue,
          newValue: newValue
        };
      });

      await Notification.createUserNotificationWithDetails(
        'user_updated',
        updatedUser.fullName,
        updatedUser._id,
        req.user._id,
        adminIds,
        changes
      );
    } catch (notifError) {
      console.error('Failed to create user update notification:', notifError);
    }
  }

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
    'emergencyContact'
  ];

  // Build update object with only allowed fields
  const updates = {};
  const previousValues = {};
  for (const field of allowedUpdates) {
    if (
      Object.prototype.hasOwnProperty.call(req.body, field) &&
      req.body[field] !== undefined
    ) {
      // Store previous value if it's different
      if (user[field] !== req.body[field]) {
        previousValues[field] = user[field];
        updates[field] = req.body[field];
      }
    }
  }

  // Only proceed if there are actual changes
  if (Object.keys(updates).length === 0) {
    const safeUserData = user.getSafeData();
    return ApiResponse.success(
      res,
      {
        user: safeUserData,
        profileCompletionStatus: {
          isComplete: user.profileCompleted,
          missingFields: user.profileCompleted
            ? []
            : getMissingProfileFields(user)
        }
      },
      'No changes to update'
    );
  }

  // Update user profile
  const updatedUser = await User.findByIdAndUpdate(userId, updates, {
    new: true,
    runValidators: true
  }).select(
    '-password -refreshToken -passwordResetToken -passwordResetExpires'
  );

  // Create detailed notification for profile changes
  if (Object.keys(previousValues).length > 0) {
    try {
      const Notification = require('../models/Notification.model');
      const admins = await User.find({ role: 'admin', status: 'active' });
      const adminIds = admins.map(admin => admin._id);

      // Create detailed field changes
      const changes = Object.entries(updates).map(([field, newValue]) => {
        const oldValue = previousValues[field] || 'Not set';
        const fieldMappings = {
          fullName: 'Full Name',
          phonePrimary: 'Primary Phone',
          phoneSecondary: 'Secondary Phone',
          address: 'Address',
          emergencyContact: 'Emergency Contact'
        };
        const fieldLabel = fieldMappings[field] || field;
        return {
          field: fieldLabel,
          oldValue: oldValue,
          newValue: newValue
        };
      });

      await Notification.createUserNotificationWithDetails(
        'user_updated',
        updatedUser.fullName,
        updatedUser._id,
        req.user._id,
        adminIds,
        changes
      );
    } catch (notifError) {
      console.error(
        'Failed to create user profile update notification:',
        notifError
      );
    }
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
  const userName = user.fullName;
  user.status = 'suspended';
  await user.save();

  // Trigger suspension notification to all users
  try {
    const Notification = require('../models/Notification.model');
    const allUsers = await User.find({ status: 'active' });
    const allUserIds = allUsers.map(u => u._id);

    await Notification.createUserSuspensionNotification(
      'user_suspended',
      userName,
      id,
      req.user._id,
      allUserIds
    );
  } catch (notifError) {
    console.error('Failed to trigger suspension notification:', notifError);
  }

  ApiResponse.success(res, {}, 'User suspended successfully');
});

/**
 * Permanently delete user (Admin only)
 * DELETE /api/users/:id/permanent
 */
const deleteUserPermanently = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  // Prevent admin from deleting themselves
  if (req.user._id.toString() === id) {
    return ApiResponse.error(res, 'You cannot delete your own account', 400);
  }

  // Store user name before deletion
  const userName = user.fullName;

  // Permanent deletion - actually remove the user from database
  await User.findByIdAndDelete(id);

  // Trigger deletion notification to all users
  try {
    const Notification = require('../models/Notification.model');
    const allUsers = await User.find({ status: 'active' });
    const allUserIds = allUsers.map(u => u._id);

    await Notification.createUserSuspensionNotification(
      'user_deleted',
      userName,
      id,
      req.user._id,
      allUserIds
    );
  } catch (notifError) {
    console.error('Failed to trigger deletion notification:', notifError);
  }

  ApiResponse.success(res, {}, 'User permanently deleted successfully');
});

/**
 * Bulk permanently delete users (Admin only)
 * DELETE /api/users/bulk-delete
 */
const bulkDeleteUsersPermanently = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return ApiResponse.error(
      res,
      'User IDs are required and must be an array',
      400
    );
  }

  // Filter out current user to prevent self-deletion
  const currentUserId = req.user._id.toString();
  const filteredUserIds = userIds.filter(id => id.toString() !== currentUserId);

  if (filteredUserIds.length === 0) {
    return ApiResponse.error(res, 'No valid users to delete', 400);
  }

  // Find users to verify they exist and get their names
  const users = await User.find({ _id: { $in: filteredUserIds } });

  if (users.length === 0) {
    return ApiResponse.error(res, 'No users found with the provided IDs', 404);
  }

  // Store user information before deletion
  const userInfo = users.map(u => ({ id: u._id, name: u.fullName }));

  // Permanently delete all users
  const deleteResult = await User.deleteMany({ _id: { $in: filteredUserIds } });

  // Trigger deletion notifications for each user
  if (deleteResult.deletedCount > 0) {
    try {
      const Notification = require('../models/Notification.model');
      const allUsers = await User.find({ status: 'active' });
      const allUserIds = allUsers.map(u => u._id);

      // Create notifications for each deleted user
      for (const user of userInfo) {
        await Notification.createUserSuspensionNotification(
          'user_deleted',
          user.name,
          user.id,
          req.user._id,
          allUserIds
        );
      }
    } catch (notifError) {
      console.error(
        'Failed to trigger bulk deletion notifications:',
        notifError
      );
    }
  }

  ApiResponse.success(
    res,
    {
      deletedCount: deleteResult.deletedCount,
      requestedCount: userIds.length,
      foundCount: users.length,
      skippedCurrentUser: userIds.length !== filteredUserIds.length
    },
    `Successfully deleted ${deleteResult.deletedCount} user(s) permanently`
  );
});

/**
 * Bulk suspend users (Admin only)
 * POST /api/users/bulk-suspend
 */
const bulkSuspendUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return ApiResponse.error(
      res,
      'User IDs are required and must be an array',
      400
    );
  }

  // Filter out current user to prevent self-suspension
  const currentUserId = req.user._id.toString();
  const filteredUserIds = userIds.filter(id => id.toString() !== currentUserId);

  if (filteredUserIds.length === 0) {
    return ApiResponse.error(res, 'No valid users to suspend', 400);
  }

  // Find users to verify they exist
  const users = await User.find({ _id: { $in: filteredUserIds } });

  if (users.length === 0) {
    return ApiResponse.error(res, 'No users found with the provided IDs', 404);
  }

  // Suspend all users by updating their status
  const updateResult = await User.updateMany(
    { _id: { $in: filteredUserIds } },
    { status: 'suspended' }
  );

  // Trigger suspension notifications for each user
  if (updateResult.modifiedCount > 0) {
    try {
      const Notification = require('../models/Notification.model');
      const allUsers = await User.find({ status: 'active' });
      const allUserIds = allUsers.map(u => u._id);

      // Create notifications for each suspended user
      for (const user of users) {
        if (filteredUserIds.includes(user._id.toString())) {
          await Notification.createUserSuspensionNotification(
            'user_suspended',
            user.fullName,
            user._id,
            req.user._id,
            allUserIds
          );
        }
      }
    } catch (notifError) {
      console.error(
        'Failed to trigger bulk suspension notifications:',
        notifError
      );
    }
  }

  ApiResponse.success(
    res,
    {
      suspendedCount: updateResult.modifiedCount,
      requestedCount: userIds.length,
      foundCount: users.length,
      skippedCurrentUser: userIds.length !== filteredUserIds.length
    },
    `Successfully suspended ${updateResult.modifiedCount} user(s)`
  );
});

/**
 * Bulk reactivate users (Admin only)
 * POST /api/users/bulk-reactivate
 */
const bulkReactivateUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return ApiResponse.error(
      res,
      'User IDs are required and must be an array',
      400
    );
  }

  // Filter out current user (though it's less critical for reactivation)
  const currentUserId = req.user._id.toString();
  const filteredUserIds = userIds.filter(id => id.toString() !== currentUserId);

  if (filteredUserIds.length === 0) {
    return ApiResponse.error(res, 'No valid users to reactivate', 400);
  }

  // Find users to verify they exist
  const users = await User.find({ _id: { $in: filteredUserIds } });

  if (users.length === 0) {
    return ApiResponse.error(res, 'No users found with the provided IDs', 404);
  }

  // Reactivate all users by updating their status to active
  const updateResult = await User.updateMany(
    { _id: { $in: filteredUserIds } },
    { status: 'active' }
  );

  // Trigger reactivation notifications for each user
  if (updateResult.modifiedCount > 0) {
    try {
      const Notification = require('../models/Notification.model');
      const allUsers = await User.find({ status: 'active' });
      const allUserIds = allUsers.map(u => u._id);

      // Create notifications for each reactivated user
      for (const user of users) {
        if (filteredUserIds.includes(user._id.toString())) {
          await Notification.createUserSuspensionNotification(
            'user_reactivated',
            user.fullName,
            user._id,
            req.user._id,
            allUserIds
          );
        }
      }
    } catch (notifError) {
      console.error(
        'Failed to trigger bulk reactivation notifications:',
        notifError
      );
    }
  }

  ApiResponse.success(
    res,
    {
      reactivatedCount: updateResult.modifiedCount,
      requestedCount: userIds.length,
      foundCount: users.length,
      skippedCurrentUser: userIds.length !== filteredUserIds.length
    },
    `Successfully reactivated ${updateResult.modifiedCount} user(s)`
  );
});

/**
 * Reactivate user (Admin only)
 * PUT /api/users/:id/reactivate
 */
const reactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  if (user.status === 'active') {
    return ApiResponse.error(res, 'User is already active', 400);
  }

  // Reactivate user
  const userName = user.fullName;
  user.status = 'active';
  await user.save();

  // Trigger reactivation notification to all users
  try {
    const Notification = require('../models/Notification.model');
    const allUsers = await User.find({ status: 'active' });
    const allUserIds = allUsers.map(u => u._id);

    await Notification.createUserSuspensionNotification(
      'user_reactivated',
      userName,
      id,
      req.user._id,
      allUserIds
    );
  } catch (notifError) {
    console.error('Failed to trigger reactivation notification:', notifError);
  }

  const safeUserData = user.getSafeData();

  ApiResponse.success(
    res,
    { user: safeUserData },
    'User reactivated successfully'
  );
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

  // Import the models
  const Quotation = require('../models/Quotation.model');
  const Receipt = require('../models/Receipt.model');

  // Get current date ranges
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // Fetch quotation statistics
  const [totalQuotations, monthQuotations, weekQuotations] = await Promise.all([
    Quotation.countDocuments({ createdBy: id }),
    Quotation.countDocuments({
      createdBy: id,
      createdAt: { $gte: startOfMonth }
    }),
    Quotation.countDocuments({
      createdBy: id,
      createdAt: { $gte: startOfWeek }
    })
  ]);

  // Fetch receipt statistics
  const [totalReceipts, monthReceipts, weekReceipts] = await Promise.all([
    Receipt.countDocuments({ createdBy: id }),
    Receipt.countDocuments({
      createdBy: id,
      createdAt: { $gte: startOfMonth }
    }),
    Receipt.countDocuments({
      createdBy: id,
      createdAt: { $gte: startOfWeek }
    })
  ]);

  // Calculate performance metrics
  const totalDocuments = totalQuotations + totalReceipts;
  const userAgeInWeeks = Math.max(
    1,
    Math.floor((now - new Date(user.createdAt)) / (7 * 24 * 60 * 60 * 1000))
  );
  const averageDocumentsPerWeek =
    Math.round((totalDocuments / userAgeInWeeks) * 100) / 100;

  // Get most active day of the week
  const documentsByDay = await Promise.all([
    Quotation.aggregate([
      { $match: { createdBy: user._id } },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          count: { $sum: 1 }
        }
      }
    ]),
    Receipt.aggregate([
      { $match: { createdBy: user._id } },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  // Combine and find most active day
  const dayActivity = {};
  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];

  documentsByDay.forEach(docs => {
    docs.forEach(day => {
      const dayName = dayNames[day._id - 1] || 'Monday';
      dayActivity[dayName] = (dayActivity[dayName] || 0) + day.count;
    });
  });

  const mostActiveDay =
    Object.keys(dayActivity).length > 0
      ? Object.entries(dayActivity).reduce((a, b) => (a[1] > b[1] ? a : b))[0]
      : 'No activity yet';

  const statistics = {
    documents: {
      quotations: {
        total: totalQuotations,
        thisMonth: monthQuotations,
        thisWeek: weekQuotations
      },
      receipts: {
        total: totalReceipts,
        thisMonth: monthReceipts,
        thisWeek: weekReceipts
      }
    },
    performance: {
      totalDocuments,
      averageDocumentsPerWeek,
      mostActiveDay,
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
  const userId = req.user._id;

  if (!req.file) {
    return ApiResponse.error(res, 'No avatar file provided', 400);
  }

  try {
    const uploadService = require('../services/upload.service');
    const user = await User.findById(userId);

    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Delete previous avatar if it exists and is not the default
    if (user.profilePhoto?.publicId && user.profilePhoto.publicId !== 'default_wiyefz') {
      try {
        await uploadService.deleteFile(user.profilePhoto.publicId);
      } catch (deleteError) {
        console.warn('Failed to delete previous avatar:', deleteError.message);
      }
    }

    // Generate unique filename for user avatar
    const filename = `avatar_${userId}_${Date.now()}`;

    // Upload new avatar to Cloudinary
    const uploadResult = await uploadService.uploadFile(
      req.file.buffer,
      filename,
      'avatars',
      {
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'face',
        quality: 'auto',
        format: 'webp'
      }
    );

    // Update user profile photo data
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        profilePhoto: {
          publicId: uploadResult.publicId,
          url: uploadResult.url,
          originalName: req.file.originalname,
          uploadedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    ).select('-password -refreshToken -passwordResetToken -passwordResetExpires');

    if (!updatedUser) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Create notification for avatar update
    try {
      const Notification = require('../models/Notification.model');
      const admins = await User.find({ role: 'admin', status: 'active' });
      const adminIds = admins.map(admin => admin._id);

      await Notification.createUserNotification(
        'user_updated',
        updatedUser.fullName,
        updatedUser._id,
        req.user._id,
        adminIds
      );
    } catch (notifError) {
      console.error('Failed to create avatar update notification:', notifError);
    }

    const safeUserData = updatedUser.getSafeData();

    ApiResponse.success(
      res,
      {
        user: safeUserData,
        profilePhoto: {
          publicId: uploadResult.publicId,
          url: uploadResult.url,
          originalName: req.file.originalname,
          uploadedAt: new Date()
        }
      },
      'Avatar uploaded successfully'
    );
  } catch (error) {
    console.error('Avatar upload error:', error);
    ApiResponse.error(res, 'Failed to upload avatar', 500);
  }
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
    { field: 'emergencyContact', value: user.emergencyContact }
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
  deleteUserPermanently,
  bulkDeleteUsersPermanently,
  bulkSuspendUsers,
  bulkReactivateUsers,
  reactivateUser,
  changePassword,
  getUserStatistics,
  uploadAvatar
};
