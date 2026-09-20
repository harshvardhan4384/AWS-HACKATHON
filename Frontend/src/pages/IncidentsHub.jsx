import React, { useState, useEffect } from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  AlertOctagon,
  Search,
  BrainCircuit,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Play,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

export const IncidentsHub = () => {
  const {
    incidents,
    isIncidentsLoading,
    incidentsError,
    incidentsPagination,
    fetchIncidents,
    fetchIncidentDetails,
    selectedIncidentId,
    setSelectedIncidentId,
    setActiveTab,
    containIncident,
    updateIncidentStatus,
    triggerScenario,
    addToast
  } = useSecurity();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [expandedIncidentId, setExpandedIncidentId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch incidents when page, status, or severity changes
  useEffect(() => {
    fetchIncidents({
      page: currentPage,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      severity: selectedSeverity !== 'all' ? selectedSeverity : undefined
    });
  }, [currentPage, selectedStatus, selectedSeverity, fetchIncidents]);

  // Auto-expand deep-linked incident when navigated directly or when active incident changes
  useEffect(() => {
    if (selectedIncidentId && incidents.some(i => i.id === selectedIncidentId)) {
      setExpandedIncidentId(selectedIncidentId);
      fetchIncidentDetails(selectedIncidentId);
    }
  }, [selectedIncidentId, incidents, fetchIncidentDetails]);

  const handleExpand = (id) => {
    if (expandedIncidentId === id) {
      setExpandedIncidentId(null);
    } else {
      setExpandedIncidentId(id);
      setSelectedIncidentId(id);
      fetchIncidentDetails(id);
    }
  };

  const handleRefresh = () => {
    fetchIncidents({
      page: currentPage,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      severity: selectedSeverity !== 'all' ? selectedSeverity : undefined
    });
    if (addToast) {
      addToast('info', 'Refreshed', 'Incident triage queue updated.');
    }
  };

  const filteredIncidents = incidents.filter(inc => {
    const matchesQuery =
      (inc.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.refCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.targetResource || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.actor?.ip || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = selectedSeverity === 'all' || (inc.severity || '').toLowerCase() === selectedSeverity.toLowerCase();
    const matchesStatus = selectedStatus === 'all' || (inc.status || '').toLowerCase() === selectedStatus.toLowerCase();
    const matchesProvider = selectedProvider === 'all' || (inc.provider || '').toLowerCase() === selectedProvider.toLowerCase();
    return matchesQuery && matchesSeverity && matchesStatus && matchesProvider;
  });

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-error font-bold uppercase tracking-wider">THREAT INTELLIGENCE</span>
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-mono text-xs text-outline">{incidentsPagination?.total ?? incidents.length} TOTAL DETECTIONS</span>
          </div>
          <h1 className="font-headline font-bold text-2xl text-on-surface mt-1">
            Incidents & Threat Triage Center
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Continuous anomaly correlation, MITRE ATT&CK mapping, and autonomous blast radius mitigation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-high border border-white/10 text-on-surface hover:bg-surface-variant font-semibold text-xs transition-colors shadow-sm"
            title="Refresh Incidents"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isIncidentsLoading ? 'animate-spin text-primary' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => triggerScenario('pat-leak')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-error/15 border border-error/30 text-error hover:bg-error/25 font-semibold text-xs transition-colors shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Inject Test Threat</span>
          </button>
        </div>
      </div>

      {incidentsError && (
        <div className="p-4 rounded-xl bg-error/10 border border-error/20 flex items-center justify-between text-xs text-error">
          <span>{incidentsError}</span>
          <button onClick={handleRefresh} className="underline font-semibold hover:text-error/80">
            Retry
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-surface-container border border-white/5 shadow-md space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-outline absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by incident ID, target ARN, threat actor IP, or IOC..."
              className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface placeholder-outline focus:outline-none focus:border-primary"
            />
          </div>

          {/* Provider Dropdown */}
          <select
            value={selectedProvider}
            onChange={e => {
              setSelectedProvider(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary font-mono cursor-pointer"
          >
            <option value="all">All Cloud Providers</option>
            <option value="google">Google Cloud / Workspace</option>
            <option value="github">GitHub Enterprise</option>
            <option value="aws">AWS (Simulated)</option>
          </select>
        </div>

        {/* Severity & Status Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-outline uppercase mr-1">Severity:</span>
            {['all', 'critical', 'high', 'medium', 'low'].map(sev => (
              <button
                key={sev}
                onClick={() => {
                  setSelectedSeverity(sev);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] uppercase transition-colors ${
                  selectedSeverity === sev
                    ? 'bg-primary text-on-primary font-bold shadow-sm'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-outline uppercase mr-1">Status:</span>
            {['all', 'open', 'investigating', 'containment_required', 'recovery_required', 'resolved'].map(st => (
              <button
                key={st}
                onClick={() => {
                  setSelectedStatus(st);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] uppercase transition-colors ${
                  selectedStatus === st
                    ? 'bg-secondary text-on-secondary font-bold shadow-sm'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Incidents List Table */}
      <div className="space-y-3">
        {isIncidentsLoading && filteredIncidents.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-surface-container border border-white/5 text-outline text-xs font-mono animate-pulse">
            Querying threat intelligence database...
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-surface-container border border-white/5 text-outline text-xs">
            <CheckCircle2 className="w-10 h-10 text-secondary mx-auto mb-2 opacity-80" />
            No incidents matched the selected filter criteria.
          </div>
        ) : (
          filteredIncidents.map(inc => {
            const isExpanded = expandedIncidentId === inc.id;
            return (
              <div
                key={inc.id}
                className="rounded-2xl bg-surface-container border border-white/5 hover:border-white/15 shadow-xl transition-all overflow-hidden"
              >
                {/* Main Incident Card Row */}
                <div
                  onClick={() => handleExpand(inc.id)}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer hover:bg-surface-container-high/40 transition-colors"
                >
                  <div className="flex items-start gap-3.5 flex-1">
                    <div className={`p-2 rounded-xl mt-0.5 ${
                      inc.severity === 'critical' ? 'bg-error/15 text-error' : inc.severity === 'high' ? 'bg-amber-500/15 text-amber-400' : 'bg-primary/15 text-primary'
                    }`}>
                      <AlertOctagon className="w-5 h-5" />
                    </div>

                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">{inc.refCode}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                          inc.severity === 'critical' ? 'bg-error text-on-error' : inc.severity === 'high' ? 'bg-amber-500 text-black' : 'bg-primary/20 text-primary'
                        }`}>
                          {inc.severity}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-surface-container-highest text-on-surface-variant">
                          {inc.provider.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-outline font-mono">{inc.timestamp}</span>
                      </div>

                      <h3 className="font-headline font-bold text-sm text-on-surface">{inc.title}</h3>
                      <p className="text-xs text-on-surface-variant font-mono truncate">{inc.targetResource}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 justify-between lg:justify-end">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] font-mono text-outline">AI CONFIDENCE</span>
                      <p className="text-xs font-mono font-bold text-secondary">{inc.aiConfidence}%</p>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase ${
                      inc.status === 'contained' || inc.status === 'resolved'
                        ? 'bg-secondary/15 text-secondary border border-secondary/30'
                        : 'bg-error/15 text-error border border-error/30'
                    }`}>
                      {inc.status}
                    </span>

                    <button className="p-1 text-outline hover:text-on-surface">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Accordion Body */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/5 space-y-4 bg-surface-container-lowest/40">
                    <p className="text-xs text-on-surface leading-relaxed">{inc.summary}</p>

                    {/* MITRE & Threat Actor Breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                      <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                        <span className="text-[10px] text-outline uppercase">MITRE ATT&CK Technique</span>
                        <p className="text-primary font-bold mt-0.5">{inc.mitreTechnique}</p>
                      </div>

                      <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                        <span className="text-[10px] text-outline uppercase">Threat Origin & IP</span>
                        <p className="text-error font-bold mt-0.5">{inc.actor.ip}</p>
                        <p className="text-[10px] text-outline">{inc.actor.location}</p>
                      </div>

                      <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                        <span className="text-[10px] text-outline uppercase">Blast Radius Impact</span>
                        <p className="text-on-surface font-bold mt-0.5">{inc.blastRadiusCount} Cloud Resources Affected</p>
                      </div>
                    </div>

                    {/* Evidence Steps */}
                    <div className="p-3.5 rounded-xl bg-surface-container border border-white/5 space-y-2">
                      <span className="text-[10px] font-mono text-outline uppercase font-semibold">Causal Evidence Chain:</span>
                      <div className="space-y-1.5 text-xs font-mono">
                        {inc.evidenceChain.map((ev, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <span className="text-outline text-[10px] flex-shrink-0 mt-0.5">{ev.time}</span>
                            <span className="text-on-surface font-medium">{ev.event}</span>
                            <span className="text-outline text-[11px]">— {ev.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedIncidentId(inc.id);
                            setActiveTab('investigation', inc.id);
                          }}
                          className="px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-xs flex items-center gap-1.5 hover:bg-primary-container transition-all shadow-md"
                        >
                          <BrainCircuit className="w-4 h-4" />
                          <span>AI Sentinel Deep Dive</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedIncidentId(inc.id);
                            setActiveTab('blast-radius', inc.id);
                          }}
                          className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface font-semibold text-xs flex items-center gap-1.5 transition-colors border border-white/5"
                        >
                          <ShieldAlert className="w-4 h-4 text-primary" />
                          <span>View Attack Graph</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedIncidentId(inc.id);
                            setActiveTab('recovery', inc.id);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface font-semibold text-xs flex items-center gap-1.5 transition-colors border border-white/5"
                        >
                          <ShieldCheck className="w-4 h-4 text-secondary" />
                          <span>Recovery</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {inc.status !== 'contained' && inc.status !== 'resolved' && (
                          <button
                            onClick={() => containIncident(inc.id)}
                            className="px-4 py-2 rounded-xl bg-error/15 border border-error/30 text-error hover:bg-error/25 font-semibold text-xs transition-colors"
                          >
                            Sever Blast Radius
                          </button>
                        )}

                        <button
                          onClick={() => updateIncidentStatus(inc.id, 'resolved')}
                          className="px-4 py-2 rounded-xl bg-secondary/15 border border-secondary/30 text-secondary hover:bg-secondary/25 font-semibold text-xs transition-colors"
                        >
                          Mark Resolved
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {incidentsPagination && (
        <div className="flex flex-wrap items-center justify-between p-4 rounded-2xl bg-surface-container border border-white/5 text-xs font-mono text-outline gap-2">
          <span>
            Page {incidentsPagination.page} of {incidentsPagination.totalPages || 1} ({incidentsPagination.total} total detections)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={incidentsPagination.page <= 1 || isIncidentsLoading}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-variant disabled:opacity-30 disabled:cursor-not-allowed text-on-surface flex items-center gap-1 font-sans text-xs transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              disabled={!incidentsPagination.hasMore || isIncidentsLoading}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-variant disabled:opacity-30 disabled:cursor-not-allowed text-on-surface flex items-center gap-1 font-sans text-xs transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
