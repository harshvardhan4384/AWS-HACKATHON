import React, { useState } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { Shield, Bell, Search, User, LogOut, ChevronDown, CheckCircle2, AlertTriangle, Play } from 'lucide-react';

export const Header = ({ isLanding = false }) => {
  const {
    systemStatus,
    openCommandPalette,
    openAuthModal,
    openConnectModal,
    currentUser,
    logout,
    activeTab,
    setActiveTab,
    incidents,
    setSelectedIncidentId
  } = useSecurity();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const activeIncidents = incidents.filter(i => i.status === 'investigating' || i.status === 'mitigating');

  const getStatusColor = () => {
    switch (systemStatus) {
      case 'PROTECTED':
        return 'text-secondary border-secondary/30 bg-secondary/10';
      case 'ELEVATED':
        return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
      case 'CRITICAL':
        return 'text-error border-error/30 bg-error/10';
      case 'RECOVERING':
        return 'text-primary border-primary/30 bg-primary/10';
      default:
        return 'text-secondary border-secondary/30 bg-secondary/10';
    }
  };

  if (isLanding) {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/85 backdrop-blur-xl border-b border-white/5 transition-all">
        <div className="h-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setActiveTab('landing')}>
            <img alt="RE:COVER Logo" className="h-7 w-auto object-contain" src="/logo.svg" />
            <span className="font-headline font-bold text-lg tracking-wider text-on-surface uppercase hidden sm:inline">
              RE<span className="text-primary">:</span>COVER
            </span>
          </div>

          <nav className="hidden lg:flex items-center gap-6">
            <button
              onClick={() => setActiveTab('landing')}
              className={`text-sm transition-colors ${activeTab === 'landing' ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              Overview
            </button>
            <a href="#how-it-works-flow" className="text-sm text-on-surface-variant hover:text-on-surface transition-colors">
              How It Works
            </a>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Console
            </button>
            <button
              onClick={() => setActiveTab('accounts')}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Connected Fabrics
            </button>
            <button
              onClick={() => setActiveTab('recovery')}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Recovery Engine
            </button>
            <button
              onClick={() => setActiveTab('prototype')}
              className="text-sm text-secondary hover:text-secondary-fixed transition-colors flex items-center gap-1 font-medium"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Live Sandbox
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={openCommandPalette}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs text-outline hover:text-on-surface transition-colors border border-white/5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Cmd + K</span>
            </button>

            {currentUser ? (
              <button
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-sm shadow-md hover:brightness-110 active:scale-95 transition-all"
              >
                <span>Launch Console</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => openAuthModal('login')}
                  className="text-sm font-medium text-on-surface-variant hover:text-on-surface px-3 py-1.5 transition-colors"
                >
                  Log In
                </button>
                <button
                  onClick={() => openAuthModal('signup')}
                  className="bg-primary text-on-primary text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:bg-primary-container hover:text-on-primary-container shadow-[0_4px_16px_rgba(76,215,246,0.15)]"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface/90 backdrop-blur-xl border-b border-white/5 z-40 flex items-center justify-between px-4 sm:px-8">
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-3 lg:hidden cursor-pointer" onClick={() => setActiveTab('landing')}>
          <img alt="RE:COVER Logo" className="h-6 w-auto object-contain" src="/logo.svg" />
          <span className="font-headline font-bold text-sm uppercase text-on-surface">RE:COVER</span>
        </div>

        <button
          onClick={openCommandPalette}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs text-outline hover:text-on-surface transition-colors border border-white/5"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Quick Search or Jump...</span>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-container-highest text-[10px] text-on-surface-variant font-mono">⌘K</kbd>
        </button>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        {/* Real-time Immune Status Badge */}
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-medium ${getStatusColor()}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
          </span>
          <span className="tracking-wider">STATUS: {systemStatus}</span>
        </div>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsNotifOpen(prev => !prev)}
            className="relative text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-lg hover:bg-surface-container-high"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {activeIncidents.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-error text-on-error font-mono text-[9px] font-bold flex items-center justify-center rounded-full">
                {activeIncidents.length}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-surface-container border border-white/10 shadow-2xl p-4 z-50">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <span className="font-headline font-semibold text-sm text-on-surface">Active Security Alerts</span>
                <span className="text-xs text-primary font-mono">{activeIncidents.length} active</span>
              </div>
              <div className="divide-y divide-white/5 max-h-72 overflow-y-auto mt-2">
                {activeIncidents.length === 0 ? (
                  <div className="py-6 text-center text-xs text-outline">
                    <CheckCircle2 className="w-8 h-8 text-secondary mx-auto mb-2 opacity-80" />
                    All systems nominal. No active threats detected.
                  </div>
                ) : (
                  activeIncidents.map(inc => (
                    <div
                      key={inc.id}
                      onClick={() => {
                        setSelectedIncidentId(inc.id);
                        setActiveTab('investigation');
                        setIsNotifOpen(false);
                      }}
                      className="py-3 px-2 hover:bg-surface-container-high rounded-lg cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-medium text-error flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {inc.refCode}
                        </span>
                        <span className="text-[10px] text-outline">{inc.timestamp}</span>
                      </div>
                      <p className="text-xs text-on-surface mt-1 line-clamp-1">{inc.title}</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">{inc.targetResource}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setIsProfileOpen(prev => !prev)}
            className="flex items-center gap-3 pl-3 border-l border-surface-container-high hover:opacity-90 transition-opacity"
          >
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs text-on-surface font-medium leading-none">{currentUser?.name || 'Alex Vance'}</span>
              <span className="text-[10px] font-mono text-primary leading-none mt-1">{currentUser?.tier || 'Security Tier 1'}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-xs">
              {currentUser?.name ? currentUser.name.charAt(0) : 'A'}
            </div>
            <ChevronDown className="w-3 h-3 text-outline hidden sm:block" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-surface-container border border-white/10 shadow-2xl p-2 z-50">
              <div className="px-3 py-2 border-b border-white/5 mb-1">
                <p className="text-xs font-semibold text-on-surface">{currentUser?.name || 'Alex Vance'}</p>
                <p className="text-[11px] text-outline truncate">{currentUser?.email || 'alex@enterprise.io'}</p>
              </div>
              <button
                onClick={() => {
                  setActiveTab('accounts');
                  setIsProfileOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-surface-container-high rounded-lg transition-colors flex items-center gap-2"
              >
                <User className="w-3.5 h-3.5 text-primary" />
                Manage Identity Fabrics
              </button>
              <button
                onClick={() => {
                  logout();
                  setIsProfileOpen(false);
                  setActiveTab('landing');
                }}
                className="w-full text-left px-3 py-2 text-xs text-error hover:bg-error-container/20 rounded-lg transition-colors flex items-center gap-2 mt-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

