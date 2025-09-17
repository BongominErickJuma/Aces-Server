/**
 * Upload Routes
 * Handles all file upload endpoints
 */

const express = require('express');
const router = express.Router();

const {
  uploadProfilePhoto,
  uploadCompanyLogo,
  uploadCompanyStamp,
  deleteProfilePhoto,
  deleteUploadedFile,
  getUploadStats,
  getOptimizedUrl,
  getProfilePhotoUrls
} = require('../controllers/upload.controller');

const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

const {
  uploadProfilePhoto: uploadProfilePhotoMiddleware,
  uploadCompanyLogo: uploadCompanyLogoMiddleware,
  uploadCompanyStamp: uploadCompanyStampMiddleware
} = require('../middleware/upload.middleware');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route POST /api/uploads/profile-photo
 * @desc Upload user profile photo
 * @access Private
 */
router.post('/profile-photo', uploadProfilePhotoMiddleware, uploadProfilePhoto);

/**
 * @route DELETE /api/uploads/profile-photo
 * @desc Delete user profile photo
 * @access Private
 */
router.delete('/profile-photo', deleteProfilePhoto);

/**
 * @route GET /api/uploads/profile-photo/:userId?
 * @desc Get user profile photo URLs
 * @access Private
 */
router.get('/profile-photo/:userId?', getProfilePhotoUrls);

/**
 * @route POST /api/uploads/company/logo
 * @desc Upload company logo
 * @access Admin only
 */
router.post(
  '/company/logo',
  requireAdmin,
  uploadCompanyLogoMiddleware,
  uploadCompanyLogo
);

/**
 * @route POST /api/uploads/company/stamp
 * @desc Upload company stamp/seal
 * @access Admin only
 */
router.post(
  '/company/stamp',
  requireAdmin,
  uploadCompanyStampMiddleware,
  uploadCompanyStamp
);

/**
 * @route DELETE /api/uploads/:publicId
 * @desc Delete uploaded file by public ID
 * @access Private (Own files) / Admin (Any file)
 * @query resourceType - Type of resource (image, video, raw, etc.)
 */
router.delete('/:publicId', deleteUploadedFile);

/**
 * @route GET /api/uploads/stats
 * @desc Get upload statistics
 * @access Admin only
 * @query folder - Folder to get stats for
 */
router.get('/stats', requireAdmin, getUploadStats);

/**
 * @route GET /api/uploads/optimize/:publicId
 * @desc Get optimized image URL
 * @access Private
 * @query width, height, crop, quality, format
 */
router.get('/optimize/:publicId', getOptimizedUrl);

module.exports = router;
