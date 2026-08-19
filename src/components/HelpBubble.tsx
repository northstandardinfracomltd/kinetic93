import React, { useState, useEffect } from 'react';
import { t } from '../utils/translate';

interface HelpBubbleProps {
  cacheKey: string;
  text?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export default function HelpBubble({ cacheKey, text, children, style }: HelpBubbleProps) {
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') || 'demo' : 'demo';
  
  // Identify currently logged-in user email for user-session isolation
  let userEmail = '';
  if (typeof window !== 'undefined') {
    try {
      const savedUser = localStorage.getItem('defib_admin_logged_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed?.email) {
          userEmail = parsed.email.toLowerCase().trim();
        }
      }
    } catch (e) {}
  }

  // Session-isolated dismissal key
  const effectiveSessionKey = userEmail ? `${cacheKey}_user_${userEmail}` : cacheKey;

  // Check if helps/tutorials are disabled specifically for this user session
  let isHelpsDisabled = false;
  if (typeof window !== 'undefined') {
    const userSpecificDisableKey = userEmail ? `defib_${tenantId}_user_${userEmail}_disable_helps_tutorials` : `defib_${tenantId}_disable_helps_tutorials`;
    if (localStorage.getItem(userSpecificDisableKey) === 'Oui') {
      isHelpsDisabled = true;
    }
  }

  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !sessionStorage.getItem(effectiveSessionKey);
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsVisible(!sessionStorage.getItem(effectiveSessionKey));
    }
  }, [effectiveSessionKey]);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(effectiveSessionKey, "true");
    }
    setIsVisible(false);
  };

  if (isHelpsDisabled || !isVisible) return null;

  return (
    <div 
      className="p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn transition-all"
      style={{
        borderColor: 'rgb(218, 218, 218)',
        background: '#ffffff00',
        boxShadow: 'none',
        maxWidth: '98%',
        margin: '15px auto 5px auto',
        ...style,
      }}
    >
      <div className="flex items-start gap-3">
        {children ? (
          <div
            className="font-sans leading-relaxed space-y-2 text-[#000000]"
            style={{ 
              fontSize: '16px', 
              fontWeight: 400, 
              cursor: 'default' 
            }}
          >
            {children}
          </div>
        ) : (
          <p 
            className="font-sans leading-relaxed"
            style={{ 
              fontSize: '16px', 
              fontWeight: 400, 
              color: '#000000', 
              cursor: 'default' 
            }}
          >
            {t(text || '')}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="font-sans font-semibold active:scale-95 transition-all border-0 cursor-pointer shrink-0"
        style={{
          backgroundColor: '#000000',
          color: '#ffffff',
          fontSize: '18px',
          borderRadius: '13px',
          padding: '8px 20px',
        }}
      >
        {t("J'ai compris")}
      </button>
    </div>
  );
}
