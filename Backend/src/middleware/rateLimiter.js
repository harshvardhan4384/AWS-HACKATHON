'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const isTest = config.nodeEnv === 'test';

/**
 * Rate limiter for sensitive authentication endpoints (login, registration).
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 500 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
      },
    });
  },
});

/**
 * Rate limiter for OTP verification and resends.
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 500 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many verification code attempts. Please try again after 15 minutes.',
      },
    });
  },
});

/**
 * Rate limiter for password reset requests and confirmations.
 */
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 500 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many password reset requests from this IP. Please try again later.',
      },
    });
  },
});

/**
 * Rate limiter for TOTP verification attempts.
 */
const totpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isTest ? 500 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many two-factor authentication attempts. Please wait 5 minutes.',
      },
    });
  },
});

module.exports = {
  authLimiter,
  otpLimiter,
  passwordResetLimiter,
  totpLimiter,
};
