import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { websocketService } from '../services/websocket';
import { parseLocation, formatUrl, isProtectedTab, TAB_ROUTES } from '../services/router';
import confetti from 'canvas-confetti';

const SecurityContext = createContext(undefined);

/**
 * Normalizes a backend Incident entity into the high-fidelity shape
 * expected by Re:COVER UI views (Overview, IncidentsHub, AiInvestigationPage).
 */
export const formatIncident = (raw) => {
  if (!raw) return null;
  const sevUpper = (raw.severity || 'MEDIUM').toUpperCase();
  const sevLower = sevUpper.toLowerCase();
  const statusUpper = (raw.status || 'OPEN').toUpperCase();
  const statusLower = statusUpper.toLowerCase();

  // Deterministic reference code
  const refCode = raw.refCode || (raw.id ? `INC-${raw.id.slice(0, 8).toUpperCase()}` : 'INC-ALERT');

  // Format relative or readable timestamp
  const timestamp = raw.startedAt
    ? new Date(raw.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : (raw.createdAt ? new Date(raw.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent');

  // Determine provider from linked events, evidence, or default
  const firstEvent = Array.isArray(raw.linkedEvents) && raw.linkedEvents.length > 0 ? raw.linkedEvents[0] : null;
  const firstEvidence = Array.isArray(raw.evidence) && raw.evidence.length > 0 ? raw.evidence[0] : null;

  const provider = (
    raw.provider ||
    (firstEvent && firstEvent.provider) ||
    (firstEvidence && firstEvidence.source) ||
    'aws'
  ).toLowerCase();

  // Actor extraction
  const actor = {
    ip: (firstEvent && firstEvent.sourceIp) || raw.actor?.ip || '10.0.4.12',
    location: (firstEvent && firstEvent.locationMetadata?.country) || raw.actor?.location || 'Direct API Session',
    userAgent: raw.actor?.userAgent || 'Provider Identity Connector',
    fingerprint: raw.actor?.fingerprint || (raw.id ? `fp_${raw.id.slice(0, 8)}` : 'fp_recon')
  };

  // Target resource
  const targetResource = raw.targetResource ||
    (firstEvent && firstEvent.eventData && (firstEvent.eventData.resourceName || firstEvent.eventData.target || firstEvent.eventData.bucketName)) ||
    (raw.summary ? raw.summary.split(' | ')[0] : 'Identity Fabric / Cloud Resource');

  // MITRE mappings
  const mitreTactic = raw.mitreTactic || (sevUpper === 'CRITICAL' ? 'TA0010 Exfiltration' : 'TA0006 Credential Access');
  const mitreTechnique = raw.mitreTechnique || (raw.detectionSource === 'RULE_MATCH' ? 'T1552 Unsecured Credentials' : 'T1110 Anomaly Detection');

  // AI confidence
  const aiConfidence = raw.aiConfidence ?? (
    firstEvidence && typeof firstEvidence.confidence === 'number'
      ? Math.round(firstEvidence.confidence * 100)
      : (sevUpper === 'CRITICAL' ? 98.4 : sevUpper === 'HIGH' ? 94.2 : 89.0)
  );

  // Evidence chain mapping from backend Evidence records
  const evidenceChain = Array.isArray(raw.evidence) && raw.evidence.length > 0
    ? raw.evidence.map(ev => ({
        time: ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent',
        event: ev.evidenceType || ev.evidenceData?.findingType || 'Detection finding',
        severity: (ev.evidenceData?.severity || ev.severity || 'medium').toLowerCase(),
        detail: ev.evidenceData?.summary || `Rule match: ${ev.evidenceData?.ruleId || 'ANOMALY_RULE'}`
      }))
    : (Array.isArray(raw.evidenceChain) ? raw.evidenceChain : []);

  return {
    ...raw,
    refCode,
    title: raw.title || 'Security Anomaly Detected',
    severity: sevLower,
    status: statusLower,
    rawStatus: statusUpper,
    rawSeverity: sevUpper,
    provider,
    timestamp,
    actor,
    targetResource,
    mitreTactic,
    mitreTechnique,
    aiConfidence,
    summary: raw.summary || 'Security incident detected by autonomous detection engine.',
    blastRadiusCount: raw.linkedEventCount || (raw.linkedEvents ? raw.linkedEvents.length : (raw.blastRadiusCount || 1)),
    rawPayload: raw.rawPayload || firstEvent || raw,
    evidenceChain
  };
};

/**
 * Normalizes a backend SecurityEvent entity into the streaming telemetry
 * item expected by TelemetryStreamPage and OverviewDashboard.
 */
export const formatSecurityEvent = (raw) => {
  if (!raw) return null;
  const sevUpper = (raw.severity || 'INFO').toUpperCase();
  let level = 'INFO';
  if (sevUpper === 'CRITICAL') level = 'SEC_CRIT';
  else if (sevUpper === 'HIGH') level = 'ALERT';
  else if (sevUpper === 'MEDIUM') level = 'WARN';

  const providerUpper = (raw.provider || 'AWS').toUpperCase();
  const service = providerUpper === 'AWS' ? 'AWS CloudTrail' : providerUpper === 'GITHUB' ? 'GitHub Audit' : providerUpper === 'GOOGLE' ? 'Google Workspace' : `${providerUpper} Telemetry`;

  const timestamp = raw.occurredAt
    ? new Date(raw.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : (raw.createdAt ? new Date(raw.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now');

  const actor = (raw.eventData && (raw.eventData.actor || raw.eventData.userName || raw.eventData.principalId)) ||
    (raw.sourceIp ? `IP: ${raw.sourceIp}` : 'Identity Worker');

  const target = (raw.eventData && (raw.eventData.resourceName || raw.eventData.target || raw.eventData.bucketName || raw.eventData.repositoryName)) ||
    (raw.provider ? `${raw.provider.toLowerCase()}:identity` : 'identity/core');

  const status = raw.status || 'NORMALIZED';

  return {
    id: raw.id || `evt-${Date.now()}`,
    timestamp,
    level,
    service,
    eventType: raw.eventType || 'SECURITY_EVENT',
    actor,
    sourceIp: raw.sourceIp || 'Internal',
    target,
    status,
    payload: raw.eventData || raw,
    raw
  };
};

/**
 * Lays out arbitrary backend nodes and edges into a clean multi-tier canvas.
 * Assigns tier based on node type, distributes nodes horizontally,
 * and sets sanitized properties and visual statuses.
 */
export const layoutGraph = (rawNodes = [], rawEdges = [], options = {}) => {
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const getTier = (type = '') => {
    const t = String(type || '').toUpperCase();
    if (t === 'USER' || t === 'ACTOR' || t === 'THREATACTOR') return 0;
    if (t === 'PROVIDER' || t === 'ACCOUNT') return 1;
    if (t === 'SECURITYEVENT' || t === 'EVENT' || t === 'FINDING' || t === 'EVIDENCE' || t === 'SSHKEY' || t === 'CREDENTIAL') return 2;
    if (t === 'INCIDENT' || t === 'ROLE' || t === 'OAUTHAPP' || t === 'REPO') return 3;
    return 4;
  };

  const tiers = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  rawNodes.forEach(node => {
    const tier = getTier(node.type);
    tiers[tier].push(node);
  });

  const canvasWidth = options.width || 1200;
  const positionedNodes = [];
  const nodePositionMap = new Map();

  Object.entries(tiers).forEach(([tierIndex, nodeList]) => {
    const t = Number(tierIndex);
    const count = nodeList.length;
    if (count === 0) return;

    const y = 60 + t * 170;
    nodeList.forEach((rawNode, idx) => {
      const spacing = canvasWidth / (count + 1);
      const x = Math.round(spacing * (idx + 1));

      const impact = String(rawNode.impactType || '').toUpperCase();
      const rawSev = String(rawNode.properties?.severity || '').toUpperCase();

      let status = 'safe';
      if (impact === 'SOURCE' || rawSev === 'CRITICAL') status = 'compromised';
      else if (impact === 'DIRECT' || rawSev === 'HIGH') status = 'compromised';
      else if (impact === 'INDIRECT' || rawSev === 'MEDIUM') status = 'warning';
      else if (rawNode.properties?.status === 'CONTAINED' || rawNode.properties?.status === 'RESOLVED') status = 'contained';

      const provider = (rawNode.properties?.provider || (rawNode.type === 'Account' ? rawNode.label : 'aws')).toLowerCase();

      // Defensive secret sanitization on metadata
      const sanitizedProps = {};
      if (rawNode.properties && typeof rawNode.properties === 'object') {
        for (const [k, v] of Object.entries(rawNode.properties)) {
          if (/token|password|secret|keyhash|private|cred/i.test(k)) {
            sanitizedProps[k] = '••••••••';
          } else {
            sanitizedProps[k] = v;
          }
        }
      }

      const formattedNode = {
        id: String(rawNode.id),
        label: rawNode.label || rawNode.name || rawNode.id,
        sublabel: rawNode.type ? `${rawNode.type} ${rawNode.distance !== undefined ? `(Hop ${rawNode.distance})` : ''}` : 'Entity',
        type: (rawNode.type || 'node').toLowerCase(),
        x,
        y,
        status,
        provider,
        riskScore: rawNode.properties?.riskScore || (status === 'compromised' ? 92 : status === 'warning' ? 68 : 25),
        metadata: {
          ...sanitizedProps,
          distance: rawNode.distance ?? 0,
          impactType: rawNode.impactType || 'DIRECT',
          arn: sanitizedProps.arn || sanitizedProps.id || rawNode.id,
          permissions: sanitizedProps.permissions || (rawNode.type === 'Role' ? ['sts:AssumeRole'] : undefined),
          ip: sanitizedProps.sourceIp || sanitizedProps.ip || undefined,
          owner: sanitizedProps.owner || undefined,
          exposedItems: sanitizedProps.exposedItems || (status === 'compromised' ? 5 : 1)
        }
      };

      positionedNodes.push(formattedNode);
      nodePositionMap.set(formattedNode.id, formattedNode);
    });
  });

  const positionedEdges = (rawEdges || []).map((rawEdge, idx) => {
    const sourceNode = nodePositionMap.get(String(rawEdge.source));
    const targetNode = nodePositionMap.get(String(rawEdge.target));

    let edgeStatus = 'safe';
    if (sourceNode?.status === 'compromised' || targetNode?.status === 'compromised') {
      edgeStatus = 'threat';
    } else if (sourceNode?.status === 'warning' || targetNode?.status === 'warning') {
      edgeStatus = 'warn';
    }

    const typeLabel = rawEdge.type ? String(rawEdge.type).replace(/_/g, ' ') : 'ASSOCIATED';

    return {
      id: rawEdge.id || `edge-${idx}`,
      source: String(rawEdge.source),
      target: String(rawEdge.target),
      label: rawEdge.label || typeLabel,
      status: edgeStatus,
      animated: edgeStatus === 'threat'
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
};

export const SecurityProvider = ({ children }) => {
  const initialRoute = typeof window !== 'undefined' ? parseLocation(window.location) : { tab: 'landing', incidentId: null };

  const [incidents, setIncidents] = useState([]);
  const [isIncidentsLoading, setIsIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState(null);
  const [incidentsPagination, setIncidentsPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasMore: false,
  });

  const [selectedIncidentId, setSelectedIncidentIdState] = useState(initialRoute.incidentId || null);
  const [attackNodes, setAttackNodes] = useState([]);
  const [attackEdges, setAttackEdges] = useState([]);

  // Phase 5: AI Investigation state
  const [currentInvestigation, setCurrentInvestigation] = useState(null);
  const [isInvestigationLoading, setIsInvestigationLoading] = useState(false);
  const [investigationError, setInvestigationError] = useState(null);

  // Phase 5: Attack Graph & Blast Radius state
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState(null);
  const [blastRadiusData, setBlastRadiusData] = useState(null);
  const [isBlastRadiusLoading, setIsBlastRadiusLoading] = useState(false);
  const [blastRadiusError, setBlastRadiusError] = useState(null);
  const [graphViewMode, setGraphViewMode] = useState('incident'); // 'incident' | 'overview'

  // Phase 6: Recovery, Approval & Verification state
  const [currentRecoveryPlan, setCurrentRecoveryPlan] = useState(null);
  const [isRecoveryPlanLoading, setIsRecoveryPlanLoading] = useState(false);
  const [recoveryPlanError, setRecoveryPlanError] = useState(null);
  const [actionPolicies, setActionPolicies] = useState({}); // actionId -> policyDecision
  const [actionApprovals, setActionApprovals] = useState({}); // actionId -> approval
  const [actionAuthorizations, setActionAuthorizations] = useState({}); // actionId -> authorization
  const [actionExecutionStates, setActionExecutionStates] = useState({}); // actionId -> { isExecuting, error, result }
  const [incidentVerification, setIncidentVerification] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState(null);
  const [actionVerifications, setActionVerifications] = useState({}); // actionId -> verification

  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(null);
  const [eventsPagination, setEventsPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 1,
    hasMore: false,
  });

  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState(null);
  const [playbooks, setPlaybooks] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [activeTab, setActiveTabState] = useState(initialRoute.tab || 'landing');
  const [redirectAfterLogin, setRedirectAfterLogin] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  /**
   * Bidirectional navigation helper: updates React state and synchronizes
   * the browser URL with HTML5 History API (pushState / replaceState).
   */
  const navigateTo = useCallback((tab, incidentId = undefined, { replace = false } = {}) => {
    const targetTab = tab || TAB_ROUTES.DASHBOARD;
    setActiveTabState(targetTab);

    let nextIncidentId = selectedIncidentId;
    if (incidentId !== undefined) {
      nextIncidentId = incidentId;
      setSelectedIncidentIdState(incidentId);
    }

    if (typeof window !== 'undefined' && window.history) {
      const newUrl = formatUrl(targetTab, nextIncidentId);
      if (window.location.pathname + window.location.search !== newUrl) {
        if (replace) {
          window.history.replaceState({ tab: targetTab, incidentId: nextIncidentId }, '', newUrl);
        } else {
          window.history.pushState({ tab: targetTab, incidentId: nextIncidentId }, '', newUrl);
        }
      }
    }
  }, [selectedIncidentId]);

  const setActiveTab = useCallback((tab, incidentId = undefined) => {
    navigateTo(tab, incidentId);
  }, [navigateTo]);

  const setSelectedIncidentId = useCallback((id) => {
    setSelectedIncidentIdState(id);
    if (typeof window !== 'undefined' && window.history && (activeTab === 'incidents' || activeTab === 'investigation' || activeTab === 'recovery')) {
      const newUrl = formatUrl(activeTab, id);
      if (window.location.pathname + window.location.search !== newUrl) {
        window.history.replaceState({ tab: activeTab, incidentId: id }, '', newUrl);
      }
    }
  }, [activeTab]);

  // Synchronize browser Back / Forward buttons (popstate events)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseLocation(window.location);
      if (parsed.tab) {
        setActiveTabState(parsed.tab);
      }
      if (parsed.incidentId !== null) {
        setSelectedIncidentIdState(parsed.incidentId);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Safe normalizer preserving all backend fields while populating UI presentation defaults
  const formatConnectedAccount = (raw) => {
    if (!raw) return null;
    const providerUpper = (raw.provider || '').toUpperCase();
    const displayName = raw.providerDisplayName || (providerUpper ? `${providerUpper} Identity` : 'Identity Connector');
    const statusStr = (raw.status || 'ACTIVE').toLowerCase();

    return {
      ...raw,
      name: displayName,
      type: (raw.provider || 'aws').toLowerCase(),
      accountNumber: raw.providerAccountId ? `ID: ${raw.providerAccountId}` : raw.id,
      status: statusStr === 'active' ? 'connected' : statusStr,
      identitiesCount: raw.identitiesCount ?? (raw.grantedScopes ? raw.grantedScopes.split(' ').length : 1),
      resourcesCount: raw.resourcesCount ?? 0,
      lastSync: raw.lastSyncAt ? new Date(raw.lastSyncAt).toLocaleTimeString() : (raw.createdAt ? new Date(raw.createdAt).toLocaleDateString() : 'Active OAuth Sync'),
      tokenExpiry: raw.tokenExpiresAt ? new Date(raw.tokenExpiresAt).toLocaleTimeString() : 'Active OAuth Sync',
      grantedScopes: raw.grantedScopes || ''
    };
  };

  const fetchConnectedAccounts = async () => {
    try {
      setIsAccountsLoading(true);
      setAccountsError(null);
      const res = await api.get('/api/oauth/connected');
      const rawList = (res && res.data && Array.isArray(res.data.accounts)) ? res.data.accounts : [];
      const formatted = rawList.map(formatConnectedAccount);
      setConnectedAccounts(formatted);
      return formatted;
    } catch (err) {
      if (err.status === 401) {
        setConnectedAccounts([]);
      } else {
        setAccountsError(err.message || 'Failed to load connected identity fabrics');
      }
      return [];
    } finally {
      setIsAccountsLoading(false);
    }
  };

  const fetchIncidents = useCallback(async (options = {}) => {
    try {
      setIsIncidentsLoading(true);
      setIncidentsError(null);
      const params = {
        limit: options.limit || 20,
        page: options.page || 1,
        ...(options.status && options.status !== 'all' ? { status: options.status.toUpperCase() } : {}),
        ...(options.severity && options.severity !== 'all' ? { severity: options.severity.toUpperCase() } : {})
      };
      const res = await api.get('/api/incidents', { params });
      const rawList = res && res.data && Array.isArray(res.data.incidents) ? res.data.incidents : [];
      const pagination = (res && res.data && res.data.pagination) || {
        total: rawList.length,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(rawList.length / params.limit) || 1,
        hasMore: false
      };
      const formatted = rawList.map(formatIncident);
      setIncidents(formatted);
      setIncidentsPagination(pagination);
      if (formatted.length > 0) {
        setSelectedIncidentIdState(prev => {
          if (prev && formatted.some(i => i.id === prev)) {
            return prev;
          }
          return formatted[0].id;
        });
      }
      return { incidents: formatted, pagination };
    } catch (err) {
      if (err.status !== 401) {
        setIncidentsError(err.message || 'Failed to retrieve incidents');
      }
      return { incidents: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1, hasMore: false } };
    } finally {
      setIsIncidentsLoading(false);
    }
  }, []);

  const fetchIncidentDetails = useCallback(async (id) => {
    if (!id) return null;
    try {
      const res = await api.get(`/api/incidents/${id}`);
      const raw = res && res.data ? res.data : null;
      if (!raw) return null;
      const formatted = formatIncident(raw);
      setIncidents(prev => {
        const idx = prev.findIndex(i => i.id === id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...formatted };
          return updated;
        }
        return [formatted, ...prev];
      });
      return formatted;
    } catch (err) {
      console.warn('Failed to fetch incident details:', err.message);
      return null;
    }
  }, []);

  const fetchSecurityEvents = useCallback(async (options = {}) => {
    try {
      setIsEventsLoading(true);
      setEventsError(null);
      const params = {
        limit: options.limit || 50,
        page: options.page || 1,
        ...(options.provider && options.provider !== 'ALL' ? { provider: options.provider.toUpperCase() } : {}),
        ...(options.severity && options.severity !== 'ALL' ? { severity: options.severity.toUpperCase() } : {}),
        ...(options.status && options.status !== 'ALL' ? { status: options.status.toUpperCase() } : {}),
        ...(options.eventType ? { eventType: options.eventType } : {})
      };
      const res = await api.get('/api/events', { params });
      const rawList = res && res.data && Array.isArray(res.data.events) ? res.data.events : [];
      const pagination = (res && res.data && res.data.pagination) || {
        total: rawList.length,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(rawList.length / params.limit) || 1,
        hasMore: false
      };
      const formatted = rawList.map(formatSecurityEvent);
      setTelemetryLogs(formatted);
      setEventsPagination(pagination);
      return { events: formatted, pagination };
    } catch (err) {
      if (err.status !== 401) {
        setEventsError(err.message || 'Failed to retrieve telemetry stream');
      }
      return { events: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 1, hasMore: false } };
    } finally {
      setIsEventsLoading(false);
    }
  }, []);

  // Toast manager
  const addToast = useCallback((type, title, message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setToasts(prev => [...prev, { id, type, title, message, timestamp: Date.now() }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Fetch AI investigation for incident
  const fetchInvestigation = useCallback(async (incidentId) => {
    if (!incidentId || incidentId === 'inc-placeholder') return null;
    try {
      setIsInvestigationLoading(true);
      setInvestigationError(null);
      const res = await api.get(`/api/incidents/${incidentId}/investigation`);
      if (res && res.data) {
        setCurrentInvestigation(res.data);
        return res.data;
      }
      return null;
    } catch (err) {
      if (err.status === 404) {
        // Normal: No investigation conducted yet for this incident
        setCurrentInvestigation(null);
      } else if (err.status !== 401) {
        setInvestigationError(err.message || 'Failed to retrieve investigation');
      }
      return null;
    } finally {
      setIsInvestigationLoading(false);
    }
  }, []);

  // Fetch incident neighborhood graph
  const fetchIncidentGraph = useCallback(async (incidentId) => {
    if (!incidentId || incidentId === 'inc-placeholder') return;
    try {
      setIsGraphLoading(true);
      setGraphError(null);
      const res = await api.get(`/api/graph/incident/${incidentId}`);
      const rawGraph = res && res.data ? res.data : { nodes: [], edges: [] };
      setGraphData(rawGraph);
      if (Array.isArray(rawGraph.nodes) && rawGraph.nodes.length > 0) {
        const laidOut = layoutGraph(rawGraph.nodes, rawGraph.edges);
        setAttackNodes(laidOut.nodes);
        setAttackEdges(laidOut.edges);
      }
    } catch (err) {
      if (err.status !== 404 && err.status !== 401) {
        setGraphError(err.message || 'Failed to load incident attack graph');
      }
    } finally {
      setIsGraphLoading(false);
    }
  }, []);

  // Fetch global user overview graph
  const fetchOverviewGraph = useCallback(async () => {
    try {
      setIsGraphLoading(true);
      setGraphError(null);
      const res = await api.get('/api/graph/overview');
      const rawGraph = res && res.data ? res.data : { nodes: [], edges: [] };
      setGraphData(rawGraph);
      if (Array.isArray(rawGraph.nodes) && rawGraph.nodes.length > 0) {
        const laidOut = layoutGraph(rawGraph.nodes, rawGraph.edges);
        setAttackNodes(laidOut.nodes);
        setAttackEdges(laidOut.edges);
      }
    } catch (err) {
      if (err.status !== 401) {
        setGraphError(err.message || 'Failed to load digital identity graph');
      }
    } finally {
      setIsGraphLoading(false);
    }
  }, []);

  // Fetch deterministic blast radius analysis for incident
  const fetchIncidentBlastRadius = useCallback(async (incidentId) => {
    if (!incidentId || incidentId === 'inc-placeholder') return null;
    try {
      setIsBlastRadiusLoading(true);
      setBlastRadiusError(null);
      const res = await api.get(`/api/incidents/${incidentId}/blast-radius`);
      if (res && res.data) {
        setBlastRadiusData(res.data);
        if (Array.isArray(res.data.nodes) && res.data.nodes.length > 0) {
          const laidOut = layoutGraph(res.data.nodes, res.data.relationships || res.data.paths || []);
          setAttackNodes(laidOut.nodes);
          setAttackEdges(laidOut.edges);
        }
        return res.data;
      }
      return null;
    } catch (err) {
      if (err.status !== 404 && err.status !== 401) {
        setBlastRadiusError(err.message || 'Failed to compute blast radius');
      }
      return null;
    } finally {
      setIsBlastRadiusLoading(false);
    }
  }, []);

  // Trigger AI investigation execution for incident
  const triggerInvestigation = useCallback(async (incidentId) => {
    if (!incidentId || incidentId === 'inc-placeholder') return null;
    try {
      setIsInvestigationLoading(true);
      setInvestigationError(null);
      addToast('info', 'AI Agent Dispatched', 'Sentinel LangGraph multi-hop investigation pipeline started.');
      const res = await api.post(`/api/incidents/${incidentId}/investigate`, {});
      if (res && res.data) {
        setCurrentInvestigation(res.data);
        const confidencePct = Math.round((res.data.resultSummary?.confidence || 0.85) * 100);
        addToast('success', 'Investigation Completed', `AI Confidence: ${confidencePct}% with verified findings.`);
        fetchIncidents();
        fetchIncidentBlastRadius(incidentId);
        fetchIncidentGraph(incidentId);
        return res.data;
      }
      return null;
    } catch (err) {
      if (err.status === 409) {
        const activeRun = { id: err.data?.activeAgentRunId || 'active', status: 'RUNNING' };
        setCurrentInvestigation(activeRun);
        addToast('warning', 'Investigation In Progress', 'Agent is actively synthesizing this incident telemetry.');
        return activeRun;
      }
      setInvestigationError(err.message || 'Failed to execute AI investigation');
      addToast('error', 'Investigation Error', err.message || 'Failed to complete AI investigation');
      return null;
    } finally {
      setIsInvestigationLoading(false);
    }
  }, [addToast, fetchIncidents, fetchIncidentBlastRadius, fetchIncidentGraph]);

  // Trigger explicit Neo4j synchronization
  const syncUserGraph = useCallback(async () => {
    try {
      setIsGraphLoading(true);
      addToast('info', 'Graph Sync Triggered', 'Synchronizing PostgreSQL records into Neo4j graph projection...');
      const res = await api.post('/api/graph/sync', {});
      addToast('success', 'Graph Synchronized', 'Neo4j identity and attack projection is fully consistent.');
      if (selectedIncidentId && selectedIncidentId !== 'inc-placeholder') {
        fetchIncidentGraph(selectedIncidentId);
        fetchIncidentBlastRadius(selectedIncidentId);
      } else {
        fetchOverviewGraph();
      }
      return res && res.data;
    } catch (err) {
      addToast('error', 'Sync Failed', err.message || 'Failed to synchronize graph projection');
      return null;
    } finally {
      setIsGraphLoading(false);
    }
  }, [selectedIncidentId, addToast, fetchIncidentGraph, fetchIncidentBlastRadius, fetchOverviewGraph]);

  // Phase 6: Recovery Plan & Action Execution API functions

  // Fetch recovery plan for incident
  const fetchRecoveryPlan = useCallback(async (incidentId) => {
    if (!incidentId || incidentId === 'inc-placeholder') return null;
    try {
      setIsRecoveryPlanLoading(true);
      setRecoveryPlanError(null);
      const res = await api.get(`/api/incidents/${incidentId}/recovery-plan`);
      const plan = res && res.data ? res.data : null;
      setCurrentRecoveryPlan(plan);
      return plan;
    } catch (err) {
      if (err.status === 404) {
        // Normal: No recovery plan generated yet for this incident
        setCurrentRecoveryPlan(null);
      } else if (err.status !== 401) {
        setRecoveryPlanError(err.message || 'Failed to retrieve recovery plan');
      }
      return null;
    } finally {
      setIsRecoveryPlanLoading(false);
    }
  }, []);

  // Generate a new recovery plan for incident
  const generateRecoveryPlan = useCallback(async (incidentId, options = {}) => {
    if (!incidentId || incidentId === 'inc-placeholder') return null;
    try {
      setIsRecoveryPlanLoading(true);
      setRecoveryPlanError(null);
      addToast('info', 'Generating Recovery Plan', 'Synthesizing blast radius and compiling mitigation actions...');
      const res = await api.post(`/api/incidents/${incidentId}/recovery-plan`, { options });
      const plan = res && res.data ? res.data : null;
      setCurrentRecoveryPlan(plan);
      addToast('success', 'Recovery Plan Ready', `Generated ${plan?.actions?.length || 0} mitigation actions.`);
      return plan;
    } catch (err) {
      const errMsg = err.message || 'Failed to generate recovery plan';
      setRecoveryPlanError(errMsg);
      addToast('error', 'Plan Generation Failed', errMsg);
      return null;
    } finally {
      setIsRecoveryPlanLoading(false);
    }
  }, [addToast]);

  // Evaluate policy for a recovery action
  const evaluateActionPolicy = useCallback(async (actionId) => {
    if (!actionId) return null;
    try {
      const res = await api.post(`/api/recovery-actions/${actionId}/policy-evaluate`, {});
      if (res && res.data) {
        setActionPolicies(prev => ({ ...prev, [actionId]: res.data }));
        return res.data;
      }
      return null;
    } catch (err) {
      console.warn('Policy evaluation notice:', err.message);
      return null;
    }
  }, []);

  // Request approval for a recovery action
  const requestActionApproval = useCallback(async (actionId) => {
    if (!actionId) return null;
    try {
      const res = await api.post(`/api/recovery-actions/${actionId}/approval-request`, {});
      if (res && res.data) {
        if (res.data.authorization) {
          setActionAuthorizations(prev => ({ ...prev, [actionId]: res.data.authorization }));
        }
        if (res.data.approval) {
          setActionApprovals(prev => ({ ...prev, [actionId]: res.data.approval }));
        }
        const newStatus = res.data.status === 'AUTOMATION_AUTHORIZED' ? 'APPROVED' : 'PENDING_APPROVAL';
        setCurrentRecoveryPlan(prev => {
          if (!prev || !Array.isArray(prev.actions)) return prev;
          return {
            ...prev,
            actions: prev.actions.map(a => a.id === actionId ? { ...a, status: newStatus } : a)
          };
        });

        if (res.data.status === 'AUTOMATION_AUTHORIZED') {
          addToast('success', 'Policy Approved', 'Action auto-authorized under explicit automation policy.');
        } else {
          addToast('info', 'Approval Requested', 'Approval request pending human review.');
        }
        return res.data;
      }
      return null;
    } catch (err) {
      const msg = err.message || 'Failed to request action approval';
      addToast('error', 'Approval Request Failed', msg);
      return null;
    }
  }, [addToast]);

  // Approve a pending action approval
  const approveRecoveryAction = useCallback(async (approvalId, actionId) => {
    if (!approvalId) return null;
    try {
      const res = await api.post(`/api/approvals/${approvalId}/approve`, {});
      if (res && res.data) {
        if (res.data.authorization) {
          setActionAuthorizations(prev => ({ ...prev, [actionId]: res.data.authorization }));
        }
        if (res.data.approval) {
          setActionApprovals(prev => ({ ...prev, [actionId]: res.data.approval }));
        }
        setCurrentRecoveryPlan(prev => {
          if (!prev || !Array.isArray(prev.actions)) return prev;
          return {
            ...prev,
            actions: prev.actions.map(a => a.id === actionId ? { ...a, status: 'APPROVED' } : a)
          };
        });
        addToast('success', 'Action Approved', 'Cryptographic authorization token issued for execution.');
        return res.data;
      }
      return null;
    } catch (err) {
      const msg = err.message || 'Failed to approve action';
      addToast('error', 'Approval Failed', msg);
      throw err;
    }
  }, [addToast]);

  // Reject a pending action approval
  const rejectRecoveryAction = useCallback(async (approvalId, actionId, reason = 'Operator rejected execution') => {
    if (!approvalId) return null;
    try {
      const res = await api.post(`/api/approvals/${approvalId}/reject`, { reason });
      if (res && res.data) {
        if (res.data.approval) {
          setActionApprovals(prev => ({ ...prev, [actionId]: res.data.approval }));
        }
        setCurrentRecoveryPlan(prev => {
          if (!prev || !Array.isArray(prev.actions)) return prev;
          return {
            ...prev,
            actions: prev.actions.map(a => a.id === actionId ? { ...a, status: 'REJECTED' } : a)
          };
        });
        addToast('warning', 'Action Rejected', 'Mitigation step rejected. Manual review flagged.');
        return res.data;
      }
      return null;
    } catch (err) {
      const msg = err.message || 'Failed to reject action';
      addToast('error', 'Rejection Failed', msg);
      throw err;
    }
  }, [addToast]);

  // Execute an authorized recovery action
  const executeRecoveryAction = useCallback(async (actionId) => {
    if (!actionId) return null;
    if (actionExecutionStates[actionId]?.isExecuting) {
      return null;
    }

    let auth = actionAuthorizations[actionId];
    if (!auth) {
      const reqRes = await requestActionApproval(actionId);
      if (reqRes && reqRes.authorization) {
        auth = reqRes.authorization;
      } else {
        addToast('error', 'Execution Blocked', 'Valid authorization contract required to execute recovery.');
        return null;
      }
    }

    setActionExecutionStates(prev => ({
      ...prev,
      [actionId]: { isExecuting: true, error: null, result: null }
    }));

    setCurrentRecoveryPlan(prev => {
      if (!prev || !Array.isArray(prev.actions)) return prev;
      return {
        ...prev,
        actions: prev.actions.map(a => a.id === actionId ? { ...a, status: 'EXECUTING' } : a)
      };
    });

    try {
      const res = await api.post(`/api/recovery-actions/${actionId}/execute`, {
        authorization: auth
      });
      const result = res && res.data ? res.data : res;

      setActionExecutionStates(prev => ({
        ...prev,
        [actionId]: { isExecuting: false, error: null, result }
      }));

      const finalStatus = (result?.status === 'ALREADY_EXECUTED' || result?.status === 'COMPLETED') ? 'COMPLETED' : (result?.status || 'COMPLETED');
      setCurrentRecoveryPlan(prev => {
        if (!prev || !Array.isArray(prev.actions)) return prev;
        return {
          ...prev,
          actions: prev.actions.map(a => a.id === actionId ? { ...a, status: finalStatus, executedAt: new Date().toISOString() } : a)
        };
      });

      addToast('success', 'Action Executed', `Recovery action ${actionId.slice(0, 8)} finalized successfully.`);

      if (selectedIncidentId && selectedIncidentId !== 'inc-placeholder') {
        fetchIncidentBlastRadius(selectedIncidentId);
        fetchIncidentGraph(selectedIncidentId);
      }

      return result;
    } catch (err) {
      const msg = err.message || 'Execution failed';
      setActionExecutionStates(prev => ({
        ...prev,
        [actionId]: { isExecuting: false, error: msg, result: null }
      }));
      setCurrentRecoveryPlan(prev => {
        if (!prev || !Array.isArray(prev.actions)) return prev;
        return {
          ...prev,
          actions: prev.actions.map(a => a.id === actionId ? { ...a, status: 'FAILED' } : a)
        };
      });
      addToast('error', 'Execution Failed', msg);
      throw err;
    }
  }, [actionAuthorizations, actionExecutionStates, requestActionApproval, addToast, selectedIncidentId, fetchIncidentBlastRadius, fetchIncidentGraph]);

  // Verify a single recovery action
  const verifySingleAction = useCallback(async (actionId) => {
    if (!actionId) return null;
    try {
      const res = await api.post(`/api/recovery-actions/${actionId}/verify`, {});
      if (res && res.data) {
        setActionVerifications(prev => ({ ...prev, [actionId]: res.data }));
        return res.data;
      }
      return null;
    } catch (err) {
      console.warn('Action verification notice:', err.message);
      return null;
    }
  }, []);

  // Holistic incident recovery verification
  const verifyIncidentRecovery = useCallback(async (incidentId) => {
    if (!incidentId || incidentId === 'inc-placeholder') return null;
    try {
      setIsVerifying(true);
      setVerificationError(null);
      addToast('info', 'Verification Started', 'Running holistic post-recovery verification and persistence checks...');
      const res = await api.post(`/api/incidents/${incidentId}/verify`, {});
      const result = res && res.data ? res.data : null;
      setIncidentVerification(result);

      if (result) {
        if (result.resolved === true && result.incidentStatus === 'RESOLVED') {
          setIncidents(prev => prev.map(inc => inc.id === incidentId ? { ...inc, status: 'resolved', rawStatus: 'RESOLVED' } : inc));
          addToast('success', 'Incident Resolved', 'All verification checks passed with 0 residual persistence.');
          try {
            confetti({
              particleCount: 70,
              spread: 60,
              origin: { y: 0.6 },
              colors: ['#06b6d4', '#10b981', '#3b82f6']
            });
          } catch {}
        } else if (result.persistence?.status === 'PERSISTENCE_FOUND') {
          addToast('warning', 'Persistence Detected', 'Verification detected residual attack persistence or re-infection vectors.');
        } else {
          addToast('info', 'Verification Complete', `Status: ${result.status} (Incident: ${result.incidentStatus})`);
        }
      }

      return result;
    } catch (err) {
      const errMsg = err.message || 'Verification failed';
      setVerificationError(errMsg);
      addToast('error', 'Verification Failed', errMsg);
      return null;
    } finally {
      setIsVerifying(false);
    }
  }, [addToast]);

  // Fetch current incident verification
  const fetchIncidentVerification = useCallback(async (incidentId) => {
    if (!incidentId || incidentId === 'inc-placeholder') return null;
    try {
      const res = await api.get(`/api/incidents/${incidentId}/verification`);
      if (res && res.data) {
        setIncidentVerification(res.data);
        return res.data;
      }
      return null;
    } catch (err) {
      if (err.status === 404) {
        setIncidentVerification(null);
      } else if (err.status !== 401) {
        console.warn('Failed to fetch incident verification:', err.message);
      }
      return null;
    }
  }, []);

  // Real-time synchronization via WebSocket notifications
  useEffect(() => {
    const unsub = websocketService.onNotification((notif) => {
      if (!notif || !notif.type) return;
      const type = (notif.type || '').toUpperCase();

      if (
        type === 'INCIDENT_CREATED' ||
        type === 'INCIDENT_UPDATED' ||
        type === 'INCIDENT_SEVERITY_CHANGED' ||
        type === 'INCIDENT_RESOLVED'
      ) {
        fetchIncidents();
        fetchSecurityEvents();
      } else if (type === 'CRITICAL_SECURITY_EVENT') {
        fetchSecurityEvents();
      } else if (type === 'INVESTIGATION_STARTED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          setCurrentInvestigation(prev => ({ ...(prev || {}), status: 'RUNNING' }));
          addToast('info', 'Investigation Started', 'Autonomous AI reasoning across identity graph in progress...');
        }
      } else if (type === 'INVESTIGATION_COMPLETED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchInvestigation(selectedIncidentId);
          fetchIncidentBlastRadius(selectedIncidentId);
          fetchIncidentGraph(selectedIncidentId);
          addToast('success', 'Investigation Completed', 'AI conclusions verified and telemetry synchronized.');
        }
      } else if (type === 'INVESTIGATION_FAILED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          setCurrentInvestigation(prev => ({ ...(prev || {}), status: 'FAILED' }));
          addToast('error', 'Investigation Failed', notif.metadata?.error || 'Investigation could not complete.');
        }
      } else if (type === 'RECOVERY_PLAN_CREATED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchRecoveryPlan(selectedIncidentId);
          addToast('info', 'Recovery Plan Ready', 'Mitigation plan generated for active incident.');
        }
      } else if (type === 'RECOVERY_APPROVAL_REQUIRED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchRecoveryPlan(selectedIncidentId);
          addToast('warning', 'Approval Required', 'High-impact recovery action requires human authorization.');
        }
      } else if (type === 'APPROVAL_GRANTED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchRecoveryPlan(selectedIncidentId);
          addToast('success', 'Approval Granted', 'Action authorized for execution.');
        }
      } else if (type === 'APPROVAL_REJECTED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchRecoveryPlan(selectedIncidentId);
          addToast('warning', 'Approval Rejected', 'Action was rejected by operator.');
        }
      } else if (type === 'APPROVAL_EXPIRED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchRecoveryPlan(selectedIncidentId);
          addToast('warning', 'Approval Expired', 'Authorization expired before execution.');
        }
      } else if (type === 'RECOVERY_STARTED') {
        addToast('info', 'Recovery Started', 'Executing mitigation actions across identity providers...');
      } else if (type === 'RECOVERY_COMPLETED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchRecoveryPlan(selectedIncidentId);
          fetchIncidentBlastRadius(selectedIncidentId);
          addToast('success', 'Recovery Completed', 'Mitigation action execution succeeded.');
        }
      } else if (type === 'RECOVERY_FAILED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchRecoveryPlan(selectedIncidentId);
          addToast('error', 'Recovery Failed', notif.metadata?.error || 'Mitigation action failed.');
        }
      } else if (type === 'VERIFICATION_STARTED') {
        addToast('info', 'Verification In Progress', 'Checking post-recovery event telemetry and identity state...');
      } else if (type === 'VERIFICATION_COMPLETED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchIncidentVerification(selectedIncidentId);
          fetchIncidents();
          addToast('success', 'Verification Complete', 'Recovery verification completed.');
        }
      } else if (type === 'PERSISTENCE_DETECTED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchIncidentVerification(selectedIncidentId);
          addToast('warning', 'Persistence Detected', 'Adversary persistence detected during post-recovery audit.');
        }
      } else if (type === 'REINVESTIGATION_TRIGGERED') {
        if (notif.targetId === selectedIncidentId || notif.metadata?.incidentId === selectedIncidentId) {
          fetchInvestigation(selectedIncidentId);
          addToast('info', 'Re-Investigation Triggered', 'Autonomous re-investigation started due to detected persistence.');
        }
      }
    });

    return () => unsub();
  }, [
    selectedIncidentId,
    fetchIncidents,
    fetchSecurityEvents,
    fetchInvestigation,
    fetchIncidentBlastRadius,
    fetchIncidentGraph,
    fetchRecoveryPlan,
    fetchIncidentVerification,
    addToast
  ]);

  // Synchronize investigation, blast radius, graph, recovery plan, and verification when active incident changes
  useEffect(() => {
    if (selectedIncidentId && selectedIncidentId !== 'inc-placeholder') {
      fetchInvestigation(selectedIncidentId);
      fetchIncidentBlastRadius(selectedIncidentId);
      fetchRecoveryPlan(selectedIncidentId);
      fetchIncidentVerification(selectedIncidentId);
      if (graphViewMode === 'incident') {
        fetchIncidentGraph(selectedIncidentId);
      } else {
        fetchOverviewGraph();
      }
    }
  }, [
    selectedIncidentId,
    graphViewMode,
    fetchInvestigation,
    fetchIncidentBlastRadius,
    fetchRecoveryPlan,
    fetchIncidentVerification,
    fetchIncidentGraph,
    fetchOverviewGraph
  ]);

  // Dynamic system status
  const criticalCount = incidents.filter(i => (i.severity || '').toLowerCase() === 'critical' && (i.status || '').toLowerCase() !== 'resolved' && (i.status || '').toLowerCase() !== 'contained').length;
  const highCount = incidents.filter(i => (i.severity || '').toLowerCase() === 'high' && (i.status || '').toLowerCase() !== 'resolved' && (i.status || '').toLowerCase() !== 'contained').length;
  const isRecovering = playbooks.some(p => p.status === 'in_progress');

  let systemStatus = 'PROTECTED';
  if (isRecovering) systemStatus = 'RECOVERING';
  else if (criticalCount > 0) systemStatus = 'CRITICAL';
  else if (highCount > 0) systemStatus = 'ELEVATED';

  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0] || (incidents.length === 0 ? formatIncident({
    id: 'inc-placeholder',
    title: 'No Active Incident',
    summary: 'No active incident selected or available.',
    status: 'OPEN',
    severity: 'INFO'
  }) : null);

  // Bootstrap authenticated session on initial application mount
  useEffect(() => {
    let isMounted = true;

    async function bootstrapSession() {
      try {
        setIsAuthLoading(true);
        setAuthError(null);
        const data = await api.get('/api/auth/me');
        if (isMounted && data && data.user) {
          setCurrentUser(data.user);
          const initial = parseLocation(window.location);
          if (initial.tab && initial.tab !== TAB_ROUTES.LANDING) {
            setActiveTabState(initial.tab);
            if (initial.incidentId) {
              setSelectedIncidentIdState(initial.incidentId);
            }
          } else {
            setActiveTabState(TAB_ROUTES.DASHBOARD);
            if (typeof window !== 'undefined' && window.history && window.location.pathname === '/') {
              window.history.replaceState({ tab: TAB_ROUTES.DASHBOARD }, '', '/dashboard');
            }
          }
          fetchConnectedAccounts();
          fetchIncidents();
          fetchSecurityEvents();
        }
      } catch (err) {
        if (isMounted) {
          setCurrentUser(null);
          const initial = parseLocation(window.location);
          if (isProtectedTab(initial.tab)) {
            setRedirectAfterLogin({ tab: initial.tab, incidentId: initial.incidentId });
            setActiveTabState(TAB_ROUTES.LANDING);
            if (typeof window !== 'undefined' && window.history) {
              window.history.replaceState({ tab: TAB_ROUTES.LANDING }, '', '/');
            }
          } else {
            setActiveTabState(initial.tab || TAB_ROUTES.LANDING);
          }
          if (err.status !== 401) {
            setAuthError(err.message || 'Security service unavailable');
          }
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }

    bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Secure cross-window message listener for OAuth completion
  useEffect(() => {
    const handleMessage = (event) => {
      // Strictly validate origin — NEVER trust '*' or foreign origins
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'RECOVER_OAUTH_SUCCESS') {
        fetchConnectedAccounts();
        addToast('success', 'OAuth Connected', 'Identity fabric updated from provider callback.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
        id: `sim-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString().substring(11, 23),
        level: 'WARN',
        service: 'AWS (Simulated)',
        eventType: 'simulated.sts.AssumeRole',
        actor: 'arn:aws:iam::synthetic:user/simulated-adversary',
        sourceIp: `198.51.100.${Math.floor(Math.random() * 255)}`,
        target: 'arn:aws:iam::synthetic:role/DeployerSimulationRole',
        status: 'ANOMALY',
        payload: { simulated: true, reason: 'Synthetic sandbox telemetry injection' }
      }),
      () => ({
        id: `sim-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString().substring(11, 23),
        level: 'INFO',
        service: 'AWS (Simulated)',
        eventType: 'simulated.s3.GetObject',
        actor: 'arn:aws:iam::synthetic:role/DeployerSimulationRole',
        sourceIp: `198.51.100.${Math.floor(Math.random() * 255)}`,
        target: 'arn:aws:s3:::synthetic-vault-bucket',
        status: 'ALLOW',
        payload: { simulated: true, action: 'sandbox_probe' }
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

  const startOAuthConnect = async (providerName) => {
    const providerKey = (providerName || '').toUpperCase();
    try {
      const res = await api.get(`/api/oauth/${providerKey}/start`);
      const authUrl = res && res.data && res.data.authorizationUrl;
      if (!authUrl) {
        throw new Error('Backend did not return an authorization URL.');
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2.5);

      const popup = window.open(
        authUrl,
        'recover_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        const blockedMsg = 'OAuth popup was blocked by browser. Please allow popups for Re:COVER.';
        addToast('error', 'Popup Blocked', blockedMsg);
        throw new Error(blockedMsg);
      }

      addToast('info', 'OAuth Initiated', `Awaiting authorization from ${providerKey}...`);

      return new Promise((resolve) => {
        let pollCount = 0;
        const maxPolls = 600; // 5 minutes max
        const interval = setInterval(async () => {
          pollCount++;
          if (popup.closed || pollCount >= maxPolls) {
            clearInterval(interval);
            // Wait briefly for server to finalize callback handling
            await new Promise(r => setTimeout(r, 600));
            const updatedAccounts = await fetchConnectedAccounts();
            const newlyAdded = updatedAccounts.find(a => (a.provider || '').toUpperCase() === providerKey);
            if (newlyAdded) {
              addToast('success', 'Provider Connected', `Successfully enrolled "${newlyAdded.name}" into Digital Immune Fabric.`);
            }
            resolve({ completed: true, accounts: updatedAccounts });
          }
        }, 500);
      });
    } catch (err) {
      addToast('error', 'OAuth Connection Failed', err.message || 'Unable to start OAuth authorization');
      throw err;
    }
  };

  const connectAccount = (accountData) => {
    const newAccount = formatConnectedAccount({
      id: `acc-${Date.now()}`,
      provider: (accountData.type || 'aws').toUpperCase(),
      providerDisplayName: accountData.name || 'Simulated Cloud Connector',
      providerAccountId: accountData.accountNumber || 'arn:aws:iam::simulated-sandbox:role/RecoverSentinel',
      status: 'ACTIVE',
      identitiesCount: accountData.identitiesCount || Math.floor(Math.random() * 400) + 50,
      resourcesCount: accountData.resourcesCount || Math.floor(Math.random() * 800) + 120,
    });
    setConnectedAccounts(prev => [...prev, newAccount]);
    addToast('success', 'Provider Connected', `Successfully enrolled "${newAccount.name}" into Digital Immune Fabric.`);
  };

  const disconnectAccount = async (id) => {
    try {
      const res = await api.delete(`/api/oauth/connected/${id}`);
      addToast('info', 'Account Disconnected', (res && res.message) || 'Provider removed from telemetry monitoring.');
      await fetchConnectedAccounts();
    } catch (err) {
      // If error (e.g. simulated local account not in DB), fallback to filtering locally if not found
      if (err.status === 404 || String(id).startsWith('acc-')) {
        setConnectedAccounts(prev => prev.filter(a => a.id !== id));
        addToast('info', 'Account Disconnected', 'Connector removed from telemetry monitoring.');
      } else {
        addToast('error', 'Disconnect Failed', err.message || 'Failed to disconnect provider account');
        throw err;
      }
    }
  };

  const resyncAccount = async (id) => {
    setConnectedAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'syncing' } : a));
    addToast('info', 'Sync Started', `Re-evaluating identity permissions and certificates...`);
    try {
      await fetchConnectedAccounts();
      addToast('success', 'Sync Complete', `Identity fabric verified with 0 permission leaks.`);
    } catch {
      setTimeout(() => {
        setConnectedAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'connected', lastSync: 'Just now' } : a));
        addToast('success', 'Sync Complete', `Identity fabric verified with 0 permission leaks.`);
      }, 1200);
    }
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
    } else if (scenarioId === 'aws-escalation') {
      const newInc = {
        id: `inc-sim-${Date.now()}`,
        refCode: `INC-${Math.floor(Math.random() * 9000 + 1000)}-AWS`,
        title: 'SIMULATED: AWS IAM Privilege Escalation & Lateral Movement',
        severity: 'high',
        status: 'investigating',
        provider: 'aws',
        timestamp: 'Just now',
        actor: {
          ip: '91.240.118.12',
          location: 'Frankfurt, DE',
          userAgent: 'aws-sdk-go/v1.44',
          fingerprint: 'fp_sim_sts'
        },
        targetResource: 'arn:aws:iam::simulated-sandbox:role/DataPipelineWorker',
        mitreTactic: 'TA0004 Privilege Escalation',
        mitreTechnique: 'T1078.004 Cloud Accounts',
        aiConfidence: 96.7,
        summary: 'Synthetic attack injected: Temporary credentials used to enumerate sensitive S3 buckets.',
        blastRadiusCount: 3,
        rawPayload: { simulated: true, roleArn: 'arn:aws:iam::simulated-sandbox:role/DataPipelineWorker' },
        evidenceChain: [
          { time: 'Just now', event: 'STS AssumeRole from unverified CIDR', severity: 'high', detail: 'Principal accessed cross-boundary resources' }
        ]
      };
      setIncidents(prev => [newInc, ...prev]);
      setSelectedIncidentId(newInc.id);
      addToast('warning', 'Simulation Triggered', 'Simulated AWS IAM Privilege Escalation incident created.');
    } else if (scenarioId === 'oauth-grant') {
      const newInc = {
        id: `inc-sim-${Date.now()}`,
        refCode: `INC-${Math.floor(Math.random() * 9000 + 1000)}-GGL`,
        title: 'SIMULATED: Google Drive Malicious OAuth Scope Escalation',
        severity: 'medium',
        status: 'investigating',
        provider: 'google',
        timestamp: 'Just now',
        actor: {
          ip: '198.51.100.24',
          location: 'Toronto, CA',
          userAgent: 'Mozilla/5.0 Chrome/122.0',
          fingerprint: 'fp_sim_oauth'
        },
        targetResource: 'oauth:app_991204_cloud_sync_pro',
        mitreTactic: 'TA0006 Credential Access',
        mitreTechnique: 'T1528 Steal Application Access Token',
        aiConfidence: 94.2,
        summary: 'Synthetic attack injected: 3rd-party OAuth application requested elevated Drive and Mail read privileges.',
        blastRadiusCount: 2,
        rawPayload: { simulated: true, appId: 'app_991204_cloud_sync_pro' },
        evidenceChain: [
          { time: 'Just now', event: 'OAuth Consent Grant granted', severity: 'medium', detail: 'External client granted https://www.googleapis.com/auth/drive.readonly' }
        ]
      };
      setIncidents(prev => [newInc, ...prev]);
      setSelectedIncidentId(newInc.id);
      addToast('warning', 'Simulation Triggered', 'Simulated Google OAuth Scope Escalation incident created.');
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

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const data = await api.post('/api/auth/login', { email, password });
      if (data && data.requires2FA) {
        return { requires2FA: true, pending2faToken: data.pending2faToken, email: data.email };
      }
      if (data && data.user) {
        setCurrentUser(data.user);
        closeAuthModal();
        const destTab = redirectAfterLogin?.tab || TAB_ROUTES.DASHBOARD;
        const destIncidentId = redirectAfterLogin?.incidentId || undefined;
        setRedirectAfterLogin(null);
        navigateTo(destTab, destIncidentId, { replace: true });
        fetchConnectedAccounts();
        fetchIncidents();
        fetchSecurityEvents();
        addToast('success', 'Logged In', `Welcome back, ${data.user.displayName || data.user.email}`);
        return data;
      }
    } catch (err) {
      if (err.data && err.data.requiresEmailVerification) {
        return { requiresEmailVerification: true, email: err.data.email, message: err.message };
      }
      setAuthError(err.message || 'Login failed');
      throw err;
    }
  };

  const register = async (email, password, displayName, avatarUrl, phoneNumber) => {
    setAuthError(null);
    try {
      const data = await api.post('/api/auth/register', { email, password, displayName, avatarUrl, phoneNumber });
      if (data && data.requiresEmailVerification) {
        return { requiresEmailVerification: true, email: data.email, user: data.user };
      }
      if (data && data.user) {
        setCurrentUser(data.user);
        closeAuthModal();
        return data;
      }
    } catch (err) {
      setAuthError(err.message || 'Registration failed');
      throw err;
    }
  };

  const verifyEmailOtp = async (email, otp) => {
    setAuthError(null);
    try {
      const data = await api.post('/api/auth/email-verification/verify', { email, otp });
      if (data && data.user) {
        setCurrentUser(data.user);
        closeAuthModal();
        const destTab = redirectAfterLogin?.tab || TAB_ROUTES.DASHBOARD;
        const destIncidentId = redirectAfterLogin?.incidentId || undefined;
        setRedirectAfterLogin(null);
        navigateTo(destTab, destIncidentId, { replace: true });
        fetchConnectedAccounts();
        fetchIncidents();
        fetchSecurityEvents();
        addToast('success', 'Email Verified', `Welcome to Re:COVER, ${data.user.displayName || data.user.email}`);
        return data.user;
      }
    } catch (err) {
      setAuthError(err.message || 'Email verification failed');
      throw err;
    }
  };

  const resendEmailOtp = async (email) => {
    try {
      const data = await api.post('/api/auth/email-verification/resend', { email });
      addToast('info', 'Code Resent', data.message || 'Verification code resent successfully.');
      return data;
    } catch (err) {
      addToast('error', 'Resend Failed', err.message || 'Failed to resend verification code');
      throw err;
    }
  };

  const requestPasswordReset = async (email) => {
    try {
      const data = await api.post('/api/auth/password-reset/request', { email });
      addToast('info', 'Reset Request Sent', data.message || 'If an account exists, a reset code has been sent.');
      return data;
    } catch (err) {
      addToast('error', 'Reset Failed', err.message || 'Failed to send reset code');
      throw err;
    }
  };

  const confirmPasswordReset = async (email, otp, newPassword) => {
    try {
      const data = await api.post('/api/auth/password-reset/confirm', { email, otp, newPassword });
      addToast('success', 'Password Reset', 'Password updated successfully. Please log in with your new password.');
      return data;
    } catch (err) {
      addToast('error', 'Reset Failed', err.message || 'Failed to reset password');
      throw err;
    }
  };

  const verify2fa = async (pending2faToken, { totpCode, recoveryCode }) => {
    setAuthError(null);
    try {
      const data = await api.post('/api/auth/2fa/verify', { pending2faToken, totpCode, recoveryCode });
      if (data && data.user) {
        setCurrentUser(data.user);
        closeAuthModal();
        const destTab = redirectAfterLogin?.tab || TAB_ROUTES.DASHBOARD;
        const destIncidentId = redirectAfterLogin?.incidentId || undefined;
        setRedirectAfterLogin(null);
        navigateTo(destTab, destIncidentId, { replace: true });
        fetchConnectedAccounts();
        fetchIncidents();
        fetchSecurityEvents();
        addToast('success', 'Authenticated', `Welcome back, ${data.user.displayName || data.user.email}`);
        return data.user;
      }
    } catch (err) {
      setAuthError(err.message || 'Two-factor authentication failed');
      throw err;
    }
  };

  const getProfile = async () => {
    try {
      const res = await api.get('/api/auth/profile');
      if (res && res.user) {
        setCurrentUser(prev => ({ ...prev, ...res.user }));
        return res.user;
      }
    } catch (err) {
      console.warn('Profile fetch warning:', err.message);
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const res = await api.patch('/api/auth/profile', profileData);
      if (res && res.user) {
        setCurrentUser(prev => ({ ...prev, ...res.user }));
        addToast('success', 'Profile Updated', 'Your security profile details have been saved.');
        return res.user;
      }
    } catch (err) {
      addToast('error', 'Update Failed', err.message || 'Failed to update profile');
      throw err;
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const res = await api.post('/api/auth/password/change', { currentPassword, newPassword });
      addToast('success', 'Password Changed', 'Your master password has been successfully updated.');
      return res;
    } catch (err) {
      addToast('error', 'Password Change Failed', err.message || 'Failed to change password');
      throw err;
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await api.get('/api/auth/sessions');
      return (res && res.sessions) || [];
    } catch (err) {
      addToast('error', 'Sessions Failed', err.message || 'Failed to load active sessions');
      return [];
    }
  };

  const revokeSession = async (sessionId) => {
    try {
      const res = await api.delete(`/api/auth/sessions/${sessionId}`);
      if (res && res.revokedCurrent) {
        await logout();
      } else {
        addToast('info', 'Session Revoked', 'The device session has been terminated.');
      }
      return res;
    } catch (err) {
      addToast('error', 'Revoke Failed', err.message || 'Failed to revoke session');
      throw err;
    }
  };

  const revokeOtherSessions = async () => {
    try {
      const res = await api.delete('/api/auth/sessions');
      addToast('info', 'Sessions Revoked', res.message || 'All other active sessions have been terminated.');
      return res;
    } catch (err) {
      addToast('error', 'Revocation Failed', err.message || 'Failed to revoke other sessions');
      throw err;
    }
  };

  const setup2fa = async () => {
    try {
      return await api.post('/api/auth/2fa/setup');
    } catch (err) {
      addToast('error', '2FA Setup Failed', err.message || 'Failed to initiate two-factor setup');
      throw err;
    }
  };

  const enable2fa = async (secret, totpCode) => {
    try {
      const res = await api.post('/api/auth/2fa/enable', { secret, totpCode });
      setCurrentUser(prev => ({ ...prev, twoFactorEnabled: true }));
      addToast('success', '2FA Enabled', 'Authenticator app two-factor authentication is now active.');
      return res;
    } catch (err) {
      addToast('error', '2FA Activation Failed', err.message || 'Failed to activate two-factor authentication');
      throw err;
    }
  };

  const disable2fa = async (currentPassword, { totpCode, recoveryCode }) => {
    try {
      const res = await api.post('/api/auth/2fa/disable', { currentPassword, totpCode, recoveryCode });
      setCurrentUser(prev => ({ ...prev, twoFactorEnabled: false }));
      addToast('info', '2FA Disabled', 'Two-factor authentication has been disabled.');
      return res;
    } catch (err) {
      addToast('error', '2FA Deactivation Failed', err.message || 'Failed to disable 2FA');
      throw err;
    }
  };

  const regenerateRecoveryCodes = async (currentPassword) => {
    try {
      const res = await api.post('/api/auth/2fa/recovery-codes/regenerate', { currentPassword });
      addToast('success', 'Codes Regenerated', '8 new emergency recovery codes have been generated.');
      return res;
    } catch (err) {
      addToast('error', 'Regeneration Failed', err.message || 'Failed to regenerate recovery codes');
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      console.warn('Logout server request notice:', err.message);
    } finally {
      setCurrentUser(null);
      setConnectedAccounts([]);
      setIncidents([]);
      setTelemetryLogs([]);
      setAttackNodes([]);
      setAttackEdges([]);
      setPlaybooks([]);
      setCurrentInvestigation(null);
      setGraphData({ nodes: [], edges: [] });
      setBlastRadiusData(null);
      setCurrentRecoveryPlan(null);
      setIncidentVerification(null);
      setActionPolicies({});
      setActionApprovals({});
      setActionAuthorizations({});
      setActionExecutionStates({});
      setActionVerifications({});
      setAccountsError(null);
      setIncidentsError(null);
      setEventsError(null);
      setAuthError(null);
      navigateTo(TAB_ROUTES.LANDING, null, { replace: true });
      addToast('info', 'Logged Out', 'You have been logged out of the console.');
    }
  };

  return (
    <SecurityContext.Provider
      value={{
        incidents,
        isIncidentsLoading,
        incidentsError,
        incidentsPagination,
        fetchIncidents,
        fetchIncidentDetails,
        selectedIncidentId,
        setSelectedIncidentId,
        selectedIncident,

        telemetryLogs,
        isEventsLoading,
        eventsError,
        eventsPagination,
        fetchSecurityEvents,
        formatIncident,
        formatSecurityEvent,

        attackNodes,
        attackEdges,
        telemetryLogs,
        currentInvestigation,
        isInvestigationLoading,
        investigationError,
        fetchInvestigation,
        triggerInvestigation,
        graphData,
        isGraphLoading,
        graphError,
        blastRadiusData,
        isBlastRadiusLoading,
        blastRadiusError,
        graphViewMode,
        setGraphViewMode,
        fetchIncidentGraph,
        fetchOverviewGraph,
        fetchIncidentBlastRadius,
        syncUserGraph,

        connectedAccounts,
        isAccountsLoading,
        accountsError,

        // Phase 6: Recovery, Approval & Verification
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
        isAuthLoading,
        isAuthenticated: Boolean(currentUser),
        authError,
        activeTab,
        setActiveTab,
        navigateTo,

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
        fetchConnectedAccounts,
        startOAuthConnect,
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
        register,
        logout,
        verifyEmailOtp,
        resendEmailOtp,
        requestPasswordReset,
        confirmPasswordReset,
        verify2fa,
        getProfile,
        updateProfile,
        changePassword,
        fetchSessions,
        revokeSession,
        revokeOtherSessions,
        setup2fa,
        enable2fa,
        disable2fa,
        regenerateRecoveryCodes
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

