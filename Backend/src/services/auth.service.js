'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const userRepository = require('../repositories/user.repository');
const sessionRepository = require('../repositories/session.repository');
const twoFactorRecoveryCodeRepository = require('../repositories/twoFactorRecoveryCode.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const emailService = require('./email.service');
const otpService = require('./otp.service');
const totpService = require('./totp.service');
const tokenEncryption = require('./tokenEncryption.service');

const BCRYPT_ROUNDS = 12;

/**
 * Computes SHA-256 hex digest of a raw session token.
 *
 * @param {string} rawToken
 * @returns {string} SHA-256 hex hash
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a cryptographically secure 256-bit random session token (64 hex characters).
 *
 * @returns {string}
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculates session expiration date based on configured TTL.
 *
 * @returns {string} ISO-8601 string
 */
function calculateExpiration() {
  const expires = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

/**
 * Generates an encrypted, short-lived pending 2FA authentication token.
 *
 * @param {string} userId
 * @returns {string}
 */
function createPending2faToken(userId) {
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + (config.pending2faTtlMinutes * 60 * 1000),
  });
  return tokenEncryption.encrypt(payload);
}

/**
 * Validates and extracts userId from an encrypted pending 2FA token.
 *
 * @param {string} token
 * @returns {string|null} userId if valid, or null
 */
function verifyPending2faToken(token) {
  try {
    const decrypted = tokenEncryption.decrypt(token);
    const data = JSON.parse(decrypted);
    if (!data || !data.userId || !data.exp) return null;
    if (Date.now() > data.exp) return null;
    return data.userId;
  } catch {
    return null;
  }
}

/**
 * Helper to record an audit log entry.
 */
async function audit(actionType, { userId = null, targetType = 'user', targetId = null, result = 'SUCCESS', metadata = null }) {
  try {
    await auditLogRepository.create({
      userId,
      actorType: userId ? 'USER' : 'SYSTEM',
      actorId: userId,
      actionType,
      targetType,
      targetId: targetId || userId,
      result,
      metadata,
    });
  } catch (err) {
    // Non-blocking for primary auth flows
    console.warn(`[AuditLog Warning] Failed to record ${actionType}:`, err.message);
  }
}

/**
 * Registers a new user, initiates email verification OTP, and sends verification email.
 *
 * @param {object} params { email, password, displayName, avatarUrl, phoneNumber, ipAddress, userAgent }
 * @returns {Promise<{ user: object, requiresEmailVerification: boolean, email: string }>}
 */
async function register({ email, password, displayName, avatarUrl, phoneNumber, ipAddress, userAgent }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check for duplicate account
  const existingUser = await userRepository.findByEmail(normalizedEmail);
  if (existingUser) {
    if (existingUser.emailVerifiedAt) {
      const error = new Error('An account with this email already exists');
      error.status = 409;
      throw error;
    }

    // Existing unverified account: update credentials, issue fresh OTP challenge and send email
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await userRepository.updatePasswordHash(existingUser.id, passwordHash);
    if (displayName) {
      await userRepository.updateProfile(existingUser.id, { displayName: displayName.trim() });
    }

    const { rawOtp } = await otpService.createChallenge({
      userId: existingUser.id,
      email: normalizedEmail,
      purpose: 'EMAIL_VERIFICATION',
    });

    await emailService.sendEmailVerificationOtp({
      to: normalizedEmail,
      otp: rawOtp,
      displayName: displayName || existingUser.displayName,
    });

    await audit('EMAIL_VERIFICATION_REQUESTED', {
      userId: existingUser.id,
      metadata: { email: normalizedEmail, ipAddress },
    });

    return {
      user: existingUser,
      requiresEmailVerification: true,
      email: normalizedEmail,
    };
  }

  // 2. Hash password with bcrypt cost factor 12
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 3. Create user (emailVerifiedAt is initially null)
  const user = await userRepository.create({
    email: normalizedEmail,
    passwordHash,
    displayName: displayName ? displayName.trim() : null,
    avatarUrl: avatarUrl ? avatarUrl.trim() : null,
    phoneNumber: phoneNumber ? phoneNumber.trim() : null,
    emailVerifiedAt: null,
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
    status: 'ACTIVE',
  });

  // 4. Create secure email verification challenge
  const { rawOtp } = await otpService.createChallenge({
    userId: user.id,
    email: normalizedEmail,
    purpose: 'EMAIL_VERIFICATION',
  });

  // 5. Send verification email via SMTP service
  await emailService.sendEmailVerificationOtp({
    to: normalizedEmail,
    otp: rawOtp,
    displayName: user.displayName,
  });

  // 6. Audit logs
  await audit('USER_REGISTERED', {
    userId: user.id,
    metadata: { email: normalizedEmail, ipAddress },
  });

  await audit('EMAIL_VERIFICATION_REQUESTED', {
    userId: user.id,
    metadata: { email: normalizedEmail, ipAddress },
  });

  return {
    user,
    requiresEmailVerification: true,
    email: normalizedEmail,
  };
}

