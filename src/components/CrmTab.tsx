import React, { useState, useRef, useEffect } from 'react';
import { Maximize2, Minimize2, BarChart3, Calendar, Trash2 } from 'lucide-react';
import { SupportTicket, Member, Client, CompanyInfo, CommercialEvent, SupportMessage } from '../types';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { INITIAL_TICKETS } from '../utils';
import { sendScriptEmail } from '../utils/emailService';
import { fetchCollectionFromFirestore, saveCollectionToFirestore } from '../firebase';

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

interface CrmTabProps {
  tickets: SupportTicket[];
  members: Member[];
  clients: Client[];
  companyInfo: CompanyInfo;
  tenantId?: string;
  onSaveTickets: (updated: SupportTicket[]) => void;
  t: (key: string) => string;
}

export const CrmTab: React.FC<CrmTabProps> = ({
  tickets,
  members,
  clients,
  companyInfo,
  tenantId,
  onSaveTickets,
  t
}) => {
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketCategoryFilter, setTicketCategoryFilter] = useState<'Commercial' | 'Réclamation' | 'Technique' | 'Sans Catégorie'>('Commercial');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'Tous' | 'Nouveau' | 'En cours' | 'Terminé'>('Tous');
  
  // Selection state for rows
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [isSendingRelance, setIsSendingRelance] = useState(false);
  const [relanceBannerMsg, setRelanceBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fit View / Unzoom feature like DefibTab
  const [isTableFitView, setIsTableFitView] = useState<boolean>(false);
  const [tableFitScale, setTableFitScale] = useState<number>(1);
  const naturalTableWidthRef = useRef<number>(1400);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const toggleTableFitView = () => {
    setIsTableFitView(prev => {
      const next = !prev;
      if (next) {
        if (bottomScrollRef.current) {
          const sWidth = bottomScrollRef.current.scrollWidth;
          if (sWidth > 500) {
            naturalTableWidthRef.current = sWidth;
          }
          const clientW = bottomScrollRef.current.clientWidth;
          const defaultW = ticketCategoryFilter === 'Commercial' ? 1650 : 1150;
          const naturalW = (bottomScrollRef.current && bottomScrollRef.current.scrollWidth > 500)
            ? bottomScrollRef.current.scrollWidth
            : defaultW;
          const scale = Math.min(1, Math.max(0.1, (clientW - 2) / naturalW));
          setTableFitScale(scale);
        }
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
        const defaultW = ticketCategoryFilter === 'Commercial' ? 1650 : 1150;
        const naturalW = (bottomScrollRef.current && bottomScrollRef.current.scrollWidth > 500)
          ? bottomScrollRef.current.scrollWidth
          : (naturalTableWidthRef.current || defaultW);
        const scale = Math.min(1, Math.max(0.1, (clientW - 2) / naturalW));
        setTableFitScale(scale);
      }
    };

    const timer = setTimeout(updateWidth, 100);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(bottomScrollRef.current);
    window.addEventListener('resize', updateWidth);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [isTableFitView, tickets, ticketCategoryFilter]);

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

  // Settings: Texte de l'email de relance
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

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);

  // Load CRM settings from Firebase
  useEffect(() => {
    if (activeTenant) {
      fetchCollectionFromFirestore<any>('crm_settings', activeTenant).then(data => {
        if (data) {
          let settingsObj: any = null;
          if (typeof data === 'object' && !Array.isArray(data)) {
            settingsObj = data;
          } else if (Array.isArray(data) && data[0]) {
            settingsObj = data[0];
          }
          if (settingsObj) {
            if (settingsObj.relanceEmailBody) {
              setRelanceEmailBody(settingsObj.relanceEmailBody);
              localStorage.setItem(`defib_${activeTenant}_crm_relance_template`, settingsObj.relanceEmailBody);
            }
            if (settingsObj.relanceEmailReplyTo !== undefined) {
              setRelanceEmailReplyTo(settingsObj.relanceEmailReplyTo || '');
              localStorage.setItem(`defib_${activeTenant}_crm_relance_replyto`, settingsObj.relanceEmailReplyTo || '');
            }
            if (settingsObj.supportEmailSubject) {
              setSupportEmailSubject(settingsObj.supportEmailSubject);
              localStorage.setItem(`defib_${activeTenant}_crm_support_subject`, settingsObj.supportEmailSubject);
            }
            if (settingsObj.supportEmailBody) {
              setSupportEmailBody(settingsObj.supportEmailBody);
              localStorage.setItem(`defib_${activeTenant}_crm_support_template`, settingsObj.supportEmailBody);
            }
            if (settingsObj.supportEmailReplyTo !== undefined) {
              setSupportEmailReplyTo(settingsObj.supportEmailReplyTo || '');
              localStorage.setItem(`defib_${activeTenant}_crm_support_replyto`, settingsObj.supportEmailReplyTo || '');
            }
          }
        }
      }).catch((err) => {
        console.log('[CRM] Notice: could not load crm_settings from Firestore, using local fallback:', err);
      });
    }
  }, [activeTenant]);

  const handleSaveCrmSettings = async () => {
    setIsSavingSettings(true);
    try {
      localStorage.setItem(`defib_${activeTenant}_crm_relance_template`, relanceEmailBody);
      localStorage.setItem(`defib_${activeTenant}_crm_relance_replyto`, relanceEmailReplyTo);
      localStorage.setItem(`defib_${activeTenant}_crm_support_subject`, supportEmailSubject);
      localStorage.setItem(`defib_${activeTenant}_crm_support_template`, supportEmailBody);
      localStorage.setItem(`defib_${activeTenant}_crm_support_replyto`, supportEmailReplyTo);
      if (activeTenant) {
        await saveCollectionToFirestore('crm_settings', {
          relanceEmailBody,
          relanceEmailReplyTo,
          supportEmailSubject,
          supportEmailBody,
          supportEmailReplyTo
        }, activeTenant);
      }
      setSettingsSavedToast(true);
      setTimeout(() => setSettingsSavedToast(false), 2500);
    } catch (err) {
      console.error('Erreur enregistrement réglages CRM:', err);
    } finally {
      setIsSavingSettings(false);
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
  const [formTotalAffaireHT, setFormTotalAffaireHT] = useState('');
  const [formFamille, setFormFamille] = useState('');
  const [formIndicatifPostal, setFormIndicatifPostal] = useState('');
  const [formOrigineLead, setFormOrigineLead] = useState<'Service Client' | 'Direct' | 'Internet' | 'Planification' | 'Autre.' | string>('Service Client');
  const [formDescriptionOffreDevis, setFormDescriptionOffreDevis] = useState('');
  const [formDateDevis, setFormDateDevis] = useState('');
  const [formDateProchaineRelance, setFormDateProchaineRelance] = useState('');
  const [formDateCommande, setFormDateCommande] = useState('');
  const [formLienDevis, setFormLienDevis] = useState('');
  const [formCommercialEvents, setFormCommercialEvents] = useState<CommercialEvent[]>([]);

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
    el.style.height = `${Math.max(el.scrollHeight, 100)}px`;
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

  // Ensure default demo tickets exist if list is empty so the CRM table and Gérer sidepane can be viewed immediately
  useEffect(() => {
    if (tickets.length === 0 && INITIAL_TICKETS && INITIAL_TICKETS.length > 0) {
      onSaveTickets(INITIAL_TICKETS);
    }
  }, [tickets.length, onSaveTickets]);

  const getTodayFormatted = (): string => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
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
    setFormTotalAffaireHT('');
    setFormFamille('');
    setFormIndicatifPostal('');
    setFormOrigineLead('Service Client');
    setFormDescriptionOffreDevis('');
    setFormDateDevis('');
    setFormDateProchaineRelance('');
    setFormDateCommande('');
    setFormLienDevis('');
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
      setFormEmail(ticket.email || foundClient.email || foundClient.emailSite || '');
    } else if (currentClientVal) {
      setFormClientSelect('Autre');
      setFormCustomClientName(ticket.customClientName || currentClientVal);
      setFormEmail(ticket.email || '');
    } else {
      setFormClientSelect('Autre');
      setFormCustomClientName('');
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
    setFormScoreConversion(typeof ticket.scorePotentielConversion === 'number' ? ticket.scorePotentielConversion : null);
    setFormReferenceDevis(ticket.referenceDevis || '');
    setFormTotalAffaireHT(ticket.totalAffaireHT !== undefined && ticket.totalAffaireHT !== null ? String(ticket.totalAffaireHT) : '');
    setFormFamille(ticket.famille || '');
    setFormIndicatifPostal(ticket.indicatifPostal || '');
    setFormOrigineLead(ticket.origineLead || 'Service Client');
    setFormDescriptionOffreDevis(ticket.descriptionOffreDevis || '');
    setFormDateDevis(ticket.dateDevis || '');
    setFormDateProchaineRelance(ticket.dateProchaineRelance || '');
    setFormDateCommande(ticket.dateCommande || '');
    setFormLienDevis(ticket.lienStockagePartageDevis || '');
    setFormCommercialEvents(Array.isArray(ticket.evenementsCommercial) ? ticket.evenementsCommercial : []);

    // Support messages
    setFormSupportMessages(Array.isArray(ticket.messagesSupport) ? ticket.messagesSupport : []);
    setIsNewMessageOpen(false);
    setNewMessageObjet('');
    setNewMessageBody('');
    setSupportMessageSentToast(null);

    setIsPaneOpen(true);
  };

  // Client dropdown change handler: auto-populate email & contact info
  const handleClientChange = (val: string) => {
    setFormClientSelect(val);
    if (val !== 'Autre') {
      const found = clients.find(c => (c.denomination || (c as any).name || c.id) === val);
      if (found) {
        const clientEmail = found.email || found.emailSite || '';
        if (clientEmail) {
          setFormEmail(clientEmail);
        }
        setFormSituationInterlocuteur('Client');
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
    }
  };

  // Add a commercial event
  const handleAddCommercialEvent = () => {
    const newEvt: CommercialEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: getTodayFormatted(),
      commentaire: '',
    };
    setFormCommercialEvents(prev => [newEvt, ...prev]);
  };

  const handleUpdateCommercialEvent = (id: string, field: 'date' | 'commentaire', value: string) => {
    setFormCommercialEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleRemoveCommercialEvent = (id: string) => {
    setFormCommercialEvents(prev => prev.filter(e => e.id !== id));
  };

  // Support Message Handlers (Technique / Réclamation / Sans Catégorie)
  const handleOpenNewMessage = () => {
    if (!isNewMessageOpen) {
      const clientName = formClientSelect === 'Autre' ? (formCustomClientName.trim() || 'Client') : formClientSelect;
      const ref = formRef || 'SUPPORT';
      const obj = formObjet || 'Assistance';
      const collab = formCollaborateur || '';

      const filledSubject = supportEmailSubject
        .replace(/{Référence\.}|Référence\./g, ref)
        .replace(/{Client\.}|Client\./g, clientName)
        .replace(/{Objet\.}|Objet\./g, obj)
        .replace(/{Collaborateur\.}|Collaborateur\./g, collab);

      const filledBody = supportEmailBody
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
      const replyTo = supportEmailReplyTo.trim() || companyInfo?.email || 'contact@defibeo.com';
      await sendScriptEmail({
        to: targetEmail,
        subject: newMessageObjet.trim(),
        body: newMessageBody.trim(),
        replyTo
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
      setSupportMessageSentToast(`✓ Message envoyé avec succès à ${targetEmail}`);
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

    const commercialData = formCategorie === 'Commercial' ? {
      marchePublic: formMarchePublic,
      situationDevis: formSituationDevis,
      scorePotentielConversion: formScoreConversion,
      referenceDevis: formReferenceDevis.trim(),
      totalAffaireHT: formTotalAffaireHT.trim() ? parseFloat(formTotalAffaireHT.trim()) : undefined,
      famille: formFamille.trim().toUpperCase(),
      indicatifPostal: formIndicatifPostal.trim(),
      origineLead: formOrigineLead,
      descriptionOffreDevis: formDescriptionOffreDevis.trim(),
      dateDevis: formDateDevis.trim(),
      dateProchaineRelance: formDateProchaineRelance.trim(),
      dateCommande: formDateCommande.trim(),
      lienStockagePartageDevis: formLienDevis.trim(),
      evenementsCommercial: formCommercialEvents,
    } : {};

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

  // Bulk actions: Supprimer and Email Relance
  const handleBulkDelete = () => {
    if (selectedTicketIds.length === 0) return;
    const count = selectedTicketIds.length;
    const ok = window.confirm(`Voulez-vous vraiment supprimer les ${count} ticket(s) sélectionné(s) ?`);
    if (!ok) return;

    const updated = tickets.filter(t => !selectedTicketIds.includes(t.id));
    onSaveTickets(updated);
    setSelectedTicketIds([]);
  };

  const handleBulkRelanceEmail = async () => {
    if (selectedTicketIds.length === 0) return;
    setIsSendingRelance(true);
    setRelanceBannerMsg(null);
    let sentCount = 0;
    let missingEmailCount = 0;

    for (const ticketId of selectedTicketIds) {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) continue;

      let targetEmail = ticket.email?.trim() || '';
      if (!targetEmail && ticket.client) {
        const found = clients.find(c => (c.denomination || (c as any).name || '') === ticket.client);
        if (found) {
          targetEmail = (found.email || found.emailSite || '').trim();
        }
      }

      if (!targetEmail) {
        missingEmailCount++;
        continue;
      }

      const clientName = ticket.client || ticket.customClientName || 'Client';
      const refDevis = ticket.referenceDevis || ticket.reference || ticket.id;
      const lienStockage = ticket.lienStockagePartageDevis || '';

      // Replace template variables
      let bodyText = relanceEmailBody
        .replace(/{Client\.}|Client\./g, clientName)
        .replace(/{Référence Devis\.}|Référence Devis\./g, refDevis)
        .replace(/{Lien Stockage Partagé Devis\.}|Lien Stockage Partagé Devis\./g, lienStockage);

      const subject = `Relance - ${refDevis}`;
      const replyTo = relanceEmailReplyTo.trim() || companyInfo?.email || 'contact@defibeo.com';

      try {
        await sendScriptEmail({
          to: targetEmail,
          subject,
          body: bodyText,
          replyTo
        });
        sentCount++;
      } catch (err) {
        console.warn('Erreur envoi email relance:', err);
      }
    }

    setIsSendingRelance(false);
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
    if (!q) return matchesCat && matchesSit;

    const ref = (t.reference || t.id || '').toLowerCase();
    const obj = (t.objet || '').toLowerCase();
    const cli = (t.client || t.customClientName || '').toLowerCase();
    const eml = (t.email || '').toLowerCase();
    const col = (t.collaborateur || '').toLowerCase();
    const desc = (t.description || t.message || '').toLowerCase();
    const refDev = (t.referenceDevis || '').toLowerCase();

    const matchesQuery = ref.includes(q) || obj.includes(q) || cli.includes(q) || eml.includes(q) || col.includes(q) || cat.toLowerCase().includes(q) || desc.includes(q) || refDev.includes(q);
    return matchesCat && matchesSit && matchesQuery;
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

  // Export CSV
  const handleExportPerformanceCSV = () => {
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
    csvContent += ';;;;;;;;;;;;;;;\n';

    // Detailed table header
    csvContent += 'Référence;Date Ouverture;Dernière Actualisation;Collaborateur;Client ou Prospect;Email;Situation Interlocuteur;Type Structure;Prénom Nom;Fonction;Téléphone;Catégorie;Situation;Criticité;Objet;Total Affaire HT;Situation Devis;Marché Public;Score Potentiel Conversion;Référence Devis;Famille;Indicatif Postal;Origine Lead;Description Offre Devis;Date Devis;Date Prochaine Relance;Date Commande;Lien Stockage Partagé Devis;Description\n';

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
        escapeCsv(t.scorePotentielConversion !== undefined && t.scorePotentielConversion !== null ? `${t.scorePotentielConversion}/8` : ''),
        escapeCsv(t.referenceDevis || ''),
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
    backgroundColor: 'rgb(53, 86, 236)',
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
    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
    transition: 'background-color 0.15s ease',
  };

  const blackButtonStyle: React.CSSProperties = {
    backgroundColor: '#000000',
    color: '#ffffff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
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
    fontWeight: 600,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
    fontSize: '15px',
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
    backgroundColor: '#000000',
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
        #crm-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-crm-input),
        #crm-tab-container select,
        #crm-tab-container textarea:not(#crm-embed-textarea):not(#crm-relance-email-textarea) {
          padding: 10px 12px !important;
          border: 1px solid #c9bfcd !important;
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
        #crm-tab-container select {
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
        #crm-tab-container select:hover:not(:disabled),
        #crm-tab-container select:focus:not(:disabled),
        #crm-tab-container textarea:not(#crm-embed-textarea):hover:not(:disabled),
        #crm-tab-container textarea:not(#crm-embed-textarea):focus:not(:disabled),
        #crm-tab-container #search-crm-input:hover,
        #crm-tab-container #search-crm-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
        }
        #crm-tab-container input:disabled,
        #crm-tab-container select:disabled {
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
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi" style={{ color: '#000000', cursor: 'default' }} id="crm-tab-title">
              Suivi Commercial et Support
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <input
              type="text"
              id="search-crm-input"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder="Recherche."
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
                width: '260px',
              }}
            />

            {/* Performance Button (entre la search-bar et Réglages) */}
            <button
              type="button"
              onClick={() => setIsPerformancePaneOpen(true)}
              id="btn-crm-performance"
              style={blackButtonStyle}
              className="hover:bg-zinc-800 transition-colors"
            >
              Performance
            </button>

            {/* Réglages Button (renamed from Réglages CRM) */}
            <button
              type="button"
              onClick={() => setIsSettingsPaneOpen(true)}
              id="btn-crm-settings"
              style={blackButtonStyle}
              className="hover:bg-zinc-800 transition-colors"
            >
              Réglages
            </button>

            {/* Nouveau Button (renamed from Nouveau Ticket) */}
            <button
              type="button"
              onClick={openNewTicketPane}
              id="btn-new-ticket"
              style={customButtonStyle}
              className="hover:bg-[#2b48cc] transition-colors"
            >
              Nouveau
            </button>
          </div>
        </div>
      </div>

      {/* Header Pills: Categories first, then Situation */}
      <div className="px-4 space-y-3 mt-4" id="crm-filter-pills-wrapper">
        {/* Row 1: Gélules de catégories : « Commercial » / « Réclamation » / « Technique » / « Sans Catégorie » */}
        <div className="flex flex-wrap gap-2.5 items-center justify-center sm:justify-start" id="crm-category-pills">
          {(['Commercial', 'Réclamation', 'Technique', 'Sans Catégorie'] as const).map((catOpt) => {
            const isSelected = ticketCategoryFilter === catOpt;
            return (
              <button
                key={catOpt}
                type="button"
                onClick={() => setTicketCategoryFilter(catOpt)}
                style={{
                  borderRadius: '1000px',
                  padding: '7px 16px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  backgroundColor: isSelected ? '#000000' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#000000',
                  border: isSelected ? '1px solid #000000' : '1px solid rgb(218, 218, 218)',
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

        {/* Row 2: Gélules de situation : « Tous » / « Nouveau » / « En cours » / « Terminé » */}
        <div className="flex flex-wrap gap-2.5 items-center justify-center sm:justify-start" id="crm-situation-pills">
          {(['Tous', 'Nouveau', 'En cours', 'Terminé'] as const).map((filterOpt) => {
            const isSelected = ticketStatusFilter === filterOpt;
            return (
              <button
                key={filterOpt}
                type="button"
                onClick={() => setTicketStatusFilter(filterOpt)}
                style={{
                  borderRadius: '1000px',
                  padding: '7px 16px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  backgroundColor: isSelected ? '#000000' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#000000',
                  border: isSelected ? '1px solid #000000' : '1px solid rgb(218, 218, 218)',
                  transition: 'all 0.15s ease'
                }}
              >
                {filterOpt}
                {filterOpt === 'Tous' && ` (${tickets.length})`}
                {filterOpt === 'Nouveau' && ` (${countNew})`}
                {filterOpt === 'En cours' && ` (${countProgress})`}
                {filterOpt === 'Terminé' && ` (${countTermine})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feature « Minimiser et ajuster l’affichage » (Identique à l'onglet Défibrillateur) */}
      <div 
        className="flex items-center justify-start px-4"
        style={{ maxWidth: '98%', margin: '0 auto', marginTop: '6px', padding: '0px' }}
      >
        <button
          type="button"
          id="btn-toggle-crm-fit-view"
          onClick={toggleTableFitView}
          style={{
            fontSize: '9px',
            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
            fontWeight: 100,
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            padding: '2px 4px',
            color: '#000000',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            textDecoration: 'none',
            transition: 'all 0.15s ease'
          }}
          className="hover:opacity-80 transition-all select-none cursor-pointer"
          title={isTableFitView ? t("Retourner l’affichage standard") : t("Minimiser et ajuster l’affichage")}
        >
          {isTableFitView ? (
            <Maximize2 size={10} className="shrink-0 text-black" color="#000000" />
          ) : (
            <Minimize2 size={10} className="shrink-0 text-black" color="#000000" />
          )}
          <span style={{ color: '#000000' }}>{isTableFitView ? t("Retourner l’affichage standard") : t("Minimiser et ajuster l’affichage")}</span>
        </button>
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
              style={{ backgroundColor: '#fe4eba' }}
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

            {/* Email Relance button */}
            <button
              type="button"
              onClick={handleBulkRelanceEmail}
              disabled={isSendingRelance}
              style={{
                ...rowActionButtonStyle,
                backgroundColor: '#3556ec',
                cursor: isSendingRelance ? 'wait' : 'pointer'
              }}
              className="hover:bg-[#2b48cc] transition-colors cursor-pointer"
              title="Envoyer un email de relance aux adresses renseignées dans les lignes sélectionnées"
            >
              {isSendingRelance ? 'Envoi en cours...' : 'Email Relance'}
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
                borderTop: '1px solid rgb(218, 218, 218)', 
                borderBottom: '1px solid rgb(218, 218, 218)',
                ...(isTableFitView ? {
                  zoom: tableFitScale,
                  width: `${naturalTableWidthRef.current || 1400}px`,
                  minWidth: `${naturalTableWidthRef.current || 1400}px`,
                  transition: 'zoom 0.15s ease'
                } : {
                  width: '100%'
                })
              }}
            >
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {/* Select All Radio-Check Column */}
                  <th className="px-4 py-3.5 w-12 text-center select-none whitespace-nowrap" style={{ cursor: 'default', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      id="crm-select-all-checkbox"
                      className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center focus:outline-hidden cursor-pointer mx-auto ${
                        isAllFilteredSelected
                          ? 'border-[#fe4eba] bg-transparent'
                          : 'border-slate-400 bg-white hover:border-[#fe4eba]'
                      }`}
                      style={{ borderWidth: '2.5px' }}
                      role="checkbox"
                      aria-checked={isAllFilteredSelected}
                      title={isAllFilteredSelected ? "Tout désélectionner" : "Tout sélectionner"}
                    >
                      {isAllFilteredSelected && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Référence.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Criticité.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Ouverture.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Situation.</th>
                  <th className="px-4 py-3.5 text-center whitespace-nowrap" style={thStyle}>Indicatif Postal.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Client.</th>

                  {ticketCategoryFilter === 'Commercial' ? (
                    <>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Interlocuteur.</th>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Type.</th>
                      <th className="px-4 py-3.5 text-center whitespace-nowrap" style={thStyle}>Famille.</th>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Origine Lead.</th>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Date Devis.</th>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Référence Devis.</th>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Date Pro. Relance.</th>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Collaborateur.</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Objet.</th>
                      <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Collaborateur.</th>
                    </>
                  )}

                  <th className="px-4 py-3.5 text-right whitespace-nowrap" style={thStyle}>Actions.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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

                  return (
                    <tr 
                      key={t.id} 
                      onClick={() => openEditTicketPane(t)}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${isChecked ? 'bg-pink-50/20' : ''}`}
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
                              ? 'border-[#fe4eba] bg-transparent'
                              : 'border-slate-400 bg-white hover:border-[#fe4eba]'
                          }`}
                          style={{ borderWidth: '2.5px' }}
                          role="checkbox"
                          aria-checked={isChecked}
                        >
                          {isChecked && (
                            <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />
                          )}
                        </button>
                      </td>

                      {/* Référence. (in gelule) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span style={geluleStyle}>
                          {refVal}
                        </span>
                      </td>

                      {/* Criticité. (in gelule) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span style={geluleStyle} className="inline-flex items-center gap-2">
                          <span>{critVal}</span>
                          <span
                            className="inline-block rounded-full shrink-0"
                            style={{
                              width: '10px',
                              height: '10px',
                              minWidth: '10px',
                              minHeight: '10px',
                              backgroundColor: getCriticiteColor(critVal),
                            }}
                            aria-hidden="true"
                          />
                        </span>
                      </td>

                      {/* Ouverture. (Date + rond numéro Semaine) */}
                      <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                        <div className="inline-flex items-center gap-2">
                          <span>{ouvVal}</span>
                          {weekNum && (
                            <span 
                              className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-bold font-sans text-[11px] select-none shadow-2xs"
                              style={{ width: '25px', height: '25px', minWidth: '25px', minHeight: '25px' }}
                              title={`Semaine ${weekNum}`}
                            >
                              {weekNum}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Situation. (in gelule) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span style={geluleStyle}>
                          {sitVal}
                        </span>
                      </td>

                      {/* Indicatif Postal. */}
                      <td className="px-4 py-4 whitespace-nowrap text-center" style={cellTextStyle}>
                        <span className="font-semibold text-slate-800">{indicatifPostalVal}</span>
                      </td>

                      {/* Client. (Dénomination) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span style={geluleStyle} title={t.email ? `Email : ${t.email}` : undefined}>
                          {cliVal}
                        </span>
                      </td>

                      {ticketCategoryFilter === 'Commercial' ? (
                        <>
                          {/* Interlocuteur. (Prospect/client) */}
                          <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.situationInterlocuteur ? (
                              <span 
                                className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                style={{
                                  backgroundColor: t.situationInterlocuteur === 'Client' ? '#dcfce7' : '#fef3c7',
                                  color: t.situationInterlocuteur === 'Client' ? '#166534' : '#92400e',
                                  border: t.situationInterlocuteur === 'Client' ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                }}
                              >
                                {t.situationInterlocuteur}
                              </span>
                            ) : '—'}
                          </td>

                          {/* Type. (Collectivité/entreprise) */}
                          <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.typeStructure || '—'}
                          </td>

                          {/* Famille. */}
                          <td className="px-4 py-4 whitespace-nowrap text-center" style={cellTextStyle}>
                            <span className="font-bold text-slate-900">{t.famille || '—'}</span>
                          </td>

                          {/* Origine Lead. */}
                          <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.origineLead || '—'}
                          </td>

                          {/* Date Devis. */}
                          <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {formatDateDisplay(t.dateDevis)}
                          </td>

                          {/* Référence Devis. */}
                          <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {t.referenceDevis ? (
                              <span style={geluleStyle}>{t.referenceDevis}</span>
                            ) : '—'}
                          </td>

                          {/* Date Pro. Relance */}
                          <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {formatDateDisplay(t.dateProchaineRelance)}
                          </td>

                          {/* Collaborateur. */}
                          <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {colVal}
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Objet. (max 40 chars) */}
                          <td className="px-4 py-4 whitespace-nowrap max-w-[260px] truncate" style={cellTextStyle} title={rawObjet}>
                            {truncatedObjet}
                          </td>

                          {/* Collaborateur. */}
                          <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                            {colVal}
                          </td>
                        </>
                      )}

                      {/* Actions. */}
                      <td 
                        className="px-4 py-4 whitespace-nowrap text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditTicketPane(t);
                            }}
                            style={rowActionButtonStyle}
                            className="hover:bg-zinc-800 transition-colors"
                          >
                            Gérer
                          </button>
                          {sitVal !== 'Terminé' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickTerminate(t.id);
                              }}
                              style={rowActionButtonStyle}
                              className="hover:bg-zinc-800 transition-colors"
                            >
                              Terminer
                            </button>
                          )}
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
                  {/* 1. Situation (3 cards in 33% 33% 33% with pink radio check) */}
                  <div className="space-y-2">
                    <label>Situation.</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['Nouveau', 'En cours', 'Terminé'] as const).map((sit) => {
                        const isSelected = formSituation === sit;
                        return (
                          <div
                            key={sit}
                            onClick={() => setFormSituation(sit)}
                            className="flex items-center justify-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
                            id={`crm-situation-${sit.toLowerCase().replace(/\s+/g, '-')}`}
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
                            <span className="text-[16px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap">
                              {sit}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Référence, Ouverture, Dernière actualisation (Side-by-side 33% 33% 33%, light-grey disabled, 18px font) */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label>Référence.</label>
                      <input
                        type="text"
                        value={formRef}
                        disabled
                        readOnly
                        style={{ fontSize: '18px', backgroundColor: '#f1f5f9', color: '#000000', cursor: 'not-allowed' }}
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
                            paddingRight: getWeekNumberString(formOuverture) ? '54px' : undefined
                          }}
                        />
                        {getWeekNumberString(formOuverture) && (
                          <div 
                            className="absolute right-2.5 flex items-center justify-center rounded-full bg-slate-900 text-white font-bold font-sans pointer-events-none select-none shadow-xs"
                            style={{
                              width: '32px',
                              height: '32px',
                              minWidth: '32px',
                              minHeight: '32px',
                              fontSize: '12px'
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
                        style={{ fontSize: '18px', backgroundColor: '#f1f5f9', color: '#000000', cursor: 'not-allowed' }}
                      />
                    </div>
                  </div>

                  {/* 3. Catégorie & Criticité (Side-by-side 50% 50%) */}
                  <div className="grid grid-cols-2 gap-3">
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
                      <label>Criticité.</label>
                      <select
                        id="crm-form-criticite-select"
                        value={formCriticite}
                        onChange={(e: any) => setFormCriticite(e.target.value)}
                        style={{ ...selectStyle, textAlign: 'center', textAlignLast: 'center' }}
                        className="text-center"
                      >
                        {CRITICITE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 4. Encart: Client ou Prospect, Email, Objet, Description, Collaborateur */}
                  <div 
                    className="space-y-4 p-5"
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    {/* Client ou Prospect (renamed from Client.) */}
                    <div>
                      <label>Client ou Prospect.</label>
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
                            placeholder="Entrez le nom du client ou prospect"
                            value={formCustomClientName}
                            onChange={(e) => setFormCustomClientName(e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Email. (distinct field auto-populated upon client selection, editable) */}
                    <div>
                      <label>Email.</label>
                      <input
                        type="email"
                        placeholder="email@client.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    </div>

                    {/* Situation Interlocuteur (Prospect / Client - choix unique) */}
                    <div>
                      <label>Situation Interlocuteur.</label>
                      <div className="grid grid-cols-2 gap-3">
                        {(['Prospect', 'Client'] as const).map((sit) => {
                          const isSelected = formSituationInterlocuteur === sit;
                          return (
                            <div
                              key={sit}
                              onClick={() => setFormSituationInterlocuteur(sit)}
                              className="flex items-center justify-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
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
                              <span className="text-[16px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap">
                                {sit}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Type Structure (Collectivité / Entreprise - choix unique) */}
                    <div>
                      <label>Type Structure.</label>
                      <div className="grid grid-cols-2 gap-3">
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
                              className="flex items-center justify-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
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
                              <span className="text-[16px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap">
                                {typ}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Prénom Nom. */}
                    <div>
                      <label>Prénom Nom.</label>
                      <input
                        type="text"
                        placeholder="Prénom Nom"
                        value={formPrenomNom}
                        onChange={(e) => setFormPrenomNom(e.target.value)}
                      />
                    </div>

                    {/* Fonction. */}
                    <div>
                      <label>Fonction.</label>
                      <input
                        type="text"
                        placeholder="Fonction"
                        value={formFonction}
                        onChange={(e) => setFormFonction(e.target.value)}
                      />
                    </div>

                    {/* Téléphone. */}
                    <div>
                      <label>Téléphone.</label>
                      <input
                        type="tel"
                        placeholder="Ex: 06 12 34 56 78"
                        value={formTelephone}
                        onChange={(e) => setFormTelephone(e.target.value)}
                      />
                    </div>

                    {/* Objet */}
                    <div>
                      <label>Objet.</label>
                      <input
                        type="text"
                        maxLength={55}
                        placeholder="Entrez un objet (max 55 caractères)"
                        value={formObjet}
                        onChange={(e) => setFormObjet(e.target.value)}
                        required
                      />
                      <div className="text-right text-xs text-slate-500 mt-1 font-sans">
                        {formObjet.length}/55
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label>Description.</label>
                      <textarea
                        ref={descriptionTextareaRef}
                        id="crm-form-description-textarea"
                        placeholder="Entrez une description détaillée..."
                        value={formDescription}
                        onInput={adjustDescriptionHeight}
                        onChange={(e) => {
                          setFormDescription(e.target.value);
                          adjustDescriptionHeight();
                        }}
                        style={{
                          resize: 'none',
                          overflow: 'hidden',
                          minHeight: '100px',
                          lineHeight: '1.5',
                          display: 'block',
                          width: '100%',
                        }}
                      />
                    </div>

                    {/* Collaborateur */}
                    <div>
                      <label>Collaborateur.</label>
                      <select
                        value={formCollaborateur}
                        onChange={(e) => setFormCollaborateur(e.target.value)}
                        style={selectStyle}
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

                  {/* 5. SPECIFIC FIELDS WHEN CATEGORY IS « Commercial » */}
                  {formCategorie === 'Commercial' && (
                    <div 
                      className="space-y-4 p-5 animate-fadeIn"
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        backgroundColor: '#ffffff'
                      }}
                      id="crm-commercial-section"
                    >
                      {/* Marché Public (Radio-check Oui/Non) */}
                      <div>
                        <label>Marché Public.</label>
                        <div className="grid grid-cols-2 gap-3">
                          {(['Oui', 'Non'] as const).map((opt) => {
                            const isSelected = formMarchePublic === opt;
                            return (
                              <div
                                key={opt}
                                onClick={() => setFormMarchePublic(opt)}
                                className="flex items-center justify-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
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
                                <span className="text-[16px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap">
                                  {opt}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Situation Devis (Toggle de trois options « Gagné » / « Perdu » / « Non renseigné ») */}
                      <div>
                        <label>Situation Devis.</label>
                        <div className="grid grid-cols-3 gap-3">
                          {(['Gagné', 'Perdu', 'Non renseigné'] as const).map((sitDevis) => {
                            const isSelected = formSituationDevis === sitDevis;
                            return (
                              <div
                                key={sitDevis}
                                onClick={() => setFormSituationDevis(sitDevis)}
                                className="flex items-center justify-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
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
                                <span className="text-[16px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap">
                                  {sitDevis}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Score Potentiel Conversion (8 ronds 1 à 8 avec toggle select/deselect) */}
                      <div>
                        <label>Score Potentiel Conversion.</label>
                        <div className="flex items-center gap-2.5 flex-wrap pt-1">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((scoreNum) => {
                            const isSelected = formScoreConversion === scoreNum;
                            return (
                              <button
                                key={scoreNum}
                                type="button"
                                onClick={() => setFormScoreConversion(prev => prev === scoreNum ? null : scoreNum)}
                                style={{
                                  width: '42px',
                                  height: '42px',
                                  borderRadius: '50%',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '17px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                                  backgroundColor: isSelected ? '#000000' : '#ffffff',
                                  color: isSelected ? '#ffffff' : '#000000',
                                  border: isSelected ? '2.5px solid #000000' : '1.5px solid #cbd5e1',
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

                      {/* Référence Devis. */}
                      <div>
                        <label>Référence Devis.</label>
                        <input
                          type="text"
                          placeholder="Ex: DEV-2026-081"
                          value={formReferenceDevis}
                          onChange={(e) => setFormReferenceDevis(e.target.value)}
                        />
                      </div>

                      {/* Total Affaire HT (en dessous de Référence Devis.) */}
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
                            style={{ paddingRight: '50px' }}
                          />
                          <span className="absolute right-3.5 text-sm font-semibold text-slate-500 font-sans pointer-events-none">
                            € HT
                          </span>
                        </div>
                      </div>

                      {/* Famille. (1 lettre uppercase) & Indicatif Postal. (2 chiffres) */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label>Famille.</label>
                          <input
                            type="text"
                            maxLength={1}
                            placeholder="A"
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
                            placeholder="75"
                            value={formIndicatifPostal}
                            onChange={(e) => setFormIndicatifPostal(e.target.value.replace(/\D/g, '').slice(0, 2))}
                            style={{ textAlign: 'center', fontSize: '18px', fontWeight: 600 }}
                          />
                        </div>
                      </div>

                      {/* Origine Lead. (dropdown liste : Service Client, Direct, Internet, Planification, Autre.) */}
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
                          <option value="Autre.">Autre.</option>
                        </select>
                      </div>

                      {/* Description Offre Devis. (one line field) */}
                      <div>
                        <label>Description Offre Devis.</label>
                        <input
                          type="text"
                          placeholder="Ex: Remplacement électrodes et pack batterie..."
                          value={formDescriptionOffreDevis}
                          onChange={(e) => setFormDescriptionOffreDevis(e.target.value)}
                        />
                      </div>

                      {/* Dates commerciales : Date Devis., Date Prochaine Relance., Date Commande. */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label>Date Devis.</label>
                          <input
                            type="date"
                            value={formDateDevis}
                            onChange={(e) => setFormDateDevis(e.target.value)}
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

                      {/* Lien Stockage Partagé Devis. avec bouton "Ouvrir" infield si value */}
                      <div>
                        <label>Lien Stockage Partagé Devis.</label>
                        <div className="relative flex items-center">
                          <input
                            type="url"
                            placeholder="https://drive.google.com/... ou lien partagé"
                            value={formLienDevis}
                            onChange={(e) => setFormLienDevis(e.target.value)}
                            style={{ paddingRight: formLienDevis.trim() ? '90px' : undefined }}
                          />
                          {formLienDevis.trim() && (
                            <button
                              type="button"
                              onClick={() => {
                                let targetUrl = formLienDevis.trim();
                                if (!/^https?:\/\//i.test(targetUrl)) {
                                  targetUrl = 'https://' + targetUrl;
                                }
                                window.open(targetUrl, '_blank', 'noopener,noreferrer');
                              }}
                              className="absolute right-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                              title="Ouvrir le lien dans un nouvel onglet"
                            >
                              Ouvrir
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Sub-form: Événement(s) suivi pré-vente */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="!mb-0">Événement(s) suivi pré-vente.</label>
                          <button
                            type="button"
                            onClick={handleAddCommercialEvent}
                            style={{
                              backgroundColor: '#000000',
                              color: '#ffffff',
                              borderRadius: '10px',
                              fontSize: '14px',
                              padding: '6px 14px',
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                            }}
                            className="hover:bg-zinc-800 transition-colors"
                          >
                            Nouvel événement
                          </button>
                        </div>

                        {formCommercialEvents.length > 0 && (
                          <div className="space-y-3">
                            {formCommercialEvents.map((evt) => (
                              <div key={evt.id} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-xs">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <label className="text-xs !font-semibold text-slate-600 !mb-1">Date.</label>
                                    <input
                                      type="text"
                                      value={evt.date}
                                      onChange={(e) => handleUpdateCommercialEvent(evt.id, 'date', e.target.value)}
                                      placeholder="DD/MM/YYYY"
                                      style={{
                                        width: '140px !important',
                                        padding: '6px 10px !important',
                                        fontSize: '14px !important',
                                        borderRadius: '8px !important',
                                      }}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveCommercialEvent(evt.id)}
                                    style={{
                                      backgroundColor: '#dc2626',
                                      color: '#ffffff',
                                      borderRadius: '8px',
                                      padding: '6px 14px',
                                      fontSize: '13px',
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
                                  <textarea
                                    rows={3}
                                    value={evt.commentaire}
                                    onChange={(e) => handleUpdateCommercialEvent(evt.id, 'commentaire', e.target.value)}
                                    placeholder="Entrez un compte-rendu ou commentaire..."
                                    style={{
                                      fontSize: '15px !important',
                                      padding: '8px 10px !important',
                                      borderRadius: '8px !important',
                                      resize: 'vertical',
                                      width: '100%'
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 5-bis. SPECIFIC BLOCK WHEN CATEGORY IS TECHNIQUE / RÉCLAMATION / SANS CATÉGORIE: ENVOI DE MESSAGE AU CLIENT & HISTORIQUE */}
                  {formCategorie !== 'Commercial' && (
                    <div 
                      className="space-y-4 p-5 animate-fadeIn"
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e0',
                        borderRadius: '16px'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="!mb-0" style={{ fontSize: '18px', fontWeight: 600, color: '#000000' }}>
                          Messages au client.
                        </label>
                        <button
                          type="button"
                          onClick={handleOpenNewMessage}
                          style={{
                            backgroundColor: '#000000',
                            color: '#ffffff',
                            borderRadius: '10px',
                            fontSize: '14px',
                            padding: '6px 14px',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                          }}
                          className="hover:bg-zinc-800 transition-colors"
                        >
                          {isNewMessageOpen ? 'Fermer le formulaire' : 'Nouveau message'}
                        </button>
                      </div>

                      {supportMessageSentToast && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium animate-fadeIn">
                          {supportMessageSentToast}
                        </div>
                      )}

                      {/* Sub-form: Nouveau message */}
                      {isNewMessageOpen && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5 shadow-xs animate-fadeIn">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs !font-semibold text-slate-600 !mb-0">Destinataire.</label>
                              <span className="text-xs text-slate-500 font-sans">
                                {formEmail.trim() ? (
                                  <span className="font-mono text-slate-700">{formEmail.trim()}</span>
                                ) : (
                                  <span className="text-amber-600">Aucun email renseigné (veuillez saisir le champ Email au-dessus)</span>
                                )}
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="text-xs !font-semibold text-slate-600 !mb-1">Objet.</label>
                            <input
                              type="text"
                              value={newMessageObjet}
                              onChange={(e) => setNewMessageObjet(e.target.value)}
                              placeholder="Objet du message..."
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
                              placeholder="Rédigez votre message au client..."
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
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                borderRadius: '8px',
                                padding: '8px 16px',
                                fontSize: '14px',
                                fontWeight: 500,
                                border: '1px solid #cbd5e1',
                                cursor: 'pointer'
                              }}
                              className="hover:bg-slate-200 transition-colors"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={handleSendSupportMessage}
                              disabled={isSendingSupportMessage || !newMessageObjet.trim() || !newMessageBody.trim()}
                              style={{
                                backgroundColor: isSendingSupportMessage ? '#94a3b8' : '#3556ec',
                                color: '#ffffff',
                                borderRadius: '8px',
                                padding: '8px 20px',
                                fontSize: '14px',
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

                      {/* Fil d'ariane des messages envoyés (historique) */}
                      {formSupportMessages.length > 0 && (
                        <div className="space-y-3 pt-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-sans block">
                            Historique des messages envoyés ({formSupportMessages.length})
                          </span>

                          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                            {formSupportMessages.map((msg) => (
                              <div key={msg.id} className="relative group">
                                {/* Pastille sur la ligne de fil d'ariane */}
                                <div 
                                  className="absolute -left-6 top-1.5 rounded-full bg-blue-600 border-2 border-white shadow-xs"
                                  style={{ width: '12px', height: '12px' }}
                                />
                                
                                <div className="p-3.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 rounded-xl space-y-2 transition-colors">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-sans">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-slate-800">
                                        {msg.date} à {msg.heure}
                                      </span>
                                      <span>•</span>
                                      <span>À : <span className="font-mono text-slate-700">{msg.destinataire}</span></span>
                                    </div>
                                    {msg.expediteur && (
                                      <span className="text-slate-500 font-sans">
                                        Par : {msg.expediteur}
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-[15px] font-semibold text-slate-900 font-sans">
                                    {msg.objet}
                                  </div>

                                  <div className="text-[14px] text-slate-700 font-sans whitespace-pre-wrap leading-relaxed">
                                    {msg.message}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
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
                      backgroundColor: '#3556ec',
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
                      backgroundColor: '#000000',
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
            <div className="w-screen max-w-md sm:max-w-2xl lg:max-w-3xl bg-white shadow-2xl flex flex-col p-6 sm:p-8 overflow-y-auto justify-between">
              <div className="space-y-6">
                {/* Section FILTRES (Plage date à date & Employé) */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 text-left">
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
                          border: '1px solid #cbd5e0 !important'
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
                          border: '1px solid #cbd5e0 !important'
                        }}
                      />
                    </div>
                  </div>

                  {/* Bouton Export déplacé juste au-dessus du champ Employé, sans icône download */}
                  <div>
                    <button
                      type="button"
                      id="btn-export-crm-performance-csv"
                      onClick={handleExportPerformanceCSV}
                      style={{
                        backgroundColor: '#3556ec',
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: 'normal',
                        borderRadius: '13px',
                        padding: '12px 24px',
                        border: 'none',
                        cursor: 'pointer',
                        width: '100%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      }}
                      className="hover:bg-[#2b48cc] transition-colors"
                    >
                      Exporter en CSV ({filteredPerfTickets.length} lignes)
                    </button>
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
                        border: '1px solid #cbd5e0 !important'
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
                    {/* Bloc stat 1: « Tickets ouverts » (count Nouveau + En cours) */}
                    <div 
                      className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center space-y-1"
                      id="stat-block-tickets-ouverts"
                    >
                      <span className="text-xs font-semibold text-amber-700 font-sans block">
                        Tickets ouverts
                      </span>
                      <div className="text-3xl font-bold font-sans text-slate-900">
                        {statTicketsOuverts}
                      </div>
                      <span className="text-xs text-black font-sans block">
                        (Nouveau / En cours)
                      </span>
                    </div>

                    {/* Bloc stat 2: « Tickets fermés » (count Terminé) */}
                    <div 
                      className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center space-y-1"
                      id="stat-block-tickets-fermes"
                    >
                      <span className="text-xs font-semibold text-emerald-700 font-sans block">
                        Tickets fermés
                      </span>
                      <div className="text-3xl font-bold font-sans text-slate-900">
                        {statTicketsFermes}
                      </div>
                      <span className="text-xs text-black font-sans block">
                        (Terminé / Résolu)
                      </span>
                    </div>

                    {/* Bloc stat 3: « Volume affaires » (sum Total Affaire HT pour catégorie Commercial, situation devis nul, non renseigné ou gagné) */}
                    <div 
                      className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center space-y-1"
                      id="stat-block-volume-affaires"
                    >
                      <span className="text-xs font-semibold text-blue-700 font-sans block">
                        Volume affaires
                      </span>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-2xl sm:text-3xl font-bold font-sans text-slate-900">
                          {statVolumeAffaires.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-xl font-bold font-sans text-slate-900">
                          €
                        </span>
                      </div>
                      <span className="text-xs text-black font-sans block">
                        Devis gagnés ou en cours (HT)
                      </span>
                    </div>

                    {/* Bloc stat 4: « Score closing » (note sur 10 selon devis Gagné / Perdu) */}
                    <div 
                      className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center space-y-1"
                      id="stat-block-score-closing"
                    >
                      <span className="text-xs font-semibold text-purple-700 font-sans block">
                        Score closing
                      </span>
                      <div className="text-3xl font-bold font-sans text-slate-900">
                        {scoreClosingText}
                      </div>
                      <span className="text-xs text-black font-sans block">
                        {totalDeals > 0 
                          ? `${dealsGagnes} gagné(s) / ${totalDeals} traité(s) (${Math.round((dealsGagnes / totalDeals) * 100)}%)`
                          : 'Aucun devis clos sur la période'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Full-width Fermer button at bottom */}
              <div className="pt-6">
                <button
                  type="button"
                  id="btn-close-crm-performance-bottom"
                  onClick={() => setIsPerformancePaneOpen(false)}
                  style={{
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    borderRadius: '13px',
                    padding: '14px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    border: 'none',
                    width: '100%',
                    cursor: 'pointer',
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
            <div className="w-screen max-w-md sm:max-w-2xl bg-white shadow-2xl flex flex-col p-6 overflow-y-auto justify-between">
              <div>
                <div className="space-y-6">
                  {/* Section 1: Modèle Texte de l'email de relance avec variables */}
                  <div 
                    className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left"
                    id="crm-settings-section-relance-email"
                  >
                    <div>
                      <label style={{ fontSize: '18px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block' }}>
                        Texte de l’email de relance.
                      </label>
                      <p className="text-xs text-slate-500 font-sans mb-3">
                        Ce texte sera utilisé lors de l'envoi d'emails de relance aux devis ou tickets sélectionnés dans la table.
                      </p>

                      {/* Champ Email ReplyTo. */}
                      <div className="mb-3">
                        <label style={{ fontSize: '15px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block' }}>
                          Email ReplyTo.
                        </label>
                        <input
                          type="email"
                          value={relanceEmailReplyTo}
                          onChange={(e) => setRelanceEmailReplyTo(e.target.value)}
                          placeholder="Ex: commercial@votre-entreprise.com"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            border: '1px solid #cbd5e0',
                            borderRadius: '11px',
                            fontSize: '15px',
                            color: '#000000',
                            boxSizing: 'border-box',
                            outline: 'none',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                          }}
                        />
                      </div>

                      {/* Liste des variables insérables */}
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mb-3">
                        <span className="font-semibold text-slate-800 block text-xs uppercase tracking-wider font-sans">
                          Variables insérables :
                        </span>
                        <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => setRelanceEmailBody(prev => prev + '{Client.}')}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:border-black transition-colors cursor-pointer text-slate-800"
                            title="Insérer {Client.}"
                          >
                            Client.
                          </button>
                          <button
                            type="button"
                            onClick={() => setRelanceEmailBody(prev => prev + '{Référence Devis.}')}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:border-black transition-colors cursor-pointer text-slate-800"
                            title="Insérer {Référence Devis.}"
                          >
                            Référence Devis.
                          </button>
                          <button
                            type="button"
                            onClick={() => setRelanceEmailBody(prev => prev + '{Lien Stockage Partagé Devis.}')}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:border-black transition-colors cursor-pointer text-slate-800"
                            title="Insérer {Lien Stockage Partagé Devis.}"
                          >
                            Lien Stockage Partagé Devis.
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 font-sans mt-1">
                          Cliquez sur un bouton pour ajouter la variable ou insérez-la manuellement dans le texte ci-dessous.
                        </p>
                      </div>

                      {/* Multiline textarea */}
                      <textarea
                        id="crm-relance-email-textarea"
                        rows={7}
                        value={relanceEmailBody}
                        onChange={(e) => setRelanceEmailBody(e.target.value)}
                        placeholder="Écrivez le modèle d'email de relance..."
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: '1px solid #cbd5e0',
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
                      onClick={handleSaveCrmSettings}
                      disabled={isSavingSettings}
                      style={{
                        backgroundColor: '#3556ec',
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: 'normal',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        border: 'none',
                        cursor: isSavingSettings ? 'wait' : 'pointer',
                        width: '100%',
                        display: 'block',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      }}
                      className="hover:bg-[#2b48cc] transition-colors font-sans"
                    >
                      {isSavingSettings ? 'Enregistrement dans la base...' : settingsSavedToast ? '✓ Réglages enregistrés !' : 'Enregistrer le texte de relance'}
                    </button>
                  </div>

                  {/* Section 1-bis: Modèle Texte initial email de support avec options & champ Objet */}
                  <div 
                    className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left"
                    id="crm-settings-section-support-email"
                  >
                    <div>
                      <label style={{ fontSize: '18px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block' }}>
                        Texte initial email de support.
                      </label>
                      <p className="text-xs text-slate-500 font-sans mb-3">
                        Ce texte et son objet par défaut seront pré-remplis lors de l'envoi d'un nouveau message au client sur les tickets Technique, Réclamation ou Sans Catégorie.
                      </p>

                      {/* Champ Email ReplyTo. */}
                      <div className="mb-3">
                        <label style={{ fontSize: '15px', fontWeight: 600, color: '#000000', marginBottom: '6px', display: 'block' }}>
                          Email ReplyTo.
                        </label>
                        <input
                          type="email"
                          value={supportEmailReplyTo}
                          onChange={(e) => setSupportEmailReplyTo(e.target.value)}
                          placeholder="Ex: support@votre-entreprise.com"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            border: '1px solid #cbd5e0',
                            borderRadius: '11px',
                            fontSize: '15px',
                            color: '#000000',
                            boxSizing: 'border-box',
                            outline: 'none',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                          }}
                        />
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
                            border: '1px solid #cbd5e0',
                            borderRadius: '11px',
                            fontSize: '15px',
                            color: '#000000',
                            boxSizing: 'border-box',
                            outline: 'none',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                          }}
                        />
                      </div>

                      {/* Liste des variables insérables */}
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mb-3">
                        <span className="font-semibold text-slate-800 block text-xs uppercase tracking-wider font-sans">
                          Variables insérables :
                        </span>
                        <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => setSupportEmailBody(prev => prev + '{Client.}')}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:border-black transition-colors cursor-pointer text-slate-800"
                            title="Insérer {Client.}"
                          >
                            Client.
                          </button>
                          <button
                            type="button"
                            onClick={() => setSupportEmailBody(prev => prev + '{Référence.}')}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:border-black transition-colors cursor-pointer text-slate-800"
                            title="Insérer {Référence.}"
                          >
                            Référence.
                          </button>
                          <button
                            type="button"
                            onClick={() => setSupportEmailBody(prev => prev + '{Objet.}')}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:border-black transition-colors cursor-pointer text-slate-800"
                            title="Insérer {Objet.}"
                          >
                            Objet.
                          </button>
                          <button
                            type="button"
                            onClick={() => setSupportEmailBody(prev => prev + '{Collaborateur.}')}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:border-black transition-colors cursor-pointer text-slate-800"
                            title="Insérer {Collaborateur.}"
                          >
                            Collaborateur.
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 font-sans mt-1">
                          Cliquez sur un bouton pour ajouter la variable ou insérez-la manuellement dans le texte ci-dessous.
                        </p>
                      </div>

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
                          border: '1px solid #cbd5e0',
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
                      onClick={handleSaveCrmSettings}
                      disabled={isSavingSettings}
                      style={{
                        backgroundColor: '#3556ec',
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: 'normal',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        border: 'none',
                        cursor: isSavingSettings ? 'wait' : 'pointer',
                        width: '100%',
                        display: 'block',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      }}
                      className="hover:bg-[#2b48cc] transition-colors font-sans"
                    >
                      {isSavingSettings ? 'Enregistrement dans la base...' : settingsSavedToast ? '✓ Réglages enregistrés !' : 'Enregistrer le texte de support'}
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
                          backgroundColor: '#000000',
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
              </div>

              {/* Full-width Fermer button at bottom */}
              <div className="pt-6">
                <button
                  type="button"
                  id="btn-close-crm-settings-bottom"
                  onClick={() => setIsSettingsPaneOpen(false)}
                  style={{
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    borderRadius: '13px',
                    padding: '14px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    border: 'none',
                    width: '100%',
                    cursor: 'pointer',
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
    </div>
  );
};
