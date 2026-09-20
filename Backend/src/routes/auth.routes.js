'use strict';

const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const {
  authLimiter,
  otpLimiter,
  passwordResetLimiter,
  totpLimiter,
} = require('../middleware/rateLimiter');

const router = express.Router();

// ── Public Authentication ───────────────────────────────────────────────────
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/logout', authController.logout);

// ── Email Verification (OTP) ────────────────────────────────────────────────
router.post('/email-verification/verify', otpLimiter, authController.verifyEmail);
router.post('/email-verification/resend', otpLimiter, authController.resendEmailVerification);

// ── Password Reset (OTP) ────────────────────────────────────────────────────
router.post('/password-reset/request', passwordResetLimiter, authController.requestPasswordReset);
router.post('/password-reset/confirm', passwordResetLimiter, authController.confirmPasswordReset);

// ── Two-Factor Authentication Login Challenge ───────────────────────────────
router.post('/2fa/verify', totpLimiter, authController.verify2fa);

// ── Two-Factor Authentication Configuration (Protected) ────────────────────
router.post('/2fa/setup', authenticate, authController.setup2fa);
router.post('/2fa/enable', authenticate, totpLimiter, authController.enable2fa);
router.post('/2fa/disable', authenticate, totpLimiter, authController.disable2fa);
router.post('/2fa/recovery-codes/regenerate', authenticate, authController.regenerateRecoveryCodes);

// ── Password Management (Protected) ─────────────────────────────────────────
router.post('/password/change', authenticate, authController.changePassword);

// ── Profile Management (Protected) ──────────────────────────────────────────
router.get('/me', authenticate, authController.getMe);
router.get('/profile', authenticate, authController.getProfile);
router.patch('/profile', authenticate, authController.updateProfile);

// ── Session Management (Protected) ──────────────────────────────────────────
router.get('/sessions', authenticate, authController.listSessions);
router.delete('/sessions/:id', authenticate, authController.revokeSession);
router.delete('/sessions', authenticate, authController.revokeOtherSessions);

// ── Protected Test Route ────────────────────────────────────────────────────
router.get('/protected', authenticate, authController.getProtected);

module.exports = router;
