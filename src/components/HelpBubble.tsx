import React, { useState, useEffect } from 'react';
import { t } from '../utils/translate';

interface HelpBubbleProps {
  cacheKey: string;
  text?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  imageSrc?: string;
  imageAlt?: string;
  imageStyle?: React.CSSProperties;
}

export default function HelpBubble({ cacheKey, text, children, style, imageSrc, imageAlt, imageStyle }: HelpBubbleProps) {
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') || 'demo' : 'demo';
  
  // Identify currently logged-in user email or identifier for user-session isolation
  let userEmail = '';
  if (typeof window !== 'undefined') {
    try {
      const savedUser = localStorage.getItem('defib_active_tech_session') || localStorage.getItem('defib_admin_logged_user') || localStorage.getItem('defib_logged_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed?.email) {
          userEmail = parsed.email.toLowerCase().trim();
        } else if (parsed?.name) {
          userEmail = parsed.name.toLowerCase().trim();
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
        borderColor: 'rgb(203 192 206)',
        background: 'rgba(255, 255, 255, 0)',
        backgroundColor: 'rgba(255, 255, 255, 0)',
        boxShadow: 'none',
        maxWidth: '98%',
        margin: '15px auto 5px auto',
        marginBottom: '20px',
        ...style,
      }}
    >
      <div className="flex flex-col md:flex-row items-center md:items-center gap-4 flex-1">
        {imageSrc && (
          <div className="w-full md:w-[30%] flex justify-center items-center self-center shrink-0">
            <img 
              src={imageSrc} 
              alt={imageAlt || "Illustration"} 
              className="w-full max-w-[180px] md:max-w-none h-auto object-contain" 
              style={{ maxHeight: '150px', ...imageStyle }}
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <div className={`flex items-start gap-3 ${imageSrc ? 'w-full md:w-[70%]' : 'w-full'}`}>
          {children ? (
            <div
              className="font-sans leading-relaxed space-y-2 text-[#000000] w-full"
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
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="font-sans font-semibold active:scale-95 transition-all border-0 cursor-pointer shrink-0"
        style={{
          backgroundColor: 'rgb(0, 0, 0)',
          color: 'rgb(255, 255, 255)',
          fontSize: '18px',
          borderRadius: '13px',
          padding: '10px 20px',
          boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgb(255 255 255 / 29%) 0px 6px 12px inset',
        }}
      >
        {t("J'ai compris")}
      </button>
    </div>
  );
}
