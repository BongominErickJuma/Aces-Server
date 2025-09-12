/**
 * File Upload Middleware
 * Handles file upload validation and processing
 */

const multer = require('multer');
const uploadService = require('../services/upload.service');
const ApiResponse = require('../utils/response');

/**
 * Handle multer errors
 */
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return ApiResponse.error(res, 'File size too large', 400);
      case 'LIMIT_FILE_COUNT':
        return ApiResponse.error(res, 'Too many files', 400);
      case 'LIMIT_UNEXPECTED_FILE':
        return ApiResponse.error(res, 'Unexpected file field', 400);
      default:
        return ApiResponse.error(res, `Upload error: ${error.message}`, 400);
    }
  }

  if (error.message) {
    return ApiResponse.error(res, error.message, 400);
  }

  next(error);
};

/**
 * Profile photo upload middleware
 */
const uploadProfilePhoto = (req, res, next) => {
  const upload = uploadService.getProfileUpload().single('profilePhoto');

  upload(req, res, error => {
    if (error) {
      return handleMulterError(error, req, res, next);
    }

    if (!req.file) {
      return ApiResponse.error(res, 'No profile photo provided', 400);
    }

    // Validate file
    const validationErrors = uploadService.validateFile(
      req.file,
      'profilePhoto'
    );
    if (validationErrors.length > 0) {
      return ApiResponse.validationError(
        res,
        validationErrors.map(msg => ({ msg }))
      );
    }

    next();
  });
};

/**
 * Company logo upload middleware
 */
const uploadCompanyLogo = (req, res, next) => {
  const upload = uploadService.getLogoUpload().single('logo');

  upload(req, res, error => {
    if (error) {
      return handleMulterError(error, req, res, next);
    }

    if (!req.file) {
      return ApiResponse.error(res, 'No logo file provided', 400);
    }

    // Validate file
    const validationErrors = uploadService.validateFile(req.file, 'logo');
    if (validationErrors.length > 0) {
      return ApiResponse.validationError(
        res,
        validationErrors.map(msg => ({ msg }))
      );
    }

    next();
  });
};

/**
 * Company stamp upload middleware
 */
const uploadCompanyStamp = (req, res, next) => {
  const upload = uploadService.getStampUpload().single('stamp');

  upload(req, res, error => {
    if (error) {
      return handleMulterError(error, req, res, next);
    }

    if (!req.file) {
      return ApiResponse.error(res, 'No stamp file provided', 400);
    }

    // Validate file
    const validationErrors = uploadService.validateFile(req.file, 'stamp');
    if (validationErrors.length > 0) {
      return ApiResponse.validationError(
        res,
        validationErrors.map(msg => ({ msg }))
      );
    }

    next();
  });
};

/**
 * Document upload middleware
 */
const uploadDocument = (req, res, next) => {
  const upload = uploadService.getDocumentUpload().single('document');

  upload(req, res, error => {
    if (error) {
      return handleMulterError(error, req, res, next);
    }

    if (!req.file) {
      return ApiResponse.error(res, 'No document file provided', 400);
    }

    // Validate file
    const validationErrors = uploadService.validateFile(req.file, 'document');
    if (validationErrors.length > 0) {
      return ApiResponse.validationError(
        res,
        validationErrors.map(msg => ({ msg }))
      );
    }

    next();
  });
};

/**
 * Multiple files upload middleware
 */
const uploadMultiple = (fieldName, maxCount = 5, fileType = 'image') => {
  return (req, res, next) => {
    let upload;

    switch (fileType) {
      case 'profile':
        upload = uploadService.getProfileUpload().array(fieldName, maxCount);
        break;
      case 'logo':
        upload = uploadService.getLogoUpload().array(fieldName, maxCount);
        break;
      case 'stamp':
        upload = uploadService.getStampUpload().array(fieldName, maxCount);
        break;
      case 'document':
        upload = uploadService.getDocumentUpload().array(fieldName, maxCount);
        break;
      default:
        upload = uploadService.getProfileUpload().array(fieldName, maxCount);
    }

    upload(req, res, error => {
      if (error) {
        return handleMulterError(error, req, res, next);
      }

      if (!req.files || req.files.length === 0) {
        return ApiResponse.error(res, `No ${fieldName} files provided`, 400);
      }

      // Validate each file
      for (const file of req.files) {
        const validationErrors = uploadService.validateFile(file, fileType);
        if (validationErrors.length > 0) {
          return ApiResponse.validationError(
            res,
            validationErrors.map(msg => ({
              msg: `${file.originalname}: ${msg}`
            }))
          );
        }
      }

      next();
    });
  };
};

/**
 * File cleanup middleware (for errors)
 */
const cleanupFiles = async (req, res, next) => {
  try {
    if (req.file) {
      await uploadService.cleanupTempFiles([req.file]);
    }
    if (req.files) {
      await uploadService.cleanupTempFiles(req.files);
    }
  } catch (error) {
    console.warn('File cleanup warning:', error.message);
  }
  next();
};

/**
 * Validate file type based on upload type
 */
const validateFileType = allowedTypes => {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files || [req.file];

    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        return ApiResponse.error(
          res,
          `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
          400
        );
      }
    }

    next();
  };
};

/**
 * File size validation middleware
 */
const validateFileSize = maxSize => {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files || [req.file];

    for (const file of files) {
      if (file.size > maxSize) {
        return ApiResponse.error(
          res,
          `File ${file.originalname} is too large. Maximum size is ${Math.round(maxSize / (1024 * 1024))}MB`,
          400
        );
      }
    }

    next();
  };
};

/**
 * Process upload result middleware
 */
const processUploadResult = (req, res, next) => {
  try {
    if (req.file) {
      req.uploadResult = uploadService.processUploadResult(req.file, req.file);
    }

    if (req.files) {
      req.uploadResults = req.files.map(file =>
        uploadService.processUploadResult(file, file)
      );
    }

    next();
  } catch (error) {
    console.error('Process upload result error:', error);
    return ApiResponse.error(res, 'Failed to process upload result', 500);
  }
};

module.exports = {
  uploadProfilePhoto,
  uploadCompanyLogo,
  uploadCompanyStamp,
  uploadDocument,
  uploadMultiple,
  cleanupFiles,
  validateFileType,
  validateFileSize,
  processUploadResult,
  handleMulterError
};
