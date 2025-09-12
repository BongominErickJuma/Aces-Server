/**
 * Upload Service Module
 * Handles all file uploads to Cloudinary
 */

const cloudinary = require('../config/cloudinary.config');
const multer = require('multer');

class UploadService {
  constructor() {
    // Configure multer for memory storage
    this.memoryStorage = multer.memoryStorage();

    // File size limits (in bytes)
    this.limits = {
      profilePhoto: 5 * 1024 * 1024, // 5MB
      logo: 10 * 1024 * 1024, // 10MB
      stamp: 5 * 1024 * 1024, // 5MB
      document: 50 * 1024 * 1024 // 50MB
    };
  }

  /**
   * Get multer instance for profile photos
   */
  getProfileUpload() {
    return multer({
      storage: this.memoryStorage,
      limits: {
        fileSize: this.limits.profilePhoto
      },
      fileFilter: this.imageFileFilter
    });
  }

  /**
   * Get multer instance for company logos
   */
  getLogoUpload() {
    return multer({
      storage: this.memoryStorage,
      limits: {
        fileSize: this.limits.logo
      },
      fileFilter: this.imageFileFilter
    });
  }

  /**
   * Get multer instance for company stamps
   */
  getStampUpload() {
    return multer({
      storage: this.memoryStorage,
      limits: {
        fileSize: this.limits.stamp
      },
      fileFilter: this.imageFileFilter
    });
  }

  /**
   * Get multer instance for documents
   */
  getDocumentUpload() {
    return multer({
      storage: this.memoryStorage,
      limits: {
        fileSize: this.limits.document
      },
      fileFilter: this.documentFileFilter
    });
  }

  /**
   * File filter for images
   */
  imageFileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      const allowedMimes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/svg+xml'
      ];

      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error(
            'Invalid file type. Only JPEG, PNG, WebP and SVG images are allowed.'
          ),
          false
        );
      }
    } else {
      cb(new Error('File is not an image.'), false);
    }
  }

  /**
   * File filter for documents
   */
  documentFileFilter(req, file, cb) {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only PDF, DOC and DOCX files are allowed.'
        ),
        false
      );
    }
  }

  /**
   * Upload file buffer to Cloudinary
   */
  async uploadBuffer(fileBuffer, options = {}) {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        resource_type: 'auto',
        ...options
      };

      cloudinary.uploader
        .upload_stream(uploadOptions, (error, result) => {
          if (error) {
            console.error('Upload error:', error);
            reject(new Error(`Failed to upload file: ${error.message}`));
          } else {
            resolve({
              publicId: result.public_id,
              url: result.secure_url,
              originalUrl: result.url,
              format: result.format,
              width: result.width,
              height: result.height,
              bytes: result.bytes,
              createdAt: result.created_at
            });
          }
        })
        .end(fileBuffer);
    });
  }

  /**
   * Upload single file to specific folder
   */
  async uploadFile(fileBuffer, filename, folder, options = {}) {
    try {
      const uploadOptions = {
        folder: `aces-movers/${folder}`,
        public_id: filename,
        resource_type: 'auto',
        ...options
      };

      return await this.uploadBuffer(fileBuffer, uploadOptions);
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Delete file from Cloudinary
   */
  async deleteFile(publicId, resourceType = 'image') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType
      });

      return result.result === 'ok';
    } catch (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Generate optimized URL with transformations
   */
  getOptimizedUrl(publicId, transformations = {}) {
    return cloudinary.url(publicId, {
      secure: true,
      ...transformations
    });
  }

  /**
   * Generate avatar URL for user profile
   */
  getAvatarUrl(publicId, size = 150) {
    if (!publicId) {
      // Return default avatar
      return `https://ui-avatars.com/api/?name=${encodeURIComponent('User')}&size=${size}&background=2563eb&color=fff`;
    }

    return this.getOptimizedUrl(publicId, {
      width: size,
      height: size,
      crop: 'fill',
      gravity: 'face',
      quality: 'auto',
      format: 'webp'
    });
  }

  /**
   * Generate company logo URL
   */
  getLogoUrl(publicId, options = {}) {
    if (!publicId) {
      return null;
    }

    return this.getOptimizedUrl(publicId, {
      quality: 'auto',
      format: 'webp',
      ...options
    });
  }

  /**
   * Generate company stamp URL
   */
  getStampUrl(publicId, options = {}) {
    if (!publicId) {
      return null;
    }

    return this.getOptimizedUrl(publicId, {
      quality: 'auto',
      format: 'webp',
      ...options
    });
  }

  /**
   * Validate file before upload
   */
  validateFile(file, type = 'image') {
    const errors = [];

    if (!file) {
      errors.push('No file provided');
      return errors;
    }

    // Check file size
    const maxSize = this.limits[type] || this.limits.profilePhoto;
    if (file.size > maxSize) {
      errors.push(
        `File size too large. Maximum size is ${Math.round(maxSize / (1024 * 1024))}MB`
      );
    }

    // Check file type
    if (type === 'image') {
      if (!file.mimetype.startsWith('image/')) {
        errors.push('File must be an image');
      }
    } else if (type === 'document') {
      const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      if (!allowedMimes.includes(file.mimetype)) {
        errors.push('File must be PDF, DOC or DOCX');
      }
    }

    return errors;
  }

  /**
   * Process uploaded file result
   */
  processUploadResult(file, uploadResult) {
    return {
      originalName: file.originalname,
      filename: file.filename || uploadResult.publicId,
      publicId: uploadResult.publicId,
      url: uploadResult.url,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date(),
      cloudinaryData: uploadResult
    };
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(files) {
    if (!Array.isArray(files)) {
      files = [files];
    }

    for (const file of files) {
      try {
        if (file.path && require('fs').existsSync(file.path)) {
          require('fs').unlinkSync(file.path);
        }
      } catch (error) {
        console.warn('Failed to cleanup temp file:', error.message);
      }
    }
  }

  /**
   * Get upload statistics
   */
  async getUploadStats(folder) {
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: `aces-movers/${folder}`,
        max_results: 500
      });

      return {
        totalFiles: result.resources.length,
        totalBytes: result.resources.reduce(
          (sum, resource) => sum + resource.bytes,
          0
        ),
        lastUpload:
          result.resources.length > 0
            ? new Date(
                Math.max(...result.resources.map(r => new Date(r.created_at)))
              )
            : null
      };
    } catch (error) {
      console.error('Stats error:', error);
      return {
        totalFiles: 0,
        totalBytes: 0,
        lastUpload: null
      };
    }
  }
}

module.exports = new UploadService();
