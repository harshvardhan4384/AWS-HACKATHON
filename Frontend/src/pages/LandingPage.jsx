import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import { ImmuneCoreShader } from '../components/shader/ImmuneCoreShader';
import { Header } from '../components/common/Header';
import {
  Shield,
  Zap,
  Activity,
  ArrowRight,
  Play,
  CheckCircle2,
  Lock,
  GitFork,
  BrainCircuit,
  RotateCcw,
  Network,
  ChevronDown,
  Layers,
  Terminal,
  ShieldCheck
} from 'lucide-react';

export const LandingPage = () => {
  const { setActiveTab, openAuthModal, openConnectModal, triggerScenario } = useSecurity();

  const [activeStage, setActiveStage] = useState(1);
  const [openFaq, setOpenFaq] = useState(0);
  const [simState, setSimState] = useState('idle');

  const handleRunDemo = () => {
    setSimState('simulating');
    setTimeout(() => {
      setSimState('mitigated');
    }, 2400);
  };

  const stages = [
    {
      step: '01',
      title: 'Continuous Identity Ingestion',
      desc: 'Real-time security telemetry listening across Google Workspace, GitHub Enterprise, and simulated AWS environments.',
      icon: Network,
      tag: 'STREAM EVENT NORMALIZATION'
    },
    {
      step: '02',
      title: 'Graph Blast Radius Synthesis',
      desc: 'Dynamically traverses access tokens, SSH credentials, and cross-account roles to calculate topological blast radius in real time.',
      icon: GitFork,
      tag: 'MULTI-HOP TRAVERSAL'
    },
    {
      step: '03',
      title: 'Autonomous Sentinel Defense',
      desc: 'AI Sentinel correlates multi-vector IOCs against MITRE ATT&CK patterns to isolate compromised credentials.',
      icon: BrainCircuit,
      tag: 'AUTONOMOUS INTERCEPTION'
    },
    {
      step: '04',
      title: '1-Click Cryptographic Recovery',
      desc: 'Orchestrates full state restoration, token revocation, and verified remediation without engineering downtime.',
      icon: ShieldCheck,
      tag: 'ZERO DOWNTIME ROLLBACK'
    }
  ];

  const faqs = [
    {
      q: 'How does RE:COVER differ from traditional SIEM / SOAR tools?',
      a: 'Traditional SOARs require complex manual playbook authoring and react post-facto. RE:COVER is an autonomous digital immune system that operates with graph topology comprehension, stopping credential attacks and blast radius expansion before exfiltration can occur.'
    },
    {
      q: 'Does RE:COVER require invasive agents on our servers?',
      a: 'No. RE:COVER connects directly into your cloud identity fabrics (Google Cloud & Workspace, GitHub Enterprise, and simulated AWS) via read-only telemetry streams and authorized least-privilege APIs, deploying in under 5 minutes.'
    },
    {
      q: 'Can our SecOps team retain Human-in-the-Loop control?',
      a: 'Absolutely. You can configure granular autonomous guardrails: benign containment actions can execute automatically, while high-impact actions (such as credential teardowns or role modifications) require 1-click human authorization.'
    },
    {
      q: 'How does RE:COVER prevent hallucinated remediation actions?',
      a: 'Every remediation plan undergoes verification by an Adversarial Verifier agent and deterministic policy engine, validating that all claims are strictly grounded in verified telemetry evidence before execution.'
    }
  ];

  return (
    <div className="w-full bg-surface text-on-surface min-h-screen">
      <Header isLanding={true} />

      <main className="w-full pt-16">
        {/* Top Atmospheric Glow */}
        <div className="relative w-full overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[360px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute top-60 right-1/4 w-[420px] h-[280px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none"></div>

          {/* Hero Section */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 pt-12 lg:pt-16 pb-20 relative z-10 flex flex-col items-center text-center">
            {/* Live Immune Status Pill */}
            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-surface-container-high border border-white/5 shadow-md mb-8">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
              </span>
              <span className="font-mono text-xs text-secondary tracking-wider uppercase font-semibold">
                Immune Core Nominal
              </span>
              <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
              <span className="text-xs text-on-surface-variant hidden sm:inline">
                0 Uncontained Breaches Across Monitored Accounts
              </span>
            </div>

            {/* Main Typography */}
            <h1 className="font-headline font-bold text-4xl sm:text-5xl lg:text-6xl text-on-surface max-w-4xl tracking-tight mb-6 leading-tight">
              Your Digital Identity.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-fixed-dim to-secondary">
                Autonomous Defense & Recovery.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-on-surface-variant max-w-2xl mb-10 text-balance leading-relaxed">
              RE:COVER continuously monitors connected SaaS & Cloud accounts, models attack graphs in real-time, and recovers compromised infrastructure in seconds.
            </p>

            {/* Dual Actions */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-14">
              <button
                onClick={() => setActiveTab('dashboard')}
                className="group flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-semibold text-sm shadow-xl shadow-primary/20 hover:shadow-primary/35 hover:brightness-110 active:scale-95 transition-all"
              >
                <span>Launch Defense Console</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => setActiveTab('prototype')}
                className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-headline font-semibold text-sm transition-all border border-white/5 shadow-sm group"
              >
                <Play className="w-4 h-4 text-primary fill-primary/30 group-hover:scale-110 transition-transform" />
                <span>Simulate Live Attack</span>
              </button>
            </div>

            {/* WebGL Immune Core Visualization */}
            <div className="w-full max-w-5xl relative rounded-2xl bg-surface-container-lowest p-2 border border-white/10 shadow-2xl">
              <div className="relative w-full h-[360px] sm:h-[460px] md:h-[500px] rounded-xl overflow-hidden bg-surface-container-low">
                <ImmuneCoreShader className="w-full h-full relative" />
                
                {/* Floating Telemetry Stats Over Shader */}
                <div className="absolute top-4 left-4 p-3 rounded-xl bg-surface-container/80 backdrop-blur-md border border-white/10 shadow-lg text-left hidden sm:block">
                  <div className="flex items-center gap-2 text-[10px] font-mono text-outline uppercase">
                    <Activity className="w-3 h-3 text-primary animate-pulse" />
                    <span>Active Telemetry Stream</span>
                  </div>
                  <p className="text-sm font-mono font-bold text-on-surface mt-0.5">Continuous Ingestion</p>
                </div>

                <div className="absolute top-4 right-4 p-3 rounded-xl bg-surface-container/80 backdrop-blur-md border border-white/10 shadow-lg text-right hidden sm:block">
                  <div className="flex items-center justify-end gap-2 text-[10px] font-mono text-outline uppercase">
                    <span>Autonomous Defense</span>
                    <Zap className="w-3 h-3 text-secondary" />
                  </div>
                  <p className="text-sm font-mono font-bold text-secondary mt-0.5">Topological Isolation</p>
                </div>

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-surface-container/90 backdrop-blur-md border border-white/10 shadow-lg flex items-center gap-4 text-xs font-mono text-on-surface">
                  <span className="flex items-center gap-1.5 text-primary">
                    <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                    Graph Topology Active
                  </span>
                  <span className="text-outline">|</span>
                  <span className="text-on-surface-variant">Hover cursor to interact with immune field</span>
                </div>
              </div>
            </div>
          </section>

          {/* Interactive Live Attack Simulator on Landing */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-16">
            <div className="p-6 sm:p-10 rounded-2xl bg-surface-container border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="max-w-2xl mb-8">
                <span className="text-xs font-mono text-primary uppercase tracking-wider font-semibold">Interactive Sandbox</span>
                <h2 className="font-headline font-bold text-2xl sm:text-3xl text-on-surface mt-1">
                  Test RE:COVER's Autonomous Containment in Real-Time
                </h2>
                <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
                  Trigger an automated credential compromise test to observe how our graph reasoning engine isolates the threat in under 3 seconds.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                <div className="lg:col-span-1 space-y-3">
                  <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/5 space-y-2">
                    <span className="text-xs font-mono text-outline uppercase">Attack Scenario:</span>
                    <p className="text-sm font-semibold text-on-surface">GitHub PAT Leaked & Mass S3 Download</p>
                    <p className="text-xs text-on-surface-variant">Threat Actor IP: 194.26.29.114 (Tor Node)</p>
                  </div>

                  <button
                    onClick={handleRunDemo}
                    disabled={simState === 'simulating'}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-error to-rose-600 text-on-error font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{simState === 'simulating' ? 'Simulating Attack Vector...' : 'Inject Attack Scenario'}</span>
                  </button>
                </div>

                <div className="lg:col-span-2 p-5 rounded-xl bg-surface-container-lowest border border-white/5 font-mono text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3 text-outline">
                    <span>AUTONOMOUS SENTINEL TERMINAL</span>
                    <span className="text-primary font-bold">STATE: {simState.toUpperCase()}</span>
                  </div>

                  <div className="space-y-2 min-h-[140px]">
                    {simState === 'idle' && (
                      <p className="text-outline italic">[IDLE] Press "Inject Attack Scenario" to start live demonstration...</p>
                    )}
                    {simState === 'simulating' && (
                      <>
                        <p className="text-error">[ALERT] 11:13:02 UTC - Unauthorized STS AssumeRole from Tor IP (194.26.29.114)</p>
                        <p className="text-amber-400">[GRAPH] Blast Radius calculating... 5 affected cloud resources identified.</p>
                        <p className="text-primary animate-pulse">[SENTINEL] Engaging autonomous token quarantine and S3 bucket ACL lock...</p>
                      </>
                    )}
                    {simState === 'mitigated' && (
                      <>
                        <p className="text-error">[ALERT] 11:13:02 UTC - Unauthorized STS AssumeRole from Tor IP</p>
                        <p className="text-secondary font-bold">[INTERCEPTED] Access token revoked in 0.4s. S3 read blocked.</p>
                        <p className="text-primary">[ROLLBACK PLAN] 1-Click Rollback Playbook #REC-1 generated.</p>
                        <div className="pt-2">
                          <button
                            onClick={() => setActiveTab('recovery')}
                            className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-bold text-xs hover:brightness-110 transition-all inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            View 1-Click Rollback Plan
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 4-Stage Architecture */}
          <section id="how-it-works-flow" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-20">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-xs font-mono text-primary uppercase tracking-wider font-semibold">Immune Architecture</span>
              <h2 className="font-headline font-bold text-3xl sm:text-4xl text-on-surface mt-2">
                4-Stage Autonomous Defense Pipeline
              </h2>
              <p className="text-sm text-on-surface-variant mt-3">
                From initial credential exposure to zero-downtime cryptographic rollback.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stages.map(stage => {
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.step}
                    className="p-6 rounded-2xl bg-surface-container border border-white/5 hover:border-primary/40 transition-all group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-mono text-2xl font-bold text-primary/40 group-hover:text-primary transition-colors">
                          {stage.step}
                        </span>
                        <div className="p-2 rounded-xl bg-surface-container-high text-primary group-hover:scale-110 transition-transform">
                          <Icon className="w-5 h-5" />
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                        {stage.tag}
                      </span>
                      <h3 className="font-headline font-bold text-base text-on-surface mt-3">{stage.title}</h3>
                      <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">{stage.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Connected Identity Fabrics */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-16 bg-surface-container-lowest/50 rounded-3xl border border-white/5 my-12">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-mono text-secondary uppercase tracking-wider font-semibold">Universal Compatibility</span>
              <h2 className="font-headline font-bold text-2xl sm:text-3xl text-on-surface mt-1">
                Connected Identity & Cloud Ecosystem
              </h2>
              <p className="text-xs text-on-surface-variant mt-2">
                Seamless out-of-the-box telemetry ingestion with all enterprise SaaS and infrastructure providers.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {[
                { name: 'Google Cloud & Workspace', desc: 'OAuth 2.0 PKCE, OpenID Connect & Audit Logs', badge: 'REAL OAUTH' },
                { name: 'GitHub Enterprise', desc: 'OAuth 2.0 Web Flow, Org Audits & PAT Watchers', badge: 'REAL OAUTH' },
                { name: 'Amazon Web Services', desc: 'Synthetic STS, IAM Roles & CloudTrail Telemetry', badge: 'SIMULATED' },
              ].map(item => (
                <div
                  key={item.name}
                  onClick={openConnectModal}
                  className="p-5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-white/5 hover:border-primary/40 transition-all text-center cursor-pointer group space-y-2"
                >
                  <div className="flex justify-center">
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {item.badge}
                    </span>
                  </div>
                  <Shield className="w-6 h-6 text-primary mx-auto group-hover:scale-110 transition-transform" />
                  <h4 className="text-xs font-bold text-on-surface">{item.name}</h4>
                  <p className="text-[10px] text-outline">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Enterprise FAQ Accordion */}
          <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
            <div className="text-center mb-12">
              <span className="text-xs font-mono text-primary uppercase tracking-wider font-semibold">Answers</span>
              <h2 className="font-headline font-bold text-2xl sm:text-3xl text-on-surface mt-1">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="rounded-xl bg-surface-container border border-white/5 overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full p-4 text-left flex items-center justify-between gap-4"
                  >
                    <span className="text-xs sm:text-sm font-semibold text-on-surface">{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-outline transition-transform ${openFaq === idx ? 'rotate-180 text-primary' : ''}`} />
                  </button>
                  {openFaq === idx && (
                    <div className="px-4 pb-4 text-xs text-on-surface-variant leading-relaxed border-t border-white/5 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Bottom CTA */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-20 text-center">
            <div className="p-8 sm:p-14 rounded-3xl bg-gradient-to-b from-surface-container to-surface-container-low border border-primary/20 shadow-2xl relative overflow-hidden">
              <div className="relative z-10 max-w-2xl mx-auto">
                <h2 className="font-headline font-bold text-3xl sm:text-4xl text-on-surface">
                  Fortify Your Identity Fabric Today
                </h2>
                <p className="text-xs sm:text-sm text-on-surface-variant mt-3 mb-8 leading-relaxed">
                  Join enterprise security teams deploying RE:COVER's autonomous immune system for zero-downtime protection.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <button
                    onClick={() => openAuthModal('signup')}
                    className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold text-xs uppercase tracking-wider shadow-xl hover:brightness-110 active:scale-95 transition-all"
                  >
                    Get Started Free
                  </button>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className="px-6 py-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-headline font-semibold text-xs transition-all border border-white/5"
                  >
                    Explore Defense Console
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-surface-container-lowest py-8 px-4 sm:px-6 lg:px-12 text-xs text-outline flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img alt="RE:COVER Logo" className="h-5 w-auto" src="/logo.svg" />
          <span>© 2026 RE:COVER Digital Immune System. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-6 font-mono text-[11px]">
          <span>Least-Privilege Scoped</span>
          <span>Deterministic Policy Engine</span>
          <span>Adversarial Verifier Grounding</span>
        </div>
      </footer>
    </div>
  );
};

