import React from 'react';
import { SecurityProvider, useSecurity } from './context/SecurityContext';
import { NotificationProvider } from './context/NotificationContext';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { CommandPalette } from './components/common/CommandPalette';
import { ToastContainer } from './components/common/ToastContainer';
import { AuthModal } from './components/common/AuthModal';
import { ConnectModal } from './components/common/ConnectModal';

// Pages
import { LandingPage } from './pages/LandingPage';
import { OverviewDashboard } from './pages/OverviewDashboard';
import { IncidentsHub } from './pages/IncidentsHub';
import { AiInvestigationPage } from './pages/AiInvestigationPage';
import { AttackGraphPage } from './pages/AttackGraphPage';
import { RecoveryCenterPage } from './pages/RecoveryCenterPage';
import { TelemetryStreamPage } from './pages/TelemetryStreamPage';
import { ConnectedAccountsPage } from './pages/ConnectedAccountsPage';
import { SimulationPrototypePage } from './pages/SimulationPrototypePage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';

const AppContent = () => {
  const { activeTab, isAuthLoading } = useSecurity();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-on-surface">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center animate-pulse mb-4">
          <img alt="RE:COVER Logo" className="h-6 w-auto object-contain" src="/logo.svg" />
        </div>
        <p className="font-mono text-xs text-primary tracking-wider uppercase animate-pulse">
          Authenticating Digital Immune Fabric...
        </p>
      </div>
    );
  }

  if (activeTab === 'landing') {
    return <LandingPage />;
  }

  const renderActivePage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <OverviewDashboard />;
      case 'incidents':
        return <IncidentsHub />;
      case 'investigation':
        return <AiInvestigationPage />;
      case 'blast-radius':
        return <AttackGraphPage />;
      case 'recovery':
        return <RecoveryCenterPage />;
      case 'telemetry':
        return <TelemetryStreamPage />;
      case 'accounts':
        return <ConnectedAccountsPage />;
      case 'prototype':
        return <SimulationPrototypePage />;
      case 'profile':
        return <ProfileSettingsPage />;
      default:
        return <OverviewDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      <Sidebar />
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header isLanding={false} />
        <main className="flex-1 pt-20 sm:pt-24 px-4 sm:px-8 pb-8 bg-surface">
          <div className="max-w-7xl mx-auto w-full">
            {renderActivePage()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <SecurityProvider>
      <NotificationProvider>
        <AppContent />
        <CommandPalette />
        <ToastContainer />
        <AuthModal />
        <ConnectModal />
      </NotificationProvider>
    </SecurityProvider>
  );
}

