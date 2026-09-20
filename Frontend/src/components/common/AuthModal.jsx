import React, { useState, useEffect } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import {
  Shield,
  Mail,
  User,
  X,
  Lock,
  AlertTriangle,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  RotateCw,
  Smartphone
} from 'lucide-react';

export const AuthModal = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalMode,
    login,
    register,
    verifyEmailOtp,
    resendEmailOtp,
    requestPasswordReset,
    confirmPasswordReset,
    verify2fa,
    openAuthModal,
  } = useSecurity();

  // Internal modal step
  const [mode, setMode] = useState('login');

  // Form states
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // 2FA challenge states
  const [pending2faToken, setPending2faToken] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  // Status & Feedback
  const [localError, setLocalError] = useState(null);
  const [localNotice, setLocalNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Synchronize modal open/close and mode reset
  useEffect(() => {
    if (isAuthModalOpen) {
      setMode(authModalMode || 'login');
      setLocalError(null);
      setLocalNotice(null);
      setOtp('');
      setTotpCode('');
      setRecoveryCode('');
      setUseRecoveryCode(false);
    }
  }, [authModalMode, isAuthModalOpen]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  if (!isAuthModalOpen) return null;

  // ── Form Submissions ───────────────────────────────────────────────────────

  const handleLogin = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setIsSubmitting(true);
    try {
      const res = await login(email, password);
      if (res?.requires2FA) {
        setPending2faToken(res.pending2faToken);
        setMode('totp-challenge');
        return;
      }
      if (res?.requiresEmailVerification) {
        setMode('verify-email');
        setLocalNotice('Please enter the 6-digit verification code sent to your email.');
        return;
      }
    } catch (err) {
      setLocalError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Full name is required.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register(email, password, name.trim());
      if (res?.requiresEmailVerification) {
        setMode('verify-email');
        setLocalNotice(`Verification code sent to ${email}. Please confirm code to complete setup.`);
      }
    } catch (err) {
      setLocalError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (!otp.trim() || otp.trim().length !== 6) {
      setLocalError('Please enter a valid 6-digit verification code.');
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyEmailOtp(email, otp.trim());
    } catch (err) {
      setLocalError(err.message || 'Email verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendEmail = async () => {
    if (resendCooldown > 0) return;
    setLocalError(null);
    try {
      await resendEmailOtp(email);
      setLocalNotice(`A fresh verification code was sent to ${email}.`);
      setResendCooldown(60);
    } catch (err) {
      setLocalError(err.message || 'Failed to resend verification code.');
    }
  };

  const handleVerify2fa = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (useRecoveryCode) {
      if (!recoveryCode.trim()) {
        setLocalError('Please enter your emergency recovery code.');
        return;
      }
    } else {
      if (!totpCode.trim() || totpCode.trim().length !== 6) {
        setLocalError('Please enter the 6-digit code from your authenticator app.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await verify2fa(pending2faToken, {
        totpCode: useRecoveryCode ? undefined : totpCode.trim(),
        recoveryCode: useRecoveryCode ? recoveryCode.trim() : undefined,
      });
    } catch (err) {
      setLocalError(err.message || 'Two-factor verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestPasswordReset = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setLocalNotice(`If an account exists for ${email}, a 6-digit reset code has been dispatched.`);
      setMode('reset-password');
    } catch (err) {
      setLocalError(err.message || 'Failed to request password reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPasswordReset = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (!otp.trim() || otp.trim().length !== 6) {
      setLocalError('Please enter the 6-digit reset code.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setLocalError('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(email.trim(), otp.trim(), newPassword);
      setMode('login');
      setLocalNotice('Password reset successfully! Please sign in with your new credentials.');
      setPassword('');
    } catch (err) {
      setLocalError(err.message || 'Password reset failed. Check the code and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-surface-container border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 relative">
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
            {mode === 'totp-challenge' ? (
              <Smartphone className="w-6 h-6 text-primary" />
            ) : mode === 'forgot-password' || mode === 'reset-password' ? (
              <KeyRound className="w-6 h-6 text-primary" />
            ) : (
              <Shield className="w-6 h-6 text-primary" />
            )}
          </div>
          <h3 className="font-headline font-bold text-xl text-on-surface">
            {mode === 'signup' && 'Create Enterprise Security Profile'}
            {mode === 'login' && 'Sign in to RE:COVER Console'}
            {mode === 'verify-email' && 'Verify Email Address'}
            {mode === 'totp-challenge' && 'Two-Factor Authentication'}
            {mode === 'forgot-password' && 'Reset Account Password'}
            {mode === 'reset-password' && 'Set New Password'}
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">
            {mode === 'signup' && 'Zero-Trust Protected Console for Autonomous Incident Response'}
            {mode === 'login' && 'Secure Personal AI SOC & Recovery Platform'}
            {mode === 'verify-email' && `Enter the 6-digit code sent to ${email || 'your email'}`}
            {mode === 'totp-challenge' && 'Enter your authenticator code or emergency backup code'}
            {mode === 'forgot-password' && 'Enter your registered email to receive a recovery code'}
            {mode === 'reset-password' && 'Enter the reset code and choose a new master passphrase'}
          </p>
        </div>

        {/* Alerts & Notifications */}
        {localError && (
          <div className="mb-4 p-3 rounded-xl bg-error/15 border border-error/30 text-xs text-error font-medium flex items-center gap-2 animate-in fade-in duration-150">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="leading-snug">{localError}</span>
          </div>
        )}

        {localNotice && (
          <div className="mb-4 p-3 rounded-xl bg-secondary/15 border border-secondary/30 text-xs text-secondary font-medium flex items-center gap-2 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="leading-snug">{localNotice}</span>
          </div>
        )}

        {/* ── MODE 1: LOGIN ──────────────────────────────────────────────── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">ENTERPRISE EMAIL</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="name@enterprise.io"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-mono text-on-surface-variant">PASSWORD</label>
                <button
                  type="button"
                  onClick={() => { setMode('forgot-password'); setLocalError(null); }}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Authenticating...' : 'Authenticate & Launch'}
            </button>

            <div className="mt-5 text-center text-xs text-on-surface-variant">
              <p>
                Need a new enterprise tenant?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setLocalError(null); }}
                  className="text-primary hover:underline font-semibold"
                >
                  Request Deployment
                </button>
              </p>
            </div>
          </form>
        )}

        {/* ── MODE 2: SIGNUP ─────────────────────────────────────────────── */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">FULL NAME</label>
              <div className="relative">
                <User className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="Alex Vance"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">ENTERPRISE EMAIL</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="name@enterprise.io"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">PASSWORD (MIN 8 CHARS, 1 UPPER, 1 NUMBER)</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">CONFIRM PASSWORD</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Registering...' : 'Create Account & Send Code'}
            </button>

            <div className="mt-5 text-center text-xs text-on-surface-variant">
              <p>
                Already have an enterprise account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setLocalError(null); }}
                  className="text-primary hover:underline font-semibold"
                >
                  Log In
                </button>
              </p>
            </div>
          </form>
        )}

        {/* ── MODE 3: EMAIL VERIFICATION OTP ──────────────────────────────── */}
        {mode === 'verify-email' && (
          <form onSubmit={handleVerifyEmail} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5 text-center">
                6-DIGIT VERIFICATION CODE
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full py-3 text-center tracking-[0.5em] font-mono font-bold text-lg bg-surface-container-lowest border border-white/10 rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors"
                placeholder="000000"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otp.length !== 6}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Verifying Code...' : 'Verify Email & Enter'}
            </button>

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={handleResendEmail}
                disabled={resendCooldown > 0}
                className="text-primary hover:underline flex items-center gap-1.5 disabled:opacity-50 disabled:no-underline"
              >
                <RotateCw className={`w-3.5 h-3.5 ${resendCooldown > 0 ? 'animate-spin' : ''}`} />
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend verification code'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setLocalError(null); }}
                className="text-on-surface-variant hover:text-on-surface"
              >
                Return to Login
              </button>
            </div>
          </form>
        )}

        {/* ── MODE 4: TOTP 2FA CHALLENGE ─────────────────────────────────── */}
        {mode === 'totp-challenge' && (
          <form onSubmit={handleVerify2fa} className="space-y-4">
            {!useRecoveryCode ? (
              <div>
                <label className="block text-xs font-mono text-on-surface-variant mb-1.5 text-center">
                  AUTHENTICATOR APP CODE
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full py-3 text-center tracking-[0.5em] font-mono font-bold text-lg bg-surface-container-lowest border border-white/10 rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="000000"
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-mono text-on-surface-variant mb-1.5 text-center">
                  EMERGENCY BACKUP RECOVERY CODE
                </label>
                <input
                  type="text"
                  required
                  value={recoveryCode}
                  onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
                  className="w-full py-3 text-center font-mono font-semibold text-sm bg-surface-container-lowest border border-white/10 rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="XXXX-XXXX-XXXX"
                  autoFocus
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Verifying 2FA...' : 'Authorize Session'}
            </button>

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={() => { setUseRecoveryCode(!useRecoveryCode); setLocalError(null); }}
                className="text-primary hover:underline"
              >
                {useRecoveryCode ? 'Use 6-digit Authenticator' : 'Use Backup Recovery Code'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setLocalError(null); }}
                className="text-on-surface-variant hover:text-on-surface"
              >
                Back
              </button>
            </div>
          </form>
        )}

        {/* ── MODE 5: FORGOT PASSWORD ────────────────────────────────────── */}
        {mode === 'forgot-password' && (
          <form onSubmit={handleRequestPasswordReset} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">REGISTERED ENTERPRISE EMAIL</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="name@enterprise.io"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Sending Code...' : 'Send Recovery Code'}
            </button>

            <div className="mt-5 text-center text-xs">
              <button
                type="button"
                onClick={() => { setMode('login'); setLocalError(null); }}
                className="text-primary hover:underline flex items-center justify-center gap-1.5 mx-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* ── MODE 6: RESET PASSWORD ─────────────────────────────────────── */}
        {mode === 'reset-password' && (
          <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5 text-center">
                6-DIGIT RESET CODE
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full py-2.5 text-center tracking-[0.5em] font-mono font-bold text-base bg-surface-container-lowest border border-white/10 rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors"
                placeholder="000000"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">NEW PASSWORD</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">CONFIRM NEW PASSWORD</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otp.length !== 6}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Updating Password...' : 'Save New Password & Log In'}
            </button>

            <div className="mt-5 text-center text-xs">
              <button
                type="button"
                onClick={() => { setMode('login'); setLocalError(null); }}
                className="text-primary hover:underline flex items-center justify-center gap-1.5 mx-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
