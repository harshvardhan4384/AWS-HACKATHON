import React from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { CheckCircle2, AlertTriangle, Info, AlertOctagon, X } from 'lucide-react';

export const ToastContainer = () => {
  const { toasts, removeToast } = useSecurity();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const getIcon = () => {
          switch (toast.type) {
            case 'success':
              return <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0" />;
            case 'warning':
              return <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />;
            case 'error':
              return <AlertOctagon className="w-5 h-5 text-error flex-shrink-0" />;
            default:
              return <Info className="w-5 h-5 text-primary flex-shrink-0" />;
          }
        };

        const getBorderColor = () => {
          switch (toast.type) {
            case 'success':
              return 'border-secondary/30 bg-surface-container-high/95';
            case 'warning':
              return 'border-amber-400/30 bg-surface-container-high/95';
            case 'error':
              return 'border-error/30 bg-surface-container-high/95';
            default:
              return 'border-primary/30 bg-surface-container-high/95';
          }
        };

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-5 duration-200 ${getBorderColor()}`}
          >
            {getIcon()}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-on-surface font-headline">{toast.title}</h4>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-outline hover:text-on-surface transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

