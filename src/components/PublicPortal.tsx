import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Heart,
  ChevronLeft,
  ChevronRight,
  Send,
  Lock,
  ArrowRight,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  User,
  ShieldCheck,
  Building,
  Mail,
  Phone,
  HelpCircle,
  FileText,
  Clock,
  MapPin,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Camera,
  Layers,
  UploadCloud,
  FileSignature,
  DollarSign,
  Play,
  Square,
  LogOut,
  Map,
  Eye,
  Sliders,
  CheckSquare,
  X,
  Zap,
  Calendar,
  Printer,
} from "lucide-react";
import {
  CompanyInfo,
  Member,
  SupportTicket,
  Defibrillateur,
  Variable,
  Client,
  PointageLog,
  StockRecord,
  CommercialDoc,
  CommercialDocItem,
  DistributedStockLocation,
  StockMovement,
  VeilleRecord,
  StockTraceability,
  LogisticsNotification,
  EmargementRecord,
  StagiaireRecord,
  APP_THEMES,
  AppThemeOption,
  APP_FAVICONS,
  AppFaviconOption,
  formatPdfHeaderText,
} from "../types";
import EmargementsTab from "./EmargementsTab";
import { REGIONS_FRANCAISES } from "../utils";
import { getRegionsForCountry } from "../utils/regions";
import { getLanguage, t } from "../utils/translate";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import GmaoCorrectionForm from "./GmaoCorrectionForm";
import GmaoOtherEquipmentCorrectionForm from "./GmaoOtherEquipmentCorrectionForm";
import {
  triggerEmail6RapportIntervention,
  sendScriptEmail,
} from "../utils/emailService";
import { auth } from "../firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { geocodeAddress, sortMissionsByProximity, scheduleMissions } from "../utils/fsmOptimizer";
import { PlanningTab } from "./PlanningTab";
import HelpBubble from "./HelpBubble";
import TopBarProgress from "./TopBarProgress";


// Helper functions for French date <-> ISO date picker compatibility
const getIsoDate = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.includes("/") ? dateStr.split("/") : dateStr.split("-");
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    } else {
      const d = parts[0].padStart(2, "0");
      const m = parts[1].padStart(2, "0");
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  return dateStr;
};

const getFrenchDate = (isoDate: string) => {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
};

const CODE39_MAP: Record<string, string> = {
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

function generateBarcodeSVGString(text: string): string {
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
}

const downloadBarcodeSVG = (text: string) => {
  const svgContent = generateBarcodeSVGString(text);
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `barcode_${text}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const formatToNormalCase = (str: string) => {
  if (!str) return "";
  const trimmed = str.trim();
  if (trimmed.length === 0) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const truncateTourTitle = (title: string) => {
  if (!title) return "";
  return title.length > 15 ? title.substring(0, 15) + "..." : title;
};

interface PublicPortalProps {
  companyInfo: CompanyInfo;
  members: Member[];
  onUpdateMembers: (members: Member[]) => void;
  defibrillateurs: Defibrillateur[];
  onUpdateDefib: (updated: Defibrillateur) => void;
  variables: Variable[];
  clients: Client[];
  onAddTicket: (
    ticket: Omit<SupportTicket, "id" | "date" | "status">,
  ) => string;
  onClose: () => void;
  onOpenClientPortal?: (client: Client) => void;
  stocks?: StockRecord[];
  onUpdateStocks?: (updatedStocks: StockRecord[]) => void;
  distributedStocks?: DistributedStockLocation[];
  onUpdateDistributedStocks?: (updated: DistributedStockLocation[]) => void;
  commercialDocs?: CommercialDoc[];
  onUpdateCommercialDocs?: (updatedDocs: CommercialDoc[]) => void;
  fsmTours?: any[];
  onUpdateFsmTours?: (updated: any[]) => void;
  otherEquipments?: any[];
  onUpdateOtherEquipments?: (updated: any[]) => void;
  formations?: any[];
  emargements?: EmargementRecord[];
  onUpdateEmargements?: (updated: EmargementRecord[]) => void;
  stagiaires?: StagiaireRecord[];
  generatedReports?: GeneratedReport[];
  onUpdateGeneratedReports?: (updated: GeneratedReport[]) => void;
  pointages?: PointageLog[];
  onUpdatePointages?: (updated: PointageLog[]) => void;
  expenses?: Expense[];
  onUpdateExpenses?: (updated: Expense[]) => void;
  veilles?: VeilleRecord[];
  onUpdateVeilles?: (updated: VeilleRecord[]) => void;
  logisticsNotifications?: LogisticsNotification[];
  saveLogisticsNotifications?: (updated: LogisticsNotification[]) => void;
  onAddLogisticsNotification?: (description: string, ugs: string) => void;
  onAddNotification?: (category: 'Stocks' | 'D√©fibrillateurs' | 'Interventions' | 'Factures & Devis' | 'Syst√®me', title: string) => void;
}

// Receipt expense type
interface Expense {
  id: string;
  techName: string;
  title: string;
  amountTtc: number;
  amountHt: number;
  amountTva: number;
  dateStr: string;
  photoUrl?: string;
}

// Generated report log type
interface GeneratedReport {
  id: string;
  date: string;
  techName: string;
  defibId: string;
  defibIdentifiant: string;
  title: string;
  siteMission: string;
  photoUrl?: string;
  defibSnapshot?: Defibrillateur;
  validated?: boolean;
}

export default function PublicPortal({
  companyInfo,
  members,
  onUpdateMembers,
  defibrillateurs,
  onUpdateDefib,
  variables,
  clients,
  onAddTicket,
  onClose,
  onOpenClientPortal,
  stocks = [],
  onUpdateStocks,
  distributedStocks = [],
  onUpdateDistributedStocks,
  commercialDocs = [],
  onUpdateCommercialDocs,
  fsmTours,
  onUpdateFsmTours,
  otherEquipments = [],
  onUpdateOtherEquipments,
  formations = [],
  emargements = [],
  onUpdateEmargements,
  stagiaires = [],
  generatedReports: propGeneratedReports,
  onUpdateGeneratedReports,
  pointages: propPointages,
  onUpdatePointages,
  expenses: propExpenses,
  onUpdateExpenses,
  veilles: propVeilles,
  onUpdateVeilles,
  logisticsNotifications = [],
  saveLogisticsNotifications,
  onAddLogisticsNotification,
  onAddNotification,
}: PublicPortalProps) {
  const getNextDocRef = (
    type: "Devis" | "Facture" | "Proforma",
    docs: CommercialDoc[],
  ): string => {
    const prefix =
      type === "Devis" ? "DEV" : type === "Facture" ? "FACT" : "PRO";
    const year = "2026";
    const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
    let maxNum = 0;
    for (const doc of docs) {
      if (doc.type === type && doc.ref) {
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
    return `${prefix}-${year}-${String(nextNum).padStart(4, "0")}`;
  };

  // Screens: 'landing' | 'signalement' | 'mainteneur' | 'success-ticket'
  const [currentScreen, setCurrentScreen] = useState<
    "landing" | "signalement" | "mainteneur" | "success-ticket"
  >("landing");

  // Report Form full-width overlay state
  const [isReportOverlayOpen, setIsReportOverlayOpen] = useState(false);
  const [emargementModalRecordId, setEmargementModalRecordId] = useState<string | null>(null);
  const [isEmargementOverlayOpen, setIsEmargementOverlayOpen] = useState(false);

  // Accordion collapse/expand states for the 9 sections of the report form
  const [openSection1, setOpenSection1] = useState(true);
  const [openSection2, setOpenSection2] = useState(false);
  const [openSection3, setOpenSection3] = useState(false);
  const [openSection4, setOpenSection4] = useState(false);
  const [openSection5, setOpenSection5] = useState(false);
  const [openSection6, setOpenSection6] = useState(false);
  const [openSection7, setOpenSection7] = useState(false);
  const [openSection8, setOpenSection8] = useState(false);
  const [openSection9, setOpenSection9] = useState(false);

  // New ticket state
  const [ticketForm, setTicketForm] = useState({
    identifiant: "",
    objet: "D√©fibrillateur utilis√©" as SupportTicket["objet"],
    message: "",
    email: "",
    phone: "",
  });
  const [createdTicketId, setCreatedTicketId] = useState("");

  // PIN authentication state
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [pinError, setPinError] = useState("");

  // Inline expanded logins
  const [activeInlineLogin, setActiveInlineLogin] = useState<
    "tech" | "client" | null
  >(null);
  const [inlineTechPin, setInlineTechPin] = useState("");
  const [inlineTechError, setInlineTechError] = useState("");
  const [inlineClientKey, setInlineClientKey] = useState("");
  const [inlineClientError, setInlineClientError] = useState("");

  const [isInlineReportOpen, setIsInlineReportOpen] = useState(false);
  const [inlineReportSuccess, setInlineReportSuccess] = useState(false);

  const handleInlineTechLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setInlineTechError("");
    const trimmedPin = inlineTechPin.trim();
    if (!trimmedPin) {
      setInlineTechError("Veuillez saisir votre code PIN.");
      return;
    }
    const matched = members.find((m) => m.pin === trimmedPin);
    if (matched) {
      setAuthenticatedUser(matched);
      localStorage.setItem(
        "defib_active_tech_session",
        JSON.stringify(matched),
      );
      setInlineTechPin("");
      setActiveInlineLogin(null);
      triggerPreloader();
    } else {
      setInlineTechError("Code PIN invalide.");
    }
  };

  const handleInlineClientLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setInlineClientError("");
    const trimmedKey = inlineClientKey.trim().toUpperCase();
    if (!trimmedKey) {
      setInlineClientError("Veuillez saisir votre cl√© d'acc√®s.");
      return;
    }
    const matched = clients.find(
      (c) => c.accessKey && c.accessKey.trim().toUpperCase() === trimmedKey,
    );
    if (matched) {
      setInlineClientKey("");
      setActiveInlineLogin(null);
      onOpenClientPortal?.(matched);
    } else {
      setInlineClientError("Cl√© d'acc√®s invalide.");
    }
  };

  // Local storage logged in technician session
  const [authenticatedUser, setAuthenticatedUser] = useState<Member | null>(
    () => {
      const saved = localStorage.getItem("defib_active_tech_session");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return null;
        }
      }
      return null;
    },
  );

  // Theme and Favicon support for technician session
  const [themeRefreshTrigger, setThemeRefreshTrigger] = useState(0);
  const [faviconRefreshTrigger, setFaviconRefreshTrigger] = useState(0);
  const [isSettingsCardFlipped, setIsSettingsCardFlipped] = useState(false);

  useEffect(() => {
    const handleThemeChange = () => {
      setThemeRefreshTrigger((prev) => prev + 1);
    };
    const handleFaviconChange = () => {
      setFaviconRefreshTrigger((prev) => prev + 1);
    };
    window.addEventListener("defib-theme-changed", handleThemeChange);
    window.addEventListener("defib-favicon-changed", handleFaviconChange);
    return () => {
      window.removeEventListener("defib-theme-changed", handleThemeChange);
      window.removeEventListener("defib-favicon-changed", handleFaviconChange);
    };
  }, []);

  const currentTechTheme = useMemo<AppThemeOption>(() => {
    const userEmail = (authenticatedUser?.email || "").trim().toLowerCase();
    const userName = (authenticatedUser?.name || "").trim().toLowerCase();
    const tenantKey = localStorage.getItem("defib_tenant_id") || "demo";

    // 1. Check member profile in members list if userEmail or userName matches
    if (userEmail || userName) {
      const foundMember = members.find(
        (m) =>
          (userEmail && m.email?.trim().toLowerCase() === userEmail) ||
          (userName && m.name?.trim().toLowerCase() === userName)
      );
      if (foundMember?.themePreference) {
        const found = APP_THEMES.find((t) => t.id === foundMember.themePreference);
        if (found) return found;
      }
    }

    // 2. Check authenticatedUser direct field
    if (authenticatedUser?.themePreference) {
      const found = APP_THEMES.find((t) => t.id === authenticatedUser.themePreference);
      if (found) return found;
    }

    // 3. User-specific localStorage
    if (userEmail) {
      const userSaved =
        localStorage.getItem(`defib_user_theme_${userEmail}`) ||
        localStorage.getItem(`defib_${tenantKey}_user_${userEmail}_theme`);
      if (userSaved) {
        const found = APP_THEMES.find((t) => t.id === userSaved);
        if (found) return found;
      }
    }

    // 4. Global localStorage
    const savedTheme =
      localStorage.getItem(`defib_${tenantKey}_theme`) ||
      localStorage.getItem("defib_current_user_theme");
    if (savedTheme) {
      const found = APP_THEMES.find(
        (t) => t.id === savedTheme || t.color.toLowerCase() === savedTheme.toLowerCase()
      );
      if (found) return found;
    }

    // 5. Default
    return APP_THEMES[0];
  }, [authenticatedUser, members, themeRefreshTrigger]);

  const currentTechFavicon = useMemo<AppFaviconOption>(() => {
    const userEmail = (authenticatedUser?.email || "").trim().toLowerCase();
    const userName = (authenticatedUser?.name || "").trim().toLowerCase();
    const tenantKey = localStorage.getItem("defib_tenant_id") || "demo";

    // 1. Check member profile in members list if userEmail or userName matches
    if (userEmail || userName) {
      const foundMember = members.find(
        (m) =>
          (userEmail && m.email?.trim().toLowerCase() === userEmail) ||
          (userName && m.name?.trim().toLowerCase() === userName)
      );
      if (foundMember?.faviconPreference) {
        const found = APP_FAVICONS.find((f) => f.id === foundMember.faviconPreference || f.url === foundMember.faviconPreference);
        if (found) return found;
      }
    }

    // 2. Check authenticatedUser direct field
    if (authenticatedUser?.faviconPreference) {
      const found = APP_FAVICONS.find((f) => f.id === authenticatedUser.faviconPreference || f.url === authenticatedUser.faviconPreference);
      if (found) return found;
    }

    // 3. User-specific localStorage
    if (userEmail) {
      const userSaved =
        localStorage.getItem(`defib_user_favicon_${userEmail}`) ||
        localStorage.getItem(`defib_${tenantKey}_user_${userEmail}_favicon`);
      if (userSaved) {
        const found = APP_FAVICONS.find((f) => f.id === userSaved || f.url === userSaved);
        if (found) return found;
      }
    }

    // 4. Global localStorage
    const savedFavicon =
      localStorage.getItem(`defib_${tenantKey}_favicon`) ||
      localStorage.getItem("defib_current_user_favicon");
    if (savedFavicon) {
      const found = APP_FAVICONS.find(
        (f) => f.id === savedFavicon || f.url === savedFavicon
      );
      if (found) return found;
    }

    // 5. Default
    return APP_FAVICONS.find((f) => f.id === "serious_blue") || APP_FAVICONS[1] || APP_FAVICONS[0];
  }, [authenticatedUser, members, faviconRefreshTrigger]);

  const handleFaviconSelect = (faviconId: string) => {
    const selected = APP_FAVICONS.find((f) => f.id === faviconId);
    if (!selected) return;

    const userEmail = (authenticatedUser?.email || "").trim().toLowerCase();
    const userName = (authenticatedUser?.name || "").trim().toLowerCase();
    const tenantKey = localStorage.getItem("defib_tenant_id") || "demo";
    const faviconUrl = selected.url;

    // 1. Save in localStorage
    localStorage.setItem(`defib_${tenantKey}_favicon`, selected.id);
    localStorage.setItem("defib_current_user_favicon", selected.id);
    if (userEmail) {
      localStorage.setItem(`defib_${tenantKey}_user_${userEmail}_favicon`, selected.id);
      localStorage.setItem(`defib_user_favicon_${userEmail}`, selected.id);
      localStorage.setItem(`defib_user_favicon_url_${userEmail}`, faviconUrl);
    }

    // 2. Update DOM link directly
    if (typeof document !== "undefined") {
      let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.getElementsByTagName("head")[0].appendChild(link);
      }
      link.type = "image/png";
      link.href = faviconUrl;
    }

    // 3. Update authenticatedUser state and localStorage active session
    if (authenticatedUser) {
      const updatedUser = { ...authenticatedUser, faviconPreference: selected.id };
      setAuthenticatedUser(updatedUser);
      localStorage.setItem("defib_active_tech_session", JSON.stringify(updatedUser));
    }

    // 4. Update member in members list & trigger onUpdateMembers
    if (members && onUpdateMembers) {
      const updatedMembers = members.map((m) => {
        if (
          (userEmail && m.email?.trim().toLowerCase() === userEmail) ||
          (userName && m.name?.trim().toLowerCase() === userName)
        ) {
          return { ...m, faviconPreference: selected.id };
        }
        return m;
      });
      onUpdateMembers(updatedMembers);
    }

    // 5. Dispatch event and force re-render
    window.dispatchEvent(
      new CustomEvent("defib-favicon-changed", {
        detail: { faviconId: selected.id, faviconUrl: selected.url, userEmail },
      })
    );
    setFaviconRefreshTrigger((prev) => prev + 1);
  };

  const handleThemeSelect = (themeId: string) => {
    const selected = APP_THEMES.find((t) => t.id === themeId);
    if (!selected) return;

    const userEmail = (authenticatedUser?.email || "").trim().toLowerCase();
    const userName = (authenticatedUser?.name || "").trim().toLowerCase();
    const tenantKey = localStorage.getItem("defib_tenant_id") || "demo";

    // 1. Save in localStorage
    localStorage.setItem(`defib_${tenantKey}_theme`, selected.id);
    localStorage.setItem("defib_current_user_theme", selected.id);
    if (userEmail) {
      localStorage.setItem(`defib_${tenantKey}_user_${userEmail}_theme`, selected.id);
      localStorage.setItem(`defib_user_theme_${userEmail}`, selected.id);
    }

    // 2. Update authenticatedUser state and localStorage active session
    if (authenticatedUser) {
      const updatedUser = { ...authenticatedUser, themePreference: selected.id };
      setAuthenticatedUser(updatedUser);
      localStorage.setItem("defib_active_tech_session", JSON.stringify(updatedUser));
    }

    // 3. Update member in members list & trigger onUpdateMembers
    if (members && onUpdateMembers) {
      const updatedMembers = members.map((m) => {
        if (
          (userEmail && m.email?.trim().toLowerCase() === userEmail) ||
          (userName && m.name?.trim().toLowerCase() === userName)
        ) {
          return { ...m, themePreference: selected.id };
        }
        return m;
      });
      onUpdateMembers(updatedMembers);
    }

    // 4. Dispatch event and force re-render
    window.dispatchEvent(
      new CustomEvent("defib-theme-changed", {
        detail: { themeId: selected.id, color: selected.color },
      })
    );
    setThemeRefreshTrigger((prev) => prev + 1);
  };

  // Webapp preloader animation state
  const [showPreloader, setShowPreloader] = useState<boolean>(true);
  const [isSlidingUp, setIsSlidingUp] = useState<boolean>(false);
  const preloaderTouchStartY = useRef<number | null>(null);

  const triggerPreloader = () => {
    setShowPreloader(true);
    setIsSlidingUp(false);
  };

  const dismissPreloader = () => {
    if (isSlidingUp) return;
    setIsSlidingUp(true);
    setTimeout(() => {
      setShowPreloader(false);
      setIsSlidingUp(false);
    }, 600);
  };

  const handlePreloaderTouchStart = (e: React.TouchEvent) => {
    preloaderTouchStartY.current = e.touches[0].clientY;
  };

  const handlePreloaderTouchMove = (e: React.TouchEvent) => {
    if (preloaderTouchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diffY = preloaderTouchStartY.current - currentY;
    if (diffY > 30) {
      dismissPreloader();
    }
  };

  const handlePreloaderWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 5) {
      dismissPreloader();
    }
  };

  // Active tab inside Technician Webapp
  type WebappTab =
    | "interventions"
    | "rapports"
    | "planning"
    | "stocks"
    | "temps"
    | "frais"
    | "localisation";
  const [activeTab, setActiveTab] = useState<WebappTab>("interventions");

  // Google Calendar Integration states
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
    null,
  );
  const [syncedGoogleEmail, setSyncedGoogleEmail] = useState<string | null>(
    () => {
      try {
        const activeTechRaw = localStorage.getItem("defib_active_tech_session");
        if (activeTechRaw) {
          const activeTech = JSON.parse(activeTechRaw);
          if (activeTech?.googleCalEmail) {
            return activeTech.googleCalEmail;
          }
          return localStorage.getItem(
            `defib_google_cal_email_${activeTech?.name || "common"}`,
          );
        }
      } catch (e) {}
      return localStorage.getItem("defib_google_cal_email_common");
    },
  );
  const [isSyncingGoogleCal, setIsSyncingGoogleCal] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showDomainHelp, setShowDomainHelp] = useState(false);
  const [showOperationHelp, setShowOperationHelp] = useState(false);
  const [showCalendarApiHelp, setShowCalendarApiHelp] = useState(false);
  const [disabledProjectNumber, setDisabledProjectNumber] = useState("");

  // Toggle "Masquer le pointage" state
  const [hidePointage, setHidePointage] = useState<boolean>(() => {
    try {
      const activeTechRaw = localStorage.getItem("defib_active_tech_session");
      if (activeTechRaw) {
        const activeTech = JSON.parse(activeTechRaw);
        if (typeof activeTech?.hidePointage === "boolean") {
          return activeTech.hidePointage;
        }
      }
      const envId = localStorage.getItem("defib_tenant_id") || "demo";
      const localVal = localStorage.getItem(`defib_${envId}_tech_hide_pointage`);
      if (localVal !== null) return localVal === "true";
      return localStorage.getItem("defib_hide_pointage") === "true";
    } catch (e) {
      return false;
    }
  });

  // Effective hidden tabs & visibility rules
  const effectiveHiddenTabs: string[] = (() => {
    if (Array.isArray(companyInfo?.hiddenTabs) && companyInfo.hiddenTabs.length > 0) {
      return companyInfo.hiddenTabs;
    }
    try {
      const tid = localStorage.getItem("defib_tenant_id") || "demo";
      const raw = localStorage.getItem(`defib_${tid}_company_info`) || localStorage.getItem("defib_company_info");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.hiddenTabs)) return parsed.hiddenTabs;
      }
    } catch (e) {}
    return companyInfo?.hiddenTabs || [];
  })();

  const isStocksHidden =
    effectiveHiddenTabs.includes("Centrale des stocks") ||
    effectiveHiddenTabs.includes("Stocks distribu√©s") ||
    effectiveHiddenTabs.includes("Stock distribu√©s") ||
    effectiveHiddenTabs.includes("Stocks (Webapp)") ||
    effectiveHiddenTabs.includes("Stocks");

  const isFraisHidden =
    effectiveHiddenTabs.includes("Tickets Caisse") ||
    effectiveHiddenTabs.includes("Tickets de caisse") ||
    effectiveHiddenTabs.includes("Tickets de Caisse") ||
    effectiveHiddenTabs.includes("Frais (Webapp)") ||
    effectiveHiddenTabs.includes("Frais");

  // Selected tour ID for mobile view
  const [selectedTourId, setSelectedTourId] = useState<string>(() => {
    try {
      return localStorage.getItem("defib_selected_tour_id") || "";
    } catch (e) {
      return "";
    }
  });
  const [pauseEnabled, setPauseEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("defib_pause_enabled") === "true";
    } catch (e) {
      return false;
    }
  });
  const [pauseReason, setPauseReason] = useState<string>(() => {
    try {
      return localStorage.getItem("defib_pause_reason") || "Nuit H√¥tel";
    } catch (e) {
      return "Nuit H√¥tel";
    }
  });

  const updateTourPauseState = (enabled: boolean, reason: string) => {
    setPauseEnabled(enabled);
    setPauseReason(reason);
    try {
      localStorage.setItem("defib_pause_enabled", enabled ? "true" : "false");
      localStorage.setItem("defib_pause_reason", reason);
    } catch (e) {}

    const activeTechName = (authenticatedUser?.name || "").trim().toLowerCase();

    const activeToursSource = (fsmTours && fsmTours.length > 0)
      ? fsmTours
      : (() => {
          try {
            const raw = localStorage.getItem("defib_fsm_tours");
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
        })();

    const updatedToursList = activeToursSource.map((t: any) => {
      const tTech = (t.techName || "").trim().toLowerCase();
      const isThisTech = !activeTechName || tTech === activeTechName;
      const isNotDone = t.status !== "Termin√©";

      if (isThisTech && isNotDone) {
        return {
          ...t,
          isPaused: enabled,
          pauseEnabled: enabled,
          pauseReason: enabled ? reason : (t.pauseReason || reason),
        };
      }
      return t;
    });

    if (onUpdateFsmTours) {
      onUpdateFsmTours(updatedToursList);
    }
    try {
      const tid = localStorage.getItem("defib_tenant_id") || "demo";
      localStorage.setItem(`defib_${tid}_fsm_tours`, JSON.stringify(updatedToursList));
      localStorage.setItem("defib_fsm_tours", JSON.stringify(updatedToursList));
    } catch (e) {}

    setTours((prevTours) =>
      prevTours.map((t) => {
        const isNotDone = t.status !== "Termin√©";
        if (isNotDone) {
          return {
            ...t,
            isPaused: enabled,
            pauseEnabled: enabled,
            pauseReason: enabled ? reason : (t.pauseReason || reason),
          };
        }
        return t;
      })
    );

    try {
      window.dispatchEvent(new Event("storage"));
    } catch (_) {}
  };

  useEffect(() => {
    const activeTechName = (authenticatedUser?.name || "").trim().toLowerCase();
    if (fsmTours && fsmTours.length > 0) {
      const activeTechTours = fsmTours.filter((t: any) => {
        const tTech = (t.techName || "").trim().toLowerCase();
        return (!activeTechName || tTech === activeTechName) && t.status !== "Termin√©";
      });
      const pausedTour = activeTechTours.find((t: any) => t.isPaused || t.pauseEnabled);
      if (pausedTour) {
        setPauseEnabled(true);
        if (pausedTour.pauseReason) {
          setPauseReason(pausedTour.pauseReason);
        }
      }
    }
  }, [fsmTours, authenticatedUser]);

  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1000
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("defib_selected_tour_id", selectedTourId || "");
    } catch (e) {}
  }, [selectedTourId]);

  useEffect(() => {
    try {
      localStorage.setItem("defib_pause_enabled", pauseEnabled ? "true" : "false");
    } catch (e) {}
  }, [pauseEnabled]);

  const [showConfirmRecalculate, setShowConfirmRecalculate] = useState(false);

  const handleRecalculateTour = async () => {
    const activeToursSource = fsmTours && fsmTours.length > 0
      ? fsmTours
      : (() => {
          const raw = localStorage.getItem("defib_fsm_tours");
          return raw ? JSON.parse(raw) : [];
        })();

    if (!selectedTourId || !activeToursSource || activeToursSource.length === 0) return;
    const tour = activeToursSource.find((t: any) => t.id === selectedTourId);
    if (!tour) return;

    if (!tour.techName || tour.techName === "Aucun" || tour.techName.trim() === "") {
      alert(t("Aucun technicien n'est configur√© pour cette tourn√©e."));
      return;
    }

    const tech = members.find(
      (m) => m.name.trim().toLowerCase() === tour.techName.trim().toLowerCase()
    );
    const hasTechStructured = tech && tech.startAddressLat !== undefined && tech.startAddressLng !== undefined;
    const hasTechString = tech && tech.startAddress && tech.startAddress.trim() !== "";
    if (!tech || (!hasTechStructured && !hasTechString)) {
      alert(t("Le technicien s√©lectionn√© doit avoir une adresse de d√©part renseign√©e pour pouvoir calculer l'itin√©raire."));
      return;
    }

    setShowConfirmRecalculate(true);
  };

  const executeTourRecalculation = async () => {
    setShowConfirmRecalculate(false);
    const activeToursSource = fsmTours && fsmTours.length > 0
      ? fsmTours
      : (() => {
          const raw = localStorage.getItem("defib_fsm_tours");
          return raw ? JSON.parse(raw) : [];
        })();

    if (!selectedTourId || !activeToursSource || activeToursSource.length === 0) return;
    const tour = activeToursSource.find((t: any) => t.id === selectedTourId);
    if (!tour) return;

    const tech = members.find(
      (m) => m.name.trim().toLowerCase() === tour.techName.trim().toLowerCase()
    );
    if (!tech) return;

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
        alert(t("Impossible de d√©terminer les coordonn√©es de d√©part du technicien."));
        return;
      }

      const equipmentCoords: Record<string, { lat: number; lng: number }> = {};
      const equipmentDetails: Record<string, any> = {};

      (tour.missions || []).forEach((m: any) => {
        const defib = defibrillateurs.find((d: any) => d.identifiant === m.defibIdentifiant);
        if (defib) {
          equipmentDetails[m.defibIdentifiant] = defib;
          const lat = parseFloat(defib.latitude);
          const lng = parseFloat(defib.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            equipmentCoords[m.defibIdentifiant] = { lat, lng };
          }
        } else {
          const other = otherEquipments.find((o: any) => o.identifiant === m.defibIdentifiant);
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

      const preference = tech.optimizationPreference || "proche";
      const sortedMissions = sortMissionsByProximity(
        tour.missions || [],
        startCoord,
        equipmentCoords,
        preference as any
      );

      const scheduledMissions = scheduleMissions(
        sortedMissions,
        tour.startDate,
        equipmentDetails,
        tech
      );

      const updatedToursList = activeToursSource.map((t: any) => {
        if (t.id === selectedTourId) {
          return {
            ...t,
            missions: scheduledMissions,
            calculated: true,
          };
        }
        return t;
      });

      if (onUpdateFsmTours) {
        onUpdateFsmTours(updatedToursList);
        alert(t("L'itin√©raire et les horaires ont √©t√© recalcul√©s et optimis√©s avec succ√®s !"));
      }
    } catch (err) {
      console.error("Failed to optimize tour in technician portal:", err);
      alert(t("Une erreur est survenue lors du calcul de la tourn√©e."));
    }
  };

  // Selected tour ID and passage num for currently opening GMAO report overlay
  const [reportActiveTourId, setReportActiveTourId] = useState<string>("");
  const [reportActivePassageNum, setReportActivePassageNum] = useState<
    number | null
  >(null);

  // Error messages for each tour ID in technician portal
  const [tourErrorMap, setTourErrorMap] = useState<Record<string, string>>({});
  const [attemptedEndTourIds, setAttemptedEndTourIds] = useState<string[]>([]);

  // Localisation form states for the connected technician
  const [techLocationLink, setTechLocationLink] = useState("");
  const [gpsSharingLink, setGpsSharingLink] = useState("");

  // Signature pad states and references for PublicPortal
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSigDrawing = useRef(false);
  const [techSignature, setTechSignature] = useState<string | undefined>(undefined);

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
      setTechSignature(dataUrl);
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
    setTechSignature(undefined);
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

  // Technician Stocks Tab States
  const [selectedTechDistributedStockId, setSelectedTechDistributedStockId] =
    useState<string>("");
  const [showRapatriementForm, setShowRapatriementForm] =
    useState<boolean>(false);
  const [rapatrimentVolume, setRapatrimentVolume] = useState<number>(0);
  const [rapatrimentTrackingLink, setRapatrimentTrackingLink] =
    useState<string>("");
  const [rapatrimentDate, setRapatrimentDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );
  const [rapatrimentStatut, setRapatrimentStatut] = useState<
    "Pr√©paration" | "Exp√©di√©" | "Termin√©" | "Annul√©"
  >("Pr√©paration");

  // Inventory states
  const [isInventoryMode, setIsInventoryMode] = useState<boolean>(false);
  const [checkedTraceabilityIds, setCheckedTraceabilityIds] = useState<Record<string, boolean>>({});

  // New Distributed Stock Form states
  const [showNewDistribStockForm, setShowNewDistribStockForm] = useState<boolean>(false);
  const [newDistribStockId, setNewDistribStockId] = useState<string>("");
  const [newDistribVolumeDisponible, setNewDistribVolumeDisponible] = useState<number>(1);
  const [newDistribTraceabilityEnabled, setNewDistribTraceabilityEnabled] = useState<boolean>(false);
  const [showNewDistribTraceForm, setShowNewDistribTraceForm] = useState<boolean>(false);
  const [pendingNewDistribTraceabilities, setPendingNewDistribTraceabilities] = useState<StockTraceability[]>([]);
  const [newDistribLotOrSerial, setNewDistribLotOrSerial] = useState<string>("");
  const [newDistribExpirationDate, setNewDistribExpirationDate] = useState<string>("");
  const [newDistribMovementId, setNewDistribMovementId] = useState<string>("Autre (Aucun mouvement)");
  const [newDistribSituation, setNewDistribSituation] = useState<
    "Disponible" | "Utilis√©" | "Indisponible" | "Signal√© manquant" | "Pr√™t√©"
  >("Disponible");

  // New Webapp Traceability Form states
  const [showNewWebappTraceForm, setShowNewWebappTraceForm] = useState<boolean>(false);
  const [newWebappMovementId, setNewWebappMovementId] = useState<string>("Autre (Aucun mouvement)");
  const [newWebappLotOrSerial, setNewWebappLotOrSerial] = useState<string>("");
  const [newWebappExpirationDate, setNewWebappExpirationDate] = useState<string>("");
  const [newWebappSituation, setNewWebappSituation] = useState<
    "Disponible" | "Utilis√©" | "Indisponible" | "Signal√© manquant" | "Pr√™t√©"
  >("Disponible");

  // helper for technician stocks tab lookup & changes
  const techActiveStocks = useMemo(() => {
    if (!techLocationLink) return [];
    return distributedStocks.filter(
      (item) =>
        item.locationName &&
        item.locationName.toLowerCase().trim() ===
          techLocationLink.toLowerCase().trim(),
    );
  }, [distributedStocks, techLocationLink]);

  const selectedTechStock = useMemo(() => {
    return distributedStocks.find(
      (item) => item.id === selectedTechDistributedStockId,
    );
  }, [distributedStocks, selectedTechDistributedStockId]);

  const matchedStockRecord = useMemo(() => {
    if (!selectedTechStock) return null;
    return stocks.find(
      (s) =>
        s.id === selectedTechStock.stockId ||
        s.denominationPieceId === selectedTechStock.denominationPieceId,
    );
  }, [stocks, selectedTechStock]);

  const filteredTraceabilities = useMemo(() => {
    if (!matchedStockRecord || !matchedStockRecord.traceabilities || !selectedTechStock) return [];
    return matchedStockRecord.traceabilities.filter(
      (t) => (t.situation === "Disponible" || t.situation === "Signal√© manquant") &&
             t.emplacement === selectedTechStock.locationName
    );
  }, [matchedStockRecord, selectedTechStock]);

  const availableTraceabilitiesCount = useMemo(() => {
    if (!matchedStockRecord || !matchedStockRecord.traceabilities || !selectedTechStock) return 0;
    return matchedStockRecord.traceabilities.filter(
      (t) => t.situation === "Disponible" && t.emplacement === selectedTechStock.locationName
    ).length;
  }, [matchedStockRecord, selectedTechStock]);

  const handleUpdateTraceability = (traceId: string, updates: Partial<StockTraceability>) => {
    if (!matchedStockRecord || !stocks || !onUpdateStocks) return;
    const updatedTraceabilities = (matchedStockRecord.traceabilities || []).map((t) => {
      if (t.id === traceId) {
        return { ...t, ...updates };
      }
      return t;
    });
    const updatedStocks = stocks.map((st) => {
      if (st.id === matchedStockRecord.id) {
        return { ...st, traceabilities: updatedTraceabilities };
      }
      return st;
    });
    onUpdateStocks(updatedStocks);
  };

  const selectedStockVariable = useMemo(() => {
    if (!selectedTechStock) return null;
    return variables.find(
      (v) => v.id === selectedTechStock.denominationPieceId,
    );
  }, [variables, selectedTechStock]);

  // Dynamically calculate outgoing volumes for technician stocks (same as standard form)
  const getPieceOutgoingStats = useMemo(() => {
    return (denomPieceId: string) => {
      const stats = {
        week1: { vol: 0 },
        week2: { vol: 0 },
        next30: { vol: 0 },
      };

      if (!denomPieceId) return stats;

      const vObj = variables.find((v) => v.id === denomPieceId);
      if (!vObj) return stats;

      const pieceNameLower = vObj.nom.toLowerCase().trim();

      const getDaysDiff = (dateStr: string) => {
        if (!dateStr) return 999;
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        const target = new Date(dateStr);
        target.setHours(0, 0, 0, 0);
        const diffTime = target.getTime() - base.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      };

      const activeToursList = (fsmTours || []).filter(
        (t: any) =>
          t.status === "Brouillon" ||
          t.status === "√Ä faire" ||
          t.status === "En cours",
      );

      activeToursList.forEach((tour: any) => {
        const diffDays = getDaysDiff(tour.startDate);
        const missions = tour.missions || tour.passages || [];

        missions.forEach((m: any) => {
          const parts = m.requiredParts || [];
          const matchCount = parts.filter(
            (p: string) => p && p.toLowerCase().trim() === pieceNameLower,
          ).length;

          if (matchCount > 0) {
            if (diffDays <= 7) {
              stats.week1.vol += matchCount;
            } else if (diffDays > 7 && diffDays <= 14) {
              stats.week2.vol += matchCount;
            }

            if (diffDays > 7 && diffDays <= 30) {
              stats.next30.vol += matchCount;
            }
          }
        });
      });

      return stats;
    };
  }, [fsmTours, variables]);

  const outgoingStats = useMemo(() => {
    if (!selectedTechStock)
      return { week1: { vol: 0 }, week2: { vol: 0 }, next30: { vol: 0 } };
    return getPieceOutgoingStats(selectedTechStock.denominationPieceId);
  }, [getPieceOutgoingStats, selectedTechStock]);

  const handleAlertLogistique = async () => {
    const logisticsMember = members.find(
      (m) =>
        m.adminSubRole === "Logistique" ||
        m.role?.toLowerCase().includes("logistique"),
    );
    if (!logisticsMember) {
      alert(
        "Alerte impossible : aucun collaborateur Logistique n'est enregistr√© dans l'√©quipe.",
      );
      return;
    }
    if (!logisticsMember.email) {
      alert(
        "Alerte impossible : le collaborateur Logistique n'a pas d'adresse email renseign√©e.",
      );
      return;
    }

    const techName = authenticatedUser?.name || "Un technicien";
    const pieceName = selectedStockVariable?.nom || "D√©nomination inconnue";
    const ugsCode = matchedStockRecord?.ugs || "N/A";

    const subject = `Alerte approvisionnement stock - ${techName}`;
    const body = `${techName} a besoin de stock pour le pi√®ce/service ${pieceName} UGS ${ugsCode}.`;

    try {
      const sent = await sendScriptEmail({
        to: logisticsMember.email,
        subject,
        body,
        replyTo: authenticatedUser?.email || "noreply@defibeo.com",
      });
      if (sent) {
        if (onAddLogisticsNotification) {
          const name_technician = authenticatedUser?.name || "Un technicien";
          const pieceName = selectedStockVariable?.nom || "Pi√®ce inconnue";
          const ugs = matchedStockRecord?.ugs ? ` (${matchedStockRecord.ugs})` : "";
          const ugsRef = `${pieceName}${ugs}`;
          const emplacement_name = selectedTechStock?.locationName || techLocationLink || "Emplacement";
          onAddLogisticsNotification(
            `Le technicien ${name_technician} (${emplacement_name}) alerte concernant la situation du stock ${ugsRef}.`,
            matchedStockRecord?.ugs || pieceName
          );
        }
        alert(
          `Email d'alerte envoy√© avec succ√®s √† ${logisticsMember.name} (Logistique).`,
        );
      } else {
        alert("Une erreur s'est produite lors de l'envoi de l'email.");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur technique lors de l'envoi de l'email.");
    }
  };

  const handleConfirmRapatriement = () => {
    if (!matchedStockRecord || !selectedTechStock) return;

    // Create new movement
    const newMvId = "mv_" + Date.now();
    const newMv: StockMovement = {
      id: newMvId,
      type: "Rapatriement",
      volume: Number(rapatrimentVolume) || 0,
      date: rapatrimentDate,
      statut: rapatrimentStatut,
      trackingLink: rapatrimentTrackingLink,
      emplacement: selectedTechStock.locationName,
    };

    const updatedMovements = [newMv, ...(matchedStockRecord.mouvements || [])];

    const newVolDispo = Math.max(
      0,
      selectedTechStock.volumeDisponible - (Number(rapatrimentVolume) || 0),
    );

    // Get updated traceabilities
    let countToUpdate = Number(rapatrimentVolume) || 0;
    const updatedTraceabilities = (matchedStockRecord.traceabilities || []).map((t) => {
      let isAtThisLocation = t.emplacement === selectedTechStock.locationName;
      if (!t.emplacement) {
        const matchedMv = (matchedStockRecord.mouvements || []).find(mv => mv.id === t.movementId);
        if (matchedMv && matchedMv.emplacement) {
          const loc = matchedMv.emplacement.includes(" : ") ? matchedMv.emplacement.split(" : ")[1] : matchedMv.emplacement;
          if (loc === selectedTechStock.locationName) {
            isAtThisLocation = true;
          }
        }
      }

      if (isAtThisLocation && (t.situation === "Disponible" || t.situation === "Signal√© manquant") && countToUpdate > 0) {
        countToUpdate--;
        return {
          ...t,
          emplacement: "Centrale des stocks" as any,
        };
      }
      return t;
    });

    // Check if any traceabilities remain at this location
    const hasRemainingTraceabilities = updatedTraceabilities.some((t) => {
      let currentLoc = t.emplacement;
      if (!currentLoc) {
        const matchedMv = (matchedStockRecord.mouvements || []).find(mv => mv.id === t.movementId);
        if (matchedMv && matchedMv.emplacement) {
          currentLoc = matchedMv.emplacement.includes(" : ") ? matchedMv.emplacement.split(" : ")[1] : matchedMv.emplacement;
        }
      }
      const isAtThisLocation = currentLoc === selectedTechStock.locationName;
      return isAtThisLocation && (t.situation === "Indisponible" || t.situation === "Signal√© manquant" || t.situation === "Pr√™t√©" || t.situation === "Disponible");
    });

    const shouldKeep = newVolDispo > 0 || 
                       (selectedTechStock.volumeReserve || 0) > 0 || 
                       (selectedTechStock.volumeEntrant || 0) > 0 || 
                       (matchedStockRecord.traceabilityEnabled ? hasRemainingTraceabilities : false);

    // update distributed stock
    if (onUpdateDistributedStocks && distributedStocks) {
      let updatedDs: DistributedStockLocation[];
      if (!shouldKeep) {
        // Delete this distributed stock location
        updatedDs = distributedStocks.filter(it => it.id !== selectedTechStock.id);
      } else {
        // Keep but update volumeDisponible
        updatedDs = distributedStocks.map((it) => {
          if (it.id === selectedTechStock.id) {
            return {
              ...it,
              volumeDisponible: newVolDispo,
            };
          }
          return it;
        });
      }
      onUpdateDistributedStocks(updatedDs);
    }

    // update central stocks and traceabilities
    if (onUpdateStocks) {
      const updatedStocks = stocks.map((st) => {
        if (st.id === matchedStockRecord.id) {
          return {
            ...st,
            mouvements: updatedMovements,
            traceabilities: updatedTraceabilities,
          };
        }
        return st;
      });
      onUpdateStocks(updatedStocks);
    }

    if (onAddLogisticsNotification) {
      const name_technician = authenticatedUser?.name || "Un technicien";
      const location_name = selectedTechStock?.locationName || techLocationLink || "Emplacement";
      const pieceName = selectedStockVariable?.nom || "Pi√®ce inconnue";
      const ugsStr = matchedStockRecord?.ugs ? ` (${matchedStockRecord.ugs})` : "";
      const ugsRef = `${pieceName}${ugsStr}`;

      const returnedLots = (matchedStockRecord?.traceabilities || [])
        .filter((t) => {
          let currentLoc = t.emplacement;
          if (!currentLoc) {
            const matchedMv = (matchedStockRecord?.mouvements || []).find(mv => mv.id === t.movementId);
            if (matchedMv && matchedMv.emplacement) {
              currentLoc = matchedMv.emplacement.includes(" : ") ? matchedMv.emplacement.split(" : ")[1] : matchedMv.emplacement;
            }
          }
          return currentLoc === selectedTechStock?.locationName;
        })
        .map((t) => t.lotOrSerial)
        .filter(Boolean);

      const lotsList = returnedLots.length > 0 ? returnedLots.join(", ") : "aucun lot";

      onAddLogisticsNotification(
        `Le technicien ${name_technician} (${location_name}) retourne toutes ses r√©f√©rences du stock distribu√© ${ugsRef}, pi√®ce(s) : ${lotsList}.`,
        matchedStockRecord?.ugs || pieceName
      );
    }

    alert("Retour (Rapatriement) enregistr√© avec succ√®s !");
    setShowRapatriementForm(false);
  };

  const handleNavigateToAddress = (address: string) => {
    if (!address) return;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const encodedAddress = encodeURIComponent(address);

    const app = defaultNavApp || "apple-maps";

    if (app === "waze") {
      if (isIOS) {
        window.location.href = `waze://?q=${encodedAddress}&navigate=yes`;
      } else {
        window.location.href = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
      }
    } else if (app === "google-maps") {
      if (isIOS) {
        window.location.href = `comgooglemaps://?q=${encodedAddress}&navigate=yes`;
      } else if (isAndroid) {
        window.location.href = `geo:0,0?q=${encodedAddress}`;
      } else {
        window.open(
          `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
          "_blank",
        );
      }
    } else {
      // Default / apple-maps
      if (isIOS) {
        window.location.href = `maps://maps.apple.com/?q=${encodedAddress}`;
      } else if (isAndroid) {
        window.location.href = `geo:0,0?q=${encodedAddress}`;
      } else {
        window.open(
          `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
          "_blank",
        );
      }
    }
  };

  // Navigation scrolling state and ref for fades
  const navRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(true);

  const handleNavScroll = () => {
    const el = navRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 5);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  };

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    handleNavScroll();
    window.addEventListener("resize", handleNavScroll);
    return () => window.removeEventListener("resize", handleNavScroll);
  }, [activeTab]);

  // Real-time dynamic clock tracking
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Tourn√©es/Interventions Dummy State
  const [tours, setTours] = useState(() => {
    // Try to load and translate from defib_fsm_tours
    try {
      const mainToursRaw = localStorage.getItem("defib_fsm_tours");
      const activeTechRaw = localStorage.getItem("defib_active_tech_session");
      let activeTech: Member | null = null;
      if (activeTechRaw) {
        try {
          activeTech = JSON.parse(activeTechRaw);
        } catch {}
      }
      const activeTechName = activeTech ? activeTech.name : "";

      if (mainToursRaw) {
        const mainTours = JSON.parse(mainToursRaw);
        if (Array.isArray(mainTours) && mainTours.length > 0) {
          // Filter by active technician if logged in
          const matchedFsmTours = mainTours.filter((mt: any) => {
            if (!activeTechName) return true;
            return (
              mt.techName &&
              mt.techName.toLowerCase().trim() ===
                activeTechName.toLowerCase().trim()
            );
          });

          if (matchedFsmTours.length > 0) {
            return matchedFsmTours.map((mt: any, index: number) => {
              const tryFormatDateToFrench = (dateStr: string) => {
                if (!dateStr) return "";
                const parts = dateStr.split("-");
                if (parts.length === 3 && parts[0].length === 4) {
                  return `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                return dateStr;
              };

              return {
                id: mt.id || `fsm-tour-${index}`,
                title: mt.title || "Tourn√©e",
                startDate: tryFormatDateToFrench(mt.startDate),
                status: mt.status || "√Ä faire",
                techName: mt.techName || "",
                passages: (mt.missions || []).map((m: any, idx: number) => {
                  const defib = defibrillateurs.find(
                    (d: any) =>
                      d.identifiant === m.defibIdentifiant ||
                      d.id === m.defibIdentifiant ||
                      (m.clientName && m.clientName.includes(d.identifiant)),
                  );
                  const other = otherEquipments.find(
                    (o: any) =>
                      o.identifiant === m.defibIdentifiant ||
                      o.id === m.defibIdentifiant,
                  );
                  let equipmentType = m.equipmentType;
                  if (!equipmentType) {
                    if (defib) {
                      equipmentType = "D√©fibrillateur";
                    } else if (other) {
                      equipmentType = other.categorie;
                    } else {
                      equipmentType = m.reason?.toLowerCase().includes("autre")
                        ? "Autre mat√©riel"
                        : "D√©fibrillateur";
                    }
                  }
                  let model = "D√©fibrillateur standard";
                  let address = "";
                  if (defib) {
                    const modelVar = variables.find(
                      (v: any) => v.id === defib.modeleId,
                    );
                    if (modelVar) {
                      model = modelVar.marque && modelVar.marque !== "Standard"
                        ? `${modelVar.marque} ${modelVar.nom}`
                        : modelVar.nom;
                    }
                    const addrParts = [
                      defib.numVoie,
                      defib.cp,
                      defib.ville,
                    ].filter(Boolean);
                    if (addrParts.length > 0) {
                      address = addrParts.join(", ");
                    }
                  } else if (other) {
                    model = other.categorie || "Autre mat√©riel";
                    const addrParts = [
                      other.numeroVoie,
                      other.codePostal,
                      other.ville,
                    ].filter(Boolean);
                    if (addrParts.length > 0) {
                      address = addrParts.join(", ");
                    }
                  } else {
                    const fmt = formations?.find((f: any) => f.id === m.formationId || f.id === m.defibIdentifiant);
                    if (fmt) {
                      const fmtAddrParts = [fmt.adresse, fmt.codePostal, fmt.ville].filter(Boolean);
                      if (fmtAddrParts.length > 0) {
                        address = fmtAddrParts.join(", ");
                      }
                    }
                    if (!address && m.address && m.address !== "Non renseign√©" && m.address !== m.clientName) {
                      address = m.address;
                    }
                    if (!address && m.location && m.location !== "Non renseign√©") {
                      address = m.location;
                    }
                    if (!address && (m.clientId || fmt?.clientId)) {
                      const clientObj = clients?.find((c: any) => c.id === (m.clientId || fmt?.clientId));
                      if (clientObj) {
                        const clientAddrParts = [clientObj.adresse, clientObj.codePostal, clientObj.ville].filter(Boolean);
                        if (clientAddrParts.length > 0) {
                          address = clientAddrParts.join(", ");
                        }
                      }
                    }
                  }
                  const calculatedDate = (() => {
                    const tourStartDate = mt.startDate || "";
                    if (!tourStartDate) return "";
                    const d = new Date(tourStartDate);
                    if (isNaN(d.getTime())) return tourStartDate;
                    const daysToAdd = Math.floor(idx / 6);
                    d.setDate(d.getDate() + daysToAdd);
                    return d.toISOString().split("T")[0];
                  })();
                  const rawEstDate = m.estimatedDate || calculatedDate;

                  return {
                    num: idx + 1,
                    id: m.id || `df-p-${idx}`,
                    identifiant: m.defibIdentifiant || defib?.identifiant || "",
                    model,
                    address,
                    equipmentType,
                    status: m.status || "√Ä faire",
                    reason: m.reason || "Visite technique",
                    requiredParts: m.requiredParts || [],
                    estimatedDate: rawEstDate,
                    estimatedSlot: m.estimatedSlot || "",
                    rejectionReason: m.rejectionReason || "",
                    rejectedAt: m.rejectedAt || "",
                    interventionReference: m.interventionReference || "",
                    clientId: m.clientId,
                    clientName: m.clientName,
                    formationId: m.formationId,
                    bonCommandeId: m.bonCommandeId,
                    customBonCommande: m.customBonCommande,
                  };
                }),
              };
            });
          }
        }
      }
    } catch (e) {
      console.error(
        "Error parsing defib_fsm_tours in technician portal state init:",
        e,
      );
    }

    // Fallback to local storage defib_mobile_tours2, or hardcoded default ones
    const saved = localStorage.getItem("defib_mobile_tours2");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return [
      {
        id: "tour-1",
        title: "Tourn√©e Nantes Hyper-Centre",
        startDate: "03-06-2026",
        passages: [
          {
            num: 1,
            id: "df-p1",
            identifiant: "PAR-101",
            model: "HeartStart HS1",
            address: "Place du Commerce, Nantes",
            status: "√Ä faire",
            reason: "Remplacement batterie",
            requiredParts: ["Batterie Lithium HS1 (4 ans)"],
            estimatedDate: "03-06-2026",
          },
          {
            num: 2,
            id: "df-p2",
            identifiant: "PAR-102",
            model: "ZOLL AED Plus",
            address: "12 Rue de Budapest, Nantes",
            status: "Effectu√©",
            reason: "Remplacement √©lectrodes CPR-D-padz",
            requiredParts: ["Paire d‚Äô√©lectrodes CPR-D"],
            estimatedDate: "03-06-2026",
          },
          {
            num: 3,
            id: "df-p3",
            identifiant: "PAR-103",
            model: "Lifepak CR2",
            address: "44 Rue de Strasbourg, Nantes",
            status: "√Ä faire",
            reason: "Contr√¥le annuel & Nettoyage",
            requiredParts: ["Kit de nettoyage standard"],
            estimatedDate: "03-06-2026",
          },
        ],
      },
      {
        id: "tour-2",
        title: "Tourn√©e Agglom√©ration Ouest",
        startDate: "04-06-2026",
        passages: [
          {
            num: 1,
            id: "df-p4",
            identifiant: "PAR-104",
            model: "Defibrillator FRx",
            address: "18 Rue de la Paix, Sautron",
            status: "√Ä faire",
            reason: "Changement batterie & √©lectrodes",
            requiredParts: ["Batterie FRx", "Cartouche √âlectrodes SMART II"],
            estimatedDate: "04-06-2026",
          },
          {
            num: 2,
            id: "df-p5",
            identifiant: "PAR-105",
            model: "BeneHeart C1A",
            address: "Avenue de l'Atlantique, Saint-Herblain",
            status: "√Ä faire",
            reason: "Visite pr√©ventive annuelle",
            requiredParts: ["Aucune pi√®ce requise"],
            estimatedDate: "04-06-2026",
          },
        ],
      },
    ];
  });

  // Persist tour state changes and sync to general FSM tours
  const saveTours = (updated: typeof tours) => {
    setTours(updated);
    localStorage.setItem("defib_mobile_tours2", JSON.stringify(updated));

    // Also sync back to prop callback if present
    if (onUpdateFsmTours && fsmTours) {
      const updatedMainTours = fsmTours.map((mt: any) => {
        const matchedMobileTour = updated.find(
          (t) => t.id === mt.id || t.title === mt.title,
        );
        if (matchedMobileTour) {
          const updatedMissions = (mt.missions || []).map(
            (m: any, idx: number) => {
              const matchedPassage = matchedMobileTour.passages.find(
                (p: any) =>
                  p.num === idx + 1 || p.identifiant === m.defibIdentifiant,
              );
              if (matchedPassage) {
                return {
                  ...m,
                  status: matchedPassage.status,
                  rejectionReason: matchedPassage.rejectionReason || "",
                  rejectedAt: matchedPassage.rejectedAt || "",
                };
              }
              return m;
            },
          );
          const hasStarted = updatedMissions.some(
            (m: any) => m.status === "Effectu√©" || m.status === "En cours",
          );
          let newStatus = mt.status;
          if (mt.status !== "Effectu√©" && mt.status !== "Termin√©") {
            newStatus = hasStarted ? "En cours" : "√Ä faire";
          }

          return {
            ...mt,
            status:
              matchedMobileTour.status === "Termin√©" ||
              matchedMobileTour.status === "Effectu√©"
                ? "Effectu√©"
                : newStatus,
            missions: updatedMissions,
          };
        }
        return mt;
      });
      onUpdateFsmTours(updatedMainTours);
    } else {
      // Fallback
      try {
        const mainToursRaw = localStorage.getItem("defib_fsm_tours");
        if (mainToursRaw) {
          const mainTours = JSON.parse(mainToursRaw);
          const updatedMainTours = mainTours.map((mt: any) => {
            const matchedMobileTour = updated.find(
              (t) => t.id === mt.id || t.title === mt.title,
            );
            if (matchedMobileTour) {
              const updatedMissions = (mt.missions || []).map(
                (m: any, idx: number) => {
                  const matchedPassage = matchedMobileTour.passages.find(
                    (p: any) =>
                      p.num === idx + 1 || p.identifiant === m.defibIdentifiant,
                  );
                  if (matchedPassage) {
                    return {
                      ...m,
                      status: matchedPassage.status,
                      rejectionReason: matchedPassage.rejectionReason || "",
                      rejectedAt: matchedPassage.rejectedAt || "",
                    };
                  }
                  return m;
                },
              );
              const hasStarted = updatedMissions.some(
                (m: any) => m.status === "Effectu√©" || m.status === "En cours",
              );
              let newStatus = mt.status;
              if (mt.status !== "Effectu√©" && mt.status !== "Termin√©") {
                newStatus = hasStarted ? "En cours" : "√Ä faire";
              }

              return {
                ...mt,
                status:
                  matchedMobileTour.status === "Termin√©" ||
                  matchedMobileTour.status === "Effectu√©"
                    ? "Effectu√©"
                    : newStatus,
                missions: updatedMissions,
              };
            }
            return mt;
          });
          localStorage.setItem(
            "defib_fsm_tours",
            JSON.stringify(updatedMainTours),
          );
        }
      } catch (e) {
        console.error("Error syncing back to defib_fsm_tours:", e);
      }
    }
  };

  const getSortedTours = () => {
    const parseTourDate = (dateStr: string) => {
      if (!dateStr) return 0;
      const clean = dateStr.replace(/\//g, "-");
      const parts = clean.split("-");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          return new Date(y, m, d).getTime();
        } else {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const y = parseInt(parts[2], 10);
          return new Date(y, m, d).getTime();
        }
      }
      return 0;
    };
    return [...tours].sort(
      (a, b) => parseTourDate(b.startDate) - parseTourDate(a.startDate),
    );
  };

  // Dynamic sync of tours from main defib_fsm_tours on login, defibrillateurs change or mount
  useEffect(() => {
    try {
      const activeTechName = authenticatedUser ? authenticatedUser.name : "";
      const isMemberOfEnv = authenticatedUser
        ? members.some(
            (m) =>
              (m.name &&
                m.name.toLowerCase().trim() ===
                  authenticatedUser.name.toLowerCase().trim()) ||
              (m.email &&
                m.email.toLowerCase().trim() ===
                  authenticatedUser.email?.toLowerCase().trim()),
          )
        : false;

      let matchedFsmTours: any[] = [];

      if (fsmTours) {
        matchedFsmTours = fsmTours.filter((mt: any) => {
          if (!isMemberOfEnv) return false;
          const isTechAssigned =
            activeTechName &&
            mt.techName &&
            mt.techName.toLowerCase().trim() ===
              activeTechName.toLowerCase().trim();
          const isStatusTodo =
            mt.status === "√Ä faire" || mt.status === "En cours";
          return isTechAssigned && isStatusTodo;
        });
      } else {
        const mainToursRaw = localStorage.getItem("defib_fsm_tours");
        if (mainToursRaw) {
          const mainTours = JSON.parse(mainToursRaw);
          if (Array.isArray(mainTours)) {
            matchedFsmTours = mainTours.filter((mt: any) => {
              if (!activeTechName) return true;
              const isTechAssigned =
                mt.techName &&
                mt.techName.toLowerCase().trim() ===
                  activeTechName.toLowerCase().trim();
              const isStatusTodo =
                mt.status === "√Ä faire" || mt.status === "En cours";
              return isTechAssigned && isStatusTodo;
            });
          }
        }
      }

      if (matchedFsmTours.length > 0) {
        const mapped = matchedFsmTours.map((mt: any, index: number) => {
          const tryFormatDateToFrench = (dateStr: string) => {
            if (!dateStr) return "";
            const parts = dateStr.split("-");
            if (parts.length === 3 && parts[0].length === 4) {
              return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            return dateStr;
          };

          return {
            id: mt.id || `fsm-tour-${index}`,
            title: mt.title || "Tourn√©e",
            startDate: tryFormatDateToFrench(mt.startDate),
            status: mt.status || "√Ä faire",
            techName: mt.techName || "",
            passages: (mt.missions || []).map((m: any, idx: number) => {
              const defib = defibrillateurs.find(
                (d: any) =>
                  d.identifiant === m.defibIdentifiant ||
                  d.id === m.defibIdentifiant ||
                  (m.clientName && m.clientName.includes(d.identifiant)),
              );
              const other = otherEquipments.find(
                (o: any) =>
                  o.identifiant === m.defibIdentifiant ||
                  o.id === m.defibIdentifiant,
              );
              let equipmentType = m.equipmentType;
              if (!equipmentType) {
                if (defib) {
                  equipmentType = "D√©fibrillateur";
                } else if (other) {
                  equipmentType = other.categorie;
                } else {
                  equipmentType = m.reason?.toLowerCase().includes("autre")
                    ? "Autre mat√©riel"
                    : "D√©fibrillateur";
                }
              }
              let model = "D√©fibrillateur standard";
              let address = "";
              if (defib) {
                const modelVar = variables.find(
                  (v: any) => v.id === defib.modeleId,
                );
                if (modelVar) {
                  model = modelVar.marque && modelVar.marque !== "Standard"
                    ? `${modelVar.marque} ${modelVar.nom}`
                    : modelVar.nom;
                }
                const addrParts = [defib.numVoie, defib.cp, defib.ville].filter(
                  Boolean,
                );
                if (addrParts.length > 0) {
                  address = addrParts.join(", ");
                }
              } else if (other) {
                model = other.categorie || "Autre mat√©riel";
                const addrParts = [
                  other.numeroVoie,
                  other.codePostal,
                  other.ville,
                ].filter(Boolean);
                if (addrParts.length > 0) {
                  address = addrParts.join(", ");
                }
              } else {
                const fmt = formations?.find((f: any) => f.id === m.formationId || f.id === m.defibIdentifiant);
                if (fmt) {
                  const fmtAddrParts = [fmt.adresse, fmt.codePostal, fmt.ville].filter(Boolean);
                  if (fmtAddrParts.length > 0) {
                    address = fmtAddrParts.join(", ");
                  }
                }
                if (!address && m.address && m.address !== "Non renseign√©" && m.address !== m.clientName) {
                  address = m.address;
                }
                if (!address && m.location && m.location !== "Non renseign√©") {
                  address = m.location;
                }
                if (!address && (m.clientId || fmt?.clientId)) {
                  const clientObj = clients?.find((c: any) => c.id === (m.clientId || fmt?.clientId));
                  if (clientObj) {
                    const clientAddrParts = [clientObj.adresse, clientObj.codePostal, clientObj.ville].filter(Boolean);
                    if (clientAddrParts.length > 0) {
                      address = clientAddrParts.join(", ");
                    }
                  }
                }
              }
              const calculatedDate = (() => {
                const tourStartDate = mt.startDate || "";
                if (!tourStartDate) return "";
                const d = new Date(tourStartDate);
                if (isNaN(d.getTime())) return tourStartDate;
                const daysToAdd = Math.floor(idx / 6);
                d.setDate(d.getDate() + daysToAdd);
                return d.toISOString().split("T")[0];
              })();
              const rawEstDate = m.estimatedDate || calculatedDate;

              return {
                num: idx + 1,
                id: m.id || `df-p-${idx}`,
                identifiant: m.defibIdentifiant || defib?.identifiant || "",
                model,
                address,
                equipmentType,
                status: m.status || "√Ä faire",
                reason: m.reason || "Visite technique",
                requiredParts: m.requiredParts || [],
                estimatedDate: rawEstDate,
                estimatedSlot: m.estimatedSlot || "",
                rejectionReason: m.rejectionReason || "",
                rejectedAt: m.rejectedAt || "",
                interventionReference: m.interventionReference || "",
                clientId: m.clientId,
                clientName: m.clientName,
                formationId: m.formationId,
                bonCommandeId: m.bonCommandeId,
                customBonCommande: m.customBonCommande,
              };
            }),
          };
        });

        setTours(mapped);
        setSelectedTourId((prev) => {
          if (prev && mapped.some((t: any) => t.id === prev)) {
            return prev;
          }
          const firstActive = mapped.find((t: any) => t.status !== "Termin√©") || mapped[0];
          return firstActive ? firstActive.id : "";
        });
      } else {
        setTours([]);
      }
    } catch (e) {
      console.error("Error syncing FSM tours inside useEffect:", e);
    }
  }, [authenticatedUser, defibrillateurs, fsmTours, members, variables]);

  // Switch/Toggle status of a passage
  const togglePassageStatus = (tourId: string, passageNum: number) => {
    const updated = tours.map((t) => {
      if (t.id === tourId) {
        return {
          ...t,
          passages: t.passages.map((p) => {
            if (p.num === passageNum) {
              const newStatus = p.status === "√Ä faire" ? "Effectu√©" : "√Ä faire";
              return { ...p, status: newStatus };
            }
            return p;
          }),
        };
      }
      return t;
    });
    saveTours(updated);
  };

  // PDF Report state variables
  const [copiedGps, setCopiedGps] = useState<string | null>(null);
  const handleCopyGps = (gpsText: string) => {
    navigator.clipboard.writeText(gpsText);
    setCopiedGps(gpsText);
    setTimeout(() => setCopiedGps(null), 2000);
  };

  const getBonCommandeLabel = (p: any) => {
    if (p.bonCommandeId === 'custom') {
      return p.customBonCommande || "";
    }
    if (p.bonCommandeId) {
      const doc = commercialDocs?.find((d: any) => d.id === p.bonCommandeId);
      if (doc) {
        return doc.bonCommandeEntete || doc.bonCommandeReference || doc.ref || p.bonCommandeId;
      }
    }
    return "";
  };

  const [selectedDefibId, setSelectedDefibId] = useState("");
  const [selectedDefibData, setSelectedDefibData] =
    useState<Defibrillateur | null>(null);
  const [selectedOtherEquipmentUnique, setSelectedOtherEquipmentUnique] =
    useState<any | null>(null);
  const [reportToEdit, setReportToEdit] = useState<GeneratedReport | null>(null);
  const [isLotScannerOpen, setIsLotScannerOpen] = useState(false);
  const [isSerieScannerOpen, setIsSerieScannerOpen] = useState(false);
  const [isLotAScannerOpen, setIsLotAScannerOpen] = useState(false);
  const [isLotPScannerOpen, setIsLotPScannerOpen] = useState(false);
  const [isLotBatScannerOpen, setIsLotBatScannerOpen] = useState(false);

  // Custom Maintenance Fields for Tab 2
  const [receiptTitle, setReceiptTitle] = useState(
    "RAPPORT D‚ÄôINTERVENTION",
  );
  const [missionSite, setMissionSite] = useState<"D√âPLACEMENT" | "ATELIER SAV">(
    "D√âPLACEMENT",
  );
  const [horodateInput, setHorodateInput] = useState("");
  const [techPhotoUrl, setTechPhotoUrl] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Generated Reports Historical Feed list from LocalStorage
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>(
    () => {
      const saved = localStorage.getItem("defib_generated_reports");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
      return [
        {
          id: "rep-1",
          date: "02-06-2026 14:15",
          techName: "Thierry Martin",
          defibId: "df_1",
          defibIdentifiant: "PAR-101",
          title: "CONSTAT DE MAINTENANCE D√âFIBRILLATEUR",
          siteMission: "D√âPLACEMENT",
          photoUrl:
            "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=100&auto=format&fit=crop",
        },
      ];
    },
  );

  useEffect(() => {
    if (propGeneratedReports) {
      setGeneratedReports(propGeneratedReports);
    }
  }, [propGeneratedReports]);

  const saveReports = (updated: GeneratedReport[]) => {
    setGeneratedReports(updated);
    try {
      localStorage.setItem("defib_generated_reports", JSON.stringify(updated));
    } catch (e) {
      console.warn(
        "LocalStorage Quota Exceeded while saving generated reports locally:",
        e,
      );
    }
    if (onUpdateGeneratedReports) {
      onUpdateGeneratedReports(updated);
    }
  };

  const parseReportDate = (dateStr: string) => {
    if (!dateStr) return 0;
    // Handle formats like "DD-MM-YYYY HH:mm" or "DD/MM/YYYY HH:mm" or ISO
    const clean = dateStr.replace(/\s+/g, " ").replace(/\//g, "-").trim();
    if (clean.includes("T") || clean.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(clean).getTime();
    }
    const spaceParts = clean.split(" ");
    const datePart = spaceParts[0];
    const timePart = spaceParts[1] || "00:00";

    const dateParts = datePart.split("-");
    const timeParts = timePart.split(":");

    if (dateParts.length === 3) {
      let day = parseInt(dateParts[0], 10);
      let month = parseInt(dateParts[1], 10) - 1;
      let year = parseInt(dateParts[2], 10);
      if (dateParts[0].length === 4) {
        year = parseInt(dateParts[0], 10);
        month = parseInt(dateParts[1], 10) - 1;
        day = parseInt(dateParts[2], 10);
      }

      const hour = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
      const min = timeParts[1] ? parseInt(timeParts[1], 10) : 0;

      return new Date(year, month, day, hour, min).getTime();
    }
    return 0;
  };

  const sortedAndLimitedReports = [...generatedReports]
    .filter((rep) => rep.validated !== true)
    .sort((a, b) => {
      const timeA = parseReportDate(a.date);
      const timeB = parseReportDate(b.date);
      return timeB - timeA;
    })
    .slice(0, 50);

  const [printingReport, setPrintingReport] = useState<GeneratedReport | null>(
    null,
  );

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
    const snapshot =
      report.defibSnapshot ||
      defibrillateurs.find(
        (d) =>
          d.id === report.defibId || d.identifiant === report.defibIdentifiant,
      ) ||
      {};

    if (snapshot.categorie && snapshot.categorie !== "D√©fibrillateur") {
      let clientFound = clients.find((c) => c.id === snapshot.clientId);
      if (!clientFound && snapshot.clientId) {
        clientFound = clients.find((c) => c.denomination === snapshot.clientId || c.id === snapshot.clientId);
      }
      if (!clientFound && report.clientId) {
        clientFound = clients.find((c) => c.id === report.clientId);
      }
      if (!clientFound) {
        const siteEmail = snapshot.emailSite || report.emailSite || "";
        if (siteEmail) {
          clientFound = clients.find((c) => c.email && c.email.toLowerCase().trim() === siteEmail.toLowerCase().trim());
        }
      }
      if (!clientFound) {
        const siteNom = snapshot.nomPrenomSite || "";
        if (siteNom) {
          clientFound = clients.find((c) => c.denomination === siteNom || c.nomPrenomSite === siteNom);
        }
      }
      const clientName = clientFound
        ? clientFound.denomination
        : snapshot.nomPrenomSite || "Non rattach√©";

      // Filter out typical top-level keys to get custom equipment properties!
      const topLevelKeys = [
        "id",
        "clientId",
        "nomPrenomSite",
        "telephoneSite",
        "emailSite",
        "contrat",
        "nomContrat",
        "referenceContrat",
        "debutContrat",
        "finContrat",
        "pays",
        "codePostal",
        "cp",
        "ville",
        "adresseComplexe",
        "identifiant",
        "codeNfc",
        "statutGmao",
        "categorie",
        "conforme",
        "miseEnServiceDate",
        "miseEnService",
        "commentaireGmao",
      ];

      const customProperties = Object.entries(snapshot).filter(([k, v]) => {
        return (
          !topLevelKeys.includes(k) &&
          v !== undefined &&
          v !== null &&
          v !== "" &&
          typeof v !== "object"
        );
      });

      const compLogo = companyInfo.logo || "";
      const compName = companyInfo.name || "D√©fibeo Solutions";
      const compEmail = companyInfo.email || "";
      const compPhone = companyInfo.phone || "";
      const compWebsite = companyInfo.website || "";

      const pdfLogo = companyInfo.logo || '';
      const pdfHeaderImg = companyInfo.pdfHeaderImg || '';
      const pdfPageHeaderText = companyInfo.pdfPageHeaderText || '';
      const pdfPageFooterText = companyInfo.pdfPageFooterText || '';
      const pdfLastPageInfoText = companyInfo.pdfLastPageInfoText || '';
      const pdfHeaderBgColor = companyInfo.pdfHeaderBgColor || '#7c2882';
      const pdfCardBorderColor = companyInfo.pdfCardBorderColor || '#7d2882';
      const pdfCardBgColor = companyInfo.pdfCardBgColor || '#fef2ff';
      const pdfLabelTextColor = companyInfo.pdfLabelTextColor || '#9f71a2';
      const hasLastPage = pdfLastPageInfoText && pdfLastPageInfoText.trim().length > 0;

      const totalPages = hasLastPage ? 3 : 2;
      const docTitle = report.title ? report.title : `Rapport d‚Äôintervention - ${snapshot.categorie || ''}`;

      const renderHeader = (title: string) => {
        const showHeaderImg = pdfHeaderImg ? `<img src="${pdfHeaderImg}" style="max-height: 55px; max-width: 100%; object-fit: contain;" alt="Header Illustration" referrerPolicy="no-referrer" />` : '';
        const showHeaderLogo = pdfLogo ? `<img src="${pdfLogo}" style="max-height: 80px; object-fit: contain;" alt="Logo" referrerPolicy="no-referrer" />` : '';
        const showHeaderInfoText = pdfPageHeaderText ? `<div style="font-size: 14px; color: #000000; text-align: left; font-family: 'Civilprom', sans-serif !important;">${formatPdfHeaderText(pdfPageHeaderText)}</div>` : '';
        const showEmail = compEmail ? `<div>${compEmail}</div>` : '';
        const showPhone = compPhone ? `<div>${compPhone}</div>` : '';

        return `
          <div class="pdf-global-header" style="display: flex; flex-direction: row; width: calc(100% - 30mm); margin: 10mm 15mm 15px 15mm; padding-bottom: 10px; font-family: 'Civilprom', 'Inter', sans-serif !important; align-items: center; box-sizing: border-box;">
            <div style="width: 25%; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box; padding-right: 5px;">
              ${showHeaderLogo}
            </div>
            <div style="width: 35%; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left; box-sizing: border-box; padding: 0 5px; gap: 4px;">
              ${showHeaderImg}
              ${showHeaderInfoText}
            </div>
            <div style="width: 20%; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box; padding: 0 5px;">
              <div style="font-size: 14px; font-weight: bold !important; color: #000000; text-align: left; line-height: 1.1;">
                ${title}
              </div>
            </div>
            <div style="width: 20%; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; text-align: right; box-sizing: border-box; padding-left: 5px; font-size: 14px; color: #000000; gap: 2px;">
              <div style="font-weight: bold !important; margin-bottom: 2px;">${compName}</div>
              ${showEmail}
              ${showPhone}
            </div>
          </div>
        `;
      };

      const renderFooter = (pageIndex: number, pagesTotal: number) => `
        <div class="pdf-footer" style="position: absolute; bottom: 15mm; left: 15mm; right: 15mm; display: flex; flex-direction: row; justify-content: space-between; align-items: flex-end; font-size: 13px; color: #000000; padding-top: 8px; font-family: 'Civilprom', 'Inter', sans-serif !important; box-sizing: border-box; width: calc(100% - 30mm); border-top: none;">
          <div style="flex: 1; text-align: left; padding-right: 20px; color: #000000; font-size: 13px;">
            <p style="margin: 0; color: #000000; font-size: 13px; text-align: left; font-weight: normal !important; line-height: 1.4;">${pdfPageFooterText || ''}</p>
          </div>
          <div style="font-weight: bold !important; white-space: nowrap; color: #000000; font-size: 13px;">
            Page ${pageIndex} / ${pagesTotal}
          </div>
        </div>
      `;

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <title>Rapport - ${snapshot.identifiant || report.defibIdentifiant || "-"}</title>
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
        </head>
        <body class="bg-white">
          <div id="print-container">
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- BARCODE HEADER -->
                <div style="display: flex; justify-content: center; width: 100%; margin-bottom: 5px; margin-top: -5px;">
                  <div style="text-align: center;">
                    ${generateBarcodeSVGString(snapshot.identifiant || report.defibIdentifiant || "EQUIP")}
                  </div>
                </div>

                <!-- SECTION 1 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">1 ‚Äî Informations g√©n√©rales.</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Client :</span> <span class="pdf-bold">${clientName || ""}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Contact sur place :</span> <span class="pdf-bold">${snapshot.nomPrenomSite || ""}</span></div>
                    <div class="pdf-line"><span class="pdf-label">T√©l√©phone du contact :</span> <span class="pdf-bold">${snapshot.telephoneSite || ""}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Email du contact :</span> <span class="pdf-bold">${snapshot.emailSite || ""}</span></div>
                    <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Sous contrat :</span> <span class="pdf-bold">${snapshot.contrat || "Non"}</span></div>
                    ${
                      snapshot.contrat === "Oui"
                        ? `
                      <div class="pdf-line"><span class="pdf-label">Nom du contrat :</span> <span class="pdf-bold">${snapshot.nomContrat || ""}</span></div>
                      <div class="pdf-line"><span class="pdf-label">R√©f√©rence contrat :</span> <span class="pdf-bold">${snapshot.referenceContrat || ""}</span></div>
                    `
                        : ""
                    }
                  </div>
                </div>

                <!-- SECTION 2 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">2 ‚Äî Sp√©cifications du mat√©riel (${snapshot.categorie}).</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Cat√©gorie :</span> <span class="pdf-bold">${snapshot.categorie || ""}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Identifiant unique :</span> <span class="pdf-bold">${snapshot.identifiant || ""}</span></div>
                    ${snapshot.codeNfc ? `<div class="pdf-line"><span class="pdf-label">Code NFC :</span> <span class="pdf-bold">${snapshot.codeNfc}</span></div>` : ""}
                    <div class="pdf-line"><span class="pdf-label">Statut GMAO :</span> <span class="pdf-bold">${snapshot.statutGmao || ""}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Mise en service :</span> <span class="pdf-bold">${snapshot.miseEnServiceDate || snapshot.miseEnService || ""}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Conformit√© g√©n√©rale :</span> <span class="pdf-bold ${snapshot.conforme === "Non" ? "text-rose-600 font-bold" : "text-emerald-600"}">${snapshot.conforme || "Oui"}</span></div>
                  </div>
                </div>
              </div>
              ${renderFooter(1, totalPages)}
            </div>

            <!-- PAGE 2 -->
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- CUSTOM SECTION / CHECKPOINTS -->
                ${
                  customProperties.length > 0
                    ? `
                  <div class="pdf-card">
                    <div class="pdf-card-header">3 ‚Äî Param√®tres sp√©cifiques & V√©rifications.</div>
                    <div class="pdf-card-body">
                      ${customProperties
                        .map(
                          ([key, val]) => `
                        <div class="pdf-line"><span class="pdf-label" style="text-transform: capitalize;">${key.replace(/([A-Z])/g, " $1")}:</span> <span class="pdf-bold">${val}</span></div>
                      `,
                        )
                        .join("")}
                    </div>
                  </div>
                `
                    : ""
                }

                <!-- ACTIONS, NOTES & CAPTURE EVIDENCE -->
                <div class="pdf-card">
                  <div class="pdf-card-header">4 ‚Äî Cl√¥ture de l'intervention.</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Technicien intervenant :</span> <span class="pdf-bold">${report.techName || "Administrateur"}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Date d‚Äôintervention :</span> <span class="pdf-bold">${report.date || "-"}</span></div>
                    ${report.endTimeStamp ? `<div class="pdf-line"><span class="pdf-label">Heure de fin :</span> <span class="pdf-bold">${report.endTimeStamp}</span></div>` : ""}
                    <div class="pdf-line" style="margin-bottom: 4px;">
                      <span class="pdf-label">Commentaire / Remarques :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireGmao || snapshot.commentaire || "Aucun commentaire."}</span>
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
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie globale du d√©fibrillateur.</span>
                          </div>
                        ` : ''}

                        ${report.photoArriereUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoArriereUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Arri√®re" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie arri√®re / √©tiquette.</span>
                          </div>
                        ` : ''}

                        ${report.photoResultatTestUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoResultatTestUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo R√©sultat Test" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">R√©sultat du test.</span>
                          </div>
                        ` : ''}

                        ${(!report.photoUrl && !report.photoArriereUrl && !report.photoResultatTestUrl) ? '<div style="font-size: 15px; color: #a1a1a1; font-style: italic;">Aucune photographie</div>' : ''}
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
                            <div style="background: transparent; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; max-height: 80px; max-width: 150px; gap: 2px; margin-top: 4px;">
                              <img src="${clientFound.clientSignatureImage}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature Client" />
                              <div style="font-size: 10px; color: #1e293b; font-style: italic; font-weight: bold !important;">Sign√© √©lectroniquement (dessin)</div>
                            </div>
                          ` : `
                            ${(report.clientPinCode && report.clientPinCode.trim()) ? `
                              <div style="font-size: 10px; color: #1e293b; font-style: italic; font-weight: bold !important; margin-top: 4px;">
                                Sign√© √©lectroniquement par PIN (${report.clientPinCode})
                              </div>
                            ` : ''}
                          `}
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
                ${renderHeader(docTitle)}
                <div class="pdf-grid" style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
                  <div class="pdf-card" style="flex: 1; min-height: 120mm; display: flex; flex-direction: column;">
                    <div class="pdf-card-header" style="font-weight: bold !important; margin-bottom: 10px;">
                      Informations compl√©mentaires
                    </div>
                    <div class="pdf-card-body" style="font-size: 15px; color: #000000; white-space: pre-line; line-height: 1.5; flex: 1;">
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
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      return;
    }

    // Resolve CompanyInfo
    const compLogo = companyInfo.logo || "";
    const compName = companyInfo.name || "D√©fibeo Solutions";
    const compEmail = companyInfo.email || "";
    const compPhone = companyInfo.phone || "";
    const compWebsite = companyInfo.website || "";

    const docTitle = report.title || "Rapport d‚Äôintervention GMAO";
    const pdfLastPageInfoText = companyInfo.pdfLastPageInfoText || "";
    const hasLastPage = pdfLastPageInfoText && pdfLastPageInfoText.trim().length > 0;
    const pdfHeaderBgColor = companyInfo.pdfHeaderBgColor || '#7c2882';
    const pdfCardBorderColor = companyInfo.pdfCardBorderColor || '#7d2882';
    const pdfCardBgColor = companyInfo.pdfCardBgColor || '#fef2ff';
    const pdfLabelTextColor = companyInfo.pdfLabelTextColor || '#9f71a2';
    const totalPages = hasLastPage ? 6 : 5;

    const renderHeader = (title: string) => {
      const showHeaderImg = companyInfo.pdfHeaderImg ? `<img src="${companyInfo.pdfHeaderImg}" style="max-height: 55px; max-width: 100%; object-fit: contain;" alt="Header Illustration" referrerPolicy="no-referrer" />` : '';
      const showHeaderLogo = companyInfo.logo ? `<img src="${companyInfo.logo}" style="max-height: 80px; object-fit: contain;" alt="Logo" referrerPolicy="no-referrer" />` : '';
      const showHeaderInfoText = companyInfo.pdfPageHeaderText ? `<div style="font-size: 14px; color: #000000; text-align: left; font-family: 'Civilprom', sans-serif !important;">${formatPdfHeaderText(companyInfo.pdfPageHeaderText)}</div>` : '';
      const showEmail = companyInfo.email ? `<div>${companyInfo.email}</div>` : '';
      const showPhone = companyInfo.phone ? `<div>${companyInfo.phone}</div>` : '';

      return `
        <div class="pdf-global-header" style="display: flex; flex-direction: row; width: calc(100% - 30mm); margin: 10mm 15mm 15px 15mm; padding-bottom: 10px; font-family: 'Civilprom', 'Inter', sans-serif !important; align-items: center; box-sizing: border-box;">
          <div style="width: 25%; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box; padding-right: 5px;">
            ${showHeaderLogo}
          </div>
          <div style="width: 35%; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left; box-sizing: border-box; padding: 0 5px; gap: 4px;">
            ${showHeaderImg}
            ${showHeaderInfoText}
          </div>
          <div style="width: 20%; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box; padding: 0 5px;">
            <div style="font-size: 14px; font-weight: bold !important; color: #000000; text-align: left; line-height: 1.1;">
              ${title}
            </div>
          </div>
          <div style="width: 20%; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; text-align: right; box-sizing: border-box; padding-left: 5px; font-size: 14px; color: #000000; gap: 2px;">
            <div style="font-weight: bold !important; margin-bottom: 2px;">${compName}</div>
            ${showEmail}
            ${showPhone}
          </div>
        </div>
      `;
    };

    const renderFooter = (pageIndex: number, pagesTotal: number) => {
      const footerText = companyInfo.pdfPageFooterText || "Rapport d‚Äôintervention original - Document certifi√© conforme";
      return `
        <div class="pdf-footer" style="position: absolute; bottom: 15mm; left: 15mm; right: 15mm; display: flex; flex-direction: row; justify-content: space-between; align-items: flex-end; font-size: 13px; color: #000000; padding-top: 8px; font-family: 'Civilprom', 'Inter', sans-serif !important; box-sizing: border-box; width: calc(100% - 30mm); border-top: none;">
          <div style="flex: 1; text-align: left; padding-right: 20px; color: #000000; font-size: 13px;">
            <p style="margin: 0; color: #000000; font-size: 13px; text-align: left; font-weight: normal !important; line-height: 1.4;">${footerText}</p>
          </div>
          <div style="font-weight: bold !important; white-space: nowrap; color: #000000; font-size: 13px;">
            Page ${pageIndex} / ${pagesTotal}
          </div>
        </div>
      `;
    };

    // Resolving Client Name
    let clientFound = clients.find((c) => c.id === snapshot.clientId);
    if (!clientFound && snapshot.clientId) {
      clientFound = clients.find((c) => c.denomination === snapshot.clientId || c.id === snapshot.clientId);
    }
    if (!clientFound && report.clientId) {
      clientFound = clients.find((c) => c.id === report.clientId);
    }
    if (!clientFound) {
      const siteEmail = snapshot.emailSite || report.emailSite || "";
      if (siteEmail) {
        clientFound = clients.find((c) => c.email && c.email.toLowerCase().trim() === siteEmail.toLowerCase().trim());
      }
    }
    if (!clientFound) {
      const siteNom = snapshot.nomPrenomSite || "";
      if (siteNom) {
        clientFound = clients.find((c) => c.denomination === siteNom || c.nomPrenomSite === siteNom);
      }
    }
    const clientName = clientFound
      ? clientFound.denomination
      : snapshot.nomPrenomSite || "Non rattach√©";

    // Resolving Model names from Variable list
    const targetDefib = (defibrillateurs || []).find((d: any) => 
      (snapshot.id && d.id === snapshot.id) || 
      (snapshot.identifiant && d.identifiant === snapshot.identifiant) ||
      (report.defibIdentifiant && d.identifiant === report.defibIdentifiant) ||
      (report.defibId && d.id === report.defibId)
    );
    const targetModeleId = snapshot.modeleId || report.modeleId || targetDefib?.modeleId;
    const defibModel = (variables || []).find((v: any) => v.id === targetModeleId && v.category === 'Mod√®le D√©fibrillateur') || (variables || []).find((v: any) => v.id === targetModeleId);
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

    const defibModelName = defibModel
      ? (defibModel.marque && defibModel.marque !== "Standard" ? `${defibModel.marque} ${defibModel.nom}` : defibModel.nom)
      : snapshot.modeleId || "Non sp√©cifi√©";

    const coffretModel = variables.find(
      (v) => v.id === snapshot.modeleCoffretId,
    );
    const coffretModelName = coffretModel
      ? (coffretModel.marque && coffretModel.marque !== "Standard" ? `${coffretModel.marque} ${coffretModel.nom}` : coffretModel.nom)
      : snapshot.modeleCoffretId || "Non sp√©cifi√©";

    const electrodeAModel = variables.find(
      (v) => v.id === snapshot.modeleElectrodeAId,
    );
    const electrodeAModelName = electrodeAModel
      ? (electrodeAModel.marque && electrodeAModel.marque !== "Standard" ? `${electrodeAModel.marque} ${electrodeAModel.nom}` : electrodeAModel.nom)
      : snapshot.modeleElectrodeAId || "Non sp√©cifi√©";

    const electrodeASecoursModel = variables.find(
      (v) => v.id === snapshot.modeleElectrodeASecoursId,
    );
    const electrodeASecoursModelName = electrodeASecoursModel
      ? (electrodeASecoursModel.marque && electrodeASecoursModel.marque !== "Standard" ? `${electrodeASecoursModel.marque} ${electrodeASecoursModel.nom}` : electrodeASecoursModel.nom)
      : "";

    const electrodePModel = variables.find(
      (v) => v.id === snapshot.modeleElectrodePId,
    );
    const electrodePModelName = electrodePModel
      ? (electrodePModel.marque && electrodePModel.marque !== "Standard" ? `${electrodePModel.marque} ${electrodePModel.nom}` : electrodePModel.nom)
      : snapshot.modeleElectrodePId || "Non sp√©cifi√©";

    const electrodePSecoursModel = variables.find(
      (v) => v.id === snapshot.modeleElectrodePSecoursId,
    );
    const electrodePSecoursModelName = electrodePSecoursModel
      ? (electrodePSecoursModel.marque && electrodePSecoursModel.marque !== "Standard" ? `${electrodePSecoursModel.marque} ${electrodePSecoursModel.nom}` : electrodePSecoursModel.nom)
      : "";

    const batterieModel = variables.find(
      (v) => v.id === snapshot.modeleBatterieId,
    );
    const batterieModelName = batterieModel
      ? (batterieModel.marque && batterieModel.marque !== "Standard" ? `${batterieModel.marque} ${batterieModel.nom}` : batterieModel.nom)
      : snapshot.modeleBatterieId || "Non sp√©cifi√©";

    // Helper to resolve stock pieces
    const getStockPieceLabel = (stockId: string) => {
      if (!stockId) return "-";
      const stockItem = stocks.find((s: any) => s.id === stockId);
      if (!stockItem) return stockId;
      const variableItem = variables.find(
        (v: any) => v.id === stockItem.denominationPieceId,
      );
      if (!variableItem) return `Pi√®ce (${stockItem.denominationPieceId})`;
      return `${variableItem.nom} (${variableItem.marque})`;
    };

    // Helper to resolve service label
    const getServiceLabel = (serviceId: string) => {
      if (!serviceId) return "";
      const stockItem = stocks.find((s: any) => s.id === serviceId);
      if (stockItem) {
        const variable = variables.find(
          (v: any) => v.id === stockItem.denominationPieceId,
        );
        return variable ? `${variable.nom} (${variable.marque})` : "Service";
      }
      const variable = variables.find((v: any) => v.id === serviceId);
      if (variable) {
        return `${variable.nom} (${variable.marque})`;
      }
      return serviceId;
    };

    const selElectrodeA = getStockPieceLabel(
      report.selectionElectrodeARemplacee,
    );
    const selElectrodeASecours = getStockPieceLabel(
      report.selectionElectrodeASecoursRemplacee,
    );
    const selElectrodeP = getStockPieceLabel(
      report.selectionElectrodePRemplacee,
    );
    const selElectrodePSecours = getStockPieceLabel(
      report.selectionElectrodePSecoursRemplacee,
    );
    const selBatterie = getStockPieceLabel(report.selectionBatterieRemplacee);
    const selKitSecours = getStockPieceLabel(
      report.selectionKitSecoursRemplace,
    );

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Rapport - ${snapshot.identifiant || report.defibIdentifiant || "-"}</title>
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
            ${renderHeader(docTitle)}

            <div class="pdf-grid">
              <!-- BARCODE HEADER -->
              <div style="display: flex; justify-content: center; width: 100%; margin-bottom: 5px; margin-top: -5px;">
                <div style="text-align: center;">
                  ${generateBarcodeSVGString(snapshot.identifiant || report.defibIdentifiant || "EQUIP")}
                </div>
              </div>

              <!-- SECTION 1 -->
              <div class="pdf-card">
                <div class="pdf-card-header">1 ‚Äî Informations g√©n√©rales.</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">Client :</span> <span class="pdf-bold">${clientName || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Contact :</span> <span class="pdf-bold">${snapshot.nomPrenomSite || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">T√©l√©phone du contact :</span> <span class="pdf-bold">${snapshot.telephoneSite || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Email du contact :</span> <span class="pdf-bold">${snapshot.emailSite || ""}</span></div>
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Type mat√©riel :</span> <span class="pdf-bold">${snapshot.categorie || 'D√©fibrillateur'}</span></div>
                  ${isVisibleNumeroAtlasante && (snapshot.numeroAtlasante || report.numeroAtlasante) ? `<div class="pdf-line"><span class="pdf-label">Num√©ro Atlasant√© :</span> <span class="pdf-bold">${snapshot.numeroAtlasante || report.numeroAtlasante || ''}</span></div>` : ''}
                  ${isVisibleVersionLogiciel ? `<div class="pdf-line"><span class="pdf-label">Version du logiciel :</span> <span class="pdf-bold">${snapshot.versionLogiciel || report.versionLogiciel || '‚Äî'}</span></div>` : ''}
                  <div class="pdf-line"><span class="pdf-label">Identifiant :</span> <span class="pdf-bold">${snapshot.identifiant || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">S√©rie :</span> <span class="pdf-bold">${snapshot.numeroSerie || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Mod√®le :</span> <span class="pdf-bold">${snapshot.modeleId ? defibModelName : ""}</span></div>
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Contrat :</span> <span class="pdf-bold">${snapshot.contrat || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">R√©f√©rence du contrat :</span> <span class="pdf-bold">${snapshot.referenceContrat || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Cat√©gorie du contrat :</span> <span class="pdf-bold">${snapshot.nomContrat || ""}</span></div>
                  ${isVisibleFactureBrouillon ? `
                  <div class="pdf-line"><span class="pdf-label">Facture :</span> <span class="pdf-bold">${report.emettreFactureBrouillon || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Service factur√© :</span> <span class="pdf-bold">${report.serviceEmettreId ? getServiceLabel(report.serviceEmettreId) : ""}</span></div>
                  ` : ''}
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Voie :</span> <span class="pdf-bold">${snapshot.numVoie || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Ville :</span> <span class="pdf-bold">${snapshot.ville || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Code Postal :</span> <span class="pdf-bold">${snapshot.cp || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">R√©gion :</span> <span class="pdf-bold">${snapshot.region || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Pays :</span> <span class="pdf-bold">${snapshot.pays || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Latitude GPS :</span> <span class="pdf-bold">${snapshot.latitude || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Longitude GPS :</span> <span class="pdf-bold">${snapshot.longitude || ""}</span></div>
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Fabrication :</span> <span class="pdf-bold">${snapshot.fabrication || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Mise en service :</span> <span class="pdf-bold">${snapshot.miseEnService || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Fin de garantie :</span> <span class="pdf-bold">${snapshot.finGarantie || ""}</span></div>
                </div>
              </div>
            </div>

            ${renderFooter(1, totalPages)}
          </div>

          <!-- PAGE 2 -->
          <div class="pdf-page">
            ${renderHeader(docTitle)}

            <div class="pdf-grid">
              <!-- SECTION 2 -->
              <div class="pdf-card">
                <div class="pdf-card-header">2 ‚Äî Coffret.</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">Mod√®le de bo√Ætier :</span> <span class="pdf-bold">${coffretModelName || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Lot de bo√Ætier :</span> <span class="pdf-bold">${snapshot.numeroLotCoffret || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">√âquip√© d‚Äôune alarme :</span> <span class="pdf-bold">${report.equipeAlarme || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Alarme fonctionnelle :</span> <span class="pdf-bold">${report.alarme || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Dispositif d‚Äôarmoire connect√©e :</span> <span class="pdf-bold">${report.armoireConnectee || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Dispositif handicap :</span> <span class="pdf-bold">${report.dispositifHandicap || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Signal√©tique conforme :</span> <span class="pdf-bold">${report.signaletiqueConforme || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire concernant le bo√Ætier :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireCoffret || ""}</span></div>
                </div>
              </div>

              <!-- SECTION 3 -->
              <div class="pdf-card">
                <div class="pdf-card-header">3 ‚Äî V√©rifications techniques.</div>
                <div class="pdf-card-body" style="gap: 3px;">
                  <div class="pdf-line"><span class="pdf-label">Conforme √† mon arriv√©e :</span> <span class="pdf-bold">${report.techConformeArrivee || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire sur l‚Äô√©tat √† mon arriv√©e :</span> <span class="pdf-bold">${report.techCommentaireArrivee || ""}</span></div>
                  ${isVisibleNettoyage ? `<div class="pdf-line"><span class="pdf-label">Nettoyage :</span> <span class="pdf-bold">${report.techNettoyage || ""}</span></div>` : ''}
                  ${isVisibleVoyantConforme ? `<div class="pdf-line"><span class="pdf-label">Voyant conforme :</span> <span class="pdf-bold">${report.techVoyantConforme || ""}</span></div>` : ''}
                  ${isVisibleEquipeMessageNumerique ? `<div class="pdf-line"><span class="pdf-label">√âquip√© d‚Äôun message num√©rique :</span> <span class="pdf-bold">${report.techEquipeMessageNumerique || ""}</span></div>` : ''}
                  ${isVisibleEquipeMessageNumerique && isVisibleMessageNumeriqueConforme ? `<div class="pdf-line"><span class="pdf-label">Message num√©rique conforme :</span> <span class="pdf-bold">${report.techMessageNumeroConforme || ""}</span></div>` : ''}
                  ${isVisibleGuidesVocaux ? `<div class="pdf-line"><span class="pdf-label">Guides vocaux conformes :</span> <span class="pdf-bold">${report.techGuidesVocauxConformes || ""}</span></div>` : ''}
                  ${isVisibleBranchementElectrodes ? `<div class="pdf-line"><span class="pdf-label">Branchement conforme des √©lectrodes :</span> <span class="pdf-bold">${report.techBranchementElectrodesConforme || ""}</span></div>` : ''}
                </div>
              </div>
            </div>

            ${renderFooter(2, totalPages)}
          </div>

          <!-- PAGE 3 -->
          <div class="pdf-page">
            ${renderHeader(docTitle)}

            <div class="pdf-grid">
              <!-- SECTION 4 -->
              ${isVisiblePadPakAdulte ? `
              <div class="pdf-card">
                <div class="pdf-card-header">4 ‚Äî √âlectrode Adulte ou Mixte (A).</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">Mod√®le d'√©lectrode A :</span> <span class="pdf-bold">${electrodeAModelName || ""}</span></div>
                  ${isVisibleLotPadPakA && snapshot.lotElectrodeA ? `<div class="pdf-line"><span class="pdf-label">Lot A :</span> <span class="pdf-bold">${snapshot.lotElectrodeA || ""}</span></div>` : ''}
                  ${snapshot.insertionElectrodeA ? `<div class="pdf-line"><span class="pdf-label">Insertion :</span> <span class="pdf-bold">${snapshot.insertionElectrodeA || ""}</span></div>` : ''}
                  ${isVisiblePeremptionPadPakA && snapshot.peremptionElectrodeA ? `<div class="pdf-line"><span class="pdf-label">P√©remption :</span> <span class="pdf-bold">${snapshot.peremptionElectrodeA || ""}</span></div>` : ''}
                  ${snapshot.hasPadpakA === 'Oui' ? `
                    <div class="pdf-line"><span class="pdf-label">PadPak :</span> <span class="pdf-bold">Oui</span></div>
                    ${isVisibleLotPadPakA && snapshot.lotPadpakA ? `<div class="pdf-line"><span class="pdf-label">Lot PadPak A :</span> <span class="pdf-bold">${snapshot.lotPadpakA || ""}</span></div>` : ''}
                    ${isVisiblePeremptionPadPakA && snapshot.peremptionPadpakA ? `<div class="pdf-line"><span class="pdf-label">P√©remption PadPak A :</span> <span class="pdf-bold">${snapshot.peremptionPadpakA || ""}</span></div>` : ''}
                  ` : ''}
                  
                  <div class="pdf-line"><span class="pdf-label">Mod√®le √©lectrode secours :</span> <span class="pdf-bold">${electrodeASecoursModelName || "Aucun"}</span></div>
                  ${isVisibleLotPadPakA && snapshot.lotElectrodeASecours ? `<div class="pdf-line"><span class="pdf-label">Lot de secours :</span> <span class="pdf-bold">${snapshot.lotElectrodeASecours || ""}</span></div>` : ''}
                  ${isVisiblePeremptionPadPakA && snapshot.peremptionSecoursElectrodeA ? `<div class="pdf-line"><span class="pdf-label">P√©remption de secours :</span> <span class="pdf-bold">${snapshot.peremptionSecoursElectrodeA || ""}</span></div>` : ''}
                  
                  <div class="pdf-line"><span class="pdf-label">√âlectrode A remplac√©e :</span> <span class="pdf-bold">${report.electrodeARemplacee || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">S√©lection de l'√©lectrode remplac√©e :</span> <span class="pdf-bold">${selElectrodeA || ""}</span></div>
                  
                  <div class="pdf-line"><span class="pdf-label">√âlectrode A Secours remplac√©e :</span> <span class="pdf-bold">${report.electrodeASecoursRemplacee || "Non"}</span></div>
                  <div class="pdf-line"><span class="pdf-label">S√©lection de l'√©lectrode Secours A remplac√©e :</span> <span class="pdf-bold">${selElectrodeASecours || ""}</span></div>
                  
                  <div class="pdf-line"><span class="pdf-label">√âlectrode A conforme et fonctionnelle :</span> <span class="pdf-bold">${report.electrodeAConformeSante || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire concernant l‚Äô√©lectrode A :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireElectrodeA || ""}</span></div>
                </div>
              </div>
              ` : ''}

              <!-- SECTION 5 -->
              ${isVisiblePadPakPediatrique ? `
              <div class="pdf-card">
                <div class="pdf-card-header">5 ‚Äî √âlectrode P√©diatrique (P).</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">Mod√®le d'√©lectrode P :</span> <span class="pdf-bold">${electrodePModelName || ""}</span></div>
                  ${isVisibleLotPadPakP && isVisibleLotP && snapshot.lotElectrodeP ? `<div class="pdf-line"><span class="pdf-label">Lot P :</span> <span class="pdf-bold">${snapshot.lotElectrodeP || ""}</span></div>` : ''}
                  ${snapshot.insertionElectrodeP ? `<div class="pdf-line"><span class="pdf-label">Insertion :</span> <span class="pdf-bold">${snapshot.insertionElectrodeP || ""}</span></div>` : ''}
                  ${isVisiblePeremptionPadPakP && snapshot.peremptionElectrodeP ? `<div class="pdf-line"><span class="pdf-label">P√©remption :</span> <span class="pdf-bold">${snapshot.peremptionElectrodeP || ""}</span></div>` : ''}
                  ${snapshot.hasPadpakP === 'Oui' ? `
                    <div class="pdf-line"><span class="pdf-label">PadPak :</span> <span class="pdf-bold">Oui</span></div>
                    ${isVisibleLotPadPakP && snapshot.lotPadpakP ? `<div class="pdf-line"><span class="pdf-label">Lot PadPak P :</span> <span class="pdf-bold">${snapshot.lotPadpakP || ""}</span></div>` : ''}
                    ${isVisiblePeremptionPadPakP && snapshot.peremptionPadpakP ? `<div class="pdf-line"><span class="pdf-label">P√©remption PadPak P :</span> <span class="pdf-bold">${snapshot.peremptionPadpakP || ""}</span></div>` : ''}
                  ` : ''}
                  
                  <div class="pdf-line"><span class="pdf-label">Mod√®le √©lectrode secours :</span> <span class="pdf-bold">${electrodePSecoursModelName || "Aucun"}</span></div>
                  ${isVisibleLotPadPakP && isVisibleLotP && snapshot.lotElectrodePSecours ? `<div class="pdf-line"><span class="pdf-label">Lot de secours :</span> <span class="pdf-bold">${snapshot.lotElectrodePSecours || ""}</span></div>` : ''}
                  ${isVisiblePeremptionPadPakP && snapshot.peremptionSecoursElectrodeP ? `<div class="pdf-line"><span class="pdf-label">P√©remption de secours :</span> <span class="pdf-bold">${snapshot.peremptionSecoursElectrodeP || ""}</span></div>` : ''}
                  
                  <div class="pdf-line"><span class="pdf-label">√âlectrode P remplac√©e :</span> <span class="pdf-bold">${report.electrodePRemplacee || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">S√©lection de l'√©lectrode remplac√©e :</span> <span class="pdf-bold">${selElectrodeP || ""}</span></div>
                  
                  <div class="pdf-line"><span class="pdf-label">√âlectrode P Secours remplac√©e :</span> <span class="pdf-bold">${report.electrodePSecoursRemplacee || "Non"}</span></div>
                  <div class="pdf-line"><span class="pdf-label">S√©lection de l'√©lectrode Secours P remplac√©e :</span> <span class="pdf-bold">${selElectrodePSecours || ""}</span></div>
                  
                  <div class="pdf-line"><span class="pdf-label">√âlectrode P conforme et fonctionnelle :</span> <span class="pdf-bold">${report.electrodePConformeSante || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire concernant l‚Äô√©lectrode P :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireElectrodeP || ""}</span></div>
                </div>
              </div>
              ` : ''}
            </div>

            ${renderFooter(3, totalPages)}
          </div>

          <!-- PAGE 4 -->
          <div class="pdf-page">
            ${renderHeader(docTitle)}

            <div class="pdf-grid">
              <!-- SECTION 6 -->
              <div class="pdf-card">
                <div class="pdf-card-header">6 ‚Äî Batterie (B).</div>
                <div class="pdf-card-body">
                  <div class="pdf-line"><span class="pdf-label">Mod√®le de batterie :</span> <span class="pdf-bold">${batterieModelName || ""}</span></div>
                  ${isVisiblePourcentageBatterie ? `<div class="pdf-line"><span class="pdf-label">Pourcentage de charge :</span> <span class="pdf-bold">${snapshot.pourcentageBatterie ? snapshot.pourcentageBatterie + "%" : ""}</span></div>` : ''}
                  ${snapshot.lotBatterie ? `<div class="pdf-line"><span class="pdf-label">Lot B :</span> <span class="pdf-bold">${snapshot.lotBatterie || ""}</span></div>` : ''}
                  ${isVisibleFabricationBatterie && snapshot.fabricationBatterie ? `<div class="pdf-line"><span class="pdf-label">Fabrication :</span> <span class="pdf-bold">${snapshot.fabricationBatterie || ""}</span></div>` : ''}
                  ${isVisibleInsertionBatterie && snapshot.insertionBatterie ? `<div class="pdf-line"><span class="pdf-label">Insertion :</span> <span class="pdf-bold">${snapshot.insertionBatterie || ""}</span></div>` : ''}
                  ${isVisiblePeremptionBatterie ? `<div class="pdf-line"><span class="pdf-label">P√©remption :</span> <span class="pdf-bold">${snapshot.peremptionBatterie || ""}</span></div>` : ''}
                  <div class="pdf-line"><span class="pdf-label">Batterie remplac√©e :</span> <span class="pdf-bold">${report.batterieRemplacee || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">S√©lection de la batterie remplac√©e :</span> <span class="pdf-bold">${selBatterie || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Batterie conforme et fonctionnelle :</span> <span class="pdf-bold">${report.batterieConformeSante || ""}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Commentaire concernant la batterie :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireBatterie || ""}</span></div>
                </div>
              </div>

              <!-- SECTION 7 -->
              <div class="pdf-card">
                <div class="pdf-card-header">7 ‚Äî V√©rifications du kit de secours.</div>
                <div class="pdf-card-body" style="gap: 3px;">
                  ${isVisiblePeremptionTrousse ? `
                    <div class="pdf-line"><span class="pdf-label">Trousse de secours pr√©sente :</span> <span class="pdf-bold">${report.kitTrousseSecoursPresent || ""}</span></div>
                    ${snapshot.peremptionTrousse || report.peremptionTrousse ? `<div class="pdf-line"><span class="pdf-label">P√©remption de la trousse :</span> <span class="pdf-bold">${snapshot.peremptionTrousse || report.peremptionTrousse || ''}</span></div>` : ''}
                    <div class="pdf-line"><span class="pdf-label">Kit de secours remplac√© ou ajout√© :</span> <span class="pdf-bold">${report.kitSecoursRemplaceOuAjoute || ""}</span></div>
                    <div class="pdf-line"><span class="pdf-label">S√©lection d‚Äôun kit de secours :</span> <span class="pdf-bold">${selKitSecours || ""}</span></div>
                  ` : ''}
                  ${isVisibleCiseauxPresents ? `<div class="pdf-line"><span class="pdf-label">Ciseaux pr√©sents :</span> <span class="pdf-bold">${report.kitCiseauxPresents || ""}</span></div>` : ''}
                  ${isVisibleMasquePresent ? `<div class="pdf-line"><span class="pdf-label">Masque pr√©sent :</span> <span class="pdf-bold">${report.kitMasquePresent || ""}</span></div>` : ''}
                  ${isVisibleMasquePresent && isVisiblePeremptionMasque ? `<div class="pdf-line"><span class="pdf-label">P√©remption du masque :</span> <span class="pdf-bold">${report.kitPeremptionMasque || snapshot.kitPeremptionMasque || ''}</span></div>` : ''}
                  ${isVisibleServiettesPresentes ? `<div class="pdf-line"><span class="pdf-label">Serviettes pr√©sentes :</span> <span class="pdf-bold">${report.kitServiettesPresentes || ""}</span></div>` : ''}
                  ${isVisibleServiettesPresentes && isVisiblePeremptionServiettes ? `<div class="pdf-line"><span class="pdf-label">P√©remption des serviettes :</span> <span class="pdf-bold">${report.kitPeremptionServiettes || snapshot.kitPeremptionServiettes || ''}</span></div>` : ''}
                  ${isVisibleGantsPresents ? `<div class="pdf-line"><span class="pdf-label">Paires de gants pr√©sents :</span> <span class="pdf-bold">${report.kitGantsPresents || ""}</span></div>` : ''}
                  ${isVisibleRasoir ? `<div class="pdf-line"><span class="pdf-label">Rasoir :</span> <span class="pdf-bold">${report.kitRasoirPresent || ""}</span></div>` : ''}
                </div>
              </div>
            </div>

            ${renderFooter(4, totalPages)}
          </div>

          <!-- PAGE 5 -->
          <div class="pdf-page">
            ${renderHeader(docTitle)}

            <div class="pdf-grid">
              <!-- SECTION 8 -->
              <div class="pdf-card">
                <div class="pdf-card-header">8 ‚Äî Diagnostic et cl√¥ture.</div>
                <div class="pdf-card-body" style="display: flex; flex-direction: column; gap: 6px;">
                  <div class="pdf-line">
                    <span class="pdf-label">D√©fibrillateur conforme et pr√™t √† l‚Äôusage :</span> <span class="pdf-bold">${snapshot.conforme === "Oui" || report.conforme === "Oui" ? "Oui" : "Non"}</span>
                  </div>
                  <div class="pdf-line" style="margin-top: 15px;">
                    <span class="pdf-label">Horodatage entrant :</span> <span class="pdf-bold">${report.date || "-"}</span>
                  </div>
                  <div class="pdf-line">
                    <span class="pdf-label">Horodatage cl√¥ture :</span> <span class="pdf-bold">${report.endTimeStamp || "-"}</span>
                  </div>
                  <div class="pdf-line">
                    <span class="pdf-label">Dur√©e :</span> <span class="pdf-bold">${computeDurationText(report.date, report.endTimeStamp)}</span>
                  </div>
                  <div class="pdf-line" style="margin-top: 15px;">
                    <span class="pdf-label">Commentaire :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaire || report.defibSnapshot?.commentaire || "-"}</span>
                  </div>
                  <div class="pdf-line" style="margin-top: 6px;">
                    <span class="pdf-label">Fichier(s) :</span>
                    <span class="pdf-bold">
                      ${report.attachments && report.attachments.length > 0
                        ? report.attachments.map((file: any) => `<a href="${file.url}" target="_blank" style="color: #772a7e; text-decoration: underline; margin-right: 8px;">${file.name}</a>`).join(', ')
                        : "-"}
                    </span>
                  </div>
                  <div class="pdf-line" style="margin-top: 6px; margin-bottom: 4px;">
                    <span class="pdf-label">Technicien :</span> <span class="pdf-bold">${report.techName || "-"}</span>
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
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie globale du d√©fibrillateur.</span>
                          </div>
                        ` : ''}

                        ${report.photoArriereUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoArriereUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Arri√®re" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie arri√®re / √©tiquette.</span>
                          </div>
                        ` : ''}

                        ${report.photoResultatTestUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoResultatTestUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Resultat Test" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">R√©sultat du test.</span>
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
                            <div style="font-size: 11px; margin-bottom: 2px; font-family: 'Civilprom', sans-serif !important;">
                              <span class="pdf-label" style="font-size:11px; color:rgb(138, 138, 138); font-family: 'Civilprom', sans-serif !important;">Code validation :</span> 
                              <span class="pdf-bold" style="font-size:11px; font-family: 'Civilprom', sans-serif !important; font-weight: bold !important; color:#000;">${report.clientPinCode}</span>
                            </div>
                          ` : ''}
                          ${clientFound && clientFound.clientSignatureImage ? `
                            <div style="background: transparent; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; max-height: 80px; max-width: 150px; gap: 2px; margin-top: 4px;">
                              <img src="${clientFound.clientSignatureImage}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature Client" />
                              <div style="font-size: 10px; color: #1e293b; font-style: italic; font-weight: bold !important;">Sign√© √©lectroniquement (dessin)</div>
                            </div>
                          ` : `
                            ${(report.clientPinCode && report.clientPinCode.trim()) ? `
                              <div style="font-size: 11px; color: #1e293b; font-style: italic; font-weight: bold !important; margin-top: 4px;">
                                Sign√© √©lectroniquement par PIN (${report.clientPinCode})
                              </div>
                            ` : ''}
                          `}
                        ` : ''}
                      </div>
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
              ${renderHeader(docTitle)}
              <div class="pdf-grid" style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
                <div class="pdf-card" style="flex: 1; min-height: 120mm; display: flex; flex-direction: column;">
                  <div class="pdf-card-header" style="font-weight: bold !important; margin-bottom: 10px;">
                    Informations compl√©mentaires
                  </div>
                  <div class="pdf-card-body" style="font-size: 15px; color: #000000; white-space: pre-line; line-height: 1.5; flex: 1;">
                    ${pdfLastPageInfoText}
                  </div>
                </div>
              </div>
              ${renderFooter(6, totalPages)}
            </div>
          ` : ""}

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
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  // TIME WORK tracking state variables
  const [expandedPointageIds, setExpandedPointageIds] = useState<Record<string, boolean>>({});
  const togglePointageExpanded = (id: string) => {
    setExpandedPointageIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [pointages, setPointages] = useState<PointageLog[]>(() => {
    const envId = localStorage.getItem("defib_tenant_id") || "demo";
    const saved = localStorage.getItem(`defib_${envId}_pointages_history`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return [
      {
        id: "pt-1",
        techName: "Technicien Ouest",
        startDate: "02-06-2026",
        startTime: "08:00",
        endDate: "02-06-2026",
        endTime: "12:00",
        durationSeconds: 14400,
        isOngoing: false,
      },
    ];
  });

  useEffect(() => {
    if (propPointages) {
      setPointages(propPointages);
    }
  }, [propPointages]);

  const savePointages = (updated: PointageLog[]) => {
    setPointages(updated);
    const envId = localStorage.getItem("defib_tenant_id") || "demo";
    localStorage.setItem(
      `defib_${envId}_pointages_history`,
      JSON.stringify(updated),
    );
    if (onUpdatePointages) {
      onUpdatePointages(updated);
    }
  };

  // Track ticker in seconds for active stopwatch
  const [ongoingSeconds, setOngoingSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const activePointage = pointages.find(
      (p) => p.isOngoing && p.techName === authenticatedUser?.name,
    );
    if (activePointage) {
      const getStartDateTime = (
        startDateStr: string,
        startTimeStr: string,
      ): Date => {
        const parts = startDateStr.split(/[-/]/);
        const tParts = startTimeStr.split(":");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const date = new Date(year, month, day);
          date.setHours(parseInt(tParts[0], 10), parseInt(tParts[1], 10), 0, 0);
          return date;
        }
        const fallback = new Date();
        fallback.setHours(
          parseInt(tParts[0], 10),
          parseInt(tParts[1], 10),
          0,
          0,
        );
        return fallback;
      };

      const startObj = getStartDateTime(
        activePointage.startDate,
        activePointage.startTime,
      );

      const checkAndTick = () => {
        const now = new Date();
        const diffSeconds = Math.max(
          0,
          Math.round((now.getTime() - startObj.getTime()) / 1000),
        );

        if (diffSeconds >= 10 * 3600) {
          const tenHoursLater = new Date(startObj.getTime() + 10 * 3600 * 1000);
          const activeIdx = pointages.findIndex(
            (p) => p.id === activePointage.id,
          );
          if (activeIdx !== -1) {
            const updated = [...pointages];
            updated[activeIdx] = {
              ...activePointage,
              endDate: tenHoursLater.toLocaleDateString("fr-FR"),
              endTime:
                String(tenHoursLater.getHours()).padStart(2, "0") +
                ":" +
                String(tenHoursLater.getMinutes()).padStart(2, "0"),
              durationSeconds: 10 * 3600,
              comment:
                activePointage.comment && activePointage.comment.trim()
                  ? activePointage.comment.trim()
                  : "Nouvelle p√©riode sans titre.",
              isOngoing: false,
            };
            savePointages(updated);
            alert(
              "Pointage arr√™t√© automatiquement : dur√©e maximum de 10 heures atteinte.",
            );
          }
        } else {
          setOngoingSeconds(diffSeconds);
        }
      };

      checkAndTick();
      interval = setInterval(checkAndTick, 1000);
    } else {
      setOngoingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [pointages, authenticatedUser]);

  // Expenses state variables
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const envId = localStorage.getItem("defib_tenant_id") || "demo";
    const saved = localStorage.getItem(`defib_${envId}_expenses`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return [
      {
        id: "exp-1",
        techName: "Thierry Martin",
        title: "Abonnement Parking Nantes",
        amountTtc: 18.2,
        amountHt: 15.17,
        amountTva: 3.03,
        dateStr: "2026-06-02",
        photoUrl:
          "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=100&auto=format&fit=crop",
      },
    ];
  });

  useEffect(() => {
    if (propExpenses) {
      setExpenses(propExpenses);
    }
  }, [propExpenses]);

  const saveExpenses = (updated: Expense[]) => {
    setExpenses(updated);
    const envId = localStorage.getItem("defib_tenant_id") || "demo";
    try {
      localStorage.setItem(`defib_${envId}_expenses`, JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage quota exceeded for expenses in PublicPortal:", e);
    }
    if (onUpdateExpenses) {
      onUpdateExpenses(updated);
    }
  };

  // Veille state variables
  const [veilles, setVeilles] = useState<VeilleRecord[]>(() => {
    const envId = localStorage.getItem("defib_tenant_id") || "demo";
    const saved = localStorage.getItem(`defib_${envId}_veilles`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  useEffect(() => {
    if (propVeilles) {
      setVeilles(propVeilles);
    }
  }, [propVeilles]);

  const saveVeilles = (updated: VeilleRecord[]) => {
    setVeilles(updated);
    const envId = localStorage.getItem("defib_tenant_id") || "demo";
    try {
      localStorage.setItem(`defib_${envId}_veilles`, JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage quota exceeded for veilles in PublicPortal:", e);
    }
    if (onUpdateVeilles) {
      onUpdateVeilles(updated);
    }
  };

  // New veille form state
  const [veilleCommune, setVeilleCommune] = useState("");
  const [veilleVolume, setVeilleVolume] = useState("");
  const [veilleMainteneur, setVeilleMainteneur] = useState("");
  const [veilleProchaine, setVeilleProchaine] = useState("");
  const [veilleContactNom, setVeilleContactNom] = useState("");
  const [veilleContactEmail, setVeilleContactEmail] = useState("");
  const [veilleContactTel, setVeilleContactTel] = useState("");

  const [expenseSuccessMessage, setExpenseSuccessMessage] = useState("");
  const [veilleSuccessMessage, setVeilleSuccessMessage] = useState("");

  const handleAddVeille = (e: React.FormEvent) => {
    e.preventDefault();
    if (!veilleCommune || !veilleVolume || !veilleMainteneur || !veilleProchaine || !veilleContactNom || !veilleContactEmail || !veilleContactTel) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    const newVeille: VeilleRecord = {
      id: "veille-" + Date.now(),
      commune: veilleCommune.trim(),
      volume: parseFloat(veilleVolume) || 0,
      mainteneurActuel: veilleMainteneur.trim(),
      prochaineMaintenance: veilleProchaine,
      contactNomPrenom: veilleContactNom.trim(),
      contactEmail: veilleContactEmail.trim(),
      contactTelephone: veilleContactTel.trim(),
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    saveVeilles([newVeille, ...veilles]);

    // Reset form
    setVeilleCommune("");
    setVeilleVolume("");
    setVeilleMainteneur("");
    setVeilleProchaine("");
    setVeilleContactNom("");
    setVeilleContactEmail("");
    setVeilleContactTel("");
    
    setVeilleSuccessMessage("Parfait! Le relev√© concurrentiel est enregistr√© avec succ√®s.");
    setTimeout(() => {
      setVeilleSuccessMessage("");
    }, 5000);
  };

  // New expense form state
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseTtc, setExpenseTtc] = useState("");
  const [expenseHt, setExpenseHt] = useState("");
  const [expenseTva, setExpenseTva] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [expensePhotoUrl, setExpensePhotoUrl] = useState("");
  const expensePhotoInputRef = useRef<HTMLInputElement>(null);

  // Localisation form states for the connected technician
  const [techStartAddress, setTechStartAddress] = useState("");
  const [techStartStreet, setTechStartStreet] = useState("");
  const [techStartCity, setTechStartCity] = useState("");
  const [techStartZip, setTechStartZip] = useState("");
  const [techStartRegion, setTechStartRegion] = useState("");
  const [techStartCountry, setTechStartCountry] = useState("France");
  const [techStartLat, setTechStartLat] = useState("");
  const [techStartLng, setTechStartLng] = useState("");
  const [routeOptimization, setRouteOptimization] = useState(
    "Aller au plus proche d'abord",
  );
  const [defaultNavApp, setDefaultNavApp] = useState("apple-maps");

  // Autopopulate technician location details on login / select tab
  useEffect(() => {
    if (authenticatedUser) {
      const liveMember = members.find((m) => m.name.trim().toLowerCase() === authenticatedUser.name.trim().toLowerCase());
      if (liveMember) {
        setTechLocationLink(liveMember.locationLink || "");
        const loadedGpsLink = liveMember.gpsSharingLink ||
            localStorage.getItem(
              `defib_tech_location_link_${liveMember.name}`,
            ) ||
            "";
        setGpsSharingLink(loadedGpsLink === "Partag√©" ? "Partag√©" : "Non partag√©");
        // Sync Google Calendar email from master database Member record
        if (liveMember.googleCalEmail) {
          setSyncedGoogleEmail(liveMember.googleCalEmail);
        } else {
          const localEmail = localStorage.getItem(`defib_google_cal_email_${liveMember.name}`);
          setSyncedGoogleEmail(localEmail || null);
        }
        // Load structured address fields from liveMember
        setTechStartStreet(liveMember.startAddressStreet || "");
        setTechStartCity(liveMember.startAddressCity || "");
        setTechStartZip(liveMember.startAddressZip || "");
        setTechStartRegion(liveMember.startAddressRegion || "");
        setTechStartCountry(liveMember.startAddressCountry || "France");
        const cleanLat = (liveMember.startAddressLat !== undefined && liveMember.startAddressLat !== null && String(liveMember.startAddressLat).toLowerCase() !== 'null' && String(liveMember.startAddressLat).toLowerCase() !== 'nan' && !isNaN(Number(liveMember.startAddressLat))) ? String(liveMember.startAddressLat) : "";
        const cleanLng = (liveMember.startAddressLng !== undefined && liveMember.startAddressLng !== null && String(liveMember.startAddressLng).toLowerCase() !== 'null' && String(liveMember.startAddressLng).toLowerCase() !== 'nan' && !isNaN(Number(liveMember.startAddressLng))) ? String(liveMember.startAddressLng) : "";
        setTechStartLat(cleanLat);
        setTechStartLng(cleanLng);
        setTechSignature(liveMember.signature);
      } else {
        // Fallback or read from localStorage if any
        const envId = localStorage.getItem("defib_tenant_id") || "demo";
        setTechStartStreet(localStorage.getItem(`defib_${envId}_tech_start_street_${authenticatedUser.name}`) || "");
        setTechStartCity(localStorage.getItem(`defib_${envId}_tech_start_city_${authenticatedUser.name}`) || "");
        setTechStartZip(localStorage.getItem(`defib_${envId}_tech_start_zip_${authenticatedUser.name}`) || "");
        setTechStartRegion(localStorage.getItem(`defib_${envId}_tech_start_region_${authenticatedUser.name}`) || "");
        setTechStartCountry(localStorage.getItem(`defib_${envId}_tech_start_country_${authenticatedUser.name}`) || "France");
        const rawLocalLat = localStorage.getItem(`defib_${envId}_tech_start_lat_${authenticatedUser.name}`) || "";
        const cleanLocalLat = (rawLocalLat && rawLocalLat.toLowerCase() !== 'null' && rawLocalLat.toLowerCase() !== 'undefined' && rawLocalLat.toLowerCase() !== 'nan') ? rawLocalLat : "";
        const rawLocalLng = localStorage.getItem(`defib_${envId}_tech_start_lng_${authenticatedUser.name}`) || "";
        const cleanLocalLng = (rawLocalLng && rawLocalLng.toLowerCase() !== 'null' && rawLocalLng.toLowerCase() !== 'undefined' && rawLocalLng.toLowerCase() !== 'nan') ? rawLocalLng : "";
        setTechStartLat(cleanLocalLat);
        setTechStartLng(cleanLocalLng);
        setTechSignature(authenticatedUser.signature);
      }

      // Load stored starting address if any, preferring the liveMember fields
      const envId = localStorage.getItem("defib_tenant_id") || "demo";
      const savedStart = (liveMember && liveMember.startAddress)
        ? liveMember.startAddress
        : (localStorage.getItem(`defib_${envId}_tech_start_address_${authenticatedUser.name}`) || "");
      const savedOptVal = (liveMember && liveMember.optimizationPreference)
        ? liveMember.optimizationPreference
        : (localStorage.getItem(`defib_${envId}_tech_optimization_${authenticatedUser.name}`) || "proche");
      const savedNavApp = localStorage.getItem(
        `defib_${envId}_tech_nav_app_${authenticatedUser.name}`,
      ) || "apple-maps";

      if (savedStart) setTechStartAddress(savedStart);
      
      if (savedOptVal === "loin" || savedOptVal.includes("loin")) {
        setRouteOptimization("Aller au plus loin d'abord");
      } else {
        setRouteOptimization("Aller au plus proche d'abord");
      }

      if (savedNavApp) setDefaultNavApp(savedNavApp);

      const savedHidePointage = (liveMember && typeof liveMember.hidePointage === "boolean")
        ? liveMember.hidePointage
        : (authenticatedUser && typeof authenticatedUser.hidePointage === "boolean")
          ? authenticatedUser.hidePointage
          : (localStorage.getItem(`defib_${envId}_tech_hide_pointage_${authenticatedUser.name}`) !== null
              ? localStorage.getItem(`defib_${envId}_tech_hide_pointage_${authenticatedUser.name}`) === "true"
              : localStorage.getItem("defib_hide_pointage") === "true");
      setHidePointage(savedHidePointage);
    }
  }, [authenticatedUser, activeTab, members]);

  // Render signature onto canvas in technician portal
  useEffect(() => {
    if (activeTab === "localisation" && sigCanvasRef.current) {
      const canvas = sigCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (techSignature) {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          };
          img.src = techSignature;
        }
      }
    }
  }, [activeTab, techSignature]);

  // Auto-scroll to first mission with status "√Ä faire" when arriving on Interventions tab (if tour open)
  useEffect(() => {
    if (activeTab === "interventions" && selectedTourId) {
      const currentTour = tours.find((t) => t.id === selectedTourId);
      if (currentTour && currentTour.status !== "Termin√©" && currentTour.passages) {
        const firstTodo = currentTour.passages.find((p: any) => p.status === "√Ä faire");
        if (firstTodo) {
          const timer = setTimeout(() => {
            const el = document.getElementById(`passage-card-${firstTodo.num}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 250);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [activeTab, selectedTourId, tours]);

  // Auto-geocode connected technician's start address
  useEffect(() => {
    const triggerGeocoding = async () => {
      if (!techStartCity.trim()) return;
      
      // Try full address first (with street)
      let fullAddress = "";
      if (techStartStreet.trim()) {
        fullAddress = `${techStartStreet.trim()}, ${techStartZip.trim()} ${techStartCity.trim()}, ${techStartCountry.trim()}`;
      } else {
        fullAddress = `${techStartZip.trim()} ${techStartCity.trim()}, ${techStartCountry.trim()}`;
      }
      
      let coord = await geocodeAddress(fullAddress);
      
      // Fallback: try without street if full address fails
      if (!coord && techStartStreet.trim()) {
        const fallbackAddress = `${techStartZip.trim()} ${techStartCity.trim()}, ${techStartCountry.trim()}`;
        coord = await geocodeAddress(fallbackAddress);
      }
      
      if (coord) {
        setTechStartLat(String(coord.lat));
        setTechStartLng(String(coord.lng));
      }
    };

    const delayDebounce = setTimeout(() => {
      triggerGeocoding();
    }, 1200); // 1.2s debounce

    return () => clearTimeout(delayDebounce);
  }, [techStartStreet, techStartCity, techStartZip, techStartCountry]);

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setTechStartLat(String(latitude.toFixed(6)));
          setTechStartLng(String(longitude.toFixed(6)));
          
          // Reverse geocode to populate address if possible (optional but great!)
          try {
            const response = await fetch(
              `https://api-adresse.data.gouv.fr/reverse/?lon=${longitude}&lat=${latitude}`
            );
            if (response.ok) {
              const data = await response.json();
              if (data?.features?.[0]?.properties) {
                const props = data.features[0].properties;
                if (props.name) setTechStartStreet(props.name);
                if (props.city) setTechStartCity(props.city);
                if (props.postcode) setTechStartZip(props.postcode);
              }
            }
          } catch (e) {
            console.error("Reverse geocoding failed", e);
          }
        },
        (error) => {
          alert("Impossible d'obtenir la position actuelle : " + error.message);
        }
      );
    } else {
      alert("La g√©olocalisation n'est pas support√©e par votre navigateur.");
    }
  };

  // Handle DAE lookup selection
  const handleDefibLookupChange = (daeId: string) => {
    setSelectedDefibId(daeId);
    const found = defibrillateurs.find((df) => df.id === daeId);
    if (found) {
      // Cloned deep fields to form
      setSelectedDefibData({ ...found });

      // Build initial timestamp for Horodate
      const now = new Date();
      const d = String(now.getDate()).padStart(2, "0");
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const y = now.getFullYear();
      const h = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      setHorodateInput(`${d}-${m}-${y} ${h}:${min}:${s}`);
    } else {
      setSelectedDefibData(null);
    }
  };

  // Auto tax calculations helper
  const handleTtcChange = (val: string) => {
    setExpenseTtc(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const calculatedTva = num * 0.2;
      const calculatedHt = num - calculatedTva;
      setExpenseHt(calculatedHt.toFixed(2));
      setExpenseTva(calculatedTva.toFixed(2));
    } else {
      setExpenseHt("");
      setExpenseTva("");
    }
  };

  const handleHtChange = (val: string) => {
    setExpenseHt(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const ttcNum = num / 0.8;
      const tvaNum = ttcNum * 0.2;
      setExpenseTtc(ttcNum.toFixed(2));
      setExpenseTva(tvaNum.toFixed(2));
    } else {
      setExpenseTtc("");
      setExpenseTva("");
    }
  };

  // File Picker Base64 helper with auto-resize and compression (avoids Storage quota exceeded)
  const triggerPhotoRead = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawBase64 = reader.result as string;
        // Check if image format can be loaded into an Image object
        const img = new Image();
        img.onload = () => {
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6); // 60% quality is perfect & extremely light
            setter(compressedBase64);
          } else {
            setter(rawBase64);
          }
        };
        img.onerror = () => {
          setter(rawBase64);
        };
        img.src = rawBase64;
      };
      reader.readAsDataURL(file);
    }
  };

  // PIN code handling refs
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Screen resets
  useEffect(() => {
    if (currentScreen === "mainteneur") {
      setPinDigits(["", "", "", ""]);
      setPinError("");
      // focus
      setTimeout(() => pinRefs[0].current?.focus(), 150);
    }
  }, [currentScreen]);

  // PIN changes
  const handlePinDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, "").slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = cleanVal;
    setPinDigits(newDigits);
    setPinError("");

    if (cleanVal !== "" && index < 3) {
      pinRefs[index + 1].current?.focus();
    }
  };

  const handlePinBackspace = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && pinDigits[index] === "" && index > 0) {
      const newDigits = [...pinDigits];
      newDigits[index - 1] = "";
      setPinDigits(newDigits);
      pinRefs[index - 1].current?.focus();
    }
  };

  const handlePinDialClick = (num: number) => {
    const emptyIdx = pinDigits.findIndex((d) => d === "");
    if (emptyIdx !== -1) {
      const newDigits = [...pinDigits];
      newDigits[emptyIdx] = num.toString();
      setPinDigits(newDigits);
      setPinError("");
      if (emptyIdx < 3) {
        pinRefs[emptyIdx + 1].current?.focus();
      }
    }
  };

  const handlePinClear = () => {
    setPinDigits(["", "", "", ""]);
    setPinError("");
    pinRefs[0].current?.focus();
  };

  // Evaluate PIN on change completeness
  useEffect(() => {
    const pinStr = pinDigits.join("");
    if (pinStr.length === 4) {
      const matched = members.find((m) => m.pin === pinStr);
      if (matched) {
        setPinError("");
        setAuthenticatedUser(matched);
        localStorage.setItem(
          "defib_active_tech_session",
          JSON.stringify(matched),
        );
        triggerPreloader();

        // Auto toast feedback
        setTimeout(() => {
          setCurrentScreen("landing");
        }, 800);
      } else {
        setPinError("Code PIN invalide. Acc√®s refus√©.");
        setTimeout(() => {
          setPinDigits(["", "", "", ""]);
          pinRefs[0].current?.focus();
        }, 1200);
      }
    }
  }, [pinDigits]);

  const handleLogout = () => {
    setAuthenticatedUser(null);
    localStorage.removeItem("defib_active_tech_session");
    setCurrentScreen("landing");
    setActiveTab("interventions");
    if (onClose) {
      onClose();
    }
  };

  // SUBMITS & ENREGISTREMENTS

  // Submit Signalement incident from public
  const handleTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.identifiant || !ticketForm.message || !ticketForm.email) {
      alert(
        "Veuillez remplir tous les champs obligatoires (*) pour envoyer l'incident.",
      );
      return;
    }

    const ticketId = onAddTicket({
      identifiant: ticketForm.identifiant,
      objet: ticketForm.objet,
      message: ticketForm.message,
      email: ticketForm.email,
      phone: ticketForm.phone,
    });

    setCreatedTicketId(ticketId);
    setCurrentScreen("success-ticket");
    setTicketForm({
      identifiant: "",
      objet: "D√©fibrillateur utilis√©",
      message: "",
      email: "",
      phone: "",
    });
  };

  const handleInlineTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.identifiant || !ticketForm.message || !ticketForm.email) {
      alert(
        "Veuillez remplir tous les champs obligatoires (*) pour envoyer l'incident.",
      );
      return;
    }

    const ticketId = onAddTicket({
      identifiant: ticketForm.identifiant,
      objet: ticketForm.objet,
      message: ticketForm.message,
      email: ticketForm.email,
      phone: ticketForm.phone,
    });

    setCreatedTicketId(ticketId);
    setInlineReportSuccess(true);
    setTicketForm({
      identifiant: "",
      objet: "D√©fibrillateur utilis√©",
      message: "",
      email: "",
      phone: "",
    });
  };

  // Save/Generate PDF Report (Tab 2)
  const handleSavePdfReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDefibData) {
      alert(
        "Veuillez s√©lectionner un d√©fibrillateur dans le menu d√©roulant lookup.",
      );
      return;
    }

    // Update with today's date (or horodate input date) as the derniereMaintenance date!
    const todayStr = new Date().toISOString().split("T")[0];
    const updatedDefib = {
      ...selectedDefibData,
      derniereMaintenance: todayStr,
    };

    // 1. Durably update main defibrillator record inside global state
    onUpdateDefib(updatedDefib);

    // 2. Generate a neat printed report block record
    const rId = "REP-" + Date.now();
    const newReportRecord: GeneratedReport = {
      id: rId,
      date: horodateInput || new Date().toLocaleString("fr-FR"),
      techName: authenticatedUser?.name || "Technicien connect√©",
      defibId: updatedDefib.id,
      defibIdentifiant: updatedDefib.identifiant,
      title: receiptTitle,
      siteMission: missionSite,
      photoUrl: techPhotoUrl || undefined,
      defibSnapshot: { ...updatedDefib },
    };

    saveReports([newReportRecord, ...generatedReports]);

    // Email 6: RAPPORT SUITE √Ä UNE INTERVENTION AU CLIENT
    try {
      const matchingClient = clients?.find(
        (c: any) => c.id === selectedDefibData.clientId,
      );
      const clientEmail =
        selectedDefibData.emailSite ||
        matchingClient?.email ||
        matchingClient?.emailSite;
      if (clientEmail && clientEmail.trim()) {
        triggerEmail6RapportIntervention(
          clientEmail.trim(),
          selectedDefibData.identifiant,
          newReportRecord.date,
          companyInfo.name || "D√©fibeo Suite",
          companyInfo.email || "",
        ).catch((e) => console.error("Error triggering Email 6:", e));
      } else {
        console.warn(
          `[Email 6] Client email not found for defibrillator ${selectedDefibData.identifiant}`,
        );
      }
    } catch (err6) {
      console.error("Error triggering Email 6 workflow:", err6);
    }

    alert(
      `Le rapport "${receiptTitle}" a √©t√© enregistr√© avec succ√®s et rattach√© avec l'historique du d√©fibrillateur ${selectedDefibData.identifiant}. Les donn√©es du mat√©riel central ont √©t√© mises √† jour !`,
    );

    // Reset lookup state
    setSelectedDefibId("");
    setSelectedDefibData(null);
    setTechPhotoUrl("");
  };

  // Submit WORK TIME Pointage (Tab 3)
  const handleTogglePointage = () => {
    const now = new Date();
    const activeIdx = pointages.findIndex(
      (p) => p.isOngoing && p.techName === authenticatedUser?.name,
    );

    if (activeIdx !== -1) {
      // Ending ongoingPointage
      const activePointage = pointages[activeIdx];

      const getStartDateTime = (
        startDateStr: string,
        startTimeStr: string,
      ): Date => {
        const parts = startDateStr.split(/[-/]/);
        const tParts = startTimeStr.split(":");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const date = new Date(year, month, day);
          date.setHours(parseInt(tParts[0], 10), parseInt(tParts[1], 10), 0, 0);
          return date;
        }
        const fallback = new Date();
        fallback.setHours(
          parseInt(tParts[0], 10),
          parseInt(tParts[1], 10),
          0,
          0,
        );
        return fallback;
      };

      const startObj = getStartDateTime(
        activePointage.startDate || now.toLocaleDateString("fr-FR"),
        activePointage.startTime,
      );
      const diffSeconds = Math.max(
        1,
        Math.round((now.getTime() - startObj.getTime()) / 1000),
      );
      const finalDurationSeconds = Math.min(10 * 3600, diffSeconds);

      // If duration exceeded 10 hours, adjust the end date and time to be exactly 10 hours after starting
      let finalEndDate = now.toLocaleDateString("fr-FR");
      let finalEndTime =
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0");
      if (diffSeconds > 10 * 3600) {
        const tenHoursLater = new Date(startObj.getTime() + 10 * 3600 * 1000);
        finalEndDate = tenHoursLater.toLocaleDateString("fr-FR");
        finalEndTime =
          String(tenHoursLater.getHours()).padStart(2, "0") +
          ":" +
          String(tenHoursLater.getMinutes()).padStart(2, "0");
      }

      const updated = [...pointages];
      updated[activeIdx] = {
        ...activePointage,
        endDate: finalEndDate,
        endTime: finalEndTime,
        durationSeconds: finalDurationSeconds,
        comment:
          activePointage.comment && activePointage.comment.trim()
            ? activePointage.comment.trim()
            : "Nouvelle p√©riode sans titre.",
        isOngoing: false,
      };

      savePointages(updated);
      alert("Pointage arr√™t√© avec succ√®s.");
    } else {
      // Starting new Pointage
      const currentTechName = authenticatedUser?.name || "Technicien connect√©";
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const alreadyHasPointageToday = pointages.some((p) => {
        if (p.techName !== currentTechName) return false;
        const pIso = getIsoDate(p.startDate);
        return pIso === todayIso;
      });

      if (alreadyHasPointageToday) {
        alert(t("Un seul pointage par jour est autoris√©."));
        return;
      }

      const currentHHMM =
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0");
      const newLog: PointageLog = {
        id: "pt-" + Date.now(),
        techName: currentTechName,
        startDate: now.toLocaleDateString("fr-FR"),
        startTime: currentHHMM,
        endTime: currentHHMM,
        isOngoing: true,
        trajetMatin: "00:00",
        trajetSoir: "00:00",
        tempsRepas: "00:00",
        tempsAdmin: "00:00",
        comment: "",
      };

      savePointages([newLog, ...pointages]);
      alert("Pointage d√©marr√© avec succ√®s.");
    }
  };

  const timeToMins = (tStr?: string): number => {
    if (!tStr) return 0;
    const str = tStr.trim();
    if (str.includes(":")) {
      const parts = str.split(":").map((p) => parseInt(p, 10));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1];
      }
    }
    if (str.toLowerCase().includes("h")) {
      const parts = str.toLowerCase().split("h").map((p) => parseInt(p, 10) || 0);
      return parts[0] * 60 + (parts[1] || 0);
    }
    const val = parseInt(str, 10);
    return isNaN(val) ? 0 : val;
  };

  const minsToHHMM = (totalMins: number): string => {
    if (isNaN(totalMins) || totalMins <= 0) return "00:00";
    const h = String(Math.floor(totalMins / 60)).padStart(2, "0");
    const m = String(Math.floor(totalMins % 60)).padStart(2, "0");
    return `${h}:${m}`;
  };

  const handleEditPointageField = (
    id: string,
    updates: Partial<PointageLog>
  ) => {
    if (updates.startDate) {
      const targetP = pointages.find((p) => p.id === id);
      if (targetP) {
        const newIso = getIsoDate(updates.startDate);
        const duplicate = pointages.some(
          (p) =>
            p.id !== id &&
            p.techName === targetP.techName &&
            getIsoDate(p.startDate) === newIso
        );
        if (duplicate) {
          alert(t("Un seul pointage par jour est autoris√©."));
          return;
        }
      }
    }
    const updated = pointages.map((p) => {
      if (p.id === id) {
        const merged = { ...p, ...updates };
        if (merged.startTime && merged.endTime) {
          const sMins = timeToMins(merged.startTime);
          const eMins = timeToMins(merged.endTime);
          const durationMin = Math.max(0, eMins - sMins);
          merged.durationSeconds = durationMin * 60;
        }
        return merged;
      }
      return p;
    });
    savePointages(updated);
  };

  const handleEditPointage = (
    id: string,
    newStart: string,
    newEnd: string,
    comment?: string,
    newStartDate?: string,
  ) => {
    const updated = pointages.map((p) => {
      if (p.id === id) {
        const durationMin = Math.max(0, timeToMins(newEnd) - timeToMins(newStart));

        return {
          ...p,
          startDate: newStartDate !== undefined ? newStartDate : p.startDate,
          startTime: newStart,
          endTime: newEnd,
          durationSeconds: durationMin * 60,
          comment: comment !== undefined ? comment : p.comment,
        };
      }
      return p;
    });
    savePointages(updated);
  };

  const handleDeletePointage = (id: string) => {
    savePointages(pointages.filter((p) => p.id !== id));
  };

  // Submit EXPENSE Receipt (Tab 4)
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim() || !expenseTtc) {
      alert("Veuillez remplir au minimum l'Objet et le Total TTC. (‚Ç¨).");
      return;
    }

    const newExpense: Expense = {
      id: "exp-" + Date.now(),
      techName: authenticatedUser?.name || "Technicien connect√©",
      title: expenseTitle.trim(),
      amountTtc: parseFloat(expenseTtc) || 0,
      amountHt: parseFloat(expenseHt) || 0,
      amountTva: parseFloat(expenseTva) || 0,
      dateStr: expenseDate,
      photoUrl: expensePhotoUrl || undefined,
    };

    saveExpenses([newExpense, ...expenses]);

    // Reset expense ticket forms
    setExpenseTitle("");
    setExpenseTtc("");
    setExpenseHt("");
    setExpenseTva("");
    setExpensePhotoUrl("");
    setExpenseSuccessMessage("Parfait! Le ticket de frais est enregistr√© avec succ√®s.");
    setTimeout(() => {
      setExpenseSuccessMessage("");
    }, 5000);
  };

  const handleDeleteExpense = (id: string) => {
    saveExpenses(expenses.filter((e) => e.id !== id));
  };

  // Save Location configurations (Tab 5)
  const handleSaveLocalisation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticatedUser) return;

    // Compose flat startAddress for legacy support
    const composedAddress = `${techStartStreet}, ${techStartZip} ${techStartCity}, ${techStartCountry}`.trim();

    // 1. Update matching member in parent Central state database
    const updatedMembers = members.map((m) => {
      if (m.name.trim().toLowerCase() === authenticatedUser.name.trim().toLowerCase()) {
        const updatedM = {
          ...m,
          gpsSharingLink: gpsSharingLink,
          startAddress: composedAddress,
          startAddressStreet: techStartStreet,
          startAddressCity: techStartCity,
          startAddressZip: techStartZip,
          startAddressRegion: techStartRegion,
          startAddressCountry: techStartCountry,
          startAddressLat: techStartLat ? parseFloat(techStartLat) : undefined,
          startAddressLng: techStartLng ? parseFloat(techStartLng) : undefined,
          optimizationPreference: (routeOptimization.includes("loin") ? "loin" : "proche") as "loin" | "proche",
          signature: techSignature,
          hidePointage: hidePointage,
        };
        return updatedM;
      }
      return m;
    });

    onUpdateMembers(updatedMembers);

    // Also update authenticatedUser and stored active session
    const updatedUser = {
      ...authenticatedUser,
      gpsSharingLink: gpsSharingLink,
      startAddress: composedAddress,
      startAddressStreet: techStartStreet,
      startAddressCity: techStartCity,
      startAddressZip: techStartZip,
      startAddressRegion: techStartRegion,
      startAddressCountry: techStartCountry,
      startAddressLat: techStartLat ? parseFloat(techStartLat) : undefined,
      startAddressLng: techStartLng ? parseFloat(techStartLng) : undefined,
      optimizationPreference: (routeOptimization.includes("loin") ? "loin" : "proche") as "loin" | "proche",
      signature: techSignature,
      hidePointage: hidePointage,
    };
    setAuthenticatedUser(updatedUser);
    localStorage.setItem("defib_active_tech_session", JSON.stringify(updatedUser));

    // 2. Persist starting address & optimized route to local storage
    const envId = localStorage.getItem("defib_tenant_id") || "demo";
    localStorage.setItem(
      `defib_${envId}_tech_hide_pointage_${authenticatedUser.name}`,
      hidePointage ? "true" : "false"
    );
    localStorage.setItem(
      `defib_${envId}_tech_hide_pointage`,
      hidePointage ? "true" : "false"
    );
    localStorage.setItem(
      "defib_hide_pointage",
      hidePointage ? "true" : "false"
    );
    localStorage.setItem(
      `defib_${envId}_tech_start_address_${authenticatedUser.name}`,
      composedAddress
    );
    localStorage.setItem(
      `defib_${envId}_tech_start_street_${authenticatedUser.name}`,
      techStartStreet
    );
    localStorage.setItem(
      `defib_${envId}_tech_start_city_${authenticatedUser.name}`,
      techStartCity
    );
    localStorage.setItem(
      `defib_${envId}_tech_start_zip_${authenticatedUser.name}`,
      techStartZip
    );
    localStorage.setItem(
      `defib_${envId}_tech_start_region_${authenticatedUser.name}`,
      techStartRegion
    );
    localStorage.setItem(
      `defib_${envId}_tech_start_country_${authenticatedUser.name}`,
      techStartCountry
    );
    localStorage.setItem(
      `defib_${envId}_tech_start_lat_${authenticatedUser.name}`,
      techStartLat
    );
    localStorage.setItem(
      `defib_${envId}_tech_start_lng_${authenticatedUser.name}`,
      techStartLng
    );
    localStorage.setItem(
      `defib_${envId}_tech_optimization_${authenticatedUser.name}`,
      routeOptimization,
    );
    localStorage.setItem(
      `defib_${envId}_tech_nav_app_${authenticatedUser.name}`,
      defaultNavApp,
    );
    localStorage.setItem(
      `defib_tech_location_link_${authenticatedUser.name}`,
      gpsSharingLink,
    );

    alert(
      `Vos pr√©f√©rences g√©ographiques ont √©t√© enregistr√©es avec succ√®s et le lien de live tracking a √©t√© envoy√© vers le pupitre principal d'administration !`,
    );
  };

  // Google Calendar integration helpers
  const handleGoogleCalendarSync = async () => {
    setIsSyncingGoogleCal(true);
    setSyncStatusMsg(null);
    setShowDomainHelp(false);
    setShowOperationHelp(false);
    setShowCalendarApiHelp(false);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/calendar");

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      const email = result?.user?.email || "";

      if (!token) {
        throw new Error("Impossible d'obtenir le jeton d'acc√®s OAuth.");
      }

      setGoogleAccessToken(token);
      setSyncedGoogleEmail(email);

      // Persist the email locally
      const techName = authenticatedUser?.name || "common";
      localStorage.setItem(`defib_google_cal_email_${techName}`, email);

      // Perform synchronization!
      const syncResult = await performGoogleCalendarSync(token);
      const calendarId = syncResult.calendarId || "";

      // Persist Google account settings to the centralized Firestore database
      if (authenticatedUser) {
        const updatedMembers = members.map((m) => {
          if (m.name.trim().toLowerCase() === authenticatedUser.name.trim().toLowerCase()) {
            return {
              ...m,
              googleCalEmail: email,
              googleCalId: calendarId,
            };
          }
          return m;
        });
        onUpdateMembers(updatedMembers);

        // Also update authenticatedUser and stored active session
        const updatedUser = {
          ...authenticatedUser,
          googleCalEmail: email,
          googleCalId: calendarId,
        };
        setAuthenticatedUser(updatedUser);
        localStorage.setItem("defib_active_tech_session", JSON.stringify(updatedUser));
      }

      setSyncStatusMsg({
        type: "success",
        text: `Agenda Google synchronis√© avec succ√®s ! ${syncResult.count} mission(s) synchronis√©e(s) sur le calendrier 'D√©fibeo'.`,
      });
    } catch (error: any) {
      console.error("Error in Google Calendar sync:", error);

      const errorMsgStr = error?.message || "";
      const isAuthError =
        errorMsgStr.includes("unauthorized-domain") ||
        (error?.code &&
          typeof error.code === "string" &&
          error.code.includes("unauthorized-domain"));

      const isOperationNotAllowed =
        errorMsgStr.includes("operation-not-allowed") ||
        (error?.code &&
          typeof error.code === "string" &&
          error.code.includes("operation-not-allowed")) ||
        errorMsgStr.includes("AUTH/OPERATION_NOT_ALLOWED") ||
        errorMsgStr.includes("AUTH/OPERATION NOT ALLOWED");

      const isCalendarDisabled =
        errorMsgStr.includes("calendar-json.googleapis.com") ||
        errorMsgStr.includes("SERVICE_DISABLED") ||
        errorMsgStr.includes("Calendar API") ||
        errorMsgStr.includes("accessNotConfigured");

      if (isAuthError) {
        setShowDomainHelp(true);
        setSyncStatusMsg({
          type: "error",
          text: `Erreur d'autorisation : Ce domaine n'est pas autoris√© dans la configuration de votre projet Firebase. Veuillez suivre les instructions ci-dessous pour l'ajouter.`,
        });
      } else if (isOperationNotAllowed) {
        setShowOperationHelp(true);
        setSyncStatusMsg({
          type: "error",
          text: `Erreur de configuration (auth/operation-not-allowed) : La connexion Google n'est pas activ√©e dans votre console Firebase. Veuillez suivre les instructions ci-dessous.`,
        });
      } else if (isCalendarDisabled) {
        const pNumMatch = errorMsgStr.match(/(?:project|projects\/)(\d+)/i);
        const pNum = pNumMatch ? pNumMatch[1] : "627487981610";
        setDisabledProjectNumber(pNum);
        setShowCalendarApiHelp(true);
        setSyncStatusMsg({
          type: "error",
          text: `L'API Google Calendar n'est pas activ√©e dans votre projet Google Cloud. Veuillez l'activer en un clic via le guide ci-dessous.`,
        });
      } else {
        setSyncStatusMsg({
          type: "error",
          text:
            error?.message || "Erreur lors de la synchronisation de l'agenda.",
        });
      }
    } finally {
      setIsSyncingGoogleCal(false);
    }
  };

  const handleDeactivateGoogleCalendar = () => {
    const techName = authenticatedUser?.name || "common";
    localStorage.removeItem(`defib_google_cal_email_${techName}`);
    localStorage.removeItem(`defib_google_cal_id_${techName}`);
    setGoogleAccessToken(null);
    setSyncedGoogleEmail(null);

    // Deactivate Google Calendar settings from Firestore
    if (authenticatedUser) {
      const updatedMembers = members.map((m) => {
        if (m.name.trim().toLowerCase() === authenticatedUser.name.trim().toLowerCase()) {
          const updatedM = { ...m };
          delete updatedM.googleCalEmail;
          delete updatedM.googleCalId;
          return updatedM;
        }
        return m;
      });
      onUpdateMembers(updatedMembers);

      // Also update authenticatedUser and stored active session
      const updatedUser = { ...authenticatedUser };
      delete updatedUser.googleCalEmail;
      delete updatedUser.googleCalId;
      setAuthenticatedUser(updatedUser);
      localStorage.setItem("defib_active_tech_session", JSON.stringify(updatedUser));
    }

    setSyncStatusMsg({
      type: "success",
      text: "La synchronisation Google Calendar a √©t√© d√©sactiv√©e.",
    });
  };

  const performGoogleCalendarSync = async (accessToken: string) => {
    // 1. Get List of Calendars with a safe fallback
    let calendars: any[] = [];
    try {
      const listRes = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        calendars = listData.items || [];
      } else {
        const errText = await listRes.text();
        console.warn("Calendar list API returned non-OK status. Details:", errText);
      }
    } catch (err) {
      console.error("Error fetching calendar list:", err);
    }

    const liveMember = members.find((m) => m.name.trim().toLowerCase() === (authenticatedUser?.name || "").trim().toLowerCase());
    const techName = authenticatedUser?.name || "common";
    const savedCalId = liveMember?.googleCalId || localStorage.getItem(`defib_google_cal_id_${techName}`);
    let calendarId = "";

    // Find any calendar matching "D√©fibeo", "Defibeo", or "D√©fib√©o"
    const existingCal = calendars.find((c: any) => {
      const summary = (c.summary || "").toLowerCase().trim();
      return summary === "defibeo" || summary === "d√©fibeo" || summary === "d√©fib√©o";
    });

    if (existingCal) {
      calendarId = existingCal.id;
      console.log("Found existing calendar 'D√©fibeo' from API list. ID:", calendarId);
    } else if (savedCalId) {
      // Fallback check if savedCalId still exists / is accessible
      try {
        const checkRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${savedCalId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (checkRes.ok) {
          calendarId = savedCalId;
          console.log("Using cached calendar ID from localStorage:", calendarId);
        }
      } catch (err) {
        console.error("Cached calendar ID validation failed:", err);
      }
    }

    // 2. If not found, create a new calendar "D√©fibeo"
    if (!calendarId) {
      console.log("No existing calendar found. Creating a new one 'D√©fibeo'...");
      const createRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ summary: "D√©fibeo" }),
        },
      );
      if (!createRes.ok) {
        const createErrText = await createRes.text();
        console.error("Calendar creation failed:", createErrText);
        throw new Error(`Impossible de configurer l'agenda d√©di√© 'D√©fibeo'. D√©tails Google API: ${createErrText}`);
      }
      const newCal = await createRes.json();
      calendarId = newCal.id;
    }

    // Save/refresh the calendar ID in localStorage
    if (calendarId) {
      localStorage.setItem(`defib_google_cal_id_${techName}`, calendarId);
    }

    // 3. To avoid duplicate events, fetch the existing events of this calendar and delete them.
    try {
      const eventsRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=2500`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        const existingEvents = eventsData.items || [];
        for (const ev of existingEvents) {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${ev.id}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
        }
      } else {
        console.warn("Could not retrieve current events from the calendar before adding.");
      }
    } catch (err) {
      console.error("Error clearing existing events:", err);
    }

    // 4. Find all missions assigned to the technician that have an estimatedDate
    const missionsToSync = tours
      .flatMap((t) => t.passages || [])
      .filter((p) => p.estimatedDate);

    if (missionsToSync.length === 0) {
      return { count: 0 };
    }

    const timeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";

    // Helper functions for French date <-> ISO date picker compatibility
    const normalizeToYyyymmddInSync = (dateStr: string): string => {
      if (!dateStr) return "";
      const clean = dateStr.replace(/\//g, "-").trim();
      const parts = clean.split("-");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        }
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
      return dateStr;
    };

    const parseSlotToTimeInSync = (slot: string) => {
      const cleaned = slot.trim().toLowerCase();
      const match = cleaned.match(/^(\d+):(\d+)(am|pm)?$/);
      if (match) {
        let hrs = parseInt(match[1]);
        const mins = parseInt(match[2]);
        const period = match[3];
        if (period === "pm" && hrs < 12) {
          hrs += 12;
        } else if (period === "am" && hrs === 12) {
          hrs = 0;
        }
        return { hrs, mins };
      }
      return { hrs: 9, mins: 0 };
    };

    for (const m of missionsToSync) {
      const dateYmd = normalizeToYyyymmddInSync(m.estimatedDate);
      const slotStr = m.estimatedSlot ? m.estimatedSlot.trim() : "09:00";
      const { hrs, mins } = parseSlotToTimeInSync(slotStr);

      const startHrsStr = String(hrs).padStart(2, "0");
      const startMinsStr = String(mins).padStart(2, "0");

      let endHrs = hrs;
      let endMins = mins + 30;
      if (endMins >= 60) {
        endHrs += 1;
        endMins -= 60;
      }
      if (endHrs >= 24) {
        endHrs = 23;
        endMins = 59;
      }
      const endHrsStr = String(endHrs).padStart(2, "0");
      const endMinsStr = String(endMins).padStart(2, "0");

      const startDateTime = `${dateYmd}T${startHrsStr}:${startMinsStr}:00`;
      const endDateTime = `${dateYmd}T${endHrsStr}:${endMinsStr}:00`;

      const description =
        `Mod√®le : ${m.model}\n` +
        `Adresse : ${m.address}\n` +
        `Situation : ${m.status}\n` +
        (m.requiredParts && m.requiredParts.length > 0
          ? `Pi√®ce(s) : ${m.requiredParts.join(", ")}`
          : "");

      const eventBody = {
        summary: `${m.reason || "Visite technique"} - ${m.identifiant || "Mission"}`,
        description,
        start: {
          dateTime: startDateTime,
          timeZone,
        },
        end: {
          dateTime: endDateTime,
          timeZone,
        },
      };

      const eventRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        },
      );

      if (!eventRes.ok) {
        console.error(
          `Failed to add event for mission ${m.identifiant}:`,
          await eventRes.text(),
        );
      }
    }

    return { count: missionsToSync.length, calendarId };
  };

  const getNextPassageZone = (tourId?: string) => {
    const targetTourId = tourId || selectedTourId;
    if (!targetTourId) return "";

    const activeTour: any =
      getSortedTours().find((t) => t.id === targetTourId) ||
      tours.find((t) => t.id === targetTourId);

    if (!activeTour || !activeTour.passages || activeTour.passages.length === 0)
      return "";

    const donePassages = activeTour.passages.filter(
      (p: any) => p.status === "Effectu√©",
    );
    let nextPassage: any = null;

    if (donePassages.length > 0) {
      const highestDoneNum = Math.max(...donePassages.map((p: any) => p.num));
      nextPassage = activeTour.passages.find(
        (p: any) => p.num === highestDoneNum + 1 && p.status === "√Ä faire",
      );
      if (!nextPassage) {
        nextPassage = activeTour.passages.find(
          (p: any) => p.status === "√Ä faire" && p.num > highestDoneNum,
        );
      }
    }

    if (!nextPassage) {
      nextPassage = activeTour.passages.find(
        (p: any) => p.status === "√Ä faire",
      );
    }

    if (!nextPassage) return "";

    let resolvedZone = "";

    const defib = defibrillateurs.find(
      (d: any) =>
        d.identifiant === nextPassage.identifiant ||
        d.id === nextPassage.identifiant,
    );
    if (defib && defib.ville && defib.ville.trim() && defib.ville !== "Ville_CP" && defib.ville !== "Non renseign√©") {
      const cpStr = defib.cp && defib.cp !== "CP" && defib.cp !== "Ville_CP" ? ` ${defib.cp}` : "";
      resolvedZone = `${defib.ville}${cpStr}`;
    } else {
      const other = otherEquipments.find(
        (o: any) =>
          o.identifiant === nextPassage.identifiant ||
          o.id === nextPassage.identifiant,
      );
      if (other && other.ville && other.ville.trim() && other.ville !== "Ville_CP" && other.ville !== "Non renseign√©") {
        const cpStr = other.codePostal && other.codePostal !== "CP" && other.codePostal !== "Ville_CP" ? ` ${other.codePostal}` : "";
        resolvedZone = `${other.ville}${cpStr}`;
      } else {
        const fmt = formations?.find((f: any) => f.id === nextPassage.formationId || f.id === nextPassage.identifiant);
        if (fmt && fmt.ville && fmt.ville.trim()) {
          const cpStr = fmt.codePostal ? ` ${fmt.codePostal}` : "";
          resolvedZone = `${fmt.ville}${cpStr}`;
        } else {
          const client = clients?.find((c: any) => c.id === nextPassage.clientId);
          if (client && client.ville && client.ville.trim()) {
            const cpStr = client.codePostal ? ` ${client.codePostal}` : "";
            resolvedZone = `${client.ville}${cpStr}`;
          } else if (nextPassage.address) {
            const parts = nextPassage.address.split(",");
            if (parts.length > 1) {
              resolvedZone = parts[parts.length - 1].trim();
            } else {
              resolvedZone = nextPassage.address;
            }
          } else if (nextPassage.location && nextPassage.location !== "Non renseign√©") {
            resolvedZone = nextPassage.location;
          }
        }
      }
    }

    if (!resolvedZone) return "";
    const cleanZone = resolvedZone.trim();
    if (
      cleanZone.toLowerCase().includes("ville_cp") || 
      cleanZone.toLowerCase().includes("non renseign√©") || 
      cleanZone === "CP" ||
      cleanZone === "Ville CP"
    ) {
      return "";
    }
    return cleanZone;
  };

  if (windowWidth > 1100) {
    return (
      <div 
        className="fixed inset-0 z-[99999] flex flex-col items-center justify-center text-center font-sans p-6 select-none" 
        style={{ 
          background: currentTechTheme.color,
          color: '#ffffff'
        }}
        id="resolution-warning-overlay-webapp"
      >
        <div className="flex flex-col items-center gap-4 max-w-lg">
          <span className="text-white text-[18px] font-sans font-medium leading-relaxed">
            {t("La Webapp Technicien doit-√™tre utilis√©e depuis un smartphone ou une tablette d'au maximum 1100 pixels de large.")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-50 flex flex-col items-center p-0 text-slate-800 selection:bg-indigo-600/30 font-sans relative"
      id="public-portal-envelope"
    >
      {/* PRELOADER OVERLAY WITH MANUAL SWIPE-UP TO HIDE */}
      {showPreloader && (
        <div
          className={`fixed inset-0 z-[999999] flex flex-col items-center justify-between py-12 text-center font-sans transition-transform duration-700 ease-in-out cursor-pointer select-none ${
            isSlidingUp ? "pointer-events-none" : "pointer-events-auto"
          }`}
          style={{
            background: currentTechTheme.color,
            borderRadius: "0px 0px 13px 13px",
            transform: isSlidingUp ? "translateY(-100%)" : "translateY(0%)",
            boxShadow: isSlidingUp ? "0 10px 25px -5px rgba(0, 0, 0, 0.3)" : "none",
            willChange: "transform",
            touchAction: "none",
          }}
          id="webapp-preloader-overlay"
          onClick={dismissPreloader}
          onTouchStart={handlePreloaderTouchStart}
          onTouchMove={handlePreloaderTouchMove}
          onWheel={handlePreloaderWheel}
        >
          {/* Top spacer */}
          <div className="h-8" />

          {/* Centered App Name */}
          <span
            className="text-white font-bold text-center px-4"
            style={{ fontSize: "22px" }}
          >
            {companyInfo?.nomLogiciel || "D√©fibeo"}
          </span>

          {/* Bottom Swipe text */}
          <div className="flex flex-col items-center justify-center gap-2 px-4">
            <span
              className="font-medium tracking-normal animate-text-wave"
              style={{ fontSize: "14px", color: "#ffffff", letterSpacing: "0px" }}
            >
              Glissez vers le haut pour ouvrir.
            </span>
          </div>
        </div>
      )}
      {/* Main Responsive Portal Container (Standalone App Layout) */}
      <div
        className="w-full max-w-[1100px] min-h-screen bg-white relative flex flex-col md:shadow-xl transition-all duration-200"
        id="smartphone-shell"
      >
        {/* ----------------- IF TECHNICIAN IS LOGGED IN STATE ----------------- */}
        {authenticatedUser ? (
          <div
            className="flex-1 flex flex-col overflow-hidden bg-white relative"
            id="authenticated-console-layout"
          >
            {/* Top Bar Progress Animation for Tab Switching */}
            <TopBarProgress triggerKey={activeTab} duration={3000} height={3.5} zIndex={99999} />

            {/* FULL WIDTH SPECIAL REPORT FORM OVERLAY */}
            {isReportOverlayOpen && (
              <div
                className="fixed inset-0 bg-white z-50 flex flex-col overflow-y-auto p-0 animate-slideUp text-black"
                id="report-form-overlay"
              >
                {selectedOtherEquipmentUnique ? (
                  <GmaoOtherEquipmentCorrectionForm
                    otherEquipment={selectedOtherEquipmentUnique}
                    clients={clients}
                    forceSmartphoneLayout={false}
                    isNew={true}
                    isWebapp={true}
                    otherEquipments={otherEquipments}
                    defibrillateurs={defibrillateurs}
                    variables={variables}
                    stocks={stocks}
                    onSelectDefibrillator={(defibId) => {
                      setSelectedOtherEquipmentUnique(null);
                      setSelectedDefibId(defibId);
                      const defib = defibrillateurs.find(
                        (d) => d.id === defibId,
                      );
                      if (defib) setSelectedDefibData(defib);
                    }}
                    onSelectOtherEquipment={(otherEq) => {
                      setSelectedOtherEquipmentUnique(otherEq);
                    }}
                    onCancel={() => {
                      setIsReportOverlayOpen(false);
                      setSelectedOtherEquipmentUnique(null);
                      setReportActiveTourId("");
                      setReportActivePassageNum(null);
                    }}
                    onSave={(updatedReport) => {
                      const reportId = "REP-" + Date.now();
                      const submission = {
                        ...updatedReport,
                        id: reportId,
                        techName:
                          authenticatedUser?.name || "Technicien connect√©",
                        date:
                          updatedReport.date ||
                          new Date().toLocaleString("fr-FR"),
                        validated: false, // Explicitly false so it requires validation from GMAO
                      };

                      saveReports([submission, ...generatedReports]);

                      // NOTE: Auto-update other equip list and email sending is bypassed at this stage
                      // It will occur automatically once validated from the main GMAO workspace.

                      // Automatically transition corresponding passage status to "Effectu√©"
                      if (
                        reportActiveTourId &&
                        reportActivePassageNum !== null
                      ) {
                        const updated = tours.map((t) => {
                          if (t.id === reportActiveTourId) {
                            return {
                              ...t,
                              passages: t.passages.map((p) => {
                                if (p.num === reportActivePassageNum) {
                                  return { ...p, status: "Effectu√©" };
                                }
                                return p;
                              }),
                            };
                          }
                          return t;
                        });
                        saveTours(updated);
                      }

                      alert(
                        `Le rapport "${submission.title}" a √©t√© enregistr√© avec succ√®s (en attente de validation sur le logiciel principal) !`,
                      );
                      setIsReportOverlayOpen(false);
                      setSelectedOtherEquipmentUnique(null);
                      setReportActiveTourId("");
                      setReportActivePassageNum(null);
                    }}
                  />
                ) : (
                  <GmaoCorrectionForm
                    key={reportToEdit ? `edit-${reportToEdit.id}-${reportToEdit.date || ''}` : `new-${selectedDefibId || 'new'}`}
                    isNew={reportToEdit ? false : true}
                    report={reportToEdit}
                    clients={clients}
                    variables={variables}
                    defibrillateurs={defibrillateurs}
                    otherEquipments={otherEquipments}
                    onSelectOtherEquipment={(otherEq) => {
                      setSelectedOtherEquipmentUnique(otherEq);
                    }}
                    initialDefibId={selectedDefibId}
                    stocks={stocks}
                    forceSmartphoneLayout={false}
                    isWebapp={true}
                    onCancel={() => {
                      setIsReportOverlayOpen(false);
                      setReportToEdit(null);
                      setSelectedDefibId("");
                      setSelectedDefibData(null);
                      setReportActiveTourId("");
                      setReportActivePassageNum(null);
                    }}
                    onSave={(updatedReport) => {
                      if (reportToEdit) {
                        const submission = {
                          ...reportToEdit,
                          ...updatedReport,
                          validated: false, // Require validation in GMAO tab again
                        };

                        const updatedReports = generatedReports.map(r => r.id === reportToEdit.id ? submission : r);
                        saveReports(updatedReports);

                        alert(
                          `Le rapport "${submission.title}" a √©t√© modifi√© avec succ√®s (en attente de validation sur le logiciel principal) !`,
                        );
                        setIsReportOverlayOpen(false);
                        setReportToEdit(null);
                        setSelectedDefibId("");
                        setSelectedDefibData(null);
                        setReportActiveTourId("");
                        setReportActivePassageNum(null);
                        return;
                      }

                      const matchingExistingIndex = generatedReports.findIndex(r => 
                        (updatedReport.interventionReference && r.interventionReference === updatedReport.interventionReference) ||
                        (updatedReport.missionId && r.missionId === updatedReport.missionId)
                      );

                      let updatedReportsList = [...generatedReports];
                      let submission: any = null;

                      if (matchingExistingIndex !== -1) {
                        const existingRep = generatedReports[matchingExistingIndex];
                        submission = {
                          ...existingRep,
                          ...updatedReport,
                          id: existingRep.id,
                          isUpcoming: false,
                          status: 'Mod√©ration',
                          missionStatus: 'Effectu√©',
                          techName: authenticatedUser?.name || existingRep.techName || "Technicien connect√©",
                          date: updatedReport.date || new Date().toLocaleString("fr-FR"),
                          validated: false,
                        };
                        updatedReportsList[matchingExistingIndex] = submission;
                      } else {
                        const reportId = "REP-" + Date.now();
                        submission = {
                          ...updatedReport,
                          id: reportId,
                          techName: authenticatedUser?.name || "Technicien connect√©",
                          date: updatedReport.date || new Date().toLocaleString("fr-FR"),
                          validated: false,
                          missionStatus: 'Effectu√©',
                        };
                        updatedReportsList = [submission, ...generatedReports];
                      }

                      saveReports(updatedReportsList);

                      if (onAddNotification) {
                        const name_technician = authenticatedUser?.name || "Un technicien";
                        const defib_identifiant = updatedReport.defibSnapshot?.identifiant || updatedReport.defibId || "inconnu";
                        const clientId = updatedReport.defibSnapshot?.clientId || "";
                        const matchedClient = clients.find((c: any) => c.id === clientId);
                        const client_denomination = matchedClient
                          ? matchedClient.denomination
                          : updatedReport.defibSnapshot?.nomPrenomSite || "Client inconnu";

                        onAddNotification(
                          'Interventions',
                          `Le technicien ${name_technician} a valid√© le rapport d‚Äôintervention pour le d√©fibrillateur ${defib_identifiant} de la soci√©t√© ${client_denomination}.`
                        );
                      }

                      // NOTE: Auto-update defibrillator record and email triggering are bypassed at this level
                      // They are successfully pending approval inside the GMAO tab.

                      // 1. Decrement Stock for selected/replaced products
                      const updatedStocks = [...stocks];
                      const toDecrementIds: string[] = [];

                      if (
                        updatedReport.kitSecoursRemplaceOuAjoute === "Oui" &&
                        updatedReport.selectionKitSecoursRemplace
                      ) {
                        toDecrementIds.push(
                          updatedReport.selectionKitSecoursRemplace,
                        );
                      }
                      if (
                        updatedReport.batterieRemplacee === "Oui" &&
                        updatedReport.selectionBatterieRemplacee
                      ) {
                        toDecrementIds.push(
                          updatedReport.selectionBatterieRemplacee,
                        );
                      }
                      if (
                        updatedReport.electrodePRemplacee === "Oui" &&
                        updatedReport.selectionElectrodePRemplacee
                      ) {
                        toDecrementIds.push(
                          updatedReport.selectionElectrodePRemplacee,
                        );
                      }
                      if (
                        updatedReport.electrodePSecoursRemplacee === "Oui" &&
                        updatedReport.selectionElectrodePSecoursRemplacee
                      ) {
                        toDecrementIds.push(
                          updatedReport.selectionElectrodePSecoursRemplacee,
                        );
                      }
                      if (
                        updatedReport.electrodeARemplacee === "Oui" &&
                        updatedReport.selectionElectrodeARemplacee
                      ) {
                        toDecrementIds.push(
                          updatedReport.selectionElectrodeARemplacee,
                        );
                      }
                      if (
                        updatedReport.electrodeASecoursRemplacee === "Oui" &&
                        updatedReport.selectionElectrodeASecoursRemplacee
                      ) {
                        toDecrementIds.push(
                          updatedReport.selectionElectrodeASecoursRemplacee,
                        );
                      }
                      if (
                        updatedReport.emettreFactureBrouillon === "Oui" &&
                        updatedReport.serviceEmettreId
                      ) {
                        const matchedStock = stocks.find(
                          (s) =>
                            s.id === updatedReport.serviceEmettreId ||
                            s.denominationPieceId ===
                              updatedReport.serviceEmettreId,
                        );
                        if (matchedStock) {
                          toDecrementIds.push(matchedStock.id);
                        }
                      }

                      let stocksMutated = false;
                      toDecrementIds.forEach((id) => {
                        const stockIndex = updatedStocks.findIndex(
                          (s) => s.id === id || s.denominationPieceId === id,
                        );
                        if (stockIndex !== -1) {
                          const stObj = updatedStocks[stockIndex];
                          updatedStocks[stockIndex] = {
                            ...stObj,
                            quantite: Math.max(0, (stObj.quantite ?? 1) - 1),
                            quantiteReservee: Math.max(
                              0,
                              (stObj.quantiteReservee ?? 0) - 1,
                            ),
                          };
                          stocksMutated = true;
                        }
                      });

                      if (stocksMutated && onUpdateStocks) {
                        onUpdateStocks(updatedStocks);
                      }

                      // 2. Draft Invoice Creation
                      if (
                        updatedReport.emettreFactureBrouillon === "Oui" &&
                        onUpdateCommercialDocs
                      ) {
                        const invoiceItems: CommercialDocItem[] = [];

                        // Add service if selected
                        if (updatedReport.serviceEmettreId) {
                          const st = stocks.find(
                            (s: any) => s.id === updatedReport.serviceEmettreId,
                          );
                          if (st) {
                            const matchedVar = variables.find(
                              (v: any) => v.id === st.denominationPieceId,
                            );
                            invoiceItems.push({
                              variableId: st.denominationPieceId,
                              nomPiece: matchedVar
                                ? `${matchedVar.nom} (${matchedVar.marque})`
                                : "Service",
                              prixVenteHt: st.prixVenteHt,
                              quantite: 1,
                            });
                          } else {
                            const matchedVar = variables.find(
                              (v: any) =>
                                v.id === updatedReport.serviceEmettreId,
                            );
                            if (matchedVar) {
                              invoiceItems.push({
                                variableId: matchedVar.id,
                                nomPiece: `${matchedVar.nom} (${matchedVar.marque})`,
                                prixVenteHt: 150,
                                quantite: 1,
                              });
                            } else if (
                              updatedReport.serviceEmettreId.startsWith(
                                "st_fallback_srv_",
                              )
                            ) {
                              const fallbacks = [
                                {
                                  id: "st_fallback_srv_1",
                                  label:
                                    "Maintenance Pr√©ventive standard (D√©fibeo)",
                                  price: 150,
                                },
                                {
                                  id: "st_fallback_srv_2",
                                  label: "Mise en service DAE (D√©fibeo)",
                                  price: 120,
                                },
                                {
                                  id: "st_fallback_srv_3",
                                  label: "Audit de conformit√© (D√©fibeo)",
                                  price: 95,
                                },
                              ];
                              const matchedFallback = fallbacks.find(
                                (fb) =>
                                  fb.id === updatedReport.serviceEmettreId,
                              );
                              if (matchedFallback) {
                                invoiceItems.push({
                                  variableId: "v_srv_fallback",
                                  nomPiece: matchedFallback.label,
                                  prixVenteHt: matchedFallback.price,
                                  quantite: 1,
                                });
                              }
                            }
                          }
                        }

                        // Add kit if replaced & selected
                        if (
                          updatedReport.kitSecoursRemplaceOuAjoute === "Oui" &&
                          updatedReport.selectionKitSecoursRemplace
                        ) {
                          const st = stocks.find(
                            (s: any) =>
                              s.id ===
                              updatedReport.selectionKitSecoursRemplace,
                          );
                          if (st) {
                            const matchedVar = variables.find(
                              (v: any) => v.id === st.denominationPieceId,
                            );
                            invoiceItems.push({
                              variableId: st.denominationPieceId,
                              nomPiece: matchedVar
                                ? `${matchedVar.nom} (${matchedVar.marque})`
                                : "Kit de secours",
                              prixVenteHt: st.prixVenteHt,
                              quantite: 1,
                            });
                          }
                        }

                        // Add battery if replaced & selected
                        if (
                          updatedReport.batterieRemplacee === "Oui" &&
                          updatedReport.selectionBatterieRemplacee
                        ) {
                          const st = stocks.find(
                            (s: any) =>
                              s.id === updatedReport.selectionBatterieRemplacee,
                          );
                          if (st) {
                            const matchedVar = variables.find(
                              (v: any) => v.id === st.denominationPieceId,
                            );
                            invoiceItems.push({
                              variableId: st.denominationPieceId,
                              nomPiece: matchedVar
                                ? `${matchedVar.nom} (${matchedVar.marque})`
                                : "Batterie",
                              prixVenteHt: st.prixVenteHt,
                              quantite: 1,
                            });
                          }
                        }

                        // Add electrode P if replaced & selected
                        if (
                          updatedReport.electrodePRemplacee === "Oui" &&
                          updatedReport.selectionElectrodePRemplacee
                        ) {
                          const st = stocks.find(
                            (s: any) =>
                              s.id ===
                              updatedReport.selectionElectrodePRemplacee,
                          );
                          if (st) {
                            const matchedVar = variables.find(
                              (v: any) => v.id === st.denominationPieceId,
                            );
                            invoiceItems.push({
                              variableId: st.denominationPieceId,
                              nomPiece: matchedVar
                                ? `${matchedVar.nom} (${matchedVar.marque})`
                                : "√âlectrode P",
                              prixVenteHt: st.prixVenteHt,
                              quantite: 1,
                            });
                          }
                        }

                        // Add electrode A if replaced & selected
                        if (
                          updatedReport.electrodeARemplacee === "Oui" &&
                          updatedReport.selectionElectrodeARemplacee
                        ) {
                          const st = stocks.find(
                            (s: any) =>
                              s.id ===
                              updatedReport.selectionElectrodeARemplacee,
                          );
                          if (st) {
                            const matchedVar = variables.find(
                              (v: any) => v.id === st.denominationPieceId,
                            );
                            invoiceItems.push({
                              variableId: st.denominationPieceId,
                              nomPiece: matchedVar
                                ? `${matchedVar.nom} (${matchedVar.marque})`
                                : "√âlectrode A",
                              prixVenteHt: st.prixVenteHt,
                              quantite: 1,
                            });
                          }
                        }

                        // Add electrode A secours if replaced & selected
                        if (
                          updatedReport.electrodeASecoursRemplacee === "Oui" &&
                          updatedReport.selectionElectrodeASecoursRemplacee
                        ) {
                          const st = stocks.find(
                            (s: any) =>
                              s.id ===
                              updatedReport.selectionElectrodeASecoursRemplacee,
                          );
                          if (st) {
                            const matchedVar = variables.find(
                              (v: any) => v.id === st.denominationPieceId,
                            );
                            invoiceItems.push({
                              variableId: st.denominationPieceId,
                              nomPiece: matchedVar
                                ? `${matchedVar.nom} (${matchedVar.marque})`
                                : "√âlectrode Secours A",
                              prixVenteHt: st.prixVenteHt,
                              quantite: 1,
                            });
                          }
                        }

                        // Add electrode P secours if replaced & selected
                        if (
                          updatedReport.electrodePSecoursRemplacee === "Oui" &&
                          updatedReport.selectionElectrodePSecoursRemplacee
                        ) {
                          const st = stocks.find(
                            (s: any) =>
                              s.id ===
                              updatedReport.selectionElectrodePSecoursRemplacee,
                          );
                          if (st) {
                            const matchedVar = variables.find(
                              (v: any) => v.id === st.denominationPieceId,
                            );
                            invoiceItems.push({
                              variableId: st.denominationPieceId,
                              nomPiece: matchedVar
                                ? `${matchedVar.nom} (${matchedVar.marque})`
                                : "√âlectrode Secours P",
                              prixVenteHt: st.prixVenteHt,
                              quantite: 1,
                            });
                          }
                        }

                        if (invoiceItems.length > 0) {
                          const clientId =
                            updatedReport.defibSnapshot?.clientId || "";
                          const matchedClient = clients.find(
                            (c: any) => c.id === clientId,
                          );
                          const clientDenomination = matchedClient
                            ? matchedClient.denomination
                            : updatedReport.defibSnapshot?.nomPrenomSite ||
                              "Client inconnu";

                          const totalHtSum = invoiceItems.reduce(
                            (sum, item) =>
                              sum + item.prixVenteHt * item.quantite,
                            0,
                          );

                          const generatedRef = getNextDocRef(
                            "Facture",
                            commercialDocs,
                          );
                          const newInvoice: CommercialDoc = {
                            id: "doc-" + Date.now(),
                            ref: generatedRef,
                            type: "Facture",
                            clientId: clientId,
                            clientDenomination: clientDenomination,
                            items: invoiceItems,
                            totalHt: totalHtSum,
                            status: "Brouillon",
                            dateStr: new Date().toISOString().split("T")[0],
                            commentaire: "G√©n√©r√©e suite √† une intervention.",
                          };

                          onUpdateCommercialDocs([
                            newInvoice,
                            ...commercialDocs,
                          ]);
                        }
                      }

                      // Automatically transition corresponding passage status to "Effectu√©"
                      if (
                        reportActiveTourId &&
                        reportActivePassageNum !== null
                      ) {
                        const updated = tours.map((t) => {
                          if (t.id === reportActiveTourId) {
                            return {
                              ...t,
                              passages: t.passages.map((p) => {
                                if (p.num === reportActivePassageNum) {
                                  return { ...p, status: "Effectu√©" };
                                }
                                return p;
                              }),
                            };
                          }
                          return t;
                        });
                        saveTours(updated);
                      }

                      alert(
                        `Le rapport "${submission.title}" a √©t√© enregistr√© avec succ√®s (en attente de validation sur le logiciel principal) !`,
                      );
                      setIsReportOverlayOpen(false);
                      setSelectedDefibId("");
                      setSelectedDefibData(null);
                      setReportActiveTourId("");
                      setReportActivePassageNum(null);
                    }}
                  />
                )}

                <div className="hidden">
                  {/* Overlay header container */}
                  <header className="px-4 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 select-none">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 bg-emerald-500/10 rounded flex items-center justify-center border border-emerald-500/20">
                        <FileSignature className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider font-mono">
                        RAPPORT D'INTERVENTION COMPLET
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsReportOverlayOpen(false);
                        setSelectedDefibId("");
                        setSelectedDefibData(null);
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Fermer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </header>

                  {/* Content form - complete 9 sections structured exactly like the principal software */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar bg-slate-50">
                    {/* SEARCH LOOKUP COMPONENT */}
                    <div className="bg-white p-3.5 border border-slate-200 rounded-2xl space-y-2 shadow-sm">
                      <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block font-mono">
                        üîç √âQUIPEMENT DE LA BASE PRINCIPALE (RECHERCHE RAPIDE)
                      </label>
                      <select
                        value={selectedDefibId}
                        onChange={(e) =>
                          handleDefibLookupChange(e.target.value)
                        }
                        className="w-full px-2.5 py-2.5 bg-slate-55 border border-slate-220 rounded-xl text-xs text-slate-800 font-bold cursor-pointer focus:outline-hidden focus:border-indigo-500"
                      >
                        <option value="">S√©lection d'un mat√©riel.</option>
                        {defibrillateurs.map((df) => (
                          <option key={df.id} value={df.id}>
                            {df.identifiant} - {df.numeroSerie}
                          </option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-500 leading-relaxed font-sans">
                        Lien direct : Toute confirmation mettra √† jour en temps
                        r√©el l'ensemble de la base de donn√©es.
                      </p>
                    </div>

                    {selectedDefibData ? (
                      <form
                        onSubmit={handleSavePdfReport}
                        className="space-y-4 pb-12"
                      >
                        {/* RAPPORT CONFIGURATION */}
                        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-3 shadow-sm">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider block font-mono">
                            üìã CONFIGURATION DU DOCUMENT PDF
                          </span>

                          {/* Title select */}
                          <div className="space-y-1">
                            <label className="text-[9.5px] font-bold text-slate-500 uppercase block">
                              Intitul√© du Document *
                            </label>
                            <select
                              value={receiptTitle}
                              onChange={(e) => setReceiptTitle(e.target.value)}
                              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 text-xs font-black rounded-lg text-slate-800 cursor-pointer"
                            >
                              <option value="RAPPORT D‚ÄôINTERVENTION">
                                RAPPORT D‚ÄôINTERVENTION
                              </option>
                              <option value="CONSTAT DE MAINTENANCE D√âFIBRILLATEUR">
                                CONSTAT DE MAINTENANCE D√âFIBRILLATEUR
                              </option>
                              <option value="RI RAPPORT INTERVENTION">
                                RI RAPPORT INTERVENTION
                              </option>
                              <option value="RAPPORT DISTANCIEL">
                                RAPPORT DISTANCIEL
                              </option>
                              <option value="BON PR√äT D√âFIBRILLATEUR">
                                BON PR√äT D√âFIBRILLATEUR
                              </option>
                              <option value="BON REPRISE D√âFIBRILLATEUR">
                                BON REPRISE D√âFIBRILLATEUR
                              </option>
                              <option value="MISE EN SERVICE D√âFIBRILLATEUR">
                                MISE EN SERVICE D√âFIBRILLATEUR
                              </option>
                            </select>
                          </div>

                          {/* Technician (Locked) */}
                          <div className="space-y-1">
                            <label className="text-[9.5px] font-bold text-slate-500 uppercase block">
                              Technicien Auteur
                            </label>
                            <input
                              type="text"
                              readOnly
                              disabled
                              value={
                                authenticatedUser?.name || "Technicien connect√©"
                              }
                              className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-indigo-600 rounded-lg cursor-not-allowed"
                            />
                          </div>

                          {/* Horodate manual entry */}
                          <div className="space-y-1">
                            <label className="text-[9.5px] font-bold text-slate-500 uppercase block font-mono">
                              Date et Heure d'Intervention
                            </label>
                            <input
                              type="text"
                              value={horodateInput}
                              onChange={(e) => setHorodateInput(e.target.value)}
                              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 text-xs font-mono text-slate-805 rounded-lg"
                            />
                          </div>

                          {/* Mission site and Photo Capture */}
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1">
                              <label className="text-[9.5px] font-bold text-slate-500 uppercase block">
                                Nature Mission *
                              </label>
                              <div className="flex flex-col gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setMissionSite("D√âPLACEMENT")}
                                  className={`py-1.5 rounded-lg text-[9px] font-black uppercase cursor-pointer border text-center transition-all ${
                                    missionSite === "D√âPLACEMENT"
                                      ? "bg-indigo-50 text-indigo-700 border-indigo-305 shadow-xs"
                                      : "bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200"
                                  }`}
                                >
                                  üìç D√©placement
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMissionSite("ATELIER SAV")}
                                  className={`py-1.5 rounded-lg text-[9px] font-black uppercase cursor-pointer border text-center transition-all ${
                                    missionSite === "ATELIER SAV"
                                      ? "bg-indigo-50 text-indigo-700 border-indigo-305 shadow-xs"
                                      : "bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200"
                                  }`}
                                >
                                  ‚öôÔ∏è Atelier SAV
                                </button>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9.5px] font-bold text-slate-500 uppercase block">
                                Clich√© terrain
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => photoInputRef.current?.click()}
                                  className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 font-bold cursor-pointer transition-colors shrink-0 flex items-center justify-center animate-pulse"
                                  title="Prendre Photo"
                                >
                                  <Camera className="w-4 h-4 text-emerald-500" />
                                </button>
                                <input
                                  type="file"
                                  accept="image/*"
                                  ref={photoInputRef}
                                  onChange={(e) =>
                                    triggerPhotoRead(e, setTechPhotoUrl)
                                  }
                                  className="hidden"
                                />
                                {techPhotoUrl ? (
                                  <div className="relative w-10 h-10 border border-slate-200 rounded overflow-hidden shadow-xs shrink-0">
                                    <img
                                      src={techPhotoUrl}
                                      className="w-full h-full object-cover"
                                      alt="Clich√© Preview"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setTechPhotoUrl("")}
                                      className="absolute inset-0 bg-red-600/90 font-black text-[8px] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer text-white uppercase"
                                    >
                                      Suppr.
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[8px] text-slate-500 font-mono italic">
                                    No photo
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* THE 9 CONCURRENT SECTIONS OF PRINCIPAL REGISTER FORM COMPOSITION */}
                        <div className="space-y-2">
                          {/* SECTION 1: DAE DESCRIPTION AND MODEL */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection1(!openSection1)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-650 font-mono font-bold">
                                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                                Section 1: Appareil D√©fibrillateur
                              </span>
                              <span className="text-slate-500">
                                {openSection1 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection1 && (
                              <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50/40 text-[10px]">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Identifiant unique *
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={
                                        selectedDefibData.identifiant || ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          identifiant:
                                            e.target.value.toUpperCase(),
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white text-slate-800 border border-slate-200 rounded font-bold font-mono text-xs focus:ring-0 focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Num√©ro de S√©rie *
                                    </label>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        required
                                        value={
                                          selectedDefibData.numeroSerie || ""
                                        }
                                        onChange={(e) =>
                                          setSelectedDefibData({
                                            ...selectedDefibData,
                                            numeroSerie: e.target.value,
                                          })
                                        }
                                        className="flex-1 px-2 py-1 bg-white text-slate-800 border border-slate-200 rounded font-mono text-xs focus:ring-0 focus:border-indigo-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setIsSerieScannerOpen(true)
                                        }
                                        className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-150 rounded text-[10px] font-black cursor-pointer transition-all shrink-0 font-sans"
                                      >
                                        Scan
                                      </button>
                                    </div>
                                    {isSerieScannerOpen && (
                                      <BarcodeScannerModal
                                        isOpen={isSerieScannerOpen}
                                        onClose={() =>
                                          setIsSerieScannerOpen(false)
                                        }
                                        onScanSuccess={(scannedText) => {
                                          if (selectedDefibData) {
                                            setSelectedDefibData({
                                              ...selectedDefibData,
                                              numeroSerie: scannedText,
                                            });
                                          }
                                          setIsSerieScannerOpen(false);
                                        }}
                                      />
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                    Mod√®le de D√©fibrillateur *
                                  </label>
                                  <select
                                    value={selectedDefibData.modeleId || ""}
                                    onChange={(e) =>
                                      setSelectedDefibData({
                                        ...selectedDefibData,
                                        modeleId: e.target.value,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-white text-slate-800 border border-slate-200 rounded text-xs cursor-pointer focus:border-indigo-500"
                                    required
                                  >
                                    <option value="">
                                      -- S√©lectionner un mod√®le --
                                    </option>
                                    {variables
                                      .filter(
                                        (v) =>
                                          v.category ===
                                          "Mod√®le D√©fibrillateur",
                                      )
                                      .map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.nom} ({v.marque})
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SECTION 2: CLIENT INFO & CONTRACT DETAILS */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection2(!openSection2)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-655 font-mono font-bold">
                                <User className="w-3.5 h-3.5 text-indigo-600" />
                                Section 2: Client & Contrat souscrit
                              </span>
                              <span className="text-slate-500">
                                {openSection2 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection2 && (
                              <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50/40 text-[10px]">
                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                    Client rattach√© *
                                  </label>
                                  <select
                                    value={selectedDefibData.clientId || ""}
                                    onChange={(e) => {
                                      const val = e.target.value.slice(0, 25);
                                      const matched = clients.find(
                                        (c) => c.id === val,
                                      );
                                      if (matched) {
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          clientId: val,
                                          nomPrenomSite:
                                            matched.nomPrenomSite || "",
                                          telephoneSite:
                                            matched.telephoneSite || "",
                                          emailSite: matched.emailSite || "",
                                          contrat: matched.contrat || "Non",
                                          nomContrat: matched.nomContrat || "",
                                          referenceContrat:
                                            matched.referenceContrat || "",
                                          debutContrat:
                                            matched.debutContrat || "",
                                          finContrat: matched.finContrat || "",
                                        });
                                      } else {
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          clientId: val,
                                        });
                                      }
                                    }}
                                    className="w-full px-2 py-1.5 bg-white text-slate-800 border border-slate-200 rounded text-xs cursor-pointer focus:border-indigo-500"
                                    required
                                  >
                                    <option value="">
                                      S√©lectionner un client...
                                    </option>
                                    {clients.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.denomination} ({c.siret})
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Nom Site / Responsable
                                    </label>
                                    <input
                                      type="text"
                                      value={
                                        selectedDefibData.nomPrenomSite || ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          nomPrenomSite: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      T√©l√©phone Site
                                    </label>
                                    <input
                                      type="text"
                                      value={
                                        selectedDefibData.telephoneSite || ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          telephoneSite: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] focus:border-indigo-500"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                    Email Responsable
                                  </label>
                                  <input
                                    type="text"
                                    value={selectedDefibData.emailSite || ""}
                                    onChange={(e) =>
                                      setSelectedDefibData({
                                        ...selectedDefibData,
                                        emailSite: e.target.value,
                                      })
                                    }
                                    className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] focus:border-indigo-500"
                                  />
                                </div>

                                <div className="border-t border-slate-200 pt-2 grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Contrat Associ√© ?
                                    </label>
                                    <select
                                      value={selectedDefibData.contrat || "Non"}
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          contrat: e.target.value as any,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] focus:border-indigo-500"
                                    >
                                      <option value="Oui">
                                        Oui (Contrat actif)
                                      </option>
                                      <option value="Non">Non</option>
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      R√©f√©rence Contrat
                                    </label>
                                    <input
                                      type="text"
                                      value={
                                        selectedDefibData.referenceContrat || ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          referenceContrat: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] font-mono focus:border-indigo-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SECTION 3: CABINET HOUSING / COFFRET */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection3(!openSection3)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-655 font-mono font-bold">
                                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                                Section 3: Coffret de Protection
                              </span>
                              <span className="text-slate-500">
                                {openSection3 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection3 && (
                              <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50/40 text-[10px]">
                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                    Mod√®le de Coffret / Bo√Ætier
                                  </label>
                                  <select
                                    value={
                                      selectedDefibData.modeleCoffretId || ""
                                    }
                                    onChange={(e) =>
                                      setSelectedDefibData({
                                        ...selectedDefibData,
                                        modeleCoffretId: e.target.value,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-white text-slate-800 border border-slate-200 rounded text-xs focus:border-indigo-500"
                                  >
                                    <option value="">
                                      S√©lectionner un mod√®le...
                                    </option>
                                    {variables
                                      .filter(
                                        (v) => v.category === "Mod√®le Coffret",
                                      )
                                      .map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.nom} ({v.marque})
                                        </option>
                                      ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                    Num√©ro Lot Bo√Ætier
                                  </label>
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      value={
                                        selectedDefibData.numeroLotCoffret || ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          numeroLotCoffret: e.target.value,
                                        })
                                      }
                                      className="flex-1 px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9.3px] font-mono focus:border-indigo-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setIsLotScannerOpen(true)}
                                      className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-150 rounded text-[10px] font-black cursor-pointer transition-all shrink-0"
                                    >
                                      Scan
                                    </button>
                                  </div>
                                  {isLotScannerOpen && (
                                    <BarcodeScannerModal
                                      isOpen={isLotScannerOpen}
                                      onClose={() => setIsLotScannerOpen(false)}
                                      onScanSuccess={(scannedText) => {
                                        if (selectedDefibData) {
                                          setSelectedDefibData({
                                            ...selectedDefibData,
                                            numeroLotCoffret: scannedText,
                                          });
                                        }
                                        setIsLotScannerOpen(false);
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SECTION 4: LOCATION AND GEOLOC DETAILS */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection4(!openSection4)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-655 font-mono font-bold">
                                <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                                Section 4: Acc√®s & G√©olocalisation
                              </span>
                              <span className="text-slate-500">
                                {openSection4 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection4 && (
                              <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50/40 text-[10px]">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      N¬∞ & Rue
                                    </label>
                                    <input
                                      type="text"
                                      value={selectedDefibData.numVoie || ""}
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          numVoie: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Ville
                                    </label>
                                    <input
                                      type="text"
                                      value={selectedDefibData.ville || ""}
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          ville: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] focus:border-indigo-500"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Code Postal
                                    </label>
                                    <input
                                      type="text"
                                      value={selectedDefibData.cp || ""}
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          cp: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      R√©gion
                                    </label>
                                    <input
                                      type="text"
                                      value={
                                        selectedDefibData.region ||
                                        "√éle-de-France"
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          region: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] focus:border-indigo-500"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-emerald-600 uppercase font-mono">
                                      Latitude GPS *
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={selectedDefibData.latitude || ""}
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          latitude: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-emerald-600 rounded font-mono text-[9px] font-bold focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-emerald-600 uppercase font-mono">
                                      Longitude GPS *
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={selectedDefibData.longitude || ""}
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          longitude: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-emerald-600 rounded font-mono text-[9px] font-bold focus:border-indigo-500"
                                    />
                                  </div>
                                </div>

                                <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[9px]">
                                  <span className="font-bold text-slate-500 uppercase">
                                    Ouverture H24 / J7
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={
                                      selectedDefibData.acces247 || false
                                    }
                                    onChange={(e) =>
                                      setSelectedDefibData({
                                        ...selectedDefibData,
                                        acces247: e.target.checked,
                                      })
                                    }
                                    className="rounded bg-white border-slate-200 text-indigo-650 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SECTION 5: MISE EN SERVICE & CYCLE DATES */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection5(!openSection5)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-655 font-mono font-bold">
                                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                Section 5: Dates cl√©s de Cycle & Validit√©
                              </span>
                              <span className="text-slate-500">
                                {openSection5 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection5 && (
                              <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50/40 text-[10px] font-mono">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase font-sans">
                                      Mise en Service
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        selectedDefibData.miseEnService || ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          miseEnService: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9.5px] focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase font-sans">
                                      Fin de Garantie
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        selectedDefibData.finGarantie || ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          finGarantie: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9.5px] focus:border-indigo-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SECTION 6: ADULT ELECTRODE PADS */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection6(!openSection6)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-655 font-mono font-bold">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                Section 6: √âlectrode Adulte & Mixte
                              </span>
                              <span className="text-slate-500">
                                {openSection6 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection6 && (
                              <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50/40 text-[10px]">
                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                    Mod√®le d'√©lectrode Adulte
                                  </label>
                                  <select
                                    value={
                                      selectedDefibData.modeleElectrodeAId || ""
                                    }
                                    onChange={(e) =>
                                      setSelectedDefibData({
                                        ...selectedDefibData,
                                        modeleElectrodeAId: e.target.value,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-white text-slate-800 border border-slate-200 rounded text-xs cursor-pointer focus:border-indigo-500"
                                  >
                                    <option value="">
                                      S√©lectionner un mod√®le...
                                    </option>
                                    {variables
                                      .filter(
                                        (v) =>
                                          v.category === "Mod√®le √âlectrode",
                                      )
                                      .map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.nom} ({v.marque})
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Num√©ro de LOT (A)
                                    </label>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={
                                          selectedDefibData.lotElectrodeA || ""
                                        }
                                        onChange={(e) =>
                                          setSelectedDefibData({
                                            ...selectedDefibData,
                                            lotElectrodeA: e.target.value,
                                          })
                                        }
                                        className="flex-1 px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9.5px] font-mono focus:border-indigo-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setIsLotAScannerOpen(true)
                                        }
                                        className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-150 rounded text-[10px] font-black cursor-pointer transition-all shrink-0 font-sans"
                                      >
                                        Scan
                                      </button>
                                    </div>
                                    {isLotAScannerOpen && (
                                      <BarcodeScannerModal
                                        isOpen={isLotAScannerOpen}
                                        onClose={() =>
                                          setIsLotAScannerOpen(false)
                                        }
                                        onScanSuccess={(scannedText) => {
                                          if (selectedDefibData) {
                                            setSelectedDefibData({
                                              ...selectedDefibData,
                                              lotElectrodeA: scannedText,
                                            });
                                          }
                                          setIsLotAScannerOpen(false);
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Situation Couleur (A)
                                    </label>
                                    <select
                                      value={
                                        selectedDefibData.situationElectrodeA ||
                                        "Vert"
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          situationElectrodeA: e.target
                                            .value as any,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white text-slate-800 border border-slate-200 rounded text-[9px] cursor-pointer focus:border-indigo-500"
                                    >
                                      <option value="Vert">
                                        üü¢ Conforme (Vert)
                                      </option>
                                      <option value="Orange">
                                        üü° Rechange Recommand√©e
                                      </option>
                                      <option value="Rouge">
                                        üî¥ Hors validit√© (Rouge)
                                      </option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 font-mono">
                                  <div className="space-y-0.5">
                                    <label className="text-[7.5px] font-bold text-slate-500 uppercase font-sans">
                                      Date d'Insertion
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        selectedDefibData.insertionElectrodeA ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          insertionElectrodeA: e.target.value,
                                        })
                                      }
                                      className="w-full px-1.5 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[8.5px] focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="text-[7.5px] font-bold text-slate-500 uppercase font-sans">
                                      P√©remption Pad (A) *
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        selectedDefibData.peremptionElectrodeA ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          peremptionElectrodeA: e.target.value,
                                        })
                                      }
                                      className="w-full px-1.5 py-1 bg-white border border-slate-200 text-slate-805 rounded text-[8.5px] border-emerald-500/30 focus:border-indigo-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SECTION 7: CHILD ELECTRODE PADS */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection7(!openSection7)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-655 font-mono font-bold">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                Section 7: √âlectrode P√©diatrique & Secours
                              </span>
                              <span className="text-slate-500">
                                {openSection7 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection7 && (
                              <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50/40 text-[10px]">
                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                    Mod√®le √âlectrode P√©diatrique
                                  </label>
                                  <select
                                    value={
                                      selectedDefibData.modeleElectrodePId || ""
                                    }
                                    onChange={(e) =>
                                      setSelectedDefibData({
                                        ...selectedDefibData,
                                        modeleElectrodePId: e.target.value,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-white text-slate-800 border border-slate-200 rounded text-xs cursor-pointer focus:border-indigo-500"
                                  >
                                    <option value="">
                                      S√©lectionner un mod√®le...
                                    </option>
                                    {variables
                                      .filter(
                                        (v) =>
                                          v.category === "Mod√®le √âlectrode",
                                      )
                                      .map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.nom} ({v.marque})
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Num√©ro LOT (P)
                                    </label>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={
                                          selectedDefibData.lotElectrodeP || ""
                                        }
                                        onChange={(e) =>
                                          setSelectedDefibData({
                                            ...selectedDefibData,
                                            lotElectrodeP: e.target.value,
                                          })
                                        }
                                        className="flex-1 px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9.5px] font-mono focus:border-indigo-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setIsLotPScannerOpen(true)
                                        }
                                        className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-150 rounded text-[10px] font-black cursor-pointer transition-all shrink-0 font-sans"
                                      >
                                        Scan
                                      </button>
                                    </div>
                                    {isLotPScannerOpen && (
                                      <BarcodeScannerModal
                                        isOpen={isLotPScannerOpen}
                                        onClose={() =>
                                          setIsLotPScannerOpen(false)
                                        }
                                        onScanSuccess={(scannedText) => {
                                          if (selectedDefibData) {
                                            setSelectedDefibData({
                                              ...selectedDefibData,
                                              lotElectrodeP: scannedText,
                                            });
                                          }
                                          setIsLotPScannerOpen(false);
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      P√©remption Pad (P) *
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        selectedDefibData.peremptionElectrodeP ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          peremptionElectrodeP: e.target.value,
                                        })
                                      }
                                      className="w-full px-1.5 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9px] font-mono focus:border-indigo-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SECTION 8: ACCUMULATOR / BATTERY SYSTEM */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection8(!openSection8)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-655 font-mono font-bold">
                                <Zap className="w-3.5 h-3.5 text-indigo-600" />
                                Section 8: Accumulateur / Batterie d'√ânergie
                              </span>
                              <span className="text-slate-500">
                                {openSection8 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection8 && (
                              <div className="p-3 border-t border-slate-200 space-y-3.5 bg-slate-50/40 text-[10px]">
                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                    Mod√®le d'accumulateur
                                  </label>
                                  <select
                                    value={
                                      selectedDefibData.modeleBatterieId || ""
                                    }
                                    onChange={(e) =>
                                      setSelectedDefibData({
                                        ...selectedDefibData,
                                        modeleBatterieId: e.target.value,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-white text-slate-800 border border-slate-200 rounded text-xs cursor-pointer focus:border-indigo-500"
                                  >
                                    <option value="">
                                      S√©lectionner un mod√®le...
                                    </option>
                                    {variables
                                      .filter(
                                        (v) => v.category === "Mod√®le Batterie",
                                      )
                                      .map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.nom} ({v.marque})
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-0.5">
                                    <label className="block text-[8px] font-black text-emerald-600 uppercase font-mono">
                                      % Charge *
                                    </label>
                                    <input
                                      type="number"
                                      maxLength={3}
                                      required
                                      value={
                                        selectedDefibData.pourcentageBatterie ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          pourcentageBatterie: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1.5 bg-white border border-emerald-500/30 text-emerald-600 font-black font-mono text-[11px] rounded text-center focus:border-emerald-500"
                                      placeholder="100"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      LOT Batterie
                                    </label>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={
                                          selectedDefibData.lotBatterie || ""
                                        }
                                        onChange={(e) =>
                                          setSelectedDefibData({
                                            ...selectedDefibData,
                                            lotBatterie: e.target.value,
                                          })
                                        }
                                        className="flex-1 px-2 py-1.5 bg-white border border-slate-200 text-slate-800 rounded text-[9.5px] font-mono focus:border-indigo-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setIsLotBatScannerOpen(true)
                                        }
                                        className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-150 rounded text-[10px] font-black cursor-pointer transition-all shrink-0 font-sans"
                                      >
                                        Scan
                                      </button>
                                    </div>
                                    {isLotBatScannerOpen && (
                                      <BarcodeScannerModal
                                        isOpen={isLotBatScannerOpen}
                                        onClose={() =>
                                          setIsLotBatScannerOpen(false)
                                        }
                                        onScanSuccess={(scannedText) => {
                                          if (selectedDefibData) {
                                            setSelectedDefibData({
                                              ...selectedDefibData,
                                              lotBatterie: scannedText,
                                            });
                                          }
                                          setIsLotBatScannerOpen(false);
                                        }}
                                      />
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 font-mono">
                                  <div className="space-y-0.5">
                                    <label className="text-[7.5px] font-bold text-slate-500 uppercase font-sans">
                                      P√©remption Batterie *
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        selectedDefibData.peremptionBatterie ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          peremptionBatterie: e.target.value,
                                        })
                                      }
                                      className="w-full px-1.5 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[8.5px] focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="text-[7.5px] font-bold text-slate-500 uppercase font-sans">
                                      Fabrication.
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        selectedDefibData.fabricationBatterie ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          fabricationBatterie: e.target.value,
                                        })
                                      }
                                      className="w-full px-1.5 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[8.5px] focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="text-[7.5px] font-bold text-slate-500 uppercase font-sans">
                                      Insertion.
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        selectedDefibData.insertionBatterie ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          insertionBatterie: e.target.value,
                                        })
                                      }
                                      className="w-full px-1.5 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[8.5px] focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="text-[7.5px] font-bold text-slate-500 uppercase font-sans">
                                      √âtat de sant√©
                                    </label>
                                    <select
                                      value={
                                        selectedDefibData.situationBatterie ||
                                        "Vert"
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          situationBatterie: e.target
                                            .value as any,
                                        })
                                      }
                                      className="w-full px-1.5 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[8.5px] focus:border-indigo-500"
                                    >
                                      <option value="Vert">
                                        üü¢ Conforme (Vert)
                                      </option>
                                      <option value="Orange">
                                        üü° Basse tension
                                      </option>
                                      <option value="Rouge">
                                        üî¥ Remplacement
                                      </option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SECTION 9: GENERAL CONFORMITY & ARCHIVE */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => setOpenSection9(!openSection9)}
                              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-[10px] font-black uppercase text-slate-700 tracking-wider transition-all"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-655 font-mono font-bold">
                                <CheckCircle className="w-3.5 h-3.5 text-indigo-600" />
                                Section 9: Cat√©gories & Conformit√© Globale
                              </span>
                              <span className="text-slate-500">
                                {openSection9 ? "‚ñ≤" : "‚ñº"}
                              </span>
                            </button>

                            {openSection9 && (
                              <div className="p-3 border-t border-slate-200 space-y-3.5 bg-slate-50/40 text-[10px]">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="block text-[8px] font-bold text-amber-600 uppercase font-mono">
                                      Conforme *
                                    </label>
                                    <select
                                      value={
                                        selectedDefibData.conforme || "Oui"
                                      }
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          conforme: e.target.value as any,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white text-slate-800 border border-slate-200 rounded text-[9.5px] focus:border-indigo-500"
                                    >
                                      <option value="Oui">
                                        Oui (Conforme)
                                      </option>
                                      <option value="Non">
                                        Non (Non conforme)
                                      </option>
                                    </select>
                                  </div>
                                  <div className="space-y-1 font-sans">
                                    <label className="block text-[8px] font-bold text-slate-500 uppercase">
                                      Archiv√© pour Historique
                                    </label>
                                    <select
                                      value={selectedDefibData.archive || "Non"}
                                      onChange={(e) =>
                                        setSelectedDefibData({
                                          ...selectedDefibData,
                                          archive: e.target.value as any,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded text-[9.5px] focus:border-indigo-500"
                                    >
                                      <option value="Oui">Oui (Archiv√©)</option>
                                      <option value="Non">Non (Actif)</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase col-span-2">
                                    Notes et observations techniques
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={selectedDefibData.commentaire || ""}
                                    onChange={(e) =>
                                      setSelectedDefibData({
                                        ...selectedDefibData,
                                        commentaire: e.target.value,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-white border border-slate-200 text-slate-800 text-[10px] rounded leading-tight focus:border-indigo-500"
                                    placeholder="Entrez vos remarques de maintenance..."
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* SUBMIT ACTION BUTTONS */}
                        <div className="pt-2">
                          <button
                            type="submit"
                            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-lg cursor-pointer transition-colors border border-emerald-500 flex items-center justify-center gap-1.5 uppercase tracking-wider"
                          >
                            <Check className="w-4 h-4" />
                            Sauvegarder et Valider le Rapport
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="p-8 text-center text-slate-500 text-[10px] uppercase border border-dashed border-slate-200 rounded-2xl font-mono leading-relaxed bg-slate-50">
                        Veuillez charger un DAE ci-dessus pour charger
                        l'int√©gralit√© du formulaire de rapport.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* OVERLAY FOR EMARGEMENT FORM */}
            {isEmargementOverlayOpen && (
              <div
                className="fixed inset-0 bg-white z-50 w-full h-full overflow-y-auto animate-fadeIn"
                id="emargement-form-overlay-modal"
              >
                <div className="w-full h-full p-4 sm:p-6 text-black bg-white">
                  <EmargementsTab
                    emargements={emargements || []}
                    saveEmargements={onUpdateEmargements || (() => {})}
                    formations={formations || []}
                    stagiaires={stagiaires || []}
                    members={members || []}
                    companyInfo={companyInfo}
                    initialEditingId={emargementModalRecordId}
                    hideList={true}
                    onCloseModal={() => setIsEmargementOverlayOpen(false)}
                  />
                </div>
              </div>
            )}

            {/* Alert banner if no ongoing pointage for connected technician session */}
            {!hidePointage && !pointages.some((p) => p.isOngoing && p.techName?.trim().toLowerCase() === (authenticatedUser?.name || "").trim().toLowerCase()) && (
              <div
                className="text-white text-center font-semibold select-none shadow-xs font-sans shrink-0"
                style={{
                  background: "#3556ec",
                  fontSize: "14px",
                  padding: "12px 0px",
                }}
              >
                {t("Vous n‚Äôavez pas de pointage en cours.")}
              </div>
            )}

            {/* Top Bar Navigation and Tab Selector Wrapper with Theme Color */}
            <div style={{ background: currentTechTheme.color, padding: "6px 0px", borderRadius: "0px 0px 13px 13px" }}>
              {/* TAB SELECTOR: Horizontal capsule switch toggle layout with dynamic fades */}
              <nav
                className="py-0 px-0 relative shrink-0"
                id="nav-tabs"
                style={{ background: "transparent" }}
              >
                <div
                  ref={navRef}
                  onScroll={handleNavScroll}
                  className="flex py-1 px-2.5 gap-3.5 shrink-0 overflow-x-auto no-scrollbar scroll-smooth min-w-full"
                  style={{ background: "transparent" }}
                >
                  <button
                    onClick={() => setActiveTab("interventions")}
                    style={
                      activeTab === "interventions"
                        ? {
                            background: "rgb(53, 86, 236)",
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                            borderRadius: "12px",
                            boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          }
                        : {
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                          }
                    }
                    className="px-5 py-2.5 rounded-[12px] flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Interventions</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("rapports")}
                    style={
                      activeTab === "rapports"
                        ? {
                            background: "rgb(53, 86, 236)",
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                            borderRadius: "12px",
                            boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          }
                        : {
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                          }
                    }
                    className="px-5 py-2.5 rounded-[12px] flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Rapports</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("planning")}
                    style={
                      activeTab === "planning"
                        ? {
                            background: "rgb(53, 86, 236)",
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                            borderRadius: "12px",
                            boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          }
                        : {
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                          }
                    }
                    className="px-5 py-2.5 rounded-[12px] flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Planning</span>
                  </button>

                  {!hidePointage && !companyInfo?.hiddenTabs?.includes("Temps (Webapp)") && (
                    <button
                      onClick={() => setActiveTab("temps")}
                      style={
                        activeTab === "temps"
                          ? {
                              background: "rgb(53, 86, 236)",
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                              borderRadius: "12px",
                              boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                            }
                          : {
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                            }
                      }
                      className="px-5 py-2.5 rounded-[12px] flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Temps</span>
                    </button>
                  )}

                  {!isStocksHidden && (
                    <button
                      onClick={() => setActiveTab("stocks")}
                      style={
                        activeTab === "stocks"
                          ? {
                              background: "rgb(53, 86, 236)",
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                              borderRadius: "12px",
                              boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                            }
                          : {
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                            }
                      }
                      className="px-5 py-2.5 rounded-[12px] flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Stocks</span>
                    </button>
                  )}

                  {!isFraisHidden && (
                    <button
                      onClick={() => setActiveTab("frais")}
                      style={
                        activeTab === "frais"
                          ? {
                              background: "rgb(53, 86, 236)",
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                              borderRadius: "12px",
                              boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                            }
                          : {
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                            }
                      }
                      className="px-5 py-2.5 rounded-[12px] flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Frais</span>
                    </button>
                  )}

                  {!companyInfo?.hiddenTabs?.includes("Relev√© Concurrentiel (Webapp)") && (
                    <button
                      onClick={() => setActiveTab("veille")}
                      style={
                        activeTab === "veille"
                          ? {
                              background: "rgb(53, 86, 236)",
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                              borderRadius: "12px",
                              boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                            }
                          : {
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                            }
                      }
                      className="px-5 py-2.5 rounded-[12px] flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Relev√© Concurrentiel</span>
                    </button>
                  )}

                  <button
                    onClick={() => setActiveTab("localisation")}
                    style={
                      activeTab === "localisation"
                        ? {
                            background: "rgb(53, 86, 236)",
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                            borderRadius: "12px",
                            boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                          }
                        : {
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: "bold",
                          }
                    }
                    className="px-5 py-2.5 rounded-[12px] flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>R√©glages</span>
                  </button>
                </div>
              </nav>
            </div>

            {/* Scrollable Contents Body */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar"
              id="tab-content-area"
            >
              {/* ----------------- TAB 1: INTERVENTIONS ----------------- */}
              {activeTab === "interventions" &&
                (() => {
                  const currentTourForPause = selectedTourId
                    ? getSortedTours().find((t) => t.id === selectedTourId)
                    : null;
                  const isTourFinished = currentTourForPause ? currentTourForPause.status === "Termin√©" : true;
                  const isTourActive = !!(currentTourForPause && currentTourForPause.status !== "Termin√©");
                  const hasTodoMissions =
                    currentTourForPause && currentTourForPause.passages
                      ? currentTourForPause.passages.some(
                          (p: any) => p.status === "√Ä faire",
                        )
                      : false;
                  const isTourOpen = !!(currentTourForPause && !isTourFinished);

                  return (
                    <div
                      className="space-y-4 pb-16 animate-fadeIn"
                      id="tab-interventions-screen"
                    >
                      {/* Technician Name display field */}
                      <div className="px-1 select-none">
                        <input
                          type="text"
                          readOnly
                          value={authenticatedUser?.name || ""}
                          className="w-full bg-white text-black transition-all duration-150 focus:outline-none focus:ring-0 focus-visible:outline-none text-center"
                          style={{
                            border: "1px solid rgb(201, 190, 205)",
                            borderRadius: "14px",
                            padding: "14px 20px",
                            fontSize: "18px",
                            fontWeight: "bold",
                            boxShadow: "none",
                            outline: "none",
                            textAlign: "center",
                          }}
                        />
                      </div>

                      {/* Select native dropdown system for choosing active tour - sorted by date newest first */}
                      <div className="px-1 select-none pb-4">
                        <select
                          value={selectedTourId}
                          onChange={(e) => setSelectedTourId(e.target.value)}
                          className="w-full bg-white text-black cursor-pointer appearance-none transition-all duration-150 focus:outline-none focus:ring-0 focus-visible:outline-none text-center"
                          style={{
                            border: "1px solid rgb(201, 190, 205)",
                            borderRadius: "14px",
                            padding: "14px 20px",
                            fontSize: "18px",
                            fontWeight: "bold",
                            boxShadow: "none",
                            outline: "none",
                            textAlign: "center",
                            textAlignLast: "center",
                          }}
                        >
                          <option value="" disabled>
                            S√©lectionnez une tourn√©e
                          </option>
                          {getSortedTours().map((t) => (
                            <option key={t.id} value={t.id}>
                              {truncateTourTitle(t.title)} - {t.startDate}{" "}
                              {t.status === "Termin√©" ? " (Termin√©)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Toggle "Suspendre pour pause" - Hors de la div de la tourn√©e */}
                      <div className="px-1" id="pause-toggle-block">
                        <div
                          className="bg-white border px-4 py-4 space-y-3 flex flex-col justify-center"
                          style={{
                            borderColor: "rgb(201, 190, 205)",
                            borderRadius: "14px",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[18px] font-bold text-black font-sans">
                              {t("Suspendre pour pause.")}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateTourPauseState(!pauseEnabled, pauseReason || "Nuit H√¥tel")}
                              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden"
                              style={{
                                backgroundColor: pauseEnabled
                                  ? "#fe4eba"
                                  : "#cbd5e1",
                              }}
                            >
                              <span
                                className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                                style={{
                                  transform: pauseEnabled
                                    ? "translateX(20px)"
                                    : "translateX(0px)",
                                }}
                              />
                            </button>
                          </div>
                          {pauseEnabled && (
                            <div className="space-y-3 pt-1">
                              {getNextPassageZone(selectedTourId) && (
                                <div className="text-[18px] font-semibold text-[#fe4eba] font-sans">
                                  {t("Zone recommand√©e pour votre pause :")}{" "}
                                  <span className="font-bold">
                                    {getNextPassageZone(selectedTourId)}
                                  </span>
                                  .
                                </div>
                              )}
                              <div>
                                <select
                                  value={pauseReason}
                                  onChange={(e) => updateTourPauseState(true, e.target.value)}
                                  className="w-full bg-white text-black font-semibold transition-all duration-150 focus:outline-none cursor-pointer"
                                  style={{
                                    border: "1px solid rgb(201, 190, 205)",
                                    borderRadius: "14px",
                                    padding: "10px 14px",
                                    fontSize: "16px",
                                  }}
                                >
                                  <option value="Nuit H√¥tel">Nuit H√¥tel</option>
                                  <option value="Week-End">Week-End</option>
                                  <option value="Jour F√©ri√©">Jour F√©ri√©</option>
                                  <option value="Incident">Incident</option>
                                  <option value="Autre">Autre</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Div-Info */}
                      <HelpBubble
                        cacheKey="help_webapp_interventions_no_tour"
                        text="Seules les tourn√©es marqu√©es ¬´ √Ä faire ¬ª et attribu√©es au technicien peuvent √™tre s√©lectionn√©es."
                      />

                      {/* Section "Affiner la tourn√©e" */}
                      {selectedTourId && isTourActive && (
                        <div className="px-1" id="affiner-tournee-block">
                          <div
                            className="bg-white border px-4 space-y-3 flex flex-col justify-center"
                            style={{
                              borderColor: "rgb(201, 190, 205)",
                              borderRadius: "14px",
                              minHeight: "78px",
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[18px] font-bold text-black font-sans">
                                {t("Affiner la tourn√©e.")}
                              </span>
                              <button
                                type="button"
                                onClick={handleRecalculateTour}
                                style={{
                                  boxShadow: "rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset",
                                }}
                                className="px-5 py-2.5 bg-black hover:bg-neutral-900 text-white font-bold text-[18px] rounded-[13px] transition-all"
                              >
                                {t("Re/Calculer")}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* List of stacked tourn√©es */}
                      {selectedTourId &&
                        getSortedTours()
                          .filter((t) => t.id === selectedTourId)
                          .map((t) => (
                            <div key={t.id} className="space-y-3">
                              {/* Stacked Passage records list */}
                              <div
                                className="grid grid-cols-1 md:grid-cols-2 gap-3 space-y-0"
                                id={`tour-passages-${t.id}`}
                              >
                                {t.passages.filter((p: any) => p.status !== "Attente").map((p) => {
                                  const isCompleted = p.status === "Effectu√©";
                                  const isFormationMission = p.equipmentType === 'Formation' || p.equipmentType?.toLowerCase().includes('formation') || !!p.formationId;
                                  const matchedFmt = isFormationMission ? formations?.find((f: any) => f.id === p.formationId || f.id === p.identifiant) : null;
                                  const targetFormationId = p.formationId || matchedFmt?.id || p.identifiant;
                                  const matchedEmargement = isFormationMission
                                    ? (emargements || []).find(
                                        (em: any) =>
                                          em.formationId === targetFormationId ||
                                          (matchedFmt && em.formationId === matchedFmt.id),
                                      )
                                    : null;
                                  const matchedOther = otherEquipments?.find(
                                    (o: any) =>
                                      o.identifiant === p.identifiant ||
                                      o.id === p.identifiant,
                                  );
                                  const matchedDefib = defibrillateurs?.find(
                                    (d: any) =>
                                      d.identifiant === p.identifiant ||
                                      d.id === p.identifiant,
                                  );
                                  const equipmentPhone =
                                    matchedOther?.telephoneSite ||
                                    matchedDefib?.telephoneSite ||
                                    "";
                                  return (
                                    <div
                                      key={p.num}
                                      className="bg-white p-5 space-y-4"
                                      style={{
                                        border: "1px solid rgb(201, 190, 205)",
                                        borderRadius: "14px",
                                        boxShadow: "none",
                                      }}
                                      id={`passage-card-${p.num}`}
                                    >
                                      {/* Toggle Status Check above passage number, aligned to the left */}
                                      <div className="flex justify-start w-full">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            togglePassageStatus(t.id, p.num)
                                          }
                                          className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                                          style={{ fontSize: "16px" }}
                                        >
                                          <span
                                            className="rounded-full flex items-center justify-center transition-all bg-white"
                                            style={{
                                              border: isCompleted
                                                ? "2.5px solid #fe4eba"
                                                : "2.5px solid #cbd5e1",
                                              width: "22px",
                                              height: "22px",
                                              minWidth: "22px",
                                              minHeight: "22px",
                                              backgroundColor: "#ffffff",
                                            }}
                                          >
                                            {isCompleted && (
                                              <span
                                                className="rounded-full bg-[#fe4eba]"
                                                style={{
                                                  width: "10px",
                                                  height: "10px",
                                                }}
                                              />
                                            )}
                                          </span>
                                          <span className="font-semibold text-black">
                                            {isCompleted
                                              ? "Effectu√©"
                                              : "√Ä faire"}
                                          </span>
                                        </button>
                                      </div>

                                      <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                          {/* Rond rose avec le num√©ro du passage */}
                                          <div
                                            className="flex items-center justify-center font-bold text-white rounded-full shrink-0"
                                            style={{
                                              backgroundColor: "#fe4eba",
                                              width: "28px",
                                              height: "28px",
                                              fontSize: "14px",
                                            }}
                                          >
                                            {p.num}
                                          </div>

                                          {/* Identifiant du d√©fibrillateur dans une gelule align√©e √† gauche et pas en full width */}
                                          <span
                                            style={{
                                              backgroundColor:
                                                "rgb(77, 21, 83)",
                                              color: "rgb(255, 255, 255)",
                                              borderRadius: "1000px",
                                              padding: "4px 12px",
                                              fontSize: "15px",
                                              fontWeight: 700,
                                              border: "none",
                                              display: "inline-block",
                                            }}
                                          >
                                            {isFormationMission ? "Formation" : p.identifiant}
                                          </span>
                                        </div>

                                        {/* Textes de la div en font color black */}
                                        <div
                                          className="space-y-1.5"
                                          style={{
                                            fontSize: "16px",
                                            color: "#000000",
                                            fontFamily:
                                              "var(--font-sans), sans-serif",
                                          }}
                                        >
                                          {/* Site */}
                                          {!isFormationMission && (
                                            <p style={{ color: "#000000" }}>
                                              Site :{" "}
                                              <span
                                                className="font-semibold"
                                                style={{ color: "#000000" }}
                                              >
                                                {(() => {
                                                  const siteVal = matchedDefib ? (matchedDefib.nomSite || "") : (matchedOther ? (matchedOther.nomPrenomSite || "") : "");
                                                  return siteVal === "Repr√©sentant Standard" || siteVal === "Repr√©sentant standard" || siteVal === "Non renseign√©" ? "" : siteVal;
                                                })()}
                                              </span>
                                            </p>
                                          )}

                                          {/* Client */}
                                          <p style={{ color: "#000000" }}>
                                            Client :{" "}
                                            <span
                                              className="font-semibold"
                                              style={{ color: "#000000" }}
                                            >
                                              {(() => {
                                                const clientObj = clients?.find(c => 
                                                  c.id === p.clientId || 
                                                  c.id === matchedDefib?.clientId || 
                                                  c.id === matchedOther?.clientId ||
                                                  (matchedFmt && c.id === matchedFmt.clientId)
                                                );
                                                const clientVal = clientObj ? clientObj.denomination : (p.clientName || "");
                                                return clientVal === "Repr√©sentant Standard" || clientVal === "Repr√©sentant standard" || clientVal === "Non renseign√©" ? "" : clientVal;
                                              })()}
                                            </span>
                                          </p>

                                          {/* Mat√©riel */}
                                          {!isFormationMission && (
                                            <p style={{ color: "#000000" }}>
                                              Mat√©riel :{" "}
                                              <span
                                                className="font-semibold"
                                                style={{ color: "#000000" }}
                                              >
                                                {p.equipmentType ||
                                                  "D√©fibrillateur"}
                                              </span>
                                            </p>
                                          )}

                                          {/* Mod√®le */}
                                          {!isFormationMission && (
                                            <p style={{ color: "#000000" }}>
                                              Mod√®le :{" "}
                                              <span
                                                className="font-semibold"
                                                style={{ color: "#000000" }}
                                              >
                                                {p.model}
                                              </span>
                                            </p>
                                          )}

                                          {/* Localisation */}
                                          <p style={{ color: "#000000" }}>
                                            Localisation :{" "}
                                            <span
                                              className="font-semibold"
                                              style={{ color: "#000000" }}
                                            >
                                              {(() => {
                                                if (p.address && p.address !== "Non renseign√©" && p.address !== p.clientName) return p.address;
                                                if (matchedFmt) {
                                                  const addrParts = [matchedFmt.adresse, matchedFmt.codePostal, matchedFmt.ville].filter(Boolean);
                                                  if (addrParts.length > 0) return addrParts.join(", ");
                                                }
                                                const clientObj = clients?.find(c => c.id === (p.clientId || matchedFmt?.clientId));
                                                if (clientObj) {
                                                  const cParts = [clientObj.adresse, clientObj.codePostal, clientObj.ville].filter(Boolean);
                                                  if (cParts.length > 0) return cParts.join(", ");
                                                }
                                                return "";
                                              })()}
                                            </span>
                                          </p>

                                          <p style={{ color: "#000000" }}>
                                            T√©l√©phone :{" "}
                                            {equipmentPhone && equipmentPhone !== "Non renseign√©" ? (
                                              <a
                                                href={`tel:${equipmentPhone.replace(/\s+/g, "")}`}
                                                className="font-semibold underline hover:opacity-75 transition-opacity"
                                                style={{
                                                  color: "#fe4eba",
                                                  cursor: "pointer",
                                                }}
                                                id={`tel-link-${p.num}`}
                                              >
                                                {equipmentPhone}
                                              </a>
                                            ) : (
                                              ""
                                            )}
                                          </p>
                                          {p.reason &&
                                            p.reason.trim() !== "" && (
                                              <p style={{ color: "#000000" }}>
                                                Raison :{" "}
                                                <span
                                                  className="font-semibold"
                                                  style={{ color: "#000000" }}
                                                >
                                                  {p.reason}
                                                </span>
                                              </p>
                                            )}

                                          {p.interventionReference && (
                                            <p style={{ color: "#000000" }}>
                                              R√©f√©rence intervention :{" "}
                                              <span
                                                className="font-semibold"
                                                style={{ color: "#000000" }}
                                              >
                                                {p.interventionReference}
                                              </span>
                                            </p>
                                          )}

                                          {/* Bon de commande */}
                                          <p style={{ color: "#000000" }}>
                                            Bon de commande :{" "}
                                            <span
                                              className="font-semibold"
                                              style={{ color: "#000000" }}
                                            >
                                              {(() => {
                                                const lbl = getBonCommandeLabel(p);
                                                return lbl === "Non renseign√©" ? "" : lbl;
                                              })()}
                                            </span>
                                          </p>

                                          {/* Coordonn√©es GPS */}
                                          {!isFormationMission && (
                                            <p style={{ color: "#000000" }}>
                                              Coordonn√©es GPS :{" "}
                                              {(() => {
                                                const lat = matchedDefib?.latitude || matchedOther?.latitude || "";
                                                const lng = matchedDefib?.longitude || matchedOther?.longitude || "";
                                                if (lat && lng) {
                                                  const gpsStr = `${lat}, ${lng}`;
                                                  const isCopied = copiedGps === gpsStr;
                                                  return (
                                                    <span
                                                      onClick={() => handleCopyGps(gpsStr)}
                                                      className="font-semibold underline cursor-pointer hover:opacity-80 transition-all"
                                                      style={{ color: "#fe4eba" }}
                                                      title="Cliquez pour copier"
                                                    >
                                                      {gpsStr}
                                                    </span>
                                                  );
                                                }
                                                return "";
                                              })()}
                                            </p>
                                          )}

                                          {p.estimatedDate && (
                                            <p style={{ color: "#000000" }}>
                                              Date estim√©e :{" "}
                                              <span
                                                className="font-semibold"
                                                style={{ color: "#000000" }}
                                              >
                                                {(() => {
                                                  const cleanDate =
                                                    p.estimatedDate.replace(
                                                      /\//g,
                                                      "-",
                                                    );
                                                  const pts =
                                                    cleanDate.split("-");
                                                  if (pts.length === 3) {
                                                    if (pts[0].length === 4) {
                                                      return `${pts[2]}/${pts[1]}/${pts[0]}`;
                                                    }
                                                    return `${pts[0]}/${pts[1]}/${pts[2]}`;
                                                  }
                                                  return p.estimatedDate;
                                                })()}
                                              </span>
                                            </p>
                                          )}
                                          <p style={{ color: "#000000" }}>
                                            Cr√©neau estim√© :{" "}
                                            <span
                                              className="font-semibold"
                                              style={{ color: "#000000" }}
                                            >
                                              {p.estimatedSlot && p.estimatedSlot !== "Non renseign√©" && p.estimatedSlot !== "--" ? p.estimatedSlot : ""}
                                            </span>
                                          </p>
                                          
                                          {/* Pi√®ce(s) requise(s) */}
                                          {!isFormationMission && (
                                            <p style={{ color: "#000000" }}>
                                              Pi√®ce(s) requise(s) :{" "}
                                              <span
                                                className="font-semibold"
                                                style={{ color: "#000000" }}
                                              >
                                                {(() => {
                                                  if (!p.requiredParts || p.requiredParts.length === 0) return "";
                                                  const cleanParts = p.requiredParts.filter(
                                                    (part: any) =>
                                                      part &&
                                                      part.trim() !== "Aucune pi√®ce" &&
                                                      part.trim() !== "Aucune pi√®ce requise" &&
                                                      part.trim() !== "Aucune" &&
                                                      part.trim() !== ""
                                                  );
                                                  return cleanParts.join(", ");
                                                })()}
                                              </span>
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex gap-3">
                                        <button
                                          type="button"
                                          disabled={isCompleted}
                                          onClick={() =>
                                            handleNavigateToAddress(p.address)
                                          }
                                          style={{
                                            backgroundColor: isCompleted
                                              ? "#e2e8f0"
                                              : "#000000",
                                            color: isCompleted
                                              ? "#94a3b8"
                                              : "#fff",
                                            fontSize: "18px",
                                            fontWeight: "bold",
                                            borderRadius: "12px",
                                            padding: "11px 20px",
                                            border: "none",
                                            boxShadow: isCompleted ? "none" : "rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset",
                                            cursor: isCompleted
                                              ? "not-allowed"
                                              : "pointer",
                                            flex: 1,
                                          }}
                                          className={
                                            isCompleted
                                              ? "opacity-60 transition-all font-bold"
                                              : "hover:opacity-90 active:scale-[0.99] transition-all font-bold"
                                          }
                                        >
                                          Y aller
                                        </button>

                                        <button
                                          type="button"
                                          disabled={isFormationMission ? (isCompleted || !matchedEmargement) : isCompleted}
                                          onClick={() => {
                                            if (isFormationMission) {
                                              if (matchedEmargement) {
                                                setEmargementModalRecordId(matchedEmargement.id);
                                                setIsEmargementOverlayOpen(true);
                                              }
                                              return;
                                            }
                                            const matchedOther =
                                              otherEquipments?.find(
                                                (o) =>
                                                  o.identifiant ===
                                                  p.identifiant,
                                              );
                                            if (matchedOther) {
                                              setSelectedOtherEquipmentUnique(
                                                matchedOther,
                                              );
                                              setReportActiveTourId(t.id);
                                              setReportActivePassageNum(p.num);
                                              setIsReportOverlayOpen(true);
                                            } else {
                                              const matched =
                                                defibrillateurs.find(
                                                  (df) =>
                                                    df.identifiant ===
                                                    p.identifiant,
                                                ) || defibrillateurs[0];
                                              if (matched) {
                                                setSelectedOtherEquipmentUnique(
                                                  null,
                                                );
                                                handleDefibLookupChange(
                                                  matched.id,
                                                );
                                                // Pre-fill fields for nicer wizard UX!
                                                setReceiptTitle(
                                                  "RAPPORT D‚ÄôINTERVENTION",
                                                );
                                                setMissionSite("D√âPLACEMENT");
                                                setReportActiveTourId(t.id);
                                                setReportActivePassageNum(
                                                  p.num,
                                                );
                                                setIsReportOverlayOpen(true);
                                              } else {
                                                alert(
                                                  `Aucun mat√©riel central disponible.`,
                                                );
                                              }
                                            }
                                          }}
                                          style={{
                                            backgroundColor: isFormationMission
                                              ? (isCompleted || !matchedEmargement
                                                ? "#e2e8f0"
                                                : "#000000")
                                              : (isCompleted
                                                ? "#e2e8f0"
                                                : "rgb(40 79 255)"),
                                            color: isFormationMission
                                              ? (isCompleted || !matchedEmargement
                                                ? "#94a3b8"
                                                : "#fff")
                                              : (isCompleted
                                                ? "#94a3b8"
                                                : "#fff"),
                                            fontSize: "18px",
                                            fontWeight: "bold",
                                            borderRadius: "12px",
                                            padding: "11px 20px",
                                            border: "none",
                                            boxShadow: isFormationMission
                                              ? (isCompleted || !matchedEmargement
                                                ? "none"
                                                : "rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset")
                                              : (isCompleted
                                                ? "none"
                                                : "rgb(255 255 255 / 41%) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgb(255 255 255 / 22%) 0px 6px 12px inset"),
                                            cursor: isFormationMission
                                              ? (isCompleted || !matchedEmargement
                                                ? "not-allowed"
                                                : "pointer")
                                              : (isCompleted
                                                ? "not-allowed"
                                                : "pointer"),
                                            flex: 1,
                                          }}
                                          className={
                                            (isFormationMission
                                              ? (isCompleted || !matchedEmargement)
                                              : isCompleted)
                                              ? "opacity-60 transition-all font-bold"
                                              : "hover:opacity-90 active:scale-[0.99] transition-all font-bold"
                                          }
                                        >
                                          {isFormationMission ? "√âmargement" : "Rapport"}
                                        </button>
                                      </div>

                                      {/* Rejection reason input for uncompleted passages */}
                                      {!isCompleted && (
                                          <div
                                            className="mt-2.5 p-3"
                                            style={{
                                              borderRadius: "13px",
                                              backgroundColor: "rgb(238, 241, 255)",
                                              color: "rgb(49, 85, 255)",
                                            }}
                                          >
                                            <label
                                              className="block text-[18px] font-bold mb-1 font-sans"
                                              style={{
                                                color: "rgb(49, 85, 255)",
                                                textTransform: "none",
                                              }}
                                            >
                                              Raison de rejet de mission.
                                            </label>
                                          <input
                                            type="text"
                                            maxLength={25}
                                            value={p.rejectionReason || ""}
                                            onChange={(e) => {
                                              const val = e.target.value.slice(0, 25);
                                              const updated = tours.map(
                                                (item) => {
                                                  if (item.id === t.id) {
                                                    return {
                                                      ...item,
                                                      passages:
                                                        item.passages.map(
                                                          (pass) => {
                                                            if (
                                                              pass.num === p.num
                                                            ) {
                                                              return {
                                                                ...pass,
                                                                rejectionReason:
                                                                  val,
                                                                rejectedAt:
                                                                  pass.rejectedAt ||
                                                                  new Date().toLocaleDateString(
                                                                    "fr-FR",
                                                                  ),
                                                              };
                                                            }
                                                            return pass;
                                                          },
                                                        ),
                                                    };
                                                  }
                                                  return item;
                                                },
                                              );
                                              saveTours(updated);
                                            }}
                                            placeholder="Raison du rejet (max 25 car.)"
                                            className="placeholder-black placeholder:text-black font-sans focus:outline-none focus:ring-0 border-none outline-none"
                                            style={{
                                              backgroundColor: "#ffffff",
                                              color: "#000000",
                                              borderRadius: "13px",
                                              padding: "7px 10px",
                                              width: "100%",
                                              fontSize: "18px",
                                            }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Terminer la tourn√©e button in Red */}
                              <div className="pt-2">
                                <button
                                  type="button"
                                  disabled={t.status === "Termin√©"}
                                  onClick={() => {
                                    if (!attemptedEndTourIds.includes(t.id)) {
                                      setAttemptedEndTourIds((prev) => [
                                        ...prev,
                                        t.id,
                                      ]);
                                    }
                                    // Find non-completed passages
                                    const uncompletedPassages =
                                      t.passages.filter(
                                        (pass) => pass.status !== "Effectu√©" && pass.status !== "Attente",
                                      );
                                    if (uncompletedPassages.length > 0) {
                                      // Check if any of these does not have a filled out rejectionReason
                                      const hasUnfilledReasons =
                                        uncompletedPassages.some(
                                          (pass) =>
                                            !pass.rejectionReason ||
                                            !pass.rejectionReason.trim(),
                                        );
                                      if (hasUnfilledReasons) {
                                        // Update error message
                                        setTourErrorMap((prev) => ({
                                          ...prev,
                                          [t.id]:
                                            "Informations requises sur les missions non effectu√©es.",
                                        }));
                                        return;
                                      }
                                    }

                                    // Success: clear errors, mark as finished
                                    setTourErrorMap((prev) => {
                                      const copy = { ...prev };
                                      delete copy[t.id];
                                      return copy;
                                    });

                                    // Generate notification for each rejected mission
                                    if (onAddNotification) {
                                      const name_technician = authenticatedUser?.name || "Un technicien";
                                      uncompletedPassages.forEach((pass) => {
                                        const mission_id = pass.identifiant || pass.num || "Mission";
                                        const reason_text = pass.rejectionReason || "aucun motif sp√©cifi√©";
                                        onAddNotification(
                                          'Interventions',
                                          `Le technicien ${name_technician} rejette la mission ${mission_id} avec le motif : ${reason_text}.`
                                        );
                                      });
                                    }

                                    // update tours state
                                    const updatedTours = tours.map((item) => {
                                      if (item.id === t.id) {
                                        return {
                                          ...item,
                                          status: "Termin√©",
                                          isPaused: false,
                                          pauseEnabled: false,
                                          passages: item.passages.map(
                                            (pass) => {
                                              if (
                                                pass.status !== "Effectu√©" &&
                                                (!pass.rejectedAt ||
                                                  pass.rejectedAt.trim() === "")
                                              ) {
                                                return {
                                                  ...pass,
                                                  rejectedAt:
                                                    new Date().toLocaleDateString(
                                                      "fr-FR",
                                                    ),
                                                };
                                              }
                                              return pass;
                                            },
                                          ),
                                        };
                                      }
                                      return item;
                                    });
                                    saveTours(updatedTours);
                                    setSelectedTourId("");

                                    alert(
                                      "La tourn√©e a bien √©t√© marqu√©e comme termin√©e !",
                                    );
                                  }}
                                  style={{
                                    backgroundColor: "#dc2626",
                                    color: "#ffffff",
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    borderRadius: "12px",
                                    padding: "14px 20px",
                                    border: "none",
                                    boxShadow:
                                      t.status === "Termin√©"
                                        ? "none"
                                        : "inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, inset 0 6px 12px #ffffff1f",
                                    cursor:
                                      t.status === "Termin√©"
                                        ? "not-allowed"
                                        : "pointer",
                                    width: "100%",
                                    opacity: t.status === "Termin√©" ? 0.55 : 1,
                                  }}
                                  className={`${t.status === "Termin√©" ? "" : "hover:bg-red-700 active:scale-[0.99]"} transition-all flex items-center justify-center gap-2`}
                                >
                                  Terminer la tourn√©e
                                </button>

                                {/* Conditional error message */}
                                {tourErrorMap[t.id] && (
                                  <div
                                    className="mt-2.5 p-3.5 rounded-lg text-center font-bold animate-fadeIn"
                                    style={{
                                      fontSize: "18px",
                                      border: "none",
                                      color: "rgb(49, 85, 255)",
                                      backgroundColor: "rgb(238, 241, 255)",
                                    }}
                                  >
                                    {tourErrorMap[t.id]}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                    </div>
                  );
                })()}

              {/* ----------------- TAB 2: RAPPORTS PDF ----------------- */}
              {activeTab === "rapports" && (
                <div
                  className="space-y-4 pb-16 animate-fadeIn"
                  id="tab-rapports-screen"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOtherEquipmentUnique(null);
                      setSelectedDefibId("");
                      setSelectedDefibData(null);
                      setReceiptTitle("RAPPORT D‚ÄôINTERVENTION");
                      setMissionSite("D√âPLACEMENT");
                      setReportActiveTourId("");
                      setReportActivePassageNum(null);
                      setIsReportOverlayOpen(true);
                    }}
                    style={{
                      backgroundColor: "rgb(53, 86, 236)",
                      color: "#ffffff",
                      fontSize: "18px",
                      fontWeight: "bold",
                      borderRadius: "12px",
                      padding: "14px 20px",
                      border: "none",
                      boxShadow:
                        "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                      cursor: "pointer",
                      width: "100%",
                    }}
                    className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 font-bold"
                  >
                    Nouveau rapport spontan√©
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0">
                    {sortedAndLimitedReports.map((rep) => {
                      const snapshot =
                        rep.defibSnapshot ||
                        defibrillateurs.find(
                          (d) =>
                            d.id === rep.defibId ||
                            d.identifiant === rep.defibIdentifiant,
                        );
                      const matchedOther = !snapshot ? otherEquipments?.find(
                        (o) =>
                          o.id === rep.defibId ||
                          o.identifiant === rep.defibIdentifiant,
                      ) : null;
                      const clientFound = clients.find(
                        (c) => c.id === (snapshot?.clientId || matchedOther?.clientId),
                      );
                      const clientName = clientFound
                        ? clientFound.denomination
                        : rep.clientName || "Non rattach√©";

                      return (
                        <div
                          key={rep.id}
                          className="p-5 bg-white rounded-[14px] space-y-4"
                          style={{
                            border: "1px solid rgb(201, 190, 205)",
                            boxShadow: "none",
                          }}
                          id={`report-card-${rep.id}`}
                        >
                          {/* Gelule Date en premier */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                            <span
                              style={{
                                color: "#ffffff",
                                backgroundColor: "#FD4EBB",
                                padding: "8px 16px",
                                borderRadius: "9999px",
                                fontWeight: "bold",
                                fontSize: "14px",
                                display: "inline-block",
                              }}
                            >
                              {rep.date}
                            </span>
                            {rep.validated ? (
                              <span
                                style={{
                                  color: "#047857",
                                  backgroundColor: "#d1fae5",
                                  padding: "6px 14px",
                                  borderRadius: "9999px",
                                  fontWeight: "bold",
                                  fontSize: "13px",
                                  border: "1px solid #a7f3d0",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#10b981" }}></span>
                                Valid√© par GMAO
                              </span>
                            ) : (
                              <span
                                style={{
                                  color: "rgb(255 255 255)",
                                  backgroundColor: "#000",
                                  padding: "6px 14px",
                                  borderRadius: "9999px",
                                  fontWeight: "bold",
                                  fontSize: "16px",
                                  border: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                }}
                              >
                                Mod√©ration
                              </span>
                            )}
                          </div>

                          <div
                            className="space-y-1.5"
                            style={{
                              fontSize: "16px",
                              color: "#000000",
                              fontFamily: "var(--font-sans), sans-serif",
                            }}
                          >
                            {(() => {
                              const isReal = (val: any): boolean => {
                                if (!val) return false;
                                const s = String(val).trim();
                                if (!s) return false;
                                const lower = s.toLowerCase();
                                return !(
                                  lower === "non renseign√©" ||
                                  lower === "non renseignee" ||
                                  lower === "non renseign√©e" ||
                                  lower === "non rattach√©" ||
                                  lower === "non rattache" ||
                                  lower === "repr√©sentant standard" ||
                                  lower === "representant standard" ||
                                  lower === "a trier" ||
                                  lower === "ville_cp" ||
                                  lower === "--" ||
                                  lower === "-" ||
                                  lower === "cp" ||
                                  lower === "ville cp"
                                );
                              };

                              const identifiantVal = snapshot?.identifiant || rep.defibIdentifiant || "";
                              const serieVal = snapshot?.numeroSerie || rep.defibSerialNumber || "";
                              const materielVal = snapshot?.categorie ? formatToNormalCase(snapshot.categorie) : (matchedOther?.categorie ? formatToNormalCase(matchedOther.categorie) : "D√©fibrillateur");
                              const techVal = rep.techName || "";
                              const clientVal = clientName;
                              const siteVal = snapshot ? (snapshot.nomSite || "") : (matchedOther ? (matchedOther.nomPrenomSite || "") : "");
                              const locVal = snapshot?.ville || snapshot?.cp ? `${snapshot.cp || ""} ${snapshot.ville || ""}`.trim() : (matchedOther?.ville || matchedOther?.codePostal ? `${matchedOther.codePostal || ""} ${matchedOther.ville || ""}`.trim() : "");

                              return (
                                <>
                                  <p style={{ color: "#000000" }}>
                                    Document :{" "}
                                    <span
                                      className="font-semibold"
                                      style={{ color: "#000000" }}
                                    >
                                      {rep.title || "RAPPORT D‚ÄôINTERVENTION"}
                                    </span>
                                  </p>
                                  <p style={{ color: "#000000" }}>
                                    Identifiant :{" "}
                                    <span
                                      className="font-semibold"
                                      style={{ color: "#000000" }}
                                    >
                                      {isReal(identifiantVal) ? identifiantVal : ""}
                                    </span>
                                  </p>
                                  <p style={{ color: "#000000" }}>
                                    S√©rie :{" "}
                                    <span
                                      className="font-semibold"
                                      style={{ color: "#000000" }}
                                    >
                                      {isReal(serieVal) ? serieVal : ""}
                                    </span>
                                  </p>
                                  <p style={{ color: "#000000" }}>
                                    Site :{" "}
                                    <span
                                      className="font-semibold"
                                      style={{ color: "#000000" }}
                                    >
                                      {isReal(siteVal) ? formatToNormalCase(siteVal) : ""}
                                    </span>
                                  </p>
                                  <p style={{ color: "#000000" }}>
                                    Client :{" "}
                                    <span
                                      className="font-semibold"
                                      style={{ color: "#000000" }}
                                    >
                                      {isReal(clientVal) ? formatToNormalCase(clientVal) : ""}
                                    </span>
                                  </p>
                                  <p style={{ color: "#000000" }}>
                                    Mat√©riel :{" "}
                                    <span
                                      className="font-semibold"
                                      style={{ color: "#000000" }}
                                    >
                                      {isReal(materielVal) ? materielVal : ""}
                                    </span>
                                  </p>
                                  <p style={{ color: "#000000" }}>
                                    Technicien :{" "}
                                    <span
                                      className="font-semibold"
                                      style={{ color: "#000000" }}
                                    >
                                      {isReal(techVal) ? techVal : ""}
                                    </span>
                                  </p>
                                  <p style={{ color: "#000000" }}>
                                    Localisation :{" "}
                                    <span
                                      className="font-semibold"
                                      style={{ color: "#000000" }}
                                    >
                                      {isReal(locVal) ? locVal : ""}
                                    </span>
                                  </p>
                                </>
                              );
                            })()}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDownloadReport(rep)}
                            style={{
                              backgroundColor: "rgb(53, 86, 236)",
                              color: "#fff",
                              fontSize: "18px",
                              fontWeight: "bold",
                              borderRadius: "12px",
                              padding: "12px 20px",
                              border: "none",
                              boxShadow:
                                "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                              cursor: "pointer",
                              width: "100%",
                            }}
                            className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                          >
                            T√©l√©charger PDF
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setReportToEdit(rep);
                              const targetDefibId = rep.defibId || rep.defibSnapshot?.id || "";
                              setSelectedDefibId(targetDefibId);
                              const defib = defibrillateurs.find(
                                (d) =>
                                  (targetDefibId && d.id === targetDefibId) ||
                                  (rep.defibIdentifiant && d.identifiant?.trim().toLowerCase() === rep.defibIdentifiant.trim().toLowerCase()) ||
                                  (rep.defibSnapshot?.identifiant && d.identifiant?.trim().toLowerCase() === rep.defibSnapshot.identifiant.trim().toLowerCase())
                              );
                              if (defib) {
                                setSelectedDefibData(defib);
                              } else if (rep.defibSnapshot) {
                                setSelectedDefibData(rep.defibSnapshot);
                              }

                              const matchedOther = otherEquipments.find(o => 
                                o.id === rep.defibId || 
                                o.id === (rep as any).otherEquipmentId || 
                                (rep.defibIdentifiant && o.identifiant?.trim().toLowerCase() === rep.defibIdentifiant.trim().toLowerCase())
                              );
                              if (matchedOther && (rep.isOtherEquipment || (rep as any).equipmentType === 'OTHER')) {
                                setSelectedOtherEquipmentUnique(matchedOther);
                              } else {
                                setSelectedOtherEquipmentUnique(null);
                              }

                              setIsReportOverlayOpen(true);
                            }}
                            style={{
                              backgroundColor: "#000000",
                              color: "#ffffff",
                              fontSize: "18px",
                              fontWeight: "bold",
                              borderRadius: "12px",
                              padding: "12px 20px",
                              border: "none",
                              boxShadow:
                                "rgba(255, 255, 255, 0) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(255, 255, 255, 0) 0px 4px 4px, rgb(0, 0, 0) 0px 7px 0px -12px, rgba(255, 255, 255, 0.21) 0px 6px 12px inset",
                              cursor: "pointer",
                              width: "100%",
                              marginTop: "8px",
                            }}
                            className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                          >
                            Corriger
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ----------------- TAB: PLANNING ----------------- */}
              {activeTab === "planning" && (
                <div
                  className="space-y-4 pb-16 animate-fadeIn px-1 py-2 sm:px-2"
                  id="tab-planning-screen"
                >
                  <PlanningTab
                    companyInfo={companyInfo}
                    fsmTours={fsmTours && fsmTours.length > 0 ? fsmTours : tours}
                    authenticatedUser={authenticatedUser}
                    defibrillateurs={defibrillateurs}
                    otherEquipments={otherEquipments}
                    clients={clients}
                    variables={variables}
                    members={members}
                    t={t}
                    initialTech={authenticatedUser?.name || ""}
                  />
                </div>
              )}

              {/* ----------------- TAB: STOCKS ----------------- */}
              {activeTab === "stocks" && !isStocksHidden && (
                <div
                  className="space-y-4 pb-16 animate-fadeIn"
                  id="tab-stocks-screen"
                >
                  <HelpBubble
                    cacheKey="help_webapp_stocks_improvement"
                    text="Cette page est en cours d'am√©lioration. Un peu de patience : votre onglet sera bient√¥t encore plus intuitif et agr√©able √† utiliser !"
                  />

                  {/* Info: Emplacement (Disabled Input en premier, hors d'une div) */}
                  <input
                    type="text"
                    value={techLocationLink || "Aucun emplacement sp√©cifi√©"}
                    disabled
                    style={{
                      color: "#000000",
                      fontSize: "18px",
                      textAlign: "center",
                      borderColor: "#D5D5D5",
                      borderWidth: "1px",
                      borderStyle: "solid",
                      borderRadius: "13px",
                      padding: "12px 14px",
                      backgroundColor: "#ffffff",
                      width: "100%",
                      boxSizing: "border-box",
                      opacity: 1,
                      WebkitTextFillColor: "#000000",
                    }}
                    className="font-sans font-semibold mb-2"
                  />

                  {/* Piece / Material Select (hors d'une div, sans titre, style text noir, 18px, center, border D5D5D5, bg white) */}
                  <select
                    value={selectedTechDistributedStockId}
                    onChange={(e) => {
                      setSelectedTechDistributedStockId(e.target.value);
                      setShowRapatriementForm(false);
                      setShowNewDistribStockForm(false);
                    }}
                    style={{
                      color: "#000000",
                      fontSize: "18px",
                      textAlign: "center",
                      textAlignLast: "center",
                      borderColor: "#D5D5D5",
                      borderWidth: "1px",
                      borderStyle: "solid",
                      borderRadius: "13px",
                      padding: "12px 14px",
                      backgroundColor: "#ffffff",
                      width: "100%",
                      boxSizing: "border-box",
                      appearance: "none",
                      WebkitAppearance: "none",
                      MozAppearance: "none",
                      outline: "none",
                    }}
                    className="font-sans font-semibold mb-2 cursor-pointer"
                  >
                    <option value="">S√©lection d‚Äôun stock distribu√©.</option>
                    {techActiveStocks.map((item) => {
                      const matchedCentralStock = stocks.find(
                        (s) =>
                          s.id === item.stockId ||
                          s.denominationPieceId === item.denominationPieceId,
                      );
                      const ugs = matchedCentralStock?.ugs || "";
                      const vObj = variables.find(
                        (v) => v.id === item.denominationPieceId,
                      );
                      const pieceName = vObj ? vObj.nom : "Pi√®ce inconnue";
                      return (
                        <option key={item.id} value={item.id}>
                          {pieceName} {ugs ? `(UGS: ${ugs})` : ""}
                        </option>
                      );
                    })}
                  </select>

                  {/* Button: Nouveau stock distribu√© */}
                  {!selectedTechStock && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewDistribStockForm(!showNewDistribStockForm);
                        setSelectedTechDistributedStockId("");
                        setShowRapatriementForm(false);
                      }}
                      style={{
                        backgroundColor: "rgb(53, 86, 236)",
                        color: "#ffffff",
                        fontSize: "18px",
                        fontWeight: "bold",
                        borderRadius: "12px",
                        padding: "14px 20px",
                        border: "none",
                        boxShadow:
                          "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                        cursor: "pointer",
                        width: "100%",
                      }}
                      className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 font-bold mb-4"
                    >
                      Nouveau stock distribu√©
                    </button>
                  )}

                  {/* Form for Nouveau stock distribu√© */}
                  {showNewDistribStockForm && !selectedTechStock && (
                    <div
                      className="bg-white p-5 space-y-4 my-4 animate-fadeIn"
                      style={{
                        border: "1px solid rgb(218, 218, 218)",
                        borderRadius: "18px",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      {/* Info Message */}
                      <div
                        className="p-3.5 rounded-[13px] text-[15px] font-sans font-medium mb-2"
                        style={{
                          backgroundColor: "rgb(246, 236, 247)",
                          color: "rgb(99, 31, 106)",
                          border: "1px solid #d2a3d7",
                        }}
                      >
                        Pour √™tre s√©lectionn√©e, une pi√®ce doit exister (√™tre r√©f√©renc√©e) dans la centrale des stocks, et ne pas d√©j√† √™tre existante dans l‚Äôemplacement du technicien.
                      </div>

                      {/* 1. √âquipement de la centrale des stocks */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold font-sans" style={{ color: "#000000", fontSize: "16px" }}>
                          √âquipement de la centrale des stocks *
                        </label>
                        <select
                          value={newDistribStockId}
                          onChange={(e) => setNewDistribStockId(e.target.value)}
                          style={{
                            color: "#000000",
                            fontSize: "18px",
                            borderColor: "#D5D5D5",
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderRadius: "13px",
                            padding: "10px 12px",
                            backgroundColor: "#ffffff",
                            width: "100%",
                            boxSizing: "border-box",
                            outline: "none",
                            textAlign: "center",
                            textAlignLast: "center",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "none",
                          }}
                          className="font-sans font-medium cursor-pointer"
                          required
                        >
                          <option value="">S√©lection d'une pi√®ce.</option>
                          {stocks
                            .filter((st) => {
                              if (!techLocationLink) return true;
                              const exists = distributedStocks.some(
                                (ds) =>
                                  (ds.stockId === st.id || ds.denominationPieceId === st.denominationPieceId) &&
                                  ds.locationName &&
                                  ds.locationName.toLowerCase().trim() === techLocationLink.toLowerCase().trim()
                              );
                              return !exists;
                            })
                            .map((st) => {
                              const vObj = variables.find((v) => v.id === st.denominationPieceId);
                              const pieceName = vObj ? vObj.nom : "D√©nomination inconnue";
                              const pieceCat = vObj ? vObj.category : "";
                              const ugsLabel = st.ugs ? ` [UGS: ${st.ugs}]` : "";
                              return (
                                <option key={st.id} value={st.id}>
                                  {pieceName} ({pieceCat}){ugsLabel}
                                </option>
                              );
                            })}
                        </select>
                      </div>

                      {/* 2. Emplacement (auto-selected & disabled) */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold font-sans" style={{ color: "#000000", fontSize: "16px" }}>
                          Emplacement *
                        </label>
                        <input
                          type="text"
                          value={techLocationLink || "Aucun emplacement sp√©cifi√©"}
                          disabled
                          style={{
                            color: "#000000",
                            fontSize: "18px",
                            borderColor: "#D5D5D5",
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderRadius: "13px",
                            padding: "10px 12px",
                            backgroundColor: "#f1f5f9",
                            width: "100%",
                            boxSizing: "border-box",
                            opacity: 1,
                            WebkitTextFillColor: "#000000",
                            textAlign: "center",
                          }}
                          className="font-sans cursor-not-allowed"
                        />
                      </div>

                      {/* 3. Volume disponible */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold font-sans" style={{ color: "#000000", fontSize: "16px" }}>
                          Volume disponible *
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={newDistribVolumeDisponible}
                          onChange={(e) => setNewDistribVolumeDisponible(Math.max(0, Number(e.target.value)))}
                          style={{
                            color: "#000000",
                            fontSize: "18px",
                            borderColor: "#D5D5D5",
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderRadius: "13px",
                            padding: "10px 12px",
                            backgroundColor: "#ffffff",
                            width: "100%",
                            boxSizing: "border-box",
                            outline: "none",
                            textAlign: "center",
                          }}
                          className="font-sans font-medium"
                          required
                        />
                      </div>

                      {/* 4. Activer la tra√ßabilit√© des pi√®ces */}
                      <div
                        className="flex items-center justify-between p-3 border rounded-xl bg-slate-50"
                        style={{ borderColor: "#D5D5D5", borderRadius: "13px" }}
                      >
                        <span className="font-bold text-black font-sans text-[16px]">
                          Activer la tra√ßabilit√© des pi√®ces
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!newDistribTraceabilityEnabled) {
                              setNewDistribTraceabilityEnabled(true);
                            }
                          }}
                          disabled={newDistribTraceabilityEnabled}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                            newDistribTraceabilityEnabled ? "cursor-not-allowed" : "cursor-pointer"
                          }`}
                          style={{
                            backgroundColor: newDistribTraceabilityEnabled ? "#fe4eba" : "#cbd5e1",
                          }}
                        >
                          <span
                            className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                            style={{
                              transform: newDistribTraceabilityEnabled ? "translateX(20px)" : "translateX(0px)",
                            }}
                          />
                        </button>
                      </div>

                      {/* Sub-section Inventaire de tra√ßabilit√© pour nouveau stock */}
                      {newDistribTraceabilityEnabled && (
                        <div className="border p-4 rounded-xl space-y-3 bg-slate-50/50" style={{ borderColor: "#D5D5D5", borderRadius: "14px" }}>
                          <div className="flex items-center justify-between select-none">
                            <span
                              className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                              style={{
                                color: "#fff",
                                backgroundColor: "#5f1f66",
                                fontSize: "16px",
                              }}
                            >
                              Inventaire de tra√ßabilit√©
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowNewDistribTraceForm(!showNewDistribTraceForm)}
                              style={{
                                backgroundColor: "rgb(53, 86, 236)",
                                color: "#ffffff",
                                borderRadius: "11px",
                                fontSize: "16px",
                                fontWeight: "bold",
                                padding: "8px 14px",
                                border: "none",
                              }}
                              className="font-sans active:scale-[0.98] transition-all"
                            >
                              + Nouveau
                            </button>
                          </div>

                          {/* Traceability Sub-form for mobile vertical layout */}
                          {showNewDistribTraceForm && (
                            <div className="bg-white p-4 border rounded-xl space-y-3 text-left font-sans animate-fadeIn" style={{ borderColor: "#cbd5e1" }}>
                              {/* 1. Mouvement */}
                              <div className="flex flex-col gap-1">
                                <label className="font-bold font-sans text-black text-[15px]">
                                  S√©lection du mouvement *
                                </label>
                                <select
                                  value={newDistribMovementId}
                                  onChange={(e) => setNewDistribMovementId(e.target.value)}
                                  style={{
                                    color: "#000000",
                                    fontSize: "16px",
                                    borderColor: "#cbd5e1",
                                    borderWidth: "1px",
                                    borderRadius: "10px",
                                    padding: "8px 10px",
                                    backgroundColor: "#ffffff",
                                    width: "100%",
                                    textAlign: "center",
                                    textAlignLast: "center",
                                  }}
                                  className="font-sans font-medium"
                                >
                                  <option value="Autre (Aucun mouvement)">Autre (Aucun mouvement)</option>
                                  {newDistribStockId &&
                                    (stocks.find((s) => s.id === newDistribStockId)?.mouvements || [])
                                      .filter((mv) => mv.type !== "Annulation")
                                      .map((mv) => (
                                        <option key={mv.id} value={mv.id}>
                                          {mv.date} - {mv.type} (Vol: {mv.volume})
                                        </option>
                                      ))}
                                </select>
                              </div>

                              {/* 2. Lot ou S√©rie */}
                              <div className="flex flex-col gap-1">
                                <label className="font-bold font-sans text-black text-[15px]">
                                  Num√©ro de lot ou s√©rie *
                                </label>
                                <input
                                  type="text"
                                  value={newDistribLotOrSerial}
                                  onChange={(e) => setNewDistribLotOrSerial(e.target.value)}
                                  placeholder="Num√©ro de lot ou s√©rie"
                                  style={{
                                    color: "#000000",
                                    fontSize: "16px",
                                    borderColor: "#cbd5e1",
                                    borderWidth: "1px",
                                    borderRadius: "10px",
                                    padding: "8px 10px",
                                    width: "100%",
                                    textAlign: "center",
                                  }}
                                  className="font-sans font-semibold"
                                />
                              </div>

                              {/* 3. Expiration */}
                              <div className="flex flex-col gap-1">
                                <label className="font-bold font-sans text-black text-[15px]">
                                  Date de p√©remption
                                </label>
                                <input
                                  type="date"
                                  value={newDistribExpirationDate}
                                  onChange={(e) => setNewDistribExpirationDate(e.target.value)}
                                  style={{
                                    color: "#000000",
                                    fontSize: "16px",
                                    borderColor: "#cbd5e1",
                                    borderWidth: "1px",
                                    borderRadius: "10px",
                                    padding: "8px 10px",
                                    width: "100%",
                                    textAlign: "center",
                                  }}
                                  className="font-sans font-medium"
                                />
                              </div>

                              {/* 4. Volume */}
                              <div className="flex flex-col gap-1">
                                <label className="font-bold font-sans text-black text-[15px]">
                                  Volume *
                                </label>
                                <input
                                  type="number"
                                  value={1}
                                  disabled
                                  readOnly
                                  style={{
                                    color: "#000000",
                                    fontSize: "16px",
                                    borderColor: "#cbd5e1",
                                    borderWidth: "1px",
                                    borderRadius: "10px",
                                    padding: "8px 10px",
                                    backgroundColor: "#f1f5f9",
                                    width: "100%",
                                    textAlign: "center",
                                  }}
                                  className="font-sans font-semibold cursor-not-allowed"
                                />
                              </div>

                              {/* 5. Situation */}
                              <div className="flex flex-col gap-1">
                                <label className="font-bold font-sans text-black text-[15px]">
                                  Situation *
                                </label>
                                <select
                                  value={newDistribSituation}
                                  onChange={(e) => setNewDistribSituation(e.target.value as any)}
                                  style={{
                                    color: "#000000",
                                    fontSize: "16px",
                                    borderColor: "#cbd5e1",
                                    borderWidth: "1px",
                                    borderRadius: "10px",
                                    padding: "8px 10px",
                                    backgroundColor: "#ffffff",
                                    width: "100%",
                                    textAlign: "center",
                                    textAlignLast: "center",
                                  }}
                                  className="font-sans font-medium"
                                >
                                  <option value="Disponible">Disponible</option>
                                  <option value="Utilis√©">Utilis√©</option>
                                  <option value="Indisponible">Indisponible</option>
                                  <option value="Signal√© manquant">Signal√© manquant</option>
                                  <option value="Pr√™t√©">Pr√™t√©</option>
                                </select>
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setShowNewDistribTraceForm(false)}
                                  className="flex-1 bg-black text-white font-bold py-2 rounded-lg text-[15px]"
                                >
                                  Annuler
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!newDistribLotOrSerial.trim()) {
                                      alert("Le num√©ro de lot ou s√©rie est requis.");
                                      return;
                                    }
                                    const cleanLot = newDistribLotOrSerial.trim().toLowerCase();
                                    const isDuplicate = pendingNewDistribTraceabilities.some(
                                      (t) => t.lotOrSerial && t.lotOrSerial.trim().toLowerCase() === cleanLot
                                    ) || stocks.some((st) => (st.traceabilities || []).some((t) => t.lotOrSerial && t.lotOrSerial.trim().toLowerCase() === cleanLot));
                                    if (isDuplicate) {
                                      alert("Ce num√©ro de lot ou de s√©rie existe d√©j√† dans l'inventaire de tra√ßabilit√©.");
                                      return;
                                    }
                                    const newTraceItem: StockTraceability = {
                                      id: "tr_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
                                      movementId: newDistribMovementId || "Autre (Aucun mouvement)",
                                      lotOrSerial: newDistribLotOrSerial.trim(),
                                      expirationDate: newDistribExpirationDate || undefined,
                                      volume: 1,
                                      situation: newDistribSituation,
                                      emplacement: techLocationLink || "Centrale des stocks",
                                    };
                                    setPendingNewDistribTraceabilities([...pendingNewDistribTraceabilities, newTraceItem]);
                                    setNewDistribLotOrSerial("");
                                    setNewDistribExpirationDate("");
                                    setNewDistribMovementId("Autre (Aucun mouvement)");
                                    setNewDistribSituation("Disponible");
                                    setShowNewDistribTraceForm(false);
                                  }}
                                  className="flex-1 bg-[#3556ec] text-white font-bold py-2 rounded-lg text-[15px]"
                                >
                                  Ajouter
                                </button>
                              </div>
                            </div>
                          )}

                          {/* List of pending traceabilities added */}
                          {pendingNewDistribTraceabilities.length > 0 && (
                            <div className="space-y-2 pt-2">
                              <span className="text-xs font-bold text-slate-600 font-sans block">
                                Pi√®ces √† ajouter ({pendingNewDistribTraceabilities.length}) :
                              </span>
                              {pendingNewDistribTraceabilities.map((t, i) => (
                                <div key={t.id} className="flex items-center justify-between p-2.5 bg-white border rounded-lg text-xs font-sans" style={{ borderColor: "#cbd5e1" }}>
                                  <div>
                                    <span className="font-bold text-black">{t.lotOrSerial}</span>
                                    {t.expirationDate && <span className="text-slate-500 ml-2">(P√©rim. {t.expirationDate})</span>}
                                    <span className="ml-2 text-purple-700 font-semibold">[{t.situation}]</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setPendingNewDistribTraceabilities(pendingNewDistribTraceabilities.filter((_, idx) => idx !== i))}
                                    className="text-red-500 font-bold hover:underline"
                                  >
                                    Supprimer
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Buttons: Annuler / Enregistrer (50% / 50%) */}
                      <div className="flex items-center gap-3 pt-2 w-full">
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewDistribStockForm(false);
                            setPendingNewDistribTraceabilities([]);
                            setNewDistribTraceabilityEnabled(false);
                          }}
                          style={{
                            backgroundColor: "#000000",
                            color: "#ffffff",
                            fontSize: "18px",
                            borderRadius: "13px",
                            padding: "12px 16px",
                            border: "none",
                            cursor: "pointer",
                          }}
                          className="flex-1 font-sans font-bold transition-all hover:opacity-90 active:scale-[0.98] text-center"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!newDistribStockId) {
                              alert("Veuillez s√©lectionner un √©quipement de la centrale des stocks.");
                              return;
                            }
                            if (!techLocationLink) {
                              alert("Aucun emplacement technicien d√©fini.");
                              return;
                            }
                            const selectedStock = stocks.find((s) => s.id === newDistribStockId);
                            if (!selectedStock) return;

                            let targetId = "";
                            let updatedDs = [...distributedStocks];

                            const existingIndex = updatedDs.findIndex(
                              (ds) =>
                                (ds.stockId === selectedStock.id || ds.denominationPieceId === selectedStock.denominationPieceId) &&
                                ds.locationName &&
                                ds.locationName.toLowerCase().trim() === techLocationLink.toLowerCase().trim()
                            );

                            if (existingIndex !== -1) {
                              targetId = updatedDs[existingIndex].id;
                              updatedDs[existingIndex] = {
                                ...updatedDs[existingIndex],
                                volumeDisponible: updatedDs[existingIndex].volumeDisponible + Number(newDistribVolumeDisponible),
                              };
                            } else {
                              targetId = `dist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                              const newItem: DistributedStockLocation = {
                                id: targetId,
                                denominationPieceId: selectedStock.denominationPieceId,
                                stockId: selectedStock.id,
                                ugs: selectedStock.ugs,
                                locationName: techLocationLink as any,
                                volumeDisponible: Number(newDistribVolumeDisponible),
                                volumeReserve: 0,
                                volumeEntrant: 0,
                              };
                              updatedDs = [newItem, ...updatedDs];
                            }

                            if (onUpdateDistributedStocks) {
                              onUpdateDistributedStocks(updatedDs);
                            }

                            // Update stock traceability if enabled
                            if (newDistribTraceabilityEnabled && stocks && onUpdateStocks) {
                              const updatedStocks = stocks.map((st) => {
                                if (st.id === selectedStock.id) {
                                  return {
                                    ...st,
                                    traceabilityEnabled: true,
                                    traceabilities: [...(st.traceabilities || []), ...pendingNewDistribTraceabilities],
                                  };
                                }
                                return st;
                              });
                              onUpdateStocks(updatedStocks);
                            }

                            if (onAddLogisticsNotification) {
                              const name_technician = authenticatedUser?.name || "Un technicien";
                              const location_name = techLocationLink || "Emplacement";
                              const vObj = variables.find((v) => v.id === selectedStock.denominationPieceId);
                              const pieceName = vObj?.nom || "Pi√®ce inconnue";
                              const ugsStr = selectedStock.ugs ? ` (${selectedStock.ugs})` : "";
                              const ugsRef = `${pieceName}${ugsStr}`;

                              onAddLogisticsNotification(
                                `Le technicien ${name_technician} (${location_name}) a cr√©√© un nouveau stock distribu√© ${ugsRef}.`,
                                selectedStock.ugs || pieceName
                              );
                            }

                            setSelectedTechDistributedStockId(targetId);
                            setShowNewDistribStockForm(false);
                            setNewDistribStockId("");
                            setNewDistribVolumeDisponible(1);
                            setPendingNewDistribTraceabilities([]);
                            setNewDistribTraceabilityEnabled(false);
                          }}
                          style={{
                            backgroundColor: "rgb(53, 86, 236)",
                            color: "#ffffff",
                            fontSize: "18px",
                            borderRadius: "13px",
                            padding: "12px 16px",
                            border: "none",
                            boxShadow:
                              "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                            cursor: "pointer",
                          }}
                          className="flex-1 font-sans font-bold transition-all hover:opacity-90 active:scale-[0.98] text-center"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Details shown ONLY when a stock is selected */}
                  {selectedTechStock ? (
                    <div className="space-y-4 mt-6">
                      {/* Section 1: Volumes (3-col grid) */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <div
                          className="p-4 text-center"
                          style={{
                            backgroundColor: "rgb(246, 236, 247)",
                            borderRadius: "13px",
                            border: "none",
                            boxShadow: "none",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            minHeight: "150px",
                          }}
                        >
                          <div
                            className="font-extrabold font-sans"
                            style={{ fontSize: "22px", color: "rgb(99, 31, 106)" }}
                          >
                            {selectedTechStock.volumeDisponible}
                          </div>
                          <div
                            className="font-bold mt-1 font-sans leading-tight"
                            style={{
                              fontSize: "16px",
                              color: "rgb(99, 31, 106)",
                            }}
                          >
                            Disponible et avec vous
                          </div>
                        </div>

                        <div
                          className="p-4 text-center"
                          style={{
                            backgroundColor: "rgb(246, 236, 247)",
                            borderRadius: "13px",
                            border: "none",
                            boxShadow: "none",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            minHeight: "150px",
                          }}
                        >
                          <div
                            className="font-extrabold font-sans"
                            style={{ fontSize: "22px", color: "rgb(99, 31, 106)" }}
                          >
                            {selectedTechStock.volumeReserve}
                          </div>
                          <div
                            className="font-bold mt-1 font-sans leading-tight"
                            style={{
                              fontSize: "16px",
                              color: "rgb(99, 31, 106)",
                            }}
                          >
                            R√©serv√© et avec vous
                          </div>
                        </div>

                        <div
                          className="p-4 text-center"
                          style={{
                            backgroundColor: "rgb(246, 236, 247)",
                            borderRadius: "13px",
                            border: "none",
                            boxShadow: "none",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            minHeight: "150px",
                          }}
                        >
                          <div
                            className="font-extrabold font-sans"
                            style={{ fontSize: "22px", color: "rgb(99, 31, 106)" }}
                          >
                            {selectedTechStock.volumeEntrant}
                          </div>
                          <div
                            className="font-bold mt-1 font-sans leading-tight"
                            style={{
                              fontSize: "16px",
                              color: "rgb(99, 31, 106)",
                            }}
                          >
                            Entrant via la centrale
                          </div>
                        </div>

                        {/* Section: Outgoing Stats (part of 4-col grid) */}
                        <div
                          className="p-4 text-center"
                          style={{
                            backgroundColor: "rgb(246, 236, 247)",
                            borderRadius: "13px",
                            border: "none",
                            boxShadow: "none",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            minHeight: "150px",
                          }}
                        >
                          <div
                            className="font-extrabold font-sans"
                            style={{ fontSize: "22px", color: "rgb(99, 31, 106)" }}
                          >
                            {outgoingStats.week1.vol}
                          </div>
                          <div
                            className="font-bold mt-1 font-sans leading-tight"
                            style={{
                              fontSize: "16px",
                              color: "rgb(99, 31, 106)",
                            }}
                          >
                            Sortant cette semaine
                          </div>
                        </div>

                        <div
                          className="p-4 text-center"
                          style={{
                            backgroundColor: "rgb(246, 236, 247)",
                            borderRadius: "13px",
                            border: "none",
                            boxShadow: "none",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            minHeight: "150px",
                          }}
                        >
                          <div
                            className="font-extrabold font-sans"
                            style={{ fontSize: "22px", color: "rgb(99, 31, 106)" }}
                          >
                            {outgoingStats.week2.vol}
                          </div>
                          <div
                            className="font-bold mt-1 font-sans leading-tight"
                            style={{
                              fontSize: "16px",
                              color: "rgb(99, 31, 106)",
                            }}
                          >
                            Sortant semaine prochaine
                          </div>
                        </div>

                        <div
                          className="p-4 text-center"
                          style={{
                            backgroundColor: "rgb(246, 236, 247)",
                            borderRadius: "13px",
                            border: "none",
                            boxShadow: "none",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            minHeight: "150px",
                          }}
                        >
                          <div
                            className="font-extrabold font-sans"
                            style={{ fontSize: "22px", color: "rgb(99, 31, 106)" }}
                          >
                            {outgoingStats.next30.vol}
                          </div>
                          <div
                            className="font-bold mt-1 font-sans leading-tight"
                            style={{
                              fontSize: "16px",
                              color: "rgb(99, 31, 106)",
                            }}
                          >
                            Sortant 7 √† 30 jours
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Mouvements (Table layout with scroll horizontally) */}
                      <div className="bg-white space-y-3">
                        <div className="flex bg-white select-none">
                          <span
                            className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                            style={{
                              color: "#fff",
                              backgroundColor: "#5f1f66",
                              fontSize: "16px",
                              border: "none",
                              textTransform: "none",
                              letterSpacing: "normal",
                            }}
                          >
                            Mouvements
                          </span>
                        </div>

                        <div
                          className="overflow-x-auto border rounded-xl mt-2 bg-white"
                          style={{
                            borderColor: "oklch(0.88 0 0)",
                            borderWidth: "1px",
                          }}
                        >
                          <table className="w-full text-left font-sans border-collapse text-xs">
                            <thead>
                              <tr
                                className="bg-white"
                                style={{
                                  borderBottom: "1px solid oklch(0.88 0 0)",
                                }}
                              >
                                <th
                                  className="px-3 py-3 text-center font-semibold text-black font-sans"
                                  style={{
                                    fontSize: "16px",
                                    color: "#000000",
                                    whiteSpace: "nowrap",
                                    cursor: "default",
                                  }}
                                >
                                  Indicateur.
                                </th>
                                <th
                                  className="px-3 py-3 font-semibold text-black font-sans"
                                  style={{
                                    fontSize: "16px",
                                    color: "#000000",
                                    whiteSpace: "nowrap",
                                    cursor: "default",
                                  }}
                                >
                                  Circulation.
                                </th>
                                <th
                                  className="px-3 py-3 font-semibold text-black font-sans"
                                  style={{
                                    fontSize: "16px",
                                    color: "#000000",
                                    whiteSpace: "nowrap",
                                    cursor: "default",
                                  }}
                                >
                                  Raccordement.
                                </th>
                                <th
                                  className="px-3 py-3 text-center font-semibold text-black font-sans"
                                  style={{
                                    fontSize: "16px",
                                    color: "#000000",
                                    whiteSpace: "nowrap",
                                    cursor: "default",
                                  }}
                                >
                                  Volume.
                                </th>
                                <th
                                  className="px-3 py-3 text-center font-semibold text-black font-sans"
                                  style={{
                                    fontSize: "16px",
                                    color: "#000000",
                                    whiteSpace: "nowrap",
                                    cursor: "default",
                                  }}
                                >
                                  Suivi du colis.
                                </th>
                                <th
                                  className="px-3 py-3 text-center font-semibold text-black font-sans"
                                  style={{
                                    fontSize: "16px",
                                    color: "#000000",
                                    whiteSpace: "nowrap",
                                    cursor: "default",
                                  }}
                                >
                                  Date.
                                </th>
                                <th
                                  className="px-3 py-3 text-center font-semibold text-black font-sans"
                                  style={{
                                    fontSize: "16px",
                                    color: "#000000",
                                    whiteSpace: "nowrap",
                                    cursor: "default",
                                  }}
                                >
                                  Situation.
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              {(matchedStockRecord?.mouvements || []).length ===
                              0 ? (
                                <tr>
                                  <td
                                    colSpan={7}
                                    className="text-center text-xs text-slate-400 py-4 font-sans bg-white"
                                  >
                                    Aucun mouvement enregistr√© pour ce stock.
                                  </td>
                                </tr>
                              ) : (
                                (matchedStockRecord?.mouvements || []).map(
                                  (mv, index, arr) => {
                                    return (
                                      <tr
                                        key={mv.id}
                                        className="hover:bg-slate-50 transition-all font-sans bg-white text-black"
                                        style={{
                                          borderBottom:
                                            index === arr.length - 1
                                              ? "none"
                                              : "1px solid oklch(0.88 0 0)",
                                        }}
                                      >
                                        {/* Indicator (Pink text with 18px arrow) */}
                                        <td
                                          className="px-3 py-2 whitespace-nowrap bg-white text-center"
                                          style={{ cursor: "default" }}
                                        >
                                          <span
                                            className="inline-flex items-center justify-center font-bold font-sans"
                                            style={{
                                              color: "#fa53d5",
                                              fontSize: "18px",
                                              lineHeight: "1",
                                              cursor: "default",
                                            }}
                                          >
                                            {mv.type ===
                                            "R√©approvisionnement fournisseur"
                                              ? "‚Üì"
                                              : mv.type === "Distribution"
                                                ? "‚Üí"
                                                : mv.type === "Exp√©dition directe au client"
                                                  ? "‚Üó"
                                                  : mv.type === "Annulation"
                                                    ? "‚Üë"
                                                    : "‚Üê"}
                                          </span>
                                        </td>
                                        {/* Type / Circulation */}
                                        <td
                                          className="px-3 py-2 bg-white font-medium text-black"
                                          style={{
                                            fontSize: "16px",
                                            whiteSpace: "nowrap",
                                            color: "#000000",
                                            cursor: "default",
                                          }}
                                        >
                                          {mv.type || ""}
                                        </td>
                                        {/* Raccordement */}
                                        <td
                                          className="px-3 py-2 bg-white font-medium text-black"
                                          style={{
                                            fontSize: "16px",
                                            whiteSpace: "nowrap",
                                            color: "#000000",
                                            cursor: "default",
                                          }}
                                        >
                                          {mv.emplacement || ""}
                                        </td>
                                        {/* Volume */}
                                        <td
                                          className="px-3 py-2 text-center bg-white font-semibold text-black"
                                          style={{
                                            fontSize: "16px",
                                            whiteSpace: "nowrap",
                                            color: "#000000",
                                            cursor: "default",
                                          }}
                                        >
                                          {mv.volume !== undefined &&
                                          mv.volume !== null
                                            ? mv.volume
                                            : ""}
                                        </td>
                                        {/* Suivi du colis */}
                                        <td
                                          className="px-3 py-2 text-center bg-white text-black font-semibold font-sans"
                                          style={{
                                            fontSize: "16px",
                                            whiteSpace: "nowrap",
                                            color: "#000000",
                                            cursor: "default",
                                          }}
                                        >
                                          {mv.trackingLink ? (
                                            <a
                                              href={
                                                mv.trackingLink.startsWith(
                                                  "http",
                                                )
                                                  ? mv.trackingLink
                                                  : `https://${mv.trackingLink}`
                                              }
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-[#fa53d5] hover:underline font-bold font-sans"
                                              style={{ cursor: "pointer" }}
                                              title="Suivre le colis"
                                            >
                                              Ouvrir le lien
                                            </a>
                                          ) : (
                                            ""
                                          )}
                                        </td>
                                        {/* Date */}
                                        <td
                                          className="px-3 py-2 text-center bg-white font-medium text-black"
                                          style={{
                                            fontSize: "16px",
                                            whiteSpace: "nowrap",
                                            color: "#000000",
                                            cursor: "default",
                                          }}
                                        >
                                          {mv.date
                                            ? new Date(
                                                mv.date,
                                              ).toLocaleDateString("fr-FR")
                                            : ""}
                                        </td>
                                        {/* Situation */}
                                        <td
                                          className="px-3 py-2 text-center bg-white font-medium text-black"
                                          style={{
                                            fontSize: "16px",
                                            cursor: "default",
                                          }}
                                        >
                                          {mv.statut || ""}
                                        </td>
                                      </tr>
                                    );
                                  },
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Toggle: Activer la tra√ßabilit√© des pi√®ces */}
                      {matchedStockRecord && (
                        <div
                          className="flex items-center justify-between p-4 bg-white border mt-4"
                          style={{
                            borderColor: "rgb(201, 190, 205)",
                            borderRadius: "14px",
                          }}
                        >
                          <span className="font-bold text-black font-sans text-[16px]">
                            Activer la tra√ßabilit√© des pi√®ces
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (!matchedStockRecord || !stocks || !onUpdateStocks) return;
                              if (matchedStockRecord.traceabilityEnabled) return;
                              const updated = stocks.map((st) => {
                                if (st.id === matchedStockRecord.id) {
                                  return { ...st, traceabilityEnabled: true };
                                }
                                return st;
                              });
                              onUpdateStocks(updated);
                            }}
                            disabled={!!matchedStockRecord.traceabilityEnabled}
                            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                              matchedStockRecord.traceabilityEnabled ? "cursor-not-allowed" : "cursor-pointer"
                            }`}
                            style={{
                              backgroundColor: matchedStockRecord.traceabilityEnabled ? "#fe4eba" : "#cbd5e1",
                            }}
                          >
                            <span
                              className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                              style={{
                                transform: matchedStockRecord.traceabilityEnabled ? "translateX(20px)" : "translateX(0px)",
                              }}
                            />
                          </button>
                        </div>
                      )}

                      {/* Section Inventaire de tra√ßabilit√© */}
                      {matchedStockRecord?.traceabilityEnabled && (
                        <div className="bg-white space-y-4 mt-4">
                          <div className="flex bg-white select-none">
                            <span
                              className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                              style={{
                                color: "#fff",
                                backgroundColor: "#5f1f66",
                                fontSize: "16px",
                                border: "none",
                                textTransform: "none",
                                letterSpacing: "normal",
                              }}
                            >
                              Inventaire de tra√ßabilit√©
                            </span>
                          </div>

                          <div className="flex items-center gap-3 w-full">
                            <button
                              type="button"
                              onClick={() => {
                                setShowNewWebappTraceForm(false);
                                if (isInventoryMode) {
                                  // CONFIRM
                                  if (!matchedStockRecord || !stocks || !onUpdateStocks) return;
                                  let hasPassedToMissing = false;
                                  const updatedTraceabilities = (matchedStockRecord.traceabilities || []).map((t) => {
                                    if (t.situation === "Disponible" || t.situation === "Signal√© manquant") {
                                      const isChecked = checkedTraceabilityIds[t.id];
                                      let newSituation = t.situation;
                                      if (isChecked) {
                                        if (t.situation === "Disponible") {
                                          // do nothing
                                        } else if (t.situation === "Signal√© manquant") {
                                          newSituation = "Disponible";
                                        }
                                      } else {
                                        if (t.situation === "Disponible") {
                                          newSituation = "Signal√© manquant";
                                          hasPassedToMissing = true;
                                        } else if (t.situation === "Signal√© manquant") {
                                          newSituation = "Signal√© manquant";
                                        }
                                      }
                                      return { ...t, situation: newSituation };
                                    }
                                    return t;
                                  });

                                  if (onAddLogisticsNotification) {
                                    const name_technician = authenticatedUser?.name || "Un technicien";
                                    const location_name = selectedTechStock?.locationName || techLocationLink || "Emplacement";
                                    const pieceName = selectedStockVariable?.nom || "Pi√®ce inconnue";
                                    const ugs = matchedStockRecord?.ugs ? ` (${matchedStockRecord.ugs})` : "";
                                    const ugsRef = `${pieceName}${ugs}`;
                                    onAddLogisticsNotification(
                                      `Le technicien ${name_technician} (${location_name}) a effectu√© l‚Äôinventaire pour la pi√®ce ${ugsRef}.`,
                                      matchedStockRecord?.ugs || pieceName
                                    );
                                  }

                                  const updatedStocks = stocks.map((st) => {
                                    if (st.id === matchedStockRecord.id) {
                                      return { ...st, traceabilities: updatedTraceabilities };
                                    }
                                    return st;
                                  });
                                  onUpdateStocks(updatedStocks);
                                  setIsInventoryMode(false);
                                } else {
                                  // PROCEED
                                  const initialChecked: Record<string, boolean> = {};
                                  filteredTraceabilities.forEach((t) => {
                                    initialChecked[t.id] = false;
                                  });
                                  setCheckedTraceabilityIds(initialChecked);
                                  setIsInventoryMode(true);
                                }
                              }}
                              style={{
                                backgroundColor: isInventoryMode ? "#2563eb" : "#000000",
                                color: "#ffffff",
                                borderRadius: "13px",
                                fontSize: "18px",
                                fontWeight: "bold",
                                padding: "12px 16px",
                                border: "none",
                                cursor: "pointer",
                              }}
                              className="flex-1 font-sans active:scale-[0.98] transition-all text-center"
                            >
                              {isInventoryMode ? "Confirmer l‚Äôinventaire" : "Inventaire"}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setIsInventoryMode(false);
                                setShowNewWebappTraceForm(!showNewWebappTraceForm);
                              }}
                              style={{
                                backgroundColor: "rgb(53, 86, 236)",
                                color: "#ffffff",
                                borderRadius: "13px",
                                fontSize: "18px",
                                fontWeight: "bold",
                                padding: "12px 16px",
                                border: "none",
                                boxShadow:
                                  "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                                cursor: "pointer",
                              }}
                              className="flex-1 font-sans active:scale-[0.98] transition-all hover:opacity-90 text-center"
                            >
                              Nouveau
                            </button>
                          </div>

                          {/* Form Nouveau inventaire de tra√ßabilit√© */}
                          {showNewWebappTraceForm && (
                            <div
                              className="bg-white p-4 my-3 flex flex-col gap-4 font-sans text-xs border rounded-xl animate-fadeIn"
                              style={{
                                borderColor: "#cbd5e1",
                                borderRadius: "16px",
                                width: "100%",
                                boxSizing: "border-box",
                              }}
                            >
                              {/* Forms stacked vertically (one above another) for responsive layout */}
                              <div className="flex flex-col gap-3.5 w-full">
                                {/* 1. S√©lection du mouvement */}
                                <div className="flex flex-col gap-1 w-full">
                                  <label className="font-bold font-sans" style={{ color: "#000000", fontSize: "16px" }}>
                                    S√©lection du mouvement *
                                  </label>
                                  <select
                                    value={newWebappMovementId}
                                    onChange={(e) => setNewWebappMovementId(e.target.value)}
                                    style={{
                                      color: "#000000",
                                      fontSize: "18px",
                                      borderColor: "#cbd5e1",
                                      borderWidth: "1px",
                                      borderStyle: "solid",
                                      borderRadius: "13px",
                                      padding: "10px 12px",
                                      backgroundColor: "#ffffff",
                                      width: "100%",
                                      boxSizing: "border-box",
                                      outline: "none",
                                      textAlign: "center",
                                      textAlignLast: "center",
                                      appearance: "none",
                                      WebkitAppearance: "none",
                                      MozAppearance: "none",
                                    }}
                                    className="font-sans font-medium cursor-pointer"
                                    required
                                  >
                                    <option value="Autre (Aucun mouvement)">Autre (Aucun mouvement)</option>
                                    {(matchedStockRecord?.mouvements || [])
                                      .filter((mv) => mv.type !== "Annulation")
                                      .map((mv) => (
                                        <option key={mv.id} value={mv.id}>
                                          {mv.date} - {mv.type} (Vol: {mv.volume})
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                {/* 2. Num√©ro de lot ou s√©rie */}
                                <div className="flex flex-col gap-1 w-full">
                                  <label className="font-bold font-sans" style={{ color: "#000000", fontSize: "16px" }}>
                                    Num√©ro de lot ou s√©rie *
                                  </label>
                                  <input
                                    type="text"
                                    value={newWebappLotOrSerial}
                                    onChange={(e) => setNewWebappLotOrSerial(e.target.value)}
                                    placeholder="Num√©ro de lot ou s√©rie"
                                    style={{
                                      color: "#000000",
                                      fontSize: "18px",
                                      borderColor: "#cbd5e1",
                                      borderWidth: "1px",
                                      borderStyle: "solid",
                                      borderRadius: "13px",
                                      padding: "10px 12px",
                                      backgroundColor: "#ffffff",
                                      width: "100%",
                                      boxSizing: "border-box",
                                      outline: "none",
                                      textAlign: "center",
                                    }}
                                    className="font-sans font-semibold"
                                    required
                                  />
                                </div>

                                {/* 3. Date de p√©remption */}
                                <div className="flex flex-col gap-1 w-full">
                                  <label className="font-bold font-sans" style={{ color: "#000000", fontSize: "16px" }}>
                                    Date de p√©remption
                                  </label>
                                  <input
                                    type="date"
                                    value={newWebappExpirationDate}
                                    onChange={(e) => setNewWebappExpirationDate(e.target.value)}
                                    style={{
                                      color: "#000000",
                                      fontSize: "18px",
                                      borderColor: "#cbd5e1",
                                      borderWidth: "1px",
                                      borderStyle: "solid",
                                      borderRadius: "13px",
                                      padding: "10px 12px",
                                      backgroundColor: "#ffffff",
                                      width: "100%",
                                      boxSizing: "border-box",
                                      outline: "none",
                                      textAlign: "center",
                                    }}
                                    className="font-sans font-medium"
                                  />
                                </div>

                                {/* 4. Volume (disabled) */}
                                <div className="flex flex-col gap-1 w-full">
                                  <label className="font-bold font-sans" style={{ color: "#000000", fontSize: "16px" }}>
                                    Volume *
                                  </label>
                                  <input
                                    type="number"
                                    value={1}
                                    disabled
                                    readOnly
                                    style={{
                                      color: "#000000",
                                      fontSize: "18px",
                                      borderColor: "#cbd5e1",
                                      borderWidth: "1px",
                                      borderStyle: "solid",
                                      borderRadius: "13px",
                                      padding: "10px 12px",
                                      backgroundColor: "#f1f5f9",
                                      width: "100%",
                                      boxSizing: "border-box",
                                      opacity: 1,
                                      WebkitTextFillColor: "#000000",
                                      textAlign: "center",
                                    }}
                                    className="font-sans font-semibold cursor-not-allowed"
                                  />
                                </div>

                                {/* 5. Situation */}
                                <div className="flex flex-col gap-1 w-full">
                                  <label className="font-bold font-sans" style={{ color: "#000000", fontSize: "16px" }}>
                                    Situation *
                                  </label>
                                  <select
                                    value={newWebappSituation}
                                    onChange={(e) =>
                                      setNewWebappSituation(
                                        e.target.value as
                                          | "Disponible"
                                          | "Utilis√©"
                                          | "Indisponible"
                                          | "Signal√© manquant"
                                          | "Pr√™t√©"
                                      )
                                    }
                                    style={{
                                      color: "#000000",
                                      fontSize: "18px",
                                      borderColor: "#cbd5e1",
                                      borderWidth: "1px",
                                      borderStyle: "solid",
                                      borderRadius: "13px",
                                      padding: "10px 12px",
                                      backgroundColor: "#ffffff",
                                      width: "100%",
                                      boxSizing: "border-box",
                                      outline: "none",
                                      textAlign: "center",
                                      textAlignLast: "center",
                                      appearance: "none",
                                      WebkitAppearance: "none",
                                      MozAppearance: "none",
                                    }}
                                    className="font-sans font-medium cursor-pointer"
                                    required
                                  >
                                    <option value="Disponible">Disponible</option>
                                    <option value="Utilis√©">Utilis√©</option>
                                    <option value="Indisponible">Indisponible</option>
                                    <option value="Signal√© manquant">Signal√© manquant</option>
                                    <option value="Pr√™t√©">Pr√™t√©</option>
                                  </select>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-3 pt-2 w-full">
                                <button
                                  type="button"
                                  onClick={() => setShowNewWebappTraceForm(false)}
                                  style={{
                                    backgroundColor: "#000000",
                                    color: "#ffffff",
                                    fontSize: "18px",
                                    borderRadius: "13px",
                                    padding: "12px 16px",
                                    border: "none",
                                    cursor: "pointer",
                                  }}
                                  className="flex-1 font-sans font-bold transition-all hover:opacity-90 active:scale-[0.98] text-center"
                                >
                                  Annuler
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!newWebappLotOrSerial.trim()) {
                                      alert("Le num√©ro de lot ou s√©rie est requis.");
                                      return;
                                    }

                                    const cleanLot = newWebappLotOrSerial.trim().toLowerCase();
                                    const isDuplicateLot = stocks.some((st) =>
                                      (st.traceabilities || []).some(
                                        (t) => t.lotOrSerial && t.lotOrSerial.trim().toLowerCase() === cleanLot
                                      )
                                    );
                                    if (isDuplicateLot) {
                                      alert("Ce num√©ro de lot ou de s√©rie existe d√©j√† dans l'inventaire de tra√ßabilit√©.");
                                      return;
                                    }

                                    if (!matchedStockRecord || !stocks || !onUpdateStocks) return;

                                    const newTrace: StockTraceability = {
                                      id: "tr_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
                                      movementId: newWebappMovementId || "Autre (Aucun mouvement)",
                                      lotOrSerial: newWebappLotOrSerial.trim(),
                                      expirationDate: newWebappExpirationDate || undefined,
                                      volume: 1,
                                      situation: newWebappSituation || "Disponible",
                                      emplacement: selectedTechStock?.locationName || techLocationLink || "Centrale des stocks",
                                    };

                                    const currentTraces = matchedStockRecord.traceabilities || [];
                                    const updatedTraceabilities = [...currentTraces, newTrace];

                                    const updatedStocks = stocks.map((st) => {
                                      if (st.id === matchedStockRecord.id) {
                                        return {
                                          ...st,
                                          traceabilityEnabled: true,
                                          traceabilities: updatedTraceabilities,
                                        };
                                      }
                                      return st;
                                    });

                                    onUpdateStocks(updatedStocks);

                                    // Reset form
                                    setShowNewWebappTraceForm(false);
                                    if (onAddLogisticsNotification) {
                                      const name_technician = authenticatedUser?.name || "Un technicien";
                                      const location_name = selectedTechStock?.locationName || techLocationLink || "Emplacement";
                                      const pieceName = selectedStockVariable?.nom || "Pi√®ce inconnue";
                                      const ugsStr = matchedStockRecord?.ugs ? ` (${matchedStockRecord.ugs})` : "";
                                      const ugsRef = `${pieceName}${ugsStr}`;
                                      const lotStr = newWebappLotOrSerial.trim();

                                      onAddLogisticsNotification(
                                        `Le technicien ${name_technician} (${location_name}) a modifi√© la pi√®ce ${ugsRef}, pi√®ce(s) : ${lotStr}.`,
                                        matchedStockRecord?.ugs || pieceName
                                      );
                                    }
                                    setNewWebappLotOrSerial("");
                                    setNewWebappExpirationDate("");
                                    setNewWebappSituation("Disponible");
                                    setNewWebappMovementId("Autre (Aucun mouvement)");
                                  }}
                                  style={{
                                    backgroundColor: "rgb(53, 86, 236)",
                                    color: "#ffffff",
                                    fontSize: "18px",
                                    borderRadius: "13px",
                                    padding: "12px 16px",
                                    border: "none",
                                    cursor: "pointer",
                                  }}
                                  className="flex-1 font-sans font-bold transition-all hover:opacity-90 active:scale-[0.98] text-center"
                                >
                                  Enregistrer
                                </button>
                              </div>
                            </div>
                          )}

                          {isInventoryMode && (
                            <p className="font-sans font-medium" style={{ color: "#000000", fontSize: "18px" }}>
                              Cochez les lignes des mat√©riels dont vous disposez dans votre emplacement.
                            </p>
                          )}

                          <div
                            className="overflow-x-auto border rounded-xl mt-2 bg-white"
                            style={{
                              borderColor: "oklch(0.88 0 0)",
                              borderWidth: "1px",
                            }}
                          >
                            <table className="w-full text-left font-sans border-collapse text-xs">
                              <thead>
                                <tr
                                  className="bg-white"
                                  style={{
                                    borderBottom: "1px solid oklch(0.88 0 0)",
                                  }}
                                >
                                  {isInventoryMode && (
                                    <th
                                      className="px-3 py-3 font-semibold text-black font-sans text-center"
                                      style={{ fontSize: "16px", color: "#000000", width: "60px" }}
                                    >
                                      Select.
                                    </th>
                                  )}
                                  <th
                                    className="px-3 py-3 font-semibold text-black font-sans"
                                    style={{ fontSize: "16px", color: "#000000", whiteSpace: "nowrap" }}
                                  >
                                    Barre-code.
                                  </th>
                                  <th
                                    className="px-3 py-3 font-semibold text-black font-sans"
                                    style={{ fontSize: "16px", color: "#000000", whiteSpace: "nowrap" }}
                                  >
                                    Num√©ro de lot ou s√©rie.
                                  </th>
                                  <th
                                    className="px-3 py-3 font-semibold text-black font-sans"
                                    style={{ fontSize: "16px", color: "#000000", whiteSpace: "nowrap" }}
                                  >
                                    Date de p√©remption.
                                  </th>
                                  <th
                                    className="px-3 py-3 text-center font-semibold text-black font-sans"
                                    style={{ fontSize: "16px", color: "#000000", whiteSpace: "nowrap" }}
                                  >
                                    Volume.
                                  </th>
                                  <th
                                    className="px-3 py-3 font-semibold text-black font-sans"
                                    style={{ fontSize: "16px", color: "#000000", whiteSpace: "nowrap" }}
                                  >
                                    Situation.
                                  </th>
                                  <th
                                    className="px-3 py-3 font-semibold text-black font-sans"
                                    style={{ fontSize: "16px", color: "#000000", whiteSpace: "nowrap" }}
                                  >
                                    Commentaire.
                                  </th>
                                  <th
                                    className="px-3 py-3 font-semibold text-black font-sans"
                                    style={{ fontSize: "16px", color: "#000000", whiteSpace: "nowrap" }}
                                  >
                                    Mouvement d‚Äôorigine.
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white">
                                {filteredTraceabilities.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={isInventoryMode ? 8 : 7}
                                      className="text-center text-xs text-slate-400 py-4 font-sans bg-white"
                                    >
                                      Aucun mat√©riel de tra√ßabilit√© enregistr√©.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredTraceabilities.map((trace, idx) => {
                                    return (
                                      <tr
                                        key={trace.id}
                                        className="hover:bg-slate-50 transition-all font-sans bg-white text-black"
                                        style={{
                                          borderBottom:
                                            idx === filteredTraceabilities.length - 1
                                              ? "none"
                                              : "1px solid oklch(0.88 0 0)",
                                        }}
                                      >
                                        {isInventoryMode && (
                                          <td className="px-3 py-2 text-center bg-white align-middle">
                                            <div
                                              onClick={() => {
                                                setCheckedTraceabilityIds((prev) => ({
                                                  ...prev,
                                                  [trace.id]: !prev[trace.id],
                                                }));
                                              }}
                                              className="cursor-pointer flex items-center justify-center mx-auto"
                                              style={{ width: "28px", height: "28px" }}
                                            >
                                              <div
                                                className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all bg-white"
                                                style={{
                                                  borderColor: checkedTraceabilityIds[trace.id] ? "#fe4eba" : "#cbd5e1",
                                                  borderWidth: "2px",
                                                }}
                                              >
                                                {checkedTraceabilityIds[trace.id] && (
                                                  <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: "#fe4eba" }}
                                                  />
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                        )}
                                        {/* Code-barres */}
                                        <td className="px-3 py-2 bg-white align-middle">
                                          <div className="flex items-center gap-2">
                                            <div
                                              className="hidden md:inline-block"
                                              dangerouslySetInnerHTML={{
                                                __html: generateBarcodeSVGString(trace.lotOrSerial),
                                              }}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => downloadBarcodeSVG(trace.lotOrSerial)}
                                              style={{
                                                backgroundColor: "#000000",
                                                color: "#ffffff",
                                                padding: "10px 20px",
                                                fontSize: "18px",
                                                borderRadius: "13px",
                                              }}
                                              className="font-sans font-bold active:scale-95 transition-all cursor-pointer border-0"
                                              title="Imprimer / T√©l√©charger"
                                            >
                                              Imprimer
                                            </button>
                                          </div>
                                        </td>
                                        {/* Num√©ro de lot ou s√©rie */}
                                        <td className="px-3 py-2 bg-white align-middle">
                                          <input
                                            type="text"
                                            value={trace.lotOrSerial}
                                            disabled={!isInventoryMode}
                                            onChange={(e) => {
                                              handleUpdateTraceability(trace.id, { lotOrSerial: e.target.value });
                                            }}
                                            onBlur={() => {
                                              if (isInventoryMode && onAddLogisticsNotification) {
                                                const name_technician = authenticatedUser?.name || "Un technicien";
                                                const location_name = selectedTechStock?.locationName || techLocationLink || "Emplacement";
                                                const pieceName = selectedStockVariable?.nom || "Pi√®ce inconnue";
                                                const ugsStr = matchedStockRecord?.ugs ? ` (${matchedStockRecord.ugs})` : "";
                                                const ugsRef = `${pieceName}${ugsStr}`;
                                                const lotStr = trace.lotOrSerial || "non sp√©cifi√©";
                                                onAddLogisticsNotification(
                                                  `Le technicien ${name_technician} (${location_name}) a modifi√© la pi√®ce ${ugsRef}, pi√®ce(s) : ${lotStr}.`,
                                                  matchedStockRecord?.ugs || pieceName
                                                );
                                              }
                                            }}
                                            className={`w-full font-semibold font-sans ${!isInventoryMode ? "cursor-not-allowed text-slate-700" : "bg-white text-black"}`}
                                            style={{
                                              backgroundColor: "#ffffff",
                                              color: "#000000",
                                              fontSize: "18px",
                                              borderRadius: "13px",
                                              border: "1px solid #cbd5e1",
                                              padding: "6px 12px",
                                              minHeight: "42px",
                                              opacity: 1,
                                              WebkitTextFillColor: "#000000",
                                            }}
                                          />
                                        </td>
                                        {/* Date de p√©remption */}
                                        <td className="px-3 py-2 bg-white align-middle">
                                          <input
                                            type="date"
                                            value={trace.expirationDate || ""}
                                            disabled={!isInventoryMode}
                                            onChange={(e) => {
                                              handleUpdateTraceability(trace.id, { expirationDate: e.target.value });
                                            }}
                                            className={`w-full font-sans ${!isInventoryMode ? "cursor-not-allowed text-slate-700" : "bg-white text-black"}`}
                                            style={{
                                              backgroundColor: "#ffffff",
                                              color: "#000000",
                                              fontSize: "18px",
                                              borderRadius: "13px",
                                              border: "1px solid #cbd5e1",
                                              padding: "6px 12px",
                                              minHeight: "42px",
                                              opacity: 1,
                                              WebkitTextFillColor: "#000000",
                                            }}
                                          />
                                        </td>
                                        {/* Volume */}
                                        <td className="px-3 py-2 bg-white text-center align-middle">
                                          <input
                                            type="number"
                                            value={trace.volume}
                                            disabled
                                            readOnly
                                            className="text-center font-sans cursor-not-allowed"
                                            style={{
                                              width: "80px",
                                              backgroundColor: "#ffffff",
                                              color: "#000000",
                                              fontSize: "18px",
                                              borderRadius: "13px",
                                              border: "1px solid #cbd5e1",
                                              padding: "6px 12px",
                                              minHeight: "42px",
                                              opacity: 1,
                                              WebkitTextFillColor: "#000000",
                                            }}
                                          />
                                        </td>
                                        {/* Situation */}
                                        <td className="px-3 py-2 bg-white font-medium align-middle">
                                          <input
                                            type="text"
                                            value={trace.situation}
                                            disabled
                                            readOnly
                                            className="w-full text-center font-bold font-sans cursor-not-allowed"
                                            style={{
                                              backgroundColor: "#ffffff",
                                              color: "#000000",
                                              fontSize: "18px",
                                              borderRadius: "13px",
                                              border: "1px solid #cbd5e1",
                                              padding: "6px 12px",
                                              minHeight: "42px",
                                              minWidth: "220px",
                                              opacity: 1,
                                              WebkitTextFillColor: "#000000",
                                            }}
                                          />
                                        </td>
                                        {/* Commentaire */}
                                        <td className="px-3 py-2 bg-white align-middle">
                                          <input
                                            type="text"
                                            value={trace.comment || ""}
                                            disabled={!isInventoryMode}
                                            onChange={(e) => {
                                              handleUpdateTraceability(trace.id, { comment: e.target.value });
                                            }}
                                            placeholder={isInventoryMode ? "Saisir un commentaire" : ""}
                                            className={`w-full font-sans ${!isInventoryMode ? "cursor-not-allowed text-slate-700" : "bg-white text-black"}`}
                                            style={{
                                              backgroundColor: "#ffffff",
                                              color: "#000000",
                                              fontSize: "18px",
                                              borderRadius: "13px",
                                              border: "1px solid #cbd5e1",
                                              padding: "6px 12px",
                                              minHeight: "42px",
                                              minWidth: "220px",
                                              opacity: 1,
                                              WebkitTextFillColor: "#000000",
                                            }}
                                          />
                                        </td>
                                        {/* Mouvement d'origine */}
                                        <td className="px-3 py-2 bg-white align-middle">
                                          <select
                                            value={trace.movementId}
                                            disabled
                                            className="w-full font-sans cursor-not-allowed appearance-none"
                                            style={{
                                              backgroundColor: "#ffffff",
                                              color: "#000000",
                                              fontSize: "18px",
                                              borderRadius: "13px",
                                              border: "1px solid #cbd5e1",
                                              padding: "6px 12px",
                                              minHeight: "42px",
                                              minWidth: "280px",
                                              opacity: 1,
                                              WebkitTextFillColor: "#000000",
                                              appearance: "none",
                                              WebkitAppearance: "none",
                                              MozAppearance: "none",
                                              backgroundImage: "none",
                                            }}
                                          >
                                            <option value="" disabled hidden>
                                              S√©lectionnez un mouvement
                                            </option>
                                            <option value="Autre">Autre (Aucun mouvement)</option>
                                            {(matchedStockRecord?.mouvements || [])
                                              .filter((mv) => mv.type !== "Annulation")
                                              .map((mv) => (
                                                <option key={mv.id} value={mv.id}>
                                                  {mv.date} - {mv.type} (Vol: {mv.volume})
                                                </option>
                                              ))}
                                          </select>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Section 3: Actions (Two side-by-side black styled buttons) */}
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={handleAlertLogistique}
                            style={{
                              backgroundColor: "#000000",
                              color: "#ffffff",
                              borderRadius: "13px",
                              fontSize: "18px",
                              fontWeight: "bold",
                              padding: "12px 14px",
                              border: "none",
                              cursor: "pointer",
                              textAlign: "center",
                              width: "100%",
                            }}
                            className="font-sans hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center"
                          >
                            Alerter
                          </button>

                           <button
                             type="button"
                             onClick={() => {
                               const isTraceActive = matchedStockRecord?.traceabilityEnabled ?? false;
                               const n = isTraceActive && matchedStockRecord?.traceabilities 
                                 ? matchedStockRecord.traceabilities.filter((t) => {
                                     if (t.situation !== "Disponible") return false;
                                     let currentLoc = t.emplacement;
                                     if (!currentLoc) {
                                       const matchedMv = (matchedStockRecord.mouvements || []).find(mv => mv.id === t.movementId);
                                       if (matchedMv && matchedMv.emplacement) {
                                         currentLoc = matchedMv.emplacement.includes(" : ") ? matchedMv.emplacement.split(" : ")[1] : matchedMv.emplacement;
                                       }
                                     }
                                     return currentLoc === selectedTechStock.locationName;
                                   }).length 
                                 : (selectedTechStock?.volumeDisponible || 0);
                               setRapatrimentVolume(n > 0 ? n : 0);
                               setRapatrimentTrackingLink("");
                               setRapatrimentDate(
                                 new Date().toISOString().split("T")[0],
                               );
                               setRapatrimentStatut("Exp√©di√©");
                               setShowRapatriementForm(true);
                             }}
                            style={{
                              backgroundColor: "rgb(239, 68, 68)",
                              color: "#ffffff",
                              borderRadius: "13px",
                              fontSize: "18px",
                              fontWeight: "bold",
                              padding: "12px 14px",
                              border: "none",
                              cursor: "pointer",
                              textAlign: "center",
                              width: "100%",
                            }}
                            className="font-sans hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center"
        xúÏ}[sIñﬁ˚˛ä∫=ªŒñ∏bk)äjqó∫òd´m+R¢*T´nS^ƒQƒÜ˝ËpÑ√~ŸÒìáªG8bﬁÊmOˆÏO9ôU@°Pï §D5r¶ª	†2+/'øs…ìÁR.?˛ÕƒWÖr§	âX§ëœ"…£ó;ií~}sómÁÙ«ø©˝˝r˘;rDCöDÛòüê8Ì¥∫A‰ëÔñ?’◊ä˚¡Y±⁄S¨Òªﬂë¶¨≥–bπ4é_PèÌ4¬÷
âCj±÷EkÉt?i≈‘èI¬ŒìV«•÷“ÈµíæiÑ}ÎëÕ¢ñ¯åƒ}jg¸ÔÜ|6ÀÔÌEéM_-+p„÷*È—:0˛.Eõì≠v]vN_ÿ*orµΩi⁄(4Î“sã¶CÃÛúN‡⁄Â∂Iú\∏lÁÚí?vÏ|d€§±∫û7»ßOÍ’]Ñ¨≠Ó‡2Ô°∆H?Lç˜&^1ÃÜ∆”ß‘M·Ò"ÒÈT≥ùòv\fk<Zò˚≥V7u]úÈÿ•	k≠Æ¨dDò”¢¯~æÁÎ$>n¬GæVUÎ§—É|%5%YGé®Ì§1Æ¯:¨¯=≠ö!µm«Ôa•ïú¨nh◊,Sò^≠>sz˝ÍlËæÈS=ÂeYπQò=ı’mÁ◊Åõzs›–1sô•≥£≈Ωåƒ≈-*:£^MBØO˝To≤%≤£3Rÿ0,9*øL∆ääÂEÍuX‘dÌÑF=ñ¥yÁó»˛@VÙ»zIáêß≈ù≥æì0R&è¡n˜ß'qøE]˜öê…–!\`õﬂX{ì≠jn¯ﬂ84È–Óe≥âTNÙVƒ
¸8!N|Åÿ¥k%Œ)#;ƒ£â’gˆqXéòì˛®ù‡¥„∏Nr±Ôs÷G="]Í∆ÏoﬁÂC˚„Ô)OÒBá≈ö{ÔQES•ñ⁄]«M`6Éy≈Èíf“ÜíR‹#‰ŒŒi<q‚0òê∆ ÿ bõÃä(.KàïF‘áÅSî¥ô¬˛‰ÚàIKÿ«;£¶ñåò/R6âœO°'ÕäıÇÙî˜,FX{Ûv	&’∑õﬁ)Œ®w⁄ÜçΩ≥ÉÉÒ‹ÅΩd21åQ/F$Ú¸¥81¶£#„ì\Ÿf€Ò-7µY‹lÿøK#ö*=á@PŸCoVﬂ¬+ü3∑ÆOÛlFò≈·√	ÃÏfı˘˙∂›¿‚¥çlCøÁüñ⁄.Û{I_≥∆6iNº˙Q˚î≥Ÿ—~‚,Sìnê^|Úp*h”D6'ÉêÔÊL»X˘Ù„ √eÒ›èz/◊[±µ†·HÔÕ[Ω¶As&MD*≠˛-¸∆Ë√øˇ^†¯Œvò∆}]Ü'Âªÿπt>Âì„hIäyÅ«ı_òOπfM∫–Î@F	8O:Õ~Zj.©~∏,h|°OTóCá˘B‚É(ait[lE=ô X:˛á“FäØ,ks“8ÛÍ√¢≥hß±∏.ãàãÀe3ßŒ©£3YÍGNcçÀ§q,å!5Â	M>£m”Ü∑OáWÿÔ¬)|’5·”Z–í?ı’AÀqBì4˘BÏ¨¢37Ñ‚e%Ã 4&‘ø¯|FQ–ô„ jÖÅ„',Z‡ñõ¬Bh2
€À¬wÒ√YΩzø∞Œ'Ÿù≤ˆÛ‡„¥U;@?Ω(H}˚¿£=£ s2è4Ø¢¡`7Î4~,~2—πKçÓüáÉ+€\5~˛9Cs',Ú[Àˇö°±]ﬂO]l+˚Cø)Cï]„˘3Uºê»ã[C∞·¸kùÑ	¸´‰∫0toP;óÂ‡Öh)V£¿ΩÎX ÌπÄ¸∏¬Ö£…-·∆í“,¥VIxÉÊê,–πúL!µú‰¢ı`≥tX%Õ¶m≤Û£ıı®ê{¥œAA¿øY·Ek´O⁄E‡ΩoPÁózπ,¨Æ•Ñ"ıf‚ªOÍmÑEÌqî=wΩT¢ãÌ≤Ω¿Ô:ëW§‚k ›ï"Èfﬂ~.íÌ≤÷°í%[ˇ9≠íK(®ÖMIΩ⁄üñ»6Å˝ËN∂YYﬁ]˙˚ZÂBNvìımr≤ˇ¸’q≈œì>óîü˙û–?Åµ „Fµ´Ú«ä°6\ÓÓ∑E¬Nku«Cá©.µŸAÂ˛wlPÂhß≈ﬂ€ä≠à±äÁ™f·3ÊÜè”N«eïSoQ´œ˛Å]Ï4˙‡ª3ÿWa¯éøÁù„ÖQvZΩ£-v{,∏Al$,NÛâ .˚.ıWÆπ≠M~ˆI»R4«R9ÑTXﬁ” â@ZœãbQ“Åüí¡ü±%+ÄﬂB7ç	 L
ÿ”%ÌÅ8àá˘dGí&éÎ@=rß™èÀï¬ÃC??^æØ’7Âô&‹Œı¶`≈zªΩ›:„≤zÀ¢.Ûm
 ê‡Á¯∂c—$à™˜æºÒ4J≠∆kO—l']z€›CÔ¿QBÎtÛ75Õ™#`÷ÆrÊÿIõ¨h<ö´]:œz†y;æŒ≥U‡Ù˛H–ú ™h‰â”sÍí=7 5˚dm‹´]Ék∂ˇàÂ’»`ç{∞mr˛÷Ì6Í8√òÎ&·Ì0ªµv>.LÊ≥Vµ+jPÍ‘â*J~≠œ/«FYˇ6¯îzé¥‹8•Q≥’jK˜˛ß€ﬁ©o£ñµel“ôV∑É´[tuÏÓ2i6–bå®‘giƒ⁄ç˛$≥[3Òu$Ûïœ{ΩÖªvæ3Wê¿…vê∏ « ˘˙ΩzOÅK©ﬂKÅI°Íá<|Xé˜‰i0øıÛ1:≈ò4Ñ•Ilâl÷z≤o⁄¿+@™¥ó˛9ÊmÄ¬¸Íƒ¥ç} ´¡ˇ\1å∏µœá—ËF≠ßGub¯“ßÀi‘≠RKˆcÂ‡á≈-Äô\oñAÓÙ
vc`£ßN c\»Ø·NrGK·Ï#d›W®”°L∑C¬ÏœX8Ã’™JËa€â_˙=h™ársÿNò’G0‡”H”§dÖ¬≥|y‘ˆ·∑jà©Ò¢)∫Ö¢´Ù¸ŒùÒ¡¸mµi+Û§©YŸ‚5ºÆ#±b©5]ùø§Ìü=ïÛ…¥G-{B)ÃÙ7∂µ∂µ∂≈I:ÍuöÎÓëÓﬂ#kõõK
ÌVìﬂ`1S∂M’ls@·àa#<'k+ √Û≥y'8?Ê◊∂äì≠–›e-+´Dõ∞<|ç≤≠¥◊ñ?,…˛q¸ò%˜VS¸Ï©µ|Ú˜ï˚‚ÅÒ†ππøn¡õ÷∑ƒØ?¿?¯ﬂ÷Í®ëâ≠fÔ⁄¬˜≠Â]Rë77¡ Ûc-˘„ô∂—X]Y˘w“G•Fò¬∆ü0â	tŸéë∂ﬁ¨¥<x[∂Nö«McPd/ä÷ÚJ)]ô)Êrl≥ ˝$πtˇ#
¨‚∞ù£ÿ⁄AlïI®¢†5F˜%OW†ïE¯J¬¡≤(Õ∑‘/Ü Ç%11UÚ·Y«VsÆÏ°Áƒ∞TÃ&n–# ¥$ÂœÑS\YkÕàÜ~ˇúπjrÕ∫SÁ∂G√º•zÆ ÿ®t˝ÏŸÛÁdG≤Tô–Wî	ABzÜ÷üÊ“R`Ù8°Q“\ªG+ç%ÚΩ§≠∆vC˙{ıªû;~ö∞ ∑’˚ƒä∆¯0∂ÉN{ÙÈÄÍ+€†ë´Z`æ=¨?n$CxœÂu‡-˘Kjlè◊ˆK54òÙ◊Fs“IÄö√Ò)ÁÖMVŒ∫†¨JΩ0´¸ú&} ∑ÛÊ Ω¨¡ñËïNxG iºÌ uNú¶f÷˙ír¯Ä¿øi–ƒÒ'«∂?+{#û=ú®æ%¸U≥°øÁwŸá3\ÍÁ˜•◊µY3iÔUO_ƒBZAAà=^·ØÍF¨$Ÿù§	©KØÊÑ’*tÆ59ßıM(◊GÙ∑fGÉQ‹â˜œÅ√Ÿºç;wXˆ!Á&v¸–¬~+iH°é`ëòåD·W EÚÛ•1k‚âΩÌ¢QÒ∫…º-Ñ'zeqŒcπD™yÃW·MÑíÂ⁄ Í=≤˙  dmE©n(“{ÁÚ}Œm[çÏ÷∑b~ﬁÀ* œ PLÿÉ¶»3FÒ6¸cjÉ¬ºL~bn
¬ï,vµ'E.*vXrÜgx^4]LÜ	ç5BâE∏Xå\«Ù¬ºO2cπ^=≠,/”¸5∆˚®–Ë{óïî”PÊÁ≠ZmrUÀ˘ø%±wã÷˝›¢uÁ˘h> è®=HrÔ)Ω[I
≠A<5'‹’œ©„ìßsÌò¸ÑëRL˜ÚDxÄ÷—«5‚ˆ
◊ÖÀîrGÚ≥(<n‡<op≈⁄§πÎû—ãòú:1ﬁ>\Rv¥^IQ#KÓal 	ìNó# »<èå)ô.Q!ã	ÁG9√π’#Ã/‚ÆhBq¿Ô.d™˛≠—CÏûúußwñK´Z“D^Ç4A¨4c!9Å„[Ax¡ˇÎæØ Ÿâóka	¬ó\áŒ¶ÚìÎ}€Ir–Áà⁄D±Îûˆ=‡!9o„ÒÀS–˛≠~’-Ω	˛4ó¸9›π,hä∏aY≥ZPÜlbp’Iì£PÛﬁ˛ºÅ◊◊ÂXÊŒ#∞Ã¬'∞Ë^ÂŒåúcì¨√1∞hs˛∞.Á¿Rp#“¨ëqêÇLw¶ç8ñÈ∏ñ©8ñÈπ»®ˆ|8	ñ©∏	ñ8
«L\À4€Oüª`ôä√`ôó¡2‹€dú∑Ëœ¥{·j=ßd3XÙXdOA±YpÖÎ‰
c3|ãYBfı_∞ÉÒ⁄va˝ÕÃ`◊√p`©=fQzíâ’±%ÒW.∏Éw®òÚ/ÜGh¬bIKƒ®˝“w/Ã8PÒ,x¡Ü∆kïlà≠Ÿÿ÷∞°¸Ê¢$Ë•ú1Õ≠~ ºxx≈ä:õüdéÁ∞>-<7«£O\.ƒÂ U∏ç»Ï—ÛC÷rÁrueEw™ã¡”p:ˆ˝$bIäßw√â—ûèÇY)´Œ›ójØîÀƒo1à/tâäæã]p+u	ıc™g®°{(ˇ÷º≈ù∫â∏Asw‡m<Ì ƒÄèÀ‰hpeßà‚ #{≠‡&°J·Eí±´˘Aß%éj#†°;ÕËÚÅ|’ó	¯lL†ó·%1•”0Çr+=ÆeŒÁä∑e~X—HÊ`Í4ex)Àí:˜M”®@]ßÁ†‘Nlµ2Ôπ=òéΩ˙5{4Ñ«ıº∏¥oô`Q2ªIM%ÓGéˇ≥DÒ(O"ÔSÈíI≈=9V)=ç
”‹ü+G’‹çkà∏*ëptgCâÔ√7>a n∫±¡èœkog`¨*kv2ø˝‚$.∆Ø¯ÎøêÓáL˛˙-•≠ÆÎ∫ΩÄ&˙Z\æR)ª?ìR¶á{ºË	]¸züM=M„·rCk¬åºÛt›Ò≤>Qú†g|N‹°_WÅü›|j®®_ì™>ª≤ÆØÆgt29Á˙Í©ë¬n®≤O£¥ó¢óã{>⁄uá v·F	Êπ…⁄—_CcΩ{Õ{›{VÌ{˛˙˜¯Ã:¯<¥p=|M|]|û⁄8)^Ωö^'7– ıÛﬁhiÊ&&Ê
ÖÃÍFüÚﬁo\∞'ç˙ˆ4*øAˆÑ˚‰7»ùfpEY0´QôÅYü~âÀ–C≈ÿGe»÷™Ø·/∏Z]˝Øò´˙ØÃ∆’¶ˆa1ÖÒπ=®ÀjÏ¨<Ùƒ¬Ã*+˙fV>ôü” :ÂËlC°¡f"&»BüΩa8ﬂ∑Y6òè2;á≥Pf5Í≈l°Ã  hü‹jevnöHAÈgÔ‰d!˚»äæÏSy´%ÈµÇ±ª"$óÖ’‰∫E¢.Û|âb—çôLJ—ˆBS]˝ØXh˙:m%Ü⁄ÎÆÌ9æ'ò"©ªºõ&[h≤7§…VŒ˝mÜÔ˘iµ|jZ≠F˝Ø†Z≠¨åˆ…B´-<¶•’Úòπ‚ÓlΩ„41ïzD~Gˆ}lL£ÈJìgî¶5hÕƒ≠XÃí∑b…ÂÏùb‹TΩı-]1“•Yß´\./géogmK‰’ØGHc_∑NÉ4&Ò‡/Zã·Éã?Òpô≠Qﬁ	ÚH„Înï%Éùl4/≥ÃÃMñßï'√$ˆ‡™“^€ €§0mßu¯ÖŸπœü˛öÕaé´OòÀí·u7qÕ≠>ÏzπË¬õﬁsö¨»PZô`í„aèﬂ<∞Ë:ÌÚlIyÊ$]n`M…vßïû¶IV, ,ÇSA^[”øıV|Ø©tî_O+-UQ$Fó◊D…í ï€]ioBk´⁄ã ÏJ˚qsÛi9—¸≠©Cﬁ≠%HË%MÁœ^+ˇg¢ökE]ç6œDï¡°ßÃÄ∂¨¡üPÖ‘[ŒA®°>æ¿°b˘|8då4◊å9ÕÆ4
B˛\aCKS—xHjR‘Øïx>U∂Z”⁄ÃŸÌ7∂…”£›ÉÈ≤€wAŸÌÔ8ÒS¸Ã±mÊﬂ|æ{ﬁ≥|˜Í‘Ó≈FEˆıÍΩ5˘07¯È>Ã[ﬁﬁ.Âjejæ«∫Y“Â…úÀç=Á‘q√(˜0Îm◊È∞ 3T4ä˘òØ)˜˘	fûO‚%W\–¶.˚]~´|u‡ßœIÚ$¶«¿0˜œCÊ«5·E+®gsî}(l≠üW#“&»ky0S<„Oıs
´áˆ#~"ÀZ»¸)kÆƒÎSáõ•¶y‘€Wjœ⁄õ≤î∑™≥ÑZ_Ìú•”ëÒæ;ÏC1:¬t…4_v~eIª~t*sø“¿Øg“èÿÔ1ŒÇÏ∂·kS6sy _±”¯™À/[VaNì˝B›r∆Y[cg√`bå B~[6Z"Øô∏itL`.WŒ„(¿»¯olÓ◊›`Ÿiié¥ıÀTkeñ€ÅÖ˜
@w¢Ã´§©YSzÕLábZg¢S"Ÿ\±L%mü	u………^õ4ˇı?ˇü%ÚùT™Ufj`
ÑÛSØ˙çbY∏”XiØ¨ ü”@√	òK,˘L¿\ñX=±ƒ˜&0W>tm´Œ\5ıySm⁄t’y>ÁùÜgúSúkÍÔ¿ÿw†ñ÷+9iSùÜ-∞	∞ÈŸIM∑ò∆1ÁY2‰<Kà£¨Û€@úŸpF˙„Bæ∫N˘ÍıÓ◊b'ß‘≈
˙·)]Äò§ŒƒfñÜioeAøq4‚Ûcß@—C˜ëzC÷|·HÌ°:2ÿœ©Q¶*Ìß>Ã\˙ÏåœSs©ù«/èì6?|äÒG≥q“Xz≥ÚVﬁ‡àæX ∫y
ÅÈU?HÇl/LÍ„ÖœM/¢aﬂa@9§ÎXW4ãëΩ ﬂˇ’:É◊Tx~ ±_√ÀDﬂªƒ»´$ÉC>CàµG¨€∂“(Çæ?j[ÿPSÓG2úöﬁ_ƒ(Óº)ö;ÖîqÕtË˙Äò˘~€Øµ?}†˝Íñ∆bÌÁx¨gmu™8˚ÜÆ/˙`¬w•"˙Ñ?ÀÑáx&>ˇ®e˙ìoÔáògÈ«„¡ï+Çÿ¯,z∏ÃøìJej?m±¨Î∏ätü‘≤XòÏ4èˆÿÚw*3|w(¡çAñô(ß†«z=Ò1j7ŸΩÇ«ø˛9rgA≈"Ìpóñ)e`˝lºWÍ¯Û ‘Ì∫>èf˛é•ìÛŸlË‹y3C¨‡)æ–Ü˘L¶s<úŒÈpÉe
>3zùâü°Qr‡9æ… ê¡‡úØﬂÀæ@|ˇfÂ>˛oùô1è¸À’¸íÛ¡5‡á~†÷˜HﬁÓêOdŒ§´z+:Ö´§Üﬂ„¡7∞®uΩ™ı\#Â˘ô${_G3í¸T˝õ‰¥≈‹W¨nïHTù‘ßòYHBPö£:&Pc0„6Pﬂ•OÎ¢âÜ|µâ°†G+ÔO-.}f4™›’\J-8hÀ‰VEjü\D:NA‘å„ÁﬁõêJ5Æƒ¢hH ˙”‘Äf"dT]•∂Ÿ¶Bú]ﬂ‹†T˙¨ÅµÕ9ªò=k[+˝’Z˘ü≈ï>Ô—®Á¯'A®#a„O3/Áª”∫9ﬂ≠ÉD(l7µ˜9ñzñYM÷µvøz6Ys! ù®Á#`õºﬁ?8<‹üÍB¿)s\–'oﬁˇ_ºÿÏ¿3ÊÜè”N«eï≥nQ´œ˛Å] Ó¬ÉÔŒXáÜ·;Ò¢wé‰w P™	∑”Ncè%ËÖŒoÅ≈	aò$±ÔRî~'à¯%ﬂ6˘Ÿ'!KÒoﬂ0ﬂ¬Àæß +Ëe=Ñd†iJ:S2¯3∂d[Ë¶1∞™$¿ÔÙæÔEÉ+º2N$i‚∏‘#w™˙∏\â∆◊"∆ÊZy/b¸iú1™]Auì¢¢3cW)å{ˆ•_ƒ¯∆s˛ÜÏmŒ#x#ƒzˆ|„Ìˆvˆ‹'i°x„€4jÖx≈$j9æÌX4	Íª9Ã…s ™:IH˛&ÿ·åÇ e1Õ™ÊWeÙÔæÏ⁄ˆk>G˙7_nÊ‚J˝µï°@èqA4§xNq-˜\¯gT$Ω∫SÕUy|ë¿Û≤A›q\›a‹ZÌië8à3åv)ãkU/_‰ùR¬ÔMÑÄ}›ëô‚¿La/÷9¬œéÔ≈Çd}´ó≥™Ô_´Íﬂ◊› ±W~‡9æ`±ıW∫ék(&bøÅPn™}Ã~toplo|d?©ÔË`ÑÆ∏ûÚ´ùåj¨\2cb≈Î¿MΩ[
Yﬂõ{}ß€çÿ“u¢Ñ Ôp'D«¶Å	QsVî õY†√≤2%:†pü0ü•Ÿµíˆı≠ä¬0(∆"Oå˙5Våjœåﬁƒ-†c¢L	Ø¢¿ÍY±ú∏PˇºùQ9îÎÑn*–Éêaﬂ¶AêaÂ)‰◊_ó=oôBY¿≈.Dô.ˆ`âÅıêÅ∑¸*‚:ÓÌãäÅ|!“F÷3ËÿtåºˆÃ“Æ-KHòÕŒ;ÿ! åÿ±Ï˘ñj(cC∏Nº`¯3¿‡}ö2x˝ôAÉw|Å¨» åXq2∏rWa?∏ΩÁ$π^9√5Nÿ,òµgFå§03‹X‡Ü(S‡∆¬iw·¥ªp⁄ΩAß]‚%≠çœËπ+Ÿ¬qw·∏;l¸+p‹≠¢Í/›oólnì√ó{ªá«ª'/_LÂø25uùò{Ã|/ﬁ‚Îç|yqV^∆5qÉûc9†Z,º¢HãÏÅ‰Í$YF)ä7m…3F—◊±yƒ¨$ÄÁ_3`uπpkë´8rU¬i1èûˇí=∑æ!ì
hBoép6·Ÿ˚õÌ-„Êz˚¡}I€∏Ÿ±õ¿Ni
”≤∂)yE3Ü/AÜ∆ª-Îè6˜MÇ‘ÍÔÚ—¥Ù¶Æ†I#ˇ¿…≠Ò1K ÷È‡©ÎÑ!≥õÕ0bß¸ë;¸ØÍ÷ålº”8¡Œ’ÑAÅJî`:_¯ËRb—®˙0™>"˜¥Bpi•_ÜSs*cÜZdEH?Á
äÁ∏∞Ç vå›ƒıå ˜)k≠Àƒﬂëåì+4ÿàq[1êF«±Zˆ—aQs•Ω!¥§ˆhc2q~ÿ 6q™VÛ˜DA‡Ûõ´˜Wl÷[‚9|ÚÔƒ7Ü“ù,^˙—˛ﬁ…K“|”#Aó$}ÜdaÀlœ*hÅv@óMπ`ƒÖ‰mò`'8r¬¨˛IüyÏQõK3‰˙◊*jŒk ïØÆH∞IπlK!R†¯‹uπápv_’Ò.∞ü◊NÏtó'^“©˜˜ˇ~<eÌ°ª93#}î¢§vÄ¢Ωû∏ñ	˛hÏÅáıÍÑG’Ï∞≈≈mÆmr}+≥UpMK∂¶µBôD¬ÇΩ≤Ô[ )âG]:ıIè"∏ä,I]«MÚ+.q‡uoƒ\¶"¢q¢H¸(›Vöa
L∑ÅÅtqëZ´ruK¬EÍM)‘ÚÁF '`”Âÿ’Çö™Y9Ø©#	¡]E2◊äÑ/;◊:ˆ»È8¬k™z%\Aª ä.‚_Í’¯x‡€<}í%˙Gıu*Qê‹É^@@ç"G8,9È:^OF∫ëµ”Ë'Io//€4°∂6P¸¢i;^o≥Ñ–(È∑V€‘£üû≈∞&ﬁr¶sΩ[[Y€zá]Zk«ß=Y Í&;|rÊLÊªIluÙå(\‘¥;§Ûı≥˘ˆA9XÒh–˘ƒ‡ßGh4Ã;ré1!·.ÛQ≈Ò…„ I@Î9–ë‘%¶∑"¡[SÃ˛ÑµGm4U,Üj{1_y‹œ86£ñwµB¶ÏÒF≈±ã∂"ôzT|~hsŸ“àôv›v,“H(Ú@!ìÙƒ…iñlhÜé¬€T =M	B`§é˚:+Ñèr∆(G…’F£∞‰c14È©ÈeúD∆»Gõ^ÃB!ÈFïâ∆˙ ¬j¿ñeâ∑Ixﬁ⁄ö.ê‰e≥	l.§˛≈Åﬂ⁄~‡Ê$¬»ÿOà(†ds”XZjª<Y˘VT:è»Ùoi«i'ÒdWêtñ»˜§—nKPZß„lq{$⁄ÓÎ˝£c–vQkZ(ª’MÖ nQ)Wn•í¨‰/LIBÿòK8%ßh±©≈éü:	¸“\ﬁ‡
PÊ˜Èı3EsÈ.ó◊jÚÁVìsÌò‰˙Ú°&g¨ãÏ°TW§Ù€•5Á√òãˆÏ—Ûg#BπPÖS¢-Âﬁ1Ptá‡∆ï‚Í‘—k®˙E˝¶‚åRß™é8+4¨§äÜS€π[’f˝7àN3TËæy`—u:sf‰…Õ2Üø˙RÙEù≠yÆIêÉ^dØÁ4iäãa¸ =ù¶K„0Úz.:◊¨màlÚúzZı0ÂéXfT®7Hx—zÉ,˛ÌÃºH¥ZÙøÃ<gW¥íÉîµ"ïáìÑ/Hc†W•Ä®Ù™Î∞‰}M4ÇµèŸ.–Öˆ"Õ€ÍºCÀê°
Î{ô4ƒ÷VEﬂVGé◊ôu2ﬁŒMÑ ◊â!rEúüùΩ¶.Ÿ!w@ÅeØ≤´˝bâYÚ¨P•)ZZ“©öDZ]Ã;…¸”˙»ô‹qD∏®=ñ†¢€lÿ»NﬂÒ+”…;«n,qµ¿f^––Èo6ogÂ]NH¿≠≥˘zÑÄù2Ó—•nÃZØy◊{ÒÆo/˘@?¡X¨˛¯õﬂœ˛fê/ö5ßKö´1u˜·∑√˜¶éKœxØ’'x‰R]¡,÷yÓHﬁlhqhË∑∂»Ykuïƒ˝»Ò?¥V2/ÆVÊ√E8„gvñ`â{k-ˇ£ ]úπ–;—/[k++Ñ—òµÄ°i∞ic»nX¥‘˘Dô%Ò@5¥VÎ∫¸≤÷ë‹Á/t˚µ:ˆ&[Uû˝h¨õ:0<ÁU:9ZˇlE[Ïñ+Ê¨*'q◊™ﬂ⁄ZÿYZJãüÀ1ÓZ1¸éÜ˝ï¬“◊ÆπŒ,,ò9»xqâÿ≈ôÈ?4—@∏§∑Œ|•UyMıäkÌUit~,∫Q˛•'q f<48DàÒhHÄ≤>êàqΩŒ&ùí9ª^¶æºS8Ëx‘¿pB;Ò£∂„[nj≥∏Ÿ(ÍP¿D˜;bZã4·±~ó¶´ãjıÁÍ◊°hú’œE=–œ6õä`Æ$Ãt†=oU·ÊîÇ·∆`Kq‰¢˘Dñ◊ìwPC[òüæ†Ø1òÍSizC/åè˚˘’!¬øÒäF¿2Wd/ ¬·€Ö_ıƒ;ê2{áâ¶°¡æ*QŒê◊Oàs“’‘Ñó«∆=Ú√}@Æ˚?ò» ˙“û÷Ú™˜óæÃwª§>CZì¸ÊA3	ÉSãÉö{^)Í
Öb·Ïíc∆N*EÓÂßq†>Uå¢è	G«|‚àÇü·≈V?‹e’ â@
;çw¿î}iûr, ¥;?BÜwÄ¸ ﬁŒ¢H˝Vmí6œY7ºe∫æππ≈,ç(É<aVñã™‚ˆé4*õ'»SvQ‹ Dç]¶æøôÀO)km≠îö|T˚·uê_X¸òÒ}X`~/·rLËa∞Å)c«7‹z◊|N˝ﬂß‘OñüÓqë#uh–˝◊¸¥Rπåˆpô^óöVÔn…cŸB˜©±8XO¢‘J“T¥Æ√\;û‚Ãc£F≠YWÓyÓ˙ôzÉ´(¿8hßÅ£vg©T≠fQ¨Ê©¶4¢∂2ôµA>Wyî;, 0.X≤85h=HLéìà±ƒ,â+ º'„ËG™¡2≠ΩN6…Q 0K(;Ø®s>U’cÓÊc1D0™3K|,1j∞«©1…¿|VÖbê)ò–•¥6¬áà?e¬]πj!zÃ-˛Uô∏⁄ë∑=˙∏¶°ﬁrOXå E&6)dûπ„Ô≠Íh·é>Úhbœ$˙Ï∑WIRÙ¡Ã∞ß}ÄÀ;R≤ƒrçíù!ÓLá<Û¬cÙô
Ã§…πbêB˘R·Pc3æqBÎ£qfÌ}1ËQËÛm¬êˇ‰Ñ3A‘üA~ ÍZ[ »A≤¢É äüoX–9\ıPªΩ-`ïıW®ƒ¡Àı‡œÎ’zuéäÇD¶(¥¿ìº‹ûRÃ"©˚*q'kwäöœÉèÊ’ÆÙF√ñD¿ ã“Ñ‹å&∂Qƒé~‡ƒNƒ3˚EbW?\)*a≥àΩ?¢Ω ıìË¢9“.ƒh±ª˚î˜ˇÓR€£a≥Ò-(ª!?ﬁŸÏbÁ2˙îÔ˝Ë”èèn/ó‘Óùûfó:_—ôè7Ù≈ 8vˆÄÔåHf”B3 [ ¯¿ÂÎÀ7¶xWh£ÁÛ?_Qíˆ0Ë(ißNÛo”sÊuÇ4Í·ß«ÃÌ·’U¸{◊uô7¨`–zLc¸˚(∏†©«Z?˚~<à\Í€L4;¯ìùΩÃ≤™'Vp[_4ö&ëcıY„≠ zk†∑Ü@o–[üË?ﬂ∞rpH'IÌ€cÕ;¸ôÏ‘~ÈªsÂW#©∆Ünà≈œÌ$8ŒX¥Gc÷\"wvv»]ê·ÆŒÉx(‹µµûˆ©wâ<{élìªwçl&GÃ]á«!ı`© <ºX∂‡ó_ø¨äáΩﬁ›ËnÈº2è
Î	?JöØÅ‡~◊n =¸ﬁ-Cøº«_%¸˘ΩqúÚ{öW˝`¸’4;–ù¸-‡oÚï∑˛¶˙Y}‰âëó 8{ŒG·9%§ﬂ@ﬁUvÖB“Uérí°öÅ´§°zÿ-z¸+√≈cë-Õq—maË{p≈ÒQ"nìÔ$k¶¿{µ)%7q·ÚWO6+U∆ë£r&÷-®3É9#à3á∑y@õ¨Mi¶÷èÈ,∆V›7iÌ¿≥8Ê9|˚ïÓ<‘òB¶€é%õ5Z."å]ƒCXá‰eﬂ•¯6Ö∞wÃ@ÒÌh¯|©ô„®éB⁄SÊfÊ~Æ†ôû?∏ö≠´*[àö¡º†ßNO0†∑s+≤’ÖŸrÒû;ø¿¡à?ö«êF»k∫ òﬁó—õ¶nK	ù2Â0Oäï‹e¡]*À≠„.0è.ky4åç˚£ÖÒ|ôF/zz=¯â?y]8£U7dÅG>3:>HÒ
∞Kû‘h
ﬁ≥.†√úˇñx–pÍÍ•5ó	´áΩU9Ï{óÄ#-Ú;˘„v¥—ù$˛WñBO6ä',é°—è‰4¿ ÂÒê,ßz[§†≠Ì£yÃ"Z∂˜ bbºW6¡kIßAL"¸:Jé¡Ph<rê≈pk8¿úcŸåÖ™£!ΩïÅ,á@8ÃC%´<\S6ˆçı†”µlXsñ)ØRîπ¡”ó…ü6ôE˝S*?4tvw.Å4ˆ¯£G¨+∑Òêù;óÎ˜W‰œâxù;ó´õä'y\øıjaºÇ·"g¸ÕäÇ8ÓS'©⁄4Nãˇ9.{ú˘0J~!»È=âËHC™[EºÊÛ‡A®µj¸‚õÇ–Eáå‚õÃjÚ§p‹–k<:^’htº∆æoõur∏ıJ{dK‹Äì‘ï[´DîÇeååIZ¯¨Q≠X&q"Ü1",ÑBÂ$èß(ë;∂p'ø#fèº|9œ˜Rá˜f'Â¿·5÷ﬁX$ÖL4ú›€bøã°‹#˘¨j‹üÉ±WÚSıoãú·ıœ.rÜ/rÜœ)g8˙†8[˘˙Ié∫À“∫¢;Ô9¶ÙI˙É?yYj?óÇ≤2®H…(ÀUù∂Tf=a“⁄$U
è|∆czÅ™nâ‡“A79n%âøñ=ÏØO»˛ÒG7<ï*…e˜§Ÿ e9»Ò≈lG|r2ÂAÃè$Ï√Â˛zÌp>≥.ÑC<^_”
|åÿ¬Ä–1Â∂»G2∏"«/óˆ˜»∆
€%È†ÎuöJˇÖﬁm|[¨µ7	PèÃ„r˜’´w'œˆüÔóAN7 ÄS"Ã&ßEMòa¯◊rà6®7ô&…>»BEÙF_·®®åGÑˇb˛BüÊb|-Æúw]å™ô74?Ofô®YŸÃÈ¿((Iu4ˇ ïDøÇ	d®F©ÑUÄ´À˜^ÒπÂaŒ[ﬂéVÏΩºªz¡ÈîYå(Vå˘§d5%÷Tà%"èÕ7òkF+ÖMˆà‹Ö-="©ı.z‡å}/bt)ÚûâíÒˆª(SiU»eË◊ˇ”∑@ùg∆/öáÔ¢lÂÆ≤ÚB”^Jë2/¡À!»ﬁdK¸∂¿çÛ{Ä≥2Z¸à\L#tñœ4c(j≈e+sUè~yEk™Y4Ôõbôõ	ã∆jÁÏÅGËû«Ñ*ÉåIB*~íS)Ø’2móû:î~.°6Î¿#÷NÃLA˙ª≈¢ÏÅKbÂ’sî˛v¨¡üaCzÅ»\ecÉ¯}‡˜\∆ür|vúŒ“Ë≥KµOw_ÏΩ|ë…µ∞B3JµO≈Ár-4xìR≠x›T2m÷ÒL™-d⁄˘À¥‰Rm∂bôvT2ÌB¶˝≤eZy≤EQ0Â"ﬂ›i‰™£Ÿb D˛¥*ï∏(cÁïõ<L±»7ÿ RÏÃ<lÎ+ÿB÷FtmÈFrU'e¯çKˇ˘ä~ù≤ˇÅÎõà2ˇR€&I@û#«"y!MxZÏNê$Å'NÀøóŒ“/HuıiÅó¥∂F¸(O!ù[id\B,'4ò˙lm±∆Dú©%√ÇDmªï≠>Ã|ñ6≤63†‰¨£¨z§Ñù÷—π¢˜∞øqcUvT+^ùà»‡èƒΩ;∏≤@>A/lÀJô#S™∏Zµ!ıó™Tã\FÒp±Öé>ÁÃÆNµ˙•1úcPïùW}ƒ≥ Öø®}¥•0ubrLª4rH”yyL÷∂ñÓâ}î≈QŒÆWyåÊ¶À≥–Û¥¡Æ„≈t›¡ü–˘ìcJΩ>Mh¶Ka√k3]«…ˆ<Êß√«:4&ºÒ‡ *6zqaOÒÕ˘ú£(fù4«ﬂL˛˙/‰{Ú◊ø,µ…Î¡U‰t®Œ¸8≈çä©ππf(\_¶ßë‹±‘O‡Wl6	P8a†mu–j¿œWÏûË¸û^@ìËñì<Ö√C≤∞£ ^§ Öpä„¸…ΩrVê¢KÇ≥™ôo£2*Û¸0I‡lÂôh•yõãË¸=†Û˜'¡˜àŒﬂt÷J‚<Å'c/´_ÂRÖŒ}Y0Û"ØH√†ì•3f˝ò≥ìmÙø∂ù8tÈz‡K\|*¡gÜ\Ãµ|4sﬁ£.
¢ÅŸËE˘}@π◊¨‘dVü⁄µd|≤WvdÂâZ˜√Í	˜¿«KxYoK#ëZ∂j~ºå/|Î8°I?è{ädR°ôHe*≥EèˇÒ‹(Úz8ôªÆ”√¸dÙ=•üÂ¯ƒµÒùSAü$<~‹ŒûËp˚åπ°:—ó<Ñ≠î‡®◊ÿ\§'>ÈÂrbÊ-&æ«T*π ¯=Yﬁi^b•&õ ±®DŸΩÀV/uÏ)›¥+DÜ¬Úﬁ~ˇˆOˇıÒ,V∞{¯uˇX∏:C)Ä¸Ø,!OùD=¯EÊÑ$Y“…nÚŒùO 5ÚŒæBì>^∂ç®>wøÒ ¥3tX∏óoõyçπ∞%O:»≈ F|P‡y±2yà{!›ÇTÌ$>d([§Á“≥&bÓG9–πxdv.Õ¶¸rû|2Aá®öM'NZ6≥è∫$tÅÆ◊ÁHA∑UÜªpTÍ%JL(Rnè`GDrŸ •¬©J&SN'ìΩ¶›ÕgO\ÅAQC≠yõ%ñô>µÃ§ÎjvÒ§å<T«Ô-	á≥‚”˜e◊îDQ´ˇí	S§πO¯µÅhPﬁ{˝(ŒhÇå¯ΩwG	~yÑ…ÏkÚª^¢ ‘ñÒ‰-ÅFBΩ¡ü`◊≈„Õ‰ççfüLnÍa£◊?O{.^FzÍE Df›œïPâ2x∫¡ﬁRcú9Ääª√¥6©s
jñ.RXÛ|<Å¶‡¬´∞©¬sém·Ek˛ìÒ‰Í?(2Ûc^„ô@]˘ı!Q.œ`ggmÃÒ»Û;ˆÉ8—1ï>\∆ﬁœ6œóyzöJŒZ¯8OIkuw√˛ô„Ëπ£uÀò (¿≥FT)m¶qRaàã®,ü7»ùx`IÛ<2K
Y'e∂…sZ~çbYÏx)W7≤´ïu[(—Êm§7€ú\à7´´√õ£≈ô•T§˜J8ü‚r∆IåˆwY4¯ﬂÈ=¯	√)f 5ÊïﬂZ„ÉiI„·¸…Òº¡ïÌ¿H˘ì2âNπ◊zYÑbœânZQq*ÓÅ÷}|Äi⁄!¸.¡OÔ‰{ÚÜ‹ˆÉ≥¶F÷O—√Ùb–RE {Ò¶C∑í6Hú¡ﬂÒld\Qø 3ír:€Â>∑ºœÕaÔ5z‡Œb∂hfﬂ›‰Ω“ˆIµzÑàn|Ä0 @Rç1Ò∏«¿!ièµ°@bÕ˜<‡;±©ﬁ¡Ôx'ﬂ}{ôø˛”˚{D∑„)ZÁW	Ëàa⁄7‚Aˆ˙:ãIÀa'“hÚÛXYËÑ1z[ª=Œ 'ƒ¸ªwé≠ïµ÷ÈíÊƒ≤,%ÿMC+>g<1t—	_œ aØËé«â¢ùDé◊\*E^CgìâÓ÷?Ø;,ôáä~B⁄Ì∂ßóÈSî^N|mzú™Å{ª@˙M|“Àdj>óÕöß◊Ó'-™Gt˛ôUFSÕq”ldå:ëNÄ4uWVvÇÃtgy¶UûiÖ5W@s∑<∏faû4Á∑àà≈e¶wæÔ2œ»∆=Ú˜«/_¥A'p¸û”Ω{•^élçg2é5¥6ıñeám“àSŒ(5Û˜¢ºµMﬁÔˆpïr©s$	ÂáDÿË‡O1i>G°ÍXHÄ0#K‰˘ˆ≤Ë<˛Ò>aÕxi¨1_¥ﬂk%õ÷öMú©1Kg≥K›òô‘}	åé≈®˙' ÏƒÍì&ã¢mB˝=òÜÕ%Õ∆~1‘QyNrnBãá3ä©òAÉv€,#¶NwOò¯ÿÅû∏éZ"*ãC≠2¬˙2¸
≈s.≠gÅr#Ô}„GÁ±πñU0∑éª®ùµ∫ nåÚr◊{êÃv˜¯ﬂ˛È˛£†‹jq_ÔDDîÎæ£¨∞Ïè—Ï-5ÓcxÃØÓ±§ÿ_ÄYˇ…‚nŒ2ªyL±sKø‚ÿ©l·˝º« áµ„ÒÔ‚i}HQS∂ÇàœÏ•Ìçé˝—‰R¨§·.¨ºˇ£3>∂ºE;}xkº∞ıÛW,l˝[nÎÁ7råMu'yì)@ƒb◊#$=ö*‚x^√∏Ôä#
ìQnB7ç∫§Ñã¨
‚Ñ·≥sio`¥3üT(Èºpî1‘l4P%ΩgÔ“ÈW]é¬(8>›ƒè˘∫Â”"ò€—´»ƒM–¯c[©Àx∏l•!ﬁ¨B*0⁄·BX)˘æO;.[¬”?f∞ÿG’êÔbHD«EWL–‘‚ÑeK«EqòSJöù¬'>•˛0"Ëºü„·8ƒw≥ÕÚÁ>ﬂ°ƒ\!¿∞\åy:ÊÁÄÆÚ…èã«<BP*ªïÅòï‚•«∫]«> ÄYãcüÍ≤8ˆ)ó≈±œ‚ÿG^«>yY˚å=∏8ˆY˚»À‚ÿgqÏ≥8ˆ!ãcü€uÏì˜q7tæ‹Éüu’¡œH}‰Éi—–˘bNv_L(„w<>˚ôNU/kœs&˚üWuÉ‘Œb?ÛSP~£`h√π¥aüt\fø¬ﬂ≠‰EäÎˇIÀûchûPƒ ‚UTñ<~8r˘æ|:b≥SÊ!Jˆ#sˇ2^åˇZí‚Øq‡gO‡è¸)DøSáù=
≈Ï|[3'ä¿0¶«-”∂f‘ÒÒ\••rw˝√7ê¨!h
`_⁄]@∫9úªîèÿE÷Á#ËÁÛ‚2⁄g˜Ny´Íkw:†ˇﬂ˛{fdèàc9ÇÃ©lü+Ä_zˆ£å˜˘O&+OÚÃôÂí‚r7p…~Mflò[æﬂÀé5ãrßC–«à}lqkû}wœg¸ √JrY/‘^ò;6åú¡UBùH\UªKG…¬>◊)‰H%∂¸ %ô9ˇ&Ê5IÄ¯°ã–O˛â1™Qä—¯}ø‚˙«bBÅ.≤[˝€«ÙBúwó≈*ô›zVCˇ¥2‘ù∏l$èdî“t´k∂ölE ∑I„öåu‰‹f£7¡≥ )ò9/\EN‡<°¥^1€Ä<· ≥ª€&â¯åí`1K@0zá^R7≠DX™ìLüä†∫•±lyˆ;˝Lk´Üô∞d#¿¢ïë ãn≤ØkÀL qkìﬁ¯ü‹∫RË¡"rópï”V∑€mu$™%≤m¯yÊÑ¨UY∞πÇ,ÔPmV9©¯#-°Œ–4À¸¥&LCL(h^Œ‡˜Ñ<4f◊k^Np¡OK*-Nˆª∆ß˛ÒÊLúrz^©M&”ÚKSéiNê¶\sæ9Á4„ù∆¨√Äy(Ì°üôÅ®vÛ4Ld.lDáë‰/zDV•°UÎ5≤ıQ§Ì…∫N4z¬2}®ÑK◊Ö,∂µ∂µ∂µ@≈{»2+≤à≠˚dpÁ&≤íqLΩy’G#”jÌÀﬂëü:I¬∆rà∑…R+ê@JpÙÇT¨KcØO∑œMˆ∏…˛6€€¶˚⁄tOÎÔg£Ω¨πè%{¯Fˆ/¶›®#E…æ‚[srã»˜¨|ø÷Ó’áÀË6˘KeÖ;üx¶ÙEY»Äçﬂ*rîúÏÔ={q∞w∞˚Çì/O»·Àü~⁄B^ê„ì›ì}“|ıÛ„√É=Ú˙`ˇóW/èNéó*Z˙nπÿïÚii)È ∫À‚è‚_àÿô~Ä~◊Ì–í~ág†a⁄Xi•˛ò´NÀ• /≈««ß±9∆ﬂ0ëvBD·òúaöÌäÕ—A¢b,˘Yœ˝öQed9Lñ]^YÏ»·Óã'/~"«{G˚˚/*ê¯2K∂ë≈òF∏Ü0
à–®>ªÆ9≥Æ0	‹/ûÍ;z&w©Õ*—'={wyyÚ©JzØ1Ilp7Ú∫hõ˚´«=kÁnv~∆„§èGÌD¿∞>`Áƒ‚·â∞¯î‚⁄Zxâ^∫Ukπƒ„Í_¯›`‰ù˙√wX@é7EDäk.<\ÓØ÷ßfÍèkˆ◊Í<Ω˘¿Áàéã◊¡ÜcN	¿7ãâË0÷Åë1◊<u‹Z–ÎØ^]Dÿä≥|±ûõ˘°i6‚“Ò>¶roù·ÒüwŒ±¢fdx•â‚më‘'®}6ﬂ©àN∆5r\W\÷x≤ªè\aú;ﬁ¬¨l1H—Èo°3¸GÁ|ÖKAŸ9ôÌ9æì«Æ:à™3’⁄Dñü∫(è>9y˘Ç¨nì„Éü^ÏÓ?ﬂq"ß[≥Ã£◊_æ?&™»'wh¡∏È˘Ò5nŒQ˙˜∂S1¬Î%ÉDÚmΩêÁƒ¸‰˝à!9æôL}Ñrw≠…víœ0L>:^Ûˇå~_^]…=ßŒ•Ÿ∂áçã—Ø˝πƒW -ﬂ~[Ó…Úz9≠N›ÎÍ˝JIå$Û÷%Õ;ìì'˜±C˜Õâ*Õ$JÂtX≠PÈXxO*Î∆(ç˛œqdrèŸ"˛Á{
„¯˝‰$2b©Öû÷ÜÄ\…î*∞X0§±¯ÈπTîoÂ{aë∆Ôÿd¶V3/'…Cù…ÊÔ‡4’πuEaÌ8	¬W¸ù£âŒ-õj⁄÷uVùíƒE1q‘Ù`DL•∞‰C‘)|âÃæ‰î°á?é¡<…tR'D∫eT^GÉ+;u∑¢u|?•'cr∑–™õq+√õq#¡"&D‚?ÕãrèÉ¡ˇMPBB9·ƒ`Í‚Y–ΩÏ¬Á‡
EÉ”‡C; KÏ…f"N„ßﬁ9Eù´°N~5›€˙.Æ®Y£¯±1qıq»IAR—ÚÂ»∂~≈∆û2*º3πY’áƒe'JÙﬂ+™F£x,™]PAÇÄŒumæW´‰vêa«UØ⁄≠™9ˆπp{'ÃJ,]@Pu]uSwÉmn:„äéGπá°≥ç¨Õrí‡Ç©¸°ÙÜ†≈∆ÃôÅt6*≥±•ìk*o}nÔóHQÓ-ã¬k+õEj¯°ÜÍßÀU∑WÕ∆»Ñ‡=È[ª[T”‰S¡ﬁU“úö•i8∑jxô†—P)Rß–]sSª†ê Mñà_$íQ&‚“çî—  `JÈ·ˇ  ˇˇÏ][oIv~œØ®h'∂º©ª∆V¨ı“$5Ê%2$ÂôÖ1ÿií-±«Õnn_di4~∞2Ç	êóÊ%@¢<Á!Ô¸'˚≤?!ÁTıΩ´™´%Íb≠˚¡ñ®fwUù™s?ﬂ	'w•¨v—ﬁl*ñ≈ëå‚WÅ!†2Ã’Üz>˘ÕSÏÃ…wÕƒöG¥Yï^EHkÃpßP©˚té°∏˚ØUÜªJ«´43√ö˘û“∏{ƒ…3GºhØG+›|™ôææw·—mªªæjƒÀ†Vô
N¿âjJ_¢LuΩU±tØjµèVΩ71≠]–ÅXmCïN_ı!“¥£ƒmJwÂõXœﬂ`x˜AI[÷îc–	ñû√¶`w•ÅÒcˆ}lè|w7Ú⁄∞_mﬂ£ı¨√°⁄fõÅÆO‡·∫≥∑‘<€%›ZDï4∂^
mUÂ
x|!_Í± Ë¡±%6-`HÏ¥,ú1áÃô∂Ü}PlÇN(À àÜv√˘G '∂¯ƒ”ºscA,BçŒœÉnçlá1†8\ö˝äGÜ—‘≥ F≥ê°Î÷ÿûNµìk>~ƒÌÇjøãÖ#UÜïü@Ú!7?Öö6Ì“oËeÙ|ï±¬≈J%V∂Û‡§“kÍ8`ì£ûÏ¸c‹πñL@nEM¶ozHíO T˛∫T„õPÉ«˛ŒZ=Ïˆu·–7˘‡¯N8±G¥≤◊”<rj∏>º~—ú«©9z1æ1^•xâcøs˜.6’ŒBûÒh+âıSz ÃgCë˘‰"c7eí∑ı0V6¬2.õ°‡ú–Ü¥˝¯ÿ√à∑XN•tSIge*íèÕœ,èG,S‡.™—ä≤Òä´ﬂÒ∫R ØÎF;¬2 &I¥b-Î”IÔÿe%éZ‰¢≈§Pa5ÀB‰%Ö=Æã†wñ‹X.®l¨4∂D∑◊r¯&<àîX<+≠7&ô	±Z(oúÌï°qú©µr51¯ R)	:£û'eò«◊U≥,ﬂªJÍg∫H_B1®"·LíπºÔÙ!Ïô©ˇÇw?0<ÕÒ‹Øo≤LF,…;˜!“oÏíjÈ≥Œóﬂ'˘:V≥ì	ü´A(ïÖN∫"dÚÜPß9g:ÕÉR+√≥ÛòJ¬tßÿRÜ{(F†sF1[qËYÜçZÒÏ
íQt∑∫ ¶ôùú"OÌ‘´3G?ÖoË«öozrâç£±:waŸõ"F“£I‘DÛâÑ £‘YJ2áG∆^T“Z∂$
Ç€ªAe FEL˚ƒ∫)kH ÅaKwß°à™∫Mq‘ƒÚI≠<"ö§Ì;òôÊ3¥ N4±D
+,D´%¬§¸‰ë®¬*Û	z+˙Gız≥ﬂ'˚ùﬁÅb]NÄ[aÊ¶§<'”^ú)="~3´Ïƒ)ˆ’Ì3ìõö∂%ë—∫£Y»ßÃÓ∂Õ„]e}ÉLPò≤‚X&Sÿ“√ˇ≤±ª∑(3 2
´ˆDG≤>—GoÎÜ32ıÙ0w`î;K|ãOù3Uﬂjo‹© Õ˚ôíœ®Ü¯µ:†–ô ò¯ŸlíÚÃÎÊ»Ÿ°i√x–#ˆ•OIœ∞I}6¡8ÓWü å© n'ú^´A≠˙WÕË$p(∞è˘kZcëŒ(NTWb…;yáÖÑÀrH;\å&2gÀM∑m±1mWüˇß‰b1 ÿ©ÇGçß™â`ì¬^û†ÎQﬁJïÂ8
ò»|<5Nìé)»{¥ƒ{E∆¸xëò}ôF∞ÿÎI∑ï
L éì*¿¡ˆ‚6WìÀ®nï%&_:@Ã›¶€ú<AûH‚oî^PﬁÂ–ÚÆ«µ—»◊π’pbÉ≠ÑúÈ∂…A≠u8h÷ÎMRÔ4öÂ A±<’qÓ;WÆUB€!Vä‹1‰˘It∆Ç°∂œ‡Zu•|ª_®ıI] ◊=ph?T÷C+*Ò(Y˜íÙ‘±≠6Â•Œ(VNh¶æ»ZPﬂ.q‰gd.ïüô2)âì¥∆`ıAsÑ•Ñ≈√–æ∞ÍB,VK‘ç®äÙ5√≈>q?‹|Ñ†ˇx»Q ûcå_Ÿ"£âÅ>nQZæ0ó}ÆñËÏJ
I_Æ“Gﬁ¬Ä∑+-"∫√"ºofXêz^–4få?Ø‡äÈgÙ¯I Wä¢ÒoıÛΩ˙$ôô˙ë`=˝ÿ}CÔ˛Vv;säŒ` ÔÄS ºÜ¿€∫u‚Mˆ.÷eOúià<aÌ-ΩY´<˚ˆ◊R¸wú1ˆí CŒ˝€…ÓÇutIe(ïcŸÂ›ÄjÏãÀtŸV2Ò2ô∑L>úØÙÛÜ˝Œä#—;_†;8z£Ú*m‰¨1#'iB1Êd&¥‚åNí∞x#m€)>ŒòÖAµ\Ωr&ÿñˆNâI,å}=ë˚j˘'Œ@ò©#+ÀynôöÁÿÆôåÙóºÇF?^ﬂŒª$-2UêfWËe˚≤EhI»¸ˆ5◊#∞g⁄òåMú+•T@øt‚cÇˇ†.ÍV6C®™8ΩŸ`≤&‘û(Ñøƒµxc´º•c+ß	\ºY_!+dsÖl≠êÌ≤≥B>ßP∏œæe|ÿIª-åQ~*fü% üó”†$°°#VÖ≥≈√_§É©ßÓl¶+uãÅ≈E√&@DäF∑)ãNIK"•ƒ(õ.Ôç`ÉqÎ`“K– 9ODO∆e‘ôO¢ÔNÃıÈ›üÀ–TrŸ…E$éiJæ!&©ò†Õ„c}¢Xp9L4·π\ìú ª:ì7x≈‰Zª*°x°å	 πmã¶Î5…ZõÿKnjE(å˛¸C˝®◊Çˇ À›"˚EÈ„*∫2:ıÆPå0òÆç+aOﬂmúëÊYµÑ^p1s`Ô¿‚∞§ï¨R$<3¶à‚ºW{l›’ù5
`8vÏ–¿w*”1˘°ÚÆ∂ïJ£ã•(ù)ß£ç5HˆÎ^œ~“Ü4H˛!Xˇ\¡°ò⁄πH≠qniSX`äŸË¬t±óÃ∑ ¨∫C–ª:÷ú1{'a‡ly[Ú9}@Ü»c4+‡îªÊy´ù-›y58hÛ†!ˇ˚â75wI6V˛[l˝¢/œm¢√¬9+¡˛X!ñv∫†bÆê™eWD_§(Ÿ3òÕ.¡£B˛÷òRlÀÀNÛúphèœWéxÖ¸ ÅwsﬂÉ\V‰JFVŸª"êKv∂ÀÎWågUq'∫.ñ}Va=Öπ«pî
∑FHók7N¡¿4¨‚˚ÃJÑ¨,|‚YEıÓÏ¬•œuhÃƒ≈W9\j`œ<Ãs‡|5a.X«bl‘~ÿ:K s=Â7§ˆÌ+πã@á‚∞a(pái…ãQx0r‚ÍŸÁ]áIÈ‘4∑¿ZﬂJ« 1œ≥ys—1éœQéÅÉ"í+Ûj¨:—N1_µ5ù9~Óÿ'=&"À]g˛ﬂ„$ÓXÂ<Æ€ÿœ{E¯¡0ÆÏª∆"µø"Ω/£ÒΩ3,ÿ$U∫	¯P-º\Ãdh9’3é7ßvo“õ†¢86$J¸Sçêe˜puÓ∂-Ú¨3.‹&∆ø´á€HïDöER–∫)elk”,§-ÆÆ§*ÕÑ(œ Ë˜üÁk<"w‹5˝&M§ ˝Eã…9l<W2Ï:›]†Á∏û„è<§ágê⁄VÑ-À„‰ô◊∆W,x≥S.‡˝â„àÅmŸ=%”1®Î·ÆFÑ∆ê√J"à∑√i:p˝3Å@ljXï	V¨Â@≤´KµE{‰S@üWTÔ",s!Ô[ÀÂ»#@?cr(Ìf√PEÊã5öø…„Ö•2B‘xÓ∫∞:È9ÃÿÒ8;4·k† QÜiÜ˛qXé+Í“È)Bÿ¡d‹m[ú“ñ√¡-õ√!6ÛJE€XñJíGãbVº‘YÚ#Ã/Möíí¯Ûl (oB¢Ñä“CV§∞Zì;
ëuÃÛ8î“;öªâòÎ=Âë…ƒ¢ìyF)ŒŒüîD2ktÍGØ∂≥øﬂ™∑ömÓ‚w'Ê<Ã:;ÆuŒ∏™û·ôÇ}ƒè6ã7R&%+⁄RÇëÙÊˆÁzMÃŸßôÊàÃÖñ|*ImÕNŸ(ùÃ•æõ˘Å)
ÔÑ,ìòQßûÍû6÷<L%t	®»è≈π‘P⁄"ôêÕ:ä“lg++5Åñ¥æT nJ√ß<PŸDûûPe"µà˝ÂóüˇëºÍÙ:D˙«‰£ﬁk8w≠Œaπ'mi"SOR∑õ›`@Yu÷,aä˜i±ˇı?HØŸÖ3€áEÆc›˛·®yÁÀç˘êáÒ˛1/˘œ?ë¡Ô∫MÇ…t-ÿ„´d–9ÍŒ?‹˝í£fr`Pˇ¿ıV]¿/óE îÿ…‘Kõπ€#{<\Ê0bÌA?¸¬è?Ú¸†zV≈≠˘Ò„Â±$ØdíÖ¶3ÚF–Ûﬂ~1∆»?!∫áW¡˝Dino÷æÕ{iUN∏¶ºlV$à©˚DAû\=)‚T™m’m“ﬂóç≠=t—˝ZAóµmCÙ‘SG’H;“õ_:ÜnÚ±à
ÒìøœÁN∞›52x_g¯=Ÿ~oâÂ›®£êÙ·*VŸ[„<©8uIÏΩ@™CN5«@+\Ú⁄S˙⁄”‹kßˆX7ıRØŸãzmùUºózªn÷Ùˆ&F˝¯±Vr ›E†[j CÕ[– ^“<CD˛‹gíc-r-à∫Œ†Üª^%˝f50rPÄj÷èr∆e1>ıÛ…¶¥óLÅuƒwm2˜À∫$¯bd]®ËMLøˇª˛`˛«›`„¥^ˆZÌ6(©GΩ¢æ2ÉVò⁄Wdg±´’ u–‹zµ6z¢ç£ÑJZ‘Al≤©öê1I6àyí0I∂ò◊_äè#≥ã0!-ˆ¨˜ûËtBNb3°
W ~ëƒΩ≈´≤_Öæäjf∞ƒ∆Æí§/ZQCÉèÜ^á˛‘ı©>qœËE•Ì>2¯OÙ"TM§ ˚‘°≤J4Á˛=°Y†…ΩT∫™eOÅÎÊî¥Od$Ñ·ça
Ãì˚IΩ)›YàSQñ¬´QJ2Èc&0≤ßhiÜ£˜DëlÄjΩ6éfûÜge:`⁄4záÖ©∏VQw4Z~Ë[ÿäNÊ‰ïLÛF@^Ñ:ÏF¨ƒ’€≠¢æs˜HÅïPÊ‘¸¶€Ó¥®ﬂÓs&5ö¥πû¿_ ñÍì^«ªÍ‘≤'˙ŸÃ¥LØ∫\+ÚZHo£Ë>·ùU– m¨¯FZ5‡~á g01µ—d~ysúc⁄=›Q.Môh€#M‘pTeQnDg¥ß]â‹«Ï
l{É"Ïc"Ü‘Áó4àN∆ e§H˝wA94D:ºOîK_u0•—ŸãvZ€–W ∫H:2ttÌ--dT%"Mè∏ ˇ(÷ÎiaΩ˘†Ñuo~ybLuñö¨ç<_øo,öçåÖ}ñ:æQÑﬂ¯Ç,˝˘O?ì~Á®OÍÙËäæ≤˚Ußﬂ˛âè¿Ub´ÎTÀ;íŸı`O‹!€ﬂæg‰ÇÉ|<ø]f§ìZ¢+˘È-π|
„ı·í‚“·Äoâú≈kB≥w≥
Ãaø◊|ˆnb2GÄjÌZÔ†Ÿ_º©˚†•ÁÅ=ûˇò6A`óL}Áæò8A‘˙EæÊªX£ÄÙ'âGRé∂}Øàôâq¿Ë¬˜…âÆûŒ—.—¸±·Ö˝Óû€òÜ˙ÈRÛ^nÖ-G¥ŸV˝Ù&}L◊ï[UR´◊ÁÏ? IπÖíÚ∞—B/pü4këÓ—Àv´Në/∫É–‹LF3‡Ÿÿ
nèÇvÁ∑afå±éR'≥…πÀB#°ı6◊g€jàox•∏k€–ﬂØ$œıÏ}‚∑S√‰W®N‡Z\yÛqÂ∫g,I†ßKFö„Ÿ'é6õîQ/∑5oµmù»ƒÆOÍ Á¯©BÒNx≈îƒ8ùÁè”ƒ6mÎÑ}zV¸ËíÉ´`I$Xx≈Cπ¯é·`&∏MPå”‰≥x5”ﬁÿ˙ù6LÍ∏eKåz	˝6…çüI≠Õñ,ΩˇNL.ŸvËΩnˆdcÎ’ÍÁ_¶≤√í„ÔµËà;áπ¨pÆol°˚ËnµÙ`±#T∫\b~∂WÓ∂V:êØ˝&¢ÂJ´ûÿ%û‡˝ß∆◊∫˛I›{j|›l~’<lî¶FbÇ˜ö∞zò3Ê;)l1i¢Ö~Mê"¯‰6IÒ≤”ÉÛ–¸ÜeıJùç‘@
yµ¯ΩX(0s\ÚËëE¬Bñ¯ÚúÛÇ÷e,O|¶9Æ>Óè&.Ÿ#_ˆ;áU˙…rn<›»∞⁄£¿ ´9év^5\˙ˇr¸‚'≤©≤+æπjR–XÚ≤VÍkÆ=’ãÎÓbÔpÜ˚PkÁHÜ‡ßƒõãz ;!…€“‡%≠åI^%Ïó©j3π6_ΩZ—®ød*7!ì+…O≈¯1Ò∫É»*c-TÉ£;E®ŸR÷(°Mq¯âMH±D›—Ñn≤båœv	òEC›)—j0¨¨Mÿ˝ÒG˛nQå˙≠©ıŸƒ+ÿnk¢÷¥0™-“Œ˚¿<‰·îﬂ ZÔ"Tà÷Æ¿∏Í˙Cˆ˚Ú⁄
Ÿ|¢>âÍ˜∂a-/≠ê%≈Œã%éYx”Ï≈∂«R|ÌÏïÖ“à‡Ì‹È.˝Ÿ±ﬂ·œYLè¨∑f¨π}úØÊÜ«{ªlHP¶B?Ñü⁄¸Öó⁄Êgﬂ‘tı©Q¶‡û]D{=Ÿ-3&eŒêöE…¡·°8÷ù)n4˝¿†L®o∑ƒ{s´«kRSrÈ¢bœ´€±‡‘Ω'ï"IÚ†∂Hãû¥zç'·êj«¸n€÷?´ÏÍóﬁ'(‡wNÂÑU2c–ÿ∞|€w∞®âá›∆™ñyIŸ(5AéF¢&`ﬁ+çXÒÕJ∑L6ú˜d§y£	¡ûÚÜ
 ¬˚'|ª‚@HÄæNëßªFË‘^∂õÍq9>…√'£∫ Ü˙[˝—¥M=,æ7˘êDf‘ U6”} Wwd¸˘dKV…©G≠Å3êÕÄc WƒeT)(ˆSˇÂó˚âÃ?¥õıAØ” =Çﬂ∫G≠~ìbukQîá∆y∂$˝ƒÀGªxﬂä≥µ)" $êá
ÿ¨¿˙ú‚‹l€"J(Ñ˘≤yDèìÎ]kµ<‹é‰:3¬E`yƒ◊+æ/‰h/Ç*}L≤(º9óÑë¨Àó≥Yaø†ËÜ¢¿@Äï©`ÊNYg˚k7∏óuêäØvgPÏ—
®ÿSU.í1/¶ÑB^E0%È¨$Ú‘V™ãê`]ZÅUf≈÷"ÈAÂzJ]√Ûi-Lb°hZnœˆOÙ%t/¶†©£1ßÛ…|†·Uét¿ÜÙÈ,3∞[ß`·-rø)Ω„¡s}ÿæçVm–C`,≤‹<‹Ø˙r◊»ù˝Æ*ﬂÔ^üÔweÿG…ãVòπ≥˘Â»86Êódï‘ÜÆnyª¸ìÿ ∑#6∫üƒÜöÿËﬁW±qTW˙sA®LƒÈìY»π¿,¸gRo∂€GÌ&©µ[h“íp`Ω›V[ò/ˇ…(ºÇz≤›©ìóµ¡†Ÿk5I∑◊:¨∑∫5>prô•+Ÿã êåüQCå˝5ÀdJ ªÃ!1ÓØXû®øö®@<ßûªp©≠“˝í…wGº{a»‚Ìï·Â*˚U ÔÖºÖÂ@dõŒ…;∫ÜW]©Gëo Ü©≥ yÍ7¨©⁄]±àØƒ¶µ}â§ùD¸ˇ˝ﬂ-`
*{5◊6j#”m1›öG‘.ËU,Ëq¨$
)…Ü&l©•; R‡4•eyÀ2<!œ…∆∂Rtã•˝9vïG°∏€ıë‰èW√dıì U1—á©¯ã*¸ùvı„ıÎÀ_A˜µÔ>+8:π˛júëLÿ2õ]∑auI˛$vNë<fT¬fçLüv”¨1˛zl;Sî#™1D≈V≈“&ôè7–R≠PÌπ˜Ì*@Ú€≤ÊΩjHÚÏjÄ.÷Í£m◊hb∏vø”;hÊ»~Î∞÷á¶
À<TÀÏ®∑Ì«⁄énPXWGºTóhd~â‚3êöƒıb>÷-Wü"‡“X&F]∞¯ü·˜µÊ"ÍÒÊö_Úq¬ŸdÖfK©äA?ªlãîTc8πRQ§ß“√œ`ÀœŒS’´Qä∏`dÇMñ‹ó¬+âhÇ+≠óÅ4)WÉ•çí.wÈk7!˛íΩ™œe≠¨∑•„™©Ìíu)Ã1{^®§‘'˙Ëm›pFp RzßÔ‰é†ÔdÊëÙºw–£J}AáÕ6YFÛâö^'˚{qŒUÒ¨k¶Óx«–¨…º£ñdaè·ôo∫∫ÚPÃú~≥˜∫ÊÎÚ!BB.pÆ∑}e·;†¯ú#Õ$}
úÎ;î◊R ]UÅ;Û*;9/Öœ(◊©Û4‰}Î©Ú<UqQÆÈ]µD¯≠–Ù£æÑ¨Èß‘˛ã]˘Âﬂ˛øˇ˝ÚE≠W;¥ö¥§:’>Á‚Vˆ‚}mË Å)E«èm«8¡z±B◊À¢|T1Ø;NdíYÀWd˛k≠5Ñ˙BcÃ3Óf=+z˝ùÆ«k{˜†BDQâÊˇÉÕ>).öπÄÖQŒpéWŒíeËé~†aÔTãRÍFW®î"«‰àB/¬‡Î∑Ãh˛¸ßüêœ0(_,õK˜ËzDÍµ˙´Ê5∏Mû˚oÄ|]óYT∫%wée{IÕ`ÿGéY¨ï≥˝ré†I≤ÌÏõıçµ†OdËπƒvê≈¶_4czRÏ<pF{¢˘ªs∆˛Æ¢˘ûMÏ·˜ ∂+ßÜLœË«≈˛ÕÙˆñ∫éÓüxl$:ó¢ô9∫”µMctæ∑dŸï£¢/_◊W°†1f∂F¥\õ‚nD˘pøà∑tÆÅU‚X€ºÒkeô™T∏ª^3(LàŸ[ÿ2ÆπÇWØJVà.¶Ø¨~ëSPXä+»ö˙Öó
¡uètBj0)µƒ˛D@˜u∞Ch≤“Ç%ë∏ı0ˇπzñ◊ü˘çÄ´
8∂mO≠Ò(7ûJìº–– £nÑ›¿6(•y˝ES4+%Î:´s‘ºå´5πŒ•cÕ`\ﬂçd>û_ûj&ã &¿{@ï4w~©Á}HBã€±?H…’?wÅ#UL„-’ÿégä∞|6+v» [‡9:òt#ﬂ‘rÜ‹hXÔÇoı¢ªrù#rﬁ+„ÿ°aπ∫W°|í˙V∑∂…˛;ˆ>Òj*‚ô?¿Ü¿Î[¬i6À¸J.≠›®X∂ïe¬0cöß[∫{ƒLπÖ‚8Ãõı- ï®ÿüéI–}~vl®“mGI?öÂ6◊À36ëL√©_Ô¬[^öˇìßªïS€w…¯àrÍ©ÑL€phC◊7N˝lpS#ßË9p&Ç±œ¨Ktèå`_Z∫Êüë¸t
œÉ˝é˚>J’}ß∫îº=Àse&t;j√o‚·Á%Û<˙û«E‰ˆŒgHA˙gû¬`[uP,ﬁÓ]0ƒÿ{}ÓÊ]>÷LWÁ
¥§¢zDE(ÀÕbÙô†F∏øÜÊY(πÿÆ H∑Ä¿Ò>⁄§ÙNGÙÇ˝ÊNÛs‚1*$;ı<%êlqndQı3}‰{:Úã^í]|ƒÀà‘Àx5^ú˚<˙$Ó˚ø˘   ˇˇ ùÍ	