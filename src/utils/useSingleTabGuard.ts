import { useState, useEffect, useCallback, useRef } from 'react';

const CHANNEL_NAME = 'defibeo_single_tab_channel';
const STORAGE_LEADER_KEY = 'defibeo_tab_leader';
const SESSION_TAB_ID_KEY = 'defibeo_tab_instance_id';

interface LeaderData {
  tabId: string;
  timestamp: number;
}

/**
 * Hook detecting whether another tab is currently open running Defibeo.
 * Ensures single-tab usage to prevent concurrency issues and data inconsistency.
 */
export function useSingleTabGuard() {
  const [isDuplicateTab, setIsDuplicateTab] = useState<boolean>(false);
  const myTabIdRef = useRef<string>('');
  const isLeaderRef = useRef<boolean>(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Initialize unique session tab ID (survives page refresh within the same tab)
  if (!myTabIdRef.current && typeof window !== 'undefined') {
    try {
      let storedId = sessionStorage.getItem(SESSION_TAB_ID_KEY);
      if (!storedId) {
        storedId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem(SESSION_TAB_ID_KEY, storedId);
      }
      myTabIdRef.current = storedId;
    } catch {
      myTabIdRef.current = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  }

  const claimLeadership = useCallback(() => {
    if (typeof window === 'undefined') return;
    const myId = myTabIdRef.current;
    isLeaderRef.current = true;
    setIsDuplicateTab(false);

    const leaderPayload: LeaderData = {
      tabId: myId,
      timestamp: Date.now()
    };

    try {
      localStorage.setItem(STORAGE_LEADER_KEY, JSON.stringify(leaderPayload));
    } catch (_) {}

    if (channelRef.current) {
      try {
        channelRef.current.postMessage({
          type: 'CLAIM_LEADERSHIP',
          leaderId: myId,
          timestamp: Date.now()
        });
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const myId = myTabIdRef.current;
    let channel: BroadcastChannel | null = null;

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;
      }
    } catch (_) {}

    // Check localStorage for existing active leader
    const checkStorageLeader = (): boolean => {
      try {
        const raw = localStorage.getItem(STORAGE_LEADER_KEY);
        if (raw) {
          const parsed: LeaderData = JSON.parse(raw);
          const isFresh = Date.now() - parsed.timestamp < 3500;
          if (isFresh && parsed.tabId !== myId) {
            return true; // Another tab is active!
          }
        }
      } catch (_) {}
      return false;
    };

    const hasActiveOtherTab = checkStorageLeader();
    if (hasActiveOtherTab) {
      setIsDuplicateTab(true);
      isLeaderRef.current = false;
    } else {
      // Fast ping to see if any other tab replies before claiming leadership
      let receivedPong = false;

      if (channel) {
        try {
          channel.postMessage({
            type: 'PING_EXISTING',
            senderId: myId,
            timestamp: Date.now()
          });
        } catch (_) {}
      }

      // Small grace period (80ms) for existing tab to answer
      const timeoutId = setTimeout(() => {
        if (!receivedPong) {
          // No other tab claimed leadership, we become leader
          isLeaderRef.current = true;
          setIsDuplicateTab(false);
          try {
            localStorage.setItem(
              STORAGE_LEADER_KEY,
              JSON.stringify({ tabId: myId, timestamp: Date.now() })
            );
          } catch (_) {}
        }
      }, 80);

      // Listener for messages
      if (channel) {
        const handleInitialMessage = (e: MessageEvent) => {
          if (!e.data || typeof e.data !== 'object') return;
          if (e.data.type === 'PONG_EXISTING' && e.data.leaderId !== myId) {
            receivedPong = true;
            clearTimeout(timeoutId);
            isLeaderRef.current = false;
            setIsDuplicateTab(true);
          }
        };
        channel.addEventListener('message', handleInitialMessage);
      }
    }

    // Message handler on BroadcastChannel
    const handleChannelMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      const { type, senderId, leaderId } = e.data;

      if (type === 'PING_EXISTING') {
        // If we are currently the active leader, inform the new tab that we exist!
        if (isLeaderRef.current && senderId !== myId) {
          try {
            channel?.postMessage({
              type: 'PONG_EXISTING',
              leaderId: myId,
              timestamp: Date.now()
            });
            // Also refresh localStorage heartbeat
            localStorage.setItem(
              STORAGE_LEADER_KEY,
              JSON.stringify({ tabId: myId, timestamp: Date.now() })
            );
          } catch (_) {}
        }
      } else if (type === 'PONG_EXISTING') {
        if (leaderId && leaderId !== myId) {
          isLeaderRef.current = false;
          setIsDuplicateTab(true);
        }
      } else if (type === 'CLAIM_LEADERSHIP') {
        // Another tab explicitly claimed leadership
        if (leaderId && leaderId !== myId) {
          isLeaderRef.current = false;
          setIsDuplicateTab(true);
        }
      } else if (type === 'LEADER_CLOSED') {
        // Previous leader closed, we can become the new active leader!
        if (!isLeaderRef.current) {
          claimLeadership();
        }
      }
    };

    if (channel) {
      channel.addEventListener('message', handleChannelMessage);
    }

    // Listen to localStorage events for cross-tab communication fallback
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_LEADER_KEY) {
        if (!e.newValue) {
          // Leader was removed/closed
          if (!isLeaderRef.current) {
            claimLeadership();
          }
        } else {
          try {
            const parsed: LeaderData = JSON.parse(e.newValue);
            if (parsed.tabId !== myId) {
              const isFresh = Date.now() - parsed.timestamp < 3500;
              if (isFresh) {
                isLeaderRef.current = false;
                setIsDuplicateTab(true);
              }
            }
          } catch (_) {}
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Heartbeat: if we are leader, update timestamp every 1200ms
    // If we are duplicate tab, verify that leader is still alive (auto-recover if leader crashed)
    const heartbeatInterval = setInterval(() => {
      if (isLeaderRef.current) {
        try {
          localStorage.setItem(
            STORAGE_LEADER_KEY,
            JSON.stringify({ tabId: myId, timestamp: Date.now() })
          );
        } catch (_) {}
      } else {
        // Check if leader died without cleanly unloading
        try {
          const raw = localStorage.getItem(STORAGE_LEADER_KEY);
          if (!raw) {
            claimLeadership();
          } else {
            const parsed: LeaderData = JSON.parse(raw);
            if (parsed.tabId !== myId && Date.now() - parsed.timestamp > 4000) {
              // Leader heartbeat is dead (older than 4 seconds) -> auto-promote this tab
              claimLeadership();
            }
          }
        } catch (_) {}
      }
    }, 1200);

    // Cleanup when closing / unloading this tab
    const handleUnload = () => {
      if (isLeaderRef.current) {
        try {
          channel?.postMessage({
            type: 'LEADER_CLOSED',
            leaderId: myId
          });
        } catch (_) {}
        try {
          const raw = localStorage.getItem(STORAGE_LEADER_KEY);
          if (raw) {
            const parsed: LeaderData = JSON.parse(raw);
            if (parsed.tabId === myId) {
              localStorage.removeItem(STORAGE_LEADER_KEY);
            }
          }
        } catch (_) {}
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      if (channel) {
        channel.removeEventListener('message', handleChannelMessage);
        channel.close();
      }
    };
  }, [claimLeadership]);

  return { isDuplicateTab, claimLeadership };
}
