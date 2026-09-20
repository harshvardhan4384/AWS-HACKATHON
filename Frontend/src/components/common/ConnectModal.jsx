import React, { useState } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { Network, Check, X, Shield, ArrowRight, RefreshCw, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react';

export const ConnectModal = () => {
  const { isConnectModalOpen, closeConnectModal, connectAccount, startOAuthConnect } = useSecurity();

  const [step, setStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState('google');
  const [accountName, setAccountName] = useState('');
  const [roleArnOrSecret, setRoleArnOrSecret] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [oauthError, setOauthError] = useState(null);

  if (!isConnectModalOpen) return null;

  const providers = [
    { type: 'google', name: 'Google Cloud & Workspace', desc: 'OAuth 2.0 PKCE, OpenID Connect, Admin SDK & GCP Audit Logs', iconBg: 'bg-blue-500/10 text-blue-400', badge: 'REAL OAUTH' },
    { type: 'github', name: 'GitHub Enterprise', desc: 'OAuth 2.0 Web Flow, Organization Audit Logs, PATs & Webhooks', iconBg: 'bg-purple-500/10 text-purple-400', badge: 'REAL OAUTH' },
    { type: 'aws', name: 'Amazon Web Services (Simulated)', desc: 'Synthetic IAM Roles, CloudTrail, GuardDuty & S3 Telemetry', iconBg: 'bg-amber-500/10 text-amber-400', badge: 'SIMULATION' }
  ];

  const handleClose = () => {
    setStep(1);
    setOauthError(null);
    setIsAuthorizing(false);
    closeConnectModal();
  };

  const handleNext = () => {
    setOauthError(null);
    if (step === 1) {
      setAccountName(`${selectedProvider.toUpperCase()} Enterprise Connector`);
      setStep(2);
    } else if (step === 2 && selectedProvider === 'aws') {
      setIsVerifying(true);
      setTimeout(() => {
        setIsVerifying(false);
        setStep(3);
      }, 1200);
    } else if (step === 3 && selectedProvider === 'aws') {
      connectAccount({
        name: accountName,
        type: selectedProvider,
        accountNumber: roleArnOrSecret || 'arn:aws:iam::simulated-sandbox:role/RecoverSentinel'
      });
      handleClose();
    }
  };

  const handleOAuthAuthorize = async () => {
    setOauthError(null);
    setIsAuthorizing(true);
    try {
      await startOAuthConnect(selectedProvider);
      handleClose();
    } catch (err) {
      setOauthError(err.message || 'OAuth authorization failed');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const isRealOAuthProvider = selectedProvider === 'google' || selectedProvider === 'github';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-surface-container border border-white/10 rounded-2xl shadow-2xl p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Network className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-headline font-bold text-lg text-on-surface">Connect Identity Fabric</h3>
            <p className="text-xs text-on-surface-variant">
              {step === 1 && 'Step 1 of 2: Select Identity Provider'}
              {step === 2 && isRealOAuthProvider && 'Step 2 of 2: Zero-Trust OAuth Consent'}
              {step === 2 && !isRealOAuthProvider && 'Step 2 of 3: Configure Simulated Pipe'}
              {step === 3 && 'Step 3 of 3: Verification & Enrollment'}
            </p>
          </div>
        </div>

        {/* STEP 1: Provider Selection */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-outline mb-2">Select the cloud or SaaS identity provider to monitor:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
              {providers.map(p => (
                <div
                  key={p.type}
                  onClick={() => setSelectedProvider(p.type)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedProvider === p.type
                      ? 'bg-surface-container-high border-primary text-on-surface shadow-md'
                      : 'bg-surface-container-lowest border-white/5 text-on-surface-variant hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${p.iconBg}`}>
                      {p.type.toUpperCase()}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        p.badge === 'REAL OAUTH' ? 'border-primary/40 text-primary bg-primary/10' :
                        p.badge === 'SIMULATION' ? 'border-amber-500/40 text-amber-400 bg-amber-500/10' :
                        'border-white/10 text-outline'
                      }`}>
                        {p.badge}
                      </span>
                      {selectedProvider === p.type && (
                        <Check className="w-4 h-4 text-primary" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-on-surface">{p.name}</p>
                  <p className="text-[11px] text-outline mt-1 leading-snug">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: Real OAuth Consent (Google / GitHub) */}
        {step === 2 && isRealOAuthProvider && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-primary font-bold uppercase">
                  {selectedProvider.toUpperCase()} AUTHORIZATION CONSENT
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary/10 text-secondary border border-secondary/20">
                  {selectedProvider === 'google' ? 'PKCE RFC 7636' : 'OAuth 2.0 Web Flow'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {selectedProvider === 'google'
                  ? 'Re:COVER will open an isolated Google authorization popup. You will be asked to grant read access to profile and email telemetry for identity fabric verification.'
                  : 'Re:COVER will open an isolated GitHub authorization popup. You will be asked to grant read access to user profile and email scopes for identity verification.'}
              </p>

              <div className="pt-2 border-t border-white/5 space-y-2">
                <span className="text-[10px] font-mono text-outline uppercase block">Requested Telemetry Scopes:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedProvider === 'google' ? (
                    <>
                      <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-mono text-on-surface border border-white/5">openid</span>
                      <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-mono text-on-surface border border-white/5">userinfo.email</span>
                      <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-mono text-on-surface border border-white/5">userinfo.profile</span>
                    </>
                  ) : (
                    <>
                      <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-mono text-on-surface border border-white/5">read:user</span>
                      <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-mono text-on-surface border border-white/5">user:email</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 text-[11px] text-outline flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
              <span>
                Zero-Trust Guarantee: Authentication is handled entirely by {selectedProvider === 'google' ? 'Google' : 'GitHub'}. Re:COVER server encrypts tokens using AES-256-GCM. No provider tokens or client secrets are stored in your browser.
              </span>
            </div>

            {oauthError && (
              <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-xs text-error flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Authorization Notice</p>
                  <p className="text-[11px] leading-snug">{oauthError}</p>
                </div>
              </div>
            )}

            {isAuthorizing && (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Waiting for provider authorization in popup window. Do not close this window...</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Simulated Provider Configuration (AWS / Others) */}
        {step === 2 && !isRealOAuthProvider && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">CONNECTOR DISPLAY NAME</label>
              <input
                type="text"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">
                CROSS-ACCOUNT IAM ROLE ARN (SIMULATION)
              </label>
              <input
                type="text"
                value={roleArnOrSecret}
                onChange={e => setRoleArnOrSecret(e.target.value)}
                placeholder="arn:aws:iam::simulated-sandbox:role/RecoverSentinelConnector"
                className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface font-mono focus:outline-none focus:border-primary"
              />
            </div>

            <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 text-[11px] text-outline flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                MVP Notice: AWS telemetry connector operates in synthetic simulation mode for this release. Real OAuth is supported for Google and GitHub.
              </span>
            </div>
          </div>
        )}

        {/* STEP 3: Simulated Verification Success */}
        {step === 3 && !isRealOAuthProvider && (
          <div className="py-6 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-secondary/10 border border-secondary/30 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8 text-secondary" />
            </div>
            <div>
              <h4 className="font-headline font-bold text-base text-on-surface">Simulated Telemetry Pipe Enrolled</h4>
              <p className="text-xs text-on-surface-variant max-w-sm mt-1">
                Enrolled {accountName} in synthetic telemetry simulation mode. Ready to generate and inspect security events.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 font-mono text-[11px] text-primary w-full text-left">
              [SENTINEL_SIMULATOR] Synthetic Pipeline: Active | Ingestion Target: Enrolled
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => {
                setOauthError(null);
                setStep(prev => prev - 1);
              }}
              disabled={isAuthorizing}
              className="px-4 py-2 rounded-xl bg-surface-container-high text-xs text-on-surface hover:bg-surface-variant transition-colors disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <div></div>
          )}

          {step === 1 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : isRealOAuthProvider ? (
            <button
              onClick={handleOAuthAuthorize}
              disabled={isAuthorizing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md disabled:opacity-50"
            >
              {isAuthorizing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Authorizing via Popup...</span>
                </>
              ) : (
                <>
                  <span>Connect with {selectedProvider === 'google' ? 'Google' : 'GitHub'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={isVerifying}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating Permissions...</span>
                </>
              ) : step === 3 ? (
                <span>Finalize Enrollment</span>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
