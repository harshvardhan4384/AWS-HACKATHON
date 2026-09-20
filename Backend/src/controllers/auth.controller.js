'use strict';

const config = require('../config/env');
const authService = require('../services/auth.service');
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendEmailSchema,
  requestPasswordResetSchema,
  confirmPasswordResetSchema,
  verify2faSchema,
  enable2faSchema,
  disable2faSchema,
  regenerateRecoveryCodesSchema,
  changePasswordSchema,
  updateProfileSchema,
} = require('../validators/auth.validator');

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
 * Helper to format validation errors safely.
 */
function formatValidationError(error) {
  return {
    success: false,
    error: {
      message: 'Validation failed',
      details: (error.issues || error.errors || []).map((e) => ({
        field: (e.path || []).join('.'),
        message: e.message,
      })),
    },
  };
}

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress, userAgent } = getClientMetadata(req);
    const result = await authService.register({
      ...parseResult.data,
      ipAddress,
      userAgent,
    });

    return res.status(201).json({
      success: true,
      user: result.user,
      requiresEmailVerification: result.requiresEmailVerification,
      email: result.email,
      message: 'Account created. Please check your email for the 6-digit verification code.',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/email-verification/verify
 */
async function verifyEmail(req, res, next) {
  try {
    const parseResult = verifyEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress, userAgent } = getClientMetadata(req);
    const result = await authService.verifyEmailOtp({
      ...parseResult.data,
      ipAddress,
      userAgent,
    });

    res.cookie(
      config.sessionCookieName,
      result.sessionToken,
      getCookieOptions(result.expiresAt)
    );

    return res.status(200).json({
      success: true,
      user: result.user,
      message: 'Email verified successfully.',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/email-verification/resend
 */
async function resendEmailVerification(req, res, next) {
  try {
    const parseResult = resendEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress } = getClientMetadata(req);
    const result = await authService.resendEmailVerificationOtp({
      ...parseResult.data,
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/password-reset/request
 */
async function requestPasswordReset(req, res, next) {
  try {
    const parseResult = requestPasswordResetSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress } = getClientMetadata(req);
    const result = await authService.requestPasswordReset({
      ...parseResult.data,
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/password-reset/confirm
 */
async function confirmPasswordReset(req, res, next) {
  try {
    const parseResult = confirmPasswordResetSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress } = getClientMetadata(req);
    const result = await authService.confirmPasswordReset({
      ...parseResult.data,
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress, userAgent } = getClientMetadata(req);
    const result = await authService.login({
      ...parseResult.data,
      ipAddress,
      userAgent,
    });

    // Handle email not verified
    if (result.requiresEmailVerification) {
      return res.status(403).json({
        success: false,
        requiresEmailVerification: true,
        email: result.email,
        error: {
          message: result.message || 'Please verify your email address to access your account.',
        },
      });
    }

    // Handle TOTP 2FA requirement
    if (result.requires2FA) {
      return res.status(200).json({
        success: true,
        requires2FA: true,
        pending2faToken: result.pending2faToken,
        email: result.email,
      });
    }

    // Standard session establishment
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
 * POST /api/auth/2fa/verify
 */
async function verify2fa(req, res, next) {
  try {
    const parseResult = verify2faSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress, userAgent } = getClientMetadata(req);
    const result = await authService.verify2faLogin({
      ...parseResult.data,
      ipAddress,
      userAgent,
    });

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
 * POST /api/auth/2fa/setup
 */
async function setup2fa(req, res, next) {
  try {
    const result = await authService.setup2fa(req.user.id);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/2fa/enable
 */
async function enable2fa(req, res, next) {
  try {
    const parseResult = enable2faSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress } = getClientMetadata(req);
    const result = await authService.enable2fa({
      userId: req.user.id,
      ...parseResult.data,
      ipAddress,
    });

    return res.status(200).json({
      success: true,
      recoveryCodes: result.recoveryCodes,
      message: 'Two-factor authentication enabled successfully.',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/2fa/disable
 */
async function disable2fa(req, res, next) {
  try {
    const parseResult = disable2faSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress } = getClientMetadata(req);
    const result = await authService.disable2fa({
      userId: req.user.id,
      ...parseResult.data,
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/2fa/recovery-codes/regenerate
 */
async function regenerateRecoveryCodes(req, res, next) {
  try {
    const parseResult = regenerateRecoveryCodesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress } = getClientMetadata(req);
    const result = await authService.regenerateRecoveryCodes({
      userId: req.user.id,
      ...parseResult.data,
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/password/change
 */
async function changePassword(req, res, next) {
  try {
    const parseResult = changePasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const { ipAddress } = getClientMetadata(req);
    const result = await authService.changePassword({
      userId: req.user.id,
      ...parseResult.data,
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/profile
 */
async function getProfile(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.id);
    return res.status(200).json({
      success: true,
      user: profile,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/auth/profile
 */
async function updateProfile(req, res, next) {
  try {
    const parseResult = updateProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatValidationError(parseResult.error));
    }

    const updated = await authService.updateProfile(req.user.id, parseResult.data);
    return res.status(200).json({
      success: true,
      user: updated,
      message: 'Profile updated successfully.',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/sessions
 */
async function listSessions(req, res, next) {
  try {
    const sessions = await authService.listSessions(req.user.id, req.sessionId);
    return res.status(200).json({
      success: true,
      sessions,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/auth/sessions/:id
 */
async function revokeSession(req, res, next) {
  try {
    const sessionId = req.params.id;
    const isCurrent = sessionId === req.sessionId;
    const deleted = await authService.revokeSession(req.user.id, sessionId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { message: 'Session not found or already revoked.' },
      });
    }

    if (isCurrent) {
      res.clearCookie(config.sessionCookieName, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        path: '/',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Session revoked successfully.',
      revokedCurrent: isCurrent,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/auth/sessions
 */
async function revokeOtherSessions(req, res, next) {
  try {
    const count = await authService.revokeOtherSessions(req.user.id, req.sessionId);
    return res.status(200).json({
      success: true,
      message: `${count} other session(s) revoked successfully.`,
      count,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/logout
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
 */
async function getMe(req, res) {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
}

/**
 * GET /api/auth/protected
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
  verifyEmail,
  resendEmailVerification,
  requestPasswordReset,
  confirmPasswordReset,
  login,
  verify2fa,
  setup2fa,
  enable2fa,
  disable2fa,
  regenerateRecoveryCodes,
  changePassword,
  getProfile,
  updateProfile,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  logout,
  getMe,
  getProtected,
};
