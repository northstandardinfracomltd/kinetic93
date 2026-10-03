import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../utils/translate';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

const TypingBubbleText: React.FC<{
  content: string;
  isTyping: boolean;
  onDone: () => void;
  onProgress?: () => void;
}> = ({ content, isTyping, onDone, onProgress }) => {
  const [displayedText, setDisplayedText] = useState(isTyping ? '' : content);
  const [finished, setFinished] = useState(!isTyping);

  useEffect(() => {
    if (!isTyping) {
      setDisplayedText(content);
      setFinished(true);
      return;
    }

    setDisplayedText('');
    setFinished(false);

    let charIndex = 0;
    const totalChars = content.length;
    // Dynamic typing speed: letter by letter for short answers, smooth chunking for longer responses
    const chunkSize = totalChars > 500 ? 5 : totalChars > 250 ? 3 : totalChars > 80 ? 2 : 1;
    const intervalMs = totalChars > 500 ? 12 : 16;

    const intervalId = setInterval(() => {
      charIndex += chunkSize;
      if (charIndex >= totalChars) {
        setDisplayedText(content);
        setFinished(true);
        clearInterval(intervalId);
        onDone();
        onProgress?.();
      } else {
        setDisplayedText(content.slice(0, charIndex));
        onProgress?.();
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [content, isTyping]);

  return (
    <p
      className="leading-relaxed whitespace-pre-wrap break-words m-0 select-text"
      style={{
        fontSize: '18px',
        color: '#000000',
        cursor: 'default',
      }}
    >
      {displayedText}
      {isTyping && !finished && (
        <span
          className="inline-block w-[2px] h-[18px] ml-1 bg-black/70 align-middle animate-pulse"
          style={{ verticalAlign: 'baseline' }}
        />
      )}
    </p>
  );
};

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
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quota, setQuota] = useState<{ used: number; max: number; remaining: number; exceeded: boolean }>({
    used: 0,
    max: 8,
    remaining: 8,
    exceeded: false,
  });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const fetchQuota = async () => {
    try {
      const activeTid = tenantContext?.tenantId || (typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') || 'demo' : 'demo');
      const resp = await fetch(`/api/defibeo-intelligence/quota?tenantId=${encodeURIComponent(activeTid)}&_=${Date.now()}`);
      if (resp.ok) {
        const data = await resp.json();
        setQuota({
          used: Number(data.questionsUsed) || 0,
          max: Number(data.maxQuestions) || 8,
          remaining: Number(data.remaining) || 0,
          exceeded: Boolean(data.quotaExceeded || Number(data.questionsUsed) >= 8),
        });
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (isOpen) {
      fetchQuota();
      setTimeout(() => {
        textareaRef.current?.focus();
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
    setTypingMessageId(null);
    setInputQuestion('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '28px';
    }
    setIsLoading(false);
    onClose();
  };

  const handleSendMessage = async (e?: React.FormEvent, directText?: string) => {
    if (e) e.preventDefault();
    const query = (directText !== undefined ? directText : inputQuestion).trim();
    if (!query || isLoading) return;

    if (quota.exceeded) {
      return;
    }

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: query,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputQuestion('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '28px';
    }
    setIsLoading(true);

    try {
      const activeTid = tenantContext?.tenantId || (typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') || 'demo' : 'demo');
      const resp = await fetch('/api/defibeo-intelligence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': activeTid,
        },
        body: JSON.stringify({
          question: query,
          tenantId: activeTid,
          history: messages.slice(-4).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          tenantContext,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (data.questionsUsed !== undefined) {
        setQuota({
          used: Number(data.questionsUsed) || 0,
          max: Number(data.maxQuestions) || 8,
          remaining: Number(data.remaining) || 0,
          exceeded: Boolean(data.quotaExceeded || Number(data.questionsUsed) >= 8),
        });
      }

      if (!resp.ok) {
        throw new Error(data.error || data.answer || "Une erreur est survenue lors de la réponse.");
      }

      const assistantText = data.answer || "Defibeo Intelligence est encore en développement et n’est pas en capacité de répondre à cette question pour le moment. Essayez à nouveau prochainement.";

      const assistantMsg: ChatMessage = {
        id: `ast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        role: 'assistant',
        content: assistantText,
        createdAt: Date.now(),
      };

      setTypingMessageId(assistantMsg.id);
      setMessages([...nextMessages, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: err?.message || "Une erreur est survenue lors de la communication avec l'assistant.",
        createdAt: Date.now(),
      };
      setTypingMessageId(errorMsg.id);
      setMessages([...nextMessages, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
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
        {/* MESSAGES LIST AREA (NO HEADER, EMPTY WHEN NO MESSAGES) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#f8f9fa] pt-6">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-fadeIn`}
              >
                {/* Sender label */}
                <div className="mb-1 px-1 text-[12px] font-semibold text-slate-400">
                  {isUser ? t('Vous') : t('Defibeo Intelligence')}
                </div>

                {/* Message bubble : background-color: #ebedee; font-size: 18px; border: 1px solid #dadada6e; box-shadow: none; padding: 10px 15px; color: #000; cursor : default; */}
                <div
                  className="rounded-2xl transition-all relative select-text"
                  style={{
                    maxWidth: isUser ? '85%' : '90%',
                    backgroundColor: '#ebedee',
                    fontSize: '18px',
                    border: '1px solid #dadada6e',
                    boxShadow: 'none',
                    padding: '10px 15px',
                    color: '#000000',
                    cursor: 'default',
                  }}
                >
                  {isUser ? (
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
                  ) : (
                    <TypingBubbleText
                      content={msg.content}
                      isTyping={msg.id === typingMessageId}
                      onProgress={() => scrollToBottom(true)}
                      onDone={() => {
                        setTypingMessageId(null);
                        scrollToBottom(true);
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex flex-col items-start animate-fadeIn">
              <div className="mb-1 px-1 text-[12px] font-semibold text-slate-400">
                {t('Defibeo Intelligence')}
              </div>
              <div
                className="rounded-2xl p-3.5 text-black shadow-none max-w-[90%]"
                style={{
                  backgroundColor: '#ebedee',
                  border: '1px solid #dadada6e',
                  fontSize: '18px',
                  padding: '10px 15px',
                }}
              >
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
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
          className="p-4 shrink-0 bg-transparent space-y-3"
          style={{
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
          }}
        >
          <form onSubmit={(e) => handleSendMessage(e)} className="space-y-3">
            {/* Bannière d'information si quota dépassé */}
            {quota.exceeded && (
              <div
                className="p-3.5 rounded-2xl mb-2 flex items-center animate-fadeIn"
                style={{
                  background: 'white',
                  backgroundColor: '#ffffff',
                  fontSize: '16px',
                  color: '#000000',
                  border: '1px solid #dadada',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
              >
                <span
                  style={{
                    fontSize: '16px',
                    color: '#000000',
                    lineHeight: '1.4',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                >
                  {t("Vous avez utilisé votre quota journalier pour ce compte. Revenez demain pour poser de nouvelles questions.")}
                </span>
              </div>
            )}

            {/* Indicateur de quota expérimental */}
            <div
              className="text-[13px] font-medium px-1.5 pb-0.5"
              style={{
                color: '#000000',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            >
              <span>{t('Quota d’usage limité en mode expérimental.')}</span>
            </div>

            {/* Input bar: floating white container */}
            <div
              className={`flex items-center gap-2 bg-white rounded-2xl p-2 pl-4 transition-all shadow-lg ${quota.exceeded ? 'cursor-not-allowed' : ''}`}
              style={{
                border: '1px solid #dadada',
                cursor: quota.exceeded ? 'not-allowed' : undefined,
              }}
            >
              {/* Textarea multiline avec auto-height et alignement vertical centré initialement */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputQuestion}
                onChange={(e) => {
                  if (quota.exceeded) return;
                  setInputQuestion(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.max(28, Math.min(e.target.scrollHeight, 180))}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!quota.exceeded) {
                      handleSendMessage();
                    }
                  }
                }}
                placeholder={t("Votre question sur le logiciel ou vos données.")}
                disabled={isLoading || quota.exceeded}
                className={`flex-1 bg-transparent border-0 outline-none text-black px-1 placeholder:text-slate-400 resize-none overflow-y-auto ${quota.exceeded ? 'cursor-not-allowed' : ''}`}
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
                  cursor: quota.exceeded ? 'not-allowed' : undefined,
                }}
              />

              {/* Bouton Envoyer: pas d'icône send, font-size 18px, centré verticalement */}
              <button
                type="submit"
                disabled={!inputQuestion.trim() || isLoading || quota.exceeded}
                id="btn-submit-defibeo-intelligence"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl font-bold text-white transition-all cursor-pointer border-0 shrink-0 self-center"
                style={{
                  backgroundColor: '#3556ec',
                  boxShadow:
                    'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                  fontSize: '18px',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  opacity: !inputQuestion.trim() || isLoading || quota.exceeded ? 0.45 : 1,
                  cursor: !inputQuestion.trim() || isLoading || quota.exceeded ? 'not-allowed' : 'pointer',
                }}
              >
                <span>{t('Envoyer')}</span>
              </button>
            </div>

            {/* Ligne inférieure: Texte d'avertissement simple + Bouton Quitter la conversation (background black, text white, pas de border) */}
            <div className="flex items-center justify-between gap-3 pt-0.5">
              {/* Texte sans gélule */}
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    border: 'none',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    background: 'transparent',
                    boxShadow: 'none',
                    color: '#000000',
                    fontSize: '12px',
                    padding: '0px',
                    margin: 0,
                    lineHeight: '1.3',
                  }}
                >
                  {t('Defibeo Intelligence est une IA expérimentale et peut se tromper.')}
                </p>
              </div>

              {/* Bouton Quitter la conversation : background black, text white, pas de border, font-size 18px */}
              <button
                type="button"
                onClick={handleQuitConversation}
                id="btn-quit-defibeo-intelligence"
                className="shrink-0 px-5 py-2 rounded-full font-bold transition-all cursor-pointer hover:opacity-90 active:scale-[0.98] whitespace-nowrap"
                style={{
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: 'none',
                  fontSize: '18px',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
              >
                {t('Quitter la conversation')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};
