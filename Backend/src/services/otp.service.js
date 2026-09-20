'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const otpChallengeRepository = require('../repositories/otpChallenge.repository');

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 * Never uses Math.random().
 *
 * @returns {string} 6-digit string (100000 - 999999)
 */
function generateSecureOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes SHA-256 hex digest of a raw OTP.
 *
 * @param {string} rawOtp
 * @returns {string} SHA-256 hex hash
 */
function hashOtp(rawOtp) {
  if (typeof rawOtp !== 'string') {
    rawOtp = String(rawOtp || '');
  }
  return crypto.createHash('sha256').update(rawOtp.trim()).digest('hex');
}

/**
 * Creates and persists a new secure OTP challenge.
 * Automatically supersedes/invalidates previous active challenges for the email + purpose.
 *
 * @param {object} params
 * @param {string|null} [params.userId]
 * @param {string} params.email
 * @param {'EMAIL_VERIFICATION'|'PASSWORD_RESET'} params.purpose
 * @param {number} [params.ttlMinutes]
 * @param {number} [params.maxAttempts]
 * @returns {Promise<{ challenge: object, rawOtp: string }>}
 */
async function createChallenge({ userId = null, email, purpose, ttlMinutes, maxAttempts }) {
  const normalizedEmail = email.trim().toLowerCase();
  const ttl = ttlMinutes || config.otpTtlMinutes || 10;
  const attempts = maxAttempts || config.otpMaxAttempts || 5;

  // 1. Invalidate any existing active challenges for this email and purpose
  await otpChallengeRepository.invalidateActive(normalizedEmail, purpose);

  // 2. Generate cryptographically random 6-digit code
  const rawOtp = generateSecureOtp();

  // 3. Hash code at rest
  const codeHash = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  // 4. Persist challenge
  const challenge = await otpChallengeRepository.create({
    userId,
    email: normalizedEmail,
    purpose,
    codeHash,
    expiresAt,
    maxAttempts: attempts,
  });

  return {
    challenge,
    rawOtp, // Passed ONLY to email service, never returned through API
  };
}

/**
 * Verifies an OTP code against an active challenge.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {'EMAIL_VERIFICATION'|'PASSWORD_RESET'} params.purpose
 * @param {string} params.rawOtp
 * @returns {Promise<{ success: boolean, challenge: object, userId: string|null, email: string }>}
 */
async function verifyChallenge({ email, purpose, rawOtp }) {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = String(rawOtp || '').trim();

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    const error = new Error('Invalid verification code format. Must be 6 digits.');
    error.status = 400;
    throw error;
  }

  // 1. Find active challenge
  const challenge = await otpChallengeRepository.findActive(normalizedEmail, purpose);
  if (!challenge) {
    const error = new Error('Verification code has expired or was not requested. Please request a new code.');
    error.status = 400;
    throw error;
  }

  // 2. Enforce maximum verification attempts
  if (challenge.attemptCount >= challenge.maxAttempts) {
    await otpChallengeRepository.markConsumed(challenge.id);
    const error = new Error('Maximum verification attempts exceeded. Please request a new code.');
    error.status = 429;
    throw error;
  }

  // 3. Timing-safe verification against stored hash
  const computedHash = hashOtp(cleanOtp);
  const hashBuffer = Buffer.from(computedHash, 'utf8');
  const storedBuffer = Buffer.from(challenge.codeHash, 'utf8');

  let isMatch = false;
  if (hashBuffer.length === storedBuffer.length) {
    isMatch = crypto.timingSafeEqual(hashBuffer, storedBuffer);
  }

  if (!isMatch) {
    // Increment attempts on failure
    await otpChallengeRepository.incrementAttempts(challenge.id);
    const remainingAttempts = challenge.maxAttempts - (challenge.attemptCount + 1);
    const error = new Error(
      remainingAttempts > 0
        ? `Invalid verification code. ${remainingAttempts} attempt(s) remaining.`
        : 'Maximum verification attempts exceeded. Please request a new code.'
    );
    error.status = remainingAttempts > 0 ? 400 : 429;
    throw error;
  }

  // 4. Mark challenge consumed (strictly single-use)
  await otpChallengeRepository.markConsumed(challenge.id);

  return {
    success: true,
    challenge,
    userId: challenge.userId,
    email: challenge.email,
  };
}

module.exports = {
  generateSecureOtp,
  hashOtp,
  createChallenge,
  verifyChallenge,
};

