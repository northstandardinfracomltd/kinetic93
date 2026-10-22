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

export const TopBarProgress: React.FC<TopBarProgressProps> = () => {
  return null;
};

export default TopBarProgress;

