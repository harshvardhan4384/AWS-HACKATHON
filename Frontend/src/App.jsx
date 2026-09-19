import React from 'react';
import { SecurityProvider, useSecurity } from './context/SecurityContext';
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

const AppContent = () => {
  const { activeTab } = useSecurity();

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
      default:
        return <OverviewDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      <Sidebar />
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header isLanding={false} />
        <main className="flex-1 pt-20 p-4 sm:p-8 bg-surface">
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
      <AppContent />
      <CommandPalette />
      <ToastContainer />
      <AuthModal />
      <ConnectModal />
    </SecurityProvider>
  );
}