/**
 * Verifies email ownership via 6-digit OTP and establishes an authenticated session.
 *
 * @param {object} params { email, otp, ipAddress, userAgent }
 * @returns {Promise<{ user: object, sessionToken: string, expiresAt: string }>}
 */
async function verifyEmailOtp({ email, otp, ipAddress, userAgent }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Validate OTP challenge
  try {
    await otpService.verifyChallenge({
      email: normalizedEmail,
      purpose: 'EMAIL_VERIFICATION',
      rawOtp: otp,
    });
  } catch (err) {
    await audit('EMAIL_VERIFICATION_FAILED', {
      metadata: { email: normalizedEmail, reason: err.message, ipAddress },
      result: 'FAILURE',
    });
    throw err;
  }

  // 2. Find user
  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user) {
    const error = new Error('User not found for this email address');
    error.status = 404;
    throw error;
  }

  // 3. Update emailVerifiedAt
  const updatedUser = await userRepository.updateEmailVerified(user.id);

  // 4. Audit success
  await audit('EMAIL_VERIFIED', {
    userId: user.id,
    metadata: { email: normalizedEmail, ipAddress },
  });

  // 5. Create authenticated session
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashToken(sessionToken);
  const expiresAt = calculateExpiration();

  const session = await sessionRepository.create({
    userId: user.id,
    sessionTokenHash,
    expiresAt,
    ipAddress,
    userAgent,
  });

  await audit('SESSION_CREATED', {
    userId: user.id,
    metadata: { sessionId: session.id, ipAddress },
  });

  return {
    user: updatedUser,
    sessionToken,
    expiresAt,
  };
}

