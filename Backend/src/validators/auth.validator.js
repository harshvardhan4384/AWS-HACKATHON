'use strict';

const { z } = require('zod');

const passwordRule = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const emailRule = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Invalid email address format')
  .max(255, 'Email must be at most 255 characters');

const otpRule = z
  .string({ required_error: 'Verification code is required' })
  .trim()
  .regex(/^\d{6}$/, 'Verification code must be exactly 6 digits');

const avatarUrlRule = z
  .string()
  .trim()
  .refine(
    val => !val || /^https?:\/\//i.test(val) || /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(val),
    'Avatar must be a valid HTTPS URL or safe base64 image data URI'
  )
  .optional()
  .nullable();

const phoneNumberRule = z
  .string()
  .trim()
  .max(30, 'Phone number must be at most 30 characters')
  .regex(/^[+]?[0-9\s\-().]{0,30}$/, 'Invalid phone number format')
  .optional()
  .nullable();

const registerSchema = z.object({
  email: emailRule,
  password: passwordRule,
  displayName: z.string().trim().max(100, 'Display name must be at most 100 characters').optional().nullable(),
  avatarUrl: avatarUrlRule,
  phoneNumber: phoneNumberRule,
});

const loginSchema = z.object({
  email: emailRule,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

const verifyEmailSchema = z.object({
  email: emailRule,
  otp: otpRule,
});

const resendEmailSchema = z.object({
  email: emailRule,
});

const requestPasswordResetSchema = z.object({
  email: emailRule,
});

const confirmPasswordResetSchema = z.object({
  email: emailRule,
  otp: otpRule,
  newPassword: passwordRule,
});

const verify2faSchema = z.object({
  pending2faToken: z.string({ required_error: 'Pending authentication token is required' }).min(1),
  totpCode: z.string().trim().regex(/^\d{6}$/, 'Authenticator code must be 6 digits').optional(),
  recoveryCode: z.string().trim().min(6).optional(),
}).refine(data => data.totpCode || data.recoveryCode, {
  message: 'Either totpCode or recoveryCode must be provided',
});

const enable2faSchema = z.object({
  secret: z.string({ required_error: 'TOTP secret is required' }).min(16),
  totpCode: otpRule,
});

const disable2faSchema = z.object({
  currentPassword: z.string({ required_error: 'Current password is required' }).min(1),
  totpCode: z.string().trim().regex(/^\d{6}$/, 'Authenticator code must be 6 digits').optional(),
  recoveryCode: z.string().trim().min(6).optional(),
}).refine(data => data.totpCode || data.recoveryCode, {
  message: 'Either totpCode or recoveryCode must be provided to confirm 2FA disable',
});

const regenerateRecoveryCodesSchema = z.object({
  currentPassword: z.string({ required_error: 'Current password is required' }).min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string({ required_error: 'Current password is required' }).min(1),
  newPassword: passwordRule,
});

const updateProfileSchema = z.object({
  displayName: z.string().trim().max(100, 'Display name must be at most 100 characters').optional().nullable(),
  avatarUrl: avatarUrlRule,
  phoneNumber: phoneNumberRule,
});

module.exports = {
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
};
