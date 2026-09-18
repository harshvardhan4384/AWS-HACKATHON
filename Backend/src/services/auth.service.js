'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const userRepository = require('../repositories/user.repository');
const sessionRepository = require('../repositories/session.repository');

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
 * Registers a new user and creates an initial authenticated session.
 *
 * @param {object} params { email, password, displayName, ipAddress, userAgent }
 * @returns {Promise<{ user: object, sessionToken: string, expiresAt: string }>}
 */
async function register({ email, password, displayName, ipAddress, userAgent }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Check for duplicate account
  const existingUser = await userRepository.findByEmail(normalizedEmail);
  if (existingUser) {
    const error = new Error('An account with this email already exists');
    error.status = 409;
    throw error;
  }

  // Hash password using bcryptjs with cost factor 12
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Create user
  const user = await userRepository.create({
    email: normalizedEmail,
    passwordHash,
    displayName: displayName ? displayName.trim() : null,
    status: 'ACTIVE',
  });

  // Create server-side session
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashToken(sessionToken);
  const expiresAt = calculateExpiration();

  await sessionRepository.create({
    userId: user.id,
    sessionTokenHash,
    expiresAt,
    ipAddress,
    userAgent,
  });

  return {
    user,
    sessionToken,
    expiresAt,
  };
}

/**
 * Authenticates a user with email and password and creates a new session.
 *
 * @param {object} params { email, password, ipAddress, userAgent }
 * @returns {Promise<{ user: object, sessionToken: string, expiresAt: string }>}
 */
async function login({ email, password, ipAddress, userAgent }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Find user by normalized email
  const user = await userRepository.findByEmail(normalizedEmail);

  // Generic failure for user not found
  if (!user) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  // Check account status
  if (user.status !== 'ACTIVE') {
    const error = new Error('Account is not active. Please contact support.');
    error.status = 403;
    throw error;
  }

  // Check if user has a password set (future WebAuthn/Passkey users might not)
  if (!user.passwordHash) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  // Create session
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashToken(sessionToken);
  const expiresAt = calculateExpiration();

  await sessionRepository.create({
    userId: user.id,
    sessionTokenHash,
    expiresAt,
    ipAddress,
    userAgent,
  });

  return {
    user: userRepository.toSafeUser(user),
    sessionToken,
    expiresAt,
  };
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
    // Session expired — purge it asynchronously
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
  login,
  logout,
  validateSession,
  hashToken,
  generateSessionToken,
};

