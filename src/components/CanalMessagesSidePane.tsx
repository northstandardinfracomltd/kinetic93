import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, saveCollectionToFirestore, getCollectionKey } from '../firebase';
import { TenantMessage } from '../types';
import { t } from '../utils/translate';
import { Trash2 } from 'lucide-react';

export const CANAL_TAGS = [
  { name: 'Exploitation', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', dot: '#2563eb' },
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
}

export const CanalMessagesSidePane: React.FC<CanalMessagesSidePaneProps> = ({
  isOpen,
  onClose,
  tenantId,
  currentUser,
  messages,
  setMessages,
  onMessagesRead,
}) => {
  // Par défaut, le filtre est positionné sur 'Exploitation' (la gélule Tous ayant été supprimée)
  const [selectedFilterTag, setSelectedFilterTag] = useState<CanalTagName>('Exploitation');
  const [messageInput, setMessageInput] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto scroll to bottom
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) setContextMenu(null);
        else onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('click', handleGlobalClick);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, contextMenu, onClose]);

  // Mark messages as read when opening
  useEffect(() => {
    if (isOpen) {
      if (onMessagesRead) onMessagesRead();
      setTimeout(() => {
        scrollToBottom(false);
        textareaRef.current?.focus();
      }, 80);
    }
  }, [isOpen, onMessagesRead]);

  // Real-time Firestore sync
  useEffect(() => {
    if (!isOpen || !tenantId) return;
    try {
      const colKey = getCollectionKey('tenantMessages', tenantId);
      const docRef = doc(db, 'appData', colKey);
      const unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            let remoteList: TenantMessage[] = [];
            if (Array.isArray(data?.value)) {
              remoteList = data.value;
            } else if (Array.isArray(data)) {
              remoteList = data;
            }
            if (remoteList && remoteList.length >= 0) {
              setMessages(remoteList);
              localStorage.setItem(`defib_${tenantId}_tenant_messages`, JSON.stringify(remoteList));
            }
          }
        },
        (error) => {
          console.warn('Real-time listener on tenantMessages notice:', error);
        }
      );
      return () => unsubscribe();
    } catch (e) {
      console.warn('Error setting up onSnapshot for tenantMessages:', e);
    }
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
      await saveCollectionToFirestore('tenantMessages', updated, tenantId);
    } catch (err) {
      console.error('Erreur lors de la suppression du message dans Firestore:', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 100),
      messageId: msgId,
    });
  };

  if (!isOpen || typeof document === 'undefined') return null;

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
      <div
        id="canal-messages-sidepane"
        className="relative w-full max-w-[760px] sm:w-[650px] lg:w-[760px] bg-[#fbfbfb] shadow-2xl flex flex-col h-full overflow-hidden animate-slideLeft font-sans"
        onClick={(e) => e.stopPropagation()}
        style={{
          borderLeft: '1px solid #dadada',
          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
        }}
      >
        {/* TOP TAGS BAR (AUCUN SPACING COUPÉ À GAUCHE/DROITE, SANS BACKGROUND, SANS BORDER-BOTTOM, SANS BOX-SHADOW) */}
        <div
          className="py-3 shrink-0 z-10 w-full"
          style={{
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: 'none',
            boxShadow: 'none',
            paddingLeft: 0,
            paddingRight: 0,
          }}
        >
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-3 w-full">
            {/* Bouton Fermer : background noir et texte blanc, font-size 18px, AUCUN BOX-SHADOW */}
            <button
              type="button"
              onClick={onClose}
              id="btn-close-canal-sidepane"
              className="px-5 py-2 rounded-full font-bold shrink-0 transition-all cursor-pointer hover:opacity-90 active:scale-[0.98]"
              style={{
                backgroundColor: '#000000',
                color: '#ffffff',
                border: 'none',
                boxShadow: 'none',
                fontSize: '18px',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            >
              {t('Fermer')}
            </button>

            {/* 8 Required Tags (font-size 18px, sans border, AUCUN BOX-SHADOW, pas de gélule Tous) */}
            {CANAL_TAGS.map((tag) => {
              const isSelected = selectedFilterTag === tag.name;
              const count = messages.filter((m) => m.tag === tag.name).length;
              return (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => setSelectedFilterTag(tag.name)}
                  className="px-4 py-2 rounded-full shrink-0 transition-all cursor-pointer flex items-center gap-2 font-medium"
                  style={{
                    backgroundColor: isSelected ? tag.dot : tag.bg,
                    color: isSelected ? '#ffffff' : tag.text,
                    border: 'none',
                    boxShadow: 'none',
                    fontSize: '18px',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: isSelected ? '#ffffff' : tag.dot }}
                  />
                  <span>{tag.name}</span>
                  {count > 0 && (
                    <span
                      className="inline-flex items-center justify-center rounded-full shrink-0 font-bold"
                      style={{
                        backgroundColor: 'rgb(163, 20, 20)',
                        color: '#ffffff',
                        fontSize: '14px',
                        width: '25px',
                        height: '25px',
                        padding: '3.5px',
                        lineHeight: 1,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* MESSAGES LIST AREA (LEAVE EMPTY WHEN NO MESSAGES) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#f8f9fa]">
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

                {/* Message Bubble : background-color: #ebedee; font-size: 18px; border: 1px solid #dadada6e; box-shadow: none; padding: 10px 15px; color: #000; cursor : default; */}
                <div
                  className="rounded-2xl transition-all relative select-text"
                  style={{
                    maxWidth: isMine ? '85%' : '90%',
                    backgroundColor: '#ebedee',
                    fontSize: '18px',
                    border: '1px solid #dadada6e',
                    boxShadow: 'none',
                    padding: '10px 15px',
                    color: '#000000',
                    cursor: 'default',
                  }}
                  title={t('Clic droit pour supprimer')}
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

        {/* BOTTOM INPUT BAR FLOATING (SANS BACKGROUND ET SANS BORDER-TOP DERRIÈRE) */}
        <div
          className="p-3 sm:p-4 shrink-0"
          style={{
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
            borderTop: 'none',
          }}
        >
          <form onSubmit={handleSendMessage}>
            <div
              className="flex items-center gap-2 bg-white rounded-2xl p-2 pl-4 transition-all shadow-lg"
              style={{ border: '1px solid #dadada' }}
            >
              {/* Message textarea: auto-height, max 350 chars, font-size 18px, texte & placeholder centrés verticalement */}
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
                className="flex-1 bg-transparent border-0 outline-none text-black px-1 placeholder:text-slate-400 resize-none overflow-y-auto"
                style={{
                  fontSize: '18px',
                  lineHeight: '26px',
                  minHeight: '28px',
                  height: '28px',
                  maxHeight: '180px',
                  display: 'flex',
                  alignItems: 'center',
                  margin: 'auto 0',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
              />

              {/* Submit button: font-size 18px, no send icon, centré verticalement */}
              <button
                type="submit"
                disabled={!messageInput.trim()}
                id="btn-send-canal-message"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0 self-center"
                style={{
                  backgroundColor: '#3556ec',
                  boxShadow:
                    'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                  fontSize: '18px',
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
          <div
            className="fixed bg-white rounded-xl shadow-2xl z-[100000] p-1 animate-scaleIn"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
              border: '1px solid #dadada',
              minWidth: '140px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleDeleteMessage(contextMenu.messageId)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors border-0 bg-transparent text-left"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('Supprimer')}</span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
