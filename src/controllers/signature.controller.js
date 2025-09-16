/**
 * Signature Controller
 * Handles signature management operations
 */

const User = require('../models/User.model');
const cloudinary = require('../config/cloudinary.config');
const { AppError } = require('../utils/response');

/**
 * Save user signature (canvas or upload)
 */
exports.saveSignature = async (req, res, next) => {
  try {
    const { type, data } = req.body;
    const userId = req.user._id;

    // Validate signature type
    if (!['canvas', 'upload'].includes(type)) {
      return next(new AppError('Invalid signature type', 400));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Handle canvas signature
    if (type === 'canvas') {
      if (!data || !data.startsWith('data:image/')) {
        return next(new AppError('Invalid canvas signature data', 400));
      }

      // Remove existing uploaded signature if switching from upload to canvas
      if (user.signature?.type === 'upload' && user.signature?.publicId) {
        try {
          await cloudinary.uploader.destroy(user.signature.publicId);
        } catch (error) {
          console.error('Error deleting old signature from Cloudinary:', error);
        }
      }

      user.signature = {
        type: 'canvas',
        data: data,
        createdAt: new Date()
      };
    }

    // Handle upload signature
    if (type === 'upload') {
      // This will be handled by multer middleware and upload route
      return next(new AppError('Use upload endpoint for file signatures', 400));
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Signature saved successfully',
      data: {
        signature: {
          type: user.signature.type,
          createdAt: user.signature.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload signature image
 */
exports.uploadSignature = async (req, res, next) => {
  try {
    const userId = req.user._id;

    if (!req.file) {
      return next(new AppError('No signature file provided', 400));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Remove existing signature if switching types or updating
    if (user.signature?.publicId) {
      try {
        await cloudinary.uploader.destroy(user.signature.publicId);
      } catch (error) {
        console.error('Error deleting old signature from Cloudinary:', error);
      }
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: 'signatures',
      resource_type: 'image',
      transformation: [
        { width: 400, height: 200, crop: 'fit' },
        { quality: 'auto:good' },
        { format: 'png' }
      ]
    });

    user.signature = {
      type: 'upload',
      data: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      originalName: req.file.originalname,
      createdAt: new Date()
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Signature uploaded successfully',
      data: {
        signature: {
          type: user.signature.type,
          url: user.signature.data,
          createdAt: user.signature.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user signature
 */
exports.getSignature = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('signature');
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (!user.signature?.data) {
      return res.status(200).json({
        success: true,
        message: 'No signature found',
        data: { signature: null }
      });
    }

    const signatureData = {
      type: user.signature.type,
      createdAt: user.signature.createdAt
    };

    if (user.signature.type === 'canvas') {
      signatureData.data = user.signature.data;
    } else {
      signatureData.url = user.signature.data;
      signatureData.originalName = user.signature.originalName;
    }

    res.status(200).json({
      success: true,
      message: 'Signature retrieved successfully',
      data: { signature: signatureData }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user signature
 */
exports.deleteSignature = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (!user.signature?.data) {
      return next(new AppError('No signature found to delete', 404));
    }

    // Delete from Cloudinary if it's an uploaded image
    if (user.signature.type === 'upload' && user.signature.publicId) {
      try {
        await cloudinary.uploader.destroy(user.signature.publicId);
      } catch (error) {
        console.error('Error deleting signature from Cloudinary:', error);
      }
    }

    user.signature = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Signature deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};