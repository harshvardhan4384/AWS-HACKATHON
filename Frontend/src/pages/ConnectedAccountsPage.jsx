import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  Network,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldAlert
} from 'lucide-react';

export const ConnectedAccountsPage = () => {
  const {
    connectedAccounts,
    isAccountsLoading,
    accountsError,
    fetchConnectedAccounts,
    openConnectModal,
    resyncAccount,
    disconnectAccount
  } = useSecurity();

  const [disconnectingId, setDisconnectingId] = useState(null);

  const totalIdentities = connectedAccounts.reduce((acc, a) => acc + (a.identitiesCount || 0), 0);
  const totalResources = connectedAccounts.reduce((acc, a) => acc + (a.resourcesCount || 0), 0);

  const handleDisconnect = async (account) => {
    const confirmed = window.confirm(
      `Are you sure you want to disconnect "${account.name}"? Active telemetry ingestion and automated rollback governance will be revoked.`
    );
    if (!confirmed) return;

    try {
      setDisconnectingId(account.id);
      await disconnectAccount(account.id);
    } catch {
      // Error handled by context toast
    } finally {
      setDisconnectingId(null);
    }
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

              {/* Actions */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                <button
                  onClick={() => resyncAccount(account.id)}
                  className="px-3 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface transition-colors flex items-center gap-1.5 font-medium border border-white/5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${account.status === 'syncing' ? 'animate-spin text-primary' : ''}`} />
                  <span>Re-Sync</span>
                </button>

                <button
                  onClick={() => handleDisconnect(account)}
                  disabled={disconnectingId === account.id}
                  className="p-2 rounded-xl text-outline hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                  title="Disconnect Provider"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${disconnectingId === account.id ? 'animate-pulse text-error' : ''}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
