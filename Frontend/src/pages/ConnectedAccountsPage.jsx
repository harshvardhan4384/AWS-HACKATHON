import React from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  Network,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2
} from 'lucide-react';

export const ConnectedAccountsPage = () => {
  const {
    connectedAccounts,
    openConnectModal,
    resyncAccount,
    disconnectAccount
  } = useSecurity();

  const totalIdentities = connectedAccounts.reduce((acc, a) => acc + a.identitiesCount, 0);
  const totalResources = connectedAccounts.reduce((acc, a) => acc + a.resourcesCount, 0);

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
            <span className="font-mono text-xs text-secondary font-semibold">{connectedAccounts.length} ENROLLED CONNECTORS</span>
          </div>
          <h1 className="font-headline font-bold text-2xl text-on-surface mt-1">
            Connected Accounts & Identity Fabrics
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Cross-cloud identity synchronization, OAuth grant governance, and automated session invalidation.
          </p>
        </div>

        <button
          onClick={openConnectModal}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Connect New Provider</span>
        </button>
      </div>

      {/* Summary KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-surface-container border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-outline uppercase">Total Monitored Identities</span>
          <p className="text-2xl font-headline font-bold text-on-surface">{totalIdentities.toLocaleString()}</p>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-outline uppercase">Cloud Resources Governed</span>
          <p className="text-2xl font-headline font-bold text-primary">{totalResources.toLocaleString()}</p>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-outline uppercase">Average Fabric Health</span>
          <p className="text-2xl font-headline font-bold text-secondary">96.8%</p>
        </div>
      </div>

      {/* Provider Cards Grid */}
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
                      {account.type.toUpperCase()}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${
                      account.status === 'connected' ? 'bg-secondary' : account.status === 'syncing' ? 'bg-primary animate-ping' : 'bg-amber-400'
                    }`}></span>
                  </div>
                  <h3 className="font-headline font-bold text-base text-on-surface mt-2">{account.name}</h3>
                  <p className="text-[11px] font-mono text-outline truncate">{account.accountNumber}</p>
                </div>

                <div className="text-right">
                  <span className="font-mono text-lg font-bold text-secondary">{account.healthScore}%</span>
                  <p className="text-[9px] text-outline uppercase font-mono">Health</p>
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

              {/* Security Controls Badges */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-outline uppercase block">Active Defense Controls:</span>
                <div className="flex flex-wrap gap-1.5">
                  {account.securityControls.mfaEnforced && (
                    <span className="px-2 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-secondary flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> MFA Enforced
                    </span>
                  )}
                  {account.securityControls.leastPrivilege && (
                    <span className="px-2 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-primary flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Least Privilege
                    </span>
                  )}
                  {account.securityControls.anomalyShield && (
                    <span className="px-2 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-on-surface flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Anomaly Interceptor
                    </span>
                  )}
                  {account.securityControls.autoRollback && (
                    <span className="px-2 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-secondary flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> 1-Click Rollback
                    </span>
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
                onClick={() => disconnectAccount(account.id)}
                className="p-2 rounded-xl text-outline hover:text-error hover:bg-error/10 transition-colors"
                title="Disconnect Provider"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

