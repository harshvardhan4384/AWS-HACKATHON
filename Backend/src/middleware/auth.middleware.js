'use strict';

const config = require('../config/env');
const authService = require('../services/auth.service');

/**
 * Authentication middleware.
 * Verifies session token from HttpOnly cookie or Authorization Bearer header.
 * Attaches the authenticated user to `req.user`.
 * Rejects unauthenticated requests with HTTP 401.
 */
async function authenticate(req, res, next) {
  try {
    let token = null;

    // 1. Try reading token from cookie
    if (req.cookies && req.cookies[config.sessionCookieName]) {
      token = req.cookies[config.sessionCookieName];
    }

    // 2. Fallback to Authorization: Bearer <token> for automated testing / API clients
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
        },
      });
    }

    // Validate session in database
    const authResult = await authService.validateSession(token);

    if (!authResult) {
      // Clear potentially stale/invalid cookie
      res.clearCookie(config.sessionCookieName, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        path: '/',
      });

      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid or expired session. Please log in again.',
        },
      });
    }

    // Attach verified user identity and session ID to request
    req.user = authResult.user;
    req.sessionId = authResult.session.id;

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  authenticate,
};

