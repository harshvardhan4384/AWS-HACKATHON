import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  ShieldCheck,
  CheckCircle2,
  Terminal,
  XCircle
} from 'lucide-react';

export const RecoveryCenterPage = () => {
  const { playbooks, approvePlaybook, rejectPlaybook, addToast } = useSecurity();

  const [selectedPlaybookId, setSelectedPlaybookId] = useState('rec-1');
  const [isDryRunning, setIsDryRunning] = useState(false);

  const selectedPlaybook = playbooks.find(p => p.id === selectedPlaybookId) || playbooks[0];

  const handleDryRun = () => {
    setIsDryRunning(true);
    addToast('info', 'Simulating Dry Run', 'Validating API idempotency and role permissions...');
    setTimeout(() => {
      setIsDryRunning(false);
      addToast('success', 'Dry Run Successful', 'All 5 rollback steps passed pre-flight validation with 0 errors.');
    }, 1200);
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-secondary font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-secondary" />
              AUTONOMOUS RECOVERY & APPROVAL CENTER
            </span>
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-mono text-xs text-outline">HUMAN-IN-THE-LOOP CONTROL</span>
          </div>
          <h1 className="font-headline font-bold text-2xl text-on-surface mt-1">
            Rollback & Cryptographic Re-issuance
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            1-Click automated mitigation playbooks with zero-downtime state restoration.
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-right">
          <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 font-mono">
            <span className="text-[10px] text-outline uppercase">ESTIMATED RESTORATION</span>
            <p className="text-sm font-bold text-secondary">{selectedPlaybook.estimatedRollbackSeconds}s MTTR</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Playbook Execution + Terminal Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Multi-Step Rollback Pipeline (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-5 sm:p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary">{selectedPlaybook.incidentRef}</span>
                  <span className={`px-2 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                    selectedPlaybook.status === 'completed'
                      ? 'bg-secondary/20 text-secondary'
                      : selectedPlaybook.status === 'in_progress'
                      ? 'bg-primary/20 text-primary animate-pulse'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {selectedPlaybook.status.replace('_', ' ')}
                  </span>
                </div>
                <h2 className="font-headline font-bold text-base text-on-surface mt-1">
                  {selectedPlaybook.title}
                </h2>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDryRun}
                  disabled={isDryRunning || selectedPlaybook.status === 'in_progress' || selectedPlaybook.status === 'completed'}
                  className="px-3 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface font-semibold transition-colors border border-white/5 disabled:opacity-50"
                >
                  {isDryRunning ? 'Validating...' : 'Dry Run Simulation'}
                </button>

                {selectedPlaybook.status === 'pending_approval' && (
                  <button
                    onClick={() => approvePlaybook(selectedPlaybook.id)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-secondary to-emerald-600 text-on-secondary font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve 1-Click Recovery</span>
                  </button>
                )}
              </div>
            </div>

            {/* Step-by-step progress cards */}
            <div className="space-y-3">
              {selectedPlaybook.steps.map(step => (
                <div
                  key={step.id}
                  className={`p-4 rounded-xl border transition-all ${
                    step.status === 'completed'
                      ? 'bg-surface-container-lowest border-secondary/30'
                      : step.status === 'executing'
                      ? 'bg-surface-container-high border-primary animate-pulse'
                      : 'bg-surface-container-lowest border-white/5 opacity-85'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                        step.status === 'completed'
                          ? 'bg-secondary text-on-secondary'
                          : step.status === 'executing'
                          ? 'bg-primary text-on-primary animate-spin'
                          : 'bg-surface-container-highest text-outline'
                      }`}>
                        {step.status === 'completed' ? '✓' : step.order}
                      </div>
                      <h4 className="text-xs font-bold text-on-surface">{step.name}</h4>
                    </div>

                    <span className={`px-2 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                      step.status === 'completed' ? 'text-secondary' : step.status === 'executing' ? 'text-primary' : 'text-outline'
                    }`}>
                      {step.status}
                    </span>
                  </div>

                  <div className="pl-8 space-y-1 font-mono text-xs">
                    <p className="text-primary text-[11px] truncate">{step.action}</p>
                    <p className="text-outline text-[10px]">{step.target}</p>
                    {step.output && (
                      <p className="text-on-surface-variant text-[11px] mt-1 pt-1 border-t border-white/5">
                        → {step.output}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Playbook Footer controls */}
            {selectedPlaybook.status === 'pending_approval' && (
              <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                <button
                  onClick={() => rejectPlaybook(selectedPlaybook.id)}
                  className="text-error hover:underline flex items-center gap-1 font-semibold"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject & Manual Override</span>
                </button>

                <span className="text-outline font-mono text-[11px]">
                  Requires Admin Tier 1 Authorization
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Execution Logs & Playbook Selector (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Playbooks Selector */}
          <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-3">
            <span className="font-headline font-bold text-xs text-outline uppercase tracking-wider">
              Available Rollback Playbooks
            </span>

            <div className="space-y-2">
              {playbooks.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlaybookId(p.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedPlaybookId === p.id
                      ? 'bg-surface-container-high border-primary text-on-surface shadow-md'
                      : 'bg-surface-container-lowest border-white/5 text-on-surface-variant hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-primary">{p.incidentRef}</span>
                    <span className={`px-2 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                      p.status === 'completed' ? 'bg-secondary/20 text-secondary' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-on-surface mt-1">{p.title}</h4>
                  <p className="text-[10px] text-outline mt-0.5">{p.targetEnvironment}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Execution Terminal Output */}
          <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="font-headline font-bold text-xs text-on-surface font-mono flex items-center gap-2">
                <Terminal className="w-4 h-4 text-secondary" />
                EXECUTION AUDIT LOG
              </span>
              <span className="text-[10px] font-mono text-outline">TLS 1.3 SIGNED</span>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 text-xs font-mono space-y-1.5 min-h-[220px] max-h-72 overflow-y-auto">
              {selectedPlaybook.executionLogs.map((log, i) => (
                <div key={i} className="text-on-surface-variant">
                  <span className="text-outline text-[10px] mr-2">[{new Date().toISOString().substring(11, 19)}]</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

