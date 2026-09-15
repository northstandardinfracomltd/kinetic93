import React from 'react';
import { Loader2, Activity } from 'lucide-react';

export interface DefibTablePreloaderProps {
  current?: number;
  total?: number;
  percent?: number;
  message?: string;
  variant?: 'inline' | 'banner';
  className?: string;
}

export const DefibTablePreloader: React.FC<DefibTablePreloaderProps> = ({
  current = 1,
  total = 18000,
  percent,
  message,
  variant = 'inline',
  className = ''
}) => {
  const formattedCurrent = current > 0 ? current.toLocaleString('en-US') : '1';
  const formattedTotal = total > 0 ? total.toLocaleString('en-US') : '18,000';
  const computedPercent = percent !== undefined 
    ? Math.min(100, Math.max(0, Math.round(percent)))
    : Math.min(100, Math.max(4, Math.round((current / (total || 18000)) * 100)));

  const displayMessage = message || `Chargement ${formattedCurrent}/${formattedTotal}, Veuillez patienter.`;

  if (variant === 'banner') {
    return (
      <div 
        id="defib-table-preloader-banner"
        role="status"
        aria-live="polite"
        className={`w-full mb-3 px-4 py-3 bg-blue-50/90 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs transition-all ${className}`}
      >
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex items-center justify-center shrink-0">
            <Loader2 className="w-5 h-5 text-[#3556ec] animate-spin" />
            <span className="sr-only">Chargement en cours</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs">
            <span className="font-semibold text-slate-900 tracking-tight">
              {displayMessage}
            </span>
            <span className="hidden sm:inline text-slate-300">•</span>
            <span className="text-slate-500 font-normal">
              Synchronisation des données en temps réel
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex-1 sm:w-36 h-2 bg-blue-200/60 rounded-full overflow-hidden">
            <div 
              className="h-full bg-linear-to-r from-[#3556ec] to-[#fe4eba] transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(5, computedPercent)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-[#3556ec] tabular-nums min-w-[36px] text-right">
            {computedPercent}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <div 
      id="defib-table-preloader-inline"
      role="status"
      aria-live="polite"
      className={`p-12 sm:p-16 lg:py-20 text-center font-sans flex flex-col items-center justify-center bg-white border border-slate-100 rounded-lg my-2 shadow-xs ${className}`}
    >
      <div className="relative mb-5 flex items-center justify-center">
        {/* Outer glowing spinner */}
        <div className="w-14 h-14 rounded-full border-[3px] border-slate-100 border-t-[#3556ec] border-r-[#fe4eba] animate-spin" />
        {/* Center icon */}
        <div className="absolute w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
          <Activity className="w-4 h-4 text-[#3556ec]" />
        </div>
      </div>

      <h3 className="text-base font-semibold text-slate-900 tracking-tight mb-1.5">
        {displayMessage}
      </h3>

      <p className="text-xs text-slate-500 max-w-md mb-5 leading-relaxed font-normal">
        Récupération et indexation de la base complète des défibrillateurs avec pagination dynamique.
      </p>

      {/* Progress Bar Container */}
      <div className="w-full max-w-xs flex flex-col items-center gap-2">
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 p-0.5">
          <div 
            className="h-full bg-linear-to-r from-[#3556ec] to-[#fe4eba] rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.max(4, computedPercent)}%` }}
          />
        </div>
        <div className="w-full flex justify-between items-center text-[11px] text-slate-400 font-medium px-0.5">
          <span>Progression</span>
          <span className="text-[#3556ec] font-semibold tabular-nums">{computedPercent}%</span>
        </div>
      </div>
    </div>
  );
};
