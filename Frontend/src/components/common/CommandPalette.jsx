import React, { useState } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import {
  Search,
  LayoutDashboard,
  Network,
  Activity,
  AlertOctagon,
  BrainCircuit,
  GitFork,
  ShieldCheck,
  ShieldAlert,
  Zap,
  X
} from 'lucide-react';

export const CommandPalette = () => {
  const {
    isCommandPaletteOpen,
    closeCommandPalette,
    setActiveTab,
    incidents,
    setSelectedIncidentId,
    openConnectModal,
    triggerScenario
  } = useSecurity();

  const [query, setQuery] = useState('');

  if (!isCommandPaletteOpen) return null;

  const actions = [
    {
      id: 'nav-overview',
      title: 'Navigate to Overview Dashboard',
      category: 'Navigation',
      icon: LayoutDashboard,
      run: () => { setActiveTab('dashboard'); closeCommandPalette(); }
    },
    {
      id: 'nav-incidents',
      title: 'Navigate to Incidents & Threat Triage',
      category: 'Navigation',
      icon: AlertOctagon,
      run: () => { setActiveTab('incidents'); closeCommandPalette(); }
    },
    {
      id: 'nav-investigation',
      title: 'Navigate to AI Autonomous Investigation',
      category: 'Navigation',
      icon: BrainCircuit,
      run: () => { setActiveTab('investigation'); closeCommandPalette(); }
    },
    {
      id: 'nav-graph',
      title: 'Navigate to Attack Graph & Blast Radius',
      category: 'Navigation',
      icon: GitFork,
      run: () => { setActiveTab('blast-radius'); closeCommandPalette(); }
    },
    {
      id: 'nav-recovery',
      title: 'Navigate to Recovery & Approval Center',
      category: 'Navigation',
      icon: ShieldCheck,
      run: () => { setActiveTab('recovery'); closeCommandPalette(); }
    },
    {
      id: 'nav-telemetry',
      title: 'Navigate to Live Telemetry Stream',
      category: 'Navigation',
      icon: Activity,
      run: () => { setActiveTab('telemetry'); closeCommandPalette(); }
    },
    {
      id: 'nav-accounts',
      title: 'Navigate to Connected Accounts & Fabrics',
      category: 'Navigation',
      icon: Network,
      run: () => { setActiveTab('accounts'); closeCommandPalette(); }
    },
    {
      id: 'act-connect',
      title: 'Connect New Identity / Cloud Provider',
      category: 'Actions',
      icon: Zap,
      run: () => { closeCommandPalette(); openConnectModal(); }
    },
    {
      id: 'act-sim-pat',
      title: 'Simulate Attack: GitHub PAT Leak & AWS Secrets Exfiltration',
      category: 'Simulation',
      icon: ShieldAlert,
      run: () => { triggerScenario('pat-leak'); setActiveTab('investigation'); closeCommandPalette(); }
    },
    {
      id: 'act-sim-okta',
      title: 'Simulate Attack: Multi-Geo Okta Password Spray',
      category: 'Simulation',
      icon: ShieldAlert,
      run: () => { triggerScenario('okta-spray'); setActiveTab('incidents'); closeCommandPalette(); }
    }
  ];

  incidents.forEach(inc => {
    actions.push({
      id: `inc-${inc.id}`,
      title: `Jump to Incident #${inc.refCode}: ${inc.title}`,
      category: 'Incidents',
      icon: AlertOctagon,
      run: () => {
        setSelectedIncidentId(inc.id);
        setActiveTab('investigation');
        closeCommandPalette();
      }
    });
  });

  const filtered = actions.filter(a =>
    a.title.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-surface-container border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/10 gap-3">
          <Search className="w-5 h-5 text-primary" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands, navigate screens, or jump to incident..."
            className="flex-1 bg-transparent text-sm text-on-surface placeholder-outline focus:outline-none"
          />
          <button
            onClick={closeCommandPalette}
            className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-white/5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-outline">
              No matching commands or incidents found for "{query}"
            </div>
          ) : (
            filtered.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.run}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-container-high rounded-xl text-left transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-surface-container-lowest text-primary group-hover:text-primary-fixed-dim transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-on-surface group-hover:text-primary transition-colors">
                        {item.title}
                      </p>
                      <span className="text-[10px] font-mono text-outline uppercase">{item.category}</span>
                    </div>
                  </div>
                  <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-surface-container-lowest text-[10px] text-outline font-mono">
                    ↵
                  </kbd>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-surface-container-lowest border-t border-white/5 flex items-center justify-between text-[11px] text-outline font-mono">
          <span>Navigate: ↑ ↓ | Select: Enter | Dismiss: Esc</span>
          <span className="text-primary font-semibold">RE:COVER Global Command</span>
        </div>
      </div>
    </div>
  );
};