/**
 * Resends a fresh email verification OTP to the user.
 *
 * @param {object} params { email, ipAddress }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function resendEmailVerificationOtp({ email, ipAddress }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await userRepository.findByEmail(normalizedEmail);

  if (!user) {
    // Return generic success to avoid enumeration
    return { success: true, message: 'Verification code resent if account exists.' };
  }

  if (user.emailVerifiedAt) {
    const error = new Error('Email address is already verified.');
    error.status = 400;
    throw error;
  }

  // Generate new OTP and send email
  const { rawOtp } = await otpService.createChallenge({
    userId: user.id,
    email: normalizedEmail,
    purpose: 'EMAIL_VERIFICATION',
  });

  await emailService.sendEmailVerificationOtp({
    to: normalizedEmail,
    otp: rawOtp,
    displayName: user.displayName,
  });

  await audit('EMAIL_VERIFICATION_REQUESTED', {
    userId: user.id,
    metadata: { email: normalizedEmail, ipAddress, resend: true },
  });

  return {
    success: true,
    message: 'Verification code resent successfully.',
  };
}

/**
 * Initiates a password reset request with account enumeration protection.
 * Returns the exact same message regardless of whether the email exists.
 *
 * @param {object} params { email, ipAddress }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function requestPasswordReset({ email, ipAddress }) {
  const normalizedEmail = email.trim().toLowerCase();
  const genericResponse = {
    success: true,
    message: 'If an account exists for that email, a password reset code has been sent.',
  };

  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user) {
    // Account enumeration protection
    return genericResponse;
  }

  // Create password reset OTP challenge
  const { rawOtp } = await otpService.createChallenge({
    userId: user.id,
    email: normalizedEmail,
    purpose: 'PASSWORD_RESET',
  });

  // Send password reset email
  await emailService.sendPasswordResetOtp({
    to: normalizedEmail,
    otp: rawOtp,
    displayName: user.displayName,
  });

  await audit('PASSWORD_RESET_REQUESTED', {
    userId: user.id,
    metadata: { email: normalizedEmail, ipAddress },
  });

  return genericResponse;
}

/**
 * Confirms a password reset using the 6-digit OTP and new password.
 * Invalidates existing sessions, updates password, and preserves 2FA configuration.
 *
 * @param {object} params { email, otp, newPassword, ipAddress }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function confirmPasswordReset({ email, otp, newPassword, ipAddress }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Verify OTP challenge
  try {
    await otpService.verifyChallenge({
      email: normalizedEmail,
      purpose: 'PASSWORD_RESET',
      rawOtp: otp,
    });
  } catch (err) {
    await audit('PASSWORD_RESET_FAILED', {
      metadata: { email: normalizedEmail, reason: err.message, ipAddress },
      result: 'FAILURE',
    });
    throw err;
  }

  // 2. Find user
  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  // 3. Hash new password
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // 4. Update password
  await userRepository.updatePasswordHash(user.id, passwordHash);

  // 5. Invalidate existing sessions according to security policy
  await sessionRepository.deleteByUserId(user.id);

  // 6. Audit event (note: TOTP remains enabled if it was enabled!)
  await audit('PASSWORD_RESET_SUCCESS', {
    userId: user.id,
    metadata: { email: normalizedEmail, ipAddress, twoFactorRetained: user.twoFactorEnabled },
  });

  return {
    success: true,
    message: 'Password has been successfully reset. Please log in with your new password.',
  };
}

/**
 * Authenticates user credentials with multi-step 2FA support and email verification checks.
 *
 * @param {object} params { email, password, ipAddress, userAgent }
 * @returns {Promise<{ user?: object, sessionToken?: string, expiresAt?: string, requires2FA?: boolean, pending2faToken?: string, requiresEmailVerification?: boolean, email?: string }>}
 */
async function login({ email, password, ipAddress, userAgent }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Find user
  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user || !user.passwordHash) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  if (user.status !== 'ACTIVE') {
    const error = new Error('Account is not active. Please contact support.');
    error.status = 403;
    throw error;
  }

  // 2. Verify password with bcrypt
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  // 3. Check email verification: automatically dispatch a fresh verification OTP to Mailpit/SMTP
  if (!user.emailVerifiedAt) {
    const { rawOtp } = await otpService.createChallenge({
      userId: user.id,
      email: normalizedEmail,
      purpose: 'EMAIL_VERIFICATION',
    });

    console.log(`[AUTH] Dispatching verification OTP for unverified account on login: ${normalizedEmail}`);
    await emailService.sendEmailVerificationOtp({
      to: normalizedEmail,
      otp: rawOtp,
      displayName: user.displayName,
    });

    await audit('EMAIL_VERIFICATION_REQUESTED', {
      userId: user.id,
      metadata: { email: normalizedEmail, ipAddress, triggeredBy: 'LOGIN_ATTEMPT' },
    });

    return {
      requiresEmailVerification: true,
      email: normalizedEmail,
      message: 'Please verify your email address before logging in. A 6-digit code has been sent to your email.',
    };
  }

  // 4. Check if TOTP 2FA is enabled
  if (user.twoFactorEnabled) {
    const pending2faToken = createPending2faToken(user.id);
    await audit('TWO_FACTOR_CHALLENGE_ISSUED', {
      userId: user.id,
      metadata: { ipAddress },
    });

    return {
      requires2FA: true,
      pending2faToken,
      email: normalizedEmail,
    };
  }

  // 5. No 2FA required: create session
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashToken(sessionToken);
  const expiresAt = calculateExpiration();

  const session = await sessionRepository.create({
    userId: user.id,
    sessionTokenHash,
    expiresAt,
    ipAddress,
    userAgent,
  });

  await audit('SESSION_CREATED', {
    userId: user.id,
    metadata: { sessionId: session.id, ipAddress },
  });

  return {
    user: userRepository.toSafeUser(user),
    sessionToken,
    expiresAt,
  };
}

