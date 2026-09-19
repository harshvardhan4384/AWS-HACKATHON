import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import {
  Activity,
  Play,
  Pause,
  Trash2,
  Search,
  Terminal,
  Copy,
  Check
} from 'lucide-react';

export const TelemetryStreamPage = () => {
  const {
    telemetryLogs,
    isSimulating,
    toggleSimulation,
    simulationSpeed,
    setSimulationSpeed,
    clearAllTelemetry,
    addToast
  } = useSecurity();

  const [filterLevel, setFilterLevel] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const filteredLogs = telemetryLogs.filter(log => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesQuery =
      log.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.sourceIp.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesQuery;
  });

  const handleCopyLog = (log) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopiedId(log.id);
    addToast('success', 'Log Copied', 'Telemetry event JSON copied.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Stream Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-primary animate-pulse" />
              LIVE TELEMETRY & EVENT INGESTION STREAM
            </span>
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-mono text-xs text-secondary font-semibold">248,912 EPS INGESTION</span>
          </div>
          <h1 className="font-headline font-bold text-2xl text-on-surface mt-1">
            Real-Time Identity Fabric Activity
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Streaming audit logs across AWS CloudTrail, Okta SystemLog, GitHub Audit, and Google Workspace.
          </p>
        </div>

        {/* Live Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Pause / Play */}
          <button
            onClick={toggleSimulation}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              isSimulating
                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                : 'bg-secondary/15 border border-secondary/30 text-secondary hover:bg-secondary/25'
            }`}
          >
            {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isSimulating ? 'Pause Stream' : 'Resume Stream'}</span>
          </button>

          {/* Speed Toggle */}
          <div className="flex items-center bg-surface-container-lowest rounded-xl p-1 border border-white/5 text-xs font-mono">
            {[1, 2, 5].map(spd => (
              <button
                key={spd}
                onClick={() => setSimulationSpeed(spd)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  simulationSpeed === spd
                    ? 'bg-primary text-on-primary font-bold'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Clear Buffer */}
          <button
            onClick={clearAllTelemetry}
            className="p-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-outline hover:text-on-surface transition-colors border border-white/5"
            title="Clear Stream Buffer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-surface-container border border-white/5 shadow-md flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-outline absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search stream by actor, source IP, service, or event type..."
            className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface placeholder-outline focus:outline-none focus:border-primary"
          />
        </div>

        {/* Level Filters */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {['ALL', 'INFO', 'WARN', 'ALERT', 'SEC_CRIT'].map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-colors ${
                filterLevel === lvl
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Stream Feed + Selected Log Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Stream Table (8 cols) */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/5 text-xs text-outline font-mono">
            <span>SHOWING {filteredLogs.length} EVENTS</span>
            <span className="flex items-center gap-1 text-secondary">
              <span className="w-2 h-2 rounded-full bg-secondary animate-ping"></span>
              Live Buffer
            </span>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-outline">
                No telemetry events match the filter.
              </div>
            ) : (
              filteredLogs.map(log => (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    selectedLog?.id === log.id
                      ? 'bg-surface-container-high border-primary text-on-surface shadow-md'
                      : 'bg-surface-container-lowest border-white/5 text-on-surface-variant hover:border-white/20'
                  }`}
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="text-outline">{log.timestamp}</span>
                      <span className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                        log.level === 'SEC_CRIT' ? 'bg-error text-on-error' : log.level === 'ALERT' ? 'bg-amber-500 text-black' : log.level === 'WARN' ? 'bg-amber-400/20 text-amber-400' : 'bg-surface-container-highest text-primary'
                      }`}>
                        {log.level}
                      </span>
                      <span className="text-primary font-semibold truncate">{log.service}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-on-surface truncate">{log.eventType}</span>
                      <span className="text-outline text-[11px]">— actor: {log.actor}</span>
                    </div>

                    <p className="text-[11px] font-mono text-outline truncate">
                      target: {log.target} | src: {log.sourceIp}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                      log.status === 'INTERCEPTED' ? 'bg-secondary/20 text-secondary' : log.status === 'ANOMALY' ? 'bg-error/20 text-error' : 'bg-surface-container-highest text-outline'
                    }`}>
                      {log.status}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLog(log);
                      }}
                      className="p-1 rounded hover:bg-surface-variant text-outline hover:text-on-surface"
                      title="Copy Event JSON"
                    >
                      {copiedId === log.id ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Log Inspector (4 cols) */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-surface-container border border-white/5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <span className="font-headline font-bold text-xs text-on-surface font-mono flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              EVENT PAYLOAD INSPECTOR
            </span>
            {selectedLog && (
              <span className="text-[10px] font-mono text-primary font-bold">{selectedLog.id}</span>
            )}
          </div>

          {selectedLog ? (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5 space-y-1 font-mono text-xs">
                <div className="text-[10px] text-outline">EVENT TYPE</div>
                <div className="text-primary font-bold">{selectedLog.eventType}</div>
                <div className="text-[10px] text-outline mt-2">SOURCE IP / ACTOR</div>
                <div className="text-on-surface">{selectedLog.sourceIp} ({selectedLog.actor})</div>
              </div>

              <div>
                <span className="text-[10px] font-mono text-outline uppercase block mb-1.5">Full Payload JSON</span>
                <pre className="p-3.5 rounded-xl bg-surface-container-lowest border border-white/5 text-[11px] font-mono text-on-surface-variant overflow-x-auto max-h-72">
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>

              <button
                onClick={() => handleCopyLog(selectedLog)}
                className="w-full py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs text-on-surface font-semibold transition-colors flex items-center justify-center gap-2 border border-white/5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Full Event Data</span>
              </button>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-outline">
              Select any event from the stream to inspect its raw telemetry metadata and JSON attributes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
