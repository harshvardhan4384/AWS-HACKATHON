import React, { useState, useEffect, useCallback } from 'react';
import { useSecurity } from '../context/SecurityContext';
import { api } from '../services/api';
import {
  ShieldCheck,
  Shield,
  ShieldAlert,
  Key,
  Clock,
  RefreshCw,
  Unlink,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Lock,
  GitCommit,
  GitPullRequest,
  GitFork,
  Star,
  Laptop,
  Radio,
  User,
  MapPin,
  Check,
  Copy,
  Info
} from 'lucide-react';

const GitHubLogo = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const GoogleLogo = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path fill="#EA4335" d="M12 5c1.54 0 2.9.54 3.97 1.43l2.97-2.97C17.15 1.8 14.77 1 12 1 7.42 1 3.55 3.58 1.63 7.34l3.58 2.78C6.07 7.08 8.79 5 12 5z" />
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.16-1.99 3.71-4.93 3.71-8.7z" />
    <path fill="#FBBC05" d="M5.21 14.88C4.95 14.12 4.8 13.3 4.8 12.45s.15-1.67.41-2.43L1.63 7.24C.59 9.32 0 10.82 0 12.45s.59 3.13 1.63 5.21l3.58-2.78z" />
    <path fill="#34A853" d="M12 23.9c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.07.72-2.44 1.16-4.22 1.16-3.21 0-5.93-2.08-6.79-5.12L1.63 16.93C3.55 20.69 7.42 23.9 12 23.9z" />
  </svg>
);

