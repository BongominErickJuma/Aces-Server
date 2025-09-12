/**
 * Upload Controller
 * Handles all file upload operations
 */

const User = require('../models/User.model');
const uploadService = require('../services/upload.service');
const ApiResponse = require('../utils/response');

/**
 * Upload user profile photo
 */
const uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
      return ApiResponse.error(res, 'No file provided', 400);
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Delete old profile photo if exists
    if (user.profilePhoto && user.profilePhoto.publicId) {
      try {
        await uploadService.deleteFile(user.profilePhoto.publicId);
      } catch (error) {
        console.warn('Failed to delete old profile photo:', error.message);
      }
    }

    // Upload to Cloudinary
    const uploadResult = await uploadService.uploadFile(
      file.buffer,
      `profile_${userId}_${Date.now()}`,
      'profiles',
      {
        transformation: [
          { width: 500, height: 500, crop: 'fill', quality: 'auto' },
          { format: 'webp' }
        ]
      }
    );

    // Process the result
    const processedResult = uploadService.processUploadResult(
      file,
      uploadResult
    );

    // Update user profile
    user.profilePhoto = {
      publicId: processedResult.publicId,
      url: processedResult.url,
      originalName: processedResult.originalName,
      uploadedAt: processedResult.uploadedAt
    };

    await user.save();

    // Get optimized URLs
    const avatarUrls = {
      small: uploadService.getAvatarUrl(processedResult.publicId, 50),
      medium: uploadService.getAvatarUrl(processedResult.publicId, 150),
      large: uploadService.getAvatarUrl(processedResult.publicId, 300),
      original: processedResult.url
    };

    return ApiResponse.success(
      res,
      {
        profilePhoto: {
          ...user.profilePhoto.toObject(),
          urls: avatarUrls
        }
      },
      'Profile photo uploaded successfully',
      201
    );
  } catch (error) {
    console.error('Upload profile photo error:', error);
    return ApiResponse.error(res, 'Failed to upload profile photo', 500);
  }
};

/**
 * Upload company logo
 */
const uploadCompanyLogo = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return ApiResponse.error(res, 'No file provided', 400);
    }

    // Upload to Cloudinary
    const uploadResult = await uploadService.uploadFile(
      file.buffer,
      `logo_${Date.now()}`,
      'company/logos',
      {
        transformation: [
          { width: 800, height: 400, crop: 'fit', quality: 'auto' },
          { format: 'webp' }
        ]
      }
    );

    // Process the result
    const processedResult = uploadService.processUploadResult(
      file,
      uploadResult
    );

    // Get optimized URLs for different use cases
    const logoUrls = {
      header: uploadService.getLogoUrl(processedResult.publicId, {
        width: 200,
        height: 60,
        crop: 'fit'
      }),
      document: uploadService.getLogoUrl(processedResult.publicId, {
        width: 400,
        height: 150,
        crop: 'fit'
      }),
      large: uploadService.getLogoUrl(processedResult.publicId, {
        width: 800,
        height: 300,
        crop: 'fit'
      }),
      original: processedResult.url
    };

    // Store logo information (you might want to save this to a Company model)
    const logoData = {
      publicId: processedResult.publicId,
      url: processedResult.url,
      originalName: processedResult.originalName,
      uploadedAt: processedResult.uploadedAt,
      uploadedBy: req.user.id,
      urls: logoUrls
    };

    return ApiResponse.success(
      res,
      {
        logo: logoData
      },
      'Company logo uploaded successfully',
      201
    );
  } catch (error) {
    console.error('Upload company logo error:', error);
    return ApiResponse.error(res, 'Failed to upload company logo', 500);
  }
};

/**
 * Upload company stamp/seal
 */
const uploadCompanyStamp = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return ApiResponse.error(res, 'No file provided', 400);
    }

    // Upload to Cloudinary
    const uploadResult = await uploadService.uploadFile(
      file.buffer,
      `stamp_${Date.now()}`,
      'company/stamps',
      {
        transformation: [
          { width: 300, height: 300, crop: 'fit', quality: 'auto' },
          { format: 'webp' }
        ]
      }
    );

    // Process the result
    const processedResult = uploadService.processUploadResult(
      file,
      uploadResult
    );

    // Get optimized URLs for different document sizes
    const stampUrls = {
      small: uploadService.getStampUrl(processedResult.publicId, {
        width: 100,
        height: 100,
        crop: 'fit'
      }),
      medium: uploadService.getStampUrl(processedResult.publicId, {
        width: 200,
        height: 200,
        crop: 'fit'
      }),
      large: uploadService.getStampUrl(processedResult.publicId, {
        width: 300,
        height: 300,
        crop: 'fit'
      }),
      original: processedResult.url
    };

    // Store stamp information
    const stampData = {
      publicId: processedResult.publicId,
      url: processedResult.url,
      originalName: processedResult.originalName,
      uploadedAt: processedResult.uploadedAt,
      uploadedBy: req.user.id,
      urls: stampUrls
    };

    return ApiResponse.success(
      res,
      {
        stamp: stampData
      },
      'Company stamp uploaded successfully',
      201
    );
  } catch (error) {
    console.error('Upload company stamp error:', error);
    return ApiResponse.error(res, 'Failed to upload company stamp', 500);
  }
};