/**
 * Completes two-factor authentication login using TOTP code or recovery code.
 *
 * @param {object} params { pending2faToken, totpCode, recoveryCode, ipAddress, userAgent }
 * @returns {Promise<{ user: object, sessionToken: string, expiresAt: string }>}
 */
async function verify2faLogin({ pending2faToken, totpCode, recoveryCode, ipAddress, userAgent }) {
  if (!pending2faToken) {
    const error = new Error('Pending authentication token is required');
    error.status = 400;
    throw error;
  }

  // 1. Verify pending 2FA token
  const userId = verifyPending2faToken(pending2faToken);
  if (!userId) {
    const error = new Error('Two-factor session has expired. Please log in again.');
    error.status = 401;
    throw error;
  }

  // 2. Find user
  const user = await userRepository.findRawById(userId);
  if (!user || !user.twoFactorEnabled) {
    const error = new Error('Invalid authentication state.');
    error.status = 400;
    throw error;
  }

  let verified = false;
  let usedRecoveryCode = false;

  // 3. Verify TOTP authenticator code
  if (totpCode) {
    if (!user.twoFactorSecretEncrypted) {
      const error = new Error('Two-factor configuration error. Please contact security admin.');
      error.status = 500;
      throw error;
    }
    const secret = totpService.decryptSecret(user.twoFactorSecretEncrypted);
    verified = totpService.verifyTotp(totpCode, secret);
  } else if (recoveryCode) {
    // 4. Verify Recovery Code
    verified = await totpService.verifyAndConsumeRecoveryCode(userId, recoveryCode);
    if (verified) usedRecoveryCode = true;
  } else {
    const error = new Error('Authenticator code or recovery code is required.');
    error.status = 400;
    throw error;
  }

  if (!verified) {
    await audit('TWO_FACTOR_LOGIN_FAILED', {
      userId,
      metadata: { ipAddress, usedRecoveryCode },
      result: 'FAILURE',
    });
    const error = new Error('Invalid authentication code. Please try again.');
    error.status = 401;
    throw error;
  }

  // 5. Audit successful 2FA
  if (usedRecoveryCode) {
    await audit('RECOVERY_CODE_USED', {
      userId,
      metadata: { ipAddress },
    });
  }

  await audit('TWO_FACTOR_LOGIN_SUCCESS', {
    userId,
    metadata: { ipAddress, usedRecoveryCode },
  });

  // 6. Establish full session
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashToken(sessionToken);
  const expiresAt = calculateExpiration();

  const session = await sessionRepository.create({
    userId,
    sessionTokenHash,
    expiresAt,
    ipAddress,
    userAgent,
  });

  await audit('SESSION_CREATED', {
    userId,
    metadata: { sessionId: session.id, ipAddress },
  });

  return {
    user: userRepository.toSafeUser(user),
    sessionToken,
    expiresAt,
  };
}

/**
 * Initiates TOTP 2FA setup by generating a secret, otpauth URI, and QR code data URL.
 * 2FA is NOT enabled until the user verifies with a code.
 *
 * @param {string} userId
 * @returns {Promise<{ secret: string, otpauthUri: string, qrCodeUrl: string }>}
 */
async function setup2fa(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  const secret = totpService.generateSecret();
  const otpauthUri = totpService.generateOtpauthUri({ secret, email: user.email });
  const qrCodeUrl = await totpService.generateQrCodeDataUrl(otpauthUri);

  await audit('TWO_FACTOR_SETUP_STARTED', { userId });

  return {
    secret,
    otpauthUri,
    qrCodeUrl,
  };
}

/**
 * Enables TOTP 2FA after successfully validating the authenticator code.
 * Generates and returns 8 single-use recovery codes.
 *
 * @param {object} params { userId, secret, totpCode, ipAddress }
 * @returns {Promise<{ success: boolean, recoveryCodes: Array<string> }>}
 */
