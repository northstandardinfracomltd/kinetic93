import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, BarChart3, Calendar, Trash2, Upload, Eye, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { SupportTicket, Member, Client, CompanyInfo, CommercialEvent, SupportMessage, CommercialFileAttachment, getTenantSpreadsheetUrl, openTenantSpreadsheetUrl } from '../types';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { SearchSidePane, SearchSidePaneItem } from './SearchSidePane';
import { INITIAL_TICKETS } from '../utils';
import { sendScriptEmail, getActiveTenantCommercialName } from '../utils/emailService';
import { fetchCollectionFromFirestore, saveCollectionToFirestore } from '../firebase';
import { fetchGoogleDriveStatus, uploadFileToGoogleDrive } from '../utils/googleDrive';

export const getWeekNumberString = (dateStr?: string): string => {
  if (!dateStr) return '';
  let d: Date | null = null;
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      d = new Date(year, month, day);
    }
  } else if (dateStr.includes('-')) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d) return '';
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `S${weekNumber}`;
};

export const formatDateDisplay = (dateStr?: string): string => {
  if (!dateStr) return '—';
  const trimmed = dateStr.trim();
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  return trimmed;
};

export const CRITICITE_OPTIONS: Array<{
  value: 'Urgent' | 'Semaine prochaine' | 'Ce mois' | 'Mois prochain' | 'Non renseigné';
  label: string;
  color: string;
}> = [
  { value: 'Urgent', label: 'Urgent', color: '#ce293e' },
  { value: 'Semaine prochaine', label: 'Semaine prochaine', color: '#de5815' },
  { value: 'Ce mois', label: 'Ce mois', color: '#8944af' },
  { value: 'Mois prochain', label: 'Mois prochain', color: '#235dbe' },
  { value: 'Non renseigné', label: 'Non renseigné', color: '#38917a' },
];

export const getCriticiteColor = (crit?: string): string => {
  if (!crit) return '#38917a';
  const c = crit.trim().toLowerCase();
  if (c === 'urgent') return '#ce293e';
  if (c === 'semaine prochaine') return '#de5815';
  if (c === 'ce mois') return '#8944af';
  if (c === 'mois prochain') return '#235dbe';
  if (c === 'non renseigné' || c === 'non renseigne') return '#38917a';
  return '#38917a';
};

