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

  const AppleSpinner = ({ className: spinnerClass = "w-8 h-8 text-slate-400" }: { className?: string }) => (
    <svg
      className={`animate-spin ${spinnerClass}`}
      style={{ animationDuration: '0.9s' }}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, index) => {
        const opacity = 0.2 + (0.8 * index) / 11;
        return (
          <rect
            key={angle}
            x="14.5"
            y="3"
            width="3"
            height="7.5"
            rx="1.5"
            transform={`rotate(${angle} 16 16)`}
            fill="currentColor"
            opacity={opacity}
          />
        );
      })}
    </svg>
  );

  if (variant === 'banner') {
    return (
      <div 
        id="defib-table-preloader-banner"
        role="status"
        aria-live="polite"
        className={`w-full mb-3 px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-3 shadow-xs transition-all ${className}`}
      >
        <div className="shrink-0 flex items-center justify-center">
          <AppleSpinner className="w-5 h-5 text-slate-400" />
        </div>
        <span className="text-xs font-medium text-slate-700">
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
      {/* Apple-style light-grey petal loader (iOS activity indicator) */}
      <div className="mb-4 flex items-center justify-center">
        <AppleSpinner className="w-8 h-8 sm:w-9 sm:h-9 text-slate-400" />
      </div>

      {/* Main loading title */}
      <h3 className="text-sm sm:text-base font-medium text-slate-700 tracking-normal">
        {titleText}
      </h3>
    </div>
  );
};
