/**
 * Authentication Controller
 * Handles user authentication, login, logout, password reset
 */

const User = require('../models/User.model');
const JWTUtils = require('../utils/jwt');
const ApiResponse = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const emailService = require('../services/email.service');

/**
 * User Login
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.validationError(res, errors.array());
  }

  const { email, password, rememberMe = false } = req.body;

  // Find user by email and include password for comparison
  const user = await User.findByEmail(email).select('+password +refreshToken');

  if (!user) {
    return ApiResponse.unauthorized(res, 'Invalid email or password');
  }

  // Check if account is active
  if (user.status !== 'active') {
    return ApiResponse.forbidden(
      res,
      'Account is suspended or inactive. Please contact support.'
    );
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return ApiResponse.unauthorized(res, 'Invalid email or password');
  }

  // Generate token pair
  const tokens = JWTUtils.generateTokenPair(user);

  // Update user's refresh token and last login
  user.refreshToken = JWTUtils.hashToken(tokens.refreshToken);
  user.lastLogin = new Date();
  await user.save();

  // Set refresh token as httpOnly cookie
  const cookieExpiry = rememberMe
    ? 30 * 24 * 60 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000; // 30 days or 7 days
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: cookieExpiry
  });

  // Remove sensitive data before sending response
  const safeUserData = user.getSafeData();

  ApiResponse.success(
    res,
    {
      user: safeUserData,
      tokens: {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType
      },
      sessionInfo: {
        lastLogin: user.lastLogin,
        rememberMe
      }
    },
    'Login successful'
  );
});

/**
 * User Logout
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const refreshToken = req.cookies?.refreshToken;

  if (userId && refreshToken) {
    // Clear refresh token from database
    await User.findByIdAndUpdate(userId, {
      $unset: { refreshToken: 1 }
    });
  }

  // Clear refresh token cookie
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  ApiResponse.success(res, {}, 'Logout successful');
});

/**
 * Refresh Access Token
 * POST /api/auth/refresh
 */
const refresh = asyncHandler(async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return ApiResponse.unauthorized(res, 'Refresh token required');
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = JWTUtils.verifyRefreshToken(refreshToken);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return ApiResponse.unauthorized(res, 'Refresh token has expired. Please login again.');
      }
      if (error.name === 'JsonWebTokenError') {
        return ApiResponse.unauthorized(res, 'Invalid refresh token format');
      }
      throw error;
    }

    // Find user and verify stored refresh token with retry logic for transient connection issues
    let user;
    let retries = 2;
    while (retries > 0) {
      try {
        user = await User.findById(decoded.id).select('+refreshToken');
        break; // Success, exit loop
      } catch (dbError) {
        retries--;
        if (retries === 0 || !dbError.message.includes('ENOTFOUND')) {
          // If no more retries or not a DNS error, throw
          throw dbError;
        }
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!user) {
      return ApiResponse.unauthorized(res, 'User not found');
    }

    if (user.status !== 'active') {
      return ApiResponse.forbidden(res, 'Account is suspended or inactive');
    }

    // Compare refresh token with stored hash
    const tokenHash = JWTUtils.hashToken(refreshToken);

    // If user has no stored refresh token, they need to login again
    if (!user.refreshToken) {
      return ApiResponse.unauthorized(res, 'Session expired. Please login again.');
    }

    if (user.refreshToken !== tokenHash) {
      return ApiResponse.unauthorized(res, 'Invalid refresh token. Please login again.');
    }

    // Generate new token pair
    const tokens = JWTUtils.generateTokenPair(user);

    // Update refresh token in database
    user.refreshToken = JWTUtils.hashToken(tokens.refreshToken);
    await user.save();

    // Set new refresh token as cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    ApiResponse.success(
      res,
      {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType
      },
      'Token refreshed successfully'
    );
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return ApiResponse.unauthorized(res, 'Invalid or expired refresh token');
    }
    throw error;
  }
});

/**
 * Forgot Password
 * POST /api/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.validationError(res, errors.array());
  }

  const { email } = req.body;

  let user;
  try {
    user = await User.findByEmail(email);

    if (!user) {
      // Don't reveal if email exists for security
      return ApiResponse.success(
        res,
        {},
        'If the email exists, a password reset link has been sent'
      );
    }

    if (user.status !== 'active') {
      return ApiResponse.forbidden(
        res,
        'Account is suspended. Please contact support.'
      );
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save();

    // Send password reset email using email service
    await emailService.sendPasswordResetEmail(user, resetToken);

    ApiResponse.success(
      res,
      {},
      'If the email exists, a password reset link has been sent'
    );
  } catch (error) {
    // Clear reset token if email fails
    if (user && user.passwordResetToken) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
    }
    throw error;
  }
});

/**
 * Reset Password
 * POST /api/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.validationError(res, errors.array());
  }

  const { token, password } = req.body;

  // Hash the token to match database storage
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user with valid reset token
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) {
    return ApiResponse.error(
      res,
      'Invalid or expired password reset token',
      400
    );
  }

  if (user.status !== 'active') {
    return ApiResponse.forbidden(
      res,
      'Account is suspended. Please contact support.'
    );
  }

  // Set new password and clear reset tokens
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken = undefined; // Invalidate existing sessions

  await user.save();

  // Send password changed confirmation email using email service
  await emailService.sendPasswordChangedEmail(user);

  ApiResponse.success(
    res,
    {},
    'Password reset successful. Please login with your new password.'
  );
});

/**
 * Get Current User Profile
 * GET /api/auth/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return ApiResponse.notFound(res, 'User not found');
  }

  const safeUserData = user.getSafeData();

  ApiResponse.success(
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
    'Profile retrieved successfully'
  );
});

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
  login,
  logout,
  refresh,
  forgotPassword,
  resetPassword,
  getProfile
};
