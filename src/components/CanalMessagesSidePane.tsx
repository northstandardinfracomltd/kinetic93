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
  onMessagesRead?: () => void;
  embedded?: boolean;
  companyInfo?: CompanyInfo;
  members?: Member[];
  extraBottomSpacing?: number;
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
}) => {
  const [remoteSheetDiscovered, setRemoteSheetDiscovered] = useState(false);
  const hasMessagesSpreadsheet =
    Boolean(getTenantSpreadsheetUrl('spreadsheetMessagesInternes', companyInfo, tenantId)) || remoteSheetDiscovered;
  const [messageInput, setMessageInput] = useState('');
  const [activeChannel, setActiveChannel] = useState<MessageChannel>('Général');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const deleteMenuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

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

  // Resolve current user's full name & email using members list and companyInfo
  const resolvedCurrentUser = useMemo(() => {
    const email = (currentUser?.email || '').trim();
    let name = (currentUser?.name || '').trim();

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
      const matchedByName = members.find(
        (m) => m && m.name && m.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (matchedByName?.email?.trim()) {
        return { email: matchedByName.email.trim(), name: matchedByName.name.trim() || name };
      }
    }
    return {
      email,
      name: name || email || 'Membre',
    };
  }, [currentUser, members, companyInfo]);

  // Helper to resolve any message's author display name and email
  const resolveMessageAuthor = (msg: TenantMessage) => {
    const rawAuthorEmail = (msg.authorEmail || '').trim();
    const rawAuthorName = (msg.authorName || '').trim();

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
      const matchedByName = members.find(
        (m) => m && m.name && m.name.trim().toLowerCase() === name.toLowerCase()
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

    const isMine = Boolean(
      (resolvedCurrentUser.email &&
        email &&
        resolvedCurrentUser.email.trim().toLowerCase() === email.trim().toLowerCase()) ||
        (resolvedCurrentUser.name &&
          name &&
          name !== 'Membre' &&
          resolvedCurrentUser.name.trim().toLowerCase() === name.trim().toLowerCase())
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

  // Close context menu on outside click without blocking the Supprimer button click
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutsidePointerDown = (e: Event) => {
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

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) setContextMenu(null);
        else if (!embedded) onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, contextMenu, onClose, embedded]);

  // Mark messages as read when opening
  useEffect(() => {
    if (isOpen) {
      if (onMessagesRead) onMessagesRead();
      setTimeout(() => {
        scrollToBottom(false);
        textareaRef.current?.focus();
      }, 80);
    }
  }, [isOpen]);

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

  const handleMessageTouchStart = (e: React.TouchEvent, msgId: string, isMine: boolean) => {
    if (!isMine) return;
    clearLongPressTimer();
    const touch = e.touches[0];
    if (!touch) return;
    const startX = touch.clientX;
    const startY = touch.clientY;
    touchStartPosRef.current = { x: startX, y: startY };

    longPressTimerRef.current = setTimeout(() => {
      openDeleteMenuAt(startX, startY, msgId);
      longPressTimerRef.current = null;
    }, 2000);
  };

  const handleMessageTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !longPressTimerRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearLongPressTimer();
    }
  };

  const handleMessageTouchEnd = () => {
    clearLongPressTimer();
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
              onTouchCancel={handleMessageTouchEnd}
            >
              {/* Label above each message: Nom Prénom + Horodatage (no dot, color rgb(80, 97, 122), font-size 14px) */}
              <div
                className={`flex items-center gap-2 mb-1.5 px-1 ${
                  isMine ? 'flex-row-reverse text-right' : 'flex-row text-left'
                }`}
                style={{
                  color: 'rgb(80, 97, 122)',
                  fontSize: '14px',
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
                className="rounded-2xl transition-all relative select-text"
                style={{
                  maxWidth: isMine ? '88%' : '92%',
                  backgroundColor: 'rgb(245, 247, 250)',
                  fontSize: '18px',
                  border: 'none',
                  boxShadow: 'none',
                  padding: '10px 14px',
                  color: '#000000',
                  cursor: 'default',
                  WebkitTouchCallout: isMine ? 'none' : 'default',
                }}
                title={isMine ? t('Clic droit ou appui long pour supprimer') : undefined}
              >
                <p
                  className="leading-relaxed whitespace-pre-wrap break-words m-0 select-text"
                  style={{
                    fontSize: '18px',
                    color: '#000000',
                    cursor: 'default',
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
        {/* 5-ITEM FULL-WIDTH ONE-LINE CHANNEL TOGGLE BAR ABOVE INPUT */}
        <div
          id="messages-channel-toggle-bar"
          className="grid grid-cols-5 gap-1 sm:gap-1.5 w-full mb-2 p-1 rounded-2xl select-none"
          style={{
            backgroundColor: 'rgb(245, 247, 250)',
            border: '1px solid #DCE1EA',
          }}
        >
          {MESSAGE_CHANNELS.map((canal) => {
            const isSelected = activeChannel === canal;
            return (
              <button
                key={canal}
                type="button"
                onClick={() => setActiveChannel(canal)}
                className={`w-full py-2 px-1 sm:px-2 rounded-xl text-center truncate transition-all cursor-pointer ${
                  isSelected ? 'font-bold text-white' : 'font-normal text-black hover:bg-white/70'
                }`}
                style={{
                  backgroundColor: isSelected ? 'rgb(46, 84, 255)' : 'transparent',
                  color: isSelected ? '#ffffff' : '#000000',
                  fontSize: 'clamp(13px, 2vw, 18px)',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  border: 'none',
                  boxShadow: 'none',
                }}
                title={t(canal)}
              >
                {t(canal)}
              </button>
            );
          })}
        </div>

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

      {/* CONTEXT MENU ON RIGHT CLICK OR MOBILE LONG PRESS TO DELETE MESSAGE */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[99999]"
            onClick={() => setContextMenu(null)}
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

