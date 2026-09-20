import React, { useState, useRef, useMemo } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Route,
  ShieldAlert,
  Key,
  Database,
  User,
  GitBranch,
  Lock,
  Layers,
  Flame,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Server,
  Share2,
  ShieldCheck
} from 'lucide-react';

export const AttackGraphCanvas = () => {
  const {
    attackNodes,
    attackEdges,
    blastRadiusData,
    isGraphLoading,
    graphViewMode,
    setGraphViewMode,
    syncUserGraph,
    revokeCredential,
    quarantineNode,
    selectedIncident,
    setActiveTab
  } = useSecurity();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showCompromisedOnly, setShowCompromisedOnly] = useState(false);

  const containerRef = useRef(null);

  // Map nodes by ID for O(1) edge lookups
  const nodeMap = useMemo(() => {
    const map = new Map();
    (attackNodes || []).forEach(n => map.set(String(n.id), n));
    return map;
  }, [attackNodes]);

  // Active selected node with safe fallback
  const selectedNode = useMemo(() => {
    if (selectedNodeId && nodeMap.has(selectedNodeId)) {
      return nodeMap.get(selectedNodeId);
    }
    return attackNodes && attackNodes.length > 0 ? attackNodes[0] : null;
  }, [selectedNodeId, nodeMap, attackNodes]);

  // Deterministic Blast Radius Score (Task 12)
  const blastRadiusScore = useMemo(() => {
    if (blastRadiusData?.metrics?.blastRadiusScore !== undefined) {
      return Math.round(blastRadiusData.metrics.blastRadiusScore);
    }
    if (selectedIncident?.blastRadiusCount) {
      return Math.min(selectedIncident.blastRadiusCount * 25, 95);
    }
    return null;
  }, [blastRadiusData, selectedIncident]);

  const handleMouseDown = (e) => {
    if (e.target.closest('.node-card')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.15, 1.8));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.15, 0.6));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const getNodeBadgeColor = (status) => {
    switch (status) {
      case 'compromised':
        return 'border-error text-error bg-error/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
      case 'warning':
        return 'border-primary text-primary bg-primary/10';
      case 'contained':
        return 'border-secondary text-secondary bg-secondary/10';
      case 'safe':
      default:
        return 'border-white/10 text-outline bg-surface-container';
    }
  };

  const renderNodeIcon = (type = '', provider = '') => {
    const t = String(type).toLowerCase();
    const p = String(provider).toLowerCase();

    if (t === 'actor' || t === 'threat' || p === 'threat') return <ShieldAlert className="w-4 h-4 text-error" />;
    if (t === 'account' || t === 'user' || p === 'github') return <User className="w-4 h-4 text-purple-400" />;
    if (t === 'credential' || t === 'sshkey' || t === 'key') return <Key className="w-4 h-4 text-amber-400" />;
    if (t === 'repo' || t === 'repository') return <GitBranch className="w-4 h-4 text-blue-400" />;
    if (t === 'role' || t === 'iam') return <Lock className="w-4 h-4 text-amber-400" />;
    if (t === 'bucket' || t === 'database' || t === 's3') return <Database className="w-4 h-4 text-emerald-400" />;
    if (t === 'oauth' || t === 'oauthapp') return <Layers className="w-4 h-4 text-sky-400" />;
    return <Server className="w-4 h-4 text-primary" />;
  };

  const visibleNodes = (attackNodes || []).filter(node => {
    if (showCompromisedOnly) return node.status === 'compromised';
    return true;
  });

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden flex flex-col bg-surface-container-lowest select-none">
      {/* Top Ribbon */}
      <div className="h-16 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-surface-container-low/90 backdrop-blur-md z-30 border-b border-white/5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-primary" />
            <span className="font-headline font-bold text-sm text-on-surface">Attack Graph & Blast Radius</span>
          </div>

          <span className="hidden sm:inline h-4 w-px bg-surface-variant"></span>

          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-surface-container border border-white/5">
            <span className="font-mono text-xs text-on-surface-variant">INCIDENT_REF:</span>
            <span className="font-mono text-xs text-primary font-medium">
              {selectedIncident?.refCode || 'GLOBAL_TOPOLOGY'}
            </span>
          </div>

          {/* Blast Radius Score Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/30">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono text-[10px] sm:text-xs text-amber-300 font-bold uppercase">
              Blast Radius: {blastRadiusScore !== null ? `${blastRadiusScore}/100` : '--'}
            </span>
          </div>
        </div>

        {/* View Controls & Neo4j Sync */}
        <div className="flex items-center gap-2.5">
          {/* Scope Toggle: Incident vs Overview */}
          <div className="flex items-center bg-surface-container rounded-lg p-0.5 border border-white/5 shadow-sm">
            <button
              onClick={() => setGraphViewMode('incident')}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                graphViewMode === 'incident'
                  ? 'bg-primary text-on-primary shadow'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Incident Scope
            </button>
            <button
              onClick={() => setGraphViewMode('overview')}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                graphViewMode === 'overview'
                  ? 'bg-primary text-on-primary shadow'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Identity Overview
            </button>
          </div>

          {/* Sync Neo4j Graph Button */}
          <button
            onClick={() => syncUserGraph()}
            disabled={isGraphLoading}
            title="Explicitly synchronize PostgreSQL records into Neo4j graph projection"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface border border-white/5 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-primary ${isGraphLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isGraphLoading ? 'Syncing...' : 'Sync Neo4j'}</span>
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center bg-surface-container rounded-lg p-0.5 border border-white/5 shadow-sm">
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1.5 rounded hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Compromised Path Toggle */}
          <button
            onClick={() => setShowCompromisedOnly(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              showCompromisedOnly
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-surface-container border-white/5 text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Compromised Path</span>
            <span className="px-1 py-0.2 rounded bg-primary/30 text-primary font-mono text-[9px]">
              {showCompromisedOnly ? 'ACTIVE' : 'ALL'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Graph Stage + Inspector */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className={`relative flex-1 overflow-hidden bg-[radial-gradient(#272a32_1px,transparent_1px)] [background-size:24px_24px] ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {visibleNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-surface-container border border-white/10 text-primary">
                <Route className="w-8 h-8 opacity-70 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="font-headline font-bold text-sm text-on-surface">Neo4j Attack Graph Awaiting Projection</h3>
                <p className="text-xs text-on-surface-variant max-w-sm">
                  No topological nodes are mapped for this scope yet. Sync your PostgreSQL security fabric with the Neo4j graph engine.
                </p>
              </div>
              <button
                onClick={() => syncUserGraph()}
                disabled={isGraphLoading}
                className="px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-xs flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-md disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGraphLoading ? 'animate-spin' : ''}`} />
                <span>{isGraphLoading ? 'Synchronizing Projection...' : 'Synchronize Neo4j Graph'}</span>
              </button>
            </div>
          ) : (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '50% 50%',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
              }}
              className="absolute inset-0 w-[1300px] h-[950px] left-1/2 top-4 -translate-x-1/2"
            >
              {/* Dynamic SVG Edges Layer */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                <defs>
                  <marker id="arrow-threat" markerHeight="6" markerWidth="6" orient="auto-start-reverse" refX="6" refY="5" viewBox="0 0 10 10">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#ffb4ab" />
                  </marker>
                  <marker id="arrow-warn" markerHeight="6" markerWidth="6" orient="auto-start-reverse" refX="6" refY="5" viewBox="0 0 10 10">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#4cd7f6" />
                  </marker>
                  <marker id="arrow-safe" markerHeight="6" markerWidth="6" orient="auto-start-reverse" refX="6" refY="5" viewBox="0 0 10 10">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#4edea3" />
                  </marker>
                </defs>

                {(attackEdges || []).map((edge) => {
                  const src = nodeMap.get(String(edge.source));
                  const tgt = nodeMap.get(String(edge.target));
                  if (!src || !tgt) return null;
                  if (showCompromisedOnly && (src.status !== 'compromised' || tgt.status !== 'compromised')) {
                    return null;
                  }

                  const startX = src.x;
                  const startY = src.y + 40;
                  const endX = tgt.x;
                  const endY = tgt.y - 40;
                  const midY = (startY + endY) / 2;
                  const pathD = `M ${startX},${startY} C ${startX},${midY} ${endX},${midY} ${endX},${endY}`;

                  const strokeColor = edge.status === 'threat'
                    ? '#ffb4ab'
                    : edge.status === 'warn' || edge.status === 'warning'
                    ? '#4cd7f6'
                    : '#4edea3';

                  const markerId = edge.status === 'threat'
                    ? 'arrow-threat'
                    : edge.status === 'warn' || edge.status === 'warning'
                    ? 'arrow-warn'
                    : 'arrow-safe';

                  return (
                    <path
                      key={edge.id}
                      d={pathD}
                      fill="none"
                      markerEnd={`url(#${markerId})`}
                      stroke={strokeColor}
                      strokeDasharray={edge.animated || edge.status === 'threat' ? '4,4' : undefined}
                      strokeWidth="2"
                      className={edge.animated || edge.status === 'threat' ? 'animate-[pulse_2s_infinite]' : undefined}
                    />
                  );
                })}
              </svg>

              {/* Dynamic Floating Edge Badges */}
              {(attackEdges || []).map((edge) => {
                const src = nodeMap.get(String(edge.source));
                const tgt = nodeMap.get(String(edge.target));
                if (!src || !tgt || !edge.label) return null;
                if (showCompromisedOnly && (src.status !== 'compromised' || tgt.status !== 'compromised')) {
                  return null;
                }

                const midX = (src.x + tgt.x) / 2;
                const midY = (src.y + tgt.y) / 2;

                const textColor = edge.status === 'threat'
                  ? 'text-error'
                  : edge.status === 'warn' || edge.status === 'warning'
                  ? 'text-primary'
                  : 'text-secondary';

                return (
                  <div
                    key={`badge-${edge.id}`}
                    style={{ left: `${midX}px`, top: `${midY}px` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded bg-surface-container-high/90 backdrop-blur border border-white/10 shadow-sm z-20 flex items-center gap-1.5 pointer-events-none whitespace-nowrap"
                  >
                    <span className={`font-mono text-[10px] font-medium ${textColor}`}>
                      {edge.label}
                    </span>
                  </div>
                );
              })}

              {/* Dynamic Node Cards */}
              {visibleNodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{
                      left: `${node.x}px`,
                      top: `${node.y}px`
                    }}
                    className={`node-card absolute -translate-x-1/2 -translate-y-1/2 w-72 sm:w-80 p-3.5 rounded-xl border bg-surface-container-high cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-primary scale-105 z-30 shadow-xl' : 'hover:scale-[1.02] z-20'
                    } ${getNodeBadgeColor(node.status)}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-surface-container-highest">
                          {renderNodeIcon(node.type, node.provider)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-on-surface truncate">{node.label}</h4>
                          <p className="text-[10px] text-outline font-mono truncate">{node.sublabel}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 ${
                        node.status === 'compromised'
                          ? 'bg-error text-on-error'
                          : node.status === 'warning'
                          ? 'bg-primary text-on-primary'
                          : node.status === 'contained'
                          ? 'bg-secondary text-on-secondary'
                          : 'bg-surface-container text-outline'
                      }`}>
                        {node.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right-Side Node Inspector */}
        <div className="w-80 sm:w-96 bg-surface-container-low border-l border-white/5 flex flex-col justify-between p-5 z-30 shadow-2xl overflow-y-auto">
          {selectedNode ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <span className="font-mono text-xs text-outline uppercase tracking-wider">Node Inspector</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  selectedNode.status === 'compromised'
                    ? 'bg-error text-on-error'
                    : selectedNode.status === 'warning'
                    ? 'bg-primary text-on-primary'
                    : 'bg-secondary text-on-secondary'
                }`}>
                  {selectedNode.status}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-primary font-bold">
                    {(selectedNode.provider || 'IDENTITY').toUpperCase()}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-outline"></span>
                  <span className="text-xs text-outline capitalize">{selectedNode.type}</span>
                </div>
                <h3 className="font-headline font-bold text-base text-on-surface">{selectedNode.label}</h3>
                <p className="text-xs text-on-surface-variant mt-0.5 font-mono">{selectedNode.sublabel}</p>
              </div>

              {/* Risk Gauge */}
              <div className="p-4 rounded-xl bg-surface-container border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-on-surface flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-error" />
                    Calculated Risk Score
                  </span>
                  <span className="text-sm font-mono font-bold text-error">{selectedNode.riskScore} / 100</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
                  <div
                    style={{ width: `${selectedNode.riskScore}%` }}
                    className="h-full bg-gradient-to-r from-amber-400 to-error rounded-full"
                  ></div>
                </div>
              </div>

              {/* Blast Radius Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                  <span className="text-[10px] font-mono text-outline uppercase">Hop Distance</span>
                  <p className="text-lg font-mono font-bold text-on-surface mt-1">
                    {selectedNode.metadata?.distance !== undefined ? selectedNode.metadata.distance : (selectedNode.status === 'compromised' ? '1' : '2')}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                  <span className="text-[10px] font-mono text-outline uppercase">Impact Type</span>
                  <p className="text-sm font-mono font-bold text-primary mt-2">
                    {selectedNode.metadata?.impactType || (selectedNode.status === 'compromised' ? 'DIRECT' : 'INDIRECT')}
                  </p>
                </div>
              </div>

              {/* Permissions / Attributes */}
              {selectedNode.metadata?.permissions && Array.isArray(selectedNode.metadata.permissions) && (
                <div className="space-y-2">
                  <span className="text-xs font-mono text-outline">EXPOSED PERMISSIONS:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.metadata.permissions.map(perm => (
                      <span key={perm} className="px-2 py-1 rounded bg-surface-container text-[11px] font-mono text-primary border border-primary/20">
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Source IP / ARN */}
              {selectedNode.metadata?.ip && (
                <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1 font-mono text-xs">
                  <div className="text-outline text-[10px]">SOURCE IP ADDRESS</div>
                  <div className="text-error font-bold">{selectedNode.metadata.ip}</div>
                  <div className="text-on-surface-variant text-[11px]">
                    {selectedNode.metadata.network || selectedNode.metadata.source || 'Observed Ingress Source'}
                  </div>
                </div>
              )}

              {selectedNode.metadata?.arn && (
                <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1 font-mono text-xs">
                  <div className="text-outline text-[10px]">RESOURCE IDENTIFIER</div>
                  <div className="text-primary truncate">{selectedNode.metadata.arn}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center p-6 text-outline font-mono text-xs">
              Select a node in the graph to inspect its blast radius and permissions.
            </div>
          )}

          {/* Action Buttons */}
          {selectedNode && (
            <div className="pt-4 border-t border-white/5 space-y-2">
              {selectedIncident?.id && (
                <button
                  onClick={() => setActiveTab('recovery', selectedIncident.id)}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary hover:brightness-110 font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Launch Recovery Center
                </button>
              )}

              <button
                onClick={() => revokeCredential(selectedNode.id)}
                className="w-full py-2 px-4 rounded-xl bg-error/15 border border-error/30 text-error hover:bg-error/25 font-semibold text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Key className="w-3.5 h-3.5" />
                Revoke Key & Clear Tokens
              </button>

              <button
                onClick={() => quarantineNode(selectedNode.id)}
                className="w-full py-2 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-colors flex items-center justify-center gap-2 border border-white/5"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                Isolate & Sever Blast Radius
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
