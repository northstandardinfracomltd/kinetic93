import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, saveCollectionToFirestore, getCollectionKey } from '../firebase';
import { TenantMessage } from '../types';
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
}) => {
  // Par défaut, le filtre est positionné sur 'Exploitation' (la gélule Tous ayant été supprimée)
  const [selectedFilterTag, setSelectedFilterTag] = useState<CanalTagName>('Exploitation');
  const [messageInput, setMessageInput] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const channelDropdownRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Close channel dropdown on outside click
  useEffect(() => {
    if (!isChannelDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (channelDropdownRef.current && !channelDropdownRef.current.contains(e.target as Node)) {
        setIsChannelDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isChannelDropdownOpen]);

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
        if (isChannelDropdownOpen) setIsChannelDropdownOpen(false);
        else if (contextMenu) setContextMenu(null);
        else onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, contextMenu, isChannelDropdownOpen, onClose]);

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

    let isMounted = true;

    // 1. Polling dynamique ultra-rapide toutes les secondes (1000ms)
    const fetchLatestServerMessages = async () => {
      try {
        const resp = await fetch(`/api/sync-collection?collectionName=tenantMessages&tenantId=${encodeURIComponent(tenantId)}&_=${Date.now()}`);
        if (resp.ok && isMounted) {
          const data = await resp.json();
          const remoteList: TenantMessage[] = Array.isArray(data?.value) ? data.value : (Array.isArray(data) ? data : []);
          if (remoteList && remoteList.length >= 0) {
            setMessages((prev) => {
              if (JSON.stringify(prev) !== JSON.stringify(remoteList)) {
                try {
                  localStorage.setItem(`defib_${tenantId}_tenant_messages`, JSON.stringify(remoteList));
                } catch (_) {}
                return remoteList;
              }
              return prev;
            });
          }
        }
      } catch (_) {}
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

    // Timer auto-refresh toutes les 1000ms (1 seconde)
    const refreshTimer = setInterval(fetchLatestServerMessages, 1000);

    // 3. Listener Firestore en complément
    let unsubscribeFirestore: (() => void) | undefined;
    try {
      const colKey = getCollectionKey('tenantMessages', tenantId);
      const docRef = doc(db, 'appData', colKey);
      unsubscribeFirestore = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists() && isMounted) {
            const data = snapshot.data();
            let remoteList: TenantMessage[] = [];
            if (Array.isArray(data?.value)) {
              remoteList = data.value;
            } else if (Array.isArray(data)) {
              remoteList = data;
            }
            if (remoteList && remoteList.length >= 0) {
              setMessages((prev) => {
                if (JSON.stringify(prev) !== JSON.stringify(remoteList)) {
                  try {
                    localStorage.setItem(`defib_${tenantId}_tenant_messages`, JSON.stringify(remoteList));
                  } catch (_) {}
                  return remoteList;
                }
                return prev;
              });
            }
          }
        },
        (error) => {
          console.warn('Real-time listener on tenantMessages notice:', error);
        }
      );
    } catch (e) {
      console.warn('Error setting up onSnapshot for tenantMessages:', e);
    }

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(refreshTimer);
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [isOpen, tenantId, setMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      scrollToBottom(true);
    }
  }, [messages.length, isOpen]);

  // Filtered messages
  const displayedMessages = useMemo(() => {
    return messages.filter((m) => m.tag === selectedFilterTag);
  }, [messages, selectedFilterTag]);

  // Tag helper
  const getTagInfo = (tagName: string) => {
    const found = CANAL_TAGS.find((t) => t.name === tagName);
    return (
      found || {
        name: tagName,
        bg: '#f1f5f9',
        text: '#334155',
        border: '#cbd5e1',
        dot: '#64748b',
      }
    );
  };

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

    // Le message est automatiquement envoyé dans le tag de l'onglet actif (ex: Exploitation)
    const newMsg: TenantMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      authorName: currentUser.name || 'Membre',
      authorEmail: currentUser.email || '',
      tag: selectedFilterTag,
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
      {/* TOP TAGS BAR (AUCUN SPACING COUPÉ À GAUCHE/DROITE, SANS BACKGROUND, SANS BORDER-BOTTOM, SANS BOX-SHADOW) */}
      <div
        className={
          embedded
            ? "sticky top-0 z-20 w-full bg-white/95 backdrop-blur-xs py-2 px-2 shrink-0"
            : "py-2.5 sm:py-3 shrink-0 z-10 w-full"
        }
        style={{
          background: embedded ? '#ffffff' : 'transparent',
          backgroundColor: embedded ? '#ffffff' : 'transparent',
          border: 'none',
          boxShadow: 'none',
          paddingLeft: embedded ? '8px' : 0,
          paddingRight: embedded ? '8px' : 0,
        }}
      >
        <div className="flex items-center gap-2 py-0.5 w-full relative z-20 overflow-visible flex-wrap sm:flex-nowrap">
          {/* Bouton Fermer : uniquement dans le logiciel principal, masqué dans la webapp */}
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              id="btn-close-canal-sidepane"
              className="px-4 sm:px-5 py-2 rounded-full font-bold shrink-0 transition-all cursor-pointer hover:opacity-90 active:scale-[0.98] text-[15px] sm:text-[18px]"
              style={{
                backgroundColor: '#000000',
                color: '#ffffff',
                border: 'none',
                boxShadow: 'none',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            >
              {t('Fermer')}
            </button>
          )}

          {/* 1 Gélule du canal ouvert */}
          {(() => {
            const currentTag = CANAL_TAGS.find((t) => t.name === selectedFilterTag) || CANAL_TAGS[0];
            const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
            const now = Date.now();
            const recentCount = messages.filter((m) => {
              if (m.tag !== currentTag.name) return false;
              const msgTime = m.createdAt ? Number(m.createdAt) : 0;
              return now - msgTime <= TWO_HOURS_MS;
            }).length;

            return (
              <div
                className="px-3.5 sm:px-4 py-2 rounded-full shrink-0 flex items-center gap-2 font-medium text-[15px] sm:text-[18px]"
                style={{
                  backgroundColor: currentTag.dot,
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: 'none',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 bg-white"
                />
                <span className="truncate max-w-[130px] sm:max-w-none">{currentTag.name}</span>
                {recentCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center rounded-full shrink-0 font-bold"
                    style={{
                      backgroundColor: 'rgb(163, 20, 20)',
                      color: '#ffffff',
                      fontSize: '13px',
                      width: '23px',
                      height: '23px',
                      padding: '2px',
                      lineHeight: 1,
                    }}
                  >
                    {recentCount}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Bouton « Ouvrir un canal » avec dropdown des catégories (sans arrow icon) */}
          <div ref={channelDropdownRef} className="relative inline-flex items-center shrink-0">
            <button
              type="button"
              id="btn-ouvrir-un-canal"
              onClick={(e) => {
                e.stopPropagation();
                setIsChannelDropdownOpen((prev) => !prev);
              }}
              className="px-4 sm:px-5 py-2 rounded-full font-bold shrink-0 transition-all cursor-pointer hover:opacity-90 active:scale-[0.98] flex items-center justify-center text-[15px] sm:text-[18px]"
              style={{
                backgroundColor: '#3556ec',
                color: '#ffffff',
                border: 'none',
                boxShadow: 'none',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            >
              <span>{t('Ouvrir un canal')}</span>
            </button>

            {isChannelDropdownOpen && (
              <div
                className="absolute top-full left-0 sm:left-auto mt-2 min-w-[240px] sm:min-w-[250px] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl py-2 z-50 animate-fadeIn"
                style={{
                  border: '1px solid #dadada',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="max-h-72 overflow-y-auto py-1">
                  {CANAL_TAGS.filter((tag) => tag.name !== selectedFilterTag).map((tag) => {
                    const count = messages.filter((m) => m.tag === tag.name).length;
                    return (
                      <button
                        key={tag.name}
                        type="button"
                        onClick={() => {
                          setSelectedFilterTag(tag.name);
                          setIsChannelDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-all hover:bg-slate-100 cursor-pointer border-0 bg-transparent"
                        style={{
                          fontSize: '16px',
                          color: '#000000',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: tag.dot }}
                          />
                          <span className="font-semibold truncate">{tag.name}</span>
                        </div>
                        <span
                          className="inline-flex items-center justify-center rounded-full text-xs font-bold px-2 py-0.5 ml-2"
                          style={{
                            backgroundColor: count > 0 ? '#3556ec18' : '#f1f5f9',
                            color: count > 0 ? '#3556ec' : '#64748b',
                          }}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MESSAGES LIST AREA (LEAVE EMPTY WHEN NO MESSAGES) */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 bg-[#f8f9fa]">
        {displayedMessages.map((msg) => {
          const isMine =
            currentUser.email &&
            msg.authorEmail &&
            currentUser.email.trim().toLowerCase() === msg.authorEmail.trim().toLowerCase();
          const tagInfo = getTagInfo(msg.tag);

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group`}
              onContextMenu={(e) => handleContextMenu(e, msg.id)}
            >
              {/* Author Name + Dot Tag Color + Horodatée (font color black) */}
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
                  style={{ backgroundColor: tagInfo.dot }}
                  title={tagInfo.name}
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

      {/* BOTTOM INPUT BAR FLOATING (SANS BACKGROUND ET SANS BORDER-TOP DERRIÈRE) */}
      <div
        className={
          embedded
            ? "sticky bottom-0 z-20 w-full px-2 pt-1 pb-2 sm:pb-2.5 bg-white/95 backdrop-blur-xs shrink-0"
            : "p-2.5 sm:p-4 shrink-0"
        }
        style={{
          background: embedded ? '#ffffff' : 'transparent',
          backgroundColor: embedded ? '#ffffff' : 'transparent',
          border: 'none',
          borderTop: 'none',
        }}
      >
        <form onSubmit={handleSendMessage}>
          <div
            className="flex items-center gap-2 bg-white rounded-2xl p-1.5 sm:p-2 pl-3 sm:pl-4 transition-all shadow-lg"
            style={{ border: '1px solid #dadada' }}
          >
            {/* Message textarea: auto-height, max 350 chars, texte & placeholder centrés verticalement */}
            <textarea
              ref={textareaRef}
              rows={1}
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
                  handleSendMessage();
                }
              }}
              placeholder="Entrez votre message."
              className="flex-1 bg-transparent border-0 outline-none text-black px-1 placeholder:text-slate-400 resize-none overflow-y-auto text-[16px] sm:text-[18px]"
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
              disabled={!messageInput.trim()}
              id="btn-send-canal-message"
              className="inline-flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0 self-center text-[15px] sm:text-[18px]"
              style={{
                backgroundColor: '#3556ec',
                boxShadow:
                  'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                opacity: !messageInput.trim() ? 0.45 : 1,
                cursor: !messageInput.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              <span>{t('Envoyer')}</span>
            </button>
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
