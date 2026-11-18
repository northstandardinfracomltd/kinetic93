import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ExpeditionRecord,
  StockRecord,
  Variable,
  Member,
  Client,
  CompanyInfo,
  getTenantSpreadsheetUrl,
  openTenantSpreadsheetUrl,
} from '../types';
import { createPortal } from 'react-dom';
import { t } from '../utils/translate';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';

interface ExpeditionsTabProps {
  expeditions: ExpeditionRecord[];
  saveExpeditions: (updated: ExpeditionRecord[]) => void;
  stocks: StockRecord[];
  variables: Variable[];
  members: Member[];
  clients: Client[];
  companyInfo?: Partial<CompanyInfo> | null;
  onClose?: () => void;
  initialSearchQuery?: string;
}

const CONTEXTE_OPTIONS = [
  'Fourniture au client',
  'Fourniture au technicien',
  'Retour au fournisseur',
  'Retour du client',
  'Retour du technicien',
  'Réception approvisionnement',
  'Autre',
];

const EXPEDITEUR_DESTINATAIRE_OPTIONS = [
  'Centrale des stocks',
  'Technicien',
  'Client',
  'Fournisseur',
  'Autre',
];

const PREPARATEUR_CATEGORIES = [
  'Administrateur',
  'Client',
  'Technicien',
  'Autre',
];

const TRANSPORTEUR_OPTIONS = [
  'DHL Express',
  'Fedex',
  'Laposte',
  'GLS',
  'UPS',
  'Mondial Relay',
  'SEUR',
  'Geodis',
  'Nacex',
  'Correos Express',
  'XPO Logistics',
  'DB Schenker',
  'Kuehne+Nagel',
  'GXO Logistics',
  'Hapag-Lloyd',
  'CTT Express',
  'Autre',
];

const STATUT_OPTIONS = [
  'Aucune information',
  'En attente',
  'Préparation',
  'Envoyé',
  'Réceptionné',
  'Incident',
];

export function getCarrierTrackingUrl(transporteur: string, numeroSuivi: string): string | null {
  const cleanNum = String(numeroSuivi || '').replace(/[^a-zA-Z0-9]/g, '').trim();
  const cleanCarrier = String(transporteur || '').trim();
  if (!cleanCarrier || !cleanNum) return null;

  switch (cleanCarrier) {
    case 'DHL Express':
      return `https://www.dhl.com/fr-fr/home/suivi.html?tracking-id=${encodeURIComponent(cleanNum)}`;
    case 'Fedex':
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(cleanNum)}&cntry_code=fr`;
    case 'Laposte':
      return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(cleanNum)}`;
    case 'GLS':
      return `https://gls-group.com/FR/fr/suivi-colis/?match=${encodeURIComponent(cleanNum)}`;
    case 'UPS':
      return `https://www.ups.com/track?loc=fr_FR&tracknum=${encodeURIComponent(cleanNum)}`;
    case 'Mondial Relay':
      return `https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${encodeURIComponent(cleanNum)}`;
    case 'SEUR':
      return `https://www.seur.com/livetracking/?segOnlineIdentificador=${encodeURIComponent(cleanNum)}`;
    case 'Geodis':
      return `https://espace-client.geodis.com/services/destinataires/#/fr/suivi/${encodeURIComponent(cleanNum)}`;
    case 'Nacex':
      return `https://www.nacex.es/irSeguimiento.do?agencia_origen=&numero_albaran=${encodeURIComponent(cleanNum)}`;
    case 'Correos Express':
      return `https://s2.correosexpress.com/ccexpress/track?envio=${encodeURIComponent(cleanNum)}`;
    case 'XPO Logistics':
      return `https://track.xpo.com/tracking?trackingNumber=${encodeURIComponent(cleanNum)}`;
    case 'DB Schenker':
      return `https://www.dbschenker.com/app/tracking-public/?refNumber=${encodeURIComponent(cleanNum)}&language_region=fr-FR_FR`;
    case 'Kuehne+Nagel':
      return `https://mykn.kuehne-nagel.com/public-tracking/shipments?query=${encodeURIComponent(cleanNum)}`;
    case 'GXO Logistics':
      return null;
    case 'Hapag-Lloyd':
      return `https://www.hapag-lloyd.com/fr/online-business/track/track-by-booking-solution.html?blno=${encodeURIComponent(cleanNum)}`;
    case 'CTT Express':
      return `https://www.cttexpress.com/localizador-de-envios/?sc=${encodeURIComponent(cleanNum)}`;
    case 'Autre':
    default:
      return null;
  }
}

