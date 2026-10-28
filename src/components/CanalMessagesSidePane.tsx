import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, saveCollectionToFirestore, getCollectionKey, isFirestoreQuotaExhausted, recordFirestoreQuotaExhaustion } from '../firebase';
import { TenantMessage, CompanyInfo, getTenantSpreadsheetUrl } from '../types';
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
}) => {
  const hasMessagesSpreadsheet = Boolean(getTenantSpreadsheetUrl('spreadsheetMessagesInternes', companyInfo));
  const [messageInput, setMessageInput] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto scroll to bottom
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Close context menu on outside click with capture phase to avoid any stopPropagation issues
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose, true);
    window.addEventListener('pointerdown', handleClose, true);
    window.addEventListener('contextmenu', handleClose, true);
    return () => {
      window.removeEventListener('click', handleClose, true);
      window.removeEventListener('pointerdown', handleClose, true);
      window.removeEventListener('contextmenu', handleClose, true);
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

  // Real-time Firestore sync & auto-refresh dynamic polling every 1s
  useEffect(() => {
    if (!isOpen || !tenantId) return;
    if (!hasMessagesSpreadsheet) {
      setMessages([]);
      return;
    }

    let isMounted = true;

    // 1. Polling de secours périodique (toutes les 30s) avec timeout strict + Google Sheets sync
    const fetchLatestServerMessages = async () => {
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), 6000);
      try {
        // Check Google Spreadsheet first if configured
        const sheetRes = await fetch(`/api/sheets/collection?tenantId=${encodeURIComponent(tenantId)}&type=messagesInternes`, {
          signal: controller.signal,
        }).catch(() => null);
        if (sheetRes && sheetRes.ok && isMounted) {
          const sheetData = await sheetRes.json();
          if (sheetData?.fromSpreadsheet && Array.isArray(sheetData.items) && (sheetData.items.length > 0 || sheetData.hasRemoteHeaders)) {
            const mappedList: TenantMessage[] = sheetData.items
              .filter((m: any) => m && (m.content || m.text))
              .map((m: any, idx: number) => ({
                id: m.id || `msg_sheet_${idx + 2}`,
                authorName: m.authorName || m.sender || 'Membre',
                authorEmail: m.authorEmail || '',
                tag: 'All',
                content: m.content || m.text || '',
                createdAt: Number(m.createdAt) || Date.now(),
                dateStr: m.dateStr || m.time || '',
                tenantId,
                envId: tenantId,
              }));
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
          }
        }
        clearTimeout(timerId);
      } catch (_) {
        clearTimeout(timerId);
      }
    };

    // 2. Écoute des événements cross-tab storage pour mise à jour immédiate (0ms)
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
    window.addEventListener('storage', handleStorageChange);

    // Initial check
    fetchLatestServerMessages();

    // Timer auto-refresh fallback toutes les 30s
    const refreshTimer = setInterval(fetchLatestServerMessages, 30000);

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(refreshTimer);
    };
  }, [isOpen, tenantId, setMessages, hasMessagesSpreadsheet]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      scrollToBottom(true);
    }
  }, [messages.length, isOpen]);

  // All messages in a single unified thread for the tenant
  const displayedMessages = messages;

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

    const newMsg: TenantMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      authorName: currentUser.name || 'Membre',
      authorEmail: currentUser.email || '',
      tag: 'All',
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
      fetch('/api/sheets/upsert', {
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
      console.error('Erreur lors de la sauvegarde du message dans Firestore:', err);
    }

    setTimeout(() => {
      scrollToBottom(true);
      textareaRef.current?.focus();
    }, 50);
  };

  const handleDeleteMessage = async (msgId: string) => {
    const updated = messages.filter((m) => m.id !== msgId);
    setMessages(updated);
    setContextMenu(null);
    localStorage.setItem(`defib_${tenantId}_tenant_messages`, JSON.stringify(updated));

    try {
      fetch('/api/sheets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          type: 'messagesInternes',
          keys: [msgId],
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
      console.error('Erreur lors de la suppression du message dans Firestore:', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const maxX = typeof window !== 'undefined' ? window.innerWidth - 140 : e.clientX;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - 60 : e.clientY;
    setContextMenu({
      x: Math.max(10, Math.min(e.clientX, maxX)),
      y: Math.max(10, Math.min(e.clientY, maxY)),
      messageId: msgId,
    });
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const sidepaneContent = (
    <div
      id="canal-messages-sidepane"
      className={
        embedded
          ? "relative w-full h-full flex-1 bg-white flex flex-col overflow-hidden font-sans border-0 shadow-none rounded-none"
          : "relative w-full max-w-[760px] sm:w-[650px] lg:w-[760px] bg-[#fbfbfb] shadow-2xl flex flex-col h-full overflow-hidden animate-slideLeft font-sans"
      }
      onClick={(e) => e.stopPropagation()}
      style={{
        ...(!embedded ? { borderLeft: '1px solid #dadada' } : {}),
        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
      }}
    >
      {/* MESSAGES LIST AREA (LEAVE EMPTY WHEN NO MESSAGES) */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 bg-[#f8f9fa]">
        {displayedMessages.map((msg) => {
          const isMine =
            currentUser.email &&
            msg.authorEmail &&
            currentUser.email.trim().toLowerCase() === msg.authorEmail.trim().toLowerCase();

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group`}
              onContextMenu={(e) => handleContextMenu(e, msg.id)}
            >
              {/* Author Name + Dot + Horodatée (font color black) */}
              <div
                className={`flex items-center gap-2 mb-1.5 px-1 ${
                  isMine ? 'flex-row-reverse text-right' : 'flex-row text-left'
                }`}
              >
                <span className="font-bold text-black" style={{ fontSize: '14px' }}>
                  {msg.authorName || t('Membre')}
                </span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: '#334155' }}
                />
                <span
                  className="text-[13px] font-normal"
                  style={{ color: '#000000' }}
                >
                  {msg.dateStr}
                </span>
              </div>

              {/* Message Bubble */}
              <div
                className="rounded-2xl transition-all relative select-text"
                style={{
                  maxWidth: isMine ? '88%' : '92%',
                  backgroundColor: '#ebedee',
                  fontSize: '17px',
                  border: '1px solid #dadada6e',
                  boxShadow: 'none',
                  padding: '10px 14px',
                  color: '#000000',
                  cursor: 'default',
                }}
                title={t('Clic droit pour supprimer')}
              >
                <p
                  className="leading-relaxed whitespace-pre-wrap break-words m-0 select-text"
                  style={{
                    fontSize: '17px',
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

      {/* BOTTOM INPUT BAR (STICKY BOTTOM, BORDER-TOP FULL WIDTH #dadada) */}
      <div
        className={
          embedded
            ? "sticky bottom-0 z-20 w-full px-2 pt-2 pb-2 sm:pb-2.5 bg-white shadow-none shrink-0"
            : "sticky bottom-0 z-10 w-full p-2.5 sm:p-4 shrink-0 bg-[#fbfbfb]"
        }
        style={{
          background: embedded ? '#ffffff' : '#fbfbfb',
          backgroundColor: embedded ? '#ffffff' : '#fbfbfb',
          borderTop: '1px solid #dadada',
          boxShadow: 'none',
        }}
      >
        <form onSubmit={(e) => {
          if (!hasMessagesSpreadsheet) {
            e.preventDefault();
            return;
          }
          handleSendMessage(e);
        }}>
          <div
            className="flex items-center gap-2 bg-white rounded-2xl p-1.5 sm:p-2 pl-3 sm:pl-4 transition-all shadow-none"
            style={{ border: '1px solid #dadada', boxShadow: 'none' }}
          >
            {/* Message textarea: auto-height, max 350 chars, texte & placeholder centrés verticalement */}
            <textarea
              ref={textareaRef}
              rows={1}
              disabled={!hasMessagesSpreadsheet}
              value={messageInput}
              maxLength={350}
              onChange={(e) => {
                setMessageInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.max(28, Math.min(e.target.scrollHeight, 180))}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (hasMessagesSpreadsheet) handleSendMessage();
                }
              }}
              placeholder={!hasMessagesSpreadsheet ? "Veuillez configurer le Spreadsheet Messages Internes dans les paramètres du tenant." : "Entrez votre message."}
              className={`flex-1 bg-transparent border-0 outline-none text-black px-1 placeholder:text-slate-400 resize-none overflow-y-auto text-[16px] sm:text-[18px] ${!hasMessagesSpreadsheet ? 'cursor-not-allowed opacity-60' : ''}`}
              style={{
                lineHeight: '24px',
                minHeight: '28px',
                height: '28px',
                maxHeight: '180px',
                display: 'flex',
                alignItems: 'center',
                margin: 'auto 0',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            />

            {/* Submit button: responsive font-size, centré verticalement */}
            <button
              type="submit"
              disabled={!messageInput.trim() || !hasMessagesSpreadsheet}
              id="btn-send-canal-message"
              className="inline-flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0 self-center text-[15px] sm:text-[18px]"
              style={{
                backgroundColor: '#2e54ff',
                boxShadow:
                  'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #2e54ff, inset 0 6px 12px #ffffff1f',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                opacity: (!messageInput.trim() || !hasMessagesSpreadsheet) ? 0.45 : 1,
                cursor: (!messageInput.trim() || !hasMessagesSpreadsheet) ? 'not-allowed' : 'pointer',
              }}
              title={!hasMessagesSpreadsheet ? "Veuillez renseigner l'URL du Spreadsheet Messages Internes dans les paramètres du tenant." : undefined}
            >
              <span>{t('Envoyer')}</span>
            </button>

            {/* Bouton Fermer : en bas à droite, à droite du bouton Envoyer */}
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                id="btn-close-canal-sidepane"
                className="inline-flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0 self-center hover:opacity-90 active:scale-[0.98] text-[15px] sm:text-[18px]"
                style={{
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
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

      {/* CONTEXT MENU ON RIGHT CLICK TO DELETE MESSAGE */}
      {contextMenu && (
        <>
          {/* Backdrop transparent pour masquer immédiatement le bouton quand on clique en dehors */}
          <div
            className="fixed inset-0 z-[99999]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
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
                backgroundColor: 'rgb(163, 20, 20)',
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
