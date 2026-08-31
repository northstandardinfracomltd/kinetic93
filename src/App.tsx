import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getRegionsForCountry } from './utils/regions';
import { fetchCollectionFromFirestore, saveCollectionToFirestore, setTenantId as setFirebaseTenantId, getRegisteredTenants, purgeAllLocalEnvironmentCaches, getCollectionNameAliases } from './firebase';
import { generateReportModerationComment } from './utils/moderationComment';
import { t, getLanguage, setLanguage, startDOMTranslation } from './utils/translate';
const translate = t;
import { Client, Variable, Defibrillateur, SupportTicket, Member, CompanyInfo, PointageLog, StockRecord, CommercialDoc, CommercialDocItem, GedDocument, Memo, OtherEquipment, PointageAutoVigilance, DistributedStockLocation, AchatFournisseur, AppNotification, VeilleRecord, LogisticsNotification, FormationRecord, StagiaireRecord, EmargementRecord, APP_THEMES, DEFAULT_THEME_COLOR, APP_FAVICONS, DEFAULT_FAVICON_URL, formatPdfHeaderText } from './types';
import {
  INITIAL_CLIENTS,
  INITIAL_VARIABLES,
  INITIAL_DEFIBRILLATEURS,
  INITIAL_OTHER_EQUIPMENTS,
  INITIAL_TICKETS,
  INITIAL_COMMERCIAL_DOCS,
  INITIAL_GED_DOCS,
  INITIAL_STOCKS,
  INITIAL_DISTRIBUTED_STOCKS,
  INITIAL_REVIEWS,
  INITIAL_EXPENSES,
  INITIAL_VEILLES,
  INITIAL_REPORTS,
  INITIAL_TOURS,
  INITIAL_MEMBERS,
  generateRandomPin,
  formatDateToFR,
  computeProchaineMaintenance,
  getLocationCustomName,
  getCapsuleBgColor,
  safeSetLocalStorage,
} from './utils';
import {
  triggerEmail4Signalement,
  triggerEmail5AvisageFSM,
  triggerEmail7CrmReply,
  triggerEmail8NouvelleTourneeTech,
  triggerEmail6RapportIntervention,
  triggerEmailSoumettreAuClient
} from './utils/emailService';
import { getParisTimestamp } from './utils/dateUtils';

import DefibTab from './components/DefibTab';
import HelpBubble from './components/HelpBubble';
import AutresMaterielsTab from './components/AutresMaterielsTab';
import ClientTab from './components/ClientTab';
import VariableTab from './components/VariableTab';
import SettingsModal from './components/SettingsModal';
import { CrmTab } from './components/CrmTab';
import StatsModal from './components/StatsModal';
import PublicPortal from './components/PublicPortal';
import ClientPortal from './components/ClientPortal';
import Login from './components/Login';
import MegaAdminDashboard from './components/MegaAdminDashboard';
import StocksTab from './components/StocksTab';
import StocksDistribuesTab from './components/StocksDistribuesTab';
import GedTab from './components/GedTab';
import AchatsFournisseursTab from './components/AchatsFournisseursTab';
import TicketsCaisseTab from './components/TicketsCaisseTab';
import TempsTab from './components/TempsTab';
import LocalisationsTab from './components/LocalisationsTab';
import SatisfactionTab from './components/SatisfactionTab';
import VeillesTab from './components/VeillesTab';
import FormationsTab from './components/FormationsTab';
import StagiairesTab from './components/StagiairesTab';
import EmargementsTab from './components/EmargementsTab';
import GmaoCorrectionForm from './components/GmaoCorrectionForm';
import ImportExportTab from './components/ImportExportTab';
import { geocodeAddress, sortMissionsByProximity, scheduleMissions } from './utils/fsmOptimizer';
import { getActiveTenantCountry, isHolidayDate } from './utils/holidays';
import SatisfactionFormPage from './components/SatisfactionFormPage';
import NotificationsTab from './components/NotificationsTab';
import { PlanningTab } from './components/PlanningTab';
import FeedbackDrawer from './components/FeedbackDrawer';
import { EmptyTablePlaceholder } from './components/EmptyTablePlaceholder';
import TopBarProgress from './components/TopBarProgress';


import {
  Heart,
  Settings,
  Wrench,
  Activity,
  FolderSync,
  Ticket,
  ClipboardList,
  Flame,
  FileSpreadsheet,
  MapPin,
  ThumbsUp,
  Inbox,
  AlertOctagon,
  TrendingUp,
  ChevronRight,
  ShieldCheck,
  CheckCircle,
  FileCheck,
  FilePlus,
  UserCheck,
  Search,
  Filter,
  Trash2,
  Lock,
  Clock,
  User,
  Edit,
  Save,
  Check,
  Send,
  X,
  Printer,
  FileText,
  Plus,
  PlusCircle,
  Calendar,
  Layers,
  LogOut,
  Download,
  Eye,
  ShoppingBag,
  Bell
} from 'lucide-react';

export type AppTab = 
  | 'defibrillateurs'
  | 'autres-materiels'
  | 'clients'
  | 'variables'
  | 'fsm'
  | 'gmao'
  | 'crm'
  | 'devis'
  | 'stocks'
  | 'stocks-distribues'
  | 'achats-fournisseurs'
  | 'ged'
  | 'tickets'
  | 'temps'
  | 'veilles'
  | 'localisations'
  | 'satisfaction'
  | 'statistiques'
  | 'formations'
  | 'stagiaires'
  | 'emargements'
  | 'notifications'
  | 'parametres'
  | 'import-export';

function isNotificationOlderThan3Months(ts?: string): boolean {
  if (!ts) return false;
  let date: Date;
  // Parse format "dd/mm/yyyy HH:mm:ss"
  const matches = ts.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (matches) {
    const [_, day, month, year, hour, minute, second] = matches;
    date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  } else {
    const parsed = Date.parse(ts);
    if (isNaN(parsed)) {
      return false; // Can't parse, preserve to be safe
    }
    date = new Date(parsed);
  }
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  return date.getTime() < threeMonthsAgo.getTime();
}

function getContrastingTextColor(hexColor?: string) {
  if (!hexColor) return '#000000';
  let hex = hexColor.trim().replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length !== 6) return '#000000';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#000000';
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

export default function App() {
  // Database States (declared at top of component to be in scope for handlers)
  const [isFirebaseLoaded, setIsFirebaseLoaded] = useState<boolean>(false);
  const [loadedTenantIdState, setLoadedTenantIdState] = useState<string>('');
  const [clients, setClients] = useState<Client[]>([]);

  // Authentication & Session States
  const [tenantId, setTenantIdState] = useState<string>(() => {
    return localStorage.getItem('defib_tenant_id') || 'demo';
  });

  const [isBlockedByPrez, setIsBlockedByPrez] = useState<boolean>(false);
  const [prezCountdown, setPrezCountdown] = useState<number>(5);
  const [isSubscriptionInactive, setIsSubscriptionInactive] = useState<boolean>(false);
  const [paymentUrl, setPaymentUrl] = useState<string>('');

  const [locationNames, setLocationNames] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`defib_${tenantId}_custom_location_names`);
      setLocationNames(saved ? JSON.parse(saved) : {});
      
      const savedEnable = localStorage.getItem(`defib_${tenantId}_enable_other_equipments`);
      setEnableOtherEquipments(savedEnable || 'Non');
    } catch (e) {
      setLocationNames({});
      setEnableOtherEquipments('Non');
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId === 'demo') {
      localStorage.setItem('defib_short_env_id', 'D18');
      setIsBlockedByPrez(false);
      setIsSubscriptionInactive(false);
      setPaymentUrl('');
    } else {
      getRegisteredTenants().then(tenants => {
        const found = tenants.find(t => t.id === tenantId);
        if (found) {
          if (found.shortEnvId) {
            localStorage.setItem('defib_short_env_id', found.shortEnvId);
          } else {
            localStorage.setItem('defib_short_env_id', 'D18');
          }
          if (found.lang) {
            setLanguage(found.lang);
          }
          const loggedRole = localStorage.getItem('defib_logged_user_role') || '';
          setIsBlockedByPrez(!!found.blockedForPrez && loggedRole !== 'megaadmin');
          setIsSubscriptionInactive(found.subscriptionActive === false);
          setPaymentUrl(found.paymentUrl || '');
        } else {
          localStorage.setItem('defib_short_env_id', 'D18');
          setIsBlockedByPrez(false);
          setIsSubscriptionInactive(false);
          setPaymentUrl('');
        }
      }).catch(err => {
        console.error('Error fetching tenant details on startup/change:', err);
      });
    }
  }, [tenantId]);

  const loadedTenantIdRef = useRef<string>('');
  const loadedDataRef = useRef<Record<string, string>>({});

  const [isSatisfactionFormPage] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      return path.includes('/satisfaction') || hash.includes('/satisfaction') || hash.includes('#satisfaction');
    }
    return false;
  });

  const [loggedUser, setLoggedUser] = useState<{ email: string; name: string } | null>(() => {
    try {
      const saved = localStorage.getItem('defib_admin_logged_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.email) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error reading defib_admin_logged_user:', e);
    }
    return null;
  });

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      const loggedInFlag = localStorage.getItem('defib_admin_logged_in') === 'true';
      const savedUser = localStorage.getItem('defib_admin_logged_user');
      if (loggedInFlag && savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed && typeof parsed === 'object' && parsed.email) {
          return true;
        }
      }
    } catch (e) {
      console.error('Error reading login status:', e);
    }
    return false;
  });
  const [showEnvLoading, setShowEnvLoading] = useState<boolean>(false);
  const [minEnvLoading, setMinEnvLoading] = useState<boolean>(true);
  const [envReloadTrigger, setEnvReloadTrigger] = useState<number>(0);
  const [avisageConfirmTour, setAvisageConfirmTour] = useState<any | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return !navigator.onLine;
    }
    return false;
  });
  const [windowWidth, setWindowWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth;
    }
    return 1000;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    startDOMTranslation();
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('resize', handleResize);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLoginSuccess = (email: string, name: string, activeTenantId?: string, loggedInRole?: string) => {
    const tenantToSet = activeTenantId || 'demo';
    
    // Purge volatile local cached payloads
    purgeAllLocalEnvironmentCaches(tenantToSet);

    // Immediately clear all in-memory database states to prevent any cross-tenant state bleed
    setClients([]);
    setDefibrillateurs([]);
    setOtherEquipments([]);
    setVariables([]);
    setStocks([]);
    setDistributedStocks([]);
    setTickets([]);
    setPointages([]);
    setPointagesAutoVigilance([]);
    setCommercialDocs([]);
    setCustomerReviews([]);
    setNotifications([]);
    setGedDocs([]);
    setExpenses([]);
    setVeilles([]);
    setGeneratedReports([]);
    setFsmTours([]);
    setMemos([]);
    setAchatsFournisseurs([]);
    setFormations([]);
    setStagiaires([]);
    setEmargements([]);
    setLogisticsNotifications([]);
    setMembers([]);
    setCompanyInfo({
      name: tenantToSet === 'demo' ? "DÃ©fibeo Solutions" : "Mon Cabinet",
      logo: "",
      website: "",
      email: "",
      phone: ""
    });
    loadedDataRef.current = {};
    setIsFirebaseLoaded(false);
    setLoadedTenantIdState('');

    setTenantIdState(tenantToSet);
    setFirebaseTenantId(tenantToSet);
    localStorage.setItem('defib_tenant_id', tenantToSet);

    setIsLoggedIn(true);
    const user = { email, name };
    setLoggedUser(user);
    localStorage.setItem('defib_admin_logged_in', 'true');
    localStorage.setItem('defib_admin_logged_user', JSON.stringify(user));

    const roleToSet = loggedInRole || 'admin';
    localStorage.setItem('defib_logged_user_role', roleToSet);
    setActiveTab('defibrillateurs');

    setEnvReloadTrigger(prev => prev + 1);

    // Optimistically set isBlockedByPrez if the environment is blocked
    if (tenantToSet !== 'demo' && roleToSet !== 'megaadmin') {
      getRegisteredTenants().then(tenants => {
        const found = tenants.find(t => t.id === tenantToSet);
        if (found && found.blockedForPrez) {
          setIsBlockedByPrez(true);
        } else {
          setIsBlockedByPrez(false);
        }
      }).catch(() => {});
    } else {
      setIsBlockedByPrez(false);
    }

    if (roleToSet === 'megaadmin') {
      return;
    }

    const emailLower = email.trim().toLowerCase();
    const matchedClient = clients.find(c => c.email && c.email.toLowerCase() === emailLower);

    if (emailLower === 'tech.ouest@defibeo.com' || roleToSet === 'technicien') {
      const techSession = {
        name: name || 'Technicien',
        role: 'Maintenance Terrain',
        email: emailLower,
        status: 'Actif',
        lastActive: 'En ligne',
        pin: 'xxxx'
      };
      localStorage.setItem('defib_active_tech_session', JSON.stringify(techSession));
      setIsPublicPortalOpen(true);
    } else if (matchedClient) {
      setIsClientPortalOpen(true);
      setActivePortalClient(matchedClient);
    } else if (emailLower === 'client@demo.com') {
      setIsClientPortalOpen(true);
      const spoClient = clients.find(c => c.id === 'c1') || {
        id: 'c1',
        denomination: 'Secours Pro Ouest',
        siret: '12345678901234',
        email: 'contact@secours-ouest.fr',
        phone: '+33 6 12 34 56 78',
        accessKey: 'ABCDE12345',
        nomPrenomSite: 'Jean-Marc DUPONT',
        telephoneSite: '+33 6 12 34 56 78',
        emailSite: 'jm.dupont@secours-ouest.fr',
        contrat: 'Oui',
        nomContrat: 'Abonnement Maintenance Premium',
        referenceContrat: 'REF-2026-SPO',
        debutContrat: '2026-01-01',
        finContrat: '2029-12-31'
      };
      setActivePortalClient(spoClient);
    }
  };

  const handleLogout = () => {
    // Purge local cached payloads on logout to avoid residual tenant leaks
    purgeAllLocalEnvironmentCaches();

    // Immediately clear all database states
    setClients([]);
    setDefibrillateurs([]);
    setOtherEquipments([]);
    setVariables([]);
    setStocks([]);
    setDistributedStocks([]);
    setTickets([]);
    setPointages([]);
    setPointagesAutoVigilance([]);
    setCommercialDocs([]);
    setCustomerReviews([]);
    setNotifications([]);
    setGedDocs([]);
    setExpenses([]);
    setVeilles([]);
    setGeneratedReports([]);
    setFsmTours([]);
    setMemos([]);
    setAchatsFournisseurs([]);
    setFormations([]);
    setStagiaires([]);
    setEmargements([]);
    setLogisticsNotifications([]);
    setMembers([]);
    setCompanyInfo({
      name: "Mon Cabinet",
      logo: "",
      website: "",
      email: "",
      phone: ""
    });
    loadedDataRef.current = {};
    setIsFirebaseLoaded(false);
    setLoadedTenantIdState('');

    setIsLoggedIn(false);
    setLoggedUser(null);
    setTenantIdState('demo');
    setFirebaseTenantId('demo');
    localStorage.setItem('defib_tenant_id', 'demo');
    localStorage.removeItem('defib_admin_logged_in');
    localStorage.removeItem('defib_admin_logged_user');
    localStorage.removeItem('defib_logged_user_role');
    localStorage.removeItem('defib_active_tech_session');
    setEnvReloadTrigger(prev => prev + 1);
    
    // Clear help_dismissed keys from sessionStorage and localStorage on logout
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('help_dismissed')) {
          sessionStorage.removeItem(key);
        }
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('help_dismissed')) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.error(e);
    }

    setIsPublicPortalOpen(false);
    setIsClientPortalOpen(false);
    setActivePortalClient(null);
  };

  useEffect(() => {
    if (!isBlockedByPrez) {
      setPrezCountdown(5);
      return;
    }

    const interval = setInterval(() => {
      setPrezCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isBlockedByPrez]);

  // Auto-route on initial mount or updates if already logged in as Technician or Client
  useEffect(() => {
    if (isLoggedIn && loggedUser) {
      const role = localStorage.getItem('defib_logged_user_role');
      if (loggedUser.email === 'tech.ouest@defibeo.com' || role === 'technicien') {
        setIsPublicPortalOpen(true);
        const techSession = {
          name: loggedUser.name || 'Technicien',
          role: 'Maintenance Terrain',
          email: loggedUser.email,
          status: 'Actif',
          lastActive: 'En ligne',
          pin: 'xxxx'
        };
        if (!localStorage.getItem('defib_active_tech_session')) {
          localStorage.setItem('defib_active_tech_session', JSON.stringify(techSession));
        }
      } else {
        const loggedEmailLower = loggedUser.email.trim().toLowerCase();
        const matchedClient = clients.find(c => c.email && c.email.trim().toLowerCase() === loggedEmailLower);
        if (matchedClient) {
          setIsClientPortalOpen(true);
          setActivePortalClient(matchedClient);
        } else if (loggedEmailLower === 'client@demo.com') {
          setIsClientPortalOpen(true);
          if (!activePortalClient && clients.length > 0) {
            const spoClient = clients.find(c => c.id === 'c1');
            if (spoClient) {
              setActivePortalClient(spoClient);
            }
          }
        }
      }
    }
  }, [isLoggedIn, loggedUser, clients]);

  // Automatic logout after 1 hour of inactivity for all session types (admin, client, technician)
  useEffect(() => {
    if (!isLoggedIn) return;

    let timeoutId: any;

    const resetTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        handleLogout();
      }, 3600000); // 1 hour = 3600000 ms
    };

    // Listen to user activity events
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ];

    // Initialize the inactivity timer
    resetTimer();

    // Attach listeners to document and window
    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isLoggedIn]);

  // Device Clock
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Tab Routing
  const [currentLang, setCurrentLang] = useState(() => getLanguage());
  useEffect(() => {
    const handleLangChange = () => {
      setCurrentLang(getLanguage());
    };
    window.addEventListener('defib_lang_changed', handleLangChange);
    return () => window.removeEventListener('defib_lang_changed', handleLangChange);
  }, []);

  const [activeTab, rawSetActiveTab] = useState<AppTab>(() => {
    try {
      if (localStorage.getItem('open_settings_after_reload') === 'true') {
        return 'parametres';
      }
    } catch (_) {}
    return 'defibrillateurs';
  });
  const setActiveTab = (newTab: AppTab | ((prev: AppTab) => AppTab), bypassBlock = false) => {
    const resolvedTab = typeof newTab === 'function' ? (newTab as Function)(activeTab) : newTab;

    if (!bypassBlock && resolvedTab !== activeTab) {
      const ADMIN_FORM_IDS = [
        'achats-fournisseurs-form',
        'client-form',
        'equipement-stock-form',
        'other-eq-core-form',
        'distributed-stock-form',
        'import-export-creation-form',
        'defibrillateur-core-form',
        'gmao-correction-form',
        'ged-document-form',
        'tickets-caisse-form',
        'materiel-core-form',
        'variable-form',
      ];

      let openForm: HTMLElement | null = null;
      for (const id of ADMIN_FORM_IDS) {
        const el = document.getElementById(id);
        if (el) {
          openForm = el;
          break;
        }
      }

      if (openForm) {
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const activeTabContent = document.getElementById('active-tab-content-wrapper') || document.getElementById('main-content') || openForm;
        if (activeTabContent) {
          activeTabContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        const formId = openForm.id;
        let submitBtn = document.querySelector(`button[form="${formId}"]`) || openForm.querySelector('button[type="submit"]');

        if (!submitBtn) {
          const allButtons = document.querySelectorAll('button');
          for (const btn of Array.from(allButtons)) {
            const text = btn.innerText || '';
            if (text.includes('Enregistrer') || text.includes('Sauvegarder') || text.includes('Valider')) {
              submitBtn = btn;
              break;
            }
          }
        }

        if (submitBtn) {
          submitBtn.classList.remove('shake-element');
          void (submitBtn as HTMLElement).offsetWidth; // Trigger reflow
          submitBtn.classList.add('shake-element');
          setTimeout(() => {
            submitBtn?.classList.remove('shake-element');
          }, 500);
        }
        return;
      }
    }

    rawSetActiveTab(resolvedTab);
  };
  const [distributedStocksSearchQuery, setDistributedStocksSearchQuery] = useState('');
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('open_settings_after_reload') === 'true') {
        localStorage.removeItem('open_settings_after_reload');
      }
    } catch (_) {}
  }, []);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isPublicPortalOpen, setIsPublicPortalOpen] = useState(false);
  const [isClientPortalOpen, setIsClientPortalOpen ] = useState(false);
  const [activePortalClient, setActivePortalClient] = useState<Client | null>(null);
  const [showStockForm, setShowStockForm] = useState(false);

  // Ticket UI filters and states
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'Tous' | 'Nouveau' | 'En cours' | 'RÃ©solu'>('Tous');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [repliesDraft, setRepliesDraft] = useState<Record<string, string>>({});

  // Database States
  const [variables, setVariables] = useState<Variable[]>([]);
  const [defibrillateurs, setDefibrillateurs] = useState<Defibrillateur[]>([]);
  const [otherEquipments, setOtherEquipments] = useState<OtherEquipment[]>([]);
  const [pointagesAutoVigilance, setPointagesAutoVigilance] = useState<PointageAutoVigilance[]>([]);
  const [enableOtherEquipments, setEnableOtherEquipments] = useState<string>(() => {
    return localStorage.getItem('defib_enable_other_equipments') || 'Non';
  });
  const [stocks, setStocks] = useState<StockRecord[]>([]);
  const [fsmOpenPieceDropdownId, setFsmOpenPieceDropdownId] = useState<string | null>(null);
  const [fsmPieceSearch, setFsmPieceSearch] = useState('');
  const [fsmSearchQuery, setFsmSearchQuery] = useState('');
  const [gmaoSearchQuery, setGmaoSearchQuery] = useState('');
  const [gmaoFilter, setGmaoFilter] = useState<'upcoming' | 'moderation' | 'validated'>('moderation');
  const [managingReportId, setManagingReportId] = useState<string | null>(null);
  const [fsmDateFilter, setFsmDateFilter] = useState<string>('Tous');
  const [fsmRegionFilter, setFsmRegionFilter] = useState<string>('Tous');
  const [fsmTechFilter, setFsmTechFilter] = useState<string>('Tous');
  const [fsmPlannerFilter, setFsmPlannerFilter] = useState<string>('Tous');
  const [fsmPlanningSidePaneOpen, setFsmPlanningSidePaneOpen] = useState<boolean>(false);
  const [fsmTourDrafts, setFsmTourDrafts] = useState<Record<string, any>>({});
  const [savingTourIds, setSavingTourIds] = useState<Record<string, boolean>>({});
  const [fsmExpandedMissions, setFsmExpandedMissions] = useState<Record<string, boolean>>({});

  const toggleFsmMissionExpanded = (missionKey: string) => {
    setFsmExpandedMissions(prev => ({
      ...prev,
      [missionKey]: !prev[missionKey]
    }));
  };

  const [distributedStocks, setDistributedStocks] = useState<DistributedStockLocation[]>([]);

  const saveStocks = (updated: StockRecord[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    // Check for stock transition: from >= 1 to 0 or 1
    const newNotifs: LogisticsNotification[] = [];
    const nowStr = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    updated.forEach(item => {
      const oldItem = stocks.find(s => s.id === item.id);
      if (oldItem && oldItem.quantite >= 1 && item.quantite <= 1 && item.quantite < oldItem.quantite) {
        const variableMatch = variables.find(v => v.id === item.denominationPieceId);
        const refName = item.ugs || (variableMatch ? variableMatch.nom : item.denominationPieceId);
        newNotifs.push({
          id: 'lognotif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          horodatage: nowStr,
          description: `Niveau de stock disponible pour "${refName}" passÃ© de ${oldItem.quantite} Ã  ${item.quantite}.`,
          ugs: item.ugs || refName || item.id,
          commentaire: ''
        });
      }
    });

    if (newNotifs.length > 0) {
      saveLogisticsNotifications([...newNotifs, ...logisticsNotifications]);
    }

    setStocks(updated);
    const strS = JSON.stringify(updated);
    safeSetLocalStorage(`defib_${tenantId}_stocks`, strS);
    loadedDataRef.current.stocks = strS;
    if (tenantId) {
      saveCollectionToFirestore('stocks', updated, tenantId);
    }
  };

  const saveDistributedStocks = (updated: DistributedStockLocation[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    // Check for distributed stock transition: from >= 1 to 0 or 1
    const newNotifs: LogisticsNotification[] = [];
    const nowStr = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    updated.forEach(item => {
      const oldItem = distributedStocks.find(ds => ds.id === item.id);
      if (oldItem && oldItem.volumeDisponible >= 1 && item.volumeDisponible <= 1 && item.volumeDisponible < oldItem.volumeDisponible) {
        const variableMatch = variables.find(v => v.id === item.denominationPieceId);
        const refName = item.ugs || (variableMatch ? variableMatch.nom : item.denominationPieceId);
        const locName = item.locationName ? ` (${item.locationName})` : '';
        newNotifs.push({
          id: 'lognotif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          horodatage: nowStr,
          description: `Niveau de stock distribuÃ© disponible pour "${refName}"${locName} passÃ© de ${oldItem.volumeDisponible} Ã  ${item.volumeDisponible}.`,
          ugs: item.ugs || refName || item.id,
          commentaire: ''
        });
      }
    });

    if (newNotifs.length > 0) {
      saveLogisticsNotifications([...newNotifs, ...logisticsNotifications]);
    }

    setDistributedStocks(updated);
    const strDS = JSON.stringify(updated);
    safeSetLocalStorage(`defib_${tenantId}_distributed_stocks`, strDS);
    loadedDataRef.current.distributed_stocks = strDS;
    if (tenantId) {
      saveCollectionToFirestore('distributed_stocks', updated, tenantId);
    }
  };
  
  // Custom states added for Public Portal & CRM Incident Ticketing
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "DÃ©fibeo Solutions",
    logo: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=80&auto=format&fit=crop",
    website: "29382302.defibeo.com",
    email: "contact@defibeo-solutions.com",
    phone: "+33 1 47 20 00 01"
  });

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState && companyInfo) {
      let updated = false;
      const nextCompanyInfo = { ...companyInfo };

      if (companyInfo.customLocationNames) {
        setLocationNames(companyInfo.customLocationNames);
        localStorage.setItem(`defib_${tenantId}_custom_location_names`, JSON.stringify(companyInfo.customLocationNames));
      } else {
        try {
          const saved = localStorage.getItem(`defib_${tenantId}_custom_location_names`);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Object.keys(parsed).length > 0) {
              nextCompanyInfo.customLocationNames = parsed;
              setLocationNames(parsed);
              updated = true;
            }
          }
        } catch (e) {}
      }

      if (companyInfo.enableAutoEmails) {
        localStorage.setItem(`defib_${tenantId}_enable_auto_emails`, companyInfo.enableAutoEmails);
      } else {
        const saved = localStorage.getItem(`defib_${tenantId}_enable_auto_emails`) as 'Oui' | 'Non' | null;
        if (saved) {
          nextCompanyInfo.enableAutoEmails = saved;
          updated = true;
        }
      }

      if (updated) {
        const str = JSON.stringify(nextCompanyInfo);
        loadedDataRef.current.companyInfo = str;
        setCompanyInfo(nextCompanyInfo);
      }
    }
  }, [companyInfo, tenantId, isFirebaseLoaded, loadedTenantIdState]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === 'defib_company_info' || e.key === `defib_${tenantId}_company_info`) {
        if (e.newValue) {
          try {
            const info = JSON.parse(e.newValue);
            setCompanyInfo(info);
          } catch (err) {}
        }
      }
      if (e.key === 'defib_fsm_tours' || e.key === `defib_${tenantId}_fsm_tours`) {
        if (e.newValue) {
          try {
            const tours = JSON.parse(e.newValue);
            setFsmTours(tours);
          } catch (err) {}
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [tenantId]);
  const [members, setMembers] = useState<Member[]>([]);

  const [themeRefreshTrigger, setThemeRefreshTrigger] = useState(0);
  const [faviconRefreshTrigger, setFaviconRefreshTrigger] = useState(0);

  useEffect(() => {
    const handleThemeEvent = () => {
      setThemeRefreshTrigger(prev => prev + 1);
    };
    const handleFaviconEvent = (e: any) => {
      setFaviconRefreshTrigger(prev => prev + 1);
      if (e?.detail?.faviconUrl && typeof document !== 'undefined') {
        let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.type = 'image/png';
        link.href = e.detail.faviconUrl;
      }
    };
    window.addEventListener('defib-theme-changed', handleThemeEvent);
    window.addEventListener('defib-favicon-changed', handleFaviconEvent);
    return () => {
      window.removeEventListener('defib-theme-changed', handleThemeEvent);
      window.removeEventListener('defib-favicon-changed', handleFaviconEvent);
    };
  }, []);

  const currentLoggedInMember = useMemo(() => {
    if (!loggedUser) return null;
    const emailLower = loggedUser.email?.trim().toLowerCase();
    const nameLower = loggedUser.name?.trim().toLowerCase();
    return members.find(m => 
      (emailLower && m.email?.trim().toLowerCase() === emailLower) ||
      (nameLower && m.name?.trim().toLowerCase() === nameLower)
    ) || null;
  }, [loggedUser, members]);

  const currentFavicon = useMemo(() => {
    const userEmail = loggedUser?.email?.trim().toLowerCase() || '';

    // 1. From currentLoggedInMember faviconPreference
    if (currentLoggedInMember?.faviconPreference) {
      const found = APP_FAVICONS.find(f => f.id === currentLoggedInMember.faviconPreference || f.url === currentLoggedInMember.faviconPreference);
      if (found) return found;
    }

    // 2. From members list matching userEmail
    if (userEmail) {
      const mem = members.find(m => m.email?.trim().toLowerCase() === userEmail);
      if (mem?.faviconPreference) {
        const found = APP_FAVICONS.find(f => f.id === mem.faviconPreference || f.url === mem.faviconPreference);
        if (found) return found;
      }
      const tenantKey = tenantId || 'demo';
      const userFavicon = localStorage.getItem(`defib_${tenantKey}_user_${userEmail}_favicon`) || localStorage.getItem(`defib_user_favicon_${userEmail}`);
      if (userFavicon) {
        const found = APP_FAVICONS.find(f => f.id === userFavicon || f.url === userFavicon);
        if (found) return found;
      }
    }

    // 3. Fallback to localStorage
    const tenantKey = tenantId || 'demo';
    const savedFavicon = localStorage.getItem(`defib_${tenantKey}_favicon`) || localStorage.getItem('defib_current_user_favicon');
    if (savedFavicon) {
      const found = APP_FAVICONS.find(f => f.id === savedFavicon || f.url === savedFavicon);
      if (found) return found;
    }

    // 4. Default: serious_blue
    return APP_FAVICONS.find(f => f.id === 'serious_blue') || APP_FAVICONS[1] || APP_FAVICONS[0];
  }, [currentLoggedInMember, loggedUser, members, tenantId, faviconRefreshTrigger]);

  // Effect to update document favicon dynamically
  useEffect(() => {
    if (typeof document !== 'undefined' && currentFavicon?.url) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.type = 'image/png';
      link.href = currentFavicon.url;
    }
  }, [currentFavicon]);

  const currentSidebarTheme = useMemo(() => {
    const userEmail = loggedUser?.email?.trim().toLowerCase() || '';

    // 1. From currentLoggedInMember themePreference
    if (currentLoggedInMember?.themePreference) {
      const found = APP_THEMES.find(t => t.id === currentLoggedInMember.themePreference || t.color.toLowerCase() === currentLoggedInMember.themePreference?.toLowerCase());
      if (found) return found;
    }

    // 2. From members list matching userEmail
    if (userEmail) {
      const mem = members.find(m => m.email?.trim().toLowerCase() === userEmail);
      if (mem?.themePreference) {
        const found = APP_THEMES.find(t => t.id === mem.themePreference || t.color.toLowerCase() === mem.themePreference?.toLowerCase());
        if (found) return found;
      }
      const tenantKey = tenantId || 'demo';
      const userTheme = localStorage.getItem(`defib_${tenantKey}_user_${userEmail}_theme`) || localStorage.getItem(`defib_user_theme_${userEmail}`);
      if (userTheme) {
        const found = APP_THEMES.find(t => t.id === userTheme || t.color.toLowerCase() === userTheme.toLowerCase());
        if (found) return found;
      }
    }

    // 3. Fallback to localStorage
    const tenantKey = tenantId || 'demo';
    const savedTheme = localStorage.getItem(`defib_${tenantKey}_theme`) || localStorage.getItem('defib_current_user_theme');
    if (savedTheme) {
      const found = APP_THEMES.find(t => t.id === savedTheme || t.color.toLowerCase() === savedTheme.toLowerCase());
      if (found) return found;
    }

    // 4. Default: Defibeo NextGen (Violet)
    return APP_THEMES[0];
  }, [currentLoggedInMember, loggedUser, members, tenantId, themeRefreshTrigger]);

  const isDeveloper = useMemo(() => {
    try {
      const roleInStorage = (localStorage.getItem('defib_logged_user_role') || '').toLowerCase();
      if (roleInStorage === 'developpeur' || roleInStorage === 'dÃ©veloppeur') return true;
    } catch (e) {}

    if (currentLoggedInMember?.adminSubRole === 'DÃ©veloppeur' || currentLoggedInMember?.role === 'DÃ©veloppeur') return true;

    if (loggedUser) {
      const emailLower = loggedUser.email?.trim().toLowerCase();
      const nameLower = loggedUser.name?.trim().toLowerCase();
      const found = members.find(m => 
        (emailLower && m.email?.trim().toLowerCase() === emailLower) ||
        (nameLower && m.name?.trim().toLowerCase() === nameLower)
      );
      if (found?.adminSubRole === 'DÃ©veloppeur' || found?.role === 'DÃ©veloppeur') return true;
    }
    return false;
  }, [currentLoggedInMember, loggedUser, members]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [savedMemosMap, setSavedMemosMap] = useState<Record<string, boolean>>({});
  const [activeUser, setActiveUser] = useState<Member | null>(null);
  const [pointages, setPointages] = useState<PointageLog[]>([]);
  const [commercialDocs, setCommercialDocs] = useState<CommercialDoc[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [isDocFormOpen, setIsDocFormOpen] = useState(false);

  const [docType, setDocType] = useState<'Devis' | 'Facture' | 'Proforma' | 'Bon de commande' | 'Bon de livraison'>('Devis');
  const [docRef, setDocRef] = useState('');
  const [docClientId, setDocClientId] = useState('');
  const [docDateStr, setDocDateStr] = useState('');
  const [docStatus, setDocStatus] = useState<'Brouillon' | 'TerminÃ©' | 'AcceptÃ©' | 'RefusÃ©' | 'AnnulÃ©' | 'SupprimÃ©'>('Brouillon');
  const [docItems, setDocItems] = useState<CommercialDocItem[]>([]);
  const [docCommentaire, setDocCommentaire] = useState('');
  const [docCommentaires, setDocCommentaires] = useState('');
  const [docAssignedMemberName, setDocAssignedMemberName] = useState('');
  const [docHasBonCommande, setDocHasBonCommande] = useState(false);
  const [docBonCommandeReference, setDocBonCommandeReference] = useState('');
  const [docBonCommandeLivraison, setDocBonCommandeLivraison] = useState<'Intervention' | 'Transporteur'>('Transporteur');
  const [docBonCommandeSituation, setDocBonCommandeSituation] = useState<'Ouvert' | 'EnvoyÃ© TerminÃ©' | 'EnvoyÃ© Logistique' | 'TerminÃ©'>('Ouvert');
  const [docBonCommandeEntete, setDocBonCommandeEntete] = useState('');
  const [docCodeTaxe, setDocCodeTaxe] = useState('');
  const [docPayeurId, setDocPayeurId] = useState('');
  const [docClientIdField, setDocClientIdField] = useState('');
  const [docUrlSource, setDocUrlSource] = useState('');

  const [selectedDocPieceId, setSelectedDocPieceId] = useState('');
  const [customDocPiecePrice, setCustomDocPiecePrice] = useState(0);
  const [customDocPieceQty, setCustomDocPieceQty] = useState(1);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'Tous' | 'Devis' | 'Facture' | 'Bon de commande' | 'Bon de livraison'>('Tous');
  const [pennylaneActive, setPennylaneActive] = useState(false);
  const [pennylaneAlertMessage, setPennylaneAlertMessage] = useState<string | null>(null);
  const [pennylaneAlertStyle, setPennylaneAlertStyle] = useState<'success' | 'error'>('error');
  const [dropboxActive, setDropboxActive] = useState(false);
  const [dropboxAccessToken, setDropboxAccessToken] = useState('');
  const [dropboxError, setDropboxError] = useState<string | null>(null);

  const showPennylaneAlert = (message: string, type: 'success' | 'error' = 'error') => {
    setPennylaneAlertMessage(message);
    setPennylaneAlertStyle(type);
    setTimeout(() => {
      setPennylaneAlertMessage(prev => prev === message ? null : prev);
    }, 6000);
  };

  const [customerReviews, setCustomerReviews] = useState<any[]>([]);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [logisticsNotifications, setLogisticsNotifications] = useState<LogisticsNotification[]>([]);

  const saveLogisticsNotifications = (updated: LogisticsNotification[]) => {
    setLogisticsNotifications(updated);
    localStorage.setItem(`defib_${tenantId}_logistics_notifications`, JSON.stringify(updated));
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('logistics_notifications', updated, tenantId);
    }
  };

  const addLogisticsNotification = (description: string, ugs: string) => {
    const nowStr = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const newNotif: LogisticsNotification = {
      id: 'lognotif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      horodatage: nowStr,
      description,
      ugs: ugs || 'GÃ‰NÃ‰RAL',
      commentaire: ''
    };
    setLogisticsNotifications((prev) => {
      const updated = [newNotif, ...prev];
      localStorage.setItem(`defib_${tenantId}_logistics_notifications`, JSON.stringify(updated));
      if (isFirebaseLoaded && tenantId) {
        saveCollectionToFirestore('logistics_notifications', updated, tenantId);
      }
      return updated;
    });
  };

  const saveNotifications = (updated: AppNotification[]) => {
    const stamped = updated.map(n => ({
      ...n,
      envId: n.envId || tenantId,
      tenantId: n.tenantId || tenantId,
    }));
    const cleaned = stamped.filter(n => !isNotificationOlderThan3Months(n.timestamp));
    setNotifications(cleaned);
    const str = JSON.stringify(cleaned);
    safeSetLocalStorage(`defib_${tenantId}_notifications`, str);
    loadedDataRef.current.notifications = str;
    if (tenantId) {
      saveCollectionToFirestore('notifications', cleaned, tenantId);
    }
  };

  const addNotification = (category: AppNotification['category'], title: string) => {
    const currentTenant = tenantId || (typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') : null) || 'demo';
    const newNotif: AppNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      category,
      title,
      timestamp: getParisTimestamp(),
      situation: 'Nouveau',
      envId: currentTenant,
      tenantId: currentTenant,
    };
    // Fetch latest notifications from current state to prevent stale state issues
    setNotifications((prev) => {
      const updated = [newNotif, ...prev].filter(n => !isNotificationOlderThan3Months(n.timestamp));
      const str = JSON.stringify(updated);
      safeSetLocalStorage(`defib_${currentTenant}_notifications`, str);
      loadedDataRef.current.notifications = str;
      if (currentTenant) {
        saveCollectionToFirestore('notifications', updated, currentTenant);
      }
      return updated;
    });
  };

  const handleUpdateOtherEquipments = (val: string) => {
    setEnableOtherEquipments(val);
    localStorage.setItem(`defib_${tenantId}_enable_other_equipments`, val);
    
    // Also save in companyInfo
    setCompanyInfo(prev => {
      const updated = { ...prev, enableOtherEquipments: val };
      localStorage.setItem(`defib_${tenantId}_company_info`, JSON.stringify(updated));
      if (isFirebaseLoaded && tenantId) {
        saveCollectionToFirestore('companyInfo', updated, tenantId);
      }
      return updated;
    });

    addNotification('SystÃ¨me', 'Un utilisateur vient de modifier les prÃ©fÃ©rences pour les autres types dâ€™Ã©quipements.');
  };

  const [achatsFournisseurs, setAchatsFournisseurs] = useState<AchatFournisseur[]>([]);

  const saveAchatsFournisseurs = (updated: AchatFournisseur[]) => {
    setAchatsFournisseurs(updated);
    localStorage.setItem(`defib_${tenantId}_achats_fournisseurs`, JSON.stringify(updated));
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('achats_fournisseurs', updated, tenantId);
    }
  };

  const [formations, setFormations] = useState<FormationRecord[]>([]);
  const saveFormations = (updated: FormationRecord[]) => {
    setFormations(updated);
    localStorage.setItem(`defib_${tenantId}_formations`, JSON.stringify(updated));
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('formations', updated, tenantId);
    }
  };

  const [stagiaires, setStagiaires] = useState<StagiaireRecord[]>([]);
  const saveStagiaires = (updated: StagiaireRecord[]) => {
    setStagiaires(updated);
    localStorage.setItem(`defib_${tenantId}_stagiaires`, JSON.stringify(updated));
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('stagiaires', updated, tenantId);
    }
  };

  const [emargements, setEmargements] = useState<EmargementRecord[]>([]);
  const saveEmargements = (updated: EmargementRecord[]) => {
    setEmargements(updated);
    localStorage.setItem(`defib_${tenantId}_emargements`, JSON.stringify(updated));
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('emargements', updated, tenantId);
    }
  };

  const [gedDocs, setGedDocs] = useState<GedDocument[]>([]);
  const [isGedFormOpen, setIsGedFormOpen] = useState(false);
  const [gedTitle, setGedTitle] = useState('');
  const [gedCategory, setGedCategory] = useState<'Manuel de conformitÃ©' | "Fiche de visite d'audit" | 'Autre'>('Manuel de conformitÃ©');
  const [gedFileName, setGedFileName] = useState('');
  const [selectedGedFile, setSelectedGedFile] = useState<File | null>(null);




  const saveReviews = (updated: any[]) => {
    setCustomerReviews(updated);
    localStorage.setItem(`defib_${tenantId}_customer_reviews`, JSON.stringify(updated));
  };

  const [editingPointageId, setEditingPointageId] = useState<string | null>(null);
  const [editPointageForm, setEditPointageForm] = useState<{
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
  } | null>(null);

  const [expenses, setExpenses] = useState<any[]>([]);
  const [veilles, setVeilles] = useState<VeilleRecord[]>([]);

  // Sync and manage technician generated reports in main GMAO tab
  const [generatedReports, setGeneratedReports] = useState<any[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editReportForm, setEditReportForm] = useState<{
    title: string;
    techName: string;
    defibIdentifiant: string;
    siteMission: string;
  } | null>(null);

  const saveReports = (updated: any[]) => {
    setGeneratedReports(updated);
    try {
      localStorage.setItem(`defib_${tenantId}_generated_reports`, JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage quota exceeded in saveReports:", e);
    }
    if (isFirebaseLoaded && tenantId === loadedTenantIdRef.current) {
      saveCollectionToFirestore('generatedReports', updated, tenantId);
    }
  };

  const [fsmTours, setFsmTours] = useState<any[]>([]);

  const saveFsmTours = (updated: any[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    setFsmTours(updated);
    try {
      localStorage.setItem(`defib_${tenantId}_fsm_tours`, JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage quota exceeded in saveFsmTours:", e);
    }
    if (isFirebaseLoaded && tenantId === loadedTenantIdRef.current) {
      saveCollectionToFirestore('fsmTours', updated, tenantId);
    }
  };

  // Synchronize tour missions with pending report lines in GMAO "Rapports PDF"
  useEffect(() => {
    if (!fsmTours || fsmTours.length === 0) return;

    // 1. Ensure all missions have a unique interventionReference
    let toursUpdated = false;
    const verifiedTours = fsmTours.map((tour) => {
      let tourMissionsUpdated = false;
      const verifiedMissions = (tour.missions || []).map((m: any) => {
        if (!m.interventionReference) {
          tourMissionsUpdated = true;
          const cleanId = String(m.id || Date.now()).replace('fsm-m-', '');
          const ref = `INT-2026-${cleanId.slice(-5)}`;
          return { ...m, status: m.status || 'Brouillon', interventionReference: ref };
        }
        return { ...m, status: m.status || 'Brouillon' };
      });

      if (tourMissionsUpdated) {
        toursUpdated = true;
        return { ...tour, missions: verifiedMissions };
      }
      return tour;
    });

    if (toursUpdated) {
      saveFsmTours(verifiedTours);
      return;
    }

    // 2. Map active missions across all tours
    const activeMissionsMap = new Map<string, { mission: any; tour: any }>();
    verifiedTours.forEach((tour) => {
      (tour.missions || []).forEach((m: any) => {
        if (m.id) {
          activeMissionsMap.set(m.id, { mission: m, tour });
        }
        if (m.interventionReference) {
          activeMissionsMap.set(m.interventionReference, { mission: m, tour });
        }
      });
    });

    const isFormationMission = (m: any) => {
      if (!m) return false;
      return (
        m.equipmentType === 'Formation' ||
        m.equipmentType?.toLowerCase()?.includes('formation') ||
        !!m.formationId ||
        m.reason?.toLowerCase()?.includes('formation') ||
        m.defibIdentifiant === 'Formation'
      );
    };

    // 3. Synchronize generatedReports array
    let reportsChanged = false;
    
    // Filter out Formation mission reports and orphaned pending upcoming reports
    let updatedReports = generatedReports.filter((rep) => {
      const matchedMissionObj = 
        (rep.missionId && activeMissionsMap.get(rep.missionId)?.mission) ||
        (rep.interventionReference && activeMissionsMap.get(rep.interventionReference)?.mission);

      const isFormation = 
        rep.equipmentType === 'Formation' ||
        rep.equipmentType?.toLowerCase()?.includes('formation') ||
        rep.defibSnapshot?.categorie === 'Formation' ||
        rep.defibSnapshot?.categorie?.toLowerCase()?.includes('formation') ||
        !!rep.formationId ||
        rep.defibIdentifiant === 'Formation' ||
        (matchedMissionObj && isFormationMission(matchedMissionObj));

      if (isFormation) {
        reportsChanged = true;
        return false; // Do NOT create or keep record/report in RAPPORT PDF for Formation missions
      }

      const isUpcoming = rep.isUpcoming || rep.status === 'Ã€ venir';
      if (isUpcoming) {
        const existsInTours = 
          (rep.missionId && activeMissionsMap.has(rep.missionId)) || 
          (rep.interventionReference && activeMissionsMap.has(rep.interventionReference));
        if (!existsInTours) {
          reportsChanged = true;
          return false; // Remove pending report since mission was deleted
        }
      }
      return true;
    });

    // Ensure each active NON-FORMATION mission has an associated report (either real or pending)
    verifiedTours.forEach((tour) => {
      (tour.missions || []).forEach((m: any) => {
        if (isFormationMission(m)) return; // DO NOT create report line for Formation missions

        const existingReportIndex = updatedReports.findIndex(r => 
          (m.id && r.missionId === m.id) || 
          (m.interventionReference && r.interventionReference === m.interventionReference)
        );

        const tourOrigin = `${tour.startDate || tour.date || ''} ${tour.title || tour.name || ''}`.trim();

        if (existingReportIndex === -1) {
          // Pre-create pending report line in Rapports PDF
          reportsChanged = true;
          const upcomingRep = {
            id: `REP-UPCOMING-${m.id || Date.now()}`,
            missionId: m.id,
            defibIdentifiant: m.defibIdentifiant,
            interventionReference: m.interventionReference,
            isUpcoming: true,
            status: 'Ã€ venir',
            validated: false,
            techName: tour.techName || 'Non assignÃ©',
            date: tour.startDate || tour.date || 'Ã€ venir',
            estimatedDate: m.estimatedDate || tour.startDate || tour.date || '',
            estimatedSlot: m.estimatedSlot || '',
            tourName: tour.title || tour.name || `TournÃ©e ${tour.id}`,
            tourDate: tour.startDate || tour.date || '',
            origin: tourOrigin,
            missionStatus: m.status || 'Brouillon',
            defibSnapshot: { 
              identifiant: m.defibIdentifiant, 
              categorie: m.equipmentType || 'DÃ©fibrillateur' 
            },
            siteMission: m.clientName || 'Site'
          };
          updatedReports.push(upcomingRep);
        } else {
          const existing = updatedReports[existingReportIndex];
          if (existing.isUpcoming) {
            // Keep pending report details synchronized with tour mission changes
            if (
              existing.missionStatus !== (m.status || 'Brouillon') ||
              existing.techName !== (tour.techName || 'Non assignÃ©') ||
              existing.origin !== tourOrigin ||
              existing.defibIdentifiant !== m.defibIdentifiant ||
              existing.estimatedDate !== (m.estimatedDate || tour.startDate || tour.date || '') ||
              existing.estimatedSlot !== (m.estimatedSlot || '')
            ) {
              reportsChanged = true;
              updatedReports[existingReportIndex] = {
                ...existing,
                missionStatus: m.status || 'Brouillon',
                techName: tour.techName || 'Non assignÃ©',
                tourName: tour.title || tour.name || `TournÃ©e ${tour.id}`,
                tourDate: tour.startDate || tour.date || '',
                estimatedDate: m.estimatedDate || tour.startDate || tour.date || '',
                estimatedSlot: m.estimatedSlot || '',
                origin: tourOrigin,
                defibIdentifiant: m.defibIdentifiant,
                defibSnapshot: { ...existing.defibSnapshot, identifiant: m.defibIdentifiant }
              };
            }
          }
        }
      });
    });

    if (reportsChanged) {
      saveReports(updatedReports);
    }
  }, [fsmTours, generatedReports]);

  const optimizeFsmTour = async (
    tourId: string,
    currentToursList: any[] = fsmTours,
    currentMembersList: Member[] = members
  ) => {
    const tour = currentToursList.find(t => t.id === tourId);
    if (!tour) return;

    if (!tour.techName || tour.techName === 'Aucun' || tour.techName.trim() === '') {
      return;
    }

    const tech = currentMembersList.find(m => m.name.trim().toLowerCase() === tour.techName.trim().toLowerCase());
    const hasTechStructured = tech && tech.startAddressLat !== undefined && tech.startAddressLng !== undefined;
    const hasTechString = tech && tech.startAddress && tech.startAddress.trim() !== '';
    if (!tech || (!hasTechStructured && !hasTechString)) {
      return;
    }

    try {
      let startCoord: { lat: number; lng: number } | null = null;
      if (tech.startAddressLat !== undefined && tech.startAddressLng !== undefined) {
        const parsedLat = Number(tech.startAddressLat);
        const parsedLng = Number(tech.startAddressLng);
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
          startCoord = { lat: parsedLat, lng: parsedLng };
        }
      }
      if (!startCoord && tech.startAddress) {
        startCoord = await geocodeAddress(tech.startAddress);
      }

      if (!startCoord) {
        console.warn("Could not determine starting coordinates for technician:", tech.name);
        return;
      }

      const equipmentCoords: Record<string, { lat: number; lng: number }> = {};
      const equipmentDetails: Record<string, any> = {};

      tour.missions.forEach((m: any) => {
        const defib = defibrillateurs.find(d => d.identifiant === m.defibIdentifiant);
        if (defib) {
          equipmentDetails[m.defibIdentifiant] = defib;
          const lat = parseFloat(defib.latitude);
          const lng = parseFloat(defib.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            equipmentCoords[m.defibIdentifiant] = { lat, lng };
          }
        } else {
          const other = otherEquipments.find(o => o.identifiant === m.defibIdentifiant);
          if (other) {
            equipmentDetails[m.defibIdentifiant] = other;
            const lat = parseFloat(other.latitude);
            const lng = parseFloat(other.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
              equipmentCoords[m.defibIdentifiant] = { lat, lng };
            }
          }
        }
      });

      const preference = tech.optimizationPreference || 'proche';
      const sortedMissions = sortMissionsByProximity(tour.missions, startCoord, equipmentCoords, preference as any);

      const activeCountry = getActiveTenantCountry(companyInfo);
      const scheduledMissions = scheduleMissions(sortedMissions, tour.startDate, equipmentDetails, tech, activeCountry);

      const updatedTours = currentToursList.map(t => {
        if (t.id === tourId) {
          return {
            ...t,
            missions: scheduledMissions,
            calculated: true
          };
        }
        return t;
      });

      setFsmTours(updatedTours);
      localStorage.setItem(`defib_${tenantId}_fsm_tours`, JSON.stringify(updatedTours));
      if (isFirebaseLoaded && tenantId === loadedTenantIdRef.current) {
        saveCollectionToFirestore('fsmTours', updatedTours, tenantId);
      }
    } catch (err) {
      console.error("Failed to optimize tour:", tourId, err);
    }
  };

  const addFsmTour = () => {
    const newId = 'fsm-tour-' + Date.now();
    const defaultTech = '';
    const assignedVehicle = 'Aucun';
    setFsmTourDrafts(prev => ({
      ...prev,
      [newId]: {
        title: 'Nouvelle TournÃ©e',
        techName: defaultTech,
        vehicule: assignedVehicle
      }
    }));
    const newTour = {
      id: newId,
      title: 'Nouvelle TournÃ©e',
      techName: defaultTech,
      startDate: new Date().toISOString().split('T')[0],
      status: 'Brouillon',
      missions: [],
      vehicule: assignedVehicle,
      calculated: false
    };
    saveFsmTours([newTour, ...fsmTours]);
  };

  const deleteFsmTour = (tourId: string) => {
    const tour = fsmTours.find(t => t.id === tourId);
    if (!tour) return;
    const currentStatus = tour.status || 'Brouillon';
    if (currentStatus === 'Ã€ faire' || currentStatus === 'En cours') {
      alert("Impossible de supprimer une tournÃ©e dont le statut est Ã€ faire ou En cours.");
      return;
    }
    if (tour.missions) {
      let updatedStocks = stocks.map(st => ({
        ...st,
        quantite: Number(st.quantite) || 0,
        quantiteReservee: Number(st.quantiteReservee) || 0
      }));
      let mutated = false;
      tour.missions.forEach((mission: any) => {
        if (mission.requiredParts && mission.requiredParts.length > 0) {
          mission.requiredParts.forEach((partName: string) => {
            const idx = updatedStocks.findIndex(st => {
              const vObj = variables.find(v => v.id === st.denominationPieceId);
              return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom)) && st.quantiteReservee > 0;
            });
            const idxToUse = idx !== -1 ? idx : updatedStocks.findIndex(st => {
              const vObj = variables.find(v => v.id === st.denominationPieceId);
              return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom));
            });
            if (idxToUse !== -1) {
              const item = updatedStocks[idxToUse];
              updatedStocks[idxToUse] = {
                ...item,
                quantite: item.quantite + 1,
                quantiteReservee: Math.max(0, item.quantiteReservee - 1)
              };
              mutated = true;
            }
          });
        }
      });
      if (mutated) {
        saveStocks(updatedStocks);
      }
    }
    saveFsmTours(fsmTours.filter(t => t.id !== tourId));
  };

  const updateFsmTour = (tourId: string, fields: any) => {
    const existingTour = fsmTours.find(t => t.id === tourId);
    const oldStatus = existingTour?.status || 'Brouillon';
    const newStatus = fields.status || oldStatus;

    const techChanged = fields.techName !== undefined && fields.techName !== existingTour?.techName;
    const dateChanged = fields.startDate !== undefined && fields.startDate !== existingTour?.startDate;
    const isCalculatedValue = (techChanged || dateChanged) ? false : (existingTour?.calculated ?? false);

    const updatedTours = fsmTours.map(t => t.id === tourId ? { ...t, ...fields, calculated: isCalculatedValue } : t);
    saveFsmTours(updatedTours);

    if (newStatus === 'Ã€ faire' && oldStatus !== 'Ã€ faire' && existingTour) {
      const companyName = companyInfo.name || 'DÃ©fibeo Suite';
      const companyEmail = companyInfo.email || '';
      
      const tourTitle = fields.title !== undefined ? fields.title : (existingTour.title || '');
      const techName = fields.techName !== undefined ? fields.techName : (existingTour.techName || '');
      const startDate = fields.startDate !== undefined ? fields.startDate : (existingTour.startDate || '');
      
      let formattedDate = startDate;
      if (startDate && startDate.includes('-')) {
        const parts = startDate.split('-');
        if (parts.length === 3) {
          formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      // Email 8: NOUVELLE TOURNÃ‰E POUR LE TECHNICIEN
      try {
        const matchingTech = members.find(m => m.name.trim().toLowerCase() === (techName || '').trim().toLowerCase());
        const techEmail = matchingTech?.email;
        if (techEmail && techEmail.trim()) {
          triggerEmail8NouvelleTourneeTech(
            techEmail.trim(),
            tourTitle || 'TournÃ©e dâ€™interventions',
            formattedDate || 'prochainement',
            companyName,
            companyEmail
          ).catch(e => console.error("Error sending Email 8:", e));
        }
      } catch (err8) {
        console.error("Error triggering Email 8:", err8);
      }
    }
  };

  const addFsmMission = (tourId: string) => {
    const newMissionId = 'fsm-m-' + Date.now();
    const newMission = {
      id: newMissionId,
      clientName: 'Nouveau Site Client',
      defibIdentifiant: 'PAR-101',
      reason: '',
      reasons: [],
      requiredParts: [],
      status: 'Brouillon',
      priority: 'Normale',
      time: '14:00',
      interventionReference: `INT-2026-${String(Date.now()).slice(-5)}`
    };
    const updatedTours = fsmTours.map(t => {
      if (t.id === tourId) {
        return { ...t, missions: [...t.missions, newMission], calculated: false };
      }
      return t;
    });
    saveFsmTours(updatedTours);
  };

  const deleteFsmMission = (tourId: string, missionId: string) => {
    const tour = fsmTours.find(t => t.id === tourId);
    const mission = tour?.missions.find((m: any) => m.id === missionId);
    if (mission && mission.requiredParts && mission.requiredParts.length > 0) {
      let updatedStocks = stocks.map(st => ({
        ...st,
        quantite: Number(st.quantite) || 0,
        quantiteReservee: Number(st.quantiteReservee) || 0
      }));
      let mutated = false;
      mission.requiredParts.forEach((partName: string) => {
        const idx = updatedStocks.findIndex(st => {
          const vObj = variables.find(v => v.id === st.denominationPieceId);
          return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom)) && st.quantiteReservee > 0;
        });
        const idxToUse = idx !== -1 ? idx : updatedStocks.findIndex(st => {
          const vObj = variables.find(v => v.id === st.denominationPieceId);
          return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom));
        });
        if (idxToUse !== -1) {
          const item = updatedStocks[idxToUse];
          let updatedTraces = Array.isArray(item.traceabilities) ? [...item.traceabilities] : [];
          if (updatedTraces.length > 0) {
            const traceToClearIdx = updatedTraces.findIndex(tr => tr.situation === 'Indisponible' || tr.reservationInfo);
            if (traceToClearIdx !== -1) {
              updatedTraces[traceToClearIdx] = {
                ...updatedTraces[traceToClearIdx],
                situation: 'Disponible',
                reservationInfo: undefined,
                bonCommande: undefined,
                client: undefined,
                dateEstimee: undefined
              };
            }
          }
          updatedStocks[idxToUse] = {
            ...item,
            quantite: item.quantite + 1,
            quantiteReservee: Math.max(0, item.quantiteReservee - 1),
            traceabilities: updatedTraces
          };
          mutated = true;
        }
      });
      if (mutated) {
        saveStocks(updatedStocks);
      }
    }

    const updatedTours = fsmTours.map(t => {
      if (t.id === tourId) {
        return { ...t, missions: t.missions.filter(m => m.id !== missionId), calculated: false };
      }
      return t;
    });
    saveFsmTours(updatedTours);
  };

  const moveFsmMissionToATrier = (tourId: string, missionId: string) => {
    const sourceTour = fsmTours.find(t => t.id === tourId);
    if (!sourceTour) return;
    const missionToMove = sourceTour.missions?.find((m: any) => m.id === missionId);
    if (!missionToMove) return;

    let aTrierExists = false;
    let updatedTours = fsmTours.map(tour => {
      if (tour.id === 'a-trier') {
        aTrierExists = true;
        const exists = (tour.missions || []).some((m: any) => m.id === missionId);
        return {
          ...tour,
          missions: exists ? tour.missions : [...(tour.missions || []), missionToMove]
        };
      }
      if (tour.id === tourId) {
        return {
          ...tour,
          missions: (tour.missions || []).filter((m: any) => m.id !== missionId),
          calculated: false
        };
      }
      return tour;
    });

    if (!aTrierExists) {
      updatedTours.push({
        id: 'a-trier',
        title: 'Missions Ã  trier',
        startDate: 'A trier',
        status: 'Brouillon',
        missions: [missionToMove]
      });
    }

    saveFsmTours(updatedTours);
  };

  const changeFsmMissionParts = (tourId: string, missionId: string, oldParts: string[], newParts: string[], extraFieldsToUpdate?: any) => {
    const added = newParts.filter(p => !oldParts.includes(p));
    const removed = oldParts.filter(p => !newParts.includes(p));

    const tour = fsmTours.find(t => t.id === tourId);
    const mission = tour?.missions?.find((m: any) => m.id === missionId);

    const bcId = extraFieldsToUpdate?.bonCommandeId !== undefined 
      ? extraFieldsToUpdate.bonCommandeId 
      : (mission?.bonCommandeId || '');

    let bcStr = 'â€”';
    if (bcId) {
      const doc = (commercialDocs || []).find((d: any) => d.id === bcId || d.bonCommandeReference === bcId || d.ref === bcId);
      if (doc) {
        bcStr = doc.bonCommandeReference || doc.ref || bcId;
      } else {
        bcStr = bcId;
      }
    }

    let clStr = 'â€”';
    if (mission) {
      if (mission.clientId) {
        const found = clients.find(c => c.id === mission.clientId);
        if (found?.denomination) clStr = found.denomination;
      }
      if (clStr === 'â€”' && mission.defibIdentifiant) {
        const matchedDefib = defibrillateurs.find(df => df.identifiant === mission.defibIdentifiant);
        if (matchedDefib) {
          const found = clients.find(c => c.id === matchedDefib.clientId);
          if (found?.denomination) clStr = found.denomination;
        }
      }
      if (clStr === 'â€”' && mission.clientName) {
        clStr = mission.clientName;
      }
    }

    let dtStr = 'â€”';
    if (mission) {
      dtStr = mission.scheduledDate || mission.date || mission.plannedDate || tour?.startDate || tour?.date || 'â€”';
    } else if (tour) {
      dtStr = tour.startDate || tour.date || 'â€”';
    }

    const reservationText = `${bcStr} â€” ${clStr} â€” ${dtStr}`;

    let updatedStocks = stocks.map(st => ({
      ...st,
      quantite: Number(st.quantite) || 0,
      quantiteReservee: Number(st.quantiteReservee) || 0
    }));
    let stocksMutated = false;

    // Process added items or items to update reservation info for
    newParts.forEach(partName => {
      const partsArr = partName.split(',');
      const lotCandidate = partsArr.length >= 2 ? partsArr[1].trim() : '';

      const stockIdx = updatedStocks.findIndex(st => {
        const vObj = variables.find(v => v.id === st.denominationPieceId);
        return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom)) && st.quantite > 0;
      });

      const idxToUse = stockIdx !== -1 ? stockIdx : updatedStocks.findIndex(st => {
        const vObj = variables.find(v => v.id === st.denominationPieceId);
        return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom));
      });

      if (idxToUse !== -1) {
        const item = updatedStocks[idxToUse];
        let isNewlyAdded = added.includes(partName);
        let newQty = item.quantite;
        let newQtyRes = item.quantiteReservee;

        if (isNewlyAdded) {
          newQty = Math.max(0, item.quantite - 1);
          newQtyRes = item.quantiteReservee + 1;
        }

        let updatedTraces = Array.isArray(item.traceabilities) ? [...item.traceabilities] : [];
        if (updatedTraces.length > 0) {
          let foundTraceIdx = -1;
          if (lotCandidate) {
            foundTraceIdx = updatedTraces.findIndex(tr => tr.lotOrSerial === lotCandidate);
          }
          if (foundTraceIdx === -1) {
            foundTraceIdx = updatedTraces.findIndex(tr => tr.situation === 'Disponible' && !tr.reservationInfo);
          }
          if (foundTraceIdx === -1) {
            foundTraceIdx = updatedTraces.findIndex(tr => tr.situation === 'Disponible');
          }

          if (foundTraceIdx !== -1) {
            const isSent = Array.isArray(mission?.sentToClientParts) && mission.sentToClientParts.includes(partName);
            const currComment = updatedTraces[foundTraceIdx].comment || '';
            let newComment = currComment;
            if (isSent && !currComment.includes('EnvoyÃ©e au client.')) {
              newComment = currComment ? `${currComment.trim()} EnvoyÃ©e au client.` : 'EnvoyÃ©e au client.';
            }

            updatedTraces[foundTraceIdx] = {
              ...updatedTraces[foundTraceIdx],
              situation: 'Indisponible',
              reservationInfo: reservationText,
              bonCommande: bcStr !== 'â€”' ? bcStr : undefined,
              client: clStr !== 'â€”' ? clStr : undefined,
              dateEstimee: dtStr !== 'â€”' ? dtStr : undefined,
              comment: newComment || undefined
            };
          }
        }

        updatedStocks[idxToUse] = {
          ...item,
          quantite: newQty,
          quantiteReservee: newQtyRes,
          traceabilities: updatedTraces
        };
        stocksMutated = true;
      }
    });

    removed.forEach(partName => {
      const partsArr = partName.split(',');
      const lotCandidate = partsArr.length >= 2 ? partsArr[1].trim() : '';

      const stockIdx = updatedStocks.findIndex(st => {
        const vObj = variables.find(v => v.id === st.denominationPieceId);
        return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom)) && st.quantiteReservee > 0;
      });

      const idxToUse = stockIdx !== -1 ? stockIdx : updatedStocks.findIndex(st => {
        const vObj = variables.find(v => v.id === st.denominationPieceId);
        return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom));
      });

      if (idxToUse !== -1) {
        const item = updatedStocks[idxToUse];
        let updatedTraces = Array.isArray(item.traceabilities) ? [...item.traceabilities] : [];
        if (updatedTraces.length > 0) {
          let traceToClearIdx = -1;
          if (lotCandidate) {
            traceToClearIdx = updatedTraces.findIndex(tr => tr.lotOrSerial === lotCandidate);
          }
          if (traceToClearIdx === -1) {
            traceToClearIdx = updatedTraces.findIndex(tr => tr.reservationInfo === reservationText || (bcStr !== 'â€”' && tr.bonCommande === bcStr));
          }
          if (traceToClearIdx !== -1) {
            const currComment = updatedTraces[traceToClearIdx].comment || '';
            const cleanedComment = currComment
              .replace('EnvoyÃ©e au client.', '')
              .replace('EnvoyÃ©e au client', '')
              .trim();

            updatedTraces[traceToClearIdx] = {
              ...updatedTraces[traceToClearIdx],
              situation: 'Disponible',
              reservationInfo: undefined,
              bonCommande: undefined,
              client: undefined,
              dateEstimee: undefined,
              comment: cleanedComment || undefined
            };
          }
        }

        updatedStocks[idxToUse] = {
          ...item,
          quantite: item.quantite + 1,
          quantiteReservee: Math.max(0, item.quantiteReservee - 1),
          traceabilities: updatedTraces
        };
        stocksMutated = true;
      }
    });

    if (stocksMutated) {
      saveStocks(updatedStocks);
    }
    updateFsmMission(tourId, missionId, { requiredParts: newParts, ...extraFieldsToUpdate });
  };

  const togglePartSentToClient = (tourId: string, missionId: string, partName: string) => {
    const tour = fsmTours.find(t => t.id === tourId);
    const mission = tour?.missions?.find((m: any) => m.id === missionId);
    if (!mission) return;

    const sentParts: string[] = Array.isArray(mission.sentToClientParts) ? mission.sentToClientParts : [];
    const isSent = sentParts.includes(partName);
    const newSentParts = isSent
      ? sentParts.filter((p: string) => p !== partName)
      : [...sentParts, partName];

    // Compute formatted reservation info
    const bcId = mission.bonCommandeId || '';
    let bcStr = 'â€”';
    if (bcId) {
      const doc = (commercialDocs || []).find((d: any) => d.id === bcId || d.bonCommandeReference === bcId || d.ref === bcId);
      if (doc) {
        bcStr = doc.bonCommandeReference || doc.ref || bcId;
      } else {
        bcStr = bcId;
      }
    }

    let clStr = 'â€”';
    if (mission.clientId) {
      const found = clients.find(c => c.id === mission.clientId);
      if (found?.denomination) clStr = found.denomination;
    }
    if (clStr === 'â€”' && mission.defibIdentifiant) {
      const matchedDefib = defibrillateurs.find(df => df.identifiant === mission.defibIdentifiant);
      if (matchedDefib) {
        const found = clients.find(c => c.id === matchedDefib.clientId);
        if (found?.denomination) clStr = found.denomination;
      }
    }
    if (clStr === 'â€”' && mission.clientName) {
      clStr = mission.clientName;
    }

    let dtStr = mission.scheduledDate || mission.date || mission.plannedDate || tour?.startDate || tour?.date || 'â€”';
    const reservationText = `${bcStr} â€” ${clStr} â€” ${dtStr}`;

    // Update stocks traceabilities
    let updatedStocks = stocks.map(st => ({ ...st }));
    let stocksMutated = false;

    const partsArr = partName.split(',');
    const lotCandidate = partsArr.length >= 2 ? partsArr[1].trim() : '';

    const stockIdx = updatedStocks.findIndex(st => {
      const vObj = variables.find(v => v.id === st.denominationPieceId);
      return vObj && (vObj.nom === partName || partName.startsWith(vObj.nom));
    });

    if (stockIdx !== -1) {
      const item = updatedStocks[stockIdx];
      let updatedTraces = Array.isArray(item.traceabilities) ? [...item.traceabilities] : [];

      if (updatedTraces.length > 0) {
        let foundTraceIdx = -1;
        if (lotCandidate) {
          foundTraceIdx = updatedTraces.findIndex(tr => tr.lotOrSerial === lotCandidate);
        }
        if (foundTraceIdx === -1) {
          foundTraceIdx = updatedTraces.findIndex(tr => tr.reservationInfo === reservationText);
        }
        if (foundTraceIdx === -1 && bcStr !== 'â€”') {
          foundTraceIdx = updatedTraces.findIndex(tr => tr.bonCommande === bcStr);
        }
        if (foundTraceIdx === -1) {
          foundTraceIdx = updatedTraces.findIndex(tr => tr.situation === 'Indisponible' || tr.situation === 'Disponible');
        }

        if (foundTraceIdx !== -1) {
          const targetTrace = updatedTraces[foundTraceIdx];
          const currComment = targetTrace.comment || '';

          let newComment = currComment;
          if (!isSent) {
            // Toggling to ON (sent to client)
            if (!currComment.includes('EnvoyÃ©e au client.')) {
              newComment = currComment ? `${currComment.trim()} EnvoyÃ©e au client.` : 'EnvoyÃ©e au client.';
            }
          } else {
            // Toggling to OFF
            newComment = currComment
              .replace('EnvoyÃ©e au client.', '')
              .replace('EnvoyÃ©e au client', '')
              .trim();
          }

          updatedTraces[foundTraceIdx] = {
            ...targetTrace,
            situation: 'Indisponible',
            reservationInfo: reservationText,
            bonCommande: bcStr !== 'â€”' ? bcStr : undefined,
            client: clStr !== 'â€”' ? clStr : undefined,
            dateEstimee: dtStr !== 'â€”' ? dtStr : undefined,
            comment: newComment || undefined
          };

          updatedStocks[stockIdx] = {
            ...item,
            traceabilities: updatedTraces
          };
          stocksMutated = true;
        }
      }
    }

    if (stocksMutated) {
      saveStocks(updatedStocks);
    }

    updateFsmMission(tourId, missionId, { sentToClientParts: newSentParts });
  };

  const updateFsmMission = (tourId: string, missionId: string, fields: any) => {
    const extraFields: any = {};
    if ('estimatedDate' in fields) {
      extraFields.isManualDate = !!fields.estimatedDate && fields.estimatedDate !== '';
    }
    if ('estimatedSlot' in fields) {
      extraFields.isManualSlot = !!fields.estimatedSlot && fields.estimatedSlot !== '';
    }

    const updatedTours = fsmTours.map(t => {
      if (t.id === tourId) {
        return {
          ...t,
          missions: t.missions.map(m => m.id === missionId ? { ...m, ...fields, ...extraFields } : m)
        };
      }
      return t;
    });

    saveFsmTours(updatedTours);
  };

  const handleExecuteAvisage = async (tour: any) => {
    if (!tour) return;
    const companyName = companyInfo.name || 'DÃ©fibeo Suite';
    const companyEmail = companyInfo.email || '';
    const toursMissions = tour.missions || [];
    let updatedClientsList = [...clients];
    let hasUpdatedClient = false;

    toursMissions.forEach((m: any) => {
      const defibId = m.defibIdentifiant;
      const defib = defibrillateurs.find(df => df.identifiant === defibId);
      if (defib) {
        const index = updatedClientsList.findIndex(c => c.id === defib.clientId);
        if (index !== -1) {
          const matchedClient = updatedClientsList[index];
          const clientEmail = defib.emailSite || matchedClient.email || matchedClient.emailSite;
          if (clientEmail && clientEmail.trim()) {
            const pin = matchedClient.signaturePin || generateRandomPin();
            const newPins = [...(matchedClient.signaturePins || [])];
            if (!newPins.some(p => p.code.toUpperCase() === pin.toUpperCase())) {
              newPins.push({
                code: pin,
                createdAt: new Date().toISOString(),
                status: 'Ã©mis'
              });
            }
            updatedClientsList[index] = {
              ...matchedClient,
              signaturePin: pin,
              signaturePins: newPins
            };
            hasUpdatedClient = true;

            const estDate = m.estimatedDate || tour.startDate || '';
            let estDateFormatted = estDate;
            if (estDate && estDate.includes('-')) {
              const parts = estDate.split('-');
              if (parts.length === 3) {
                estDateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
              }
            }
            const estSlot = m.estimatedSlot || '09:00';

            triggerEmail5AvisageFSM(
              clientEmail.trim(),
              defibId,
              companyName,
              companyEmail,
              estDateFormatted || 'prochainement',
              pin,
              estSlot
            ).catch(e => console.error("Error sending Email 5:", e));
          }
        }
      }
    });

    if (hasUpdatedClient) {
      saveClients(updatedClientsList);
    }

    setAvisageConfirmTour(null);
    alert("L'email d'avisage a Ã©tÃ© envoyÃ© avec succÃ¨s !");
  };

  const handleSoumettreAuClient = async (m: any, tour: any) => {
    const defib = defibrillateurs.find(df => df.identifiant === m.defibIdentifiant);
    const client = defib ? clients.find(c => c.id === defib.clientId) : clients.find(c => c.id === m.clientId);

    const recipientEmails: string[] = [];

    if (defib && defib.emailSite && defib.emailSite.trim()) {
      recipientEmails.push(defib.emailSite.trim());
    }

    if (client) {
      if (client.typeContact1 === 'Planification' && client.emailSite && client.emailSite.trim()) {
        recipientEmails.push(client.emailSite.trim());
      }
      if (client.typeContact2 === 'Planification' && client.emailSite2 && client.emailSite2.trim()) {
        recipientEmails.push(client.emailSite2.trim());
      }
      if (client.typeContact3 === 'Planification' && client.emailSite3 && client.emailSite3.trim()) {
        recipientEmails.push(client.emailSite3.trim());
      }
      if (client.typeContact4 === 'Planification' && client.emailSite4 && client.emailSite4.trim()) {
        recipientEmails.push(client.emailSite4.trim());
      }
      if (client.typeContact5 === 'Planification' && client.emailSite5 && client.emailSite5.trim()) {
        recipientEmails.push(client.emailSite5.trim());
      }
      if (recipientEmails.length === 0) {
        if (client.emailSite && client.emailSite.trim()) {
          recipientEmails.push(client.emailSite.trim());
        } else if (client.email && client.email.trim()) {
          recipientEmails.push(client.email.trim());
        }
      }
    }

    const uniqueEmails = Array.from(new Set(recipientEmails.filter(Boolean)));

    if (uniqueEmails.length === 0) {
      alert("Aucune adresse email valide trouvÃ©e pour ce client ou cette mission.");
      return;
    }

    const customerMainEmail = client?.email || client?.emailSite || uniqueEmails[0] || '';
    const customerPassword = client?.accessKey || 'Non dÃ©fini';
    const companyName = companyInfo.name || 'DÃ©fibeo Suite';
    const companyEmail = companyInfo.email || 'defibeo@gmail.com';

    try {
      await triggerEmailSoumettreAuClient(
        uniqueEmails,
        companyName,
        companyEmail,
        customerMainEmail,
        customerPassword
      );
      updateFsmMission(tour.id, m.id, { status: 'Attente Client' });
      alert("La proposition a Ã©tÃ© soumise au client par email avec succÃ¨s.");
    } catch (err) {
      console.error("Erreur lors de la soumission au client:", err);
      alert("Une erreur est survenue lors de l'envoi de l'email.");
    }
  };

  const CODE39_MAP: { [key: string]: string } = {
    '0': '101001101101',
    '1': '110100101011',
    '2': '101100101011',
    '3': '110110010101',
    '4': '101001101011',
    '5': '110100110101',
    '6': '101100110101',
    '7': '101001011011',
    '8': '110100101101',
    '9': '101100101101',
    'A': '110101001011',
    'B': '101101001011',
    'C': '110110100101',
    'D': '101011001011',
    'E': '110101100101',
    'F': '101101100101',
    'G': '101010011011',
    'H': '110101001101',
    'I': '101101001101',
    'J': '101011001101',
    'K': '110101010011',
    'L': '101101010011',
    'M': '110110101001',
    'N': '101011010011',
    'O': '110101101001',
    'P': '101101101001',
    'Q': '101010110011',
    'R': '110101011001',
    'S': '101101011001',
    'T': '101011011001',
    'U': '110010101011',
    'V': '100110101011',
    'W': '110011010101',
    'X': '100101101011',
    'Y': '110010110101',
    'Z': '100111010101',
    '-': '100101011101',
    '.': '110010101101',
    ' ': '100110101101',
    '*': '100101101101',
    '$': '100100100101',
    '/': '100100101001',
    '+': '100101001001',
    '%': '101001001001'
  };

  const generateBarcodeSVGString = (text: string): string => {
    const cleanText = '*' + text.toUpperCase().replace(/[^0-9A-Z\-\.\ \$\/\+\%]/g, '-') + '*';
    let binaryString = '';
    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      binaryString += CODE39_MAP[char] || CODE39_MAP['-'];
      binaryString += '0';
    }

    const barWidth = 2.0;
    const barcodeHeight = 45;
    const textHeight = 20;
    const totalHeight = barcodeHeight + textHeight;
    const totalWidth = binaryString.length * barWidth;
    
    let rects = '';
    for (let i = 0; i < binaryString.length; i++) {
      if (binaryString[i] === '1') {
        rects += `<rect x="${i * barWidth}" y="0" width="${barWidth}" height="${barcodeHeight}" fill="black" />`;
      }
    }
    
    const textElement = `<text x="${totalWidth / 2}" y="${barcodeHeight + 16}" font-family="'DefibeoMain', 'Civilprom', sans-serif" font-size="14" text-anchor="middle" fill="black">${text}</text>`;
    
    return `<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">${rects}${textElement}</svg>`;
  };

  const computeDurationText = (startStr: string, endStr: string): string => {
    if (!startStr || !endStr) return "-";
    const parseDateString = (str: string): Date | null => {
      if (!str) return null;
      const match = str.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        const hours = parseInt(match[4], 10);
        const minutes = parseInt(match[5], 10);
        const seconds = match[6] ? parseInt(match[6], 10) : 0;
        return new Date(year, month, day, hours, minutes, seconds);
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return parsed;
      try {
        const parts = str.trim().split(' ');
        if (parts.length >= 2) {
          const dateParts = parts[0].split(/[/-]/);
          const timeParts = parts[1].split(':');
          if (dateParts.length === 3 && timeParts.length >= 2) {
            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const year = parseInt(dateParts[2], 10);
            const hours = parseInt(timeParts[0], 10);
            const minutes = parseInt(timeParts[1], 10);
            const seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
            return new Date(year, month, day, hours, minutes, seconds);
          }
        }
      } catch (e) {}
      return null;
    };

    const start = parseDateString(startStr);
    const end = parseDateString(endStr);
    if (!start || !end) return "-";
    let diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) diffMs = 0;
    const totalSecs = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (num: number) => String(num).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const handleDownloadReport = (report: any) => {
    const snapshot = report.defibSnapshot || {};
    const pdfLogo = companyInfo.logo || '';
    const pdfHeaderImg = companyInfo.pdfHeaderImg || '';
    const pdfPageHeaderText = companyInfo.pdfPageHeaderText || '';
    const pdfPageFooterText = companyInfo.pdfPageFooterText || '';
    const pdfLastPageInfoText = companyInfo.pdfLastPageInfoText || '';
    const hasLastPage = !!pdfLastPageInfoText.trim();
    const pdfHeaderBgColor = companyInfo.pdfHeaderBgColor || '#7c2882';
    const pdfCardBorderColor = companyInfo.pdfCardBorderColor || '#7d2882';
    const pdfCardBgColor = companyInfo.pdfCardBgColor || '#fef2ff';
    const pdfLabelTextColor = companyInfo.pdfLabelTextColor || '#9f71a2';

    const compLogo = companyInfo.logo || '';
    const compName = companyInfo.name || 'DÃ©fibeo Solutions';
    const compEmail = companyInfo.email || '';
    const compPhone = companyInfo.phone || '';
    const compWebsite = companyInfo.website || '';

    // Unified client lookup
    let clientFound = clients.find(c => c.id === snapshot.clientId);
    if (!clientFound && snapshot.clientId) {
      clientFound = clients.find(c => c.denomination === snapshot.clientId || c.id === snapshot.clientId);
    }
    if (!clientFound && report.clientId) {
      clientFound = clients.find(c => c.id === report.clientId);
    }
    if (!clientFound) {
      const siteEmail = snapshot.emailSite || report.emailSite || "";
      if (siteEmail) {
        clientFound = clients.find(c => c.email && c.email.toLowerCase().trim() === siteEmail.toLowerCase().trim());
      }
    }
    if (!clientFound) {
      const siteNom = snapshot.nomPrenomSite || "";
      if (siteNom) {
        clientFound = clients.find(c => c.denomination === siteNom || c.nomPrenomSite === siteNom);
      }
    }
    const clientName = clientFound ? clientFound.denomination : (snapshot.nomPrenomSite || 'Non rattachÃ©');

    const clientIdField = clientFound?.clientIdField || snapshot.clientIdField || '';
    const payeurId = clientFound?.payeurId || snapshot.payeurId || '';

    // Unified purchase order (bonCommande) lookup
    const matchedMission = (fsmTours || [])
      .flatMap((t: any) => t.missions || [])
      .find((m: any) => m.defibIdentifiant === (snapshot.identifiant || report.defibIdentifiant));
    const bonCommandeId = report.bonCommandeId || matchedMission?.bonCommandeId;
    const bcDoc = bonCommandeId && bonCommandeId !== 'custom' ? (commercialDocs || []).find((doc: any) => doc.id === bonCommandeId) : null;
    const bonCommandeEntete = bcDoc?.bonCommandeEntete || (bonCommandeId === 'custom' ? matchedMission?.customBonCommande : '') || '';

    const renderHeader = () => {
      const showHeaderImg = pdfHeaderImg ? `<img src="${pdfHeaderImg}" style="max-height: 55px; max-width: 100%; object-fit: contain;" alt="Header Illustration" referrerPolicy="no-referrer" />` : '';
      const showHeaderLogo = pdfLogo ? `<img src="${pdfLogo}" style="max-height: 80px; object-fit: contain;" alt="Logo" referrerPolicy="no-referrer" />` : '';
      const showHeaderInfoText = pdfPageHeaderText ? `<div style="font-size: 14px; color: #000000; text-align: left; font-family: 'Civilprom', sans-serif !important;">${formatPdfHeaderText(pdfPageHeaderText)}</div>` : '';
      const showEmail = compEmail ? `<div>${compEmail}</div>` : '';
      const showPhone = compPhone ? `<div>${compPhone}</div>` : '';

      return `
        <div class="pdf-global-header" style="display: flex; flex-direction: row; width: calc(100% - 30mm); margin: 10mm 15mm 15px 15mm; padding-bottom: 10px; font-family: 'Civilprom', 'Inter', sans-serif !important; align-items: flex-start; box-sizing: border-box;">
          <div style="width: 20%; display: flex; align-items: flex-start; justify-content: flex-start; box-sizing: border-box; padding-right: 5px;">
            ${showHeaderLogo}
          </div>
          <div style="width: 50%; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; text-align: left; box-sizing: border-box; padding: 0 5px; gap: 4px;">
            ${showHeaderImg}
            ${showHeaderInfoText}
          </div>
          <div style="width: 30%; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start; text-align: right; box-sizing: border-box; padding-left: 5px; font-size: 14px; color: #000000; gap: 2px;">
            <div style="font-weight: bold !important; margin-bottom: 2px;">${compName}</div>
            ${showEmail}
            ${showPhone}
          </div>
        </div>
      `;
    };

    const renderFooter = (pageIndex: number, pagesTotal: number) => `
      <div class="pdf-footer" style="position: absolute; bottom: 15mm; left: 15mm; right: 15mm; display: flex; flex-direction: row; justify-content: space-between; align-items: flex-end; font-size: 8px; color: #000000; padding-top: 8px; font-family: 'Civilprom', 'Inter', sans-serif !important; box-sizing: border-box; width: calc(100% - 30mm); border-top: none;">
        <div style="flex: 1; text-align: left; padding-right: 20px; color: #000000; font-size: 8px;">
          <p style="margin: 0; color: #000000; font-size: 8px; text-align: left; font-weight: normal !important; line-height: 1.4;">${pdfPageFooterText || ''}</p>
        </div>
        <div style="font-weight: bold !important; white-space: nowrap; color: #000000; font-size: 8px;">
          Page ${pageIndex} / ${pagesTotal}
        </div>
      </div>
    `;

    if (snapshot.categorie && snapshot.categorie !== 'DÃ©fibrillateur') {
      // Filter out typical top-level keys to get custom equipment properties!
      const topLevelKeys = [
        'id', 'clientId', 'nomPrenomSite', 'telephoneSite', 'emailSite', 'contrat', 'nomContrat', 'referenceContrat',
        'debutContrat', 'finContrat', 'pays', 'codePostal', 'cp', 'ville', 'adresseComplexe', 'identifiant',
        'codeNfc', 'statutGmao', 'categorie', 'conforme', 'miseEnServiceDate', 'miseEnService', 'commentaireGmao'
      ];
      
      const customProperties = Object.entries(snapshot).filter(([k, v]) => {
        return !topLevelKeys.includes(k) && v !== undefined && v !== null && v !== '' && typeof v !== 'object';
      });

      const totalPages = hasLastPage ? 3 : 2;
      const docTitle = report.title ? report.title : `Rapport dâ€™intervention - ${snapshot.categorie || ''}`;

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <title>Rapport - ${snapshot.identifiant || report.defibIdentifiant || '-'}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            @font-face {
              font-family: "Civilprom";
              src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
              font-weight: 100 900;
              font-style: normal;
              font-display: swap;
            }
            @font-face {
              font-family: "Gochi";
              src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
              font-weight: normal;
              font-style: normal;
              font-display: swap;
            }
            * {
              box-sizing: border-box;
              font-family: "Civilprom", "Inter", sans-serif !important;
              font-weight: 100 !important;
            }
            @page {
              size: A4 portrait;
              margin: 0;
            }
            body {
              font-family: "Civilprom", "Inter", sans-serif !important;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            #print-container {
              width: 210mm;
              margin: 0 auto;
              background-color: #ffffff;
            }
            .pdf-page {
              position: relative;
              width: 210mm;
              height: 297mm;
              padding: 0px;
              box-sizing: border-box;
              background-color: #ffffff;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              gap: 15px;
              page-break-after: always;
              break-after: page;
            }
            .pdf-header {
              font-family: "Gochi", cursive !important;
              font-size: 32px;
              font-weight: normal !important;
              text-align: center;
              color: #000000;
              margin-top: -10px;
              margin-bottom: 4px;
            }
            .pdf-grid {
              display: flex;
              flex-direction: column;
              gap: 12px;
              width: calc(100% - 30mm);
              margin: 0 15mm;
            }
            .pdf-card {
              border: 2px solid ${pdfCardBorderColor};
              border-radius: 13px;
              background-color: ${pdfCardBgColor};
              padding: 0px;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .pdf-card-header {
              padding: 10px 14px;
              font-size: 16px;
              background-color: ${pdfHeaderBgColor};
              color: #ffffff;
              border-bottom: none;
              text-align: center;
              font-weight: bold !important;
            }
            .pdf-card-body {
              padding: 8px 14px 12px 14px;
              font-size: 16px;
              display: flex;
              flex-direction: column;
              gap: 4px;
              color: #000000;
            }
            .pdf-line {
              color: #000000;
              line-height: 1.35;
              font-size: 16px;
            }
            .pdf-label {
              color: ${pdfLabelTextColor};
            }
            .pdf-bold {
              color: #000000;
            }
            .pdf-footer {
              position: absolute;
              bottom: 15mm;
              right: 15mm;
              font-size: 11px;
              color: #000000;
            }
          </style>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </head>
        <body class="bg-white">
          <div id="print-container">
            <!-- PAGE 1 -->
            <div class="pdf-page">
              ${renderHeader()}

              <div class="pdf-grid">
                <!-- TITLE & BARCODE ROW -->
                <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 10px; box-sizing: border-box;">
                  <div style="flex: 1; text-align: left; padding-right: 15px; box-sizing: border-box;">
                    <h1 style="font-size: 20px; font-weight: bold; color: #000000; margin: 0; font-family: 'Civilprom', sans-serif !important;">${docTitle}</h1>
                  </div>
                  <div style="flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center;">
                    ${generateBarcodeSVGString(snapshot.identifiant || report.defibIdentifiant || "EQUIP")}
                  </div>
                </div>

                <!-- SECTION 1 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">1 â€” Informations gÃ©nÃ©rales.</div>
                  <div class="pdf-card-body" style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                      <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Client :</span> <span class="pdf-bold">${clientName || ''}</span></div>
                      <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Client ID :</span> <span class="pdf-bold">${clientIdField || 'â€”'}</span></div>
                      <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Payeur ID :</span> <span class="pdf-bold">${payeurId || 'â€”'}</span></div>
                    </div>
                    <div class="pdf-line"><span class="pdf-label">Contact sur place :</span> <span class="pdf-bold">${snapshot.nomPrenomSite || ''}</span></div>
                    <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                      <div class="pdf-line" style="flex: 1;"><span class="pdf-label">TÃ©lÃ©phone du contact :</span> <span class="pdf-bold">${snapshot.telephoneSite || ''}</span></div>
                      <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Email du contact :</span> <span class="pdf-bold">${snapshot.emailSite || ''}</span></div>
                    </div>
                    <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Type matÃ©riel :</span> <span class="pdf-bold">${snapshot.categorie || 'Autre'}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Version du logiciel :</span> <span class="pdf-bold">${snapshot.versionLogiciel || 'â€”'}</span></div>
                    <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                      <div class="pdf-line" style="flex: 1;"><span class="pdf-label">RÃ©fÃ©rence intervention :</span> <span class="pdf-bold">${report.interventionReference || 'â€”'}</span></div>
                      <div class="pdf-line" style="flex: 1;"><span class="pdf-label">EntÃªte :</span> <span class="pdf-bold">${bonCommandeEntete || 'â€”'}</span></div>
                    </div>
                    <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Sous contrat :</span> <span class="pdf-bold">${snapshot.contrat || 'Non'}</span></div>
                    ${snapshot.contrat === 'Oui' ? `
                      <div class="pdf-line"><span class="pdf-label">Nom du contrat :</span> <span class="pdf-bold">${snapshot.nomContrat || ''}</span></div>
                      <div class="pdf-line"><span class="pdf-label">RÃ©fÃ©rence contrat :</span> <span class="pdf-bold">${snapshot.referenceContrat || ''}</span></div>
                    ` : ''}
                  </div>
                </div>

                <!-- SECTION 2 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">2 â€” SpÃ©cifications du matÃ©riel (${snapshot.categorie}).</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">CatÃ©gorie :</span> <span class="pdf-bold">${snapshot.categorie || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Identifiant unique :</span> <span class="pdf-bold">${snapshot.identifiant || ''}</span></div>
                    ${snapshot.codeNfc ? `<div class="pdf-line"><span class="pdf-label">Code NFC :</span> <span class="pdf-bold">${snapshot.codeNfc}</span></div>` : ''}
                    <div class="pdf-line"><span class="pdf-label">Statut GMAO :</span> <span class="pdf-bold">${snapshot.statutGmao || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Mise en service :</span> <span class="pdf-bold">${snapshot.miseEnServiceDate || snapshot.miseEnService || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">ConformitÃ© gÃ©nÃ©rale :</span> <span class="pdf-bold ${snapshot.conforme === 'Non' ? 'text-rose-600 font-bold' : 'text-emerald-600'}">${snapshot.conforme || 'Oui'}</span></div>
                  </div>
                </div>
              </div>
              ${renderFooter(1, totalPages)}
            </div>

            <!-- PAGE 2 -->
            <div class="pdf-page">
              ${renderHeader()}

              <div class="pdf-grid">
                <!-- CUSTOM SECTION / CHECKPOINTS -->
                ${customProperties.length > 0 ? `
                  <div class="pdf-card">
                    <div class="pdf-card-header">3 â€” ParamÃ¨tres spÃ©cifiques & VÃ©rifications.</div>
                    <div class="pdf-card-body">
                      ${customProperties.map(([key, val]) => `
                        <div class="pdf-line"><span class="pdf-label" style="text-transform: capitalize;">${key.replace(/([A-Z])/g, ' $1')}:</span> <span class="pdf-bold">${val}</span></div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}

                <!-- ACTIONS, NOTES & CAPTURE EVIDENCE -->
                <div class="pdf-card">
                  <div class="pdf-card-header">4 â€” ClÃ´ture de l'intervention.</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Technicien intervenant :</span> <span class="pdf-bold">${report.techName || 'Administrateur'}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Date dâ€™intervention :</span> <span class="pdf-bold">${report.date || '-'}</span></div>
                    ${report.endTimeStamp ? `<div class="pdf-line"><span class="pdf-label">Heure de fin :</span> <span class="pdf-bold">${report.endTimeStamp}</span></div>` : ''}
                    <div class="pdf-line" style="margin-bottom: 4px;">
                      <span class="pdf-label">Commentaire / Remarques :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireGmao || snapshot.commentaire || 'Aucun commentaire.'}</span>
                    </div>

                    <div style="display: flex; flex-direction: row; gap: 20px; width: 100%; padding-top: 8px; margin-top: 4px;">
                      <!-- Photos (Up to 3 photos stacked vertically) -->
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                        <div class="pdf-line" style="font-size: 16px; font-weight: bold !important;">Photographies de l'intervention.</div>
                        
                        ${report.photoUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie globale du dÃ©fibrillateur.</span>
                          </div>
                        ` : ''}

                        ${report.photoArriereUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoArriereUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo ArriÃ¨re" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie arriÃ¨re / Ã©tiquette.</span>
                          </div>
                        ` : ''}

                        ${report.photoResultatTestUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoResultatTestUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo RÃ©sultat Test" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">RÃ©sultat du test.</span>
                          </div>
                        ` : ''}

                      </div>

                      <!-- Signature Technicien -->
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        ${report.techSignature ? `
                          <div class="pdf-line" style="font-size: 16px;">Signature technicien.</div>
                          <div style="background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 60px; max-width: 150px;">
                            <img src="${report.techSignature}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature" />
                          </div>
                        ` : ''}
                      </div>

                      <!-- Signature Client -->
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        ${(clientFound && clientFound.clientSignatureImage) || (report.clientPinCode && report.clientPinCode.trim()) ? `
                          <div class="pdf-line" style="font-size: 16px;">Signature client.</div>
                          ${(report.clientPinCode && report.clientPinCode.trim()) ? `
                            <div style="font-size: 11px; margin-bottom: 2px;">
                              <span class="pdf-label" style="font-size:11px; color:#555;">Code validation:</span> 
                              <span class="pdf-bold" style="font-size:11px; font-family: monospace !important; font-weight: bold !important; color:#000;">${report.clientPinCode}</span>
                            </div>
                          ` : ''}
                          ${clientFound && clientFound.clientSignatureImage ? `
                            <div style="background: transparent; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; max-height: 80px; max-width: 150px; margin-top: 4px;">
                              <img src="${clientFound.clientSignatureImage}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature Client" />
                            </div>
                          ` : ''}
                        ` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              ${renderFooter(2, totalPages)}
            </div>

            ${hasLastPage ? `
              <!-- PAGE 3 -->
              <div class="pdf-page">
                ${renderHeader()}
                <div class="pdf-grid" style="display: flex; flex-direction: column; justify-content: flex-start;">
                  <div class="pdf-card" style="display: flex; flex-direction: column;">
                    <div class="pdf-card-header" style="font-weight: bold !important; margin-bottom: 10px;">
                      Informations complÃ©mentaires
                    </div>
                    <div class="pdf-card-body" style="font-size: 15px; color: #000000; white-space: pre-line; line-height: 1.5;">
                      ${pdfLastPageInfoText}
                    </div>
                  </div>
                </div>
                ${renderFooter(3, totalPages)}
              </div>
            ` : ''}

          </div>
        </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return;
    }

    // Resolving Model names from Variable list
    const defibModel = variables.find(v => v.id === snapshot.modeleId);
    const selectedModelVar = defibModel;

    const isVisibleNumeroAtlasante = selectedModelVar ? (selectedModelVar.visibiliteNumeroAtlasante !== 'Non') : true;
    const isVisibleVersionLogiciel = selectedModelVar ? (selectedModelVar.visibiliteVersionLogiciel !== 'Non') : true;
    const isVisibleFactureBrouillon = selectedModelVar ? (selectedModelVar.visibiliteFactureBrouillon !== 'Non') : true;
    const isVisiblePadPakAdulte = selectedModelVar ? (selectedModelVar.visibilitePadPakAdulte !== 'Non') : true;
    const isVisibleLotPadPakA = selectedModelVar ? (selectedModelVar.visibiliteLotPadPakA !== 'Non') : true;
    const isVisiblePeremptionPadPakA = selectedModelVar ? (selectedModelVar.visibilitePeremptionPadPakA !== 'Non') : true;
    const isVisibleLotP = selectedModelVar ? (selectedModelVar.visibiliteLotP !== 'Non') : true;
    const isVisiblePadPakPediatrique = selectedModelVar ? (selectedModelVar.visibilitePadPakPediatrique !== 'Non') : true;
    const isVisibleLotPadPakP = selectedModelVar ? (selectedModelVar.visibiliteLotPadPakP !== 'Non') : true;
    const isVisiblePeremptionPadPakP = selectedModelVar ? (selectedModelVar.visibilitePeremptionPadPakP !== 'Non') : true;
    const isVisibleFabricationBatterie = selectedModelVar ? (selectedModelVar.visibiliteFabricationBatterie !== 'Non') : true;
    const isVisibleInsertionBatterie = selectedModelVar ? (selectedModelVar.visibiliteInsertionBatterie !== 'Non') : true;
    const isVisiblePeremptionBatterie = selectedModelVar ? (selectedModelVar.visibilitePeremptionBatterie !== 'Non') : true;
    const isVisiblePourcentageBatterie = selectedModelVar ? (selectedModelVar.visibilitePourcentageBatterie !== 'Non') : true;
    const isVisibleGantsPresents = selectedModelVar ? (selectedModelVar.visibiliteGantsPresents !== 'Non') : true;
    const isVisiblePeremptionServiettes = selectedModelVar ? (selectedModelVar.visibilitePeremptionServiettes !== 'Non') : true;
    const isVisibleServiettesPresentes = selectedModelVar ? (selectedModelVar.visibiliteServiettesPresentes !== 'Non') : true;
    const isVisiblePeremptionMasque = selectedModelVar ? (selectedModelVar.visibilitePeremptionMasque !== 'Non') : true;
    const isVisibleMasquePresent = selectedModelVar ? (selectedModelVar.visibiliteMasquePresent !== 'Non') : true;
    const isVisibleCiseauxPresents = selectedModelVar ? (selectedModelVar.visibiliteCiseauxPresents !== 'Non') : true;
    const isVisiblePeremptionTrousse = selectedModelVar ? (selectedModelVar.visibilitePeremptionTrousse !== 'Non') : true;
    const isVisibleRasoir = selectedModelVar ? (selectedModelVar.visibiliteRasoir !== 'Non') : true;
    const isVisibleBranchementElectrodes = selectedModelVar ? (selectedModelVar.visibiliteBranchementElectrodes !== 'Non') : true;
    const isVisibleGuidesVocaux = selectedModelVar ? (selectedModelVar.visibiliteGuidesVocaux !== 'Non') : true;
    const isVisibleMessageNumeriqueConforme = selectedModelVar ? (selectedModelVar.visibiliteMessageNumeriqueConforme !== 'Non') : true;
    const isVisibleEquipeMessageNumerique = selectedModelVar ? (selectedModelVar.visibiliteEquipeMessageNumerique !== 'Non') : true;
    const isVisibleVoyantConforme = selectedModelVar ? (selectedModelVar.visibiliteVoyantConforme !== 'Non') : true;
    const isVisibleNettoyage = selectedModelVar ? (selectedModelVar.visibiliteNettoyage !== 'Non') : true;
    const isVisiblePiecesJointes = selectedModelVar ? (selectedModelVar.visibilitePiecesJointes !== 'Non') : true;

    const defibModelName = defibModel ? `${defibModel.marque} ${defibModel.nom}` : (snapshot.modeleId || 'Non spÃ©cifiÃ©');

    const coffretModel = variables.find(v => v.id === snapshot.modeleCoffretId);
    const coffretModelName = coffretModel ? `${coffretModel.marque} ${coffretModel.nom}` : (snapshot.modeleCoffretId || 'Non spÃ©cifiÃ©');

    const electrodeAModel = variables.find(v => v.id === snapshot.modeleElectrodeAId);
    const electrodeAModelName = electrodeAModel ? `${electrodeAModel.marque} ${electrodeAModel.nom}` : (snapshot.modeleElectrodeAId || 'Non spÃ©cifiÃ©');

    const electrodeASecoursModel = variables.find(v => v.id === snapshot.modeleElectrodeASecoursId);
    const electrodeASecoursModelName = electrodeASecoursModel ? `${electrodeASecoursModel.marque} ${electrodeASecoursModel.nom}` : '';

    const electrodePModel = variables.find(v => v.id === snapshot.modeleElectrodePId);
    const electrodePModelName = electrodePModel ? `${electrodePModel.marque} ${electrodePModel.nom}` : (snapshot.modeleElectrodePId || 'Non spÃ©cifiÃ©');

    const electrodePSecoursModel = variables.find(v => v.id === snapshot.modeleElectrodePSecoursId);
    const electrodePSecoursModelName = electrodePSecoursModel ? `${electrodePSecoursModel.marque} ${electrodePSecoursModel.nom}` : '';

    const batterieModel = variables.find(v => v.id === snapshot.modeleBatterieId);
    const batterieModelName = batterieModel ? `${batterieModel.marque} ${batterieModel.nom}` : (snapshot.modeleBatterieId || 'Non spÃ©cifiÃ©');

    // Helper to resolve stock pieces
    const getStockPieceLabel = (stockId: string) => {
      if (!stockId) return '-';
      const stockItem = stocks.find((s: any) => s.id === stockId);
      if (!stockItem) return stockId;
      const variableItem = variables.find((v: any) => v.id === stockItem.denominationPieceId);
      if (!variableItem) return `PiÃ¨ce (${stockItem.denominationPieceId})`;
      return `${variableItem.nom} (${variableItem.marque})`;
    };

    // Helper to resolve service label
    const getServiceLabel = (serviceId: string) => {
      if (!serviceId) return '';
      const stockItem = stocks.find((s: any) => s.id === serviceId);
      if (stockItem) {
        const variable = variables.find((v: any) => v.id === stockItem.denominationPieceId);
        return variable ? `${variable.nom} (${variable.marque})` : 'Service';
      }
      const variable = variables.find((v: any) => v.id === serviceId);
      if (variable) {
        return `${variable.nom} (${variable.marque})`;
      }
      return serviceId;
    };

    const selElectrodeA = getStockPieceLabel(report.selectionElectrodeARemplacee);
    const selElectrodeASecours = getStockPieceLabel(report.selectionElectrodeASecoursRemplacee);
    const selElectrodeP = getStockPieceLabel(report.selectionElectrodePRemplacee);
    const selElectrodePSecours = getStockPieceLabel(report.selectionElectrodePSecoursRemplacee);
    const selBatterie = getStockPieceLabel(report.selectionBatterieRemplacee);
    const selKitSecours = getStockPieceLabel(report.selectionKitSecoursRemplace);

    const totalPages = hasLastPage ? 6 : 5;
    const docTitle = report.title ? report.title : 'Rapport dâ€™intervention GMAO';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Rapport - ${snapshot.identifiant || report.defibIdentifiant || '-'}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

          @font-face {
            font-family: "Civilprom";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
            font-weight: 100 900;
            font-style: normal;
            font-display: swap;
          }

          @font-face {
            font-family: "Gochi";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }

          * {
            box-sizing: border-box;
            font-family: "Civilprom", "Inter", sans-serif !important;
            font-weight: 100 !important;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }

          body {
            font-family: "Civilprom", "Inter", sans-serif !important;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          #print-container {
            width: 210mm;
            margin: 0 auto;
            background-color: #ffffff;
          }

          .pdf-page {
            position: relative;
            width: 210mm;
            height: 297mm;
            padding: 0px;
            box-sizing: border-box;
            background-color: #ffffff;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            gap: 15px;
            page-break-after: always;
            break-after: page;
          }

          .pdf-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }

          .pdf-header {
            font-family: "Gochi", cursive !important;
            font-size: 32px;
            font-weight: normal !important;
            text-align: left;
            color: #000000;
            margin-top: -10px;
            margin-bottom: 4px;
            padding: 0;
            border: none;
          }

          .pdf-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: calc(100% - 30mm);
            margin: 0 15mm;
          }

          .pdf-card {
            border: 2px solid ${pdfCardBorderColor};
            border-radius: 13px;
            background-color: ${pdfCardBgColor};
            padding: 0px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .pdf-card-header {
            background-color: ${pdfHeaderBgColor};
            color: #ffffff;
            border-bottom: none;
            font-size: 16px;
            font-weight: bold !important;
            text-align: center;
            padding: 10px 14px;
            font-family: "Civilprom", sans-serif !important;
          }

          .pdf-card-body {
            padding: 8px 14px 12px 14px;
            font-size: 16px;
            font-family: "Civilprom", sans-serif !important;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            gap: 4px;
            color: #000000;
          }

          .pdf-line {
            color: #000000;
            line-height: 1.35;
            font-size: 16px;
            text-align: left;
            font-family: "Civilprom", sans-serif !important;
          }

          .pdf-label {
            color: ${pdfLabelTextColor};
            font-family: "Civilprom", sans-serif !important;
          }

          .pdf-bold {
            font-weight: 100 !important;
            color: #000000;
            font-family: "Civilprom", sans-serif !important;
          }

          .pdf-footer {
            position: absolute;
            bottom: 15mm;
            right: 15mm;
            font-size: 11px;
            color: #000000;
            font-family: "Civilprom", sans-serif;
            font-weight: 100 !important;
          }
        </style>
      </head>
      <body class="bg-white">
        
        <div id="print-container">

          <!-- PAGE 1 -->
          <div class="pdf-page">
            ${renderHeader()}

            <div class="pdf-grid">
              <!-- TITLE & BARCODE ROW -->
              <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 10px; box-sizing: border-box;">
                <div style="flex: 1; text-align: left; padding-right: 15px; box-sizing: border-box;">
                  <h1 style="font-size: 20px; font-weight: bold; color: #000000; margin: 0; font-family: 'Civilprom', sans-serif !important;">${docTitle}</h1>
                </div>
                <div style="flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center;">
                  ${generateBarcodeSVGString(snapshot.identifiant || report.defibIdentifiant || "EQUIP")}
                </div>
              </div>

              <!-- SECTION 1 -->
              <div class="pdf-card">
                <div class="pdf-card-header">1 â€” Informations gÃ©nÃ©rales.</div>
                <div class="pdf-card-body" style="display: flex; flex-direction: column; gap: 4px;">
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Client :</span> <span class="pdf-bold">${clientName || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Client ID :</span> <span class="pdf-bold">${clientIdField || 'â€”'}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Payeur ID :</span> <span class="pdf-bold">${payeurId || 'â€”'}</span></div>
                  </div>
                  <div class="pdf-line"><span class="pdf-label">Contact :</span> <span class="pdf-bold">${snapshot.nomPrenomSite || ''}</span></div>
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">TÃ©lÃ©phone du contact :</span> <span class="pdf-bold">${snapshot.telephoneSite || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Email du contact :</span> <span class="pdf-bold">${snapshot.emailSite || ''}</span></div>
                  </div>
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Type matÃ©riel :</span> <span class="pdf-bold">${snapshot.categorie || 'DÃ©fibrillateur'}</span></div>
                  ${isVisibleVersionLogiciel ? `<div class="pdf-line"><span class="pdf-label">Version du logiciel :</span> <span class="pdf-bold">${snapshot.versionLogiciel || 'â€”'}</span></div>` : ''}
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">RÃ©fÃ©rence intervention :</span> <span class="pdf-bold">${report.interventionReference || 'â€”'}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">EntÃªte :</span> <span class="pdf-bold">${bonCommandeEntete || 'â€”'}</span></div>
                  </div>
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Identifiant :</span> <span class="pdf-bold">${snapshot.identifiant || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">SÃ©rie :</span> <span class="pdf-bold">${snapshot.numeroSerie || ''}</span></div>
                  </div>
                  <div class="pdf-line"><span class="pdf-label">ModÃ¨le :</span> <span class="pdf-bold">${snapshot.modeleId ? defibModelName : ''}</span></div>
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Contrat :</span> <span class="pdf-bold">${snapshot.contrat || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">RÃ©fÃ©rence du contrat :</span> <span class="pdf-bold">${snapshot.referenceContrat || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">CatÃ©gorie du contrat :</span> <span class="pdf-bold">${snapshot.nomContrat || ''}</span></div>
                  ${isVisibleFactureBrouillon ? `
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Facture :</span> <span class="pdf-bold">${report.emettreFactureBrouillon || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Service facturÃ© :</span> <span class="pdf-bold">${report.serviceEmettreId ? getServiceLabel(report.serviceEmettreId) : ''}</span></div>
                  </div>
                  ` : ''}
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Voie :</span> <span class="pdf-bold">${snapshot.numVoie || ''}</span></div>
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Ville :</span> <span class="pdf-bold">${snapshot.ville || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Code Postal :</span> <span class="pdf-bold">${snapshot.cp || ''}</span></div>
                  </div>
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">RÃ©gion :</span> <span class="pdf-bold">${snapshot.region || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Pays :</span> <span class="pdf-bold">${snapshot.pays || ''}</span></div>
                  </div>
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Latitude GPS :</span> <span class="pdf-bold">${snapshot.latitude || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Longitude GPS :</span> <span class="pdf-bold">${snapshot.longitude || ''}</span></div>
                  </div>
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Fabrication :</span> <span class="pdf-bold">${snapshot.fabrication || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Mise en service :</span> <span class="pdf-bold">${snapshot.miseEnService || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Fin de garantie :</span> <span class="pdf-bold">${snapshot.finGarantie || ''}</span></div>
                </div>
              </div>
            </div>

            ${renderFooter(1, totalPages)}
          </div>

          <!-- PAGE 2 -->
          <div class="pdf-page">
            ${renderHeader()}

            <div class="pdf-grid">
              <!-- SECTION 2 -->
              <div class="pdf-card">
                <div class="pdf-card-header">2 â€” Coffret.</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">ModÃ¨le de boÃ®tier :</span> <span class="pdf-bold">${coffretModelName || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Lot de boÃ®tier :</span> <span class="pdf-bold">${snapshot.numeroLotCoffret || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Ã‰quipÃ© dâ€™une alarme :</span> <span class="pdf-bold">${report.equipeAlarme || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Alarme fonctionnelle :</span> <span class="pdf-bold">${report.alarme || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Dispositif dâ€™armoire connectÃ©e :</span> <span class="pdf-bold">${report.armoireConnectee || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Dispositif handicap :</span> <span class="pdf-bold">${report.dispositifHandicap || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">SignalÃ©tique conforme :</span> <span class="pdf-bold">${report.signaletiqueConforme || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire concernant le boÃ®tier :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireCoffret || ''}</span></div>
                </div>
              </div>

              <!-- SECTION 3 -->
              <div class="pdf-card">
                <div class="pdf-card-header">3 â€” VÃ©rifications techniques.</div>
                <div class="pdf-card-body" style="gap: 3px;">
                  <div class="pdf-line"><span class="pdf-label">Conforme Ã  mon arrivÃ©e :</span> <span class="pdf-bold">${report.techConformeArrivee || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire sur lâ€™Ã©tat Ã  mon arrivÃ©e :</span> <span class="pdf-bold">${report.techCommentaireArrivee || ''}</span></div>
                  ${isVisibleNettoyage ? `<div class="pdf-line"><span class="pdf-label">Nettoyage :</span> <span class="pdf-bold">${report.techNettoyage || ''}</span></div>` : ''}
                  ${isVisibleVoyantConforme ? `<div class="pdf-line"><span class="pdf-label">Voyant conforme :</span> <span class="pdf-bold">${report.techVoyantConforme || ''}</span></div>` : ''}
                  ${isVisibleEquipeMessageNumerique ? `<div class="pdf-line"><span class="pdf-label">Ã‰quipÃ© dâ€™un message numÃ©rique :</span> <span class="pdf-bold">${report.techEquipeMessageNumerique || ''}</span></div>` : ''}
                  ${isVisibleEquipeMessageNumerique && isVisibleMessageNumeriqueConforme ? `<div class="pdf-line"><span class="pdf-label">Message numÃ©rique conforme :</span> <span class="pdf-bold">${report.techMessageNumeroConforme || ''}</span></div>` : ''}
                  ${isVisibleGuidesVocaux ? `<div class="pdf-line"><span class="pdf-label">Guides vocaux conformes :</span> <span class="pdf-bold">${report.techGuidesVocauxConformes || ''}</span></div>` : ''}
                  ${isVisibleBranchementElectrodes ? `<div class="pdf-line"><span class="pdf-label">Branchement conforme des Ã©lectrodes :</span> <span class="pdf-bold">${report.techBranchementElectrodesConforme || ''}</span></div>` : ''}
                </div>
              </div>
            </div>

            ${renderFooter(2, totalPages)}
          </div>

          <!-- PAGE 3 -->
          <div class="pdf-page">
            ${renderHeader()}

            <div class="pdf-grid">
              <!-- SECTION 4 -->
              ${isVisiblePadPakAdulte ? `
              <div class="pdf-card">
                <div class="pdf-card-header">4 â€” Ã‰lectrode Adulte ou Mixte (A).</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">ModÃ¨le d'Ã©lectrode A :</span> <span class="pdf-bold">${electrodeAModelName || ''}</span></div>
                  ${isVisibleLotPadPakA ? `<div class="pdf-line"><span class="pdf-label">Lot A :</span> <span class="pdf-bold">${snapshot.lotElectrodeA || ''}</span></div>` : ''}
                  <div class="pdf-line"><span class="pdf-label">Insertion :</span> <span class="pdf-bold">${snapshot.insertionElectrodeA || ''}</span></div>
                  ${isVisiblePeremptionPadPakA ? `<div class="pdf-line"><span class="pdf-label">PÃ©remption :</span> <span class="pdf-bold">${snapshot.peremptionElectrodeA || ''}</span></div>` : ''}
                  
                  <div class="pdf-line"><span class="pdf-label">ModÃ¨le Ã©lectrode secours :</span> <span class="pdf-bold">${electrodeASecoursModelName || 'Aucun'}</span></div>
                  ${isVisibleLotPadPakA ? `<div class="pdf-line"><span class="pdf-label">Lot de secours :</span> <span class="pdf-bold">${snapshot.lotElectrodeASecours || ''}</span></div>` : ''}
                  ${isVisiblePeremptionPadPakA ? `<div class="pdf-line"><span class="pdf-label">PÃ©remption de secours :</span> <span class="pdf-bold">${snapshot.peremptionSecoursElectrodeA || ''}</span></div>` : ''}
                  
                  <div class="pdf-line"><span class="pdf-label">Ã‰lectrode A remplacÃ©e :</span> <span class="pdf-bold">${report.electrodeARemplacee || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">SÃ©lection de l'Ã©lectrode remplacÃ©e :</span> <span class="pdf-bold">${selElectrodeA || ''}</span></div>
                  
                  <div class="pdf-line"><span class="pdf-label">Ã‰lectrode A Secours remplacÃ©e :</span> <span class="pdf-bold">${report.electrodeASecoursRemplacee || 'Non'}</span></div>
                  <div class="pdf-line"><span class="pdf-label">SÃ©lection de l'Ã©lectrode Secours A remplacÃ©e :</span> <span class="pdf-bold">${selElectrodeASecours || ''}</span></div>
                  
                  <div class="pdf-line"><span class="pdf-label">Ã‰lectrode A conforme et fonctionnelle :</span> <span class="pdf-bold">${report.electrodeAConformeSante || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire concernant lâ€™Ã©lectrode A :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireElectrodeA || ''}</span></div>
                </div>
              </div>
              ` : ''}

              <!-- SECTION 5 -->
              ${isVisiblePadPakPediatrique ? `
              <div class="pdf-card">
                <div class="pdf-card-header">5 â€” Ã‰lectrode PÃ©diatrique (P).</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">ModÃ¨le d'Ã©lectrode P :</span> <span class="pdf-bold">${electrodePModelName || ''}</span></div>
                  ${isVisibleLotPadPakP ? `<div class="pdf-line"><span class="pdf-label">Lot P :</span> <span class="pdf-bold">${snapshot.lotElectrodeP || ''}</span></div>` : ''}
                  ${isVisiblePeremptionPadPakP ? `<div class="pdf-line"><span class="pdf-label">PÃ©remption :</span> <span class="pdf-bold">${snapshot.peremptionElectrodeP || ''}</span></div>` : ''}
                  
                  <div class="pdf-line"><span class="pdf-label">ModÃ¨le Ã©lectrode secours :</span> <span class="pdf-bold">${electrodePSecoursModelName || 'Aucun'}</span></div>
                  ${isVisibleLotPadPakP ? `<div class="pdf-line"><span class="pdf-label">Lot de secours :</span> <span class="pdf-bold">${snapshot.lotElectrodePSecours || ''}</span></div>` : ''}
                  ${isVisiblePeremptionPadPakP ? `<div class="pdf-line"><span class="pdf-label">PÃ©remption de secours :</span> <span class="pdf-bold">${snapshot.peremptionSecoursElectrodeP || ''}</span></div>` : ''}
                  
                  <div class="pdf-line"><span class="pdf-label">Ã‰lectrode P remplacÃ©e :</span> <span class="pdf-bold">${report.electrodePRemplacee || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">SÃ©lection de l'Ã©lectrode remplacÃ©e :</span> <span class="pdf-bold">${selElectrodeP || ''}</span></div>
                  
                  <div class="pdf-line"><span class="pdf-label">Ã‰lectrode P Secours remplacÃ©e :</span> <span class="pdf-bold">${report.electrodePSecoursRemplacee || 'Non'}</span></div>
                  <div class="pdf-line"><span class="pdf-label">SÃ©lection de l'Ã©lectrode Secours P remplacÃ©e :</span> <span class="pdf-bold">${selElectrodePSecours || ''}</span></div>
                  
                  <div class="pdf-line"><span class="pdf-label">Ã‰lectrode P conforme et fonctionnelle :</span> <span class="pdf-bold">${report.electrodePConformeSante || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire concernant lâ€™Ã©lectrode P :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireElectrodeP || ''}</span></div>
                </div>
              </div>
              ` : ''}
            </div>

            ${renderFooter(3, totalPages)}
          </div>

          <!-- PAGE 4 -->
          <div class="pdf-page">
            ${renderHeader()}

            <div class="pdf-grid">
              <!-- SECTION 6 -->
              <div class="pdf-card">
                <div class="pdf-card-header">6 â€” Batterie (B).</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">ModÃ¨le de batterie :</span> <span class="pdf-bold">${batterieModelName || ''}</span></div>
                  ${isVisiblePourcentageBatterie ? `<div class="pdf-line"><span class="pdf-label">Pourcentage de charge :</span> <span class="pdf-bold">${snapshot.pourcentageBatterie ? snapshot.pourcentageBatterie + '%' : ''}</span></div>` : ''}
                  ${isVisibleLotP ? `<div class="pdf-line"><span class="pdf-label">Lot B :</span> <span class="pdf-bold">${snapshot.lotBatterie || ''}</span></div>` : ''}
                  ${isVisiblePeremptionBatterie ? `<div class="pdf-line"><span class="pdf-label">PÃ©remption :</span> <span class="pdf-bold">${snapshot.peremptionBatterie || ''}</span></div>` : ''}
                  <div class="pdf-line"><span class="pdf-label">Batterie remplacÃ©e :</span> <span class="pdf-bold">${report.batterieRemplacee || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">SÃ©lection de la batterie remplacÃ©e :</span> <span class="pdf-bold">${selBatterie || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Batterie conforme et fonctionnelle :</span> <span class="pdf-bold">${report.batterieConformeSante || ''}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire concernant la batterie :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireBatterie || ''}</span></div>
                </div>
              </div>

              <!-- SECTION 7 -->
              <div class="pdf-card">
                <div class="pdf-card-header">7 â€” VÃ©rifications du kit de secours.</div>
                <div class="pdf-card-body" style="gap: 3px;">
                  ${isVisiblePeremptionTrousse ? `
                    <div class="pdf-line"><span class="pdf-label">Trousse de secours prÃ©sente :</span> <span class="pdf-bold">${report.kitTrousseSecoursPresent || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Kit de secours remplacÃ© ou ajoutÃ© :</span> <span class="pdf-bold">${report.kitSecoursRemplaceOuAjoute || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">SÃ©lection dâ€™un kit de secours :</span> <span class="pdf-bold">${selKitSecours || ''}</span></div>
                  ` : ''}
                  ${isVisibleCiseauxPresents ? `<div class="pdf-line"><span class="pdf-label">Ciseaux prÃ©sents :</span> <span class="pdf-bold">${report.kitCiseauxPresents || ''}</span></div>` : ''}
                  ${isVisibleMasquePresent ? `<div class="pdf-line"><span class="pdf-label">Masque prÃ©sent :</span> <span class="pdf-bold">${report.kitMasquePresent || ''}</span></div>` : ''}
                  ${isVisibleMasquePresent && isVisiblePeremptionMasque ? `<div class="pdf-line"><span class="pdf-label">PÃ©remption du masque :</span> <span class="pdf-bold">${report.kitPeremptionMasque || ''}</span></div>` : ''}
                  ${isVisibleServiettesPresentes ? `<div class="pdf-line"><span class="pdf-label">Serviettes prÃ©sentes :</span> <span class="pdf-bold">${report.kitServiettesPresentes || ''}</span></div>` : ''}
                  ${isVisibleServiettesPresentes && isVisiblePeremptionServiettes ? `<div class="pdf-line"><span class="pdf-label">PÃ©remption des serviettes :</span> <span class="pdf-bold">${report.kitPeremptionServiettes || ''}</span></div>` : ''}
                  ${isVisibleGantsPresents ? `<div class="pdf-line"><span class="pdf-label">Paires de gants prÃ©sents :</span> <span class="pdf-bold">${report.kitGantsPresents || ''}</span></div>` : ''}
                  ${isVisibleRasoir ? `<div class="pdf-line"><span class="pdf-label">Rasoir :</span> <span class="pdf-bold">${report.kitRasoirPresent || ''}</span></div>` : ''}
                </div>
              </div>
            </div>

            ${renderFooter(4, totalPages)}
          </div>

          <!-- PAGE 5 -->
          <div class="pdf-page">
            ${renderHeader()}

            <div class="pdf-grid">
              <!-- SECTION 8 -->
              <div class="pdf-card">
                <div class="pdf-card-header">8 â€” Diagnostic et clÃ´ture.</div>
                <div class="pdf-card-body" style="display: flex; flex-direction: column; gap: 6px;">
                  <div class="pdf-line">
                    <span class="pdf-label">DÃ©fibrillateur conforme et prÃªt Ã  lâ€™usage :</span> <span class="pdf-bold">${snapshot.conforme === 'Oui' || report.conforme === 'Oui' ? 'Oui' : 'Non'}</span>
                  </div>
                  <div class="pdf-line" style="margin-top: 15px;">
                    <span class="pdf-label">Horodatage entrant :</span> <span class="pdf-bold">${report.date || '-'}</span>
                  </div>
                  <div class="pdf-line">
                    <span class="pdf-label">Horodatage clÃ´ture :</span> <span class="pdf-bold">${report.endTimeStamp || '-'}</span>
                  </div>
                  <div class="pdf-line">
                    <span class="pdf-label">DurÃ©e :</span> <span class="pdf-bold">${computeDurationText(report.date, report.endTimeStamp)}</span>
                  </div>
                  <div class="pdf-line" style="margin-top: 15px;">
                    <span class="pdf-label">Commentaire :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaire || report.defibSnapshot?.commentaire || '-'}</span>
                  </div>
                  <div class="pdf-line" style="margin-top: 6px;">
                    <span class="pdf-label">Fichier(s) :</span>
                    <span class="pdf-bold">
                      ${report.attachments && report.attachments.length > 0
                        ? report.attachments.map((file: any) => `<a href="${file.url}" target="_blank" style="color: #772a7e; text-decoration: underline; margin-right: 8px;">${file.name}</a>`).join(', ')
                        : '-'}
                    </span>
                  </div>
                  <div class="pdf-line" style="margin-top: 6px; margin-bottom: 4px;">
                    <span class="pdf-label">Technicien :</span> <span class="pdf-bold">${report.techName || '-'}</span>
                  </div>
                  
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%; padding-top: 8px; margin-top: 4px;">
                    <!-- Photos (Up to 3 photos stacked vertically) -->
                    ${isVisiblePiecesJointes ? `
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                      <div class="pdf-line" style="font-size: 16px; font-weight: bold !important;">Photographies de l'intervention.</div>
                      
                      ${report.photoUrl ? `
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                          <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                            <img src="${report.photoUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo" referrerPolicy="no-referrer" />
                          </div>
                          <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie globale du dÃ©fibrillateur.</span>
                        </div>
                      ` : ''}

                      ${report.photoArriereUrl ? `
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                          <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                            <img src="${report.photoArriereUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo ArriÃ¨re" referrerPolicy="no-referrer" />
                          </div>
                          <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie arriÃ¨re / Ã©tiquette.</span>
                        </div>
                      ` : ''}

                      ${report.photoResultatTestUrl ? `
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                          <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                            <img src="${report.photoResultatTestUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Resultat Test" referrerPolicy="no-referrer" />
                          </div>
                          <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">RÃ©sultat du test.</span>
                        </div>
                      ` : ''}

                    </div>
                    ` : ''}

                    <!-- Signature Technicien -->
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                      ${report.techSignature ? `
                        <div class="pdf-line" style="font-size: 16px;">Signature technicien.</div>
                        <div style="background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 60px; max-width: 150px;">
                          <img src="${report.techSignature}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature" />
                        </div>
                      ` : ''}
                    </div>

                    <!-- Signature Client -->
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                      ${(clientFound && clientFound.clientSignatureImage) || (report.clientPinCode && report.clientPinCode.trim()) ? `
                        <div class="pdf-line" style="font-size: 16px;">Signature client.</div>
                        ${(report.clientPinCode && report.clientPinCode.trim()) ? `
                          <div style="font-size: 11px; margin-bottom: 2px;">
                            <span class="pdf-label" style="font-size:11px; color:#555;">Code validation:</span> 
                            <span class="pdf-bold" style="font-size:11px; font-family: monospace !important; font-weight: bold !important; color:#000;">${report.clientPinCode}</span>
                          </div>
                        ` : ''}
                        ${clientFound && clientFound.clientSignatureImage ? `
                          <div style="background: transparent; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; max-height: 80px; max-width: 150px; margin-top: 4px;">
                            <img src="${clientFound.clientSignatureImage}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature Client" />
                          </div>
                        ` : ''}
                      ` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            ${renderFooter(5, totalPages)}
          </div>

          ${hasLastPage ? `
            <!-- PAGE 6 -->
            <div class="pdf-page">
              ${renderHeader()}
              <div class="pdf-grid" style="display: flex; flex-direction: column; justify-content: flex-start;">
                <div class="pdf-card" style="display: flex; flex-direction: column;">
                  <div class="pdf-card-header" style="font-weight: bold !important; margin-bottom: 10px;">
                    Informations complÃ©mentaires
                  </div>
                  <div class="pdf-card-body" style="font-size: 15px; color: #000000; white-space: pre-line; line-height: 1.5;">
                    ${pdfLastPageInfoText}
                  </div>
                </div>
              </div>
              ${renderFooter(6, totalPages)}
            </div>
          ` : ''}

        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleCorrectReport = (id: string, updatedFields: Partial<any>) => {
    const updated = generatedReports.map(rep => rep.id === id ? { ...rep, ...updatedFields } : rep);
    saveReports(updated);
  };

  const saveExpenses = (updated: any[]) => {
    setExpenses(updated);
    try {
      localStorage.setItem(`defib_${tenantId}_expenses`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Storage quota exceeded in saveExpenses:', e);
    }
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('expenses', updated, tenantId);
    }
  };

  const saveVeilles = (updated: VeilleRecord[]) => {
    setVeilles(updated);
    try {
      localStorage.setItem(`defib_${tenantId}_veilles`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Storage quota exceeded in saveVeilles:', e);
    }
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('veilles', updated, tenantId);
    }
  };

  const savePointages = (updated: PointageLog[]) => {
    setPointages(updated);
    try {
      localStorage.setItem(`defib_${tenantId}_pointages_history`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Storage quota exceeded in savePointages:', e);
    }
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('pointages', updated, tenantId);
    }
  };

  const handleDeletePointage = (id: string) => {
    const updated = pointages.filter(p => p.id !== id);
    savePointages(updated);
    if (editingPointageId === id) {
      setEditingPointageId(null);
      setEditPointageForm(null);
    }
  };

  const handleEditPointageValue = (
    id: string,
    startDate: string,
    startTime: string,
    endDate: string,
    endTime: string
  ) => {
    const updated = pointages.map(p => {
      if (p.id === id) {
        let durationSeconds = p.durationSeconds;
        let finalEndDate = endDate || p.endDate || startDate;
        try {
          if (startDate && startTime && finalEndDate && endTime) {
            const startStr = `${startDate}T${startTime}:00`;
            const endStr = `${finalEndDate}T${endTime}:00`;
            const startMs = Date.parse(startStr);
            const endMs = Date.parse(endStr);
            if (!isNaN(startMs) && !isNaN(endMs)) {
              durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
            }
          }
        } catch (err) {}
        return {
          ...p,
          startDate,
          startTime,
          endDate: finalEndDate,
          endTime,
          durationSeconds,
          isOngoing: false
        };
      }
      return p;
    });
    savePointages(updated);
  };

  // Load from Firebase on startup, fallback to LocalStorage/Seed Defaults
  useEffect(() => {
    let minTimer: any = null;
    const loadStartMs = Date.now();
    setMinEnvLoading(true);

    async function loadFirebaseAndSeed() {
      setIsFirebaseLoaded(false);
      setLoadedTenantIdState('');
      const activeRunTenantId = tenantId;

      // Multi-candidate resilient local storage reader (checks all alias & prefix combinations)
      const getLocalTenantValue = <T,>(suffix: string, fallback: T): T => {
        const isDNum = /^d\d+$/i.test(activeRunTenantId);
        const isNum = /^\d+$/.test(activeRunTenantId);
        const num = (isDNum || isNum) ? activeRunTenantId.replace(/^d/i, '') : '';
        const candidateKeys = [
          `defib_${activeRunTenantId}_${suffix}`,
          `fs_cache_${activeRunTenantId}_${suffix}`
        ];
        if (num) {
          candidateKeys.push(
            `defib_D${num}_${suffix}`,
            `defib_d${num}_${suffix}`,
            `defib_${num}_${suffix}`,
            `fs_cache_D${num}_${suffix}`,
            `fs_cache_d${num}_${suffix}`,
            `fs_cache_${num}_${suffix}`
          );
        }
        const aliases = getCollectionNameAliases(suffix);
        for (const a of aliases) {
          if (a !== suffix) {
            candidateKeys.push(`defib_${activeRunTenantId}_${a}`, `fs_cache_${activeRunTenantId}_${a}`);
            if (num) {
              candidateKeys.push(
                `defib_D${num}_${a}`,
                `defib_d${num}_${a}`,
                `defib_${num}_${a}`,
                `fs_cache_D${num}_${a}`,
                `fs_cache_d${num}_${a}`,
                `fs_cache_${num}_${a}`
              );
            }
          }
        }
        for (const k of candidateKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed as T;
              if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed as T;
            } catch (_) {}
          }
        }
        for (const k of candidateKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              return JSON.parse(raw) as T;
            } catch (_) {}
          }
        }
        return fallback;
      };

      // 1. Instantly load local cache so the app is immediately usable (0ms delay!)
      try {
        const rawOfflineClients = getLocalTenantValue<Client[]>('clients', activeRunTenantId === 'demo' ? INITIAL_CLIENTS : []);
        let offlineClients: Client[] = Array.isArray(rawOfflineClients) ? rawOfflineClients : [];
        let offlineChanged = false;
        const sanitizedOffline = offlineClients.map(c => {
          if (!c.signaturePin || !c.signaturePin.trim()) {
            offlineChanged = true;
            return { ...c, signaturePin: generateRandomPin() };
          }
          return c;
        });
        setClients(sanitizedOffline);
        if (offlineChanged) {
          localStorage.setItem(`defib_${activeRunTenantId}_clients`, JSON.stringify(sanitizedOffline));
        }

        const baseVariables = getLocalTenantValue<Variable[]>('variables', INITIAL_VARIABLES);
        setVariables(baseVariables);

        const baseDefibrillateurs = getLocalTenantValue<Defibrillateur[]>('defibrillateurs', activeRunTenantId === 'demo' ? INITIAL_DEFIBRILLATEURS : []);
        setDefibrillateurs(baseDefibrillateurs);

        const defaultInfo = {
          name: activeRunTenantId === 'demo' ? "DÃ©fibeo Solutions" : "Mon Cabinet",
          logo: activeRunTenantId === 'demo' ? "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=80&auto=format&fit=crop" : "",
          website: activeRunTenantId === 'demo' ? "29382302.defibeo.com" : "",
          email: activeRunTenantId === 'demo' ? "contact@defibeo-solutions.com" : "",
          phone: activeRunTenantId === 'demo' ? "+33 1 47 20 00 01" : ""
        };
        const baseCompanyInfo = getLocalTenantValue<CompanyInfo>('company_info', defaultInfo);
        setCompanyInfo(baseCompanyInfo);

        const baseMembers = getLocalTenantValue<Member[]>('members', activeRunTenantId === 'demo' ? INITIAL_MEMBERS : []);
        setMembers(baseMembers);

        const rawTickets = getLocalTenantValue<SupportTicket[]>('support_tickets', activeRunTenantId === 'demo' ? INITIAL_TICKETS : []);
        let baseTickets: SupportTicket[] = [];
        if (Array.isArray(rawTickets)) {
          if (activeRunTenantId === 'demo') {
            baseTickets = rawTickets.filter(t => {
              const tEnv = (t.envId || t.tenantId || '').trim().toLowerCase();
              return !tEnv || tEnv === 'demo';
            });
          } else {
            const cleanTenant = activeRunTenantId.trim().toLowerCase();
            const numTenant = cleanTenant.replace(/^d/i, '');
            baseTickets = rawTickets.filter(t => {
              const tEnv = (t.envId || t.tenantId || '').trim().toLowerCase();
              const numEnv = tEnv.replace(/^d/i, '');
              if (tEnv === 'demo') return false;
              if (tEnv && tEnv !== cleanTenant && numEnv !== numTenant) return false;
              if (!tEnv && (t.id === '#482910' || t.id === '#719203' || t.identifiant === 'DEF-75001' || t.identifiant === 'DEF-69002')) return false;
              return true;
            });
          }
        }
        setTickets(baseTickets);

        const baseMemos = getLocalTenantValue<any[]>('memos', []);
        setMemos(baseMemos);

        const rawDocs = getLocalTenantValue<CommercialDoc[]>('commercial_docs', activeRunTenantId === 'demo' ? INITIAL_COMMERCIAL_DOCS : []);
        let baseDocs: CommercialDoc[] = [];
        if (Array.isArray(rawDocs)) {
          baseDocs = rawDocs.filter(d => {
            if (activeRunTenantId !== 'demo') {
              const dEnv = (d.envId || d.tenantId || '').trim().toLowerCase();
              const cleanTenant = activeRunTenantId.trim().toLowerCase();
              const numTenant = cleanTenant.replace(/^d/i, '');
              if (dEnv === 'demo') return false;
              if (dEnv && dEnv !== cleanTenant && dEnv.replace(/^d/i, '') !== numTenant) return false;
              if (!dEnv && d.clientDenomination && (d.clientDenomination.includes('Medical360') || d.clientDenomination.includes('SecoursProOuest'))) return false;
            }
            return true;
          });
        }
        setCommercialDocs(baseDocs);

        const baseGed = getLocalTenantValue<GedDocument[]>('ged_docs', activeRunTenantId === 'demo' ? INITIAL_GED_DOCS : []);
        setGedDocs(baseGed);

        const baseStocks = getLocalTenantValue<StockRecord[]>('stocks', activeRunTenantId === 'demo' ? INITIAL_STOCKS : []);
        setStocks(baseStocks);

        const baseDistrib = getLocalTenantValue<DistributedStockLocation[]>('distributed_stocks', activeRunTenantId === 'demo' ? INITIAL_DISTRIBUTED_STOCKS : []);
        setDistributedStocks(baseDistrib);

        const baseReviews = getLocalTenantValue<any[]>('customer_reviews', activeRunTenantId === 'demo' ? INITIAL_REVIEWS : []);
        setCustomerReviews(baseReviews);

        const baseReports = getLocalTenantValue<any[]>('generated_reports', activeRunTenantId === 'demo' ? INITIAL_REPORTS : []);
        setGeneratedReports(baseReports);

        const baseTours = getLocalTenantValue<any[]>('fsm_tours', activeRunTenantId === 'demo' ? INITIAL_TOURS : []);
        setFsmTours(baseTours);

        const baseExpenses = getLocalTenantValue<any[]>('expenses', activeRunTenantId === 'demo' ? INITIAL_EXPENSES : []);
        setExpenses(baseExpenses);

        const baseOtherEquip = getLocalTenantValue<OtherEquipment[]>('other_equipments', activeRunTenantId === 'demo' ? INITIAL_OTHER_EQUIPMENTS : []);
        setOtherEquipments(baseOtherEquip);

        const basePointages = getLocalTenantValue<PointageLog[]>('pointages_history', []);
        setPointages(basePointages);

        const basePointagesAuto = getLocalTenantValue<PointageAutoVigilance[]>('pointages_auto_vigilance', []);
        setPointagesAutoVigilance(basePointagesAuto);

        const baseAchats = getLocalTenantValue<AchatFournisseur[]>('achats_fournisseurs', []);
        setAchatsFournisseurs(baseAchats);

        const baseVeilles = getLocalTenantValue<VeilleRecord[]>('veilles', activeRunTenantId === 'demo' ? INITIAL_VEILLES : []);
        setVeilles(baseVeilles);

        const baseFormations = getLocalTenantValue<FormationRecord[]>('formations', []);
        setFormations(baseFormations);

        const baseStagiaires = getLocalTenantValue<StagiaireRecord[]>('stagiaires', []);
        setStagiaires(baseStagiaires);

        const baseEmargements = getLocalTenantValue<EmargementRecord[]>('emargements', []);
        setEmargements(baseEmargements);

        let cleanedNotifications: AppNotification[] = [];
        const rawNotifs = getLocalTenantValue<AppNotification[]>('notifications', []);
        if (Array.isArray(rawNotifs)) {
          if (activeRunTenantId === 'demo') {
            cleanedNotifications = rawNotifs.filter(n => {
              if (!n || typeof n !== 'object') return false;
              const tEnv = (n.envId || n.tenantId || '').trim().toLowerCase();
              return (!tEnv || tEnv === 'demo') && !isNotificationOlderThan3Months(n.timestamp);
            });
          } else {
            const cleanTenant = activeRunTenantId.trim().toLowerCase();
            const numTenant = cleanTenant.replace(/^d/i, '');
            cleanedNotifications = rawNotifs.filter(n => {
              if (!n || typeof n !== 'object') return false;
              const tEnv = (n.envId || n.tenantId || '').trim().toLowerCase();
              const numEnv = tEnv.replace(/^d/i, '');
              if (tEnv === 'demo') return false;
              if (tEnv && tEnv !== cleanTenant && numEnv !== numTenant) return false;
              if (n.id === 'conn-2' || n.id === 'conn-3' || (n.title && n.title.includes('admin@defibeo.com vient sâ€™est connectÃ©'))) return false;
              return !isNotificationOlderThan3Months(n.timestamp);
            });
          }
        }
        setNotifications(cleanedNotifications);

        const savedEnable = localStorage.getItem(`defib_${activeRunTenantId}_enable_other_equipments`);
        setEnableOtherEquipments(savedEnable || baseCompanyInfo.enableOtherEquipments || 'Non');

        // Prime the loadedDataRef instantly with the loaded offline cached data
        // to prevent any race condition auto-saves from triggering on startup
        loadedDataRef.current = {
          clients: JSON.stringify(sanitizedOffline),
          variables: JSON.stringify(baseVariables),
          defibrillateurs: JSON.stringify(baseDefibrillateurs),
          stocks: JSON.stringify(baseStocks),
          companyInfo: JSON.stringify(baseCompanyInfo),
          members: JSON.stringify(baseMembers),
          tickets: JSON.stringify(baseTickets),
          pointages: JSON.stringify(basePointages),
          pointagesAutoVigilance: JSON.stringify(basePointagesAuto),
          commercialDocs: JSON.stringify(baseDocs),
          customerReviews: JSON.stringify(baseReviews),
          notifications: JSON.stringify(cleanedNotifications),
          gedDocs: JSON.stringify(baseGed),
          expenses: JSON.stringify(baseExpenses),
          veilles: JSON.stringify(baseVeilles),
          generatedReports: JSON.stringify(baseReports),
          fsmTours: JSON.stringify(baseTours),
          memos: JSON.stringify(baseMemos),
          otherEquipments: JSON.stringify(baseOtherEquip),
          achats_fournisseurs: JSON.stringify(baseAchats),
          formations: JSON.stringify(baseFormations),
          stagiaires: JSON.stringify(baseStagiaires),
          emargements: JSON.stringify(baseEmargements)
        };

        loadedTenantIdRef.current = activeRunTenantId;

        // Synchronize browser's active local cache to the backend REST server in background (only if local data is populated)
        if (typeof fetch !== 'undefined') {
          if (Array.isArray(baseDefibrillateurs) && baseDefibrillateurs.length > 0) {
            fetch('/api/sync-collection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ collectionName: 'defibrillateurs', tenantId: activeRunTenantId, value: baseDefibrillateurs })
            }).catch(() => {});
          }
          if (Array.isArray(sanitizedOffline) && sanitizedOffline.length > 0) {
            fetch('/api/sync-collection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ collectionName: 'clients', tenantId: activeRunTenantId, value: sanitizedOffline })
            }).catch(() => {});
          }
        }
      } catch (localErr) {
        console.warn("Failed to load instant offline fallback data:", localErr);
      }

      try {
        console.log('DÃ©marrage de la synchronisation Firestore en arriÃ¨re-plan...');
        const syncTasks: Promise<any>[] = [];

        // Helper for independent background syncing of each collection
        const syncBackground = async <T,>(
          collectionName: string,
          localStorageKeySuffix: string,
          stateSetter: (val: T) => void,
          customTransformer?: (data: T) => T | Promise<T>
        ) => {
          try {
            const data = await fetchCollectionFromFirestore<T>(collectionName, activeRunTenantId);
            if (activeRunTenantId !== loadedTenantIdRef.current && activeRunTenantId !== tenantId) return;
            if (data !== null) {
              let finalData = data;
              if (customTransformer) {
                finalData = await customTransformer(data);
              }
              stateSetter(finalData);
              const strVal = JSON.stringify(finalData);
              safeSetLocalStorage(`defib_${activeRunTenantId}_${localStorageKeySuffix}`, strVal);
              loadedDataRef.current[localStorageKeySuffix] = strVal;
              loadedDataRef.current[collectionName] = strVal;
            }
          } catch (err) {
            console.warn(`Background sync failed for ${collectionName}:`, err);
          }
        };

        // Fire all sync tasks completely concurrently and collect promises
        syncTasks.push(syncBackground<Client[]>('clients', 'clients', setClients, (data) => {
          let changed = false;
          const sanitized = data.map(c => {
            if (!c.signaturePin || !c.signaturePin.trim()) {
              changed = true;
              return { ...c, signaturePin: generateRandomPin() };
            }
            return c;
          });
          if (changed) {
            saveCollectionToFirestore('clients', sanitized, tenantId);
          }
          return sanitized;
        }));

        syncTasks.push(syncBackground<Variable[]>('variables', 'variables', setVariables));
        syncTasks.push(syncBackground<Defibrillateur[]>('defibrillateurs', 'defibrillateurs', setDefibrillateurs));
        syncTasks.push(syncBackground<CompanyInfo>('companyInfo', 'company_info', setCompanyInfo, (firestoreData) => {
          const localRaw = localStorage.getItem(`defib_${tenantId}_company_info`);
          let localData: Partial<CompanyInfo> = {};
          if (localRaw) {
            try {
              localData = JSON.parse(localRaw) as CompanyInfo;
            } catch (e) {}
          }
          // Firestore is the supreme source of truth for cross-device consistency
          const merged: CompanyInfo = {
            ...localData,
            ...firestoreData,
            hiddenTabs: firestoreData.hiddenTabs !== undefined ? firestoreData.hiddenTabs : (localData.hiddenTabs || []),
            customLocationNames: firestoreData.customLocationNames !== undefined ? firestoreData.customLocationNames : (localData.customLocationNames || {}),
            enableAutoEmails: firestoreData.enableAutoEmails !== undefined ? firestoreData.enableAutoEmails : (localData.enableAutoEmails || 'Oui'),
            enableSatisfactionAvis: firestoreData.enableSatisfactionAvis !== undefined ? firestoreData.enableSatisfactionAvis : (localData.enableSatisfactionAvis || 'Oui'),
            enableDevisFactures: firestoreData.enableDevisFactures !== undefined ? firestoreData.enableDevisFactures : (localData.enableDevisFactures || 'Oui'),
            disableHelpsAndTutorials: firestoreData.disableHelpsAndTutorials !== undefined ? firestoreData.disableHelpsAndTutorials : (localData.disableHelpsAndTutorials || 'Non'),
            communicationPortailClient: firestoreData.communicationPortailClient !== undefined ? firestoreData.communicationPortailClient : (localData.communicationPortailClient || ''),
            pdfHeaderBgColor: firestoreData.pdfHeaderBgColor !== undefined ? firestoreData.pdfHeaderBgColor : localData.pdfHeaderBgColor,
            pdfCardBorderColor: firestoreData.pdfCardBorderColor !== undefined ? firestoreData.pdfCardBorderColor : localData.pdfCardBorderColor,
            pdfCardBgColor: firestoreData.pdfCardBgColor !== undefined ? firestoreData.pdfCardBgColor : localData.pdfCardBgColor,
            pdfLabelTextColor: firestoreData.pdfLabelTextColor !== undefined ? firestoreData.pdfLabelTextColor : localData.pdfLabelTextColor,
            pdfHeaderImg: firestoreData.pdfHeaderImg !== undefined ? firestoreData.pdfHeaderImg : localData.pdfHeaderImg,
            pdfPageHeaderText: firestoreData.pdfPageHeaderText !== undefined ? firestoreData.pdfPageHeaderText : localData.pdfPageHeaderText,
            pdfPageFooterText: firestoreData.pdfPageFooterText !== undefined ? firestoreData.pdfPageFooterText : localData.pdfPageFooterText,
            pdfLastPageInfoText: firestoreData.pdfLastPageInfoText !== undefined ? firestoreData.pdfLastPageInfoText : localData.pdfLastPageInfoText,
          };
          if (merged.customLocationNames) {
            setLocationNames(merged.customLocationNames);
            safeSetLocalStorage(`defib_${tenantId}_custom_location_names`, JSON.stringify(merged.customLocationNames));
          }
          if (merged.enableAutoEmails) {
            safeSetLocalStorage(`defib_${tenantId}_enable_auto_emails`, merged.enableAutoEmails);
          }
          if (merged.enableOtherEquipments) {
            setEnableOtherEquipments(merged.enableOtherEquipments);
            safeSetLocalStorage(`defib_${tenantId}_enable_other_equipments`, merged.enableOtherEquipments);
          }
          return merged;
        }));

        syncTasks.push(syncBackground<Member[]>('members', 'members', setMembers, (mems) => {
          const uEmail = loggedUser?.email?.trim().toLowerCase();
          if (uEmail && Array.isArray(mems)) {
            const m = mems.find(item => item.email?.trim().toLowerCase() === uEmail);
            if (m?.themePreference) {
              localStorage.setItem(`defib_${tenantId}_user_${uEmail}_theme`, m.themePreference);
              localStorage.setItem(`defib_user_theme_${uEmail}`, m.themePreference);
              localStorage.setItem('defib_current_user_theme', m.themePreference);
              setThemeRefreshTrigger(prev => prev + 1);
            }
            if (m?.faviconPreference) {
              localStorage.setItem(`defib_${tenantId}_user_${uEmail}_favicon`, m.faviconPreference);
              localStorage.setItem(`defib_user_favicon_${uEmail}`, m.faviconPreference);
              localStorage.setItem('defib_current_user_favicon', m.faviconPreference);
              setFaviconRefreshTrigger(prev => prev + 1);
            }
          }
          return mems;
        }));

        syncTasks.push(syncBackground<SupportTicket[]>('tickets', 'support_tickets', setTickets, (rawTickets) => {
          if (!Array.isArray(rawTickets)) return [];
          if (tenantId === 'demo') {
            return rawTickets.filter(t => {
              const tEnv = (t.envId || t.tenantId || '').trim().toLowerCase();
              return !tEnv || tEnv === 'demo';
            });
          }
          const cleanTenant = tenantId.trim().toLowerCase();
          const numTenant = cleanTenant.replace(/^d/i, '');
          return rawTickets.filter(t => {
            const tEnv = (t.envId || t.tenantId || '').trim().toLowerCase();
            const numEnv = tEnv.replace(/^d/i, '');
            if (tEnv === 'demo') return false;
            if (tEnv && tEnv !== cleanTenant && numEnv !== numTenant) return false;
            if (!tEnv && (t.id === '#482910' || t.id === '#719203' || t.identifiant === 'DEF-75001' || t.identifiant === 'DEF-69002')) return false;
            return true;
          });
        }));
        syncTasks.push(syncBackground<CommercialDoc[]>('commercialDocs', 'commercial_docs', setCommercialDocs, (docs) => {
          if (!Array.isArray(docs)) return [];
          if (tenantId === 'demo') return docs;
          const cleanTenant = tenantId.trim().toLowerCase();
          const numTenant = cleanTenant.replace(/^d/i, '');
          return docs.filter(d => {
            const dEnv = (d.envId || d.tenantId || '').trim().toLowerCase();
            if (dEnv === 'demo') return false;
            if (dEnv && dEnv !== cleanTenant && dEnv.replace(/^d/i, '') !== numTenant) return false;
            if (!dEnv && d.clientDenomination && (d.clientDenomination.includes('Medical360') || d.clientDenomination.includes('SecoursProOuest'))) return false;
            return true;
          });
        }));
        syncTasks.push(syncBackground<GedDocument[]>('gedDocs', 'ged_docs', setGedDocs));
        syncTasks.push(syncBackground<StockRecord[]>('stocks', 'stocks', setStocks));
        syncTasks.push(syncBackground<DistributedStockLocation[]>('distributed_stocks', 'distributed_stocks', setDistributedStocks));
        syncTasks.push(syncBackground<any[]>('customerReviews', 'customer_reviews', setCustomerReviews));
        syncTasks.push(syncBackground<PointageLog[]>('pointages', 'pointages_history', setPointages));
        syncTasks.push(syncBackground<any[]>('expenses', 'expenses', setExpenses));
        syncTasks.push(syncBackground<VeilleRecord[]>('veilles', 'veilles', setVeilles));
        syncTasks.push(syncBackground<any[]>('generatedReports', 'generated_reports', setGeneratedReports));
        syncTasks.push(syncBackground<any[]>('fsmTours', 'fsm_tours', setFsmTours, (tours) => {
          if (!Array.isArray(tours)) return [];
          if (tenantId === 'demo') return tours;
          return tours.filter(t => t.id !== 'fsm-tour-demo' && t.techName !== 'Jakub DÃ©mo');
        }));
        syncTasks.push(syncBackground<Memo[]>('memos', 'memos', setMemos));
        syncTasks.push(syncBackground<OtherEquipment[]>('otherEquipments', 'other_equipments', setOtherEquipments));
        syncTasks.push(syncBackground<PointageAutoVigilance[]>('pointagesAutoVigilance', 'pointages_auto_vigilance', setPointagesAutoVigilance));
        syncTasks.push(syncBackground<AchatFournisseur[]>('achats_fournisseurs', 'achats_fournisseurs', setAchatsFournisseurs));
        syncTasks.push(syncBackground<LogisticsNotification[]>('logistics_notifications', 'logistics_notifications', setLogisticsNotifications));
        syncTasks.push(syncBackground<FormationRecord[]>('formations', 'formations', setFormations));
        syncTasks.push(syncBackground<StagiaireRecord[]>('stagiaires', 'stagiaires', setStagiaires));
        syncTasks.push(syncBackground<EmargementRecord[]>('emargements', 'emargements', setEmargements));

        const currentEmail = loggedUser?.email?.trim().toLowerCase();
        if (currentEmail && tenantId && tenantId !== 'demo') {
          const cleanEmail = currentEmail.replace(/[^a-zA-Z0-9]/g, '_');
          syncTasks.push(
            fetchCollectionFromFirestore<{ themeId?: string }>(`userTheme_${cleanEmail}`, tenantId)
              .then(tData => {
                if (tData?.themeId) {
                  localStorage.setItem(`defib_${tenantId}_user_${currentEmail}_theme`, tData.themeId);
                  localStorage.setItem(`defib_user_theme_${currentEmail}`, tData.themeId);
                  localStorage.setItem('defib_current_user_theme', tData.themeId);
                  setThemeRefreshTrigger(prev => prev + 1);
                }
              })
              .catch(() => {})
          );
          syncTasks.push(
            fetchCollectionFromFirestore<{ faviconId?: string; faviconUrl?: string }>(`userFavicon_${cleanEmail}`, tenantId)
              .then(fData => {
                if (fData?.faviconId) {
                  localStorage.setItem(`defib_${tenantId}_user_${currentEmail}_favicon`, fData.faviconId);
                  localStorage.setItem(`defib_user_favicon_${currentEmail}`, fData.faviconId);
                  localStorage.setItem('defib_current_user_favicon', fData.faviconId);
                  setFaviconRefreshTrigger(prev => prev + 1);
                }
              })
              .catch(() => {})
          );
        }

        syncTasks.push(
          syncBackground<AppNotification[]>('notifications', 'notifications', setNotifications, (notifs) => {
            if (!Array.isArray(notifs)) return [];
            const cleanTenant = tenantId.trim().toLowerCase();
            const numTenant = cleanTenant.replace(/^d/i, '');
            const isDemo = cleanTenant === 'demo';

            const filteredByTenant = notifs.filter(n => {
              if (!n || typeof n !== 'object') return false;
              const tEnv = (n.envId || n.tenantId || '').trim().toLowerCase();
              const numEnv = tEnv.replace(/^d/i, '');
              if (isDemo) {
                return !tEnv || tEnv === 'demo';
              }
              if (tEnv === 'demo') return false;
              if (tEnv) {
                return tEnv === cleanTenant || (numEnv && numEnv === numTenant);
              }
              if (n.id === 'conn-2' || n.id === 'conn-3' || (n.title && n.title.includes('admin@defibeo.com vient sâ€™est connectÃ©'))) return false;
              return true;
            });

            const cleaned = filteredByTenant.filter(n => 
              n && 
              typeof n.title === 'string' && 
              n.title.trim() && 
              typeof n.category === 'string' && 
              n.category.trim() && 
              !n.title.toUpperCase().includes('CONSTAT DE MAINTENANCE') &&
              !isNotificationOlderThan3Months(n.timestamp)
            ).map(n => ({
              ...n,
              envId: n.envId || tenantId,
              tenantId: n.tenantId || tenantId,
            }));

            return cleaned;
          })
        );

        // Await all initial background fetches so that states and loadedDataRef are fully initialized
        await Promise.allSettled(syncTasks);
      } catch (err) {
        console.warn("Background firestore synchronization failed on startup:", err);
      } finally {
        loadedTenantIdRef.current = tenantId;
        setLoadedTenantIdState(tenantId);
        setIsFirebaseLoaded(true);

        const elapsedMs = Date.now() - loadStartMs;
        const remainingMs = Math.max(0, 2000 - elapsedMs);
        minTimer = setTimeout(() => {
          setMinEnvLoading(false);
        }, remainingMs);
      }
    }
    loadFirebaseAndSeed();
    return () => {
      if (minTimer) clearTimeout(minTimer);
    };
  }, [tenantId, envReloadTrigger]);

  // Real-time tab/webapp focus sync to instantly apply changes without refresh/delay
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFocusSync = () => {
      if (tenantId && tenantId !== 'demo' && isFirebaseLoaded) {
        fetchCollectionFromFirestore<CompanyInfo>('companyInfo', tenantId).then((data) => {
          if (data) {
            setCompanyInfo((prev) => {
              const merged = {
                ...prev,
                ...data,
                hiddenTabs: data.hiddenTabs !== undefined ? data.hiddenTabs : (prev?.hiddenTabs || []),
                customLocationNames: data.customLocationNames !== undefined ? data.customLocationNames : prev?.customLocationNames,
                enableAutoEmails: data.enableAutoEmails !== undefined ? data.enableAutoEmails : prev?.enableAutoEmails,
                enableSatisfactionAvis: data.enableSatisfactionAvis !== undefined ? data.enableSatisfactionAvis : prev?.enableSatisfactionAvis,
                enableDevisFactures: data.enableDevisFactures !== undefined ? data.enableDevisFactures : prev?.enableDevisFactures,
                disableHelpsAndTutorials: data.disableHelpsAndTutorials !== undefined ? data.disableHelpsAndTutorials : prev?.disableHelpsAndTutorials,
                communicationPortailClient: data.communicationPortailClient !== undefined ? data.communicationPortailClient : prev?.communicationPortailClient,
                pdfHeaderBgColor: data.pdfHeaderBgColor !== undefined ? data.pdfHeaderBgColor : prev?.pdfHeaderBgColor,
                pdfCardBorderColor: data.pdfCardBorderColor !== undefined ? data.pdfCardBorderColor : prev?.pdfCardBorderColor,
                pdfCardBgColor: data.pdfCardBgColor !== undefined ? data.pdfCardBgColor : prev?.pdfCardBgColor,
                pdfLabelTextColor: data.pdfLabelTextColor !== undefined ? data.pdfLabelTextColor : prev?.pdfLabelTextColor,
                pdfHeaderImg: data.pdfHeaderImg !== undefined ? data.pdfHeaderImg : prev?.pdfHeaderImg,
                pdfPageHeaderText: data.pdfPageHeaderText !== undefined ? data.pdfPageHeaderText : prev?.pdfPageHeaderText,
                pdfPageFooterText: data.pdfPageFooterText !== undefined ? data.pdfPageFooterText : prev?.pdfPageFooterText,
                pdfLastPageInfoText: data.pdfLastPageInfoText !== undefined ? data.pdfLastPageInfoText : prev?.pdfLastPageInfoText,
              };
              const strVal = JSON.stringify(merged);
              localStorage.setItem(`defib_${tenantId}_company_info`, strVal);
              loadedDataRef.current.companyInfo = strVal;
              return merged;
            });
          }
        }).catch(err => console.warn("Focus sync companyInfo failed:", err));
      }
    };

    window.addEventListener('focus', handleFocusSync);
    // Also run once on mount
    handleFocusSync();
    return () => {
      window.removeEventListener('focus', handleFocusSync);
    };
  }, [tenantId, isFirebaseLoaded]);

  const loadApiConnectors = React.useCallback(() => {
    fetchCollectionFromFirestore<any>('api_connectors', tenantId).then(data => {
      if (data) {
        if (data.pennylaneActive !== undefined) setPennylaneActive(data.pennylaneActive);
        if (data.dropboxActive !== undefined) setDropboxActive(data.dropboxActive);
        if (data.dropboxAccessToken !== undefined) setDropboxAccessToken(data.dropboxAccessToken);
      } else {
        setPennylaneActive(false);
        setDropboxActive(false);
        setDropboxAccessToken('');
      }
    }).catch(err => {
      console.error("Error loading api_connectors:", err);
      setPennylaneActive(false);
      setDropboxActive(false);
      setDropboxAccessToken('');
    });
  }, [tenantId]);

  useEffect(() => {
    loadApiConnectors();
  }, [activeTab, isFirebaseLoaded, loadApiConnectors]);

  // Save state changes back to Firebase
  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(clients);
      if (loadedDataRef.current.clients === str) return;
      saveCollectionToFirestore('clients', clients, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_clients`, str);
      loadedDataRef.current.clients = str;
    }
  }, [clients, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(variables);
      if (loadedDataRef.current.variables === str) return;
      saveCollectionToFirestore('variables', variables, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_variables`, str);
      loadedDataRef.current.variables = str;
    }
  }, [variables, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(defibrillateurs);
      if (loadedDataRef.current.defibrillateurs === str) return;
      saveCollectionToFirestore('defibrillateurs', defibrillateurs, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_defibrillateurs`, str);
      loadedDataRef.current.defibrillateurs = str;
    }
  }, [defibrillateurs, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(stocks);
      if (loadedDataRef.current.stocks === str) return;
      saveCollectionToFirestore('stocks', stocks, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_stocks`, str);
      loadedDataRef.current.stocks = str;
    }
  }, [stocks, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(companyInfo);
      if (loadedDataRef.current.companyInfo === str) return;
      saveCollectionToFirestore('companyInfo', companyInfo, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_company_info`, str);
      loadedDataRef.current.companyInfo = str;
    }
  }, [companyInfo, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(members);
      if (loadedDataRef.current.members === str) return;
      saveCollectionToFirestore('members', members, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_members`, str);
      loadedDataRef.current.members = str;
    }
  }, [members, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(tickets);
      if (loadedDataRef.current.tickets === str) return;
      saveCollectionToFirestore('tickets', tickets, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_support_tickets`, str);
      loadedDataRef.current.tickets = str;
    }
  }, [tickets, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(pointages);
      if (loadedDataRef.current.pointages === str) return;
      saveCollectionToFirestore('pointages', pointages, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_pointages_history`, str);
      loadedDataRef.current.pointages = str;
    }
  }, [pointages, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(pointagesAutoVigilance);
      if (loadedDataRef.current.pointagesAutoVigilance === str) return;
      saveCollectionToFirestore('pointagesAutoVigilance', pointagesAutoVigilance, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_pointages_auto_vigilance`, str);
      loadedDataRef.current.pointagesAutoVigilance = str;
    }
  }, [pointagesAutoVigilance, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(commercialDocs);
      if (loadedDataRef.current.commercialDocs === str) return;
      saveCollectionToFirestore('commercialDocs', commercialDocs, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_commercial_docs`, str);
      loadedDataRef.current.commercialDocs = str;
    }
  }, [commercialDocs, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(customerReviews);
      if (loadedDataRef.current.customerReviews === str) return;
      saveCollectionToFirestore('customerReviews', customerReviews, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_customer_reviews`, str);
      loadedDataRef.current.customerReviews = str;
    }
  }, [customerReviews, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const stamped = notifications.map(n => ({
        ...n,
        envId: n.envId || tenantId,
        tenantId: n.tenantId || tenantId,
      }));
      const str = JSON.stringify(stamped);
      if (loadedDataRef.current.notifications === str) return;
      saveCollectionToFirestore('notifications', stamped, tenantId);
      safeSetLocalStorage(`defib_${tenantId}_notifications`, str);
      loadedDataRef.current.notifications = str;
    }
  }, [notifications, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(gedDocs);
      if (loadedDataRef.current.gedDocs === str) return;
      saveCollectionToFirestore('gedDocs', gedDocs, tenantId);
      try {
        localStorage.setItem(`defib_${tenantId}_ged_docs`, str);
      } catch (e) {
        console.warn('Storage quota exceeded for gedDocs:', e);
      }
      loadedDataRef.current.gedDocs = str;
    }
  }, [gedDocs, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(expenses);
      if (loadedDataRef.current.expenses === str) return;
      saveCollectionToFirestore('expenses', expenses, tenantId);
      try {
        localStorage.setItem(`defib_${tenantId}_expenses`, str);
      } catch (e) {
        console.warn('Storage quota exceeded for expenses:', e);
      }
      loadedDataRef.current.expenses = str;
    }
  }, [expenses, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(veilles);
      if (loadedDataRef.current.veilles === str) return;
      saveCollectionToFirestore('veilles', veilles, tenantId);
      try {
        localStorage.setItem(`defib_${tenantId}_veilles`, str);
      } catch (e) {
        console.warn('Storage quota exceeded for veilles:', e);
      }
      loadedDataRef.current.veilles = str;
    }
  }, [veilles, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(generatedReports);
      if (loadedDataRef.current.generatedReports === str) return;
      saveCollectionToFirestore('generatedReports', generatedReports, tenantId);
      try {
        localStorage.setItem(`defib_${tenantId}_generated_reports`, str);
      } catch (e) {
        console.warn('Storage quota exceeded for generatedReports:', e);
      }
      loadedDataRef.current.generatedReports = str;
    }
  }, [generatedReports, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(fsmTours);
      if (loadedDataRef.current.fsmTours === str) return;
      saveCollectionToFirestore('fsmTours', fsmTours, tenantId);
      try {
        localStorage.setItem(`defib_${tenantId}_fsm_tours`, str);
      } catch (e) {
        console.warn('Storage quota exceeded for fsmTours:', e);
      }
      loadedDataRef.current.fsmTours = str;
    }
  }, [fsmTours, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(memos);
      if (loadedDataRef.current.memos === str) return;
      saveCollectionToFirestore('memos', memos, tenantId);
      try {
        localStorage.setItem(`defib_${tenantId}_memos`, str);
      } catch (e) {
        console.warn('Storage quota exceeded for memos:', e);
      }
      loadedDataRef.current.memos = str;
    }
  }, [memos, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(otherEquipments);
      if (loadedDataRef.current.otherEquipments === str) return;
      saveCollectionToFirestore('otherEquipments', otherEquipments, tenantId);
      try {
        localStorage.setItem(`defib_${tenantId}_other_equipments`, str);
      } catch (e) {
        console.warn('Storage quota exceeded for otherEquipments:', e);
      }
      loadedDataRef.current.otherEquipments = str;
    }
  }, [otherEquipments, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  useEffect(() => {
    if (isFirebaseLoaded && tenantId === loadedTenantIdState) {
      const str = JSON.stringify(achatsFournisseurs);
      if (loadedDataRef.current.achats_fournisseurs === str) return;
      saveCollectionToFirestore('achats_fournisseurs', achatsFournisseurs, tenantId);
      try {
        localStorage.setItem(`defib_${tenantId}_achats_fournisseurs`, str);
      } catch (e) {
        console.warn('Storage quota exceeded for achatsFournisseurs:', e);
      }
      loadedDataRef.current.achats_fournisseurs = str;
    }
  }, [achatsFournisseurs, isFirebaseLoaded, tenantId, loadedTenantIdState]);

  const saveGedDocs = (newGed: GedDocument[]) => {
    setGedDocs(newGed);
    localStorage.setItem(`defib_${tenantId}_ged_docs`, JSON.stringify(newGed));
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('gedDocs', newGed, tenantId);
    }
  };


  const saveCommercialDocs = (newDocs: CommercialDoc[]) => {
    const stampedDocs = newDocs.map(d => ({
      ...d,
      envId: d.envId || tenantId,
      tenantId: d.tenantId || tenantId
    }));
    setCommercialDocs(stampedDocs);
    localStorage.setItem(`defib_${tenantId}_commercial_docs`, JSON.stringify(stampedDocs));
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('commercialDocs', stampedDocs, tenantId);
    }
  };

  const getSellingPriceForVariable = (varId: string): number => {
    const matchedStock = stocks.find(s => s.denominationPieceId === varId);
    return matchedStock ? matchedStock.prixVenteHt : 45.00;
  };

  useEffect(() => {
    if (!editingDocId && isDocFormOpen) {
      const prefix = docType === 'Devis' ? 'DEV' : docType === 'Facture' ? 'FACT' : docType === 'Bon de commande' ? 'BDC' : docType === 'Bon de livraison' ? 'BDL' : 'PRO';
      const year = '2026';
      const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
      let maxNum = 0;
      for (const doc of commercialDocs) {
        if (doc.type === docType && doc.ref) {
          const match = doc.ref.match(pattern);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) {
              maxNum = num;
            }
          }
        }
      }
      const nextNum = maxNum + 1;
      const generatedRef = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
      setDocRef(generatedRef);
    }
  }, [docType, isDocFormOpen, editingDocId, commercialDocs]);

  const handleDownloadDoc = (doc: CommercialDoc) => {
    const totalTva = doc.totalHt * 0.20;
    const totalTtc = doc.totalHt * 1.20;
    
    const formatDateStr = (dateStr: string) => {
      if (!dateStr) return '';
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    const itemsHtml = doc.items.map((item, idx) => {
      const isLast = idx === doc.items.length - 1;
      const itemUgs = item.ugs || stocks.find(s => s.denominationPieceId === item.variableId)?.ugs || 'â€”';
      return `
        <tr style="${isLast ? '' : 'border-bottom: 1px solid #dcdcdc;'}">
          <td style="padding: 12px 8px; font-family: monospace;">${itemUgs}</td>
          <td style="padding: 12px 8px;">${item.nomPiece}</td>
          <td style="padding: 12px 8px; text-align: right;">${item.prixVenteHt.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</td>
          <td style="padding: 12px 8px; text-align: center;">${item.quantite}</td>
          <td style="padding: 12px 8px; text-align: right;">${(item.prixVenteHt * item.quantite).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</td>
        </tr>
      `;
    }).join('');

    const clientObj = clients.find(c => c.id === doc.clientId) || clients.find(c => c.denomination === doc.clientDenomination);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>${doc.type} ${doc.ref}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @font-face {
            font-family: "Gochi";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: "Civilprom";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
            font-weight: 100 900;
            font-style: normal;
            font-display: swap;
          }
          
          @page {
            size: auto;
            margin: 0;
          }
          
          body, select, input, textarea, div, p, span, h1, h2, h3, h4, table, tr, th, td, a {
            font-family: "Civilprom", sans-serif !important;
            font-weight: 100 !important;
            color: #000000 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            font-size: 16px !important;
          }
          
          .text-large {
            font-size: 18px !important;
          }
          
          h1.doc-title {
            font-family: "Gochi" !important;
            font-size: 55px !important;
            font-weight: normal !important;
            line-height: 1 !important;
          }
          
          .blue-link {
            color: #2563eb !important;
            text-decoration: underline !important;
            font-weight: 100 !important;
          }
          
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; padding: 0 !important; margin: 1.6cm 1.6cm 1.6cm 1.6cm !important; }
            .max-w-3xl { border: none !important; box-shadow: none !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; }
          }
        </style>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </head>
      <body class="bg-white text-black p-8">
        <div class="max-w-3xl mx-auto p-4 md:p-8" style="background-color: #ffffff; display: flex; flex-direction: column; gap: 24px; box-sizing: border-box;">
          
          <!-- HAUT DE PAGE / COORDONNEES -->
          <div class="flex justify-between items-start pb-4">
            <div>
              ${companyInfo.logo ? `<img src="${companyInfo.logo}" style="max-width: 300px; max-height: 100px; object-fit: contain; margin-bottom: 12px; display: block;" referrerPolicy="no-referrer" />` : ''}
              <span class="text-large" style="display: block; margin-bottom: 4px;">${companyInfo.name}</span>
              <div>${companyInfo.email}</div>
              <div>${companyInfo.phone}</div>
              <div style="margin-top: 2px;"><a href="https://${companyInfo.website}" target="_blank" class="blue-link">${companyInfo.website}</a></div>
            </div>
            <div style="text-align: right;">
              <div>${formatDateStr(doc.dateStr)}</div>
            </div>
          </div>

          <!-- TITRE DU DOCUMENT / INFOS CLIENT -->
          <div class="grid grid-cols-2 gap-6" style="margin-top: 20px;">
            <div>
              <h1 class="doc-title">${(doc.type || 'DEVIS').toUpperCase()}</h1>
              <p style="margin: 4px 0 0 0;">RÃ©fÃ©rence : ${doc.ref}</p>
              <p style="margin: 4px 0 0 0;">Remarque : ${doc.commentaire || ''}</p>
              <p style="margin: 4px 0 0 0;">RÃ©fÃ©rence du contrat : ${clientObj?.referenceContrat || '-'}</p>
              <p style="margin: 4px 0 0 0;">NumÃ©ro de marchÃ© : ${clientObj?.numeroMarche || '-'}</p>
              <p style="margin: 4px 0 0 0;">Payeur ID : ${clientObj?.payeurId || '-'}</p>
              <p style="margin: 4px 0 0 0;">Client ID : ${clientObj?.clientIdField || '-'}</p>
            </div>
            <div style="border: 1px solid #dcdcdc; padding: 16px; border-radius: 12px; background-color: #ffffff;">
              <div style="margin-bottom: 6px;">Client.</div>
              <div style="font-size: 24px !important; font-weight: bold !important; margin-bottom: 6px; line-height: 1.2 !important;">${clientObj ? clientObj.denomination : doc.clientDenomination}</div>
              ${clientObj ? `
                ${clientObj.nomPrenomSite ? `<div style="margin-bottom: 2px;">Contact. ${clientObj.nomPrenomSite}</div>` : ''}
                ${clientObj.siret ? `<div style="margin-bottom: 2px;">NumÃ©ro fiscal. ${clientObj.siret}</div>` : ''}
                ${clientObj.email ? `<div style="margin-bottom: 2px;">Email. ${clientObj.email}</div>` : ''}
                ${clientObj.phone ? `<div style="margin-bottom: 2px;">TÃ©lÃ©phone. ${clientObj.phone}</div>` : ''}
              ` : ''}
            </div>
          </div>

          <!-- TABLEAU DES PRESTATIONS / PIECES -->
          <div style="border: 1px solid #dcdcdc; border-radius: 12px; overflow: hidden; margin-top: 20px; background-color: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid #dcdcdc;">
                  <th style="padding: 10px 8px; font-weight: 100 !important;">UGS.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important;">Description.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: right;">Prix unitaire.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: center;">Volume.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: right;">Total ligne.</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- SECTION DE COMMODITES DES CALCULS (TOTALS) -->
          <div style="display: flex; justify-content: flex-end; padding-top: 16px;">
            <div style="width: 256px; border: 1px solid #dcdcdc; border-radius: 12px; padding: 16px; background-color: #ffffff; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between;">
                <span>Total HT.</span>
                <span>${doc.totalHt.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Total TVA (20%).</span>
                <span>${totalTva.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</span>
              </div>
              <div style="display: flex; justify-content: space-between;" class="text-large">
                <span>Total TTC.</span>
                <span>${totalTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</span>
              </div>
            </div>
          </div>

          <!-- MENTIONS LEGALES ET CONDITIONS -->
          ${companyInfo.mentionsLegalesFactures || companyInfo.conditionsLegalesLink ? `
            <div style="border: 1px solid #dcdcdc; border-radius: 12px; padding: 16px; background-color: #ffffff; display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
              ${companyInfo.mentionsLegalesFactures ? `<div style="font-size: 15px !important;">Mentions lÃ©gales : ${companyInfo.mentionsLegalesFactures}</div>` : ''}
              ${companyInfo.conditionsLegalesLink ? `<div style="font-xs !important;">Conditions lÃ©gales : <a href="${companyInfo.conditionsLegalesLink}" target="_blank" class="blue-link">${companyInfo.conditionsLegalesLink}</a></div>` : ''}
            </div>
          ` : ''}

        </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleDownloadBonCommande = (doc: CommercialDoc) => {
    if (!doc.hasBonCommande) {
      alert("Cette piÃ¨ce comptable ne possÃ¨de pas de Bon de commande. Veuillez modifier la piÃ¨ce pour cocher 'Bon de commande: Oui'.");
      return;
    }

    const totalTva = doc.totalHt * 0.20;
    const totalTtc = doc.totalHt * 1.20;
    
    const formatDateStr = (dateStr: string) => {
      if (!dateStr) return '';
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    const itemsHtml = doc.items.map((item, idx) => {
      const isLast = idx === doc.items.length - 1;
      const itemUgs = item.ugs || stocks.find(s => s.denominationPieceId === item.variableId)?.ugs || 'â€”';
      return `
        <tr style="${isLast ? '' : 'border-bottom: 1px solid #dcdcdc;'}">
          <td style="padding: 12px 8px; font-family: monospace;">${itemUgs}</td>
          <td style="padding: 12px 8px;">${item.nomPiece}</td>
          <td style="padding: 12px 8px; text-align: right;">${item.prixVenteHt.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</td>
          <td style="padding: 12px 8px; text-align: center;">${item.quantite}</td>
          <td style="padding: 12px 8px; text-align: right;">${(item.prixVenteHt * item.quantite).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</td>
        </tr>
      `;
    }).join('');

    const clientObj = clients.find(c => c.id === doc.clientId) || clients.find(c => c.denomination === doc.clientDenomination);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Bon de commande ${doc.bonCommandeReference || 'Sans rÃ©f'}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @font-face {
            font-family: "Gochi";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: "Civilprom";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
            font-weight: 100 900;
            font-style: normal;
            font-display: swap;
          }
          
          @page {
            size: auto;
            margin: 0;
          }
          
          body, select, input, textarea, div, p, span, h1, h2, h3, h4, table, tr, th, td, a {
            font-family: "Civilprom", sans-serif !important;
            font-weight: 100 !important;
            color: #000000 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            font-size: 16px !important;
          }
          
          .text-large {
            font-size: 18px !important;
          }
          
          h1.doc-title {
            font-family: "Gochi" !important;
            font-size: 55px !important;
            font-weight: normal !important;
            line-height: 1 !important;
          }
          
          .blue-link {
            color: #2563eb !important;
            text-decoration: underline !important;
            font-weight: 100 !important;
          }
          
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; padding: 0 !important; margin: 1.6cm 1.6cm 1.6cm 1.6cm !important; }
            .max-w-3xl { border: none !important; box-shadow: none !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; }
          }
        </style>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </head>
      <body class="bg-white text-black p-8">
        <div class="max-w-3xl mx-auto p-4 md:p-8" style="background-color: #ffffff; display: flex; flex-direction: column; gap: 24px; box-sizing: border-box;">
          
          <!-- HAUT DE PAGE / COORDONNEES -->
          <div class="flex justify-between items-start pb-4">
            <div>
              ${companyInfo.logo ? `<img src="${companyInfo.logo}" style="max-width: 300px; max-height: 100px; object-fit: contain; margin-bottom: 12px; display: block;" referrerPolicy="no-referrer" />` : ''}
              <span class="text-large" style="display: block; margin-bottom: 4px;">${companyInfo.name}</span>
              <div>${companyInfo.email}</div>
              <div>${companyInfo.phone}</div>
              <div style="margin-top: 2px;"><a href="https://${companyInfo.website}" target="_blank" class="blue-link">${companyInfo.website}</a></div>
            </div>
            <div style="text-align: right;">
              <div>${formatDateStr(doc.dateStr)}</div>
            </div>
          </div>

          <!-- TITRE DU DOCUMENT / INFOS CLIENT -->
          <div class="grid grid-cols-2 gap-6" style="margin-top: 20px;">
            <div>
              <h1 class="doc-title">BON DE COMMANDE</h1>
              <p style="margin: 4px 0 0 0;">RÃ©fÃ©rence BC : ${doc.bonCommandeReference || '-'}</p>
              <p style="margin: 4px 0 0 0;">Livraison : ${doc.bonCommandeLivraison || '-'}</p>
              <p style="margin: 4px 0 0 0;">Situation : ${doc.bonCommandeSituation || '-'}</p>
              <p style="margin: 4px 0 0 0;">Remarque : ${doc.commentaire || ''}</p>
              <p style="margin: 4px 0 0 0;">EntÃªte : ${doc.bonCommandeEntete || '-'}</p>
              <p style="margin: 4px 0 0 0;">RÃ©fÃ©rence du contrat : ${clientObj?.referenceContrat || '-'}</p>
              <p style="margin: 4px 0 0 0;">NumÃ©ro de marchÃ© : ${clientObj?.numeroMarche || '-'}</p>
              <p style="margin: 4px 0 0 0;">Payeur ID : ${clientObj?.payeurId || '-'}</p>
              <p style="margin: 4px 0 0 0;">Client ID : ${clientObj?.clientIdField || '-'}</p>
            </div>
            <div style="border: 1px solid #dcdcdc; padding: 16px; border-radius: 12px; background-color: #ffffff;">
              <div style="margin-bottom: 6px;">Client.</div>
              <div style="font-size: 24px !important; font-weight: bold !important; margin-bottom: 6px; line-height: 1.2 !important;">${clientObj ? clientObj.denomination : doc.clientDenomination}</div>
              ${clientObj ? `
                ${clientObj.nomPrenomSite ? `<div style="margin-bottom: 2px;">Contact. ${clientObj.nomPrenomSite}</div>` : ''}
                ${clientObj.siret ? `<div style="margin-bottom: 2px;">NumÃ©ro fiscal. ${clientObj.siret}</div>` : ''}
                ${clientObj.email ? `<div style="margin-bottom: 2px;">Email. ${clientObj.email}</div>` : ''}
                ${clientObj.phone ? `<div style="margin-bottom: 2px;">TÃ©lÃ©phone. ${clientObj.phone}</div>` : ''}
              ` : ''}
            </div>
          </div>

          <!-- TABLEAU DES PRESTATIONS / PIECES -->
          <div style="border: 1px solid #dcdcdc; border-radius: 12px; overflow: hidden; margin-top: 20px; background-color: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid #dcdcdc;">
                  <th style="padding: 10px 8px; font-weight: 100 !important;">UGS.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important;">Description.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: right;">Prix unitaire.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: center;">Volume.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: right;">Total ligne.</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- SECTION DE COMMODITES DES CALCULS (TOTALS) -->
          <div style="display: flex; justify-content: flex-end; padding-top: 16px;">
            <div style="width: 256px; border: 1px solid #dcdcdc; border-radius: 12px; padding: 16px; background-color: #ffffff; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between;">
                <span>Total HT.</span>
                <span>${doc.totalHt.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Total TVA (20%).</span>
                <span>${totalTva.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</span>
              </div>
              <div style="display: flex; justify-content: space-between;" class="text-large">
                <span>Total TTC.</span>
                <span>${totalTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}â‚¬</span>
              </div>
            </div>
          </div>

          <!-- MENTIONS LEGALES ET CONDITIONS -->
          ${companyInfo.mentionsLegalesFactures || companyInfo.conditionsLegalesLink ? `
            <div style="border: 1px solid #dcdcdc; border-radius: 12px; padding: 16px; background-color: #ffffff; display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
              ${companyInfo.mentionsLegalesFactures ? `<div style="font-size: 15px !important;">Mentions lÃ©gales : ${companyInfo.mentionsLegalesFactures}</div>` : ''}
              ${companyInfo.conditionsLegalesLink ? `<div style="font-xs !important;">Conditions lÃ©gales : <a href="${companyInfo.conditionsLegalesLink}" target="_blank" class="blue-link">${companyInfo.conditionsLegalesLink}</a></div>` : ''}
            </div>
          ` : ''}

        </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleTransformDoc = (doc: CommercialDoc, targetType: 'Devis' | 'Facture' | 'Bon de commande' | 'Bon de livraison') => {
    const prefixMap: Record<string, string> = {
      'Devis': 'DEV',
      'Facture': 'FACT',
      'Bon de commande': 'BC',
      'Bon de livraison': 'BL'
    };
    const prefix = prefixMap[targetType] || 'DOC';
    const year = '2026';
    const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
    let maxNum = 0;
    for (const d of commercialDocs) {
      if (d.type === targetType && d.ref) {
        const match = d.ref.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
    const nextNum = maxNum + 1;
    const generatedRef = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;

    const newDoc: CommercialDoc = {
      ...doc,
      id: 'doc-' + Date.now(),
      ref: generatedRef,
      type: targetType,
      status: 'Brouillon',
      dateStr: new Date().toISOString().substring(0, 10),
      urlSource: doc.urlSource || '',
    };

    saveCommercialDocs([newDoc, ...commercialDocs]);
    alert(`${doc.type} ${doc.ref} a Ã©tÃ© transformÃ©(e) avec succÃ¨s en ${targetType} (rÃ©f: ${generatedRef}, situation: Brouillon).`);
  };

  const startEditDoc = (doc: CommercialDoc) => {
    setEditingDocId(doc.id);
    setDocType(doc.type);
    setDocRef(doc.ref);
    setDocClientId(doc.clientId);
    setDocDateStr(doc.dateStr);
    setDocStatus(doc.status);
    setDocItems(doc.items);
    setDocCommentaire(doc.commentaire || '');
    setDocCommentaires(doc.commentaires || '');
    setDocUrlSource(doc.urlSource || '');
    setDocAssignedMemberName(doc.assignedMemberName || '');
    setDocHasBonCommande(!!doc.hasBonCommande);
    setDocBonCommandeReference(doc.bonCommandeReference || '');
    setDocBonCommandeLivraison(doc.bonCommandeLivraison || 'Transporteur');
    setDocBonCommandeSituation(doc.bonCommandeSituation || 'Ouvert');
    setDocBonCommandeEntete(doc.bonCommandeEntete || '');
    setDocCodeTaxe(doc.codeTaxe || '');
    setDocPayeurId(doc.payeurId || '');
    setDocClientIdField(doc.clientIdField || '');
    setIsDocFormOpen(true);
  };

  const startNewDoc = () => {
    setEditingDocId(null);
    setDocType('Devis');
    setDocClientId(clients[0]?.id || '');
    setDocDateStr(new Date().toISOString().substring(0, 10));
    setDocStatus('Brouillon');
    setDocItems([]);
    setDocCommentaire('');
    setDocCommentaires('');
    setDocUrlSource('');
    setDocAssignedMemberName('');
    setDocHasBonCommande(false);
    setDocBonCommandeReference('');
    setDocBonCommandeLivraison('Transporteur');
    setDocBonCommandeSituation('Ouvert');
    setDocBonCommandeEntete('');
    setDocCodeTaxe('');
    setDocPayeurId('');
    setDocClientIdField('');
    setIsDocFormOpen(true);
  };

  const triggerPennylaneSync = async (doc: CommercialDoc, silentOnInactive = false) => {
    try {
      const connectors = await fetchCollectionFromFirestore<any>('api_connectors', tenantId);
      if (!connectors || !connectors.pennylaneActive) {
        if (!silentOnInactive) {
          showPennylaneAlert("L'intÃ©gration Pennylane n'est pas activÃ©e. Veuillez l'activer dans les paramÃ¨tres (connecteurs).", "error");
        }
        return;
      }

      const { pennylaneSecretToken, pennylaneCompanyToken } = connectors;
      if (!pennylaneSecretToken || !pennylaneSecretToken.trim()) {
        showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
        return;
      }

      const parseDateToYmd = (dateStr: string): string => {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('/');
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
      };

      const parseVatRate = (codeTaxe?: string): string => {
        if (!codeTaxe) return "20.0";
        const matched = codeTaxe.match(/(\d+(?:\.\d+)?)/);
        if (matched) {
          return matched[1];
        }
        return "20.0";
      };

      const clientObj = clients.find(c => c.id === doc.clientId);
      const clientIdValue = (doc.clientIdField || clientObj?.clientIdField || '').trim();

      let matchedCustomerId = '';

      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pennylaneSecretToken.trim()}`
      };
      if (pennylaneCompanyToken && pennylaneCompanyToken.trim()) {
        authHeaders['X-Company-Token'] = pennylaneCompanyToken.trim();
      }

      try {
        const listResponse = await fetch(`/api/pennylane/customers`, {
          method: 'GET',
          headers: authHeaders
        });

        if (listResponse.ok) {
          const listData = await listResponse.json();
          const customers = Array.isArray(listData) ? listData : (listData.customers || listData.results || []);

          if (clientIdValue) {
            const match = customers.find((c: any) => 
              String(c.id).trim() === clientIdValue || 
              String(c.external_id).trim() === clientIdValue
            );
            if (match) {
              matchedCustomerId = match.id;
            }
          }

          if (!matchedCustomerId) {
            const denom = (doc.clientDenomination || '').trim().toLowerCase();
            if (denom) {
              const match = customers.find((c: any) => 
                (c.company_name && c.company_name.trim().toLowerCase() === denom) ||
                (c.first_name && c.last_name && `${c.first_name} ${c.last_name}`.trim().toLowerCase() === denom)
              );
              if (match) {
                matchedCustomerId = match.id;
              }
            }
          }
        } else {
          showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
          return;
        }
      } catch (err) {
        console.error("Error searching Pennylane customers:", err);
        showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
        return;
      }

      if (!matchedCustomerId) {
        try {
          const createCustomerResponse = await fetch(`/api/pennylane/customers`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              customer: {
                customer_type: 'company',
                company_name: doc.clientDenomination || 'InvitÃ© DÃ©fibeo',
                external_id: clientIdValue || doc.clientId || `client-${Date.now()}`,
                first_name: 'InvitÃ©',
                last_name: doc.clientDenomination || 'DÃ©fibeo',
                emails: clientObj?.email ? [clientObj.email] : ['guest@defibeo.com'],
                phone: clientObj?.telephone || ''
              }
            })
          });

          if (createCustomerResponse.ok) {
            const createdData = await createCustomerResponse.json();
            const createdCustomer = createdData.customer || createdData;
            if (createdCustomer && createdCustomer.id) {
              matchedCustomerId = createdCustomer.id;
            }
          } else {
            showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
            return;
          }
        } catch (err) {
          console.error("Error creating Pennylane customer:", err);
          showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
          return;
        }
      }

      if (!matchedCustomerId) {
        matchedCustomerId = clientIdValue || "guest";
      }

      const invoicePayload = {
        customer_invoice: {
          invoice_number: doc.ref,
          date: parseDateToYmd(doc.dateStr),
          deadline_date: parseDateToYmd(doc.dateStr),
          customer_id: matchedCustomerId,
          draft: true,
          line_items_attributes: doc.items.map(item => ({
            description: item.nomPiece || 'PiÃ¨ce',
            quantity: item.quantite || 1,
            unit_price: item.prixVenteHt || 0.0,
            vat_rate: parseVatRate(doc.codeTaxe)
          }))
        }
      };

      const invoiceResponse = await fetch(`/api/pennylane/customer_invoices`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(invoicePayload)
      });

      if (invoiceResponse.ok) {
        showPennylaneAlert(`La facture ${doc.ref} pour ${doc.clientDenomination} a Ã©tÃ© poussÃ©e avec succÃ¨s sur Pennylane en tant que facture BROUILLON (Draft).`, "success");
      } else {
        showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
      }
    } catch (error: any) {
      console.error("Pennylane Sync Error:", error);
      showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
    }
  };

  const handlePennylaneGlobalSync = async () => {
    try {
      const connectors = await fetchCollectionFromFirestore<any>('api_connectors', tenantId);
      if (!connectors || !connectors.pennylaneActive) {
        showPennylaneAlert("L'intÃ©gration Pennylane n'est pas activÃ©e. Veuillez l'activer dans les paramÃ¨tres (connecteurs).", "error");
        return;
      }

      const { pennylaneSecretToken, pennylaneCompanyToken } = connectors;
      if (!pennylaneSecretToken || !pennylaneSecretToken.trim()) {
        showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
        return;
      }

      const acceptedInvoices = commercialDocs.filter(
        (doc) => doc.type === 'Facture' && doc.status === 'AcceptÃ©'
      );

      if (acceptedInvoices.length === 0) {
        showPennylaneAlert("Aucune facture acceptÃ©e Ã  synchroniser.", "error");
        return;
      }

      const parseDateToYmd = (dateStr: string): string => {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('/');
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
      };

      const parseVatRate = (codeTaxe?: string): string => {
        if (!codeTaxe) return "20.0";
        const matched = codeTaxe.match(/(\d+(?:\.\d+)?)/);
        if (matched) {
          return matched[1];
        }
        return "20.0";
      };

      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pennylaneSecretToken.trim()}`
      };
      if (pennylaneCompanyToken && pennylaneCompanyToken.trim()) {
        authHeaders['X-Company-Token'] = pennylaneCompanyToken.trim();
      }

      let listResponse;
      try {
        listResponse = await fetch(`/api/pennylane/customers`, {
          method: 'GET',
          headers: authHeaders
        });
      } catch (err) {
        console.error("Error fetching Pennylane customers:", err);
        showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
        return;
      }

      if (!listResponse.ok) {
        showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
        return;
      }

      const listData = await listResponse.json();
      const customers = Array.isArray(listData) ? listData : (listData.customers || listData.results || []);

      let successCount = 0;
      let hasError = false;

      for (const doc of acceptedInvoices) {
        let matchedCustomerId = '';
        const clientObj = clients.find(c => c.id === doc.clientId);
        const clientIdValue = (doc.clientIdField || clientObj?.clientIdField || '').trim();

        if (clientIdValue) {
          const match = customers.find((c: any) => 
            String(c.id).trim() === clientIdValue || 
            String(c.external_id).trim() === clientIdValue
          );
          if (match) {
            matchedCustomerId = match.id;
          }
        }

        if (!matchedCustomerId) {
          const denom = (doc.clientDenomination || '').trim().toLowerCase();
          if (denom) {
            const match = customers.find((c: any) => 
              (c.company_name && c.company_name.trim().toLowerCase() === denom) ||
              (c.first_name && c.last_name && `${c.first_name} ${c.last_name}`.trim().toLowerCase() === denom)
            );
            if (match) {
              matchedCustomerId = match.id;
            }
          }
        }

        if (!matchedCustomerId) {
          try {
            const createCustomerResponse = await fetch(`/api/pennylane/customers`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                customer: {
                  customer_type: 'company',
                  company_name: doc.clientDenomination || 'InvitÃ© DÃ©fibeo',
                  external_id: clientIdValue || doc.clientId || `client-${Date.now()}`,
                  first_name: 'InvitÃ©',
                  last_name: doc.clientDenomination || 'DÃ©fibeo',
                  emails: clientObj?.email ? [clientObj.email] : ['guest@defibeo.com'],
                  phone: clientObj?.telephone || ''
                }
              })
            });

            if (createCustomerResponse.ok) {
              const createdData = await createCustomerResponse.json();
              const createdCustomer = createdData.customer || createdData;
              if (createdCustomer && createdCustomer.id) {
                matchedCustomerId = createdCustomer.id;
                customers.push(createdCustomer);
              }
            } else {
              hasError = true;
              continue;
            }
          } catch (err) {
            console.error("Error creating Pennylane customer:", err);
            hasError = true;
            continue;
          }
        }

        if (!matchedCustomerId) {
          matchedCustomerId = clientIdValue || "guest";
        }

        const invoicePayload = {
          customer_invoice: {
            invoice_number: doc.ref,
            date: parseDateToYmd(doc.dateStr),
            deadline_date: parseDateToYmd(doc.dateStr),
            customer_id: matchedCustomerId,
            draft: true,
            line_items_attributes: doc.items.map(item => ({
              description: item.nomPiece || 'PiÃ¨ce',
              quantity: item.quantite || 1,
              unit_price: item.prixVenteHt || 0.0,
              vat_rate: parseVatRate(doc.codeTaxe)
            }))
          }
        };

        try {
          const invoiceResponse = await fetch(`/api/pennylane/customer_invoices`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(invoicePayload)
          });

          if (invoiceResponse.ok) {
            successCount++;
          } else {
            console.error("Failed to push invoice:", await invoiceResponse.text());
            hasError = true;
          }
        } catch (err) {
          console.error("Error pushing invoice:", err);
          hasError = true;
        }
      }

      if (hasError) {
        showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
      } else {
        showPennylaneAlert(`Synchronisation rÃ©ussie ! ${successCount} facture(s) synchronisÃ©e(s) sur Pennylane.`, "success");
      }
    } catch (error: any) {
      console.error("Pennylane Sync Error:", error);
      showPennylaneAlert("Impossible de synchroniser avec le compte Pennylane, vÃ©rifiez les identifiants.", "error");
    }
  };

  const handleSaveDoc = (e: React.FormEvent) => {
    e.preventDefault();
    const activeClient = clients.find(c => c.id === docClientId);
    if (!activeClient) {
      alert("Veuillez sÃ©lectionner un client.");
      return;
    }

    if (docItems.length === 0) {
      alert("Veuillez ajouter au moins une piÃ¨ce ou une ligne au document.");
      return;
    }

    const calculatedTotalHt = docItems.reduce((acc, item) => acc + (item.prixVenteHt * item.quantite), 0);

    let finalBcRef = docBonCommandeReference;
    if (docHasBonCommande && !finalBcRef) {
      const prefix = 'BL';
      const year = '2026';
      const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
      let maxNum = 0;
      for (const d of commercialDocs) {
        if (d.bonCommandeReference) {
          const match = d.bonCommandeReference.match(pattern);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) {
              maxNum = num;
            }
          }
        }
      }
      finalBcRef = `${prefix}-${year}-${maxNum + 1}`;
    }

    if (editingDocId) {
      const updatedDocs = commercialDocs.map(d => d.id === editingDocId ? {
        ...d,
        ref: docRef,
        type: docType,
        clientId: docClientId,
        clientDenomination: activeClient.denomination,
        items: docItems,
        totalHt: calculatedTotalHt,
        status: docStatus,
        dateStr: docDateStr,
        commentaire: docCommentaire,
        commentaires: docCommentaires,
        urlSource: docUrlSource,
        assignedMemberName: docAssignedMemberName || undefined,
        hasBonCommande: docHasBonCommande,
        bonCommandeReference: docHasBonCommande ? finalBcRef : undefined,
        bonCommandeLivraison: docHasBonCommande ? docBonCommandeLivraison : undefined,
        bonCommandeSituation: docHasBonCommande ? docBonCommandeSituation : undefined,
        bonCommandeEntete: docHasBonCommande ? docBonCommandeEntete : undefined,
        codeTaxe: docCodeTaxe,
        payeurId: docPayeurId,
        clientIdField: docClientIdField
      } : d);
      saveCommercialDocs(updatedDocs);
    } else {
      const newDoc: CommercialDoc = {
        id: 'doc-' + Date.now(),
        ref: docRef,
        type: docType,
        clientId: docClientId,
        clientDenomination: activeClient.denomination,
        items: docItems,
        totalHt: calculatedTotalHt,
        status: docStatus,
        dateStr: docDateStr,
        commentaire: docCommentaire,
        commentaires: docCommentaires,
        urlSource: docUrlSource,
        assignedMemberName: docAssignedMemberName || undefined,
        hasBonCommande: docHasBonCommande,
        bonCommandeReference: docHasBonCommande ? finalBcRef : undefined,
        bonCommandeLivraison: docHasBonCommande ? docBonCommandeLivraison : undefined,
        bonCommandeSituation: docHasBonCommande ? docBonCommandeSituation : undefined,
        bonCommandeEntete: docHasBonCommande ? docBonCommandeEntete : undefined,
        codeTaxe: docCodeTaxe,
        payeurId: docPayeurId,
        clientIdField: docClientIdField
      };
      saveCommercialDocs([newDoc, ...commercialDocs]);
    }

    setIsDocFormOpen(false);
    setEditingDocId(null);
  };

  const handleAddLineItem = () => {
    if (!selectedDocPieceId) return;
    const foundVar = variables.find(v => v.id === selectedDocPieceId);
    if (!foundVar) return;
    
    const matchedStock = stocks.find(s => s.denominationPieceId === selectedDocPieceId);
    const ugs = matchedStock?.ugs || '';

    const newItem: CommercialDocItem = {
      variableId: selectedDocPieceId,
      nomPiece: `${foundVar.nom} (${foundVar.marque})`,
      prixVenteHt: customDocPiecePrice,
      quantite: customDocPieceQty,
      ugs: ugs
    };

    setDocItems([...docItems, newItem]);
    // Reset item input
    setSelectedDocPieceId('');
    setCustomDocPiecePrice(0);
    setCustomDocPieceQty(1);
  };

  const startNewGed = () => {
    setGedTitle('');
    setGedCategory('Manuel de conformitÃ©');
    setGedFileName('');
    setSelectedGedFile(null);
    setIsGedFormOpen(true);
  };

  const handleSaveGed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gedTitle.trim()) {
      alert('Veuillez renseigner un titre pour le document.');
      return;
    }

    let finalSize = '1.2 Mo';
    if (selectedGedFile) {
      const bytes = selectedGedFile.size;
      const k = 1024;
      const dm = 1;
      const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      finalSize = parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    } else {
      // simulate standard size below 10 Mo
      const sizes = ['1.2 Mo', '2.5 Mo', '850 Ko', '3.8 Mo', '5.1 Mo', '1.7 Mo'];
      finalSize = sizes[Math.floor(Math.random() * sizes.length)];
    }

    let finalFileName = gedFileName.trim();
    if (!finalFileName) {
      finalFileName = gedTitle.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
    }

    const newDoc: GedDocument = {
      id: 'ged-' + Date.now(),
      title: gedTitle,
      category: gedCategory,
      fileName: finalFileName,
      fileSize: finalSize,
      dateStr: new Date().toISOString().substring(0, 10)
    };

    saveGedDocs([newDoc, ...gedDocs]);
    setIsGedFormOpen(false);
    setSelectedGedFile(null);
  };

  const handleDeleteGed = (id: string) => {
    const updated = gedDocs.filter(d => d.id !== id);
    saveGedDocs(updated);
  };

  const handleConsultGed = (doc: GedDocument) => {
    if (doc.fileContent) {
      const link = document.createElement('a');
      link.href = doc.fileContent;
      link.download = doc.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank');
    } else {
      window.open('https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf', '_blank');
    }
  };

  const handleDeleteExpense = (id: string) => {
    const updated = expenses.filter(e => e.id !== id);
    saveExpenses(updated);
  };


  // Save changes to LocalStorage whenever state updates
  const saveClients = (newClients: Client[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    const sanitized = newClients.map(c => {
      if (!c.signaturePin || !c.signaturePin.trim()) {
        return { ...c, signaturePin: generateRandomPin() };
      }
      return c;
    });
    setClients(sanitized);
    const str = JSON.stringify(sanitized);
    safeSetLocalStorage(`defib_${tenantId}_clients`, str);
    loadedDataRef.current.clients = str;
    if (tenantId) {
      saveCollectionToFirestore('clients', sanitized, tenantId);
    }
  };

  const saveVariables = (newVariables: Variable[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    setVariables(newVariables);
    const str = JSON.stringify(newVariables);
    safeSetLocalStorage(`defib_${tenantId}_variables`, str);
    loadedDataRef.current.variables = str;
    if (tenantId) {
      saveCollectionToFirestore('variables', newVariables, tenantId);
    }
  };

  const saveDefibs = (newDefibs: Defibrillateur[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    setDefibrillateurs(newDefibs);
    const str = JSON.stringify(newDefibs);
    safeSetLocalStorage(`defib_${tenantId}_defibrillateurs`, str);
    loadedDataRef.current.defibrillateurs = str;
    if (tenantId) {
      saveCollectionToFirestore('defibrillateurs', newDefibs, tenantId);
    }
  };

  const saveOtherEquipments = (newItems: OtherEquipment[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    setOtherEquipments(newItems);
    const str = JSON.stringify(newItems);
    safeSetLocalStorage(`defib_${tenantId}_other_equipments`, str);
    loadedDataRef.current.otherEquipments = str;
    if (tenantId) {
      saveCollectionToFirestore('otherEquipments', newItems, tenantId);
    }
  };

  // Ticket Operations
  const handleAddTicket = (ticketData: Omit<SupportTicket, 'id' | 'date' | 'status'>) => {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const ticketId = `#${randomNum}`;
    const newTicket: SupportTicket = {
      id: ticketId,
      ...ticketData,
      date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      status: 'Nouveau',
      envId: tenantId,
      tenantId: tenantId
    };
    const updated = [newTicket, ...tickets];
    setTickets(updated);
    safeSetLocalStorage(`defib_${tenantId}_support_tickets`, JSON.stringify(updated));
    loadedDataRef.current.tickets = JSON.stringify(updated);
    if (tenantId) {
      saveCollectionToFirestore('tickets', updated, tenantId);
    }

    // Email 4: NOUVEAU SIGNALEMENT FORMULAIRE PUBLIQUE
    try {
      triggerEmail4Signalement(
        ticketData.identifiant || 'Inconnu',
        companyInfo.name || 'DÃ©fibeo Suite',
        companyInfo.email || ''
      ).catch(e => console.error("Error triggering Email 4:", e));
    } catch (err) {
      console.error("Error sending signalement email:", err);
    }

    return ticketId;
  };

  const handleUpdateTicketStatus = (id: string, newStatus: SupportTicket['status']) => {
    const updated = tickets.map(t => t.id === id ? { ...t, status: newStatus } : t);
    setTickets(updated);
    safeSetLocalStorage(`defib_${tenantId}_support_tickets`, JSON.stringify(updated));
    loadedDataRef.current.tickets = JSON.stringify(updated);
    if (tenantId) {
      saveCollectionToFirestore('tickets', updated, tenantId);
    }
  };

  const handleDeleteTicket = (id: string) => {
    const updated = tickets.filter(t => t.id !== id);
    setTickets(updated);
    safeSetLocalStorage(`defib_${tenantId}_support_tickets`, JSON.stringify(updated));
    loadedDataRef.current.tickets = JSON.stringify(updated);
    if (tenantId) {
      saveCollectionToFirestore('tickets', updated, tenantId);
    }
  };

  const handleUpdateMemoText = (id: string, text: string) => {
    const updated = memos.map(m => m.id === id ? { ...m, text } : m);
    setMemos(updated);
  };

  const handleDeleteMemo = (id: string) => {
    const updated = memos.filter(m => m.id !== id);
    setMemos(updated);
  };

  const handleReplyToTicket = (id: string, responseText: string) => {
    const ticketObj = tickets.find(t => t.id === id);
    const updated = tickets.map(t => t.id === id ? { ...t, reponse: responseText } : t);
    setTickets(updated);
    safeSetLocalStorage(`defib_${tenantId}_support_tickets`, JSON.stringify(updated));
    loadedDataRef.current.tickets = JSON.stringify(updated);
    if (tenantId) {
      saveCollectionToFirestore('tickets', updated, tenantId);
    }

    // Email 7: RÃ‰PONSE ENVOYÃ‰E DEPUIS LE CRM POUR LE CLIENT
    if (ticketObj && ticketObj.email && ticketObj.email.trim()) {
      try {
        triggerEmail7CrmReply(
          ticketObj.email.trim(),
          responseText,
          companyInfo.name || 'DÃ©fibeo Suite',
          companyInfo.email || ''
        ).catch(e => console.error("Error triggering Email 7:", e));
      } catch (err7) {
        console.error("Error sending CRM reply email:", err7);
      }
    }
  };

  // Company and Members Settings Sync
  const handleUpdateCompanyInfo = (info: CompanyInfo) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    setCompanyInfo(info);
    const infoStr = JSON.stringify(info);
    localStorage.setItem('defib_company_info', infoStr);
    localStorage.setItem(`defib_${tenantId}_company_info`, infoStr);
    loadedDataRef.current.companyInfo = infoStr;
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('companyInfo', info, tenantId).catch(console.error);
    }
  };

  const handleUpdateMembers = (updatedMembers: Member[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    setMembers(updatedMembers);
    localStorage.setItem('defib_members', JSON.stringify(updatedMembers));
    localStorage.setItem(`defib_${tenantId}_members`, JSON.stringify(updatedMembers));
    if (isFirebaseLoaded && tenantId) {
      saveCollectionToFirestore('members', updatedMembers, tenantId).catch(console.error);
    }

    let toursMutated = false;
    const nextTours = fsmTours.map(tour => {
      const mem = updatedMembers.find(m => m.name.trim().toLowerCase() === (tour.techName || '').trim().toLowerCase());
      if (mem) {
        const oldMem = members.find(m => m.name.trim().toLowerCase() === mem.name.trim().toLowerCase());
        const addressChanged = 
          mem.startAddress !== oldMem?.startAddress ||
          mem.startAddressLat !== oldMem?.startAddressLat ||
          mem.startAddressLng !== oldMem?.startAddressLng;
        const prefChanged = mem.optimizationPreference !== oldMem?.optimizationPreference;
        if (addressChanged || prefChanged) {
          toursMutated = true;
          return { ...tour, calculated: false };
        }
      }
      return tour;
    });

    if (toursMutated) {
      saveFsmTours(nextTours);
    }
  };

  // CLIENT CRUD HANDLERS
  const handleAddClient = (clientData: Omit<Client, 'id'>) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    const newClient: Client = {
      id: 'c_' + Date.now(),
      ...clientData,
    };
    saveClients([...clients, newClient]);
  };

  const handleUpdateClient = (updated: Client) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    saveClients(clients.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleDeleteClient = (id: string) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    // Check if any defibrillator is using this client
    const linked = defibrillateurs.some((d) => d.clientId === id);
    if (linked) {
      alert(
        "Impossible de supprimer ce client : certains dÃ©fibrillateurs y sont actuellement rattachÃ©s. Veuillez rÃ©affecter ces appareils Ã  un autre client au prÃ©alable."
      );
      return;
    }
    saveClients(clients.filter((c) => c.id !== id));
  };

  // VARIABLE CRUD HANDLERS
  const handleAddVariable = (variableData: Omit<Variable, 'id'>) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    const newVar: Variable = {
      id: 'v_' + Date.now(),
      ...variableData,
    };
    saveVariables([...variables, newVar]);
  };

  const handleUpdateVariable = (updated: Variable) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    saveVariables(variables.map((v) => (v.id === updated.id ? updated : v)));
  };

  const handleDeleteVariable = (id: string) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    // Check if linked to defibrillateurs inside selected model IDs
    const linked = defibrillateurs.some((d) => 
      d.modeleId === id || 
      d.modeleCoffretId === id ||
      d.modeleElectrodeAId === id ||
      d.modeleElectrodePId === id ||
      d.modeleBatterieId === id
    );
    if (linked) {
      alert(
        "Impossible de supprimer cette variable : elle est rÃ©fÃ©rencÃ©e sur un ou plusieurs dÃ©fibrillateurs actifs. Veuillez dÃ©saffecter cet Ã©quipement avant de poursuivre."
      );
      return;
    }
    saveVariables(variables.filter((v) => v.id !== id));
  };

  // DEFIBRILLATEUR CRUD HANDLERS
  const handleAddDefib = (defibData: Omit<Defibrillateur, 'id'>) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    const newDefib: Defibrillateur = {
      id: 'df_' + Date.now(),
      ...defibData,
    };
    saveDefibs([...defibrillateurs, newDefib]);
  };

  const handleUpdateDefib = (updated: Defibrillateur) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    const exists = defibrillateurs.some((df) => {
      const idMatch = !!(df.id && updated.id && df.id === updated.id);
      const identifiantMatch = !!(df.identifiant && updated.identifiant && df.identifiant.toUpperCase() === updated.identifiant.toUpperCase());
      return idMatch || identifiantMatch;
    });

    if (exists) {
      saveDefibs(defibrillateurs.map((df) => {
        const isMatch = !!((df.id && updated.id && df.id === updated.id) ||
                        (df.identifiant && updated.identifiant && df.identifiant.toUpperCase() === updated.identifiant.toUpperCase()));
        return isMatch ? { ...df, ...updated, id: df.id } : df;
      }));
    } else {
      const newDefib = { ...updated, id: updated.id || 'df_' + Date.now() };
      saveDefibs([...defibrillateurs, newDefib]);
    }
  };

  const handleDeleteDefib = (id: string) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    saveDefibs(defibrillateurs.filter((df) => df.id !== id));
  };

  const handleBulkDeleteDefib = (ids: string[]) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    saveDefibs(defibrillateurs.filter((df) => !ids.includes(df.id)));
  };

  const handleBulkEditDefib = (ids: string[], updates: Partial<Omit<Defibrillateur, 'id'>>) => {
    if (isDeveloper) {
      alert("Action non autorisÃ©e : Le rÃ´le DÃ©veloppeur est en mode lecture seule.");
      return;
    }
    const updatedList = defibrillateurs.map((df) => {
      if (ids.includes(df.id)) {
        return { ...df, ...updates };
      }
      return df;
    });
    saveDefibs(updatedList);
  };

  if (isLoggedIn && (loggedUser?.email === 'tech.ouest@defibeo.com' || localStorage.getItem('defib_logged_user_role') === 'technicien')) {
    return (
      <PublicPortal
        companyInfo={companyInfo}
        members={members}
        onUpdateMembers={handleUpdateMembers}
        defibrillateurs={defibrillateurs}
        onUpdateDefib={handleUpdateDefib}
        variables={variables}
        clients={clients}
        stocks={stocks}
        onUpdateStocks={saveStocks}
        distributedStocks={distributedStocks}
        onUpdateDistributedStocks={saveDistributedStocks}
        fsmTours={fsmTours}
        onUpdateFsmTours={saveFsmTours}
        otherEquipments={otherEquipments}
        onUpdateOtherEquipments={saveOtherEquipments}
        formations={formations}
        generatedReports={generatedReports}
        onUpdateGeneratedReports={saveReports}
        pointages={pointages}
        onUpdatePointages={savePointages}
        expenses={expenses}
        onUpdateExpenses={saveExpenses}
        veilles={veilles}
        onUpdateVeilles={saveVeilles}
        commercialDocs={commercialDocs}
        onUpdateCommercialDocs={saveCommercialDocs}
        onAddTicket={handleAddTicket}
        onAddNotification={addNotification}
        logisticsNotifications={logisticsNotifications}
        saveLogisticsNotifications={saveLogisticsNotifications}
        onAddLogisticsNotification={addLogisticsNotification}
        emargements={emargements}
        onUpdateEmargements={saveEmargements}
        stagiaires={stagiaires}
        onClose={handleLogout}
        onOpenClientPortal={(client) => {
          setActivePortalClient(client);
          setIsClientPortalOpen(true);
          setIsPublicPortalOpen(false);
        }}
      />
    );
  }

  if (isLoggedIn && loggedUser?.email === 'client@demo.com') {
    return (
      <ClientPortal
        clients={clients}
        defibrillateurs={defibrillateurs}
        otherEquipments={otherEquipments}
        commercialDocs={commercialDocs}
        variables={variables}
        onClose={handleLogout}
        onLogout={handleLogout}
        initialClient={activePortalClient || clients.find(c => c.id === 'c1')}
        companyInfo={companyInfo}
        generatedReports={generatedReports}
        onUpdateGeneratedReports={saveReports}
        fsmTours={fsmTours}
        onUpdateFsmTours={saveFsmTours}
        onUpdateClient={(updated) => {
          saveClients(clients.map(c => c.id === updated.id ? updated : c));
          if (activePortalClient && activePortalClient.id === updated.id) {
            setActivePortalClient(updated);
          }
        }}
        stocks={stocks}
        pointagesAutoVigilance={pointagesAutoVigilance}
        onAddPointageAutoVigilance={(newPt) => setPointagesAutoVigilance(prev => [newPt, ...prev])}
        onAddTicket={handleAddTicket}
        onAddNotification={addNotification}
      />
    );
  }

  if (isSatisfactionFormPage) {
    return <SatisfactionFormPage />;
  }

  if (isClientPortalOpen) {
    return (
      <ClientPortal
        clients={clients}
        defibrillateurs={defibrillateurs}
        otherEquipments={otherEquipments}
        commercialDocs={commercialDocs}
        variables={variables}
        onClose={() => {
          const role = localStorage.getItem('defib_logged_user_role');
          if (role === 'client' || role === 'technicien') {
            handleLogout();
          } else {
            setIsClientPortalOpen(false);
            setActivePortalClient(null);
          }
        }}
        onLogout={handleLogout}
        initialClient={activePortalClient}
        companyInfo={companyInfo}
        generatedReports={generatedReports}
        onUpdateGeneratedReports={saveReports}
        fsmTours={fsmTours}
        onUpdateFsmTours={saveFsmTours}
        onUpdateClient={(updated) => {
          saveClients(clients.map(c => c.id === updated.id ? updated : c));
          if (activePortalClient && activePortalClient.id === updated.id) {
            setActivePortalClient(updated);
          }
        }}
        stocks={stocks}
        pointagesAutoVigilance={pointagesAutoVigilance}
        onAddPointageAutoVigilance={(newPt) => setPointagesAutoVigilance(prev => [newPt, ...prev])}
        onAddTicket={handleAddTicket}
        onAddNotification={addNotification}
      />
    );
  }

  if (isPublicPortalOpen) {
    return (
      <PublicPortal
        companyInfo={companyInfo}
        members={members}
        onUpdateMembers={handleUpdateMembers}
        defibrillateurs={defibrillateurs}
        onUpdateDefib={handleUpdateDefib}
        variables={variables}
        clients={clients}
        stocks={stocks}
        onUpdateStocks={saveStocks}
        distributedStocks={distributedStocks}
        onUpdateDistributedStocks={saveDistributedStocks}
        fsmTours={fsmTours}
        onUpdateFsmTours={saveFsmTours}
        otherEquipments={otherEquipments}
        onUpdateOtherEquipments={saveOtherEquipments}
        formations={formations}
        generatedReports={generatedReports}
        onUpdateGeneratedReports={saveReports}
        pointages={pointages}
        onUpdatePointages={savePointages}
        expenses={expenses}
        onUpdateExpenses={saveExpenses}
        veilles={veilles}
        onUpdateVeilles={saveVeilles}
        commercialDocs={commercialDocs}
        onUpdateCommercialDocs={saveCommercialDocs}
        onAddTicket={handleAddTicket}
        onAddNotification={addNotification}
        logisticsNotifications={logisticsNotifications}
        saveLogisticsNotifications={saveLogisticsNotifications}
        onAddLogisticsNotification={addLogisticsNotification}
        emargements={emargements}
        onUpdateEmargements={saveEmargements}
        stagiaires={stagiaires}
        onClose={() => {
          const role = localStorage.getItem('defib_logged_user_role');
          if (role === 'technicien' || role === 'client') {
            handleLogout();
          } else {
            setIsPublicPortalOpen(false);
          }
        }}
        onOpenClientPortal={(client) => {
          setActivePortalClient(client);
          setIsClientPortalOpen(true);
          setIsPublicPortalOpen(false);
        }}
      />
    );
  }

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const loggedRole = localStorage.getItem('defib_logged_user_role') || '';
  if (loggedRole === 'megaadmin') {
    return <MegaAdminDashboard onLogout={handleLogout} />;
  }

  if (isBlockedByPrez) {
    const getPrezBlockMessage = () => {
      const lang = getLanguage();
      if (lang === 'English') {
        return `Welcome! To get started, you must schedule an introductory call with a DÃ©fibeo specialist to guide you through your first steps. You will be logged out in ${prezCountdown} second${prezCountdown > 1 ? 's' : ''}.`;
      } else if (lang === 'Deutsch') {
        return `Willkommen! Um zu beginnen, mÃ¼ssen Sie ein EinfÃ¼hrungsgesprÃ¤ch mit einem DÃ©fibeo-Spezialisten vereinbaren, der Sie bei Ihren ersten Schritten begleitet. Sie werden in ${prezCountdown} Sekunde${prezCountdown > 1 ? 'n' : ''} abgemeldet.`;
      } else if (lang === 'EspaÃ±ol') {
        return `Â¡Bienvenido! Para empezar, debe programar una llamada de presentaciÃ³n con un especialista de DÃ©fibeo para que le guÃ­e en sus primeros pasos. Se le desconectarÃ¡ en ${prezCountdown} segundo${prezCountdown > 1 ? 's' : ''}.`;
      } else if (lang === 'PortuguÃªs') {
        return `Bem-vindo! Para comeÃ§ar, deve agendar uma chamada de apresentaÃ§Ã£o com um especialista DÃ©fibeo para o orientar nos seus primeiros passos. SerÃ¡ desconectado em ${prezCountdown} segundo${prezCountdown > 1 ? 's' : ''}.`;
      }
      return `Bienvenue! Pour commencer, vous devez planifier un appel de prÃ©sentation avec un spÃ©cialiste DÃ©fibeo afin d'Ãªtre guidÃ© dans vos premiers pas. Vous allez Ãªtre dÃ©connectÃ© dans ${prezCountdown} seconde${prezCountdown > 1 ? 's' : ''}.`;
    };

    return (
      <div 
        className="fixed inset-0 z-[99999] flex flex-col items-center justify-center text-center font-sans p-6" 
        style={{ 
          background: 'radial-gradient(#7e2e86, #36093a)',
          color: '#ffffff'
        }}
        id="prez-block-overlay"
      >
        <div className="flex flex-col items-center gap-6 max-w-lg">
          <span className="text-white text-[18px] font-sans font-medium leading-relaxed">
            {getPrezBlockMessage()}
          </span>
        </div>
      </div>
    );
  }

  if (isOffline) {
    return (
      <div 
        className="fixed inset-0 z-[99999] flex flex-col items-center justify-center text-center font-sans p-6" 
        style={{ 
          background: 'radial-gradient(#7e2e86, #36093a)',
          color: '#ffffff'
        }}
        id="offline-warning-overlay"
      >
        <div className="flex flex-col items-center gap-4 max-w-lg">
          <span className="text-white text-[18px] font-sans font-medium leading-relaxed">
            Attention, la connexion Ã  internet est manquante ou instable. Essayez Ã  nouveau.
          </span>
        </div>
      </div>
    );
  }

  if (windowWidth < 1000) {
    return (
      <div 
        className="fixed inset-0 z-[99999] flex flex-col items-center justify-center text-center font-sans p-6" 
        style={{ 
          background: currentSidebarTheme.color,
          color: '#ffffff'
        }}
        id="resolution-warning-overlay"
      >
        <div className="flex flex-col items-center gap-4 max-w-lg">
          <span className="text-white text-[18px] font-sans font-medium leading-relaxed">
            Le logiciel doit-Ãªtre utilisÃ© depuis un ordinateur d'au moins 1000 pixels de large.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans" id="app-root-container">
      {/* Google Material-style 3.5px Top Bar Progress when switching tabs */}
      <TopBarProgress triggerKey={activeTab} duration={3000} height={3.5} zIndex={99999} />

      {(showEnvLoading || !isFirebaseLoaded || minEnvLoading) && (
        <div 
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center text-center font-sans gap-4" 
          style={{ 
            background: currentSidebarTheme.color,
            fontSize: '18px',
            color: '#ffffff'
          }}
          id="env-loading-overlay"
        >
          <span
            className="animate-text-wave text-[18px] font-sans text-center tracking-normal font-medium"
            style={{ color: "#ffffff", letterSpacing: "0px" }}
          >
            Chargement de votre environnement...
          </span>
        </div>
      )}
      {/* LEFT SIDE BAR PANE */}
      <aside 
        className="w-64 text-slate-100 flex flex-col h-screen sticky top-0 shrink-0 shadow-xl z-30" 
        style={{ 
          background: currentSidebarTheme.color,
          borderRight: '1px solid rgba(255, 255, 255, 0.1)'
        }} 
        id="app-sidebar"
      >
        {/* Brand Header */}
        <div 
          className="py-1 px-4" 
          style={{ 
            background: currentSidebarTheme.color, 
            borderBottom: '1px solid rgb(255 255 255 / 27%)' 
          }}
        >
          <div className="flex justify-center items-center">
            <img 
              src="https://datacenter64000pau.s3.eu-north-1.amazonaws.com/Defibeo_2026_Logo2.svg" 
              alt="DÃ©fibeo Logo" 
              style={{ width: '155px' }}
              className="h-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Scrollable Navigation Items */}
        <div 
          className="flex-1 overflow-y-auto p-3.5 space-y-2.5 scrollbar-none"
          style={{ background: currentSidebarTheme.color }}
        >
          {(() => {
            const rawTabs = [
              { id: 'defibrillateurs', label: t('DÃ©fibrillateurs'), icon: Heart },
              ...(enableOtherEquipments === "Oui" ? [{ id: 'autres-materiels', label: t('Autres matÃ©riels'), icon: Layers }] : []),
              { id: 'clients', label: t('Clients'), icon: User },
              { id: 'devis', label: t('Commandes'), icon: FileSpreadsheet },
              { id: 'fsm', label: t('TournÃ©es & Missions'), icon: Flame },
              { id: 'gmao', label: t('Rapports PDF'), icon: Wrench },
              { id: 'stocks', label: t('Centrale des stocks'), icon: Inbox },
              { id: 'stocks-distribues', label: t('Stocks distribuÃ©s'), icon: Layers },
              { id: 'achats-fournisseurs', label: t('Achats fournisseurs'), icon: ShoppingBag },
              { id: 'variables', label: t('Variables'), icon: Layers },
              { id: 'crm', label: t('CRM'), icon: FolderSync },
              { id: 'ged', label: t('GED'), icon: ClipboardList },
              { id: 'satisfaction', label: t('Satisfaction'), icon: ThumbsUp },
              { id: 'temps', label: t('Temps'), icon: Clock },
              { id: 'localisations', label: t('Localisations'), icon: MapPin },
              { id: 'tickets', label: t('Tickets Caisse'), icon: Ticket },
              { id: 'veilles', label: t('RelevÃ© Concurrentiel'), icon: ClipboardList },
              { id: 'import-export', label: t('Importer Exporter'), icon: Download },
              { id: 'formations', label: t('Formations'), icon: Layers },
              { id: 'stagiaires', label: t('Stagiaires'), icon: User },
              { id: 'emargements', label: t('Ã‰margements'), icon: ClipboardList },
              { id: 'statistiques', label: t('Statistiques'), icon: TrendingUp },
              { id: 'notifications', label: 'Notifications', icon: Bell },
            ];

            const filteredTabs = rawTabs.filter(tab => {
              if (!companyInfo?.hiddenTabs) return true;
              const tabToLabelMap: Record<string, string> = {
                fsm: "TournÃ©es & Missions",
                gmao: "Rapports PDF",
                stocks: "Centrale des stocks",
                "stocks-distribues": "Stocks distribuÃ©s",
                "achats-fournisseurs": "Achats fournisseurs",
                devis: "Commandes",
                crm: "CRM",
                ged: "GED",
                temps: "Temps",
                localisations: "Localisations",
                tickets: "Tickets Caisse",
                variables: "Variables",
                "import-export": "Importer Exporter",
                satisfaction: "Satisfaction",
                notifications: "Notifications",
                veilles: "RelevÃ© Concurrentiel",
                formations: "Formations",
                stagiaires: "Stagiaires",
                emargements: "Ã‰margements"
              };
              const label = tabToLabelMap[tab.id];
              const isHiddenByNewName = label ? companyInfo.hiddenTabs.includes(label) : false;
              const isHiddenByOldName = (tab.id === 'fsm' && companyInfo.hiddenTabs.includes("FSM (TournÃ©es)")) ||
                                        (tab.id === 'gmao' && companyInfo.hiddenTabs.includes("GMAO (Rapports)"));

              const isFormationHidden = companyInfo.hiddenTabs.includes("Formations");
              const isStagiairesHidden = companyInfo.hiddenTabs.includes("Stagiaires");
              const isEmargementsHidden = companyInfo.hiddenTabs.includes("Ã‰margements");

              if (tab.id === 'formations' && (isFormationHidden || isStagiairesHidden)) return false;
              if (tab.id === 'stagiaires' && (isFormationHidden || isStagiairesHidden)) return false;
              if (tab.id === 'emargements' && (isFormationHidden || isStagiairesHidden || isEmargementsHidden)) return false;

              return !isHiddenByNewName && !isHiddenByOldName;
            });

            const equipGroupIds = ['defibrillateurs', 'autres-materiels', 'clients'];
            const stockGroupIds = ['stocks', 'stocks-distribues', 'achats-fournisseurs'];
            const crmGroupIds = ['crm', 'ged', 'satisfaction'];
            const newGroupIds = ['temps', 'localisations', 'tickets', 'veilles'];
            const formationGroupIds = ['formations', 'stagiaires', 'emargements'];

            const renderButton = (tab: { id: string; label: string }) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AppTab)}
                id={`tab-selector-${tab.id}`}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all focus:outline-hidden cursor-pointer text-left border-0 ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-white hover:bg-white/8 hover:text-white'
                }`}
                style={activeTab === tab.id ? {
                  boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                  background: '#3556ec',
                  fontSize: '18px',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  fontWeight: 'bold',
                  fontFamily: "DefibeoMain, Civilprom, sans-serif"
                } : {
                  fontSize: '18px',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  fontWeight: 'bold'
                }}
              >
                <span className="truncate">{tab.label}</span>
              </button>
            );

            const elements: React.ReactNode[] = [];
            let i = 0;
            while (i < filteredTabs.length) {
              const tab = filteredTabs[i];
              if (equipGroupIds.includes(tab.id)) {
                const equipGroup: typeof rawTabs = [];
                while (i < filteredTabs.length && equipGroupIds.includes(filteredTabs[i].id)) {
                  equipGroup.push(filteredTabs[i]);
                  i++;
                }
                elements.push(
                  <div
                    key="equip-group-container"
                    className="p-2 space-y-2 rounded-2xl"
                    style={{ border: '1px solid rgb(255 255 255 / 27%)' }}
                  >
                    {equipGroup.map(gt => renderButton(gt))}
                  </div>
                );
              } else if (stockGroupIds.includes(tab.id)) {
                const stockGroup: typeof rawTabs = [];
                while (i < filteredTabs.length && stockGroupIds.includes(filteredTabs[i].id)) {
                  stockGroup.push(filteredTabs[i]);
                  i++;
                }
                elements.push(
                  <div
                    key="stock-group-container"
                    className="p-2 space-y-2 rounded-2xl"
                    style={{ border: '1px solid rgb(255 255 255 / 27%)' }}
                  >
                    {stockGroup.map(gt => renderButton(gt))}
                  </div>
                );
              } else if (crmGroupIds.includes(tab.id)) {
                const crmGroup: typeof rawTabs = [];
                while (i < filteredTabs.length && crmGroupIds.includes(filteredTabs[i].id)) {
                  crmGroup.push(filteredTabs[i]);
                  i++;
                }
                elements.push(
                  <div
                    key="crm-group-container"
                    className="p-2 space-y-2 rounded-2xl"
                    style={{ border: '1px solid rgb(255 255 255 / 27%)' }}
                  >
                    {crmGroup.map(gt => renderButton(gt))}
                  </div>
                );
              } else if (newGroupIds.includes(tab.id)) {
                const newGroup: typeof rawTabs = [];
                while (i < filteredTabs.length && newGroupIds.includes(filteredTabs[i].id)) {
                  newGroup.push(filteredTabs[i]);
                  i++;
                }
                elements.push(
                  <div
                    key="new-group-container"
                    className="p-2 space-y-2 rounded-2xl"
                    style={{ border: '1px solid rgb(255 255 255 / 27%)' }}
                  >
                    {newGroup.map(gt => renderButton(gt))}
                  </div>
                );
              } else if (formationGroupIds.includes(tab.id)) {
                const formationGroup: typeof rawTabs = [];
                while (i < filteredTabs.length && formationGroupIds.includes(filteredTabs[i].id)) {
                  formationGroup.push(filteredTabs[i]);
                  i++;
                }
                elements.push(
                  <div
                    key="formation-group-container"
                    className="p-2 space-y-2 rounded-2xl"
                    style={{ border: '1px solid rgb(255 255 255 / 27%)' }}
                  >
                    {formationGroup.map(gt => renderButton(gt))}
                  </div>
                );
              } else {
                elements.push(renderButton(tab));
                i++;
              }
            }

            return elements;
          })()}
        </div>

        {/* Sticky bottom Parametres button inside pane (full-width) */}
        <div 
          className="p-3.5" 
          style={{ 
            background: currentSidebarTheme.color, 
            borderTop: '1px solid rgb(255 255 255 / 27%)' 
          }}
        >
          <button
            onClick={() => setActiveTab('parametres')}
            id="sidebar-btn-settings"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all border-0 cursor-pointer text-white hover:brightness-110 active:scale-[0.98]"
            style={{
              boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
              background: '#3556ec',
              fontSize: '18px',
              textTransform: 'none',
              letterSpacing: 'normal',
              fontWeight: 'bold',
              fontFamily: "DefibeoMain, Civilprom, sans-serif"
            }}
          >
            <span>{t('ParamÃ¨tres')}</span>
          </button>
        </div>
      </aside>

      {/* RIGHT SIDE CONTAINER */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-[#f6f6f6]">
        {isSubscriptionInactive && (
          <div 
            className="sticky top-0 z-[100] w-full bg-[#F9383C] text-white py-3.5 px-6 flex items-center justify-between font-sans shadow-md"
            id="subscription-inactive-banner"
          >
            <span className="font-bold text-[15px] sm:text-[16px] text-left">
              {t("Attention requise : Votre abonnement est inactif, veuillez complÃ©ter le paiement pour l'activation.")}
            </span>
            {paymentUrl && (
              <a 
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white active:scale-[0.98] transition-all font-semibold shrink-0 border-0 flex items-center justify-center cursor-pointer select-none"
                style={{ 
                  textDecoration: 'none',
                  backgroundColor: '#D82C30',
                  borderRadius: '13px',
                  fontSize: '18px',
                  padding: '8px 24px',
                  boxShadow: 'none'
                }}
              >
                {t("Continuer")}
              </a>
            )}
          </div>
        )}
        {/* Dashboard Workspace Viewports wrapper */}
        <main className="flex-1 w-full" id="main-content">
          {/* Sub-component Active tab wrapper */}
          <section className={`${activeTab === 'parametres' ? 'bg-white' : 'pb-16'} p-0`} id="active-tab-content-wrapper">
          {activeTab === 'defibrillateurs' && (
            <DefibTab
              currentLang={currentLang}
              defibrillateurs={defibrillateurs}
              clients={clients}
              variables={variables}
              onAddDefib={handleAddDefib}
              onUpdateDefib={handleUpdateDefib}
              onDeleteDefib={handleDeleteDefib}
              onBulkDelete={handleBulkDeleteDefib}
              onBulkEdit={handleBulkEditDefib}
              fsmTours={fsmTours}
              onUpdateFsmTours={saveFsmTours}
              setActiveTab={setActiveTab}
              onShowGmaoReports={(identifiant) => {
                setActiveTab('gmao');
                setGmaoSearchQuery(identifiant);
              }}
              companyInfo={companyInfo}
              members={members}
              isDeveloper={isDeveloper}
              isReadOnly={isDeveloper}
            />
          )}

          {activeTab === 'autres-materiels' && (
            <AutresMaterielsTab
              otherEquipments={otherEquipments}
              saveOtherEquipments={saveOtherEquipments}
              clients={clients}
              fsmTours={fsmTours}
              onUpdateFsmTours={saveFsmTours}
              setActiveTab={setActiveTab}
              members={members}
              defibrillateurs={defibrillateurs}
              variables={variables}
              isDeveloper={isDeveloper}
              isReadOnly={isDeveloper}
            />
          )}

          {activeTab === 'clients' && (
            <ClientTab
              clients={clients}
              defibrillateurs={defibrillateurs}
              variables={variables}
              onAddClient={handleAddClient}
              onUpdateClient={handleUpdateClient}
              onDeleteClient={handleDeleteClient}
              companyInfo={companyInfo}
              setActiveTab={setActiveTab}
              isDeveloper={isDeveloper}
              isReadOnly={isDeveloper}
            />
          )}

          {activeTab === 'variables' && (
            <VariableTab
              variables={variables}
              onAddVariable={handleAddVariable}
              onUpdateVariable={handleUpdateVariable}
              onDeleteVariable={handleDeleteVariable}
              defibrillateurs={defibrillateurs}
              stocks={stocks}
              distributedStocks={distributedStocks}
              otherEquipments={otherEquipments}
              achatsFournisseurs={achatsFournisseurs}
              fsmTours={fsmTours}
              isDeveloper={isDeveloper}
              isReadOnly={isDeveloper}
            />
          )}

          {/* ======================================= */}
          {/* FSM (Field Service Management) MODULE */}
          {/* ======================================= */}
          {/* ======================================= */}
          {/* FSM (Field Service Management) MODULE */}
          {/* ======================================= */}
          {activeTab === 'fsm' && (() => {
            const AVAILABLE_PARTS = [
              "Ã‰lectrodes Adultes",
              "Ã‰lectrodes PÃ©diatriques",
              "Batterie Lithium 5 ans",
              "Batterie Lithium 2 ans",
              "Kit d'Intervention standard",
              "BoÃ®tier Mural Chauffant Aivia",
              "SignalÃ©tique DAE Normative"
            ];

            const customButtonStyle: React.CSSProperties = {
              backgroundColor: '#000',
              color: '#fff',
              boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
              borderRadius: '12px',
              fontSize: '18px',
              padding: '9px 19px',
              fontWeight: '100',
              transition: 'all 0s ease-in-out',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              border: 'none',
            };

            const blueButtonStyle: React.CSSProperties = {
              ...customButtonStyle,
              backgroundColor: 'rgb(53, 86, 236)',
              boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
            };

            const rowActionButtonStyle: React.CSSProperties = {
              backgroundColor: '#000',
              color: '#fff',
              boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
              borderRadius: '10px',
              fontSize: '16px',
              padding: '8px 16px',
              fontWeight: '100',
              transition: 'all 0s ease-in-out',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              border: 'none',
            };

            const uniqueDates = Array.from(new Set(fsmTours.map((t: any) => t.startDate).filter(Boolean))).filter(d => d !== 'A trier').sort() as string[];
            const activeDateFilter = fsmDateFilter === 'Tous' ? 'A trier' : fsmDateFilter;

            const filteredTours = fsmTours.filter((tour) => {
              if (activeDateFilter !== 'Tous') {
                if (activeDateFilter === 'A trier') {
                  if (!(tour.id === 'a-trier' || tour.startDate === 'A trier')) {
                    return false;
                  }
                } else if (tour.startDate !== activeDateFilter) {
                  return false;
                }
              }

              // Filter by Region
              if (fsmRegionFilter !== 'Tous') {
                if ((tour.region || '') !== fsmRegionFilter) {
                  return false;
                }
              }

              // Filter by Technicien
              if (fsmTechFilter !== 'Tous') {
                if ((tour.techName || '') !== fsmTechFilter) {
                  return false;
                }
              }

              // Filter by EmployÃ© (Planificateur)
              if (fsmPlannerFilter !== 'Tous') {
                const tourPlanner = tour.plannerName || tour.planner || '';
                if (tourPlanner !== fsmPlannerFilter) {
                  return false;
                }
              }

              const query = fsmSearchQuery.toLowerCase().trim();
              if (!query) return true;

              // 1. Tour level fields
              const titleMatch = (tour.title || '').toLowerCase().includes(query);
              const techMatch = (tour.techName || '').toLowerCase().includes(query);
              const plannerMatch = (tour.plannerName || tour.planner || '').toLowerCase().includes(query);
              const regionMatch = (tour.region || '').toLowerCase().includes(query);
              const idMatch = (tour.id || '').toLowerCase().includes(query);
              const statusMatch = (tour.status || '').toLowerCase().includes(query);
              const dateMatch = (tour.startDate || '').toLowerCase().includes(query);
              const vehiculeMatch = (tour.vehicule || '').toLowerCase().includes(query);

              if (titleMatch || techMatch || plannerMatch || regionMatch || idMatch || statusMatch || dateMatch || vehiculeMatch) {
                return true;
              }

              // 2. Mission level fields across all missions in this tour
              const missions = tour.missions || [];
              const missionMatch = missions.some((m: any) => {
                if (!m) return false;

                // Mission direct fields
                if ((m.clientName || '').toLowerCase().includes(query)) return true;
                if ((m.defibIdentifiant || m.identifiant || '').toLowerCase().includes(query)) return true;
                if ((m.defibSerialNumber || m.serialNumber || m.defibSn || m.sn || m.defibNumeroSerie || m.numeroSerie || '').toLowerCase().includes(query)) return true;
                if ((m.reason || m.motif || '').toLowerCase().includes(query)) return true;
                if ((m.interventionReference || m.ref || '').toLowerCase().includes(query)) return true;
                if ((m.status || '').toLowerCase().includes(query)) return true;
                if ((m.priority || '').toLowerCase().includes(query)) return true;
                if ((m.equipmentType || m.categorie || '').toLowerCase().includes(query)) return true;
                if ((m.clientAddress || m.address || '').toLowerCase().includes(query)) return true;
                if (Array.isArray(m.requiredParts) && m.requiredParts.some((p: string) => (p || '').toLowerCase().includes(query))) return true;

                // Lookup linked defibrillateur
                const matchedDefib = defibrillateurs?.find((d: any) => d.identifiant === m.defibIdentifiant || d.id === m.defibId);
                if (matchedDefib) {
                  if ((matchedDefib.numeroSerie || '').toLowerCase().includes(query)) return true;
                  if ((matchedDefib.identifiant || '').toLowerCase().includes(query)) return true;
                  if ((matchedDefib.nomSite || '').toLowerCase().includes(query)) return true;
                  if ((matchedDefib.ville || '').toLowerCase().includes(query)) return true;
                  if ((matchedDefib.codePostal || matchedDefib.cp || '').toLowerCase().includes(query)) return true;

                  const clientObj = clients?.find((c: any) => c.id === matchedDefib.clientId);
                  if (clientObj) {
                    if ((clientObj.denomination || '').toLowerCase().includes(query)) return true;
                    if ((clientObj.codeClient || '').toLowerCase().includes(query)) return true;
                  }
                }

                // Lookup linked other equipment
                const matchedOther = !matchedDefib ? otherEquipments?.find((o: any) => o.identifiant === m.defibIdentifiant || o.id === m.defibId) : null;
                if (matchedOther) {
                  if ((matchedOther.numeroSerie || '').toLowerCase().includes(query)) return true;
                  if ((matchedOther.identifiant || '').toLowerCase().includes(query)) return true;
                  if ((matchedOther.nomPrenomSite || '').toLowerCase().includes(query)) return true;
                  if ((matchedOther.ville || '').toLowerCase().includes(query)) return true;
                  if ((matchedOther.codePostal || matchedOther.cp || '').toLowerCase().includes(query)) return true;

                  const clientObj = clients?.find((c: any) => c.id === matchedOther.clientId);
                  if (clientObj) {
                    if ((clientObj.denomination || '').toLowerCase().includes(query)) return true;
                    if ((clientObj.codeClient || '').toLowerCase().includes(query)) return true;
                  }
                }

                return false;
              });

              return missionMatch;
            });

            return (
              <div className="space-y-6 animate-fadeIn" id="fsm-tab-container">
                <style>{`
                  #fsm-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-fsm-input),
                  #fsm-tab-container select,
                  #fsm-tab-container textarea {
                    padding: 12px !important;
                    border: 1px solid #dedede !important;
                    border-radius: 13px !important;
                    font-size: 16px !important;
                    font-weight: 100 !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                    box-sizing: border-box !important;
                    outline: none !important;
                    transition: all 0s !important;
                  }
                  #fsm-tab-container input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-fsm-input),
                  #fsm-tab-container input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-fsm-input),
                  #fsm-tab-container select:hover:not(:disabled),
                  #fsm-tab-container select:focus:not(:disabled),
                  #fsm-tab-container textarea:hover:not(:disabled),
                  #fsm-tab-container textarea:focus:not(:disabled),
                  #fsm-tab-container #search-fsm-input:hover,
                  #fsm-tab-container #search-fsm-input:focus {
                    outline: 2.5px solid #fa53d5 !important;
                    outline-offset: 2px !important;
                    transition: all 0s !important;
                  }
                  #fsm-tab-container select {
                    appearance: none !important;
                    -webkit-appearance: none !important;
                    -moz-appearance: none !important;
                    background-image: none !important;
                  }
                  #fsm-tab-container select option {
                    color: #000000 !important;
                    background: #ffffff !important;
                    font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                  }
                  #fsm-tab-container input[type="date"]::-webkit-calendar-picker-indicator {
                    display: none !important;
                    -webkit-appearance: none !important;
                    background: none !important;
                    width: 0 !important;
                    height: 0 !important;
                  }
                  #fsm-tab-container label,
                  #fsm-tab-container .fsm-label-style {
                    letter-spacing: normal !important;
                    text-transform: none !important;
                    font-size: 16px !important;
                    color: #000000 !important;
                    font-weight: 600 !important;
                    font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                  }
                  #fsm-tab-container select.padding-with-dot {
                    padding-left: 27px !important;
                  }
                  #fsm-tab-container input:disabled,
                  #fsm-tab-container select:disabled {
                    background-color: #f1f5f9 !important;
                    color: #555555 !important;
                    cursor: not-allowed !important;
                    opacity: 0.82 !important;
                  }
                `}</style>

                {/* Upper Action Block & Search metrics */}
                <div 
                  className="bg-white space-y-4"
                  style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight font-gochi" style={{ color: '#000000', cursor: 'default' }} id="fsm-tab-title">FSM</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Field recherche (Search input) */}
                      <div className="relative w-full sm:w-48">
                        <input
                          type="text"
                          id="search-fsm-input"
                          value={fsmSearchQuery}
                          onChange={(e) => setFsmSearchQuery(e.target.value)}
                          placeholder="Recherche."
                          className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none placeholder:text-[18px]"
                          style={{
                            border: '1px solid #dedede',
                            borderRadius: '13px',
                            padding: '9px 14px',
                            fontSize: '18px',
                            fontWeight: '100',
                            color: '#000000',
                            backgroundColor: '#ffffff',
                            fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                            outline: 'none',
                            transition: 'all 0s',
                          }}
                        />
                      </div>

                      {/* Filter: RÃ©gion */}
                      <div className="relative w-full sm:w-44">
                        <select
                          value={fsmRegionFilter}
                          onChange={(e) => setFsmRegionFilter(e.target.value)}
                          className="w-full text-black focus:outline-none cursor-pointer"
                          style={{
                            border: '1px solid #dedede',
                            borderRadius: '13px',
                            padding: '9px 12px',
                            fontSize: '14px',
                            fontWeight: '100',
                            color: '#000000',
                            backgroundColor: '#ffffff',
                            fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                          }}
                        >
                          <option value="Tous">Filtrer par rÃ©gion</option>
                          {getRegionsForCountry('France').map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>

                      {/* Filter: Technicien */}
                      <div className="relative w-full sm:w-44">
                        <select
                          value={fsmTechFilter}
                          onChange={(e) => setFsmTechFilter(e.target.value)}
                          className="w-full text-black focus:outline-none cursor-pointer"
                          style={{
                            border: '1px solid #dedede',
                            borderRadius: '13px',
                            padding: '9px 12px',
                            fontSize: '14px',
                            fontWeight: '100',
                            color: '#000000',
                            backgroundColor: '#ffffff',
                            fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                          }}
                        >
                          <option value="Tous">Filtrer par technicien</option>
                          {(() => {
                            const techList = members.filter(m => {
                              const roleLower = (m.role || '').toLowerCase();
                              return roleLower.includes('tech') || roleLower.includes('maintenance') || roleLower.includes('terrain');
                            }).map(m => m.name);
                            const tourTechs = fsmTours.map((t: any) => t.techName).filter(Boolean);
                            const allTechs = Array.from(new Set([...techList, ...tourTechs])).filter(name => name.trim() !== '');
                            return allTechs.map(tech => (
                              <option key={tech} value={tech}>{tech}</option>
                            ));
                          })()}
                        </select>
                      </div>

                      {/* Filter: EmployÃ© */}
                      <div className="relative w-full sm:w-44">
                        <select
                          value={fsmPlannerFilter}
                          onChange={(e) => setFsmPlannerFilter(e.target.value)}
                          className="w-full text-black focus:outline-none cursor-pointer"
                          style={{
                            border: '1px solid #dedede',
                            borderRadius: '13px',
                            padding: '9px 12px',
                            fontSize: '14px',
                            fontWeight: '100',
                            color: '#000000',
                            backgroundColor: '#ffffff',
                            fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                          }}
                        >
                          <option value="Tous">Filtrer par employÃ©</option>
                          {(() => {
                            const nonTechList = members.filter(m => {
                              const roleLower = (m.role || '').toLowerCase();
                              return !(m.role === 'Technicien' || m.role === 'Maintenance Terrain' || roleLower.includes('tech'));
                            }).map(m => m.name);
                            const tourPlanners = fsmTours.map((t: any) => t.plannerName || t.planner).filter(Boolean);
                            const allPlanners = Array.from(new Set([...nonTechList, ...tourPlanners])).filter(name => name.trim() !== '');
                            return allPlanners.map(planner => (
                              <option key={planner} value={planner}>{planner}</option>
                            ));
                          })()}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={addFsmTour}
                          id="btn-add-tour"
                          style={blueButtonStyle}
                        >
                          Nouvelle tournÃ©e
                        </button>
                        <button
                          onClick={() => setFsmPlanningSidePaneOpen(true)}
                          id="btn-fsm-plannings"
                          style={{
                            backgroundColor: '#000000',
                            color: '#ffffff',
                            borderRadius: '13px',
                            padding: '9px 18px',
                            fontSize: '18px',
                            fontWeight: '600',
                            fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)',
                          }}
                          className="hover:bg-neutral-800 transition-colors"
                        >
                          Plannings
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Side-pane popup pour le planning */}
                {fsmPlanningSidePaneOpen && (
                  <div 
                    className="fixed inset-0 z-[9999] flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"
                    style={{ top: 0, left: 0, right: 0, bottom: 0, height: '100vh', width: '100vw' }}
                    onClick={() => setFsmPlanningSidePaneOpen(false)}
                  >
                    <div 
                      className="relative w-full max-w-4xl bg-white flex flex-col overflow-hidden animate-slideLeft"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        height: '100vh',
                        boxShadow: 'none',
                        borderRadius: '16px 0px 0px 16px',
                        borderLeft: '1px solid #e2e8f0',
                      }}
                    >
                      {/* Body side-pane : Vue Planning */}
                      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white pb-28">
                        <PlanningTab
                          companyInfo={companyInfo}
                          fsmTours={fsmTours}
                          authenticatedUser={loggedUser}
                          defibrillateurs={defibrillateurs}
                          otherEquipments={otherEquipments}
                          clients={clients}
                          variables={variables}
                          members={members}
                          t={translate}
                          initialTech=""
                        />
                      </div>

                      {/* Bouton noir floating full width Fermer */}
                      <button
                        onClick={() => setFsmPlanningSidePaneOpen(false)}
                        style={{
                          position: 'absolute',
                          bottom: '16px',
                          left: '16px',
                          right: '16px',
                          width: 'calc(100% - 32px)',
                          backgroundColor: '#000000',
                          color: '#ffffff',
                          fontSize: '18px',
                          fontWeight: '600',
                          padding: '14px 20px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          zIndex: 50,
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
                          border: 'none',
                        }}
                        className="hover:bg-neutral-800 transition-colors"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>
                )}

                <HelpBubble 
                  cacheKey="help_dismissed_fsm" 
                  text="AbrÃ©viation de Field Service Management, orchestrez depuis cet onglet les tournÃ©es que devront rÃ©aliser les techniciens. Chaque tournÃ©e est calculÃ©e intelligemment selon de nombreux critÃ¨res comme les crÃ©neaux dâ€™accÃ¨s du dÃ©fibrillateur, les plages de disponibilitÃ© du technicien, la route optimisÃ©e en termes de distance et de consommation, etc. Une tournÃ©e s'affiche sur la webapp technicien uniquement lorsquâ€™elle est placÃ©e en situation Â« Ã€ faire Â»." 
                />

                <HelpBubble 
                  cacheKey="help_dismissed_fsm_spontane" 
                  imageSrc="https://civilprom.s3.eu-north-1.amazonaws.com/personnalise.svg"
                  imageAlt="Aide populaire"
                  text="Aide populaire : Pour enregistrer un rapport de maintenance sans passer par le systÃ¨me de tournÃ©es : depuis votre mobile, connectez-vous au logiciel avec un compte technicien. Rendez-vous ensuite dans l'onglet Rapports, cliquez sur le bouton Â« Nouveau rapport spontanÃ© Â», puis cliquez sur Â« SÃ©lection d'un matÃ©riel Â» dans le formulaire pour choisir l'Ã©quipement concernÃ©." 
                />

                <datalist id="fsm-techs-list">
                  {members
                    .filter(m => {
                      const roleLower = (m.role || '').toLowerCase();
                      return roleLower.includes('tech') || roleLower.includes('maintenance') || roleLower.includes('terrain');
                    })
                    .map(m => m.name)
                    .map((name, idx) => (
                      <option key={idx} value={name} />
                    ))}
                </datalist>

                <datalist id="fsm-clients-list">
                  {clients.map(c => c.name).map((name, idx) => (
                    <option key={idx} value={name} />
                  ))}
                </datalist>

                <datalist id="fsm-defibs-list">
                  {defibrillateurs.map(d => d.identifiant).map((ident, idx) => (
                    <option key={idx} value={ident} />
                  ))}
                </datalist>

                {fsmTours.length > 0 && (() => {
                  const formatFrenchDate = (dateStr: string): string => {
                    if (!dateStr) return '';
                    const parts = dateStr.split('-');
                    if (parts.length === 3) {
                      const d = parseInt(parts[2], 10);
                      const m = parseInt(parts[1], 10);
                      const y = parts[0];
                      const months = [
                        'Janvier', 'FÃ©vrier', 'Mars', 'Avril', 'Mai', 'Juin',
                        'Juillet', 'AoÃ»t', 'Septembre', 'Octobre', 'Novembre', 'DÃ©cembre'
                      ];
                      const monthName = months[m - 1] || '';
                      return `${d} ${monthName} ${y}`;
                    }
                    return dateStr;
                  };

                  return (
                    <div className="px-4 flex flex-wrap gap-2.5 justify-center sm:justify-start pt-5" id="fsm-dates-pills">
                      <button
                        type="button"
                        onClick={() => setFsmDateFilter('A trier')}
                        style={{
                          borderRadius: '1000px',
                          padding: '10px 20px',
                          fontSize: '15px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                          backgroundColor: activeDateFilter === 'A trier' ? '#fa53d5' : '#ffffff',
                          color: activeDateFilter === 'A trier' ? '#ffffff' : '#000000',
                          border: activeDateFilter === 'A trier' ? '1px solid #fa53d5' : '1px solid rgb(218, 218, 218)',
                          transition: 'all 0.15s ease'
                        }}
                        className="transition-all"
                      >
                        {t("Ã€ trier / Ordres ADV")}
                      </button>

                      {uniqueDates.map(dateStr => (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => setFsmDateFilter(dateStr)}
                          style={{
                            borderRadius: '1000px',
                            padding: '10px 20px',
                            fontSize: '15px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            backgroundColor: activeDateFilter === dateStr ? '#fa53d5' : '#ffffff',
                            color: activeDateFilter === dateStr ? '#ffffff' : '#000000',
                            border: activeDateFilter === dateStr ? '1px solid #fa53d5' : '1px solid rgb(218, 218, 218)',
                            transition: 'all 0.15s ease'
                          }}
                          className="transition-all"
                        >
                          TournÃ©e(s) {formatFrenchDate(dateStr)}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {fsmTours.length === 0 ? (
                  <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
                ) : filteredTours.length === 0 ? (
                  <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
                ) : (
                  <div className="space-y-8">
                    {filteredTours.map((t) => {
                      if (t.id === 'a-trier') {
                        return (
                          <div key={t.id} className="bg-white relative space-y-6 animate-fadeIn" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px', maxWidth: '98%', margin: '24px auto', backgroundColor: '#ffffff', overflow: 'hidden' }}>
                            {/* THE INTERCALAIRE TOUR HEADER */}
                            <div className="bg-white px-5 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans" style={{ borderRadius: '17px 17px 0px 0px', backgroundColor: '#ffffff' }}>
                              <div>
                                <span style={{ fontSize: '18px', color: '#000000' }}>
                                  Mission(s) Ã  affecter : {t.missions.length}.
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                                {/* Enregistrer button */}
                                <button
                                  type="button"
                                  disabled={!!savingTourIds[t.id]}
                                  onClick={() => {
                                    if (savingTourIds[t.id]) return;

                                    // Disable button and lower opacity
                                    setSavingTourIds(prev => ({ ...prev, [t.id]: true }));

                                    // Save fsmTours
                                    saveFsmTours([...fsmTours]);
                                    alert("Les missions Ã  trier ont Ã©tÃ© enregistrÃ©es avec succÃ¨s !");

                                    // Re-enable after 3 seconds
                                    setTimeout(() => {
                                      setSavingTourIds(prev => {
                                        const copy = { ...prev };
                                        delete copy[t.id];
                                        return copy;
                                      });
                                    }, 3000);
                                  }}
                                  style={{
                                    ...blueButtonStyle,
                                    padding: '12px 24px',
                                    borderRadius: '13px',
                                    fontSize: '18px',
                                    fontWeight: '100',
                                    height: '50px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '100%',
                                    opacity: savingTourIds[t.id] ? 0.7 : 1,
                                    pointerEvents: savingTourIds[t.id] ? 'none' : 'auto'
                                  }}
                                  className={`${savingTourIds[t.id] ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} sm:w-auto flex-1 sm:flex-initial`}
                                >
                                  Enregistrer
                                </button>
                              </div>
                            </div>

                            {/* Tour missions list */}
                            <div className="p-4 space-y-4">
                              {t.missions.length === 0 ? (
                                <div className="py-12 text-center font-sans bg-white rounded-xl" style={{ color: '#000000', fontSize: '16px', border: 'none' }}>
                                  Aucune mission Ã  trier.
                                </div>
                              ) : (
                                <div className="space-y-4 bg-white">
                                  {t.missions.map((m: any, idx: number) => {
                                    const missionKey = `a-trier-${m.id || idx}`;
                                    const isExpanded = !!fsmExpandedMissions[missionKey];

                                    return (
                                      <div key={m.id} className="rounded-xl p-4 shadow-3xs transition-shadow space-y-4 font-sans" style={{ border: '1px solid rgb(229, 229, 229)', backgroundColor: 'rgb(245, 245, 245)' }}>
                                        {/* Row 1: GÃ©lules & Bouton DÃ©rouler / RÃ©duire */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 bg-transparent pb-0.5">
                                          <div className="flex flex-wrap items-center gap-2 bg-transparent flex-1">
                                          <span
                                            style={{
                                              backgroundColor: 'rgb(77, 21, 83)',
                                              color: 'rgb(255, 255, 255)',
                                              borderRadius: '1000px',
                                              padding: '4px 12px',
                                              fontSize: '15px',
                                              fontWeight: 700,
                                              border: 'none',
                                              cursor: 'default'
                                            }}
                                          >
                                            {(m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId) ? 'Formation' : (m.equipmentType || 'DÃ©fibrillateur')}
                                          </span>

                                          {(() => {
                                            const isFormationMission = m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId;
                                            if (isFormationMission) return null;

                                            const matchedDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
                                            const other = !matchedDefib ? otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant) : null;
                                            
                                            if (!matchedDefib && !other) return null;
                                            
                                            const renderCapsule = (label: string, rawVal: string) => {
                                              if (!rawVal || rawVal.trim() === '' || rawVal.trim() === '-') return null;
                                              const formatted = formatDateToFR(rawVal);
                                              if (!formatted || formatted === '-') return null;
                                              return (
                                                <span 
                                                  key={label}
                                                  style={{
                                                    color: '#fff',
                                                    fontSize: '14px',
                                                    padding: '4.5px 15px',
                                                    border: 'none',
                                                    background: getCapsuleBgColor(rawVal),
                                                    cursor: 'default'
                                                  }}
                                                  className="inline-flex items-center rounded-full font-sans font-medium"
                                                >
                                                  <span className="font-extrabold mr-1">{label}</span>
                                                  {formatted}
                                                </span>
                                              );
                                            };

                                            if (matchedDefib) {
                                              const defibModel = variables.find((v: any) => v.id === matchedDefib.modeleId);
                                              const modelName = defibModel 
                                                ? (defibModel.marque && defibModel.marque !== 'Standard' ? `${defibModel.marque} ${defibModel.nom}` : defibModel.nom) 
                                                : (matchedDefib.modeleId || 'ModÃ¨le inconnu');
                                              const nextMaint = computeProchaineMaintenance(matchedDefib.derniereMaintenance);
                                              
                                              return (
                                                <div className="flex flex-wrap gap-1 md:gap-1.5 ml-1 md:ml-2 items-center">
                                                  <span 
                                                    style={{
                                                      color: '#fff',
                                                      fontSize: '14px',
                                                      padding: '4.5px 15px',
                                                      border: 'none',
                                                      background: '#000000',
                                                      cursor: 'default'
                                                    }}
                                                    className="inline-flex items-center rounded-full font-sans font-medium"
                                                  >
                                                    {modelName}
                                                  </span>
                                                  {renderCapsule('PÃ©remption A.', matchedDefib.peremptionElectrodeA)}
                                                  {renderCapsule('PÃ©remption A.S.', matchedDefib.peremptionSecoursElectrodeA || '')}
                                                  {renderCapsule('PÃ©remption P.', matchedDefib.peremptionElectrodeP)}
                                                  {renderCapsule('PÃ©remption P.S.', matchedDefib.peremptionSecoursElectrodeP || '')}
                                                  {renderCapsule('PÃ©remption B.', matchedDefib.peremptionBatterie)}
                                                  {renderCapsule('Expiration G.', matchedDefib.finGarantie)}
                                                  {renderCapsule('Prochaine V.', nextMaint)}
                                                </div>
                                              );
                                            } else if (other) {
                                              const modelName = other.categorie || 'Autre matÃ©riel';
                                              return (
                                                <div className="flex flex-wrap gap-1 md:gap-1.5 ml-1 md:ml-2 items-center">
                                                  <span 
                                                    style={{
                                                      color: '#fff',
                                                      fontSize: '14px',
                                                      padding: '4.5px 15px',
                                                      border: 'none',
                                                      background: '#000000',
                                                      cursor: 'default'
                                                    }}
                                                    className="inline-flex items-center rounded-full font-sans font-medium"
                                                  >
                                                    {modelName}
                                                  </span>
                                                  {renderCapsule('Expiration G.', other.expirationGarantie)}
                                                  {renderCapsule('Prochaine V.', other.prochaineMaintenance)}
                                                </div>
                                              );
                                            }
                                            return null;
                                          })()}
                                          </div>

                                          {/* Bouton DÃ©rouler / RÃ©duire */}
                                          <button
                                            type="button"
                                            onClick={() => toggleFsmMissionExpanded(missionKey)}
                                            style={{
                                              color: '#fff',
                                              boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(97 28 104) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                                              background: 'rgb(96 28 104)',
                                              borderRadius: '13px',
                                              marginLeft: '40px',
                                              marginRight: '10px',
                                              padding: '8px 18px',
                                              fontSize: '16px',
                                              fontWeight: 700,
                                              border: 'none',
                                              cursor: 'pointer',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '6px'
                                            }}
                                            className="shrink-0 select-none"
                                          >
                                            {isExpanded ? 'RÃ©duire' : 'DÃ©rouler'}
                                          </button>
                                        </div>

                                        {/* Row 2: Client & Site & Identifiant & Localisation & Ref Int & Date EstimÃ©e & CrÃ©neau EstimÃ© & TransfÃ©rer (MontrÃ© si dÃ©roulÃ©) */}
                                        {isExpanded && (() => {
                                          const isFormationMission = m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId;
                                          const isMissionForced = !!(m.isForced || (m.isManualDate && m.isManualSlot));
                                          const toggleForced = () => {
                                            const nextVal = !isMissionForced;
                                            updateFsmMission(t.id, m.id, {
                                              isForced: nextVal,
                                              isManualDate: nextVal,
                                              isManualSlot: nextVal
                                            });
                                            if (nextVal && estimatedDateValue) {
                                              const holidayCheck = isHolidayDate(estimatedDateValue, undefined, companyInfo);
                                              if (holidayCheck.isHoliday) {
                                                alert("Attention, jour fÃ©riÃ©.");
                                              }
                                            }
                                          };
                                          const estimatedDateValue = m.estimatedDate || '';

                                          return (
                                            <div className="space-y-3 bg-transparent w-full">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-transparent">
                                            <div className="space-y-0.5 bg-transparent">
                                              <label className="block mb-1 fsm-label-style">Client.</label>
                                              <input
                                                type="text"
                                                value={(() => {
                                                  if (isFormationMission) {
                                                    const fmt = formations?.find((f: any) => f.id === m.formationId || f.id === m.defibIdentifiant);
                                                    const clientObj = clients?.find(c => c.id === (fmt?.clientId || m.clientId));
                                                    return clientObj ? clientObj.denomination : (m.clientName || "");
                                                  }
                                                  const matchedDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
                                                  const other = !matchedDefib ? otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant) : null;
                                                  const clientObj = clients?.find(c => c.id === (matchedDefib?.clientId || other?.clientId));
                                                  return clientObj ? clientObj.denomination : (m.clientName || "");
                                                })()}
                                                disabled={true}
                                                className="w-full font-sans cursor-not-allowed"
                                                placeholder="Nom du Client"
                                              />
                                            </div>

                                            {!isFormationMission && (
                                              <div className="space-y-0.5 bg-transparent">
                                                <label className="block mb-1 fsm-label-style">Site.</label>
                                                <input
                                                  type="text"
                                                  value={(() => {
                                                    const matchedDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
                                                    const other = !matchedDefib ? otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant) : null;
                                                    const val = matchedDefib 
                                                      ? (matchedDefib.nomSite || "") 
                                                      : (other ? (other.nomPrenomSite || "") : "");
                                                    return val === "ReprÃ©sentant Standard" || val === "ReprÃ©sentant standard" ? "" : val;
                                                  })()}
                                                  disabled={true}
                                                  className="w-full font-sans cursor-not-allowed"
                                                  placeholder="Nom du Site"
                                                />
                                              </div>
                                            )}

                                            {!isFormationMission && (
                                              <div className="space-y-0.5 bg-transparent">
                                                <label className="block mb-1 fsm-label-style">Identifiant.</label>
                                                <input
                                                  type="text"
                                                  value={m.defibIdentifiant || ""}
                                                  disabled={true}
                                                  className="w-full font-mono cursor-not-allowed"
                                                  placeholder="ID MatÃ©riel"
                                                />
                                              </div>
                                            )}

                                            <div className="space-y-0.5 bg-transparent">
                                              <label className="block mb-1 fsm-label-style">Localisation.</label>
                                              <input
                                                type="text"
                                                value={(() => {
                                                  if (isFormationMission) {
                                                    if (m.location) return m.location;
                                                    const fmt = formations?.find((f: any) => f.id === m.formationId || f.id === m.defibIdentifiant);
                                                    if (fmt) {
                                                      return [fmt.adresse, fmt.codePostal, fmt.ville].filter(Boolean).join(', ');
                                                    }
                                                    return m.address || '';
                                                  }
                                                  const matchedDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
                                                  const other = !matchedDefib ? otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant) : null;
                                                  const ville = matchedDefib ? matchedDefib.ville : (other ? other.ville : '');
                                                  const cp = matchedDefib ? (matchedDefib.codePostal || matchedDefib.cp || '') : (other ? (other.codePostal || other.cp || '') : '');
                                                  return (ville && cp) ? `${ville}, ${cp}` : (ville || cp || '');
                                                })()}
                                                disabled={true}
                                                className="w-full font-sans cursor-not-allowed"
                                                placeholder="Ville, CP"
                                              />
                                            </div>

                                            {/* RÃ©fÃ©rence intervention. */}
                                            <div className="space-y-0.5 bg-transparent">
                                              <label className="block mb-1 fsm-label-style">RÃ©fÃ©rence intervention.</label>
                                              <input
                                                type="text"
                                                value={(() => {
                                                  if (m.interventionReference) return m.interventionReference;
                                                  const matchedReport = generatedReports.find((r: any) => 
                                                    (r.missionId && r.missionId === m.id) || 
                                                    (r.defibIdentifiant && r.defibIdentifiant === m.defibIdentifiant)
                                                  );
                                                  return matchedReport?.interventionReference || "";
                                                })()}
                                                disabled={true}
                                                className="w-full font-sans cursor-not-allowed"
                                                placeholder="Non renseignÃ©e"
                                              />
                                            </div>

                                            {/* Bon de commande. */}
                                            <div className="space-y-0.5 bg-transparent">
                                              <label className="block mb-1 fsm-label-style">Bon de commande.</label>
                                              <select
                                                value={m.bonCommandeId || ''}
                                                onChange={(e) => {
                                                  const nextBcId = e.target.value;
                                                  if (nextBcId && nextBcId !== 'custom') {
                                                    const foundDoc = commercialDocs.find(doc => doc.id === nextBcId);
                                                    const articleParts = foundDoc?.articles
                                                      ? foundDoc.articles.map(art => art.designation).filter(Boolean)
                                                      : [];
                                                    const uniqueParts = Array.from(new Set([...(m.requiredParts || []), ...articleParts]));
                                                    if (uniqueParts.length > (m.requiredParts || []).length) {
                                                      changeFsmMissionParts(t.id, m.id, (m.requiredParts || []) as string[], uniqueParts, { bonCommandeId: nextBcId });
                                                    } else {
                                                      updateFsmMission(t.id, m.id, { bonCommandeId: nextBcId });
                                                    }
                                                  } else if (nextBcId === 'custom') {
                                                    updateFsmMission(t.id, m.id, { bonCommandeId: nextBcId });
                                                  } else {
                                                    changeFsmMissionParts(t.id, m.id, (m.requiredParts || []) as string[], [], { bonCommandeId: '' });
                                                  }
                                                }}
                                                className="w-full font-sans focus:outline-none cursor-pointer text-slate-800"
                                                style={{
                                                  border: '1px solid #dedede',
                                                  borderRadius: '13px',
                                                  padding: '12px',
                                                  fontSize: '16px',
                                                  fontWeight: '100',
                                                  color: '#000000',
                                                  backgroundColor: '#ffffff'
                                                }}
                                              >
                                                <option value="">-- Aucun --</option>
                                                <option value="custom">Autre (Texte libre)</option>
                                                {(() => {
                                                  const matchedClient = (() => {
                                                    if (m.clientId) {
                                                      const found = clients.find(c => c.id === m.clientId);
                                                      if (found) return found;
                                                    }
                                                    const matchedDefib = defibrillateurs.find(df => df.identifiant === m.defibIdentifiant);
                                                    if (matchedDefib) {
                                                      const found = clients.find(c => c.id === matchedDefib.clientId);
                                                      if (found) return found;
                                                    }
                                                    if (m.clientName) {
                                                      const mName = m.clientName.toLowerCase();
                                                      const found = clients.find(c => {
                                                        if (!c.denomination) return false;
                                                        const cDenom = c.denomination.toLowerCase();
                                                        return mName.includes(cDenom) || cDenom.includes(mName);
                                                      });
                                                      if (found) return found;
                                                    }
                                                    return null;
                                                  })();

                                                  const clientBcs = matchedClient
                                                    ? commercialDocs.filter(doc => 
                                                        doc.hasBonCommande && 
                                                        (doc.clientId === matchedClient.id || 
                                                         (doc.clientDenomination && matchedClient.denomination && 
                                                          doc.clientDenomination.toLowerCase() === matchedClient.denomination.toLowerCase()))
                                                      )
                                                    : [];

                                                  return clientBcs.map(bcDoc => (
                                                    <option key={bcDoc.id} value={bcDoc.id}>
                                                      {bcDoc.bonCommandeEntete || bcDoc.bonCommandeReference || bcDoc.ref}
                                                    </option>
                                                  ));
                                                })()}
                                              </select>
                                              {m.bonCommandeId === 'custom' && (
                                                <div className="mt-2 space-y-0.5 bg-transparent">
                                                  <input
                                                    type="text"
                                                    value={m.customBonCommande || ''}
                                                    onChange={(e) => updateFsmMission(t.id, m.id, { customBonCommande: e.target.value })}
                                                    placeholder={translate("Saisir le bon de commande...")}
                                                    className="w-full font-sans focus:outline-none"
                                                    style={{
                                                      border: '1px solid #dedede',
                                                      borderRadius: '13px',
                                                      padding: '12px',
                                                      fontSize: '16px',
                                                      fontWeight: '100',
                                                      color: '#000000',
                                                      backgroundColor: '#ffffff'
                                                    }}
                                                  />
                                                </div>
                                              )}
                                            </div>

                                            {/* Date estimÃ©e. */}
                                            <div className="space-y-0.5 bg-transparent">
                                              <div className="flex items-center justify-between mb-1">
                                                <label className="block fsm-label-style mb-0">Date estimÃ©e.</label>
                                                <button
                                                  type="button"
                                                  onClick={toggleForced}
                                                  className="inline-flex items-center gap-1.5 cursor-pointer focus:outline-none select-none"
                                                  title="Forcer la date et le crÃ©neau"
                                                >
                                                  <span style={{ fontSize: '13px', fontWeight: 600, color: isMissionForced ? '#fe4eba' : '#64748b' }}>
                                                    Forcer
                                                  </span>
                                                  <div
                                                    style={{
                                                      width: '34px',
                                                      height: '18px',
                                                      borderRadius: '9999px',
                                                      backgroundColor: isMissionForced ? '#fe4eba' : '#cbd5e1',
                                                      position: 'relative',
                                                      transition: 'background-color 0.2s ease',
                                                      padding: '2px'
                                                    }}
                                                  >
                                                    <div
                                                      style={{
                                                        width: '14px',
                                                        height: '14px',
                                                        borderRadius: '50%',
                                                        backgroundColor: '#ffffff',
                                                        position: 'absolute',
                                                        top: '2px',
                                                        left: isMissionForced ? '18px' : '2px',
                                                        transition: 'left 0.2s ease',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                      }}
                                                    />
                                                  </div>
                                                </button>
                                              </div>
                                              <input
                                                type="date"
                                                value={estimatedDateValue}
                                                onChange={(e) => {
                                                  const nextDate = e.target.value;
                                                  updateFsmMission(t.id, m.id, { estimatedDate: nextDate });
                                                  if (nextDate) {
                                                    const holidayCheck = isHolidayDate(nextDate, undefined, companyInfo);
                                                    if (holidayCheck.isHoliday) {
                                                      alert("Attention, jour fÃ©riÃ©.");
                                                    }
                                                  }
                                                }}
                                                className="w-full font-sans cursor-pointer focus:outline-none"
                                                style={{
                                                  border: '1px solid #dedede',
                                                  borderRadius: '13px',
                                                  padding: '12px',
                                                  fontSize: '16px',
                                                  fontWeight: '100',
                                                  color: '#000000',
                                                  backgroundColor: '#ffffff'
                                                }}
                                              />
                                              {(() => {
                                                const holidayCheck = isHolidayDate(estimatedDateValue, undefined, companyInfo);
                                                if (holidayCheck.isHoliday) {
                                                  return (
                                                    <div className="text-red-500 font-medium text-[13px] mt-1 flex items-center gap-1">
                                                      <span>Attention, jour fÃ©riÃ©.</span>
                                                      {holidayCheck.holidayName && (
                                                        <span className="text-red-400 font-normal">({holidayCheck.holidayName})</span>
                                                      )}
                                                    </div>
                                                  );
                                                }
                                                return null;
                                              })()}
                                            </div>

                                            {/* CrÃ©neau estimÃ©. */}
                                            <div className="space-y-0.5 bg-transparent">
                                              <div className="flex items-center justify-between mb-1">
                                                <label className="block fsm-label-style mb-0">CrÃ©neau estimÃ©.</label>
                                                <button
                                                  type="button"
                                                  onClick={toggleForced}
                                                  className="inline-flex items-center gap-1.5 cursor-pointer focus:outline-none select-none"
                                                  title="Forcer la date et le crÃ©neau"
                                                >
                                                  <span style={{ fontSize: '13px', fontWeight: 600, color: isMissionForced ? '#fe4eba' : '#64748b' }}>
                                                    Forcer
                                                  </span>
                                                  <div
                                                    style={{
                                                      width: '34px',
                                                      height: '18px',
                                                      borderRadius: '9999px',
                                                      backgroundColor: isMissionForced ? '#fe4eba' : '#cbd5e1',
                                                      position: 'relative',
                                                      transition: 'background-color 0.2s ease',
                                                      padding: '2px'
                                                    }}
                                                  >
                                                    <div
                                                      style={{
                                                        width: '14px',
                                                        height: '14px',
                                                        borderRadius: '50%',
                                                        backgroundColor: '#ffffff',
                                                        position: 'absolute',
                                                        top: '2px',
                                                        left: isMissionForced ? '18px' : '2px',
                                                        transition: 'left 0.2s ease',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                      }}
                                                    />
                                                  </div>
                                                </button>
                                              </div>
                                              <select
                                                value={m.estimatedSlot || ''}
                                                onChange={(e) => updateFsmMission(t.id, m.id, { estimatedSlot: e.target.value })}
                                                className="w-full font-sans focus:outline-none cursor-pointer"
                                                style={{
                                                  border: '1px solid #dedede',
                                                  borderRadius: '13px',
                                                  padding: '12px',
                                                  fontSize: '16px',
                                                  fontWeight: '100',
                                                  color: '#000000',
                                                  backgroundColor: '#ffffff'
                                                }}
                                              >
                                                <option value="">-- Non dÃ©fini --</option>
                                                <option value="8:00am">8:00am</option>
                                                <option value="8:30am">8:30am</option>
                                                <option value="9:00am">9:00am</option>
                                                <option value="9:30am">9:30am</option>
                                                <option value="10:00am">10:00am</option>
                                                <option value="10:30am">10:30am</option>
                                                <option value="11:00am">11:00am</option>
                                                <option value="11:30am">11:30am</option>
                                                <option value="12:00pm">12:00pm</option>
                                                <option value="12:30pm">12:30pm</option>
                                                <option value="13:00pm">13:00pm</option>
                                                <option value="13:30pm">13:30pm</option>
                                                <option value="14:00pm">14:00pm</option>
                                                <option value="14:30pm">14:30pm</option>
                                                <option value="15:00pm">15:00pm</option>
                                                <option value="15:30pm">15:30pm</option>
                                                <option value="16:00pm">16:00pm</option>
                                                <option value="16:30pm">16:30pm</option>
                                                <option value="17:00pm">17:00pm</option>
                                              </select>
                                            </div>
                                          </div>

                                          {/* Raison/Prestation. */}
                                          <div className="pt-2 space-y-1.5 relative font-sans w-full bg-transparent">
                                            <label className="block mb-1 fsm-label-style" style={{ fontSize: "15px", color: "#000000", fontWeight: 600 }}>
                                              Raison/Prestation.
                                            </label>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full items-center bg-transparent">
                                              {/* Dropdown Select on the left */}
                                              <div className="md:col-span-1 w-full bg-transparent">
                                                <select
                                                  value=""
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                      const current: string[] = Array.isArray(m.reasons)
                                                        ? m.reasons
                                                        : (m.reason ? m.reason.split(", ").map((s: string) => s.trim()).filter(Boolean) : []);
                                                      if (!current.includes(val)) {
                                                        const nextReasons = [...current, val];
                                                        updateFsmMission(t.id, m.id, {
                                                          reasons: nextReasons,
                                                          reason: nextReasons.join(", ")
                                                        });
                                                      }
                                                      e.target.value = "";
                                                    }
                                                  }}
                                                  style={{
                                                    border: "1px solid #dedede",
                                                    borderRadius: "13px",
                                                    padding: "12px",
                                                    fontSize: "16px",
                                                    fontWeight: "100",
                                                    color: "#000000",
                                                    backgroundColor: "#ffffff"
                                                  }}
                                                  className="w-full font-sans focus:outline-none cursor-pointer"
                                                >
                                                  <option value="">-- SÃ©lectionner une raison / prestation --</option>
                                                  {variables
                                                    .filter((v: any) => v.category === "ModÃ¨le Raison Prestation")
                                                    .map((v: any) => {
                                                      const current: string[] = Array.isArray(m.reasons)
                                                        ? m.reasons
                                                        : (m.reason ? m.reason.split(", ").map((s: string) => s.trim()).filter(Boolean) : []);
                                                      const isSelected = current.includes(v.nom);
                                                      return (
                                                        <option key={v.id} value={v.nom} disabled={isSelected}>
                                                          {v.nom} {isSelected ? "(DÃ©jÃ  ajoutÃ©e)" : ""}
                                                        </option>
                                                      );
                                                    })}
                                                </select>
                                              </div>

                                              {/* Selected Reasons Capsules listed on the right */}
                                              <div className="md:col-span-3 w-full bg-transparent">
                                                {(() => {
                                                  const currentReasons: string[] = Array.isArray(m.reasons)
                                                    ? m.reasons
                                                    : (m.reason ? m.reason.split(", ").map((s: string) => s.trim()).filter(Boolean) : []);

                                                  return (
                                                    <div className="flex flex-wrap gap-1.5 min-h-[42px] items-center bg-transparent">
                                                      {currentReasons.length > 0 ? (
                                                        currentReasons.map((reasonStr: string) => (
                                                          <span
                                                            key={reasonStr}
                                                            onClick={() => {
                                                              const nextReasons = currentReasons.filter(r => r !== reasonStr);
                                                              updateFsmMission(t.id, m.id, {
                                                                reasons: nextReasons,
                                                                reason: nextReasons.join(", ")
                                                              });
                                                            }}
                                                            style={{
                                                              fontFamily: "DefibeoMain, Civilprom, sans-serif",
                                                            }}
                                                            className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-[#8e1010] hover:border-[#8e1010] hover:text-white transition-all duration-150 select-none"
                                                            title="Cliquez pour supprimer"
                                                          >
                                                            {reasonStr}
                                                          </span>
                                                        ))
                                                      ) : null}
                                                    </div>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Info block displaying Commentaires of selected Bon de commande */}
                                          {(() => {
                                            const selectedBcDoc = (() => {
                                              if (!m.bonCommandeId) return null;
                                              return commercialDocs.find(doc => doc.id === m.bonCommandeId);
                                            })();

                                            if (selectedBcDoc && selectedBcDoc.commentaires && selectedBcDoc.commentaires.trim() !== '') {
                                              return (
                                                <div 
                                                  style={{
                                                    color: 'rgb(143 51 151)',
                                                    backgroundColor: 'rgb(253 229 255)',
                                                    border: 'none',
                                                    cursor: 'default'
                                                  }}
                                                  className="font-semibold text-sm px-4 py-3 rounded-xl flex items-center gap-2.5 mt-2 w-full mx-0.5"
                                                >
                                                  <span>
                                                    Commentaires : {selectedBcDoc.commentaires}
                                                  </span>
                                                </div>
                                              );
                                            }
                                            return null;
                                          })()}

                                          {/* Lookup field for required components with stock items selector */}
                                          {(() => {
                                            if (m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId) return null;
                                            const currentMissionDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);

                                            const tourTechName = t.techName || '';
                                            const tourTechMember = members.find((mem: any) => mem.name && mem.name.trim().toLowerCase() === tourTechName.trim().toLowerCase());
                                            const techLocation = tourTechMember?.locationLink || '';

                                            const isLocationMatchingTechOrCentral = (loc?: string) => {
                                              if (!loc || loc === 'Centrale des stocks' || loc === 'Stock Central' || loc === 'defaut' || loc === 'Central') {
                                                return true;
                                              }
                                              if (techLocation) {
                                                if (loc === techLocation || getLocationCustomName(loc) === getLocationCustomName(techLocation)) {
                                                  return true;
                                                }
                                              }
                                              return false;
                                            };

                                            const getTraceabilityLocation = (trace: any, stockRecord: any) => {
                                              if (trace.emplacement) return trace.emplacement;
                                              if (trace.movementId && Array.isArray(stockRecord.mouvements)) {
                                                const mv = stockRecord.mouvements.find((mvItem: any) => mvItem.id === trace.movementId);
                                                if (mv) {
                                                  if (mv.type === 'RÃ©approvisionnement fournisseur') {
                                                    return 'Centrale des stocks';
                                                  }
                                                  if (mv.emplacement) {
                                                    return mv.emplacement.includes(' : ') ? mv.emplacement.split(' : ')[1] : mv.emplacement;
                                                  }
                                                }
                                              }
                                              return 'Centrale des stocks';
                                            };

                                            const stockItems: { id: string; name: string; label: string; matchedStock?: any }[] = [];
                                            const addedLabels = new Set<string>();

                                            // 1. Traceable items and central items from stocks
                                            (stocks || []).forEach(s => {
                                              const vObj = variables.find(v => v.id === s.denominationPieceId);
                                              if (vObj && (vObj.category === 'ModÃ¨le Service' || vObj.category === 'ModÃ¨le Contrat' || vObj.category === 'Fournisseur')) return;
                                              const name = vObj ? vObj.nom : (s.denom || `PiÃ¨ce indÃ©finie`);

                                              if (s.traceabilityEnabled && Array.isArray(s.traceabilities) && s.traceabilities.length > 0) {
                                                s.traceabilities.forEach((trace: any) => {
                                                  if (trace.situation === 'Disponible' && Number(trace.volume) === 1) {
                                                    const traceLoc = getTraceabilityLocation(trace, s);
                                                    if (isLocationMatchingTechOrCentral(traceLoc)) {
                                                      const numLot = trace.lotOrSerial || '-';
                                                      const datePer = trace.expirationDate || '-';
                                                      const vol = trace.volume;
                                                      const label = `${name}, ${numLot}, ${datePer}, ${vol}`;
                                                      if (!addedLabels.has(label)) {
                                                        stockItems.push({ id: `tr_${trace.id}`, name, label, matchedStock: s });
                                                        addedLabels.add(label);
                                                      }
                                                    }
                                                  }
                                                });
                                              } else {
                                                if (Number(s.quantite) > 0) {
                                                  const ugs = s.ugs ? ` - UGS: ${s.ugs}` : '';
                                                  const label = `${name} (Stock Central - QtÃ©: ${s.quantite}${ugs})`;
                                                  if (!addedLabels.has(label)) {
                                                    stockItems.push({ id: `st_${s.id}`, name, label, matchedStock: s });
                                                    addedLabels.add(label);
                                                  }
                                                }
                                              }
                                            });

                                            // 2. Non-traceable items from Distributed Stocks
                                            (distributedStocks || []).forEach(ds => {
                                              const vObj = variables.find(v => v.id === ds.denominationPieceId);
                                              if (vObj && (vObj.category === 'ModÃ¨le Service' || vObj.category === 'ModÃ¨le Contrat' || vObj.category === 'Fournisseur')) return;
                                              if (Number(ds.volumeDisponible) <= 0) return;

                                              if (isLocationMatchingTechOrCentral(ds.locationName)) {
                                                const name = vObj ? vObj.nom : (ds.denom || `PiÃ¨ce indÃ©finie`);
                                                const matchedStock = stocks.find(s => s.id === ds.stockId || s.denominationPieceId === ds.denominationPieceId);
                                                if (!matchedStock?.traceabilityEnabled) {
                                                  const ugs = matchedStock?.ugs || '';
                                                  const ugsString = ugs ? ` - UGS: ${ugs}` : '';
                                                  const label = `${name} (${getLocationCustomName(ds.locationName)} - Dispo: ${ds.volumeDisponible}${ugsString})`;
                                                  if (!addedLabels.has(label)) {
                                                    stockItems.push({ id: `ds_${ds.id}`, name, label, matchedStock });
                                                    addedLabels.add(label);
                                                  }
                                                }
                                              }
                                            });

                                            const recommendedItems = currentMissionDefib && currentMissionDefib.modeleId
                                              ? stockItems.filter(item => Array.isArray(item.matchedStock?.usageRecommandeIds) && item.matchedStock.usageRecommandeIds.includes(currentMissionDefib.modeleId))
                                              : [];
                                            const otherItems = currentMissionDefib && currentMissionDefib.modeleId
                                              ? stockItems.filter(item => !Array.isArray(item.matchedStock?.usageRecommandeIds) || !item.matchedStock.usageRecommandeIds.includes(currentMissionDefib.modeleId))
                                              : stockItems;

                                            return (
                                              <div className="pt-2 space-y-2.5 relative font-sans w-full bg-transparent">
                                                <div className="flex justify-between items-center bg-transparent">
                                                  <span className="fsm-label-style bg-transparent" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>
                                                    PiÃ¨ces requises.
                                                  </span>
                                                </div>

                                                {/* SELECTED PIECES BADGES */}
                                                {m.requiredParts && m.requiredParts.length > 0 && (
                                                  <div className="flex flex-col gap-2.5 bg-transparent">
                                                    {m.requiredParts.map((part: string) => {
                                                      const matchedStockItem = stockItems.find(si => si.label === part || si.name === part);
                                                      const displayLabel = matchedStockItem ? matchedStockItem.label : part;
                                                      const sentParts: string[] = Array.isArray(m.sentToClientParts) ? m.sentToClientParts : [];
                                                      const isSent = sentParts.includes(part);

                                                      return (
                                                        <div key={part} className="flex flex-wrap items-center gap-3 bg-transparent py-0.5">
                                                          {/* Toggle ON/OFF EnvoyÃ©e au client */}
                                                          <button
                                                            type="button"
                                                            onClick={() => togglePartSentToClient(t.id, m.id, part)}
                                                            className="inline-flex items-center gap-1.5 cursor-pointer focus:outline-none select-none shrink-0"
                                                            title="EnvoyÃ©e au client"
                                                          >
                                                            <span style={{ fontSize: '13px', fontWeight: 600, color: isSent ? '#fe4eba' : '#64748b' }}>
                                                              EnvoyÃ©e au client
                                                            </span>
                                                            <div
                                                              style={{
                                                                width: '34px',
                                                                height: '18px',
                                                                borderRadius: '9999px',
                                                                backgroundColor: isSent ? '#fe4eba' : '#cbd5e1',
                                                                position: 'relative',
                                                                transition: 'background-color 0.2s ease',
                                                                padding: '2px'
                                                              }}
                                                            >
                                                              <div
                                                                style={{
                                                                  width: '14px',
                                                                  height: '14px',
                                                                  borderRadius: '50%',
                                                                  backgroundColor: '#ffffff',
                                                                  position: 'absolute',
                                                                  top: '2px',
                                                                  left: isSent ? '18px' : '2px',
                                                                  transition: 'left 0.2s ease'
                                                                }}
                                                              />
                                                            </div>
                                                          </button>

                                                          {/* GÃ©lule de la piÃ¨ce requise */}
                                                          <span
                                                            onClick={() => {
                                                              const updatedParts = (m.requiredParts || []).filter((p: string) => p !== part);
                                                              const updatedSentParts = sentParts.filter((p: string) => p !== part);
                                                              changeFsmMissionParts(t.id, m.id, m.requiredParts || [], updatedParts, { sentToClientParts: updatedSentParts });
                                                            }}
                                                            style={{
                                                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                                            }}
                                                            className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-red-800 hover:border-red-800 hover:text-white transition-all duration-150 select-none max-w-full truncate"
                                                            title="Cliquez pour supprimer"
                                                          >
                                                            {displayLabel} (x1)
                                                          </span>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}

                                                {/* NATIVE SYSTEM DROPDOWN SELECTOR */}
                                                <div className="relative bg-transparent">
                                                  <select
                                                    value=""
                                                    onChange={(e) => {
                                                      const selectedVal = e.target.value;
                                                      const currentParts = m.requiredParts || [];
                                                      if (selectedVal && !currentParts.includes(selectedVal)) {
                                                        const updatedParts = [...currentParts, selectedVal];
                                                        changeFsmMissionParts(t.id, m.id, currentParts, updatedParts);
                                                      }
                                                      e.target.value = ""; // Reset
                                                    }}
                                                    style={{
                                                      border: '1px solid #dedede',
                                                      borderRadius: '13px',
                                                      padding: '12px',
                                                      fontSize: '15px',
                                                      fontWeight: '100',
                                                      color: '#000000',
                                                      backgroundColor: '#ffffff',
                                                      width: '100%',
                                                      cursor: 'pointer',
                                                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                                                    }}
                                                    className="font-sans focus:outline-none justify-start cursor-pointer"
                                                  >
                                                    <option value="" disabled>SÃ©lection d'une piÃ¨ce du stock.</option>
                                                    {recommendedItems.length > 0 ? (
                                                      <>
                                                        <optgroup label="PiÃ¨ces recommandÃ©es">
                                                          {recommendedItems.map(item => (
                                                            <option key={item.id} value={item.label}>
                                                              {item.label}
                                                            </option>
                                                          ))}
                                                        </optgroup>
                                                        <optgroup label="Autres piÃ¨ces">
                                                          {otherItems.map(item => (
                                                            <option key={item.id} value={item.label}>
                                                              {item.label}
                                                            </option>
                                                          ))}
                                                        </optgroup>
                                                      </>
                                                    ) : (
                                                      stockItems.map(item => (
                                                        <option key={item.id} value={item.label}>
                                                          {item.label}
                                                        </option>
                                                      ))
                                                    )}
                                                  </select>
                                                </div>
                                              </div>
                                            );
                                          })()}

                                          {/* Bottom row: TransfÃ©rer & Supprimer */}
                                          <div className="pt-2 grid grid-cols-1 md:grid-cols-4 gap-3 w-full bg-transparent items-end">
                                            {/* TransfÃ©rer section */}
                                            <div className="space-y-0.5 bg-transparent md:col-span-3">
                                              <label className="block mb-1 fsm-label-style" style={{ fontSize: '18px' }}>TransfÃ©rer.</label>
                                              <div className="flex gap-2">
                                                <select
                                                  id={`transfer-select-${m.id}`}
                                                  style={{
                                                    border: '1px solid #dedede',
                                                    borderRadius: '13px',
                                                    padding: '12px',
                                                    fontSize: '16px',
                                                    fontWeight: '100',
                                                    backgroundColor: '#ffffff',
                                                    color: '#000000',
                                                    flex: 1
                                                  }}
                                                  className="font-sans cursor-pointer focus:outline-none"
                                                >
                                                  <option value="">SÃ©lection tournÃ©e brouillon.</option>
                                                  {fsmTours
                                                    .filter(tour => tour.id !== 'a-trier' && (tour.status || 'Brouillon') === 'Brouillon')
                                                    .map(tour => (
                                                      <option key={tour.id} value={tour.id}>
                                                        {tour.title} ({tour.startDate || 'Sans date'})
                                                      </option>
                                                    ))
                                                  }
                                                </select>

                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const selectEl = document.getElementById(`transfer-select-${m.id}`) as HTMLSelectElement;
                                                    const targetId = selectEl?.value;
                                                    if (!targetId) {
                                                      alert("Veuillez sÃ©lectionner une tournÃ©e en Brouillon.");
                                                      return;
                                                    }
                                                    
                                                    const targetTour = fsmTours.find(tour => tour.id === targetId);
                                                    if (targetTour && (targetTour.status || 'Brouillon') !== 'Brouillon') {
                                                      alert("Erreur : vous ne pouvez transfÃ©rer des missions qu'Ã  une tournÃ©e en situation Brouillon.");
                                                      return;
                                                    }
                                                    
                                                    // Perform transfer!
                                                    const updated = fsmTours.map(tour => {
                                                      if (tour.id === 'a-trier') {
                                                        return {
                                                          ...tour,
                                                          missions: tour.missions.filter((miss: any) => miss.id !== m.id)
                                                        };
                                                      }
                                                      if (tour.id === targetId) {
                                                        return {
                                                          ...tour,
                                                          missions: [...tour.missions, m]
                                                        };
                                                      }
                                                      return tour;
                                                    });
                                                    saveFsmTours(updated);
                                                    alert("Mission transfÃ©rÃ©e avec succÃ¨s !");
                                                  }}
                                                  style={{
                                                    backgroundColor: '#000000',
                                                    color: '#ffffff',
                                                    padding: '12px 18px',
                                                    borderRadius: '13px',
                                                    fontSize: '18px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    border: 'none',
                                                  }}
                                                  className="hover:opacity-90 transition-opacity whitespace-nowrap"
                                                >
                                                  TransfÃ©rer
                                                </button>
                                              </div>
                                            </div>

                                            {/* Supprimer button */}
                                            <div className="bg-transparent flex flex-col justify-end md:col-span-1">
                                              <button
                                                type="button"
                                                onClick={() => deleteFsmMission(t.id, m.id)}
                                                style={{
                                                  color: '#fff',
                                                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(97, 28, 104) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                                                  background: 'rgb(96, 28, 104)',
                                                  borderRadius: '13px',
                                                  border: 'none',
                                                  fontSize: '18px',
                                                  fontWeight: '500',
                                                  padding: '12px 16px',
                                                  width: '100%',
                                                  display: 'flex',
                                                  justifyContent: 'center',
                                                  alignItems: 'center'
                                                }}
                                                className="cursor-pointer"
                                              >
                                                Supprimer
                                              </button>
                                            </div>
                                          </div>
                                          </div>
                                          );
                                        })()}
                                    </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const draft = fsmTourDrafts[t.id] || {};
                      const tourTitle = draft.title !== undefined ? draft.title : (t.title || '');
                      const tourTechName = draft.techName !== undefined ? draft.techName : (t.techName || '');
                      const tourStartDate = draft.startDate !== undefined ? draft.startDate : (t.startDate || '');
                      const tourStatus = draft.status !== undefined ? draft.status : (t.status || 'Brouillon');
                      const tourVehicule = draft.vehicule !== undefined ? draft.vehicule : (t.vehicule || 'Aucun');
                      const tourRegion = draft.region !== undefined ? draft.region : (t.region || '');
                      const tourPlannerName = draft.plannerName !== undefined ? draft.plannerName : (t.plannerName || '');

                      return (
                        <div key={t.id} className="bg-white relative space-y-6 animate-fadeIn" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px', maxWidth: '98%', margin: '24px auto', backgroundColor: '#ffffff', overflow: 'hidden' }}>
                          {/* THE INTERCALAIRE TOUR HEADER */}
                          <div className="bg-white px-5 py-5 flex flex-col gap-4 font-sans" style={{ borderBottom: '1px solid rgb(218, 218, 218)', borderRadius: '17px 17px 0px 0px', backgroundColor: '#ffffff' }}>
                            {/* Row 1: Titre de la tournÃ©e + Action Buttons */}
                            <div className="flex flex-col md:flex-row md:items-end gap-3 w-full">
                              <div className="flex-1">
                                <label className="block mb-1.5 fsm-label-style" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>Titre de la tournÃ©e.</label>
                                <input
                                  type="text"
                                  value={tourTitle}
                                  onChange={(e) => {
                                    setFsmTourDrafts(prev => ({
                                      ...prev,
                                      [t.id]: {
                                        ...(prev[t.id] || {}),
                                        title: e.target.value
                                      }
                                    }));
                                  }}
                                style={{
                                  border: '1px solid #dedede',
                                  borderRadius: '13px',
                                  padding: '12px',
                                  fontSize: '16px',
                                  fontWeight: '100',
                                  color: '#000000',
                                  backgroundColor: '#ffffff',
                                  width: '100%'
                                }}
                                className="font-sans focus:outline-none"
                                placeholder="Entrez un titre."
                              />
                            </div>

                            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                              {/* Supprimer button */}
                              <button
                                type="button"
                                disabled={tourStatus === 'Ã€ faire' || tourStatus === 'En cours'}
                                onClick={() => deleteFsmTour(t.id)}
                                style={{
                                  ...rowActionButtonStyle,
                                  padding: '12px 24px',
                                  borderRadius: '13px',
                                  fontSize: '18px',
                                  fontWeight: '100',
                                  height: '50px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  opacity: (tourStatus === 'Ã€ faire' || tourStatus === 'En cours') ? 0.4 : 1,
                                  cursor: (tourStatus === 'Ã€ faire' || tourStatus === 'En cours') ? 'not-allowed' : 'pointer'
                                }}
                                className={`${(tourStatus === 'Ã€ faire' || tourStatus === 'En cours') ? '' : 'cursor-pointer'} md:w-auto flex-1 md:flex-initial`}
                                title={(tourStatus === 'Ã€ faire' || tourStatus === 'En cours') ? "Impossible de supprimer une tournÃ©e dont le statut est Ã€ faire ou En cours" : ""}
                              >
                                Supprimer
                              </button>

                              {/* Calculer button */}
                              <button
                                type="button"
                                disabled={(t.missions ? t.missions.length : 0) <= 1}
                                onClick={async () => {
                                  const draftVal = fsmTourDrafts[t.id] || {};
                                  const finalTitle = draftVal.title !== undefined ? draftVal.title : (t.title || '');
                                  const finalTech = draftVal.techName !== undefined ? draftVal.techName : (t.techName || '');
                                  const finalStartDate = draftVal.startDate !== undefined ? draftVal.startDate : (t.startDate || '');
                                  const finalStatus = draftVal.status !== undefined ? draftVal.status : (t.status || 'Brouillon');
                                  const finalVehicule = draftVal.vehicule !== undefined ? draftVal.vehicule : (t.vehicule || 'Aucun');
                                  const finalRegion = draftVal.region !== undefined ? draftVal.region : (t.region || '');
                                  const finalPlannerName = draftVal.plannerName !== undefined ? draftVal.plannerName : (t.plannerName || '');

                                  if (!finalTech || finalTech.trim() === '') {
                                    alert("Veuillez sÃ©lectionner un technicien avec une adresse de dÃ©part renseignÃ©e pour pouvoir calculer l'itinÃ©raire.");
                                    return;
                                  }

                                  const matchingMember = members.find(m => m.name.trim().toLowerCase() === finalTech.trim().toLowerCase());
                                  const hasStructuredAddress = matchingMember && matchingMember.startAddressLat !== undefined && matchingMember.startAddressLng !== undefined;
                                  const hasStringAddress = matchingMember && matchingMember.startAddress && matchingMember.startAddress.trim() !== '';
                                  if (!matchingMember || (!hasStructuredAddress && !hasStringAddress)) {
                                    console.warn("Calculer clicked but technician not found or missing starting coordinates:", { finalTech, matchingMember, members });
                                    alert("Le technicien sÃ©lectionnÃ© doit avoir une adresse de dÃ©part renseignÃ©e (avec latitude et longitude renseignÃ©es) pour pouvoir calculer l'itinÃ©raire.");
                                    return;
                                  }

                                  const mergedTour = {
                                    ...t,
                                    title: finalTitle,
                                    techName: finalTech,
                                    startDate: finalStartDate,
                                    status: finalStatus,
                                    vehicule: finalVehicule,
                                    region: finalRegion,
                                    plannerName: finalPlannerName
                                  };

                                  const updatedToursList = fsmTours.map(tourItem => tourItem.id === t.id ? mergedTour : tourItem);
                                  
                                  await optimizeFsmTour(t.id, updatedToursList);

                                  // Clear draft since it is now successfully calculated and saved
                                  setFsmTourDrafts(prev => {
                                    const copy = { ...prev };
                                    delete copy[t.id];
                                    return copy;
                                  });
                                  alert("L'itinÃ©raire et les horaires ont Ã©tÃ© calculÃ©s et optimisÃ©s avec succÃ¨s !");
                                }}
                                style={{
                                  ...rowActionButtonStyle,
                                  padding: '12px 24px',
                                  borderRadius: '13px',
                                  fontSize: '18px',
                                  fontWeight: '100',
                                  height: '50px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  opacity: (t.missions ? t.missions.length : 0) <= 1 ? 0.5 : 1,
                                  cursor: (t.missions ? t.missions.length : 0) <= 1 ? 'not-allowed' : 'pointer'
                                }}
                                className={`${(t.missions ? t.missions.length : 0) <= 1 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} md:w-auto flex-1 md:flex-initial`}
                              >
                                Calculer
                              </button>

                              {/* Avisage button */}
                              {(() => {
                                const isAvisageEnabled = (t.missions || []).some((m: any) => {
                                  const sit = m.status || 'Brouillon';
                                  return sit === 'AcceptÃ© Client' || sit === 'Ã€ faire' || sit === 'Attente';
                                });
                                return (
                                  <button
                                    type="button"
                                    disabled={!isAvisageEnabled}
                                    onClick={() => setAvisageConfirmTour(t)}
                                    style={{
                                      ...rowActionButtonStyle,
                                      padding: '12px 24px',
                                      borderRadius: '13px',
                                      fontSize: '18px',
                                      fontWeight: '100',
                                      height: '50px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '100%',
                                      opacity: isAvisageEnabled ? 1 : 0.4,
                                      cursor: isAvisageEnabled ? 'pointer' : 'not-allowed'
                                    }}
                                    className={`${isAvisageEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'} md:w-auto flex-1 md:flex-initial`}
                                  >
                                    Avisage
                                  </button>
                                );
                              })()}

                              {/* Enregistrer button */}
                              <button
                                type="button"
                                disabled={!!savingTourIds[t.id]}
                                onClick={() => {
                                  if (savingTourIds[t.id]) return;

                                  const draftVal = fsmTourDrafts[t.id] || {};
                                  const finalTitle = draftVal.title !== undefined ? draftVal.title : (t.title || '');
                                  const finalTech = draftVal.techName !== undefined ? draftVal.techName : (t.techName || '');
                                  const finalStatus = draftVal.status !== undefined ? draftVal.status : (t.status || 'Brouillon');

                                  if (!finalTitle.trim()) {
                                    alert("Le titre de la tournÃ©e est requis.");
                                    return;
                                  }
                                  if (finalStatus !== 'Brouillon' && (!finalTech || finalTech.trim() === '')) {
                                    alert("Veuillez sÃ©lectionner un technicien pour planifier cette tournÃ©e.");
                                    return;
                                  }
                                  if (finalStatus === 'TerminÃ©') {
                                    const uncompletedMissions = (t.missions || []).filter(
                                      (m: any) => m.status === 'Ã€ faire'
                                    );
                                    if (uncompletedMissions.length > 0) {
                                      const hasUnfilledReasons = uncompletedMissions.some(
                                        (m: any) => !m.reason || !m.reason.trim()
                                      );
                                      if (hasUnfilledReasons) {
                                        alert("Impossible de marquer cette tournÃ©e comme terminÃ©e. Veuillez renseigner le motif de non-rÃ©alisation pour toutes les missions non effectuÃ©es (Situation : Ã€ faire).");
                                        return;
                                      }
                                    }
                                  }

                                  // Disable button and lower opacity
                                  setSavingTourIds(prev => ({ ...prev, [t.id]: true }));

                                  // Apply draft changes
                                  if (fsmTourDrafts[t.id]) {
                                    updateFsmTour(t.id, fsmTourDrafts[t.id]);
                                    if (fsmTourDrafts[t.id].startDate) {
                                      setFsmDateFilter(fsmTourDrafts[t.id].startDate);
                                    }
                                    setFsmTourDrafts(prev => {
                                      const copy = { ...prev };
                                      delete copy[t.id];
                                      return copy;
                                    });
                                  } else {
                                    saveFsmTours([...fsmTours]);
                                  }
                                  alert("La tournÃ©e a Ã©tÃ© enregistrÃ©e avec succÃ¨s !");

                                  // Re-enable after 3 seconds
                                  setTimeout(() => {
                                    setSavingTourIds(prev => {
                                      const copy = { ...prev };
                                      delete copy[t.id];
                                      return copy;
                                    });
                                  }, 3000);
                                }}
                                style={{
                                  ...blueButtonStyle,
                                  padding: '12px 24px',
                                  borderRadius: '13px',
                                  fontSize: '18px',
                                  fontWeight: '100',
                                  height: '50px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  opacity: savingTourIds[t.id] ? 0.7 : 1,
                                  pointerEvents: savingTourIds[t.id] ? 'none' : 'auto'
                                }}
                                className={`${savingTourIds[t.id] ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} md:w-auto flex-1 md:flex-initial`}
                              >
                                Enregistrer
                              </button>
                            </div>
                          </div>

                          {/* Indication of missions and estimated travel duration */}
                          {(() => {
                            if (!tourTechName || tourTechName === 'Aucun' || tourTechName.trim() === '') {
                              return null;
                            }
                            const mLength = t.missions ? t.missions.length : 0;
                            const daysEstimate = Math.ceil(mLength / 6);
                            return (
                              <div 
                                style={{
                                  color: '#3b5bf0',
                                  backgroundColor: '#e7ebff',
                                  border: 'none',
                                  cursor: 'default'
                                }}
                                className="font-semibold text-sm px-4 py-3 rounded-xl flex items-center gap-2.5 mx-0.5"
                              >
                                <span>
                                  La tournÃ©e comporte <strong className="font-extrabold">{mLength} {mLength > 1 ? 'missions' : 'mission'}</strong>, nous estimons Ã  <strong className="font-extrabold">{daysEstimate} {daysEstimate > 1 ? 'jours' : 'jour'}</strong> la durÃ©e du dÃ©placement. <strong className="font-extrabold">{(mLength * 1.2).toFixed(1).replace('.', ',')} kg dâ€™Ã©missions de COâ‚‚ (dioxyde de carbone)</strong> ont Ã©tÃ© Ã©vitÃ©s grÃ¢ce Ã  lâ€™optimisation du trajet (Source: MyClimate).
                                </span>
                              </div>
                            );
                          })()}

                          {/* Row 2: Technicien, VÃ©hicule, Date, RÃ©gion, Planificateur, Situation */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 w-full">
                            {/* Technicien */}
                            <div className="w-full">
                              <label className="block mb-1.5 fsm-label-style" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>Technicien.</label>
                              <select
                                value={tourTechName}
                                onChange={(e) => {
                                  const selectedTechName = e.target.value;
                                  const matchingMember = members.find(m => m.name.trim().toLowerCase() === selectedTechName.trim().toLowerCase());
                                  const assignedVehicle = matchingMember?.locationLink || 'Aucun';
                                  setFsmTourDrafts(prev => ({
                                    ...prev,
                                    [t.id]: {
                                      ...(prev[t.id] || {}),
                                      techName: selectedTechName,
                                      vehicule: assignedVehicle
                                    }
                                  }));
                                }}
                                style={{
                                  border: '1px solid #dedede',
                                  borderRadius: '13px',
                                  padding: '12px',
                                  fontSize: '16px',
                                  fontWeight: '100',
                                  color: '#000000',
                                  backgroundColor: '#ffffff',
                                  width: '100%'
                                }}
                                className="font-sans cursor-pointer focus:outline-none"
                              >
                                <option value="">SÃ©lectionnez un technicien.</option>
                                {(() => {
                                  const techOptions = Array.from(new Set([
                                    ...members.filter(m => {
                                      const roleLower = (m.role || '').toLowerCase();
                                      const isTech = roleLower.includes('tech') || roleLower.includes('maintenance') || roleLower.includes('terrain');
                                      const hasAddress = 
                                        (!!m.startAddress && m.startAddress.trim() !== '') ||
                                        (m.startAddressLat !== undefined && m.startAddressLng !== undefined);
                                      if (!isTech && !hasAddress) return false;

                                      // Check unavailability for tourStartDate
                                      if (tourStartDate) {
                                        if (m.absences && m.absences.length > 0) {
                                          const isUnavailable = m.absences.some(abs => {
                                            if (!abs.startDate || !abs.endDate) return false;
                                            return tourStartDate >= abs.startDate && tourStartDate <= abs.endDate;
                                          });
                                          if (isUnavailable) return false;
                                        }
                                        if (m.semaineTypique && m.semaineTypique.length > 0) {
                                          const dateObj = new Date(tourStartDate);
                                          if (!isNaN(dateObj.getTime())) {
                                            const FRENCH_DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                                            const dayName = FRENCH_DAYS[dateObj.getDay()];
                                            const todaySch = m.semaineTypique.find(s => s.days && s.days.includes(dayName));
                                            if (todaySch && todaySch.openForMissions === false) {
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      return true;
                                    }).map(m => m.name),
                                    tourTechName
                                  ].filter(Boolean).filter(name => name.trim() !== '')));
                                  return techOptions.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ));
                                })()}
                              </select>
                            </div>

                            {/* VÃ©hicule */}
                            <div className="w-full">
                              <label className="block mb-1.5 fsm-label-style" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>VÃ©hicule.</label>
                              <select
                                value={tourVehicule}
                                onChange={() => {}} // No-op to satisfy React warning
                                style={{
                                  border: '1px solid #dedede',
                                  borderRadius: '13px',
                                  padding: '12px',
                                  fontSize: '16px',
                                  fontWeight: '100',
                                  color: '#64748b',
                                  backgroundColor: '#ffffff',
                                  width: '100%',
                                  opacity: 1,
                                  pointerEvents: 'none',
                                }}
                                className="font-sans cursor-not-allowed focus:outline-none bg-white"
                              >
                                {['Aucun', 'VÃ©hicule A', 'VÃ©hicule B', 'VÃ©hicule C', 'VÃ©hicule D', 'VÃ©hicule E', 'VÃ©hicule F', 'VÃ©hicule G', 'VÃ©hicule H', 'VÃ©hicule I', 'VÃ©hicule J'].map((veh) => (
                                  <option key={veh} value={veh}>
                                    {veh === 'Aucun' ? veh : getLocationCustomName(veh)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Date */}
                            <div className="w-full">
                              <label className="block mb-1.5 fsm-label-style" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>Date pÃ©riode.</label>
                              <input
                                type="date"
                                value={tourStartDate}
                                onChange={(e) => {
                                  const nextDate = e.target.value;
                                  setFsmTourDrafts(prev => ({
                                    ...prev,
                                    [t.id]: {
                                      ...(prev[t.id] || {}),
                                      startDate: nextDate
                                    }
                                  }));
                                  if (nextDate) {
                                    const holidayCheck = isHolidayDate(nextDate, undefined, companyInfo);
                                    if (holidayCheck.isHoliday) {
                                      alert("Attention, jour fÃ©riÃ©.");
                                    }
                                  }
                                }}
                                style={{
                                  border: '1px solid #dedede',
                                  borderRadius: '13px',
                                  padding: '12px',
                                  fontSize: '16px',
                                  fontWeight: '100',
                                  color: '#000000',
                                  backgroundColor: '#ffffff',
                                  width: '100%'
                                }}
                                className="font-sans cursor-pointer focus:outline-none"
                              />
                              {(() => {
                                const holidayCheck = isHolidayDate(tourStartDate, undefined, companyInfo);
                                if (holidayCheck.isHoliday) {
                                  return (
                                    <div className="text-red-500 font-medium text-[13px] mt-1 flex items-center gap-1">
                                      <span>Attention, jour fÃ©riÃ©.</span>
                                      {holidayCheck.holidayName && (
                                        <span className="text-red-400 font-normal">({holidayCheck.holidayName})</span>
                                      )}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {/* RÃ©gion */}
                            <div className="w-full">
                              <label className="block mb-1.5 fsm-label-style" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>RÃ©gion.</label>
                              <select
                                value={tourRegion}
                                onChange={(e) => {
                                  setFsmTourDrafts(prev => ({
                                    ...prev,
                                    [t.id]: {
                                      ...(prev[t.id] || {}),
                                      region: e.target.value
                                    }
                                  }));
                                }}
                                style={{
                                  border: '1px solid #dedede',
                                  borderRadius: '13px',
                                  padding: '12px',
                                  fontSize: '16px',
                                  fontWeight: '100',
                                  color: '#000000',
                                  backgroundColor: '#ffffff',
                                  width: '100%'
                                }}
                                className="font-sans cursor-pointer focus:outline-none"
                              >
                                <option value="">SÃ©lectionnez une rÃ©gion.</option>
                                {(() => {
                                  const regionList = Array.from(new Set([
                                    ...getRegionsForCountry('France'),
                                    tourRegion
                                  ].filter(Boolean).filter(r => r.trim() !== '')));
                                  return regionList.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ));
                                })()}
                              </select>
                            </div>

                            {/* Planificateur */}
                            <div className="w-full">
                              <label className="block mb-1.5 fsm-label-style" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>Planificateur.</label>
                              <select
                                value={tourPlannerName}
                                onChange={(e) => {
                                  setFsmTourDrafts(prev => ({
                                    ...prev,
                                    [t.id]: {
                                      ...(prev[t.id] || {}),
                                      plannerName: e.target.value
                                    }
                                  }));
                                }}
                                style={{
                                  border: '1px solid #dedede',
                                  borderRadius: '13px',
                                  padding: '12px',
                                  fontSize: '16px',
                                  fontWeight: '100',
                                  color: '#000000',
                                  backgroundColor: '#ffffff',
                                  width: '100%'
                                }}
                                className="font-sans cursor-pointer focus:outline-none"
                              >
                                <option value="">SÃ©lectionnez un planificateur.</option>
                                {(() => {
                                  const nonTechMembers = members.filter(m => {
                                    const roleLower = (m.role || '').toLowerCase();
                                    return !(m.role === 'Technicien' || m.role === 'Maintenance Terrain' || roleLower.includes('tech'));
                                  }).map(m => m.name);
                                  const plannerOptions = Array.from(new Set([
                                    ...nonTechMembers,
                                    tourPlannerName
                                  ].filter(Boolean).filter(n => n.trim() !== '')));
                                  return plannerOptions.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ));
                                })()}
                              </select>
                            </div>

                            {/* Situation. */}
                            <div className="w-full">
                              <label className="block mb-1.5 fsm-label-style" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>Situation.</label>
                              <div className="relative flex items-center">
                                <div 
                                  style={{
                                    position: 'absolute',
                                    left: '11px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: 
                                      tourStatus === 'Brouillon' ? '#94a3b8' : 
                                      tourStatus === 'Ã€ faire' ? '#3b82f6' :  
                                      tourStatus === 'En cours' ? '#ef4444' :  
                                      tourStatus === 'EffectuÃ©' ? '#22c55e' :  
                                      '#94a3b8',
                                    zIndex: 10,
                                    pointerEvents: 'none'
                                  }}
                                />
                                <select
                                  value={tourStatus}
                                  onChange={(e) => {
                                    setFsmTourDrafts(prev => ({
                                      ...prev,
                                      [t.id]: {
                                        ...(prev[t.id] || {}),
                                        status: e.target.value
                                      }
                                    }));
                                  }}
                                  style={{
                                    border: '1px solid #dedede',
                                    borderRadius: '13px',
                                    paddingLeft: '34px',
                                    paddingRight: '12px',
                                    paddingTop: '12px',
                                    paddingBottom: '12px',
                                    fontSize: '16px',
                                    fontWeight: '100',
                                    backgroundColor: '#ffffff',
                                    color: '#000000',
                                    width: '100%'
                                  }}
                                  className="font-sans padding-with-dot cursor-pointer focus:outline-none"
                                >
                                  <option value="Brouillon">Brouillon</option>
                                  <option value="Ã€ faire">Ã€ faire</option>
                                  <option value="En cours">En cours</option>
                                  <option value="EffectuÃ©">EffectuÃ©</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Technician skills line */}
                          {(() => {
                            if (!tourTechName || tourTechName === 'Aucun' || tourTechName.trim() === '') {
                              return null;
                            }
                            const selectedMember = members.find(m => m.name.trim().toLowerCase() === tourTechName.trim().toLowerCase());
                            if (!selectedMember) return null;
                            const comps = selectedMember?.competences || [];
                            const compsStr = comps.length > 0 ? comps.join(', ') : 'Aucune';
                            return (
                              <div 
                                style={{
                                  color: 'rgb(143 51 151)',
                                  backgroundColor: 'rgb(253 229 255)',
                                  border: 'none',
                                  cursor: 'default'
                                }}
                                className="font-semibold text-sm px-4 py-3 rounded-xl flex items-center gap-2.5 mx-0.5"
                              >
                                <span>
                                  CompÃ©tences : {compsStr}
                                </span>
                              </div>
                            );
                          })()}

                          {/* Pause banner if tour is paused */}
                          {(() => {
                            if (!tourTechName || tourTechName === 'Aucun' || tourTechName.trim() === '') {
                              return null;
                            }
                            const isPaused = t.status !== "TerminÃ©" && (
                              t.isPaused || 
                              t.pauseEnabled || 
                              (
                                typeof window !== "undefined" && 
                                localStorage.getItem("defib_pause_enabled") === "true" && 
                                (() => {
                                  try {
                                    const activeUserRaw = localStorage.getItem("defib_active_tech_session");
                                    if (activeUserRaw) {
                                      const activeUser = JSON.parse(activeUserRaw);
                                      if (activeUser?.name && String(activeUser.name).trim().toLowerCase() === tourTechName.trim().toLowerCase()) {
                                        return true;
                                      }
                                    }
                                  } catch (_) {}
                                  return localStorage.getItem("defib_selected_tour_id") === t.id;
                                })()
                              )
                            );
                            const reason = t.pauseReason || (typeof window !== "undefined" ? localStorage.getItem("defib_pause_reason") : null) || "Nuit HÃ´tel";
                            if (!isPaused) return null;
                            return (
                              <div
                                style={{
                                  backgroundColor: "rgb(255, 232, 247)",
                                  borderRadius: "13px",
                                  color: "#fd4ebb",
                                  fontSize: "16px",
                                  cursor: "not-allowed",
                                }}
                                className="w-full font-bold p-4 text-[16px] text-center select-none my-2 font-sans"
                              >
                                Technicien en pause : {reason}.
                              </div>
                            );
                          })()}
                        </div>

                        {/* TOUR MISSIONS LIST */}
                        <div className="p-4 space-y-4">
                          {t.missions.length === 0 ? (
                            <div className="py-6 text-center font-sans bg-white rounded-xl border border-slate-205" style={{ color: '#000000', fontSize: '16px', border: 'none' }}>
                              Aucune mission.
                            </div>
                          ) : (
                            <div className="space-y-4 bg-white">
                              {t.missions.map((m: any, idx: number) => {
                                const calculatedDate = (() => {
                                  if (!tourStartDate) return '';
                                  const d = new Date(tourStartDate);
                                  if (isNaN(d.getTime())) return tourStartDate;
                                  let daysToAdd = Math.floor(idx / 6);
                                  while (daysToAdd > 0) {
                                    d.setDate(d.getDate() + 1);
                                    while (isHolidayDate(d, undefined, companyInfo).isHoliday) {
                                      d.setDate(d.getDate() + 1);
                                    }
                                    daysToAdd--;
                                  }
                                  while (isHolidayDate(d, undefined, companyInfo).isHoliday) {
                                    d.setDate(d.getDate() + 1);
                                  }
                                  return d.toISOString().split('T')[0];
                                })();
                                const estimatedDateValue = m.estimatedDate || (t.calculated ? calculatedDate : '');
                                const missionKey = `${t.id}-${m.id || idx}`;
                                const isExpanded = !!fsmExpandedMissions[missionKey];

                                return (
                                  <div key={m.id} className="rounded-xl p-4 shadow-3xs transition-shadow space-y-4 font-sans" style={{ border: '1px solid rgb(229, 229, 229)', backgroundColor: 'rgb(245, 245, 245)' }}>
                                      {/* Ligne 1: NumÃ©ro de passage & GÃ©lules & Bouton DÃ©rouler / RÃ©duire */}
                                      <div className="flex flex-wrap items-center justify-between gap-2 bg-transparent pb-0.5">
                                        <div className="flex flex-wrap items-center gap-2 bg-transparent flex-1">
                                        <div
                                          style={{
                                            backgroundColor: '#fa53d5',
                                            color: '#ffffff',
                                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                            fontWeight: 610,
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '14px',
                                            cursor: 'default'
                                          }}
                                        >
                                          {!t.calculated ? '?' : (idx + 1)}
                                        </div>
                                        <span
                                          style={{
                                            backgroundColor: 'rgb(77, 21, 83)',
                                            color: 'rgb(255, 255, 255)',
                                            borderRadius: '1000px',
                                            padding: '4px 12px',
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            border: 'none',
                                            cursor: 'default'
                                          }}
                                        >
                                          {(m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId) ? 'Formation' : (m.equipmentType || (() => {
                                            const isDefib = defibrillateurs.some((d: any) => d.identifiant === m.defibIdentifiant);
                                            if (isDefib) return 'DÃ©fibrillateur';
                                            const other = otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant);
                                            if (other) return other.categorie;
                                            return m.reason?.toLowerCase().includes('autre') ? 'Autre matÃ©riel' : 'DÃ©fibrillateur';
                                          })())}
                                        </span>

                                        {(() => {
                                          const isFormationMission = m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId;
                                          if (isFormationMission) return null;

                                          const matchedDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
                                          const other = !matchedDefib ? otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant) : null;
                                          
                                          if (!matchedDefib && !other) return null;
                                          
                                          const renderCapsule = (label: string, rawVal: string, colorClasses: string) => {
                                            if (!rawVal || rawVal.trim() === '' || rawVal.trim() === '-') return null;
                                            const formatted = formatDateToFR(rawVal);
                                            if (!formatted || formatted === '-') return null;
                                            return (
                                              <span 
                                                key={label}
                                                style={{
                                                  color: '#fff',
                                                  fontSize: '14px',
                                                  padding: '4.5px 15px',
                                                  border: 'none',
                                                  background: getCapsuleBgColor(rawVal),
                                                  cursor: 'default'
                                                }}
                                                className="inline-flex items-center rounded-full font-sans font-medium"
                                              >
                                                <span className="font-extrabold mr-1">{label}</span>
                                                {formatted}
                                              </span>
                                            );
                                          };

                                          if (matchedDefib) {
                                            const defibModel = variables.find((v: any) => v.id === matchedDefib.modeleId);
                                            const modelName = defibModel 
                                              ? (defibModel.marque && defibModel.marque !== 'Standard' ? `${defibModel.marque} ${defibModel.nom}` : defibModel.nom) 
                                              : (matchedDefib.modeleId || 'ModÃ¨le inconnu');
                                            const nextMaint = computeProchaineMaintenance(matchedDefib.derniereMaintenance);
                                            
                                            return (
                                              <div className="flex flex-wrap gap-1 md:gap-1.5 ml-1 md:ml-2 items-center">
                                                <span 
                                                  style={{
                                                    color: '#fff',
                                                    fontSize: '14px',
                                                    padding: '4.5px 15px',
                                                    border: 'none',
                                                    background: '#000000',
                                                    cursor: 'default'
                                                  }}
                                                  className="inline-flex items-center rounded-full font-sans font-medium"
                                                >
                                                  {modelName}
                                                </span>
                                                {renderCapsule('PÃ©remption A.', matchedDefib.peremptionElectrodeA, 'bg-rose-50 text-rose-700 border-rose-200')}
                                                {renderCapsule('PÃ©remption A.S.', matchedDefib.peremptionSecoursElectrodeA || '', 'bg-rose-50 text-rose-700 border-rose-200')}
                                                {renderCapsule('PÃ©remption P.', matchedDefib.peremptionElectrodeP, 'bg-purple-50 text-purple-700 border-purple-200')}
                                                {renderCapsule('PÃ©remption P.S.', matchedDefib.peremptionSecoursElectrodeP || '', 'bg-purple-50 text-purple-700 border-purple-200')}
                                                {renderCapsule('PÃ©remption B.', matchedDefib.peremptionBatterie, 'bg-amber-50 text-amber-700 border-amber-250')}
                                                {renderCapsule('Expiration G.', matchedDefib.finGarantie, 'bg-blue-50 text-blue-700 border-blue-200')}
                                                {renderCapsule('Prochaine V.', nextMaint, 'bg-emerald-50 text-emerald-700 border-emerald-250')}
                                              </div>
                                            );
                                          } else if (other) {
                                            const modelName = other.categorie || 'Autre matÃ©riel';
                                            return (
                                              <div className="flex flex-wrap gap-1 md:gap-1.5 ml-1 md:ml-2 items-center">
                                                <span 
                                                  style={{
                                                    color: '#fff',
                                                    fontSize: '14px',
                                                    padding: '4.5px 15px',
                                                    border: 'none',
                                                    background: '#000000',
                                                    cursor: 'default'
                                                  }}
                                                  className="inline-flex items-center rounded-full font-sans font-medium"
                                                >
                                                  {modelName}
                                                </span>
                                                {renderCapsule('Expiration G.', other.expirationGarantie, 'bg-blue-50 text-blue-700 border-blue-200')}
                                                {renderCapsule('Prochaine V.', other.prochaineMaintenance, 'bg-emerald-50 text-emerald-700 border-emerald-250')}
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                        </div>

                                        {/* Bouton DÃ©rouler / RÃ©duire */}
                                        <button
                                          type="button"
                                          onClick={() => toggleFsmMissionExpanded(missionKey)}
                                          style={{
                                            color: '#fff',
                                            boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(97 28 104) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                                            background: 'rgb(96 28 104)',
                                            borderRadius: '13px',
                                            marginLeft: '40px',
                                            marginRight: '10px',
                                            padding: '8px 18px',
                                            fontSize: '16px',
                                            fontWeight: 700,
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                          }}
                                          className="shrink-0 select-none"
                                        >
                                          {isExpanded ? 'RÃ©duire' : 'DÃ©rouler'}
                                        </button>
                                      </div>

                                      {/* Contenu dÃ©roulant (MontrÃ© uniquement si dÃ©roulÃ©) */}
                                      {isExpanded && (() => {
                                        const isFormationMission = m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId;
                                        return (
                                        <div className="space-y-4 pt-2">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full bg-transparent">
                                        {/* Client. (toujours disabled) */}
                                        <div className="space-y-0.5 bg-transparent">
                                          <label className="block mb-1 fsm-label-style">Client.</label>
                                          <input
                                            type="text"
                                            value={(() => {
                                              if (isFormationMission) {
                                                const fmt = formations?.find((f: any) => f.id === m.formationId || f.id === m.defibIdentifiant);
                                                const clientObj = clients?.find(c => c.id === (fmt?.clientId || m.clientId));
                                                return clientObj ? clientObj.denomination : (m.clientName || "");
                                              }
                                              const matchedDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
                                              const other = !matchedDefib ? otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant) : null;
                                              const clientObj = clients?.find(c => c.id === (matchedDefib?.clientId || other?.clientId));
                                              return clientObj ? clientObj.denomination : (m.clientName || "");
                                            })()}
                                            disabled={true}
                                            className="w-full font-sans cursor-not-allowed"
                                            placeholder="Nom du Client"
                                          />
                                        </div>

                                        {/* Site. (toujours disabled) - EXCLUDE FOR FORMATION */}
                                        {!isFormationMission && (
                                          <div className="space-y-0.5 bg-transparent">
                                            <label className="block mb-1 fsm-label-style">Site.</label>
                                            <input
                                              type="text"
                                              value={(() => {
                                                const matchedDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
                                                const other = !matchedDefib ? otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant) : null;
                                                const val = matchedDefib 
                                                  ? (matchedDefib.nomSite || "") 
                                                  : (other ? (other.nomPrenomSite || "") : "");
                                                return val === "ReprÃ©sentant Standard" || val === "ReprÃ©sentant standard" ? "" : val;
                                              })()}
                                              disabled={true}
                                              className="w-full font-sans cursor-not-allowed"
                                              placeholder="Nom du Site"
                                            />
                                          </div>
                                        )}

                                        {/* Identifiant. (toujours disabled) - EXCLUDE FOR FORMATION */}
                                        {!isFormationMission && (
                                          <div className="space-y-0.5 bg-transparent">
                                            <label className="block mb-1 fsm-label-style">Identifiant.</label>
                                            <input
                                              type="text"
                                              value={m.defibIdentifiant || ""}
                                              disabled={true}
                                              className="w-full font-mono cursor-not-allowed"
                                              placeholder="ID DÃ©fib"
                                            />
                                          </div>
                                        )}

                                        {/* Localisation. */}
                                        <div className="space-y-0.5 bg-transparent">
                                          <label className="block mb-1 fsm-label-style">Localisation.</label>
                                          <input
                                            type="text"
                                            value={(() => {
                                              if (isFormationMission) {
                                                if (m.location) return m.location;
                                                const fmt = formations?.find((f: any) => f.id === m.formationId || f.id === m.defibIdentifiant);
                                                if (fmt) {
                                                  return [fmt.adresse, fmt.codePostal, fmt.ville].filter(Boolean).join(', ');
                                                }
                                                return m.address || '';
                                              }
                                              const matchedDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
                                              const other = !matchedDefib ? otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant) : null;
                                              const ville = matchedDefib ? matchedDefib.ville : (other ? other.ville : '');
                                              const cp = matchedDefib ? (matchedDefib.codePostal || matchedDefib.cp || '') : (other ? (other.codePostal || other.cp || '') : '');
                                              return (ville && cp) ? `${ville}, ${cp}` : (ville || cp || '');
                                            })()}
                                            disabled={true}
                                            className="w-full font-sans cursor-not-allowed"
                                            placeholder="Ville, CP"
                                          />
                                        </div>

                                        {/* RÃ©fÃ©rence intervention. */}
                                        <div className="space-y-0.5 bg-transparent">
                                          <label className="block mb-1 fsm-label-style">RÃ©fÃ©rence intervention.</label>
                                          <input
                                            type="text"
                                            value={(() => {
                                              if (m.interventionReference) return m.interventionReference;
                                              const matchedReport = generatedReports.find((r: any) => 
                                                (r.missionId && r.missionId === m.id) || 
                                                (r.defibIdentifiant && r.defibIdentifiant === m.defibIdentifiant)
                                              );
                                              return matchedReport?.interventionReference || "";
                                            })()}
                                            disabled={true}
                                            className="w-full font-sans cursor-not-allowed"
                                            placeholder="Non renseignÃ©e"
                                          />
                                        </div>

                                        {/* Bon de commande. */}
                                        <div className="space-y-0.5 bg-transparent">
                                          <label className="block mb-1 fsm-label-style">Bon de commande.</label>
                                          <select
                                            value={m.bonCommandeId || ''}
                                            onChange={(e) => {
                                              const nextBcId = e.target.value;
                                              if (nextBcId === 'custom') {
                                                updateFsmMission(t.id, m.id, { bonCommandeId: 'custom' });
                                              } else if (nextBcId) {
                                                const selectedBcDoc = commercialDocs.find(doc => doc.id === nextBcId);
                                                if (selectedBcDoc) {
                                                  const nonServiceParts = selectedBcDoc.items
                                                    ? selectedBcDoc.items
                                                        .filter(item => {
                                                          const vObj = variables.find(v => v.id === item.variableId || v.nom === item.nomPiece);
                                                          return !(vObj && vObj.category === 'ModÃ¨le Service');
                                                        })
                                                        .map(item => item.nomPiece)
                                                    : [];
                                                  const uniqueParts = Array.from(new Set(nonServiceParts)) as string[];
                                                  changeFsmMissionParts(t.id, m.id, (m.requiredParts || []) as string[], uniqueParts, { bonCommandeId: nextBcId });
                                                } else {
                                                  updateFsmMission(t.id, m.id, { bonCommandeId: nextBcId });
                                                }
                                              } else {
                                                changeFsmMissionParts(t.id, m.id, (m.requiredParts || []) as string[], [], { bonCommandeId: '' });
                                              }
                                            }}
                                            className="w-full font-sans focus:outline-none cursor-pointer text-slate-800"
                                            style={{
                                              border: '1px solid #dedede',
                                              borderRadius: '13px',
                                              padding: '12px',
                                              fontSize: '16px',
                                              fontWeight: '100',
                                              color: '#000000',
                                              backgroundColor: '#ffffff'
                                            }}
                                          >
                                            <option value="">-- Aucun --</option>
                                            <option value="custom">Autre (Texte libre)</option>
                                            {(() => {
                                              const matchedClient = (() => {
                                                if (m.clientId) {
                                                  const found = clients.find(c => c.id === m.clientId);
                                                  if (found) return found;
                                                }
                                                const matchedDefib = defibrillateurs.find(df => df.identifiant === m.defibIdentifiant);
                                                if (matchedDefib) {
                                                  const found = clients.find(c => c.id === matchedDefib.clientId);
                                                  if (found) return found;
                                                }
                                                if (m.clientName) {
                                                  const mName = m.clientName.toLowerCase();
                                                  const found = clients.find(c => {
                                                    if (!c.denomination) return false;
                                                    const cDenom = c.denomination.toLowerCase();
                                                    return mName.includes(cDenom) || cDenom.includes(mName);
                                                  });
                                                  if (found) return found;
                                                }
                                                return null;
                                              })();

                                              const clientBcs = matchedClient
                                                ? commercialDocs.filter(doc => 
                                                    doc.hasBonCommande && 
                                                    (doc.clientId === matchedClient.id || 
                                                     (doc.clientDenomination && matchedClient.denomination && 
                                                      doc.clientDenomination.toLowerCase() === matchedClient.denomination.toLowerCase()))
                                                  )
                                                : [];

                                              return clientBcs.map(bcDoc => (
                                                <option key={bcDoc.id} value={bcDoc.id}>
                                                  {bcDoc.bonCommandeEntete || bcDoc.bonCommandeReference || bcDoc.ref}
                                                </option>
                                              ));
                                            })()}
                                          </select>
                                          {m.bonCommandeId === 'custom' && (
                                            <div className="mt-2 space-y-0.5 bg-transparent">
                                              <input
                                                type="text"
                                                value={m.customBonCommande || ''}
                                                onChange={(e) => updateFsmMission(t.id, m.id, { customBonCommande: e.target.value })}
                                                placeholder={translate("Saisir le bon de commande...")}
                                                className="w-full font-sans focus:outline-none"
                                                style={{
                                                  border: '1px solid #dedede',
                                                  borderRadius: '13px',
                                                  padding: '12px',
                                                  fontSize: '16px',
                                                  fontWeight: '100',
                                                  color: '#000000',
                                                  backgroundColor: '#ffffff'
                                                }}
                                              />
                                            </div>
                                          )}
                                        </div>

                                        {/* Date estimÃ©e. & CrÃ©neau estimÃ©. */}
                                        {(() => {
                                          const isMissionForced = !!(m.isForced || (m.isManualDate && m.isManualSlot));
                                          const toggleForced = () => {
                                            const nextVal = !isMissionForced;
                                            updateFsmMission(t.id, m.id, {
                                              isForced: nextVal,
                                              isManualDate: nextVal,
                                              isManualSlot: nextVal
                                            });
                                            if (nextVal && estimatedDateValue) {
                                              const holidayCheck = isHolidayDate(estimatedDateValue, undefined, companyInfo);
                                              if (holidayCheck.isHoliday) {
                                                alert("Attention, jour fÃ©riÃ©.");
                                              }
                                            }
                                          };

                                          return (
                                            <>
                                              {/* Date estimÃ©e. */}
                                              <div className="space-y-0.5 bg-transparent">
                                                <div className="flex items-center justify-between mb-1">
                                                  <label className="block fsm-label-style mb-0">Date estimÃ©e.</label>
                                                  <button
                                                    type="button"
                                                    onClick={toggleForced}
                                                    className="inline-flex items-center gap-1.5 cursor-pointer focus:outline-none select-none"
                                                    title="Forcer la date et le crÃ©neau"
                                                  >
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: isMissionForced ? '#fe4eba' : '#64748b' }}>
                                                      Forcer
                                                    </span>
                                                    <div
                                                      style={{
                                                        width: '34px',
                                                        height: '18px',
                                                        borderRadius: '9999px',
                                                        backgroundColor: isMissionForced ? '#fe4eba' : '#cbd5e1',
                                                        position: 'relative',
                                                        transition: 'background-color 0.2s ease',
                                                        padding: '2px'
                                                      }}
                                                    >
                                                      <div
                                                        style={{
                                                          width: '14px',
                                                          height: '14px',
                                                          borderRadius: '50%',
                                                          backgroundColor: '#ffffff',
                                                          position: 'absolute',
                                                          top: '2px',
                                                          left: isMissionForced ? '18px' : '2px',
                                                          transition: 'left 0.2s ease',
                                                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                        }}
                                                      />
                                                    </div>
                                                  </button>
                                                </div>
                                                <input
                                                  type="date"
                                                  value={estimatedDateValue}
                                                  onChange={(e) => {
                                                    const nextDate = e.target.value;
                                                    updateFsmMission(t.id, m.id, { estimatedDate: nextDate });
                                                    if (nextDate) {
                                                      const holidayCheck = isHolidayDate(nextDate, undefined, companyInfo);
                                                      if (holidayCheck.isHoliday) {
                                                        alert("Attention, jour fÃ©riÃ©.");
                                                      }
                                                    }
                                                  }}
                                                  className="w-full font-sans cursor-pointer focus:outline-none"
                                                  style={{
                                                    border: '1px solid #dedede',
                                                    borderRadius: '13px',
                                                    padding: '12px',
                                                    fontSize: '16px',
                                                    fontWeight: '100',
                                                    color: '#000000',
                                                    backgroundColor: '#ffffff'
                                                  }}
                                                />
                                                {(() => {
                                                  const holidayCheck = isHolidayDate(estimatedDateValue, undefined, companyInfo);
                                                  if (holidayCheck.isHoliday) {
                                                    return (
                                                      <div className="text-red-500 font-medium text-[13px] mt-1 flex items-center gap-1">
                                                        <span>Attention, jour fÃ©riÃ©.</span>
                                                        {holidayCheck.holidayName && (
                                                          <span className="text-red-400 font-normal">({holidayCheck.holidayName})</span>
                                                        )}
                                                      </div>
                                                    );
                                                  }
                                                  return null;
                                                })()}
                                              </div>

                                              {/* CrÃ©neau estimÃ©. */}
                                              <div className="space-y-0.5 bg-transparent">
                                                <div className="flex items-center justify-between mb-1">
                                                  <label className="block fsm-label-style mb-0">CrÃ©neau estimÃ©.</label>
                                                  <button
                                                    type="button"
                                                    onClick={toggleForced}
                                                    className="inline-flex items-center gap-1.5 cursor-pointer focus:outline-none select-none"
                                                    title="Forcer la date et le crÃ©neau"
                                                  >
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: isMissionForced ? '#fe4eba' : '#64748b' }}>
                                                      Forcer
                                                    </span>
                                                    <div
                                                      style={{
                                                        width: '34px',
                                                        height: '18px',
                                                        borderRadius: '9999px',
                                                        backgroundColor: isMissionForced ? '#fe4eba' : '#cbd5e1',
                                                        position: 'relative',
                                                        transition: 'background-color 0.2s ease',
                                                        padding: '2px'
                                                      }}
                                                    >
                                                      <div
                                                        style={{
                                                          width: '14px',
                                                          height: '14px',
                                                          borderRadius: '50%',
                                                          backgroundColor: '#ffffff',
                                                          position: 'absolute',
                                                          top: '2px',
                                                          left: isMissionForced ? '18px' : '2px',
                                                          transition: 'left 0.2s ease',
                                                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                        }}
                                                      />
                                                    </div>
                                                  </button>
                                                </div>
                                                <select
                                                  value={m.estimatedSlot || ''}
                                                  onChange={(e) => updateFsmMission(t.id, m.id, { estimatedSlot: e.target.value })}
                                                  className="w-full font-sans focus:outline-none cursor-pointer"
                                                  style={{
                                                    border: '1px solid #dedede',
                                                    borderRadius: '13px',
                                                    padding: '12px',
                                                    fontSize: '16px',
                                                    fontWeight: '100',
                                                    color: '#000000',
                                                    backgroundColor: '#ffffff'
                                                  }}
                                                >
                                            <option value="">-- Non dÃ©fini --</option>
                                            <option value="8:00am">8:00am</option>
                                            <option value="8:30am">8:30am</option>
                                            <option value="9:00am">9:00am</option>
                                            <option value="9:30am">9:30am</option>
                                            <option value="10:00am">10:00am</option>
                                            <option value="10:30am">10:30am</option>
                                            <option value="11:00am">11:00am</option>
                                            <option value="11:30am">11:30am</option>
                                            <option value="12:00pm">12:00pm</option>
                                            <option value="12:30pm">12:30pm</option>
                                            <option value="13:00pm">13:00pm</option>
                                            <option value="13:30pm">13:30pm</option>
                                            <option value="14:00pm">14:00pm</option>
                                            <option value="14:30pm">14:30pm</option>
                                            <option value="15:00pm">15:00pm</option>
                                            <option value="15:30pm">15:30pm</option>
                                            <option value="16:00pm">16:00pm</option>
                                            <option value="16:30pm">16:30pm</option>
                                            <option value="17:00pm">17:00pm</option>
                                            <option value="17:30pm">17:30pm</option>
                                            <option value="18:00pm">18:00pm</option>
                                            <option value="18:30pm">18:30pm</option>
                                            <option value="19:00pm">19:00pm</option>
                                          </select>
                                        </div>
                                      </>
                                    );
                                  })()}

                                        
                                      </div>

                                      {/* Raison/Prestation. (Stand-alone multi-selection with capsules on the right) */}
                                      <div className="pt-2 space-y-1.5 relative font-sans w-full bg-transparent">
                                        <label className="block mb-1 fsm-label-style" style={{ fontSize: "15px", color: "#000000", fontWeight: 600 }}>
                                          Raison/Prestation.
                                        </label>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full items-center bg-transparent">
                                          {/* Dropdown Select on the left */}
                                          <div className="md:col-span-1 w-full bg-transparent">
                                            <select
                                              value=""
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                if (val) {
                                                  const current: string[] = Array.isArray(m.reasons)
                                                    ? m.reasons
                                                    : (m.reason ? m.reason.split(", ").map((s: string) => s.trim()).filter(Boolean) : []);
                                                  if (!current.includes(val)) {
                                                    const nextReasons = [...current, val];
                                                    updateFsmMission(t.id, m.id, {
                                                      reasons: nextReasons,
                                                      reason: nextReasons.join(", ")
                                                    });
                                                  }
                                                  e.target.value = "";
                                                }
                                              }}
                                              style={{
                                                border: "1px solid #dedede",
                                                borderRadius: "13px",
                                                padding: "12px",
                                                fontSize: "16px",
                                                fontWeight: "100",
                                                color: "#000000",
                                                backgroundColor: "#ffffff"
                                              }}
                                              className="w-full font-sans focus:outline-none cursor-pointer"
                                            >
                                              <option value="">-- SÃ©lectionner une raison / prestation --</option>
                                              {variables
                                                .filter((v: any) => v.category === "ModÃ¨le Raison Prestation")
                                                .map((v: any) => {
                                                  const current: string[] = Array.isArray(m.reasons)
                                                    ? m.reasons
                                                    : (m.reason ? m.reason.split(", ").map((s: string) => s.trim()).filter(Boolean) : []);
                                                  const isSelected = current.includes(v.nom);
                                                  return (
                                                    <option key={v.id} value={v.nom} disabled={isSelected}>
                                                      {v.nom} {isSelected ? "(DÃ©jÃ  ajoutÃ©e)" : ""}
                                                    </option>
                                                  );
                                                })}
                                            </select>
                                          </div>

                                          {/* Selected Reasons Capsules listed on the right */}
                                          <div className="md:col-span-3 w-full bg-transparent">
                                            {(() => {
                                              const currentReasons: string[] = Array.isArray(m.reasons)
                                                ? m.reasons
                                                : (m.reason ? m.reason.split(", ").map((s: string) => s.trim()).filter(Boolean) : []);

                                              return (
                                                <div className="flex flex-wrap gap-1.5 min-h-[42px] items-center bg-transparent">
                                                  {currentReasons.length > 0 ? (
                                                    currentReasons.map((reasonStr: string) => (
                                                      <span
                                                        key={reasonStr}
                                                        onClick={() => {
                                                          const nextReasons = currentReasons.filter(r => r !== reasonStr);
                                                          updateFsmMission(t.id, m.id, {
                                                            reasons: nextReasons,
                                                            reason: nextReasons.join(", ")
                                                          });
                                                        }}
                                                        style={{
                                                          fontFamily: "DefibeoMain, Civilprom, sans-serif",
                                                        }}
                                                        className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-[#8e1010] hover:border-[#8e1010] hover:text-white transition-all duration-150 select-none"
                                                        title="Cliquez pour supprimer"
                                                      >
                                                        {reasonStr}
                                                      </span>
                                                    ))
                                                  ) : (
                                                    null
                                                  )}
                                                </div>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Info block displaying Commentaires of selected Bon de commande */}
                                      {(() => {
                                        const selectedBcDoc = (() => {
                                          if (!m.bonCommandeId) return null;
                                          return commercialDocs.find(doc => doc.id === m.bonCommandeId);
                                        })();

                                        if (selectedBcDoc && selectedBcDoc.commentaires && selectedBcDoc.commentaires.trim() !== '') {
                                          return (
                                            <div 
                                              style={{
                                                color: 'rgb(143 51 151)',
                                                backgroundColor: 'rgb(253 229 255)',
                                                border: 'none',
                                                cursor: 'default'
                                              }}
                                              className="font-semibold text-sm px-4 py-3 rounded-xl flex items-center gap-2.5 mt-2 w-full mx-0.5"
                                            >
                                              <span>
                                                Commentaires : {selectedBcDoc.commentaires}
                                              </span>
                                            </div>
                                          );
                                        }
                                        return null;
                                      })()}

                                  {/* Lookup field for required components with stock items selector */}
                                  {(() => {
                                    if (m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId) return null;
                                    const currentMissionDefib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);

                                    // Selected technician on tour t
                                    const tourTechName = t.techName || '';
                                    const tourTechMember = members.find((mem: any) => mem.name && mem.name.trim().toLowerCase() === tourTechName.trim().toLowerCase());
                                    const techLocation = tourTechMember?.locationLink || '';

                                    const isLocationMatchingTechOrCentral = (loc?: string) => {
                                      if (!loc || loc === 'Centrale des stocks' || loc === 'Stock Central' || loc === 'defaut' || loc === 'Central') {
                                        return true;
                                      }
                                      if (techLocation) {
                                        if (loc === techLocation || getLocationCustomName(loc) === getLocationCustomName(techLocation)) {
                                          return true;
                                        }
                                      }
                                      return false;
                                    };

                                    const getTraceabilityLocation = (trace: any, stockRecord: any) => {
                                      if (trace.emplacement) return trace.emplacement;
                                      if (trace.movementId && Array.isArray(stockRecord.mouvements)) {
                                        const mv = stockRecord.mouvements.find((mvItem: any) => mvItem.id === trace.movementId);
                                        if (mv) {
                                          if (mv.type === 'RÃ©approvisionnement fournisseur') {
                                            return 'Centrale des stocks';
                                          }
                                          if (mv.emplacement) {
                                            return mv.emplacement.includes(' : ') ? mv.emplacement.split(' : ')[1] : mv.emplacement;
                                          }
                                        }
                                      }
                                      return 'Centrale des stocks';
                                    };

                                    // Build comprehensive items list filtered by tour technician location or central stock
                                    const stockItems: { id: string; name: string; label: string; matchedStock?: any }[] = [];
                                    const addedLabels = new Set<string>();

                                    // 1. Traceable items and central items from stocks
                                    (stocks || []).forEach(s => {
                                      const vObj = variables.find(v => v.id === s.denominationPieceId);
                                      if (vObj && (vObj.category === 'ModÃ¨le Service' || vObj.category === 'ModÃ¨le Contrat' || vObj.category === 'Fournisseur')) return;
                                      const name = vObj ? vObj.nom : (s.denom || `PiÃ¨ce indÃ©finie`);

                                      if (s.traceabilityEnabled && Array.isArray(s.traceabilities) && s.traceabilities.length > 0) {
                                        s.traceabilities.forEach((trace: any) => {
                                          if (trace.situation === 'Disponible' && Number(trace.volume) === 1) {
                                            const traceLoc = getTraceabilityLocation(trace, s);
                                            if (isLocationMatchingTechOrCentral(traceLoc)) {
                                              const numLot = trace.lotOrSerial || '-';
                                              const datePer = trace.expirationDate || '-';
                                              const vol = trace.volume;
                                              const label = `${name}, ${numLot}, ${datePer}, ${vol}`;
                                              if (!addedLabels.has(label)) {
                                                stockItems.push({ id: `tr_${trace.id}`, name, label, matchedStock: s });
                                                addedLabels.add(label);
                                              }
                                            }
                                          }
                                        });
                                      } else {
                                        // Non-traceable items in central stock
                                        if (Number(s.quantite) > 0) {
                                          const ugs = s.ugs ? ` - UGS: ${s.ugs}` : '';
                                          const label = `${name} (Stock Central - QtÃ©: ${s.quantite}${ugs})`;
                                          if (!addedLabels.has(label)) {
                                            stockItems.push({ id: `st_${s.id}`, name, label, matchedStock: s });
                                            addedLabels.add(label);
                                          }
                                        }
                                      }
                                    });

                                    // 2. Non-traceable items from Distributed Stocks for the tech location or central stock
                                    (distributedStocks || []).forEach(ds => {
                                      const vObj = variables.find(v => v.id === ds.denominationPieceId);
                                      if (vObj && (vObj.category === 'ModÃ¨le Service' || vObj.category === 'ModÃ¨le Contrat' || vObj.category === 'Fournisseur')) return;
                                      if (Number(ds.volumeDisponible) <= 0) return;

                                      if (isLocationMatchingTechOrCentral(ds.locationName)) {
                                        const name = vObj ? vObj.nom : (ds.denom || `PiÃ¨ce indÃ©finie`);
                                        const matchedStock = stocks.find(s => s.id === ds.stockId || s.denominationPieceId === ds.denominationPieceId);
                                        if (!matchedStock?.traceabilityEnabled) {
                                          const ugs = matchedStock?.ugs || '';
                                          const ugsString = ugs ? ` - UGS: ${ugs}` : '';
                                          const label = `${name} (${getLocationCustomName(ds.locationName)} - Dispo: ${ds.volumeDisponible}${ugsString})`;
                                          if (!addedLabels.has(label)) {
                                            stockItems.push({ id: `ds_${ds.id}`, name, label, matchedStock });
                                            addedLabels.add(label);
                                          }
                                        }
                                      }
                                    });

                                    // 2. Items from Central Stocks
                                    (stocks || []).forEach(s => {
                                      const vObj = variables.find(v => v.id === s.denominationPieceId);
                                      if (vObj && (vObj.category === 'ModÃ¨le Service' || vObj.category === 'ModÃ¨le Contrat' || vObj.category === 'Fournisseur')) return;
                                      const name = vObj ? vObj.nom : (s.denom || `PiÃ¨ce indÃ©finie`);
                                      const ugs = s.ugs ? ` - UGS: ${s.ugs}` : '';
                                      const label = `${name} (Stock Central - QtÃ©: ${s.quantite}${ugs})`;
                                      if (!addedLabels.has(label)) {
                                        stockItems.push({ id: `st_${s.id}`, name, label, matchedStock: s });
                                        addedLabels.add(label);
                                      }
                                    });



                                    const recommendedItems = currentMissionDefib && currentMissionDefib.modeleId
                                      ? stockItems.filter(item => Array.isArray(item.matchedStock?.usageRecommandeIds) && item.matchedStock.usageRecommandeIds.includes(currentMissionDefib.modeleId))
                                      : [];
                                    const otherItems = currentMissionDefib && currentMissionDefib.modeleId
                                      ? stockItems.filter(item => !Array.isArray(item.matchedStock?.usageRecommandeIds) || !item.matchedStock.usageRecommandeIds.includes(currentMissionDefib.modeleId))
                                      : stockItems;

                                    return (
                                      <div className="pt-2 space-y-2.5 relative font-sans w-full bg-transparent">
                                        <div className="flex justify-between items-center bg-transparent">
                                          <span className="fsm-label-style bg-transparent" style={{ fontSize: '15px', color: '#000000', fontWeight: 600 }}>
                                            PiÃ¨ces requises.
                                          </span>
                                        </div>

                                        {/* SELECTED PIECES BADGES */}
                                        {m.requiredParts.length > 0 && (
                                          <div className="flex flex-col gap-2.5 bg-transparent">
                                            {m.requiredParts.map((part: string) => {
                                              const matchedStockItem = stockItems.find(si => si.label === part || si.name === part);
                                              const displayLabel = matchedStockItem ? matchedStockItem.label : part;
                                              const sentParts: string[] = Array.isArray(m.sentToClientParts) ? m.sentToClientParts : [];
                                              const isSent = sentParts.includes(part);

                                              return (
                                                <div key={part} className="flex flex-wrap items-center gap-3 bg-transparent py-0.5">
                                                  {/* Toggle ON/OFF EnvoyÃ©e au client */}
                                                  <button
                                                    type="button"
                                                    onClick={() => togglePartSentToClient(t.id, m.id, part)}
                                                    className="inline-flex items-center gap-1.5 cursor-pointer focus:outline-none select-none shrink-0"
                                                    title="EnvoyÃ©e au client"
                                                  >
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: isSent ? '#fe4eba' : '#64748b' }}>
                                                      EnvoyÃ©e au client
                                                    </span>
                                                    <div
                                                      style={{
                                                        width: '34px',
                                                        height: '18px',
                                                        borderRadius: '9999px',
                                                        backgroundColor: isSent ? '#fe4eba' : '#cbd5e1',
                                                        position: 'relative',
                                                        transition: 'background-color 0.2s ease',
                                                        padding: '2px'
                                                      }}
                                                    >
                                                      <div
                                                        style={{
                                                          width: '14px',
                                                          height: '14px',
                                                          borderRadius: '50%',
                                                          backgroundColor: '#ffffff',
                                                          position: 'absolute',
                                                          top: '2px',
                                                          left: isSent ? '18px' : '2px',
                                                          transition: 'left 0.2s ease'
                                                        }}
                                                      />
                                                    </div>
                                                  </button>

                                                  {/* GÃ©lule de la piÃ¨ce requise */}
                                                  <span
                                                    onClick={() => {
                                                      const updatedParts = m.requiredParts.filter((p: string) => p !== part);
                                                      const updatedSentParts = sentParts.filter((p: string) => p !== part);
                                                      changeFsmMissionParts(t.id, m.id, m.requiredParts, updatedParts, { sentToClientParts: updatedSentParts });
                                                    }}
                                                    style={{
                                                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                                    }}
                                                    className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-red-800 hover:border-red-800 hover:text-white transition-all duration-150 select-none max-w-full truncate"
                                                    title="Cliquez pour supprimer"
                                                  >
                                                    {displayLabel} (x1)
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}

                                        {/* NATIVE SYSTEM DROPDOWN SELECTOR */}
                                        <div className="relative bg-transparent">
                                          <select
                                            value=""
                                            onChange={(e) => {
                                              const selectedVal = e.target.value;
                                              if (selectedVal && !m.requiredParts.includes(selectedVal)) {
                                                const updatedParts = [...m.requiredParts, selectedVal];
                                                changeFsmMissionParts(t.id, m.id, m.requiredParts, updatedParts);
                                              }
                                              e.target.value = ""; // Reset
                                            }}
                                            style={{
                                              border: '1px solid #dedede',
                                              borderRadius: '13px',
                                              padding: '12px',
                                              fontSize: '15px',
                                              fontWeight: '100',
                                              color: '#000000',
                                              backgroundColor: '#ffffff',
                                              width: '100%',
                                              cursor: 'pointer',
                                              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                                            }}
                                            className="font-sans focus:outline-none justify-start cursor-pointer"
                                          >
                                            <option value="" disabled>SÃ©lection d'une piÃ¨ce du stock.</option>
                                            {recommendedItems.length > 0 ? (
                                              <>
                                                <optgroup label="PiÃ¨ces recommandÃ©es">
                                                  {recommendedItems.map(item => (
                                                    <option key={item.id} value={item.label}>
                                                      {item.label}
                                                    </option>
                                                  ))}
                                                </optgroup>
                                                <optgroup label="Autres piÃ¨ces">
                                                  {otherItems.map(item => (
                                                    <option key={item.id} value={item.label}>
                                                      {item.label}
                                                    </option>
                                                  ))}
                                                </optgroup>
                                              </>
                                            ) : (
                                              stockItems.map(item => (
                                                <option key={item.id} value={item.label}>
                                                  {item.label}
                                                </option>
                                              ))
                                            )}
                                          </select>
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Bottom row: Situation, Soumettre au client, Supprimer & Mettre Ã  trier (25% / 25% / 25% / 25%) */}
                                  <div className="pt-2 grid grid-cols-1 md:grid-cols-4 gap-3 w-full bg-transparent items-end">
                                    {/* Situation. */}
                                    <div className="space-y-0.5 font-sans relative bg-transparent">
                                      <label className="block mb-1 fsm-label-style">Situation.</label>
                                      <div className="relative flex items-center bg-transparent">
                                        <div 
                                          style={{
                                            position: "absolute",
                                            left: "14px",
                                            top: "50%",
                                            transform: "translateY(-50%)",
                                            width: "10px",
                                            height: "10px",
                                            borderRadius: "50%",
                                            backgroundColor: 
                                              (m.status || "Brouillon") === "Brouillon" ? "#94a3b8" : 
                                              (m.status || "Brouillon") === "Attente Client" ? "#f59e0b" : 
                                              (m.status || "Brouillon") === "AcceptÃ© Client" ? "#16a34a" : 
                                              (m.status || "Brouillon") === "RefusÃ© Client" ? "#dc2626" : 
                                              (m.status || "Brouillon") === "Rejet mission" ? "#dc2626" : 
                                              (m.status || "Brouillon") === "Ã€ faire" ? "#3b82f6" :  
                                              (m.status || "Brouillon") === "En cours" ? "#ef4444" :  
                                              (m.status || "Brouillon") === "EffectuÃ©" ? "#22c55e" :  
                                              (m.status || "Brouillon") === "Attente" ? "#94a3b8" :  
                                              "#3b82f6",
                                            zIndex: 10,
                                            pointerEvents: "none"
                                          }}
                                        />
                                        <select
                                          value={m.status || "Brouillon"}
                                          onChange={(e) => updateFsmMission(t.id, m.id, { status: e.target.value })}
                                          style={{
                                            paddingLeft: "34px",
                                            paddingRight: "12px",
                                            paddingTop: "12px",
                                            paddingBottom: "12px",
                                            width: "100%",
                                            border: "1px solid #dedede",
                                            borderRadius: "13px",
                                            fontSize: "16px",
                                            backgroundColor: "#ffffff"
                                          }}
                                          className="w-full font-sans focus:outline-none cursor-pointer font-semibold padding-with-dot"
                                        >
                                          <option value="Brouillon">Brouillon</option>
                                          <option value="Attente Client">Attente Client</option>
                                          <option value="AcceptÃ© Client">AcceptÃ© Client</option>
                                          <option value="RefusÃ© Client">RefusÃ© Client</option>
                                          <option value="Rejet mission">Rejet mission</option>
                                          <option value="Ã€ faire">Ã€ faire</option>
                                          <option value="Attente">Attente</option>
                                          <option value="EffectuÃ©">EffectuÃ©</option>
                                        </select>
                                      </div>
                                    </div>

                                    {/* Soumettre au client button */}
                                    {(() => {
                                      const currentSit = m.status || 'Brouillon';
                                      const canSubmitToClient = ['Brouillon', 'Attente Client', 'RefusÃ© Client'].includes(currentSit);
                                      return (
                                        <div className="bg-transparent flex flex-col justify-end">
                                          <button
                                            type="button"
                                            disabled={!canSubmitToClient}
                                            onClick={() => handleSoumettreAuClient(m, t)}
                                            style={{
                                              color: '#fff',
                                              boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(97, 28, 104) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                                              background: 'rgb(96, 28, 104)',
                                              borderRadius: '13px',
                                              border: 'none',
                                              fontSize: '18px',
                                              fontWeight: '500',
                                              padding: '12px 16px',
                                              width: '100%',
                                              display: 'flex',
                                              justifyContent: 'center',
                                              alignItems: 'center',
                                              opacity: canSubmitToClient ? 1 : 0.4,
                                              cursor: canSubmitToClient ? 'pointer' : 'not-allowed'
                                            }}
                                            className={canSubmitToClient ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
                                          >
                                            Soumettre au client (email)
                                          </button>
                                        </div>
                                      );
                                    })()}

                                    {/* Supprimer button */}
                                    <div className="bg-transparent flex flex-col justify-end">
                                      <button
                                        type="button"
                                        onClick={() => deleteFsmMission(t.id, m.id)}
                                        style={{
                                          color: '#fff',
                                          boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(97, 28, 104) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                                          background: 'rgb(96, 28, 104)',
                                          borderRadius: '13px',
                                          border: 'none',
                                          fontSize: '18px',
                                          fontWeight: '500',
                                          padding: '12px 16px',
                                          width: '100%',
                                          display: 'flex',
                                          justifyContent: 'center',
                                          alignItems: 'center'
                                        }}
                                        className="cursor-pointer"
                                      >
                                        Supprimer
                                      </button>
                                    </div>

                                    {/* Mettre Ã  trier button */}
                                    {(() => {
                                      const isTourDisabled = ['Ã  faire', 'effectuÃ©', 'effectuÃ©e'].includes((tourStatus || '').toLowerCase().trim());
                                      const isMissionDisabled = ['acceptÃ© client', 'effectuÃ©', 'effectuÃ©e'].includes((m.status || '').toLowerCase().trim());
                                      const isMettreATrierDisabled = isTourDisabled || isMissionDisabled;

                                      return (
                                        <div className="bg-transparent flex flex-col justify-end">
                                          <button
                                            type="button"
                                            disabled={isMettreATrierDisabled}
                                            onClick={() => moveFsmMissionToATrier(t.id, m.id)}
                                            style={{
                                              color: '#fff',
                                              boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(185, 28, 28) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                                              background: 'rgb(220, 38, 38)',
                                              borderRadius: '13px',
                                              border: 'none',
                                              fontSize: '18px',
                                              fontWeight: '500',
                                              padding: '12px 16px',
                                              width: '100%',
                                              display: 'flex',
                                              justifyContent: 'center',
                                              alignItems: 'center',
                                              opacity: isMettreATrierDisabled ? 0.4 : 1,
                                              cursor: isMettreATrierDisabled ? 'not-allowed' : 'pointer'
                                            }}
                                            className={isMettreATrierDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}
                                            title={
                                              isMettreATrierDisabled
                                                ? "Impossible de mettre Ã  trier si la tournÃ©e est 'Ã€ faire' / 'EffectuÃ©' ou si la mission est 'AcceptÃ© client' / 'EffectuÃ©'"
                                                : ""
                                            }
                                          >
                                            Mettre Ã  trier
                                          </button>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ); })()}
                                </div>
                              );
                            })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ======================================= */}
          {/* GMAO MODULE */}
          {/* ======================================= */}
          {activeTab === 'gmao' && (() => {
            const customButtonStyle: React.CSSProperties = {
              backgroundColor: '#000',
              color: '#fff',
              boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
              borderRadius: '12px',
              fontSize: '18px',
              padding: '9px 19px',
              fontWeight: '100',
              transition: 'all 0s ease-in-out',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              border: 'none',
            };

            const rowActionButtonStyle: React.CSSProperties = {
              backgroundColor: '#000',
              color: '#fff',
              boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
              borderRadius: '10px',
              fontSize: '18px',
              padding: '9px 19px',
              fontWeight: '100',
              transition: 'all 0s ease-in-out',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              border: 'none',
            };

            const thStyle: React.CSSProperties = {
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              fontWeight: 100,
              letterSpacing: 'normal',
              textTransform: 'none',
              color: '#000000',
              cursor: 'default',
            };

            const isGmaoController = (() => {
              if (!loggedUser || !loggedUser.email) return true;
              const m = members.find(lm => lm.email?.toLowerCase().trim() === loggedUser.email.toLowerCase().trim());
              if (!m) return true;
              
              const isSuperAdmin = m.role === 'Super-Administrateur' || 
                                   m.role === 'PropriÃ©taire / Admin' || 
                                   m.role?.toLowerCase().includes('super') || 
                                   m.role?.toLowerCase().includes('propriÃ©taire');
              
              const isControllerSubRole = m.adminSubRole === 'ContrÃ´leur' || 
                                          m.adminSubRole === 'Administrateur & ContrÃ´leur';
                                          
              return !!(isSuperAdmin || isControllerSubRole);
            })();

            const filteredReports = generatedReports.filter((rep) => {
              const isFormation = 
                rep.equipmentType === 'Formation' ||
                rep.equipmentType?.toLowerCase()?.includes('formation') ||
                rep.defibSnapshot?.categorie === 'Formation' ||
                rep.defibSnapshot?.categorie?.toLowerCase()?.includes('formation') ||
                !!rep.formationId ||
                rep.defibIdentifiant === 'Formation';
              if (isFormation) return false;

              const isEffectue = 
                rep.missionStatus === 'EffectuÃ©' ||
                rep.conforme === 'Conforme' ||
                rep.conforme === 'Non Conforme' ||
                rep.conforme === 'Intervention impossible';

              const isUpcoming = !isEffectue && (rep.isUpcoming || rep.status === 'Ã€ venir' || rep.status === 'upcoming' || rep.upcoming || rep.isFuture);

              if (gmaoFilter === 'upcoming') {
                if (!isUpcoming) return false;
              } else if (gmaoFilter === 'validated') {
                if (!rep.validated) return false;
              } else if (gmaoFilter === 'moderation') {
                if (rep.validated || isUpcoming) return false;
              }

              const query = gmaoSearchQuery.toLowerCase().trim();
              if (!query) return true;
              
              const titleMatch = (rep.title || '').toLowerCase().includes(query);
              const identifiantMatch = (rep.defibIdentifiant || '').toLowerCase().includes(query);
              const serieMatch = (rep.defibSnapshot?.numeroSerie || '').toLowerCase().includes(query);
              const techMatch = (rep.techName || '').toLowerCase().includes(query);
              
              return titleMatch || identifiantMatch || serieMatch || techMatch;
            });

            return (
              <div className="space-y-6 animate-fadeIn" id="gmao-tab-container">
                <style>{`
                  #gmao-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-gmao-input),
                  #gmao-tab-container select,
                  #gmao-tab-container textarea {
                    padding: 12px !important;
                    border: 1px solid #dedede !important;
                    border-radius: 13px !important;
                    font-size: 16px !important;
                    font-weight: 100 !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                    box-sizing: border-box !important;
                    outline: none !important;
                    transition: all 0s !important;
                  }
                  #gmao-tab-container input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-gmao-input),
                  #gmao-tab-container input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-gmao-input),
                  #gmao-tab-container select:hover:not(:disabled),
                  #gmao-tab-container select:focus:not(:disabled),
                  #gmao-tab-container textarea:hover:not(:disabled),
                  #gmao-tab-container textarea:focus:not(:disabled),
                  #gmao-tab-container #search-gmao-input:hover,
                  #gmao-tab-container #search-gmao-input:focus {
                    outline: 2.5px solid #fa53d5 !important;
                    outline-offset: 2px !important;
                    transition: all 0s !important;
                  }
                  #gmao-tab-container select {
                    appearance: none !important;
                    -webkit-appearance: none !important;
                    -moz-appearance: none !important;
                    background-image: none !important;
                  }
                  #gmao-tab-container select option {
                    color: #000000 !important;
                    background: #ffffff !important;
                    font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                  }
                  #gmao-tab-container input[type="date"]::-webkit-calendar-picker-indicator {
                    display: none !important;
                    -webkit-appearance: none !important;
                    background: none !important;
                    width: 0 !important;
                    height: 0 !important;
                  }
                  #gmao-tab-container label,
                  #gmao-tab-container .gmao-label-style {
                    letter-spacing: normal !important;
                    textxœì½ËrÉ² ¸ï¯¡tà)I‘¥b‹’Q"UÅ¾RI‡dé´™Ž®”@€<Jd¢òÁ‡xiv¬w½³±»¹³™;»£±^öböü“úéOh÷xdF¾#’ ¤z¤ª$ Owô£ÀòÂ‰Ìwˆç{”Üqæ?ˆ,/úÏÿ‰”<ß‹ú¡óîõíÅycù±ïúÁùjÈ½æÏ¨3E;d[·ÂÄš;îÅéìÓ‰3¢þsËñ:«¤óÄ9uÜEàÏáKóì‡4p&m^•¼ûj:·ü~dúcèZ§	©KÇÑ`aÙ¶ãMûgN4ëÛ~D.KÇ)‹¹t3Ûø¶tºÃp¼EíØNh\j¯>©V1è‘5~?üØ³ûr'ë“­ÉwÚË¾ÅžæâqbyÏú–ëúg0¤¦:þÂ;¬úppÃ˜ï®¬…Ñ…Kþ§Âo—k"?- ¦½qäøyìúã÷äkrL­`<#sÎ8$Z+¶ûÀvNIÉÆ®†?ZsºÛ²Ìœˆ’f@ûý{’
lp»——dä6Øt×gBßulò•máŸîªøñÄ_Àï¸“WG–íÄ!¼B-üý¾øŠÌ­ó¿8v4ƒŸ¿»ÿOìE0u<øjÅ‘ß¶Â‹!«‘bÂ¾²Ý¯&ìé’«"–Ì‡FÂÄ¥çÿBÔ"s{‡}ü3üÐ™‡ý1õ"Xøþ·8ŒœÉED£3J=2µý{¼öY`-:eò.Ëßfêh"zõ7Î]NOF¾k Œã÷¸e#¤Fü‡©?ž9tmÆœ¼ $&wm:±b7BøÇÞí$›0r"—v~ÿ|ïÅƒµÙFÅÐ×ØØ+§UI„ÉÀµYŽèO
“èxF·)é	$gte¥ÇË‡P×ŠœSJÎú“ØuI8ß9ëoß«ìZ`}TþLHt±kS¶CäƒÐÙ ûÈ¬Õº
§–Ãòaa>Ù?Ç4¸¨š'>¾÷dfyS¨Ô£+d÷!ÐÏèûlõD°‹h4`Í¯Ô5·paãÏ Éh°Û9’ ÔY´€/CÙ´ô^m¯ÿú«oïáŸ7êÛ†½.Cd?Ž\8úH.êz”H^S„”'ŠºeGQ¾bB¥Ö7‘ÌÔÖHiÒwHÉ¾k¬€s>fœJ—Ó½ÆÒŒGw÷rmñÂÎ¯Ÿm%ùlÔSÉÜtî(M7ánº*wÓ©oQ¬~r\ÔfÌ¡ƒG €sÃ°¶FÉQ ŸµJB\Cé8…Úì#IƒÃw:G¢f“:u) ' Ýë¿“Sê9A—¬‘îsß¾þX8`öý•yý1ì6‘±ÊaçÉl†¸.úë$=ÌGÅwUu{ÉÉQÅe/z~«m5ì…:†£®Z¯D˜šCcG‘ï5ž¼X¢î:ã÷@ÓU’þÔqam{Ýx1öç@oºµ”\‹Hš"sÊ˜,˜Æ–Nø“…ï ›®i"²»»KR0‘G¸àôY]í3Ú±°Ø*z¤´¡eÁmj“ÜíjLåR‰Àå»Å90ž‹‹þú`KáïÖ#@íÔÂ™eûgýpÎ&×­ä»êQVo ¢Q¯#éd§¬ñMóù7ßÜ„ætüíW·ý@-}Úþ-mÁÜä>Í&Tø“_Ç><EÊžëmX»S8-}æ›þ-mÂìÜ>Í”2ÁM6`³Ìò£ºÃúþœðÖ*…ÑœöUÝ?øº‹ÇñhÂQ™
ÒÏè?Ó‹ÝÎÊ½µpî„!µßâ²¼õˆ#a©ìâÌ­)=ÆP3ŠáÎÚÚXŠ!ƒps@c{‚hÈ`Í­¾g…àpÖNŽŽöáé´Œ±F÷Üh·ó}ìØ”YÔà†äåþÓbùRð,*”gaøÞôá6;ö½1<Ë‹ˆûËßÿO“|tf•À¬,yéÇÏ¬ŸcJ>”U€ÄœVðãÓ€’Ø#§¾K¡E+B‚îÂ×8$Ìi„:hÂ;c†ë.~™£ðj9PÛŽIDÇ3Ï;Ô[Å¢áõGa`¨›‡Öý˜,Ü8t(Ð)bÃp¨Ÿ³’ÎÔ³\ŠmÊº	cX
hæfýÆÊPûcÎ£X~=²–	õÆ~@äÀê;®>k‰N&0ž˜·Å^ìrá‡Q_@‡ØÐøXü`ÓEì„8S×ŸâÄ ¹ÀñÆÎÂräÓ:uè‡>ƒÓ#x¡LK™=ìKv­ÉÄTÅ)zö*lœ©sè9Ã~"¼¸°âU¼a}\æ»Ñ÷&Î4®?ŠÒ§~`8µë}Þ1Aì t×•âÕ°í‰ÎÔß’*U—E6`gœ‰ƒÊrË‹©+0Ä0;Þî1ž#$p…À tµj¦¸X²ŠŸ>Œ&GÖ8Û…"p@ŸÂ+@˜‰ã9¨Š@ ¶?ŽÙgØ÷ú#€°8ûÀœÁêú#+{ýˆTPzê„.ƒß*S‚¨‰€*ð¤†¢œÜiËe‹Höiàv;çú#@)0C®l=ußŸcQN² ÁVá(„s¾Í‰YÄ*1e°&R`]%
×Œ4Làê|‘žòü˜^°_äPYå0Ar‹œ“¶XIgBr8}A{SÜpJï@Èºâ­ì(d”u“ÁŠ"êÙ@êq‚ßæÒa˜è·Œî4F"ˆ½Àjñ-ù5yG2nU¥¯dÂP)Ä&n·ñi™­öšÇü±{ý?#¤ƒ¡öª=XKyˆ2£ùv/æ«Líþ¹+¸r’½íçém|Î(UË¯ú,Ø…ˆö'–M=…©Åëb~‚7ëu©¥¸È‡'–ÁtÔÛX¿¿Jä_+Ìr*¤jÎJN|äŸ3Ö¶žÏ_ÊVµ¨Å%x[Kä‡Òº—³‹r…´ªþf†üðµ˜)^øS›/ëz¹Ù¤ïV…ÂmvÓ\SP^ÏÜ+Ëod«
.jK–
Dåtí'ÏzËv×sØ £oQpý?c\eÏa‡ÙdŽƒ¾ú+¿3¶˜]œPê±dàTyHL$m	V@Ì~ŽbIyƒ“Ò‘"y€¢£-&„»F»Ð¬WÈiª$ÂFh]qJO¬Q¯„ÚB³
vWÊÍ=XgNáëÕ7MïÐtÉnªÁ”Fœ/z|qh÷ºÐ\hŒ7(ŒùìãŠÑ f  ³LHº+5=èuŽßu½ÈåÐ³Þ%ÑœlÝÂ¹ïG34©@£|Yš	Ôt[%©^­’Íá°¢b…(_º¥ù':w˜o±uÙ	Ç iô¿ÛÊS[N3ûC±…úB‡BÂpüïá½ã±æâ…™¤íâ+#Ûâ3»Dã1žÏl:jéI@Jî ”$cÍ»*]í•‰Þ*½ÑFÛnisS"$äTÆq0
–îû*ýF•jáÒüdAàäë¯I¯¬ÙœEˆ´oÚ óÎðù¨_e’¯É0# M shÊ­X‰p®ý•F.êÐ0P»§V€HëÆÀtõ:{päNÈÙRD}à aí¬ýWRQëÞp½öw`À`Ø:++U@.×¢¿‰Ñ°­¡d¹Ä6Å— EÉ“¹S³ó$P¾¿+‹e÷ÏÐªÎtgQ $ÜhJ6ùÝpØyø¿þïÿóÿ!\»ÃY}&—s}-ùtþ~?ñßÃù·ÏƒÜ}…üÀú.R {Qß¦c`]Â¾ÀŠ`·rVë|d¯××çoÒQ~‹£¬¡å\çáHÓH'4œª,2è$U„ÄZ2•ˆ„ÀòƒH®[v7
Úí¼¹–÷¾ƒ»Ûñ|(‚ºÏ‡Öh [¶£Î—*@"ªèVg>H·;Y ƒÄúL¥Á¶/{°f=<Xƒá7ÌîXQ=}š8œà|]DËZmqHqJ
/BØ+Å–ÎÃ— z
'æ´ºzâƒ´öi}Ï©ïeâ 9 ¯…|ÀY 'M*:ö™­ ÷›Ô^Ñ¬‹Œ!Ç¡ú®ŽãÑÜ‰ÒÁÁ~ >Ž)¿,8.¦T«¿#¡D)×¢¡KÁ%®&µý=b²¥Âtê1	xa53VL"ÜáZSx£‚Î¯ÿƒüÛBE£BûÇdá© áÀéª(ÛZêM¸§”üòýûÿÿÿýM‹õ`Íw4þe?•Þ#T”‡²Å£uíO­{È	ÓNÑ1îÏ(`f¥‰q™=1ˆ‰ëŸõgŽm°àÔÝNè>7L*ZWZ³—9É8ÛÞd ç}”L+Hìå„]Qûˆ2ýÅÀ…‹fìjhHUŸ~óEtÁ õ25qÌž‡ëÛîR^§;8äîuª,ÒVÈNuÏLé\e‹‰\ˆÒ“8Át­EHå©ÛÉX»Å5áÆÜ©íU™RB}ì7o*]±hrJ3 hµÛ1
rØ¦ÜiÖžž¬õÌºˆKÃÍÁ9ë¯Õ5JàÍŽñÃÕÃkÑ¬móÅÖ~ðß¶"NC—ÙðÔÈOq)çQm¾Ü.ŽY«KnôHHcð¬Knù$Õ©/·á£ë“9Dt9ÅÁûËîàEàLëZr«@¥< ôõÇµ~¯výqÙâD±ucx¾˜ÉW°=7Šýp˜°©ø=¨;ghÎƒhäÛyoa(²ì	)­½ëÏŸ.skÑëtÑ :Â‡«œP\Q²K°æÀF[ÜcÈùÌ!KÈy®û"vº+Ü¬?V+sÔ>`µå	Áî«|YQò®„êÂ 4šH†ÌjËùµªü#»¥¼Aê>&è¾³ƒ@§»Ÿ„%À®Ú¾V¦wG3
Õ8¥:Á7¡ÕÔ¨¼äÇLãøcœkÉ	ŸÆQÐ•ž:‘WÒ
¦d&Š…´~ç¶Ÿ¼ÓkþybéVÒ¾j'`• `uGÝJÃº¬­‘ÇÜÎ¡Œ¹5FN[Š|ÄA:Ÿ=Üijé—¿ÿÞ±½:øñð2¡ÕêxÌ]qe5½ïíFx)o…ÕwÙ»Îô<±ýßöN_üØ0ˆô]2†ôUnò¼Ú{vc8^*´ Ñç{ ¡l0P-ŸàÍ°¶4ÐÃB9V¥¥ìT÷¢z»nÄìo¹—ôõàÐ,íI‹‚Miô8òØÁŠç‹Ê¦v€»÷]jyì¤êÕU„ƒÀ?ã'3ß€¬Íz«@Å}6íd®á`spm½©¶¼=ËTî*î»Ì†OÏº²DmŸmö«ñÈÞ¢ëF‰^?×Ðö½oïÝñ†´°2··ùÉ¢@¼CÊ€?Hj57¯oµZwE„OA9B¿ez
,à?H,ÄîŠ 2OAp/ôö‰¨ŒœcŒvˆå]hpUüú,(pQ¼=‡Ö_«ñ' p²z$×HÚF=€ªoÒ²#d.ºxþ‰€Û¼·2ˆ|æþÄ
)|cwá_œhÖëí½|ùâè„œ<ùáÇÃ?ÿt@ú•øÍ3âp¬3€e®»0…ðÑ›ö6ª.ùÊ`c8íE½anÈäökè:cÚ[ÇŸÁ^?Þt¢ûÎ>Z¡ŒÇuÙw§¾Ý«Z)Z­ÒÈÈ•ïéÅî%cÀì+Ux`:B}>šö_…Ìàäþ›ü½fö:³A³jîApåû~D[ÌŽHP<Ç‹Ž§®5%¯ü/ì«=ÕÙØ9mE´­†ÓT“¤ºvõ¢bÔ«‰”±åt}º—½hÇ³¡TX&lIûPÜ‡Êw©&|H†uwd­Çm2ÐÂ`¹”9gTq•LíóâÅhZ E#Õ‡ÓÅF	h¶=¦®?ÐóG‚X0TŽÍ´"}47XöA`U |w²Á;ŒõBÀ4ï„ìSm@ÿ¤uB3LÙ“ì©3aœ%"bÌ¤¯8û^ï8Qö0J/ âùs³êúØÉŸë•¶5
˜EíFæ@Ôt*$‹ôn3Ñrß½T6ÅÕ»&&«´Õ‚©ˆ¾«Nù£„Rê>ÊÀ½{[6V6Œ/{!³ÝèÿTöce¥›~Õó  Vç‡Vþ”mäx!^wK+C•Ju®ÿ”¨W0OlÑ†Y¤ˆêq$ç¹rfŒ0EBî˜¢ÐâY?5÷±åÿ,Ÿ«Z_Ç–£Ðl“m§&]°|T<q2£BrÖßl‘û[Þÿò˜<ÒDïî¥¢Ýaøb:§å¢Ñ	ÈhPä‡”}¿zw¥;(q®ešïÈÏh¸ƒŠc©	îèE‹,i®ÆƒµÈ®ôÝKdî÷†“5’^¶äÞïqî½‰cÏB-™Uèu´¾E6Ÿsµ0ùê´ì®ô÷ÓúP3ê£&F}l'\¸ŽXa‡«mßó…®u‡È<Cœ_Ö¯ò·`Õ>JÌ0³…ÍõU"ÿÒgšò·°®cImpïaT©“i´ê”>mpM«é+Mr­Z²ä7çÅæà:×aº4Eûœ‘ÝÈêË§îÜªâ÷C~.K®°½N}ÿ˜" ¤ž%£YU
HMCµeVhÚäÎœàÝ˜äÝèµ!{Ë&|7%}7"~Ë ·H õIàr‰ ¾¼TÜê^Ó”tå4jô@ X3Ç¨bAö{¤¢êôUÚ©ÖýA2•ç’ùÉ,{ÌI¦²Å¾tJ‰„25ˆýÑIŒ»Àì}”ß[ÑÅ¼÷	G1áØ%&ùæs]‹¦ükÀË¢=õï?eêGèˆG½q‚¬¥?þq¢«Ï'ú'zÙcD1K÷Ù¯|Jo‘ßÑlŒ¼¡>ªi³º÷ÀÐúãÝ]~XúqÀ.YÐz¥{EÒ·Œkàoß­¢«w…‡&|w ÓiÚÒýåïÿ¦i£˜Ð%VFè‹ÈÌæs< òÆ­éºƒÁ€Ù€Zg:\­ô4tXæYô6–?è>·¢ñL„ØbZ€™Hô°#iv™WGÄœ„s¬"!?+m:£üÁä=¾Á"æm=IÚÓoDll@:Amôtw¼¸Ñ–6}ø8&xD2Í&Žg÷zóÔHØàÒ¾§x=Ú³9Z¡çJæ—•f÷£B³•¬ßÜü'9 Ò_Û®L¿4×}+G“ÿ¡ÞßC}Œ%RãÂ›`ÉlD4jÄL¬“m(ðÍ¤î( Ö{s]^KïfNC·J8©ÁÛ÷WÆ°êj_X+tý(­¥M˜Rçý…L¨.ç£#­Ï–G;bcáe²„¸%}É{[©¯²
Ò63ºK™B¦b¸ÇP 0\ù2[g[#Zà †ßíhÛÜ^ê†´„Õ)ç†NÇ1t¯l˜ï”&?¶†gcäµãÈš/’õpæeƒÉ•ÔíQs[Èƒ£‘"2`_û\FÓ>Žà\æL0Ê7#ÓkÞË]°öe³|2fœh¦¥cl)lÝ;¨Å 9¸Œ·jžãÕlšÑš—°(¯)µæÁŸF½ê’®–«Œ|8Tè}‹Ö 	œ¨·ö×ð›5ƒãKÎ›5özøF¿f”©¹þ&Y•cÝ6-(…ÈÉÒ ‚M}JxôT€ žgÄ¦-í±RÊtè|öæ7\<“ÝÅ	–<ûvùPMv>«  G¿z„tÊÎ%rôMG‚¨z6Íø>Ù –ÚÊ=³VH¢ïî^²f7Þ`BÞcä'z«p6wW®ÖÄoë5¿ß\½3á!•½+û½é[NgÃt:Ëç†S å‘wmYÈ»öòÞy÷(ÚŠ„#Ë‰,Ïp¨ÏõsÔa9æ3Å\†úì[o­÷Wûr}uãjåõÎì‡7ø>›0>8 Ö–òæÁ XÀZ)]êù£ÙZ+¤cí_Ä<ï®"Éo<fËâ€‡CóqÞd(‘	#`L|õGVÄn™Ö`'1)&KIÐ4KZje½~DXéLÛxÁ™ª.Z6y©çú-P{B˜_•ÂµÖn]ú•A*ì‹‚òG0ND2jfáàQ’”˜2H÷qàÇŽëb¥5"—&5æÝÙ~$=¼uU4WõªýcŒ“ïîY›£û0Óvö0i	lÀ'.&µéæ¶¾£ÃQ›ÆÆcºÀ,jkëÛÖæ=«EkGt‡¹ÆìñÆöÆv«Æþ†9|UoØÐ©	&ÙâÍ Ü7&mš9@¸8y3trž6Í¤Ñà°ñÖm	9|J'hF"4hYæÆ2K0—¹±ÁL;“™åÍÜÜlæ††3Ë1¹Uãó™eÐ˜ø]sŸáBœŠûÙ0÷EDçÌªoÿ	_æWBF«ÅÃŒñÜ5	ÀFøðèË•™³·‰ƒõgá¦D@Ô›±RjØÕ"W•æÓ¡Œ‰¡ƒ0ò/añTi0¥›î1‰yÓœ{X}tó«-¢¬¡y&ü ®ü“KAt'Åðë¯1™ÐsË³¦@Àx€ØC››ØÚÞÿbÇ)qüz¹Ž´›R<ùóc…#X¦R¢ëÉè}ýÍ-v0gCWuõºÕÝ„<ð¤n4f®Î”þ¤˜”@Ù™
±,9>ØN´ltÊwÕ£
þüH%‡ô+G«L<ÞÒˆ¢-ÑÌTK/ØD°kŒô+²rdâ_Øt ÚP9ˆ—,ˆè*If²C¢ ¦ä
M”Š¡uJEw½ì€š‚«ÏÚù‰UìÀy.áØ¿;¤÷
ëÑÝájªÌØý)r\DDŒŠ›¤>Þ¹‘¨FYú&Pª!µO8m„ékÆ”…¦"·Îþø6Ý;¢ó&­hŒÏªÑÖ1eBã›|¹Ì¶–6¼Ç¨¯zó–þÙ‰r£ÒnéÍ€”ïáæyHFõáï;L`Ž£€vM5¡*vµ2Å'³ýÙyæ„¨»âû…í{ünzP“EOf–7eá'–Ø„Ê&l:XÖÅ?Gh£34k!3;«ÙÑ g-|±F°ë#‡2µÜë7+l²Q`>Ù’I.,#$˜†wüQÁ‡ÕlîrTÐ(é×Ï FÙ÷X°ü6Ã"™Eùæóa™KtAmgS´‰švÊÎ‰2lS99pBòpé+ä(Ù.;˜vªM…™É|ƒ.É7ÂL™q<æ›cwõ0ù\™®®éÚŠ•Œlpy0k£
ìö]n(s´o€€~mÖûçØ‚Å ýž[ÑÓ9Ú?!å’¿àÂ±ïgvãŠyOYJ¸“¥–¦‹o¸ˆF¥Å„7žÍAÏ³r üìŽD“€m¸ÕhFY–wBŽÅœ'“,–ˆÙòlá/Áb³\öPØÅÜXqÌn6ÙÓÐ³D1ö—‘D­b V+ž#FVˆB)ÅëÀdÑDZôTHÛKý²'ïÈ‡ÌÜÀÄhGDÕåá ôç´gOq°'R>bÄ\­“Ìxð'öÝ3¹‘=ëß”xe˜ ÁÜå'€ŒÆÇ`Î-(èÍÎ~Ä‡6Ç­MÏs/"êYp¾îpä*ù§ìÑ3ñ‘ú?<~qÌ­VWCÚ×Ã7_ìlOÌ`“òHZú&¤Õ¨¶4<“[÷I¼÷ñßIbÅÖõóý<ûKØ·rç²îÍ±¿lïæg€{×o³uùØ´§ÝjÊC6Î'”|ãMc¸¨Ÿ_dW¢5b›ÍÔ€»`üÅIàL1qÓc¶wˆÌ6²@žïþxrðãÞOÈÞOäÉ³ÃƒO%–ULè4¹…ëÉ_¢à¢åö`V‚@kyçÌ?„„÷è8õKdg”œ—;´_:æ$“•ŒcÊŽÅÑ*×#þcåXËtÜù#Å×_«ƒ>Bm6nÄq†5³}d-Ø„"sšå{àOqd­kMþŽû´éAõ•ËêÏü±åRq®w'AÿéQ·ÕÐ¯0òÐ›øOF*à‰o¨OŽcÀ„–±âÓvdëê,Èg3"g=Ê¶O? Aà½Îþ#ñMØY!vÌ¾~ÿ|ï…"¦ìtVIc*ÃâcFù¯/éÁ·Û²…¢¸…ó)H\5óÄÞo“îë—4“?]ß²ÓÛ›Ì•îØû(gîþbäŸ#Ñ±Æ˜sAÿb‡F¢2ƒmƒ›Û¼þëé\òbLÃð³»›-|Ï
/¼11½.Ã§ýIu™Ü«ñ‹­—ûOW»CøŸø¾Wp˜Xg–±¬¦ˆƒµ8rÜpMÌÙÄoEí}aO_DT½ÞK†Á)·kV•¼1°•.…f©Ò«H·¸ýn7¢‰ãR‘_î8¼Þª§×Û»—l|Woï^ªÔžëIñ[÷j Ð2ò0Á‡/[nA{ET]M†¸š¬Š)å4ÏNv–`snHþ$ŠÏ'ƒfªxó!KóÒÞ×
¯w˜×äó³ðv“¾Äîònk…o_BÆ$B«äÃoOúJ„DA·pÐ3®ø(&2˜Ã2a¶LV|Þìtî×;,uVm)z¾pjk”t<Ü·Ã”·¢ŠFµŸ<+Žf~à|À^Zñ{ê:@'4…4IÂF}F	,Œîú!¡¸õù€)ñcÂ¦yý‘ôp=XYø‡"Ã»ô0iƒv¹“‘ã¹GfÐ%ìyEÑ–uzýÑã9kcx~|Šrc°a¿’S?
¨Äâ¤›}zJ]Astàz†¥áPíÚ1;roú6ÃXõR>æŸšµÛ!{qˆrÆñÂx2o@HóÓ¶šE ^Â²t‘D…˜t­¹gr¥Zš;a²€
ØbIL¥óÇ!at›ìÙŠ~8#%]‚ˆ²0g)Aµ»VÏ"×Ñç‚íiø×:¥c º|«Ý!Ïºð³Åö«QíÁ®’z€9äú?Èß0€SÇæz½O9ç`0í3öŸ5¤J²õNýì(‚®4Kjçß*5Ì¥·ng˜Ï‘ýù/Õ´Ü0œW|ÍYÇb´š=~¹–‚¥YÃÛÛ –¥ ‡£jfy¶K÷ý3¹/.h§XÁ§íJ:k‡ze£þüèwrýÑ½þ(Æµt43J\ÓX&¨/SK±êÛAÓ#ß¾¨j~ÆÕ*ÿ¹´ÙŠi‹×…÷Ü5Õ¦ý‘…¿ˆ,Äá\ØèKafîÛ(öâ™SCòµ4«)÷Á¨óü”ºgÕ Ìp–é ³–³óœë@)Ø™j=[2ñfæQ#K*ÕúÌÕyÈ©ÑÑs¦b©ZÉ‡þëïàyC˜§‡ÌŠ‹¶£iäZã÷k÷†Ìù\xýó$Qÿ¬?!î°’Þ%^G‘¿@C+8X'ûp¿£!úÁV™³‰7Òúpx:ë®&ÎJøý¬&‹nŽ –yo0TyýJ¬®õ8,KRzÆó(Î­óþYÿÜE2—\ü«?ö]‚¹Æ'@Èú3ÇÁ6fˆgÙ3 ™±†ª¯ŸÊÊO±>žY¶Àï£ÿÞlà?Átdõ†«ìÏ`ý~½O!÷&{Æ–\ñLüŠnÐû“ºL§•ë\MÝX>ÆÀ:1ç1*À˜c”`1×ºðE\ã#"¸®u.Y…|¸pëé²]ôA ÷É¢¿M¸3Ö|J×½ùPÓTë1…~êP×ÞQMÒ‰"T’b@zÉ9ˆ^`V@-Îü3$y!·Y&ëë™Ø	èVÔûœå§(çÑäæõÀµFÔUkòœ¢<ÍÂúýÅùRž~áM£Y5ê‡´ÆÆÔ0n	¿†1HŽ¬¡XàŸ…»—›MŒH'1ì´,•Ï'Y§Ó>ä‹Çï3uÊuYÕï”§ES®Ö6®–²BbÇŠ€!QÚ“,±îÑœ¿_Ç÷4t> Ú€8åõgp’ùúãpvó dškX¸ïÒ…×:’Vñé“ì3²·ƒbZ
v¹sK¤„v”gžÑèŒR¯q[4l¹í›l9’I#©±ÑôÅ&3©…T% #·Ce~ubzÝS+p.„:w3B|M,\¾}:öi^Ž¨†÷IC
ø6Úß†-;ÃSl'}wÞeÅ'ÜâJ²{I†@9†DK:âù}$nxÑƒúªiu›±ôGT/º.%r!ˆÍñ¶eu$±f*"$æ(Džùþ{@P	RsRœÜÁHë¬è4Á
ö³qOX¿æÀ%hÿré BI6°›±™É)¬²Ošë(ß_Yh•—ì..âÀO¥¸ÄG†·1§h˜À’¿
O…8uñÀ«*°ðÃ¨¯*»:6	Itr¤ž®UÅîŒ§LÄÌ‹{™çÜéH‡Öðè½J£Üj±7I›\9^aS=xþ<û¼Ð¾gàóñèvSÑÕÑ:À¶*#Ñ5fñPÐSª[qìÇ.ƒè¹R?}i`£iokì6«9‘
AÖÑVbÐy/TÄX•kõ†{ßjõª©§®uÏm®Þ|>5•h<âÊ˜ÙÁÖÙY)µ˜Vþ
­ØÁ‡_
MeÎzâÝÈ8ù&ÑÉ“àa¿Y¨…sªÇoJm•…í÷¬ñJMm_&¸q™¤'« ÒË£ÈÍ=ãnbÝêØJp½§»—x˜\Iy‹}ÑL8~Šdè
ÿUÈÉ#ò®w7óêjå*šµTËºk;³AOþ`³Ú¼	ÈUüT²BòÒqÝ¬a€7ÆKû&>¥ §Êƒ‰”ÿ¤ø%kä¼+•˜r……Abaf`;/¢þº†äR5\†E=Ôÿ²ãs«sLï5¡…¾¦ìÀéÿÆ·ËTÉ
*<2ˆÍ/Rðœ'Ñûf»0Ë=†€°B	rBÅï=øu…ERNÖ¿Ý°´Z…Qc¡–4*¶¯ØÜ9«`ü´Ñ*$Õ«e°V$½ê½•ëYm‡ùàÃà®koëôÇÇÈÀBÿÌÇgY¡9ôšÐ¾º®2•Ñ‘ÈèWÉYÍŽû*-cN€eÒ«ƒ$¸Ï"‹†„“Q~¬sùôœü¯¿º¿µ>\NA¼cí3~@÷WC—ž}
ÑÔf‚}ýj²>Ùš|g`.¢¦JêÒ"Ç&S-èÖÓ^àÈ‰ & ?Ç¸–hcÆ‹PÍ&I>Ú¦Œ>á	®y1«^NGÍÓxÉ­q·«“yÒDÉù8{ÐNÇ¹®wß¦bR™Ä§Sþö±qå«uóì¬A‚5ºf—0Nù²¸öÅ´„ÛG5­hTß)ÜG2‘Œ³6åÏ“«v±T¹Sz5ïƒÌ›F! iKÝDýÕBùuŒ€ ,Ý»ÞÑ¯A¶npÔ7ž ,fÒÌw5v;ÀàrãPe2ƒ&ú{V[Ãµ­â•ÕúFÕ•ŽøŸÞõÞöÖ‰?º€û×ÃÄ ·Ë]–R›DC‚ßx9¥u° ³·r
d&ûËßÿ=?Ý&á¹ñ°×»«2¹©2}2$æ’% 0yB\´þ‚iWq°;Ùùý*hY™}*¯ÌúÛä¬¿¾žÝ?Yq¥ ‡Ø1?3ñ(Ðœpôæ}¿áJÜ@ì(ˆˆÅûÓ{tdñ¨îã‘½E×5Ä.…Ai‡Ù\ÅLiX³Fýª–ò£(žrz6‰ôþg‹Š)<²k(’•EO‹fÖ=d–UýP#Ø·x™t¦¹Æ¬<dÿµ‡¦]+l±•—ì]ó
6î£†@à:7´ÐŽ~“éç†–P7:÷Ò9,Aø1¸}Î«T‹¹Mê„êT'põüdÌÀóWÄ×ñoºŒ¸á\‚Â‡ÉGÝÛ\S™´2‡™¯-›”ia`pâSË†dššÎCù©eC"3Lç¡øp³fD>Ÿ¤5ñ½m£Ù”CÐjöEëuUsáÂªß[6šÒÎÃä£^Séa]ƒãôÈrB˜MArF”í:Ü‡Û™¤AP‰’F?È†™pçï&ËäËü“=„Êr4•™ËzÈ
‰tq‡å#)«b/‘ú·ðüå‹ããÃÇÏº+ÌR©~nÆYÜ¶Ég~Iáƒ e=»¡oêx‹¸9Z%«qìÍŒðÜ:Æ®šw/×‡Ãfm9?ƒóó˜º‚ ¸þûA	UP,‚véŠzz/@4Ô4ÇnÅêÜŒÙ¹­ÛL-†'pÆòàÛ,ÅërÀš°Išwž7ºíÔ¸+Sƒº	Ä¾‹ù¾5ãýÈyi²Z’_ÃíØJ­=žQ^@§Na‰¯ÉS
? ™<Ùdî’§ÑH—ožÍ&Ùïó«UÎïdi¡­m|Y 
(Ëü	3VèòÍ·ð&½zOpõ¼úÂ¿¨YËÛ°s¬J5-}KÓ©¦ Û5Ÿ … Ó§~-É†h¯U²Öœ„ ÃÉòÝlÑ8MX–ªÕÏ5?VþT²yrºÂë
ÏhÊ³MIÇè±Â_é#{2ÁR97^çÍŒÕi6™UÎq¹X‰³ 0˜ó`iúQç{©t£NþÃƒz9ÔÕçOI&³†sCÔàÅŸöÕW¨âí9iÏíþyãíOè±­éd]t«&r%k™´<Ïš${ˆwµ§ '”,e'%õÇ¤þ…Ž¬Åb÷3÷Ô—Š;¦Çs+ˆ38ÐžYÀsëTô½càò e2BŠƒØ>í[Žè‚0—iE+çÛ,–hI­’u—ÖqlâQnxÚ’¾¶ÁF†·áwãùpÛ…—Ž÷Ä·Y ¹šÑ=JcXkß‰põÀQ½¦ý¤yÝKdHm{¡ÙÌ¬„…ü òZ,hðÄ
©Ž½¼ÙÅŸa˜ÆgÈ<vu•*<¸¶Dû,ÔÌüç|8‹Ïraö|8ƒÐ™z0”½ÒvÌD<?ÆÝÔÖ—Ä~è-pž‹Á˜[…3ŸŽX'MómŒÕéÑ31ô:S{Õ;T9Ú-ö×õcØ‰þ_§M¼1ðHdÉ@JšÐ·ŠÅ­\WÄ”3°ÄNb+ïÁÁY•(D¿9~ õNn›1ÛjžLÆûkF¿­\ÓÒ0vŸX€Á"g=·f*qÖÀ> Ëƒúïlý5)ƒža½aôjuuá‘¡¥;Åô¿ÇÕd~c³;À"$Ž¯^ö4Ó`Gšx/c-SOWL£ib`Ÿàš««Öü’Æ.˜ŠÝKñ¡¾tâ^»›zÚÖ×È™Çï^æ^Ô×æÙ[w/ù¿M«ÀyácY'É‚W_oNÑ‰*ˆu¥ktýŸN9ÖX?S³ PCUÚ®Þ“ÓšaÍ'GÏÉ9þ‰çÞ99|òÏ'Çäù‹ýŸž”oÙ‘%cÒð{éq0ïï£<	æP$È¿§ˆÐâC^MËÝ´!”ì$P&ý’/Ç.ÖakÃ@Ä§|	.÷žÈñJ)^TP‘ó0²æ‹¤h*¥ˆ<0ó0/£E˜K¶ìX¢Þé!f=°xüÊ¡—•–¿aù¹¾ÎUY´ jbÔ½ì¬JÊÊÉ£‹ñ9~ñã dL‡3¹h®ZzL#–ýÈB`Miï#Foï¦Kô=ø0Ñ‚Àžw«Ø]Is,®¿uD'2xÅ J$,KË‹®Ê%vdú®†pâ?Å ó0ZÚëŠ¶»«¹Õ_M ^F1ro
§jh²ï24n™¤cÿàÕá1ùš¼<zñôÅÑó½Û¦6=uBN7ÊÎeäÀ;ç—©,Òï9¢ÐÐàÉñ1ª-iÀ2k%´‚Éy¯¦ÜôXþ8™L
?ªÚL¦g'C‚úHü+À3®Š—ørxÿlnâKÔ{ÞË—ü–éDûë¼4{V‰l{ÛÞH«ln—	u£G–í0!KÊ¨Ñ¼î—ü.âPÂÏßa‡ßU4ñE‹_(ÞAËuÉ0$ÿ¾ãõý8*”·páZ‰÷B¡0Sï=0œ2-5ßWOxÆ€êrSk?[—½ÉI Î%à*w¥#®•ü³=Fþ@Ö,Sd6 ëV-²ÞÇ·oYË—7š­(Žé©5w\@ùN—é©}p>tŸ8§Ž»ü9˜(¤3éÔÍ¦•ÿÙ¥`î1°dðñ@â°Üâäéyt’ze”û¸Œ´+Å<¹_àD¶bWdè’Ä\­ZC®ÛQ ×Y%rrµHU†1MÓ­…|~°CžŽcÇr÷ý1ÓÂf^$ABl\Ê@ªw¹¶éÜï–1#¼[ûÀ;Åà$Ð`Êâ•åëvWR]ø3ÿ¬Z.SNRË;a@Û²%£&¼xž4 47(3Kë­ý‹½æ¬âÈÊÙ0>/ B÷1±Ü°ÄÜ0©‚™pð_„:ñ¾¤á /†«ÓÑ¤'€3Cö©‡þ'Ü™et*ý)MÉÓ}NmXÝÍíawE®Ym…cÊŒëaï¼ˆçìb
¦º±æ9IQïû²EQUT‚Ðˆª‰Ëp»••;„“‹%»XBMüå)kˆ/ö‰‡h](Û+)ü˜›ã³<›v1öC}Ö]i	 ô;Xff…yÐ ü£djfz+ (Ÿ†¹ ¬ì1µ‚ñìÏøBk—(°áUK s‡·_i RM¦‹SX½•ªŠ%8Öªæo*"Dâgå>`”—Óúv0ø™"‹G‘@¨g+jªlà·ó†/Ä±w;L"éGÖ¨ù¨àÈ¡AfsßcIÏJE0“ˆ‡—ïJDÅ¯ê[#Ì:}Çó£Þkn_ ŸäwÞ¬¨ïÆ3:~œ|ýUÈ€Ñçm³&J5úMs÷Öä qÙDûZö¾U“IhørõjÂÇ1žñO:	T¥\;*ÙoÅúÄyø£Y³¦s}S£7nÔÁødôÊŸ¥üAó þ~G²Ëu"X½1M$Ç©Å6iÀòÁÂ–MÀS°5U¶Ü;„Ù½6•V™sÁ›×W)S ëá{	ªW`kfÁ4W@.˜æúªHw_kKÀbO°r6Û6É––j„f	1BØ6•· wxy£9Ø•£÷NÔ7¯8÷?˜×bÆÆLi±CDèý*}8–"íz·±¿¥ŒQ¢qMØØ®¤Ñ¼4GK¥f=fÉmG×ïm5"Ør)ƒp†Ô ·AÑÛÌÅ˜¥Aò£ÞŽL9²\>ÃxDÜÛçGÔÀù”‚ä6ú)›èMØ®¥<ipY#,Y9>Øe5ÆZ±O^dc°•ò’kkÓÞÒedúþdR Z:œë'dg*¦ü¥š)éìƒ6Õ«v(ÕÒqC.»Ù_þÉÝúlï¢;ovväÂ-—z¶ôxeÀ¶BÝTä@Kø†ÛE/ØZ«Ð¼ŒÒA¥Í!liqÜ}ö*™(ACGS*Y’ ¾5ü§%–
1ÍLÅ”…/)~âÞó«g½çØ`ƒ_ši0íÁÔñúÂ3¬YŸrSj&öç)ªØuŽlü÷îxÖîÝƒi­o“Í{ƒí­•¥âß²fÅ˜cøí6çUÜ)¿BíìX“¨ôït¶³5šGŠ ô‹Ô!aÜqR§¤I/‰‡×ëCÍU‚7¯… ù&$_‹â·&«Æ¿†°Ð0m$‹ÿÕï3½~*ñ{÷~(/Þù½»žâGYT­3ÌT3ÝFi,ÙÛŸEËÜ^Ï!…ÒHç²‰F%OŠê,=‚ö:l±G›áP3“6’Zž¹˜ØÁýc ¿»z°Æ/¯Jœùï8á¾?FöêU¤ÔyPn/Í,	­p6ò­À&Ïœ0"?P£ÁTEBÑtwO\påÞ½FoõÄˆKåN-üÓ]?ž á61y{¥!š?¡jû¾øŠÌ­ó¿göïîÿ{ÜÚÅ‘ßS{¥fîTfÛÅée¥|­“yiâ"tŸÛ;ìsàŸáçL<`øž©iŽî)i$xkÜ™4DÊy0Û(dÿDovF4F¾kãA6~a}"$9ü‡©?ž9i÷éêŒtŠVH ÁÜÅ-óLê<¼Œzy¹vV Ùg¾µ¯É•5ÂuSšj¾Œ€Àÿ¤'ì¸‚Ó0zP>¸@8ß9ëßêF3`š~¸4\˜¢¶®©–™–5ª0ŽÜR´]QZèe–5†ŸÉÏ:’ËÓ"o€Èq‹k”6û¯¿úöþy£¾ÝaÂe{Cˆµ¼8Üe‘‰ëÚQ²SkÎÍÃºâ£al\|š,˜ËkÔÚ€Ÿ&#ÀâSMÊõxSƒÐâ“È[ºI”JLaoðü¦i%€Åð.\Ë£<ÓµF`K­ UI¨ˆá¥ìå{×Yîñ…7n¢ÚÛŠ¥GÍù)´Â&mLâŸI¼´%1Æ#¡<€ç|î4f™l€U‹OàE} ‡-B8¢éœMNŽ
+Üä¸iÐzp"0Yöq+®‡c3oèYÎô§{Ø¥Aôœ†¡5­ÝÉõ“4vžØÙŽÙºpÓO~Ðei$èä<<ÄúpôÝýú4&‡Oƒ‰¾ú #°ÇMEº¨ªm—K\8)µ`/~,âo5—ÏEÌk•ÄN?=xàº©íÇNæ<ªl³Eà¥r”©j§/«hÂƒ¨»x0|n•tiO÷Ïôb·3ƒ²om'ÄÄÔ~ËøÕNU5\ÉÝÚ_ÿzúN ¸…Žùû¿Ç‹!ë9cä,šÄkÄT— åÔÈÔ«Äq—cŒ‘‡¼&Ë3$..±ìõÇ9x”L¬1"X%Z¸ý‘1°!À€o˜ewá\ÿcÿÆ‘ã:áõGøH#2½þè]ÿ#ÛÉØÞhÑLNý8Äd‰§ôŒ=ŒQâ†AÂ-!i0 ¯°ˆ…X{ƒë,'4{	ýxfA½0¢Ø>@{I§OÌø„q€åFÀÊÀN”â,e£kÜ4+ÿŒ†ïh±\±4käéÆ¨ð–:,3êû°â‰ïiÀ\ 3ô0õÈ©cá«—/Ÿ×ÆàåþKœÕSv‘‡€ƒ/1úÆÀ®søJ¤°l0Ü#–G[7×Ÿ"Â¹hïÎlqÄbÍÀ,¾cÌá=Æ¦ yaÕ’zÖÖV’y¬cØŒ«$ašVÉÀbGnÅˆ‡°üc†¤–Âž¯÷^²«-8òØSbS&6FMcxíM]ðÍ
¬ùõ? jhº¨\zFû|™dúÈ?«W2©vÏ…ö£$ósreÆ%z¢åÆ3`ðô­ŒÁ8ˆÄý¡RÀ¾ì½æ¾Àìï3¿Wøð”ïü˜wTH_¹Î)ØÜ}ƒé´™çÀŠH.ÍfÿbÑ‹=>}q†åÊD|Ðµ%iRqÇ¨$.õáy¹«»q}JzÎäƒŽ*6Énp±óŽ!ºSXöèÒµmAå/•?hdëÖ²xnn9Òz~X?†p1‚ð¾ê£ ½ßÞ$¾œT‡enªù'Uk W+ÙÐ©ÓäêZV^“¹ÄÇ8ñÙ2<-óOA¨-úm¥;åxc¦xœ9×fÇš--»`-õcM¯ç-	Y'éÛ`:êm¬ß_%ò¯æfª÷¶–*§¨È¬oqúà[‡R~Ûª*«!¼*{–ô.A¼ªKÂÛ,ÆVGî­ µò+ðˆøä¯É"„äxFáèÔe)’ª|˜ÞyÔßNB”3}nÉUå{™CXDÝK¢d0ç,’mÍÀ¥ôø'ÃûaÅí_ÒÝÁ|]0°½LÙN«¿¾Íµà‚ŸJCèºÓÅEã^§N‡ˆ¾™µ#ˆØšUhÞQÒVzLíe\kÇ6+sæÜÿÜâ
	Q¼v‹‹¢© ^Wºf	å¼fÔ²“ÜDAÙ®¾šåjT$B/¶˜ÚO@ "\±Kµ#6Aâ£ ±Ø½Z4[~'<
ÝíµÿœÎG(Ã€DíŒâë·×Ó‹¦6©)“|ú¶z;ñ#Ë%?œÜ^Qr­gÂYã~ywiÊ%÷©ìoŒ¶Åû\%Œ~cD~£‚R!Û¨ó…äà—7 f'‰9|7ÊaÀƒÊ„ºB™ )ãey|û¢pÏ“g|;ÜJ(gã5@rª0™µ*Z@ñ‘¡(à¸§}Y¼á¢Z>*kpŸ›ß&Q›±yì=nN=å‡0ñHf½!Pïá
ù†t{€7,[mZNw¹HAë÷â£”=˜æª$üNlÓ›ÜB™ßCác~¹Ûò¹í•un<íL¿F>ŽLÙ£!¨Ë8RBhg
Ë… ¢,ÒT:¯¿Ât¤“ûoHVTÈåÑiÎ/†O>5…ÞãƒÊ£ÄºUd?œ<và2ã
?¤aÔëryb•X«Ü¶fUØ ®
ÿ nN¥yó‡)1à+P7F×ô*jdnk¾\åŠ-
CÖ`-”>"»ìHÚâç·¯ã§ŸrNb*•hå5­Tœ± 
EsÚk‘]kŠ 4Œ¡Taÿ5sDÞ
høïÊˆº0¼Û²Ÿ³X·ŒËÑLàÉ`aô2YäæpçI‹BL†{c+cÁùÅÂ]… ¼;—òØï»#œþ‹….¦"AwôŸÁ .	°ðÎ<ž?,Æºî;S'Fm•xä—ÿö?ncQP„ý.¿Ü
®'¢úÍa›Ñà¬;ãP«ÁL}´ýÒG/¦mÝ£ï¶îÑ…[÷´»ÿÊ´p³Øü8ŠjÓÍu¹Å_Í÷(êcnà›>¦wuùº÷vê“Ê¹Û‰Ï‰Aõ2ý•éÈM‰vóZ‚>º;œÝ,!]ã9smúåó`Iƒ^/†T0§$¼mZø+8s²ö2Dç(}uD'”‹¯<R-^¥Þ;&4©KZ¡·Í¯	É]Áh¥ÜÔ>Ór—{jð€‚ÒF~(úûJÏÂ^}LRD«OÎØƒÛêïûg&pŠÝØå:V“†0çÒBk§žO}Ðs[ï“ëîõÇñ•Z–óê£—ö;[…+ÂF(œ´:&]ôÑ2aµH’\„•Ú<¤0Ézu¡öO˜×‘MíëðsÑØ«ÄÂNWó'Ô<ªãÑO2˜<ß£Wð«™ijê“ÇÉõeö´`’ÉM¯”§Ímƒò´¹xPž–wÊÓö:"ÓD‹›‰ÂZVVÃµjà/,|ÑÞM›yî¸qÆžs™Guæh!s©-<cQ@[¶¢¸£³ ™fõÍ6Þ2,-óæg¤Ñ!Iïy‘$–ƒ°ºJxªÉO¢p·âa§u
“³g±Æ§aÔ)“/ÁˆÜlžÒP9â'ïCÂ?ÜáÁò™á²i‹,šlNçŠ3óH`÷™¬™+é<.¾Õa€<A
b’9à#º4žC›å'dÅÒ£É˜íæ_¤P¸}ýý		Ï}Û™8·-”ùgg³l$|¶ø…«cøo{ã1]D×KòC6Ô±Ú£V¹"îAðJÜŸÐÙÉÚ²Ë%Ö<3™ƒå1Þ7å¼oÄvšq):[’ð8úý¹m‚%fD7h‚?ÈŒ50ß¨úÏ†@>jÑ¨ÑY”k°:Ä§9­tcŒ f–Xp‚p×Ø“·ð1®üéA‰áz•Á:Þ=^xÖÜ­EF®?~Oþ´VÖlNÏ'ãù$ÙkRTÎæ±×ñ¯ù-Î2VÿŠ};ò©}´àr­‹
•`éKÔ ŠH^ýsNÛlBÏø»Àa¾§Ü/ó{²ù-'ìW6ÈU8Oƒ\ÁçŒÎ³<ÂUû¨¢«Ûv–‹f:¬šðåsÆ ©YÊ'Yç*R'b¶ÙÍ+ßUÀ¯¹o[®ÆUÑ«"œWm¼,Ê³²Çwh“G$êu94æÏÜçe€f4€Ý%@!8ÃuiIjró`m¶Ù"JF¥Óei±bä°ºðk‘.ÿ“ãvêù“F‡j8ÀË6×@Ê¡Ò²X=ÈWm•ÚC‘ky}fÌ)‚‰1«›¤óÕÊpÚLh¨6¬D¹sÛVaLí9ÊîH÷<X94Ý˜¦ÌÊ±7ŒGs§6JIl€'Ñ’‹QºJ…xóý”TýQ¨ŒñGSŠ­ÍUr)¶›)Ìø}U)Y½­-è&ùk8ØXá‡£øŸå^%¬ì}û/Sjcq^ü}xŸÉŠYÌ¬Ø¯ßŠ“˜å-´.úJ²³!Õ3´Ø˜ESøåìÊƒ$¦ŒÁÎ¬ú½UÀ'vš%çú,	¼·Íù–—Äê -¸«NÏ”½ÐÚñ°Ù>—ÁßŽ­SŠq¾4øÍ”ÇNüyý-é8Z±‘ZTY8ézŠç¯ê	G†ù¬,•gJk
ªÌjE1Ã€¶,„®ú£ †äû @Rm‘g¡¦XÿÂ0ì¯c˜Ûôë&c¨¶t‚ŸVþ`n«^£G´ž"¼Â0âzò­Ž	„X„òk~ªqvS_½­áÄ‹Æ˜»!	ÀØÔ¨ò¼ó°0Ýkì÷zªÔlAÆuÝ+½×ýÁ]‹Í˜ÅxÍèÃLWºW's÷R÷âqry¬¤w;§ÈÍðzEïàrÎ¦6(QäMÍau§7öDÅ;Iâ’±h7êOhöÅÔ€€tBƒ #“¦eU%óíb¨3ÌEÝ4(¼ì™ë]ôdnvæ1Dâøª£“Jªö.ù$j#Nˆ®5/dæ[¡±éŽ¥)f*³bÇ a÷gâvY„ésÒœÏòiNóí\•ÁŠ=m+£—l‰¥ort[D
]GŽ€ÚË¢dlÆ‡ì½m’k@ ªóP|hÕH¨‡¹7i4Y•¤ÕäN³ËÙØ©9lo8-2¥`#ÙÄ*ÀPqUþ×²ÕÕX":;¾9<½npú”059J³’Ï¸Mk‚ãè`”ðc=þíœ">ÌÒO	Þîaƒ_¼±!kÖrõÐ.Ø­6]‹ñ£HŽ®—¶Ôx¡Æ»ž[ÑxFm2æÆôìÞ§€Ñ hÐ6š¿fZÖ±-T,¬ÐŸ–õ,ÅKQ§ª©f‹Ùæ»ÒâHÇbXÎ“á>Q+Ö6zó×ÿ®üís³‡Ç×YäXàì@SR’ŽRÇXGêÈÈ,6†¤ìK³¼ål%(MÓ2éÍc¥!ÖûR$‰&Ø_Ë©€×ÿÃ6'£–ÇS°”¹šÇÈ¾Ž›í¯Ÿ¯8æf^›MH”‹:¶d&ƒƒ­•0Ê«–ˆ£–wÑ Hfòýžzìù‚‚Ç2<=_œô+®Maï„@¤¯?òæ’o-[“ö«M|kÙH#q(“_ÚŽ¯n“‰/-Û:†-8sÙZúU¯½eIÆs+ÀP÷¿:#'´ì³ÊDþ}’FBiE’”úfêw• !0¼3`^„@K{*%“àeäêàrS9Û·)9±Î;šÌèób¨Mq-Ñ“W¾nfàpcŒ¼Eär19ÜÿÍ `2£Ï‰‚RÝÐ
]ÅP0‡/…’é7„‚ÉŒ>+TÕDíHaF	u3z¨BäËDÆú_Y4Û&Ì(	“E!é=óý÷ñ‚8Èõ
çá
y"³‡Ø¥p;i2ÄoO¦ @+ja™¢XF)y­[Xª˜ÙÆ¬oˆ<ÅÜ “†Ä
©ù	+àøÒ¡!I5É€
%ÕPf«)¡q£ÍuÎg 1DJ¹y½Î¼-–wêqCu?†½œ:c]ŒQÓqÎÌYÎÈdœ?¨@W(—ðdÑÎÒPÛCÝ C¾Þ%Yô”g®;DŒëŠ\I…ˆNØìMéÓÊ^©lfŸQïš;gžX£^7!_ÝUŒÊ©3B»"Îo—àüN“þ6 <¾»ïr¶°šJ¸}¶/<¿Ä1ÀÃAÔU_5#hbŒŠ]îcK$Ç‘SšhVñ'~$À:~>o<½=‚Y7xÈz"	nb[[Eæá÷Š§-î2²ÆØ;Õº¶ãý. ‰Ðó”µø1}‰o`_¾+£Ùå	Kë+ÂÚé±ö›r*·`~šq²pgÆ´sÊ½Yõ)‹òÓDÏÒí2¡&Ð”†‡§ˆC§<õƒ#¢»XjÅäûç{/˜3x¾ÀS?<Ì¹¥¿?÷íë`r&fC^ýÌYäöæ‘á=à©îÁ•¹4?ŽÐKsèü+®ÌCÆUgîû³;ôÓ£Ëñ“<¨=à;£¤Pá8
 ¬ùˆ¼#¯úþx‡Ü½„ïWoÞ±zºmqÝoît T®l=Äg¶ÇœÇV`wYw½»—òç«ÝîLr¨·³§êíì©Þí,>¬,¦Û8˜4ÆýúnöÝÕÂõú2E?xß`©¯.Ø\]rëÎúA>–àÝ¿£Iˆ—{œ®
R{«\|½¹û'ã¹O€ÎMÐèÙJ: ½_þÛÿXÑe»5d~Éq{1q714aD»á`¸ÞTRš)Ï1ãs¿ê8´‚>u}+Ê«JãÜü¬Qè"ôŸcØàNtq»¸¼ñeà²˜¬Ìlö9ÆÝN#òf®¥Û¡úŸaMµ’&4£;4Å‘ýÐûµ¢zSKs`¢7H´\zß³íg T4Rˆs|©·Z£12–Áj³[ô¿Ár6Ç[Ò‘ûšVRGÕà¤6×g×	Íl{›””çn!©–Bþ2¯ãÑÉ"šu(Å½ÂMÇW<›L4›KTkHlX¸|è‰…FýSøÛÂµ¼þØ|¥×(Ÿ7%(Å6šs”Êk‹|†R%w©î\õ2‡’ç%•¹Ë3‚L¢Ÿ6Ñ´q®2]FûJxïŠyxx´bžM…I\FŸi>Ì{å=¿òÝx¾ìIB›¹'“„¢Kž¨ì·jž<š‚AŽMðSZi/IIâKØþÀkõ/ˆøÀiå:ÐJ…KÛÞêoP•J²¬˜HñV‰cŸk+×¹¬Žõ~b
ü$õª
VMjxí•T÷ðËßÿM+¶Ï)“áaªù Ü%: ¿<J?æWeÍ}ÏOó<—1/$¯tžÕ÷\ßêØ",©·2‚UÞ1Hóç¯È°¬LOsj÷6V®`o/s$¹»åCù™‹(Ÿš`€Ý<´ÈŸHfÔ+9ðéŽ	sU)¨ÅIšýl[™#z½„ú	qï-P?VÊaêE¤„mºšEÚ¼AÖÜô¹YPùÆ”7
ùYcÕ
“áÛV«¿½ôâUjhd›u²D'j%iŽ[YàSË2ËrÇ±Ë\‰™J#$a<Ÿ[A½J¬ Ï=i®!–o©MšZ ±É"è¯“Edš¢¦óþèYÛ¤ ;›&uHÃ<d˜ÉŒ=‰AæùéªÎÈ
æ[/qUmÓXŸ®y@íxL{=k<
1ŸÉ7ŽÈÂ™«dh|DêÍN+xí—°p'¯ö>ÃÊõ–²tð
£±ý.Vðù€,¨³©Òº¨‘g±I•Å=yrÃÅ5èö“®ûúç\÷Æ"à„¬=O€u†ƒÆ"ŠÛJ¸Ä€^ó¨Özó9m(SÓ´XŽ\j§Ôi¨#£ÚÀRÜ†\ªi­CØ[KqBYMùÜñú3u{qþæë÷b˜-‘!Iï§À%Ç~ŒA ].‘±é¸¿K¶Ïƒ†;£tGÀ(ø Zm‡¤öröB÷§£g$dbä	«%í‰Ïd®,LÚrñžj°>u¶æ&K‰çpC.’e›óã~ÚnkPß¼qMe(Æ„ÜÖÕ¸…{\„Ê±Í.å£æ«¸f>£`< ¬CÞx£YüR¬é9¥ø!“M·§iÝÍmñïÀ~x\’wW×Ÿ_9x€P•ì’^&?l)v cÇrá•¸°q~¶Œ.¤ÖXyTš˜Zt:zFõ8-1 ýä›’eHÚÒëÝÈy µ]¦çœ =z¦p”W½ ev7†Û†UV2’µ=zFŽèôà|Ñ{÷/w/ùp®úw/±õ«~ï¯µ¿Y¹ûN;é¨KÑdôüÇxukMü€ôøÐlâOr¨c’H•y™T`’‰:X1ú…‰”·8`?÷0ò²&Ñ¤L“ÄŠ]ÇÀ›Ø&±–^¯¿Y%ëCÃô°lË@kÅª™'­MVš1ëÛD[­_V·¤n¹úð®¸aî^
x|CÖ¯t·ÎPšË˜9íTæ
Ï]pž‚Ûs¾/c‚¢žÝ¥§ÏåKïF†ËpÞÉó=—ïÎ€g›Áÿ’cŸàò6Hµ¯ øš‹óÙÍìñÌŽ<<¢É#Ôæ°†_5¡÷èÈzÓ%;ÉKÎkmS‚îÕ;mMmU§p"˜½³þÆ ggç=M‡†1ú›QKWë…<ß‹Øi¾÷Ñ½íù$,Y)»ÅýýþØuòùrw[©O¾íx¯_Ð¾û‘…ÉZÊ¾ÓUÍÖ”(ZcRÐv9êí²òx.P£¨ºö'ràE×ÿoDÉã'õÚµò¡.?õƒèçö•lÊÄõÏ5ðÑÁŸTÍ¦ ‘FZ¹z+”n…¶Ì”oü©TÁQA;Î«9•püYrl+þÔ:àÓ¼‰ñaÑØÒàÝKÞ_ÆPç÷oƒD6ÑÁ)­˜£ü©G?X*	Ù¢‘¥dm<?Â3Ú?£Zivó[éûë,ÀõGJ0åà¹ósL5Ùø,ÙŸÉ< ³/ù„˜áoñÓ¹š¢}­æÕPM-š40V47S,eù•½•@¢×=DæCæœòùÌR >ŸLÀGÓòîSHe‹ÈÓeòö|LrË2¼¦ÜÀ†t@ Ëbb®i²³ÿ7   ÿÿì[rÛ6ð¿§à_•™(vÜ<gìé°íj"[®%§™~@"$sB‘*IÉv39@’säbÅ| Xð!ÊrÚN8qD ‹×b±‹‹½Îì	ŸSa”€ß‰ï3Ûøü'f¶2ßrf«ùÎl¹=³›÷5^xå®Øÿ—K­¢wÛ.µ9„‚Ç¨4äõ>Œúœ×Ê3½xvp8/žnçÅÓH:©~•Fë1fé{sJ†òœ`Þýb©®èQìƒÔ1á¦`PÔZ¤øêÙÑ>/±×·»iýŠÒ|Æ”ã¸ðÏ”«¤8Ô œòñó“ŽZ9ðÅ“fÆ59GŒzïÆÖù¨=té-K&™ûA!ÅTƒ¡Õ1wq3@"ÇÉ'ñ«#)wBvRø#Óa\:÷¦‘ç;f‹/ÆôÔ>_’ µæï:TØ®Ë“$/<l*oœõ"GP7á-O/’P"XšŒ5p-á n÷˜°N}‰ô(ÜÃ²ñI“°ówÖ‹¸ÄJ	$žaLI4»ùmM£{žWUŠñîf­¤ñ(Z£ò<RE)ÕH1&LâL8RÏ§Ú¥œ|RÃ:4™Ý$–Ù±8ÎÐ¶¼QyH‡Lïÿ=É.6R4Ac´ž×ò`_„àmÆ:ËlŽ7Õ<,)¡<M/Å‹ûtCýp[€R Ã]QâŽÿ¾LÙþÛíÆ“«Á/×_ÿ~$n*Ï‘RÆÚÏa0‹mÃv!©j–ÞŒ]6aüuÓb/'!ŸŒÙž‚[@8©á+K©âˆU¬·Ç”Þˆø´ßÕ×¼¶–ÁîmæØ½_íÉØ:]_]ÆcçújïSG°ßî\â¿¦Éc#.§OKîÎH—.HÇoOþ{¬3§ouú£Þõ¹s1±ÎíûÌ×'û²uMCtF]<&îC˜a'}1aÿ,ƒ‘X¢°„Ì¯7)h˜ó\ÑsˆucI¼µŸ0¸l%YÄ<Ò˜N½w›=¦ß¾’Éû41Î·‰Hê {<¬ôŽa1ªÏÞ¶åùap½‚;¼$}ÇXZºõ.ÑåÊÜ!HÀáÛ¿dõç¯m»rY”ÕYóWìÇ°ŽåiyÊ#QÔ•3tÞÃ¨ïXïÁp¸wªÚP¦Ñ™—@ïE†4c¢â£¸O}šPQ Ã¯ç–ˆÞÔß²@2xHæŽL6O„ókÏM™˜„2°´©ùp}+‘<õìá`lO£‹½c?œß‹Åâß4€C ²¡¹±Çe=ÃÁøÔî&¬N÷.é £ñœÌòo€ú’^JÇD-|cÒèŠn<zgÎ2óˆ2>’Ã#.’¦´à!Ha–óÝÅ]…­{ÎC—øH_Øjf,£…´5¥Á¿0¦ù*´e°íæPzôIv“t½¤Zÿi"¶âzMgAÁà^QøÄWNjLëA‡Ðò©}š§bJ.r²†çï¦µÜ©©†÷¡8ÖAó›úÉfçiÉûg„Þn&.<~$¾d¦©¦Ù,(8{7kñ¤nÝl¸tÁ½ŒívŠdÃâ±HdëÇ"`jº#Ãjh›Qi#´ÕR^¸\‘à~ÌC¾é˜Z#4÷ÝL(U6æ0RuO/¨ÚÆËHÙ°X±ý·EgV$"Kš”5MàéãÊ—fVà¦'Ãm%´UÎ38¹Üó²<ÐéËõÔ÷f—Œý¿üP2WseP~	–ñ2Â¨GÜÖ¨t«z†á"\'YçEËÕLm®cØhöÃÅ‚ºð®ƒÑ ÄÆ(¹¡‘óçÚ[e<Å]6(·<(ueèyÃº:{>%ª²“¯ð´¤Î‡?Ð÷Hø®t–„Q,ZéŽˆk¯¼"¥¬»°‚‡ÉŸòc.•˜o¶ã¯qo	k.½ƒp ‡§C.­=	£¸ÔŽq‹ô·ø”1þ)‰Jˆ8Ôcö½DÝ}ùÙh‘Ûè+*¤ô²öJ–ßPA.Ú¦Û¯ÑÜ(\MÃ;‘Î°/Kag4Ž'áG8®!y‚ýÃL6•8>XO
ÉÖR|kÖ§ÄgC¸Z¯bkêÃUq*õ¬.'˜l””Ï™˜I</ÎÒÕÝKMêq¾,C¢‘õR°ü+—|ÛÉ¼fÒ®¡œ+CGóY¯¹Nþ5”|[Ö\-kea;)¸›ük.ùv”yÛJ»­å\½„«‘mÊÔçØ²7^Ì¶ºa 'dŠ©þ‰ˆ4Öø¹qíQoÈL<ýY^ÀºÐ=´þê~xÏõæ¹ÓEwê“ÙÇƒ—‡ÜÁjaÐ\qÔjW¸¢É	<Üò‘žpÃFœ/ŠK3T»ÀÐÂâÎí¬c0’þÉàc™±íñqÃÛÜFÉû»Ä†‹C ÔŒ –äîwÏMnXúÑ«—¨
eª{¯\Ï1Â(µ»õÉ>FUêõZ678”F6ã¸ n½ÎÒ]q¿.ÑÞº·2^ž˜îùŒ¾R•yn-Å™X6Y>±`6Y”½Rk}ýÀ%‘.\Ês_±¸Íú™Š²ƒ•†Ãm/zNíñÁ12.;šP}9°ÑD—þêk	Ã¥EtéqûbírO²Ž7ÛÈVøDWÝŽ•¸ÏÉh>Ÿäy-¦¤sôòåS«øœÈZ‡àÙ<ýãlæ©Åaß<µÄ?Šµ§¾ /Äè¼}Íjy.p^ˆÔ×ì~»Ï‹BPƒž§u½‚úŽ²&™{Ç˜Û‚Ûç‹îuÞ¾*j,Á‡rÐ¢¢šÔZlGjŒ˜h¤Ón‰¡þƒÐ´ÜÎ­šRw‹›ïþÀ€ÀSÒˆÀ‘µ¡ÕËôJÒ‰ ±B”!m¨¹B_®ÊW«àe*~µrßü«RÕg‹æ_’Šìñ)¥.P]?"·pHN({â¸˜¤/þü,`QùÇÞ|ø˜†óù‡   ÿÿ ´vVy