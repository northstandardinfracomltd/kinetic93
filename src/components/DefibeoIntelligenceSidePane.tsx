import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Send } from 'lucide-react';
import { t } from '../utils/translate';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface DefibeoIntelligenceSidePaneProps {
  isOpen: boolean;
  onClose: () => void;
  tenantContext: any;
}

export const DefibeoIntelligenceSidePane: React.FC<DefibeoIntelligenceSidePaneProps> = ({
  isOpen,
  onClose,
  tenantContext,
}) => {
  // STRICTLY IN-MEMORY: Never stored in localStorage, sessionStorage, IndexedDB or Firebase!
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom(false);
      }, 80);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom(true);
    }
  }, [messages.length, isLoading, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleQuitConversation();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleQuitConversation = () => {
    // Ephemeral wipe: clear conversation without persisting anything
    setMessages([]);
    setInputQuestion('');
    setIsLoading(false);
    onClose();
  };

  const handleSendMessage = async (e?: React.FormEvent, directText?: string) => {
    if (e) e.preventDefault();
    const query = (directText !== undefined ? directText : inputQuestion).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: query,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputQuestion('');
    setIsLoading(true);

    try {
      const resp = await fetch('/api/defibeo-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          history: messages.slice(-4).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          tenantContext,
        }),
      });

      if (!resp.ok) {
        const errorJson = await resp.json().catch(() => ({}));
        throw new Error(errorJson.error || `Erreur serveur (${resp.status})`);
      }

      const data = await resp.json();
      const assistantText = data.answer || "Désolé, aucune réponse n'a été renvoyée.";

      const assistantMsg: ChatMessage = {
        id: `ast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        role: 'assistant',
        content: assistantText,
        createdAt: Date.now(),
      };

      setMessages([...nextMessages, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: err.message || "Une erreur est survenue lors de l'interrogation de l'IA.",
        createdAt: Date.now(),
      };
      setMessages([...nextMessages, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
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
      onClick={handleQuitConversation}
    >
      <div
        id="defibeo-intelligence-sidepane"
        className="relative w-full max-w-[620px] sm:w-[560px] lg:w-[620px] bg-[#fbfbfb] shadow-2xl flex flex-col h-full overflow-hidden animate-slideLeft font-sans"
        onClick={(e) => e.stopPropagation()}
        style={{
          borderLeft: '1px solid #dadada',
          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
        }}
      >
        {/* HEADER */}
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
              {t('Defibeo Intelligence')}
            </h3>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200"
            >
              {t('IA')}
            </span>
          </div>

          <button
            type="button"
            onClick={handleQuitConversation}
            id="btn-close-defibeo-intelligence"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer border-0 bg-transparent"
            title={t('Fermer')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CHAT MESSAGES AREA (VERY SIMPLE & MINIMALIST WITHOUT ICONS) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#f8f9fa]">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <div
                className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mb-3 shadow-xs border border-[#dadada] text-black font-extrabold text-xl"
              >
                DI
              </div>
              <p
                className="text-[17px] font-bold text-black mb-1.5"
                style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
              >
                {t('Defibeo Intelligence')}
              </p>
              <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-6">
                {t(
                  'Posez vos questions sur vos défibrillateurs, vos clients, vos interventions ou sur l’utilisation du logiciel.'
                )}
              </p>

              {/* Suggested example questions */}
              <div className="w-full max-w-md space-y-2 text-left">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  {t('Exemples de questions')} :
                </p>
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      undefined,
                      'Quels sont les défibrillateurs avec une intervention à faire pour mon client Dupont'
                    )
                  }
                  className="w-full p-3 rounded-xl bg-white border border-[#dadada] hover:border-blue-400 hover:bg-blue-50/50 text-left text-xs font-medium text-slate-700 transition-all cursor-pointer shadow-2xs"
                >
                  « Quels sont les défibrillateurs avec une intervention à faire pour mon client Dupont »
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      undefined,
                      'Quels défibrillateurs ont une date de maintenance dépassée ou prévue ce mois-ci ?'
                    )
                  }
                  className="w-full p-3 rounded-xl bg-white border border-[#dadada] hover:border-blue-400 hover:bg-blue-50/50 text-left text-xs font-medium text-slate-700 transition-all cursor-pointer shadow-2xs"
                >
                  « Quels défibrillateurs ont une date de maintenance dépassée ou prévue ce mois-ci ? »
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      undefined,
                      'Combien de défibrillateurs et de clients sont actuellement enregistrés ?'
                    )
                  }
                  className="w-full p-3 rounded-xl bg-white border border-[#dadada] hover:border-blue-400 hover:bg-blue-50/50 text-left text-xs font-medium text-slate-700 transition-all cursor-pointer shadow-2xs"
                >
                  « Combien de défibrillateurs et de clients sont actuellement enregistrés ? »
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-fadeIn`}
                >
                  {/* Sender label */}
                  <div className="mb-1 px-1 text-[11px] font-semibold text-slate-400">
                    {isUser ? t('Vous') : t('Defibeo Intelligence')}
                  </div>

                  {/* Message bubble (pure minimalist text, no icons) */}
                  <div
                    className="rounded-2xl p-3.5 shadow-2xs transition-all relative select-text"
                    style={{
                      maxWidth: isUser ? '85%' : '92%',
                      backgroundColor: isUser ? '#ffffff' : '#ffffff',
                      border: isUser ? '1.5px solid #3556ec' : '1px solid #dadada',
                      color: '#000000',
                      borderBottomRightRadius: isUser ? '4px' : '16px',
                      borderBottomLeftRadius: !isUser ? '4px' : '16px',
                    }}
                  >
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

          {isLoading && (
            <div className="flex flex-col items-start animate-fadeIn">
              <div className="mb-1 px-1 text-[11px] font-semibold text-slate-400">
                {t('Defibeo Intelligence')}
              </div>
              <div
                className="rounded-2xl rounded-bl-xs p-3.5 bg-white border border-[#dadada] text-black shadow-2xs max-w-[90%]"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  <span>{t('Defibeo Intelligence analyse vos données...')}</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* BOTTOM FLOATING INPUT & CONTROLS */}
        <div
          className="sticky bottom-0 bg-white/95 backdrop-blur-md p-4 shrink-0 shadow-lg"
          style={{ borderTop: '1px solid #dadada' }}
        >
          {/* Gélule en petit en floating juste au-dessus du champ de saisie */}
          <div className="flex justify-center mb-2.5">
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 select-none shadow-2xs text-center"
              style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
            >
              {t('Defibeo Intelligence est une IA expérimentale et peut se tromper.')}
            </span>
          </div>

          <form onSubmit={(e) => handleSendMessage(e)} className="space-y-2.5">
            {/* Input bar */}
            <div
              className="flex items-center gap-2 bg-[#f8fafc] rounded-2xl p-1.5 pl-3 transition-all"
              style={{ border: '1px solid #dadada' }}
            >
              <input
                ref={inputRef}
                type="text"
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                placeholder={t('Posez votre question sur vos données ou le logiciel...')}
                disabled={isLoading}
                className="flex-1 bg-transparent border-0 outline-none text-black text-[15px] px-2 py-1 placeholder:text-slate-400"
                style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
              />

              <button
                type="submit"
                disabled={!inputQuestion.trim() || isLoading}
                id="btn-submit-defibeo-intelligence"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0"
                style={{
                  backgroundColor: '#3556ec',
                  boxShadow:
                    'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                  fontSize: '15px',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  opacity: !inputQuestion.trim() || isLoading ? 0.45 : 1,
                  cursor: !inputQuestion.trim() || isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                <span>{t('Envoyer')}</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Bouton Quitter la conversation directement en dessous */}
            <button
              type="button"
              onClick={handleQuitConversation}
              id="btn-quit-defibeo-intelligence"
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-black transition-all cursor-pointer border border-slate-200 text-center"
              style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
            >
              {t('Quitter la conversation')}
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};
