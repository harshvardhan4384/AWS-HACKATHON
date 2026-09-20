'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');

// In-memory outbox for local development and automated test assertions when SMTP is offline
const _devOutbox = [];

/**
 * Checks whether an SMTP host is configured.
 * Supports unauthenticated SMTP (e.g., local Mailpit) and authenticated SMTP (e.g., Brevo/Production).
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(config.smtpHost);
}

/**
 * Creates or retrieves a nodemailer transporter.
 * @returns {object} Nodemailer transporter
 */
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;

  if (isConfigured()) {
    const transportOptions = {
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      tls: {
        rejectUnauthorized: config.isProduction,
      },
    };

    // Only attach auth if user and password credentials are provided (e.g. Brevo/Production)
    // Local development servers like Mailpit run unauthenticated
    if (config.smtpUser && config.smtpPassword) {
      transportOptions.auth = {
        user: config.smtpUser,
        pass: config.smtpPassword,
      };
    }

    _transporter = nodemailer.createTransport(transportOptions);
  }
  return _transporter;
}

/**
 * Resets the cached transporter (used in testing environments).
 */
function resetTransporter() {
  _transporter = null;
}

/**
 * Generates clean, dark-mode branded HTML shell for Re:COVER security emails.
 */
function renderSecurityEmailShell({ title, subtitle, contentHtml, alertBoxHtml }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; }
    .wrapper { max-width: 580px; margin: 40px auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; }
    .header { padding: 32px 32px 24px; border-bottom: 1px solid #1f2937; text-align: center; }
    .logo-badge { display: inline-block; padding: 8px 18px; border-radius: 9999px; background-color: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.3); color: #06b6d4; font-family: monospace; font-size: 13px; font-weight: 700; letter-spacing: 2px; }
    .body { padding: 32px; }
    .otp-box { background-color: #090d16; border: 2px dashed rgba(6, 182, 212, 0.4); border-radius: 12px; padding: 20px; text-align: center; margin: 28px 0; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; text-shadow: 0 0 16px rgba(56, 189, 248, 0.4); }
    .alert-box { background-color: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 14px 18px; font-size: 12px; color: #f87171; line-height: 1.5; margin: 24px 0 16px; }
    .footer { padding: 24px 32px; background-color: #0d121f; border-top: 1px solid #1f2937; text-align: center; font-size: 11px; color: #64748b; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo-badge">RE:COVER DEFENSE FABRIC</div>
      <h2 style="margin: 16px 0 4px; font-size: 20px; color: #f8fafc;">${title}</h2>
      <p style="margin: 0; font-size: 13px; color: #94a3b8;">${subtitle}</p>
    </div>
    <div class="body">
      ${contentHtml}
      ${alertBoxHtml || ''}
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px;">This is an automated system notification from the Re:COVER Autonomous Digital Security Platform.</p>
      <p style="margin: 0;">If you did not initiate this request, your credentials may be compromised. Please investigate immediately.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Sends an email or records to development outbox if SMTP is unconfigured.
 *
 * @param {object} mailOptions { to, subject, html, text }
 * @returns {Promise<{ messageId: string, devRecorded?: boolean }>}
 */
async function sendMail(mailOptions) {
  const from = config.smtpFrom;
  const payload = {
    from,
    ...mailOptions,
  };

  // Always record sanitized mail event in dev outbox for local inspection & test assertions
  const recorded = {
    messageId: `dev-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    to: mailOptions.to,
    subject: mailOptions.subject,
    text: mailOptions.text,
    html: mailOptions.html,
    sentAt: new Date().toISOString(),
  };
  _devOutbox.push(recorded);

  if (!isConfigured()) {
    console.log(`[Email] SMTP unconfigured. Message stored in dev outbox for: ${mailOptions.to}`);
    return { messageId: recorded.messageId, devRecorded: true };
  }

  try {
    console.log(`[Email] Sending OTP email`);
    console.log(`[Email] SMTP host: ${config.smtpHost}`);
    console.log(`[Email] SMTP port: ${config.smtpPort}`);
    console.log(`[Email] Recipient: ${mailOptions.to}`);

    const transporter = getTransporter();
    const info = await transporter.sendMail(payload);
    console.log(`[Email] Message accepted: ${info.messageId}`);
    return { messageId: info.messageId, devRecorded: true };
  } catch (err) {
    console.error(`[Email] OTP send failed: ${err.message}`);
    // Sanitize error: never log passwords or raw connection strings
    const sanitizedError = new Error(`Email delivery failed: ${err.message || 'SMTP transport error'}`);
    sanitizedError.code = err.code || 'SMTP_ERROR';
    throw sanitizedError;
  }
}

/**
 * Sends a 6-digit email verification OTP.
 *
 * @param {object} params { to, otp, displayName }
 * @returns {Promise<{ messageId: string }>}
 */
async function sendEmailVerificationOtp({ to, otp, displayName }) {
  const greeting = displayName ? `Hello <strong>${displayName}</strong>,` : 'Hello,';
  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">${greeting}</p>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">
      Please use the following 6-digit verification code to confirm ownership of this email address and activate your Re:COVER security console access.
    </p>
    <div class="otp-box">
      <div style="font-size: 11px; letter-spacing: 1.5px; color: #64748b; margin-bottom: 8px; font-family: monospace;">ONE-TIME VERIFICATION CODE</div>
      <div class="otp-code">${otp}</div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Valid for ${config.otpTtlMinutes} minutes • Single-use only</div>
    </div>
  `;

  const alertBoxHtml = `
    <div class="alert-box">
      <strong>SECURITY NOTICE:</strong> Never share this code with anyone. Re:COVER staff and agents will never ask you for your verification code.
    </div>
  `;

  const html = renderSecurityEmailShell({
    title: 'Verify Your Email Address',
    subtitle: 'Re:COVER Enterprise Identity & Autonomous Recovery Console',
    contentHtml,
    alertBoxHtml,
  });

  const text = `Verify your Re:COVER email\n\nYour 6-digit verification code is: ${otp}\n\nThis code expires in ${config.otpTtlMinutes} minutes. Do not share this code with anyone.`;

  return await sendMail({
    to,
    subject: 'Verify your Re:COVER email',
    text,
    html,
  });
}

/**
 * Sends a 6-digit password reset OTP.
 *
 * @param {object} params { to, otp, displayName }
 * @returns {Promise<{ messageId: string }>}
 */
async function sendPasswordResetOtp({ to, otp, displayName }) {
  const greeting = displayName ? `Hello <strong>${displayName}</strong>,` : 'Hello,';
  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">${greeting}</p>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">
      A password reset request was received for your Re:COVER security profile. Enter the single-use recovery code below to proceed with setting a new password.
    </p>
    <div class="otp-box">
      <div style="font-size: 11px; letter-spacing: 1.5px; color: #64748b; margin-bottom: 8px; font-family: monospace;">PASSWORD RESET CODE</div>
      <div class="otp-code">${otp}</div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Expires in ${config.otpTtlMinutes} minutes • Single-use</div>
    </div>
  `;

  const alertBoxHtml = `
    <div class="alert-box">
      <strong>IMPORTANT:</strong> If you did NOT request this password reset, please disregard this email or notify your security administrator immediately. Your current password remains secure.
    </div>
  `;

  const html = renderSecurityEmailShell({
    title: 'Reset Your Re:COVER Password',
    subtitle: 'Secure Account Recovery Request',
    contentHtml,
    alertBoxHtml,
  });

  const text = `Reset your Re:COVER password\n\nYour password reset code is: ${otp}\n\nThis code expires in ${config.otpTtlMinutes} minutes. If you did not request this, please ignore this email.`;

  return await sendMail({
    to,
    subject: 'Reset your Re:COVER password',
    text,
    html,
  });
}

/**
 * Sends an urgent security notification alert.
 *
 * @param {object} params { to, subject, message, displayName }
 * @returns {Promise<{ messageId: string }>}
 */
async function sendSecurityNotification({ to, subject, message, displayName }) {
  const greeting = displayName ? `Hello <strong>${displayName}</strong>,` : 'Hello,';
  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">${greeting}</p>
    <div style="background-color: #090d16; border-left: 3px solid #06b6d4; padding: 16px; border-radius: 6px; font-size: 13px; line-height: 1.6;">
      ${message}
    </div>
  `;

  const html = renderSecurityEmailShell({
    title: subject,
    subtitle: 'Security Audit & Policy Alert',
    contentHtml,
  });

  return await sendMail({
    to,
    subject: `[Re:COVER Alert] ${subject}`,
    text: message,
    html,
  });
}

/**
 * Returns sent dev outbox entries (used strictly by test suites).
 * @returns {Array<object>}
 */
function getDevOutbox() {
  return [..._devOutbox];
}

/**
 * Clears the development outbox.
 */
function clearDevOutbox() {
  _devOutbox.length = 0;
}

module.exports = {
  isConfigured,
  sendEmailVerificationOtp,
  sendPasswordResetOtp,
  sendSecurityNotification,
  getDevOutbox,
  clearDevOutbox,
  resetTransporter,
};