async function enable2fa({ userId, secret, totpCode, ipAddress }) {
  if (!secret || !totpCode) {
    const error = new Error('Secret and verification code are required.');
    error.status = 400;
    throw error;
  }

  // 1. Verify TOTP code against provided secret
  const isValid = totpService.verifyTotp(totpCode, secret);
  if (!isValid) {
    const error = new Error('Invalid verification code. Authenticator app could not be verified.');
    error.status = 400;
    throw error;
  }

  // 2. Encrypt secret with AES-256-GCM
  const twoFactorSecretEncrypted = totpService.encryptSecret(secret);

  // 3. Update user in DB
  await userRepository.updateTwoFactor(userId, {
    twoFactorEnabled: true,
    twoFactorSecretEncrypted,
  });

  // 4. Invalidate any old recovery codes and generate 8 new recovery codes
  await twoFactorRecoveryCodeRepository.deleteByUserId(userId);
  const recoveryCodes = totpService.generateRecoveryCodes(8);

  const hashedRecords = recoveryCodes.map(c => ({
    userId,
    codeHash: totpService.hashRecoveryCode(c),
  }));
  await twoFactorRecoveryCodeRepository.createMany(hashedRecords);

  await audit('TWO_FACTOR_ENABLED', {
    userId,
    metadata: { ipAddress },
  });

  return {
    success: true,
    recoveryCodes, // Plaintext shown ONCE to user
  };
}

/**
 * Disables TOTP 2FA. Requires current password AND a valid TOTP or recovery code.
 *
 * @param {object} params { userId, currentPassword, totpCode, recoveryCode, ipAddress }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function disable2fa({ userId, currentPassword, totpCode, recoveryCode, ipAddress }) {
  const user = await userRepository.findRawById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  if (!user.twoFactorEnabled) {
    const error = new Error('Two-factor authentication is not currently enabled.');
    error.status = 400;
    throw error;
  }

  // 1. Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    const error = new Error('Incorrect current password.');
    error.status = 400;
    throw error;
  }

  // 2. Verify TOTP code or recovery code
  let verified = false;
  if (totpCode) {
    const secret = totpService.decryptSecret(user.twoFactorSecretEncrypted);
    verified = totpService.verifyTotp(totpCode, secret);
  } else if (recoveryCode) {
    verified = await totpService.verifyAndConsumeRecoveryCode(userId, recoveryCode);
  }

  if (!verified) {
    const error = new Error('Valid authenticator code or recovery code is required to disable 2FA.');
    error.status = 400;
    throw error;
  }

  // 3. Disable 2FA in user record
  await userRepository.updateTwoFactor(userId, {
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
  });

  // 4. Delete all recovery codes
  await twoFactorRecoveryCodeRepository.deleteByUserId(userId);

  await audit('TWO_FACTOR_DISABLED', {
    userId,
    metadata: { ipAddress },
  });

  return {
    success: true,
    message: 'Two-factor authentication has been successfully disabled.',
  };
}

/**
 * Regenerates 8 recovery codes. Requires current password authentication.
 *
 * @param {object} params { userId, currentPassword, ipAddress }
 * @returns {Promise<{ success: boolean, recoveryCodes: Array<string> }>}
 */
async function regenerateRecoveryCodes({ userId, currentPassword, ipAddress }) {
  const user = await userRepository.findRawById(userId);
  if (!user || !user.twoFactorEnabled) {
    const error = new Error('Two-factor authentication must be enabled to regenerate recovery codes.');
    error.status = 400;
    throw error;
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    const error = new Error('Incorrect current password.');
    error.status = 400;
    throw error;
  }

  // Delete previous codes
  await twoFactorRecoveryCodeRepository.deleteByUserId(userId);

  // Generate 8 new codes
  const recoveryCodes = totpService.generateRecoveryCodes(8);
  const hashedRecords = recoveryCodes.map(c => ({
    userId,
    codeHash: totpService.hashRecoveryCode(c),
  }));
  await twoFactorRecoveryCodeRepository.createMany(hashedRecords);

  await audit('RECOVERY_CODES_REGENERATED', {
    userId,
    metadata: { ipAddress },
  });

  return {
    success: true,
    recoveryCodes,
  };
}