const AutoResizeEventTextarea: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 38)}px`;
    }
  };

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onInput={resize}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      placeholder={placeholder || "Entrez un compte-rendu ou commentaire..."}
      className="crm-event-textarea"
    />
  );
};

export interface CrmColumnConfig {
  id: string;
  label: string;
  category: 'Commercial' | 'Non Commercial';
}

export const CRM_CONFIGURABLE_COLUMNS: CrmColumnConfig[] = [
  // Commercial (20 configurable columns + Actions always visible)
  { id: 'ref_comm', label: 'Référence.', category: 'Commercial' },
  { id: 'sit_comm', label: 'Situation Ticket.', category: 'Commercial' },
  { id: 'ouv_comm', label: 'Ouverture.', category: 'Commercial' },
  { id: 'famille_comm', label: 'Famille.', category: 'Commercial' },
  { id: 'sitdevis_comm', label: 'Situation Devis.', category: 'Commercial' },
  { id: 'typeclient_comm', label: 'Type Client.', category: 'Commercial' },
  { id: 'cli_comm', label: 'Client.', category: 'Commercial' },
  { id: 'cp_comm', label: 'Indicatif Postal.', category: 'Commercial' },
  { id: 'lead_comm', label: 'Origine Lead.', category: 'Commercial' },
  { id: 'interloc_comm', label: 'Interlocuteur.', category: 'Commercial' },
  { id: 'tel_comm', label: 'Téléphone.', category: 'Commercial' },
  { id: 'email_comm', label: 'Email.', category: 'Commercial' },
  { id: 'datedevis_comm', label: 'Date Devis.', category: 'Commercial' },
  { id: 'montantht_comm', label: 'Montant HT.', category: 'Commercial' },
  { id: 'typevente_comm', label: 'Type Vente.', category: 'Commercial' },
  { id: 'desccourte_comm', label: 'Description Courte.', category: 'Commercial' },
  { id: 'derrelance_comm', label: 'Dernière Relance.', category: 'Commercial' },
  { id: 'prorelance_comm', label: 'Prochaine Relance.', category: 'Commercial' },
  { id: 'datecde_comm', label: 'Date Commande.', category: 'Commercial' },
  { id: 'collab_comm', label: 'Collaborateur.', category: 'Commercial' },

  // Non Commercial
  { id: 'ref_noncomm', label: 'Référence.', category: 'Non Commercial' },
  { id: 'ouv_noncomm', label: 'Ouverture.', category: 'Non Commercial' },
  { id: 'sit_noncomm', label: 'Situation.', category: 'Non Commercial' },
  { id: 'cp_noncomm', label: 'Indicatif Postal.', category: 'Non Commercial' },
  { id: 'cli_noncomm', label: 'Client.', category: 'Non Commercial' },
  { id: 'objet_noncomm', label: 'Objet.', category: 'Non Commercial' },
  { id: 'collab_noncomm', label: 'Collaborateur.', category: 'Non Commercial' },
];

interface CrmTabProps {
  tickets: SupportTicket[];
  members: Member[];
  clients: Client[];
  companyInfo: CompanyInfo;
  tenantId?: string;
  onSaveTickets: (updated: SupportTicket[]) => void;
  onRefreshData?: () => Promise<void> | void;
  isRefreshing?: boolean;
  t: (key: string) => string;
}

export const CrmTab: React.FC<CrmTabProps> = ({
  tickets,
  members,
  clients,
  companyInfo,
  tenantId,
  onSaveTickets,
  onRefreshData,
  isRefreshing,
  t
}) => {
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketCategoryFilter, setTicketCategoryFilter] = useState<'Commercial' | 'Réclamation' | 'Technique' | 'Sans Catégorie'>('Commercial');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'Tous' | 'Nouveau' | 'En cours' | 'Terminé'>('Tous');
  
  // Selection state for rows
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [isSendingRelance, setIsSendingRelance] = useState(false);
  const [isRelanceDropdownOpen, setIsRelanceDropdownOpen] = useState(false);
  const [selectedRelanceTemplateIdx, setSelectedRelanceTemplateIdx] = useState<1 | 2 | 3>(1);
  const [relanceBannerMsg, setRelanceBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Column visibility & session ordering state
  const defaultColOrder = useMemo(() => CRM_CONFIGURABLE_COLUMNS.map(c => c.id), []);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('crm_table_column_order');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const validIds = new Set(CRM_CONFIGURABLE_COLUMNS.map(c => c.id));
            const filtered = parsed.filter((id: string) => validIds.has(id));
            const missing = CRM_CONFIGURABLE_COLUMNS.map(c => c.id).filter(id => !filtered.includes(id));
            return [...filtered, ...missing];
          }
        }
      } catch (e) {}
    }
    return CRM_CONFIGURABLE_COLUMNS.map(c => c.id);
  });
  const [tempColumnOrder, setTempColumnOrder] = useState<string[]>(columnOrder);
  const [draggedColId, setDraggedColId] = useState<string | null>(null);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('crm_table_hidden_columns');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const validIds = new Set(CRM_CONFIGURABLE_COLUMNS.map(c => c.id));
            return new Set(parsed.filter((id: string) => validIds.has(id)));
          }
        }
      } catch (e) {}
    }
    return new Set();
  });
  const [tempHiddenColumns, setTempHiddenColumns] = useState<Set<string>>(new Set());
  const [isColumnVisibilityPaneOpen, setIsColumnVisibilityPaneOpen] = useState(false);
  const [columnFilterScope, setColumnFilterScope] = useState<'Actif' | 'Commercial' | 'Non Commercial' | 'Toutes'>('Actif');

  // Manual refresh state
  const [isLocalRefreshing, setIsLocalRefreshing] = useState(false);
  const effectiveRefreshing = Boolean(isRefreshing || isLocalRefreshing);

  const hasCrmSpreadsheet = Boolean(getTenantSpreadsheetUrl('spreadsheetCrm', companyInfo));

  const handleRefreshCrmClick = async () => {
    if (effectiveRefreshing) return;
    setIsLocalRefreshing(true);
    try {
      await Promise.all([
        onRefreshData ? Promise.resolve(onRefreshData()) : Promise.resolve(),
        syncCrmSettingsFromSpreadsheet(true),
      ]);
    } catch (err) {
      console.warn("Manual refresh error in CRM:", err);
    } finally {
      setTimeout(() => setIsLocalRefreshing(false), 500);
    }
  };

  const toggleColumnVisibility = (colId: string) => {
    const targetCol = CRM_CONFIGURABLE_COLUMNS.find(c => c.id === colId);
    if (!targetCol) return;
    setTempHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        // Enforce minimum of 4 visible columns in this category
        const categoryCols = CRM_CONFIGURABLE_COLUMNS.filter(c => c.category === targetCol.category);
        const currentlyVisibleCount = categoryCols.filter(c => !prev.has(c.id)).length;
        if (currentlyVisibleCount <= 4) {
          return prev;
        }
        next.add(colId);
      }
      return next;
    });
  };

  const orderedConfigurableColumns = useMemo(() => {
    const map = new Map(CRM_CONFIGURABLE_COLUMNS.map(c => [c.id, c]));
    return tempColumnOrder.map(id => map.get(id)).filter((c): c is CrmColumnConfig => Boolean(c));
  }, [tempColumnOrder]);

  const activeOrderedColumns = useMemo(() => {
    const map = new Map(CRM_CONFIGURABLE_COLUMNS.map(c => [c.id, c]));
    const ordered = columnOrder.map(id => map.get(id)).filter((c): c is CrmColumnConfig => Boolean(c));
    const cat = ticketCategoryFilter === 'Commercial' ? 'Commercial' : 'Non Commercial';
    return ordered.filter(c => c.category === cat && !hiddenColumns.has(c.id));
  }, [columnOrder, ticketCategoryFilter, hiddenColumns]);

  const visibleConfigurableColumns = useMemo(() => {
    if (columnFilterScope === 'Commercial') {
      return orderedConfigurableColumns.filter(c => c.category === 'Commercial');
    }
    if (columnFilterScope === 'Non Commercial') {
      return orderedConfigurableColumns.filter(c => c.category === 'Non Commercial');
    }
    if (columnFilterScope === 'Actif') {
      return ticketCategoryFilter === 'Commercial'
        ? orderedConfigurableColumns.filter(c => c.category === 'Commercial')
        : orderedConfigurableColumns.filter(c => c.category === 'Non Commercial');
    }
    return orderedConfigurableColumns;
  }, [columnFilterScope, ticketCategoryFilter, orderedConfigurableColumns]);

  // Fit View / Unzoom feature like DefibTab
  const [isTableFitView, setIsTableFitView] = useState<boolean>(false);
  const [tableFitScale, setTableFitScale] = useState<number>(1);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const naturalTableWidthRef = useRef<number>(1650);

  const calculateFitScale = () => {
    if (!bottomScrollRef.current) return 1;
    const clientW = bottomScrollRef.current.clientWidth;
    if (clientW <= 0) return 1;
    const naturalW = naturalTableWidthRef.current || 1650;
    const scale = Math.min(1, Math.max(0.15, (clientW - 10) / naturalW));
    return scale;
  };

  const toggleTableFitView = () => {
    setIsTableFitView(prev => {
      const next = !prev;
      if (next) {
        setTableFitScale(calculateFitScale());
      } else {
        setTableFitScale(1);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!bottomScrollRef.current) return;
    const updateWidth = () => {
      if (!bottomScrollRef.current) return;
      const clientW = bottomScrollRef.current.clientWidth;
      if (!isTableFitView) {
        const sWidth = bottomScrollRef.current.scrollWidth;
        if (sWidth > 500) {
          naturalTableWidthRef.current = sWidth;
        }
        setTableFitScale(1);
      } else {
        const naturalW = naturalTableWidthRef.current || 1650;
        const scale = Math.min(1, Math.max(0.15, (clientW - 10) / naturalW));
        setTableFitScale(scale);
      }
    };

    const timer = setTimeout(updateWidth, 60);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(bottomScrollRef.current);
    window.addEventListener('resize', updateWidth);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [isTableFitView, tickets, ticketCategoryFilter]);

  // CRM Date Range Filters (Filtre Date Début et Filtre Date Fin)
  const [crmDateStart, setCrmDateStart] = useState<string>('');
  const [crmDateEnd, setCrmDateEnd] = useState<string>('');
  const [clickedPill, setClickedPill] = useState<string | null>(null);

  // CRM Filtres Side-pane state
  const [isFilterPaneOpen, setIsFilterPaneOpen] = useState(false);
  const [filterCollaborateur, setFilterCollaborateur] = useState<string>('Tous');
  const [filterCriticite, setFilterCriticite] = useState<string>('Tous');
  const [filterSemaine, setFilterSemaine] = useState<string>('Tous');
  const [filterSituationDevis, setFilterSituationDevis] = useState<string>('Tous');

  const [draftDateStart, setDraftDateStart] = useState<string>('');
  const [draftDateEnd, setDraftDateEnd] = useState<string>('');
  const [draftFilterStatut, setDraftFilterStatut] = useState<'Tous' | 'Nouveau' | 'En cours' | 'Terminé'>('Tous');
  const [draftFilterCollaborateur, setDraftFilterCollaborateur] = useState<string>('Tous');
  const [draftFilterCriticite, setDraftFilterCriticite] = useState<string>('Tous');
  const [draftFilterSemaine, setDraftFilterSemaine] = useState<string>('Tous');
  const [draftFilterSituationDevis, setDraftFilterSituationDevis] = useState<string>('Tous');

  const activeFiltersCount = (
    (crmDateStart ? 1 : 0) +
    (crmDateEnd ? 1 : 0) +
    (ticketStatusFilter !== 'Tous' ? 1 : 0) +
    (filterCollaborateur !== 'Tous' ? 1 : 0) +
    (filterCriticite !== 'Tous' ? 1 : 0) +
    (filterSemaine !== 'Tous' ? 1 : 0) +
    (filterSituationDevis !== 'Tous' ? 1 : 0)
  );

  // Side-pane drawer state
  const [isPaneOpen, setIsPaneOpen] = useState(false);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [isSettingsPaneOpen, setIsSettingsPaneOpen] = useState(false);
  const [isPerformancePaneOpen, setIsPerformancePaneOpen] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Performance Pane State: date range and employee
  const [perfStartDate, setPerfStartDate] = useState('');
  const [perfEndDate, setPerfEndDate] = useState('');
  const [perfCollaborateur, setPerfCollaborateur] = useState('Tous');

  // Settings: Texte de l'email de relance (Modèles 1, 2, 3)
  const activeTenant = tenantId || (typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') : null) || 'demo';
  const defaultRelanceTemplate = `Bonjour {Client.},\n\nNous nous permettons de vous relancer concernant notre proposition commerciale {Référence Devis.}.\nVous pouvez consulter les pièces du dossier ici : {Lien Stockage Partagé Devis.}.\n\nRestant à votre entière disposition pour tout renseignement complémentaire.\n\nBien cordialement,`;

  const [relanceEmailBody, setRelanceEmailBody] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_relance_template`) : null;
    return local || defaultRelanceTemplate;
  });
  const [relanceEmailReplyTo, setRelanceEmailReplyTo] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_relance_replyto`) : null;
    return local || '';
  });

  const [relanceEmailBody2, setRelanceEmailBody2] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_relance_template_2`) : null;
    return local || defaultRelanceTemplate;
  });
  const [relanceEmailReplyTo2, setRelanceEmailReplyTo2] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_relance_replyto_2`) : null;
    return local || '';
  });

  const [relanceEmailBody3, setRelanceEmailBody3] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_relance_template_3`) : null;
    return local || defaultRelanceTemplate;
  });
  const [relanceEmailReplyTo3, setRelanceEmailReplyTo3] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_relance_replyto_3`) : null;
    return local || '';
  });

  // Settings: Modèle initial email de support technique
  const defaultSupportEmailSubject = "Suivi de votre dossier {Référence.}";
  const defaultSupportEmailBody = `Bonjour {Client.},\n\nNous faisons suite à votre demande concernant : {Objet.}.\nNotre service technique a bien pris en compte votre dossier référence {Référence.}.\n\nRestant à votre entière disposition pour toute information complémentaire.\n\nBien cordialement,`;

  const [supportEmailSubject, setSupportEmailSubject] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_support_subject`) : null;
    return local || defaultSupportEmailSubject;
  });

  const [supportEmailBody, setSupportEmailBody] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_support_template`) : null;
    return local || defaultSupportEmailBody;
  });

  const [supportEmailReplyTo, setSupportEmailReplyTo] = useState<string>(() => {
    const local = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_crm_support_replyto`) : null;
    return local || '';
  });

  const [isSavingRelance, setIsSavingRelance] = useState(false);
  const [isSavingRelance2, setIsSavingRelance2] = useState(false);
  const [isSavingRelance3, setIsSavingRelance3] = useState(false);
  const [isSavingSupport, setIsSavingSupport] = useState(false);
  const [relanceEmailError, setRelanceEmailError] = useState('');
  const [relanceEmailError2, setRelanceEmailError2] = useState('');
  const [relanceEmailError3, setRelanceEmailError3] = useState('');
  const [supportEmailError, setSupportEmailError] = useState('');

  const isValidEmailAddress = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  };

  const crmSettingsSheetUrl = getTenantSpreadsheetUrl('spreadsheetReglagesCrm', companyInfo);

  const applyCrmSettingsObject = (settingsObj: any) => {
    if (!settingsObj || typeof settingsObj !== 'object') return;
    if (settingsObj.relanceEmailBody !== undefined && String(settingsObj.relanceEmailBody).trim() !== '') {
      setRelanceEmailBody(String(settingsObj.relanceEmailBody));
      localStorage.setItem(`defib_${activeTenant}_crm_relance_template`, String(settingsObj.relanceEmailBody));
    }
    if (settingsObj.relanceEmailReplyTo !== undefined) {
      setRelanceEmailReplyTo(String(settingsObj.relanceEmailReplyTo || ''));
      localStorage.setItem(`defib_${activeTenant}_crm_relance_replyto`, String(settingsObj.relanceEmailReplyTo || ''));
    }
    if (settingsObj.relanceEmailBody2 !== undefined && String(settingsObj.relanceEmailBody2).trim() !== '') {
      setRelanceEmailBody2(String(settingsObj.relanceEmailBody2));
      localStorage.setItem(`defib_${activeTenant}_crm_relance_template_2`, String(settingsObj.relanceEmailBody2));
    }
    if (settingsObj.relanceEmailReplyTo2 !== undefined) {
      setRelanceEmailReplyTo2(String(settingsObj.relanceEmailReplyTo2 || ''));
      localStorage.setItem(`defib_${activeTenant}_crm_relance_replyto_2`, String(settingsObj.relanceEmailReplyTo2 || ''));
    }
    if (settingsObj.relanceEmailBody3 !== undefined && String(settingsObj.relanceEmailBody3).trim() !== '') {
      setRelanceEmailBody3(String(settingsObj.relanceEmailBody3));
      localStorage.setItem(`defib_${activeTenant}_crm_relance_template_3`, String(settingsObj.relanceEmailBody3));
    }
    if (settingsObj.relanceEmailReplyTo3 !== undefined) {
      setRelanceEmailReplyTo3(String(settingsObj.relanceEmailReplyTo3 || ''));
      localStorage.setItem(`defib_${activeTenant}_crm_relance_replyto_3`, String(settingsObj.relanceEmailReplyTo3 || ''));
    }
    if (settingsObj.supportEmailSubject !== undefined && String(settingsObj.supportEmailSubject).trim() !== '') {
      setSupportEmailSubject(String(settingsObj.supportEmailSubject));
      localStorage.setItem(`defib_${activeTenant}_crm_support_subject`, String(settingsObj.supportEmailSubject));
    }
    if (settingsObj.supportEmailBody !== undefined && String(settingsObj.supportEmailBody).trim() !== '') {
      setSupportEmailBody(String(settingsObj.supportEmailBody));
      localStorage.setItem(`defib_${activeTenant}_crm_support_template`, String(settingsObj.supportEmailBody));
    }
    if (settingsObj.supportEmailReplyTo !== undefined) {
      setSupportEmailReplyTo(String(settingsObj.supportEmailReplyTo || ''));
      localStorage.setItem(`defib_${activeTenant}_crm_support_replyto`, String(settingsObj.supportEmailReplyTo || ''));
    }
  };

  const syncCrmSettingsFromSpreadsheet = async (force = false): Promise<any | null> => {
    const resolvedUrl = getTenantSpreadsheetUrl('spreadsheetReglagesCrm', companyInfo);
    if (resolvedUrl) {
      try {
        const res = await fetch(
          `/api/sheets/sync?tenantId=${encodeURIComponent(activeTenant)}&tabType=reglagesCrm&spreadsheetUrl=${encodeURIComponent(resolvedUrl)}${force ? '&force=true' : ''}&_t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json?.items) ? json.items : [];
          if (items[0] && typeof items[0] === 'object') {
            applyCrmSettingsObject(items[0]);
            return items[0];
          }
        }
      } catch (err) {
        console.warn('[CRM] Error syncing reglagesCrm spreadsheet:', err);
      }
    }
    try {
      const data = await fetchCollectionFromFirestore<any>('crm_settings', activeTenant);
      if (data) {
        const settingsObj = typeof data === 'object' && !Array.isArray(data) ? data : (Array.isArray(data) && data[0] ? data[0] : null);
        if (settingsObj) {
          applyCrmSettingsObject(settingsObj);
          return settingsObj;
        }
      }
    } catch (err) {
      console.log('[CRM] Notice: could not load crm_settings from Firestore, using local fallback:', err);
    }
    return null;
  };

  // Load CRM settings from Spreadsheet Réglages CRM (or Firebase fallback) immediately on mount, tenant change, or URL change
  useEffect(() => {
    if (activeTenant) {
      syncCrmSettingsFromSpreadsheet(false);
    }
  }, [activeTenant, crmSettingsSheetUrl]);

  // Also refresh CRM settings from spreadsheet whenever the side-pane "Modifier les réglages" is opened
  useEffect(() => {
    if (isSettingsPaneOpen && activeTenant) {
      syncCrmSettingsFromSpreadsheet(true);
    }
  }, [isSettingsPaneOpen, activeTenant]);

  // Listen to live updates dispatched when Spreadsheet Réglages CRM is saved or refreshed in App / SettingsModal
  useEffect(() => {
    const handleCrmSettingsEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.settings && (!detail.tenantId || detail.tenantId === activeTenant)) {
        applyCrmSettingsObject(detail.settings);
      } else {
        syncCrmSettingsFromSpreadsheet(true);
      }
    };
    window.addEventListener('defib-crm-settings-updated', handleCrmSettingsEvent);
    return () => window.removeEventListener('defib-crm-settings-updated', handleCrmSettingsEvent);
  }, [activeTenant, crmSettingsSheetUrl]);

  const persistAllCrmSettings = async () => {
    localStorage.setItem(`defib_${activeTenant}_crm_relance_template`, relanceEmailBody);
    localStorage.setItem(`defib_${activeTenant}_crm_relance_replyto`, relanceEmailReplyTo);
    localStorage.setItem(`defib_${activeTenant}_crm_relance_template_2`, relanceEmailBody2);
    localStorage.setItem(`defib_${activeTenant}_crm_relance_replyto_2`, relanceEmailReplyTo2);
    localStorage.setItem(`defib_${activeTenant}_crm_relance_template_3`, relanceEmailBody3);
    localStorage.setItem(`defib_${activeTenant}_crm_relance_replyto_3`, relanceEmailReplyTo3);
    localStorage.setItem(`defib_${activeTenant}_crm_support_subject`, supportEmailSubject);
    localStorage.setItem(`defib_${activeTenant}_crm_support_template`, supportEmailBody);
    localStorage.setItem(`defib_${activeTenant}_crm_support_replyto`, supportEmailReplyTo);
    const payload = {
      id: 'tenant_crm_settings',
      relanceEmailBody,
      relanceEmailReplyTo,
      relanceEmailBody2,
      relanceEmailReplyTo2,
      relanceEmailBody3,
      relanceEmailReplyTo3,
      supportEmailSubject,
      supportEmailBody,
      supportEmailReplyTo
    };
    localStorage.setItem(`defib_${activeTenant}_crm_settings`, JSON.stringify(payload));
    const resolvedSheetUrl = getTenantSpreadsheetUrl('spreadsheetReglagesCrm', companyInfo);
    await Promise.all([
      activeTenant ? saveCollectionToFirestore('crm_settings', payload, activeTenant).catch(() => {}) : Promise.resolve(),
      fetch('/api/sheets/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: activeTenant,
          type: 'reglagesCrm',
          spreadsheetUrl: resolvedSheetUrl || undefined,
          record: payload,
        }),
      }).catch(() => {}),
    ]);
  };

  const handleSaveRelanceSettings = async (templateIndex: 1 | 2 | 3 = 1) => {
    if (templateIndex === 1) {
      if (relanceEmailReplyTo.trim() && !isValidEmailAddress(relanceEmailReplyTo)) {
        setRelanceEmailError('Veuillez renseigner une adresse email valide (avec un @ et un nom de domaine).');
        return;
      }
      setRelanceEmailError('');
      setIsSavingRelance(true);
    } else if (templateIndex === 2) {
      if (relanceEmailReplyTo2.trim() && !isValidEmailAddress(relanceEmailReplyTo2)) {
        setRelanceEmailError2('Veuillez renseigner une adresse email valide (avec un @ et un nom de domaine).');
        return;
      }
      setRelanceEmailError2('');
      setIsSavingRelance2(true);
    } else {
      if (relanceEmailReplyTo3.trim() && !isValidEmailAddress(relanceEmailReplyTo3)) {
        setRelanceEmailError3('Veuillez renseigner une adresse email valide (avec un @ et un nom de domaine).');
        return;
      }
      setRelanceEmailError3('');
      setIsSavingRelance3(true);
    }
    try {
      await persistAllCrmSettings();
    } catch (err) {
      console.error('Erreur enregistrement réglages CRM relance:', err);
    } finally {
      setIsSavingRelance(false);
      setIsSavingRelance2(false);
      setIsSavingRelance3(false);
    }
  };

  const handleSaveSupportSettings = async () => {
    if (supportEmailReplyTo.trim() && !isValidEmailAddress(supportEmailReplyTo)) {
      setSupportEmailError('Veuillez renseigner une adresse email valide (avec un @ et un nom de domaine).');
      return;
    }
    setSupportEmailError('');
    setIsSavingSupport(true);
    try {
      await persistAllCrmSettings();
    } catch (err) {
      console.error('Erreur enregistrement réglages CRM support:', err);
    } finally {
      setIsSavingSupport(false);
    }
  };

  // Form State
  const [formRef, setFormRef] = useState('');
  const [formCategorie, setFormCategorie] = useState<'Technique' | 'Commercial' | 'Réclamation' | 'Sans Catégorie'>('Sans Catégorie');
  const [formSituation, setFormSituation] = useState<'Nouveau' | 'En cours' | 'Terminé'>('Nouveau');
  const [formCriticite, setFormCriticite] = useState<'Urgent' | 'Semaine prochaine' | 'Ce mois' | 'Mois prochain' | 'Non renseigné'>('Non renseigné');
  const [formOuverture, setFormOuverture] = useState('');
  const [formDerActual, setFormDerActual] = useState('');
  const [formObjet, setFormObjet] = useState('');
  const [formCollaborateur, setFormCollaborateur] = useState('');
  const [formClientSelect, setFormClientSelect] = useState('Autre');
  const [formCustomClientName, setFormCustomClientName] = useState('');
  const [isSidePaneClientOpen, setIsSidePaneClientOpen] = useState(false);

  const clientSidePaneItems: SearchSidePaneItem[] = useMemo(() => {
    return (clients || []).map((c) => {
      const cName = c.denomination || (c as any).name || c.id || 'Client';
      return {
        id: cName,
        label: cName,
        raw: c,
      };
    });
  }, [clients]);
  const [formPayeurId, setFormPayeurId] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Contact fields below Email
  const [formSituationInterlocuteur, setFormSituationInterlocuteur] = useState<'Prospect' | 'Client'>('Prospect');
  const [formTypeStructure, setFormTypeStructure] = useState<'Collectivité' | 'Entreprise'>('Entreprise');
  const [formPrenomNom, setFormPrenomNom] = useState('');
  const [formFonction, setFormFonction] = useState('');
  const [formTelephone, setFormTelephone] = useState('');

  // Commercial category specific fields
  const [formMarchePublic, setFormMarchePublic] = useState<'Oui' | 'Non'>('Non');
  const [formSituationDevis, setFormSituationDevis] = useState<'Gagné' | 'Perdu' | 'Non renseigné'>('Non renseigné');
  const [formScoreConversion, setFormScoreConversion] = useState<number | null>(null);
  const [formReferenceDevis, setFormReferenceDevis] = useState('');
  const [formCategorieDevis, setFormCategorieDevis] = useState<'Défibrillateur' | 'Maintenance' | 'Consommable(s)' | 'Formation' | 'Grand compte' | 'Revendeur' | 'Autres' | string>('Défibrillateur');
  const [formIndicateurTempsDevis, setFormIndicateurTempsDevis] = useState<'Validation de budget' | 'Vente via revendeur' | 'Plateforme d’achat' | 'Autre' | string>('Validation de budget');
  const [formTotalAffaireHT, setFormTotalAffaireHT] = useState('');
  const [formFamille, setFormFamille] = useState('');
  const [formIndicatifPostal, setFormIndicatifPostal] = useState('');
  const [formOrigineLead, setFormOrigineLead] = useState<'Service Client' | 'Direct' | 'Internet' | 'Planification' | 'Autre' | string>('Service Client');
  const [formDescriptionOffreDevis, setFormDescriptionOffreDevis] = useState('');
  const [formTypeVente, setFormTypeVente] = useState('');
  const [formDateDevis, setFormDateDevis] = useState('');
  const [formDateDerniereRelance, setFormDateDerniereRelance] = useState('');
  const [formDateProchaineRelance, setFormDateProchaineRelance] = useState('');
  const [formDateCommande, setFormDateCommande] = useState('');
  const [formLienDevis, setFormLienDevis] = useState('');
  const [formFichiersDevis, setFormFichiersDevis] = useState<CommercialFileAttachment[]>([]);
  const [isAutreFichierToggle, setIsAutreFichierToggle] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [googleDriveActive, setGoogleDriveActive] = useState<boolean>(false);
  const [googleDriveAccessToken, setGoogleDriveAccessToken] = useState<string>('');
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formCommercialEvents, setFormCommercialEvents] = useState<CommercialEvent[]>([]);

  // Load Google Drive status for active tenant
  useEffect(() => {
    const refreshDrive = () => {
      fetchGoogleDriveStatus(activeTenant).then(status => {
        setGoogleDriveActive(status.active);
        setGoogleDriveAccessToken(status.accessToken);
      });
    };
    refreshDrive();
    window.addEventListener('google-drive-status-changed', refreshDrive);
    return () => window.removeEventListener('google-drive-status-changed', refreshDrive);
  }, [activeTenant]);

  // Support messages (Technique / Réclamation / Sans Catégorie)
  const [formSupportMessages, setFormSupportMessages] = useState<SupportMessage[]>([]);
  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const [newMessageObjet, setNewMessageObjet] = useState('');
  const [newMessageBody, setNewMessageBody] = useState('');
  const [isSendingSupportMessage, setIsSendingSupportMessage] = useState(false);
  const [supportMessageSentToast, setSupportMessageSentToast] = useState<string | null>(null);

  // Auto-expand vertical textarea ref for Description
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustDescriptionHeight = () => {
    const el = descriptionTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 44)}px`;
  };

  useEffect(() => {
    if (isPaneOpen) {
      adjustDescriptionHeight();
      const t1 = setTimeout(adjustDescriptionHeight, 20);
      const t2 = setTimeout(adjustDescriptionHeight, 100);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [formDescription, isPaneOpen]);

  const getTodayFormatted = (): string => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const toHtmlDateInputValue = (val?: string): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    return trimmed;
  };

  const generateNextReference = (): string => {
    let envCode = (typeof window !== 'undefined' ? localStorage.getItem('defib_short_env_id') : null);
    if (!envCode) {
      if (activeTenant && activeTenant !== 'demo') {
        envCode = activeTenant.toUpperCase().startsWith('D') ? activeTenant.toUpperCase() : `D${activeTenant.toUpperCase()}`;
      } else {
        envCode = 'D18';
      }
    }
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);

    let maxNum = tickets.length;
    tickets.forEach((t) => {
      const ref = t.reference || t.id;
      if (ref) {
        const match = ref.match(/^(\d{1,5})/);
        if (match) {
          const parsed = parseInt(match[1], 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    });

    const nextIndex = maxNum + 1;
    const numPadded = String(nextIndex).padStart(5, '0');
    return `${numPadded}-${envCode}-${mm}${yy}`;
  };

  const openNewTicketPane = () => {
    setEditingTicketId(null);
    const newRef = generateNextReference();
    const today = getTodayFormatted();
    setFormRef(newRef);
    setFormCategorie('Sans Catégorie');
    setFormSituation('Nouveau');
    setFormCriticite('Non renseigné');
    setFormOuverture(today);
    setFormDerActual(today);
    setFormObjet('');
    setFormCollaborateur(members.length > 0 ? members[0].name : 'Non attribué');
    setFormClientSelect('Autre');
    setFormCustomClientName('');
    setFormPayeurId('');
    setFormClientId('');
    setFormEmail('');
    setFormDescription('');

    // Reset contact fields
    setFormSituationInterlocuteur('Prospect');
    setFormTypeStructure('Entreprise');
    setFormPrenomNom('');
    setFormFonction('');
    setFormTelephone('');

    // Reset commercial fields
    setFormMarchePublic('Non');
    setFormSituationDevis('Non renseigné');
    setFormScoreConversion(null);
    setFormReferenceDevis('');
    setFormCategorieDevis('Défibrillateur');
    setFormIndicateurTempsDevis('Validation de budget');
    setFormTotalAffaireHT('');
    setFormFamille('');
    setFormIndicatifPostal('');
    setFormOrigineLead('Service Client');
    setFormDescriptionOffreDevis('');
    setFormTypeVente('');
    setFormDateDevis('');
    setFormDateDerniereRelance('');
    setFormDateProchaineRelance('');
    setFormDateCommande('');
    setFormLienDevis('');
    setFormFichiersDevis([]);
    setIsAutreFichierToggle(false);
    setIsDraggingFile(false);
    setFormCommercialEvents([]);
    setFormSupportMessages([]);
    setIsNewMessageOpen(false);
    setNewMessageObjet('');
    setNewMessageBody('');
    setSupportMessageSentToast(null);

    setIsPaneOpen(true);
  };

  const openEditTicketPane = (ticket: SupportTicket) => {
    setEditingTicketId(ticket.id);
    setFormRef(ticket.reference || ticket.id);
    setFormCategorie((ticket.categorie as any) || 'Sans Catégorie');
    
    // Normalize situation
    let sit: 'Nouveau' | 'En cours' | 'Terminé' = 'Nouveau';
    const sVal = ticket.situation || ticket.status;
    if (sVal === 'En cours') sit = 'En cours';
    else if (sVal === 'Terminé' || sVal === 'Résolu') sit = 'Terminé';
    setFormSituation(sit);

    setFormCriticite((ticket.criticite as any) || 'Non renseigné');
    setFormOuverture(ticket.dateOuverture || ticket.date || getTodayFormatted());
    setFormDerActual(ticket.dateDerniereActualisation || ticket.dateOuverture || ticket.date || getTodayFormatted());
    setFormObjet(ticket.objet || '');
    setFormCollaborateur(ticket.collaborateur || (members.length > 0 ? members[0].name : 'Non attribué'));

    // Handle Client selection vs Autre
    const currentClientVal = ticket.client || '';
    const foundClient = clients.find(c => (c.denomination || (c as any).name || '') === currentClientVal);
    if (foundClient) {
      setFormClientSelect(currentClientVal);
      setFormCustomClientName('');
      setFormPayeurId(ticket.payeurId || foundClient.payeurId || '');
      setFormClientId(ticket.clientId || foundClient.clientIdField || foundClient.id || '');
      setFormEmail(ticket.email || foundClient.email || foundClient.emailSite || '');
    } else if (currentClientVal) {
      setFormClientSelect('Autre');
      setFormCustomClientName(ticket.customClientName || currentClientVal);
      setFormPayeurId(ticket.payeurId || '');
      setFormClientId(ticket.clientId || '');
      setFormEmail(ticket.email || '');
    } else {
      setFormClientSelect('Autre');
      setFormCustomClientName('');
      setFormPayeurId(ticket.payeurId || '');
      setFormClientId(ticket.clientId || '');
      setFormEmail(ticket.email || '');
    }

    setFormDescription(ticket.description || ticket.message || '');

    // Contact fields
    setFormSituationInterlocuteur(ticket.situationInterlocuteur || 'Prospect');
    setFormTypeStructure(ticket.typeStructure || 'Entreprise');
    setFormPrenomNom(ticket.prenomNom || '');
    setFormFonction(ticket.fonction || '');
    setFormTelephone(ticket.telephone || ticket.phone || '');

    // Commercial fields
    setFormMarchePublic(ticket.marchePublic || 'Non');
    setFormSituationDevis(ticket.situationDevis || 'Non renseigné');
    setFormScoreConversion(typeof ticket.scorePotentielConversion === 'number' && ticket.scorePotentielConversion >= 1 && ticket.scorePotentielConversion <= 5 ? ticket.scorePotentielConversion : null);
    setFormReferenceDevis(ticket.referenceDevis || '');
    setFormCategorieDevis(ticket.categorieDevis || 'Défibrillateur');
    setFormIndicateurTempsDevis(ticket.indicateurTempsDevis || 'Validation de budget');
    setFormTotalAffaireHT(ticket.totalAffaireHT !== undefined && ticket.totalAffaireHT !== null ? String(ticket.totalAffaireHT) : '');
    setFormFamille(ticket.famille || '');
    setFormIndicatifPostal(ticket.indicatifPostal || '');
    setFormOrigineLead(ticket.origineLead || 'Service Client');
    setFormDescriptionOffreDevis(ticket.descriptionOffreDevis || '');
    setFormTypeVente(ticket.typeVente || '');
    setFormDateDevis(toHtmlDateInputValue(ticket.dateDevis));
    setFormDateDerniereRelance(toHtmlDateInputValue(ticket.dateDerniereRelance));
    setFormDateProchaineRelance(toHtmlDateInputValue(ticket.dateProchaineRelance));
    setFormDateCommande(toHtmlDateInputValue(ticket.dateCommande));
    setFormLienDevis(ticket.lienStockagePartageDevis || '');
    let initialFiles: CommercialFileAttachment[] = [];
    if (Array.isArray((ticket as any).fichiersDevis)) {
      initialFiles = (ticket as any).fichiersDevis.slice(0, 3);
    } else if (ticket.lienStockagePartageDevis && ticket.lienStockagePartageDevis.trim()) {
      initialFiles = [{
        name: 'Fichier devis',
        url: ticket.lienStockagePartageDevis.trim(),
        dateAjout: ticket.dateDevis || ticket.dateOuverture || getTodayFormatted(),
      }];
    }
    setFormFichiersDevis(initialFiles);
    setIsAutreFichierToggle(false);
    setIsDraggingFile(false);
    setFormCommercialEvents(Array.isArray(ticket.evenementsCommercial) ? ticket.evenementsCommercial : []);

    // Support messages
    setFormSupportMessages(Array.isArray(ticket.messagesSupport) ? ticket.messagesSupport : []);
    setIsNewMessageOpen(false);
    setNewMessageObjet('');
    setNewMessageBody('');
    setSupportMessageSentToast(null);

    setIsPaneOpen(true);
  };

  // Helper to extract Référence Devis / Facture & Total Affaire HT from uploaded file
  const extractDocumentRefAndTotalHT = async (file: File): Promise<{ ref?: string; totalHt?: string }> => {
    let combinedText = `${file.name}\n`;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const latin1 = new TextDecoder('latin1').decode(uint8.slice(0, 500000));
      combinedText += '\n' + latin1;

      if (typeof DecompressionStream !== 'undefined') {
        const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
        let match: RegExpExecArray | null;
        let streamCount = 0;
        while ((match = streamRegex.exec(latin1)) !== null && streamCount < 25) {
          streamCount++;
          const rawStr = match[1];
          if (rawStr.length > 2 && rawStr.length < 150000) {
            const bytes = new Uint8Array(rawStr.length);
            for (let i = 0; i < rawStr.length; i++) {
              bytes[i] = rawStr.charCodeAt(i) & 0xff;
            }
            for (const fmt of ['deflate', 'deflate-raw'] as const) {
              try {
                const ds = new DecompressionStream(fmt);
                const writer = ds.writable.getWriter();
                writer.write(bytes).catch(() => {});
                writer.close().catch(() => {});
                const decompressedBuf = await new Response(ds.readable).arrayBuffer();
                const decompressedStr = new TextDecoder('latin1').decode(decompressedBuf);
                const textTokens = decompressedStr.match(/\(([^()]+)\)/g);
                if (textTokens) {
                  combinedText += '\n' + textTokens.map(t => t.slice(1, -1)).join(' ');
                } else {
                  combinedText += '\n' + decompressedStr;
                }
                break;
              } catch {
                // ignore non-deflate streams
              }
            }
          }
        }
      }
    } catch {
      // Fallback to filename only
    }

    const cleanText = combinedText.replace(/\\(\d{3})/g, ' ').replace(/\s+/g, ' ');

    let detectedRef: string | undefined;
    const refPatterns = [
      /(?:devis|facture|offre|proposition|ref|réf|n°|no|numéro)\s*(?:devis|facture|n°|no|:|-|#)?\s*([A-Z]{0,5}[\-_\/]?\d{2,4}[\-_\/]?\d{2,8}[A-Z0-9\-_]*)/i,
      /\b((?:DEV|FAC|FACT|DEVIS|OFFRE|PROP|CMD|BC)[\-_\/]?[0-9]{2,10}[A-Z0-9\-_]*)\b/i,
      /\b([A-Z]{1,4}-\d{2,6}(?:-\d{1,6})?)\b/,
    ];
    for (const pat of refPatterns) {
      const m = cleanText.match(pat);
      if (m && m[1] && /\d/.test(m[1])) {
        detectedRef = m[1].trim();
        break;
      }
    }
    if (!detectedRef) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
      const nameMatch = baseName.match(/\b([A-Z0-9]{2,6}[\-_][A-Z0-9\-_]{2,15})\b/i);
      if (nameMatch && /\d/.test(nameMatch[1])) {
        detectedRef = nameMatch[1];
      }
    }

    let detectedHt: string | undefined;
    const htPatterns = [
      /(?:total\s*(?:général\s*|net\s*)?h\.?t\.?|montant\s*(?:total\s*|net\s*)?h\.?t\.?|net\s*h\.?t\.?|sous[\-\s]*total\s*h\.?t\.?)\s*[:\-€]?\s*(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/i,
      /(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))\s*€?\s*h\.?t\.?\b/i,
    ];
    for (const pat of htPatterns) {
      const m = cleanText.match(pat);
      if (m && m[1]) {
        const normalizedNum = m[1].replace(/[\s\u00A0]/g, '').replace(',', '.');
        const parsed = parseFloat(normalizedNum);
        if (!isNaN(parsed) && parsed > 0) {
          detectedHt = parsed.toFixed(2).replace(/\.00$/, '');
          break;
        }
      }
    }

    return { ref: detectedRef, totalHt: detectedHt };
  };

  // Process a single dropped or selected file
  const processUploadedFile = async (file: File) => {
    if (!file) return;
    if (formFichiersDevis.length >= 3) {
      alert("Vous pouvez ajouter au maximum 3 fichiers par ticket.");
      return;
    }
    let isActive = googleDriveActive;
    let token = googleDriveAccessToken;
    if (!isActive || !token) {
      const fresh = await fetchGoogleDriveStatus(activeTenant);
      isActive = fresh.active;
      token = fresh.accessToken;
      setGoogleDriveActive(isActive);
      setGoogleDriveAccessToken(token);
    }
    if (!isActive) {
      alert("Le connecteur Google Drive n'est pas actif. Veuillez l'activer dans les réglages.");
      return;
    }
    setIsUploadingFile(true);
    try {
      const isOtherFile = isAutreFichierToggle;
      if (!isOtherFile) {
        const extracted = await extractDocumentRefAndTotalHT(file);
        if (extracted.ref) {
          setFormReferenceDevis(extracted.ref);
        }
        if (extracted.totalHt) {
          setFormTotalAffaireHT(extracted.totalHt);
        }
      }

      const driveUrl = await uploadFileToGoogleDrive(token, file, activeTenant);
      const newFile: CommercialFileAttachment = {
        name: file.name,
        url: driveUrl,
        dateAjout: getTodayFormatted(),
        typeFichier: isOtherFile ? '' : 'Principal',
      };
      setFormFichiersDevis(prev => (prev.length >= 3 ? prev : [...prev, newFile]));
      setFormLienDevis(driveUrl);
    } catch (err: any) {
      console.error("Erreur d'upload Google Drive:", err);
      alert(err.message || "Erreur lors du téléchargement du fichier sur Google Drive.");
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Google Drive file upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
  };

  // Client dropdown change handler: auto-populate email, Payeur ID, Client ID & contact info
  const handleClientChange = (val: string) => {
    setFormClientSelect(val);
    if (val !== 'Autre') {
      setFormSituationInterlocuteur('Client');
      const found = clients.find(c => (c.denomination || (c as any).name || c.id) === val);
      if (found) {
        setFormPayeurId(found.payeurId || '');
        setFormClientId(found.clientIdField || found.id || '');
        const clientEmail = found.email || found.emailSite || '';
        if (clientEmail) {
          setFormEmail(clientEmail);
        }
        if (found.phone || found.telephoneSite) {
          setFormTelephone(found.phone || found.telephoneSite || '');
        }
        if (found.nomPrenomSite) {
          setFormPrenomNom(found.nomPrenomSite);
        }
        if (found.codePostal) {
          setFormIndicatifPostal(found.codePostal.slice(0, 2));
        }
      }
    } else {
      setFormSituationInterlocuteur('Prospect');
      setFormPayeurId('');
      setFormClientId('');
    }
  };

  // Add a commercial event (max 5)
  const handleAddCommercialEvent = () => {
    if (formCommercialEvents.length >= 5) return;
    const newEvt: CommercialEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: getTodayFormatted(),
      commentaire: '',
    };
    setFormCommercialEvents(prev => (prev.length >= 5 ? prev : [newEvt, ...prev]));
  };

  const handleUpdateCommercialEvent = (id: string, field: 'date' | 'commentaire', value: string) => {
    setFormCommercialEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleRemoveCommercialEvent = (id: string) => {
    setFormCommercialEvents(prev => prev.filter(e => e.id !== id));
  };

  // Support Message Handlers (Technique / Réclamation / Sans Catégorie - max 5)
  const handleOpenNewMessage = async () => {
    if (!isNewMessageOpen) {
      if (formSupportMessages.length >= 5) return;
      const clientName = formClientSelect === 'Autre' ? (formCustomClientName.trim() || 'Client') : formClientSelect;
      const ref = formRef || 'SUPPORT';
      const obj = formObjet || 'Assistance';
      const collab = formCollaborateur || '';

      const latestSheetSettings = getTenantSpreadsheetUrl('spreadsheetReglagesCrm', companyInfo)
        ? await syncCrmSettingsFromSpreadsheet(false)
        : null;

      const subjTemplate = latestSheetSettings?.supportEmailSubject || supportEmailSubject;
      const bodyTemplate = latestSheetSettings?.supportEmailBody || supportEmailBody;

      const filledSubject = subjTemplate
        .replace(/{Référence\.}|Référence\./g, ref)
        .replace(/{Client\.}|Client\./g, clientName)
        .replace(/{Objet\.}|Objet\./g, obj)
        .replace(/{Collaborateur\.}|Collaborateur\./g, collab);

      const filledBody = bodyTemplate
        .replace(/{Référence\.}|Référence\./g, ref)
        .replace(/{Client\.}|Client\./g, clientName)
        .replace(/{Objet\.}|Objet\./g, obj)
        .replace(/{Collaborateur\.}|Collaborateur\./g, collab);

      setNewMessageObjet(filledSubject);
      setNewMessageBody(filledBody);
      setIsNewMessageOpen(true);
    } else {
      setIsNewMessageOpen(false);
    }
  };

  const handleSendSupportMessage = async () => {
    if (formSupportMessages.length >= 5) {
      setIsNewMessageOpen(false);
      return;
    }
    let targetEmail = formEmail.trim();
    if (!targetEmail && formClientSelect !== 'Autre') {
      const found = clients.find(c => (c.denomination || (c as any).name || c.id) === formClientSelect);
      if (found) {
        targetEmail = (found.email || found.emailSite || '').trim();
      }
    }

    if (!targetEmail) {
      alert("Veuillez renseigner une adresse email dans la fiche client ou le champ Email pour envoyer ce message.");
      return;
    }

    if (!newMessageObjet.trim() || !newMessageBody.trim()) {
      alert("Veuillez saisir un objet et un message.");
      return;
    }

    setIsSendingSupportMessage(true);
    try {
      const latestSheetSettings = getTenantSpreadsheetUrl('spreadsheetReglagesCrm', companyInfo)
        ? await syncCrmSettingsFromSpreadsheet(false)
        : null;
      const effectiveReplyTo = (latestSheetSettings?.supportEmailReplyTo ?? supportEmailReplyTo).trim();
      const replyTo = effectiveReplyTo || companyInfo?.email || 'contact@defibeo.com';
      const senderName = getActiveTenantCommercialName(companyInfo?.name);
      await sendScriptEmail({
        to: targetEmail,
        subject: newMessageObjet.trim(),
        body: newMessageBody.trim(),
        replyTo,
        name: senderName,
        senderName
      });

      const now = new Date();
      const dateStr = getTodayFormatted();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const newMsg: SupportMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: dateStr,
        heure: timeStr,
        objet: newMessageObjet.trim(),
        message: newMessageBody.trim(),
        destinataire: targetEmail,
        expediteur: formCollaborateur || companyInfo?.name || 'Support Technique'
      };

      const updatedMessages = [newMsg, ...formSupportMessages];
      setFormSupportMessages(updatedMessages);

      // Persist directly to Firebase via onSaveTickets if editing existing ticket
      if (editingTicketId) {
        const updatedTickets = tickets.map(t => {
          if (t.id === editingTicketId) {
            return {
              ...t,
              messagesSupport: updatedMessages,
              dateDerniereActualisation: dateStr
            };
          }
          return t;
        });
        onSaveTickets(updatedTickets);
      }

      setIsNewMessageOpen(false);
      setSupportMessageSentToast('Message envoyé.');
      setTimeout(() => setSupportMessageSentToast(null), 4000);
    } catch (err: any) {
      console.error("Erreur envoi message support:", err);
      alert("Une erreur est survenue lors de l'envoi de l'email : " + (err?.message || 'Erreur inconnue'));
    } finally {
      setIsSendingSupportMessage(false);
    }
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const today = getTodayFormatted();
    const resolvedClientName = formClientSelect === 'Autre' 
      ? (formCustomClientName.trim() || 'Client Autre')
      : formClientSelect;

    const contactData = {
      situationInterlocuteur: formSituationInterlocuteur,
      typeStructure: formTypeStructure,
      prenomNom: formPrenomNom.trim(),
      fonction: formFonction.trim(),
      telephone: formTelephone.trim(),
    };

    const sharedFileUrls = formFichiersDevis.length > 0
      ? formFichiersDevis.map((f) => f.url).filter(Boolean).join(', ')
      : formLienDevis.trim();

    const commercialData = formCategorie === 'Commercial' ? {
      marchePublic: formMarchePublic,
      situationDevis: formSituationDevis,
      scorePotentielConversion: formScoreConversion,
      referenceDevis: formReferenceDevis.trim(),
      categorieDevis: formCategorieDevis,
      indicateurTempsDevis: formIndicateurTempsDevis,
      totalAffaireHT: formTotalAffaireHT.trim() ? parseFloat(formTotalAffaireHT.trim()) : undefined,
      famille: formFamille.trim().toUpperCase(),
      indicatifPostal: formIndicatifPostal.trim(),
      origineLead: formOrigineLead,
      descriptionOffreDevis: formDescriptionOffreDevis.trim(),
      typeVente: formTypeVente.trim(),
      dateDevis: formDateDevis.trim(),
      dateDerniereRelance: formDateDerniereRelance.trim(),
      dateProchaineRelance: formDateProchaineRelance.trim(),
      dateCommande: formDateCommande.trim(),
      lienStockagePartageDevis: sharedFileUrls,
      photoDataUrl: sharedFileUrls || undefined,
      fichiersDevis: formFichiersDevis,
      evenementsCommercial: formCommercialEvents,
    } : {
      lienStockagePartageDevis: sharedFileUrls || undefined,
      photoDataUrl: sharedFileUrls || undefined,
      fichiersDevis: formFichiersDevis.length > 0 ? formFichiersDevis : undefined,
    };

    if (editingTicketId) {
      // Update existing ticket
      const updatedList = tickets.map((t) => {
        if (t.id === editingTicketId) {
          return {
            ...t,
            reference: formRef,
            categorie: formCategorie,
            situation: formSituation,
            status: formSituation === 'Terminé' ? 'Résolu' : formSituation,
            criticite: formCriticite,
            dateOuverture: formOuverture || today,
            dateDerniereActualisation: today,
            objet: formObjet.trim().slice(0, 55),
            collaborateur: formCollaborateur,
            client: resolvedClientName,
            payeurId: formPayeurId.trim(),
            clientId: formClientId.trim(),
            isCustomClient: formClientSelect === 'Autre',
            customClientName: formClientSelect === 'Autre' ? formCustomClientName : '',
            email: formEmail.trim(),
            description: formDescription,
            message: formDescription,
            envId: t.envId || activeTenant,
            tenantId: t.tenantId || activeTenant,
            ...contactData,
            ...commercialData,
            messagesSupport: formSupportMessages,
          };
        }
        return t;
      });
      onSaveTickets(updatedList);
    } else {
      // Create new ticket
      const newTicket: SupportTicket = {
        id: formRef,
        reference: formRef,
        identifiant: formRef,
        categorie: formCategorie,
        situation: formSituation,
        status: formSituation === 'Terminé' ? 'Résolu' : formSituation,
        criticite: formCriticite,
        dateOuverture: formOuverture || today,
        dateDerniereActualisation: today,
        objet: formObjet.trim().slice(0, 55) || 'Sans objet',
        collaborateur: formCollaborateur,
        client: resolvedClientName,
        payeurId: formPayeurId.trim(),
        clientId: formClientId.trim(),
        isCustomClient: formClientSelect === 'Autre',
        customClientName: formClientSelect === 'Autre' ? formCustomClientName : '',
        email: formEmail.trim(),
        description: formDescription,
        message: formDescription,
        phone: formTelephone.trim(),
        date: formOuverture || today,
        envId: activeTenant,
        tenantId: activeTenant,
        ...contactData,
        ...commercialData,
        messagesSupport: formSupportMessages,
      };
      onSaveTickets([newTicket, ...tickets]);
    }

    setIsPaneOpen(false);
  };

  const handleQuickTerminate = (ticketId: string) => {
    const today = getTodayFormatted();
    const updated = tickets.map((t) => {
      if (t.id === ticketId) {
        return {
          ...t,
          situation: 'Terminé' as const,
          status: 'Résolu' as const,
          dateDerniereActualisation: today,
        };
      }
      return t;
    });
    onSaveTickets(updated);
  };

  const handleDeleteTicket = (ticketId: string) => {
    const updated = tickets.filter((t) => t.id !== ticketId);
    onSaveTickets(updated);
    setSelectedTicketIds(prev => prev.filter(id => id !== ticketId));
  };

  // Bulk actions: Supprimer, Email Relance, and Export CSV
  const selectedTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
  const isRelanceEnabled = selectedTickets.length > 0 && !isSendingRelance && selectedTickets.every(t => 
    t.categorie === 'Commercial' && Boolean(t.email && t.email.trim().length > 0)
  );

  const handleBulkDelete = () => {
    if (selectedTicketIds.length === 0) return;
    const count = selectedTicketIds.length;
    const ok = window.confirm(`Voulez-vous vraiment supprimer les ${count} ticket(s) sélectionné(s) ?`);
    if (!ok) return;

    const updated = tickets.filter(t => !selectedTicketIds.includes(t.id));
    onSaveTickets(updated);
    setSelectedTicketIds([]);
  };

  const handleQuickSituationDevis = (ticketId: string, newSitDevis: 'Gagné' | 'Perdu') => {
    const today = getTodayFormatted();
    const updated = tickets.map((t) => {
      if (t.id === ticketId) {
        return {
          ...t,
          situationDevis: newSitDevis,
          dateDerniereActualisation: today,
          ...(newSitDevis === 'Gagné' ? { dateCommande: t.dateCommande || today } : {}),
        };
      }
      return t;
    });
    onSaveTickets(updated);
  };

  const handleBulkRelanceEmail = async (templateIdx: 1 | 2 | 3 = selectedRelanceTemplateIdx) => {
    if (!isRelanceEnabled || selectedTicketIds.length === 0) return;
    setIsSendingRelance(true);
    setRelanceBannerMsg(null);
    let sentCount = 0;
    let missingEmailCount = 0;
    const sentTicketIds = new Set<string>();

    // Ensure latest settings from Spreadsheet Réglages CRM are used for the request
    const latestSheetSettings = getTenantSpreadsheetUrl('spreadsheetReglagesCrm', companyInfo)
      ? await syncCrmSettingsFromSpreadsheet(false)
      : null;

    const chosenTemplateBody =
      templateIdx === 2
        ? (latestSheetSettings?.relanceEmailBody2 || relanceEmailBody2)
        : templateIdx === 3
        ? (latestSheetSettings?.relanceEmailBody3 || relanceEmailBody3)
        : (latestSheetSettings?.relanceEmailBody || relanceEmailBody);
    const chosenReplyTo =
      templateIdx === 2
        ? (latestSheetSettings?.relanceEmailReplyTo2 ?? relanceEmailReplyTo2)
        : templateIdx === 3
        ? (latestSheetSettings?.relanceEmailReplyTo3 ?? relanceEmailReplyTo3)
        : (latestSheetSettings?.relanceEmailReplyTo ?? relanceEmailReplyTo);

    for (const ticketId of selectedTicketIds) {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) continue;

      const targetEmail = ticket.email?.trim() || '';
      if (!targetEmail) {
        missingEmailCount++;
        continue;
      }

      const clientName = ticket.client || ticket.customClientName || 'Client';
      const refDevis = ticket.referenceDevis || ticket.reference || ticket.id;
      const lienStockage = ticket.lienStockagePartageDevis || '';

      // Replace template variables
      let bodyText = chosenTemplateBody
        .replace(/{Client\.}|Client\./g, clientName)
        .replace(/{Référence Devis\.}|Référence Devis\./g, refDevis)
        .replace(/{Lien Stockage Partagé Devis\.}|Lien Stockage Partagé Devis\./g, lienStockage);

      const subject = `Relance - ${refDevis}`;
      const replyTo = chosenReplyTo.trim() || companyInfo?.email || 'contact@defibeo.com';
      const senderName = getActiveTenantCommercialName(companyInfo?.name);

      try {
        const ok = await sendScriptEmail({
          to: targetEmail,
          subject,
          body: bodyText,
          replyTo,
          name: senderName,
          senderName
        });
        if (ok !== false) {
          sentCount++;
          sentTicketIds.add(ticket.id);
        }
      } catch (err) {
        console.warn('Erreur envoi email relance:', err);
      }
    }

    if (sentTicketIds.size > 0) {
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todayDisplay = getTodayFormatted();
      const updatedTickets = tickets.map((t) => {
        if (sentTicketIds.has(t.id)) {
          return {
            ...t,
            dateDerniereRelance: todayIso,
            dateDerniereActualisation: todayDisplay,
          };
        }
        return t;
      });
      onSaveTickets(updatedTickets);
    }

    setIsSendingRelance(false);
    setIsRelanceDropdownOpen(false);
    if (sentCount > 0 && missingEmailCount === 0) {
      setRelanceBannerMsg({ type: 'success', text: `✓ ${sentCount} email(s) de relance envoyé(s) avec succès !` });
    } else if (sentCount > 0 && missingEmailCount > 0) {
      setRelanceBannerMsg({ type: 'success', text: `✓ ${sentCount} email(s) envoyé(s), mais ${missingEmailCount} ligne(s) sans email valide.` });
    } else {
      setRelanceBannerMsg({ type: 'error', text: `Aucun email n'a pu être envoyé. Veuillez vérifier que les lignes sélectionnées ont une adresse email renseignée.` });
    }

    setTimeout(() => {
      setRelanceBannerMsg(null);
    }, 6000);
  };

  // Bulk CSV Export of all selected tickets
  const handleBulkExportCSV = () => {
    if (selectedTicketIds.length === 0) return;
    const selectedTicketsList = tickets.filter(t => selectedTicketIds.includes(t.id));
    if (selectedTicketsList.length === 0) return;

    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel

    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '';
      const str = String(val).replace(/"/g, '""');
      if (str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str}"`;
      }
      return str;
    };

    const headers = [
      'Référence',
      'Date Ouverture',
      'Dernière Actualisation',
      'Catégorie',
      'Situation',
      'Criticité',
      'Objet',
      'Collaborateur',
      'Client ou Prospect',
      'Situation Interlocuteur',
      'Type Structure',
      'Prénom Nom',
      'Fonction',
      'Email',
      'Téléphone',
      'Indicatif Postal',
      'Description',
      'Total Affaire HT',
      'Situation Devis',
      'Marché Public',
      'Score Potentiel Conversion',
      'Référence Devis',
      'Catégorie Devis',
      'Indicateur Temps Devis',
      'Famille',
      'Origine Lead',
      'Description Offre Devis',
      'Date Devis',
      'Date Prochaine Relance',
      'Date Commande',
      'Lien Stockage Partagé Devis',
      'Historique Événements (Commercial)',
      'Messages Support'
    ];

    csvContent += headers.join(';') + '\n';

    selectedTicketsList.forEach(t => {
      const sit = t.situation || (t.status === 'Résolu' ? 'Terminé' : t.status) || 'Nouveau';

      // Events history for Commercial tickets
      const eventsHistory = Array.isArray(t.evenementsCommercial) && t.evenementsCommercial.length > 0
        ? t.evenementsCommercial
            .map(e => {
              const d = e.date ? `[${e.date}] ` : '';
              return `${d}${e.commentaire || ''}`.trim();
            })
            .filter(Boolean)
            .join(' | ')
        : '';

      // Messages Support
      const supportHistory = Array.isArray(t.messagesSupport) && t.messagesSupport.length > 0
        ? t.messagesSupport
            .map(m => {
              const d = m.date ? `[${m.date}${m.heure ? ' ' + m.heure : ''}] ` : '';
              return `${d}${m.expediteur ? m.expediteur + ': ' : ''}${m.objet ? m.objet + ' - ' : ''}${m.message || ''}`.trim();
            })
            .filter(Boolean)
            .join(' | ')
        : '';

      const totalHTStr = t.totalAffaireHT !== undefined && t.totalAffaireHT !== null && t.totalAffaireHT !== ''
        ? (typeof t.totalAffaireHT === 'number' ? `${t.totalAffaireHT.toFixed(2)} €` : `${t.totalAffaireHT} €`)
        : '';

      const scoreStr = t.scorePotentielConversion !== undefined && t.scorePotentielConversion !== null
        ? `${t.scorePotentielConversion}/5`
        : '';

      const row = [
        escapeCsv(t.reference || t.id),
        escapeCsv(t.dateOuverture || t.date || ''),
        escapeCsv(t.dateDerniereActualisation || ''),
        escapeCsv(t.categorie || 'Sans Catégorie'),
        escapeCsv(sit),
        escapeCsv(t.criticite || 'Non renseigné'),
        escapeCsv(t.objet || ''),
        escapeCsv(t.collaborateur || ''),
        escapeCsv(t.client || t.customClientName || ''),
        escapeCsv(t.situationInterlocuteur || ''),
        escapeCsv(t.typeStructure || ''),
        escapeCsv(t.prenomNom || ''),
        escapeCsv(t.fonction || ''),
        escapeCsv(t.email || ''),
        escapeCsv(t.telephone || t.phone || ''),
        escapeCsv(t.indicatifPostal || ''),
        escapeCsv(t.description || t.message || ''),
        escapeCsv(totalHTStr),
        escapeCsv(t.situationDevis || ''),
        escapeCsv(t.marchePublic || ''),
        escapeCsv(scoreStr),
        escapeCsv(t.referenceDevis || ''),
        escapeCsv(t.categorieDevis || ''),
        escapeCsv(t.indicateurTempsDevis || ''),
        escapeCsv(t.famille || ''),
        escapeCsv(t.origineLead || ''),
        escapeCsv(t.descriptionOffreDevis || ''),
        escapeCsv(t.dateDevis || ''),
        escapeCsv(t.dateProchaineRelance || ''),
        escapeCsv(t.dateCommande || ''),
        escapeCsv(t.lienStockagePartageDevis || ''),
        escapeCsv(eventsHistory),
        escapeCsv(supportHistory)
      ];

      csvContent += row.join(';') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    link.href = url;
    link.setAttribute('download', `crm_export_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered tickets list for main table
  const filteredTickets = tickets.filter((t) => {
    // 1. Category filter
    const cat = t.categorie || 'Sans Catégorie';
    let matchesCat = false;
    if (ticketCategoryFilter === 'Sans Catégorie') {
      matchesCat = !t.categorie || t.categorie === 'Sans Catégorie';
    } else {
      matchesCat = t.categorie === ticketCategoryFilter;
    }

    // 2. Situation / Status filter
    const sit = t.situation || (t.status === 'Résolu' ? 'Terminé' : t.status) || 'Nouveau';
    const matchesSit = ticketStatusFilter === 'Tous' || sit === ticketStatusFilter;

    // 3. Search query
    const q = ticketSearch.toLowerCase().trim();
    if (q) {
      const ref = (t.reference || t.id || '').toLowerCase();
      const obj = (t.objet || '').toLowerCase();
      const cli = (t.client || t.customClientName || '').toLowerCase();
      const eml = (t.email || '').toLowerCase();
      const col = (t.collaborateur || '').toLowerCase();
      const desc = (t.description || t.message || '').toLowerCase();
      const refDev = (t.referenceDevis || '').toLowerCase();

      const matchesQuery = ref.includes(q) || obj.includes(q) || cli.includes(q) || eml.includes(q) || col.includes(q) || cat.toLowerCase().includes(q) || desc.includes(q) || refDev.includes(q);
      if (!matchesQuery) return false;
    }

    // 4. Side-pane filter: Collaborateur
    if (filterCollaborateur !== 'Tous') {
      if (filterCollaborateur === 'Non attribué(s)') {
        const c = (t.collaborateur || '').trim();
        if (c && c !== 'Non attribué') return false;
      } else {
        if (t.collaborateur !== filterCollaborateur) return false;
      }
    }

    // 5. Side-pane filter: Criticité
    if (filterCriticite !== 'Tous') {
      if (filterCriticite === 'Non renseigné') {
        const crit = (t.criticite || '').trim();
        if (crit && crit !== 'Non renseigné') return false;
      } else {
        if (t.criticite !== filterCriticite) return false;
      }
    }

    // 6. Side-pane filter: Semaine
    if (filterSemaine !== 'Tous') {
      const rawOuvVal = t.dateOuverture || t.ouverture || t.createdAt;
      const weekNum = getWeekNumberString(rawOuvVal);
      if (weekNum !== filterSemaine) return false;
    }

    // 7. Side-pane filter: Situation Devis
    if (filterSituationDevis !== 'Tous') {
      if (filterSituationDevis === 'Non renseigné') {
        const sitDev = (t.situationDevis || '').trim();
        if (sitDev && sitDev !== 'Non renseigné') return false;
      } else {
        if (t.situationDevis !== filterSituationDevis) return false;
      }
    }

    // 8. Date à date filter (Filtre Date Début et Filtre Date Fin)
    if (crmDateStart || crmDateEnd) {
      const rawOuv = t.dateOuverture || t.ouverture || t.createdAt || (t as any).date;
      if (rawOuv) {
        let ticketTime = 0;
        if (typeof rawOuv === 'number') {
          ticketTime = rawOuv > 1e11 ? rawOuv : rawOuv * 1000;
        } else {
          const s = String(rawOuv).trim();
          const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
          if (ymd) {
            ticketTime = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10)).getTime();
          } else {
            const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
            if (dmy) {
              ticketTime = new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10)).getTime();
            } else {
              const d = new Date(s);
              if (!isNaN(d.getTime())) ticketTime = d.getTime();
            }
          }
        }

        if (ticketTime > 0) {
          if (crmDateStart) {
            const m = crmDateStart.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) {
              const startTs = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 0, 0, 0, 0).getTime();
              if (ticketTime < startTs) return false;
            }
          }
          if (crmDateEnd) {
            const m = crmDateEnd.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) {
              const endTs = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 23, 59, 59, 999).getTime();
              if (ticketTime > endTs) return false;
            }
          }
        }
      }
    }

    return matchesCat && matchesSit;
  });

  // Category counts
  const countCatTous = tickets.length;
  const countCatCommercial = tickets.filter(t => t.categorie === 'Commercial').length;
  const countCatReclamation = tickets.filter(t => t.categorie === 'Réclamation').length;
  const countCatTechnique = tickets.filter(t => t.categorie === 'Technique').length;
  const countCatSansCat = tickets.filter(t => !t.categorie || t.categorie === 'Sans Catégorie').length;

  // Situation counts
  const countNew = tickets.filter(t => (t.situation || t.status) === 'Nouveau').length;
  const countProgress = tickets.filter(t => (t.situation || t.status) === 'En cours').length;
  const countTermine = tickets.filter(t => (t.situation || t.status) === 'Terminé' || t.status === 'Résolu').length;

  const isAllFilteredSelected = filteredTickets.length > 0 && filteredTickets.every(t => selectedTicketIds.includes(t.id));

  const toggleSelectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedTicketIds([]);
    } else {
      setSelectedTicketIds(filteredTickets.map(t => t.id));
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTicketIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ==========================================
  // PERFORMANCE & STATS LOGIC
  // ==========================================
  const filteredPerfTickets = tickets.filter((t) => {
    // 1. Filter by employee
    if (perfCollaborateur !== 'Tous' && t.collaborateur !== perfCollaborateur) {
      return false;
    }

    // 2. Filter by date range (DD/MM/YYYY parsed to timestamp)
    if (perfStartDate || perfEndDate) {
      const rawDate = t.dateOuverture || t.date;
      if (!rawDate) return false;

      let ticketTime: number | null = null;
      const parts = rawDate.trim().split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
          ticketTime = new Date(y, m, d).getTime();
        }
      } else {
        const parsed = new Date(rawDate).getTime();
        if (!isNaN(parsed)) ticketTime = parsed;
      }

      if (ticketTime === null) return false;

      if (perfStartDate) {
        const start = new Date(perfStartDate);
        start.setHours(0, 0, 0, 0);
        if (ticketTime < start.getTime()) return false;
      }

      if (perfEndDate) {
        const end = new Date(perfEndDate);
        end.setHours(23, 59, 59, 999);
        if (ticketTime > end.getTime()) return false;
      }
    }

    return true;
  });

  // Bloc stat 1: « Tickets ouverts » (Nouveau / En cours)
  const statTicketsOuverts = filteredPerfTickets.filter(t => {
    const s = t.situation || t.status;
    return s === 'Nouveau' || s === 'En cours';
  }).length;

  // Bloc stat 2: « Tickets fermés » (Terminé / Résolu)
  const statTicketsFermes = filteredPerfTickets.filter(t => {
    const s = t.situation || t.status;
    return s === 'Terminé' || s === 'Résolu';
  }).length;

  // Bloc stat 3: « Volume affaires »
  // Sum of totalAffaireHT for category 'Commercial' where situationDevis is null, Non renseigné, or Gagné
  const statVolumeAffaires = filteredPerfTickets.reduce((acc, t) => {
    if (t.categorie === 'Commercial') {
      const sitDev = t.situationDevis;
      if (!sitDev || sitDev === 'Non renseigné' || sitDev === 'Gagné') {
        const val = typeof t.totalAffaireHT === 'number'
          ? t.totalAffaireHT
          : parseFloat(String(t.totalAffaireHT || '').replace(/[^\d.-]/g, '')) || 0;
        return acc + val;
      }
    }
    return acc;
  }, 0);

  // Bloc stat 4: « Score closing »
  // Tickets category 'Commercial' with situationDevis 'Gagné' / 'Perdu'
  const commercialDeals = filteredPerfTickets.filter(t => 
    t.categorie === 'Commercial' && (t.situationDevis === 'Gagné' || t.situationDevis === 'Perdu')
  );
  const dealsGagnes = commercialDeals.filter(t => t.situationDevis === 'Gagné').length;
  const dealsPerdus = commercialDeals.filter(t => t.situationDevis === 'Perdu').length;
  const totalDeals = dealsGagnes + dealsPerdus;
  const scoreClosingVal = totalDeals > 0 ? (dealsGagnes / totalDeals) * 10 : null;
  const scoreClosingText = scoreClosingVal !== null ? `${scoreClosingVal.toFixed(1)}/10` : '—/10';

  // Helper to parse any CRM date string (DD/MM/YYYY or YYYY-MM-DD) into a midnight timestamp
  const parseCrmDateToMidnightTs = (raw?: string | number | null): number | null => {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'number') {
      const d = new Date(raw > 1e11 ? raw : raw * 1000);
      if (isNaN(d.getTime())) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
    const s = String(raw).trim();
    if (!s) return null;
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10) - 1;
      const year = parseInt(dmy[3], 10);
      const dt = new Date(year, month, day);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
    const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymd) {
      const year = parseInt(ymd[1], 10);
      const month = parseInt(ymd[2], 10) - 1;
      const day = parseInt(ymd[3], 10);
      const dt = new Date(year, month, day);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
    }
    return null;
  };

  // Format duration in days as an/mois/semaines/jours (without hours or seconds)
  const formatClosingDurationDays = (totalDays: number): string => {
    const rounded = Math.max(0, Math.round(totalDays));
    if (rounded === 0) return '0 jour';
    let rem = rounded;
    const years = Math.floor(rem / 365);
    rem %= 365;
    const months = Math.floor(rem / 30);
    rem %= 30;
    const weeks = Math.floor(rem / 7);
    const days = rem % 7;

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} ${years > 1 ? 'ans' : 'an'}`);
    if (months > 0) parts.push(`${months} mois`);
    if (weeks > 0) parts.push(`${weeks} ${weeks > 1 ? 'semaines' : 'semaine'}`);
    if (days > 0) parts.push(`${days} ${days > 1 ? 'jours' : 'jour'}`);
    return parts.join(' ');
  };

  // Bloc stat 5: « Temps closing » (durée moyenne entre l'ouverture du ticket et le moment où l'on clique sur Gagné)
  const wonCommercialTickets = filteredPerfTickets.filter(
    t => t.categorie === 'Commercial' && t.situationDevis === 'Gagné'
  );
  const closingDurationsInDays: number[] = [];
  wonCommercialTickets.forEach(t => {
    const startTs = parseCrmDateToMidnightTs(t.dateOuverture || t.ouverture || t.date || t.createdAt);
    const endTs = parseCrmDateToMidnightTs(
      t.dateDerniereActualisation || t.dateCommande || t.dateOuverture || t.date
    );
    if (startTs !== null && endTs !== null) {
      const diffDays = Math.max(0, Math.round((endTs - startTs) / (1000 * 60 * 60 * 24)));
      closingDurationsInDays.push(diffDays);
    }
  });
  const statTempsClosingText =
    closingDurationsInDays.length > 0
      ? formatClosingDurationDays(
          closingDurationsInDays.reduce((sum, d) => sum + d, 0) / closingDurationsInDays.length
        )
      : '—';

  // Bloc stat 6: « Meilleur Closer » (user du tenant qui a le plus de tickets commerciaux marqués comme gagnés)
  const statMeilleurCloserText = (() => {
    const closerCounts = new Map<string, number>();
    const pool = tickets.filter(t => {
      if (t.categorie !== 'Commercial' || t.situationDevis !== 'Gagné') return false;
      if (perfStartDate || perfEndDate) {
        const ticketTime = parseCrmDateToMidnightTs(t.dateOuverture || t.date);
        if (ticketTime === null) return false;
        if (perfStartDate) {
          const start = new Date(perfStartDate);
          start.setHours(0, 0, 0, 0);
          if (ticketTime < start.getTime()) return false;
        }
        if (perfEndDate) {
          const end = new Date(perfEndDate);
          end.setHours(23, 59, 59, 999);
          if (ticketTime > end.getTime()) return false;
        }
      }
      return true;
    });
    pool.forEach(t => {
      const collab = (t.collaborateur || '').trim();
      if (!collab || collab === 'Non attribué' || collab === 'Non attribué(s)') return;
      closerCounts.set(collab, (closerCounts.get(collab) || 0) + 1);
    });
    let bestName = '';
    let bestCount = 0;
    closerCounts.forEach((count, name) => {
      if (count > bestCount) {
        bestCount = count;
        bestName = name;
      }
    });
    return bestName || '—';
  })();

  // Export CSV
  const handleExportPerformanceCSV = () => {
    if (filteredPerfTickets.length === 0) return;
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel

    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '';
      const str = String(val).replace(/"/g, '""');
      if (str.includes(';') || str.includes('\n') || str.includes('"')) {
        return `"${str}"`;
      }
      return str;
    };

    // Header section with stats summary
    csvContent += 'RÉSUMÉ DES PERFORMANCES CRM;;;;;;;;;;;;;;;\n';
    csvContent += `Période d'analyse;${perfStartDate ? 'Du ' + perfStartDate : 'Depuis le début'}${perfEndDate ? ' au ' + perfEndDate : ''};;;;;;;;;;;;;;;\n`;
    csvContent += `Employé sélectionné;${perfCollaborateur};;;;;;;;;;;;;;;\n`;
    csvContent += `Tickets ouverts;${statTicketsOuverts};;;;;;;;;;;;;;;\n`;
    csvContent += `Tickets fermés;${statTicketsFermes};;;;;;;;;;;;;;;\n`;
    csvContent += `Volume affaires;${statVolumeAffaires.toFixed(2)} €;;;;;;;;;;;;;;;\n`;
    csvContent += `Score closing;${scoreClosingText};;;;;;;;;;;;;;;\n`;
    csvContent += `Temps closing;${statTempsClosingText};;;;;;;;;;;;;;;\n`;
    csvContent += `Meilleur Closer;${statMeilleurCloserText};;;;;;;;;;;;;;;\n`;
    csvContent += ';;;;;;;;;;;;;;;\n';

    // Detailed table header
    csvContent += 'Référence;Date Ouverture;Dernière Actualisation;Collaborateur;Client ou Prospect;Email;Situation Interlocuteur;Type Structure;Prénom Nom;Fonction;Téléphone;Catégorie;Situation;Criticité;Objet;Total Affaire HT;Situation Devis;Marché Public;Score Potentiel Conversion;Référence Devis;Catégorie Devis;Indicateur Temps Devis;Famille;Indicatif Postal;Origine Lead;Description Offre Devis;Date Devis;Date Prochaine Relance;Date Commande;Lien Stockage Partagé Devis;Description\n';

    // Rows
    filteredPerfTickets.forEach(t => {
      const sit = t.situation || (t.status === 'Résolu' ? 'Terminé' : t.status) || 'Nouveau';
      const row = [
        escapeCsv(t.reference || t.id),
        escapeCsv(t.dateOuverture || t.date || ''),
        escapeCsv(t.dateDerniereActualisation || ''),
        escapeCsv(t.collaborateur || ''),
        escapeCsv(t.client || t.customClientName || ''),
        escapeCsv(t.email || ''),
        escapeCsv(t.situationInterlocuteur || ''),
        escapeCsv(t.typeStructure || ''),
        escapeCsv(t.prenomNom || ''),
        escapeCsv(t.fonction || ''),
        escapeCsv(t.telephone || t.phone || ''),
        escapeCsv(t.categorie || 'Sans Catégorie'),
        escapeCsv(sit),
        escapeCsv(t.criticite || 'Non renseigné'),
        escapeCsv(t.objet || ''),
        escapeCsv(t.totalAffaireHT !== undefined && t.totalAffaireHT !== null && t.totalAffaireHT !== '' ? `${t.totalAffaireHT} €` : ''),
        escapeCsv(t.situationDevis || ''),
        escapeCsv(t.marchePublic || ''),
        escapeCsv(t.scorePotentielConversion !== undefined && t.scorePotentielConversion !== null ? `${t.scorePotentielConversion}/5` : ''),
        escapeCsv(t.referenceDevis || ''),
        escapeCsv(t.categorieDevis || ''),
        escapeCsv(t.indicateurTempsDevis || ''),
        escapeCsv(t.famille || ''),
        escapeCsv(t.indicatifPostal || ''),
        escapeCsv(t.origineLead || ''),
        escapeCsv(t.descriptionOffreDevis || ''),
        escapeCsv(t.dateDevis || ''),
        escapeCsv(t.dateProchaineRelance || ''),
        escapeCsv(t.dateCommande || ''),
        escapeCsv(t.lienStockagePartageDevis || ''),
        escapeCsv(t.description || t.message || '')
      ];
      csvContent += row.join(';') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    link.href = url;
    link.setAttribute('download', `performance_crm_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const customButtonStyle: React.CSSProperties = {
    backgroundColor: '#2e54ff',
    color: '#ffffff',
    borderRadius: '13px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: 'normal',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
    boxShadow: 'none',
    transition: 'background-color 0.15s ease',
  };

  const blackButtonStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    boxShadow: 'none',
    borderRadius: '13px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: 'normal',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0s ease-in-out',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: 'rgb(80 97 122)',
    backgroundColor: '#ffffff',
    cursor: 'default',
    fontSize: '16px',
    whiteSpace: 'nowrap',
  };

  const geluleStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '1000px',
    backgroundColor: '#ffffff',
    border: '1px solid rgb(231, 231, 231)',
    color: '#000000',
    fontSize: '16px',
    fontWeight: 100,
    padding: '6px 18px',
    whiteSpace: 'nowrap',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    cursor: 'default',
  };

  const cellTextStyle: React.CSSProperties = {
    color: '#000000',
    fontSize: '16px',
    fontWeight: 400,
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    cursor: 'default',
  };

  const rowActionButtonStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    borderRadius: '13px',
    fontSize: '18px',
    fontWeight: 'normal',
    padding: '8px 18px',
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
  };

  const selectStyle: React.CSSProperties = {
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundImage: 'none',
    fontSize: '18px',
  };

  const companyDisplayName = companyInfo?.name || companyInfo?.nomLogiciel || 'Votre Entreprise';
  const embedCode = `<!-- Formulaire de contact Défibeo pour ${companyDisplayName} -->
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

  <h2 style="font-size: 18px; color: #000000; margin-top: 0; margin-bottom: 8px; text-align: left; font-weight: normal;">Envoyer un message à ${companyDisplayName}</h2>
  <p style="font-size: 16px; color: #000000; margin-bottom: 24px; text-align: left; line-height: 1.5;">Vous avez une question ou besoin d'assistance ? Remplissez ce formulaire pour nous contacter.</p>
  
  <form id="defibeo-contact-form" style="display: flex; flex-direction: column; gap: 16px;">
    <input type="hidden" name="tenantId" value="${activeTenant}" />
    
    <div>
      <label style="display: block; font-size: 16px; color: #000000; margin-bottom: 6px;">Adresse Email</label>
      <input type="email" name="email" required style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 13px; font-size: 16px; color: #000000; box-sizing: border-box; outline: none; transition: border-color 0.2s;" placeholder="votre@email.com" />
    </div>
    
    <div>
      <label style="display: block; font-size: 16px; color: #000000; margin-bottom: 6px;">Message</label>
      <textarea name="message" required rows="4" style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 13px; font-size: 16px; color: #000000; box-sizing: border-box; outline: none; transition: border-color 0.2s; resize: vertical;" placeholder="Entrez votre message, veuillez détailler votre demande et mentionner votre nom et votre entreprise."></textarea>
    </div>
    
    <button type="submit" id="defibeo-submit-btn" style="background-color: #2e54ff; color: #ffffff; padding: 14px 20px; border: none; border-radius: 13px; font-size: 16px; font-weight: normal; cursor: pointer; transition: background-color 0.2s; display: block; width: 100%; text-align: center; margin-top: 8px;">Envoyer</button>
    
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
        
        fetch('${typeof window !== 'undefined' ? window.location.origin : ''}/api/crm/embed-lead', {
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

  return (
    <div className="space-y-6 animate-fadeIn" id="crm-tab-container">
      <style>{`
        #crm-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-crm-input):not(.crm-event-date-input),
        #crm-tab-container select:not(#crm-more-options-dropdown):not(.crm-file-type-select),
        #crm-tab-container textarea:not(#crm-embed-textarea):not(#crm-relance-email-textarea):not(.crm-event-textarea) {
          padding: 10px 12px !important;
          border: 1px solid #dadada !important;
          border-radius: 13px !important;
          font-size: 18px !important;
          font-weight: 400 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
          width: 100% !important;
        }
        #crm-tab-container select.crm-file-type-select {
          width: auto !important;
          min-width: 130px !important;
          padding: 6px 12px !important;
          border: 1px solid #dadada !important;
          border-radius: 10px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          cursor: pointer !important;
          appearance: auto !important;
          -webkit-appearance: menulist !important;
          -moz-appearance: menulist !important;
          outline: none !important;
        }
        #crm-tab-container select#crm-more-options-dropdown {
          width: 100% !important;
          height: 100% !important;
          opacity: 0 !important;
          position: absolute !important;
          inset: 0 !important;
          border: none !important;
          outline: none !important;
          padding: 0 !important;
          background: transparent !important;
          cursor: pointer !important;
        }
        #crm-tab-container #search-crm-input::placeholder {
          color: rgb(222, 222, 222) !important;
          opacity: 1 !important;
        }
        #crm-tab-container table,
        #crm-tab-container thead,
        #crm-tab-container tbody,
        #crm-tab-container tr,
        #crm-tab-container th,
        #crm-tab-container td {
          border: 0px solid transparent !important;
          border-top: 0px solid transparent !important;
          border-bottom: 0px solid transparent !important;
          border-left: 0px solid transparent !important;
          border-right: 0px solid transparent !important;
        }
        #crm-tab-container thead th {
          background-color: #ffffff !important;
          color: rgb(80 97 122) !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          letter-spacing: normal !important;
          text-transform: none !important;
        }
        #crm-tab-container tbody tr:hover {
          background-color: #f5f7fa !important;
        }
        #crm-tab-container input[type="date"]::-webkit-calendar-picker-indicator {
          display: block !important;
          cursor: pointer !important;
          opacity: 1 !important;
          filter: none !important;
        }
        #crm-tab-container input.crm-event-date-input {
          width: 100% !important;
          padding: 8px 10px !important;
          border: 1px solid #dadada !important;
          border-radius: 10px !important;
          font-size: 15px !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          cursor: pointer !important;
        }
        #crm-tab-container textarea.crm-event-textarea {
          width: 100% !important;
          padding: 8px 10px !important;
          border: 1px solid #dadada !important;
          border-radius: 10px !important;
          font-size: 15px !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          resize: none !important;
          overflow: hidden !important;
          min-height: 38px !important;
          line-height: 1.4 !important;
        }
        #crm-tab-container select:not(#crm-more-options-dropdown):not(.crm-file-type-select) {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #crm-tab-container select.text-center,
        #crm-tab-container select#crm-form-categorie-select,
        #crm-tab-container select#crm-form-criticite-select {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
        }
        #crm-tab-container select#crm-form-categorie-select option,
        #crm-tab-container select#crm-form-criticite-select option {
          text-align: center !important;
        }
        #crm-tab-container input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-crm-input),
        #crm-tab-container input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-crm-input),
        #crm-tab-container select:not(#crm-more-options-dropdown):hover:not(:disabled),
        #crm-tab-container select:not(#crm-more-options-dropdown):focus:not(:disabled),
        #crm-tab-container textarea:not(#crm-embed-textarea):hover:not(:disabled),
        #crm-tab-container textarea:not(#crm-embed-textarea):focus:not(:disabled),
        #crm-tab-container #search-crm-input:hover,
        #crm-tab-container #search-crm-input:focus {
          outline: 2.5px solid #2e54ff !important;
          outline-offset: 2px !important;
        }
        #crm-tab-container input:disabled,
        #crm-tab-container select:not(#crm-more-options-dropdown):disabled {
          background-color: #f1f5f9 !important;
          color: #000000 !important;
          cursor: not-allowed !important;
          opacity: 1 !important;
          font-size: 18px !important;
        }
        #crm-tab-container label {
          font-size: 18px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          margin-bottom: 4px !important;
          display: block !important;
        }
      `}</style>

      {/* Header section with Title and Action buttons */}
      <div 
        className="bg-white space-y-4"
        style={{ borderRadius: '0px', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
          <div />

          <div className="flex items-center gap-2 flex-wrap">
            {/* 3 Dots More Options Dropdown */}
            {(() => {
              const resolvedSpreadsheetUrl = getTenantSpreadsheetUrl('spreadsheetCrm', companyInfo);
              return (
                <div
                  className="relative inline-flex items-center justify-center shrink-0 hover:opacity-80 transition-all select-none cursor-pointer"
                  style={{
                    background: '#f5f7fa',
                    borderRadius: '100px',
                    padding: '12px',
                    cursor: 'pointer',
                  }}
                  title={t("Plus d'options")}
                >
                  <img
                    src="https://civilprom.s3.eu-north-1.amazonaws.com/3dotsgris.svg"
                    alt="Options"
                    style={{ width: '18px', height: '18px', display: 'block', pointerEvents: 'none' }}
                    referrerPolicy="no-referrer"
                  />
                  <select
                    id="crm-more-options-dropdown"
                    aria-label={t("Plus d'options")}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'performance') {
                        setIsPerformancePaneOpen(true);
                      } else if (val === 'settings') {
                        setIsSettingsPaneOpen(true);
                      } else if (val === 'filters') {
                        setDraftDateStart(crmDateStart);
                        setDraftDateEnd(crmDateEnd);
                        setDraftFilterStatut(ticketStatusFilter);
                        setDraftFilterCollaborateur(filterCollaborateur);
                        setDraftFilterCriticite(filterCriticite);
                        setDraftFilterSemaine(filterSemaine);
                        setDraftFilterSituationDevis(filterSituationDevis);
                        setIsFilterPaneOpen(true);
                      } else if (val === 'fit-view') {
                        toggleTableFitView();
                      } else if (val === 'columns') {
                        setTempHiddenColumns(new Set(hiddenColumns));
                        setTempColumnOrder([...columnOrder]);
                        setColumnFilterScope('Actif');
                        setIsColumnVisibilityPaneOpen(true);
                      } else if (val === 'spreadsheet') {
                        if (resolvedSpreadsheetUrl) {
                          openTenantSpreadsheetUrl(resolvedSpreadsheetUrl);
                        }
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ WebkitAppearance: 'menulist-button', appearance: 'auto', border: 'none', outline: 'none' }}
                  >
                    <option value="" disabled hidden></option>
                    <option value="performance">
                      {t("Statistiques de performance")}
                    </option>
                    <option value="settings">
                      {t("Modifier les réglages")}
                    </option>
                    <option value="filters">
                      {activeFiltersCount > 0 ? `${t("Appliquer des filtres")} (${activeFiltersCount})` : t("Appliquer des filtres")}
                    </option>
                    <option value="fit-view">
                      {isTableFitView ? t("Retourner l’affichage standard") : t("Minimiser et ajuster l’affichage")}
                    </option>
                    <option value="columns">
                      {t("Gérer la visibilité des colonnes")}
                    </option>
                    <option value="spreadsheet" disabled={!resolvedSpreadsheetUrl}>
                      {t("Ouvrir l'éditeur SpreadSheets")}
                    </option>
                  </select>
                </div>
              );
            })()}

            {/* Actualiser les données Pill Button */}
            <button
              type="button"
              id="btn-refresh-crm-data"
              onClick={() => {
                setClickedPill('refresh-crm');
                setTimeout(() => setClickedPill(prev => prev === 'refresh-crm' ? null : prev), 480);
                handleRefreshCrmClick();
              }}
              disabled={effectiveRefreshing}
              className={`relative overflow-hidden ${clickedPill === 'refresh-crm' ? 'sidebar-nav-click-shrink-wave' : ''}`}
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '1000px',
                padding: '8px 16px',
                fontSize: '18px',
                fontWeight: 100,
                cursor: effectiveRefreshing ? 'wait' : 'pointer',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                backgroundColor: 'rgb(192 248 252)',
                color: 'rgb(5 112 114)',
                border: 'none',
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title={t("Actualiser les données")}
            >
              <span>{effectiveRefreshing ? t("Actualisation...") : t("Actualiser les données")}</span>
            </button>

            {/* Search Input */}
            <input
              type="text"
              id="search-crm-input"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder="Recherche rapide"
              style={{
                border: '1px solid #dedede',
                borderRadius: '13px',
                padding: '9px 19px',
                fontSize: '18px',
                fontWeight: '100',
                color: '#000000',
                backgroundColor: '#ffffff',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                outline: 'none',
                width: '200px',
              }}
            />

            {/* Nouveau Button */}
            <button
              type="button"
              disabled={!hasCrmSpreadsheet}
              onClick={() => {
                if (!hasCrmSpreadsheet) return;
                openNewTicketPane();
              }}
              id="btn-new-ticket"
              style={{
                ...customButtonStyle,
                boxShadow: 'none',
                opacity: !hasCrmSpreadsheet ? 0.45 : 1,
                cursor: !hasCrmSpreadsheet ? 'not-allowed' : 'pointer',
              }}
              className={!hasCrmSpreadsheet ? 'opacity-50 cursor-not-allowed transition-colors' : 'hover:bg-[#2b48cc] transition-colors'}
              title={!hasCrmSpreadsheet ? "Veuillez renseigner l'URL du Spreadsheet CRM dans les paramètres du tenant." : undefined}
            >
              Nouveau
            </button>
          </div>
        </div>
      </div>

      {/* Header Pills: Gélules de catégories */}
      <div className="px-4 mt-4" id="crm-filter-pills-wrapper">
        <div className="flex flex-wrap gap-3 items-center justify-between" id="crm-category-pills">
          <div className="flex flex-wrap gap-2.5 items-center justify-center sm:justify-start">
            {(['Commercial', 'Réclamation', 'Technique', 'Sans Catégorie'] as const).map((catOpt) => {
              const isSelected = ticketCategoryFilter === catOpt;
              return (
                <button
                  key={catOpt}
                  type="button"
                  onClick={() => {
                    setClickedPill(`cat-${catOpt}`);
                    setTimeout(() => setClickedPill(prev => prev === `cat-${catOpt}` ? null : prev), 480);
                    setTicketCategoryFilter(catOpt);
                  }}
                  className={`relative overflow-hidden select-none ${clickedPill === `cat-${catOpt}` ? 'sidebar-nav-click-shrink-wave' : ''}`}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '1000px',
                    padding: '7px 16px',
                    fontSize: '18px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    backgroundColor: isSelected ? 'rgb(89, 22, 144)' : 'rgb(230, 197, 255)',
                    color: isSelected ? '#fff' : 'rgb(89, 22, 144)',
                    border: 'none',
                    boxShadow: 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {catOpt}
                  {catOpt === 'Commercial' && ` (${countCatCommercial})`}
                  {catOpt === 'Réclamation' && ` (${countCatReclamation})`}
                  {catOpt === 'Technique' && ` (${countCatTechnique})`}
                  {catOpt === 'Sans Catégorie' && ` (${countCatSansCat})`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bulk selection status bar if at least 1 ticket selected */}
      {selectedTicketIds.length > 0 && (
        <div 
          className="p-4 flex items-center justify-between gap-4 animate-fadeIn mx-4" 
          id="crm-bulk-actions-status-bar"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgb(231, 231, 231)',
            borderRadius: '16px',
            maxWidth: '98%',
            margin: '8px auto',
          }}
        >
          <div className="flex items-center gap-2">
            <span 
              className="w-6 h-6 text-white rounded-full flex items-center justify-center text-xs font-bold font-sans shrink-0"
              style={{ backgroundColor: '#2e54ff' }}
            >
              {selectedTicketIds.length}
            </span>
            <span 
              className="font-sans"
              style={{ fontSize: '18px', color: '#000000', fontWeight: '100', cursor: 'default' }}
            >
              Sélectionné(s)
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Supprimer button */}
            <button
              type="button"
              onClick={handleBulkDelete}
              style={rowActionButtonStyle}
              className="hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Supprimer
            </button>

            {/* Email Relance button + system dropdown */}
            <div className="inline-flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  if (!isRelanceEnabled) return;
                  setIsRelanceDropdownOpen(prev => !prev);
                }}
                disabled={!isRelanceEnabled}
                style={{
                  ...rowActionButtonStyle,
                  backgroundColor: isRelanceEnabled ? '#2e54ff' : '#cbd5e1',
                  color: isRelanceEnabled ? '#ffffff' : '#64748b',
                  cursor: isRelanceEnabled ? (isSendingRelance ? 'wait' : 'pointer') : 'not-allowed',
                  opacity: isRelanceEnabled ? 1 : 0.65,
                }}
                className={isRelanceEnabled ? "hover:bg-[#2b48cc] transition-colors cursor-pointer" : "cursor-not-allowed"}
                title={
                  !isRelanceEnabled
                    ? "Email Relance est disponible uniquement pour les tickets de type Commercial ayant une adresse renseignée dans le champ email."
                    : "Choisir un modèle d'email de relance et l'envoyer"
                }
              >
                {isSendingRelance ? 'Envoi en cours...' : 'Email Relance'}
              </button>

              {isRelanceDropdownOpen && isRelanceEnabled && (
                <div className="inline-flex items-center gap-2 animate-fadeIn">
                  <select
                    id="crm-bulk-relance-template-select"
                    value={selectedRelanceTemplateIdx}
                    onChange={(e) => setSelectedRelanceTemplateIdx(Number(e.target.value) as 1 | 2 | 3)}
                    style={{
                      border: '1px solid #dedede',
                      borderRadius: '13px',
                      padding: '8px 14px',
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      cursor: 'pointer',
                      width: 'auto',
                      minWidth: '170px',
                      appearance: 'auto',
                      WebkitAppearance: 'menulist',
                    }}
                  >
                    <option value={1}>Modèle de relance 1</option>
                    <option value={2}>Modèle de relance 2</option>
                    <option value={3}>Modèle de relance 3</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleBulkRelanceEmail(selectedRelanceTemplateIdx)}
                    disabled={isSendingRelance}
                    style={{
                      ...rowActionButtonStyle,
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      cursor: isSendingRelance ? 'wait' : 'pointer',
                    }}
                    className="hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    {isSendingRelance ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              )}
            </div>

            {/* Export CSV button */}
            <button
              type="button"
              onClick={handleBulkExportCSV}
              style={rowActionButtonStyle}
              className="hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Télécharger un fichier CSV avec toutes les colonnes des tickets sélectionnés"
            >
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Feedback banner for email relance dispatch */}
      {relanceBannerMsg && (
        <div 
          className={`p-3.5 mx-4 rounded-xl text-sm font-sans flex items-center justify-between animate-fadeIn ${
            relanceBannerMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
          style={{ maxWidth: '98%', margin: '4px auto' }}
        >
          <span>{relanceBannerMsg.text}</span>
          <button 
            type="button" 
            onClick={() => setRelanceBannerMsg(null)}
            className="text-xs underline ml-4 hover:opacity-75 cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white overflow-hidden mt-4" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div 
          ref={bottomScrollRef}
          className={isTableFitView ? "overflow-x-hidden" : "overflow-x-auto"}
          style={isTableFitView ? { width: '100%', overflowX: 'hidden' } : undefined}
        >
          {filteredTickets.length === 0 ? (
            <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
          ) : (
            <table 
              ref={tableRef}
              className="w-full text-left font-sans border-collapse text-sm" 
              id="crm-table" 
              style={{ 
                border: '0px solid transparent',
                ...(isTableFitView ? {
                  zoom: tableFitScale,
                  width: `${naturalTableWidthRef.current || 1650}px`,
                  minWidth: `${naturalTableWidthRef.current || 1650}px`,
                  transition: 'zoom 0.15s ease'
                } : {
                  width: '100%',
                  minWidth: '100%'
                })
              }}
            >
              <thead>
                <tr className="bg-white">
                  {/* Select All Radio-Check Column */}
                  <th className="px-4 py-3.5 w-12 text-center select-none whitespace-nowrap" style={{ cursor: 'default', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      id="crm-select-all-checkbox"
                      className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center focus:outline-hidden cursor-pointer mx-auto ${
                        isAllFilteredSelected
                          ? 'border-[#2e54ff] bg-transparent'
                          : 'border-slate-400 bg-white hover:border-[#2e54ff]'
                      }`}
                      style={{ borderWidth: '2.5px' }}
                      role="checkbox"
                      aria-checked={isAllFilteredSelected}
                      title={isAllFilteredSelected ? "Tout désélectionner" : "Tout sélectionner"}
                    >
                      {isAllFilteredSelected && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#2e54ff]" />
                      )}
                    </button>
                  </th>

                  {activeOrderedColumns.map((col) => {
                    const isCentered = col.id === 'cp_comm' || col.id === 'famille_comm' || col.id === 'cp_noncomm';
                    return (
                      <th
                        key={col.id}
                        className={`px-4 py-3.5 whitespace-nowrap ${isCentered ? 'text-center' : ''}`}
                        style={thStyle}
                      >
                        {col.label}
                      </th>
                    );
                  })}

                  <th className="px-4 py-3.5 text-right whitespace-nowrap" style={{ ...thStyle, minWidth: '280px' }}>Actions.</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => {
                  const isChecked = selectedTicketIds.includes(t.id);
                  const refVal = t.reference || t.id;
                  const critVal = t.criticite || 'Non renseigné';
                  const sitVal = t.situation || (t.status === 'Résolu' ? 'Terminé' : t.status) || 'Nouveau';
                  const rawOuvVal = t.dateOuverture || t.date || '';
                  const ouvVal = formatDateDisplay(rawOuvVal);
                  const weekNum = getWeekNumberString(rawOuvVal);
                  const indicatifPostalVal = t.indicatifPostal || (t.client ? clients.find(c => (c.denomination || (c as any).name || c.id) === t.client)?.codePostal?.slice(0, 2) : '') || '—';
                  const cliVal = t.client || t.customClientName || 'Autre';
                  const colVal = t.collaborateur || 'Non attribué';
                  const rawObjet = t.objet || '';
                  const truncatedObjet = rawObjet.length > 40 ? rawObjet.substring(0, 40) + '...' : rawObjet;
                  const rawDescCourte = (t.descriptionOffreDevis || t.objet || t.description || '').replace(/\r?\n/g, ' ').trim();
                  const truncatedDescCourte = rawDescCourte.length > 40 ? rawDescCourte.slice(0, 40) + '...' : (rawDescCourte || '—');
                  const montantHtVal = t.totalAffaireHT !== undefined && t.totalAffaireHT !== null && String(t.totalAffaireHT).trim() !== ''
                    ? `${Number(String(t.totalAffaireHT).replace(',', '.')).toLocaleString('fr-FR')} €`
                    : '—';

                  const renderColumnCell = (colId: string) => {
                    switch (colId) {
                      case 'ref_comm':
                      case 'ref_noncomm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap">
                            <span style={geluleStyle}>{refVal}</span>
                          </td>
                        );
                      case 'sit_comm':
                      case 'sit_noncomm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap">
                            <span style={geluleStyle}>{sitVal}</span>
                          </td>
                        );
                      case 'ouv_comm':
                      case 'ouv_noncomm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            <div className="inline-flex items-center gap-2">
                              <span>{ouvVal}</span>
                              {weekNum && (
                                <span 
                                  className="inline-flex items-center justify-center rounded-full text-white font-bold font-sans select-none"
                                  style={{ 
                                    width: '40px', 
                                    height: '40px', 
                                    minWidth: '25px', 
                                    minHeight: '25px', 
                                    marginLeft: '10px', 
                                    fontSize: '16px', 
                                    backgroundColor: '#8f1961',
                                    border: 'none',
                                    outline: 'none',
                                    boxShadow: 'none'
                                  }}
                                  title={`Semaine ${weekNum}`}
                                >
                                  {weekNum}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      case 'famille_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap text-center" style={cellTextStyle}>
                            <span className="font-bold text-slate-900">{t.famille || '—'}</span>
                          </td>
                        );
                      case 'sitdevis_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap">
                            <span style={geluleStyle}>{t.situationDevis || 'Non renseigné'}</span>
                          </td>
                        );
                      case 'typeclient_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.typeStructure || t.situationInterlocuteur || '—'}
                          </td>
                        );
                      case 'cli_comm':
                      case 'cli_noncomm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap">
                            <span style={geluleStyle} title={t.email ? `Email : ${t.email}` : undefined}>
                              {cliVal}
                            </span>
                          </td>
                        );
                      case 'cp_comm':
                      case 'cp_noncomm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap text-center" style={cellTextStyle}>
                            <span className="font-semibold text-slate-800">{indicatifPostalVal}</span>
                          </td>
                        );
                      case 'lead_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.origineLead || '—'}
                          </td>
                        );
                      case 'interloc_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.prenomNom || '—'}
                          </td>
                        );
                      case 'tel_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.telephone || t.phone || '—'}
                          </td>
                        );
                      case 'email_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.email || '—'}
                          </td>
                        );
                      case 'datedevis_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {formatDateDisplay(t.dateDevis)}
                          </td>
                        );
                      case 'montantht_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {montantHtVal}
                          </td>
                        );
                      case 'typevente_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.typeVente || '—'}
                          </td>
                        );
                      case 'desccourte_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle} title={rawDescCourte}>
                            {truncatedDescCourte}
                          </td>
                        );
                      case 'derrelance_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {formatDateDisplay(t.dateDerniereRelance)}
                          </td>
                        );
                      case 'prorelance_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {formatDateDisplay(t.dateProchaineRelance)}
                          </td>
                        );
                      case 'datecde_comm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {formatDateDisplay(t.dateCommande)}
                          </td>
                        );
                      case 'objet_noncomm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap max-w-[260px] truncate" style={cellTextStyle} title={rawObjet}>
                            {truncatedObjet}
                          </td>
                        );
                      case 'collab_comm':
                      case 'collab_noncomm':
                        return (
                          <td key={colId} className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {colVal}
                          </td>
                        );
                      default:
                        return null;
                    }
                  };

                  return (
                    <tr 
                      key={t.id} 
                      onClick={() => openEditTicketPane(t)}
                      className={`group hover:bg-[#f5f7fa] transition-all cursor-pointer ${isChecked ? 'bg-[#f5f7fa]' : ''}`}
                    >
                      {/* Row selection Radio Check */}
                      <td 
                        className="px-4 py-4 whitespace-nowrap text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectOne(t.id, e);
                          }}
                          className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center focus:outline-hidden cursor-pointer mx-auto ${
                            isChecked
                              ? 'border-[#2e54ff] bg-transparent'
                              : 'border-slate-400 bg-white hover:border-[#2e54ff]'
                          }`}
                          style={{ borderWidth: '2.5px' }}
                          role="checkbox"
                          aria-checked={isChecked}
                        >
                          {isChecked && (
                            <span className="w-2.5 h-2.5 rounded-full bg-[#2e54ff]" />
                          )}
                        </button>
                      </td>

                      {activeOrderedColumns.map((col) => renderColumnCell(col.id))}

                      {/* Actions. */}
                      <td 
                        className="px-4 py-4 whitespace-nowrap text-right pr-6"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditTicketPane(t);
                            }}
                            style={{
                              ...rowActionButtonStyle,
                              backgroundColor: '#2e54ff',
                              color: '#ffffff',
                              border: 'none',
                            }}
                            className="hover:bg-[#2b48cc] transition-colors"
                          >
                            Gérer
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickSituationDevis(t.id, 'Gagné');
                            }}
                            style={{
                              ...rowActionButtonStyle,
                              backgroundColor: t.situationDevis === 'Gagné' ? '#16a34a' : '#0f172a',
                              color: '#ffffff',
                              border: 'none',
                            }}
                            className="hover:opacity-90 transition-colors"
                          >
                            Gagné
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickSituationDevis(t.id, 'Perdu');
                            }}
                            style={{
                              ...rowActionButtonStyle,
                              backgroundColor: t.situationDevis === 'Perdu' ? '#dc2626' : '#0f172a',
                              color: '#ffffff',
                              border: 'none',
                            }}
                            className="hover:opacity-90 transition-colors"
                          >
                            Perdu
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTicket(t.id);
                            }}
                            style={rowActionButtonStyle}
                            className="hover:bg-zinc-800 transition-colors"
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Bottom Table Summary Stats (like Défibrillateurs) */}
      <div 
        className="p-4 font-sans flex flex-col sm:flex-row items-center justify-between gap-4" 
        id="crm-tab-total-summary"
      >
        <div style={{ fontSize: '18px', color: '#000000', fontWeight: 'bold', cursor: 'default' }}>
          {(() => {
            const totalVolume = filteredTickets.reduce((acc, item) => {
              const raw = item.totalAffaireHT;
              if (raw === undefined || raw === null || String(raw).trim() === '') return acc;
              const num = parseFloat(String(raw).replace(/\s/g, '').replace(',', '.'));
              return isNaN(num) ? acc : acc + num;
            }, 0);
            const formattedVol = Number.isInteger(totalVolume)
              ? totalVolume.toLocaleString('fr-FR')
              : totalVolume.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return `Nombre de ligne(s): ${filteredTickets.length}. Volume Affaire(s) HT: ${formattedVol}.`;
          })()}
        </div>
      </div>

      {/* SIDE PANE DRAWER (MODAL / SLIDE-OVER) - Enlarged side-pane for comfortable form layout */}
      {isPaneOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Overlay backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setIsPaneOpen(false)}
          />

          {/* Drawer container: enlarged (max-w-3xl / max-w-4xl) to provide ample visual space */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="w-screen max-w-2xl sm:max-w-3xl lg:max-w-4xl bg-white shadow-2xl flex flex-col p-6 sm:p-8 overflow-y-auto">
              
              {/* Form */}
              <form onSubmit={handleSaveForm} className="space-y-6 flex-1 flex flex-col justify-between pt-2">
                <div className="space-y-6">
                  {/* 1. Situation: Toggle glissant de 3 items */}
                  <div 
                    className="flex p-1 rounded-xl bg-white select-none transition-all"
                    style={{
                      border: '1px solid #dadada',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    {(['Nouveau', 'En cours', 'Terminé'] as const).map((sit) => {
                      const isSelected = formSituation === sit;
                      return (
                        <button
                          key={sit}
                          type="button"
                          onClick={() => setFormSituation(sit)}
                          id={`crm-situation-${sit.toLowerCase().replace(/\s+/g, '-')}`}
                          className={`flex-1 py-2.5 px-3 font-bold transition-all cursor-pointer flex items-center justify-center text-center ${
                            isSelected 
                              ? '' 
                              : 'text-black hover:bg-slate-50'
                          }`}
                          style={
                            isSelected
                              ? {
                                  fontSize: '18px',
                                  backgroundColor: 'rgb(143 25 97)',
                                  color: 'rgb(255 255 255)',
                                  border: 'none',
                                  borderRadius: '13px',
                                  fontFamily: 'DefibeoMain, Civilprom, sans-serif',
                                }
                              : {
                                  fontSize: '18px',
                                  backgroundColor: 'transparent',
                                  color: '#000000',
                                  border: 'none',
                                  borderRadius: '13px',
                                  fontFamily: 'DefibeoMain, Civilprom, sans-serif',
                                }
                          }
                        >
                          {sit}
                        </button>
                      );
                    })}
                  </div>

                  {/* 2 & 3. Référence, Dates & Catégorie, Criticité, Collaborateur: Collées verticalement */}
                  <div className="flex flex-col">
                    {/* Première div parente : border-radius en bas à droite et bas à gauche 0px et border-bottom 0px */}
                    <div 
                      className="grid grid-cols-3 gap-3"
                      style={{
                        border: '1px solid rgb(218, 218, 218)',
                        borderBottom: '0px',
                        borderTopLeftRadius: '14px',
                        borderTopRightRadius: '14px',
                        borderBottomLeftRadius: '0px',
                        borderBottomRightRadius: '0px',
                        boxShadow: 'rgba(0, 0, 0, 0.06) 0px 2px 8px -2px',
                        padding: '20px',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      <div>
                        <label>Référence.</label>
                        <input
                          type="text"
                          value={formRef}
                          disabled
                          readOnly
                          style={{ fontSize: '18px', backgroundColor: '#f1f5f9', color: '#0f172a', cursor: 'not-allowed' }}
                        />
                      </div>

                      <div>
                        <label>Ouverture.</label>
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            value={formOuverture}
                            onChange={(e) => setFormOuverture(e.target.value)}
                            placeholder="DD/MM/YYYY"
                            style={{
                              fontSize: '18px',
                              backgroundColor: '#ffffff',
                              color: '#000000',
                              paddingRight: getWeekNumberString(formOuverture) ? '70px' : undefined
                            }}
                          />
                          {getWeekNumberString(formOuverture) && (
                            <div 
                              className="absolute right-3 flex items-center justify-center rounded-full text-white font-bold font-sans pointer-events-none select-none"
                              style={{
                                width: '35px',
                                height: '35px',
                                minWidth: '25px',
                                minHeight: '25px',
                                marginLeft: '10px',
                                fontSize: '13px',
                                backgroundColor: 'rgb(143, 25, 97)',
                                border: 'none',
                                outline: 'none',
                                boxShadow: 'none'
                              }}
                              title={`Semaine ${getWeekNumberString(formOuverture)}`}
                            >
                              {getWeekNumberString(formOuverture)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label>Actualisation.</label>
                        <input
                          type="text"
                          value={formDerActual}
                          disabled
                          readOnly
                          style={{ fontSize: '18px', backgroundColor: '#f1f5f9', color: '#0f172a', cursor: 'not-allowed' }}
                        />
                      </div>
                    </div>

                    {/* Div parente du dessous : border-radius en haut à droite et en haut à gauche 0px */}
                    <div 
                      className="grid grid-cols-2 gap-3"
                      style={{
                        border: '1px solid rgb(218, 218, 218)',
                        borderTopLeftRadius: '0px',
                        borderTopRightRadius: '0px',
                        borderBottomLeftRadius: '14px',
                        borderBottomRightRadius: '14px',
                        boxShadow: 'rgba(0, 0, 0, 0.06) 0px 2px 8px -2px',
                        padding: '20px',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      <div>
                        <label>Catégorie.</label>
                        <select
                          id="crm-form-categorie-select"
                          value={formCategorie}
                          onChange={(e: any) => {
                            const val = e.target.value;
                            setFormCategorie(val);
                            if (val === 'Commercial' && formTypeStructure === 'Collectivité') {
                              setFormMarchePublic('Oui');
                            }
                          }}
                          disabled={Boolean(editingTicketId && (tickets.find(t => t.id === editingTicketId)?.categorie === 'Commercial' || formCategorie === 'Commercial'))}
                        style={{
                          ...selectStyle,
                          textAlign: 'center',
                          textAlignLast: 'center',
                          ...(Boolean(editingTicketId && (tickets.find(t => t.id === editingTicketId)?.categorie === 'Commercial' || formCategorie === 'Commercial'))
                            ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b', opacity: 0.85 }
                            : {})
                        }}
                        className="text-center"
                        title={Boolean(editingTicketId && formCategorie === 'Commercial') ? "La catégorie d'un ticket Commercial ne peut pas être modifiée." : undefined}
                      >
                        <option value="Technique">Technique</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Réclamation">Réclamation</option>
                        <option value="Sans Catégorie">Sans Catégorie</option>
                      </select>
                    </div>

                    <div>
                      <label>Collaborateur.</label>
                      <select
                        value={formCollaborateur}
                        onChange={(e) => setFormCollaborateur(e.target.value)}
                        style={{ ...selectStyle, textAlign: 'center', textAlignLast: 'center' }}
                        className="text-center"
                      >
                        <option value="Non attribué">Non attribué</option>
                        {members.map((m) => (
                          <option key={m.id || m.email || m.name} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  </div>

                  {/* 4. Section: Client ou Prospect, Email, Situation/Structure, Contact, Objet, Description (sans padding, border, ni shadow) */}
                  <div 
                    className="space-y-4"
                    style={{
                      border: 'none',
                      boxShadow: 'none',
                      borderRadius: '0px',
                      padding: '0px',
                      backgroundColor: 'transparent'
                    }}
                  >
                    {/* Client ou Prospect */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label>Client ou Prospect.</label>
                        <button
                          type="button"
                          onClick={() => setIsSidePaneClientOpen(true)}
                          className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                          style={{ textDecoration: 'none' }}
                        >
                          Rechercher
                        </button>
                      </div>
                      <select
                        value={formClientSelect}
                        onChange={(e) => handleClientChange(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="Autre">Autre</option>
                        {clients.map((c) => {
                          const cName = c.denomination || (c as any).name || c.id || 'Client';
                          const cEmail = c.email || c.emailSite || '';
                          const labelText = cEmail ? `${cName} (${cEmail})` : cName;
                          return (
                            <option key={c.id || cName} value={cName}>
                              {labelText}
                            </option>
                          );
                        })}
                      </select>

                      {/* Manual input if "Autre" is selected */}
                      {formClientSelect === 'Autre' && (
                        <div className="mt-2">
                          <input
                            type="text"
                            placeholder="Dénomination du prospect."
                            value={formCustomClientName}
                            onChange={(e) => setFormCustomClientName(e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Payeur ID. & Client ID. (50/50 disabled, auto-populated from selected client) */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label>Payeur ID.</label>
                        <input
                          type="text"
                          value={formPayeurId}
                          disabled
                          placeholder="—"
                        />
                      </div>
                      <div>
                        <label>Client ID.</label>
                        <input
                          type="text"
                          value={formClientId}
                          disabled
                          placeholder="—"
                        />
                      </div>
                    </div>

                    {/* Email. (distinct field auto-populated upon client selection, editable) */}
                    <div>
                      <label>Email.</label>
                      <input
                        type="email"
                        placeholder="Entrez un email valide."
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    </div>

                    {/* Situation Interlocuteur & Type Structure (4 options sur la même ligne : 2 options + 2 options) */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {/* Situation Interlocuteur (Prospect / Client) */}
                      <div>
                        <label>Situation Interlocuteur.</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['Prospect', 'Client'] as const).map((sit) => {
                            const isSelected = formSituationInterlocuteur === sit;
                            return (
                              <div
                                key={sit}
                                onClick={() => setFormSituationInterlocuteur(sit)}
                                className="flex items-center justify-start gap-2 p-2.5 sm:p-3 rounded-xl cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
                                style={{ border: '1px solid #dadada' }}
                              >
                                <span 
                                  className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                                  style={{
                                    border: isSelected ? '2.5px solid #2e54ff' : '2.5px solid #cbd5e1',
                                    width: '18px',
                                    height: '18px',
                                    minWidth: '18px',
                                    minHeight: '18px',
                                    backgroundColor: '#ffffff'
                                  }}
                                >
                                  {isSelected && (
                                    <span className="rounded-full bg-[#2e54ff]" style={{ width: '8px', height: '8px' }} />
                                  )}
                                </span>
                                <span className="text-[18px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap" style={{ fontSize: '18px' }}>
                                  {sit}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Type Structure (Collectivité / Entreprise) */}
                      <div>
                        <label>Type Structure.</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['Collectivité', 'Entreprise'] as const).map((typ) => {
                            const isSelected = formTypeStructure === typ;
                            return (
                              <div
                                key={typ}
                                onClick={() => {
                                  setFormTypeStructure(typ);
                                  if (typ === 'Collectivité' && formCategorie === 'Commercial') {
                                    setFormMarchePublic('Oui');
                                  }
                                }}
                                className="flex items-center justify-start gap-2 p-2.5 sm:p-3 rounded-xl cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
                                style={{ border: '1px solid #dadada' }}
                              >
                                <span 
                                  className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                                  style={{
                                    border: isSelected ? '2.5px solid #2e54ff' : '2.5px solid #cbd5e1',
                                    width: '18px',
                                    height: '18px',
                                    minWidth: '18px',
                                    minHeight: '18px',
                                    backgroundColor: '#ffffff'
                                  }}
                                >
                                  {isSelected && (
                                    <span className="rounded-full bg-[#2e54ff]" style={{ width: '8px', height: '8px' }} />
                                  )}
                                </span>
                                <span className="text-[18px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap" style={{ fontSize: '18px' }}>
                                  {typ}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Prénom Nom, Fonction & Téléphone sur la même ligne (3 colonnes) */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label>Prénom Nom.</label>
                        <input
                          type="text"
                          placeholder="Ex: Jean Dupont."
                          value={formPrenomNom}
                          onChange={(e) => setFormPrenomNom(e.target.value)}
                        />
                      </div>

                      <div>
                        <label>Fonction.</label>
                        <input
                          type="text"
                          placeholder="Ex: Responsable des achats."
                          value={formFonction}
                          onChange={(e) => setFormFonction(e.target.value)}
                        />
                      </div>

                      <div>
                        <label>Téléphone.</label>
                        <input
                          type="tel"
                          placeholder="Ex: 06 12 34 56 78."
                          value={formTelephone}
                          onChange={(e) => setFormTelephone(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Objet */}
                    <div>
                      <label>Objet.</label>
                      <input
                        type="text"
                        maxLength={55}
                        placeholder="Entrez un titre court."
                        value={formObjet}
                        onChange={(e) => setFormObjet(e.target.value)}
                        required
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label>Description.</label>
                      <textarea
                        ref={descriptionTextareaRef}
                        id="crm-form-description-textarea"
                        placeholder="Entrez une description détaillée."
                        value={formDescription}
                        onInput={adjustDescriptionHeight}
                        onChange={(e) => {
                          setFormDescription(e.target.value);
                          adjustDescriptionHeight();
                        }}
                        rows={1}
                        style={{
                          resize: 'none',
                          overflow: 'hidden',
                          minHeight: '44px',
                          lineHeight: '1.5',
                          display: 'block',
                          width: '100%',
                        }}
                      />
                    </div>
                  </div>

                  {/* 5. SPECIFIC FIELDS WHEN CATEGORY IS « Commercial » */}
                  {formCategorie === 'Commercial' && (
                    <div 
                      className="space-y-4 animate-fadeIn"
                      style={{
                        border: '1px solid rgb(218, 218, 218)',
                        boxShadow: 'rgba(0, 0, 0, 0.06) 0px 2px 8px -2px',
                        borderRadius: '14px',
                        padding: '20px',
                        backgroundColor: '#ffffff'
                      }}
                      id="crm-commercial-section"
                    >
                      {/* Marché Public (40%) & Situation Devis (60%) sur la même ligne (2 + 3 options = 5 options) */}
                      <div className="grid grid-cols-5 gap-x-6 gap-y-3">
                        {/* Marché Public (2 cols = 40%) */}
                        <div className="col-span-2">
                          <label>Marché Public.</label>
                          <div className="grid grid-cols-2 gap-2">
                            {(['Oui', 'Non'] as const).map((opt) => {
                              const isSelected = formMarchePublic === opt;
                              return (
                                <div
                                  key={opt}
                                  onClick={() => setFormMarchePublic(opt)}
                                  className="flex items-center justify-start gap-2 p-2.5 sm:p-3 rounded-xl cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
                                  style={{ border: '1px solid #dadada' }}
                                >
                                  <span 
                                    className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                                    style={{
                                      border: isSelected ? '2.5px solid #2e54ff' : '2.5px solid #cbd5e1',
                                      width: '18px',
                                      height: '18px',
                                      minWidth: '18px',
                                      minHeight: '18px',
                                      backgroundColor: '#ffffff'
                                    }}
                                  >
                                    {isSelected && (
                                      <span className="rounded-full bg-[#2e54ff]" style={{ width: '8px', height: '8px' }} />
                                    )}
                                  </span>
                                  <span className="text-[18px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap" style={{ fontSize: '18px' }}>
                                    {opt}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Situation Devis (3 cols = 60%) */}
                        <div className="col-span-3">
                          <label>Situation Devis.</label>
                          <div className="grid grid-cols-3 gap-2">
                            {(['Gagné', 'Perdu', 'Non renseigné'] as const).map((sitDevis) => {
                              const isSelected = formSituationDevis === sitDevis;
                              return (
                                <div
                                  key={sitDevis}
                                  onClick={() => setFormSituationDevis(sitDevis)}
                                  className="flex items-center justify-start gap-2 p-2.5 sm:p-3 rounded-xl cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
                                  style={{ border: '1px solid #dadada' }}
                                >
                                  <span 
                                    className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                                    style={{
                                      border: isSelected ? '2.5px solid #2e54ff' : '2.5px solid #cbd5e1',
                                      width: '18px',
                                      height: '18px',
                                      minWidth: '18px',
                                      minHeight: '18px',
                                      backgroundColor: '#ffffff'
                                    }}
                                  >
                                    {isSelected && (
                                      <span className="rounded-full bg-[#2e54ff]" style={{ width: '8px', height: '8px' }} />
                                    )}
                                  </span>
                                  <span className="text-[18px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap" style={{ fontSize: '18px' }}>
                                    {sitDevis}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Score Potentiel Conversion à gauche, Référence Devis au centre & Type Vente à droite */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3 items-end">
                        {/* Score Potentiel Conversion (5 ronds 1 à 5 avec toggle select/deselect) */}
                        <div>
                          <label>Score Potentiel Conversion.</label>
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            {[1, 2, 3, 4, 5].map((scoreNum) => {
                              const isSelected = formScoreConversion === scoreNum;
                              return (
                                <button
                                  key={scoreNum}
                                  type="button"
                                  onClick={() => setFormScoreConversion(prev => prev === scoreNum ? null : scoreNum)}
                                  style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '17px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                    backgroundColor: isSelected ? '#0f172a' : '#ffffff',
                                    color: isSelected ? '#ffffff' : '#000000',
                                    border: isSelected ? '1px solid #000000' : '1px solid #dadada',
                                    boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.2)' : 'none',
                                    transition: 'all 0.15s ease'
                                  }}
                                  className="hover:scale-105 active:scale-95 transition-transform"
                                  title={`Score : ${scoreNum}`}
                                >
                                  {scoreNum}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Référence Devis */}
                        <div>
                          <label>Référence Devis.</label>
                          <input
                            type="text"
                            placeholder="Entrez la référence de l’offre."
                            value={formReferenceDevis}
                            onChange={(e) => setFormReferenceDevis(e.target.value)}
                          />
                        </div>

                        {/* Type Vente à droite de Référence Devis */}
                        <div>
                          <label>Type Vente.</label>
                          <select
                            value={formTypeVente}
                            onChange={(e) => setFormTypeVente(e.target.value)}
                            style={selectStyle}
                          >
                            <option value="">Sélectionner...</option>
                            <option value="Achat">Achat</option>
                            <option value="Location">Location</option>
                            <option value="Revendeur">Revendeur</option>
                          </select>
                        </div>
                      </div>

                      {/* Catégorie Devis. */}
                      <div>
                        <label>Catégorie Devis.</label>
                        <select
                          value={formCategorieDevis}
                          onChange={(e) => setFormCategorieDevis(e.target.value)}
                          style={selectStyle}
                        >
                          <option value="Défibrillateur">Défibrillateur</option>
                          <option value="Maintenance">Maintenance</option>
                          <option value="Consommable(s)">Consommable(s)</option>
                          <option value="Formation">Formation</option>
                          <option value="Grand compte">Grand compte</option>
                          <option value="Revendeur">Revendeur</option>
                          <option value="Autres">Autres</option>
                        </select>
                      </div>

                      {/* Indicateur Temps Devis. */}
                      <div>
                        <label>Indicateur Temps Devis.</label>
                        <select
                          value={formIndicateurTempsDevis}
                          onChange={(e) => setFormIndicateurTempsDevis(e.target.value)}
                          style={selectStyle}
                        >
                          <option value="Validation de budget">Validation de budget</option>
                          <option value="Vente via revendeur">Vente via revendeur</option>
                          <option value="Plateforme d’achat">Plateforme d’achat</option>
                          <option value="Autre">Autre</option>
                        </select>
                      </div>

                      {/* Full width en dessous : Zone de drop de document + toggle + sub-divs */}
                      <div className="space-y-2">
                        <div
                          onClick={() => {
                            if (!googleDriveActive || isUploadingFile || formFichiersDevis.length >= 3) return;
                            fileInputRef.current?.click();
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!googleDriveActive || isUploadingFile || formFichiersDevis.length >= 3) return;
                            setIsDraggingFile(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDraggingFile(false);
                          }}
                          onDrop={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDraggingFile(false);
                            if (!googleDriveActive || isUploadingFile || formFichiersDevis.length >= 3) return;
                            const droppedFile = e.dataTransfer?.files?.[0];
                            if (droppedFile) {
                              await processUploadedFile(droppedFile);
                            }
                          }}
                          style={{
                            border: isDraggingFile ? '2px dashed #2e54ff' : '1.5px dashed #cbd5e1',
                            backgroundColor: isDraggingFile ? '#eff6ff' : '#f8fafc',
                            borderRadius: '14px',
                            padding: '22px 16px',
                            textAlign: 'center',
                            cursor: !googleDriveActive || isUploadingFile || formFichiersDevis.length >= 3 ? 'not-allowed' : 'pointer',
                            opacity: !googleDriveActive || formFichiersDevis.length >= 3 ? 0.65 : 1,
                            transition: 'all 0.15s ease',
                          }}
                          title={
                            !googleDriveActive
                              ? "Connecteur Google Drive inactif dans les réglages"
                              : formFichiersDevis.length >= 3
                              ? "Maximum 3 fichiers autorisés par ticket"
                              : "Cliquez ou glissez-déposez un document"
                          }
                        >
                          <div
                            className="font-sans font-semibold text-slate-900 select-none"
                            style={{ fontSize: '18px', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
                          >
                            {isUploadingFile
                              ? 'Téléchargement en cours...'
                              : formFichiersDevis.length >= 3
                              ? 'Déposez un fichier (Max. 3 fichiers atteint)'
                              : 'Déposez un fichier'}
                          </div>

                          {/* Toggle ON/OFF : Il s'agit d'un autre fichier. */}
                          <div
                            className="mt-3 inline-flex items-center justify-center gap-2.5 select-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isAutreFichierToggle}
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsAutreFichierToggle(prev => !prev);
                              }}
                              style={{
                                width: '42px',
                                height: '24px',
                                borderRadius: '9999px',
                                backgroundColor: isAutreFichierToggle ? '#2e54ff' : '#cbd5e1',
                                position: 'relative',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease',
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                              }}
                            >
                              <span
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  backgroundColor: '#ffffff',
                                  transform: isAutreFichierToggle ? 'translateX(21px)' : 'translateX(3px)',
                                  transition: 'transform 0.2s ease',
                                  display: 'block',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                }}
                              />
                            </button>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsAutreFichierToggle(prev => !prev);
                              }}
                              style={{
                                fontSize: '15px',
                                fontWeight: 500,
                                color: '#334155',
                                cursor: 'pointer',
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                              }}
                            >
                              Il s'agit d'un autre fichier.
                            </span>
                          </div>

                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                          />
                        </div>

                        {/* Sub-div affichant les fichiers attachés sans label */}
                        {formFichiersDevis.length > 0 && (
                          <div className="space-y-2 pt-1">
                            {formFichiersDevis.map((f, idx) => {
                              const displayName = f.name.length > 15 ? `${f.name.slice(0, 15)}...` : f.name;
                              return (
                                <div 
                                  key={idx}
                                  className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl shadow-xs flex-wrap"
                                  style={{ border: '1px solid #dadada' }}
                                >
                                  <div className="flex items-center gap-4 text-[16px] text-black font-sans">
                                    <span className="font-semibold text-black whitespace-nowrap">
                                      {f.dateAjout}
                                    </span>
                                    <span className="font-medium text-black whitespace-nowrap" title={f.name}>
                                      {displayName}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      className="crm-file-type-select"
                                      value={f.typeFichier || ''}
                                      onChange={(e) => {
                                        const newType = e.target.value as CommercialFileAttachment['typeFichier'];
                                        setFormFichiersDevis(prev =>
                                          prev.map((item, i) => (i === idx ? { ...item, typeFichier: newType } : item))
                                        );
                                      }}
                                    >
                                      <option value="" disabled hidden>Type Fichier.</option>
                                      <option value="Principal" hidden>Principal</option>
                                      <option value="Devis">Devis</option>
                                      <option value="Facture">Facture</option>
                                      <option value="Autre">Autre</option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => window.open(f.url, '_blank', 'noopener,noreferrer')}
                                      style={{
                                        backgroundColor: '#0f172a',
                                        color: '#ffffff',
                                        borderRadius: '10px',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        padding: '6px 14px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                      }}
                                      className="hover:bg-zinc-800 transition-colors"
                                    >
                                      Aperçu
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFormFichiersDevis(prev => prev.filter((_, i) => i !== idx));
                                      }}
                                      style={{
                                        backgroundColor: 'rgb(203, 20, 20)',
                                        color: '#ffffff',
                                        borderRadius: '10px',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        padding: '6px 14px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                      }}
                                      className="hover:bg-red-700 transition-colors"
                                    >
                                      Supprimer
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Description Offre Devis. (limité à max 55 caractères) */}
                      <div>
                        <label>Description Offre Devis.</label>
                        <input
                          type="text"
                          maxLength={55}
                          placeholder="Entrez un résumé court de l’offre."
                          value={formDescriptionOffreDevis}
                          onChange={(e) => setFormDescriptionOffreDevis(e.target.value)}
                        />
                      </div>

                      {/* Total Affaire / Famille / Indicatif Postal / Origine Lead (4 cols équitables sur la même ligne) */}
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label>Total Affaire HT.</label>
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={formTotalAffaireHT}
                              onChange={(e) => setFormTotalAffaireHT(e.target.value)}
                              style={{ paddingRight: '48px' }}
                            />
                            <span className="absolute right-3 text-xs font-semibold font-sans pointer-events-none" style={{ color: '#000000' }}>
                              € HT
                            </span>
                          </div>
                        </div>

                        <div>
                          <label>Famille.</label>
                          <input
                            type="text"
                            maxLength={1}
                            placeholder="Ex: A."
                            value={formFamille}
                            onChange={(e) => setFormFamille(e.target.value.slice(0, 1).toUpperCase())}
                            style={{ textTransform: 'uppercase', textAlign: 'center', fontSize: '18px', fontWeight: 600 }}
                          />
                        </div>

                        <div>
                          <label>Indicatif Postal.</label>
                          <input
                            type="text"
                            maxLength={2}
                            placeholder="Ex: 49."
                            value={formIndicatifPostal}
                            onChange={(e) => setFormIndicatifPostal(e.target.value.replace(/\D/g, '').slice(0, 2))}
                            style={{ textAlign: 'center', fontSize: '18px', fontWeight: 600 }}
                          />
                        </div>

                        <div>
                          <label>Origine Lead.</label>
                          <select
                            value={formOrigineLead}
                            onChange={(e) => setFormOrigineLead(e.target.value)}
                            style={selectStyle}
                          >
                            <option value="Service Client">Service Client</option>
                            <option value="Direct">Direct</option>
                            <option value="Internet">Internet</option>
                            <option value="Planification">Planification</option>
                            <option value="Autre">Autre</option>
                          </select>
                        </div>
                      </div>

                      {/* Dates commerciales : Date Devis., Date Dernière Relance., Date Prochaine Relance., Date Commande. */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label>Date Devis.</label>
                          <input
                            type="date"
                            value={formDateDevis}
                            onChange={(e) => setFormDateDevis(e.target.value)}
                          />
                        </div>
                        <div>
                          <label>Date Dernière Relance.</label>
                          <input
                            type="date"
                            value={formDateDerniereRelance}
                            onChange={(e) => setFormDateDerniereRelance(e.target.value)}
                          />
                        </div>
                        <div>
                          <label>Date Prochaine Relance.</label>
                          <input
                            type="date"
                            value={formDateProchaineRelance}
                            onChange={(e) => setFormDateProchaineRelance(e.target.value)}
                          />
                        </div>
                        <div>
                          <label>Date Commande.</label>
                          <input
                            type="date"
                            value={formDateCommande}
                            onChange={(e) => setFormDateCommande(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Sub-form: Événement(s) suivi pré-vente */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="!mb-0">Événement(s) suivi pré-vente.</label>
                          <button
                            type="button"
                            onClick={handleAddCommercialEvent}
                            disabled={formCommercialEvents.length >= 5}
                            style={{
                              backgroundColor: '#0f172a',
                              color: '#ffffff',
                              borderRadius: '13px',
                              fontSize: '18px',
                              padding: '10px 19px',
                              border: 'none',
                              cursor: formCommercialEvents.length >= 5 ? 'not-allowed' : 'pointer',
                              opacity: formCommercialEvents.length >= 5 ? 0.45 : 1,
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                            }}
                            className={formCommercialEvents.length >= 5 ? 'transition-colors' : 'hover:bg-zinc-800 transition-colors'}
                          >
                            Nouvel événement
                          </button>
                        </div>

                        {formCommercialEvents.length > 0 && (
                          <div className="space-y-3">
                            {formCommercialEvents.map((evt) => {
                              const toInputDate = (d: string) => {
                                if (!d) return '';
                                if (d.includes('/')) return d.split('/').reverse().join('-');
                                return d;
                              };
                              const fromInputDate = (d: string) => {
                                if (!d) return '';
                                if (d.includes('-')) return d.split('-').reverse().join('/');
                                return d;
                              };
                              return (
                                <div key={evt.id} className="p-3.5 bg-white rounded-xl space-y-2.5 shadow-xs" style={{ border: '1px solid #dadada' }}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div style={{ width: '180px', maxWidth: '180px' }} className="shrink-0">
                                      <label className="text-xs !font-semibold text-slate-600 !mb-1">Date.</label>
                                      <div className="relative flex items-center">
                                        <input
                                          type="date"
                                          value={toInputDate(evt.date)}
                                          onChange={(e) => handleUpdateCommercialEvent(evt.id, 'date', fromInputDate(e.target.value))}
                                          className="crm-event-date-input"
                                          style={{ paddingRight: '32px' }}
                                        />
                                        <Calendar className="w-4 h-4 text-slate-500 absolute right-2.5 pointer-events-none" />
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCommercialEvent(evt.id)}
                                      style={{
                                        backgroundColor: 'rgb(203, 20, 20)',
                                        color: '#ffffff',
                                        borderRadius: '13px',
                                        padding: '10px 19px',
                                        fontSize: '18px',
                                        fontWeight: 600,
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                      }}
                                      className="hover:bg-red-700 transition-colors shadow-xs"
                                      title="Supprimer l'événement"
                                    >
                                      Supprimer
                                    </button>
                                  </div>
                                  <div>
                                    <label className="text-xs !font-semibold text-slate-600 !mb-1">Commentaire.</label>
                                    <AutoResizeEventTextarea
                                      value={evt.commentaire}
                                      onChange={(val) => handleUpdateCommercialEvent(evt.id, 'commentaire', val)}
                                      placeholder="Entrez un compte-rendu ou commentaire..."
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 5-bis. SPECIFIC BLOCK WHEN CATEGORY IS TECHNIQUE / RÉCLAMATION / SANS CATÉGORIE: ENVOI DE MESSAGE AU CLIENT & HISTORIQUE */}
                  {formCategorie !== 'Commercial' && (
                    <div 
                      className="space-y-4 animate-fadeIn"
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid rgb(218, 218, 218)',
                        boxShadow: 'rgba(0, 0, 0, 0.06) 0px 2px 8px -2px',
                        borderRadius: '14px',
                        padding: '20px'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="!mb-0" style={{ fontSize: '18px', fontWeight: 600, color: '#000000' }}>
                          Messages au client.
                        </label>
                        <button
                          type="button"
                          onClick={handleOpenNewMessage}
                          disabled={!isNewMessageOpen && formSupportMessages.length >= 5}
                          style={{
                            backgroundColor: '#0f172a',
                            color: '#ffffff',
                            borderRadius: '10px',
                            fontSize: '18px',
                            padding: '8px 16px',
                            border: 'none',
                            cursor: !isNewMessageOpen && formSupportMessages.length >= 5 ? 'not-allowed' : 'pointer',
                            opacity: !isNewMessageOpen && formSupportMessages.length >= 5 ? 0.45 : 1,
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                          }}
                          className={!isNewMessageOpen && formSupportMessages.length >= 5 ? 'transition-colors' : 'hover:bg-zinc-800 transition-colors'}
                        >
                          {isNewMessageOpen ? 'Fermer le formulaire' : 'Nouveau message'}
                        </button>
                      </div>

                      {supportMessageSentToast && (
                        <div className="font-semibold text-green-600 animate-fadeIn" style={{ color: '#16a34a', fontSize: '18px' }}>
                          Message envoyé.
                        </div>
                      )}

                      {/* Sub-form: Nouveau message */}
                      {isNewMessageOpen && (
                        <div 
                          className="p-4 rounded-xl space-y-3.5 shadow-xs animate-fadeIn"
                          style={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #dadada',
                          }}
                        >
                          <div>
                            <label className="text-xs !font-semibold text-slate-600 !mb-1">Objet.</label>
                            <input
                              type="text"
                              value={newMessageObjet}
                              onChange={(e) => setNewMessageObjet(e.target.value)}
                              placeholder="Entrez un objet court."
                              style={{
                                fontSize: '15px !important',
                                padding: '8px 12px !important',
                                borderRadius: '8px !important',
                                width: '100%'
                              }}
                            />
                          </div>

                          <div>
                            <label className="text-xs !font-semibold text-slate-600 !mb-1">Message.</label>
                            <textarea
                              rows={5}
                              value={newMessageBody}
                              onChange={(e) => setNewMessageBody(e.target.value)}
                              placeholder="Ex: Entrez un message."
                              style={{
                                fontSize: '15px !important',
                                padding: '10px 12px !important',
                                borderRadius: '8px !important',
                                resize: 'vertical',
                                width: '100%',
                                lineHeight: '1.5'
                              }}
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setIsNewMessageOpen(false)}
                              style={{
                                backgroundColor: '#0f172a',
                                color: '#ffffff',
                                borderRadius: '12px',
                                padding: '8px 18px',
                                fontSize: '18px',
                                fontWeight: 500,
                                border: 'none',
                                cursor: 'pointer',
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                              }}
                              className="hover:bg-zinc-800 transition-colors shadow-xs"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={handleSendSupportMessage}
                              disabled={isSendingSupportMessage || !newMessageObjet.trim() || !newMessageBody.trim()}
                              style={{
                                backgroundColor: isSendingSupportMessage ? '#94a3b8' : '#2e54ff',
                                color: '#ffffff',
                                borderRadius: '12px',
                                padding: '8px 22px',
                                fontSize: '18px',
                                fontWeight: 600,
                                border: 'none',
                                cursor: isSendingSupportMessage ? 'wait' : 'pointer',
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                              }}
                              className="hover:bg-[#2b48cc] transition-colors shadow-xs"
                            >
                              {isSendingSupportMessage ? 'Envoi en cours...' : 'Envoyer'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Messages envoyés (historique épuré) */}
                      {formSupportMessages.length > 0 && (
                        <div className="space-y-3 pt-1">
                          {formSupportMessages.map((msg) => (
                            <div 
                              key={msg.id} 
                              className="p-3.5 rounded-xl space-y-2 transition-colors"
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid #dadada',
                              }}
                            >
                              <div className="font-sans font-medium" style={{ fontSize: '16px', color: '#000000' }}>
                                {msg.date} à {msg.heure}
                              </div>

                              <div className="font-sans font-bold" style={{ fontSize: '16px', color: '#000000' }}>
                                {msg.objet}
                              </div>

                              <div className="font-sans whitespace-pre-wrap leading-relaxed" style={{ fontSize: '16px', color: '#000000' }}>
                                {msg.message}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Floating Action Buttons: Side-by-side Enregistrer & Fermer without any background */}
                <div 
                  className="sticky bottom-0 pt-4 pb-2 flex items-center gap-3 mt-6 z-20"
                  style={{ background: 'transparent' }}
                >
                  <button
                    type="submit"
                    style={{
                      backgroundColor: '#2e54ff',
                      color: '#ffffff',
                      borderRadius: '13px',
                      padding: '14px',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      flex: 1,
                    }}
                    className="hover:bg-[#2b48cc] transition-colors shadow-lg"
                  >
                    Enregistrer
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPaneOpen(false)}
                    style={{
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      borderRadius: '13px',
                      padding: '14px',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      flex: 1,
                    }}
                    className="hover:bg-zinc-800 transition-colors shadow-lg"
                  >
                    Fermer
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CRM FILTRES SIDE PANE DRAWER */}
      {isFilterPaneOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="crm-filters-drawer-modal">
          {/* Overlay backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setIsFilterPaneOpen(false)}
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="relative w-screen max-w-md bg-white shadow-2xl flex flex-col overflow-hidden h-full">
              {/* Scrollable content area without title header or divider */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-28 font-sans">
                {/* 0. Filtres de dates (Début : & Fin :) en premier */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="crm-filter-date-start" style={{ fontSize: '18px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      Début :
                    </label>
                    <input
                      type="date"
                      id="crm-filter-date-start"
                      value={draftDateStart}
                      onChange={(e) => setDraftDateStart(e.target.value)}
                      style={{
                        width: '100%',
                        border: '1px solid #dedede',
                        borderRadius: '13px',
                        padding: '10px 14px',
                        fontSize: '16px',
                        color: '#000000',
                        backgroundColor: '#ffffff',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="crm-filter-date-end" style={{ fontSize: '18px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                      Fin :
                    </label>
                    <input
                      type="date"
                      id="crm-filter-date-end"
                      value={draftDateEnd}
                      onChange={(e) => setDraftDateEnd(e.target.value)}
                      style={{
                        width: '100%',
                        border: '1px solid #dedede',
                        borderRadius: '13px',
                        padding: '10px 14px',
                        fontSize: '16px',
                        color: '#000000',
                        backgroundColor: '#ffffff',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* 1. Sélection du collaborateur */}
                <div>
                  <label style={{ fontSize: '18px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                    Sélection du collaborateur.
                  </label>
                  <select
                    value={draftFilterCollaborateur}
                    onChange={(e) => setDraftFilterCollaborateur(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #dedede',
                      borderRadius: '13px',
                      padding: '10px 14px',
                      fontSize: '16px',
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Tous">Tous</option>
                    <option value="Non attribué(s)">Non attribué(s)</option>
                    {members.map((m) => (
                      <option key={m.id || m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Sélection de la semaine */}
                <div>
                  <label style={{ fontSize: '18px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                    Sélection de la semaine.
                  </label>
                  <select
                    value={draftFilterSemaine}
                    onChange={(e) => setDraftFilterSemaine(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #dedede',
                      borderRadius: '13px',
                      padding: '10px 14px',
                      fontSize: '16px',
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Tous">Toutes les semaines</option>
                    {Array.from({ length: 53 }, (_, i) => `S${i + 1}`).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Sélection situation du devis */}
                <div>
                  <label style={{ fontSize: '18px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                    Sélection situation du devis.
                  </label>
                  <select
                    value={draftFilterSituationDevis}
                    onChange={(e) => setDraftFilterSituationDevis(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #dedede',
                      borderRadius: '13px',
                      padding: '10px 14px',
                      fontSize: '16px',
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Tous">Toutes</option>
                    <option value="Gagné">Gagné</option>
                    <option value="Perdu">Perdu</option>
                    <option value="Non renseigné">Non renseigné</option>
                  </select>
                </div>

                {/* 5. Statut. */}
                <div>
                  <label style={{ fontSize: '18px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                    Statut.
                  </label>
                  <select
                    value={draftFilterStatut}
                    onChange={(e) => setDraftFilterStatut(e.target.value as any)}
                    style={{
                      width: '100%',
                      border: '1px solid #dedede',
                      borderRadius: '13px',
                      padding: '10px 14px',
                      fontSize: '16px',
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Tous">Tous</option>
                    <option value="Nouveau">Nouveau</option>
                    <option value="En cours">En cours</option>
                    <option value="Terminé">Terminé</option>
                  </select>
                </div>

                {/* Réinitialiser si au moins un filtre est actif */}
                {(draftDateStart !== '' || draftDateEnd !== '' || draftFilterStatut !== 'Tous' || draftFilterCollaborateur !== 'Tous' || draftFilterCriticite !== 'Tous' || draftFilterSemaine !== 'Tous' || draftFilterSituationDevis !== 'Tous') && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftDateStart('');
                        setDraftDateEnd('');
                        setDraftFilterStatut('Tous');
                        setDraftFilterCollaborateur('Tous');
                        setDraftFilterCriticite('Tous');
                        setDraftFilterSemaine('Tous');
                        setDraftFilterSituationDevis('Tous');
                      }}
                      className="text-sm text-neutral-500 hover:text-black cursor-pointer font-sans underline"
                    >
                      Réinitialiser les filtres
                    </button>
                  </div>
                )}
              </div>

              {/* Floating Bottom Appliquer (bleu) et Fermer (noir) sans fond derrière */}
              <div 
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: '24px',
                  right: '24px',
                  zIndex: 20,
                  display: 'flex',
                  gap: '12px'
                }}
              >
                <button
                  type="button"
                  id="btn-apply-crm-filters"
                  onClick={() => {
                    setCrmDateStart(draftDateStart);
                    setCrmDateEnd(draftDateEnd);
                    setTicketStatusFilter(draftFilterStatut);
                    setFilterCollaborateur(draftFilterCollaborateur);
                    setFilterCriticite(draftFilterCriticite);
                    setFilterSemaine(draftFilterSemaine);
                    setFilterSituationDevis(draftFilterSituationDevis);
                    setIsFilterPaneOpen(false);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#2e54ff',
                    color: '#ffffff',
                    borderRadius: '13px',
                    padding: '14px',
                    fontSize: '18px',
                    fontWeight: 'normal',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    boxShadow: '0 4px 14px rgba(53, 86, 236, 0.3)',
                  }}
                  className="hover:bg-[#2b48cc] transition-colors"
                >
                  Appliquer
                </button>
                <button
                  type="button"
                  id="btn-close-crm-filters"
                  onClick={() => setIsFilterPaneOpen(false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    borderRadius: '13px',
                    padding: '14px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    boxShadow: 'none',
                  }}
                  className="hover:bg-zinc-800 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PERFORMANCE & STATS / EXPORT SIDE PANE DRAWER */}
      {isPerformancePaneOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="crm-performance-drawer-modal">
          {/* Overlay backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setIsPerformancePaneOpen(false)}
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="relative w-screen max-w-md sm:max-w-lg lg:max-w-xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 pb-28">
                {/* Section FILTRES (Plage date à date & Employé) */}
                <div 
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #dadada',
                    boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.06)',
                  }}
                  className="rounded-2xl p-4 sm:p-5 space-y-4 text-left"
                >
                  {/* Plage date à date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs !font-semibold text-slate-600 !mb-1">Date début.</label>
                      <input
                        type="date"
                        value={perfStartDate}
                        onChange={(e) => setPerfStartDate(e.target.value)}
                        style={{
                          padding: '8px 12px !important',
                          fontSize: '15px !important',
                          borderRadius: '10px !important',
                          background: '#ffffff !important',
                          border: '1px solid #dadada !important'
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs !font-semibold text-slate-600 !mb-1">Date fin.</label>
                      <input
                        type="date"
                        value={perfEndDate}
                        onChange={(e) => setPerfEndDate(e.target.value)}
                        style={{
                          padding: '8px 12px !important',
                          fontSize: '15px !important',
                          borderRadius: '10px !important',
                          background: '#ffffff !important',
                          border: '1px solid #dadada !important'
                        }}
                      />
                    </div>
                  </div>

                  {/* Bouton Export déplacé juste au-dessus du champ Employé, sans icône download */}
                  <div>
                    {(() => {
                      const isExportDisabled = !perfStartDate || !perfEndDate || filteredPerfTickets.length === 0;
                      return (
                        <button
                          type="button"
                          id="btn-export-crm-performance-csv"
                          disabled={isExportDisabled}
                          onClick={handleExportPerformanceCSV}
                          style={{
                            backgroundColor: isExportDisabled ? '#9ca3af' : '#2e54ff',
                            color: '#ffffff',
                            fontSize: '18px',
                            fontWeight: 'normal',
                            borderRadius: '13px',
                            padding: '12px 24px',
                            border: 'none',
                            cursor: isExportDisabled ? 'not-allowed' : 'pointer',
                            width: '100%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                            opacity: isExportDisabled ? 0.6 : 1,
                          }}
                          className={isExportDisabled ? '' : 'hover:bg-[#2b48cc] transition-colors'}
                        >
                          Export CSV
                        </button>
                      );
                    })()}
                  </div>

                  {/* Choix Employé avec 'Tous' en première option */}
                  <div>
                    <label className="text-xs !font-semibold text-slate-600 !mb-1">Employé.</label>
                    <select
                      value={perfCollaborateur}
                      onChange={(e) => setPerfCollaborateur(e.target.value)}
                      style={{
                        padding: '8px 12px !important',
                        fontSize: '15px !important',
                        borderRadius: '10px !important',
                        background: '#ffffff !important',
                        border: '1px solid #dadada !important'
                      }}
                    >
                      <option value="Tous">Tous</option>
                      {members.map((m) => (
                        <option key={m.id || m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* STATISTIQUES (4 blocs statistiques) */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Bloc stat 1: « Tickets ouverts » */}
                    <div 
                      className="p-4 rounded-2xl bg-white text-center flex flex-col items-center justify-center space-y-2"
                      style={{
                        border: '1px solid #dadada',
                        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.06)',
                      }}
                      id="stat-block-tickets-ouverts"
                    >
                      <span 
                        style={{
                          cursor: 'default',
                          fontSize: '18px',
                          color: '#000000',
                          paddingTop: '8px',
                          fontWeight: 600,
                        }}
                        className="font-sans block"
                      >
                        Tickets ouverts
                      </span>
                      <div 
                        style={{
                          cursor: 'default',
                          fontSize: '52px',
                          lineHeight: '1.1',
                          fontWeight: 'bold',
                          color: '#000000',
                          paddingBottom: '8px',
                        }}
                        className="font-sans"
                      >
                        {statTicketsOuverts}
                      </div>
                    </div>

                    {/* Bloc stat 2: « Tickets fermés » */}
                    <div 
                      className="p-4 rounded-2xl bg-white text-center flex flex-col items-center justify-center space-y-2"
                      style={{
                        border: '1px solid #dadada',
                        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.06)',
                      }}
                      id="stat-block-tickets-fermes"
                    >
                      <span 
                        style={{
                          cursor: 'default',
                          fontSize: '18px',
                          color: '#000000',
                          paddingTop: '8px',
                          fontWeight: 600,
                        }}
                        className="font-sans block"
                      >
                        Tickets fermés
                      </span>
                      <div 
                        style={{
                          cursor: 'default',
                          fontSize: '52px',
                          lineHeight: '1.1',
                          fontWeight: 'bold',
                          color: '#000000',
                          paddingBottom: '8px',
                        }}
                        className="font-sans"
                      >
                        {statTicketsFermes}
                      </div>
                    </div>

                    {/* Bloc stat 3: « Volume affaires » */}
                    <div 
                      className="p-4 rounded-2xl bg-white text-center flex flex-col items-center justify-center space-y-2"
                      style={{
                        border: '1px solid #dadada',
                        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.06)',
                      }}
                      id="stat-block-volume-affaires"
                    >
                      <span 
                        style={{
                          cursor: 'default',
                          fontSize: '18px',
                          color: '#000000',
                          paddingTop: '8px',
                          fontWeight: 600,
                        }}
                        className="font-sans block"
                      >
                        Volume affaires
                      </span>
                      <div 
                        style={{
                          cursor: 'default',
                          fontSize: '52px',
                          lineHeight: '1.1',
                          fontWeight: 'bold',
                          color: '#000000',
                          paddingBottom: '8px',
                        }}
                        className="flex items-baseline justify-center gap-1 font-sans"
                      >
                        <span>
                          {statVolumeAffaires.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                        <span style={{ fontSize: '22px', marginLeft: '-3px' }}>
                          €
                        </span>
                      </div>
                    </div>

                    {/* Bloc stat 4: « Score closing » */}
                    <div 
                      className="p-4 rounded-2xl bg-white text-center flex flex-col items-center justify-center space-y-2"
                      style={{
                        border: '1px solid #dadada',
                        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.06)',
                      }}
                      id="stat-block-score-closing"
                    >
                      <span 
                        style={{
                          cursor: 'default',
                          fontSize: '18px',
                          color: '#000000',
                          paddingTop: '8px',
                          fontWeight: 600,
                        }}
                        className="font-sans block"
                      >
                        Score closing
                      </span>
                      <div 
                        style={{
                          cursor: 'default',
                          fontSize: '52px',
                          lineHeight: '1.1',
                          fontWeight: 'bold',
                          color: '#000000',
                          paddingBottom: '8px',
                        }}
                        className="font-sans"
                      >
                        {scoreClosingText}
                      </div>
                    </div>

                    {/* Bloc stat 5: « Temps closing » */}
                    <div 
                      className="p-4 rounded-2xl bg-white text-center flex flex-col items-center justify-center space-y-2"
                      style={{
                        border: '1px solid #dadada',
                        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.06)',
                      }}
                      id="stat-block-temps-closing"
                    >
                      <span 
                        style={{
                          cursor: 'default',
                          fontSize: '18px',
                          color: '#000000',
                          paddingTop: '8px',
                          fontWeight: 600,
                        }}
                        className="font-sans block"
                      >
                        Temps closing
                      </span>
                      <div 
                        style={{
                          cursor: 'default',
                          fontSize: statTempsClosingText.length > 12 ? '26px' : '34px',
                          lineHeight: '1.2',
                          fontWeight: 'bold',
                          color: '#000000',
                          paddingBottom: '8px',
                        }}
                        className="font-sans"
                      >
                        {statTempsClosingText}
                      </div>
                    </div>

                    {/* Bloc stat 6: « Meilleur Closer » */}
                    <div 
                      className="p-4 rounded-2xl bg-white text-center flex flex-col items-center justify-center space-y-2"
                      style={{
                        border: '1px solid #dadada',
                        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.06)',
                      }}
                      id="stat-block-meilleur-closer"
                    >
                      <span 
                        style={{
                          cursor: 'default',
                          fontSize: '18px',
                          color: '#000000',
                          paddingTop: '8px',
                          fontWeight: 600,
                        }}
                        className="font-sans block"
                      >
                        Meilleur Closer
                      </span>
                      <div 
                        style={{
                          cursor: 'default',
                          fontSize: statMeilleurCloserText.length > 14 ? '26px' : '34px',
                          lineHeight: '1.2',
                          fontWeight: 'bold',
                          color: '#000000',
                          paddingBottom: '8px',
                        }}
                        className="font-sans"
                      >
                        {statMeilleurCloserText}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Full-width Fermer button at bottom */}
              <div className="absolute bottom-5 left-6 right-6 sm:left-8 sm:right-8 z-20">
                <button
                  type="button"
                  id="btn-close-crm-performance-bottom"
                  onClick={() => setIsPerformancePaneOpen(false)}
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    borderRadius: '13px',
                    padding: '14px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    border: 'none',
                    width: '100%',
                    cursor: 'pointer',
                    boxShadow: 'none',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                  className="hover:bg-zinc-800 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CRM SETTINGS SIDE PANE DRAWER (Renommé « Réglages ») */}
      {isSettingsPaneOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="crm-settings-drawer-modal">
          {/* Overlay backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setIsSettingsPaneOpen(false)}
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="relative w-screen max-w-md sm:max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden h-full">
              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-28">
                {/* Sections 1, 2, 3: 3 Modèles Texte de l'email de relance avec variables et numéro dans un rond */}
                {([
                  {
                    idx: 1 as const,
                    body: relanceEmailBody,
                    setBody: setRelanceEmailBody,
                    replyTo: relanceEmailReplyTo,
                    setReplyTo: setRelanceEmailReplyTo,
                    error: relanceEmailError,
                    setError: setRelanceEmailError,
                    isSaving: isSavingRelance,
                  },
                  {
                    idx: 2 as const,
                    body: relanceEmailBody2,
                    setBody: setRelanceEmailBody2,
                    replyTo: relanceEmailReplyTo2,
                    setReplyTo: setRelanceEmailReplyTo2,
                    error: relanceEmailError2,
                    setError: setRelanceEmailError2,
                    isSaving: isSavingRelance2,
                  },
                  {
                    idx: 3 as const,
                    body: relanceEmailBody3,
                    setBody: setRelanceEmailBody3,
                    replyTo: relanceEmailReplyTo3,
                    setReplyTo: setRelanceEmailReplyTo3,
                    error: relanceEmailError3,
                    setError: setRelanceEmailError3,
                    isSaving: isSavingRelance3,
                  },
                ]).map((tpl) => (
                  <div
                    key={tpl.idx}
                    className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left"
                    id={tpl.idx === 1 ? "crm-settings-section-relance-email" : `crm-settings-section-relance-email-${tpl.idx}`}
                  >
                    <div>
                      {/* Numéro du modèle dans un rond au début de la div */}
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none"
                          style={{
                            backgroundColor: '#2e54ff',
                            fontSize: '16px',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                          }}
                        >
                          {tpl.idx}
                        </span>
                        <label
                          style={{
                            fontSize: '22px',
                            fontWeight: 600,
                            color: '#000000',
                            margin: 0,
                            display: 'block',
                            fontFamily: "'Alternative', 'DefibeoAlternative', 'Gochi', cursive, sans-serif",
                          }}
                        >
                          Texte de l’email de relance
                        </label>
                      </div>

                      {/* Champ Email de réponse. */}
                      <div className="mb-3 mt-3">
                        <label style={{ fontSize: '15px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block' }}>
                          Email de réponse.
                        </label>
                        <input
                          type="email"
                          value={tpl.replyTo}
                          onChange={(e) => {
                            tpl.setReplyTo(e.target.value);
                            if (tpl.error) tpl.setError('');
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            border: tpl.error ? '1px solid #ef4444' : '1px solid #dadada',
                            borderRadius: '11px',
                            fontSize: '15px',
                            color: '#000000',
                            boxSizing: 'border-box',
                            outline: 'none',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                          }}
                        />
                        {tpl.error && (
                          <p className="text-xs text-red-600 font-sans mt-1.5 font-medium">
                            {tpl.error}
                          </p>
                        )}
                      </div>

                      {/* Texte ferré à gauche des variables dynamiques */}
                      <p 
                        style={{ fontSize: '16px', color: '#000000', textAlign: 'left', marginBottom: '12px' }}
                        className="font-sans leading-relaxed"
                      >
                        Utilisez les variables suivantes pour des textes dynamiques : {'{Client.}'} ou {'{Référence Devis.}'} ou {'{Lien Stockage Partagé Devis.}'}
                      </p>

                      {/* Multiline textarea */}
                      <textarea
                        id={tpl.idx === 1 ? "crm-relance-email-textarea" : `crm-relance-email-textarea-${tpl.idx}`}
                        rows={7}
                        value={tpl.body}
                        onChange={(e) => tpl.setBody(e.target.value)}
                        placeholder="Écrivez le modèle d'email de relance..."
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: '1px solid #dadada',
                          borderRadius: '13px',
                          fontSize: '16px',
                          color: '#000000',
                          boxSizing: 'border-box',
                          outline: 'none',
                          resize: 'vertical',
                          lineHeight: '1.5',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveRelanceSettings(tpl.idx)}
                      disabled={tpl.isSaving}
                      style={{
                        backgroundColor: '#2e54ff',
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: 'normal',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        border: 'none',
                        cursor: tpl.isSaving ? 'not-allowed' : 'pointer',
                        opacity: tpl.isSaving ? 0.6 : 1,
                        width: '100%',
                        display: 'block',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        transition: 'opacity 0.2s',
                      }}
                      className={tpl.isSaving ? '' : 'hover:bg-[#2b48cc] transition-colors'}
                    >
                      Enregistrer
                    </button>
                  </div>
                ))}

                {/* Section 1-bis: Modèle Texte initial email de support avec options & champ Objet */}
                <div 
                  className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left"
                  id="crm-settings-section-support-email"
                >
                  <div>
                    <label style={{ fontSize: '22px', fontWeight: 600, color: '#000000', paddingTop: '16px', marginBottom: '14px', display: 'block', fontFamily: "'Alternative', 'DefibeoAlternative', 'Gochi', cursive, sans-serif" }}>
                      Texte initial email de support
                    </label>

                    {/* Champ Email de réponse. */}
                    <div className="mb-3">
                      <label style={{ fontSize: '15px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block' }}>
                        Email de réponse.
                      </label>
                      <input
                        type="email"
                        value={supportEmailReplyTo}
                        onChange={(e) => {
                          setSupportEmailReplyTo(e.target.value);
                          if (supportEmailError) setSupportEmailError('');
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          border: supportEmailError ? '1px solid #ef4444' : '1px solid #dadada',
                          borderRadius: '11px',
                          fontSize: '15px',
                          color: '#000000',
                          boxSizing: 'border-box',
                          outline: 'none',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                        }}
                      />
                      {supportEmailError && (
                        <p className="text-xs text-red-600 font-sans mt-1.5 font-medium">
                          {supportEmailError}
                        </p>
                      )}
                    </div>

                    {/* Champ Objet */}
                    <div className="mb-3">
                      <label style={{ fontSize: '15px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block' }}>
                        Objet.
                      </label>
                      <input
                        type="text"
                        value={supportEmailSubject}
                        onChange={(e) => setSupportEmailSubject(e.target.value)}
                        placeholder="Ex: Suivi de votre dossier {Référence.}"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          border: '1px solid #dadada',
                          borderRadius: '11px',
                          fontSize: '15px',
                          color: '#000000',
                          boxSizing: 'border-box',
                          outline: 'none',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                        }}
                      />
                    </div>

                    {/* Texte ferré à gauche des variables dynamiques */}
                    <p 
                      style={{ fontSize: '16px', color: '#000000', textAlign: 'left', marginBottom: '12px' }}
                      className="font-sans leading-relaxed"
                    >
                      Utilisez les variables suivantes pour des textes dynamiques : {'{Client.}'} ou {'{Référence.}'} ou {'{Objet.}'} ou {'{Collaborateur.}'}
                    </p>

                    {/* Multiline textarea */}
                    <textarea
                      id="crm-support-email-textarea"
                      rows={7}
                      value={supportEmailBody}
                      onChange={(e) => setSupportEmailBody(e.target.value)}
                      placeholder="Écrivez le modèle d'email initial de support..."
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        border: '1px solid #dadada',
                        borderRadius: '13px',
                        fontSize: '16px',
                        color: '#000000',
                        boxSizing: 'border-box',
                        outline: 'none',
                        resize: 'vertical',
                        lineHeight: '1.5',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveSupportSettings}
                    disabled={isSavingSupport}
                    style={{
                      backgroundColor: '#2e54ff',
                      color: '#ffffff',
                      fontSize: '18px',
                      fontWeight: 'normal',
                      borderRadius: '12px',
                      padding: '12px 24px',
                      border: 'none',
                      cursor: isSavingSupport ? 'not-allowed' : 'pointer',
                      opacity: isSavingSupport ? 0.6 : 1,
                      width: '100%',
                      display: 'block',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      transition: 'opacity 0.2s',
                    }}
                    className={isSavingSupport ? '' : 'hover:bg-[#2b48cc] transition-colors'}
                  >
                    Enregistrer
                  </button>
                </div>

                {/* Section 2: Formulaire de contact pour site web */}
                <div 
                  className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left"
                  id="crm-settings-section-embed-form"
                >
                  <p 
                    className="text-black font-sans leading-relaxed"
                    style={{ fontSize: '18px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
                  >
                    Générez un formulaire de contact professionnel à intégrer sur votre site internet. Tous les messages envoyés depuis ce formulaire remonteront dans votre onglet CRM et vous recevrez un email de notification.
                  </p>

                  <div className="space-y-3 mt-3">
                    <textarea
                      id="crm-embed-textarea"
                      readOnly
                      value={embedCode}
                      style={{
                        backgroundColor: '#3b1e62',
                        color: '#ffffff',
                        fontFamily: "'Civilprom', sans-serif",
                        fontSize: '16px',
                        padding: '20px',
                        borderRadius: '13px',
                        border: 'none',
                        resize: 'none',
                        height: '210px',
                        width: '100%',
                        boxSizing: 'border-box',
                        outline: 'none',
                        lineHeight: '1.5',
                      }}
                      className="select-all"
                    />
                    <button
                      type="button"
                      id="btn-copy-embed-code"
                      onClick={() => {
                        navigator.clipboard.writeText(embedCode);
                        setCopiedEmbed(true);
                        setTimeout(() => setCopiedEmbed(false), 2000);
                      }}
                      style={{
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: 'normal',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        border: 'none',
                        cursor: 'pointer',
                        width: '100%',
                        display: 'block',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      }}
                      className="hover:opacity-90 active:scale-[0.99] transition-all font-sans"
                    >
                      {copiedEmbed ? "Copié !" : "Copier le code"}
                    </button>
                  </div>
                </div>

                {/* Section 3: Recommandations */}
                <div 
                  className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 text-left"
                  id="crm-settings-section-recommendations"
                >
                  <p 
                    className="text-black font-sans leading-relaxed"
                    style={{ fontSize: '18px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
                  >
                    Les clients existants peuvent envoyer leurs demandes directement depuis leur espace client. Nous vous recommandons de créer une page de contact sur votre site web et d’y intégrer le formulaire à l'aide du code prêt à coller ci-dessus. Les demandes envoyées via ce formulaire arriveront également automatiquement dans votre CRM.
                  </p>
                </div>
              </div>

              {/* Floating Bottom Fermer Button (sans div derrière le bouton) */}
              <button
                type="button"
                id="btn-close-crm-settings-bottom"
                onClick={() => setIsSettingsPaneOpen(false)}
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: '24px',
                  right: '24px',
                  zIndex: 20,
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  borderRadius: '13px',
                  padding: '14px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  boxShadow: 'none',
                }}
                className="hover:bg-zinc-800 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👁️ COLUMNS VISIBILITY SIDE PANE 👁️ */}
      {isColumnVisibilityPaneOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[100] flex justify-end"
          id="crm-columns-visibility-side-pane-container"
        >
          {/* Backdrop */}
          <div 
            onClick={() => {
              setTempHiddenColumns(new Set(hiddenColumns));
              setIsColumnVisibilityPaneOpen(false);
            }}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs"
          />

          {/* Side Pane */}
          <div 
            className="relative w-full sm:w-[480px] bg-white shadow-2xl flex flex-col transform transition-transform duration-200 ease-in-out z-10" 
            id="crm-columns-visibility-side-pane"
            onClick={(e) => e.stopPropagation()}
            style={{
              height: '100vh',
              minHeight: '100dvh',
              maxHeight: '100dvh',
              borderLeft: '1px solid #e2e8f0',
            }}
          >
            {/* Sensibilité de catégorie: Filtre rapide ou onglets pour basculer facilement */}
            <div className="p-6 pb-2 pt-8">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {(['Actif', 'Commercial', 'Non Commercial', 'Toutes'] as const).map((tab) => {
                  const isActive = columnFilterScope === tab;
                  const label = tab === 'Actif'
                    ? `Affichage actif (${ticketCategoryFilter === 'Commercial' ? 'Commercial' : 'Non Commercial'})`
                    : tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setColumnFilterScope(tab)}
                      style={{
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        fontSize: '14px',
                        fontWeight: 600,
                        padding: '6px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: isActive ? '#0f172a' : '#f1f5f9',
                        color: isActive ? '#ffffff' : '#475569',
                        transition: 'all 0.15s ease'
                      }}
                      className="cursor-pointer select-none"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nuage de boutons initialement tous background noir - Drag and drop pour réorganiser */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <div className="flex flex-wrap gap-2.5 sm:gap-3 items-center">
                {visibleConfigurableColumns.map((col) => {
                  const isHidden = tempHiddenColumns.has(col.id);
                  const isDragging = draggedColId === col.id;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        setDraggedColId(col.id);
                        e.dataTransfer.effectAllowed = 'move';
                        try {
                          e.dataTransfer.setData('text/plain', col.id);
                        } catch (_) {}
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromId = draggedColId || e.dataTransfer.getData('text/plain');
                        if (!fromId || fromId === col.id) return;
                        setTempColumnOrder((prev) => {
                          const next = [...prev];
                          const fromIdx = next.indexOf(fromId);
                          const toIdx = next.indexOf(col.id);
                          if (fromIdx === -1 || toIdx === -1) return prev;
                          next.splice(fromIdx, 1);
                          next.splice(toIdx, 0, fromId);
                          return next;
                        });
                        setDraggedColId(null);
                      }}
                      onDragEnd={() => setDraggedColId(null)}
                      onClick={() => toggleColumnVisibility(col.id)}
                      style={{
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        fontSize: '18px',
                        fontWeight: 600,
                        borderRadius: '14px',
                        padding: '12px 18px',
                        backgroundColor: isHidden ? '#dc2626' : '#0f172a',
                        color: '#ffffff',
                        border: isHidden ? '1px solid #dc2626' : '1px solid #000000',
                        boxShadow: 'none',
                        cursor: 'grab',
                        opacity: isDragging ? 0.5 : 1,
                        transition: 'all 0.15s ease-in-out',
                      }}
                      className="hover:scale-[1.02] active:scale-[0.98] select-none cursor-grab"
                      title="Cliquer pour afficher/masquer (min. 4 colonnes) — Glisser-déposer pour réorganiser"
                    >
                      {col.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Floating Black & Blue Buttons side by side at bottom */}
            <div className="p-5 bg-gradient-to-t from-white via-white/95 to-transparent shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setTempHiddenColumns(new Set(hiddenColumns));
                  setTempColumnOrder([...columnOrder]);
                  setIsColumnVisibilityPaneOpen(false);
                }}
                style={{
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  borderRadius: '13px',
                  padding: '14px 20px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  boxShadow: 'none',
                }}
                className="flex-1 text-center cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => {
                  setHiddenColumns(new Set(tempHiddenColumns));
                  setColumnOrder([...tempColumnOrder]);
                  try {
                    localStorage.setItem('crm_table_hidden_columns', JSON.stringify(Array.from(tempHiddenColumns)));
                    sessionStorage.setItem('crm_table_column_order', JSON.stringify(tempColumnOrder));
                  } catch (e) {}
                  setIsColumnVisibilityPaneOpen(false);
                }}
                style={{
                  backgroundColor: '#2e54ff',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  borderRadius: '13px',
                  padding: '14px 20px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, #2e54ff 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                }}
                className="flex-1 text-center cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Side Pane Search for Client ou Prospect */}
      <SearchSidePane
        isOpen={isSidePaneClientOpen}
        onClose={() => setIsSidePaneClientOpen(false)}
        paneId="crm-client-search-side-pane"
        items={clientSidePaneItems}
        selectedId={formClientSelect}
        onSelect={(item) => handleClientChange(item.id)}
        allowEmpty={true}
        emptyLabel="Autre (Saisie manuelle)"
        onSelectEmpty={() => handleClientChange('Autre')}
        emptySelected={formClientSelect === 'Autre'}
        searchPlaceholder="Entrez votre recherche"
        searchFilter={(item, q) => {
          const l = (item.label || '').toLowerCase();
          const s = (item.subtitle || '').toLowerCase();
          const b = (item.badge || '').toLowerCase();
          const c = item.raw;
          const email = (c?.email || c?.emailSite || '').toLowerCase();
          const siret = (c?.siret || '').toLowerCase();
          const ville = (c?.ville || '').toLowerCase();
          return l.includes(q) || s.includes(q) || b.includes(q) || email.includes(q) || siret.includes(q) || ville.includes(q);
        }}
      />
    </div>
  );
};
