import React, { useState } from 'react';
import {
  X,
  Users,
  CreditCard,
  Mail,
  ExternalLink,
  Laptop,
  UserCheck,
  ShieldCheck,
  HelpCircle,
  Globe,
  Building,
  Phone,
  Link as LinkIcon,
  Image as ImageIcon,
  KeyRound,
  Plus,
  Trash2
} from 'lucide-react';
import { CompanyInfo, Member, MemberSchedule, MemberAbsence, APP_THEMES, DEFAULT_THEME_COLOR, APP_FAVICONS, DEFAULT_FAVICON_URL, formatPdfHeaderText } from '../types';
import { getRegisteredTenants, fetchCollectionFromFirestore, saveCollectionToFirestore, checkIfEmailExistsAnywhere, updateTenantLanguage, updateTenantAdminProfile, auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getAppsScriptUrl, saveAppsScriptUrl, triggerEmail2TechnicianConnexion, triggerEmail3AdminConnexion, triggerEmailNewMemberAdded, sendScriptEmail } from '../utils/emailService';
import { setLanguage, t } from '../utils/translate';
import { REGIONS_FRANCAISES, getLocationCustomName } from '../utils';
import { getRegionsForCountry } from '../utils/regions';
import { geocodeAddress } from '../utils/fsmOptimizer';
import HelpBubble from './HelpBubble';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyInfo: CompanyInfo;
  onUpdateCompanyInfo: (info: CompanyInfo) => void;
  members: Member[];
  onUpdateMembers: (members: Member[]) => void;
  onOpenPublicPortal: () => void;
  onOpenClientPortal?: () => void;
  isPage?: boolean;
  onLogout?: () => void;
  currentUser?: { email: string; name: string } | null;
  enableOtherEquipments?: string;
  onUpdateOtherEquipments?: (val: string) => void;
  otherEquipments?: any[];
  onClearOtherEquipments?: () => void;
  onConnectorsUpdated?: () => void;
  onUpdateLocationNames?: (names: Record<string, string>) => void;
  isDeveloper?: boolean;
  isReadOnly?: boolean;
}

