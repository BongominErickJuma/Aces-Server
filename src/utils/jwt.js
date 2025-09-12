/**
 * JWT Utility Functions
 * Handles JWT token generation, verification, and management
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class JWTUtils {
  /**
   * Generate access token
   * @param {Object} payload - Token payload (user data)
   * @returns {string} JWT access token
   */
  static generateAccessToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '15m',
      issuer: process.env.COMPANY_NAME || 'Aces Movers',
      audience: 'aces-movers-api'
    });
  }

  /**
   * Generate refresh token
   * @param {Object} payload - Token payload (user data)
   * @returns {string} JWT refresh token
   */
  static generateRefreshToken(payload) {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
      issuer: process.env.COMPANY_NAME || 'Aces Movers',
      audience: 'aces-movers-refresh'
    });
  }

  /**
   * Generate token pair (access + refresh)
   * @param {Object} user - User object
   * @returns {Object} Token pair with expiry info
   */
  static generateTokenPair(user) {
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      fullName: user.fullName
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken({ id: user._id });

    // Calculate expiry times
    const accessExpiry = new Date(
      Date.now() + this.getTokenExpiry(process.env.JWT_EXPIRE || '15m')
    );
    const refreshExpiry = new Date(
      Date.now() + this.getTokenExpiry(process.env.JWT_REFRESH_EXPIRE || '7d')
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(accessExpiry.getTime() / 1000),
      refreshExpiresIn: Math.floor(refreshExpiry.getTime() / 1000),
      tokenType: 'Bearer'
    };
  }

  /**
   * Verify access token
   * @param {string} token - JWT access token
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid or expired
   */
  static verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.COMPANY_NAME || 'Aces Movers',
      audience: 'aces-movers-api'
    });
  }

  /**
   * Verify refresh token
   * @param {string} token - JWT refresh token
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid or expired
   */
  static verifyRefreshToken(token) {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      issuer: process.env.COMPANY_NAME || 'Aces Movers',
      audience: 'aces-movers-refresh'
    });
  }

  /**
   * Extract token from request headers
   * @param {Object} req - Express request object
   * @returns {string|null} Token or null if not found
   */
  static extractTokenFromHeader(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  /**
   * Extract refresh token from cookies
   * @param {Object} req - Express request object
   * @returns {string|null} Refresh token or null if not found
   */
  static extractRefreshTokenFromCookie(req) {
    return req.cookies?.refreshToken || null;
  }

  /**
   * Generate secure random token (for password reset, etc.)
   * @param {number} bytes - Number of bytes for token
   * @returns {string} Secure random token
   */
  static generateSecureToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Hash token for storage (one-way)
   * @param {string} token - Token to hash
   * @returns {string} Hashed token
   */
  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Convert time string to milliseconds
   * @param {string} timeStr - Time string (e.g., '15m', '7d', '1h')
   * @returns {number} Time in milliseconds
   */
  static getTokenExpiry(timeStr) {
    const timeValue = parseInt(timeStr.slice(0, -1));
    const timeUnit = timeStr.slice(-1);

    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    return timeValue * (multipliers[timeUnit] || multipliers.m);
  }

  /**
   * Decode token without verification (for debugging)
   * @param {string} token - JWT token
   * @returns {Object} Decoded token
   */
  static decodeToken(token) {
    return jwt.decode(token, { complete: true });
  }

  /**
   * Check if token is expired
   * @param {string} token - JWT token
   * @returns {boolean} True if expired
   */
  static isTokenExpired(token) {
    try {
      const decoded = this.decodeToken(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.payload.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiry date
   * @param {string} token - JWT token
   * @returns {Date|null} Expiry date or null if invalid
   */
  static getTokenExpiryDate(token) {
    try {
      const decoded = this.decodeToken(token);
      return new Date(decoded.payload.exp * 1000);
    } catch (error) {
      return null;
    }
  }
}

module.exports = JWTUtils;
