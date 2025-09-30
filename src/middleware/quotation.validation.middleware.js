/**
 * Quotation Validation Middleware
 */

const { body } = require('express-validator');

const quotationValidation = [
  body('type')
    .isIn(['Residential', 'International', 'Office'])
    .withMessage('Type must be Residential, International, or Office'),

  body('client.name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be between 2 and 100 characters'),

  body('client.phone')
    .matches(/^[+]?[\d\s\-()]{10,}$/)
    .withMessage('Please provide a valid phone number'),

  body('client.email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage('Please provide a valid email'),

  body('client.company')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Company name cannot exceed 200 characters'),

  body('client.gender')
    .optional()
    .isIn(['male', 'female', ''])
    .withMessage('Gender must be male, female, or empty'),

  body('locations.from')
    .trim()
    .isLength({ min: 2, max: 300 })
    .withMessage('Pickup location must be between 2 and 300 characters'),

  body('locations.to')
    .trim()
    .isLength({ min: 2, max: 300 })
    .withMessage('Destination location must be between 2 and 300 characters'),

  body('locations.movingDate')
    .isISO8601()
    .toDate()
    .custom(value => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset to start of day
      const movingDate = new Date(value);
      movingDate.setHours(0, 0, 0, 0); // Reset to start of day

      if (movingDate < today) {
        throw new Error('Moving date cannot be in the past');
      }
      return true;
    }),

  body('services')
    .isArray({ min: 1 })
    .withMessage('At least one service is required'),

  body('services.*.name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Service name must be between 1 and 100 characters'),

  body('services.*.description')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Service description must be between 1 and 500 characters'),

  body('services.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),

  body('services.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Unit price cannot be negative'),

  body('pricing.currency')
    .isIn(['UGX', 'USD'])
    .withMessage('Currency must be UGX or USD'),

  body('pricing.discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount cannot be negative'),

  body('validity.daysValid')
    .optional()
    .isInt({ min: 7, max: 90 })
    .withMessage('Validity must be between 7 and 90 days'),

  body('termsAndConditions')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Terms and conditions cannot exceed 2000 characters'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
];

const quotationEmailValidation = [
  body('recipientEmail')
    .isEmail()
    .withMessage('Valid recipient email is required'),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message cannot exceed 500 characters')
];

const extendValidityValidation = [
  body('days')
    .isInt({ min: 1, max: 90 })
    .withMessage('Days must be between 1 and 90'),
  body('reason')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Reason must be between 5 and 200 characters')
];

module.exports = {
  quotationValidation,
  quotationEmailValidation,
  extendValidityValidation
};
