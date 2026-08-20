import React, { useEffect, useState } from 'react';

interface TopBarProgressProps {
  /** Trigger or key that increments/changes whenever tab changes */
  triggerKey: string | number;
  /** Duration of loading animation in ms, defaults to 3000ms (3s) */
  duration?: number;
  /** Height of top bar, defaults to 3.5px */
  height?: number;
  /** Z-index of progress bar, defaults to 99999 */
  zIndex?: number;
}

export const TopBarProgress: React.FC<TopBarProgressProps> = ({
  triggerKey,
  duration = 3000,
  height = 3.5,
  zIndex = 99999,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!triggerKey) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [triggerKey, duration]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 pointer-events-none overflow-hidden"
      style={{
        height: `${height}px`,
        zIndex,
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
      }}
      id="tab-topbar-loading-indicator"
    >
      {/* Material Design Indeterminate Sliding Bar 1 (#0362FF) */}
      <div
        className="absolute top-0 bottom-0 mat-bar-1"
        style={{
          backgroundColor: '#0362FF',
          height: `${height}px`,
        }}
      />
      {/* Material Design Indeterminate Sliding Bar 2 (#FD4EBB) */}
      <div
        className="absolute top-0 bottom-0 mat-bar-2"
        style={{
          backgroundColor: '#FD4EBB',
          height: `${height}px`,
        }}
      />
      {/* Material Design Indeterminate Sliding Bar 3 (#5C1B62) */}
      <div
        className="absolute top-0 bottom-0 mat-bar-3"
        style={{
          backgroundColor: '#5C1B62',
          height: `${height}px`,
        }}
      />
    </div>
  );
};

export default TopBarProgress;

