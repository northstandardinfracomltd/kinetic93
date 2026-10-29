import React, { useState, useEffect, useCallback, useRef } from 'react';

const PRESENCE_SESSION_KEY = 'defibeo_presence_session_id';
const PRESENCE_CHANNEL_NAME = 'defibeo_tenant_presence_channel';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 2500;
const PEER_TTL_MS = 10000;

function getOrCreatePresenceSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = sessionStorage.getItem(PRESENCE_SESSION_KEY);
    if (!id) {
      id = `pres_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      sessionStorage.setItem(PRESENCE_SESSION_KEY, id);
    }
    return id;
  } catch {
    return `pres_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}

export function normalizePresenceTenantId(rawTenantId?: string | null): string {
  const fromArg = String(rawTenantId || '').trim();
  if (fromArg) return fromArg.toUpperCase();
  if (typeof window !== 'undefined') {
    try {
      const fromStorage = String(localStorage.getItem('defib_tenant_id') || 'demo').trim();
      if (fromStorage) return fromStorage.toUpperCase();
    } catch {}
  }
  return 'DEMO';
}

export function normalizePresenceValue(rawVal?: string | null): string {
  return String(rawVal || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

interface UseTenantPresenceOptions {
  tenantId?: string | null;
  tab: 'defibrillateurs' | 'clients' | 'rapports-pdf' | '';
  formKey?: string | null;
  enabled?: boolean;
}

interface PeerState {
  sessionId: string;
  tenantId: string;
  tab: string;
  formKey: string;
  updatedAt: number;
}

export function useTenantPresence({
  tenantId,
  tab,
  formKey,
  enabled = true,
}: UseTenantPresenceOptions) {
  const sessionIdRef = useRef<string>(getOrCreatePresenceSessionId());
  const normTenantId = normalizePresenceTenantId(tenantId);
  const normTab = enabled ? String(tab || '').trim() : '';
  const normFormKey = enabled && formKey ? normalizePresenceValue(formKey) : '';

  const [serverTabConflict, setServerTabConflict] = useState(false);
  const [serverFormConflict, setServerFormConflict] = useState(false);
  const [localTabConflict, setLocalTabConflict] = useState(false);
  const [localFormConflict, setLocalFormConflict] = useState(false);

  const peersRef = useRef<Map<string, PeerState>>(new Map());

  // 3-hour mask for table-view banner
  const tabMaskStorageKey = `defib_hide_tab_conflict_${normTenantId}_${normTab}`;
  const [isTabMasked, setIsTabMasked] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !normTab) return false;
    try {
      const raw = localStorage.getItem(`defib_hide_tab_conflict_${normTenantId}_${normTab}`);
      if (raw) {
        const until = Number(raw);
        if (!isNaN(until) && Date.now() < until) {
          return true;
        }
      }
    } catch {}
    return false;
  });

  // Re-evaluate 3h mask when tab or tenant changes or expires
  useEffect(() => {
    if (typeof window === 'undefined' || !normTab) {
      setIsTabMasked(false);
      return;
    }
    const checkMask = () => {
      try {
        const raw = localStorage.getItem(tabMaskStorageKey);
        if (raw) {
          const until = Number(raw);
          if (!isNaN(until) && Date.now() < until) {
            setIsTabMasked(true);
            return;
          }
        }
      } catch {}
      setIsTabMasked(false);
    };
    checkMask();
    const timer = setInterval(checkMask, 15000);
    return () => clearInterval(timer);
  }, [tabMaskStorageKey, normTab]);

  const hideTabBannerFor3Hours = useCallback(() => {
    const until = Date.now() + THREE_HOURS_MS;
    setIsTabMasked(true);
    try {
      localStorage.setItem(tabMaskStorageKey, String(until));
    } catch {}
  }, [tabMaskStorageKey]);

  // While-open mask for form / side pane banner (resets when form closes or switches record)
  const [maskedFormKey, setMaskedFormKey] = useState<string | null>(null);
  useEffect(() => {
    if (!normFormKey) {
      setMaskedFormKey(null);
    } else if (maskedFormKey && maskedFormKey !== normFormKey) {
      setMaskedFormKey(null);
    }
  }, [normFormKey, maskedFormKey]);

  const hideFormBannerWhileOpen = useCallback(() => {
    if (normFormKey) {
      setMaskedFormKey(normFormKey);
    } else {
      setMaskedFormKey('__hidden__');
    }
  }, [normFormKey]);

  const isFormMasked = Boolean(
    maskedFormKey && (maskedFormKey === normFormKey || maskedFormKey === '__hidden__')
  );

  // Evaluate local peers from BroadcastChannel
  const recomputeLocalConflicts = useCallback(() => {
    const now = Date.now();
    const myId = sessionIdRef.current;
    let tConflict = false;
    let fConflict = false;

    for (const [peerId, peer] of peersRef.current.entries()) {
      if (now - peer.updatedAt > PEER_TTL_MS) {
        peersRef.current.delete(peerId);
        continue;
      }
      if (peerId === myId) continue;
      if (peer.tenantId !== normTenantId) continue;
      if (normTab && peer.tab === normTab) {
        tConflict = true;
      }
      if (normFormKey && peer.formKey && peer.formKey === normFormKey) {
        fConflict = true;
      }
    }

    setLocalTabConflict(tConflict);
    setLocalFormConflict(fConflict);
  }, [normTenantId, normTab, normFormKey]);

  // BroadcastChannel + Server Heartbeat
  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) {
      setServerTabConflict(false);
      setServerFormConflict(false);
      setLocalTabConflict(false);
      setLocalFormConflict(false);
      return;
    }

    const myId = sessionIdRef.current;
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(PRESENCE_CHANNEL_NAME);
      }
    } catch {}

    const broadcastState = (type: 'HEARTBEAT' | 'LEAVE' = 'HEARTBEAT') => {
      if (!channel) return;
      try {
        channel.postMessage({
          type,
          sessionId: myId,
          tenantId: normTenantId,
          tab: type === 'LEAVE' ? '' : normTab,
          formKey: type === 'LEAVE' ? '' : normFormKey,
          updatedAt: Date.now(),
        });
      } catch {}
    };

    if (channel) {
      const onMessage = (e: MessageEvent) => {
        const data = e.data;
        if (!data || typeof data !== 'object' || !data.sessionId) return;
        if (data.sessionId === myId) return;

        if (data.type === 'LEAVE') {
          peersRef.current.delete(data.sessionId);
          recomputeLocalConflicts();
        } else if (data.type === 'HEARTBEAT' || data.type === 'PING') {
          peersRef.current.set(data.sessionId, {
            sessionId: data.sessionId,
            tenantId: String(data.tenantId || ''),
            tab: String(data.tab || ''),
            formKey: String(data.formKey || ''),
            updatedAt: Date.now(),
          });
          recomputeLocalConflicts();
          if (data.type === 'PING') {
            broadcastState('HEARTBEAT');
          }
        }
      };
      channel.addEventListener('message', onMessage);
      try {
        channel.postMessage({
          type: 'PING',
          sessionId: myId,
          tenantId: normTenantId,
          tab: normTab,
          formKey: normFormKey,
          updatedAt: Date.now(),
        });
      } catch {}
    }

    let isCancelled = false;
    const sendHeartbeat = async () => {
      broadcastState('HEARTBEAT');
      recomputeLocalConflicts();
      try {
        const res = await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: myId,
            tenantId: normTenantId,
            tab: normTab,
            formKey: normFormKey,
          }),
        });
        if (!res.ok || isCancelled) return;
        const json = await res.json();
        if (!isCancelled && json && typeof json === 'object') {
          setServerTabConflict(Boolean(json.tabConflict));
          setServerFormConflict(Boolean(json.formConflict));
        }
      } catch {}
    };

    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    const handleLeave = () => {
      broadcastState('LEAVE');
      try {
        const payload = JSON.stringify({
          sessionId: myId,
          tenantId: normTenantId,
        });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/presence/leave', blob);
        } else {
          fetch('/api/presence/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}
    };

    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('pagehide', handleLeave);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleLeave);
      window.removeEventListener('pagehide', handleLeave);
      broadcastState('LEAVE');
      if (channel) {
        try {
          channel.close();
        } catch {}
      }
      fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: myId,
          tenantId: normTenantId,
          tab: '',
          formKey: '',
        }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [enabled, normTenantId, normTab, normFormKey, recomputeLocalConflicts]);

  const showTabConflictBanner = Boolean(
    enabled && normTab && (serverTabConflict || localTabConflict) && !isTabMasked
  );
  const showFormConflictBanner = Boolean(
    enabled && normFormKey && (serverFormConflict || localFormConflict) && !isFormMasked
  );

  return {
    showTabConflictBanner,
    showFormConflictBanner,
    hideTabBannerFor3Hours,
    hideFormBannerWhileOpen,
  };
}

export const ConcurrentAccessBanner: React.FC<{
  message: string;
  onHide: () => void;
  className?: string;
  style?: React.CSSProperties;
}> = ({ message, onHide, className = '', style }) => {
  return (
    <div
      className={`w-full flex items-center justify-between gap-4 px-4 py-3 font-sans ${className}`}
      style={{
        backgroundColor: '#f97316',
        color: '#ffffff',
        fontSize: '18px',
        borderRadius: '13px',
        maxWidth: '98%',
        margin: '0 auto 12px auto',
        ...style,
      }}
    >
      <span
        className="text-left leading-snug flex-1"
        style={{
          fontSize: '18px',
          color: '#ffffff',
          textAlign: 'left',
          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
          fontWeight: 400,
        }}
      >
        {message}
      </span>
      <button
        type="button"
        onClick={onHide}
        className="shrink-0 cursor-pointer transition-opacity hover:opacity-90 select-none"
        style={{
          fontSize: '18px',
          color: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.22)',
          border: '1px solid rgba(255, 255, 255, 0.45)',
          borderRadius: '10px',
          padding: '6px 16px',
          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
          fontWeight: 600,
        }}
      >
        Masquer
      </button>
    </div>
  );
};
