import React, { useState, useRef } from 'react';
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
  Flame
} from 'lucide-react';

export const AttackGraphCanvas = () => {
  const {
    attackNodes,
    revokeCredential,
    quarantineNode,
    selectedIncident
  } = useSecurity();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState('node-iam');
  const [showCompromisedOnly, setShowCompromisedOnly] = useState(false);

  const containerRef = useRef(null);

  const selectedNode = attackNodes.find(n => n.id === selectedNodeId) || attackNodes[0];

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
        return 'border-outline text-outline bg-surface-container';
      default:
        return 'border-outline text-outline bg-surface-container';
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden flex flex-col bg-surface-container-lowest select-none">
      {/* Top Ribbon */}
      <div className="h-14 px-4 sm:px-6 flex items-center justify-between bg-surface-container-low/90 backdrop-blur-md z-30 border-b border-white/5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-primary" />
            <span className="font-headline font-bold text-sm text-on-surface">Attack Graph & Blast Radius</span>
          </div>
          <span className="hidden sm:inline h-4 w-px bg-surface-variant"></span>
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-surface-container border border-white/5">
            <span className="font-mono text-xs text-on-surface-variant">INCIDENT_REF:</span>
            <span className="font-mono text-xs text-primary font-medium">{selectedIncident?.refCode || '#INC-8891-ALPHA'}</span>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-error-container/20 border border-error/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-error"></span>
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-error font-bold uppercase">Critical Vector Active</span>
          </div>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-2">
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
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '50% 50%',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out'
            }}
            className="absolute inset-0 w-[1200px] h-[900px] left-1/2 top-4 -translate-x-1/2"
          >
            {/* SVG Edges Layer */}
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

              {/* Edge 1: Threat Actor to GitHub */}
              <path
                d="M 600,90 L 600,180"
                fill="none"
                markerEnd="url(#arrow-threat)"
                stroke="#ffb4ab"
                strokeDasharray="4,4"
                strokeWidth="2"
                className="animate-[pulse_2s_infinite]"
              />

              {/* Edge 2: GitHub to SSH Key */}
              <path
                d="M 600,240 L 600,320"
                fill="none"
                markerEnd="url(#arrow-threat)"
                stroke="#ffb4ab"
                strokeWidth="2"
              />

              {/* Edge 3: SSH Key to Repo */}
              <path
                d="M 600,380 L 600,460"
                fill="none"
                markerEnd="url(#arrow-threat)"
                stroke="#ffb4ab"
                strokeWidth="2"
              />

              {/* Edge 4: Repo to IAM Role */}
              <path
                d="M 600,520 L 600,600"
                fill="none"
                markerEnd="url(#arrow-warn)"
                stroke="#4cd7f6"
                strokeWidth="2"
              />

              {/* Edge 5A: IAM Role to AWS S3 */}
              <path
                d="M 550,650 C 550,690 400,690 400,740"
                fill="none"
                markerEnd="url(#arrow-warn)"
                stroke="#4cd7f6"
                strokeDasharray="3,3"
                strokeWidth="2"
              />

              {/* Edge 5B: IAM Role to CircleCI */}
              <path
                d="M 650,650 C 650,690 800,690 800,740"
                fill="none"
                markerEnd="url(#arrow-safe)"
                stroke="#4edea3"
                strokeDasharray="3,3"
                strokeWidth="1.5"
              />
            </svg>

            {/* Edge Floating Badges */}
            <div className="absolute left-[600px] top-[135px] -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded bg-surface-container-high/90 backdrop-blur border border-white/10 shadow-sm z-20 flex items-center gap-1.5 pointer-events-none">
              <span className="font-mono text-[10px] text-error">Session Hijack 03:42 UTC</span>
            </div>
            <div className="absolute left-[600px] top-[280px] -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded bg-surface-container-high/90 backdrop-blur border border-white/10 shadow-sm z-20 flex items-center gap-1.5 pointer-events-none">
              <span className="font-mono text-[10px] text-error font-medium">Provisioned Unauthorized</span>
            </div>
            <div className="absolute left-[600px] top-[420px] -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded bg-surface-container-high/90 backdrop-blur border border-white/10 shadow-sm z-20 flex items-center gap-1.5 pointer-events-none">
              <span className="font-mono text-[10px] text-primary">Injected Malicious Hook</span>
            </div>
            <div className="absolute left-[600px] top-[560px] -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded bg-surface-container-high/90 backdrop-blur border border-white/10 shadow-sm z-20 flex items-center gap-1.5 pointer-events-none">
              <span className="font-mono text-[10px] text-primary font-medium">Assumed High-Privilege Role</span>
            </div>
            <div className="absolute left-[440px] top-[690px] -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-surface-container-high/90 backdrop-blur border border-white/10 shadow-sm z-20 flex items-center gap-1.5 pointer-events-none">
              <span className="font-mono text-[9px] text-primary">Mass Exfil (Blocked)</span>
            </div>
            <div className="absolute left-[750px] top-[690px] -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-surface-container-high/90 backdrop-blur border border-white/10 shadow-sm z-20 flex items-center gap-1.5 pointer-events-none">
              <span className="font-mono text-[9px] text-secondary">Secondary Pivot (Safe)</span>
            </div>

            {/* Nodes Render */}
            {/* Node 1: Threat Actor */}
            <div
              onClick={() => setSelectedNodeId('node-threat')}
              className={`node-card absolute left-[600px] top-[50px] -translate-x-1/2 w-80 p-3.5 rounded-xl border bg-surface-container-high cursor-pointer transition-all ${
                selectedNodeId === 'node-threat' ? 'ring-2 ring-error scale-105 z-30' : 'hover:scale-[1.02] z-20'
              } ${getNodeBadgeColor('compromised')}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-error/20 text-error">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">Threat Actor (194.26.29.114)</h4>
                    <p className="text-[10px] text-outline font-mono">Tor Exit / C2 Origin</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-error text-on-error">
                  APT C2
                </span>
              </div>
            </div>

            {/* Node 2: GitHub Account */}
            <div
              onClick={() => setSelectedNodeId('node-github')}
              className={`node-card absolute left-[600px] top-[190px] -translate-x-1/2 w-80 p-3.5 rounded-xl border bg-surface-container-high cursor-pointer transition-all ${
                selectedNodeId === 'node-github' ? 'ring-2 ring-error scale-105 z-30' : 'hover:scale-[1.02] z-20'
              } ${getNodeBadgeColor('compromised')}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">GitHub: alex.vance</h4>
                    <p className="text-[10px] text-outline font-mono">Leaked Personal Access Token</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-error text-on-error">
                  COMPROMISED
                </span>
              </div>
            </div>

            {/* Node 3: Rogue Deploy Key */}
            <div
              onClick={() => setSelectedNodeId('node-ssh')}
              className={`node-card absolute left-[600px] top-[330px] -translate-x-1/2 w-80 p-3.5 rounded-xl border bg-surface-container-high cursor-pointer transition-all ${
                selectedNodeId === 'node-ssh' ? 'ring-2 ring-error scale-105 z-30' : 'hover:scale-[1.02] z-20'
              } ${getNodeBadgeColor('compromised')}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">Rogue Deploy Key (ed25519)</h4>
                    <p className="text-[10px] text-outline font-mono">Unauthorized SSH Provisioning</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-error text-on-error">
                  HIGH THREAT
                </span>
              </div>
            </div>

            {/* Node 4: Repo */}
            <div
              onClick={() => setSelectedNodeId('node-repo')}
              className={`node-card absolute left-[600px] top-[470px] -translate-x-1/2 w-80 p-3.5 rounded-xl border bg-surface-container-high cursor-pointer transition-all ${
                selectedNodeId === 'node-repo' ? 'ring-2 ring-primary scale-105 z-30' : 'hover:scale-[1.02] z-20'
              } ${getNodeBadgeColor('warning')}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">Repo: infra-terraform-core</h4>
                    <p className="text-[10px] text-outline font-mono">CI/CD Pipeline Modified</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-primary text-on-primary">
                  PIVOT POINT
                </span>
              </div>
            </div>

            {/* Node 5: IAM Role */}
            <div
              onClick={() => setSelectedNodeId('node-iam')}
              className={`node-card absolute left-[600px] top-[610px] -translate-x-1/2 w-80 p-3.5 rounded-xl border bg-surface-container-high cursor-pointer transition-all ${
                selectedNodeId === 'node-iam' ? 'ring-2 ring-error scale-105 z-30' : 'hover:scale-[1.02] z-20'
              } ${getNodeBadgeColor('compromised')}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">Role: Deployer-Prod-Admin</h4>
                    <p className="text-[10px] text-outline font-mono">Full S3 & KMS Privileges</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-error text-on-error">
                  ESCALATED
                </span>
              </div>
            </div>

            {/* Node 6A: AWS S3 */}
            <div
              onClick={() => setSelectedNodeId('node-s3')}
              className={`node-card absolute left-[350px] top-[750px] -translate-x-1/2 w-72 p-3.5 rounded-xl border bg-surface-container-high cursor-pointer transition-all ${
                selectedNodeId === 'node-s3' ? 'ring-2 ring-secondary scale-105 z-30' : 'hover:scale-[1.02] z-20'
              } ${getNodeBadgeColor('contained')}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">AWS S3: prod-vault</h4>
                    <p className="text-[10px] text-outline font-mono">Customer PII Database</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-secondary text-on-secondary">
                  CONTAINED
                </span>
              </div>
            </div>

            {/* Node 6B: CircleCI */}
            <div
              onClick={() => setSelectedNodeId('node-circleci')}
              className={`node-card absolute left-[850px] top-[750px] -translate-x-1/2 w-72 p-3.5 rounded-xl border bg-surface-container-high cursor-pointer transition-all ${
                selectedNodeId === 'node-circleci' ? 'ring-2 ring-secondary scale-105 z-30' : 'hover:scale-[1.02] z-20'
              } ${getNodeBadgeColor('safe')}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">CircleCI OAuth Hook</h4>
                    <p className="text-[10px] text-outline font-mono">Cross-SaaS Sync Pipe</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-surface-container text-on-surface-variant">
                  NOMINAL
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right-Side Node Inspector */}
        <div className="w-80 sm:w-96 bg-surface-container-low border-l border-white/5 flex flex-col justify-between p-5 z-30 shadow-2xl overflow-y-auto">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <span className="font-mono text-xs text-outline uppercase tracking-wider">Node Inspector</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                selectedNode.status === 'compromised' ? 'bg-error text-on-error' : 'bg-secondary text-on-secondary'
              }`}>
                {selectedNode.status}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-primary font-bold">{selectedNode.provider.toUpperCase()}</span>
                <span className="w-1 h-1 rounded-full bg-outline"></span>
                <span className="text-xs text-outline capitalize">{selectedNode.type}</span>
              </div>
              <h3 className="font-headline font-bold text-base text-on-surface">{selectedNode.label}</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">{selectedNode.sublabel}</p>
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
                <span className="text-[10px] font-mono text-outline uppercase">Assets in Blast Tier</span>
                <p className="text-lg font-mono font-bold text-on-surface mt-1">
                  {selectedNode.metadata.exposedItems || '5'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                <span className="text-[10px] font-mono text-outline uppercase">Propagation Speed</span>
                <p className="text-lg font-mono font-bold text-primary mt-1">1.2s</p>
              </div>
            </div>

            {/* Permissions / Attributes */}
            {selectedNode.metadata.permissions && (
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

            {selectedNode.metadata.ip && (
              <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1 font-mono text-xs">
                <div className="text-outline text-[10px]">SOURCE IP ADDRESS</div>
                <div className="text-error font-bold">{selectedNode.metadata.ip}</div>
                <div className="text-on-surface-variant text-[11px]">Associated with Tor Exit Node Cluster</div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-white/5 space-y-2">
            <button
              onClick={() => revokeCredential(selectedNode.id)}
              className="w-full py-2.5 px-4 rounded-xl bg-error/15 border border-error/30 text-error hover:bg-error/25 font-semibold text-xs transition-colors flex items-center justify-center gap-2"
            >
              <Key className="w-3.5 h-3.5" />
              Revoke Key & Clear Tokens
            </button>

            <button
              onClick={() => quarantineNode(selectedNode.id)}
              className="w-full py-2.5 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-colors flex items-center justify-center gap-2 border border-white/5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              Isolate & Sever Blast Radius
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