/**
 * Changes a user's password. Validates current password and updates hash.
 *
 * @param {object} params { userId, currentPassword, newPassword, ipAddress }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function changePassword({ userId, currentPassword, newPassword, ipAddress }) {
  const user = await userRepository.findRawById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    const error = new Error('Incorrect current password.');
    error.status = 400;
    throw error;
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userRepository.updatePasswordHash(userId, newPasswordHash);

  await audit('PASSWORD_CHANGED', {
    userId,
    metadata: { ipAddress },
  });

  return {
    success: true,
    message: 'Password changed successfully.',
  };
}

/**
 * Retrieves profile information for the authenticated user.
 *
 * @param {string} userId
 * @returns {Promise<object>} Safe user profile with 2FA status
 */
async function getProfile(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  const remainingRecoveryCodes = user.twoFactorEnabled
    ? await twoFactorRecoveryCodeRepository.countRemaining(userId)
    : 0;

  return {
    ...user,
    remainingRecoveryCodes,
  };
}

/**
 * Updates profile fields (displayName, avatarUrl, phoneNumber).
 * Email is strictly read-only.
 *
 * @param {string} userId
 * @param {object} data { displayName, avatarUrl, phoneNumber }
 * @returns {Promise<object>} Updated safe user profile
 */
async function updateProfile(userId, data) {
  const updated = await userRepository.updateProfile(userId, data);
  await audit('PROFILE_UPDATED', {
    userId,
    metadata: { fieldsUpdated: Object.keys(data) },
  });
  return updated;
}

/**
 * Lists all active sessions for a user.
 *
 * @param {string} userId
 * @param {string} currentSessionId
 * @returns {Promise<Array<object>>}
 */
async function listSessions(userId, currentSessionId) {
  const sessions = await sessionRepository.findActiveByUserId(userId);
  return sessions.map(s => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    expiresAt: s.expiresAt,
    isCurrent: s.id === currentSessionId,
  }));
}

/**
 * Revokes a specific session belonging to the user.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
async function revokeSession(userId, sessionId) {
  const deleted = await sessionRepository.deleteByIdAndUser(sessionId, userId);
  if (deleted) {
    await audit('SESSION_REVOKED', {
      userId,
      metadata: { sessionId },
    });
  }
  return deleted;
}

/**
 * Revokes all sessions for a user except the current one.
 *
 * @param {string} userId
 * @param {string} currentSessionId
 * @returns {Promise<number>} Number of sessions revoked
 */
async function revokeOtherSessions(userId, currentSessionId) {
  const count = await sessionRepository.deleteOtherSessions(userId, currentSessionId);
  if (count > 0) {
    await audit('SESSIONS_REVOKED_BULK', {
      userId,
      metadata: { count, retainedSessionId: currentSessionId },
    });
  }
  return count;
}

/**
 * Revokes a session by invalidating its database record.
 *
 * @param {string} rawToken Raw session token from client
 * @returns {Promise<void>}
 */
async function logout(rawToken) {
  if (!rawToken) return;
  const sessionTokenHash = hashToken(rawToken);
  await sessionRepository.deleteByTokenHash(sessionTokenHash);
}

/**
 * Validates a session token and returns the authenticated user if valid.
 *
 * @param {string} rawToken Raw session token from client
 * @returns {Promise<{ user: object, session: object }|null>}
 */
async function validateSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return null;
  }

  const sessionTokenHash = hashToken(rawToken);
  const session = await sessionRepository.findByTokenHash(sessionTokenHash);

  if (!session) {
    return null;
  }

  // Check session expiration
  const now = new Date();
  const expires = new Date(session.expiresAt);
  if (expires <= now) {
    sessionRepository.deleteByTokenHash(sessionTokenHash).catch(() => {});
    return null;
  }

  // Verify user still exists and is active
  const user = await userRepository.findById(session.userId);
  if (!user || user.status !== 'ACTIVE') {
    return null;
  }

  // Update session lastUsedAt asynchronously
  sessionRepository.updateLastUsed(session.id).catch(() => {});

  return {
    user,
    session,
  };
}

module.exports = {
  register,
  verifyEmailOtp,
  resendEmailVerificationOtp,
  requestPasswordReset,
  confirmPasswordReset,
  login,
  verify2faLogin,
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
  validateSession,
  hashToken,
  generateSessionToken,
};