export default function SettingsModal({
  isOpen,
  onClose,
  companyInfo,
  onUpdateCompanyInfo,
  members,
  onUpdateMembers,
  onOpenPublicPortal,
  onOpenClientPortal,
  isPage = false,
  onLogout,
  currentUser,
  enableOtherEquipments: propEnableOtherEquipments = 'Non',
  onUpdateOtherEquipments,
  otherEquipments = [],
  onClearOtherEquipments,
  onConnectorsUpdated,
  onUpdateLocationNames,
  isDeveloper = false,
  isReadOnly = false,
}: SettingsModalProps) {
  const [selectedLang, setSelectedLang] = React.useState(() => {
    const lang = localStorage.getItem('defib_lang') || 'Français, France';
    return lang === 'Français' ? 'Français, France' : lang;
  });
  const [shortEnvId, setShortEnvId] = React.useState(() => localStorage.getItem('defib_short_env_id') || 'D18');

  React.useEffect(() => {
    const activeId = localStorage.getItem('defib_tenant_id') || 'demo';
    if (activeId.toLowerCase() === 'demo') {
      setShortEnvId('D18');
      localStorage.setItem('defib_short_env_id', 'D18');
    } else {
      getRegisteredTenants().then(tenants => {
        const found = tenants.find(t => t.id === activeId);
        if (found && found.shortEnvId) {
          setShortEnvId(found.shortEnvId);
          localStorage.setItem('defib_short_env_id', found.shortEnvId);
        } else {
          setShortEnvId('D18');
        }
      }).catch(err => {
        console.error('Error fetching registered tenants shortEnvId in SettingsModal:', err);
      });
    }
  }, []);

  const [appsScriptUrl, setAppsScriptUrl] = React.useState<string>('');
  
  React.useEffect(() => {
    if (isOpen || isPage) {
      getAppsScriptUrl().then(url => {
        setAppsScriptUrl(url);
      });
    }
  }, [isOpen, isPage]);
  
  const myTenantId = localStorage.getItem('defib_tenant_id') || 'demo';

  // Local states for form editing without auto-saving until save clicked ("pas d'auto-save")
  const [localCompany, setLocalCompany] = React.useState<CompanyInfo>(companyInfo);
  const envIdDisplay = shortEnvId || (typeof window !== 'undefined' ? localStorage.getItem('defib_short_env_id') : null) || 'D18';
  const [localMembers, setLocalMembers] = React.useState<Member[]>(members);
  const [isSaving, setIsSaving] = React.useState(false);
  const [copiedEmbed, setCopiedEmbed] = React.useState(false);
  const [memberToDeleteIndex, setMemberToDeleteIndex] = React.useState<number | null>(null);
  const [enableOtherEquipments, setEnableOtherEquipments] = React.useState(propEnableOtherEquipments);
  const [showDisableOtherEquipmentsConfirmation, setShowDisableOtherEquipmentsConfirmation] = React.useState(false);
  const [localLocationNames, setLocalLocationNames] = React.useState<Record<string, string>>(() => {
    if (companyInfo && companyInfo.customLocationNames) {
      return companyInfo.customLocationNames;
    }
    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    try {
      const saved = localStorage.getItem(`defib_${tenantId}_custom_location_names`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [enableAutoEmails, setEnableAutoEmails] = React.useState<'Oui' | 'Non'>(() => {
    if (companyInfo && companyInfo.enableAutoEmails) {
      return companyInfo.enableAutoEmails;
    }
    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    return (localStorage.getItem(`defib_${tenantId}_enable_auto_emails`) as 'Oui' | 'Non') || 'Oui';
  });
  const [enableSatisfactionAvis, setEnableSatisfactionAvis] = React.useState<'Oui' | 'Non'>(() => {
    if (companyInfo && companyInfo.enableSatisfactionAvis) {
      return companyInfo.enableSatisfactionAvis;
    }
    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    return (localStorage.getItem(`defib_${tenantId}_enable_satisfaction_avis`) as 'Oui' | 'Non') || 'Oui';
  });
  const [enableDevisFactures, setEnableDevisFactures] = React.useState<'Oui' | 'Non'>(() => {
    if (companyInfo && companyInfo.enableDevisFactures) {
      return companyInfo.enableDevisFactures;
    }
    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    return (localStorage.getItem(`defib_${tenantId}_enable_devis_factures`) as 'Oui' | 'Non') || 'Oui';
  });
  const [disableHelpsAndTutorials, setDisableHelpsAndTutorials] = React.useState<'Oui' | 'Non'>(() => {
    let userEmail = '';
    if (currentUser && currentUser.email) {
      userEmail = currentUser.email.toLowerCase().trim();
    } else {
      try {
        const saved = localStorage.getItem('defib_admin_logged_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.email) userEmail = parsed.email.toLowerCase().trim();
        }
      } catch (e) {}
    }
    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    const userSpecificKey = userEmail ? `defib_${tenantId}_user_${userEmail}_disable_helps_tutorials` : `defib_${tenantId}_disable_helps_tutorials`;
    return (localStorage.getItem(userSpecificKey) as 'Oui' | 'Non') || 'Non';
  });
  const [communicationPortailClient, setCommunicationPortailClient] = React.useState<string>(() => {
    if (companyInfo && companyInfo.communicationPortailClient !== undefined) {
      return companyInfo.communicationPortailClient;
    }
    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    return localStorage.getItem(`defib_${tenantId}_communication_portail_client`) || '';
  });

  const [selectedTheme, setSelectedTheme] = React.useState<string>(() => {
    let userEmail = '';
    if (currentUser && currentUser.email) {
      userEmail = currentUser.email.toLowerCase().trim();
    } else {
      try {
        const saved = localStorage.getItem('defib_admin_logged_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.email) userEmail = parsed.email.toLowerCase().trim();
        }
      } catch (e) {}
    }
    
    // 1. Check matching member in members prop
    if (userEmail) {
      const mem = members.find(m => m.email?.toLowerCase().trim() === userEmail);
      if (mem?.themePreference) return mem.themePreference;
    }
    
    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    const userThemeKey = userEmail ? `defib_${tenantId}_user_${userEmail}_theme` : `defib_${tenantId}_theme`;
    const savedLocal = localStorage.getItem(userThemeKey) || (userEmail ? localStorage.getItem(`defib_user_theme_${userEmail}`) : null) || localStorage.getItem('defib_current_user_theme');
    if (savedLocal) return savedLocal;

    return 'defibeo_nextgen';
  });

  const handleThemeSelect = (themeId: string) => {
    setSelectedTheme(themeId);
    let userEmail = '';
    if (currentUser && currentUser.email) {
      userEmail = currentUser.email.toLowerCase().trim();
    } else {
      try {
        const saved = localStorage.getItem('defib_admin_logged_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.email) userEmail = parsed.email.toLowerCase().trim();
        }
      } catch (e) {}
    }

    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    const foundTheme = APP_THEMES.find(t => t.id === themeId);
    const themeColor = foundTheme ? foundTheme.color : DEFAULT_THEME_COLOR;

    // Save locally for instant UI update
    if (userEmail) {
      localStorage.setItem(`defib_${tenantId}_user_${userEmail}_theme`, themeId);
      localStorage.setItem(`defib_user_theme_${userEmail}`, themeId);
      localStorage.setItem(`defib_user_theme_color_${userEmail}`, themeColor);
    }
    localStorage.setItem(`defib_${tenantId}_theme`, themeId);
    localStorage.setItem('defib_current_user_theme', themeId);

    // Dispatch global event for instant background change of the sidebar
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('defib-theme-changed', {
        detail: { themeId, themeColor, userEmail }
      }));
    }

    // Update local members state
    setLocalMembers(prev => {
      let matched = false;
      const next = prev.map(m => {
        if (userEmail && m.email?.toLowerCase().trim() === userEmail) {
          matched = true;
          return { ...m, themePreference: themeId };
        }
        return m;
      });
      if (!matched && userEmail) {
        next.push({
          name: currentUser?.name || 'Administrateur',
          email: userEmail,
          role: 'Super-Administrateur',
          status: 'Actif',
          lastActive: 'En ligne',
          pin: '1234',
          themePreference: themeId
        });
      }
      if (onUpdateMembers) {
        onUpdateMembers(next);
      }
      return next;
    });

    // Save directly to Firebase Firestore for this user
    if (tenantId && tenantId !== 'demo' && userEmail) {
      const cleanEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
      saveCollectionToFirestore(`userTheme_${cleanEmail}`, {
        userEmail,
        themeId,
        themeColor,
        updatedAt: new Date().toISOString()
      }, tenantId).catch(err => console.warn('Error saving user theme to Firestore:', err));
    }
  };

  const [selectedFavicon, setSelectedFavicon] = useState<string>(() => {
    let userEmail = '';
    if (currentUser && currentUser.email) {
      userEmail = currentUser.email.toLowerCase().trim();
    } else {
      try {
        const saved = localStorage.getItem('defib_admin_logged_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.email) userEmail = parsed.email.toLowerCase().trim();
        }
      } catch (e) {}
    }

    if (userEmail) {
      const mem = members.find(m => m.email?.toLowerCase().trim() === userEmail);
      if (mem?.faviconPreference) return mem.faviconPreference;
    }

    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    const userFaviconKey = userEmail ? `defib_${tenantId}_user_${userEmail}_favicon` : `defib_${tenantId}_favicon`;
    const savedLocal = localStorage.getItem(userFaviconKey) || (userEmail ? localStorage.getItem(`defib_user_favicon_${userEmail}`) : null) || localStorage.getItem('defib_current_user_favicon');
    if (savedLocal) return savedLocal;

    return 'rainbow';
  });

  const handleFaviconSelect = (faviconId: string) => {
    setSelectedFavicon(faviconId);
    let userEmail = '';
    if (currentUser && currentUser.email) {
      userEmail = currentUser.email.toLowerCase().trim();
    } else {
      try {
        const saved = localStorage.getItem('defib_admin_logged_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.email) userEmail = parsed.email.toLowerCase().trim();
        }
      } catch (e) {}
    }

    const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
    const foundFavicon = APP_FAVICONS.find(f => f.id === faviconId);
    const faviconUrl = foundFavicon ? foundFavicon.url : DEFAULT_FAVICON_URL;

    // Save locally for instant UI update
    if (userEmail) {
      localStorage.setItem(`defib_${tenantId}_user_${userEmail}_favicon`, faviconId);
      localStorage.setItem(`defib_user_favicon_${userEmail}`, faviconId);
      localStorage.setItem(`defib_user_favicon_url_${userEmail}`, faviconUrl);
    }
    localStorage.setItem(`defib_${tenantId}_favicon`, faviconId);
    localStorage.setItem('defib_current_user_favicon', faviconId);

    // Update DOM link directly
    if (typeof document !== 'undefined') {
      let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.type = 'image/png';
      link.href = faviconUrl;
    }

    // Dispatch global event for instant favicon change
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('defib-favicon-changed', {
        detail: { faviconId, faviconUrl, userEmail }
      }));
    }

    // Update local members state
    setLocalMembers(prev => {
      let matched = false;
      const next = prev.map(m => {
        if (userEmail && m.email?.toLowerCase().trim() === userEmail) {
          matched = true;
          return { ...m, faviconPreference: faviconId };
        }
        return m;
      });
      if (!matched && userEmail) {
        next.push({
          name: currentUser?.name || 'Administrateur',
          email: userEmail,
          role: 'Super-Administrateur',
          status: 'Actif',
          lastActive: 'En ligne',
          pin: '1234',
          faviconPreference: faviconId
        });
      }
      if (onUpdateMembers) {
        onUpdateMembers(next);
      }
      return next;
    });

    // Save directly to Firebase Firestore for this user
    if (tenantId && tenantId !== 'demo' && userEmail) {
      const cleanEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
      saveCollectionToFirestore(`userFavicon_${cleanEmail}`, {
        userEmail,
        faviconId,
        faviconUrl,
        updatedAt: new Date().toISOString()
      }, tenantId).catch(err => console.warn('Error saving user favicon to Firestore:', err));
    }
  };

  const geocodeTimersRef = React.useRef<{ [key: number]: any }>({});

  const triggerMemberGeocoding = (memberIdx: number, street: string, zip: string, city: string, country: string) => {
    if (geocodeTimersRef.current[memberIdx]) {
      clearTimeout(geocodeTimersRef.current[memberIdx]);
    }
    geocodeTimersRef.current[memberIdx] = setTimeout(async () => {
      const s = (street || '').trim();
      const z = (zip || '').trim();
      const c = (city || '').trim();
      const co = (country || 'France').trim();
      if (!c && !z && !s) return;
      
      let fullAddress = "";
      if (s) {
        fullAddress = `${s}, ${z} ${c}, ${co}`.trim();
      } else {
        fullAddress = `${z} ${c}, ${co}`.trim();
      }
      let coord = await geocodeAddress(fullAddress);
      if (!coord && s) {
        const fallback = `${z} ${c}, ${co}`.trim();
        coord = await geocodeAddress(fallback);
      }
      if (coord) {
        setLocalMembers(prev => {
          const updated = [...prev];
          if (updated[memberIdx]) {
            updated[memberIdx] = {
              ...updated[memberIdx],
              startAddressLat: coord.lat,
              startAddressLng: coord.lng
            };
          }
          return updated;
        });
      }
    }, 1000);
  };

  React.useEffect(() => {
    let userEmail = '';
    if (currentUser && currentUser.email) {
      userEmail = currentUser.email.toLowerCase().trim();
    } else {
      try {
        const saved = localStorage.getItem('defib_admin_logged_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.email) userEmail = parsed.email.toLowerCase().trim();
        }
      } catch (e) {}
    }
    if (userEmail && members && members.length > 0) {
      const mem = members.find(m => m.email?.toLowerCase().trim() === userEmail);
      if (mem?.themePreference) {
        setSelectedTheme(mem.themePreference);
        const tid = localStorage.getItem('defib_tenant_id') || 'demo';
        localStorage.setItem(`defib_${tid}_user_${userEmail}_theme`, mem.themePreference);
        localStorage.setItem(`defib_user_theme_${userEmail}`, mem.themePreference);
        localStorage.setItem('defib_current_user_theme', mem.themePreference);
      }
    }
  }, [members, currentUser]);

  const [referralCompany, setReferralCompany] = React.useState('');
  const [referralSent, setReferralSent] = React.useState(false);
  const [isSendingReferral, setIsSendingReferral] = React.useState(false);

  const handleSendReferral = async () => {
    if (!referralCompany.trim()) return;
    setIsSendingReferral(true);
    setReferralSent(false);
    const envName = companyInfo?.name || localStorage.getItem('defib_tenant_id') || 'un utilisateur';
    
    try {
      await sendScriptEmail({
        to: 'support@defibeo.com',
        subject: `Nouveau parrainage de ${envName}.`,
        body: referralCompany,
        replyTo: companyInfo?.email || 'support@defibeo.com'
      });
      setReferralSent(true);
      setReferralCompany('');
    } catch (err) {
      console.error('Error sending referral:', err);
    } finally {
      setIsSendingReferral(false);
    }
  };

  const renderSectionHeader = (text: string, showSave: boolean = true) => (
    <div className="flex items-center justify-between mb-3 bg-transparent select-none w-full">
      <span 
        className="text-white px-3 py-1 text-[13px] inline-block font-sans"
        style={{
          backgroundColor: 'oklch(0.44 0.16 324.65)',
          borderRadius: '1000px',
          cursor: 'default',
          fontWeight: 100,
          textTransform: 'none',
        }}
      >
        {text}
      </span>
      {isPage && showSave && (
        <button
          disabled={isSaving}
          onClick={handleSaveAll}
          style={{
            backgroundColor: 'rgb(53, 86, 236)',
            color: '#ffffff',
            boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
            borderRadius: '0.75rem',
            fontSize: '18px',
            padding: '11px 22px',
            fontWeight: '100',
            transition: 'all 0s ease-in-out',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.6 : 1,
            border: 'none',
            fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
          }}
          className="transition-all"
        >
          Enregistrer
        </button>
      )}
    </div>
  );

  React.useEffect(() => {
    if (isOpen) {
      if (companyInfo && companyInfo.customLocationNames) {
        setLocalLocationNames(companyInfo.customLocationNames);
      } else {
        const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
        try {
          const saved = localStorage.getItem(`defib_${tenantId}_custom_location_names`);
          setLocalLocationNames(saved ? JSON.parse(saved) : {});
        } catch (e) {
          setLocalLocationNames({});
        }
      }

      if (companyInfo && companyInfo.enableAutoEmails) {
        setEnableAutoEmails(companyInfo.enableAutoEmails);
      } else {
        const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
        setEnableAutoEmails((localStorage.getItem(`defib_${tenantId}_enable_auto_emails`) as 'Oui' | 'Non') || 'Oui');
      }

      if (companyInfo && companyInfo.enableSatisfactionAvis) {
        setEnableSatisfactionAvis(companyInfo.enableSatisfactionAvis);
      } else {
        const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
        setEnableSatisfactionAvis((localStorage.getItem(`defib_${tenantId}_enable_satisfaction_avis`) as 'Oui' | 'Non') || 'Oui');
      }

      if (companyInfo && companyInfo.enableDevisFactures) {
        setEnableDevisFactures(companyInfo.enableDevisFactures);
      } else {
        const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
        setEnableDevisFactures((localStorage.getItem(`defib_${tenantId}_enable_devis_factures`) as 'Oui' | 'Non') || 'Oui');
      }

      let userEmail = '';
      if (currentUser && currentUser.email) {
        userEmail = currentUser.email.toLowerCase().trim();
      } else {
        try {
          const saved = localStorage.getItem('defib_admin_logged_user');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.email) userEmail = parsed.email.toLowerCase().trim();
          }
        } catch (e) {}
      }
      const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
      const userSpecificKey = userEmail ? `defib_${tenantId}_user_${userEmail}_disable_helps_tutorials` : `defib_${tenantId}_disable_helps_tutorials`;
      setDisableHelpsAndTutorials((localStorage.getItem(userSpecificKey) as 'Oui' | 'Non') || 'Non');

      if (companyInfo && companyInfo.communicationPortailClient !== undefined) {
        setCommunicationPortailClient(companyInfo.communicationPortailClient);
      } else {
        const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
        setCommunicationPortailClient(localStorage.getItem(`defib_${tenantId}_communication_portail_client`) || '');
      }
    }
  }, [isOpen, companyInfo]);

  React.useEffect(() => {
    setEnableOtherEquipments(propEnableOtherEquipments);
    setShowDisableOtherEquipmentsConfirmation(false);
  }, [propEnableOtherEquipments, isOpen]);

  React.useEffect(() => {
    if (isOpen) {
      const shouldScroll = localStorage.getItem('scroll_to_members') === 'true';
      if (shouldScroll) {
        localStorage.removeItem('scroll_to_members');
        setTimeout(() => {
          const container = document.getElementById('settings-tab-container-harmonized');
          const target = document.getElementById('settings-section-members');
          if (isPage && target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (container && target) {
            container.scrollTo({
              top: target.offsetTop - 20,
              behavior: 'smooth'
            });
          } else if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 600);
      }
    }
  }, [isOpen, isPage]);

  // Synchronise if parent prop changes upon load or reset, keeping refs to trace incoming changes
  const lastPropsMembersRef = React.useRef<Member[]>(members);
  const lastPropsCompanyRef = React.useRef<CompanyInfo>(companyInfo);

  React.useEffect(() => {
    if (JSON.stringify(members) !== JSON.stringify(lastPropsMembersRef.current)) {
      setLocalMembers(members);
      lastPropsMembersRef.current = members;
    }
  }, [members]);

  React.useEffect(() => {
    if (JSON.stringify(companyInfo) !== JSON.stringify(lastPropsCompanyRef.current)) {
      setLocalCompany(companyInfo);
      if (companyInfo?.customLocationNames) setLocalLocationNames(companyInfo.customLocationNames);
      if (companyInfo?.enableAutoEmails) setEnableAutoEmails(companyInfo.enableAutoEmails);
      if (companyInfo?.enableSatisfactionAvis) setEnableSatisfactionAvis(companyInfo.enableSatisfactionAvis);
      if (companyInfo?.enableDevisFactures) setEnableDevisFactures(companyInfo.enableDevisFactures);
      if (companyInfo?.communicationPortailClient !== undefined) setCommunicationPortailClient(companyInfo.communicationPortailClient);
      if (companyInfo?.disableHelpsAndTutorials) setDisableHelpsAndTutorials(companyInfo.disableHelpsAndTutorials);
      if (companyInfo?.enableOtherEquipments) setEnableOtherEquipments(companyInfo.enableOtherEquipments);
      lastPropsCompanyRef.current = companyInfo;
    }
  }, [companyInfo]);

  React.useEffect(() => {
    if (isOpen || isPage) {
      setLocalCompany(companyInfo);
      setLocalMembers(members);
      if (companyInfo?.customLocationNames) setLocalLocationNames(companyInfo.customLocationNames);
      if (companyInfo?.enableAutoEmails) setEnableAutoEmails(companyInfo.enableAutoEmails);
      if (companyInfo?.enableSatisfactionAvis) setEnableSatisfactionAvis(companyInfo.enableSatisfactionAvis);
      if (companyInfo?.enableDevisFactures) setEnableDevisFactures(companyInfo.enableDevisFactures);
      if (companyInfo?.communicationPortailClient !== undefined) setCommunicationPortailClient(companyInfo.communicationPortailClient);
      if (companyInfo?.disableHelpsAndTutorials) setDisableHelpsAndTutorials(companyInfo.disableHelpsAndTutorials);
      if (companyInfo?.enableOtherEquipments) setEnableOtherEquipments(companyInfo.enableOtherEquipments);
      lastPropsMembersRef.current = members;
      lastPropsCompanyRef.current = companyInfo;
    }
  }, [isOpen, isPage]);

  // States for the member addition form inside the local state
  const [newMemberName, setNewMemberName] = React.useState('');
  const [newMemberEmail, setNewMemberEmail] = React.useState('');
  const [newMemberRole, setNewMemberRole] = React.useState('Administrateur');
  const [newMemberPin, setNewMemberPin] = React.useState('');
  const [newMemberLocation, setNewMemberLocation] = React.useState('');
  const [newMemberAdminSubRole, setNewMemberAdminSubRole] = React.useState<'Administrateur' | 'Administration' | 'Planification' | 'Logistique' | 'Comptabilité' | 'Contrôleur' | 'Administrateur & Contrôleur' | 'Développeur'>('Administrateur');

  // LOCAL STATES FOR CONNECTORS
  const [apiDefibeoActive, setApiDefibeoActive] = React.useState(false);
  const [apiDefibeoApiKey, setApiDefibeoApiKey] = React.useState('');
  const [apiDefibeoSecretKey, setApiDefibeoSecretKey] = React.useState('');
  const [apiDefibeoCopied, setApiDefibeoCopied] = React.useState<string | null>(null);
  const [isApiDocOpen, setIsApiDocOpen] = React.useState(false);
  const [isShopDrawerOpen, setIsShopDrawerOpen] = React.useState(false);
  const [apiFieldSearch, setApiFieldSearch] = React.useState('');
  const [apiFieldCategory, setApiFieldCategory] = React.useState<string>('Tous');
  const [copiedSlug, setCopiedSlug] = React.useState<string | null>(null);

  const apiFieldsDictionary = [
    // Défibrillateurs
    { entity: 'Défibrillateur', slug: 'identifiant', type: 'string', label: 'ID matériel unique / DAE', example: 'DAE-88192' },
    { entity: 'Défibrillateur', slug: 'serie', type: 'string', label: 'Numéro de série constructeur (N° Série)', example: 'SN-9981240' },
    { entity: 'Défibrillateur', slug: 'marque', type: 'string', label: 'Marque constructeur DAE', example: 'ZOLL' },
    { entity: 'Défibrillateur', slug: 'modele', type: 'string', label: 'Modèle de défibrillateur', example: 'AED Plus' },
    { entity: 'Défibrillateur', slug: 'statut', type: 'string', label: 'Statut de conformité', example: 'Conforme' },
    { entity: 'Défibrillateur', slug: 'statut_voyant', type: 'string', label: 'État du voyant lumineux', example: 'Vert OK' },
    { entity: 'Défibrillateur', slug: 'derniere_maintenance', type: 'date (AAAA-MM-JJ)', label: 'Date de la dernière maintenance / contrôle', example: '2026-08-03' },
    { entity: 'Défibrillateur', slug: 'prochaine_v', type: 'date (AAAA-MM-JJ)', label: 'Date de la prochaine visite planifiée', example: '2027-08-01' },
    { entity: 'Défibrillateur', slug: 'peremption_a', type: 'date (AAAA-MM-JJ)', label: 'Péremption Électrodes Adulte principales', example: '2028-02-15' },
    { entity: 'Défibrillateur', slug: 'peremption_electrodes', type: 'date (AAAA-MM-JJ)', label: 'Péremption Électrodes (alias)', example: '2028-02-15' },
    { entity: 'Défibrillateur', slug: 'lot_a', type: 'string', label: 'Numéro de lot Électrodes Adulte principales', example: 'LOT-A-990' },
    { entity: 'Défibrillateur', slug: 'insertion_a', type: 'date (AAAA-MM-JJ)', label: 'Date installation Électrodes Adulte', example: '2026-02-15' },
    { entity: 'Défibrillateur', slug: 'modele_a', type: 'string', label: 'Modèle Électrodes Adulte', example: 'CPR-D Padz' },
    { entity: 'Défibrillateur', slug: 'peremption_p', type: 'date (AAAA-MM-JJ)', label: 'Péremption Électrodes Pédiatriques', example: '2028-06-30' },
    { entity: 'Défibrillateur', slug: 'lot_p', type: 'string', label: 'Numéro de lot Électrodes Pédiatriques', example: 'LOT-P-441' },
    { entity: 'Défibrillateur', slug: 'insertion_p', type: 'date (AAAA-MM-JJ)', label: 'Date installation Électrodes Pédiatriques', example: '2026-02-15' },
    { entity: 'Défibrillateur', slug: 'modele_p', type: 'string', label: 'Modèle Électrodes Pédiatriques', example: 'Pedi-Padz II' },
    { entity: 'Défibrillateur', slug: 'peremption_b', type: 'date (AAAA-MM-JJ)', label: 'Péremption Batterie / Piles', example: '2030-02-15' },
    { entity: 'Défibrillateur', slug: 'peremption_batterie', type: 'date (AAAA-MM-JJ)', label: 'Péremption Batterie (alias)', example: '2030-02-15' },
    { entity: 'Défibrillateur', slug: 'lot_b', type: 'string', label: 'Numéro de lot Batterie', example: 'LOT-BAT-77' },
    { entity: 'Défibrillateur', slug: 'insertion_b', type: 'date (AAAA-MM-JJ)', label: 'Date installation Batterie', example: '2026-02-15' },
    { entity: 'Défibrillateur', slug: 'modele_b', type: 'string', label: 'Modèle de Batterie', example: 'Pack Lithium 123A' },
    { entity: 'Défibrillateur', slug: 'pourcentage_constate_b', type: 'number (0-100)', label: 'Charge batterie constatée (%)', example: '100' },
    { entity: 'Défibrillateur', slug: 'lot_padpak_a', type: 'string', label: 'Lot Pad-Pak Adulte (HeartSine)', example: 'PADPAK-A-01' },
    { entity: 'Défibrillateur', slug: 'peremption_padpak_a', type: 'date (AAAA-MM-JJ)', label: 'Péremption Pad-Pak Adulte', example: '2028-02-15' },
    { entity: 'Défibrillateur', slug: 'lot_padpak_p', type: 'string', label: 'Lot Pad-Pak Pédiatrique (HeartSine)', example: 'PADPAK-P-02' },
    { entity: 'Défibrillateur', slug: 'peremption_padpak_p', type: 'date (AAAA-MM-JJ)', label: 'Péremption Pad-Pak Pédiatrique', example: '2028-06-30' },
    { entity: 'Défibrillateur', slug: 'peremption_trousse', type: 'date (AAAA-MM-JJ)', label: 'Péremption trousse de secours / rasoir', example: '2028-12-31' },
    { entity: 'Défibrillateur', slug: 'etat_housse', type: 'string', label: 'État de la housse de protection', example: 'Conforme' },
    { entity: 'Défibrillateur', slug: 'boitier_modele', type: 'string', label: 'Modèle boîtier / armoire mural', example: 'AIVIA 200' },
    { entity: 'Défibrillateur', slug: 'boitier_lot', type: 'string', label: 'Numéro de lot armoire mural', example: 'LOT-B-88' },
    { entity: 'Défibrillateur', slug: 'numero_et_voie', type: 'string', label: 'Numéro et voie (adresse)', example: '12 Avenue de Paris' },
    { entity: 'Défibrillateur', slug: 'ville', type: 'string', label: 'Ville de géolocalisation', example: 'Paris' },
    { entity: 'Défibrillateur', slug: 'code_postal', type: 'string', label: 'Code postal', example: '75008' },
    { entity: 'Défibrillateur', slug: 'region', type: 'string', label: 'Région / Département', example: 'Île-de-France' },
    { entity: 'Défibrillateur', slug: 'pays', type: 'string', label: 'Pays', example: 'France' },
    { entity: 'Défibrillateur', slug: 'latitude', type: 'number', label: 'Latitude GPS', example: '48.8708' },
    { entity: 'Défibrillateur', slug: 'longitude', type: 'number', label: 'Longitude GPS', example: '2.3045' },
    { entity: 'Défibrillateur', slug: 'aide_acces', type: 'string', label: 'Aide et consignes d\'accès', example: 'Code porte 45A12 - Hall RDC' },
    { entity: 'Défibrillateur', slug: 'expiration_garantie', type: 'date (AAAA-MM-JJ)', label: 'Expiration garantie constructeur', example: '2030-05-15' },
    { entity: 'Défibrillateur', slug: 'date_fabrication', type: 'date (AAAA-MM-JJ)', label: 'Date de fabrication constructeur', example: '2024-02-10' },
    { entity: 'Défibrillateur', slug: 'version_logiciel', type: 'string', label: 'Version firmware interne', example: 'v3.2.1' },
    { entity: 'Défibrillateur', slug: 'numero_atlasante', type: 'string', label: 'Référence ARS / ARLA / Atlasanté', example: 'ATLAS-77120' },

    // Client
    { entity: 'Client', slug: 'client_id', type: 'string', label: 'Identifiant unique client', example: 'CLI-0042' },
    { entity: 'Client', slug: 'entreprise', type: 'string', label: 'Raison sociale / Nom entreprise', example: 'Clinique Saint-Jean' },
    { entity: 'Client', slug: 'email', type: 'string', label: 'Adresse e-mail de contact', example: 'contact@clinique-stjean.fr' },
    { entity: 'Client', slug: 'telephone', type: 'string', label: 'Numéro de téléphone', example: '0142680000' },
    { entity: 'Client', slug: 'payeur_id', type: 'string', label: 'Identifiant structure payeuse', example: 'PAY-0091' },
    { entity: 'Client', slug: 'identifiant_unique', type: 'string', label: 'SIRET / RNA / Identifiant légal', example: 'SIRET-12345678900012' },
    { entity: 'Client', slug: 'reference_contrat', type: 'string', label: 'Référence du contrat client', example: 'CTR-2026-99' },
    { entity: 'Client', slug: 'debut_contrat', type: 'date (AAAA-MM-JJ)', label: 'Date début de contrat', example: '2026-01-01' },
    { entity: 'Client', slug: 'fin_contrat', type: 'date (AAAA-MM-JJ)', label: 'Date fin de contrat', example: '2028-12-31' },

    // Autre Matériel
    { entity: 'Autre Matériel', slug: 'identifiant', type: 'string', label: 'ID matériel unique', example: 'MAT-00109' },
    { entity: 'Autre Matériel', slug: 'categorie', type: 'string', label: 'Catégorie d\'équipement', example: 'Purificateur d\'air' },
    { entity: 'Autre Matériel', slug: 'serie', type: 'string', label: 'Numéro de série', example: 'PUR-99812' },
    { entity: 'Autre Matériel', slug: 'type_filtre', type: 'string', label: 'Type de filtre installé', example: 'HEPA H14' },
    { entity: 'Autre Matériel', slug: 'modele_filtre', type: 'string', label: 'Référence modèle de filtre', example: 'FIL-HEPA-MED-01' },
    { entity: 'Autre Matériel', slug: 'derniere_maintenance', type: 'date (AAAA-MM-JJ)', label: 'Date dernière maintenance', example: '2026-03-10' },

    // Stock
    { entity: 'Stock', slug: 'ugs', type: 'string', label: 'Code UGS / Référence produit', example: 'ELE-ZOLL-01' },
    { entity: 'Stock', slug: 'designation', type: 'string', label: 'Désignation de l\'article', example: 'Électrodes Adulte CPR-D Padz ZOLL' },
    { entity: 'Stock', slug: 'quantite_disponible', type: 'number', label: 'Quantité physique disponible en stock', example: '142' },
    { entity: 'Stock', slug: 'seuil_alerte', type: 'number', label: 'Seuil minimal d\'alerte réapprovisionnement', example: '20' },
    { entity: 'Stock', slug: 'emplacement_entrepot', type: 'string', label: 'Emplacement en entrepôt', example: 'Aisle B - Etagere 4' },

    // Commande
    { entity: 'Commande', slug: 'reference', type: 'string', label: 'Référence devis / commande', example: 'DEV-2026-0803' },
    { entity: 'Commande', slug: 'type', type: 'string', label: 'Type ("Devis" ou "Facture")', example: 'Devis' },
    { entity: 'Commande', slug: 'situation', type: 'string', label: 'État ("Brouillon", "Envoyé", "Validé", "Payé")', example: 'Brouillon' },
    { entity: 'Commande', slug: 'date_emission', type: 'date (AAAA-MM-JJ)', label: 'Date d\'émission', example: '2026-08-03' },
    { entity: 'Commande', slug: 'code_taxe', type: 'string', label: 'Taux de taxe applicable', example: 'TVA20' },

    // CRM
    { entity: 'CRM', slug: 'categorie', type: 'string', label: 'Catégorie de ticket CRM', example: 'Technique' },
    { entity: 'CRM', slug: 'criticite', type: 'string', label: 'Niveau de criticité', example: 'Urgent' },
    { entity: 'CRM', slug: 'objet', type: 'string', label: 'Objet / Sujet du dossier', example: 'Signalement Bip DAE' },
    { entity: 'CRM', slug: 'description', type: 'string', label: 'Description détaillée', example: 'Constat voyant rouge à 8h' },

    // Formation
    { entity: 'Formation', slug: 'formation_id', type: 'string', label: 'Identifiant unique de la formation', example: 'FOR-2026-001' },
    { entity: 'Formation', slug: 'intitule', type: 'string', label: 'Intitulé / Nom de la formation', example: 'Formation Secourisme & Utilisation DAE' },
    { entity: 'Formation', slug: 'date_heure', type: 'date (AAAA-MM-JJTHH:MM)', label: 'Date et heure de début de la formation', example: '2026-08-15T09:00' },
    { entity: 'Formation', slug: 'formateur_id', type: 'string', label: 'Identifiant unique du formateur', example: 'MEM-002' },
    { entity: 'Formation', slug: 'statut', type: 'string', label: 'Statut ("Brouillon" ou "Terminé")', example: 'Terminé' },
    { entity: 'Formation', slug: 'client_id', type: 'string', label: 'Identifiant du client rattaché', example: 'CLI-0042' },
    { entity: 'Formation', slug: 'adresse', type: 'string', label: 'Adresse du lieu de formation', example: '12 Avenue de Paris' },
    { entity: 'Formation', slug: 'ville', type: 'string', label: 'Ville de formation', example: 'Paris' },
    { entity: 'Formation', slug: 'code_postal', type: 'string', label: 'Code postal du lieu', example: '75008' },
    { entity: 'Formation', slug: 'region', type: 'string', label: 'Région / Département', example: 'Île-de-France' },
    { entity: 'Formation', slug: 'pays', type: 'string', label: 'Pays du lieu', example: 'France' },
    { entity: 'Formation', slug: 'commentaire', type: 'string', label: 'Commentaires et remarques', example: 'Session matinée - 10 participants' }
  ];

  const generateApiDefibeoKeys = () => {
    const rand1 = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    const rand2 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    setApiDefibeoApiKey(`dfb_live_${rand1}`);
    setApiDefibeoSecretKey(`dfb_sec_${rand2}`);
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    try {
      navigator.clipboard.writeText(text);
      setApiDefibeoCopied(fieldName);
      setTimeout(() => setApiDefibeoCopied(null), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const [sageActive, setSageActive] = React.useState(false);
  const [sageClientId, setSageClientId] = React.useState('');
  const [sageAccessToken, setSageAccessToken] = React.useState('');
  const [sageSecretToken, setSageSecretToken] = React.useState('');

  const [sage4197Active, setSage4197Active] = React.useState(false);
  const [sage4197ClientId, setSage4197ClientId] = React.useState('');
  const [sage4197AccessToken, setSage4197AccessToken] = React.useState('');
  const [sage4197SecretToken, setSage4197SecretToken] = React.useState('');

  const [pennylaneActive, setPennylaneActive] = React.useState(false);
  const [pennylaneClientId, setPennylaneClientId] = React.useState('');
  const [pennylaneCompanyToken, setPennylaneCompanyToken] = React.useState('');
  const [pennylaneSecretToken, setPennylaneSecretToken] = React.useState('');

  const [dropboxActive, setDropboxActive] = React.useState(false);
  const [dropboxAppKey, setDropboxAppKey] = React.useState('');
  const [dropboxAppSecret, setDropboxAppSecret] = React.useState('');
  const [dropboxAccessToken, setDropboxAccessToken] = React.useState('');
  const [dropboxError, setDropboxError] = React.useState<string | null>(null);

  const [cegidActive, setCegidActive] = React.useState(false);
  const [cegidApiKey, setCegidApiKey] = React.useState('');
  const [cegidApiSecret, setCegidApiSecret] = React.useState('');

  const [lemonGroupWsActive, setLemonGroupWsActive] = React.useState(false);
  const [lemonGroupWsApiKey, setLemonGroupWsApiKey] = React.useState('');
  const [lemonGroupWsApiSecret, setLemonGroupWsApiSecret] = React.useState('');

  const [textelpActive, setTextelpActive] = React.useState(false);
  const [textelpEnvId, setTextelpEnvId] = React.useState('');
  const [textelpSecretId, setTextelpSecretId] = React.useState('');

  const [civilpromActive, setCivilpromActive] = React.useState(false);
  const [civilpromWebsiteUrl, setCivilpromWebsiteUrl] = React.useState('');
  const [civilpromAssetsFileUrl, setCivilpromAssetsFileUrl] = React.useState('');

  const [atlasanteActive, setAtlasanteActive] = React.useState(false);
  const [atlasanteUrlAuth, setAtlasanteUrlAuth] = React.useState('https://catalogue.atlasante.fr/api/login');
  const [atlasanteDeclarantId, setAtlasanteDeclarantId] = React.useState('');

  const [googleDriveActive, setGoogleDriveActive] = React.useState(false);
  const [googleDriveEmail, setGoogleDriveEmail] = React.useState('');
  const [googleDriveAccessToken, setGoogleDriveAccessToken] = React.useState('');

  const [connectorsSaveStatus, setConnectorsSaveStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle');

  const [selectedSigMemberEmail, setSelectedSigMemberEmail] = React.useState('');
  const sigCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const isSigDrawing = React.useRef(false);

  React.useEffect(() => {
    if (selectedSigMemberEmail && sigCanvasRef.current) {
      const canvas = sigCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const member = localMembers.find(m => m.email === selectedSigMemberEmail);
        if (member && member.signature) {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          };
          img.src = member.signature;
        }
      }
    } else if (!selectedSigMemberEmail && sigCanvasRef.current) {
      const canvas = sigCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [selectedSigMemberEmail, localMembers]);

  const startSigDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isSigDrawing.current = true;
    const pos = getSigEventCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const drawSig = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isSigDrawing.current) return;
    e.preventDefault();
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getSigEventCoords(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopSigDrawing = () => {
    if (!isSigDrawing.current) return;
    isSigDrawing.current = false;
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL();
      setLocalMembers(prev => prev.map(m => {
        if (m.email === selectedSigMemberEmail) {
          return { ...m, signature: dataUrl };
        }
        return m;
      }));
    }
  };

  const clearSig = () => {
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setLocalMembers(prev => prev.map(m => {
      if (m.email === selectedSigMemberEmail) {
        return { ...m, signature: undefined };
      }
      return m;
    }));
  };

  const getSigEventCoords = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleGoogleDriveToggle = async (checked: boolean) => {
    if (checked) {
      try {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        provider.addScope('https://www.googleapis.com/auth/userinfo.email');

        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        const email = result?.user?.email || 'connected-account@google.com';

        if (!token) {
          throw new Error("Impossible d'obtenir le jeton d'accès OAuth Google Drive.");
        }

        setGoogleDriveActive(true);
        setGoogleDriveEmail(email);
        setGoogleDriveAccessToken(token);
      } catch (err: any) {
        console.error("Google Drive connection failed with Firebase popup, falling back:", err);
        // Fallback for custom clients if popup cancelled or domain restricted
        if (err.code === 'auth/popup-closed-by-user') {
          setGoogleDriveActive(false);
          return;
        }
        try {
          const client_id = "627487981610-1srkug4lp1qeih26pd2thd1241andaq4.apps.googleusercontent.com";
          const redirect_uri = window.location.origin;
          const scopes = [
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/userinfo.email"
          ].join(" ");
          
          const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
            `client_id=${client_id}` +
            `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
            `&response_type=token` +
            `&scope=${encodeURIComponent(scopes)}` +
            `&prompt=select_account`;

          const popup = window.open(oauthUrl, 'google-oauth', 'width=500,height=600');
          if (!popup) {
            throw new Error("Le bloqueur de fenêtres pop-up a empêché l'ouverture de la fenêtre de connexion Google.");
          }

          const pollTimer = setInterval(async () => {
            try {
              if (!popup || popup.closed) {
                clearInterval(pollTimer);
                return;
              }

              let currentHref = "";
              try {
                currentHref = popup.location.href;
              } catch (e) {
                return;
              }

              if (currentHref && currentHref.startsWith(redirect_uri)) {
                clearInterval(pollTimer);
                const hash = popup.location.hash;
                popup.close();

                const params = new URLSearchParams(hash.substring(1));
                const token = params.get('access_token');
                const error = params.get('error');

                if (error) {
                  throw new Error(`Erreur OAuth Google : ${error}`);
                }

                if (token) {
                  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  
                  const userinfo = userinfoRes.ok ? await userinfoRes.json() : {};
                  const email = userinfo.email || 'connected-account@google.com';

                  setGoogleDriveActive(true);
                  setGoogleDriveEmail(email);
                  setGoogleDriveAccessToken(token);
                }
              }
            } catch (e: any) {
              clearInterval(pollTimer);
              setGoogleDriveActive(false);
              alert("Erreur de connexion Google Drive : " + (e.message || e));
            }
          }, 500);
        } catch (fallbackErr: any) {
          setGoogleDriveActive(false);
          alert("Erreur de connexion Google Drive : " + (fallbackErr.message || fallbackErr));
        }
      }
    } else {
      setGoogleDriveActive(false);
      setGoogleDriveEmail('');
      setGoogleDriveAccessToken('');
    }
  };

  React.useEffect(() => {
    if (isOpen || isPage) {
      const activeTenant = localStorage.getItem('defib_tenant_id') || 'demo';
      fetchCollectionFromFirestore<any>('api_connectors', activeTenant).then(data => {
        if (data) {
          if (data.apiDefibeoActive !== undefined) setApiDefibeoActive(data.apiDefibeoActive);
          if (data.apiDefibeoApiKey !== undefined) setApiDefibeoApiKey(data.apiDefibeoApiKey);
          if (data.apiDefibeoSecretKey !== undefined) setApiDefibeoSecretKey(data.apiDefibeoSecretKey);

          if (data.sageActive !== undefined) setSageActive(data.sageActive);
          if (data.sageClientId !== undefined) setSageClientId(data.sageClientId);
          if (data.sageAccessToken !== undefined) setSageAccessToken(data.sageAccessToken);
          if (data.sageSecretToken !== undefined) setSageSecretToken(data.sageSecretToken);

          if (data.sage4197Active !== undefined) setSage4197Active(data.sage4197Active);
          if (data.sage4197ClientId !== undefined) setSage4197ClientId(data.sage4197ClientId);
          if (data.sage4197AccessToken !== undefined) setSage4197AccessToken(data.sage4197AccessToken);
          if (data.sage4197SecretToken !== undefined) setSage4197SecretToken(data.sage4197SecretToken);

          if (data.pennylaneActive !== undefined) setPennylaneActive(data.pennylaneActive);
          if (data.pennylaneClientId !== undefined) setPennylaneClientId(data.pennylaneClientId);
          if (data.pennylaneCompanyToken !== undefined) setPennylaneCompanyToken(data.pennylaneCompanyToken);
          if (data.pennylaneSecretToken !== undefined) setPennylaneSecretToken(data.pennylaneSecretToken);

          if (data.dropboxActive !== undefined) setDropboxActive(data.dropboxActive);
          if (data.dropboxAppKey !== undefined) setDropboxAppKey(data.dropboxAppKey);
          if (data.dropboxAppSecret !== undefined) setDropboxAppSecret(data.dropboxAppSecret);
          if (data.dropboxAccessToken !== undefined) setDropboxAccessToken(data.dropboxAccessToken);

          if (data.cegidActive !== undefined) setCegidActive(data.cegidActive);
          if (data.cegidApiKey !== undefined) setCegidApiKey(data.cegidApiKey);
          if (data.cegidApiSecret !== undefined) setCegidApiSecret(data.cegidApiSecret);

          if (data.lemonGroupWsActive !== undefined) setLemonGroupWsActive(data.lemonGroupWsActive);
          if (data.lemonGroupWsApiKey !== undefined) setLemonGroupWsApiKey(data.lemonGroupWsApiKey);
          if (data.lemonGroupWsApiSecret !== undefined) setLemonGroupWsApiSecret(data.lemonGroupWsApiSecret);

          if (data.textelpActive !== undefined) setTextelpActive(data.textelpActive);
          if (data.textelpEnvId !== undefined) setTextelpEnvId(data.textelpEnvId);
          if (data.textelpSecretId !== undefined) setTextelpSecretId(data.textelpSecretId);

          if (data.civilpromActive !== undefined) setCivilpromActive(data.civilpromActive);
          if (data.civilpromWebsiteUrl !== undefined) setCivilpromWebsiteUrl(data.civilpromWebsiteUrl);
          if (data.civilpromAssetsFileUrl !== undefined) setCivilpromAssetsFileUrl(data.civilpromAssetsFileUrl);

          if (data.atlasanteActive !== undefined) setAtlasanteActive(data.atlasanteActive);
          if (data.atlasanteDeclarantId !== undefined) setAtlasanteDeclarantId(data.atlasanteDeclarantId);
          if (data.atlasanteUrlAuth !== undefined) {
            setAtlasanteUrlAuth(data.atlasanteUrlAuth);
          } else {
            setAtlasanteUrlAuth('https://catalogue.atlasante.fr/api/login');
          }

          if (data.googleDriveActive !== undefined) setGoogleDriveActive(data.googleDriveActive);
          if (data.googleDriveEmail !== undefined) setGoogleDriveEmail(data.googleDriveEmail);
          if (data.googleDriveAccessToken !== undefined) setGoogleDriveAccessToken(data.googleDriveAccessToken);
        }
      }).catch(err => {
        console.error('Error loading API connectors from Firestore:', err);
      });
    }
  }, [isOpen, isPage]);

  const handleSaveConnectors = async () => {
    setConnectorsSaveStatus('saving');
    setDropboxError(null);

    // Verify Dropbox setup if active
    if (dropboxActive) {
      try {
        const { ensureDropboxSetup } = await import('../utils/dropbox');
        await ensureDropboxSetup(dropboxAccessToken);
      } catch (err: any) {
        console.error("Dropbox folder setup failed on save:", err);
        // Extract a cleaner error message if it is a missing_scope error
        let cleanMsg = err.message || "Impossible de créer le dossier, vérifiez les identifiants.";
        if (cleanMsg.includes("missing_scope")) {
          cleanMsg = "Erreur Dropbox : Autorisation insuffisante. Veuillez activer la permission 'files.content.write' (et 'files.content.read') dans l'onglet Permissions de votre application Dropbox Developer, puis générez un nouveau token.";
        } else if (cleanMsg.includes("401") || cleanMsg.includes("expired") || cleanMsg.includes("invalid_access_token") || cleanMsg.includes("Unauthorized")) {
          cleanMsg = "Erreur Dropbox 401 : Le token d'accès est invalide ou expiré (les tokens temporaires Dropbox expirent au bout de 4 heures). Veuillez générer un nouveau Token d'accès dans votre console Dropbox Developer.";
        }
        setDropboxError(cleanMsg);
      }
    }

    try {
      const payload = {
        apiDefibeoActive,
        apiDefibeoApiKey,
        apiDefibeoSecretKey,
        sageActive,
        sageClientId,
        sageAccessToken,
        sageSecretToken,
        sage4197Active,
        sage4197ClientId,
        sage4197AccessToken,
        sage4197SecretToken,
        pennylaneActive,
        pennylaneClientId,
        pennylaneCompanyToken,
        pennylaneSecretToken,
        dropboxActive,
        dropboxAppKey,
        dropboxAppSecret,
        dropboxAccessToken,
        cegidActive,
        cegidApiKey,
        cegidApiSecret,
        lemonGroupWsActive,
        lemonGroupWsApiKey,
        lemonGroupWsApiSecret,
        textelpActive,
        textelpEnvId,
        textelpSecretId,
        civilpromActive,
        civilpromWebsiteUrl,
        civilpromAssetsFileUrl,
        atlasanteActive,
        atlasanteDeclarantId,
        atlasanteUrlAuth,
        googleDriveActive,
        googleDriveEmail,
        googleDriveAccessToken
      };
      await saveCollectionToFirestore('api_connectors', payload);
      setConnectorsSaveStatus('saved');
      if (onConnectorsUpdated) {
        onConnectorsUpdated();
      }
    } catch (e) {
      console.error('Error saving API connectors to Firestore:', e);
      setConnectorsSaveStatus('idle');
    }
    setTimeout(() => {
      setConnectorsSaveStatus('idle');
    }, 2500);
  };

  if (!isPage && !isOpen) return null;

  // Local state change handlers
  const handleCompanyChange = (key: keyof CompanyInfo, value: string) => {
    setLocalCompany(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleToggleTabVisibility = (tabLabel: string) => {
    const currentHidden = localCompany.hiddenTabs || [];
    let newHidden: string[] = [];

    const isCurrentlyHidden = currentHidden.includes(tabLabel);

    if (tabLabel === 'Formations' || tabLabel === 'Stagiaires') {
      if (!isCurrentlyHidden) {
        // Hide Formations or Stagiaires -> hide Formations, Stagiaires, and Émargements
        const toAdd = ['Formations', 'Stagiaires', 'Émargements'];
        newHidden = Array.from(new Set([...currentHidden, ...toAdd]));
      } else {
        // Unhide Formations or Stagiaires -> unhide Formations, Stagiaires, and Émargements
        newHidden = currentHidden.filter(t => !['Formations', 'Stagiaires', 'Émargements'].includes(t));
      }
    } else if (tabLabel === 'Émargements') {
      if (!isCurrentlyHidden) {
        // Hide Émargements -> hide Émargements only
        newHidden = Array.from(new Set([...currentHidden, 'Émargements']));
      } else {
        // Unhide Émargements -> unhide Émargements, Formations, and Stagiaires
        newHidden = currentHidden.filter(t => !['Formations', 'Stagiaires', 'Émargements'].includes(t));
      }
    } else {
      newHidden = isCurrentlyHidden
        ? currentHidden.filter(t => t !== tabLabel)
        : [...currentHidden, tabLabel];
    }

    const updatedCompany = {
      ...localCompany,
      hiddenTabs: newHidden
    };

    setLocalCompany(updatedCompany);
    onUpdateCompanyInfo(updatedCompany);

    if (myTenantId && myTenantId !== 'demo') {
      saveCollectionToFirestore('companyInfo', updatedCompany).catch(err =>
        console.error('Error saving company info directly to Firestore:', err)
      );
    }
  };

  const canEditMember = (index: number) => {
    const m = localMembers[index];
    if (!m) return false;
    const isTech = m.role === 'Technicien' || m.role === 'Maintenance Terrain' || m.role?.toLowerCase().includes('tech');
    const isOwnSession = currentUser && m.email?.toLowerCase().trim() === currentUser.email?.toLowerCase().trim();
    
    const loggedInMember = currentUser ? localMembers.find(lm => lm.email?.toLowerCase().trim() === currentUser.email?.toLowerCase().trim()) : null;
    const loggedUserRole = localStorage.getItem('defib_logged_user_role');
    const isPrimaryTenantAdmin = loggedUserRole === 'admin' || loggedUserRole === 'megaadmin';

    const isCurrentUserAdminOrSuperAdmin = isPrimaryTenantAdmin || (loggedInMember && (
      loggedInMember.role === 'Administrateur' || 
      loggedInMember.role === 'Super-Administrateur' || 
      loggedInMember.role === 'Propriétaire / Admin' || 
      loggedInMember.role?.toLowerCase().includes('super') || 
      loggedInMember.role?.toLowerCase().includes('propriétaire') ||
      loggedInMember.role?.toLowerCase().includes('admin')
    ));
    const isCurrentUserSuperAdmin = isPrimaryTenantAdmin || (loggedInMember && (
      loggedInMember.role === 'Super-Administrateur' || 
      loggedInMember.role === 'Propriétaire / Admin' || 
      loggedInMember.role?.toLowerCase().includes('super') || 
      loggedInMember.role?.toLowerCase().includes('propriétaire')
    ));
    return !!(isOwnSession || isCurrentUserSuperAdmin || (isTech && isCurrentUserAdminOrSuperAdmin));
  };

  const handlePinChange = (index: number, pinVal: string) => {
    if (!canEditMember(index)) return;
    const cleaned = pinVal.replace(/[^0-9]/g, '').slice(0, 4);
    setLocalMembers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], pin: cleaned };
      return updated;
    });
  };

  const handleRoleChange = (index: number, newRole: string) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const isTech = newRole === 'Technicien';
      updated[index] = { 
        ...updated[index], 
        role: newRole,
        pin: updated[index].pin || '1234',
        locationLink: isTech ? updated[index].locationLink : undefined,
        adminSubRole: !isTech ? (updated[index].adminSubRole || 'Administrateur') : undefined
      };
      return updated;
    });
  };

  const handleNameChange = (index: number, val: string) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name: val };
      return updated;
    });
  };

  const handleEmailChange = (index: number, val: string) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], email: val };
      return updated;
    });
  };

  const handleLocationChange = (index: number, val: string) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], locationLink: val || undefined };
      return updated;
    });
  };

  const handleCompetenceToggle = (index: number, comp: string) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const current = updated[index].competences || [];
      const newCompetences = current.includes(comp)
        ? current.filter(c => c !== comp)
        : [...current, comp];
      updated[index] = { ...updated[index], competences: newCompetences };
      return updated;
    });
  };

  const handleAddMemberSchedule = (index: number) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const current = updated[index].semaineTypique || [];
      const newSchedule: MemberSchedule = {
        days: [],
        fermetureMidi: false,
        openMorning: '09:00',
        closeMorning: '12:00',
        openAfternoon: '14:00',
        closeAfternoon: '18:00',
        openContinuous: '09:00',
        closeContinuous: '17:00',
        commentaire: '',
        openForMissions: true
      };
      updated[index] = { ...updated[index], semaineTypique: [...current, newSchedule] };
      return updated;
    });
  };

  const handleRemoveMemberSchedule = (index: number, schIdx: number) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const current = updated[index].semaineTypique || [];
      const filtered = current.filter((_, i) => i !== schIdx);
      updated[index] = { ...updated[index], semaineTypique: filtered };
      return updated;
    });
  };

  const handleUpdateMemberScheduleField = (index: number, schIdx: number, field: keyof MemberSchedule, val: any) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const current = updated[index].semaineTypique || [];
      const updatedSchedules = current.map((sch, i) => {
        if (i !== schIdx) return sch;
        return { ...sch, [field]: val };
      });
      updated[index] = { ...updated[index], semaineTypique: updatedSchedules };
      return updated;
    });
  };

  const handleToggleMemberScheduleDay = (index: number, schIdx: number, day: string) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const current = updated[index].semaineTypique || [];
      const updatedSchedules = current.map((sch, i) => {
        if (i !== schIdx) return sch;
        const days = sch.days.includes(day)
          ? sch.days.filter(d => d !== day)
          : [...sch.days, day];
        return { ...sch, days };
      });
      updated[index] = { ...updated[index], semaineTypique: updatedSchedules };
      return updated;
    });
  };

  const handleAddMemberAbsence = (index: number) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const current = updated[index].absences || [];
      const newAbsence: MemberAbsence = {
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        commentaire: ''
      };
      updated[index] = { ...updated[index], absences: [...current, newAbsence] };
      return updated;
    });
  };

  const handleRemoveMemberAbsence = (index: number, absIdx: number) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const current = updated[index].absences || [];
      const filtered = current.filter((_, i) => i !== absIdx);
      updated[index] = { ...updated[index], absences: filtered };
      return updated;
    });
  };

  const handleUpdateMemberAbsenceField = (index: number, absIdx: number, field: keyof MemberAbsence, val: string) => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      const current = updated[index].absences || [];
      const updatedAbsences = current.map((abs, i) => {
        if (i !== absIdx) return abs;
        const newAbs = { ...abs, [field]: val };
        if (field === 'startDate' && (!newAbs.endDate || newAbs.endDate < val)) {
          newAbs.endDate = val;
        }
        return newAbs;
      });
      updated[index] = { ...updated[index], absences: updatedAbsences };
      return updated;
    });
  };

  const handleAdminSubRoleChange = (index: number, val: 'Administrateur' | 'Administration' | 'Planification' | 'Logistique' | 'Comptabilité' | 'Contrôleur' | 'Administrateur & Contrôleur' | 'Développeur') => {
    if (!canEditMember(index)) return;
    setLocalMembers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], adminSubRole: val };
      return updated;
    });
  };

  const handleRemoveMember = async (index: number) => {
    const m = localMembers[index];
    const isSuperAdmin = m.role === 'Super-Administrateur' || m.role === 'Propriétaire / Admin' || m.role?.toLowerCase().includes('super') || m.role?.toLowerCase().includes('propriétaire');
    if (isSuperAdmin) {
      alert("Impossible de supprimer le Super-Administrateur principal.");
      return;
    }
    const updatedList = localMembers.filter((_, idx) => idx !== index);
    setLocalMembers(updatedList);
    setMemberToDeleteIndex(null);
    await handleSaveAll(updatedList);
  };

  const [isVerifyingEmail, setIsVerifyingEmail] = React.useState(false);
  const [isAddingMember, setIsAddingMember] = React.useState(false);
  const [newMemberError, setNewMemberError] = React.useState<string | null>(null);

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingMember || isSaving) return;
    setIsAddingMember(true);
    setNewMemberError(null);

    try {
      if (localMembers.length >= 15) {
        setNewMemberError("La limite maximale de 15 membres est atteinte.");
        setIsAddingMember(false);
        return;
      }

      if (!newMemberName.trim()) {
        setNewMemberError("Veuillez saisir un Nom & Prénom.");
        setIsAddingMember(false);
        return;
      }
      if (!newMemberEmail.trim()) {
        setNewMemberError("Veuillez saisir une adresse email.");
        setIsAddingMember(false);
        return;
      }
      if (newMemberPin.length !== 4) {
        setNewMemberError("Le code PIN doit comporter exactement 4 chiffres.");
        setIsAddingMember(false);
        return;
      }

      const candidateEmail = newMemberEmail.trim().toLowerCase();

      // 1. Check local state duplicates
      const existsLocally = localMembers.some(m => m.email?.trim().toLowerCase() === candidateEmail);
      if (existsLocally) {
        setNewMemberError("Erreur: un utilisateur avec cet email est déjà existant.");
        setIsAddingMember(false);
        return;
      }

      setIsVerifyingEmail(true);
      try {
        const emailCheck = await checkIfEmailExistsAnywhere(candidateEmail);
        if (emailCheck.exists) {
          setNewMemberError("Erreur: un utilisateur avec cet email est déjà existant.");
          setIsVerifyingEmail(false);
          setIsAddingMember(false);
          return;
        }
      } catch (err) {
        console.error('Error verifying email uniqueness:', err);
      } finally {
        setIsVerifyingEmail(false);
      }

      if (newMemberRole === 'Technicien' && newMemberLocation) {
        const alreadyTaken = localMembers.some(
          mem => mem.role === 'Technicien' && mem.locationLink === newMemberLocation
        );
        if (alreadyTaken) {
          setNewMemberError(`Erreur: l'emplacement ${newMemberLocation} est déjà attribué.`);
          setIsAddingMember(false);
          return;
        }
      }

      const m: Member = {
        name: newMemberName.trim(),
        email: newMemberEmail.trim(),
        role: newMemberRole,
        pin: newMemberPin,
        status: 'Inactif',
        lastActive: 'Jamais',
        locationLink: newMemberRole === 'Technicien' ? (newMemberLocation || undefined) : undefined,
        adminSubRole: newMemberRole === 'Administrateur' ? (newMemberAdminSubRole || 'Administrateur') : undefined
      };

      const updatedMembers = [...localMembers, m];
      setLocalMembers(updatedMembers);

      // Reset rapid addition fields
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberRole('Administrateur');
      setNewMemberPin('');
      setNewMemberLocation('');
      setNewMemberAdminSubRole('Administrateur');
      setNewMemberError(null);

      // Auto-trigger the Enregistrer button by executing handleSaveAll directly
      await handleSaveAll(updatedMembers);

    } catch (err) {
      console.error('Error in handleAddMemberSubmit:', err);
    } finally {
      setIsAddingMember(false);
    }
  };

  // Perform overall save to parent state upon Enregistrer click
  const handleSaveAll = async (membersOverride?: Member[] | any) => {
    if (isDeveloper || isReadOnly) {
      alert("Action non autorisée : Le rôle Développeur est en mode lecture seule.");
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    setIsVerifyingEmail(true);

    let rawMembersToSave = (Array.isArray(membersOverride) ? membersOverride : null) || localMembers;
    const membersToSave: Member[] = await Promise.all(rawMembersToSave.map(async (m: Member) => {
      let lat = m.startAddressLat;
      let lng = m.startAddressLng;
      if (typeof lat === 'string' && ((lat as string).toLowerCase() === 'null' || (lat as string).toLowerCase() === 'nan')) lat = undefined;
      if (typeof lng === 'string' && ((lng as string).toLowerCase() === 'null' || (lng as string).toLowerCase() === 'nan')) lng = undefined;
      if (lat !== undefined && (lat === null || isNaN(Number(lat)))) lat = undefined;
      if (lng !== undefined && (lng === null || isNaN(Number(lng)))) lng = undefined;
      if (lat !== undefined) lat = Number(lat);
      if (lng !== undefined) lng = Number(lng);

      if (m.role === 'Technicien' && (lat === undefined || lng === undefined)) {
        const s = (m.startAddressStreet || '').trim();
        const z = (m.startAddressZip || '').trim();
        const c = (m.startAddressCity || '').trim();
        const co = (m.startAddressCountry || 'France').trim();
        if (s || z || c) {
          const fullAddr = s ? `${s}, ${z} ${c}, ${co}`.trim() : `${z} ${c}, ${co}`.trim();
          let coord = await geocodeAddress(fullAddr);
          if (!coord && s) {
            coord = await geocodeAddress(`${z} ${c}, ${co}`.trim());
          }
          if (coord) {
            lat = coord.lat;
            lng = coord.lng;
          }
        }
      }

      return {
        ...m,
        startAddressLat: lat,
        startAddressLng: lng
      };
    }));
    const myTenantId = localStorage.getItem('defib_tenant_id') || 'demo';

    try {
      if (!localCompany.name || !localCompany.name.trim()) {
        alert("Le champ 'Nom commercial' est requis.");
        setIsSaving(false);
        setIsVerifyingEmail(false);
        return;
      }

      if (!localCompany.email || !localCompany.email.trim()) {
        alert("Le champ 'Email de l'entreprise' est requis.");
        setIsSaving(false);
        setIsVerifyingEmail(false);
        return;
      }

      if (!localCompany.nomLogiciel || !localCompany.nomLogiciel.trim()) {
        alert("Le champ 'Nom du logiciel' est requis.");
        setIsSaving(false);
        setIsVerifyingEmail(false);
        return;
      }

      if (localCompany.gmailPartageLocalisation && localCompany.gmailPartageLocalisation.trim()) {
        const val = localCompany.gmailPartageLocalisation.trim();
        if (!val.toLowerCase().endsWith('@gmail.com')) {
          alert("Le champ 'Gmail Partage Localisation.' doit se terminer par @gmail.com.");
          setIsSaving(false);
          setIsVerifyingEmail(false);
          return;
        }
      }

      // Check for duplicate location assignments among technicians
      const locationsAssigned = new Set<string>();
      for (const m of membersToSave) {
        if (m.role === 'Technicien' && m.locationLink) {
          if (locationsAssigned.has(m.locationLink)) {
            alert(`Erreur: l'emplacement "${m.locationLink}" est attribué à plusieurs techniciens.`);
            setIsSaving(false);
            setIsVerifyingEmail(false);
            return;
          }
          locationsAssigned.add(m.locationLink);
        }
      }

      // 1. Check local duplicates within the local list itself
      const emailsSeen = new Set<string>();
      for (const m of membersToSave) {
        const emailLower = m.email?.trim().toLowerCase();
        if (!emailLower) continue;
        if (emailsSeen.has(emailLower)) {
          alert(`Erreur: un utilisateur avec cet email est déjà existant.`);
          setIsSaving(false);
          setIsVerifyingEmail(false);
          return;
        }
        emailsSeen.add(emailLower);
      }

    } catch (err) {
      console.error('Error validation before save:', err);
      alert("Une erreur est survenue lors de la validation des données.");
      setIsSaving(false);
      setIsVerifyingEmail(false);
      return;
    } finally {
      setIsVerifyingEmail(false);
    }

    const companyToSave = {
      ...localCompany,
      customLocationNames: localLocationNames,
      enableAutoEmails: enableAutoEmails,
      enableSatisfactionAvis: enableSatisfactionAvis,
      enableDevisFactures: enableDevisFactures,
      communicationPortailClient: communicationPortailClient
    };
    onUpdateCompanyInfo(companyToSave);
    onUpdateMembers(membersToSave);

    // Save directly to Firestore for environments to guarantee persistence and solve the Mercedes AMG sync bug
    const promises: Promise<any>[] = [];

    if (myTenantId && myTenantId !== 'demo') {
      promises.push(
        saveCollectionToFirestore('companyInfo', companyToSave).catch(err =>
          console.error('Error saving company info directly to Firestore:', err)
        )
      );
      promises.push(
        saveCollectionToFirestore('members', membersToSave).catch(err =>
          console.error('Error saving members directly to Firestore:', err)
        )
      );

      let saveUserEmail = '';
      if (currentUser && currentUser.email) {
        saveUserEmail = currentUser.email.toLowerCase().trim();
      } else {
        try {
          const saved = localStorage.getItem('defib_admin_logged_user');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.email) saveUserEmail = parsed.email.toLowerCase().trim();
          }
        } catch (e) {}
      }

      if (saveUserEmail) {
        const cleanEmail = saveUserEmail.replace(/[^a-zA-Z0-9]/g, '_');
        const foundTheme = APP_THEMES.find(t => t.id === selectedTheme);
        promises.push(
          saveCollectionToFirestore(`userTheme_${cleanEmail}`, {
            userEmail: saveUserEmail,
            themeId: selectedTheme,
            themeColor: foundTheme ? foundTheme.color : DEFAULT_THEME_COLOR,
            updatedAt: new Date().toISOString()
          }, myTenantId).catch(err =>
            console.error('Error saving userTheme directly to Firestore:', err)
          )
        );
        const foundFavicon = APP_FAVICONS.find(f => f.id === selectedFavicon);
        promises.push(
          saveCollectionToFirestore(`userFavicon_${cleanEmail}`, {
            userEmail: saveUserEmail,
            faviconId: selectedFavicon,
            faviconUrl: foundFavicon ? foundFavicon.url : DEFAULT_FAVICON_URL,
            updatedAt: new Date().toISOString()
          }, myTenantId).catch(err =>
            console.error('Error saving userFavicon directly to Firestore:', err)
          )
        );
      }
    }

    // Envoi des emails aux nouveaux membres (Email de bienvenue personnalisé)
    try {
      const originalEmails = new Set(members.map(m => m.email?.trim().toLowerCase()));
      const newMembers = membersToSave.filter(m => m.email && !originalEmails.has(m.email.trim().toLowerCase()));

      for (const m of newMembers) {
        promises.push(
          triggerEmailNewMemberAdded(
            m.email.trim(),
            m.pin,
            localCompany.name || 'Défibeo Suite',
            localCompany.email || ''
          ).catch(e => console.error("Error sending new member invite:", e))
        );
      }
    } catch (err) {
      console.error("Error dispatching member invites:", err);
    }
    
    // Sauvegarder l'url de l'app script
    promises.push(
      saveAppsScriptUrl(appsScriptUrl).catch(e => console.error("Error saving apps script URL:", e))
    );

    // Sauvegarder les intitulés personnalisés des emplacements
    localStorage.setItem(`defib_${myTenantId}_custom_location_names`, JSON.stringify(localLocationNames));
    localStorage.setItem(`defib_${myTenantId}_enable_auto_emails`, enableAutoEmails);
    localStorage.setItem(`defib_${myTenantId}_enable_satisfaction_avis`, enableSatisfactionAvis);
    localStorage.setItem(`defib_${myTenantId}_enable_devis_factures`, enableDevisFactures);
    
    let userEmail = '';
    if (currentUser && currentUser.email) {
      userEmail = currentUser.email.toLowerCase().trim();
    } else {
      try {
        const saved = localStorage.getItem('defib_admin_logged_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.email) userEmail = parsed.email.toLowerCase().trim();
        }
      } catch (e) {}
    }
    const userSpecificKey = userEmail ? `defib_${myTenantId}_user_${userEmail}_disable_helps_tutorials` : `defib_${myTenantId}_disable_helps_tutorials`;
    localStorage.setItem(userSpecificKey, disableHelpsAndTutorials);
    localStorage.setItem(`defib_${myTenantId}_communication_portail_client`, communicationPortailClient);
    if (onUpdateLocationNames) {
      onUpdateLocationNames(localLocationNames);
    }

    // Save language and super-admin profile to the master tenant list in Firestore
    if (myTenantId && myTenantId !== 'demo') {
      promises.push(
        updateTenantLanguage(myTenantId, selectedLang).catch(e => console.error("Error updating tenant lang:", e))
      );

      // Find if super-admin member email was updated
      const superAdminMember = membersToSave.find(m => 
        m.role === 'Super-Administrateur' || 
        m.role === 'Propriétaire / Admin' || 
        m.role?.toLowerCase().includes('super') || 
        m.role?.toLowerCase().includes('propriétaire')
      );
      if (superAdminMember && superAdminMember.email) {
        const newAdminEmail = superAdminMember.email.trim();
        const newAdminName = superAdminMember.name?.trim();
        promises.push(
          updateTenantAdminProfile(myTenantId, newAdminEmail, newAdminName).catch(e => 
            console.error("Error updating tenant super-admin profile in registered_tenants:", e)
          )
        );

        // If the current logged-in user is this super-admin, update their local session storage
        try {
          const savedUser = localStorage.getItem('defib_admin_logged_user');
          if (savedUser) {
            const parsed = JSON.parse(savedUser);
            parsed.email = newAdminEmail;
            if (newAdminName) parsed.name = newAdminName;
            localStorage.setItem('defib_admin_logged_user', JSON.stringify(parsed));
          }
        } catch (err) {
          console.warn("Error updating defib_admin_logged_user:", err);
        }
      }
    }
    
    // Set reload flags to automatically reopen settings and scroll to members
    localStorage.setItem('open_settings_after_reload', 'true');
    localStorage.setItem('scroll_to_members', 'true');

    // Wait at most 800ms for all writes to hit offline/network layer, then reload the page
    const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 800));
    await Promise.race([
      Promise.allSettled(promises),
      timeoutPromise
    ]);

    // Perform reload immediately to prevent frozen screen states
    window.location.reload();
  };

  // Harmonized styling constants
  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
  };

  const pillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '1000px',
    backgroundColor: 'rgb(76 20 81)',
    border: 'none',
    color: 'rgb(255 255 255)',
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 10px',
    whiteSpace: 'nowrap',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    textTransform: 'none',
    cursor: 'default',
  };

  const rowActionButtonStyle: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '0.75rem',
    fontSize: '18px',
    padding: '11px 22px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
  };

  return (
    <div className={isPage ? "w-full min-h-screen bg-white font-sans text-black" : "fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6 shadow-2xl"} id={isPage ? "settings-page-wrapper" : "settings-modal-overlay"}>
      <style>{`
        #settings-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]),
        #settings-tab-container-harmonized select {
          height: 48px !important;
          padding: 12px 16px !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 13px !important;
          font-size: 16px !important;
          font-weight: 400 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
        }
        #settings-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]).bg-grey-input {
          background: #f1f5f9 !important;
        }
        #settings-tab-container-harmonized textarea {
          padding: 12px 16px !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 13px !important;
          font-size: 16px !important;
          font-weight: 400 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
        }
        #settings-tab-container-harmonized select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
          padding-right: 12px !important;
        }
        #settings-tab-container-harmonized label {
          font-size: 16px !important;
          font-weight: 600 !important;
          text-transform: none !important;
          letter-spacing: normal !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          cursor: default !important;
        }
        #settings-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled),
        #settings-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled),
        #settings-tab-container-harmonized select:hover:not(:disabled),
        #settings-tab-container-harmonized select:focus:not(:disabled) {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #settings-tab-container-harmonized input:disabled {
          background-color: #f3f4f6 !important;
          color: #9ca3af !important;
          cursor: not-allowed !important;
          border-color: #e5e7eb !important;
        }
      `}</style>



      <div 
        className={isPage ? "bg-white w-full max-w-[760px] mx-auto flex flex-col overflow-hidden animate-fadeIn" : "bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col transform transition-all animate-scaleUp"}
        id={isPage ? "settings-page-container" : "settings-modal-dialog"}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header aligned with other modules */}
        {!isPage && (
          <div 
            className="flex items-center justify-between"
            style={{
              padding: '16px 24px',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid rgba(226, 232, 240, 0.8)'
            }}
          >
            <div className="flex items-center gap-2">
              <div>
                <h3 className="text-2xl font-bold text-black font-gochi" style={{ color: '#000000', cursor: 'default' }}>Paramètres</h3>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                disabled={isSaving}
                onClick={handleSaveAll}
                style={{
                  backgroundColor: 'rgb(53, 86, 236)',
                  color: '#ffffff',
                  boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
                  borderRadius: '0.75rem',
                  fontSize: '18px',
                  padding: '11px 22px',
                  fontWeight: '100',
                  transition: 'all 0s ease-in-out',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  border: 'none',
                  fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                }}
                className="transition-all"
              >
                Enregistrer
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div 
          className={isPage ? "py-6 pb-24 space-y-6 flex flex-col" : "p-6 space-y-6 overflow-y-auto max-h-[75vh] flex flex-col"} 
          id="settings-tab-container-harmonized"
          style={isPage ? { maxWidth: '98%', margin: '0 auto', width: '100%' } : {}}
        >
          {/* SECTION 1: RÉGLAGES */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left" id="settings-section-company">
            {renderSectionHeader(t("Réglages"))}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">{t("Langue et région du logiciel")}.</label>
                <select
                  value={selectedLang || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedLang(val);
                    setLanguage(val);
                  }}
                  className="w-full text-black font-sans text-sm cursor-pointer"
                >
                  <option value="" disabled hidden>{t("Sélectionnez une localisation")}.</option>
                  <option value="Français, France">Français, France</option>
                  <option value="Français, Belgique">Français, Belgique</option>
                  <option value="Français, Luxembourg">Français, Luxembourg</option>
                  <option value="Français, Monaco">Français, Monaco</option>
                  <option value="English, Switzerland">English, Switzerland</option>
                  <option value="English, United Kingdom">English, United Kingdom</option>
                  <option value="English, Spain">English, Spain</option>
                  <option value="English, Portugal">English, Portugal</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">
                  {t("Nom commercial")} <span className="text-red-500">*</span>.
                </label>
                <input
                  type="text"
                  value={localCompany.name}
                  onChange={(e) => handleCompanyChange('name', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm"
                  placeholder={t("Entrez un nom commercial")}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">{t("URL source du logo")}.</label>
                <input
                  type="text"
                  value={localCompany.logo}
                  onChange={(e) => handleCompanyChange('logo', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm"
                  placeholder={t("Collez le lien source du logo")}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">{t("URL du site internet")}.</label>
                <input
                  type="text"
                  value={localCompany.website}
                  onChange={(e) => handleCompanyChange('website', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm"
                  placeholder={t("Collez le lien du site internet")}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">
                  {t("Email de l’entreprise")} <span className="text-red-500">*</span>.
                </label>
                <input
                  type="email"
                  value={localCompany.email}
                  onChange={(e) => handleCompanyChange('email', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-xs"
                  placeholder={t("Entrez l’email de l’entreprise")}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">{t("Téléphone de l’entreprise")}.</label>
                <input
                  type="text"
                  value={localCompany.phone}
                  onChange={(e) => handleCompanyChange('phone', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm"
                  placeholder={t("Entrez le téléphone de l’entreprise")}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">
                  {t("Nom du logiciel")} <span className="text-red-500">*</span>.
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={localCompany.nomLogiciel ?? ''}
                  onChange={(e) => handleCompanyChange('nomLogiciel', e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15))}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm bg-white"
                  style={{ backgroundColor: '#ffffff' }}
                  placeholder={t("Ex: App360")}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">{t("Lien vers les conditions légales")}.</label>
                <input
                  type="url"
                  value={localCompany.conditionsLegalesLink ?? ''}
                  onChange={(e) => handleCompanyChange('conditionsLegalesLink', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm bg-white"
                  style={{ backgroundColor: '#ffffff' }}
                  placeholder={t("Collez le lien vers vos conditions légales")}
                />
              </div>

              <div className="space-y-1 md:col-span-1">
                <label className="block text-[16px] font-bold text-black font-sans">{t("Mentions légales pour les pièces comptables")}.</label>
                <input
                  type="text"
                  value={localCompany.mentionsLegalesFactures ?? ''}
                  onChange={(e) => handleCompanyChange('mentionsLegalesFactures', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm bg-white"
                  style={{ backgroundColor: '#ffffff' }}
                  placeholder={t("Saisissez les mentions légales pour vos devis et factures")}
                />
              </div>

              <div className="space-y-1 md:col-span-1">
                <label className="block text-[16px] font-bold text-black font-sans">{t("Gmail Partage Localisation.")}</label>
                <input
                  type="email"
                  value={localCompany.gmailPartageLocalisation ?? ''}
                  onChange={(e) => handleCompanyChange('gmailPartageLocalisation', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm bg-white"
                  style={{ backgroundColor: '#ffffff' }}
                  placeholder={t("Ex: partage@gmail.com")}
                />
              </div>
            </div>

            {/* SATISFACTION REVIEW TEXT OPTION */}
            <div className="space-y-2 mt-4">
              <label className="block text-[16px] font-bold text-black font-sans leading-tight">
                {t("Activer le texte invitant le client à laisser un avis (mesure de satisfaction).")}
              </label>
              <div className="flex items-center space-x-6 py-1 font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setEnableSatisfactionAvis("Oui");
                  }}
                  className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
                >
                  <span 
                    className="rounded-full flex items-center justify-center transition-all bg-white"
                    style={{
                      border: enableSatisfactionAvis === "Oui" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                      width: '20px',
                      height: '20px',
                      minWidth: '20px',
                      minHeight: '20px',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    {enableSatisfactionAvis === "Oui" && (
                      <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                    )}
                  </span>
                  <span className="text-[15px] font-semibold text-black">{t("Oui")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEnableSatisfactionAvis("Non");
                  }}
                  className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
                >
                  <span 
                    className="rounded-full flex items-center justify-center transition-all bg-white"
                    style={{
                      border: enableSatisfactionAvis === "Non" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                      width: '20px',
                      height: '20px',
                      minWidth: '20px',
                      minHeight: '20px',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    {enableSatisfactionAvis === "Non" && (
                      <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                    )}
                  </span>
                  <span className="text-[15px] font-semibold text-black">{t("Non")}</span>
                </button>
              </div>
            </div>

            {/* OTHER EQUIPMENTS INTEGRATION */}
            <div className="space-y-2 mt-4">
            <label className="block text-[16px] font-bold text-black font-sans leading-tight">
              {t("Activer l'infogérance et la maintenance de d'autres types d'équipements")}.
            </label>
            <div className="flex items-center space-x-6 py-1 font-sans">
              <button
                type="button"
                onClick={() => {
                  setEnableOtherEquipments("Oui");
                  localStorage.setItem(`defib_${myTenantId}_enable_other_equipments`, 'Oui');
                  onUpdateOtherEquipments?.("Oui");
                  setShowDisableOtherEquipmentsConfirmation(false);
                }}
                className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
              >
                <span 
                  className="rounded-full flex items-center justify-center transition-all bg-white"
                  style={{
                    border: enableOtherEquipments === "Oui" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                    width: '20px',
                    height: '20px',
                    minWidth: '20px',
                    minHeight: '20px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {enableOtherEquipments === "Oui" && (
                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                  )}
                </span>
                <span className="text-[15px] font-semibold text-black">Oui</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (enableOtherEquipments === "Oui" && (otherEquipments || []).length > 0) {
                    setShowDisableOtherEquipmentsConfirmation(true);
                  } else {
                    setEnableOtherEquipments("Non");
                    localStorage.setItem(`defib_${myTenantId}_enable_other_equipments`, 'Non');
                    onUpdateOtherEquipments?.("Non");
                    setShowDisableOtherEquipmentsConfirmation(false);
                  }
                }}
                className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
              >
                <span 
                  className="rounded-full flex items-center justify-center transition-all bg-white"
                  style={{
                    border: enableOtherEquipments === "Non" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                    width: '20px',
                    height: '20px',
                    minWidth: '20px',
                    minHeight: '20px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {enableOtherEquipments === "Non" && (
                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                  )}
                </span>
                <span className="text-[15px] font-semibold text-black">Non</span>
              </button>
            </div>

            {showDisableOtherEquipmentsConfirmation && (
              <div 
                className="mt-3 p-5 rounded-[13px] space-y-4 transition-all animate-fadeIn"
                style={{
                  backgroundColor: '#fde5ff',
                  border: 'none',
                  maxHeight: '205px',
                }}
              >
                <p 
                  style={{ 
                    fontSize: '18px', 
                    lineHeight: '1.4',
                    color: '#973e9e',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                  className="font-bold"
                >
                  {t("Souhaitez-vous faire clôture votre extension, cela engendre la suppression de ces données")}
                </p>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDisableOtherEquipmentsConfirmation(false);
                    }}
                    style={{
                      backgroundColor: '#000000',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '18px',
                      borderRadius: '13px',
                      padding: '10px 20px',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      cursor: 'pointer',
                    }}
                    className="font-bold select-none transition-all hover:opacity-90 active:scale-[0.98]"
                  >
                    {t("Annuler")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnableOtherEquipments("Non");
                      localStorage.setItem('defib_enable_other_equipments', 'Non');
                      onUpdateOtherEquipments?.("Non");
                      onClearOtherEquipments?.();
                      setShowDisableOtherEquipmentsConfirmation(false);
                    }}
                    style={{
                      backgroundColor: '#000000',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '18px',
                      borderRadius: '13px',
                      padding: '10px 20px',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      cursor: 'pointer',
                    }}
                    className="font-bold select-none transition-all hover:opacity-90 active:scale-[0.98]"
                  >
                    {t("Confirmer")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AUTOMATIC CLIENT EMAILS */}
          <div className="space-y-2 mt-4">
            <label className="block text-[16px] font-bold text-black font-sans leading-tight">
              {t("Activer les emails automatiques destinés aux clients.")}
            </label>
            <div className="flex items-center space-x-6 py-1 font-sans">
              <button
                type="button"
                onClick={() => {
                  setEnableAutoEmails("Oui");
                }}
                className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
              >
                <span 
                  className="rounded-full flex items-center justify-center transition-all bg-white"
                  style={{
                    border: enableAutoEmails === "Oui" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                    width: '20px',
                    height: '20px',
                    minWidth: '20px',
                    minHeight: '20px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {enableAutoEmails === "Oui" && (
                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                  )}
                </span>
                <span className="text-[15px] font-semibold text-black">Oui</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEnableAutoEmails("Non");
                }}
                className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
              >
                <span 
                  className="rounded-full flex items-center justify-center transition-all bg-white"
                  style={{
                    border: enableAutoEmails === "Non" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                    width: '20px',
                    height: '20px',
                    minWidth: '20px',
                    minHeight: '20px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {enableAutoEmails === "Non" && (
                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                  )}
                </span>
                <span className="text-[15px] font-semibold text-black">Non</span>
              </button>
            </div>
          </div>

          {/* DEVIS & FACTURES OPTION */}
          <div className="space-y-2 mt-4">
            <label className="block text-[16px] font-bold text-black font-sans leading-tight">
              {t("Utiliser Commandes sur Defibeo.")}
            </label>
            <div className="flex items-center space-x-6 py-1 font-sans">
              <button
                type="button"
                onClick={() => {
                  setEnableDevisFactures("Oui");
                }}
                className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
              >
                <span 
                  className="rounded-full flex items-center justify-center transition-all bg-white"
                  style={{
                    border: enableDevisFactures === "Oui" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                    width: '20px',
                    height: '20px',
                    minWidth: '20px',
                    minHeight: '20px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {enableDevisFactures === "Oui" && (
                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                  )}
                </span>
                <span className="text-[15px] font-semibold text-black">{t("Oui")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEnableDevisFactures("Non");
                }}
                className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
              >
                <span 
                  className="rounded-full flex items-center justify-center transition-all bg-white"
                  style={{
                    border: enableDevisFactures === "Non" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                    width: '20px',
                    height: '20px',
                    minWidth: '20px',
                    minHeight: '20px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {enableDevisFactures === "Non" && (
                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                  )}
                </span>
                <span className="text-[15px] font-semibold text-black">{t("Non")}</span>
              </button>
            </div>
          </div>

          {/* DESACTIVER AIDES ET TUTORIELS OPTION */}
          <div className="space-y-2 mt-4">
            <label className="block text-[16px] font-bold text-black font-sans leading-tight">
              {t("Désactiver les aides et tutoriels.")}
            </label>
            <div className="flex items-center space-x-6 py-1 font-sans">
              <button
                type="button"
                onClick={() => {
                  setDisableHelpsAndTutorials("Oui");
                }}
                className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
              >
                <span 
                  className="rounded-full flex items-center justify-center transition-all bg-white"
                  style={{
                    border: disableHelpsAndTutorials === "Oui" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                    width: '20px',
                    height: '20px',
                    minWidth: '20px',
                    minHeight: '20px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {disableHelpsAndTutorials === "Oui" && (
                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                  )}
                </span>
                <span className="text-[15px] font-semibold text-black">{t("Oui")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDisableHelpsAndTutorials("Non");
                }}
                className="inline-flex items-center cursor-pointer gap-2 select-none justify-start text-left"
              >
                <span 
                  className="rounded-full flex items-center justify-center transition-all bg-white"
                  style={{
                    border: disableHelpsAndTutorials === "Non" ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                    width: '20px',
                    height: '20px',
                    minWidth: '20px',
                    minHeight: '20px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {disableHelpsAndTutorials === "Non" && (
                    <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                  )}
                </span>
                <span className="text-[15px] font-semibold text-black">{t("Non")}</span>
              </button>
            </div>
          </div>

          {/* CUSTOM TAB VISIBILITY ONGLETS */}
          <div className="space-y-3 mt-6">
            <label className="block text-[16px] font-bold text-black font-sans leading-tight">
              {t("Personnaliser la visibilité des onglets.")}
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                "Commandes",
                "Tournées & Missions",
                "Rapports PDF",
                "Centrale des stocks",
                "Stocks distribués",
                "Achats fournisseurs",
                "Variables",
                "CRM",
                "GED",
                "Satisfaction",
                "Temps",
                "Temps (Webapp)",
                "Localisations",
                "Localisation (Webapp)",
                "Tickets Caisse",
                "Relevé Concurrentiel",
                "Relevé Concurrentiel (Webapp)",
                "Frais (Webapp)",
                "Importer Exporter",
                "Formations",
                "Stagiaires",
                "Émargements",
                "Notifications"
              ].map((pillLabel) => {
                const isHidden = localCompany?.hiddenTabs?.includes(pillLabel);
                return (
                  <button
                    key={pillLabel}
                    type="button"
                    onClick={() => handleToggleTabVisibility(pillLabel)}
                    className="px-3.5 py-2 rounded-full text-[16px] font-semibold cursor-pointer select-none transition-all duration-200 border-0 text-white hover:brightness-110 active:scale-[0.97]"
                    style={{
                      backgroundColor: isHidden ? "#FA383D" : "#000000",
                    }}
                  >
                    {t(pillLabel)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* APPALENCE DES RAPPORTS PDF */}
          <div className="pt-6 mt-6 space-y-4">
            {renderSectionHeader(t("Apparence des rapports PDF"), false)}

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">
                  {t("Image source d’entête pour illustration.")}
                </label>
                <input
                  type="text"
                  value={localCompany.pdfHeaderImg ?? ''}
                  onChange={(e) => handleCompanyChange('pdfHeaderImg', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm"
                  placeholder={t("Url source se terminant par .png")}
                />
                <span className="block text-[16px] text-black font-sans leading-tight mt-1 cursor-default">
                  {t("Placés en haut à droite de votre logo, il peut s’agir d’icônes de labels, de certifications ou autres.")}
                </span>
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">
                  {t("Texte d’entête de page.")}
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={localCompany.pdfPageHeaderText ?? ''}
                  onChange={(e) => handleCompanyChange('pdfPageHeaderText', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm"
                  placeholder={t("Entrez un texte max 300 caractères.")}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">
                  {t("Texte de bas de page.")}
                </label>
                <input
                  type="text"
                  maxLength={1000}
                  value={localCompany.pdfPageFooterText ?? ''}
                  onChange={(e) => handleCompanyChange('pdfPageFooterText', e.target.value)}
                  className="w-full text-black placeholder-[#747474] font-sans text-sm"
                  placeholder={t("Entrez un texte max 1000 caractères.")}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[16px] font-bold text-black font-sans">
                  {t("Texte d’information dernière page.")}
                </label>
                <textarea
                  id="pdf-last-page-info-text"
                  maxLength={2500}
                  value={localCompany.pdfLastPageInfoText ?? ''}
                  onChange={(e) => handleCompanyChange('pdfLastPageInfoText', e.target.value)}
                  placeholder={t("Entrez un texte max 2500 caractères")}
                  rows={4}
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 font-sans"
                />
              </div>

              {/* PDF Custom Colors Grid */}
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[14px] font-bold text-black font-sans leading-tight">
                      {t("Couleur d'arrière plan des entêtes des sections.")}
                    </label>
                    <input
                      type="text"
                      maxLength={7}
                      value={localCompany.pdfHeaderBgColor ?? '#7c2882'}
                      onChange={(e) => handleCompanyChange('pdfHeaderBgColor', e.target.value)}
                      className="w-full text-black placeholder-[#747474] font-sans text-sm"
                      placeholder="#7c2882"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[14px] font-bold text-black font-sans leading-tight">
                      {t("Couleur de bordure des sections.")}
                    </label>
                    <input
                      type="text"
                      maxLength={7}
                      value={localCompany.pdfCardBorderColor ?? '#7d2882'}
                      onChange={(e) => handleCompanyChange('pdfCardBorderColor', e.target.value)}
                      className="w-full text-black placeholder-[#747474] font-sans text-sm"
                      placeholder="#7d2882"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[14px] font-bold text-black font-sans leading-tight">
                      {t("Couleur d'arrière plan des sections.")}
                    </label>
                    <input
                      type="text"
                      maxLength={7}
                      value={localCompany.pdfCardBgColor ?? '#fef2ff'}
                      onChange={(e) => handleCompanyChange('pdfCardBgColor', e.target.value)}
                      className="w-full text-black placeholder-[#747474] font-sans text-sm"
                      placeholder="#fef2ff"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[14px] font-bold text-black font-sans leading-tight">
                      {t("Couleur du texte des labels des champs.")}
                    </label>
                    <input
                      type="text"
                      maxLength={7}
                      value={localCompany.pdfLabelTextColor ?? '#9f71a2'}
                      onChange={(e) => handleCompanyChange('pdfLabelTextColor', e.target.value)}
                      className="w-full text-black placeholder-[#747474] font-sans text-sm"
                      placeholder="#9f71a2"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleCompanyChange('pdfHeaderBgColor', '#7c2882');
                    handleCompanyChange('pdfCardBorderColor', '#7d2882');
                    handleCompanyChange('pdfCardBgColor', '#fef2ff');
                    handleCompanyChange('pdfLabelTextColor', '#9f71a2');
                  }}
                  style={{
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    fontSize: '18px',
                    borderRadius: '13px',
                    padding: '11px 22px',
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    fontWeight: 100,
                    cursor: 'pointer',
                    border: 'none',
                    width: '100%',
                    textTransform: 'none'
                  }}
                  className="mt-2 font-sans"
                >
                  {t("Réinitialiser les couleurs")}
                </button>
              </div>
            </div>
          </div>

          {/* APPARENCE DU LOGICIEL POUR VOTRE SESSION */}
          <div className="pt-6 mt-6 space-y-4" id="settings-section-software-theme">
            {renderSectionHeader(t("Apparence du logiciel pour votre session"), false)}

            <div className="space-y-3">
              <label className="block text-[16px] font-bold text-black font-sans">
                {t("Thème du logiciel (conforme accessibilité ISO/IEC 40500).")}
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {APP_THEMES.map((theme) => {
                  const isSelected = selectedTheme === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => handleThemeSelect(theme.id)}
                      className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer select-none bg-white"
                      id={`theme-card-${theme.id}`}
                    >
                      <span 
                        className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                        style={{
                          border: isSelected ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                          width: '20px',
                          height: '20px',
                          minWidth: '20px',
                          minHeight: '20px',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        {isSelected && (
                          <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                        )}
                      </span>
                      <span
                        className="text-[16px] font-medium text-slate-900 cursor-pointer select-none font-sans"
                      >
                        {t(theme.name)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CHOIX DU FAVICON DU LOGICIEL */}
          <div className="pt-6 mt-6 space-y-4" id="settings-section-software-favicon">
            {renderSectionHeader(t("Choix du favicon du logiciel"), false)}

            <div className="space-y-3">
              <label className="block text-[16px] font-bold text-black font-sans">
                {t("Il s’agit de l’icône montré dans l’onglet de votre navigateur.")}
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {APP_FAVICONS.map((fav) => {
                  const isSelected = selectedFavicon === fav.id;
                  return (
                    <div
                      key={fav.id}
                      onClick={() => handleFaviconSelect(fav.id)}
                      className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
                      id={`favicon-card-${fav.id}`}
                    >
                      <span 
                        className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                        style={{
                          border: isSelected ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                          width: '20px',
                          height: '20px',
                          minWidth: '20px',
                          minHeight: '20px',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        {isSelected && (
                          <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                        )}
                      </span>
                      <img
                        src={fav.url}
                        alt={fav.name}
                        className="w-5 h-5 object-contain shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <span
                        className="text-[16px] font-medium text-slate-900 cursor-pointer select-none font-sans"
                      >
                        {t(fav.name)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>


          {/* SECTION 2: INTITULÉS DES EMPLACEMENTS */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 mt-4 text-left" id="settings-section-location-names">
            {renderSectionHeader(t("Intitulés des emplacements"))}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-2">
              {(['Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E', 'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J', 'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E', 'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J'] as const).map(loc => (
                <div key={loc} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                  <span className="font-semibold text-[18px] text-black min-w-[120px] font-sans" style={{ fontSize: '18px', color: '#000000' }}>
                    {t(loc)}
                  </span>
                  <div className="flex-1">
                    <input
                      type="text"
                      maxLength={15}
                      value={localLocationNames[loc] || ''}
                      onChange={(e) => {
                        setLocalLocationNames(prev => ({
                          ...prev,
                          [loc]: e.target.value
                        }));
                      }}
                      className="w-full text-black placeholder-[#a0a0a0] font-sans text-xs py-1 px-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-0 focus:border-slate-200"
                      placeholder={t("Entrez un texte")}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* SECTION 6: MEMBRES DE L'ENVIRONNEMENT */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 pb-6 mt-4 text-left" id="settings-section-members" style={{ order: 98 }}>
            {renderSectionHeader(t("Membres de l’environnement"))}

            {/* Formulaire d'ajout rapide de collaborateur */}
            <form onSubmit={handleAddMemberSubmit} className="space-y-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <label className="block text-[16px] font-bold text-black font-sans">{t("Nom et prénom")}.</label>
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => { setNewMemberName(e.target.value); setNewMemberError(null); }}
                    placeholder=""
                    className="w-full text-black text-xs font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[16px] font-bold text-black font-sans">{t("Email")}.</label>
                  <input
                    type="type"
                    value={newMemberEmail}
                    onChange={(e) => { setNewMemberEmail(e.target.value); setNewMemberError(null); }}
                    placeholder=""
                    className="w-full text-black text-xs font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[16px] font-bold text-black font-sans">{t("Rôle")}.</label>
                  <select
                    value={newMemberRole}
                    onChange={(e) => { setNewMemberRole(e.target.value); setNewMemberError(null); }}
                    className="w-full text-black font-semibold text-xs font-sans cursor-pointer"
                  >
                    <option value="Administrateur">{t("Administrateur")}</option>
                    <option value="Technicien">{t("Technicien")}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[16px] font-bold text-black font-sans">
                    {newMemberRole === 'Administrateur' ? `${t("Mot de passe")}.` : `${t("PIN d’accès")}.`}
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={newMemberPin}
                    onChange={(e) => { setNewMemberPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4)); setNewMemberError(null); }}
                    placeholder={t("Entrez un code.")}
                    className="w-full text-black text-center font-mono font-bold text-xs"
                  />
                </div>

                {newMemberRole === 'Administrateur' && (
                  <div className="space-y-1">
                    <label className="block text-[16px] font-bold text-black font-sans">{t("Métier.")}</label>
                    <select
                      value={newMemberAdminSubRole}
                      onChange={(e) => { setNewMemberAdminSubRole(e.target.value as any); setNewMemberError(null); }}
                      className="w-full text-black font-semibold text-xs font-sans cursor-pointer"
                    >
                      <option value="Administrateur">{t("Administrateur")}</option>
                      <option value="Administration">Administration</option>
                      <option value="Planification">Planification</option>
                      <option value="Logistique">Logistique</option>
                      <option value="Comptabilité">Comptabilité</option>
                      <option value="Contrôleur">{t("Contrôleur")}</option>
                      <option value="Administrateur & Contrôleur">{t("Administrateur & Contrôleur")}</option>
                      <option value="Développeur">{t("Développeur")}</option>
                    </select>
                  </div>
                )}

                {newMemberRole === 'Technicien' && (
                  <div className="space-y-1">
                    <label className="block text-[16px] font-bold text-black font-sans">{t("Emplacement")}.</label>
                    <select
                      value={newMemberLocation}
                      onChange={(e) => { setNewMemberLocation(e.target.value); setNewMemberError(null); }}
                      className="w-full text-black font-semibold text-xs font-sans cursor-pointer"
                    >
                      <option value="">{t("Sélect. un emplacement")}</option>
                      {(['Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E', 'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J', 'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E', 'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J'] as const)
                        .filter(loc => !localMembers.some(mem => mem.role === 'Technicien' && mem.locationLink === loc))
                        .map(loc => {
                          return (
                            <option key={loc} value={loc}>
                              {t(getLocationCustomName(loc))}
                            </option>
                          );
                        })}
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isAddingMember || isSaving}
                  style={{
                    ...rowActionButtonStyle,
                    width: '100%',
                    opacity: (isAddingMember || isSaving) ? 0.6 : 1,
                    cursor: (isAddingMember || isSaving) ? 'not-allowed' : 'pointer'
                  }}
                  className="w-full font-sans text-white font-normal text-[18px]"
                >
                  {isAddingMember ? t("Ajout en cours...") : isSaving ? t("Enregistrement...") : t("Nouveau membre")}
                </button>
                {newMemberError && (
                  <div className="mt-2 text-red-600 text-[16px] font-sans font-medium text-left animate-fadeIn">
                    {newMemberError}
                  </div>
                )}
              </div>
            </form>

            {/* Liste des membres - full width horizontal dividers via -mx-5 and border-t */}
            <div className="bg-white overflow-hidden mt-6 animate-fadeIn -mx-5 border-t border-slate-200" style={{ boxShadow: 'none' }}>
              <table className="w-full text-left font-sans border-collapse text-xs" style={{ borderTop: 'none', borderBottom: 'none' }}>
                <tbody className="text-slate-700 text-xs text-black">
                  {localMembers.map((m, idx) => {
                    const isSuperAdmin = m.role === 'Super-Administrateur' || m.role === 'Propriétaire / Admin' || m.role?.toLowerCase().includes('super') || m.role?.toLowerCase().includes('propriétaire');
                    const isTech = m.role === 'Technicien' || m.role === 'Maintenance Terrain' || m.role?.toLowerCase().includes('tech');
                    const isOwnSession = currentUser && m.email?.toLowerCase().trim() === currentUser.email?.toLowerCase().trim();
                    
                    const loggedInMember = currentUser ? localMembers.find(lm => lm.email?.toLowerCase().trim() === currentUser.email?.toLowerCase().trim()) : null;
                    const loggedUserRole = localStorage.getItem('defib_logged_user_role');
                    const isPrimaryTenantAdmin = loggedUserRole === 'admin' || loggedUserRole === 'megaadmin';

                    const isCurrentUserAdminOrSuperAdmin = isPrimaryTenantAdmin || (loggedInMember && (
                      loggedInMember.role === 'Administrateur' || 
                      loggedInMember.role === 'Super-Administrateur' || 
                      loggedInMember.role === 'Propriétaire / Admin' || 
                      loggedInMember.role?.toLowerCase().includes('super') || 
                      loggedInMember.role?.toLowerCase().includes('propriétaire') ||
                      loggedInMember.role?.toLowerCase().includes('admin')
                    ));
                    const isCurrentUserSuperAdmin = isPrimaryTenantAdmin || (loggedInMember && (
                      loggedInMember.role === 'Super-Administrateur' || 
                      loggedInMember.role === 'Propriétaire / Admin' || 
                      loggedInMember.role?.toLowerCase().includes('super') || 
                      loggedInMember.role?.toLowerCase().includes('propriétaire')
                    ));
                    const canEditThisMember = isOwnSession || isCurrentUserSuperAdmin || (isTech && isCurrentUserAdminOrSuperAdmin);

                    return (
                      <tr key={idx} className="group transition-all border-b border-slate-200 last:border-b-0">
                        
                        {/* Column 1: Nom & Prenom with pills beneath */}
                        <td className="px-5 py-5 font-sans align-top" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          <div className="flex flex-col gap-2 max-w-[340px] w-full">
                            {/* Supprimer button placed right above Name field for quick access and extra space */}
                            {!isSuperAdmin && canEditThisMember && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(idx)}
                                className="cursor-pointer mb-2 inline-flex items-center justify-center font-bold text-center select-none"
                                style={{
                                  backgroundColor: 'rgb(185, 28, 28)',
                                  boxShadow: 'rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset',
                                  color: '#ffffff',
                                  border: 'none',
                                  fontSize: '18px',
                                  borderRadius: '13px',
                                  padding: '11px 22px',
                                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                }}
                              >
                                {t("Supprimer le membre")}
                              </button>
                            )}
                            <input
                              type="text"
                              value={m.name}
                              onChange={(e) => handleNameChange(idx, e.target.value)}
                              placeholder=""
                              disabled={!canEditThisMember}
                              className="text-black font-semibold text-sm w-full font-sans animate-none bg-transparent disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {isSuperAdmin && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '1000px',
                                  backgroundColor: '#411046',
                                  border: 'none',
                                  color: '#ffffff',
                                  fontSize: '18px',
                                  fontWeight: '600',
                                  padding: '4px 12px',
                                  whiteSpace: 'nowrap',
                                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                  textTransform: 'none',
                                  cursor: 'default'
                                }}>{t("Super-Administrateur")}</span>
                              )}
                              {isOwnSession && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '1000px',
                                  backgroundColor: 'rgb(76 20 81)',
                                  border: 'none',
                                  color: 'rgb(255 255 255)',
                                  fontSize: '18px',
                                  fontWeight: '600',
                                  padding: '4px 10px',
                                  whiteSpace: 'nowrap',
                                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                  textTransform: 'none',
                                  cursor: 'default'
                                }}>{t("Votre session en cours")}</span>
                              )}
                              {!isTech && !isSuperAdmin && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '1000px',
                                  backgroundColor: '#411046',
                                  border: 'none',
                                  color: '#ffffff',
                                  fontSize: '18px',
                                  fontWeight: '600',
                                  padding: '4px 12px',
                                  whiteSpace: 'nowrap',
                                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                  textTransform: 'none',
                                  cursor: 'default'
                                }}>
                                  {t(m.adminSubRole || 'Administrateur')}
                                </span>
                              )}
                              {isTech && !isSuperAdmin && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '1000px',
                                  backgroundColor: '#411046',
                                  border: 'none',
                                  color: '#ffffff',
                                  fontSize: '18px',
                                  fontWeight: '600',
                                  padding: '4px 12px',
                                  whiteSpace: 'nowrap',
                                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                  textTransform: 'none',
                                  cursor: 'default'
                                }}>
                                  {t("Technicien")}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Réglages with Email input, Role and PIN select */}
                        <td className="px-5 py-5 font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          <div className="flex flex-col gap-3 max-w-[420px] w-full">
                            
                            {/* Email */}
                            <div className="space-y-1">
                              <span className="text-[16px] font-bold text-black block font-sans" style={{ fontSize: '16px', textTransform: 'none', color: '#000000' }}>{t("Email")}.</span>
                              <input
                                type="email"
                                value={m.email}
                                onChange={(e) => handleEmailChange(idx, e.target.value)}
                                placeholder=""
                                disabled={!canEditThisMember}
                                className="w-full text-black text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                              />
                            </div>

                            {/* Rôle & PIN side-by-side */}
                            {!isSuperAdmin && (
                              <div className="grid grid-cols-2 gap-3 items-end w-full">
                                <div className="space-y-1">
                                  <span className="text-[16px] font-bold text-black block font-sans" style={{ fontSize: '16px', textTransform: 'none', color: '#000000' }}>{t("Rôle")}.</span>
                                  <select
                                    value={isTech ? 'Technicien' : 'Administrateur'}
                                    disabled={!canEditThisMember || isTech}
                                    onChange={(e) => handleRoleChange(idx, e.target.value)}
                                    className="w-full font-sans text-xs bg-white text-black cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{ height: '36px', padding: '6px 10px' }}
                                  >
                                    <option value="Administrateur">{t("Administrateur")}</option>
                                    <option value="Technicien">{t("Technicien")}</option>
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <span className="text-[16px] font-bold text-black block font-sans text-left" style={{ fontSize: '16px', textTransform: 'none', color: '#000000' }}>
                                    {isTech ? `${t("PIN d’accès")}.` : `${t("Mot de passe")}.`}
                                  </span>
                                  <input
                                    type="text"
                                    maxLength={4}
                                    value={m.pin || ''}
                                    disabled={!canEditThisMember}
                                    onChange={(e) => handlePinChange(idx, e.target.value)}
                                    placeholder={t("Entrez un code.")}
                                    className="w-full text-left font-mono font-bold text-xs bg-white text-black disabled:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                                    style={{ height: '36px', padding: '6px 10px' }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Emplacement attribué (exclusive dropdown for Technicians) */}
                            {isTech && !isSuperAdmin && (
                              <div className="space-y-1 mt-1 w-full text-left">
                                <span className="text-[16px] font-bold text-black block font-sans" style={{ fontSize: '16px', textTransform: 'none', color: '#000000' }}>
                                  {t("Emplacement attribué *")}
                                </span>
                                <select
                                  value={m.locationLink || ''}
                                  disabled={!canEditThisMember}
                                  onChange={(e) => handleLocationChange(idx, e.target.value)}
                                  className="w-full font-sans text-xs bg-white text-black cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                  style={{ height: '36px', padding: '6px 10px' }}
                                >
                                  <option value="">{t("Sélect. un emplacement")}</option>
                                  {(['Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E', 'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J', 'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E', 'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J'] as const)
                                    .filter(loc => {
                                      if (loc === m.locationLink) return true;
                                      const isTakenByOther = localMembers.some(
                                        (mem, otherIdx) => otherIdx !== idx && mem.role === 'Technicien' && mem.locationLink === loc
                                      );
                                      return !isTakenByOther;
                                    })
                                    .map(loc => {
                                      return (
                                        <option key={loc} value={loc}>
                                          {t(getLocationCustomName(loc))}
                                        </option>
                                      );
                                    })}
                                </select>
                              </div>
                            )}

                             {/* Starting Address */}
                             {isTech && (
                               <div className="space-y-3 mt-3 w-full text-left">

                                 {/* Numéro et voie */}
                                 <div className="space-y-1">
                                   <label className="block text-[10px] font-bold text-slate-400 uppercase">{t("Numéro et voie *")}</label>
                                   <input
                                     type="text"
                                     value={m.startAddressStreet || ''}
                                     disabled={!canEditThisMember}
                                     onChange={(e) => {
                                       const street = e.target.value;
                                       const updated = [...localMembers];
                                       const old = updated[idx];
                                       const composed = `${street}, ${old.startAddressZip || ''} ${old.startAddressCity || ''}, ${old.startAddressCountry || 'France'}`.trim();
                                       updated[idx] = { 
                                         ...old, 
                                         startAddressStreet: street,
                                         startAddress: composed
                                       };
                                       setLocalMembers(updated);
                                       triggerMemberGeocoding(idx, street, old.startAddressZip || '', old.startAddressCity || '', old.startAddressCountry || 'France');
                                     }}
                                     placeholder="Ex: 1 Rue de Paris"
                                     className="w-full text-black text-xs disabled:opacity-60 disabled:cursor-not-allowed bg-white border border-slate-200"
                                     style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                                   />
                                 </div>

                                 <div className="grid grid-cols-2 gap-2">
                                   {/* Ville */}
                                   <div className="space-y-1">
                                     <label className="block text-[10px] font-bold text-slate-400 uppercase">{t("Ville *")}</label>
                                     <input
                                       type="text"
                                       value={m.startAddressCity || ''}
                                       disabled={!canEditThisMember}
                                       onChange={(e) => {
                                         const city = e.target.value;
                                         const updated = [...localMembers];
                                         const old = updated[idx];
                                         const composed = `${old.startAddressStreet || ''}, ${old.startAddressZip || ''} ${city}, ${old.startAddressCountry || 'France'}`.trim();
                                         updated[idx] = { 
                                           ...old, 
                                           startAddressCity: city,
                                           startAddress: composed
                                         };
                                         setLocalMembers(updated);
                                         triggerMemberGeocoding(idx, old.startAddressStreet || '', old.startAddressZip || '', city, old.startAddressCountry || 'France');
                                       }}
                                       placeholder="Ex: Paris"
                                       className="w-full text-black text-xs disabled:opacity-60 disabled:cursor-not-allowed bg-white border border-slate-200"
                                       style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                                     />
                                   </div>

                                   {/* Code postal */}
                                   <div className="space-y-1">
                                     <label className="block text-[10px] font-bold text-slate-400 uppercase">{t("Code postal *")}</label>
                                     <input
                                       type="text"
                                       value={m.startAddressZip || ''}
                                       disabled={!canEditThisMember}
                                       onChange={(e) => {
                                         const zip = e.target.value;
                                         const updated = [...localMembers];
                                         const old = updated[idx];
                                         const composed = `${old.startAddressStreet || ''}, ${zip} ${old.startAddressCity || ''}, ${old.startAddressCountry || 'France'}`.trim();
                                         updated[idx] = { 
                                           ...old, 
                                           startAddressZip: zip,
                                           startAddress: composed
                                         };
                                         setLocalMembers(updated);
                                         triggerMemberGeocoding(idx, old.startAddressStreet || '', zip, old.startAddressCity || '', old.startAddressCountry || 'France');
                                       }}
                                       placeholder="Ex: 75001"
                                       className="w-full text-black text-xs disabled:opacity-60 disabled:cursor-not-allowed bg-white border border-slate-200 font-mono"
                                       style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                                     />
                                   </div>
                                 </div>

                                 <div className="grid grid-cols-2 gap-2">
                                   {/* Région */}
                                   <div className="space-y-1">
                                     <label className="block text-[10px] font-bold text-slate-400 uppercase">{t("Région *")}</label>
                                     <select
                                       value={m.startAddressRegion || ''}
                                       disabled={!canEditThisMember}
                                       onChange={(e) => {
                                         const region = e.target.value;
                                         const updated = [...localMembers];
                                         updated[idx] = { ...updated[idx], startAddressRegion: region };
                                         setLocalMembers(updated);
                                       }}
                                       className="w-full font-sans text-xs bg-white text-black cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border border-slate-200"
                                       style={{ height: '36px', padding: '6px 10px' }}
                                     >
                                       <option value="">{t("Choisir une région")}</option>
                                       {getRegionsForCountry(m.startAddressCountry || 'France').map(r => (
                                         <option key={r} value={r}>{r}</option>
                                       ))}
                                     </select>
                                   </div>

                                   {/* Pays */}
                                   <div className="space-y-1">
                                     <label className="block text-[10px] font-bold text-slate-400 uppercase">{t("Pays *")}</label>
                                     <select
                                       value={m.startAddressCountry || 'France'}
                                       disabled={!canEditThisMember}
                                       onChange={(e) => {
                                         const country = e.target.value;
                                         const updated = [...localMembers];
                                         const old = updated[idx];
                                         const composed = `${old.startAddressStreet || ''}, ${old.startAddressZip || ''} ${old.startAddressCity || ''}, ${country}`.trim();
                                         updated[idx] = { 
                                           ...old, 
                                           startAddressCountry: country,
                                           startAddress: composed
                                         };
                                         setLocalMembers(updated);
                                         triggerMemberGeocoding(idx, old.startAddressStreet || '', old.startAddressZip || '', old.startAddressCity || '', country);
                                       }}
                                       className="w-full font-sans text-xs bg-white text-black cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border border-slate-200"
                                       style={{ height: '36px', padding: '6px 10px' }}
                                     >
                                       {["France", "Espagne", "Portugal", "Suisse", "Luxembourg", "Belgique", "Allemagne", "Pays-Bas", "Royaume-Uni", "Irlande", "Suède", "Pologne", "Tchéquie", "Autriche"].map((c) => (
                                         <option key={c} value={c}>{c}</option>
                                       ))}
                                     </select>
                                   </div>
                                 </div>

                                 <div className="grid grid-cols-2 gap-2">
                                   {/* Latitude */}
                                   <div className="space-y-1">
                                     <label className="block text-[10px] font-bold text-slate-400 uppercase">{t("Latitude *")}</label>
                                     <input
                                       type="number"
                                       step="any"
                                       value={m.startAddressLat !== undefined && m.startAddressLat !== null && String(m.startAddressLat).toLowerCase() !== 'null' && String(m.startAddressLat).toLowerCase() !== 'nan' && !isNaN(Number(m.startAddressLat)) ? m.startAddressLat : ''}
                                       disabled={!canEditThisMember}
                                       onChange={(e) => {
                                         const raw = e.target.value.trim();
                                         const lat = (raw === '' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'nan') ? undefined : parseFloat(raw);
                                         const updated = [...localMembers];
                                         updated[idx] = { ...updated[idx], startAddressLat: (lat !== undefined && !isNaN(lat)) ? lat : undefined };
                                         setLocalMembers(updated);
                                       }}
                                       placeholder="Ex: 48.8566"
                                       className="w-full text-black text-xs disabled:opacity-60 disabled:cursor-not-allowed bg-white border border-slate-200"
                                       style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                                     />
                                   </div>

                                   {/* Longitude */}
                                   <div className="space-y-1">
                                     <label className="block text-[10px] font-bold text-slate-400 uppercase">{t("Longitude *")}</label>
                                     <input
                                       type="number"
                                       step="any"
                                       value={m.startAddressLng !== undefined && m.startAddressLng !== null && String(m.startAddressLng).toLowerCase() !== 'null' && String(m.startAddressLng).toLowerCase() !== 'nan' && !isNaN(Number(m.startAddressLng)) ? m.startAddressLng : ''}
                                       disabled={!canEditThisMember}
                                       onChange={(e) => {
                                         const raw = e.target.value.trim();
                                         const lng = (raw === '' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'nan') ? undefined : parseFloat(raw);
                                         const updated = [...localMembers];
                                         updated[idx] = { ...updated[idx], startAddressLng: (lng !== undefined && !isNaN(lng)) ? lng : undefined };
                                         setLocalMembers(updated);
                                       }}
                                       placeholder="Ex: 2.3522"
                                       className="w-full text-black text-xs disabled:opacity-60 disabled:cursor-not-allowed bg-white border border-slate-200"
                                       style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                                     />
                                   </div>
                                 </div>
                               </div>
                             )}

                            {/* Optimization Preference */}
                            {isTech && (
                              <div className="space-y-1 mt-1 w-full text-left">
                                <span className="text-[16px] font-bold text-black block font-sans" style={{ fontSize: '16px', textTransform: 'none', color: '#000000' }}>
                                  {t("Préférence d'optimisation")}
                                </span>
                                <select
                                  value={m.optimizationPreference || 'proche'}
                                  disabled={!canEditThisMember}
                                  onChange={(e) => {
                                    const updated = [...localMembers];
                                    updated[idx] = { ...updated[idx], optimizationPreference: e.target.value as 'loin' | 'proche' };
                                    setLocalMembers(updated);
                                  }}
                                  className="w-full font-sans text-xs bg-white text-black cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                  style={{ height: '36px', padding: '6px 10px' }}
                                >
                                  <option value="proche">{t("Se rendre d'abord au plus proche")}</option>
                                  <option value="loin">{t("Se rendre d'abord au plus éloigné")}</option>
                                </select>
                              </div>
                            )}

                            {/* Compétences (Checklist for Technicians) */}
                            {isTech && (
                              <div 
                                className="space-y-2 mt-3 w-full text-left bg-white p-3.5"
                                style={{ border: '1px solid #d5D5D5', borderRadius: '13px' }}
                              >
                                <div className="flex flex-col gap-2">
                                  {[
                                    "Formation AMD",
                                    "Habilitation Électrique",
                                    "Pose de coffret",
                                    "Installation et maintenance défibrillateur",
                                    "Installation et maintenance extincteur",
                                    "Installation et maintenance BIMP",
                                    "Installation et maintenance signalisation",
                                    "Installation et maintenance éclairage de secours",
                                    "Installation et maintenance purificateur d'air"
                                  ].map((comp) => {
                                    const hasComp = (m.competences || []).includes(comp);
                                    return (
                                      <div 
                                        key={comp} 
                                        onClick={() => {
                                          if (canEditThisMember) {
                                            handleCompetenceToggle(idx, comp);
                                          }
                                        }}
                                        className={`flex items-center gap-2.5 cursor-pointer select-none py-1 ${!canEditThisMember ? 'opacity-60 cursor-not-allowed' : ''}`}
                                      >
                                        <span 
                                          className="rounded-full flex items-center justify-center transition-all bg-white"
                                          style={{
                                            border: hasComp ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                                            width: '20px',
                                            height: '20px',
                                            minWidth: '20px',
                                            minHeight: '20px',
                                            backgroundColor: '#ffffff'
                                          }}
                                        >
                                          {hasComp && (
                                            <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                                          )}
                                        </span>
                                        <span className="font-medium leading-tight select-none" style={{ fontSize: '16px', color: '#000000' }}>{t(comp)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Semaine typique / Horaires d'ouvertures (Checklist for Technicians) */}
                            {isTech && (
                              <div 
                                className="space-y-3 mt-3 w-full text-left bg-white p-3.5"
                                style={{ border: '1px solid #d5D5D5', borderRadius: '13px' }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold block font-sans text-black" style={{ textTransform: 'none', fontSize: '16px' }}>
                                    {t("Semaine typique")}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={!canEditThisMember}
                                    onClick={() => handleAddMemberSchedule(idx)}
                                    style={{
                                      backgroundColor: '#000000',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontSize: '18px',
                                      borderRadius: '13px',
                                      padding: '10px 20px',
                                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                      cursor: 'pointer'
                                    }}
                                    className="font-bold transition-all disabled:opacity-50"
                                  >
                                    {t("Nouveau")}
                                  </button>
                                </div>

                                {m.semaineTypique && m.semaineTypique.length > 0 && (
                                  (m.semaineTypique || []).map((sch, schIdx) => (
                                    <div key={schIdx} style={{ borderRadius: '13px', border: '1px solid #d5D5D5' }} className="p-3 bg-white relative space-y-3">
                                      <button
                                        type="button"
                                        disabled={!canEditThisMember}
                                        onClick={() => handleRemoveMemberSchedule(idx, schIdx)}
                                        style={{
                                          borderRadius: '13px',
                                          fontSize: '16px',
                                          backgroundColor: 'rgb(185, 28, 28)',
                                          boxShadow: 'rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset',
                                          color: '#ffffff'
                                        }}
                                        className="absolute top-2 right-2 px-3 py-1 font-bold hover:bg-[#7f1d1d] active:scale-95 transition-all cursor-pointer font-sans disabled:opacity-50"
                                      >
                                        {t("Supprimer")}
                                      </button>

                                      {/* Toggles - Midi closing & Ouvert pour missions */}
                                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 select-none pt-4">
                                        <button
                                          type="button"
                                          disabled={!canEditThisMember}
                                          onClick={() => handleUpdateMemberScheduleField(idx, schIdx, 'fermetureMidi', !sch.fermetureMidi)}
                                          className="inline-flex items-center gap-2 cursor-pointer select-none disabled:opacity-50"
                                        >
                                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white ${sch.fermetureMidi ? 'border-[#fe4eba]' : 'border-slate-300'}`}>
                                            {sch.fermetureMidi && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                                          </span>
                                          <span className="font-semibold text-black font-sans" style={{ fontSize: '16px' }}>
                                            {t("Fermeture le midi (4 plages)")}
                                          </span>
                                        </button>

                                        <button
                                          type="button"
                                          disabled={!canEditThisMember}
                                          onClick={() => handleUpdateMemberScheduleField(idx, schIdx, 'openForMissions', sch.openForMissions === undefined ? false : !sch.openForMissions)}
                                          className="inline-flex items-center gap-2 cursor-pointer select-none disabled:opacity-50"
                                        >
                                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white ${(sch.openForMissions ?? true) ? 'border-[#3b82f6]' : 'border-slate-300'}`}>
                                            {(sch.openForMissions ?? true) && <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />}
                                          </span>
                                          <span className="font-semibold text-black font-sans" style={{ fontSize: '16px' }}>
                                            {t("Ouvert pour missions.")}
                                          </span>
                                        </button>
                                      </div>

                                      {/* Time Inputs */}
                                      <div className="grid grid-cols-2 gap-2">
                                        {sch.fermetureMidi ? (
                                          <>
                                            <div>
                                              <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Deb. Matin")}</label>
                                              <input
                                                type="time"
                                                value={sch.openMorning || '09:00'}
                                                disabled={!canEditThisMember}
                                                onChange={(e) => handleUpdateMemberScheduleField(idx, schIdx, 'openMorning', e.target.value)}
                                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Fin. Matin")}</label>
                                              <input
                                                type="time"
                                                value={sch.closeMorning || '12:00'}
                                                disabled={!canEditThisMember}
                                                onChange={(e) => handleUpdateMemberScheduleField(idx, schIdx, 'closeMorning', e.target.value)}
                                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Deb. Apr-M")}</label>
                                              <input
                                                type="time"
                                                value={sch.openAfternoon || '14:00'}
                                                disabled={!canEditThisMember}
                                                onChange={(e) => handleUpdateMemberScheduleField(idx, schIdx, 'openAfternoon', e.target.value)}
                                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Fin. Apr-M")}</label>
                                              <input
                                                type="time"
                                                value={sch.closeAfternoon || '18:00'}
                                                disabled={!canEditThisMember}
                                                onChange={(e) => handleUpdateMemberScheduleField(idx, schIdx, 'closeAfternoon', e.target.value)}
                                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                              />
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div>
                                              <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Début")}</label>
                                              <input
                                                type="time"
                                                value={sch.openContinuous || '09:00'}
                                                disabled={!canEditThisMember}
                                                onChange={(e) => handleUpdateMemberScheduleField(idx, schIdx, 'openContinuous', e.target.value)}
                                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Fin")}</label>
                                              <input
                                                type="time"
                                                value={sch.closeContinuous || '17:00'}
                                                disabled={!canEditThisMember}
                                                onChange={(e) => handleUpdateMemberScheduleField(idx, schIdx, 'closeContinuous', e.target.value)}
                                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                              />
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      {/* Day checkboxes (Lundi to Dimanche) */}
                                      <div className="space-y-1">
                                        <span className="block font-bold text-black font-sans" style={{ fontSize: '16px' }}>{t("Jours concernés.")}</span>
                                        <div className="flex flex-wrap gap-1">
                                          {[
                                            { key: 'Lundi', label: 'Lun' },
                                            { key: 'Mardi', label: 'Mar' },
                                            { key: 'Mercredi', label: 'Mer' },
                                            { key: 'Jeudi', label: 'Jeu' },
                                            { key: 'Vendredi', label: 'Ven' },
                                            { key: 'Samedi', label: 'Sam' },
                                            { key: 'Dimanche', label: 'Dim' }
                                          ].map((dayObj) => {
                                            const isChecked = sch.days.includes(dayObj.key);
                                            const isDayTakenElsewhere = (m.semaineTypique || []).some((s, i) => i !== schIdx && s.days.includes(dayObj.key));
                                            return (
                                              <button
                                                key={dayObj.key}
                                                type="button"
                                                disabled={isDayTakenElsewhere || !canEditThisMember}
                                                onClick={() => handleToggleMemberScheduleDay(idx, schIdx, dayObj.key)}
                                                style={{ 
                                                  borderRadius: '100px', 
                                                  fontSize: '16px',
                                                  borderColor: isChecked ? '#000000' : isDayTakenElsewhere ? '#e2e8f0' : '#d7d7d7' 
                                                }}
                                                className={`px-4 py-1.5 font-semibold border transition-all select-none font-sans ${
                                                  isChecked
                                                    ? 'bg-black text-white shadow-sm cursor-pointer'
                                                    : isDayTakenElsewhere
                                                      ? 'bg-slate-100 text-slate-400 opacity-40 cursor-not-allowed'
                                                      : 'bg-white text-black cursor-pointer'
                                                }`}
                                              >
                                                {t(dayObj.label)}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      {/* Commentaire court */}
                                      <div>
                                        <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Commentaire court")}</label>
                                        <input
                                          type="text"
                                          placeholder={t("Ex: Temps de travail, Inventaire, ...")}
                                          value={sch.commentaire || ''}
                                          disabled={!canEditThisMember}
                                          onChange={(e) => handleUpdateMemberScheduleField(idx, schIdx, 'commentaire', e.target.value)}
                                          className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                        />
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}

                            {/* Section Absences for Technicians */}
                            {isTech && (
                              <div 
                                className="space-y-3 mt-3 w-full text-left bg-white p-3.5 animate-none"
                                style={{ border: '1px solid #d5D5D5', borderRadius: '13px' }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold block font-sans text-black" style={{ textTransform: 'none', fontSize: '16px' }}>
                                    {t("Périodes d'indisponibilité")}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={!canEditThisMember}
                                    onClick={() => handleAddMemberAbsence(idx)}
                                    style={{
                                      backgroundColor: '#000000',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontSize: '18px',
                                      borderRadius: '13px',
                                      padding: '10px 20px',
                                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                      cursor: 'pointer'
                                    }}
                                    className="font-bold transition-all disabled:opacity-50"
                                  >
                                    {t("Nouveau")}
                                  </button>
                                </div>

                                {m.absences && m.absences.length > 0 && (
                                  (m.absences || []).map((abs, absIdx) => (
                                    <div key={absIdx} style={{ borderRadius: '13px', border: '1px solid #d5D5D5' }} className="p-3 bg-white relative space-y-2 pt-6">
                                      <button
                                        type="button"
                                        disabled={!canEditThisMember}
                                        onClick={() => handleRemoveMemberAbsence(idx, absIdx)}
                                        style={{
                                          borderRadius: '13px',
                                          fontSize: '16px',
                                          backgroundColor: 'rgb(185, 28, 28)',
                                          boxShadow: 'rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset',
                                          color: '#ffffff'
                                        }}
                                        className="absolute top-2 right-2 px-3 py-1 font-bold hover:bg-[#7f1d1d] active:scale-95 transition-all cursor-pointer font-sans disabled:opacity-50"
                                      >
                                        {t("Supprimer")}
                                      </button>

                                      <div className="grid grid-cols-2 gap-2 pt-1">
                                        <div>
                                          <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Date début")}</label>
                                          <input
                                            type="date"
                                            value={abs.startDate}
                                            disabled={!canEditThisMember}
                                            onChange={(e) => handleUpdateMemberAbsenceField(idx, absIdx, 'startDate', e.target.value)}
                                            className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Date fin")}</label>
                                          <input
                                            type="date"
                                            value={abs.endDate}
                                            min={abs.startDate}
                                            disabled={!canEditThisMember}
                                            onChange={(e) => handleUpdateMemberAbsenceField(idx, absIdx, 'endDate', e.target.value)}
                                            className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                          />
                                        </div>
                                      </div>

                                      <div>
                                        <label className="block text-[9px] font-bold text-slate-400 uppercase">{t("Commentaire court")}</label>
                                        <input
                                          type="text"
                                          placeholder={t("Ex: Congés annuels, Formation...")}
                                          value={abs.commentaire}
                                          disabled={!canEditThisMember}
                                          onChange={(e) => handleUpdateMemberAbsenceField(idx, absIdx, 'commentaire', e.target.value)}
                                          className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 bg-white"
                                        />
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}

                            {/* Type de rôle (sub-role select for Administrators) */}
                            {!isTech && !isSuperAdmin && (
                              <div className="space-y-1 mt-1 w-full text-left">
                                <span className="text-[16px] font-bold text-black block font-sans" style={{ fontSize: '16px', textTransform: 'none', color: '#000000' }}>
                                  {t("Type de rôle *")}
                                </span>
                                <select
                                  value={m.adminSubRole || 'Administrateur'}
                                  disabled={!canEditThisMember}
                                  onChange={(e) => handleAdminSubRoleChange(idx, e.target.value as any)}
                                  className="w-full font-sans text-xs bg-white text-black cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                  style={{ height: '36px', padding: '6px 10px' }}
                                >
                                  <option value="Administrateur">{t("Administrateur")}</option>
                                  <option value="Administration">{t("Administration")}</option>
                                  <option value="Planification">{t("Planification")}</option>
                                  <option value="Logistique">{t("Logistique")}</option>
                                  <option value="Comptabilité">{t("Comptabilité")}</option>
                                  <option value="Contrôleur">{t("Contrôleur")}</option>
                                  <option value="Administrateur & Contrôleur">{t("Administrateur & Contrôleur")}</option>
                                  <option value="Développeur">{t("Développeur")}</option>
                                </select>
                              </div>
                            )}

                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION: COMMUNICATION PORTAIL CLIENT */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 pb-6 mt-4 text-left" id="settings-section-communication-portail" style={{ order: 99 }}>
            {renderSectionHeader(t("Communication portail client"))}

            <div className="space-y-2">
              <label htmlFor="settings-communication-portail" className="block text-[14px] font-bold text-black font-sans">
                {t("Message à afficher.")}
              </label>
              <textarea
                id="settings-communication-portail"
                value={communicationPortailClient}
                onChange={(e) => setCommunicationPortailClient(e.target.value)}
                placeholder={t("Entrez le message d’information pour les clients...")}
                rows={4}
                className="w-full p-3 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 font-sans"
              />
            </div>
          </div>

          {/* SECTION 3: CONNECTIONS */}
          <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white animate-fadeIn" id="settings-section-connectors">
            <div className="flex items-center justify-between w-full mb-3 select-none bg-transparent">
              <span 
                className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                style={{
                  backgroundColor: 'oklch(0.44 0.16 324.65)',
                  borderRadius: '1000px',
                  cursor: 'default',
                  fontWeight: 100,
                  textTransform: 'none',
                }}
              >
                Connecteurs
              </span>
              <button
                type="button"
                disabled={connectorsSaveStatus === 'saving'}
                onClick={handleSaveConnectors}
                style={{
                  backgroundColor: 'rgb(53, 86, 236)',
                  color: '#ffffff',
                  boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
                  borderRadius: '0.75rem',
                  fontSize: '18px',
                  padding: '11px 22px',
                  fontWeight: '100',
                  transition: 'all 0s ease-in-out',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  cursor: connectorsSaveStatus === 'saving' ? 'not-allowed' : 'pointer',
                  opacity: connectorsSaveStatus === 'saving' ? 0.6 : 1,
                  border: 'none',
                  fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                }}
                className="transition-all"
              >
                {connectorsSaveStatus === 'saving' ? t("Enregistrement...") : t("Enregistrer")}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* DEROESCH DATA */}
              <div style={{ border: '1px solid rgb(229, 229, 229)', borderRadius: '13px', backgroundColor: 'rgb(245, 245, 245)' }} className="p-4 space-y-3 flex flex-col justify-between md:col-span-2">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div>
                        <h5 className="font-bold text-black" style={{ fontSize: '18px', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>DEROESCH hébergement datacenter & redondance (Anglet, France)</h5>
                        <div className="select-none font-sans flex items-center mt-1">
                          <span
                            style={{
                              backgroundColor: '#fe4eba',
                              color: '#ffffff',
                              fontSize: '16px',
                              borderRadius: '100px',
                              padding: '2px 10px',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            }}
                            className="font-bold select-none"
                          >
                            {t("Activé")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-not-allowed select-none" style={{ cursor: 'not-allowed' }}>
                        <input
                          type="checkbox"
                          checked={true}
                          disabled
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#fe4eba] rounded-full cursor-not-allowed peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all" style={{ cursor: 'not-allowed' }}></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* API DEFIBEO */}
              <div style={{ border: '1px solid rgb(229, 229, 229)', borderRadius: '13px', backgroundColor: 'rgb(245, 245, 245)' }} className="p-4 space-y-3 flex flex-col justify-between md:col-span-2">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div>
                        <h5 className="font-bold text-black" style={{ fontSize: '18px', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>API Defibeo</h5>
                        <div className="select-none font-sans flex items-center mt-1">
                          <span
                            style={{
                              backgroundColor: apiDefibeoActive ? '#fe4eba' : 'rgb(57, 169, 143)',
                              boxShadow: 'rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset',
                              color: '#ffffff',
                              fontSize: '16px',
                              borderRadius: '100px',
                              padding: '2px 10px',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            }}
                            className="font-bold select-none"
                          >
                            {apiDefibeoActive ? t("Activé") : t("Disponible")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer select-none" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={apiDefibeoActive}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setApiDefibeoActive(isChecked);
                            if (isChecked && (!apiDefibeoApiKey || !apiDefibeoSecretKey)) {
                              generateApiDefibeoKeys();
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#dbdbdb] rounded-full cursor-pointer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#dbdbdb] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#fe4eba]" style={{ cursor: 'pointer' }}></div>
                      </label>
                    </div>
                  </div>

                  {apiDefibeoActive && (
                    <div className="mt-4 space-y-4 animate-slideUp">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Environment ID */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase">ID Environnement</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={envIdDisplay}
                              readOnly
                              disabled
                              className="w-full text-black font-mono text-xs bg-slate-100 p-2 rounded-lg border border-slate-300"
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard(envIdDisplay, 'envId')}
                              style={{ backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(255, 255, 255)', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '13px', padding: '10px 20px', cursor: 'pointer' }}
                              className="whitespace-nowrap transition-opacity hover:opacity-80"
                            >
                              {apiDefibeoCopied === 'envId' ? 'Copié !' : 'Copier'}
                            </button>
                          </div>
                        </div>

                        {/* Base URL */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase">URL Endpoint de base</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value="https://consoledefibeo.deroesch.com/v1"
                              readOnly
                              disabled
                              className="w-full text-black font-mono text-xs bg-slate-100 p-2 rounded-lg border border-slate-300"
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard('https://consoledefibeo.deroesch.com/v1', 'endpoint')}
                              style={{ backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(255, 255, 255)', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '13px', padding: '10px 20px', cursor: 'pointer' }}
                              className="whitespace-nowrap transition-opacity hover:opacity-80"
                            >
                              {apiDefibeoCopied === 'endpoint' ? 'Copié !' : 'Copier'}
                            </button>
                          </div>
                        </div>

                        {/* API Key */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase">Clé d'accès (API Key)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={apiDefibeoApiKey}
                              onChange={(e) => setApiDefibeoApiKey(e.target.value)}
                              className="w-full text-black font-mono text-xs bg-white p-2 rounded-lg border border-slate-300"
                              placeholder="dfb_live_..."
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard(apiDefibeoApiKey, 'apiKey')}
                              style={{ backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(255, 255, 255)', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '13px', padding: '10px 20px', cursor: 'pointer' }}
                              className="whitespace-nowrap transition-opacity hover:opacity-80"
                            >
                              {apiDefibeoCopied === 'apiKey' ? 'Copié !' : 'Copier'}
                            </button>
                          </div>
                        </div>

                        {/* Secret Key */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase">Clé secrète (Secret Token)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={apiDefibeoSecretKey}
                              onChange={(e) => setApiDefibeoSecretKey(e.target.value)}
                              className="w-full text-black font-mono text-xs bg-white p-2 rounded-lg border border-slate-300"
                              placeholder="dfb_sec_..."
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard(apiDefibeoSecretKey, 'secretKey')}
                              style={{ backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(255, 255, 255)', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '13px', padding: '10px 20px', cursor: 'pointer' }}
                              className="whitespace-nowrap transition-opacity hover:opacity-80"
                            >
                              {apiDefibeoCopied === 'secretKey' ? 'Copié !' : 'Copier'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <button
                          type="button"
                          onClick={generateApiDefibeoKeys}
                          style={{
                            color: 'rgb(255, 255, 255)',
                            boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(97, 28, 104) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                            background: 'rgb(96, 28, 104)',
                            borderRadius: '13px',
                            padding: '9px',
                            fontSize: '18px',
                            fontWeight: '100',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            border: 'none',
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'center',
                          }}
                          className="transition-opacity hover:opacity-90"
                        >
                          Générer de nouvelles clés
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsApiDocOpen(true)}
                          style={{
                            color: 'rgb(255, 255, 255)',
                            boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(97, 28, 104) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                            background: 'rgb(96, 28, 104)',
                            borderRadius: '13px',
                            padding: '9px',
                            fontSize: '18px',
                            fontWeight: '100',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            border: 'none',
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'center',
                          }}
                          className="transition-opacity hover:opacity-90"
                        >
                          Consulter la documentation
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* DROPBOX */}
              <div style={{ border: '1px solid rgb(229, 229, 229)', borderRadius: '13px', backgroundColor: 'rgb(245, 245, 245)' }} className="p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div>
                        <h5 className="font-bold text-black" style={{ fontSize: '18px', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Dropbox</h5>
                        <div className="select-none font-sans flex items-center mt-1">
                          <span
                            style={{
                              backgroundColor: dropboxActive ? '#fe4eba' : 'rgb(57, 169, 143)',
                              boxShadow: 'rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset',
                              color: '#ffffff',
                              fontSize: '16px',
                              borderRadius: '100px',
                              padding: '2px 10px',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            }}
                            className="font-bold select-none"
                          >
                            {dropboxActive ? t("Activé") : t("Disponible")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer select-none" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={dropboxActive}
                          onChange={(e) => {
                            setDropboxActive(e.target.checked);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#dbdbdb] rounded-full cursor-pointer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#dbdbdb] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#fe4eba]" style={{ cursor: 'pointer' }}></div>
                      </label>
                    </div>
                  </div>

                   {dropboxActive && (
                    <div className="mt-4 space-y-3 animate-slideUp">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">{t("App Key")}</label>
                        <input
                          type="text"
                          value={dropboxAppKey}
                          onChange={(e) => {
                            setDropboxAppKey(e.target.value);
                          }}
                          className="w-full text-black placeholder-[#a8a8a8] font-sans text-xs bg-white"
                          placeholder={t("Entrez l'App Key.")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">{t("App Secret Key")}</label>
                        <input
                          type="text"
                          value={dropboxAppSecret}
                          onChange={(e) => {
                            setDropboxAppSecret(e.target.value);
                          }}
                          className="w-full text-black placeholder-[#a8a8a8] font-sans text-xs bg-white"
                          placeholder={t("Entrez l'App Secret Key.")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">{t("Access Token")}</label>
                        <input
                          type="text"
                          value={dropboxAccessToken}
                          onChange={(e) => {
                            setDropboxAccessToken(e.target.value);
                          }}
                          className="w-full text-black placeholder-[#a8a8a8] font-sans text-xs bg-white"
                          placeholder={t("Entrez l'Access Token.")}
                        />
                      </div>
                      {dropboxError && (
                        <div className="space-y-2 mt-2">
                          <div className="text-red-600 font-sans font-light text-sm text-left">
                            {dropboxError}
                          </div>
                          {(dropboxError.includes("Autorisation insuffisante") || dropboxError.includes("401") || dropboxError.includes("expiré")) && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2">
                              <p className="font-bold text-red-900">💡 Guide de configuration & génération de Token Dropbox :</p>
                              <ol className="list-decimal list-inside space-y-1 text-[11px] text-red-700">
                                <li>Connectez-vous sur la <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-red-900">Console Dropbox Developer</a>.</li>
                                <li>Cliquez sur votre application liée au projet (ou créez-en une de type "Scoped App").</li>
                                <li>Accédez à l'onglet <strong className="font-bold">Permissions</strong> dans le menu supérieur.</li>
                                <li>Sous la section <strong className="font-bold">Files and folders</strong>, cochez la case <strong className="font-bold">files.content.write</strong> (ainsi que <strong className="font-bold">files.content.read</strong>).</li>
                                <li>Faites défiler vers le bas et cliquez sur le bouton <strong className="font-bold">Submit</strong> pour valider les modifications de permissions.</li>
                                <li>Revenez à l'onglet <strong className="font-bold">Settings</strong>, localisez la section <strong className="font-bold">Generated access token</strong> et cliquez sur <strong className="font-bold">Generate</strong> pour obtenir un nouveau token d'accès contenant ces droits.</li>
                                <li>Copiez ce nouveau token dans le champ ci-dessus et cliquez sur Enregistrer.</li>
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

               {/* TEXTELP */}
              <div id="connector-block-textelp" style={{ border: '1px solid rgb(229, 229, 229)', borderRadius: '13px', backgroundColor: 'rgb(245, 245, 245)' }} className="p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div>
                        <h5 className="font-bold text-black" style={{ fontSize: '18px', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Textelp</h5>
                        <div className="select-none font-sans flex items-center mt-1">
                          <span
                            style={{
                              backgroundColor: 'rgb(57, 169, 143)',
                              boxShadow: 'rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset',
                              color: '#ffffff',
                              fontSize: '16px',
                              borderRadius: '100px',
                              padding: '2px 10px',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            }}
                            className="font-bold select-none"
                          >
                            {t("Disponible")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer select-none" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          id="toggle-textelp-active"
                          checked={textelpActive}
                          onChange={(e) => {
                            setTextelpActive(e.target.checked);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#dbdbdb] rounded-full cursor-pointer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#dbdbdb] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#fe4eba]" style={{ cursor: 'pointer' }}></div>
                      </label>
                    </div>
                  </div>

                  {textelpActive && (
                    <div className="mt-4 space-y-3 animate-slideUp">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">{t("ID de l’environnement.")}</label>
                        <input
                          type="text"
                          id="input-textelp-env-id"
                          value={textelpEnvId}
                          onChange={(e) => {
                            setTextelpEnvId(e.target.value);
                          }}
                          className="w-full text-black placeholder-[#a8a8a8] font-sans text-xs bg-white"
                          placeholder={t("Entrez l'ID de l’environnement.")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">{t("Identifiant secret.")}</label>
                        <input
                          type="text"
                          id="input-textelp-secret-id"
                          value={textelpSecretId}
                          onChange={(e) => {
                            setTextelpSecretId(e.target.value);
                          }}
                          className="w-full text-black placeholder-[#a8a8a8] font-sans text-xs bg-white"
                          placeholder={t("Entrez l'identifiant secret.")}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ATLASANTÉ GEODAE */}
              <div id="connector-block-atlasante" style={{ border: '1px solid rgb(229, 229, 229)', borderRadius: '13px', backgroundColor: 'rgb(245, 245, 245)' }} className="p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div>
                        <h5 className="font-bold text-black" style={{ fontSize: '18px', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Atlasanté GEODAE</h5>
                        <div className="select-none font-sans flex items-center mt-1">
                          <span
                            style={{
                              backgroundColor: selectedLang === 'Français, France' 
                                ? (atlasanteActive ? '#fe4eba' : 'rgb(57, 169, 143)')
                                : 'rgb(185, 28, 28)',
                              boxShadow: 'rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset',
                              color: '#ffffff',
                              fontSize: '16px',
                              borderRadius: '100px',
                              padding: '2px 10px',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            }}
                            className="font-bold select-none"
                          >
                            {selectedLang === 'Français, France' 
                              ? (atlasanteActive ? t("Activé") : t("Disponible"))
                              : t("Indisponible")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div className="flex items-center gap-2">
                      <label 
                        className={`relative inline-flex items-center select-none ${selectedLang === 'Français, France' ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`} 
                        style={{ cursor: selectedLang === 'Français, France' ? 'pointer' : 'not-allowed' }}
                      >
                        <input
                          type="checkbox"
                          id="toggle-atlasante-active"
                          checked={selectedLang === 'Français, France' && atlasanteActive}
                          disabled={selectedLang !== 'Français, France'}
                          onChange={(e) => {
                            setAtlasanteActive(e.target.checked);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#dbdbdb] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#dbdbdb] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#fe4eba]"></div>
                      </label>
                    </div>
                  </div>

                  {selectedLang === 'Français, France' && atlasanteActive && (
                    <div className="mt-4 space-y-3 animate-slideUp">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">{t("URL Auth.")}</label>
                        <input
                          type="text"
                          id="input-atlasante-url-auth"
                          value={atlasanteUrlAuth}
                          onChange={(e) => {
                            setAtlasanteUrlAuth(e.target.value);
                          }}
                          className="w-full text-black placeholder-[#a8a8a8] font-sans text-xs bg-white"
                          placeholder={t("https://catalogue.atlasante.fr/api/login")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">{t("Identifiant du déclarant.")}</label>
                        <input
                          type="text"
                          id="input-atlasante-declarant-id"
                          value={atlasanteDeclarantId}
                          onChange={(e) => {
                            setAtlasanteDeclarantId(e.target.value);
                          }}
                          className="w-full text-black placeholder-[#a8a8a8] font-sans text-xs bg-white"
                          placeholder={t("Entrez votre identifiant de déclarant.")}
                        />
                      </div>
                    </div>
                  )}

                  {/* Language restriction warning removed as requested */}
                </div>
              </div>

              {/* GOOGLE DRIVE */}
              <div id="connector-block-googledrive" style={{ border: '1px solid rgb(229, 229, 229)', borderRadius: '13px', backgroundColor: 'rgb(245, 245, 245)' }} className="p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div>
                        <h5 className="font-bold text-black" style={{ fontSize: '18px', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Google Drive</h5>
                        <div className="select-none font-sans flex items-center mt-1">
                          <span
                            style={{
                              backgroundColor: googleDriveActive ? '#fe4eba' : 'rgb(57, 169, 143)',
                              boxShadow: 'rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset',
                              color: '#ffffff',
                              fontSize: '16px',
                              borderRadius: '100px',
                              padding: '2px 10px',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            }}
                            className="font-bold select-none"
                          >
                            {googleDriveActive ? t("Activé") : t("Disponible")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer select-none" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          id="toggle-googledrive-active"
                          checked={googleDriveActive}
                          onChange={(e) => {
                            handleGoogleDriveToggle(e.target.checked);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#dbdbdb] rounded-full cursor-pointer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#dbdbdb] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#fe4eba]" style={{ cursor: 'pointer' }}></div>
                      </label>
                    </div>
                  </div>

                  {googleDriveActive && (
                    <div className="mt-4 space-y-3 animate-slideUp">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">{t("Compte Google Connecté")}</label>
                        <div className="text-black font-sans bg-white p-2 flex items-center justify-between rounded-[13px]">
                          <span className="font-medium text-[16px] break-all">{googleDriveEmail || t("Inconnu")}</span>
                          <button
                            type="button"
                            onClick={() => handleGoogleDriveToggle(true)}
                            className="text-[16px] text-blue-600 hover:underline select-none ml-2"
                          >
                            {t("Changer")}
                          </button>
                        </div>
                      </div>
                      <div className="text-[16px] text-black font-sans" style={{ color: '#000' }}>
                        {t("Synchronisation active avec Google Drive et Google Calendar.")}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* BANNIÈRE BOUTIQUE EN LIGNE */}
          <div 
            className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn transition-all text-left"
            style={{
              borderColor: 'rgb(218, 218, 218)',
              background: '#ffffff00',
              boxShadow: 'none',
              width: '100%',
              margin: '0 auto',
            }}
          >
            <p 
              className="font-sans leading-relaxed flex-1"
              style={{ 
                fontSize: '16px', 
                fontWeight: 400, 
                color: '#000000', 
                cursor: 'default' 
              }}
            >
              {t("Imprimantes à codes-barres, tablettes, plaquettes d’intervention pour véhicules… Retrouvez tous les équipements optionnels sur la boutique en ligne Defibeo.")}
            </p>
            <button
              type="button"
              onClick={() => setIsShopDrawerOpen(true)}
              style={{
                backgroundColor: 'rgb(53, 86, 236)',
                color: '#ffffff',
                boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
                borderRadius: '0.75rem',
                fontSize: '18px',
                padding: '11px 22px',
                fontWeight: '100',
                transition: 'all 0s ease-in-out',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                border: 'none',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              className="transition-all hover:opacity-95 shrink-0"
            >
              {t("Ouvrir la boutique")}
            </button>
          </div>

          {/* SECTION 5: ASSISTANCE DEFIBEO */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left mt-4" id="settings-section-assistance-group">
            {renderSectionHeader(t("Assistance Defibeo"), false)}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* SECTION 2: SUBSCRIPTION */}
              <div 
                className="rounded-2xl p-5 space-y-3 bg-[#311833] text-white flex flex-col justify-between animate-fadeIn" 
                id="settings-section-subscription"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white cursor-default select-none" style={{ fontSize: '18px', fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}>
                      {t("Facturation Defibeo")}.
                    </h4>
                  </div>
                  <div style={{ backgroundColor: '#ffffff1c', border: 'none', padding: '20px', borderRadius: '13px' }}>
                    <div className="font-semibold text-white text-[16px] font-sans text-center" style={{ textTransform: 'none' }}>
                      {t("Votre abonnement Defibeo")}.
                    </div>
                    <div className="mt-4">
                      <a
                        href="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-1J0318296F988751YNJI6Z3A"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center font-bold px-5 py-2.5 text-[18px] text-white hover:opacity-90 active:scale-95 transition-all w-full"
                        style={{
                          backgroundColor: 'rgb(53, 86, 236)',
                          borderRadius: '0.75rem',
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                          fontWeight: '100',
                          boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, inset 0 6px 12px #ffffff25',
                          border: 'none',
                          cursor: 'pointer',
                          width: '100%'
                        }}
                      >
                        {t("Mettre à jour")}
                      </a>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 flex flex-col">
                    <span className="block text-[16px] text-white font-sans leading-relaxed" style={{ color: '#ffffff' }}>
                      {t("Les factures sont automatiquement envoyées par e-mail. Les taxes et frais sont inclus dans le montant de l'abonnement. Vous trouverez ci-dessous l'identifiant de votre environnement logiciel.")}
                    </span>
                    <div className="inline-flex items-center justify-center rounded-full bg-transparent text-white border border-white/30 px-3 py-1.5 text-sm font-semibold w-fit select-none" style={{ backgroundColor: 'transparent' }}>
                      Defibeo {envIdDisplay.toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: ASSISTANCE SUPPORT */}
              <div className="flex flex-col justify-between bg-white animate-fadeIn" id="settings-section-support">
                <div className="space-y-2">
                  <p className="text-[16px] text-black leading-relaxed font-sans">
                    {t("L'assistance Defibeo est disponible tous les jours, y compris les jours fériés, en Français et en Anglais par email à")}{' '}
                    <a href="mailto:contact@defibeo.com" className="text-blue-600 hover:underline hover:text-blue-700 font-bold">
                      contact@defibeo.com
                    </a>
                    .
                  </p>
                  <div className="space-y-2 pt-1 font-sans flex flex-col">
                    <a 
                      href="https://defibeo.com/#pricing" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block text-[16px] font-semibold text-blue-600 hover:underline hover:text-blue-700 cursor-pointer w-fit"
                    >
                      {t("Informations sur mon offre")}.
                    </a>
                    <a 
                      href="https://civilprom.s3.eu-north-1.amazonaws.com/DEFIBEO+ACCORD+%EF%BD%9C+FRANCE%2C+FRANC%CC%A7AIS+%EF%BD%9C+2026.pdf" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block text-[16px] font-semibold text-blue-600 hover:underline hover:text-blue-700 cursor-pointer w-fit"
                    >
                      {t("Licence et agrément EULA.")}
                    </a>
                    <a 
                      href="https://civilprom.s3.eu-north-1.amazonaws.com/Data_Process_France.pdf.pdf" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block text-[16px] font-semibold text-blue-600 hover:underline hover:text-blue-700 cursor-pointer w-fit"
                    >
                      {t("Comment nous protégeons vos données.")}
                    </a>
                    <a 
                      href="https://civilprom.s3.eu-north-1.amazonaws.com/Addendum_Defibeo_5JL26.pdf.pdf" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block text-[16px] font-semibold text-blue-600 hover:underline hover:text-blue-700 cursor-pointer w-fit"
                    >
                      {t("Information de conformité HDS.")}
                    </a>
                  </div>
                </div>
                
                <div className="flex flex-col space-y-3 mt-4">
                  <a
                    href="https://defibeo.com/school/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...rowActionButtonStyle, width: '100%', fontSize: '18px', backgroundColor: 'rgb(53, 86, 236)', color: '#fff' }}
                    className="text-center cursor-pointer"
                  >
                    {t("Centre de connaissances")}
                  </a>

                  <a
                    href="mailto:contact@defibeo.com"
                    style={{ ...rowActionButtonStyle, width: '100%', fontSize: '18px', backgroundColor: '#000', color: '#fff' }}
                    className="text-center cursor-pointer"
                  >
                    {t("Envoyer un message")}
                  </a>
                </div>
              </div>

            </div>
          </div>

          {/* SECTION: INTEGRATION DU FORMULAIRE DE CONTACT */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 mt-4 text-left" id="settings-section-embed-form">
            {renderSectionHeader(t("Intégrez le formulaire de contact à votre site web"), false)}
            
            <p className="text-[16px] text-black font-sans leading-relaxed">
              {t("Générez un formulaire de contact professionnel à intégrer sur votre site internet. Tous les messages envoyés depuis ce formulaire remonteront dans votre onglet CRM et vous recevrez un email de notification.")}
            </p>

            <div className="space-y-3 mt-3">
              <textarea
                readOnly
                value={`<!-- Formulaire de contact Défibeo pour ${localCompany.name || localCompany.nomLogiciel || 'Votre Entreprise'} -->
<div class="defibeo-contact-wrapper" id="defibeo-contact-box" style="max-width: 500px; margin: 20px auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); text-align: left; box-sizing: border-box;">
  <style>
    @font-face {
      font-family: 'Civilprom';
      src: url('https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf') format('opentype');
    }
    #defibeo-contact-box, #defibeo-contact-box * {
      font-family: 'Civilprom', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    #defibeo-contact-box input::placeholder, #defibeo-contact-box textarea::placeholder {
      color: #000000 !important;
      opacity: 0.6;
      font-size: 16px !important;
    }
  </style>

  <h2 style="font-size: 18px; color: #000000; margin-top: 0; margin-bottom: 8px; text-align: left; font-weight: normal;">Envoyer un message à ${localCompany.name || localCompany.nomLogiciel || 'Votre Entreprise'}</h2>
  <p style="font-size: 16px; color: #000000; margin-bottom: 24px; text-align: left; line-height: 1.5;">Vous avez une question ou besoin d'assistance ? Remplissez ce formulaire pour nous contacter.</p>
  
  <form id="defibeo-contact-form" style="display: flex; flex-direction: column; gap: 16px;">
    <input type="hidden" name="tenantId" value="${localStorage.getItem('defib_tenant_id') || 'demo'}" />
    
    <div>
      <label style="display: block; font-size: 16px; color: #000000; margin-bottom: 6px;">Adresse Email</label>
      <input type="email" name="email" required style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 13px; font-size: 16px; color: #000000; box-sizing: border-box; outline: none; transition: border-color 0.2s;" placeholder="votre@email.com" />
    </div>
    
    <div>
      <label style="display: block; font-size: 16px; color: #000000; margin-bottom: 6px;">Message</label>
      <textarea name="message" required rows="4" style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 13px; font-size: 16px; color: #000000; box-sizing: border-box; outline: none; transition: border-color 0.2s; resize: vertical;" placeholder="Entrez votre message, veuillez détailler votre demande et mentionner votre nom et votre entreprise."></textarea>
    </div>
    
    <button type="submit" id="defibeo-submit-btn" style="background-color: #3556ec; color: #ffffff; padding: 14px 20px; border: none; border-radius: 13px; font-size: 16px; font-weight: normal; cursor: pointer; transition: background-color 0.2s; display: block; width: 100%; text-align: center; margin-top: 8px;">Envoyer</button>
    
    <div id="defibeo-response-msg" style="display: none; font-size: 14px; text-align: left; margin-top: 10px;"></div>
  </form>

  <script>
    (function() {
      var form = document.getElementById('defibeo-contact-form');
      if (!form) return;
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var btn = document.getElementById('defibeo-submit-btn');
        var msgDiv = document.getElementById('defibeo-response-msg');
        
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.innerText = 'Envoi en cours...';
        
        var tenantId = form.querySelector('[name="tenantId"]').value;
        var email = form.querySelector('[name="email"]').value;
        var message = form.querySelector('[name="message"]').value;
        
        var params = new URLSearchParams();
        params.append('tenantId', tenantId);
        params.append('email', email);
        params.append('message', message);
        
        fetch('${window.location.origin}/api/crm/embed-lead', {
          method: 'POST',
          headers: {
            'Accept': 'application/json'
          },
          body: params
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerText = 'Envoyer';
          msgDiv.style.display = 'block';
          msgDiv.style.padding = '0';
          msgDiv.style.border = 'none';
          msgDiv.style.background = 'none';
          
          if (data.success) {
            msgDiv.style.color = '#16a34a';
            msgDiv.innerText = '✓ Message envoyé avec succès. Merci !';
            form.reset();
          } else {
            msgDiv.style.color = '#dc2626';
            msgDiv.innerText = 'Erreur : ' + (data.error || 'Une erreur est survenue.');
          }
        })
        .catch(function(err) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerText = 'Envoyer';
          msgDiv.style.display = 'block';
          msgDiv.style.padding = '0';
          msgDiv.style.border = 'none';
          msgDiv.style.background = 'none';
          msgDiv.style.color = '#dc2626';
          msgDiv.innerText = 'Erreur de connexion.';
        });
      });
    })();
  </script>
</div>`}
                className="w-full h-48 bg-[#1e293b] text-[#f8fafc] font-mono text-[11px] p-3 rounded-lg focus:outline-none border-0 resize-none select-all font-sans"
              />
              <button
                type="button"
                onClick={() => {
                  const activeId = localStorage.getItem('defib_tenant_id') || 'demo';
                  const embedCode = `<!-- Formulaire de contact Défibeo pour ${localCompany.name || localCompany.nomLogiciel || 'Votre Entreprise'} -->
<div class="defibeo-contact-wrapper" id="defibeo-contact-box" style="max-width: 500px; margin: 20px auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); text-align: left; box-sizing: border-box;">
  <style>
    @font-face {
      font-family: 'Civilprom';
      src: url('https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf') format('opentype');
    }
    #defibeo-contact-box, #defibeo-contact-box * {
      font-family: 'Civilprom', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    #defibeo-contact-box input::placeholder, #defibeo-contact-box textarea::placeholder {
      color: #000000 !important;
      opacity: 0.6;
      font-size: 16px !important;
    }
  </style>

  <h2 style="font-size: 18px; color: #000000; margin-top: 0; margin-bottom: 8px; text-align: left; font-weight: normal;">Envoyer un message à ${localCompany.name || localCompany.nomLogiciel || 'Défibeo Solutions'}</h2>
  <p style="font-size: 16px; color: #000000; margin-bottom: 24px; text-align: left; line-height: 1.5;">Vous avez une question ou besoin d'assistance ? Remplissez ce formulaire pour nous contacter.</p>
  
  <form id="defibeo-contact-form" style="display: flex; flex-direction: column; gap: 16px;">
    <input type="hidden" name="tenantId" value="${activeId}" />
    
    <div>
      <label style="display: block; font-size: 16px; color: #000000; margin-bottom: 6px;">Adresse Email</label>
      <input type="email" name="email" required style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 13px; font-size: 16px; color: #000000; box-sizing: border-box; outline: none; transition: border-color 0.2s;" placeholder="votre@email.com" />
    </div>
    
    <div>
      <label style="display: block; font-size: 16px; color: #000000; margin-bottom: 6px;">Message</label>
      <textarea name="message" required rows="4" style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 13px; font-size: 16px; color: #000000; box-sizing: border-box; outline: none; transition: border-color 0.2s; resize: vertical;" placeholder="Entrez votre message, veuillez détailler votre demande et mentionner votre nom et votre entreprise."></textarea>
    </div>
    
    <button type="submit" id="defibeo-submit-btn" style="background-color: #3556ec; color: #ffffff; padding: 14px 20px; border: none; border-radius: 13px; font-size: 16px; font-weight: normal; cursor: pointer; transition: background-color 0.2s; display: block; width: 100%; text-align: center; margin-top: 8px;">Envoyer</button>
    
    <div id="defibeo-response-msg" style="display: none; font-size: 14px; text-align: left; margin-top: 10px;"></div>
  </form>

  <script>
    (function() {
      var form = document.getElementById('defibeo-contact-form');
      if (!form) return;
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var btn = document.getElementById('defibeo-submit-btn');
        var msgDiv = document.getElementById('defibeo-response-msg');
        
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.innerText = 'Envoi en cours...';
        
        var tenantId = form.querySelector('[name="tenantId"]').value;
        var email = form.querySelector('[name="email"]').value;
        var message = form.querySelector('[name="message"]').value;
        
        var params = new URLSearchParams();
        params.append('tenantId', tenantId);
        params.append('email', email);
        params.append('message', message);
        
        fetch('${window.location.origin}/api/crm/embed-lead', {
          method: 'POST',
          headers: {
            'Accept': 'application/json'
          },
          body: params
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerText = 'Envoyer';
          msgDiv.style.display = 'block';
          msgDiv.style.padding = '0';
          msgDiv.style.border = 'none';
          msgDiv.style.background = 'none';
          
          if (data.success) {
            msgDiv.style.color = '#16a34a';
            msgDiv.innerText = '✓ Message envoyé avec succès. Merci !';
            form.reset();
          } else {
            msgDiv.style.color = '#dc2626';
            msgDiv.innerText = 'Erreur : ' + (data.error || 'Une erreur est survenue.');
          }
        })
        .catch(function(err) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerText = 'Envoyer';
          msgDiv.style.display = 'block';
          msgDiv.style.padding = '0';
          msgDiv.style.border = 'none';
          msgDiv.style.background = 'none';
          msgDiv.style.color = '#dc2626';
          msgDiv.innerText = 'Erreur de connexion.';
        });
      });
    })();
  </script>
</div>`;
                  navigator.clipboard.writeText(embedCode);
                  setCopiedEmbed(true);
                  setTimeout(() => setCopiedEmbed(false), 2000);
                }}
                style={{
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: 'normal',
                  borderRadius: '12px',
                  padding: '12px 24px',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  display: 'block'
                }}
                className="hover:opacity-90 active:scale-[0.99] transition-all font-sans"
              >
                {copiedEmbed ? t("Copié !") : t("Copier le code")}
              </button>
            </div>
          </div>

          {/* SECTION: PARRAINAGE */}
          <div 
            className="p-5 rounded-xl border flex flex-col gap-4 mt-4 text-left"
            style={{
              borderColor: 'rgb(218, 218, 218)',
              background: '#ffffff00',
              boxShadow: 'none',
              maxWidth: '100%',
              margin: '16px 0px 16px 0px',
            }}
          >
            <div className="space-y-2">
              <p 
                className="font-sans leading-relaxed"
                style={{ 
                  fontSize: '16px', 
                  fontWeight: 400, 
                  color: '#000000', 
                  cursor: 'default' 
                }}
              >
                {t("Parrainez une nouvelle entreprise et obtenez 4 mois d’abonnement gratuits. Indiquez-nous l'entreprise à laquelle vous avez recommandé Defibeo afin que nous puissions suivre son inscription et vous attribuer votre récompense.")}
              </p>
            </div>
            
            <div className="space-y-1 w-full">
              <label className="block text-sm font-bold text-black font-sans">
                {t("Entreprise filleul.")}
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
                <input
                  type="text"
                  value={referralCompany}
                  onChange={(e) => {
                    setReferralCompany(e.target.value);
                    if (referralSent) setReferralSent(false);
                  }}
                  className="flex-1 w-full text-black placeholder-[#747474] font-sans text-sm"
                  placeholder={t("Entrez un texte.")}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    height: '48px',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendReferral}
                  disabled={isSendingReferral || !referralCompany.trim()}
                  className="font-sans font-semibold active:scale-95 transition-all cursor-pointer shrink-0"
                  style={{
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    fontSize: '18px',
                    borderRadius: '13px',
                    padding: '0px 24px',
                    opacity: (!referralCompany.trim() || isSendingReferral) ? 0.5 : 1,
                    cursor: (!referralCompany.trim() || isSendingReferral) ? 'not-allowed' : 'pointer',
                    height: '48px',
                    border: '1px solid #000000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box'
                  }}
                >
                  {isSendingReferral ? t("Envoi...") : t("Valider")}
                </button>
              </div>
            </div>

            {referralSent && (
              <p className="text-emerald-600 font-sans text-sm font-medium mt-1">
                {t("Merci ! Votre demande de parrainage a été envoyée avec succès.")}
              </p>
            )}
          </div>

          {onLogout && (
            <div className="pt-4" style={{ order: 100 }}>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  ...rowActionButtonStyle,
                  backgroundColor: '#b91c1c',
                  width: '100%',
                  fontSize: '18px',
                  padding: '13px'
                }}
                className="transition-all text-white font-sans"
              >
                {t("Quitter la session")}
              </button>
            </div>
          )}

        </div>

      </div>

      {/* SIDE PANE DRAWER FOR API DEFIBEO DOCUMENTATION */}
      {isApiDocOpen && (
        <div className="fixed inset-0 z-[9999] overflow-hidden" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity cursor-pointer animate-fadeIn"
            onClick={() => setIsApiDocOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-3xl bg-white shadow-2xl flex flex-col p-6 overflow-y-auto border-l border-slate-200 animate-slideLeft relative" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
              
              {/* Drawer Content */}
              <div className="flex-1 py-2 space-y-6 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                
                {/* Auth Banner & Security Requirements */}
                <div style={{ background: '#ececec6e', border: '1px solid #e4e1e1', borderRadius: '13px', padding: '15px', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }} className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-bold text-[17px] text-black">Documentation API Defibeo.</span>
                    <span style={{ color: '#fff', background: '#7aa637', border: 'none', borderRadius: '13px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>REST JSON / ISO-8859 & UTF-8</span>
                  </div>

                  <pre style={{ background: 'rgba(0,0,0,0.06)', borderRadius: '10px', padding: '15px', fontSize: '15px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`Host: consoledefibeo.deroesch.com
X-Defibeo-Tenant-ID: YOUR_ENV_ID
X-Defibeo-API-Key: YOUR_KEY
X-Defibeo-Secret-Key: YOUR_SECRET_KEY
Content-Type: application/json`}
                  </pre>

                  {/* Quick Code Examples */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div style={{ background: '#ffffff', borderRadius: '10px', padding: '12px', border: '1px solid #e4e1e1' }}>
                      <div className="text-xs font-bold text-emerald-700 mb-1">Exemple cURL :</div>
                      <pre style={{ fontSize: '13px', color: '#000000', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`curl -X GET "https://consoledefibeo.deroesch.com/v1/defibrillateurs" \\
  -H "X-Defibeo-Tenant-ID: YOUR_ENV_ID" \\
  -H "X-Defibeo-API-Key: YOUR_KEY"`}
                      </pre>
                    </div>
                    <div style={{ background: '#ffffff', borderRadius: '10px', padding: '12px', border: '1px solid #e4e1e1' }}>
                      <div className="text-xs font-bold text-sky-700 mb-1">Exemple JavaScript (Fetch) :</div>
                      <pre style={{ fontSize: '13px', color: '#000000', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`const res = await fetch("https://consoledefibeo.deroesch.com/v1/defibrillateurs", {
  headers: {
    "X-Defibeo-Tenant-ID": "YOUR_ENV_ID",
    "X-Defibeo-API-Key": "YOUR_KEY"
  }
});
const { defibrillateurs } = await res.json();`}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* SEARCH & EXPLORER FOR SLUGS / FIELDS */}
                <div style={{ background: '#ececec6e', border: '1px solid #e4e1e1', borderRadius: '13px', padding: '15px' }} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="font-bold text-black text-[18px]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        Explorateur des champs API:
                      </h4>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <input
                      type="text"
                      value={apiFieldSearch}
                      onChange={(e) => setApiFieldSearch(e.target.value)}
                      placeholder="Recherche."
                      className="w-full bg-white text-black p-3 text-[16px] placeholder:text-[16px] placeholder:text-black focus:outline-none focus:ring-0 outline-none"
                      style={{
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        fontSize: '16px',
                        color: '#000000',
                        borderRadius: '13px',
                        border: '1px solid #e4e1e1'
                      }}
                    />
                  </div>

                  {/* Field List Container */}
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {apiFieldsDictionary
                      .filter(f => {
                        const query = apiFieldSearch.toLowerCase().trim();
                        return !query || f.slug.toLowerCase().includes(query) || f.label.toLowerCase().includes(query) || f.entity.toLowerCase().includes(query);
                      })
                      .map((field) => (
                        <div
                          key={`${field.entity}-${field.slug}`}
                          className="bg-white p-3 flex items-center justify-between flex-wrap gap-2 hover:border-[#3556ec] transition-all"
                          style={{
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            border: '1px solid #e4e1e1',
                            borderRadius: '13px'
                          }}
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span
                              style={{
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                fontSize: '16px',
                                backgroundColor: '#eeffd4',
                                letterSpacing: '0px',
                                color: '#23571c',
                                borderRadius: '13px',
                                border: 'none',
                                padding: '4px 10px',
                                fontWeight: 'bold'
                              }}
                            >
                              {field.entity}
                            </span>
                            <code
                              onClick={() => {
                                copyToClipboard(field.slug, field.slug);
                                setCopiedSlug(field.slug);
                                setTimeout(() => setCopiedSlug(null), 1500);
                              }}
                              title="Cliquer pour copier le slug"
                              style={{
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                fontSize: '16px',
                                backgroundColor: '#d4ffef',
                                letterSpacing: '0px',
                                color: '#1c5754',
                                borderRadius: '13px',
                                border: 'none',
                                padding: '4px 10px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              {field.slug}
                            </code>
                            <span
                              style={{
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                fontSize: '16px',
                                color: '#000000'
                              }}
                            >
                              — {field.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              style={{
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                fontSize: '16px',
                                fontStyle: 'normal',
                                color: '#000000'
                              }}
                            >
                              type: {field.type}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                copyToClipboard(field.slug, field.slug);
                                setCopiedSlug(field.slug);
                                setTimeout(() => setCopiedSlug(null), 1500);
                              }}
                              style={{
                                backgroundColor: copiedSlug === field.slug ? '#7aa637' : '#000000',
                                color: '#ffffff',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                border: 'none',
                                borderRadius: '13px',
                                padding: '6px 14px',
                                cursor: 'pointer',
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                              }}
                            >
                              {copiedSlug === field.slug ? 'Copié !' : 'Copier Slug'}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* API Reference Endpoints */}
                <div className="space-y-6" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>

                  {/* 1. Clients - GET Liste & Unitaire */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/clients</span>
                        <span className="font-bold text-black text-[16px]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>OU /v1/clients/:client_id</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        Sans paramètre, <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/clients</code> retourne la <strong>liste complète des clients</strong> de votre environnement (YOUR_ENV_ID). Avec la variable d'URL <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:client_id</code> (ex: <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>CLI-0042</code>), récupère la fiche unitaire.
                      </p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Exemple de réponse (200 OK)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "status": "success",
  "environnement": "YOUR_ENV_ID",
  "count": 42,
  "clients": [
    {
      "id": "CLI-0042",
      "entreprise": "Clinique Saint-Jean",
      "email": "contact@clinique-stjean.fr",
      "telephone": "0142680000",
      "payeur_id": "PAY-0091",
      "reference_contrat": "CTR-2026-99",
      "debut_contrat": "2026-01-01",
      "fin_contrat": "2028-12-31"
    }
  ]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 2. Client - POST Create or Update */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/clients</span>
                        <span className="font-bold text-black text-[16px]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>OU /v1/clients/:client_id</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Crée un nouveau client ou met à jour un client existant ciblé. Synchronisé immédiatement en base de données.</p>

                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "entreprise": "Clinique Saint-Jean de Paris",
  "email": "direction@clinique-stjean.fr",
  "telephone": "0142680001",
  "payeur_id": "PAY-0091",
  "identifiant_unique": "SIRET-12345678900012",
  "reference_contrat": "CTR-2026-99",
  "debut_contrat": "2026-01-01",
  "fin_contrat": "2029-12-31"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 3. Défibrillateurs - GET Liste & Unitaire */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/defibrillateurs</span>
                        <span className="font-bold text-black text-[16px]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>OU /v1/defibrillateurs/:identifiant</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        Sans paramètre d'identifiant, <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/defibrillateurs</code> retourne le <strong>parc complet de DAE</strong> de l'environnement (YOUR_ENV_ID). Avec un identifiant en URL (<code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>DAE-88192</code> ou numéro de série <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>SN-9981240</code>), renvoie la fiche exhaustive.
                      </p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Structure JSON retournée (Extrait)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "status": "success",
  "environnement": "YOUR_ENV_ID",
  "count": 2492,
  "defibrillateurs": [
    {
      "serie": "SN-9981240",
      "identifiant": "DAE-88192",
      "marque": "ZOLL",
      "modele": "AED Plus",
      "statut": "Conforme",
      "statut_voyant": "Vert OK",
      "numero_atlasante": "ATLAS-77120",
      "version_logiciel": "v3.2.1",
      "client_id": "CLI-0042",
      "nom_prenom": "Jean Dupont",
      "telephone_portable": "0612345678",
      "email": "j.dupont@clinique-stjean.fr",
      "boitier_modele": "Mural AIVIA 200",
      "boitier_lot": "LOT-B-88",
      "numero_et_voie": "12 Avenue de Paris",
      "ville": "Paris",
      "code_postal": "75008",
      "region": "Île-de-France",
      "pays": "France",
      "latitude": 48.8708,
      "longitude": 2.3045,
      "aide_acces": "Code porte 45A12 - Hall d'accueil RDC",
      "expiration_garantie": "2030-05-15",
      "date_fabrication": "2024-02-10",
      "derniere_maintenance": "2026-02-15",
      "prochaine_v": "2027-08-01",
      "modele_a": "CPR-D Padz (Adulte)",
      "lot_a": "LOT-A-990",
      "insertion_a": "2026-02-15",
      "peremption_a": "2028-02-15",
      "lot_padpak_a": "PADPAK-A-01",
      "peremption_padpak_a": "2028-02-15",
      "modele_p": "Pedi-Padz II (Pédiatrique)",
      "lot_p": "LOT-P-441",
      "insertion_p": "2026-02-15",
      "peremption_p": "2028-06-30",
      "lot_padpak_p": "PADPAK-P-02",
      "peremption_padpak_p": "2028-06-30",
      "modele_b": "Pack Lithium 123A",
      "lot_b": "LOT-BAT-77",
      "peremption_b": "2030-02-15",
      "insertion_b": "2026-02-15",
      "pourcentage_constate_b": 100,
      "peremption_trousse": "2028-12-31",
      "etat_housse": "Conforme"
    }
  ]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 4. Défibrillateur - POST Update */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/defibrillateurs/:identifiant</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Édite et met à jour le jeu de données d'un défibrillateur spécifique. La variable d'URL <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:identifiant</code> (ex: <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>AABBCC</code> ou <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>DAE-88192</code>) désigne le matériel exact à cibler et modifier.</p>

                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload exhaustif)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "derniere_maintenance": "2026-08-03",
  "prochaine_v": "2027-08-01",
  "peremption_a": "2029-08-01",
  "lot_a": "LOT-A-1002",
  "modele_a": "CPR-D Padz (Adulte)",
  "peremption_p": "2029-11-15",
  "lot_p": "LOT-P-882",
  "peremption_b": "2031-05-20",
  "lot_b": "LOT-BAT-99",
  "pourcentage_constate_b": 95,
  "statut": "Conforme",
  "statut_voyant": "Vert OK",
  "etat_housse": "Conforme",
  "aide_acces": "Nouveau badge sécurité RDC"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 5. Autre Matériel - GET */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/materiels/:identifiant</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Récupère les informations d'un matériel spécifique (Purificateur d'air, Extincteur, etc.) selon la variable d'URL <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:identifiant</code> (ex: <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>MAT-00109</code>).</p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Champs retournés (JSON complet)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "categorie": "Purificateur d'air",
  "client_id": "CLI-0042",
  "telephone_contact": "0142680000",
  "email_contact": "contact@clinique-stjean.fr",
  "numero_et_voie": "12 Avenue de Paris",
  "ville": "Paris",
  "code_postal": "75008",
  "region": "Île-de-France",
  "pays": "France",
  "latitude": 48.8708,
  "longitude": 2.3045,
  "aide_acces": "Salle d'attente consultation 2",
  "expiration_garantie": "2028-01-01",
  "derniere_maintenance": "2026-03-10",
  "serie": "PUR-99812",
  "identifiant": "MAT-00109",
  "type_filtre": "HEPA H14",
  "modele_filtre": "FIL-HEPA-MED-01"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 6. Autre Matériel - POST Update */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/materiels/:identifiant</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Édite et met à jour les informations d'un matériel spécifique. La variable d'URL <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:identifiant</code> (ex: <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>MAT-00109</code>) cible précisément l'équipement à modifier.</p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "derniere_maintenance": "2026-08-03",
  "type_filtre": "HEPA H14 Ultra",
  "modele_filtre": "FIL-HEPA-MED-02",
  "email_contact": "maintenance@clinique-stjean.fr"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 7. Commande (Devis ou Facture) - POST Create */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/commandes</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Crée une nouvelle commande dans Defibeo avec ses articles et sous-tables de pièces.</p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "membre_attribue": "Thomas Martin",
  "type": "Devis",
  "reference": "DEV-2026-0803",
  "client_id": "CLI-0042",
  "date_emission": "2026-08-03",
  "situation": "Brouillon",
  "remarque": "Livraison express incluse",
  "code_taxe": "TVA20",
  "payeur_id": "PAY-0091",
  "commentaires": "Offre valable 30 jours",
  "articles": [
    {
      "ugs": "ELE-ZOLL-01",
      "piece": "Paire d'électrodes adulte CPR-D Padz ZOLL",
      "unite_ht": 85.00,
      "volume": 2,
      "total_ht": 170.00
    }
  ]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 8. FSM Tournée & Missions - POST Create */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/tournees</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Crée une nouvelle tournée FSM et insère des missions associées aux identifiants de défibrillateurs ou autres matériels.</p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "titre_tournee": "Tournée Maintenance IDF Ouest - Août 2026",
  "date_periode": "2026-08-10 au 2026-08-15",
  "situation": "Planifiée",
  "missions": [
    {
      "categorie_materiel": "Défibrillateur",
      "modele": "ZOLL AED Plus",
      "peremption_a": "2028-02-15",
      "peremption_p": "2028-06-30",
      "peremption_b": "2030-02-15",
      "prochaine_v": "2027-08-01",
      "client_id": "CLI-0042",
      "site": "Clinique Saint-Jean - Batiment Principal",
      "identifiant": "DAE-88192",
      "localisation": "Paris (75008)",
      "bon_de_commande": "BC-99011",
      "raison_prestation": ["Contrôle annuel", "Remplacement électrodes"]
    }
  ]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 9. Rapport PDF - GET */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/rapports/:identifiant</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Récupère les informations et l'URL de téléchargement d'un rapport d'intervention PDF selon la variable d'URL <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:identifiant</code> (ex: <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>RAP-2026-0412</code>).</p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Exemple de réponse (200 OK)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "identifiant": "RAP-2026-0412",
  "type": "Rapport de Maintenance Annuelle",
  "date": "2026-08-01",
  "technicien": "Thomas Martin",
  "client_id": "CLI-0042",
  "pdf_download_url": "https://consoledefibeo.deroesch.com/v1/rapports/RAP-2026-0412/pdf"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 10. Centrale des Stocks - GET /v1/stocks/centrale/:ugs */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/stocks/centrale/:ugs</span>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Centrale des stocks</span>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        Récupère la fiche complète d'un article en <strong>Centrale des Stocks</strong> (entrepôt principal) selon son code produit <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:ugs</code> (ex: <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>ELE-ZOLL-01</code>). Retourne les propriétés financières et prévisionnelles ainsi que l'<strong>inventaire détaillé des éléments de traçabilité unitaires (lots/séries)</strong>.
                      </p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Exemple de réponse (200 OK - Formulaire Centrale + Traçabilité)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "type_stock": "Centrale des stocks",
  "piece_ou_service_id": "VAR-0012",
  "nom_piece": "Paire d'électrodes adulte CPR-D Padz ZOLL",
  "ugs": "ELE-ZOLL-01",
  "quantite_disponible": 142,
  "quantite_reservee": 12,
  "livraison_date": "2026-08-15",
  "reapprovisionnement_date": "2026-08-20",
  "valeur_achat_ht": 85.00,
  "marge_pct": 25.0,
  "prix_vente_ht": 113.33,
  "emplacement_stockage": "Aisle B - Etagere 4",
  "besoin_projete_2_mois": 30,
  "besoin_projete_2_a_6_mois": 80,
  "total_a_commander": 20,
  "commentaire": "Stock sous contrat de réapprovisionnement automatique.",
  "tracabilite_activee": true,
  "inventaire_tracabilite": [
    {
      "id": "TRAC-881901",
      "lot_ou_serie": "LOT-2026-A990",
      "date_peremption": "2028-02-15",
      "volume": 1,
      "situation": "Disponible",
      "emplacement": "Bac A-12",
      "bon_de_commande": "BC-2026-004",
      "client_reserve": "Clinique Saint-Jean",
      "date_estimee": "2026-08-10",
      "observation": "Vérifié conforme lors de la réception"
    },
    {
      "id": "TRAC-881902",
      "lot_ou_serie": "LOT-2026-A991",
      "date_peremption": "2028-02-15",
      "volume": 1,
      "situation": "Utilisé",
      "emplacement": "Poste client",
      "bon_de_commande": "BC-2026-004",
      "client_reserve": "Hôpital Pasteur",
      "date_estimee": "2026-08-01",
      "observation": "Installé lors de la tournée du 1er août"
    }
  ],
  "historique_mouvements": [
    {
      "id": "MVT-001",
      "type": "Réapprovisionnement fournisseur",
      "volume": 50,
      "date": "2026-07-15",
      "statut": "Terminé",
      "bon_de_commande": "BC-SUP-110",
      "tracking_link": "https://dhl.com/track/12345"
    }
  ]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 11. Centrale des Stocks - POST /v1/stocks/centrale/:ugs */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/stocks/centrale/:ugs</span>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Centrale des stocks</span>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        Met à jour ou crée un article en <strong>Centrale des Stocks</strong>, en ciblant le code produit <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:ugs</code>. Permet d'ajuster les quantités globales ainsi que la liste d'inventaire de traçabilité (lots/séries).
                      </p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "quantite_disponible": 150,
  "quantite_reservee": 10,
  "livraison_date": "2026-08-20",
  "reapprovisionnement_date": "2026-08-25",
  "valeur_achat_ht": 85.00,
  "marge_pct": 25.0,
  "prix_vente_ht": 113.33,
  "emplacement_stockage": "Aisle B - Etagere 4",
  "besoin_projete_2_mois": 30,
  "besoin_projete_2_a_6_mois": 80,
  "total_a_commander": 0,
  "commentaire": "Ajustement de stock suite à inventaire physique",
  "tracabilite_activee": true,
  "inventaire_tracabilite": [
    {
      "lot_ou_serie": "LOT-2026-A992",
      "date_peremption": "2028-05-31",
      "situation": "Disponible",
      "emplacement": "Bac A-13",
      "bon_de_commande": "BC-2026-010",
      "client_reserve": "",
      "observation": "Ajouté via API"
    }
  ]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 11b. Stocks Distribués - GET /v1/stocks/distribues */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/stocks/distribues</span>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">Stocks distribués</span>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        Récupère l'inventaire des <strong>Stocks Distribués</strong> par emplacement secondaire ou véhicule technicien/collaborateur (ex: Véhicule A, Entrepôt B).
                      </p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Exemple de réponse (200 OK - Formulaire Stocks distribués)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "type_stock": "Stocks distribués",
  "stocks_distribues": [
    {
      "id": "DIST-001",
      "piece_ou_service_id": "VAR-0012",
      "ugs": "ELE-ZOLL-01",
      "nom_emplacement_ou_vehicule": "Véhicule A - Thomas Martin",
      "volume_disponible": 8,
      "volume_reserve": 2,
      "volume_entrant": 5
    },
    {
      "id": "DIST-002",
      "piece_ou_service_id": "VAR-0012",
      "ugs": "ELE-ZOLL-01",
      "nom_emplacement_ou_vehicule": "Entrepôt B - Lyon",
      "volume_disponible": 25,
      "volume_reserve": 0,
      "volume_entrant": 0
    }
  ]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 11c. Stocks Distribués - POST /v1/stocks/distribues */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/stocks/distribues</span>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">Stocks distribués</span>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        Met à jour le stock attribué à un emplacement distribué ou véhicule technicien.
                      </p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "piece_ou_service_id": "VAR-0012",
  "ugs": "ELE-ZOLL-01",
  "nom_emplacement_ou_vehicule": "Véhicule A - Thomas Martin",
  "volume_disponible": 10,
  "volume_reserve": 1,
  "volume_entrant": 0
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 12. Variables Defibeo - GET */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/variables</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Récupère la liste des variables globales système et paramétrages de Defibeo.</p>

                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Exemple de réponse (200 OK)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "environnement": "YOUR_ENV_ID",
  "version_api": "1.4.0",
  "devise": "EUR",
  "taux_tva_defaut": 20.0,
  "marques_dae_supportees": ["ZOLL", "HEARTSINE", "PHYSIO-CONTROL", "SCHILLER", "MINDRAY"],
  "categories_crm": ["Technique", "Commercial", "Réclamation", "Formulaire Web", "Sans Catégorie"]
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 13. CRM Tickets - GET Liste & POST Create */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET / POST /v1/crm/tickets</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        En <strong>GET</strong>, récupère tous les tickets du CRM de l'environnement YOUR_ENV_ID. En <strong>POST</strong>, crée un nouveau ticket avec affectation collaborateur et criticité.
                      </p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (POST JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "categorie": "Technique",
  "situation": "Nouveau",
  "criticite": "Urgent",
  "objet": "Signalement Bip Sonore DAE",
  "client_id": "CLI-0042",
  "collaborateur": "Pierre Durand",
  "description": "Bip voyant rouge constaté par l'agent de sécurité lors de la ronde de 8h."
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 14. Formations - GET */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>GET /v1/formations/:formation_id</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Récupère les informations complètes d'une session de formation spécifique selon la variable d'URL <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:formation_id</code> (ex: <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>FOR-2026-001</code>).</p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Structure JSON complète retournée</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "formation_id": "FOR-2026-001",
  "intitule": "Formation Secourisme & Utilisation DAE",
  "date_heure": "2026-08-15T09:00",
  "formateur_id": "MEM-002",
  "statut": "Terminé",
  "client_id": "CLI-0042",
  "adresse": "12 Avenue de Paris",
  "ville": "Paris",
  "code_postal": "75008",
  "region": "Île-de-France",
  "pays": "France",
  "commentaire": "Session SST et gestes de premiers secours."
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 15. Formations - POST Create */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/formations</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Crée une nouvelle session de formation dans la base de données Defibeo.</p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "intitule": "Formation Manipulation DAE & Gestes d'Urgence",
  "date_heure": "2026-09-01T14:00",
  "formateur_id": "MEM-002",
  "statut": "Brouillon",
  "client_id": "CLI-0042",
  "adresse": "25 Rue de la Paix",
  "ville": "Lyon",
  "code_postal": "69002",
  "region": "Auvergne-Rhône-Alpes",
  "pays": "France",
  "commentaire": "Session groupe 2 - Salle de réunion B"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 16. Formations - POST Update */}
                  <div style={{ border: '1px solid #e4e1e1', background: '#f7f7f7', borderRadius: '13px' }} className="overflow-hidden shadow-2xs">
                    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e4e1e1' }} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span style={{ color: '#fff', background: 'oklch(0.67 0.15 128.49)', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '16px', fontWeight: 'bold', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>POST /v1/formations/:formation_id</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      <p className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Met à jour et modifie les informations d'une session de formation existante ciblée par son identifiant unique <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>:formation_id</code> (ex: <code className="bg-white text-black px-1.5 py-0.5 rounded font-bold border border-[#e4e1e1]" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>FOR-2026-001</code>).</p>
                      <div>
                        <div className="text-[16px] font-bold text-black mb-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>Corps de la requête (JSON payload)</div>
                        <pre style={{ background: '#ffffff', borderRadius: '13px', padding: '20px', fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', overflowX: 'auto', lineHeight: '1.5', border: '1px solid #e4e1e1' }}>
{`{
  "intitule": "Formation Secourisme & Utilisation DAE - Session Avancée",
  "statut": "Terminé",
  "commentaire": "Session clôturée. Émargements et certificats générés.",
  "formateur_id": "MEM-002"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Floating Close Button */}
                <div className="sticky bottom-4 z-20 flex justify-center pt-2 w-full">
                  <button
                    type="button"
                    onClick={() => setIsApiDocOpen(false)}
                    style={{
                      backgroundColor: '#3556ec',
                      color: '#ffffff',
                      borderRadius: '13px',
                      padding: '14px 20px',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      width: '93%',
                      boxShadow: '0 4px 14px rgba(53, 86, 236, 0.4)'
                    }}
                    className="hover:opacity-95 transition-all"
                  >
                    Fermer
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}

      {/* SIDE PANE DRAWER FOR BOUTIQUE DEFIBEO */}
      {isShopDrawerOpen && (
        <div className="fixed inset-0 z-[9999] overflow-hidden" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity cursor-pointer animate-fadeIn"
            onClick={() => setIsShopDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col p-6 overflow-y-auto border-l border-slate-200 animate-slideLeft relative" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
              
              {/* Drawer Content */}
              <div className="flex-1 py-4 flex flex-col justify-between text-[16px] text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                
                <div className="space-y-4">
                  {/* Item 1: Imprimante portable EPSON LW C410 */}
                  <div
                    className="space-y-2 text-left"
                    style={{ border: '1px solid #cfcfcf4a', background: '#f9f9fa', padding: '25px', borderRadius: '13px' }}
                  >
                    <div className="font-bold text-black leading-snug" style={{ fontSize: '18px' }}>
                      Imprimante portable EPSON LW C410.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Usage : Impression nomade de codes-barres.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Commentaire : Achat via site marchand.
                    </div>
                    <div className="pt-2">
                      <a
                        href="https://amzn.eu/d/0hoAS3kU"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...rowActionButtonStyle,
                          backgroundColor: 'rgb(53, 86, 236)',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '10px 22px',
                          textDecoration: 'none'
                        }}
                        className="hover:opacity-95 transition-all inline-flex"
                      >
                        Consulter
                      </a>
                    </div>
                  </div>

                  {/* Item 2: Sticker mainteneur 30cm */}
                  <div
                    className="space-y-2 text-left"
                    style={{ border: '1px solid #cfcfcf4a', background: '#f9f9fa', padding: '25px', borderRadius: '13px' }}
                  >
                    <div className="font-bold text-black leading-snug" style={{ fontSize: '18px' }}>
                      Sticker mainteneur 30cm.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Usage : Étiquette informations du mainteneur, défibrillateur & visites pour boîtier.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Commentaire : Personnalisation et achat via Defibeo. Volume minimum de 300 unités.
                    </div>
                    <div className="pt-2">
                      <a
                        href="mailto:support@defibeo.com"
                        style={{
                          ...rowActionButtonStyle,
                          backgroundColor: 'rgb(53, 86, 236)',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '10px 22px',
                          textDecoration: 'none'
                        }}
                        className="hover:opacity-95 transition-all inline-flex"
                      >
                        Contact
                      </a>
                    </div>
                  </div>

                  {/* Item 3: Plaquette intervention format A4 rigide */}
                  <div
                    className="space-y-2 text-left"
                    style={{ border: '1px solid #cfcfcf4a', background: '#f9f9fa', padding: '25px', borderRadius: '13px' }}
                  >
                    <div className="font-bold text-black leading-snug" style={{ fontSize: '18px' }}>
                      Plaquette intervention format A4 rigide.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Usage : À positionner sous le pare-brise dans le véhicule technicien.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Commentaire : Personnalisation et achat via Defibeo. Volume minimum de 2 unités.
                    </div>
                    <div className="pt-2">
                      <a
                        href="mailto:support@defibeo.com"
                        style={{
                          ...rowActionButtonStyle,
                          backgroundColor: 'rgb(53, 86, 236)',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '10px 22px',
                          textDecoration: 'none'
                        }}
                        className="hover:opacity-95 transition-all inline-flex"
                      >
                        Contact
                      </a>
                    </div>
                  </div>

                  {/* Item 4: Registre de contrôle et de maintenance au format A5 */}
                  <div
                    className="space-y-2 text-left"
                    style={{ border: '1px solid #cfcfcf4a', background: '#f9f9fa', padding: '25px', borderRadius: '13px' }}
                  >
                    <div className="font-bold text-black leading-snug" style={{ fontSize: '18px' }}>
                      Registre de contrôle et de maintenance au format A5.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Usage : À placer dans le boîtier du défibrillateur.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Commentaire : Personnalisation et achat via Defibeo. Volume minimum de 100 unités.
                    </div>
                    <div className="pt-2">
                      <a
                        href="mailto:support@defibeo.com"
                        style={{
                          ...rowActionButtonStyle,
                          backgroundColor: 'rgb(53, 86, 236)',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '10px 22px',
                          textDecoration: 'none'
                        }}
                        className="hover:opacity-95 transition-all inline-flex"
                      >
                        Contact
                      </a>
                    </div>
                  </div>

                  {/* Item 5: Smartphone Motorola G77 5G */}
                  <div
                    className="space-y-2 text-left"
                    style={{ border: '1px solid #cfcfcf4a', background: '#f9f9fa', padding: '25px', borderRadius: '13px' }}
                  >
                    <div className="font-bold text-black leading-snug" style={{ fontSize: '18px' }}>
                      Smartphone Motorola G77 5G.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Usage : Appareil destiné à l’accès webapp par le technicien.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Commentaire : Achat via site marchand.
                    </div>
                    <div className="pt-2">
                      <a
                        href="https://www.ldlc.com/fiche/PB00731043.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...rowActionButtonStyle,
                          backgroundColor: 'rgb(53, 86, 236)',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '10px 22px',
                          textDecoration: 'none'
                        }}
                        className="hover:opacity-95 transition-all inline-flex"
                      >
                        Consulter
                      </a>
                    </div>
                  </div>

                  {/* Item 6: Smartphone Motorola Edge 70 Fusion */}
                  <div
                    className="space-y-2 text-left"
                    style={{ border: '1px solid #cfcfcf4a', background: '#f9f9fa', padding: '25px', borderRadius: '13px' }}
                  >
                    <div className="font-bold text-black leading-snug" style={{ fontSize: '18px' }}>
                      Smartphone Motorola Edge 70 Fusion.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Usage : Appareil destiné à l’accès webapp par le technicien.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Commentaire : Achat via site marchand.
                    </div>
                    <div className="pt-2">
                      <a
                        href="https://www.ldlc.com/fiche/PB00731023.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...rowActionButtonStyle,
                          backgroundColor: 'rgb(53, 86, 236)',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '10px 22px',
                          textDecoration: 'none'
                        }}
                        className="hover:opacity-95 transition-all inline-flex"
                      >
                        Consulter
                      </a>
                    </div>
                  </div>

                  {/* Item 7: Smartphone Apple iPhone 16 */}
                  <div
                    className="space-y-2 text-left"
                    style={{ border: '1px solid #cfcfcf4a', background: '#f9f9fa', padding: '25px', borderRadius: '13px' }}
                  >
                    <div className="font-bold text-black leading-snug" style={{ fontSize: '18px' }}>
                      Smartphone Apple iPhone 16.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Usage : Appareil destiné à l’accès webapp par le technicien.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Commentaire : Achat via site marchand.
                    </div>
                    <div className="pt-2">
                      <a
                        href="https://www.ldlc.com/fiche/PB00668658.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...rowActionButtonStyle,
                          backgroundColor: 'rgb(53, 86, 236)',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '10px 22px',
                          textDecoration: 'none'
                        }}
                        className="hover:opacity-95 transition-all inline-flex"
                      >
                        Consulter
                      </a>
                    </div>
                  </div>

                  {/* Item 8: Tablette Apple iPad Cellular */}
                  <div
                    className="space-y-2 text-left"
                    style={{ border: '1px solid #cfcfcf4a', background: '#f9f9fa', padding: '25px', borderRadius: '13px' }}
                  >
                    <div className="font-bold text-black leading-snug" style={{ fontSize: '18px' }}>
                      Tablette Apple iPad Cellular.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Usage : Appareil destiné à l’accès webapp par le technicien.
                    </div>
                    <div className="text-black leading-normal" style={{ fontSize: '14px' }}>
                      Commentaire : Achat via site marchand.
                    </div>
                    <div className="pt-2">
                      <a
                        href="https://www.ldlc.com/fiche/PB00671421.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...rowActionButtonStyle,
                          backgroundColor: 'rgb(53, 86, 236)',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '10px 22px',
                          textDecoration: 'none'
                        }}
                        className="hover:opacity-95 transition-all inline-flex"
                      >
                        Consulter
                      </a>
                    </div>
                  </div>
                </div>

                {/* Floating Close Button */}
                <div className="sticky bottom-4 z-20 flex justify-center pt-8 w-full">
                  <button
                    type="button"
                    onClick={() => setIsShopDrawerOpen(false)}
                    style={{
                      backgroundColor: '#3556ec',
                      color: '#ffffff',
                      borderRadius: '13px',
                      padding: '14px 20px',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      width: '93%',
                      boxShadow: '0 4px 14px rgba(53, 86, 236, 0.4)'
                    }}
                    className="hover:opacity-95 transition-all"
                  >
                    {t("Fermer")}
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
