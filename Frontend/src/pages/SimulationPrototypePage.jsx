import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  Play,
  Terminal,
  CheckCircle2,
  RotateCcw,
  BrainCircuit,
  Flame,
  ArrowRight
} from 'lucide-react';

export const SimulationPrototypePage = () => {
  const { setActiveTab, triggerScenario, addToast } = useSecurity();

  const [selectedScenario, setSelectedScenario] = useState('pat');
  const [executionState, setExecutionState] = useState('idle');
  const [simStep, setSimStep] = useState(0);
  const [simLogs, setSimLogs] = useState([]);

  const scenarios = [
    {
      id: 'pat',
      title: 'GitHub PAT Leak & S3 Vault Exfiltration',
      vector: 'Credential Scraping + STS Privilege Spurt',
      provider: 'AWS & GitHub',
      severity: 'CRITICAL',
      target: 'arn:aws:s3:::prod-vault-customer-01',
      desc: 'Adversary leverages a leaked GitHub PAT to provision a backdoor deploy key, assume IAM role Deployer-Prod-Admin, and initiate batch S3 download.'
    },
    {
      id: 'aws-iam',
      title: 'Simulated AWS IAM Privilege Escalation & Lateral Movement',
      vector: 'STS AssumeRole + Cross-Boundary Enum',
      provider: 'AWS (Simulated)',
      severity: 'HIGH',
      target: 'arn:aws:iam::simulated-sandbox:role/DataPipelineWorker',
      desc: 'Adversary leverages temporary security credentials from an over-permissioned role to enumerate sensitive S3 buckets and establish unauthorized persistence.'
    },
    {
      id: 'oauth',
      title: 'Google Drive Malicious OAuth Scope Escalation',
      vector: 'Illicit Consent Grant',
      provider: 'Google Workspace',
      severity: 'MEDIUM',
      target: 'oauth:app_991204_cloud_sync_pro',
      desc: 'Phishing campaign induces internal user to approve a 3rd-party OAuth application with full Drive and Mail read/send privileges.'
    }
  ];

  const handleRunSimulation = async () => {
    setExecutionState('running');
    setSimStep(1);
    setSimLogs([
      `[T+0.000s] INJECTING ADVERSARY PAYLOAD (${selectedScenario.toUpperCase()})...`,
      `[T+0.012s] Telemetry sensor detected out-of-band request from untrusted ASN.`
    ]);

    await new Promise(r => setTimeout(r, 700));
    setSimStep(2);
    setSimLogs(prev => [
      ...prev,
      `[T+0.210s] [AI ANOMALY ENGINE] Confidence: 98.4% — Matches MITRE ATT&CK T1078 / T1530.`,
      `[T+0.350s] Synthesizing graph topology... 5 cloud nodes in immediate blast tier.`
    ]);

    await new Promise(r => setTimeout(r, 800));
    setSimStep(3);
    setSimLogs(prev => [
      ...prev,
      `[T+0.820s] [AUTONOMOUS INTERCEPTION] Dispatched session destruction command.`,
      `[T+1.100s] Invalidated OAuth tokens & attached WAF drop rule on adversary IP.`
    ]);

    await new Promise(r => setTimeout(r, 800));
    setSimStep(4);
    setSimLogs(prev => [
      ...prev,
      `[T+1.450s] [IMMUNE RECOVERY] Cryptographic state verified. 0 bytes exfiltrated.`,
      `[T+1.600s] 1-Click Rollback Playbook #REC-1 compiled and ready.`
    ]);
    setExecutionState('completed');

    triggerScenario(selectedScenario === 'pat' ? 'pat-leak' : (selectedScenario === 'oauth' ? 'oauth-grant' : 'aws-escalation'));
    addToast('success', 'Simulation Finished', 'Autonomous Sentinel isolated all attack vectors in 1.6s.');
  };

  const handleReset = () => {
    setExecutionState('idle');
    setSimStep(0);
    setSimLogs([]);
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-error font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-error" />
              CYBER ATTACK SANDBOX & TEST ENVIRONMENT
            </span>
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-mono text-xs text-secondary font-semibold">SAFE SIMULATION MODE</span>
          </div>
          <h1 className="font-headline font-bold text-2xl text-on-surface mt-1">
            Autonomous Incident Response Prototype
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Inject real-world attack vectors to test RE:COVER's sub-second detection, blast radius containment, and automated recovery.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleReset}
            disabled={executionState === 'idle'}
            className="p-2.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-outline hover:text-on-surface transition-colors border border-white/5 disabled:opacity-40"
            title="Reset Simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: Scenario Selector + Execution Stage + Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Scenarios Selector (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <span className="font-headline font-bold text-xs text-outline uppercase tracking-wider block">
            Select Attack Scenario
          </span>

          <div className="space-y-3">
            {scenarios.map(sc => (
              <div
                key={sc.id}
                onClick={() => {
                  if (executionState !== 'running') {
                    setSelectedScenario(sc.id);
                    handleReset();
                  }
                }}
                className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-2 ${
                  selectedScenario === sc.id
                    ? 'bg-surface-container-high border-primary text-on-surface shadow-lg'
                    : 'bg-surface-container border-white/5 text-on-surface-variant hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                    sc.severity === 'CRITICAL' ? 'bg-error text-on-error' : 'bg-amber-500 text-black'
                  }`}>
                    {sc.severity}
                  </span>
                  <span className="text-[10px] font-mono text-outline">{sc.provider}</span>
                </div>

                <h3 className="font-headline font-bold text-sm text-on-surface">{sc.title}</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">{sc.desc}</p>
                <p className="text-[10px] font-mono text-primary truncate pt-1 border-t border-white/5">
                  Target: {sc.target}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={handleRunSimulation}
            disabled={executionState === 'running'}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-error via-rose-600 to-amber-600 text-on-error font-headline font-bold text-xs uppercase tracking-wider shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{executionState === 'running' ? 'Executing Attack Sequence...' : 'Launch Live Simulation'}</span>
          </button>
        </div>

        {/* Right: Simulation Pipeline & Terminal (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Step-by-Step Defense Progression */}
          <div className="p-5 sm:p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-5">
            <span className="font-headline font-bold text-sm text-on-surface flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-primary" />
              Autonomous Defense Sequence
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {[
                { num: '01', title: 'Adversary Ingestion', status: simStep >= 1 ? 'done' : simStep === 0 ? 'pending' : 'active' },
                { num: '02', title: 'Graph Blast Model', status: simStep >= 2 ? 'done' : simStep === 1 ? 'active' : 'pending' },
                { num: '03', title: 'Auto Interception', status: simStep >= 3 ? 'done' : simStep === 2 ? 'active' : 'pending' },
                { num: '04', title: 'Rollback Ready', status: simStep >= 4 ? 'done' : simStep === 3 ? 'active' : 'pending' }
              ].map(st => (
                <div
                  key={st.num}
                  className={`p-3.5 rounded-xl border transition-all text-left ${
                    st.status === 'done'
                      ? 'bg-surface-container-lowest border-secondary text-secondary'
                      : st.status === 'active'
                      ? 'bg-surface-container-high border-primary text-primary animate-pulse'
                      : 'bg-surface-container-lowest border-white/5 text-outline'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-bold">{st.num}</span>
                    {st.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />}
                  </div>
                  <h4 className="text-xs font-semibold text-on-surface">{st.title}</h4>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Interactive Terminal */}
          <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="font-headline font-bold text-xs text-on-surface font-mono flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                DEFENSE SIMULATOR CONSOLE
              </span>
              <span className="text-[10px] font-mono text-secondary">
                {executionState === 'running' ? 'RUNNING' : executionState === 'completed' ? 'CONTAINED' : 'IDLE'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 text-xs font-mono space-y-1.5 min-h-[220px] max-h-72 overflow-y-auto">
              {simLogs.length === 0 ? (
                <p className="text-outline italic">
                  [READY] Select a scenario on the left and click "Launch Live Simulation" to observe real-time telemetry interception.
                </p>
              ) : (
                simLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.includes('ALERT') || log.includes('INJECTING')
                        ? 'text-error font-medium'
                        : log.includes('ANOMALY')
                        ? 'text-amber-400'
                        : log.includes('INTERCEPTION') || log.includes('IMMUNE')
                        ? 'text-secondary font-bold'
                        : 'text-on-surface-variant'
                    }
                  >
                    {log}
                  </div>
                ))
              )}
            </div>

            {executionState === 'completed' && (
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-xs text-secondary font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Attack vector neutralized. Incident logged in triage queue.
                </span>

                <button
                  onClick={() => setActiveTab('investigation')}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-xs flex items-center gap-1.5 hover:bg-primary-container transition-all shadow-md"
                >
                  <span>Open AI Investigation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