export const AccountSecurityModal = ({
  account,
  isOpen,
  onClose,
  onDisconnect,
}) => {
  const { fetchAccountSecurityOverview, addToast } = useSecurity();
  const [overviewData, setOverviewData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [copiedKeyId, setCopiedKeyId] = useState(null);

  const loadOverview = useCallback(async (refresh = false) => {
    if (!account) return;
    try {
      if (refresh) setIsSyncing(true);
      else setIsLoading(true);
      setErrorMessage(null);

      const data = await fetchAccountSecurityOverview(account.id, refresh);
      setOverviewData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load security overview');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [account, fetchAccountSecurityOverview]);

  const handleManualSync = async () => {
    if (!account) return;
    try {
      setIsSyncing(true);
      const res = await api.post(`/api/oauth/connected/${account.id}/sync`);
      if (addToast) {
        addToast(
          'success',
          'Incremental Sync Complete',
          `Processed ${res?.data?.eventsIngested || 0} event(s), skipped ${res?.data?.duplicatesSkipped || 0} duplicate(s).`
        );
      }
      await loadOverview(true);
    } catch (err) {
      if (addToast) {
        addToast('error', 'Sync Failed', err.message || 'Synchronization encountered an error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const copyFingerprint = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  useEffect(() => {
    if (isOpen && account) {
      loadOverview(false);
    } else {
      setOverviewData(null);
      setErrorMessage(null);
    }
  }, [isOpen, account, loadOverview]);

  if (!isOpen || !account) return null;

  const provider = (overviewData?.provider || account.provider || 'OAUTH').toUpperCase();
  const isGoogle = provider === 'GOOGLE';
  const isGitHub = provider === 'GITHUB';

  const acct = overviewData?.account || {
    displayName: account.providerDisplayName || 'Operator',
    email: account.email,
    providerUserId: account.providerAccountId,
  };

  const secOverview = overviewData?.securityOverview || {};
  const twoFactor = secOverview.twoFactorAuth || {};
  const loginHistory = secOverview.loginHistory || {};
  const devices = secOverview.sessionsAndDevices || {};
  const passwordSec = secOverview.passwordSecurity || {};
  const oauthData = overviewData?.oauth || {};
  const syncData = overviewData?.sync || {};
  const sshKeys = overviewData?.sshKeys || [];
  const activity = overviewData?.activity || [];
  const securityEvents = secOverview.securityEvents?.events || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-surface-container rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden text-on-surface">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-container-high/50">
          <div className="flex items-center gap-3">
            {isGitHub ? <GitHubLogo /> : <GoogleLogo />}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline font-bold text-base text-zinc-100">
                  {acct.displayName || account.providerDisplayName || 'Connected Account'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  MONITORED
                </span>
              </div>
              <p className="text-xs text-outline font-mono">
                {acct.email || acct.username ? `${acct.email || `@${acct.username}`} • ` : ''}ID: {acct.providerUserId || account.providerAccountId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-container-highest border border-white/10 text-xs font-mono transition-colors disabled:opacity-50"
              title="Run Incremental Security Synchronization"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-primary' : 'text-outline'}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            <button
              onClick={() => onDisconnect(account)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-mono transition-colors"
              title="Disconnect Account"
            >
              <Unlink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-outline hover:text-on-surface transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content — 12 Primary SOC Sections */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-outline space-y-3">
              <RefreshCw className="w-7 h-7 animate-spin text-primary" />
              <p className="text-xs font-mono uppercase tracking-wider">Collecting Real Provider Telemetry...</p>
            </div>
          ) : errorMessage ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : (
            <>
              {/* 1. Account Section */}
              <div className="rounded-xl bg-surface p-4 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {acct.avatarUrl ? (
                    <img src={acct.avatarUrl} alt={acct.displayName} className="w-12 h-12 rounded-full border border-white/10 object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-white/10 text-outline">
                      <User className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <h4 className="font-headline font-bold text-sm text-zinc-100 flex items-center gap-2">
                      {acct.displayName}
                      {acct.accountType && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container text-outline border border-white/5 font-normal">
                          {acct.accountType}
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-outline font-mono mt-0.5">
                      {acct.email || (acct.username ? `@${acct.username}` : 'No public email')}
                    </p>
                  </div>
                </div>

                {acct.profileUrl && (
                  <a
                    href={acct.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-xs font-mono text-primary hover:text-primary-container transition-colors border border-white/5"
                  >
                    <span>Open Provider Profile</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {/* 2. Security Status & 11. Re:COVER Monitoring Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 2. Security Status */}
                <div className="rounded-xl bg-surface p-4 border border-white/5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" /> 2. Security Status
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                      PROTECTED
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">
                    Continuous monitoring active. Real-time anomalies are correlated into the Re:COVER Risk Engine.
                  </p>
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-outline">
                    <span>Incidents Linked:</span>
                    <span className="text-zinc-200 font-bold">{securityEvents.length > 0 ? 'Logged' : '0 Active'}</span>
                  </div>
                </div>

                {/* 11. Re:COVER Monitoring */}
                <div className="rounded-xl bg-surface p-4 border border-white/5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-primary animate-pulse" /> 11. Re:COVER Monitoring
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {syncData.monitoringMode || 'INCREMENTAL_POLLING'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">
                    Incremental ingestion active. Zero fabrication policy enforced: telemetry strictly comes from verified official provider endpoints.
                  </p>
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-outline">
                    <span>Sync Interval:</span>
                    <span className="text-zinc-200">5 mins / On-Demand</span>
                  </div>
                </div>
              </div>

              {/* 3. Devices / Sessions & 4. Login Activity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 3. Devices / Sessions */}
                <div className="rounded-xl bg-surface p-4 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                      <Laptop className="w-4 h-4 text-zinc-400" /> 3. Devices / Sessions
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${devices.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {devices.status || 'NOT_AVAILABLE'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface-container p-3 text-xs text-outline space-y-1">
                    <p className="leading-relaxed">
                      {devices.detail || 'Device inventory is not exposed through the current official API integration.'}
                    </p>
                    <p className="text-[11px] text-zinc-500 italic">
                      Zero-fabrication notice: Simulated device counts or mock session records are never displayed.
                    </p>
                  </div>
                </div>

                {/* 4. Login Activity */}
                <div className="rounded-xl bg-surface p-4 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-zinc-400" /> 4. Login Activity
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${loginHistory.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {loginHistory.status || 'NOT_AVAILABLE'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface-container p-3 text-xs text-outline space-y-1">
                    <p className="leading-relaxed">
                      {loginHistory.detail || 'Login history is not available through this provider integration.'}
                    </p>
                    <p className="text-[11px] text-zinc-500 italic">
                      Zero-fabrication notice: Authentication events must come from official security audit feeds.
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Password Security & 6. 2FA / Authentication */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 5. Password Security */}
                <div className="rounded-xl bg-surface p-4 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-zinc-400" /> 5. Password Security
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${passwordSec.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {passwordSec.status || 'NOT_AVAILABLE'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface-container p-3 text-xs text-outline space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span>Last password change:</span>
                      <span className="text-zinc-200 font-medium">
                        {passwordSec.lastPasswordChange ? new Date(passwordSec.lastPasswordChange).toLocaleDateString() : 'Not available through official API'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 italic">
                      Zero-fabrication notice: Password change dates are never estimated from tokens or account creation.
                    </p>
                  </div>
                </div>

                {/* 6. 2FA / Authentication */}
                <div className="rounded-xl bg-surface p-4 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-zinc-400" /> 6. 2FA / Authentication
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                      twoFactor.enabled === true ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      twoFactor.enabled === false ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {twoFactor.enabled === true ? 'ENROLLED & ACTIVE' : twoFactor.enabled === false ? 'DISABLED (HIGH RISK)' : twoFactor.status || 'NOT_AVAILABLE'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface-container p-3 text-xs text-outline">
                    <p>{twoFactor.detail || '2FA status is not available.'}</p>
                  </div>
                </div>
              </div>

              {/* 7. Security Changes */}
              <div className="rounded-xl bg-surface p-4 border border-white/5 space-y-3">
                <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> 7. Security Changes & Re:COVER Security Timeline
                </span>
                {securityEvents.length === 0 ? (
                  <div className="rounded-lg bg-surface-container p-4 text-center text-xs text-outline font-mono">
                    Zero security anomalies or configuration changes observed in current window.
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
                    {securityEvents.map((evt) => (
                      <div key={evt.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            evt.severity === 'HIGH' || evt.severity === 'CRITICAL' ? 'bg-red-500/15 text-red-400' : 'bg-zinc-800 text-zinc-300'
                          }`}>
                            {evt.severity || 'INFO'}
                          </span>
                          <span className="text-zinc-200">{evt.eventType}</span>
                        </div>
                        <span className="text-outline text-[11px]">{new Date(evt.occurredAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 8. OAuth / Connected Applications (Secondary connection metadata) */}
              <div className="rounded-xl bg-surface p-4 border border-white/5 space-y-3">
                <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-zinc-400" /> 8. OAuth / Connected Applications
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="rounded-lg bg-surface-container p-2.5">
                    <span className="text-outline block text-[10px]">Token Storage</span>
                    <span className="text-emerald-400 font-medium">AES-256-GCM</span>
                  </div>
                  <div className="rounded-lg bg-surface-container p-2.5">
                    <span className="text-outline block text-[10px]">Refresh Token</span>
                    <span className="text-zinc-200 font-medium">{oauthData.hasRefreshToken ? 'Encrypted at rest' : 'Not required'}</span>
                  </div>
                  <div className="rounded-lg bg-surface-container p-2.5">
                    <span className="text-outline block text-[10px]">Token Expiry</span>
                    <span className="text-zinc-200 font-medium">{oauthData.tokenExpiresInSec ? `${oauthData.tokenExpiresInSec}s` : 'Valid'}</span>
                  </div>
                  <div className="rounded-lg bg-surface-container p-2.5">
                    <span className="text-outline block text-[10px]">Revocation</span>
                    <span className="text-emerald-400 font-medium">Supported</span>
                  </div>
                </div>
                {oauthData.scopes && oauthData.scopes.length > 0 && (
                  <div className="pt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono text-outline mr-1">Authorized Scopes:</span>
                    {oauthData.scopes.map((s, idx) => (
                      <span key={idx} className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container text-zinc-300 border border-white/5">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 9. SSH Keys (GitHub Specific) */}
              {isGitHub && (
                <div className="rounded-xl bg-surface p-4 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-primary" /> 9. Public SSH Keys ({sshKeys.length})
                    </span>
                    <span className="text-[10px] font-mono text-outline">OpenSSH SHA-256 Fingerprints</span>
                  </div>

                  {sshKeys.length === 0 ? (
                    <div className="rounded-lg bg-surface-container p-4 text-center text-xs text-outline font-mono">
                      Zero public SSH keys registered on this GitHub profile.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sshKeys.map((key) => (
                        <div key={key.id} className="rounded-lg bg-surface-container p-3 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-200 font-bold">{key.title}</span>
                              <span className="px-1.5 py-0.2 rounded bg-surface text-[10px] text-primary">{key.type}</span>
                            </div>
                            <div className="text-[11px] text-outline mt-1 font-mono flex items-center gap-2">
                              <span>Fingerprint: <span className="text-zinc-300">{key.fingerprint}</span></span>
                              <button
                                onClick={() => copyFingerprint(key.id, key.fingerprint)}
                                className="text-outline hover:text-primary transition-colors"
                                title="Copy Fingerprint"
                              >
                                {copiedKeyId === key.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                          {key.createdAt && (
                            <span className="text-[11px] text-outline self-start sm:self-center">
                              Added {new Date(key.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 10. Recent Activity (Strictly REPOSITORY_ACTIVITY, clearly separated from logins) */}
              {isGitHub && activity.length > 0 && (
                <div className="rounded-xl bg-surface p-4 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase font-bold text-outline tracking-wider flex items-center gap-1.5">
                      <GitCommit className="w-4 h-4 text-zinc-400" /> 10. Recent Repository Activity
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container text-outline">
                      CATEGORY: REPOSITORY_ACTIVITY
                    </span>
                  </div>
                  <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
                    {activity.map((act) => (
                      <div key={act.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] text-primary shrink-0">
                            {act.type}
                          </span>
                          <span className="text-zinc-300 truncate">{act.action} <span className="text-zinc-100 font-medium">{act.repo}</span></span>
                        </div>
                        <span className="text-outline text-[11px] shrink-0 ml-2">
                          {new Date(act.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 12. Last Synchronized Timestamp */}
              <div className="pt-2 flex items-center justify-between text-xs font-mono text-outline border-t border-white/10">
                <span>12. Last Synchronized: <span className="text-zinc-200">{syncData.lastSyncedAt ? new Date(syncData.lastSyncedAt).toLocaleString() : 'Never'}</span></span>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Re:COVER Live Guard Active
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountSecurityModal;
