'use strict';

const config = require('../config/env');
const authService = require('../services/auth.service');
const { registerSchema, loginSchema } = require('../validators/auth.validator');

/**
 * Generates secure cookie options for session management.
 *
 * @param {string|Date} expiresAt
 * @returns {object} Express cookie options
 */
function getCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  };
}

/**
 * Extracts client IP and User-Agent metadata for session tracking.
 *
 * @param {import('express').Request} req
 * @returns {{ ipAddress: string|null, userAgent: string|null }}
 */
function getClientMetadata(req) {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  return { ipAddress, userAgent };
}

/**
 * POST /api/auth/register
 * Registers a new user account and establishes an authenticated session.
 */
async function register(req, res, next) {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          details: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
    }

    const { ipAddress, userAgent } = getClientMetadata(req);
    const result = await authService.register({
      ...parseResult.data,
      ipAddress,
      userAgent,
    });

    // Set secure HttpOnly session cookie
    res.cookie(
      config.sessionCookieName,
      result.sessionToken,
      getCookieOptions(result.expiresAt)
    );

    return res.status(201).json({
      success: true,
      user: result.user,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/login
 * Authenticates user credentials and issues a secure session cookie.
 */
async function login(req, res, next) {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          details: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
    }

    const { ipAddress, userAgent } = getClientMetadata(req);
    const result = await authService.login({
      ...parseResult.data,
      ipAddress,
      userAgent,
    });

    // Set secure HttpOnly session cookie
    res.cookie(
      config.sessionCookieName,
      result.sessionToken,
      getCookieOptions(result.expiresAt)
    );

    return res.status(200).json({
      success: true,
      user: result.user,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/logout
 * Invalidates the server-side session and clears the session cookie.
 */
async function logout(req, res, next) {
  try {
    let token = null;

    if (req.cookies && req.cookies[config.sessionCookieName]) {
      token = req.cookies[config.sessionCookieName];
    } else if (req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (token) {
      await authService.logout(token);
    }

    // Always clear the cookie
    res.clearCookie(config.sessionCookieName, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns profile information for the authenticated user.
 */
async function getMe(req, res) {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
}

/**
 * GET /api/auth/protected
 * Test route to verify the authentication middleware.
 */
async function getProtected(req, res) {
  return res.status(200).json({
    success: true,
    message: 'You have accessed a protected route',
    user: {
      id: req.user.id,
      email: req.user.email,
    },
  });
}

module.exports = {
  register,
  login,
  logout,
  getMe,
  getProtected,
};

