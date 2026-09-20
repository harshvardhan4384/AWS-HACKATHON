import React from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { useNotifications } from '../../context/NotificationContext';
import { ShieldAlert, ExternalLink, X, MapPin, Laptop, Clock, Database } from 'lucide-react';

export const SecurityAlertBanner = () => {
  const { setActiveTab, setSelectedIncidentId } = useSecurity();
  const { activeAlert, dismissActiveAlert } = useNotifications();

  if (!activeAlert) return null;

  const handleInvestigate = () => {
    if (activeAlert.incidentId) {
      setSelectedIncidentId(activeAlert.incidentId);
      setActiveTab('investigation', activeAlert.incidentId);
    } else {
      setActiveTab('dashboard');
    }
    dismissActiveAlert();
  };

  const formattedTime = activeAlert.timestamp
    ? new Date(activeAlert.timestamp).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Just now';

  const deviceText = activeAlert.device || activeAlert.metadata?.device || activeAlert.metadata?.userAgent || 'Standard Session';
  const locationText = activeAlert.location || activeAlert.metadata?.location || null;
  const sourceText = activeAlert.source || `${activeAlert.provider || 'Provider'} Security API`;

  return (
    <div className="fixed top-20 right-4 sm:right-8 z-50 max-w-md w-full animate-in slide-in-from-top-4 duration-200">
      <div className="rounded-2xl bg-zinc-950/95 border-2 border-red-500/50 shadow-[0_0_40px_rgba(239,68,68,0.35)] p-5 backdrop-blur-xl text-zinc-100">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-red-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 animate-pulse">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase font-bold tracking-widest text-red-400">
                  🚨 Security Alert
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {activeAlert.provider || 'ACCOUNT'}
                </span>
              </div>
              <h4 className="font-headline font-bold text-sm text-zinc-100 mt-0.5">
                {activeAlert.title || 'Security anomaly detected'}
              </h4>
            </div>
          </div>
          <button
            onClick={dismissActiveAlert}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Dismiss Alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message */}
        <p className="text-xs text-zinc-300 mt-3 leading-relaxed">
          {activeAlert.message}
        </p>

        {/* Real Provider Metadata */}
        <div className="mt-3.5 space-y-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 p-3 text-[11px] font-mono">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-zinc-400" /> Device:
            </span>
            <span className="text-zinc-200 font-medium truncate max-w-[200px]" title={deviceText}>
              {deviceText}
            </span>
          </div>

          {locationText && (
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-zinc-400" /> Location:
              </span>
              <span className="text-zinc-200 font-medium">{locationText}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" /> Time:
            </span>
            <span className="text-zinc-200 font-medium">{formattedTime}</span>
          </div>

          <div className="flex items-center justify-between text-zinc-400 pt-1 border-t border-zinc-800/80">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-zinc-400" /> Source:
            </span>
            <span className="text-emerald-400 font-medium">{sourceText}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5 mt-4">
          <button
            onClick={handleInvestigate}
            className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-all shadow-lg hover:shadow-red-600/30 flex items-center justify-center gap-1.5"
          >
            <span>Investigate</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={dismissActiveAlert}
            className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecurityAlertBanner;

