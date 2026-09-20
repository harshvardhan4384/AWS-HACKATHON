import React, { useState, useEffect } from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  User,
  Mail,
  Phone,
  Lock,
  Smartphone,
  KeyRound,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  Check
} from 'lucide-react';

export const ProfileSettingsPage = () => {
  const {
    currentUser,
    updateProfile,
    changePassword,
    fetchSessions,
    revokeSession,
    revokeOtherSessions,
    setup2fa,
    enable2fa,
    disable2fa,
    regenerateRecoveryCodes,
    openAuthModal,
    addToast
  } = useSecurity();

  // Personal Info Form State
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Active Sessions State
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // 2FA Setup Modal State
  const [is2faSetupOpen, setIs2faSetupOpen] = useState(false);
  const [setupData, setSetupData] = useState(null); // { secret, otpauthUri, qrCodeUrl }
  const [setupTotpCode, setSetupTotpCode] = useState('');
  const [isEnabling2fa, setIsEnabling2fa] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState(null);
  const [hasCopiedCodes, setHasCopiedCodes] = useState(false);

  // 2FA Disable Modal State
  const [is2faDisableOpen, setIs2faDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [isDisabling2fa, setIsDisabling2fa] = useState(false);

  // 2FA Regenerate Codes Modal State
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Synchronize initial user state
  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.displayName || '');
      setAvatarUrl(currentUser.avatarUrl || '');
      setPhoneNumber(currentUser.phoneNumber || '');
    }
  }, [currentUser]);

  // Load active sessions
  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const list = await fetchSessions();
      setSessions(list || []);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // ── Profile Update ──────────────────────────────────────────────────────────
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || null,
        phoneNumber: phoneNumber.trim() || null,
      });
    } catch {
      // toast is already dispatched by SecurityContext
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // ── Password Change ─────────────────────────────────────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      addToast('error', 'Validation Error', 'New passwords do not match.');
      return;
    }
    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      // error handled in SecurityContext
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ── 2FA Initiation ─────────────────────────────────────────────────────────
  const handleStart2faSetup = async () => {
    try {
      const data = await setup2fa();
      setSetupData(data);
      setSetupTotpCode('');
      setNewRecoveryCodes(null);
      setIs2faSetupOpen(true);
    } catch {
      // error handled in SecurityContext
    }
  };

  const handleConfirmEnable2fa = async (e) => {
    e.preventDefault();
    if (!setupTotpCode || setupTotpCode.length !== 6) {
      addToast('error', 'Validation Error', 'Please enter the 6-digit code from your authenticator app.');
      return;
    }
    setIsEnabling2fa(true);
    try {
      const res = await enable2fa(setupData.secret, setupTotpCode);
      if (res?.recoveryCodes) {
        setNewRecoveryCodes(res.recoveryCodes);
      } else {
        setIs2faSetupOpen(false);
      }
    } catch {
      // error handled in context
    } finally {
      setIsEnabling2fa(false);
    }
  };

  const handleDisable2fa = async (e) => {
    e.preventDefault();
    setIsDisabling2fa(true);
    try {
      await disable2fa(disablePassword, {
        totpCode: disableCode.length === 6 ? disableCode : undefined,
        recoveryCode: disableCode.length > 6 ? disableCode : undefined,
      });
      setIs2faDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
    } catch {
      // error handled in context
    } finally {
      setIsDisabling2fa(false);
    }
  };

  const handleRegenerateCodes = async (e) => {
    e.preventDefault();
    setIsRegenerating(true);
    try {
      const res = await regenerateRecoveryCodes(regenPassword);
      setNewRecoveryCodes(res?.recoveryCodes || []);
      setIsRegenerateOpen(false);
      setRegenPassword('');
      setIs2faSetupOpen(true); // Open modal to present fresh codes
    } catch {
      // error handled in context
    } finally {
      setIsRegenerating(false);
    }
  };

  const copyRecoveryCodes = () => {
    if (!newRecoveryCodes) return;
    navigator.clipboard.writeText(newRecoveryCodes.join('\n'));
    setHasCopiedCodes(true);
    addToast('success', 'Copied', 'Recovery codes copied to clipboard.');
    setTimeout(() => setHasCopiedCodes(false), 2500);
  };

  const downloadRecoveryCodes = () => {
    if (!newRecoveryCodes) return;
    const element = document.createElement('a');
    const file = new Blob([
      `RE:COVER EMERGENCY 2FA RECOVERY CODES\nGenerated: ${new Date().toISOString()}\nAccount: ${currentUser?.email}\n\n` +
      newRecoveryCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
      `\n\nTreat these codes like your master password. Each code can only be used once.`
    ], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `recover-backup-codes-${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    addToast('info', 'Downloaded', 'Backup codes file saved.');
  };

  const isEmailVerified = Boolean(currentUser?.emailVerifiedAt);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              Identity & Security
            </span>
            <span className="text-[10px] font-mono text-outline">v1.0.0-MVP</span>
          </div>
          <h1 className="text-2xl font-bold font-headline text-on-surface">
            Account Security & Operator Profile
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Manage your personal credentials, TOTP two-factor authentication, active devices, and defense controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono ${
            currentUser?.twoFactorEnabled
              ? 'bg-secondary/10 border-secondary/30 text-secondary'
              : 'bg-amber-400/10 border-amber-400/30 text-amber-400'
          }`}>
            {currentUser?.twoFactorEnabled ? (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>2FA PROTECTED</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4" />
                <span>2FA DISABLED</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── COLUMN 1 & 2: Main Configuration ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Section 1: Personal Information */}
          <div className="p-6 rounded-2xl bg-surface-container border border-white/5 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Operator Details</h3>
                  <p className="text-[11px] text-on-surface-variant">Personal profile attributes and avatar identification</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Avatar Preview + URL */}
              <div className="flex items-center gap-4 p-3.5 rounded-xl bg-surface-container-lowest border border-white/5">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
                  {avatarUrl && /^https?:\/\//i.test(avatarUrl) ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar Preview"
                      className="w-full h-full object-cover"
                      onError={() => setAvatarUrl('')}
                    />
                  ) : (
                    <span className="font-bold text-lg text-primary">
                      {(displayName || currentUser?.email || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-[11px] font-mono text-outline mb-1">AVATAR IMAGE URL (HTTPS)</label>
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={e => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    className="w-full px-3 py-1.5 bg-surface-container border border-white/10 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  />
                  <p className="text-[10px] text-outline mt-1">Leave empty to use automatic monogram avatar</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-on-surface-variant mb-1.5">DISPLAY NAME</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-outline absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Alex Vance"
                      className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-on-surface-variant mb-1.5">PHONE NUMBER (OPTIONAL)</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-outline absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                      placeholder="+1 (555) 019-2834"
                      className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-on-surface-variant mb-1.5">
                  ENTERPRISE EMAIL ADDRESS (CANNOT BE CHANGED DIRECTLY)
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Mail className="w-4 h-4 text-outline absolute left-3 top-2.5" />
                    <input
                      type="email"
                      disabled
                      value={currentUser?.email || ''}
                      className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest/50 border border-white/5 rounded-xl text-xs text-outline cursor-not-allowed"
                    />
                  </div>
                  {isEmailVerified ? (
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/15 border border-secondary/30 text-secondary text-xs font-mono font-medium flex-shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      VERIFIED
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openAuthModal('verify-email')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-400 text-xs font-mono font-medium hover:bg-amber-400/20 transition-colors flex-shrink-0"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      VERIFY NOW
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isUpdatingProfile}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {isUpdatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Password Management */}
          <div className="p-6 rounded-2xl bg-surface-container border border-white/5 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Change Master Passphrase</h3>
                  <p className="text-[11px] text-on-surface-variant">Update your console login password with zero-trust bcrypt hashing</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-on-surface-variant mb-1.5">CURRENT PASSWORD</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-outline absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-on-surface-variant mb-1.5">NEW PASSWORD</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-outline absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-on-surface-variant mb-1.5">CONFIRM NEW PASSWORD</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-outline absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-4 py-2 rounded-xl bg-surface-container-highest hover:bg-surface-variant text-on-surface font-semibold text-xs border border-white/10 transition-colors disabled:opacity-50"
                >
                  {isChangingPassword ? 'Updating Passphrase...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Section 3: Two-Factor Authentication (TOTP) */}
          <div className="p-6 rounded-2xl bg-surface-container border border-white/5 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Two-Factor Authentication (TOTP)</h3>
                  <p className="text-[11px] text-on-surface-variant">RFC 6238 time-based one-time passcodes with encrypted storage at rest</p>
                </div>
              </div>

              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase ${
                currentUser?.twoFactorEnabled
                  ? 'bg-secondary/15 text-secondary border border-secondary/30'
                  : 'bg-outline/10 text-outline border border-outline/20'
              }`}>
                {currentUser?.twoFactorEnabled ? 'ENFORCED' : 'OFF'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-on-surface">
                  {currentUser?.twoFactorEnabled
                    ? 'Authenticator App 2FA is Active'
                    : 'Protect your account with Google Authenticator or Microsoft Authenticator'}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  {currentUser?.twoFactorEnabled
                    ? 'Each sign-in requires your password plus a rotating 6-digit passcode or emergency recovery code.'
                    : 'Prevent account takeover by requiring an authenticator code whenever you log in.'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {currentUser?.twoFactorEnabled ? (
                  <>
                    <button
                      onClick={() => setIsRegenerateOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-white/10 text-xs text-on-surface font-medium transition-colors"
                    >
                      Regenerate Codes
                    </button>
                    <button
                      onClick={() => setIs2faDisableOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-error/10 hover:bg-error/20 border border-error/30 text-xs text-error font-medium transition-colors"
                    >
                      Disable 2FA
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStart2faSetup}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-xs shadow-md transition-colors"
                  >
                    Enable Authenticator 2FA
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── COLUMN 3: Active Sessions & Fleet Access ──────────────────────── */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-surface-container border border-white/5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <Laptop className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-on-surface">Active Sessions</h3>
              </div>
              <button
                onClick={loadSessions}
                disabled={isLoadingSessions}
                className="text-outline hover:text-on-surface p-1 rounded transition-colors"
                title="Refresh sessions"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <p className="text-[11px] text-on-surface-variant">
              Devices and network endpoints currently authenticated with active session cookies.
            </p>

            <div className="space-y-3">
              {sessions.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 text-center text-xs text-outline">
                  No other active sessions detected.
                </div>
              ) : (
                sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      sess.isCurrent
                        ? 'bg-primary/5 border-primary/30 shadow-sm'
                        : 'bg-surface-container-lowest border-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Laptop className="w-3.5 h-3.5 text-outline flex-shrink-0" />
                        <span className="text-xs font-semibold text-on-surface truncate">
                          {sess.userAgent?.includes('Mozilla') ? 'Web Browser Console' : (sess.userAgent || 'API Session')}
                        </span>
                      </div>
                      {sess.isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-secondary/15 text-secondary border border-secondary/30 uppercase">
                          CURRENT
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] font-mono text-outline space-y-0.5">
                      <div>IP: {sess.ipAddress || '127.0.0.1'}</div>
                      <div>Active: {sess.lastUsedAt ? new Date(sess.lastUsedAt).toLocaleString() : 'Just now'}</div>
                    </div>

                    {!sess.isCurrent && (
                      <div className="mt-2.5 pt-2 border-t border-white/5 flex justify-end">
                        <button
                          onClick={async () => {
                            await revokeSession(sess.id);
                            loadSessions();
                          }}
                          className="text-[10px] text-error hover:underline flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Revoke Device
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {sessions.filter(s => !s.isCurrent).length > 0 && (
              <button
                onClick={async () => {
                  await revokeOtherSessions();
                  loadSessions();
                }}
                className="w-full py-2 rounded-xl bg-surface-container-lowest hover:bg-error/10 hover:text-error border border-white/10 text-xs font-medium text-on-surface-variant transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Revoke All Other Sessions
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 2FA SETUP MODAL ─────────────────────────────────────────────────── */}
      {is2faSetupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-surface-container border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 relative">
            <button
              onClick={() => { setIs2faSetupOpen(false); setNewRecoveryCodes(null); }}
              className="absolute top-4 right-4 text-outline hover:text-on-surface p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {!newRecoveryCodes ? (
              <form onSubmit={handleConfirmEnable2fa} className="space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <h3 className="font-headline font-bold text-lg text-on-surface">
                    Set Up Authenticator 2FA
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Scan this QR code with Google Authenticator, Microsoft Authenticator, or 1Password.
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl mx-auto w-48 h-48 shadow-inner">
                  {setupData?.qrCodeUrl ? (
                    <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="w-full h-full object-contain" />
                  ) : (
                    <div className="animate-pulse text-xs text-black font-mono">Loading QR Code...</div>
                  )}
                </div>

                {/* Manual Key */}
                <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 text-center">
                  <p className="text-[10px] font-mono text-outline mb-1">CANNOT SCAN? ENTER KEY MANUALLY</p>
                  <p className="text-xs font-mono font-bold text-primary select-all tracking-wider">
                    {setupData?.secret}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-mono text-on-surface-variant mb-1.5 text-center">
                    ENTER 6-DIGIT CODE TO VERIFY
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={setupTotpCode}
                    onChange={e => setSetupTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full py-2.5 text-center tracking-[0.5em] font-mono font-bold text-base bg-surface-container-lowest border border-white/10 rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors"
                    placeholder="000000"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={isEnabling2fa || setupTotpCode.length !== 6}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {isEnabling2fa ? 'Verifying...' : 'Verify & Activate 2FA'}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary mx-auto mb-3">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <h3 className="font-headline font-bold text-lg text-on-surface">
                    Save Your Emergency Recovery Codes
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Store these single-use codes safely. If you lose your mobile device, they are the only way to regain console access.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 p-4 rounded-xl bg-surface-container-lowest border border-white/10 font-mono text-xs text-on-surface font-semibold text-center">
                  {newRecoveryCodes.map((code, idx) => (
                    <div key={idx} className="p-2 rounded bg-surface-container border border-white/5 select-all">
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={copyRecoveryCodes}
                    className="flex-1 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface border border-white/10 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    {hasCopiedCodes ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
                    {hasCopiedCodes ? 'Copied Codes!' : 'Copy All Codes'}
                  </button>

                  <button
                    onClick={downloadRecoveryCodes}
                    className="flex-1 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface border border-white/10 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download (.txt)
                  </button>
                </div>

                <button
                  onClick={() => { setIs2faSetupOpen(false); setNewRecoveryCodes(null); }}
                  className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-xs uppercase tracking-wider hover:brightness-110 transition-all"
                >
                  I Have Stored My Recovery Codes
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 2FA DISABLE MODAL ───────────────────────────────────────────────── */}
      {is2faDisableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-container border border-white/10 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setIs2faDisableOpen(false)}
              className="absolute top-4 right-4 text-outline hover:text-on-surface p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handleDisable2fa} className="space-y-4">
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-error mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h3 className="font-headline font-bold text-lg text-on-surface">Disable Two-Factor Auth</h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Re-authenticate with your master password and a valid code to disable 2FA protection.
                </p>
              </div>

              <div>
                <label className="block text-xs font-mono text-on-surface-variant mb-1.5">CURRENT MASTER PASSWORD</label>
                <input
                  type="password"
                  required
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-error transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-on-surface-variant mb-1.5">
                  AUTHENTICATOR CODE OR RECOVERY CODE
                </label>
                <input
                  type="text"
                  required
                  value={disableCode}
                  onChange={e => setDisableCode(e.target.value)}
                  placeholder="000000 or XXXX-XXXX-XXXX"
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface font-mono focus:outline-none focus:border-error transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIs2faDisableOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-outline hover:text-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDisabling2fa}
                  className="px-4 py-2 rounded-xl bg-error hover:brightness-110 text-on-error font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {isDisabling2fa ? 'Disabling...' : 'Confirm & Disable 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── REGENERATE RECOVERY CODES MODAL ─────────────────────────────────── */}
      {isRegenerateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-container border border-white/10 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setIsRegenerateOpen(false)}
              className="absolute top-4 right-4 text-outline hover:text-on-surface p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handleRegenerateCodes} className="space-y-4">
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 mx-auto mb-3">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="font-headline font-bold text-lg text-on-surface">Regenerate Recovery Codes</h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  This will invalidate all previous backup codes. Enter your password to proceed.
                </p>
              </div>

              <div>
                <label className="block text-xs font-mono text-on-surface-variant mb-1.5">CURRENT MASTER PASSWORD</label>
                <input
                  type="password"
                  required
                  value={regenPassword}
                  onChange={e => setRegenPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRegenerateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-outline hover:text-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRegenerating}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {isRegenerating ? 'Generating...' : 'Regenerate Codes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

