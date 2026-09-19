import React from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  ShieldCheck,
  AlertTriangle,
  Zap,
  Users,
  Activity,
  ArrowUpRight,
  TrendingUp,
  BrainCircuit,
  Plus,
  Play
} from 'lucide-react';

export const OverviewDashboard = () => {
  const {
    incidents,
    setSelectedIncidentId,
    setActiveTab,
    connectedAccounts,
    containIncident,
    openConnectModal,
    triggerScenario,
    telemetryLogs
  } = useSecurity();

  const totalIdentities = connectedAccounts.reduce((acc, a) => acc + a.identitiesCount, 0);
  const activeIncidents = incidents.filter(i => i.status === 'investigating' || i.status === 'mitigating');

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / Welcome Ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary font-bold uppercase tracking-wider">COMMAND CENTER</span>
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-mono text-xs text-outline">LIVE DEFENSE POSTURE</span>
          </div>
          <h1 className="font-headline font-bold text-2xl text-on-surface mt-1">
            Executive Security Overview
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Real-time identity fabric protection, active threat vectors, and autonomous response status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => triggerScenario('pat-leak')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-error/15 border border-error/30 text-error hover:bg-error/25 font-semibold text-xs transition-colors shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Simulate Attack</span>
          </button>

          <button
            onClick={openConnectModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-semibold text-xs transition-all shadow-md active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Fabric</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Monitored Identities */}
        <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-outline uppercase font-medium">Monitored Identities</span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-headline font-bold text-on-surface">{totalIdentities.toLocaleString()}</p>
            <p className="text-[11px] text-secondary flex items-center gap-1 mt-1 font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>Across {connectedAccounts.length} Connected Providers</span>
            </p>
          </div>
        </div>

        {/* Card 2: Active Threats */}
        <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-outline uppercase font-medium">Active Threat Vectors</span>
            <div className={`p-2 rounded-lg ${activeIncidents.length > 0 ? 'bg-error/10 text-error' : 'bg-secondary/10 text-secondary'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-headline font-bold text-on-surface">{activeIncidents.length}</p>
            <p className="text-[11px] text-on-surface-variant mt-1">
              {activeIncidents.length > 0 ? `${activeIncidents.filter(i => i.severity === 'critical').length} Critical Vectors` : 'All vectors nominal'}
            </p>
          </div>
        </div>

        {/* Card 3: Mean Time to Contain */}
        <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-outline uppercase font-medium">Mean Time to Contain</span>
            <div className="p-2 rounded-lg bg-secondary/10 text-secondary">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-headline font-bold text-secondary font-mono">4.2s</p>
            <p className="text-[11px] text-on-surface-variant mt-1">
              99.8% Autonomous Isolation Rate
            </p>
          </div>
        </div>

        {/* Card 4: Fabric Health Score */}
        <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-outline uppercase font-medium">Fabric Health Score</span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-headline font-bold text-primary font-mono">96.4%</p>
            <p className="text-[11px] text-on-surface-variant mt-1">
              Zero-Trust Verification Active
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Active Incidents + Identity Fabrics Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Incidents Queue */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <h2 className="font-headline font-bold text-base text-on-surface">Active Threat Queue</h2>
              <p className="text-xs text-on-surface-variant">Live high-priority security incidents requiring triage</p>
            </div>
            <button
              onClick={() => setActiveTab('incidents')}
              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
            >
              <span>View All ({incidents.length})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-white/5 space-y-2">
            {incidents.slice(0, 4).map(inc => (
              <div
                key={inc.id}
                className="pt-3 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container-high p-2 rounded-xl transition-colors"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{inc.refCode}</span>
                    <span className={`px-2 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                      inc.severity === 'critical' ? 'bg-error text-on-error' : inc.severity === 'high' ? 'bg-amber-500 text-black' : 'bg-primary/20 text-primary'
                    }`}>
                      {inc.severity}
                    </span>
                    <span className="text-[10px] text-outline font-mono">{inc.timestamp}</span>
                  </div>
                  <h4 className="text-xs font-semibold text-on-surface">{inc.title}</h4>
                  <p className="text-[11px] text-on-surface-variant line-clamp-1">{inc.targetResource}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedIncidentId(inc.id);
                      setActiveTab('investigation');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-variant text-xs text-on-surface transition-colors flex items-center gap-1 font-medium"
                  >
                    <BrainCircuit className="w-3.5 h-3.5 text-primary" />
                    <span>AI Investigate</span>
                  </button>

                  {inc.status !== 'contained' && inc.status !== 'resolved' && (
                    <button
                      onClick={() => containIncident(inc.id)}
                      className="px-3 py-1.5 rounded-lg bg-error/15 text-error hover:bg-error/25 text-xs font-semibold transition-colors"
                    >
                      Contain Vector
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Connected Identity Fabrics Matrix */}
        <div className="p-5 sm:p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <h2 className="font-headline font-bold text-base text-on-surface">Connected Fabrics</h2>
              <p className="text-xs text-on-surface-variant">Active cloud & identity connectors</p>
            </div>
            <button
              onClick={() => setActiveTab('accounts')}
              className="text-xs text-primary hover:underline font-semibold"
            >
              Manage
            </button>
          </div>

          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {connectedAccounts.map(acc => (
              <div
                key={acc.id}
                className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-on-surface">{acc.name}</span>
                    <span className={`w-2 h-2 rounded-full ${acc.status === 'connected' ? 'bg-secondary' : 'bg-amber-400'}`}></span>
                  </div>
                  <p className="text-[10px] text-outline font-mono mt-0.5">{acc.identitiesCount} identities monitored</p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs text-secondary font-semibold">{acc.healthScore}%</span>
                  <p className="text-[9px] text-outline">Health Score</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Telemetry Pulse Feed */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary animate-pulse" />
            <span className="font-headline font-bold text-sm text-on-surface">Live Autonomous Telemetry Stream</span>
          </div>
          <button
            onClick={() => setActiveTab('telemetry')}
            className="text-xs text-primary hover:underline font-mono"
          >
            Open Full Stream →
          </button>
        </div>

        <div className="font-mono text-xs divide-y divide-white/5 max-h-48 overflow-y-auto">
          {telemetryLogs.slice(0, 5).map(log => (
            <div key={log.id} className="py-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-outline text-[10px]">{log.timestamp}</span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                  log.level === 'SEC_CRIT' ? 'bg-error text-on-error' : log.level === 'WARN' ? 'bg-amber-500 text-black' : 'bg-surface-container-highest text-primary'
                }`}>
                  {log.level}
                </span>
                <span className="text-on-surface">{log.service}: {log.eventType}</span>
              </div>
              <span className={`text-[10px] font-bold ${log.status === 'INTERCEPTED' ? 'text-secondary' : 'text-outline'}`}>
                [{log.status}]
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

