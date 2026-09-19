import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  BrainCircuit,
  Terminal,
  Send,
  Copy,
  Check,
  GitFork,
  ShieldCheck,
  Bot
} from 'lucide-react';

export const AiInvestigationPage = () => {
  const {
    selectedIncident,
    setSelectedIncidentId,
    setActiveTab,
    addToast
  } = useSecurity();

  const [copiedPayload, setCopiedPayload] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'ai',
      text: `Sentinel AI Investigation for incident #${selectedIncident.refCode} is initialized. I have synthesized 4 telemetry streams and mapped the adversary's lateral hops from GitHub to AWS S3. What would you like me to analyze or mitigate?`,
      time: '11:16 UTC'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(selectedIncident.rawPayload, null, 2));
    setCopiedPayload(true);
    addToast('success', 'Copied', 'Raw telemetry JSON copied to clipboard.');
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleSendMessage = (textToSend) => {
    const text = textToSend || inputQuery;
    if (!text.trim()) return;

    const userMsg = { role: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setChatMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputQuery('');
    setIsAiTyping(true);

    setTimeout(() => {
      let aiResponseText = '';
      const q = text.toLowerCase();

      if (q.includes('blast') || q.includes('radius') || q.includes('impact')) {
        aiResponseText = `Based on topological graph synthesis, the compromised deploy key expanded across 5 nodes: GitHub Repo -> AWS STS -> IAM Role (Deployer-Prod-Admin) -> S3 Vault (prod-vault-customer-01) -> CircleCI webhook. Total calculated financial exposure: $1.4M in PII records, 100% contained by RE:COVER interceptor.`;
      } else if (q.includes('credential') || q.includes('token') || q.includes('key')) {
        aiResponseText = `The threat actor utilized an expired personal access token (ghp_998x...) leaked in public CI log #9482, then provisioned an unauthorized ed25519 deploy key to maintain persistence. Both credentials have been flagged for 1-click rollback.`;
      } else if (q.includes('script') || q.includes('bash') || q.includes('remediat')) {
        aiResponseText = `Here is the verified remediation payload:\n\`\`\`bash\n# Revoke STS role session\naws sts revoke-all-sessions --role-arn arn:aws:iam::123456789012:role/Deployer-Prod-Admin\n# Invalidate compromised GitHub Deploy Key\ngh api -X DELETE /repos/enterprise/infra-terraform-core/keys/ed25519-AAAAC3...\n\`\`\``;
      } else {
        aiResponseText = `Sentinel Analysis confirms root cause: Credential leakage in CI log leading to STS privilege escalation. Recommended next step: Execute Rollback Playbook #REC-1 to invalidate session keys and enforce WebAuthn re-auth.`;
      }

      setChatMessages(prev => [
        ...prev,
        {
          role: 'ai',
          text: aiResponseText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setIsAiTyping(false);
    }, 900);
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Investigation Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
              <BrainCircuit className="w-4 h-4" />
              AUTONOMOUS AI INVESTIGATION WORKBENCH
            </span>
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-mono text-xs text-on-surface font-semibold">{selectedIncident.refCode}</span>
            <span className={`px-2 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
              selectedIncident.severity === 'critical' ? 'bg-error text-on-error' : 'bg-primary/20 text-primary'
            }`}>
              {selectedIncident.severity}
            </span>
          </div>
          <h1 className="font-headline font-bold text-xl sm:text-2xl text-on-surface">
            {selectedIncident.title}
          </h1>
          <p className="text-xs text-on-surface-variant font-mono">{selectedIncident.targetResource}</p>
        </div>

        {/* Actions & Playbook Link */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setActiveTab('blast-radius')}
            className="px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface font-semibold text-xs flex items-center gap-1.5 transition-colors border border-white/5"
          >
            <GitFork className="w-3.5 h-3.5 text-primary" />
            <span>View Blast Topology</span>
          </button>

          <button
            onClick={() => setActiveTab('recovery')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all shadow-md"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Launch Recovery Playbook</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Multi-Hop Timeline + Interactive Sentinel AI Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Timeline & Reasoning Steps (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Multi-Hop Causal Timeline */}
          <div className="p-5 sm:p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <span className="font-headline font-bold text-sm text-on-surface flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" />
                Multi-Hop Threat Propagation Chain
              </span>
              <span className="text-xs font-mono text-secondary font-semibold">
                AI Confidence: {selectedIncident.aiConfidence}%
              </span>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
              {selectedIncident.evidenceChain.map((ev, i) => (
                <div key={i} className="relative group">
                  <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-surface ${
                    ev.severity === 'critical' ? 'bg-error' : ev.severity === 'high' ? 'bg-amber-400' : 'bg-primary'
                  }`}></div>
                  <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-outline">{ev.time}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                        ev.severity === 'critical' ? 'bg-error/20 text-error' : 'bg-primary/20 text-primary'
                      }`}>
                        {ev.severity}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-on-surface">{ev.event}</h4>
                    <p className="text-[11px] text-on-surface-variant font-mono">{ev.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Raw Telemetry JSON Payload Inspector */}
          <div className="p-5 sm:p-6 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="font-headline font-bold text-xs text-on-surface font-mono flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                RAW TELEMETRY CLOUDTRAIL / AUDIT LOG
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs font-mono text-primary hover:underline"
              >
                {copiedPayload ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPayload ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 text-[11px] font-mono text-on-surface-variant overflow-x-auto max-h-56">
              {JSON.stringify(selectedIncident.rawPayload, null, 2)}
            </pre>
          </div>
        </div>

        {/* Right Column: Interactive Sentinel AI Assistant (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-[650px] p-5 rounded-2xl bg-surface-container border border-white/5 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-headline font-bold text-xs text-on-surface">Sentinel AI Agent</h3>
                <span className="text-[10px] font-mono text-secondary">Autonomous Security Copilot</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-secondary/10 text-secondary text-[9px] font-mono font-bold">
              ACTIVE
            </span>
          </div>

          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap gap-1.5 pb-3 border-b border-white/5 mb-3">
            {[
              'Summarize blast radius',
              'What credentials were stolen?',
              'Generate bash remediation script'
            ].map(prompt => (
              <button
                key={prompt}
                onClick={() => handleSendMessage(prompt)}
                className="px-2 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-variant text-[10px] font-mono text-primary transition-colors border border-primary/20 text-left"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[9px] font-mono text-outline mb-1">{msg.time}</span>
                <div
                  className={`p-3 rounded-xl text-xs max-w-[90%] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-on-primary font-medium'
                      : 'bg-surface-container-lowest border border-white/5 text-on-surface'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {isAiTyping && (
              <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 text-xs text-primary font-mono animate-pulse">
                Sentinel AI is reasoning across identity graph...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="pt-3 border-t border-white/5 mt-2 flex items-center gap-2">
            <input
              type="text"
              value={inputQuery}
              onChange={e => setInputQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask Sentinel AI about this incident..."
              className="flex-1 px-3.5 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface placeholder-outline focus:outline-none focus:border-primary"
            />
            <button
              onClick={() => handleSendMessage()}
              className="p-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-colors shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

