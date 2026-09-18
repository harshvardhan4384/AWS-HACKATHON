'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for sensitive authentication endpoints (login, registration).
 * Throttles rapid brute-force attempts.
 * 15-minute window, max 10 requests per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
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

module.exports = {
  authLimiter,
};

