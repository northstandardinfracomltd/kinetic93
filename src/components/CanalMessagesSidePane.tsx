import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { saveCollectionToFirestore } from '../firebase';
import { TenantMessage, CompanyInfo, Member, getTenantSpreadsheetUrl } from '../types';
import { t } from '../utils/translate';

export const CANAL_TAGS = [
  { name: 'Exploitation', bg: '#f1f5f9', text: '#1e293b', border: '#cbd5e1', dot: '#334155' },
  { name: 'Planification', bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', dot: '#7c3aed' },
  { name: 'Logistique', bg: '#fffbeb', text: '#b45309', border: '#fde68a', dot: '#d97706' },
  { name: 'ADV', bg: '#ecfdf5', text: '#047857', border: '#a7f3d0', dot: '#059669' },
  { name: 'Vie Entreprise', bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', dot: '#db2777' },
  { name: 'Comptabilité', bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd', dot: '#0284c7' },
  { name: 'Ressources Humaines', bg: '#fff1f2', text: '#be123c', border: '#fecdd3', dot: '#e11d48' },
  { name: 'Contrôle de gestion', bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4', dot: '#0d9488' },
] as const;

export type CanalTagName = typeof CANAL_TAGS[number]['name'];

export const MESSAGE_CHANNELS = [
  'Général',
  'Exploitation',
  'Ventes',
  'Logistique',
  'Techniciens',
] as const;

export type MessageChannel = typeof MESSAGE_CHANNELS[number];

export function normalizeMessageChannel(rawTag?: string | null): MessageChannel {
  const s = String(rawTag || '').trim().toLowerCase();
  if (!s || s === 'all' || s === 'général' || s === 'general') return 'Général';
  if (s === 'exploitation') return 'Exploitation';
  if (s === 'ventes' || s === 'vente') return 'Ventes';
  if (s === 'logistique') return 'Logistique';
  if (s === 'techniciens' || s === 'technicien') return 'Techniciens';
  return 'Général';
}

interface CanalMessagesSidePaneProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  currentUser: { email: string; name: string };
  messages: TenantMessage[];
  setMessages: React.Dispatch<React.SetStateAction<TenantMessage[]>>;
  onMessagesRead?: (msgsToMark?: TenantMessage[]) => void;
  embedded?: boolean;
  companyInfo?: CompanyInfo;
  members?: Member[];
  extraBottomSpacing?: number;
  isTechWebapp?: boolean;
}

const TECH_MESSAGES_TIP_CACHE_KEY = 'defib_tech_webapp_messages_tip_dismissed_v1';

function isTechMessagesTipDismissedSync(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(TECH_MESSAGES_TIP_CACHE_KEY) === 'true') return true;
  } catch (_) {}
  try {
    if (window.sessionStorage.getItem(TECH_MESSAGES_TIP_CACHE_KEY) === 'true') return true;
  } catch (_) {}
  try {
    if (typeof document !== 'undefined' && document.cookie.includes(`${TECH_MESSAGES_TIP_CACHE_KEY}=true`)) {
      return true;
    }
  } catch (_) {}
  return false;
}

function persistTechMessagesTipDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TECH_MESSAGES_TIP_CACHE_KEY, 'true');
  } catch (_) {}
  try {
    window.sessionStorage.setItem(TECH_MESSAGES_TIP_CACHE_KEY, 'true');
  } catch (_) {}
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${TECH_MESSAGES_TIP_CACHE_KEY}=true; max-age=315360000; path=/; SameSite=Lax`;
    }
  } catch (_) {}
  try {
    if (window.indexedDB) {
      const req = window.indexedDB.open('defib_device_cache_db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put('true', TECH_MESSAGES_TIP_CACHE_KEY);
        } catch (_) {}
      };
    }
  } catch (_) {}
}

function checkTechMessagesTipDismissedAsync(onConfirmedDismissed: () => void): void {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const req = window.indexedDB.open('defib_device_cache_db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction('kv', 'readonly');
        const getReq = tx.objectStore('kv').get(TECH_MESSAGES_TIP_CACHE_KEY);
        getReq.onsuccess = () => {
          if (getReq.result === 'true' || getReq.result === true) {
            persistTechMessagesTipDismissed();
            onConfirmedDismissed();
          }
        };
      } catch (_) {}
    };
  } catch (_) {}
}

function normalizeIdentityToken(val?: string | null): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function getCanalMessageSignature(m: any): string {
  if (!m) return '';
  const ch = normalizeMessageChannel(m.tag || m.channel || m['Canal.'] || m['Canal']);
  const author = String(
    m.authorEmail || m['Nom Prénom (Username).'] || m['Nom Prénom (Username)'] || m.authorName || m.sender || ''
  )
    .trim()
    .toLowerCase();
  const dt = String(m.dateStr || m['Horodatage.'] || m['Horodatage'] || m.time || '').trim();
  const content = String(m.content || m['Message.'] || m['Message'] || m.text || '').trim();
  return `${ch}::${author}::${dt}::${content}`;
}

export const CanalMessagesSidePane: React.FC<CanalMessagesSidePaneProps> = ({
  isOpen,
  onClose,
  tenantId,
  currentUser,
  messages,
  setMessages,
  onMessagesRead,
  embedded = false,
  companyInfo,
  members = [],
  extraBottomSpacing = 0,
  isTechWebapp = false,
}) => {
  const [remoteSheetDiscovered, setRemoteSheetDiscovered] = useState(false);
  const hasMessagesSpreadsheet =
    Boolean(getTenantSpreadsheetUrl('spreadsheetMessagesInternes', companyInfo, tenantId)) || remoteSheetDiscovered;
  const [messageInput, setMessageInput] = useState('');
  const [activeChannel, setActiveChannel] = useState<MessageChannel>('Général');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
  const [showTechTipPopup, setShowTechTipPopup] = useState<boolean>(() => {
    if (!isTechWebapp) return false;
    return !isTechMessagesTipDismissedSync();
  });
  const [showMobileChannelDropdown, setShowMobileChannelDropdown] = useState(false);
  const [mobileChannelDropdownPos, setMobileChannelDropdownPos] = useState<{ x: number; y: number } | null>(null);

  const [seenSignatures, setSeenSignatures] = useState<string[] | null>(() => {
    try {
      const tid = tenantId || localStorage.getItem('defib_tenant_id') || 'demo';
      const raw = localStorage.getItem(`defib_${tid}_messages_seen_signatures`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!isTechWebapp) {
      setShowTechTipPopup(false);
      return;
    }
    if (isTechMessagesTipDismissedSync()) {
      setShowTechTipPopup(false);
    } else {
      setShowTechTipPopup(true);
      checkTechMessagesTipDismissedAsync(() => {
        setShowTechTipPopup(false);
      });
    }
  }, [isTechWebapp, isOpen]);

  // Memo: By default, load the Général channel when opening
  useEffect(() => {
    if (isOpen) {
      setActiveChannel('Général');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      const raw = localStorage.getItem(`defib_${tenantId}_messages_seen_signatures`);
      setSeenSignatures(raw ? JSON.parse(raw) : null);
    } catch {
      setSeenSignatures(null);
    }
  }, [tenantId]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const deleteMenuRef = useRef<HTMLDivElement | null>(null);
  const bottomInputBarRef = useRef<HTMLDivElement | null>(null);
  const mobileChannelDropdownRef = useRef<HTMLDivElement | null>(null);
  const mobileChannelSelectRef = useRef<HTMLSelectElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  const contextMenuOpenedAtRef = useRef<number>(0);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  useEffect(() => {
    return () => clearLongPressTimer();
  }, []);

  // Resolve current user's full name & email using members list, companyInfo, and localStorage fallbacks
  const resolvedCurrentUser = useMemo(() => {
    let email = (currentUser?.email || '').trim();
    let name = (currentUser?.name || '').trim();

    try {
      // In Technician WebApp mode, prioritize the authenticated technician session if email or full name is missing
      const savedTechWebapp = localStorage.getItem('defib_tech_webapp_auth_v1');
      if (savedTechWebapp) {
        const parsed = JSON.parse(savedTechWebapp);
        const sessionUser = parsed?.user || parsed;
        if (sessionUser?.email && !email) {
          email = String(sessionUser.email).trim();
        }
        if (sessionUser?.name && (!name || name === 'Membre' || name === 'Technicien')) {
          name = String(sessionUser.name).trim();
        }
      }
      if (!email || !name || name === 'Membre' || name === 'Technicien') {
        const savedTech = localStorage.getItem('defib_active_tech_session');
        if (savedTech) {
          const parsed = JSON.parse(savedTech);
          if (parsed?.email && !email) email = String(parsed.email).trim();
          if (parsed?.name && (!name || name === 'Membre' || name === 'Technicien')) {
            name = String(parsed.name).trim();
          }
        }
      }
      if (!email && !isTechWebapp) {
        const savedAdmin = localStorage.getItem('defib_admin_logged_user');
        if (savedAdmin) {
          const parsed = JSON.parse(savedAdmin);
          if (parsed?.email) email = String(parsed.email).trim();
          if (parsed?.name && (!name || name === 'Membre' || name === 'Technicien')) {
            name = String(parsed.name).trim();
          }
        }
      }
    } catch (_) {}

    if (email && members.length > 0) {
      const matched = members.find(
        (m) => m && m.email && m.email.trim().toLowerCase() === email.toLowerCase()
      );
      if (matched?.name?.trim()) {
        name = matched.name.trim();
      }
    }
    if ((!name || name === 'Membre' || name === 'Technicien') && email && companyInfo?.adminEmail) {
      if (companyInfo.adminEmail.trim().toLowerCase() === email.toLowerCase() && companyInfo.adminName?.trim()) {
        name = companyInfo.adminName.trim();
      }
    }
    if (!email && name && name !== 'Membre' && name !== 'Technicien' && members.length > 0) {
      const normName = normalizeIdentityToken(name);
      const matchedByName = members.find(
        (m) => m && m.name && normalizeIdentityToken(m.name) === normName
      );
      if (matchedByName?.email?.trim()) {
        return { email: matchedByName.email.trim(), name: matchedByName.name.trim() || name };
      }
    }
    return {
      email,
      name: name || email || 'Membre',
    };
  }, [currentUser, members, companyInfo, isTechWebapp]);

  // Helper to resolve any message's author display name and email
  const resolveMessageAuthor = (msg: TenantMessage) => {
    const rawAuthorEmail = String(
      msg.authorEmail || (msg as any)['Nom Prénom (Username).'] || (msg as any)['Nom Prénom (Username)'] || ''
    ).trim();
    const rawAuthorName = String(msg.authorName || (msg as any).sender || '').trim();

    let email = rawAuthorEmail;
    let name = rawAuthorName;

    if (!email && rawAuthorName.includes('@')) {
      email = rawAuthorName;
      name = '';
    }
    if (name === 'Membre' || name.includes('@')) {
      name = '';
    }

    if (email && members.length > 0) {
      const matched = members.find(
        (m) => m && m.email && m.email.trim().toLowerCase() === email.toLowerCase()
      );
      if (matched?.name?.trim()) {
        name = matched.name.trim();
      }
    }

    if (!name && email && companyInfo?.adminEmail && companyInfo.adminEmail.trim().toLowerCase() === email.toLowerCase()) {
      if (companyInfo.adminName?.trim()) {
        name = companyInfo.adminName.trim();
      }
    }

    if (!name && email && resolvedCurrentUser.email && resolvedCurrentUser.email.toLowerCase() === email.toLowerCase()) {
      if (resolvedCurrentUser.name && resolvedCurrentUser.name !== 'Membre' && !resolvedCurrentUser.name.includes('@')) {
        name = resolvedCurrentUser.name;
      }
    }

    if (!email && name && members.length > 0) {
      const normName = normalizeIdentityToken(name);
      const matchedByName = members.find(
        (m) => m && m.name && normalizeIdentityToken(m.name) === normName
      );
      if (matchedByName?.email?.trim()) {
        email = matchedByName.email.trim();
      }
    }

    if (!name && email) {
      const localPart = email.split('@')[0] || '';
      name = localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || email;
    }

    const myEmailLower = resolvedCurrentUser.email ? resolvedCurrentUser.email.trim().toLowerCase() : '';
    const myNameNorm =
      resolvedCurrentUser.name &&
      resolvedCurrentUser.name !== 'Membre' &&
      resolvedCurrentUser.name !== 'Technicien'
        ? normalizeIdentityToken(resolvedCurrentUser.name)
        : '';

    const isMine = Boolean(
      (myEmailLower &&
        ((email && myEmailLower === email.trim().toLowerCase()) ||
          (rawAuthorEmail && myEmailLower === rawAuthorEmail.toLowerCase()) ||
          (rawAuthorName && myEmailLower === rawAuthorName.toLowerCase()))) ||
        (myNameNorm &&
          ((name &&
            name !== 'Membre' &&
            name !== 'Technicien' &&
            myNameNorm === normalizeIdentityToken(name)) ||
            (rawAuthorName &&
              rawAuthorName !== 'Membre' &&
              rawAuthorName !== 'Technicien' &&
              myNameNorm === normalizeIdentityToken(rawAuthorName)) ||
            (rawAuthorEmail && myNameNorm === normalizeIdentityToken(rawAuthorEmail))))
    );

    return {
      displayName: name || 'Membre',
      email,
      isMine,
    };
  };

  // Auto scroll to bottom
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Close context menu on outside click without blocking the Supprimer button click or immediate touch release
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutsidePointerDown = (e: Event) => {
      if (Date.now() - contextMenuOpenedAtRef.current < 650) {
        return;
      }
      if (deleteMenuRef.current && e.target instanceof Node && deleteMenuRef.current.contains(e.target)) {
        return;
      }
      setContextMenu(null);
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointerDown);
    };
  }, [contextMenu]);

  // Close mobile channel dropdown on outside pointerdown
  useEffect(() => {
    if (!showMobileChannelDropdown) return;
    const handleOutsideDropdown = (e: Event) => {
      if (
        mobileChannelDropdownRef.current &&
        e.target instanceof Node &&
        mobileChannelDropdownRef.current.contains(e.target)
      ) {
        return;
      }
      setShowMobileChannelDropdown(false);
    };
    window.addEventListener('pointerdown', handleOutsideDropdown);
    return () => {
      window.removeEventListener('pointerdown', handleOutsideDropdown);
    };
  }, [showMobileChannelDropdown]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) setContextMenu(null);
        else if (showMobileChannelDropdown) setShowMobileChannelDropdown(false);
        else if (!embedded) onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, contextMenu, showMobileChannelDropdown, onClose, embedded]);

  // Focus and scroll when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        scrollToBottom(false);
        if (!isTechWebapp) {
          textareaRef.current?.focus();
        }
      }, 80);
    }
  }, [isOpen, isTechWebapp]);

  // Real-time sync & periodic polling from Google Sheets
  useEffect(() => {
    if (!isOpen || !tenantId) return;

    let isMounted = true;

    const fetchLatestServerMessages = async () => {
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), 15000);
      try {
        const sheetRes = await fetch(
          `/api/sheets/collection?tenantId=${encodeURIComponent(tenantId)}&type=messagesInternes&refresh=true&_=${Date.now()}`,
          {
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' },
          }
        ).catch(() => null);
        if (sheetRes && sheetRes.ok && isMounted) {
          const sheetData = await sheetRes.json();
          if (sheetData?.spreadsheetUrl) {
            setRemoteSheetDiscovered(true);
            try {
              localStorage.setItem(`defib_${tenantId}_spreadsheet_messages_internes`, String(sheetData.spreadsheetUrl));
            } catch (_) {}
          }
          if (sheetData?.fromSpreadsheet && Array.isArray(sheetData.items)) {
            setRemoteSheetDiscovered(true);
            const mappedList: TenantMessage[] = sheetData.items
              .filter((m: any) => m && (m.content || m.text))
              .map((m: any, idx: number) => {
                const rawEmail = String(m.authorEmail || m['Nom Prénom (Username).'] || m['Nom Prénom (Username)'] || '').trim();
                const rawName = String(m.authorName || m.sender || '').trim();
                const rawCanal = String(m.tag || m.channel || m['Canal.'] || m['Canal'] || '').trim();
                return {
                  id: m.id || `msg_${m._sheetRowNumber || idx + 2}`,
                  authorName: rawName || rawEmail || 'Membre',
                  authorEmail: rawEmail || (rawName.includes('@') ? rawName : ''),
                  tag: normalizeMessageChannel(rawCanal),
                  content: String(m.content || m.text || '').trim(),
                  createdAt: Number(m.createdAt) || Date.now(),
                  dateStr: String(m.dateStr || m.time || '').trim(),
                  tenantId,
                  envId: tenantId,
                  _sheetRowNumber: m._sheetRowNumber,
                } as TenantMessage & { _sheetRowNumber?: number };
              });
            clearTimeout(timerId);
            setMessages((prev) => {
              if (JSON.stringify(prev) !== JSON.stringify(mappedList)) {
                try {
                  localStorage.setItem(`defib_${tenantId}_tenant_messages`, JSON.stringify(mappedList));
                } catch (_) {}
                return mappedList;
              }
              return prev;
            });
            return;
          } else if (sheetData?.status === 'no_spreadsheet' && !getTenantSpreadsheetUrl('spreadsheetMessagesInternes', companyInfo, tenantId)) {
            setMessages([]);
          }
        }
        clearTimeout(timerId);
      } catch (_) {
        clearTimeout(timerId);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `defib_${tenantId}_tenant_messages` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && isMounted) {
            setMessages(parsed);
          }
        } catch (_) {}
      } else if (e.key === `defib_${tenantId}_messages_seen_signatures` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && isMounted) {
            setSeenSignatures(parsed);
          }
        } catch (_) {}
      }
    };
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchLatestServerMessages();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    fetchLatestServerMessages();
    const refreshTimer = setInterval(fetchLatestServerMessages, 5000);

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearInterval(refreshTimer);
    };
  }, [isOpen, tenantId, setMessages, companyInfo]);

  const displayedMessages = useMemo(
    () =>
      messages.filter(
        (m) =>
          normalizeMessageChannel(m.tag || (m as any).channel || (m as any)['Canal.'] || (m as any)['Canal']) ===
          activeChannel
      ),
    [messages, activeChannel]
  );

  // Mark messages in the currently active channel (plus all own messages) as seen when viewing that channel
  useEffect(() => {
    if (!isOpen || !tenantId) return;
    const ownMessages = messages.filter((m) => m && resolveMessageAuthor(m).isMine);
    const msgsToMarkSeen = [...displayedMessages, ...ownMessages];
    const channelSigs = msgsToMarkSeen.map((m) => getCanalMessageSignature(m)).filter(Boolean);
    setSeenSignatures((prev) => {
      const baseArr = Array.isArray(prev) ? prev : [];
      const prevSet = new Set(baseArr);
      const hasNew = prev === null || channelSigs.some((s) => !prevSet.has(s));
      if (!hasNew) return prev;
      const merged = Array.from(new Set([...baseArr, ...channelSigs]));
      try {
        localStorage.setItem(`defib_${tenantId}_messages_seen_signatures`, JSON.stringify(merged));
        localStorage.setItem(`defib_${tenantId}_messages_last_seen`, String(Date.now()));
      } catch (_) {}
      return merged;
    });
    if (onMessagesRead && msgsToMarkSeen.length > 0) {
      onMessagesRead(msgsToMarkSeen);
    }
  }, [isOpen, tenantId, activeChannel, displayedMessages, messages, onMessagesRead, resolvedCurrentUser]);

  // Compute unread message count per channel (never counting messages sent by the logged-in user)
  const unreadCountByChannel = useMemo(() => {
    const counts: Record<MessageChannel, number> = {
      Général: 0,
      Exploitation: 0,
      Ventes: 0,
      Logistique: 0,
      Techniciens: 0,
    };
    if (!Array.isArray(messages) || messages.length === 0) return counts;
    const seenSet = new Set(Array.isArray(seenSignatures) ? seenSignatures : []);
    messages.forEach((m) => {
      if (!m) return;
      if (resolveMessageAuthor(m).isMine) return;
      const ch = normalizeMessageChannel(m.tag || (m as any).channel || (m as any)['Canal.'] || (m as any)['Canal']);
      if (isOpen && ch === activeChannel) return;
      const sig = getCanalMessageSignature(m);
      if (sig && !seenSet.has(sig)) {
        counts[ch] = (counts[ch] || 0) + 1;
      }
    });
    return counts;
  }, [messages, seenSignatures, activeChannel, isOpen, resolvedCurrentUser, members, companyInfo]);

  // Scroll to bottom when new messages arrive or channel changes
  useEffect(() => {
    if (isOpen) {
      scrollToBottom(true);
    }
  }, [displayedMessages.length, activeChannel, isOpen]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = messageInput.trim();
    if (!text) return;

    const now = new Date();
    const dateFormatted = `${now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })} à ${now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;

    const senderEmail = resolvedCurrentUser.email || '';
    const senderName = resolvedCurrentUser.name || senderEmail || 'Membre';

    const newMsg: TenantMessage & Record<string, any> = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      authorName: senderName,
      authorEmail: senderEmail,
      'Nom Prénom (Username).': senderEmail || senderName,
      tag: activeChannel,
      channel: activeChannel,
      'Canal.': activeChannel,
      content: text,
      createdAt: Date.now(),
      dateStr: dateFormatted,
      tenantId,
      envId: tenantId,
    };

    const newSig = getCanalMessageSignature(newMsg);
    if (newSig) {
      setSeenSignatures((prev) => {
        const baseArr = Array.isArray(prev) ? prev : [];
        const merged = Array.from(new Set([...baseArr, newSig]));
        try {
          localStorage.setItem(`defib_${tenantId}_messages_seen_signatures`, JSON.stringify(merged));
        } catch (_) {}
        return merged;
      });
    }
    if (onMessagesRead) {
      onMessagesRead([newMsg]);
    }

    const updated = [...messages, newMsg];
    setMessages(updated);
    setMessageInput('');

    if (textareaRef.current) {
      textareaRef.current.style.height = '28px';
    }

    localStorage.setItem(`defib_${tenantId}_tenant_messages`, JSON.stringify(updated));
    localStorage.setItem(`defib_${tenantId}_messages_last_seen`, String(Date.now()));

    try {
      await fetch('/api/sheets/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          type: 'messagesInternes',
          record: newMsg,
        }),
      }).catch(() => {});
      fetch('/api/sync-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName: 'tenantMessages',
          tenantId,
          value: updated,
        }),
      }).catch(() => {});
      await saveCollectionToFirestore('tenantMessages', updated, tenantId);
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du message:', err);
    }

    setTimeout(() => {
      scrollToBottom(true);
      textareaRef.current?.focus();
    }, 50);
  };

  const handleDeleteMessage = async (msgId: string) => {
    const targetMsg = messages.find((m) => m.id === msgId) as (TenantMessage & { _sheetRowNumber?: number }) | undefined;
    const updated = messages.filter((m) => m.id !== msgId);
    setMessages(updated);
    setContextMenu(null);
    localStorage.setItem(`defib_${tenantId}_tenant_messages`, JSON.stringify(updated));

    const deleteKeys: string[] = [msgId];
    if (targetMsg) {
      const sheetRow = Number(targetMsg._sheetRowNumber);
      if (sheetRow > 0) {
        deleteKeys.push(`row:${sheetRow}`, `msg_${sheetRow}`, `msg_sheet_${sheetRow}`);
      }
      const idMatch = String(msgId).match(/^msg_(?:sheet_)?(\d+)$/i);
      if (idMatch && idMatch[1]) {
        const parsedRow = Number(idMatch[1]);
        if (parsedRow > 0) {
          deleteKeys.push(`row:${parsedRow}`, `msg_${parsedRow}`, `msg_sheet_${parsedRow}`);
        }
      }
      const dStr = String(targetMsg.dateStr || '').trim().toLowerCase();
      const cStr = String(targetMsg.content || '').trim().toLowerCase();
      const eStr = String(targetMsg.authorEmail || '').trim().toLowerCase();
      if (dStr && cStr) {
        deleteKeys.push(`msg@@${dStr}@@${cStr}`);
        if (eStr) {
          deleteKeys.push(`msg@@${eStr}@@${dStr}@@${cStr}`);
        }
      }
    }

    try {
      await fetch('/api/sheets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          type: 'messagesInternes',
          keys: Array.from(new Set(deleteKeys.filter(Boolean))),
        }),
      }).catch(() => {});
      fetch('/api/sync-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName: 'tenantMessages',
          tenantId,
          value: updated,
        }),
      }).catch(() => {});
      await saveCollectionToFirestore('tenantMessages', updated, tenantId);
    } catch (err) {
      console.error('Erreur lors de la suppression du message:', err);
    }
  };

  const openDeleteMenuAt = (clientX: number, clientY: number, msgId: string) => {
    const maxX = typeof window !== 'undefined' ? window.innerWidth - 150 : clientX;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - 65 : clientY;
    contextMenuOpenedAtRef.current = Date.now();
    longPressTriggeredRef.current = true;
    setContextMenu({
      x: Math.max(10, Math.min(clientX, maxX)),
      y: Math.max(10, Math.min(clientY, maxY)),
      messageId: msgId,
    });
  };

  const handleContextMenu = (e: React.MouseEvent, msgId: string, isMine: boolean) => {
    if (!isMine) return;
    e.preventDefault();
    e.stopPropagation();
    openDeleteMenuAt(e.clientX, e.clientY, msgId);
  };

  const startHoldTimer = (clientX: number, clientY: number, msgId: string, isMine: boolean) => {
    if (!isMine) return;
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    touchStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };

    longPressTimerRef.current = setTimeout(() => {
      openDeleteMenuAt(clientX, clientY, msgId);
      longPressTimerRef.current = null;
    }, 2000);
  };

  const handleMessageTouchStart = (e: React.TouchEvent, msgId: string, isMine: boolean) => {
    if (!isMine) return;
    const touch = e.touches[0];
    if (!touch) return;
    startHoldTimer(touch.clientX, touch.clientY, msgId, isMine);
  };

  const handleMessageTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !longPressTimerRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 25 || dy > 25) {
      clearLongPressTimer();
    }
  };

  const handleMessageTouchEnd = (e?: React.TouchEvent) => {
    if (longPressTriggeredRef.current && e) {
      e.preventDefault();
    }
    clearLongPressTimer();
  };

  const handleMessagePointerDown = (e: React.PointerEvent, msgId: string, isMine: boolean) => {
    if (!isMine || e.pointerType === 'touch') return;
    if (e.button !== 0) return;
    startHoldTimer(e.clientX, e.clientY, msgId, isMine);
  };

  const handleMessagePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!touchStartPosRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(e.clientY - touchStartPosRef.current.y);
    if (dx > 25 || dy > 25) {
      clearLongPressTimer();
    }
  };

  const handleMessagePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    clearLongPressTimer();
  };

  const openMobileChannelSystemDropdownAt = (clientX: number, clientY: number) => {
    if (!isTechWebapp) return;
    setMobileChannelDropdownPos({ x: clientX, y: clientY });
    const sel = mobileChannelSelectRef.current;
    if (sel) {
      sel.style.left = `${clientX}px`;
      sel.style.top = `${clientY}px`;
      try {
        sel.focus({ preventScroll: true });
      } catch (_) {
        try {
          sel.focus();
        } catch (__) {}
      }
      try {
        if (typeof (sel as any).showPicker === 'function') {
          (sel as any).showPicker();
          return;
        }
      } catch (_) {}
      try {
        sel.click();
        const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        sel.dispatchEvent(evt);
      } catch (_) {}
    }
  };

  const isTargetExcludedFromDoubleTap = (target: EventTarget | null): boolean => {
    if (!(target instanceof Node)) return false;
    if (bottomInputBarRef.current && bottomInputBarRef.current.contains(target)) return true;
    if (deleteMenuRef.current && deleteMenuRef.current.contains(target)) return true;
    if (mobileChannelDropdownRef.current && mobileChannelDropdownRef.current.contains(target)) return true;
    const el = target instanceof HTMLElement ? target : target.parentElement;
    if (el?.closest('#messages-bottom-input-bar, #messages-tip-popup, #mobile-channel-dropdown-container, #btn-delete-canal-message')) {
      return true;
    }
    return false;
  };

  const handlePageTouchEndForDoubleTap = (e: React.TouchEvent) => {
    if (!isTechWebapp) return;
    if (longPressTriggeredRef.current) return;
    if (isTargetExcludedFromDoubleTap(e.target)) return;
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    const now = Date.now();
    const prev = lastTapRef.current;
    const dt = now - prev.time;
    const dx = Math.abs(touch.clientX - prev.x);
    const dy = Math.abs(touch.clientY - prev.y);
    if (dt > 30 && dt < 420 && dx < 65 && dy < 65) {
      lastTapRef.current = { time: 0, x: 0, y: 0 };
      openMobileChannelSystemDropdownAt(touch.clientX, touch.clientY);
    } else {
      lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
    }
  };

  const handlePageDoubleClick = (e: React.MouseEvent) => {
    if (!isTechWebapp) return;
    if (isTargetExcludedFromDoubleTap(e.target)) return;
    openMobileChannelSystemDropdownAt(e.clientX, e.clientY);
  };

  const handleDismissTechTipPopup = () => {
    persistTechMessagesTipDismissed();
    setShowTechTipPopup(false);
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const sidepaneContent = (
    <div
      id="canal-messages-sidepane"
      className={
        embedded
          ? "relative w-full h-full flex-1 min-h-0 bg-white flex flex-col overflow-hidden font-sans border-0 shadow-none rounded-none"
          : "relative w-full max-w-[760px] sm:w-[650px] lg:w-[760px] bg-white shadow-2xl flex flex-col h-full min-h-0 overflow-hidden animate-slideLeft font-sans"
      }
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={handlePageTouchEndForDoubleTap}
      onDoubleClick={handlePageDoubleClick}
      style={{
        ...(!embedded ? { borderLeft: '1px solid #dadada' } : {}),
        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
      }}
    >
      {/* MESSAGES LIST AREA (IN-SCROLL CONTAINER) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 bg-white">
        {displayedMessages.map((msg) => {
          const { displayName, isMine } = resolveMessageAuthor(msg);

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group`}
              onContextMenu={(e) => handleContextMenu(e, msg.id, isMine)}
              onTouchStart={(e) => handleMessageTouchStart(e, msg.id, isMine)}
              onTouchMove={handleMessageTouchMove}
              onTouchEnd={handleMessageTouchEnd}
              onTouchCancel={() => clearLongPressTimer()}
              onPointerDown={(e) => handleMessagePointerDown(e, msg.id, isMine)}
              onPointerMove={handleMessagePointerMove}
              onPointerUp={handleMessagePointerUp}
              onPointerCancel={handleMessagePointerUp}
            >
              {/* Label above each message: Nom Prénom + Horodatage (no dot, color rgb(80, 97, 122), font-size 14px) */}
              <div
                className={`flex items-center gap-2 mb-1.5 px-1 ${
                  isMine ? 'flex-row-reverse text-right' : 'flex-row text-left'
                }`}
                style={{
                  color: 'rgb(80, 97, 122)',
                  fontSize: '14px',
                  userSelect: isMine || isTechWebapp ? 'none' : undefined,
                  WebkitUserSelect: isMine || isTechWebapp ? 'none' : undefined,
                }}
              >
                <span
                  className="font-bold"
                  style={{ color: 'rgb(80, 97, 122)', fontSize: '14px' }}
                >
                  {displayName}
                </span>
                <span
                  className="font-normal"
                  style={{ color: 'rgb(80, 97, 122)', fontSize: '14px' }}
                >
                  {msg.dateStr}
                </span>
              </div>

              {/* Message Bubble */}
              <div
                className={`rounded-2xl transition-all relative ${isMine || isTechWebapp ? 'select-none' : 'select-text'}`}
                style={{
                  maxWidth: isMine ? '88%' : '92%',
                  backgroundColor: 'rgb(245, 247, 250)',
                  fontSize: '18px',
                  border: 'none',
                  boxShadow: 'none',
                  padding: '10px 14px',
                  color: '#000000',
                  cursor: 'default',
                  userSelect: isMine || isTechWebapp ? 'none' : 'text',
                  WebkitUserSelect: isMine || isTechWebapp ? 'none' : 'text',
                  WebkitTouchCallout: isMine || isTechWebapp ? 'none' : 'default',
                }}
                title={isMine ? t('Clic droit ou appui long pour supprimer') : undefined}
              >
                <p
                  className={`leading-relaxed whitespace-pre-wrap break-words m-0 ${
                    isMine || isTechWebapp ? 'select-none' : 'select-text'
                  }`}
                  style={{
                    fontSize: '18px',
                    color: '#000000',
                    cursor: 'default',
                    userSelect: isMine || isTechWebapp ? 'none' : 'text',
                    WebkitUserSelect: isMine || isTechWebapp ? 'none' : 'text',
                    WebkitTouchCallout: isMine || isTechWebapp ? 'none' : 'default',
                  }}
                >
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* BOTTOM INPUT BAR (STICKY BOTTOM, FLOATING WITHOUT BACKGROUND OR BORDER-TOP) */}
      <div
        id="messages-bottom-input-bar"
        ref={bottomInputBarRef}
        className={
          embedded
            ? "sticky bottom-0 z-20 w-full px-2 pt-2 pb-2 sm:pb-2.5 bg-transparent shadow-none shrink-0"
            : "sticky bottom-0 z-10 w-full p-2.5 sm:p-4 shrink-0 bg-transparent"
        }
        style={{
          background: 'transparent',
          backgroundColor: 'transparent',
          borderTop: 'none',
          boxShadow: 'none',
          ...(extraBottomSpacing > 0 ? { paddingBottom: `${extraBottomSpacing}px` } : {}),
        }}
      >
        {/* 5-ITEM FULL-WIDTH ONE-LINE CHANNEL TOGGLE BAR ABOVE INPUT (HIDDEN ON MOBILE TECH WEBAPP) */}
        {!isTechWebapp && (
          <div
            id="messages-channel-toggle-bar"
            className="relative grid grid-cols-5 w-full mb-2 p-1 rounded-2xl select-none overflow-hidden"
            style={{
              backgroundColor: 'rgb(245 247 250)',
              border: 'none',
            }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none"
              style={{
                position: 'absolute',
                top: '4px',
                bottom: '4px',
                left: '4px',
                width: 'calc((100% - 8px) / 5)',
                transform: `translateX(${Math.max(0, MESSAGE_CHANNELS.indexOf(activeChannel)) * 100}%)`,
                transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                backgroundColor: '#0f172a',
                borderRadius: '12px',
                zIndex: 0,
              }}
            />
            {MESSAGE_CHANNELS.map((canal) => {
              const isSelected = activeChannel === canal;
              const unreadCount = unreadCountByChannel[canal] || 0;
              return (
                <button
                  key={canal}
                  type="button"
                  onClick={() => setActiveChannel(canal)}
                  className={`relative z-10 w-full py-2 px-1 sm:px-2 rounded-xl inline-flex items-center justify-center gap-1.5 text-center truncate transition-colors duration-200 cursor-pointer ${
                    isSelected ? 'font-bold text-white' : 'font-normal hover:opacity-75'
                  }`}
                  style={{
                    backgroundColor: isSelected ? '#0f172a' : 'transparent',
                    color: isSelected ? '#ffffff' : 'rgb(80 97 122)',
                    fontSize: 'clamp(13px, 2vw, 18px)',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    border: 'none',
                    boxShadow: 'none',
                  }}
                  title={t(canal)}
                >
                  <span className="truncate">{t(canal)}</span>
                  {unreadCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center rounded-full font-bold shrink-0 leading-none select-none"
                      style={{
                        minWidth: '25px',
                        height: '25px',
                        padding: '0px 6px',
                        fontSize: '16px',
                        backgroundColor: 'rgb(210, 45, 11)',
                        color: 'rgb(255, 255, 255)',
                        borderRadius: '9999px',
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <form
          onSubmit={(e) => {
            if (!hasMessagesSpreadsheet) {
              e.preventDefault();
              return;
            }
            handleSendMessage(e);
          }}
        >
          <div
            className="flex items-center gap-2 bg-white rounded-2xl p-1.5 sm:p-2 pl-3 sm:pl-4 transition-all shadow-none"
            style={{ border: '1px solid #DCE1EA', boxShadow: 'none' }}
          >
            {/* Message textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              disabled={!hasMessagesSpreadsheet}
              value={messageInput}
              maxLength={350}
              onChange={(e) => {
                setMessageInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.max(32, Math.min(e.target.scrollHeight, 180))}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (hasMessagesSpreadsheet) handleSendMessage();
                }
              }}
              placeholder={
                !hasMessagesSpreadsheet
                  ? 'Fonctionnalité indisponible pour votre environnement, veuillez contacter le support.'
                  : 'Entrez votre message.'
              }
              className={`flex-1 self-center bg-transparent border-0 outline-none text-[#000000] px-1 placeholder:text-[#BECADB] resize-none overflow-y-auto text-[18px] ${
                !hasMessagesSpreadsheet ? 'cursor-not-allowed opacity-60' : ''
              }`}
              style={{
                fontSize: '18px',
                color: '#000000',
                lineHeight: '24px',
                minHeight: '32px',
                height: '32px',
                maxHeight: '180px',
                paddingTop: '5px',
                paddingBottom: '3px',
                margin: 'auto 0',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            />

            {/* Submit button */}
            <button
              type="submit"
              disabled={!messageInput.trim() || !hasMessagesSpreadsheet}
              id="btn-send-canal-message"
              className="inline-flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0 self-center"
              style={{
                backgroundColor: 'rgb(46, 84, 255)',
                fontSize: '18px',
                border: 'none',
                boxShadow: 'none',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                opacity: !messageInput.trim() || !hasMessagesSpreadsheet ? 0.45 : 1,
                cursor: !messageInput.trim() || !hasMessagesSpreadsheet ? 'not-allowed' : 'pointer',
              }}
              title={
                !hasMessagesSpreadsheet
                  ? "Veuillez renseigner l'URL du Spreadsheet Messages Internes dans les paramètres du tenant."
                  : undefined
              }
            >
              <span>{t('Envoyer')}</span>
            </button>

            {/* Bouton Fermer : en bas à droite, à droite du bouton Envoyer */}
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                id="btn-close-canal-sidepane"
                className="inline-flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0 self-center hover:opacity-90 active:scale-[0.98]"
                style={{
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  fontSize: '18px',
                  border: 'none',
                  boxShadow: 'none',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
              >
                <span>{t('Fermer')}</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* MOBILE DOUBLE-TAP SYSTEM DROPDOWN FOR CHANNEL SELECTION */}
      {isTechWebapp && (
        <select
          ref={mobileChannelSelectRef}
          id="mobile-channel-system-select"
          value={activeChannel}
          onChange={(e) => {
            setActiveChannel(e.target.value as MessageChannel);
            setShowMobileChannelDropdown(false);
          }}
          aria-label="Choisir le canal de discussion"
          style={{
            position: 'fixed',
            opacity: 0,
            pointerEvents: 'none',
            width: '1px',
            height: '1px',
            border: 'none',
            padding: 0,
            margin: 0,
            top: mobileChannelDropdownPos ? `${mobileChannelDropdownPos.y}px` : '50%',
            left: mobileChannelDropdownPos ? `${mobileChannelDropdownPos.x}px` : '50%',
            zIndex: 99999,
          }}
        >
          {MESSAGE_CHANNELS.map((canal) => {
            const unreadCount = unreadCountByChannel[canal] || 0;
            return (
              <option key={canal} value={canal}>
                {`${canal} (${unreadCount})`}
              </option>
            );
          })}
        </select>
      )}

      {/* ONBOARDING POPUP ("LE SAVIEZ-VOUS ?") ON OPENING MESSAGES TAB IN TECH WEBAPP */}
      {isTechWebapp && showTechTipPopup && (
        <div
          id="messages-tip-popup"
          className="fixed inset-0 z-[100001] flex items-center justify-center p-4 animate-fadeIn"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl p-5 flex flex-col gap-4 animate-scaleIn"
            style={{
              backgroundColor: '#ffffff',
              border: 'none',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.22)',
              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
            }}
          >
            <p
              className="m-0 leading-relaxed"
              style={{
                fontSize: '18px',
                color: '#000000',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            >
              Le saviez-vous ? Pour changer de canal de discussion, effectuez un double-tap n’importe où sur la page des messages. Et pour supprimer l’un de vos messages, restez appuyé sur votre bulle.
            </p>
            <button
              type="button"
              id="btn-dismiss-messages-tip"
              onClick={handleDismissTechTipPopup}
              className="w-full rounded-xl font-bold text-white transition-all cursor-pointer hover:opacity-95 active:scale-[0.99]"
              style={{
                backgroundColor: 'rgb(46, 84, 255)',
                color: '#ffffff',
                fontSize: '18px',
                padding: '11px 19px',
                borderRadius: '13px',
                border: 'none',
                boxShadow: 'none',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            >
              J’ai compris
            </button>
          </div>
        </div>
      )}

      {/* CONTEXT MENU ON RIGHT CLICK OR MOBILE LONG PRESS TO DELETE MESSAGE */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[99999]"
            onClick={() => {
              if (Date.now() - contextMenuOpenedAtRef.current < 650) return;
              setContextMenu(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            ref={deleteMenuRef}
            className="fixed z-[100000] p-0 animate-scaleIn"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
              backgroundColor: 'transparent',
              border: 'none',
              boxShadow: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleDeleteMessage(contextMenu.messageId)}
              id="btn-delete-canal-message"
              className="px-5 py-2.5 rounded-xl font-bold transition-all cursor-pointer shadow-md hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: 'rgb(210, 45, 11)',
                color: '#ffffff',
                border: 'none',
                fontSize: '18px',
                textAlign: 'center',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                display: 'block',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('Supprimer')}
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (embedded) {
    return sidepaneContent;
  }

  return createPortal(
    <div
      className="fixed inset-0 flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn z-[99999]"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        minHeight: '100dvh',
        maxHeight: '100dvh',
      }}
      onClick={onClose}
    >
      {sidepaneContent}
    </div>,
    document.body
  );
};

