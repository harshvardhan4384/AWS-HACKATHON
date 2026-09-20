import React, { useState, useEffect } from 'react';
import { useSecurity } from '../context/SecurityContext';
import { AccountSecurityModal } from '../components/AccountSecurityModal';
import {
  Network,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Unlink,
  AlertTriangle,
  X,
  Eye,
  Key,
  Lock
} from 'lucide-react';

export const ConnectedAccountsPage = () => {
  const {
    connectedAccounts,
    isAccountsLoading,
    accountsError,
    fetchConnectedAccounts,
    openConnectModal,
    resyncAccount,
    disconnectAccount,
    addToast
  } = useSecurity();

  const [accountToDisconnect, setAccountToDisconnect] = useState(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [securityModalAccount, setSecurityModalAccount] = useState(null);

  const totalIdentities = connectedAccounts.reduce((acc, a) => acc + (a.identitiesCount || 0), 0);
  const totalResources = connectedAccounts.reduce((acc, a) => acc + (a.resourcesCount || 0), 0);

  // Handle incoming OAuth callback redirects (?oauth=success or ?oauth=error)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    if (!oauthStatus) return;

    const providerParam = params.get('provider') || 'google';
    const providerName = providerParam.toUpperCase() === 'GOOGLE' ? 'Google' : providerParam.toUpperCase() === 'GITHUB' ? 'GitHub' : 'Provider';
    const reason = params.get('reason');

    // If running in a popup window, communicate result to the parent opener and self-close
    if (window.opener && window.opener !== window) {
      try {
        window.opener.postMessage({
          type: 'OAUTH_RESULT',
          status: oauthStatus,
          provider: providerParam,
          reason,
        }, window.location.origin);
        window.close();
        return;
      } catch {
        // Fall back to direct in-page handling if opener communication is blocked
      }
    }

    if (oauthStatus === 'success') {
      addToast('success', 'Provider Connected', `${providerName} connected successfully. Enrolled into Digital Immune Fabric.`);
      fetchConnectedAccounts();
    } else if (oauthStatus === 'error') {
      let msg = `Unable to connect ${providerName}. Please try again.`;
      if (reason === 'account_already_linked') {
        msg = `This ${providerName} account is already connected to another Re:COVER user.`;
      } else if (reason === 'authorization_denied') {
        msg = `${providerName} authorization was cancelled or denied.`;
      } else if (reason === 'state_invalid') {
        msg = 'OAuth security validation failed (invalid or expired session). Please try again.';
      } else if (reason === 'provider_error' || reason === 'google_auth_failed') {
        msg = `Failed to communicate with ${providerName} authentication services. Please try again.`;
      }
      addToast('error', 'OAuth Connection Failed', msg);
    }

    // Clean query parameters from URL history without triggering a reload
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);
  }, [addToast, fetchConnectedAccounts]);

  const handleConfirmDisconnect = async () => {
    if (!accountToDisconnect) return;
    setIsDisconnecting(true);
    setDisconnectingId(accountToDisconnect.id);
    try {
      await disconnectAccount(accountToDisconnect.id);
      setAccountToDisconnect(null);
    } catch {
      // Error is surfaced via SecurityContext toast
    } finally {
      setIsDisconnecting(false);
      setDisconnectingId(null);
    }
  };

  const getProviderFriendlyName = (acc) => {
    if (!acc) return 'Account';
    const p = (acc.provider || acc.type || '').toUpperCase();
    if (p === 'GOOGLE') return 'Google';
    if (p === 'GITHUB') return 'GitHub';
    if (p === 'AWS') return 'Amazon Web Services';
    return acc.name || 'Provider';
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Network className="w-4 h-4 text-primary" />
              IDENTITY FABRIC TOPOLOGY
            </span>
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-mono text-xs text-secondary font-semibold">
              {connectedAccounts.length} ENROLLED {connectedAccounts.length === 1 ? 'CONNECTOR' : 'CONNECTORS'}
            </span>
          </div>
          <h1 className="font-headline font-bold text-2xl text-on-surface mt-1">
            Connected Accounts & Identity Fabrics
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Cross-cloud identity synchronization, OAuth grant governance, and automated session invalidation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchConnectedAccounts()}
            disabled={isAccountsLoading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface font-medium border border-white/5 transition-all disabled:opacity-50"
            title="Refresh Connected Accounts from Backend"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAccountsLoading ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={openConnectModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Connect New Provider</span>
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {accountsError && (
        <div className="p-4 rounded-xl bg-error/10 border border-error/20 flex items-center justify-between gap-3 text-xs text-error">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{accountsError}</span>
          </div>
          <button
            onClick={() => fetchConnectedAccounts()}
            className="px-3 py-1 rounded-lg bg-error/20 hover:bg-error/30 text-xs font-semibold uppercase tracking-wider transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-surface-container border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-outline uppercase">Total Monitored Identities</span>
          <p className="text-2xl font-headline font-bold text-on-surface">
            {isAccountsLoading && connectedAccounts.length === 0 ? '...' : totalIdentities.toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-outline uppercase">Cloud Resources Governed</span>
          <p className="text-2xl font-headline font-bold text-primary">
            {isAccountsLoading && connectedAccounts.length === 0 ? '...' : totalResources.toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-outline uppercase">Active Connectors</span>
          <p className="text-2xl font-headline font-bold text-secondary">
            {isAccountsLoading && connectedAccounts.length === 0 ? '...' : connectedAccounts.filter(a => a.status === 'connected' || a.status === 'active').length}
          </p>
        </div>
      </div>

      {/* Loading Skeleton Grid */}
      {isAccountsLoading && connectedAccounts.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2].map((n) => (
            <div key={n} className="p-5 rounded-2xl bg-surface-container border border-white/5 space-y-5 h-72">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="w-16 h-5 bg-white/10 rounded"></div>
                  <div className="w-36 h-5 bg-white/10 rounded"></div>
                </div>
                <div className="w-10 h-6 bg-white/10 rounded"></div>
              </div>
              <div className="h-20 bg-surface-container-lowest rounded-xl"></div>
              <div className="h-10 bg-white/5 rounded-xl"></div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isAccountsLoading && connectedAccounts.length === 0 && (
        <div className="p-12 rounded-2xl bg-surface-container border border-white/5 shadow-xl flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="font-headline font-bold text-lg text-on-surface">No Identity Fabrics Connected</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Connect your Google Cloud or GitHub Enterprise accounts to initiate continuous audit telemetry ingestion, graph blast radius modeling, and automated rollback execution.
            </p>
          </div>
          <button
            onClick={openConnectModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Identity Provider</span>
          </button>
        </div>
      )}

      {/* Provider Cards Grid */}
      {connectedAccounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connectedAccounts.map(account => (
            <div
              key={account.id}
              className="p-5 rounded-2xl bg-surface-container border border-white/5 hover:border-primary/40 transition-all shadow-xl flex flex-col justify-between space-y-5"
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold uppercase text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                        {(account.provider || account.type || 'cloud').toUpperCase()}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${
                        account.status === 'connected' ? 'bg-secondary' : account.status === 'syncing' ? 'bg-primary animate-ping' : 'bg-amber-400'
                      }`}></span>
                    </div>
                    <h3 className="font-headline font-bold text-base text-on-surface mt-2">{account.name}</h3>
                    <p className="text-[11px] font-mono text-outline truncate" title={account.accountNumber}>
                      {account.accountNumber}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                      account.status === 'connected' || account.status === 'active'
                        ? 'bg-secondary/10 text-secondary border border-secondary/20'
                        : 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                    }`}>
                      {(account.status || 'CONNECTED').toUpperCase()}
                    </span>
                    <p className="text-[9px] text-outline uppercase font-mono mt-0.5">Status</p>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-surface-container-lowest border border-white/5 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-outline">Identities:</span>
                    <p className="font-bold text-on-surface">{account.identitiesCount}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-outline">Resources:</span>
                    <p className="font-bold text-on-surface">{account.resourcesCount}</p>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-white/5">
                    <span className="text-[10px] text-outline">Last Ingestion Sync:</span>
                    <p className="text-primary font-medium">{account.lastSync}</p>
                  </div>
                </div>

                {/* Granted Scopes & Capabilities */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-outline uppercase block">Granted Scopes & Telemetry:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {account.grantedScopes ? (
                      account.grantedScopes.split(/[\s,]+/).filter(Boolean).map((scope, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-primary flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-secondary" /> {scope}
                        </span>
                      ))
                    ) : (
                      <>
                        <span className="px-2 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-secondary flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Telemetry Ingestion Active
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-primary flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Event Normalization
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Primary Action: Security Overview */}
              <div className="pt-2 border-t border-white/5 space-y-2.5">
                <button
                  onClick={() => setSecurityModalAccount(account)}
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary border border-primary/25 hover:border-primary/50 transition-all shadow-sm active:scale-95"
                >
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span>View Security Details</span>
                </button>

                {/* Secondary Actions: Re-Sync & Disconnect */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => resyncAccount(account.id)}
                    className="px-3 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface transition-colors flex items-center gap-1.5 font-medium border border-white/5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${account.status === 'syncing' ? 'animate-spin text-primary' : ''}`} />
                    <span>Re-Sync</span>
                  </button>

                  <button
                    onClick={() => setAccountToDisconnect(account)}
                    disabled={isDisconnecting && disconnectingId === account.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 text-xs font-semibold text-error transition-all border border-error/20 hover:border-error/40 active:scale-95 disabled:opacity-50"
                    title={`Disconnect ${getProviderFriendlyName(account)}`}
                    aria-label={`Disconnect ${getProviderFriendlyName(account)}`}
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Account Security Overview Modal */}
      <AccountSecurityModal
        account={securityModalAccount}
        isOpen={Boolean(securityModalAccount)}
        onClose={() => setSecurityModalAccount(null)}
        onDisconnect={(acc) => setAccountToDisconnect(acc)}
      />

      {/* Disconnect Confirmation Dialog */}
      {accountToDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-container border border-white/10 rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-150 space-y-5">
            {/* Close Button */}
            <button
              onClick={() => !isDisconnecting && setAccountToDisconnect(null)}
              disabled={isDisconnecting}
              className="absolute top-4 right-4 text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-50"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Warning Header */}
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-error/10 border border-error/25 flex items-center justify-center text-error flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-headline font-bold text-lg text-on-surface">
                  Disconnect {getProviderFriendlyName(accountToDisconnect)}?
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Re:COVER will stop using this {getProviderFriendlyName(accountToDisconnect)} account as a connected security source.
                </p>
              </div>
            </div>

            {/* Account Context Card (Strictly zero secret exposure) */}
            <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-white/5 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-outline text-[11px]">Provider:</span>
                <span className="font-bold text-on-surface uppercase px-2 py-0.5 rounded bg-white/5">
                  {(accountToDisconnect.provider || accountToDisconnect.type || 'oauth').toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-outline text-[11px]">Connector:</span>
                <span className="font-semibold text-primary truncate max-w-[200px]" title={accountToDisconnect.name}>
                  {accountToDisconnect.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-outline text-[11px]">Account ID:</span>
                <span className="text-on-surface truncate max-w-[200px]" title={accountToDisconnect.accountNumber}>
                  {accountToDisconnect.accountNumber}
                </span>
              </div>
            </div>

            {/* Warning Callout */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span className="leading-snug">
                Active telemetry ingestion will be terminated immediately. You can reconnect this account at any time.
              </span>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-white/5">
              <button
                onClick={() => setAccountToDisconnect(null)}
                disabled={isDisconnecting}
                className="px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmDisconnect}
                disabled={isDisconnecting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-error hover:bg-error/90 text-on-error font-semibold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {isDisconnecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Disconnecting...</span>
                  </>
                ) : (
                  <>
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
