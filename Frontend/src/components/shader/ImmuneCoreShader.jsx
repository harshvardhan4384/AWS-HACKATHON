import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Cloud,
  Laptop,
  Globe,
  Key,
  Radio,
  RefreshCw,
  XCircle,
  Play
} from 'lucide-react';

/**
 * Re:COVER Digital Immune System Visualization
 * 
 * Replaces generic glowing planet/solar-system shader with a live cybersecurity
 * identity topology network graph that visually communicates:
 * "Re:COVER continuously monitors digital identity, detects relationships/events,
 * identifies threats, and isolates/recovers compromised accounts."
 * 
 * Performance:
 * - 60 FPS HTML5 Canvas render loop for telemetry particle streams & connection lines
 * - Hardware-accelerated CSS/SVG for crisp text, badges, and responsive node cards
 * - Zero heavy external dependencies (pure Canvas 2D + Lucide icons + Tailwind)
 * - Complete prefers-reduced-motion compliance
 */
export const ImmuneCoreShader = ({
  className = "w-full h-full relative overflow-hidden",
  intensity = 1.0,
  simState = 'idle',
  onSimulateClick
}) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);

  // External Re:COVER context integration
  let connectedAccounts = [];
  try {
    const sec = useSecurity();
    if (sec && sec.connectedAccounts) connectedAccounts = sec.connectedAccounts;
  } catch (e) {
    // Context fallback
  }

  let activeAlert = null;
  try {
    const notif = useNotifications();
    if (notif && notif.activeAlert) activeAlert = notif.activeAlert;
  } catch (e) {
    // Context fallback
  }

  // Visualization States: 'normal' | 'threat' | 'isolated' | 'recovered'
  const [threatPhase, setThreatPhase] = useState('normal');
  const [compromisedNodeId, setCompromisedNodeId] = useState('github');
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [ambientEvent, setAmbientEvent] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 450 });

  // Reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Synchronize with external simState
  useEffect(() => {
    if (simState === 'simulating') {
      setCompromisedNodeId('github');
      setThreatPhase('threat');
      const timer = setTimeout(() => {
        setThreatPhase('isolated');
      }, 700);
      return () => clearTimeout(timer);
    } else if (simState === 'mitigated') {
      setThreatPhase('recovered');
      const timer = setTimeout(() => {
        setThreatPhase('normal');
      }, 3500);
      return () => clearTimeout(timer);
    } else {
      setThreatPhase('normal');
    }
  }, [simState]);

  // Synchronize with live incoming WebSocket alerts
  useEffect(() => {
    if (activeAlert && (activeAlert.severity === 'HIGH' || activeAlert.severity === 'CRITICAL')) {
      const p = (activeAlert.provider || 'github').toLowerCase();
      setCompromisedNodeId(p === 'google' ? 'google' : p === 'aws' ? 'aws' : 'github');
      setThreatPhase('threat');
      const timer1 = setTimeout(() => setThreatPhase('isolated'), 900);
      const timer2 = setTimeout(() => setThreatPhase('recovered'), 4500);
      const timer3 = setTimeout(() => setThreatPhase('normal'), 7500);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }
  }, [activeAlert]);

  // Ambient benign security events (e.g. periodic token pings, audit log heartbeats)
  useEffect(() => {
    if (threatPhase !== 'normal' || reducedMotion) return;

    const benignEvents = [
      { node: 'github', label: '● SSH Key Verified', type: 'SSH_VERIFIED' },
      { node: 'google', label: '● OAuth Token Synced', type: 'TOKEN_SYNC' },
      { node: 'aws', label: '● STS Lease Audited', type: 'STS_AUDIT' },
      { node: 'devices', label: '● TPM Attestation Ok', type: 'TPM_CHECK' },
      { node: 'sessions', label: '● Session Leases Ok', type: 'SESSION_AUDIT' }
    ];

    let idx = 0;
    const interval = setInterval(() => {
      const evt = benignEvents[idx % benignEvents.length];
      idx++;
      setAmbientEvent(evt);
      const clearTimer = setTimeout(() => setAmbientEvent(null), 2400);
      return () => clearTimeout(clearTimer);
    }, 4200);

    return () => clearInterval(interval);
  }, [threatPhase, reducedMotion]);

  // Resize and responsive layout management
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth || 800;
      const h = containerRef.current.clientHeight || 450;
      setDimensions({ width: w, height: h });
      setIsMobile(w < 640);
      setIsTablet(w >= 640 && w < 960);
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute node coordinates based on responsive layout
  const nodes = useMemo(() => {
    const { width, height } = dimensions;

    if (isMobile) {
      // Mobile simplified hierarchy: Digital Identity top, Google/GitHub/AWS in bottom row
      return {
        identity: { id: 'identity', x: width * 0.50, y: height * 0.28, label: 'DIGITAL IDENTITY' },
        google: { id: 'google', x: width * 0.20, y: height * 0.74, label: 'Google', code: 'G', sub: 'OAuth 2.0', icon: 'google' },
        github: { id: 'github', x: width * 0.50, y: height * 0.74, label: 'GitHub', code: 'GH', sub: 'Audit Log', icon: 'github' },
        aws: { id: 'aws', x: width * 0.80, y: height * 0.74, label: 'AWS', code: 'AWS', sub: 'STS Roles', icon: 'aws' },
      };
    }

    if (isTablet) {
      // Tablet: 4 primary nodes balanced around identity
      return {
        identity: { id: 'identity', x: width * 0.50, y: height * 0.50, label: 'DIGITAL IDENTITY' },
        google: { id: 'google', x: width * 0.22, y: height * 0.26, label: 'Google', code: 'G', sub: 'Workspace SSO', icon: 'google' },
        github: { id: 'github', x: width * 0.16, y: height * 0.64, label: 'GitHub', code: 'GH', sub: 'Developer & SSH', icon: 'github' },
        aws: { id: 'aws', x: width * 0.84, y: height * 0.64, label: 'AWS Cloud', code: 'AWS', sub: 'IAM & STS', icon: 'aws' },
        devices: { id: 'devices', x: width * 0.78, y: height * 0.26, label: 'Devices', code: 'DEV', sub: 'Hardware TPM', icon: 'devices' },
      };
    }

    // Desktop: Full 6-node constellation with symmetrical spacing
    return {
      identity: { id: 'identity', x: width * 0.50, y: height * 0.50, label: 'DIGITAL IDENTITY' },
      google: { id: 'google', x: width * 0.22, y: height * 0.25, label: 'Google', code: 'G', sub: 'Workspace SSO', icon: 'google' },
      github: { id: 'github', x: width * 0.14, y: height * 0.54, label: 'GitHub', code: 'GH', sub: 'Developer & SSH', icon: 'github' },
      devices: { id: 'devices', x: width * 0.24, y: height * 0.80, label: 'Enrolled Devices', code: 'DEV', sub: 'Hardware TPM', icon: 'devices' },
      sessions: { id: 'sessions', x: width * 0.78, y: height * 0.25, label: 'Active Sessions', code: 'SESS', sub: 'Zero-Trust Leases', icon: 'sessions' },
      aws: { id: 'aws', x: width * 0.86, y: height * 0.54, label: 'AWS Cloud', code: 'AWS', sub: 'IAM & STS Roles', icon: 'aws' },
      oauth: { id: 'oauth', x: width * 0.76, y: height * 0.80, label: 'OAuth Ecosystem', code: 'APPS', sub: 'Scoped Integrations', icon: 'oauth' },
    };
  }, [dimensions, isMobile, isTablet]);

  // Continuous Telemetry Particles State for Canvas
  const particlesRef = useRef([]);

  useEffect(() => {
    // Generate initial telemetry particles along active connection rays
    const keys = Object.keys(nodes).filter(k => k !== 'identity');
    const parts = [];
    keys.forEach((k) => {
      // 3-4 particles per connection line at staggered initial progress
      for (let i = 0; i < 3; i++) {
        parts.push({
          sourceId: k,
          progress: (i / 3) + Math.random() * 0.15,
          speed: 0.20 + Math.random() * 0.08,
          radius: 2.2,
          pulseSize: 1.0,
        });
      }
    });
    particlesRef.current = parts;
  }, [nodes]);

  // Canvas Render Loop (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    let lastTime = performance.now();
    let pulseAngle = 0;
    let attackPacketProgress = 0;
    let recoverySweepProgress = 0;

    const render = (time) => {
      const dt = Math.min((time - lastTime) * 0.001, 0.1);
      lastTime = time;
      pulseAngle += dt * 1.5;

      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      const center = nodes.identity;
      if (!center) return;

      // ── 1. Subtle Cybersecurity Dot-Matrix Coordinate Grid ────────────────
      ctx.fillStyle = 'rgba(76, 215, 246, 0.025)';
      const step = isMobile ? 36 : 48;
      for (let gx = 16; gx < dimensions.width; gx += step) {
        for (let gy = 16; gy < dimensions.height; gy += step) {
          ctx.beginPath();
          ctx.arc(gx, gy, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── 2. Central Identity Subtle Breathing Aura ─────────────────────────
      const auraPulse = Math.sin(pulseAngle) * 4;
      const auraRadius = (isMobile ? 32 : 46) + auraPulse;
      const grad = ctx.createRadialGradient(center.x, center.y, 10, center.x, center.y, auraRadius + 24);

      if (threatPhase === 'threat') {
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.24)');
        grad.addColorStop(0.5, 'rgba(239, 68, 68, 0.08)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      } else if (threatPhase === 'isolated') {
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.20)');
        grad.addColorStop(0.5, 'rgba(76, 215, 246, 0.08)');
        grad.addColorStop(1, 'rgba(76, 215, 246, 0)');
      } else if (threatPhase === 'recovered') {
        grad.addColorStop(0, 'rgba(78, 222, 163, 0.24)');
        grad.addColorStop(0.5, 'rgba(78, 222, 163, 0.08)');
        grad.addColorStop(1, 'rgba(78, 222, 163, 0)');
      } else {
        grad.addColorStop(0, 'rgba(76, 215, 246, 0.16)');
        grad.addColorStop(0.6, 'rgba(76, 215, 246, 0.04)');
        grad.addColorStop(1, 'rgba(76, 215, 246, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(center.x, center.y, auraRadius + 24, 0, Math.PI * 2);
      ctx.fill();

      // Core protective shield perimeter
      ctx.strokeStyle = threatPhase === 'threat'
        ? 'rgba(239, 68, 68, 0.4)'
        : threatPhase === 'isolated'
        ? 'rgba(245, 158, 11, 0.35)'
        : threatPhase === 'recovered'
        ? 'rgba(78, 222, 163, 0.45)'
        : 'rgba(76, 215, 246, 0.25)';
      ctx.lineWidth = 1.0;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, auraRadius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── 3. Connection Lines & Telemetry Streaming ─────────────────────────
      const otherNodeKeys = Object.keys(nodes).filter(k => k !== 'identity');

      otherNodeKeys.forEach((key) => {
        const node = nodes[key];
        if (!node) return;

        const isTarget = key === compromisedNodeId;
        const isHovered = key === hoveredNodeId;

        ctx.save();

        if (isTarget && threatPhase === 'isolated') {
          // ── TOPOLOGICAL ISOLATION: Severed Connection with Quarantine Barrier ──
          // Segment from node to 36% distance
          const dx = center.x - node.x;
          const dy = center.y - node.y;
          const p1x = node.x + dx * 0.32;
          const p1y = node.y + dy * 0.32;
          const p2x = node.x + dx * 0.68;
          const p2y = node.y + dy * 0.68;

          // Node-side stub (compromised)
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(p1x, p1y);
          ctx.stroke();

          // Center-side stub (isolated)
          ctx.strokeStyle = 'rgba(76, 215, 246, 0.3)';
          ctx.beginPath();
          ctx.moveTo(p2x, p2y);
          ctx.lineTo(center.x, center.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Quarantine Barrier Cross in severed gap
          const midX = node.x + dx * 0.50;
          const midY = node.y + dy * 0.50;

          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(midX, midY, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Barrier "X"
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(midX - 5, midY - 5);
          ctx.lineTo(midX + 5, midY + 5);
          ctx.moveTo(midX + 5, midY - 5);
          ctx.lineTo(midX - 5, midY + 5);
          ctx.stroke();

        } else if (isTarget && threatPhase === 'threat') {
          // ── THREAT IN PROGRESS: Pulsing Red Alert Line ────────────────────
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(center.x, center.y);
          ctx.stroke();

          // Moving Threat Wavefront towards Identity
          attackPacketProgress = (attackPacketProgress + dt * 1.4) % 1.0;
          const ax = node.x + (center.x - node.x) * attackPacketProgress;
          const ay = node.y + (center.y - node.y) * attackPacketProgress;

          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(ax, ay, 5, 0, Math.PI * 2);
          ctx.fill();

        } else if (isTarget && threatPhase === 'recovered') {
          // ── RECOVERY IN PROGRESS: Emerald Sweep Restoring Topology ────────
          recoverySweepProgress = Math.min(recoverySweepProgress + dt * 0.9, 1.0);
          ctx.strokeStyle = 'rgba(78, 222, 163, 0.7)';
          ctx.lineWidth = 1.8;
          ctx.shadowColor = '#4edea3';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(center.x, center.y);
          ctx.stroke();

          // Green verification packet
          const rx = node.x + (center.x - node.x) * (1 - recoverySweepProgress);
          const ry = node.y + (center.y - node.y) * (1 - recoverySweepProgress);
          ctx.fillStyle = '#4edea3';
          ctx.beginPath();
          ctx.arc(rx, ry, 4, 0, Math.PI * 2);
          ctx.fill();

        } else {
          // ── NORMAL / HEALTHY TELEMETRY CONNECTION ─────────────────────────
          ctx.strokeStyle = isHovered
            ? 'rgba(76, 215, 246, 0.7)'
            : 'rgba(76, 215, 246, 0.18)';
          ctx.lineWidth = isHovered ? 1.8 : 1.0;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(center.x, center.y);
          ctx.stroke();

          // Ambient benign event ping highlight
          if (ambientEvent && ambientEvent.node === key) {
            ctx.strokeStyle = 'rgba(78, 222, 163, 0.4)';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([6, 8]);
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(center.x, center.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        ctx.restore();
      });

      // ── 4. Flowing Telemetry Particles (Continuous Ingestion Stream) ──────
      if (!reducedMotion && threatPhase !== 'threat') {
        const parts = particlesRef.current;
        parts.forEach((p) => {
          // If this node is isolated, do not flow particles
          if (p.sourceId === compromisedNodeId && threatPhase === 'isolated') {
            return;
          }

          const srcNode = nodes[p.sourceId];
          if (!srcNode) return;

          // Advance progress
          p.progress += dt * p.speed;
          if (p.progress >= 1.0) {
            p.progress = 0;
            p.speed = 0.18 + Math.random() * 0.10;
          }

          const px = srcNode.x + (center.x - srcNode.x) * p.progress;
          const py = srcNode.y + (center.y - srcNode.y) * p.progress;

          ctx.save();
          ctx.fillStyle = (ambientEvent && ambientEvent.node === p.sourceId)
            ? '#4edea3'
            : 'rgba(76, 215, 246, 0.85)';
          ctx.shadowColor = '#4cd7f6';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(px, py, p.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      if (!reducedMotion) {
        animationFrameId.current = requestAnimationFrame(render);
      }
    };

    // Render initial frame
    if (reducedMotion) {
      render(performance.now());
    } else {
      animationFrameId.current = requestAnimationFrame(render);
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [nodes, dimensions, threatPhase, compromisedNodeId, hoveredNodeId, ambientEvent, reducedMotion, isMobile]);

  // Quick manual attack trigger for testing directly from hero
  const handleQuickTrigger = (nodeId) => {
    if (threatPhase !== 'normal') return;
    setCompromisedNodeId(nodeId);
    setThreatPhase('threat');
    setTimeout(() => setThreatPhase('isolated'), 800);
    setTimeout(() => setThreatPhase('recovered'), 3600);
    setTimeout(() => setThreatPhase('normal'), 6200);
  };

  return (
    <div ref={containerRef} className={className}>
      {/* Background Canvas for 60 FPS Telemetry Lines & Particle Stream */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block absolute inset-0 pointer-events-none"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {/* ── Central Digital Identity Node Card ──────────────────────────────── */}
      {nodes.identity && (
        <div
          style={{ left: `${nodes.identity.x}px`, top: `${nodes.identity.y}px` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none z-20 pointer-events-auto"
        >
          <div className="relative flex items-center justify-center">
            {/* Subtle rotating perimeter ring */}
            <div
              className={`absolute -inset-2.5 sm:-inset-3.5 rounded-full border transition-all duration-700 ${
                threatPhase === 'threat'
                  ? 'border-error/50 bg-error/10 animate-ping'
                  : threatPhase === 'isolated'
                  ? 'border-amber-400/40 bg-amber-400/5'
                  : threatPhase === 'recovered'
                  ? 'border-secondary/50 bg-secondary/10'
                  : 'border-primary/25 bg-primary/5'
              }`}
            />

            {/* Central Identity Core Glyph */}
            <div
              className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl backdrop-blur-md border shadow-xl flex items-center justify-center transition-all duration-500 ${
                threatPhase === 'threat'
                  ? 'bg-surface-container-highest border-error text-error shadow-error/20 scale-105'
                  : threatPhase === 'isolated'
                  ? 'bg-surface-container-highest border-amber-400/60 text-amber-300 shadow-amber-400/20'
                  : threatPhase === 'recovered'
                  ? 'bg-surface-container-highest border-secondary text-secondary shadow-secondary/20'
                  : 'bg-surface-container-highest/95 border-primary/40 text-primary shadow-primary/10'
              }`}
            >
              {threatPhase === 'threat' ? (
                <ShieldAlert className="w-6 h-6 sm:w-8 sm:h-8 animate-bounce" />
              ) : threatPhase === 'isolated' ? (
                <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400" />
              ) : threatPhase === 'recovered' ? (
                <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8 text-secondary" />
              ) : (
                <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
              )}
            </div>
          </div>

          {/* Central Node Label & Status */}
          <div className="mt-2 text-center">
            <span className="text-[10px] sm:text-xs font-mono font-bold tracking-wider text-on-surface uppercase block whitespace-nowrap">
              Digital Identity
            </span>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  threatPhase === 'threat'
                    ? 'bg-error animate-ping'
                    : threatPhase === 'isolated'
                    ? 'bg-amber-400'
                    : threatPhase === 'recovered'
                    ? 'bg-secondary'
                    : 'bg-primary'
                }`}
              />
              <span className="text-[9px] sm:text-[10px] font-mono text-outline whitespace-nowrap">
                {threatPhase === 'threat'
                  ? 'Threat Intercepted'
                  : threatPhase === 'isolated'
                  ? 'Quarantine Active'
                  : threatPhase === 'recovered'
                  ? 'Identity Secured'
                  : 'Unified Root Principal'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Connected Provider Nodes ────────────────────────────────────────── */}
      {Object.keys(nodes)
        .filter((k) => k !== 'identity')
        .map((key) => {
          const node = nodes[key];
          const isCompromised = key === compromisedNodeId && (threatPhase === 'threat' || threatPhase === 'isolated');
          const isIsolated = key === compromisedNodeId && threatPhase === 'isolated';
          const isRecovered = key === compromisedNodeId && threatPhase === 'recovered';
          const isHovered = key === hoveredNodeId;

          return (
            <div
              key={node.id}
              style={{ left: `${node.x}px`, top: `${node.y}px` }}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              onClick={() => handleQuickTrigger(node.id)}
              title={`Click to simulate security event on ${node.label}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl backdrop-blur-md border transition-all duration-300 select-none z-20 cursor-pointer ${
                isCompromised
                  ? 'bg-error-container/30 border-error shadow-xl shadow-error/25 scale-105'
                  : isRecovered
                  ? 'bg-secondary-container/20 border-secondary shadow-lg shadow-secondary/20 scale-105'
                  : isHovered
                  ? 'bg-surface-container-highest border-primary/60 shadow-lg shadow-primary/10 scale-105'
                  : 'bg-surface-container/90 border-white/10 hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Provider Icon Badge */}
                <div
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] sm:text-xs transition-colors ${
                    isCompromised
                      ? 'bg-error/20 text-error'
                      : isRecovered
                      ? 'bg-secondary/20 text-secondary'
                      : 'bg-surface-container-highest text-primary border border-white/5'
                  }`}
                >
                  {node.icon === 'google' && <span>G</span>}
                  {node.icon === 'github' && <span>GH</span>}
                  {node.icon === 'aws' && <Cloud className="w-3.5 h-3.5" />}
                  {node.icon === 'devices' && <Laptop className="w-3.5 h-3.5" />}
                  {node.icon === 'sessions' && <Globe className="w-3.5 h-3.5" />}
                  {node.icon === 'oauth' && <Key className="w-3.5 h-3.5" />}
                </div>

                {/* Node Title & Detail */}
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-headline font-semibold text-on-surface">
                      {node.label}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isCompromised
                          ? 'bg-error animate-ping'
                          : isRecovered
                          ? 'bg-secondary'
                          : 'bg-secondary'
                      }`}
                    />
                  </div>
                  <p className="text-[9px] sm:text-[10px] font-mono text-outline hidden sm:block">
                    {node.sub}
                  </p>
                </div>
              </div>

              {/* Dynamic State Tags */}
              {isCompromised && (
                <div className="mt-1 flex items-center gap-1 text-[9px] font-mono font-bold text-error animate-pulse whitespace-nowrap">
                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  <span>{isIsolated ? 'TOPOLOGICALLY ISOLATED' : 'ANOMALY DETECTED'}</span>
                </div>
              )}
              {isRecovered && (
                <div className="mt-1 flex items-center gap-1 text-[9px] font-mono font-bold text-secondary whitespace-nowrap">
                  <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                  <span>CREDENTIAL REVOKED</span>
                </div>
              )}
            </div>
          );
        })}

      {/* ── Active Ambient Event Toast Float Over Canvas ────────────────────── */}
      {ambientEvent && threatPhase === 'normal' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-surface-container-high/90 backdrop-blur-md border border-secondary/30 shadow-md flex items-center gap-1.5 text-[10px] font-mono text-secondary z-30 pointer-events-none animate-fade-in">
          <Activity className="w-3 h-3 text-secondary animate-pulse" />
          <span>{ambientEvent.label}</span>
        </div>
      )}
    </div>
  );
};

export default ImmuneCoreShader;
