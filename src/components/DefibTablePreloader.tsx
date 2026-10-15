import React from 'react';

export interface DefibTablePreloaderProps {
  current?: number;
  total?: number;
  percent?: number;
  message?: string;
  variant?: 'inline' | 'banner';
  className?: string;
}

export const DefibTablePreloader: React.FC<DefibTablePreloaderProps> = ({
  variant = 'inline',
  className = ''
}) => {
  const titleText = "Chargement et vérification de vos données, veuillez patienter.";

  if (variant === 'banner') {
    return (
      <div 
        id="defib-table-preloader-banner"
        role="status"
        aria-live="polite"
        className={`w-full mb-3 px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-3 shadow-xs transition-all ${className}`}
      >
        <span className="text-xs font-medium text-black" style={{ color: '#000000' }}>
          {titleText}
        </span>
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
      {/* Main loading title */}
      <h3 className="text-sm sm:text-base font-medium text-black tracking-normal" style={{ color: '#000000' }}>
        {titleText}
      </h3>
    </div>
  );
};
