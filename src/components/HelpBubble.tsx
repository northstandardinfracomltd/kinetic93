import React, { useState } from 'react';
import { t } from '../utils/translate';

interface HelpBubbleProps {
  cacheKey: string;
  text: string;
  style?: React.CSSProperties;
}

export default function HelpBubble({ cacheKey, text, style }: HelpBubbleProps) {
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') || 'demo' : 'demo';
  const localCompanyInfo = typeof window !== 'undefined' ? localStorage.getItem(`defib_${tenantId}_company_info`) : null;
  let isHelpsDisabled = false;
  if (localCompanyInfo) {
    try {
      const parsed = JSON.parse(localCompanyInfo);
      if (parsed.disableHelpsAndTutorials === 'Oui') {
        isHelpsDisabled = true;
      }
    } catch (e) {}
  }
  if (!isHelpsDisabled && typeof window !== 'undefined') {
    if (localStorage.getItem(`defib_${tenantId}_disable_helps_tutorials`) === 'Oui') {
      isHelpsDisabled = true;
    }
  }

  const [isVisible, setIsVisible] = useState<boolean>(() => {
    return !sessionStorage.getItem(cacheKey);
  });

  const handleDismiss = () => {
    sessionStorage.setItem(cacheKey, "true");
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
        <p 
          className="font-sans leading-relaxed"
          style={{ 
            fontSize: '16px', 
            fontWeight: 400, 
            color: '#000000', 
            cursor: 'default' 
          }}
        >
          {t(text)}
        </p>
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
