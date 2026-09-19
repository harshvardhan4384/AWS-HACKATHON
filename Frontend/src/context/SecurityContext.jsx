import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  INITIAL_INCIDENTS,
  INITIAL_ATTACK_NODES,
  INITIAL_ATTACK_EDGES,
  INITIAL_TELEMETRY_LOGS,
  INITIAL_CONNECTED_ACCOUNTS,
  INITIAL_RECOVERY_PLAYBOOKS
} from '../data/mockData';
import confetti from 'canvas-confetti';

const SecurityContext = createContext(undefined);

export const SecurityProvider = ({ children }) => {
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);
  const [selectedIncidentId, setSelectedIncidentId] = useState('inc-1');
  const [attackNodes, setAttackNodes] = useState(INITIAL_ATTACK_NODES);
  const [attackEdges, setAttackEdges] = useState(INITIAL_ATTACK_EDGES);
  const [telemetryLogs, setTelemetryLogs] = useState(INITIAL_TELEMETRY_LOGS);
  const [connectedAccounts, setConnectedAccounts] = useState(INITIAL_CONNECTED_ACCOUNTS);
  const [playbooks, setPlaybooks] = useState(INITIAL_RECOVERY_PLAYBOOKS);
  const [toasts, setToasts] = useState([]);
  const [isSimulating, setIsSimulating] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [activeTab, setActiveTab] = useState('landing');
  const [currentUser, setCurrentUser] = useState({
    name: 'Alex Vance',
    email: 'alex.vance@enterprise.io',
    role: 'Lead SecOps Engineer',
    tier: 'Security Tier 1'
  });

  // Dynamic system status
  const criticalCount = incidents.filter(i => i.severity === 'critical' && i.status !== 'resolved' && i.status !== 'contained').length;
  const highCount = incidents.filter(i => i.severity === 'high' && i.status !== 'resolved' && i.status !== 'contained').length;
  const isRecovering = playbooks.some(p => p.status === 'in_progress');

  let systemStatus = 'PROTECTED';
  if (isRecovering) systemStatus = 'RECOVERING';
  else if (criticalCount > 0) systemStatus = 'CRITICAL';
  else if (highCount > 0) systemStatus = 'ELEVATED';

  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  // Toast manager
  const addToast = (type, title, message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setToasts(prev => [...prev, { id, type, title, message, timestamp: Date.now() }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Keyboard shortcut listener for Command Palette (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsConnectModalOpen(false);
        setIsAuthModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Live Telemetry Simulation Engine
  useEffect(() => {
    if (!isSimulating) return;

    const intervalTime = Math.max(1200 / simulationSpeed, 400);

    const logGenerators = [
      () => ({
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString().substring(11, 23),
        level: 'INFO',
        service: 'AWS CloudTrail',
        eventType: 'kms:Decrypt',
        actor: 'ecs-payment-worker',
        sourceIp: `10.0.${Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 255)}`,
        target: 'arn:aws:kms:us-east-1:key/prod-enc-01',
        status: 'ALLOW',
        payload: { keyId: 'key-8891-vault', callerArn: 'arn:aws:iam::ecs-task' }
      }),
      () => ({
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString().substring(11, 23),
        level: 'INFO',
        service: 'GitHub Audit',
        eventType: 'git.fetch',
        actor: 'ci-runner-cluster',
        sourceIp: '192.30.252.1',
        target: 'enterprise/frontend-app',
        status: 'ALLOW',
        payload: { ref: 'refs/heads/main', protocol: 'ssh' }
      }),
      () => ({
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString().substring(11, 23),
        level: 'WARN',
        service: 'Okta System Log',
        eventType: 'policy.evaluate_sign_on',
        actor: 'dev.marcus@enterprise.io',
        sourceIp: `185.12.${Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 255)}`,
        target: 'sso.enterprise.io',
        status: 'ANOMALY',
        payload: { riskScore: 48, reason: 'New IP ASN detected' }
      }),
      () => ({
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString().substring(11, 23),
        level: 'INFO',
        service: 'Google Workspace',
        eventType: 'admin.user_login',
        actor: 'sarah.connor@enterprise.io',
        sourceIp: '172.56.21.90',
        target: 'accounts.google.com',
        status: 'ALLOW',
        payload: { mfaType: 'FIDO2_Passkey', success: true }
      })
    ];

    const timer = setInterval(() => {
      const generator = logGenerators[Math.floor(Math.random() * logGenerators.length)];
      const newLog = generator();
      setTelemetryLogs(prev => [newLog, ...prev.slice(0, 49)]);
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isSimulating, simulationSpeed]);

  // Actions
  const updateIncidentStatus = (id, status) => {
    setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, status } : inc));
    addToast('info', 'Incident Updated', `Incident #${id} status changed to ${status.toUpperCase()}`);
  };

  const containIncident = (id) => {
    setIncidents(prev => prev.map(inc => {
      if (inc.id === id) {
        return { ...inc, status: 'contained' };
      }
      return inc;
    }));

    // Update nodes
    setAttackNodes(prev => prev.map(node => {
      if (node.status === 'compromised' || node.status === 'warning') {
        return { ...node, status: 'contained' };
      }
      return node;
    }));

    addToast('success', 'Autonomous Containment Engaged', `All blast radius pathways for incident #${id} have been severed.`);
  };

  const revokeCredential = (nodeId) => {
    setAttackNodes(prev => prev.map(node => {
      if (node.id === nodeId) {
        return { ...node, status: 'contained', sublabel: 'REVOKED / EXPIRED' };
      }
      return node;
    }));
    addToast('success', 'Credential Revoked', `Target credential "${nodeId}" has been revoked in identity provider.`);
  };

  const quarantineNode = (nodeId) => {
    setAttackNodes(prev => prev.map(node => {
      if (node.id === nodeId) {
        return { ...node, status: 'contained', sublabel: 'QUARANTINED BY SENTINEL' };
      }
      return node;
    }));
    addToast('warning', 'Node Quarantined', `Entity "${nodeId}" isolated from all internal routing.`);
  };

  const approvePlaybook = async (playbookId) => {
    const playbook = playbooks.find(p => p.id === playbookId);
    if (!playbook) return;

    addToast('info', 'Playbook Authorized', `Executing 1-Click Autonomous Rollback for ${playbook.incidentRef}...`);

    // Set status to in_progress
    setPlaybooks(prev => prev.map(p => p.id === playbookId ? { ...p, status: 'in_progress' } : p));

    // Progress through steps
    for (let i = 0; i < playbook.steps.length; i++) {
      const step = playbook.steps[i];
      
      // Update step to executing
      setPlaybooks(prev => prev.map(p => {
        if (p.id === playbookId) {
          const updatedSteps = [...p.steps];
          updatedSteps[i] = { ...step, status: 'executing' };
          return {
            ...p,
            steps: updatedSteps,
            executionLogs: [...p.executionLogs, `[EXECUTING] Step ${i + 1}: ${step.name}...`]
          };
        }
        return p;
      }));

      // Simulate step latency
      await new Promise(res => setTimeout(res, 800));

      // Mark step completed
      setPlaybooks(prev => prev.map(p => {
        if (p.id === playbookId) {
          const updatedSteps = [...p.steps];
          updatedSteps[i] = {
            ...step,
            status: 'completed',
            executionTime: '0.5s',
            output: `Successfully applied: ${step.action}`
          };
          return {
            ...p,
            steps: updatedSteps,
            executionLogs: [...p.executionLogs, `[SUCCESS] Step ${i + 1} finalized: 0 errors.`]
          };
        }
        return p;
      }));
    }

    // Mark playbook completed and resolve incident
    setPlaybooks(prev => prev.map(p => {
      if (p.id === playbookId) {
        return {
          ...p,
          status: 'completed',
          executionLogs: [...p.executionLogs, `[ROLLBACK COMPLETE] Identity fabric restored to clean state.`]
        };
      }
      return p;
    }));

    // Resolve matching incident
    setIncidents(prev => prev.map(inc => {
      if (inc.refCode === playbook.incidentRef || inc.rollbackPlanId === playbookId) {
        return { ...inc, status: 'resolved' };
      }
      return inc;
    }));

    // Update topology
    setAttackNodes(prev => prev.map(n => ({ ...n, status: 'safe' })));

    // Trigger celebration confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#06b6d4', '#10b981', '#3b82f6']
      });
    } catch (e) {
      // safe fallback
    }

    addToast('success', 'Recovery Finished', `All rollback steps executed successfully. System state is nominal.`);
  };

  const rejectPlaybook = (playbookId) => {
    setPlaybooks(prev => prev.map(p => p.id === playbookId ? { ...p, status: 'rejected' } : p));
    addToast('warning', 'Playbook Rejected', 'Manual intervention flagged. No automated modifications were applied.');
  };

  const connectAccount = (accountData) => {
    const newAccount = {
      id: `acc-${Date.now()}`,
      name: accountData.name || 'New Cloud Connector',
      type: accountData.type || 'aws',
      accountNumber: accountData.accountNumber || 'tenant-id-synced',
      status: 'connected',
      identitiesCount: accountData.identitiesCount || Math.floor(Math.random() * 400) + 50,
      resourcesCount: accountData.resourcesCount || Math.floor(Math.random() * 800) + 120,
      lastSync: 'Just now',
      healthScore: 98,
      tokenExpiry: 'Active OAuth Sync',
      securityControls: {
        mfaEnforced: true,
        leastPrivilege: true,
        anomalyShield: true,
        autoRollback: true
      }
    };
    setConnectedAccounts(prev => [...prev, newAccount]);
    addToast('success', 'Provider Connected', `Successfully enrolled "${newAccount.name}" into Digital Immune Fabric.`);
  };

  const disconnectAccount = (id) => {
    setConnectedAccounts(prev => prev.filter(a => a.id !== id));
    addToast('info', 'Account Disconnected', `Provider removed from telemetry monitoring.`);
  };

  const resyncAccount = (id) => {
    setConnectedAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'syncing' } : a));
    addToast('info', 'Sync Started', `Re-evaluating identity permissions and certificates...`);
    setTimeout(() => {
      setConnectedAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'connected', lastSync: 'Just now', healthScore: 99 } : a));
      addToast('success', 'Sync Complete', `Identity fabric verified with 0 permission leaks.`);
    }, 1500);
  };

  const triggerScenario = (scenarioId) => {
    if (scenarioId === 'pat-leak') {
      const newInc = {
        id: `inc-sim-${Date.now()}`,
        refCode: `INC-${Math.floor(Math.random() * 9000 + 1000)}-SIM`,
        title: 'SIMULATED: Stolen GitHub PAT & AWS Secrets Exfiltration',
        severity: 'critical',
        status: 'investigating',
        provider: 'aws',
        timestamp: 'Just now',
        actor: {
          ip: '185.220.101.44',
          location: 'Reykjavik, IS',
          userAgent: 'cURL/8.4.0',
          fingerprint: 'fp_sim_c2'
        },
        targetResource: 'arn:aws:secretsmanager:us-east-1:secret:prod/db_credentials',
        mitreTactic: 'TA0006 Credential Access',
        mitreTechnique: 'T1552 Unsecured Credentials',
        aiConfidence: 99.1,
        summary: 'Synthetic attack injected: PAT used to scrape production database credentials. RE:COVER auto-isolated the token.',
        blastRadiusCount: 4,
        rawPayload: { simulated: true, attackVector: 'PAT_LEAK' },
        evidenceChain: [
          { time: 'Just now', event: 'GitHub PAT used from new IP', severity: 'high', detail: 'Token used outside configured CI runner CIDR' },
          { time: 'Just now', event: 'SecretsManager:GetSecretValue triggered', severity: 'critical', detail: 'Rate exceeded baseline threshold' }
        ]
      };
      setIncidents(prev => [newInc, ...prev]);
      setSelectedIncidentId(newInc.id);
      addToast('warning', 'Simulation Triggered', 'New CRITICAL incident injected into triage queue!');
    } else if (scenarioId === 'okta-spray') {
      const newInc = {
        id: `inc-sim-${Date.now()}`,
        refCode: `INC-${Math.floor(Math.random() * 9000 + 1000)}-OKTA`,
        title: 'SIMULATED: Multi-Geo Okta Password Spray',
        severity: 'high',
        status: 'investigating',
        provider: 'okta',
        timestamp: 'Just now',
        actor: {
          ip: '91.240.118.12',
          location: 'Kyiv, UA',
          userAgent: 'Python/Requests',
          fingerprint: 'fp_sim_spray'
        },
        targetResource: 'okta:directory:all_users',
        mitreTactic: 'TA0006 Credential Access',
        mitreTechnique: 'T1110.003 Password Spraying',
        aiConfidence: 96.7,
        summary: 'Simulated 500 auth requests across 80 users within 30 seconds.',
        blastRadiusCount: 3,
        rawPayload: { simulated: true, sprayCount: 500 },
        evidenceChain: [
          { time: 'Just now', event: 'Coordinated login attempts', severity: 'high', detail: 'IP origin blacklisted by ThreatNet' }
        ]
      };
      setIncidents(prev => [newInc, ...prev]);
      setSelectedIncidentId(newInc.id);
      addToast('warning', 'Simulation Triggered', 'Okta Credential Spray incident created.');
    }
  };

  const toggleSimulation = () => {
    setIsSimulating(prev => !prev);
    addToast('info', 'Simulation Status', isSimulating ? 'Live telemetry paused.' : 'Live telemetry resumed.');
  };

  const clearAllTelemetry = () => {
    setTelemetryLogs([]);
    addToast('info', 'Logs Cleared', 'Active telemetry feed cleared.');
  };

  const openCommandPalette = () => setIsCommandPaletteOpen(true);
  const closeCommandPalette = () => setIsCommandPaletteOpen(false);
  const openConnectModal = () => setIsConnectModalOpen(true);
  const closeConnectModal = () => setIsConnectModalOpen(false);
  const openAuthModal = (mode = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const login = (email, name = 'Alex Vance') => {
    setCurrentUser({
      name,
      email,
      role: 'Lead SecOps Engineer',
      tier: 'Security Tier 1'
    });
    closeAuthModal();
    addToast('success', 'Logged In', `Welcome back, ${name}`);
  };

  const logout = () => {
    setCurrentUser(null);
    addToast('info', 'Logged Out', 'You have been logged out of the console.');
  };

  return (
    <SecurityContext.Provider
      value={{
        incidents,
        selectedIncidentId,
        setSelectedIncidentId,
        selectedIncident,
        attackNodes,
        attackEdges,
        telemetryLogs,
        connectedAccounts,
        playbooks,
        toasts,
        systemStatus,
        isSimulating,
        simulationSpeed,
        isCommandPaletteOpen,
        isConnectModalOpen,
        isAuthModalOpen,
        authModalMode,
        currentUser,
        activeTab,
        setActiveTab,

        addToast,
        removeToast,
        updateIncidentStatus,
        containIncident,
        revokeCredential,
        quarantineNode,
        approvePlaybook,
        rejectPlaybook,
        connectAccount,
        disconnectAccount,
        resyncAccount,
        triggerScenario,
        toggleSimulation,
        setSimulationSpeed,
        clearAllTelemetry,
        openCommandPalette,
        closeCommandPalette,
        openConnectModal,
        closeConnectModal,
        openAuthModal,
        closeAuthModal,
        login,
        logout
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};