function parseNumericAmount(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  const cleaned = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatNumberClean(num: number): string {
  if (!Number.isFinite(num) || num === 0) return '0';
  return Number(num.toFixed(2)).toString();
}

function openExternalUrlInNewTab(url: string) {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface AvailableColisageCatalogItem {
  key: string;
  stockId: string;
  traceabilityId?: string;
  format: 'A' | 'B';
  title: string;
  defaultVolume: number;
  unitWeightKg: number;
  unitTransportCostEur: number;
}

export const ExpeditionsTab: React.FC<ExpeditionsTabProps> = ({
  expeditions,
  saveExpeditions,
  stocks,
  variables,
  members,
  clients,
  companyInfo,
  onClose,
  initialSearchQuery,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (initialSearchQuery !== undefined && initialSearchQuery !== null) {
      setSearchQuery(String(initialSearchQuery));
      if (String(initialSearchQuery).trim() !== '') {
        setShowForm(false);
      }
    }
  }, [initialSearchQuery]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [clickedPill, setClickedPill] = useState<string | null>(null);
  const [isRefreshingLocal, setIsRefreshingLocal] = useState(false);

  // Table fit view ("Minimiser et ajuster l’affichage") state & refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [isTableFitView, setIsTableFitView] = useState<boolean>(false);
  const [tableFitScale, setTableFitScale] = useState<number>(1);
  const naturalTableWidthRef = useRef<number>(1300);

  const toggleTableFitView = () => {
    setIsTableFitView((prev) => {
      const next = !prev;
      if (next) {
        if (tableContainerRef.current) {
          const sWidth = tableContainerRef.current.scrollWidth;
          if (sWidth > 500) {
            naturalTableWidthRef.current = sWidth;
          }
          const clientW = tableContainerRef.current.clientWidth;
          const naturalW = naturalTableWidthRef.current || 1300;
          const scale = Math.min(1, Math.max(0.1, (clientW - 2) / naturalW));
          setTableFitScale(scale);
        }
      } else {
        setTableFitScale(1);
      }
      return next;
    });
  };

  // Form states
  const [contexte, setContexte] = useState('');
  const [expediteur, setExpediteur] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [destinataireValue, setDestinataireValue] = useState('');
  const [reference, setReference] = useState('');
  const [preparateurCategory, setPreparateurCategory] = useState('');
  const [preparateurValue, setPreparateurValue] = useState('');
  const [transporteur, setTransporteur] = useState('');
  const [numeroSuivi, setNumeroSuivi] = useState('');
  const [codePostalDestinataire, setCodePostalDestinataire] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [statut, setStatut] = useState('');

  // Colisage side-pane states
  const [isColisageSidePaneOpen, setIsColisageSidePaneOpen] = useState(false);
  const [colisageSearch, setColisageSearch] = useState('');
  // Map of item.key -> { checked: boolean; volume: number; title: string; unitWeightKg: number; unitTransportCostEur: number }
  const [selectedColisageMap, setSelectedColisageMap] = useState<
    Record<
      string,
      {
        checked: boolean;
        volume: number;
        title: string;
        unitWeightKg: number;
        unitTransportCostEur: number;
      }
    >
  >({});

  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (commentTextareaRef.current) {
      commentTextareaRef.current.style.height = 'auto';
      commentTextareaRef.current.style.height = `${Math.max(43, commentTextareaRef.current.scrollHeight)}px`;
    }
  }, [commentaire, showForm]);

  const handleRefreshClick = () => {
    setIsRefreshingLocal(true);
    window.dispatchEvent(
      new CustomEvent('defib-manual-refresh-spreadsheet', {
        detail: { spreadsheetKey: 'spreadsheetExpeditions', idSuffix: 'expeditions' },
      })
    );
    setTimeout(() => setIsRefreshingLocal(false), 1200);
  };

  // Build catalog of available pieces from STOCKS (Format A and Format B)
  const catalogItems = useMemo<AvailableColisageCatalogItem[]>(() => {
    const list: AvailableColisageCatalogItem[] = [];
    for (const st of stocks || []) {
      if (!st) continue;
      const ugs = String(st.ugs || st.id || 'SANS-UGS').trim();
      const matchedVar = (variables || []).find(
        (v) =>
          v.id === st.denominationPieceId ||
          String(v.nom || '').trim().toLowerCase() === String(st.denominationPieceId || '').trim().toLowerCase()
      );
      const pieceTitle = String(matchedVar?.nom || st.denominationPieceId || 'Pièce sans titre').trim();
      const unitWeightKg = parseNumericAmount(st.poidsNet);
      const unitTransportCostEur = parseNumericAmount(st.fraisFixeCoutTransport);

      if (st.traceabilityEnabled) {
        // Format B: AVEC INVENTAIRE DE TRAÇABILITÉ -> ne lister que les pièces dont situation = Disponible
        const traces = Array.isArray(st.traceabilities) ? st.traceabilities : [];
        traces.forEach((tr, idx) => {
          const sit = String(tr?.situation || '').trim().toLowerCase();
          if (sit === 'disponible') {
            const emp = String(tr.emplacement || 'Non renseigné').trim();
            const lot = String(tr.lotOrSerial || (tr as any).lotNumber || 'Non renseigné').trim();
            const title = `${ugs} - ${pieceTitle} - Emplacement: ${emp} - Lot/Série: ${lot}`;
            const key = `B__${st.id}__${tr.id || idx}__${lot}`;
            list.push({
              key,
              stockId: st.id,
              traceabilityId: tr.id || String(idx),
              format: 'B',
              title,
              defaultVolume: 1,
              unitWeightKg,
              unitTransportCostEur,
            });
          }
        });
      } else {
        // Format A: SANS INVENTAIRE DE TRAÇABILITÉ
        const title = `${ugs} - ${pieceTitle}`;
        const key = `A__${st.id}`;
        list.push({
          key,
          stockId: st.id,
          format: 'A',
          title,
          defaultVolume: 0,
          unitWeightKg,
          unitTransportCostEur,
        });
      }
    }
    return list;
  }, [stocks, variables]);

  // Calculate live totals from selectedColisageMap
  const colisageStats = useMemo(() => {
    let checkedItemsCount = 0;
    let totalPiecesVolume = 0;
    let totalWeightKg = 0;
    let totalTransportCostEur = 0;
    const serializedParts: string[] = [];

    for (const item of catalogItems) {
      const entry = selectedColisageMap[item.key];
      if (entry && entry.checked) {
        checkedItemsCount += 1;
        const vol = Number.isFinite(entry.volume) && entry.volume >= 0 ? entry.volume : item.defaultVolume;
        totalPiecesVolume += vol;
        totalWeightKg += (item.unitWeightKg || 0) * vol;
        totalTransportCostEur += (item.unitTransportCostEur || 0) * vol;
        serializedParts.push(`[Qté: ${vol}] ${item.title}`);
      }
    }

    // Also include any previously saved items that might no longer be in catalogItems
    for (const k of Object.keys(selectedColisageMap)) {
      const entry = selectedColisageMap[k];
      if (entry && entry.checked && !catalogItems.some((c) => c.key === k)) {
        checkedItemsCount += 1;
        const vol = Number.isFinite(entry.volume) && entry.volume >= 0 ? entry.volume : 1;
        totalPiecesVolume += vol;
        totalWeightKg += (entry.unitWeightKg || 0) * vol;
        totalTransportCostEur += (entry.unitTransportCostEur || 0) * vol;
        serializedParts.push(`[Qté: ${vol}] ${entry.title}`);
      }
    }

    return {
      checkedItemsCount,
      totalPiecesVolume,
      totalWeightKg,
      totalTransportCostEur,
      serializedString: serializedParts.join(' | '),
    };
  }, [catalogItems, selectedColisageMap]);

  // Member lists for Préparateur & Destinataire lookup
  const isMemberTechnician = (m: any): boolean => {
    if (!m || m.role === 'Inactif') return false;
    const rawRole = String(
      (m.role && m.role !== 'Collaborateur' ? m.role : '') ||
        m.categorie ||
        m.category ||
        m['Catégorie.'] ||
        m['Catégorie'] ||
        m.adminSubRole ||
        m.metier ||
        m['Métier.'] ||
        m['Métier'] ||
        m.role ||
        ''
    )
      .trim()
      .toLowerCase();
    const subRole = String(
      m.adminSubRole || m.categorie || m.category || m['Catégorie.'] || m['Catégorie'] || ''
    )
      .trim()
      .toLowerCase();
    return (
      rawRole.includes('tech') ||
      rawRole === 'maintenance terrain' ||
      subRole.includes('tech') ||
      subRole === 'maintenance terrain'
    );
  };

  const getMemberDisplayLabel = (m: any): string => {
    if (!m) return '';
    return String(
      m.name ||
        m.nomPrenom ||
        m['Nom et prénom.'] ||
        m['Nom et prénom'] ||
        m['Nom Prénom'] ||
        m.email ||
        ''
    ).trim();
  };

  const nonTechnicianMembers = useMemo(() => {
    return (members || []).filter((m) => m && m.role !== 'Inactif' && !isMemberTechnician(m));
  }, [members]);

  const technicianMembers = useMemo(() => {
    return (members || []).filter((m) => isMemberTechnician(m));
  }, [members]);

  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of clients || []) {
      const label = String(c.denomination || c.nomSite || c.id || '').trim();
      if (label) names.add(label);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [clients]);

  const supplierOptions = useMemo(() => {
    const names = new Set<string>();
    for (const v of variables || []) {
      if (v && v.category === 'Fournisseur' && v.nom) {
        const label = String(v.nom).trim();
        if (label) names.add(label);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [variables]);

  const parseDestinataireString = (raw: string): { category: string; value: string } => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return { category: '', value: '' };
    for (const cat of EXPEDITEUR_DESTINATAIRE_OPTIONS) {
      if (trimmed === cat) return { category: cat, value: '' };
      if (trimmed.startsWith(`${cat} - `)) {
        return { category: cat, value: trimmed.slice(`${cat} - `.length).trim() };
      }
      if (trimmed.startsWith(`${cat}: `)) {
        return { category: cat, value: trimmed.slice(`${cat}: `.length).trim() };
      }
    }
    return { category: 'Autre', value: trimmed };
  };

  const parsePreparateurString = (raw: string): { category: string; value: string } => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return { category: '', value: '' };
    for (const cat of PREPARATEUR_CATEGORIES) {
      if (trimmed === cat) return { category: cat, value: '' };
      if (trimmed.startsWith(`${cat} - `)) {
        return { category: cat, value: trimmed.slice(`${cat} - `.length).trim() };
      }
      if (trimmed.startsWith(`${cat}: `)) {
        return { category: cat, value: trimmed.slice(`${cat}: `.length).trim() };
      }
    }
    return { category: 'Autre', value: trimmed };
  };

  const parseColisageStringToMap = (raw: string) => {
    const map: Record<
      string,
      {
        checked: boolean;
        volume: number;
        title: string;
        unitWeightKg: number;
        unitTransportCostEur: number;
      }
    > = {};

    const trimmed = String(raw || '').trim();
    if (!trimmed) return map;

    const segments = trimmed
      .split(/\s*\|\s*|\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    segments.forEach((seg, idx) => {
      let vol = 1;
      let titleText = seg;
      const matchQte = seg.match(/^\[Qté:\s*(\d+(?:[.,]\d+)?)\]\s*(.+)$/i);
      const matchX = seg.match(/^(\d+(?:[.,]\d+)?)\s*x\s+(.+)$/i);
      if (matchQte) {
        vol = parseFloat(matchQte[1].replace(',', '.')) || 0;
        titleText = matchQte[2].trim();
      } else if (matchX) {
        vol = parseFloat(matchX[1].replace(',', '.')) || 0;
        titleText = matchX[2].trim();
      }

      const foundCatalog = catalogItems.find(
        (c) => c.title.toLowerCase() === titleText.toLowerCase()
      );
      if (foundCatalog) {
        map[foundCatalog.key] = {
          checked: true,
          volume: vol,
          title: foundCatalog.title,
          unitWeightKg: foundCatalog.unitWeightKg,
          unitTransportCostEur: foundCatalog.unitTransportCostEur,
        };
      } else {
        const ugsPrefix = titleText.split(' - ')[0]?.trim().toLowerCase() || '';
        const matchedStock = ugsPrefix
          ? (stocks || []).find(
              (s) =>
                s &&
                (String(s.ugs || '').trim().toLowerCase() === ugsPrefix ||
                  String(s.id || '').trim().toLowerCase() === ugsPrefix)
            )
          : undefined;
        map[`LEGACY__${idx}__${titleText}`] = {
          checked: true,
          volume: vol,
          title: titleText,
          unitWeightKg: matchedStock ? parseNumericAmount(matchedStock.poidsNet) : 0,
          unitTransportCostEur: matchedStock ? parseNumericAmount(matchedStock.fraisFixeCoutTransport) : 0,
        };
      }
    });

    return map;
  };

  const resetForm = () => {
    setEditingId(null);
    setContexte('');
    setExpediteur('');
    setDestinataire('');
    setDestinataireValue('');
    setReference('');
    setPreparateurCategory('');
    setPreparateurValue('');
    setTransporteur('');
    setNumeroSuivi('');
    setCodePostalDestinataire('');
    setCommentaire('');
    setStatut('');
    setSelectedColisageMap({});
    setColisageSearch('');
    setIsColisageSidePaneOpen(false);
    setShowForm(false);
  };

  const handleOpenNew = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (exp: ExpeditionRecord) => {
    setEditingId(exp.id);
    setContexte(exp.contexte || '');
    setExpediteur(exp.expediteur || '');
    const parsedDest = parseDestinataireString(exp.destinataire || '');
    if (parsedDest.category && parsedDest.category !== exp.expediteur) {
      setDestinataire(parsedDest.category);
      setDestinataireValue(parsedDest.value);
    } else {
      setDestinataire('');
      setDestinataireValue('');
    }
    setReference(exp.reference || '');
    const parsedPrep = parsePreparateurString(exp.preparateur);
    setPreparateurCategory(parsedPrep.category);
    setPreparateurValue(parsedPrep.value);
    setTransporteur(exp.transporteur || '');
    setNumeroSuivi(String(exp.numeroSuivi || '').replace(/[^a-zA-Z0-9]/g, ''));
    setCodePostalDestinataire(
      String(exp.codePostalDestinataire || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    );
    setCommentaire(exp.commentaire || '');
    setStatut(exp.statut || '');
    setSelectedColisageMap(parseColisageStringToMap(exp.colisagePieces));
    setColisageSearch('');
    setIsColisageSidePaneOpen(false);
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) return;
    const nowStr = new Date().toLocaleDateString('fr-FR');
    const formattedDestinataire =
      destinataire && destinataire !== expediteur
        ? destinataireValue.trim()
          ? `${destinataire} - ${destinataireValue.trim()}`
          : destinataire
        : '';
    const formattedPreparateur = preparateurCategory
      ? preparateurValue.trim()
        ? `${preparateurCategory} - ${preparateurValue.trim()}`
        : preparateurCategory
      : '';

    const cleanTracking = String(numeroSuivi || '').replace(/[^a-zA-Z0-9]/g, '');
    const cleanPostal = String(codePostalDestinataire || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    if (editingId) {
      const updated = expeditions.map((item) => {
        if (item.id !== editingId) return item;
        return {
          ...item,
          reference: reference.trim(),
          contexte,
          expediteur,
          destinataire: formattedDestinataire,
          transporteur,
          numeroSuivi: cleanTracking,
          codePostalDestinataire: cleanPostal,
          commentaire: commentaire.trim(),
          statut: statut || 'Aucune information',
          dateCreation: item.dateCreation || nowStr,
          dateActualise: nowStr,
          preparateur: formattedPreparateur,
          colisagePieces: colisageStats.serializedString,
          poidsKgEstim: formatNumberClean(colisageStats.totalWeightKg),
          coutTransportEstim: formatNumberClean(colisageStats.totalTransportCostEur),
          nombrePieces: String(colisageStats.totalPiecesVolume),
        };
      });
      saveExpeditions(updated);
    } else {
      const newRecord: ExpeditionRecord = {
        id: `EXP-${Date.now()}`,
        reference: reference.trim(),
        contexte,
        expediteur,
        destinataire: formattedDestinataire,
        transporteur,
        numeroSuivi: cleanTracking,
        codePostalDestinataire: cleanPostal,
        commentaire: commentaire.trim(),
        statut: statut || 'Aucune information',
        dateCreation: nowStr,
        dateActualise: nowStr,
        preparateur: formattedPreparateur,
        colisagePieces: colisageStats.serializedString,
        poidsKgEstim: formatNumberClean(colisageStats.totalWeightKg),
        coutTransportEstim: formatNumberClean(colisageStats.totalTransportCostEur),
        nombrePieces: String(colisageStats.totalPiecesVolume),
      };
      saveExpeditions([newRecord, ...expeditions]);
    }

    resetForm();
  };

  const handleDelete = (id: string) => {
    const updated = expeditions.filter((e) => e.id !== id);
    saveExpeditions(updated);
    setConfirmDeleteId(null);
  };

  const filteredExpeditions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return expeditions;
    return expeditions.filter((exp) => {
      return (
        String(exp.reference || '').toLowerCase().includes(q) ||
        String(exp.contexte || '').toLowerCase().includes(q) ||
        String(exp.expediteur || '').toLowerCase().includes(q) ||
        String(exp.destinataire || '').toLowerCase().includes(q) ||
        String(exp.transporteur || '').toLowerCase().includes(q) ||
        String(exp.numeroSuivi || '').toLowerCase().includes(q) ||
        String(exp.codePostalDestinataire || '').toLowerCase().includes(q) ||
        String(exp.commentaire || '').toLowerCase().includes(q) ||
        String(exp.statut || '').toLowerCase().includes(q) ||
        String(exp.preparateur || '').toLowerCase().includes(q) ||
        String(exp.colisagePieces || '').toLowerCase().includes(q) ||
        String(exp.dateCreation || '').toLowerCase().includes(q) ||
        String(exp.dateActualise || '').toLowerCase().includes(q)
      );
    });
  }, [expeditions, searchQuery]);

  // Build sorted & filtered list for the Colisage side-pane:
  // Checked items are grouped and sorted to the top of the listing!
  const sidePaneDisplayItems = useMemo(() => {
    const q = colisageSearch.toLowerCase().trim();
    const combined: AvailableColisageCatalogItem[] = [...catalogItems];

    // Include any legacy selected items not in current catalog
    for (const k of Object.keys(selectedColisageMap)) {
      const entry = selectedColisageMap[k];
      if (entry && entry.checked && !combined.some((c) => c.key === k)) {
        combined.push({
          key: k,
          stockId: '',
          format: 'A',
          title: entry.title,
          defaultVolume: entry.volume || 1,
          unitWeightKg: entry.unitWeightKg || 0,
          unitTransportCostEur: entry.unitTransportCostEur || 0,
        });
      }
    }

    const filtered = q
      ? combined.filter((item) => item.title.toLowerCase().includes(q))
      : combined;

    return [...filtered].sort((a, b) => {
      const aChecked = Boolean(selectedColisageMap[a.key]?.checked);
      const bChecked = Boolean(selectedColisageMap[b.key]?.checked);
      if (aChecked && !bChecked) return -1;
      if (!aChecked && bChecked) return 1;
      return a.title.localeCompare(b.title, 'fr');
    });
  }, [catalogItems, selectedColisageMap, colisageSearch]);

  const toggleColisageItem = (item: AvailableColisageCatalogItem) => {
    setSelectedColisageMap((prev) => {
      const existing = prev[item.key];
      const nextChecked = !existing?.checked;
      const defaultVol = item.format === 'B' ? 1 : 0;
      const currentVol =
        existing?.volume !== undefined ? existing.volume : defaultVol;
      return {
        ...prev,
        [item.key]: {
          checked: nextChecked,
          volume: nextChecked ? currentVol : defaultVol,
          title: item.title,
          unitWeightKg: item.unitWeightKg,
          unitTransportCostEur: item.unitTransportCostEur,
        },
      };
    });
  };

  const updateColisageItemVolume = (
    item: AvailableColisageCatalogItem,
    rawVal: string
  ) => {
    const cleaned = rawVal.replace(/[^0-9]/g, '');
    const num = cleaned === '' ? 0 : parseInt(cleaned, 10);
    setSelectedColisageMap((prev) => {
      const existing = prev[item.key];
      return {
        ...prev,
        [item.key]: {
          checked: existing ? existing.checked : num > 0,
          volume: num,
          title: item.title,
          unitWeightKg: item.unitWeightKg,
          unitTransportCostEur: item.unitTransportCostEur,
        },
      };
    });
  };

  const formTrackingUrl = getCarrierTrackingUrl(transporteur, numeroSuivi);

  const customButtonStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#fff',
    boxShadow: 'none',
    borderRadius: '13px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: '100',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
  };

  const smallBlackButtonStyle: React.CSSProperties = {
    ...customButtonStyle,
    fontSize: '18px',
    padding: '9px 19px',
    borderRadius: '13px',
    backgroundColor: '#0f172a',
    boxShadow: 'none',
  };

  const smallBlueButtonStyle: React.CSSProperties = {
    ...smallBlackButtonStyle,
    backgroundColor: 'rgb(46, 84, 255)',
    boxShadow: 'none',
  };

  const smallRedButtonStyle: React.CSSProperties = {
    ...smallBlackButtonStyle,
    backgroundColor: 'rgb(210, 45, 11)',
    boxShadow: 'none',
  };

  const cellStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 100,
    color: '#000000',
    whiteSpace: 'nowrap',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    cursor: 'pointer',
  };

  const thStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 100,
    color: 'rgb(80 97 122)',
    backgroundColor: '#ffffff',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    letterSpacing: 'normal',
    textTransform: 'none',
    whiteSpace: 'nowrap',
    cursor: 'default',
  };

  return (
    <div id="expeditions-tab-container-harmonized" className="space-y-6 font-sans w-full">
      <style>{`
        #expeditions-tab-container-harmonized input:not(#search-expeditions-input),
        #expeditions-tab-container-harmonized select:not(#expeditions-more-options-dropdown),
        #expeditions-tab-container-harmonized textarea {
          padding: 12px !important;
          border: 1px solid #DCE1EA !important;
          border-radius: 13px !important;
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          background: #ffffff !important;
          color: #000000 !important;
          box-shadow: none !important;
          outline: none !important;
          transition: all 0s !important;
        }
        #expeditions-tab-container-harmonized input:not(#search-expeditions-input)::placeholder,
        #expeditions-tab-container-harmonized textarea::placeholder {
          color: #BECADB !important;
          font-size: 18px !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          opacity: 1 !important;
        }
        #expeditions-tab-container-harmonized #search-expeditions-input::placeholder {
          color: rgb(222, 222, 222) !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #expeditions-tab-container-harmonized input:not(#search-expeditions-input):not(:disabled):hover,
        #expeditions-tab-container-harmonized select:not(#expeditions-more-options-dropdown):not(:disabled):hover,
        #expeditions-tab-container-harmonized textarea:not(:disabled):hover,
        #expeditions-tab-container-harmonized .expeditions-colisage-trigger:hover {
          border: 1px solid #DCE1EA !important;
          outline: 2.5px solid #2e54ff !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #expeditions-tab-container-harmonized input:not(#search-expeditions-input):not(:disabled):focus,
        #expeditions-tab-container-harmonized select:not(#expeditions-more-options-dropdown):not(:disabled):focus,
        #expeditions-tab-container-harmonized textarea:not(:disabled):focus,
        #expeditions-tab-container-harmonized .expeditions-colisage-trigger:focus {
          border: 1px solid #DCE1EA !important;
          outline: 2.5px solid #2e54ff !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #expeditions-tab-container-harmonized #search-expeditions-input:hover,
        #expeditions-tab-container-harmonized #search-expeditions-input:focus {
          border: 1px solid #dedede !important;
          outline: 2.5px solid #2e54ff !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #expeditions-tab-container-harmonized select:not(#expeditions-more-options-dropdown) {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #expeditions-tab-container-harmonized select option {
          color: #000000 !important;
          background: #ffffff !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #expeditions-tab-container-harmonized label,
        #expeditions-tab-container-harmonized .expeditions-label-style {
          letter-spacing: normal !important;
          text-transform: none !important;
          font-size: 16px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #expeditions-tab-container-harmonized input:disabled,
        #expeditions-tab-container-harmonized select:disabled,
        #expeditions-tab-container-harmonized textarea:disabled {
          background: #fff !important;
          background-color: #fff !important;
          border: 1px solid #dce1ea !important;
          color: #555555 !important;
          cursor: not-allowed !important;
          opacity: 1 !important;
        }
        #expeditions-tab-container-harmonized #expeditions-record-table,
        #expeditions-tab-container-harmonized #expeditions-record-table thead,
        #expeditions-tab-container-harmonized #expeditions-record-table tbody,
        #expeditions-tab-container-harmonized #expeditions-record-table tr,
        #expeditions-tab-container-harmonized #expeditions-record-table th,
        #expeditions-tab-container-harmonized #expeditions-record-table td {
          border: 0px solid transparent !important;
          border-top: 0px solid transparent !important;
          border-bottom: 0px solid transparent !important;
          border-left: 0px solid transparent !important;
          border-right: 0px solid transparent !important;
        }
        #expeditions-tab-container-harmonized #expeditions-record-table thead th {
          background-color: #ffffff !important;
          color: rgb(80 97 122) !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          letter-spacing: normal !important;
          text-transform: none !important;
          white-space: nowrap !important;
        }
        #expeditions-tab-container-harmonized #expeditions-record-table tbody tr:hover {
          background-color: #f5f7fa !important;
        }
        #expeditions-colisage-side-pane #colisage-search-input::placeholder {
          color: #BECADB !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #expeditions-colisage-side-pane #colisage-search-input::-webkit-input-placeholder {
          color: #BECADB !important;
          opacity: 1 !important;
        }
        #expeditions-colisage-side-pane #colisage-search-input::-moz-placeholder {
          color: #BECADB !important;
          opacity: 1 !important;
        }
        #expeditions-colisage-side-pane .colisage-vol-input::-webkit-outer-spin-button,
        #expeditions-colisage-side-pane .colisage-vol-input::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
        }
        #expeditions-colisage-side-pane .colisage-vol-input {
          -moz-appearance: textfield !important;
          text-align: center !important;
        }
      `}</style>

      {!showForm ? (
        <>
          {/* Header & Controls */}
          <div
            className="bg-white space-y-4"
            style={{
              borderRadius: '0px',
              maxWidth: '98%',
              margin: 'auto',
              padding: '10px 0px',
              border: 'none',
              backgroundColor: 'rgb(255, 255, 255)',
            }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
              <div className="flex items-center gap-3">
                {onClose && (
                  <button
                    type="button"
                    id="btn-close-expeditions-sidepane"
                    onClick={onClose}
                    style={{
                      ...customButtonStyle,
                      backgroundColor: 'rgb(210, 45, 11)',
                      color: '#ffffff',
                    }}
                  >
                    {t('Fermer')}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 bg-white">
                {/* 3 Dots More Options Dropdown */}
                <div
                  className="relative inline-flex items-center justify-center shrink-0 hover:opacity-80 transition-all select-none cursor-pointer"
                  style={{
                    background: '#f5f7fa',
                    borderRadius: '100px',
                    padding: '12px',
                    cursor: 'pointer',
                  }}
                  title={t('Plus')}
                >
                  <img
                    src="https://civilprom.s3.eu-north-1.amazonaws.com/3dotsgris.svg"
                    alt={t('Plus')}
                    style={{ width: '18px', height: '18px', display: 'block', pointerEvents: 'none' }}
                    referrerPolicy="no-referrer"
                  />
                  <select
                    id="expeditions-more-options-dropdown"
                    aria-label={t('Plus')}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'fit-view') {
                        toggleTableFitView();
                      } else if (val === 'spreadsheet') {
                        const url = getTenantSpreadsheetUrl('spreadsheetExpeditions', companyInfo);
                        if (url) openTenantSpreadsheetUrl(url);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    style={{ WebkitAppearance: 'menulist-button', appearance: 'auto', border: 'none', outline: 'none' }}
                  >
                    <option value="" disabled hidden></option>
                    <option value="fit-view">
                      {isTableFitView ? t('Retourner l’affichage standard') : t('Minimiser et ajuster l’affichage')}
                    </option>
                    <option
                      value="spreadsheet"
                      disabled={!getTenantSpreadsheetUrl('spreadsheetExpeditions', companyInfo)}
                    >
                      {t('Ouvrir l’éditeur SpreadSheets')}
                    </option>
                  </select>
                </div>

                {/* Actualiser les données Pill Button */}
                <button
                  type="button"
                  id="btn-refresh-data-expeditions"
                  onClick={() => {
                    setClickedPill('refresh-expeditions');
                    setTimeout(
                      () =>
                        setClickedPill((prev) =>
                          prev === 'refresh-expeditions' ? null : prev
                        ),
                      480
                    );
                    handleRefreshClick();
                  }}
                  disabled={isRefreshingLocal}
                  className={`relative overflow-hidden hover:opacity-80 transition-all select-none cursor-pointer ${
                    clickedPill === 'refresh-expeditions'
                      ? 'sidebar-nav-click-shrink-wave'
                      : ''
                  }`}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '1000px',
                    padding: '8px 16px',
                    fontSize: '18px',
                    fontWeight: 100,
                    cursor: isRefreshingLocal ? 'wait' : 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    backgroundColor: 'rgb(192 248 252)',
                    color: 'rgb(5 112 114)',
                    border: 'none',
                    boxShadow: 'none',
                    transition: 'all 0.15s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                  title={t('Actualiser les données')}
                >
                  <span>
                    {isRefreshingLocal
                      ? t('Actualisation...')
                      : t('Actualiser les données')}
                  </span>
                </button>

                {/* Field recherche (Search input) */}
                <div className="relative w-full sm:w-56 bg-white">
                  <input
                    type="text"
                    id="search-expeditions-input"
                    name="defib_quick_search_expeditions_no_autofill"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-form-type="other"
                    placeholder={t('Recherche rapide')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                    style={{
                      border: '1px solid #dedede',
                      backgroundColor: '#ffffff',
                      boxShadow: 'none',
                      borderRadius: '13px',
                      fontSize: '18px',
                      padding: '9px 19px',
                      paddingRight: searchQuery && searchQuery.length > 0 ? '36px' : '19px',
                      fontWeight: '100',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      transition: 'all 0s ease-in-out',
                      color: '#000000',
                    }}
                  />
                  {searchQuery && searchQuery.length > 0 && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        padding: '2px 6px',
                        cursor: 'pointer',
                        color: '#64748b',
                        fontSize: '18px',
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Effacer la recherche"
                      aria-label="Effacer la recherche"
                    >
                      ×
                    </button>
                  )}
                </div>

                {(() => {
                  const hasExpeditionsSpreadsheet = Boolean(
                    getTenantSpreadsheetUrl('spreadsheetExpeditions', companyInfo)
                  );
                  return (
                    <button
                      type="button"
                      disabled={!hasExpeditionsSpreadsheet}
                      onClick={() => {
                        if (!hasExpeditionsSpreadsheet) return;
                        handleOpenNew();
                      }}
                      title={
                        !hasExpeditionsSpreadsheet
                          ? t("Veuillez renseigner l'URL du Spreadsheet Expéditions dans les paramètres du tenant.")
                          : undefined
                      }
                      style={{
                        ...customButtonStyle,
                        backgroundColor: 'rgb(46, 84, 255)',
                        boxShadow: 'none',
                        opacity: !hasExpeditionsSpreadsheet ? 0.45 : 1,
                        cursor: !hasExpeditionsSpreadsheet ? 'not-allowed' : 'pointer',
                      }}
                      className="font-sans"
                    >
                      {t('Nouveau')}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Table View */}
          <div className="bg-white overflow-hidden mt-6 rounded-none">
            <div
              ref={tableContainerRef}
              className={isTableFitView ? 'overflow-x-hidden bg-white' : 'overflow-x-auto bg-white'}
              style={isTableFitView ? { width: '100%', overflowX: 'hidden' } : undefined}
            >
              <table
                ref={tableRef}
                className="w-full text-left font-sans border-collapse text-xs bg-white"
                id="expeditions-record-table"
                style={{
                  border: '0px solid transparent',
                  ...(isTableFitView
                    ? {
                        zoom: tableFitScale,
                        width: `${naturalTableWidthRef.current || 1300}px`,
                        minWidth: `${naturalTableWidthRef.current || 1300}px`,
                        transition: 'zoom 0.15s ease',
                      }
                    : {
                        width: '100%',
                      }),
                }}
              >
                <thead>
                  <tr className="bg-white text-slate-600">
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Référence.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Volume.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Poids Estimé.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Ouverture.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Actualisé.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Contexte.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Préparateur.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Destinataire.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Transporteur.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Numéro Suivi.')}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t('Statut.')}</th>
                    <th className="px-4 py-3.5 text-right whitespace-nowrap" style={thStyle}></th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {filteredExpeditions.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="bg-white">
                        <EmptyTablePlaceholder className="py-16 text-center font-sans lg:py-24" />
                      </td>
                    </tr>
                  ) : (
                    filteredExpeditions.map((exp) => {
                      const trackingUrl = getCarrierTrackingUrl(
                        exp.transporteur,
                        exp.numeroSuivi
                      );
                      return (
                        <tr
                          key={exp.id}
                          className="group bg-white hover:bg-[#f5f7fa] transition-colors cursor-pointer"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, a, input, select, option')) return;
                            handleEdit(exp);
                          }}
                        >
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.reference || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.nombrePieces !== undefined && exp.nombrePieces !== ''
                              ? exp.nombrePieces
                              : '0'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.poidsKgEstim !== undefined && exp.poidsKgEstim !== ''
                              ? `${exp.poidsKgEstim} kg`
                              : '0 kg'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.dateCreation || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.dateActualise || exp.dateCreation || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.contexte || '-'}
                          </td>
                          <td className="px-4 py-4 max-w-[200px] truncate" style={cellStyle} title={exp.preparateur}>
                            {exp.preparateur || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.destinataire || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.transporteur || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.numeroSuivi || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap" style={cellStyle}>
                            {exp.statut || 'Aucune information'}
                          </td>
                          <td className="px-4 py-4 text-right whitespace-nowrap" style={cellStyle}>
                            <div className="flex items-center justify-end gap-2">
                              {trackingUrl && (
                                <button
                                  type="button"
                                  onClick={() => openExternalUrlInNewTab(trackingUrl)}
                                  style={smallBlueButtonStyle}
                                >
                                  {t('Suivre')}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleEdit(exp)}
                                style={smallBlackButtonStyle}
                              >
                                {t('Modifier')}
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(exp.id)}
                                style={smallRedButtonStyle}
                              >
                                {t('Supprimer')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* FORM VIEW (matching DÉFIBRILLATEURS / STOCKS / ACHATS FOURNISSEURS) */
        <div
          className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto py-4"
          id="expeditions-form-overlay"
        >
          {/* Header Box without grey background */}
          <div
            className="flex items-center bg-white"
            style={{
              borderRadius: '0px',
              width: '98%',
              maxWidth: '98%',
              margin: 'auto',
              padding: '10px 0px',
              border: 'none',
              backgroundColor: 'rgb(255, 255, 255)',
            }}
            id="expeditions-form-header-box"
          >
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={resetForm}
                style={{
                  ...smallRedButtonStyle,
                  flex: 1,
                  width: '50%',
                }}
              >
                {t('Annuler')}
              </button>
              <button
                type="submit"
                form="expeditions-form"
                style={{
                  ...smallBlueButtonStyle,
                  flex: 1,
                  width: '50%',
                }}
              >
                {t('Enregistrer')}
              </button>
            </div>
          </div>

          <form
            id="expeditions-form"
            onSubmit={handleSave}
            className="p-6 space-y-6"
            style={{
              backgroundColor: 'rgb(245, 247, 250)',
              borderRadius: '18px',
              border: 'none',
              width: '98%',
              maxWidth: '98%',
              margin: 'auto',
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contexte. */}
              <div>
                <label className="block mb-1.5 expeditions-label-style">{t('Contexte.')}</label>
                <select
                  value={contexte}
                  onChange={(e) => setContexte(e.target.value)}
                  className="w-full"
                >
                  <option value="">{t('Sélectionnez un contexte.')}</option>
                  {CONTEXTE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(opt)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Référence. */}
              <div>
                <label className="block mb-1.5 expeditions-label-style">{t('Référence.')}</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t('Entrez une référence.')}
                  className="w-full"
                  required
                />
              </div>

              {/* Expéditeur. */}
              <div>
                <label className="block mb-1.5 expeditions-label-style">{t('Expéditeur.')}</label>
                <select
                  value={expediteur}
                  onChange={(e) => {
                    const nextExp = e.target.value;
                    setExpediteur(nextExp);
                    if (nextExp && destinataire === nextExp) {
                      setDestinataire('');
                      setDestinataireValue('');
                    }
                  }}
                  className="w-full"
                >
                  <option value="">{t('Sélectionnez un expéditeur.')}</option>
                  {EXPEDITEUR_DESTINATAIRE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(opt)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destinataire. */}
              <div className="space-y-3">
                <div>
                  <label className="block mb-1.5 expeditions-label-style">{t('Destinataire.')}</label>
                  <select
                    value={destinataire}
                    onChange={(e) => {
                      setDestinataire(e.target.value);
                      setDestinataireValue('');
                    }}
                    className="w-full"
                  >
                    <option value="">{t('Sélectionnez un destinataire.')}</option>
                    {EXPEDITEUR_DESTINATAIRE_OPTIONS.map((opt) => (
                      <option
                        key={opt}
                        value={opt}
                        disabled={Boolean(expediteur && opt === expediteur)}
                      >
                        {t(opt)}
                      </option>
                    ))}
                  </select>
                </div>

                {destinataire === 'Technicien' && (
                  <div>
                    <select
                      value={destinataireValue}
                      onChange={(e) => setDestinataireValue(e.target.value)}
                      className="w-full"
                    >
                      <option value="">{t('Sélectionnez un technicien.')}</option>
                      {technicianMembers.map((m) => {
                        const label = getMemberDisplayLabel(m);
                        return (
                          <option key={m.id || label} value={label}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {destinataire === 'Client' && (
                  <div>
                    <select
                      value={destinataireValue}
                      onChange={(e) => setDestinataireValue(e.target.value)}
                      className="w-full"
                    >
                      <option value="">{t('Sélectionnez un client.')}</option>
                      {clientOptions.map((cName) => (
                        <option key={cName} value={cName}>
                          {cName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {destinataire === 'Fournisseur' && (
                  <div>
                    <select
                      value={destinataireValue}
                      onChange={(e) => setDestinataireValue(e.target.value)}
                      className="w-full"
                    >
                      <option value="">{t('Sélectionnez un fournisseur.')}</option>
                      {supplierOptions.map((sName) => (
                        <option key={sName} value={sName}>
                          {sName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {destinataire === 'Autre' && (
                  <div>
                    <input
                      type="text"
                      value={destinataireValue}
                      onChange={(e) => setDestinataireValue(e.target.value)}
                      placeholder={t('Entrez un destinataire.')}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* Colisage Pièce(s). */}
              <div>
                <label className="block mb-1.5 expeditions-label-style">{t('Colisage Pièce(s).')}</label>
                <button
                  type="button"
                  onClick={() => setIsColisageSidePaneOpen(true)}
                  className="expeditions-colisage-trigger w-full text-left flex items-center justify-between"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #DCE1EA',
                    borderRadius: '13px',
                    fontSize: '18px',
                    color: colisageStats.checkedItemsCount > 0 ? '#000000' : '#BECADB',
                    padding: '12px',
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    fontWeight: 100,
                  }}
                >
                  <span>
                    {`Colisage de l’expédition (${colisageStats.checkedItemsCount}).`}
                  </span>
                </button>
              </div>

              {/* Préparateur. */}
              <div className="space-y-3">
                <div>
                  <label className="block mb-1.5 expeditions-label-style">{t('Préparateur.')}</label>
                  <select
                    value={preparateurCategory}
                    onChange={(e) => {
                      setPreparateurCategory(e.target.value);
                      setPreparateurValue('');
                    }}
                    className="w-full"
                  >
                    <option value="">{t('Sélectionnez un préparateur.')}</option>
                    {PREPARATEUR_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {t(cat)}
                      </option>
                    ))}
                  </select>
                </div>

                {preparateurCategory === 'Administrateur' && (
                  <div>
                    <select
                      value={preparateurValue}
                      onChange={(e) => setPreparateurValue(e.target.value)}
                      className="w-full"
                    >
                      <option value="">{t('Sélectionnez un collaborateur.')}</option>
                      {nonTechnicianMembers.map((m) => {
                        const label = getMemberDisplayLabel(m);
                        return (
                          <option key={m.id || label} value={label}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {preparateurCategory === 'Technicien' && (
                  <div>
                    <select
                      value={preparateurValue}
                      onChange={(e) => setPreparateurValue(e.target.value)}
                      className="w-full"
                    >
                      <option value="">{t('Sélectionnez un technicien.')}</option>
                      {technicianMembers.map((m) => {
                        const label = getMemberDisplayLabel(m);
                        return (
                          <option key={m.id || label} value={label}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {preparateurCategory === 'Client' && (
                  <div>
                    <select
                      value={preparateurValue}
                      onChange={(e) => setPreparateurValue(e.target.value)}
                      className="w-full"
                    >
                      <option value="">{t('Sélectionnez un client.')}</option>
                      {clientOptions.map((cName) => (
                        <option key={cName} value={cName}>
                          {cName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {preparateurCategory === 'Autre' && (
                  <div>
                    <input
                      type="text"
                      value={preparateurValue}
                      onChange={(e) => setPreparateurValue(e.target.value)}
                      placeholder={t('Entrez un préparateur.')}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* Transporteur. + Ouvrir le suivi */}
              <div className="space-y-3">
                <div>
                  <label className="block mb-1.5 expeditions-label-style">{t('Transporteur.')}</label>
                  <select
                    value={transporteur}
                    onChange={(e) => setTransporteur(e.target.value)}
                    className="w-full"
                  >
                    <option value="">{t('Sélectionnez un transporteur.')}</option>
                    {TRANSPORTEUR_OPTIONS.map((tr) => (
                      <option key={tr} value={tr}>
                        {tr}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={!formTrackingUrl}
                  onClick={() => {
                    if (formTrackingUrl) {
                      openExternalUrlInNewTab(formTrackingUrl);
                    }
                  }}
                  className="w-full"
                  style={{
                    ...smallBlueButtonStyle,
                    width: '100%',
                    opacity: formTrackingUrl ? 1 : 0.45,
                    cursor: formTrackingUrl ? 'pointer' : 'not-allowed',
                  }}
                >
                  {t('Ouvrir le suivi')}
                </button>
              </div>

              {/* Numéro Suivi. */}
              <div>
                <label className="block mb-1.5 expeditions-label-style">{t('Numéro Suivi.')}</label>
                <input
                  type="text"
                  value={numeroSuivi}
                  onChange={(e) =>
                    setNumeroSuivi(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))
                  }
                  placeholder={t('Entrez un numéro de suivi.')}
                  className="w-full"
                />
              </div>

              {/* Code Postal Destinataire. */}
              <div>
                <label className="block mb-1.5 expeditions-label-style">{t('Code Postal Destinataire.')}</label>
                <input
                  type="text"
                  value={codePostalDestinataire}
                  onChange={(e) =>
                    setCodePostalDestinataire(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                    )
                  }
                  placeholder={t('Ex: 01234.')}
                  className="w-full"
                />
              </div>

              {/* Statut. */}
              <div>
                <label className="block mb-1.5 expeditions-label-style">{t('Statut.')}</label>
                <select
                  value={statut}
                  onChange={(e) => setStatut(e.target.value)}
                  className="w-full"
                >
                  <option value="">{t('Sélectionnez un statut.')}</option>
                  {STATUT_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {t(st)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Commentaire. */}
              <div className="md:col-span-2">
                <label className="block mb-1.5 expeditions-label-style">{t('Commentaire.')}</label>
                <textarea
                  ref={commentTextareaRef}
                  rows={1}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder={t('Entrez un commentaire.')}
                  className="w-full resize-none overflow-hidden"
                />
              </div>
            </div>
          </form>
        </div>
      )}

      {/* SIDE-PANE COLISAGE PIÈCE(S) */}
      {isColisageSidePaneOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"
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
              zIndex: 99999,
            }}
            onClick={() => setIsColisageSidePaneOpen(false)}
          >
            <div
              id="expeditions-colisage-side-pane"
              className="relative w-full sm:w-[580px] shadow-2xl flex flex-col transform transition-transform duration-200 ease-in-out"
              style={{
                height: '100vh',
                minHeight: '100dvh',
                maxHeight: '100dvh',
                borderLeft: 'none',
                backgroundColor: 'rgb(245, 247, 250)',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Estimations top bar (no title header) */}
              <div
                className="px-4 pt-5 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0"
                style={{ backgroundColor: 'rgb(245, 247, 250)' }}
              >
                <div
                  className="p-3 bg-white"
                  style={{ borderRadius: '13px', border: 'none' }}
                >
                  <div style={{ fontSize: '15px', color: '#000000' }}>
                    {t('Poids Net (Kilogramme) Estimé:')}
                  </div>
                  <div style={{ fontSize: '20px', color: '#000000', marginTop: '2px', fontWeight: 600 }}>
                    {`${formatNumberClean(colisageStats.totalWeightKg)}kg`}
                  </div>
                </div>
                <div
                  className="p-3 bg-white"
                  style={{ borderRadius: '13px', border: 'none' }}
                >
                  <div style={{ fontSize: '15px', color: '#000000' }}>
                    {t('Coût Transport Estimé:')}
                  </div>
                  <div style={{ fontSize: '20px', color: '#000000', marginTop: '2px', fontWeight: 600 }}>
                    {`${formatNumberClean(colisageStats.totalTransportCostEur)}€`}
                  </div>
                </div>
              </div>

              {/* Search bar */}
              <div
                className="px-4 pt-2 pb-3 shrink-0"
                style={{ backgroundColor: 'rgb(245, 247, 250)' }}
              >
                <input
                  id="colisage-search-input"
                  type="text"
                  value={colisageSearch}
                  onChange={(e) => setColisageSearch(e.target.value)}
                  placeholder={t('Entrez votre recherche')}
                  className="placeholder:text-[#BECADB]"
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: '13px 18px',
                    borderRadius: '13px',
                    border: '1px solid #DCE1EA',
                    fontSize: '18px',
                    color: '#000000',
                    outline: 'none',
                    backgroundColor: '#ffffff',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    display: 'block',
                  }}
                />
              </div>

              {/* Listing of pieces */}
              <div
                className="flex-1 overflow-y-auto px-4 pb-24 space-y-2"
                style={{ backgroundColor: 'rgb(245, 247, 250)' }}
              >
                {sidePaneDisplayItems.length === 0
                  ? null
                  : sidePaneDisplayItems.map((item) => {
                      const state = selectedColisageMap[item.key];
                      const isChecked = Boolean(state?.checked);
                      const volumeVal =
                        state?.volume !== undefined ? state.volume : item.defaultVolume;

                      return (
                        <div
                          key={item.key}
                          onClick={() => toggleColisageItem(item)}
                          className="flex items-center justify-between gap-4 p-3.5 rounded-xl transition-all cursor-pointer bg-white"
                          style={{
                            backgroundColor: '#ffffff',
                            border: 'none',
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Radio-check with 1px border and center dot when checked */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleColisageItem(item);
                              }}
                              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                              style={{
                                border: isChecked
                                  ? '1px solid #2e54ff'
                                  : '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                padding: 0,
                              }}
                            >
                              {isChecked && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full block"
                                  style={{ backgroundColor: '#2e54ff' }}
                                />
                              )}
                            </button>

                            {/* Full Title (Format A or B) */}
                            <span
                              className="break-words"
                              style={{
                                fontSize: '17px',
                                color: '#000000',
                                lineHeight: 1.35,
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                              }}
                            >
                              {item.title}
                            </span>
                          </div>

                          {/* Short input field for volume */}
                          <div
                            className="shrink-0 flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="number"
                              min={0}
                              value={volumeVal}
                              onChange={(e) =>
                                updateColisageItemVolume(item, e.target.value)
                              }
                              className="colisage-vol-input text-center"
                              style={{
                                width: '54px',
                                height: '38px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #DCE1EA',
                                borderRadius: '10px',
                                fontSize: '17px',
                                color: '#000000',
                                padding: '0 4px',
                                textAlign: 'center',
                                outline: 'none',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
              </div>

              {/* Side-pane floating footer: 50% / 50% Fermer (red) & Enregistrer (blue), transparent background */}
              <div
                className="p-4 flex items-center gap-3"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: 'transparent',
                  background: 'transparent',
                  pointerEvents: 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsColisageSidePaneOpen(false)}
                  style={{
                    ...smallRedButtonStyle,
                    flex: 1,
                    width: '50%',
                    pointerEvents: 'auto',
                  }}
                >
                  {t('Fermer')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsColisageSidePaneOpen(false)}
                  style={{
                    ...smallBlueButtonStyle,
                    flex: 1,
                    width: '50%',
                    pointerEvents: 'auto',
                  }}
                >
                  {t('Enregistrer')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* DELETE CONFIRMATION MODAL */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="p-6 w-full flex flex-col gap-5 text-left"
            style={{
              background: '#f5f7fa',
              borderRadius: '13px',
              boxShadow: 'none',
              maxWidth: '380px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="leading-relaxed m-0"
              style={{ color: '#000000', fontSize: '18px' }}
            >
              {t('Êtes-vous sûr de vouloir supprimer cette expédition ?')}
            </p>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="w-full text-center cursor-pointer outline-none hover:opacity-90 transition-all"
                style={{
                  padding: '11px 22px',
                  color: '#000000',
                  fontSize: '18px',
                  background: '#dadada',
                  border: 'none',
                  borderRadius: '13px',
                }}
              >
                {t('Annuler')}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDeleteId)}
                className="w-full text-center cursor-pointer outline-none hover:opacity-90 transition-all"
                style={{
                  padding: '11px 22px',
                  color: '#ffffff',
                  fontSize: '18px',
                  background: 'rgb(210, 45, 11)',
                  border: 'none',
                  borderRadius: '13px',
                }}
              >
                {t('Supprimer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpeditionsTab;

