import React, { useState } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { Network, Check, X, Shield, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';

export const ConnectModal = () => {
  const { isConnectModalOpen, closeConnectModal, connectAccount } = useSecurity();

  const [step, setStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState('aws');
  const [accountName, setAccountName] = useState('');
  const [roleArnOrSecret, setRoleArnOrSecret] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isConnectModalOpen) return null;

  const providers = [
    { type: 'aws', name: 'Amazon Web Services', desc: 'IAM Roles, CloudTrail, GuardDuty & S3 Telemetry', iconBg: 'bg-amber-500/10 text-amber-400' },
    { type: 'github', name: 'GitHub Enterprise', desc: 'Organization Audit Logs, PATs, SSH Keys & Deploy Webhooks', iconBg: 'bg-purple-500/10 text-purple-400' },
    { type: 'google', name: 'Google Cloud & Workspace', desc: 'GCP Audit Logs, Drive DLP, Admin SDK & OAuth Apps', iconBg: 'bg-blue-500/10 text-blue-400' },
    { type: 'okta', name: 'Okta Workforce Identity', desc: 'System Logs, Adaptive MFA & Single Sign-On Policies', iconBg: 'bg-cyan-500/10 text-cyan-400' },
    { type: 'slack', name: 'Slack Enterprise Grid', desc: 'Audit Logs API, DLP Scanners & Token Leak Watchers', iconBg: 'bg-emerald-500/10 text-emerald-400' },
    { type: 'azure', name: 'Microsoft Entra ID (Azure)', desc: 'Azure Activity, Conditional Access & App Registrations', iconBg: 'bg-sky-500/10 text-sky-400' }
  ];

  const handleNext = () => {
    if (step === 1) {
      setAccountName(`${selectedProvider.toUpperCase()} Enterprise Connector`);
      setStep(2);
    } else if (step === 2) {
      setIsVerifying(true);
      setTimeout(() => {
        setIsVerifying(false);
        setStep(3);
      }, 1200);
    } else if (step === 3) {
      connectAccount({
        name: accountName,
        type: selectedProvider,
        accountNumber: roleArnOrSecret || 'arn:aws:iam::123456789012:role/RecoverSentinel'
      });
      closeConnectModal();
      setStep(1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-surface-container border border-white/10 rounded-2xl shadow-2xl p-6 relative">
        <button
          onClick={closeConnectModal}
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
            <p className="text-xs text-on-surface-variant">Step {step} of 3: {
              step === 1 ? 'Select Provider' : step === 2 ? 'Configure Telemetry Pipe' : 'Verification & Enrollment'
            }</p>
          </div>
        </div>

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
                    {selectedProvider === p.type && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <p className="text-xs font-semibold text-on-surface">{p.name}</p>
                  <p className="text-[11px] text-outline mt-1 leading-snug">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
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
                {selectedProvider === 'aws' ? 'CROSS-ACCOUNT IAM ROLE ARN' : 'API KEY / OAUTH CLIENT TOKEN'}
              </label>
              <input
                type="text"
                value={roleArnOrSecret}
                onChange={e => setRoleArnOrSecret(e.target.value)}
                placeholder={selectedProvider === 'aws' ? 'arn:aws:iam::123456789012:role/RecoverSentinelConnector' : 'xoxp-994821... or ghp_...'}
                className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface font-mono focus:outline-none focus:border-primary"
              />
            </div>

            <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 text-[11px] text-outline flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
              <span>
                RE:COVER requires Read-Only telemetry permissions by default. Remediation and quarantine actions require explicit Human-in-the-Loop authorization.
              </span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="py-6 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-secondary/10 border border-secondary/30 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8 text-secondary" />
            </div>
            <div>
              <h4 className="font-headline font-bold text-base text-on-surface">Provider Telemetry Verified</h4>
              <p className="text-xs text-on-surface-variant max-w-sm mt-1">
                Successfully completed mutual TLS handshake with {accountName}. 0 permission discrepancies detected.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 font-mono text-[11px] text-primary w-full text-left">
              [SENTINEL_PROBE] TLS 1.3 | Latency: 28ms | Telemetry Pipe: Active
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(prev => prev - 1)}
              className="px-4 py-2 rounded-xl bg-surface-container-high text-xs text-on-surface hover:bg-surface-variant transition-colors"
            >
              Back
            </button>
          ) : (
            <div></div>
          )}

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
        </div>
      </div>
    </div>
  );
};

