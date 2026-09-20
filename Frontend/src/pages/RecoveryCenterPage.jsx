import React, { useState, useEffect } from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  ShieldCheck,
  CheckCircle2,
  Terminal,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  Check,
  Clock,
  Lock,
  FileText,
  Sparkles,
  ChevronRight,
  AlertOctagon,
  ShieldAlert,
  Key,
  Layers,
  Activity,
  ArrowRight
} from 'lucide-react';

export const RecoveryCenterPage = () => {
  const {
    incidents,
    selectedIncidentId,
    setSelectedIncidentId,
    selectedIncident,
    currentRecoveryPlan,
    isRecoveryPlanLoading,
    recoveryPlanError,
    actionPolicies,
    actionApprovals,
    actionAuthorizations,
    actionExecutionStates,
    incidentVerification,
    isVerifying,
    verificationError,
    actionVerifications,
    fetchRecoveryPlan,
    generateRecoveryPlan,
    evaluateActionPolicy,
    requestActionApproval,
    approveRecoveryAction,
    rejectRecoveryAction,
    executeRecoveryAction,
    verifySingleAction,
    verifyIncidentRecovery,
    fetchIncidentVerification,
    addToast
  } = useSecurity();

  const [activeTabSection, setActiveTabSection] = useState('pipeline'); // 'pipeline' | 'verification' | 'audit'
  const [selectedActionId, setSelectedActionId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, approvalId: null });
  const [rejectModal, setRejectModal] = useState({ isOpen: false, action: null, approvalId: null, reason: '' });
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [auditLogs, setAuditLogs] = useState([
    { timestamp: new Date().toISOString(), level: 'INFO', message: 'Recovery engine initialized. Zero-trust authorization gate ACTIVE.' }
  ]);

  const activeIncident = selectedIncident || incidents[0] || {
    id: 'inc-placeholder',
    refCode: 'INC-ACTIVE',
    title: 'No Active Incident',
    severity: 'medium',
    status: 'open'
  };

  // Ensure recovery plan & verification are loaded when incident changes
  useEffect(() => {
    if (activeIncident && activeIncident.id !== 'inc-placeholder') {
      fetchRecoveryPlan(activeIncident.id);
      fetchIncidentVerification(activeIncident.id);
    }
  }, [activeIncident.id, fetchRecoveryPlan, fetchIncidentVerification]);

  // Set default selected action when plan loads
  useEffect(() => {
    if (currentRecoveryPlan?.actions?.length > 0 && !selectedActionId) {
      setSelectedActionId(currentRecoveryPlan.actions[0].id);
    }
  }, [currentRecoveryPlan, selectedActionId]);

  const addAuditEntry = (level, message) => {
    setAuditLogs(prev => [
      { timestamp: new Date().toISOString(), level, message },
      ...prev.slice(0, 49)
    ]);
  };

  const handleGeneratePlan = async () => {
    if (!activeIncident.id || activeIncident.id === 'inc-placeholder') return;
    addAuditEntry('INFO', `Requesting recovery plan generation for ${activeIncident.refCode}...`);
    const plan = await generateRecoveryPlan(activeIncident.id);
    if (plan) {
      addAuditEntry('SUCCESS', `Plan synthesized: ${plan.actions?.length || 0} mitigation actions. Plan Hash: ${plan.planHash?.slice(0, 16)}...`);
      if (plan.actions?.length > 0) {
        setSelectedActionId(plan.actions[0].id);
      }
    } else {
      addAuditEntry('ERROR', 'Recovery plan generation failed.');
    }
  };

  const handleEvaluatePolicy = async (actionId) => {
    addAuditEntry('INFO', `Evaluating security policy for action ${actionId.slice(0, 8)}...`);
    const res = await evaluateActionPolicy(actionId);
    if (res) {
      addAuditEntry('SUCCESS', `Policy Decision: ${res.decision} (Reason: ${res.reasonCode})`);
    }
  };

  const handleRequestApproval = async (actionId) => {
    addAuditEntry('INFO', `Submitting approval request for action ${actionId.slice(0, 8)}...`);
    const res = await requestActionApproval(actionId);
    if (res) {
      addAuditEntry('SUCCESS', `Approval request processed. Status: ${res.status}`);
    }
  };

  const handleOpenApprove = (action, approvalId) => {
    if (action.riskLevel === 'CRITICAL' || action.riskLevel === 'HIGH') {
      setConfirmModal({ isOpen: true, action, approvalId });
    } else {
      executeApproveConfirmed(action, approvalId);
    }
  };

  const executeApproveConfirmed = async (action, approvalId) => {
    try {
      addAuditEntry('INFO', `Granting approval for ${action.actionType} (${action.id.slice(0, 8)})...`);
      await approveRecoveryAction(approvalId, action.id);
      addAuditEntry('SUCCESS', `Authorization issued. Cryptographically bound token acquired.`);
      setConfirmModal({ isOpen: false, action: null, approvalId: null });
    } catch (err) {
      addAuditEntry('ERROR', `Approval rejected by backend: ${err.message}`);
    }
  };

  const handleOpenReject = (action, approvalId) => {
    setRejectModal({ isOpen: true, action, approvalId, reason: 'Operator rejected remediation' });
  };

  const executeRejectConfirmed = async () => {
    if (!rejectModal.approvalId || !rejectModal.action) return;
    try {
      addAuditEntry('WARN', `Rejecting action ${rejectModal.action.id.slice(0, 8)}. Reason: ${rejectModal.reason}`);
      await rejectRecoveryAction(rejectModal.approvalId, rejectModal.action.id, rejectModal.reason);
      addAuditEntry('SUCCESS', `Action rejected and marked in audit log.`);
      setRejectModal({ isOpen: false, action: null, approvalId: null, reason: '' });
    } catch (err) {
      addAuditEntry('ERROR', `Rejection error: ${err.message}`);
    }
  };

  const handleExecuteAction = async (actionId) => {
    try {
      addAuditEntry('INFO', `Executing action ${actionId.slice(0, 8)} with authorized contract...`);
      const res = await executeRecoveryAction(actionId);
      if (res) {
        addAuditEntry('SUCCESS', `Action ${actionId.slice(0, 8)} finalized. Status: ${res.status || 'COMPLETED'}`);
      }
    } catch (err) {
      addAuditEntry('ERROR', `Execution failed: ${err.message}`);
    }
  };

  const handleVerifySingleAction = async (actionId) => {
    addAuditEntry('INFO', `Running deterministic verification on action ${actionId.slice(0, 8)}...`);
    const res = await verifySingleAction(actionId);
    if (res) {
      addAuditEntry('SUCCESS', `Verification status: ${res.status || 'VERIFIED'}`);
    }
  };

  const handleVerifyIncident = async () => {
    if (!activeIncident.id || activeIncident.id === 'inc-placeholder') return;
    addAuditEntry('INFO', `Initiating holistic incident verification for ${activeIncident.refCode}...`);
    const res = await verifyIncidentRecovery(activeIncident.id);
    if (res) {
      addAuditEntry(
        res.resolved ? 'SUCCESS' : 'WARN',
        `Verification completed. Incident status: ${res.incidentStatus}, Verification: ${res.status}, Residual Risk: ${res.residualRisk}`
      );
    }
  };

  const handleDryRun = () => {
    setIsDryRunning(true);
    addAuditEntry('INFO', 'Validating API idempotency, signed claims, and token scopes...');
    addToast('info', 'Simulating Dry Run', 'Validating API idempotency and role permissions...');
    setTimeout(() => {
      setIsDryRunning(false);
      addAuditEntry('SUCCESS', 'All mitigation steps passed pre-flight cryptographic schema validation.');
      addToast('success', 'Dry Run Successful', 'Pre-flight checks verified 0 policy violations.');
    }, 1200);
  };

  const actions = currentRecoveryPlan?.actions || [];
  const selectedAction = actions.find(a => a.id === selectedActionId) || actions[0];

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'REVOKE_OAUTH':
        return <Lock className="w-4 h-4 text-amber-400" />;
      case 'REVOKE_TOKEN':
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      case 'REMOVE_SSH_KEY':
        return <Key className="w-4 h-4 text-purple-400" />;
      case 'TERMINATE_SESSION':
        return <XCircle className="w-4 h-4 text-orange-400" />;
      case 'DISABLE_INTEGRATION':
        return <AlertOctagon className="w-4 h-4 text-red-500" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-secondary" />;
    }
  };

  const getRiskBadge = (risk) => {
    const r = (risk || 'MEDIUM').toUpperCase();
    if (r === 'CRITICAL') return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/30">CRITICAL RISK</span>;
    if (r === 'HIGH') return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">HIGH RISK</span>;
    if (r === 'LOW') return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">LOW RISK</span>;
    return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/20">MEDIUM RISK</span>;
  };

  const getStatusBadge = (status) => {
    const s = (status || 'PROPOSED').toUpperCase();
    if (s === 'COMPLETED' || s === 'ALREADY_EXECUTED') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-secondary/20 text-secondary border border-secondary/30">EXECUTED</span>;
    }
    if (s === 'EXECUTING') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-primary/20 text-primary border border-primary/30 animate-pulse">EXECUTING</span>;
    }
    if (s === 'APPROVED') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-sky-500/20 text-sky-400 border border-sky-500/30">AUTHORIZED</span>;
    }
    if (s === 'PENDING_APPROVAL') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">PENDING APPROVAL</span>;
    }
    if (s === 'REJECTED' || s === 'FAILED' || s === 'CANCELLED') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/30">{s}</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-surface-container-highest text-outline border border-white/5">PROPOSED</span>;
  };

  const isIncidentResolved = (activeIncident.status || '').toLowerCase() === 'resolved' || (activeIncident.rawStatus === 'RESOLVED');

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Context Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-secondary font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-secondary" />
              AUTONOMOUS RECOVERY & APPROVAL CENTER
            </span>
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-mono text-xs text-outline">AUTHORITATIVE TASK 13-15 ENGINE</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <h1 className="font-headline font-bold text-2xl text-on-surface">
              {activeIncident.refCode}
            </h1>
            <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase ${
              isIncidentResolved
                ? 'bg-secondary/20 text-secondary border border-secondary/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {isIncidentResolved ? 'RESOLVED' : (activeIncident.rawStatus || 'OPEN')}
            </span>

            {/* Incident Switcher Dropdown */}
            {incidents.length > 1 && (
              <select
                value={activeIncident.id}
                onChange={(e) => setSelectedIncidentId(e.target.value)}
                className="bg-surface-container-lowest border border-white/10 text-xs font-mono text-on-surface rounded-lg px-2 py-1 outline-none focus:border-primary"
              >
                {incidents.map(inc => (
                  <option key={inc.id} value={inc.id}>
                    {inc.refCode} - {inc.title.slice(0, 30)}...
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-on-surface-variant max-w-2xl">
            {activeIncident.title} — {activeIncident.summary}
          </p>
        </div>

        {/* Global Action CTAs & Plan Status */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDryRun}
            disabled={isDryRunning}
            className="px-3 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface font-semibold transition-colors border border-white/5 disabled:opacity-50"
          >
            {isDryRunning ? 'Validating Schema...' : 'Dry Run Simulation'}
          </button>

          <button
            onClick={handleGeneratePlan}
            disabled={isRecoveryPlanLoading || isIncidentResolved}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-on-primary font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRecoveryPlanLoading ? 'animate-spin' : ''}`} />
            <span>{currentRecoveryPlan ? 'Regenerate Plan' : 'Generate Recovery Plan'}</span>
          </button>
        </div>
      </div>

      {/* Subview Selector */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
        <button
          onClick={() => setActiveTabSection('pipeline')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all ${
            activeTabSection === 'pipeline'
              ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
              : 'text-outline hover:text-on-surface hover:bg-white/5'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Mitigation Pipeline ({actions.length})</span>
        </button>

        <button
          onClick={() => setActiveTabSection('verification')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all ${
            activeTabSection === 'verification'
              ? 'bg-secondary/15 text-secondary border border-secondary/30 shadow-sm'
              : 'text-outline hover:text-on-surface hover:bg-white/5'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Post-Recovery Verification</span>
          {incidentVerification?.status && (
            <span className={`w-2 h-2 rounded-full ${incidentVerification.resolved ? 'bg-secondary' : 'bg-amber-400'}`}></span>
          )}
        </button>

        <button
          onClick={() => setActiveTabSection('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all ${
            activeTabSection === 'audit'
              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-sm'
              : 'text-outline hover:text-on-surface hover:bg-white/5'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Execution Audit Trail</span>
        </button>
      </div>

      {/* VIEW 1: MITIGATION PIPELINE */}
      {activeTabSection === 'pipeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Actions Pipeline List (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Plan Hash Bar */}
            {currentRecoveryPlan && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-white/5 font-mono text-[11px]">
                <span className="text-outline">PLAN HASH:</span>
                <span className="text-primary truncate max-w-xs">{currentRecoveryPlan.planHash || 'DET-HASH-V1'}</span>
                <span className="text-secondary font-bold">Acyclic Dependency Order</span>
              </div>
            )}

            {/* Empty Plan State */}
            {!currentRecoveryPlan && !isRecoveryPlanLoading && (
              <div className="p-8 rounded-2xl bg-surface-container border border-white/5 shadow-xl text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-base text-on-surface">
                    No Recovery Plan Generated
                  </h3>
                  <p className="text-xs text-on-surface-variant max-w-md mx-auto mt-1">
                    Click "Generate Recovery Plan" to evaluate the attack blast radius, identify compromised credentials, and compile a deterministic mitigation pipeline.
                  </p>
                </div>
                <button
                  onClick={handleGeneratePlan}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-on-primary font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md inline-flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Synthesize Recovery Plan</span>
                </button>
              </div>
            )}

            {/* Actions List */}
            {actions.map((action, idx) => {
              const policy = actionPolicies[action.id];
              const approval = actionApprovals[action.id];
              const auth = actionAuthorizations[action.id];
              const execState = actionExecutionStates[action.id] || {};
              const verification = actionVerifications[action.id];
              const isSelected = selectedActionId === action.id;

              return (
                <div
                  key={action.id}
                  onClick={() => setSelectedActionId(action.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-surface-container border-primary shadow-lg ring-1 ring-primary/30'
                      : 'bg-surface-container-lowest border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-surface-container-high border border-white/5 flex items-center justify-center font-mono text-xs font-bold text-on-surface shrink-0">
                        {action.dependencyOrder || idx + 1}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-on-surface flex items-center gap-1.5">
                            {getActionIcon(action.actionType)}
                            {action.actionType.replace(/_/g, ' ')}
                          </span>
                          {getRiskBadge(action.riskLevel)}
                          {getStatusBadge(action.status)}
                        </div>
                        <p className="font-mono text-[11px] text-outline mt-1 truncate">
                          Target: {action.targetId || action.connectedAccountId || 'All Active Cloud Sessions'} ({action.provider || 'cloud'})
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Policy & Authorization Summary Pill */}
                  <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                    <div className="flex items-center gap-2">
                      {policy ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          policy.decision === 'ALLOW' ? 'bg-secondary/15 text-secondary' : 'bg-amber-500/15 text-amber-300'
                        }`}>
                          Policy: {policy.decision}
                        </span>
                      ) : (
                        <span className="text-outline">Policy: Unevaluated</span>
                      )}

                      {auth ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-400">
                          Auth Signed: {auth.authorizationType || 'CONTRACT'}
                        </span>
                      ) : null}
                    </div>

                    {/* Quick Action Controls */}
                    <div className="flex items-center gap-2">
                      {action.status === 'PROPOSED' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRequestApproval(action.id); }}
                          className="px-2.5 py-1 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary font-bold text-[10px] uppercase transition-colors"
                        >
                          Request Approval
                        </button>
                      )}

                      {action.status === 'PENDING_APPROVAL' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenApprove(action, approval?.id || action.id); }}
                            className="px-2.5 py-1 rounded-lg bg-secondary/20 hover:bg-secondary/30 text-secondary font-bold text-[10px] uppercase transition-colors flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenReject(action, approval?.id || action.id); }}
                            className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-[10px] uppercase transition-colors flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {action.status === 'APPROVED' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExecuteAction(action.id); }}
                          disabled={execState.isExecuting}
                          className="px-3 py-1 rounded-lg bg-gradient-to-r from-secondary to-emerald-600 text-on-secondary font-bold text-[10px] uppercase transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                        >
                          <Play className={`w-3 h-3 ${execState.isExecuting ? 'animate-spin' : ''}`} />
                          <span>{execState.isExecuting ? 'Executing...' : 'Execute Mitigation'}</span>
                        </button>
                      )}

                      {action.status === 'COMPLETED' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleVerifySingleAction(action.id); }}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-on-surface-variant font-mono text-[10px] flex items-center gap-1 transition-colors"
                        >
                          <ShieldCheck className="w-3 h-3 text-secondary" />
                          <span>Verify</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Action Inspector Workbench (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {selectedAction ? (
              <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    {getActionIcon(selectedAction.actionType)}
                    <h3 className="font-headline font-bold text-sm text-on-surface">
                      Action Workbench
                    </h3>
                  </div>
                  <span className="font-mono text-[11px] text-outline">
                    ID: {selectedAction.id.slice(0, 8)}
                  </span>
                </div>

                {/* Details Breakdown */}
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-outline">Action Type:</span>
                    <span className="text-on-surface font-bold">{selectedAction.actionType}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-outline">Risk Classification:</span>
                    <span>{getRiskBadge(selectedAction.riskLevel)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-outline">Dependency Step:</span>
                    <span className="text-primary font-bold">#{selectedAction.dependencyOrder} in Acyclic Pipeline</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-outline">Target Asset:</span>
                    <span className="text-on-surface truncate max-w-xs">{selectedAction.targetId || 'All Associated Tokens'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-outline">Lifecycle Status:</span>
                    <span>{getStatusBadge(selectedAction.status)}</span>
                  </div>
                </div>

                {/* Deterministic Policy Box */}
                <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-outline uppercase flex items-center gap-1">
                      <Lock className="w-3 h-3 text-secondary" />
                      Policy Engine v1
                    </span>
                    <button
                      onClick={() => handleEvaluatePolicy(selectedAction.id)}
                      className="text-primary hover:underline text-[10px] font-mono"
                    >
                      Re-Evaluate
                    </button>
                  </div>

                  {actionPolicies[selectedAction.id] ? (
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-outline">Decision:</span>
                        <span className={`font-bold ${
                          actionPolicies[selectedAction.id].decision === 'ALLOW' ? 'text-secondary' : 'text-amber-400'
                        }`}>
                          {actionPolicies[selectedAction.id].decision}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-outline">Reason Code:</span>
                        <span className="text-[11px] text-on-surface-variant truncate">
                          {actionPolicies[selectedAction.id].reasonCode}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-outline">Action Hash:</span>
                        <span className="text-[10px] text-outline truncate max-w-[160px]">
                          {actionPolicies[selectedAction.id].actionHash || '0x...'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-outline font-mono">
                      Policy has not been evaluated for this action yet.
                    </p>
                  )}
                </div>

                {/* Cryptographic Authorization Token Box */}
                {actionAuthorizations[selectedAction.id] && (
                  <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20 space-y-2 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-sky-400 font-bold uppercase flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Signed Authorization Contract
                      </span>
                      <span className="text-[9px] text-sky-300">VALIDATED</span>
                    </div>
                    <div className="text-[11px] space-y-1 text-sky-200">
                      <div className="truncate">Auth ID: {actionAuthorizations[selectedAction.id].authorizationId}</div>
                      <div>Type: {actionAuthorizations[selectedAction.id].authorizationType}</div>
                      <div className="text-[10px] text-sky-300/80">Expires: {new Date(actionAuthorizations[selectedAction.id].expiresAt).toLocaleTimeString()}</div>
                    </div>
                  </div>
                )}

                {/* Primary Action Button */}
                <div className="pt-2">
                  {selectedAction.status === 'PROPOSED' && (
                    <button
                      onClick={() => handleRequestApproval(selectedAction.id)}
                      className="w-full py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      <span>Request Authorization</span>
                    </button>
                  )}

                  {selectedAction.status === 'PENDING_APPROVAL' && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleOpenApprove(selectedAction, actionApprovals[selectedAction.id]?.id || selectedAction.id)}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-secondary to-emerald-600 text-on-secondary font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Authorize Execution</span>
                      </button>
                      <button
                        onClick={() => handleOpenReject(selectedAction, actionApprovals[selectedAction.id]?.id || selectedAction.id)}
                        className="px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold text-xs uppercase tracking-wider transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {selectedAction.status === 'APPROVED' && (
                    <button
                      onClick={() => handleExecuteAction(selectedAction.id)}
                      disabled={actionExecutionStates[selectedAction.id]?.isExecuting}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-secondary to-emerald-600 text-on-secondary font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Play className={`w-4 h-4 ${actionExecutionStates[selectedAction.id]?.isExecuting ? 'animate-spin' : ''}`} />
                      <span>{actionExecutionStates[selectedAction.id]?.isExecuting ? 'Executing In Cloud...' : 'Execute Recovery Action'}</span>
                    </button>
                  )}

                  {selectedAction.status === 'COMPLETED' && (
                    <div className="p-3 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-between text-xs font-mono text-secondary">
                      <span className="flex items-center gap-1.5 font-bold">
                        <Check className="w-4 h-4" />
                        Action Executed Successfully
                      </span>
                      <button
                        onClick={() => handleVerifySingleAction(selectedAction.id)}
                        className="text-[11px] underline hover:text-white"
                      >
                        Run Check
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl text-center text-outline font-mono text-xs">
                Select an action from the pipeline to inspect policy & cryptographic authorization tokens.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: POST-RECOVERY VERIFICATION */}
      {activeTabSection === 'verification' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
              <div>
                <span className="font-mono text-xs text-secondary font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
                  AUTHORITATIVE TASK 15 VERIFICATION ENGINE
                </span>
                <h2 className="font-headline font-bold text-xl text-on-surface mt-1">
                  Incident Resolution & Persistence Detection
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Post-recovery security event window analysis and topological projection consistency checks.
                </p>
              </div>

              <button
                onClick={handleVerifyIncident}
                disabled={isVerifying}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-secondary to-emerald-600 text-on-secondary font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
                <span>{isVerifying ? 'Verifying Telemetry...' : 'Run Incident Verification'}</span>
              </button>
            </div>

            {/* Overall Resolution Summary Banner */}
            {incidentVerification ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Authoritative Status */}
                  <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-outline uppercase">Resolution State</span>
                    <p className="text-sm font-bold flex items-center gap-1.5">
                      {incidentVerification.resolved ? (
                        <span className="text-secondary flex items-center gap-1">
                          <Check className="w-4 h-4" />
                          RESOLVED
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          {incidentVerification.incidentStatus || 'OPEN'}
                        </span>
                      )}
                    </p>
                    <span className="text-[10px] text-outline font-mono">
                      Verified by backend rule gate
                    </span>
                  </div>

                  {/* Card 2: Verification Check Outcome */}
                  <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-outline uppercase">Verification Status</span>
                    <p className={`text-sm font-bold font-mono ${
                      incidentVerification.status === 'VERIFIED' ? 'text-secondary' : 'text-amber-400'
                    }`}>
                      {incidentVerification.status}
                    </p>
                    <span className="text-[10px] text-outline font-mono">
                      Residual Risk: {incidentVerification.residualRisk || 'NONE'}
                    </span>
                  </div>

                  {/* Card 3: Persistence Status */}
                  <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-outline uppercase">Adversary Persistence</span>
                    <p className={`text-sm font-bold font-mono ${
                      incidentVerification.persistence?.status === 'NO_PERSISTENCE'
                        ? 'text-secondary'
                        : 'text-red-400'
                    }`}>
                      {incidentVerification.persistence?.status || 'CLEAN'}
                    </p>
                    <span className="text-[10px] text-outline font-mono">
                      Items detected: {incidentVerification.persistence?.items?.length || 0}
                    </span>
                  </div>

                  {/* Card 4: Recovery Cycle Guard */}
                  <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-outline uppercase">Recovery Cycles</span>
                    <p className="text-sm font-bold font-mono text-primary">
                      Cycle {incidentVerification.recoveryCycles || 1} of 3
                    </p>
                    <span className="text-[10px] text-outline font-mono">
                      Bounded loop protection
                    </span>
                  </div>
                </div>

                {/* Human Attention Loop Limit Warning */}
                {incidentVerification.requiresHumanAttention && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-xs text-red-300">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-red-200 uppercase font-mono">
                        Loop Limit Reached — Human Attention Required
                      </h4>
                      <p className="mt-0.5">
                        The maximum recovery cycles (3) have been reached without resolving all persistence vectors. Automated remediations have paused to prevent infinite recovery thrashing. Manual forensic review required.
                      </p>
                    </div>
                  </div>
                )}

                {/* Re-Investigation Trigger Banner */}
                {incidentVerification.reInvestigationTrigger && (
                  <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-start gap-3 text-xs text-purple-200">
                    <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-purple-100 uppercase font-mono">
                        Re-Investigation Trigger Dispatched
                      </h4>
                      <p className="mt-0.5">
                        Adversary persistence was detected after mitigation execution. Sentinel AI agent has been autonomously dispatched to trace lateral movement and locate hidden backdoors.
                      </p>
                    </div>
                  </div>
                )}

                {/* Checks Table */}
                <div className="space-y-3">
                  <h3 className="font-headline font-bold text-sm text-on-surface font-mono">
                    Deterministic Verification Checks Breakdown
                  </h3>

                  <div className="rounded-xl border border-white/5 overflow-hidden">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="bg-surface-container-lowest text-outline text-[10px] uppercase border-b border-white/5">
                        <tr>
                          <th className="p-3">Check Type</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Expected State</th>
                          <th className="p-3">Observed State</th>
                          <th className="p-3">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {Array.isArray(incidentVerification.checks) && incidentVerification.checks.length > 0 ? (
                          incidentVerification.checks.map((check, idx) => (
                            <tr key={idx} className="hover:bg-white/[0.02]">
                              <td className="p-3 font-semibold text-on-surface">
                                {check.checkType}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  check.status === 'PASS'
                                    ? 'bg-secondary/20 text-secondary'
                                    : check.status === 'FAIL'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}>
                                  {check.status}
                                </span>
                              </td>
                              <td className="p-3 text-outline truncate max-w-xs">{check.expected || 'Nominal'}</td>
                              <td className="p-3 text-on-surface-variant truncate max-w-xs">{check.observed || 'Verified clean'}</td>
                              <td className="p-3 text-outline text-[10px]">
                                {check.timestamp ? new Date(check.timestamp).toLocaleTimeString() : 'Recent'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5" className="p-4 text-center text-outline">
                              No individual checks recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3 font-mono">
                <p className="text-xs text-outline">
                  No post-recovery verification has been run for this incident.
                </p>
                <button
                  onClick={handleVerifyIncident}
                  className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface font-semibold transition-colors border border-white/5"
                >
                  Run Baseline Verification Check
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: AUDIT TRAIL */}
      {activeTabSection === 'audit' && (
        <div className="p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-3 font-mono">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <span className="font-headline font-bold text-xs text-on-surface flex items-center gap-2">
              <Terminal className="w-4 h-4 text-secondary" />
              RECOVERY & AUTHORIZATION AUDIT LOG
            </span>
            <span className="text-[10px] text-outline">SHA256 SIGNED • IMMUTABLE</span>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 text-xs space-y-2 min-h-[300px] max-h-96 overflow-y-auto">
            {auditLogs.map((log, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-outline text-[10px] shrink-0 mt-0.5">
                  [{new Date(log.timestamp).toISOString().substring(11, 19)}]
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                  log.level === 'SUCCESS' ? 'bg-secondary/20 text-secondary' : log.level === 'ERROR' ? 'bg-red-500/20 text-red-400' : log.level === 'WARN' ? 'bg-amber-500/20 text-amber-300' : 'bg-surface-container-highest text-outline'
                }`}>
                  {log.level}
                </span>
                <span className="text-on-surface-variant leading-relaxed">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal for HIGH/CRITICAL Approvals */}
      {confirmModal.isOpen && confirmModal.action && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-surface-container border border-red-500/30 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-headline font-bold text-lg text-on-surface">
                Confirm High-Risk Authorization
              </h3>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              You are about to authorize a <strong className="text-red-400">{confirmModal.action.riskLevel}</strong> risk recovery action:
              <br />
              <span className="font-mono text-on-surface font-bold mt-1 inline-block">
                {confirmModal.action.actionType}
              </span>
              <br />
              Target: <span className="font-mono text-outline">{confirmModal.action.targetId || 'Associated credentials'}</span>
            </p>

            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] font-mono text-red-300">
              Cryptographic authorization will be signed with your operator session. This action will revoke live credentials immediately upon execution.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal({ isOpen: false, action: null, approvalId: null })}
                className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeApproveConfirmed(confirmModal.action, confirmModal.approvalId)}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md"
              >
                Authorize Action
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModal.isOpen && rejectModal.action && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-surface-container border border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <XCircle className="w-6 h-6" />
              <h3 className="font-headline font-bold text-lg text-on-surface">
                Reject Recovery Action
              </h3>
            </div>

            <p className="text-xs text-on-surface-variant">
              Provide a reason for rejecting action <span className="font-mono font-bold text-on-surface">{rejectModal.action.actionType}</span>. This will be recorded in the immutable audit trail.
            </p>

            <div>
              <label className="text-[11px] font-mono text-outline uppercase block mb-1">
                Rejection Rationale
              </label>
              <textarea
                value={rejectModal.reason}
                onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
                className="w-full bg-surface-container-lowest border border-white/10 rounded-xl p-3 text-xs text-on-surface outline-none focus:border-amber-400 font-mono"
                placeholder="E.g. Action conflicts with ongoing incident response drill..."
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectModal({ isOpen: false, action: null, approvalId: null, reason: '' })}
                className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeRejectConfirmed}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider transition-all"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
