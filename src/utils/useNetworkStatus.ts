import { useState, useEffect } from 'react';

/**
 * Utility function to check if network is offline or restricted to 3G / 2G / slow connection.
 */
export function checkIsNetworkUnavailable(): boolean {
  if (typeof navigator === 'undefined') return false;

  // 1. Standard offline check
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    return true;
  }

  // 2. Network Information API (detects 3G, 2G, slow-2g or disconnected connection)
  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (conn) {
    const effectiveType = conn.effectiveType;
    if (effectiveType === '3g' || effectiveType === '2g' || effectiveType === 'slow-2g') {
      return true;
    }
    if (conn.type === 'none') {
      return true;
    }
  }

  return false;
}

/**
 * React hook detecting offline status or 3G / slow connection in real time.
 */
export function useNetworkStatus(): boolean {
  const [isUnavailable, setIsUnavailable] = useState<boolean>(() => checkIsNetworkUnavailable());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateStatus = () => {
      setIsUnavailable(checkIsNetworkUnavailable());
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', updateStatus);
    }

    // Periodic check every 2 seconds
    const interval = setInterval(updateStatus, 2000);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      if (conn && typeof conn.removeEventListener === 'function') {
        conn.removeEventListener('change', updateStatus);
      }
      clearInterval(interval);
    };
  }, []);

  return isUnavailable;
}
