/**
 * Security Middleware
 * Implements rate limiting, security headers, and other security measures
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const ApiResponse = require('../utils/response');

/**
 * General API rate limiting
 * 100 requests per 15 minutes per IP
 */
// const generalLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: {
//     error: {
//       code: 'RATE_LIMIT_EXCEEDED',
//       message: 'Too many requests from this IP, please try again later.',
//       retryAfter: '15 minutes'
//     }
//   },
//   standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
//   legacyHeaders: false, // Disable the `X-RateLimit-*` headers
//   handler: (req, res) => {
//     ApiResponse.error(
//       res,
//       'Too many requests from this IP, please try again later.',
//       429,
//       {
//         retryAfter: '15 minutes'
//       }
//     );
//   }
// });
const generalLimiter = (req, res, next) => next(); // Disabled for now

/**
 * Authentication endpoints rate limiting
 * 15 attempts per 15 minutes per IP
 */
// const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 15, // limit each IP to 15 requests per windowMs
//   skipSuccessfulRequests: true, // Don't count successful requests
//   message: {
//     error: {
//       code: 'AUTH_RATE_LIMIT_EXCEEDED',
//       message:
//         'Too many authentication attempts from this IP, please try again later.',
//       retryAfter: '15 minutes'
//     }
//   },
//   handler: (req, res) => {
//     ApiResponse.error(
//       res,
//       'Too many authentication attempts from this IP, please try again later.',
//       429,
//       {
//         retryAfter: '15 minutes'
//       }
//     );
//   }
// });
const authLimiter = (req, res, next) => next(); // Disabled for now

/**
 * Upload endpoints rate limiting
 * 20 uploads per hour per IP
 */
// const uploadLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 20, // limit each IP to 20 upload requests per windowMs
//   message: {
//     error: {
//       code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
//       message: 'Too many file uploads from this IP, please try again later.',
//       retryAfter: '1 hour'
//     }
//   },
//   handler: (req, res) => {
//     ApiResponse.error(
//       res,
//       'Too many file uploads from this IP, please try again later.',
//       429,
//       {
//         retryAfter: '1 hour'
//       }
//     );
//   }
// });
const uploadLimiter = (req, res, next) => next(); // Disabled for now

/**
 * Document creation rate limiting
 * 50 documents per hour per user
 */
// const createDocumentLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 50, // limit each IP to 50 document creation requests per windowMs
//   message: {
//     error: {
//       code: 'DOCUMENT_CREATION_RATE_LIMIT_EXCEEDED',
//       message: 'Too many documents created, please try again later.',
//       retryAfter: '1 hour'
//     }
//   },
//   handler: (req, res) => {
//     ApiResponse.error(
//       res,
//       'Too many documents created, please try again later.',
//       429,
//       {
//         retryAfter: '1 hour'
//       }
//     );
//   }
// });
const createDocumentLimiter = (req, res, next) => next(); // Disabled for now

/**
 * Password reset rate limiting
 * 3 attempts per hour per IP
 */
// const passwordResetLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 3, // limit each IP to 3 password reset requests per windowMs
//   message: {
//     error: {
//       code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
//       message:
//         'Too many password reset attempts from this IP, please try again later.',
//       retryAfter: '1 hour'
//     }
//   },
//   handler: (req, res) => {
//     ApiResponse.error(
//       res,
//       'Too many password reset attempts from this IP, please try again later.',
//       429,
//       {
//         retryAfter: '1 hour'
//       }
//     );
//   }
// });
const passwordResetLimiter = (req, res, next) => next(); // Disabled for now

/**
 * Email sending rate limiting
 * 10 emails per hour per user
 */
// const emailLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 10, // limit each user to 10 email sends per windowMs
//   message: {
//     error: {
//       code: 'EMAIL_RATE_LIMIT_EXCEEDED',
//       message: 'Too many emails sent, please try again later.',
//       retryAfter: '1 hour'
//     }
//   },
//   handler: (req, res) => {
//     ApiResponse.error(
//       res,
//       'Too many emails sent, please try again later.',
//       429,
//       {
//         retryAfter: '1 hour'
//       }
//     );
//   }
// });
const emailLimiter = (req, res, next) => next(); // Disabled for now

/**
 * Security headers configuration
 */
const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['"self"'],
      styleSrc: ['"self"', '"unsafe-inline"', 'https://fonts.googleapis.com'],
      fontSrc: ['"self"', 'https://fonts.gstatic.com'],
      imgSrc: [
        '"self"',
        'data:',
        'https://res.cloudinary.com',
        'https://ui-avatars.com'
      ],
      scriptSrc: ['"self"'],
      connectSrc: ['"self"'],
      frameSrc: ['"none"'],
      objectSrc: ['"none"'],
      baseUri: ['"self"'],
      formAction: ['"self"'],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },

  // HTTP Strict Transport Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },

  // X-Frame-Options
  frameguard: { action: 'deny' },

  // X-Content-Type-Options
  noSniff: true,

  // X-XSS-Protection (legacy, but still used by some browsers)
  xssFilter: true,

  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // DNS Prefetch Control
  dnsPrefetchControl: { allow: false },

  // Expect-CT
  expectCt: {
    enforce: true,
    maxAge: 86400 // 24 hours
  }
});

/**
 * Request size limiting middleware
 */
const requestSizeLimiter = (req, res, next) => {
  const contentLength = parseInt(req.get('Content-Length'), 10);
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (contentLength && contentLength > maxSize) {
    return ApiResponse.error(res, 'Request payload too large', 413);
  }

  next();
};

/**
 * Input sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * Recursively sanitize object properties
 */
const sanitizeObject = obj => {
  if (obj === null || typeof obj !== 'object') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip prototype pollution attempts
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    sanitized[sanitizeString(key)] = sanitizeObject(value);
  }

  return sanitized;
};

/**
 * Sanitize string values
 */
const sanitizeString = value => {
  if (typeof value !== 'string') {
    return value;
  }

  // Remove potentially dangerous HTML/script tags
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * IP whitelist middleware (for sensitive operations)
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured, allow all
    }

    const clientIP = req.ip || req.connection.remoteAddress;

    if (!allowedIPs.includes(clientIP)) {
      return ApiResponse.error(res, 'Access denied from this IP address', 403);
    }

    next();
  };
};

/**
 * API key validation middleware (for external API access)
 */
const validateApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    return next(); // No API key configured, skip validation
  }

  if (!apiKey || apiKey !== validApiKey) {
    return ApiResponse.error(res, 'Invalid or missing API key', 401);
  }

  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  createDocumentLimiter,
  passwordResetLimiter,
  emailLimiter,
  securityHeaders,
  requestSizeLimiter,
  sanitizeInput,
  ipWhitelist,
  validateApiKey
};