/**
 * Delete user profile photo
 */
const deleteProfilePhoto = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    if (!user.profilePhoto || !user.profilePhoto.publicId) {
      return ApiResponse.error(res, 'No profile photo to delete', 400);
    }

    // Delete from Cloudinary
    try {
      await uploadService.deleteFile(user.profilePhoto.publicId);
    } catch (error) {
      console.warn('Failed to delete from Cloudinary:', error.message);
    }

    // Remove from user profile
    user.profilePhoto = undefined;
    await user.save();

    return ApiResponse.success(res, null, 'Profile photo deleted successfully');
  } catch (error) {
    console.error('Delete profile photo error:', error);
    return ApiResponse.error(res, 'Failed to delete profile photo', 500);
  }
};

/**
 * Delete uploaded file by public ID
 */
const deleteUploadedFile = async (req, res) => {
  try {
    const { publicId } = req.params;
    const { resourceType = 'image' } = req.query;

    if (!publicId) {
      return ApiResponse.error(res, 'Public ID is required', 400);
    }

    // Only allow admins to delete non-profile photos
    if (req.user.role !== 'admin' && !publicId.includes('profiles')) {
      return ApiResponse.forbidden(res, 'Not authorized to delete this file');
    }

    // Delete from Cloudinary
    const deleted = await uploadService.deleteFile(publicId, resourceType);

    if (!deleted) {
      return ApiResponse.error(res, 'Failed to delete file', 500);
    }

    return ApiResponse.success(res, null, 'File deleted successfully');
  } catch (error) {
    console.error('Delete uploaded file error:', error);
    return ApiResponse.error(res, 'Failed to delete file', 500);
  }
};

/**
 * Get upload statistics
 */
const getUploadStats = async (req, res) => {
  try {
    // Only allow admins to view upload statistics
    if (req.user.role !== 'admin') {
      return ApiResponse.forbidden(res, 'Access denied');
    }

    const { folder = 'profiles' } = req.query;

    const stats = await uploadService.getUploadStats(folder);

    return ApiResponse.success(
      res,
      {
        stats: {
          ...stats,
          totalSize: `${(stats.totalBytes / (1024 * 1024)).toFixed(2)} MB`
        }
      },
      'Upload statistics retrieved successfully'
    );
  } catch (error) {
    console.error('Get upload stats error:', error);
    return ApiResponse.error(res, 'Failed to retrieve upload statistics', 500);
  }
};

/**
 * Get optimized image URL
 */
const getOptimizedUrl = async (req, res) => {
  try {
    const { publicId } = req.params;
    const {
      width,
      height,
      crop = 'fit',
      quality = 'auto',
      format = 'webp'
    } = req.query;

    if (!publicId) {
      return ApiResponse.error(res, 'Public ID is required', 400);
    }

    const transformations = {
      quality,
      format
    };

    if (width) transformations.width = parseInt(width);
    if (height) transformations.height = parseInt(height);
    if (crop) transformations.crop = crop;

    const optimizedUrl = uploadService.getOptimizedUrl(
      publicId,
      transformations
    );

    return ApiResponse.success(
      res,
      {
        originalPublicId: publicId,
        optimizedUrl: optimizedUrl,
        transformations: transformations
      },
      'Optimized URL generated successfully'
    );
  } catch (error) {
    console.error('Get optimized URL error:', error);
    return ApiResponse.error(res, 'Failed to generate optimized URL', 500);
  }
};

/**
 * Get user's profile photo URLs
 */
const getProfilePhotoUrls = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    // Check if user can access this profile
    if (userId !== req.user.id && req.user.role !== 'admin') {
      return ApiResponse.forbidden(res, 'Access denied');
    }

    const user = await User.findById(userId).select('profilePhoto');
    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    if (!user.profilePhoto || !user.profilePhoto.publicId) {
      return ApiResponse.success(
        res,
        {
          profilePhoto: null,
          urls: {
            small: uploadService.getAvatarUrl(null, 50),
            medium: uploadService.getAvatarUrl(null, 150),
            large: uploadService.getAvatarUrl(null, 300),
            original: null
          }
        },
        'No profile photo found'
      );
    }

    const urls = {
      small: uploadService.getAvatarUrl(user.profilePhoto.publicId, 50),
      medium: uploadService.getAvatarUrl(user.profilePhoto.publicId, 150),
      large: uploadService.getAvatarUrl(user.profilePhoto.publicId, 300),
      original: user.profilePhoto.url
    };

    return ApiResponse.success(
      res,
      {
        profilePhoto: user.profilePhoto,
        urls
      },
      'Profile photo URLs retrieved successfully'
    );
  } catch (error) {
    console.error('Get profile photo URLs error:', error);
    return ApiResponse.error(res, 'Failed to retrieve profile photo URLs', 500);
  }
};

module.exports = {
  uploadProfilePhoto,
  uploadCompanyLogo,
  uploadCompanyStamp,
  deleteProfilePhoto,
  deleteUploadedFile,
  getUploadStats,
  getOptimizedUrl,
  getProfilePhotoUrls
};
