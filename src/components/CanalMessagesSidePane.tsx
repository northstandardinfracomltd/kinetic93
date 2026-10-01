import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, saveCollectionToFirestore, getCollectionKey } from '../firebase';
import { TenantMessage } from '../types';
import { t } from '../utils/translate';
import { X, Send, Trash2, Tag as TagIcon, Check, ChevronUp } from 'lucide-react';

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
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(null);
  const [selectedInputTag, setSelectedInputTag] = useState<CanalTagName>('Exploitation');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
        else if (isTagDropdownOpen) setIsTagDropdownOpen(false);
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
  }, [isOpen, contextMenu, isTagDropdownOpen, onClose]);

  // Close tag selector on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setIsTagDropdownOpen(false);
      }
    };
    if (isTagDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isTagDropdownOpen]);

  // Mark messages as read when opening
  useEffect(() => {
    if (isOpen) {
      if (onMessagesRead) onMessagesRead();
      setTimeout(() => scrollToBottom(false), 80);
      inputRef.current?.focus();
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
    if (!selectedFilterTag) return messages;
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

    const newMsg: TenantMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      authorName: currentUser.name || 'Membre',
      authorEmail: currentUser.email || '',
      tag: selectedInputTag,
      content: text,
      createdAt: Date.now(),
      dateStr: dateFormatted,
      tenantId,
      envId: tenantId,
    };

    const updated = [...messages, newMsg];
    setMessages(updated);
    setMessageInput('');
    localStorage.setItem(`defib_${tenantId}_tenant_messages`, JSON.stringify(updated));
    localStorage.setItem(`defib_${tenantId}_messages_last_seen`, String(Date.now()));

    try {
      await saveCollectionToFirestore('tenantMessages', updated, tenantId);
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du message dans Firestore:', err);
    }

    setTimeout(() => scrollToBottom(true), 50);
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

  const currentInputTagObj = getTagInfo(selectedInputTag);

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
        {/* TOP HEADER */}
        <div
          className="px-6 py-4 bg-white flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid #dadada' }}
        >
          <div className="flex items-center gap-3">
            <h3
              className="text-xl font-bold tracking-tight text-black m-0"
              style={{
                fontSize: '20px',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            >
              {t('Canal Messages')}
            </h3>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium"
              style={{ border: '1px solid #e2e8f0' }}
            >
              {t('Équipe')} ({messages.length})
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            id="btn-close-canal-messages"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer border-0 bg-transparent"
            title={t('Fermer')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FLOATING TAGS BAR AT THE VERY TOP */}
        <div
          className="px-4 py-2.5 bg-white/95 backdrop-blur-xs shrink-0 shadow-xs z-10"
          style={{ borderBottom: '1px solid #dadada' }}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {/* Filter "Tous" */}
            <button
              type="button"
              onClick={() => setSelectedFilterTag(null)}
              className="px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer border"
              style={{
                backgroundColor: selectedFilterTag === null ? '#000000' : '#ffffff',
                color: selectedFilterTag === null ? '#ffffff' : '#475569',
                borderColor: selectedFilterTag === null ? '#000000' : '#dadada',
              }}
            >
              {t('Tous')} ({messages.length})
            </button>

            {/* 8 Required Tags */}
            {CANAL_TAGS.map((tag) => {
              const isSelected = selectedFilterTag === tag.name;
              const count = messages.filter((m) => m.tag === tag.name).length;
              return (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => setSelectedFilterTag(isSelected ? null : tag.name)}
                  className="px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border"
                  style={{
                    backgroundColor: isSelected ? tag.dot : tag.bg,
                    color: isSelected ? '#ffffff' : tag.text,
                    borderColor: isSelected ? tag.dot : tag.border,
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: isSelected ? '#ffffff' : tag.dot }}
                  />
                  <span>{tag.name}</span>
                  {count > 0 && (
                    <span
                      className="ml-0.5 text-[10px] px-1 rounded-full"
                      style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
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

        {/* MESSAGES LIST AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#f8f9fa]">
          {displayedMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-3 shadow-xs border border-[#dadada]">
                <TagIcon className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-[16px] font-medium text-slate-600 mb-1">
                {selectedFilterTag
                  ? `${t('Aucun message pour')} « ${selectedFilterTag} »`
                  : t('Aucun message pour le moment.')}
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                {t('Commencez la discussion en envoyant un message avec un tag pour informer votre équipe.')}
              </p>
            </div>
          ) : (
            displayedMessages.map((msg) => {
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
                  {/* Author Name + Time */}
                  <div
                    className={`flex items-center gap-2 mb-1 px-1 text-xs ${
                      isMine ? 'flex-row-reverse text-right' : 'flex-row text-left'
                    }`}
                  >
                    <span className="font-bold text-black" style={{ fontSize: '13px' }}>
                      {msg.authorName || t('Membre')}
                    </span>
                    <span className="text-slate-400 text-[11px] font-normal">{msg.dateStr}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className="max-w-[85%] sm:max-w-[78%] rounded-2xl p-3.5 shadow-2xs transition-all relative"
                    style={{
                      backgroundColor: isMine ? '#ffffff' : '#ffffff',
                      border: isMine ? '1.5px solid #3556ec' : '1px solid #dadada',
                      color: '#000000',
                    }}
                    title={t('Clic droit pour supprimer')}
                  >
                    {/* Tag badge in bubble */}
                    <div className="mb-2">
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
                        style={{
                          backgroundColor: tagInfo.bg,
                          color: tagInfo.text,
                          borderColor: tagInfo.border,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: tagInfo.dot }}
                        />
                        {tagInfo.name}
                      </span>
                    </div>

                    {/* Content */}
                    <p
                      className="text-[15px] leading-relaxed whitespace-pre-wrap break-words m-0 select-text"
                      style={{ color: '#000000' }}
                    >
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* BOTTOM FULL-WIDTH INPUT BAR */}
        <div
          className="bg-white p-3 sm:p-4 shrink-0"
          style={{ borderTop: '1px solid #dadada' }}
        >
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div
              className="flex items-center gap-2 bg-[#f8fafc] rounded-2xl p-1.5 pl-3 transition-all"
              style={{ border: '1px solid #dadada' }}
            >
              {/* Tag choice pill (gélule) */}
              <div className="relative shrink-0" ref={tagDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsTagDropdownOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all border shadow-2xs hover:brightness-95"
                  style={{
                    backgroundColor: currentInputTagObj.bg,
                    color: currentInputTagObj.text,
                    borderColor: currentInputTagObj.border,
                  }}
                  title={t('Choisir le tag')}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: currentInputTagObj.dot }}
                  />
                  <span>{currentInputTagObj.name}</span>
                  <ChevronUp
                    className={`w-3.5 h-3.5 transition-transform ${
                      isTagDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Tag Selection Popup Dropdown */}
                {isTagDropdownOpen && (
                  <div
                    className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-xl shadow-xl z-50 p-1.5 animate-fadeIn"
                    style={{ border: '1px solid #dadada' }}
                  >
                    <div className="text-[11px] font-bold text-slate-400 uppercase px-2 py-1">
                      {t('Choisir un tag')}
                    </div>
                    <div className="space-y-0.5">
                      {CANAL_TAGS.map((tItem) => {
                        const isSelected = selectedInputTag === tItem.name;
                        return (
                          <button
                            key={tItem.name}
                            type="button"
                            onClick={() => {
                              setSelectedInputTag(tItem.name);
                              setIsTagDropdownOpen(false);
                              inputRef.current?.focus();
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors text-left border-0 ${
                              isSelected ? 'bg-slate-100 font-bold' : 'hover:bg-slate-50'
                            }`}
                            style={{ color: '#000000' }}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: tItem.dot }}
                              />
                              <span>{tItem.name}</span>
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Message text input */}
              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder={t('Écrivez votre message pour l’équipe...')}
                className="flex-1 bg-transparent border-0 outline-none text-black text-[15px] px-2 py-1 placeholder:text-slate-400"
                style={{
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!messageInput.trim()}
                id="btn-send-canal-message"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0"
                style={{
                  backgroundColor: '#3556ec',
                  boxShadow:
                    'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                  fontSize: '15px',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  opacity: !messageInput.trim() ? 0.45 : 1,
                  cursor: !messageInput.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                <span>{t('Envoyer')}</span>
                <Send className="w-3.5 h-3.5" />
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
