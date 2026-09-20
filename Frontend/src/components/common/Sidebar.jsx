import React from 'react';
import { useSecurity } from '../../context/SecurityContext';
import {
  LayoutDashboard,
  Network,
  Activity,
  AlertOctagon,
  BrainCircuit,
  GitFork,
  ShieldCheck,
  PlaySquare,
  Search,
  ExternalLink,
  KeyRound
} from 'lucide-react';

export const Sidebar = () => {
  const { activeTab, setActiveTab, openCommandPalette, systemStatus, incidents } = useSecurity();

  const activeIncidentsCount = incidents.filter(i => i.status === 'investigating' || i.status === 'mitigating').length;

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'accounts', label: 'Accounts & Fabrics', icon: Network },
    { id: 'telemetry', label: 'Telemetry Stream', icon: Activity },
    { id: 'incidents', label: 'Incidents Hub', icon: AlertOctagon, badge: activeIncidentsCount > 0 ? activeIncidentsCount : undefined },
    { id: 'investigation', label: 'AI Investigation', icon: BrainCircuit },
    { id: 'blast-radius', label: 'Attack Graph', icon: GitFork },
    { id: 'recovery', label: 'Recovery Center', icon: ShieldCheck },
    { id: 'profile', label: 'Account Security', icon: KeyRound },
    { id: 'prototype', label: 'Attack Sandbox', icon: PlaySquare, highlight: true },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-low z-50 hidden lg:flex flex-col justify-between py-5 px-3 border-r border-white/5 shadow-2xl">
      <div className="flex flex-col gap-5">
        {/* Brand Logo & Core Title */}
        <div
          onClick={() => setActiveTab('landing')}
          className="flex items-center gap-3 px-3 py-1 cursor-pointer group"
        >
          <img alt="RE:COVER Logo" className="h-7 w-auto object-contain transition-transform group-hover:scale-105" src="/logo.svg" />
          <div className="flex flex-col">
            <span className="font-headline font-bold text-sm tracking-wide text-on-surface leading-none uppercase">
              RE<span className="text-primary">:</span>COVER
            </span>
            <span className="font-mono text-[9px] text-outline tracking-wider mt-1">
              Autonomous Core
            </span>
          </div>
        </div>

        {/* Command Palette Trigger Input */}
        <div className="px-1">
          <button
            onClick={openCommandPalette}
            type="button"
            className="w-full h-9 bg-surface-container hover:bg-surface-container-high rounded-lg flex items-center justify-between px-3 text-outline hover:text-on-surface text-xs transition-colors cursor-pointer border border-white/5"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              <span>Cmd + K to query...</span>
            </div>
            <kbd className="px-1.5 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-on-surface-variant">⌘K</kbd>
          </button>
        </div>

        {/* Navigation Link Items */}
        <nav className="flex flex-col gap-1 px-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-xs font-medium text-left ${
                  isActive
                    ? 'bg-surface-container-high text-primary font-semibold border-l-2 border-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-outline'} ${item.highlight ? 'text-secondary' : ''}`} />
                  <span className={item.highlight && !isActive ? 'text-secondary' : ''}>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full bg-error text-on-error text-[10px] font-mono font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Status Block & Landing Page Link */}
      <div className="flex flex-col gap-3 px-1">
        <button
          onClick={() => setActiveTab('landing')}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container/60 hover:bg-surface-container text-xs text-on-surface-variant hover:text-on-surface transition-all border border-white/5"
        >
          <span>Marketing Overview</span>
          <ExternalLink className="w-3 h-3 text-outline" />
        </button>

        <div className="p-3 rounded-lg bg-surface-container border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                systemStatus === 'PROTECTED' ? 'bg-secondary' : systemStatus === 'CRITICAL' ? 'bg-error' : 'bg-amber-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                systemStatus === 'PROTECTED' ? 'bg-secondary' : systemStatus === 'CRITICAL' ? 'bg-error' : 'bg-amber-400'
              }`}></span>
            </span>
            <span className={`font-mono text-[10px] font-semibold tracking-wider ${
              systemStatus === 'PROTECTED' ? 'text-secondary' : systemStatus === 'CRITICAL' ? 'text-error' : 'text-amber-400'
            }`}>
              {systemStatus}
            </span>
          </div>
          <span className="text-[10px] font-mono text-outline">v1.0.0-MVP</span>
        </div>
      </div>
    </aside>
  );
};

