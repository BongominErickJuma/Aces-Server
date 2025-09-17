/**
 * Signature Validation Middleware
 * Validates signature data before processing
 */

const { body, validationResult } = require('express-validator');
const { AppError } = require('../utils/response');

/**
 * Validation rules for signature saving
 */
const signatureValidationRules = [
  body('type')
    .isIn(['canvas', 'upload'])
    .withMessage('Signature type must be either canvas or upload'),

  body('data')
    .if(body('type').equals('canvas'))
    .notEmpty()
    .withMessage('Canvas signature data is required')
    .matches(/^data:image\/(png|jpeg|jpg);base64,/)
    .withMessage('Invalid canvas signature format - must be a base64 image'),

  body('data')
    .if(body('type').equals('canvas'))
    .custom(value => {
      // Check base64 size (approximate file size)
      const base64Data = value.split(',')[1];
      const sizeInBytes = (base64Data.length * 3) / 4;
      const sizeInMB = sizeInBytes / (1024 * 1024);

      if (sizeInMB > 2) {
        throw new Error('Canvas signature is too large (max 2MB)');
      }
      return true;
    })
];

/**
 * Middleware to validate signature input
 */
const validateSignature = [
  ...signatureValidationRules,
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => error.msg);
      return next(new AppError(errorMessages.join(', '), 400));
    }

    next();
  }
];

module.exports = {
  validateSignature
};
