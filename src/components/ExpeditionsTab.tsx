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
import { RefreshCw, Search, X, Check } from 'lucide-react';
import { t } from '../utils/translate';

interface ExpeditionsTabProps {
  expeditions: ExpeditionRecord[];
  saveExpeditions: (updated: ExpeditionRecord[]) => void;
  stocks: StockRecord[];
  variables: Variable[];
  members: Member[];
  clients: Client[];
  companyInfo?: Partial<CompanyInfo> | null;
  onClose?: () => void;
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
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [clickedPill, setClickedPill] = useState<string | null>(null);
  const [isRefreshingLocal, setIsRefreshingLocal] = useState(false);

  // Form states
  const [contexte, setContexte] = useState('');
  const [expediteur, setExpediteur] = useState('');
  const [destinataire, setDestinataire] = useState('');
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
            const lot = String(tr.lotNumber || 'Non renseigné').trim();
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

  // Member lists for Préparateur lookup
  const nonTechnicianMembers = useMemo(() => {
    return (members || []).filter((m) => {
      if (!m || m.role === 'Inactif') return false;
      const r = String(m.role || '').toLowerCase();
      return !r.includes('technicien') && !r.includes('maintenance terrain');
    });
  }, [members]);

  const technicianMembers = useMemo(() => {
    return (members || []).filter((m) => {
      if (!m || m.role === 'Inactif') return false;
      const r = String(m.role || '').toLowerCase();
      return r.includes('technicien') || r.includes('maintenance terrain');
    });
  }, [members]);

  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of clients || []) {
      const label = String(c.denomination || c.nomSite || c.id || '').trim();
      if (label) names.add(label);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [clients]);

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
        map[`LEGACY__${idx}__${titleText}`] = {
          checked: true,
          volume: vol,
          title: titleText,
          unitWeightKg: 0,
          unitTransportCostEur: 0,
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
    setDestinataire(
      exp.destinataire && exp.destinataire !== exp.expediteur ? exp.destinataire : ''
    );
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
    const nowStr = new Date().toLocaleDateString('fr-FR');
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
          destinataire: destinataire === expediteur ? '' : destinataire,
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
        destinataire: destinataire === expediteur ? '' : destinataire,
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
    backgroundColor: '#2e54ff',
    boxShadow: 'none',
  };

  const pillButtonStyle: React.CSSProperties = {
    background: '#f5f7fa',
    border: 'none',
    borderRadius: '99px',
    padding: '3px 9px',
    fontSize: '18px',
    fontWeight: '100',
    color: '#000',
    cursor: 'pointer',
    transition: 'background 0s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
  };

  const formLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '18px',
    fontWeight: '100',
    color: '#000000',
    marginBottom: '6px',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    cursor: 'default',
  };

  return (
    <div id="expeditions-tab-container-harmonized" className="w-full">
      <style>{`
        #expeditions-tab-container-harmonized,
        #expeditions-tab-container-harmonized *:not(.lucide):not(svg):not(path) {
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          font-weight: 100 !important;
        }
        #expeditions-tab-container-harmonized input:not([type="checkbox"]):not([type="radio"]):not(.search-bar-expeditions):not(.colisage-vol-input),
        #expeditions-tab-container-harmonized select:not(#expeditions-more-options-dropdown),
        #expeditions-tab-container-harmonized textarea {
          background-color: #ffffff !important;
          border: 1px solid #dadada !important;
          border-radius: 13px !important;
          font-size: 18px !important;
          color: #000000 !important;
          box-shadow: none !important;
          outline: none !important;
          padding: 0 14px !important;
          height: 43px !important;
          transition: border-color 0s ease-in-out, background-color 0s ease-in-out !important;
        }
        #expeditions-tab-container-harmonized textarea {
          height: auto !important;
          min-height: 43px !important;
          padding: 10px 14px !important;
        }
        #expeditions-tab-container-harmonized input:not([type="checkbox"]):not([type="radio"]):not(.search-bar-expeditions):not(.colisage-vol-input):hover:not(:disabled),
        #expeditions-tab-container-harmonized input:not([type="checkbox"]):not([type="radio"]):not(.search-bar-expeditions):not(.colisage-vol-input):focus:not(:disabled),
        #expeditions-tab-container-harmonized select:not(#expeditions-more-options-dropdown):hover:not(:disabled),
        #expeditions-tab-container-harmonized select:not(#expeditions-more-options-dropdown):focus:not(:disabled),
        #expeditions-tab-container-harmonized textarea:hover:not(:disabled),
        #expeditions-tab-container-harmonized textarea:focus:not(:disabled) {
          border-color: #000000 !important;
        }
        #expeditions-tab-container-harmonized input:disabled,
        #expeditions-tab-container-harmonized select:disabled,
        #expeditions-tab-container-harmonized textarea:disabled {
          background-color: #f5f7fa !important;
          border-color: #dadada !important;
          color: #9e9e9e !important;
          cursor: not-allowed !important;
          opacity: 1 !important;
        }
        #expeditions-tab-container-harmonized select:not(#expeditions-more-options-dropdown) {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e") !important;
          background-repeat: no-repeat !important;
          background-position: right 14px center !important;
          background-size: 16px !important;
          padding-right: 40px !important;
        }
        #expeditions-tab-container-harmonized input::placeholder,
        #expeditions-tab-container-harmonized textarea::placeholder {
          color: #9ca3af !important;
          opacity: 1 !important;
        }
        #expeditions-tab-container-harmonized table thead th {
          background-color: #ffffff !important;
          color: #9e9e9e !important;
          font-size: 18px !important;
          border-bottom: 1px solid #dadada !important;
          padding-top: 10px !important;
          padding-bottom: 10px !important;
          text-transform: none !important;
          letter-spacing: normal !important;
          cursor: default !important;
          white-space: nowrap !important;
        }
        #expeditions-tab-container-harmonized table tbody tr {
          background-color: #ffffff !important;
          border-bottom: 1px solid #dadada !important;
          transition: background-color 0s !important;
        }
        #expeditions-tab-container-harmonized table tbody tr:hover {
          background-color: #f5f7fa !important;
        }
        #expeditions-tab-container-harmonized table tbody td {
          font-size: 18px !important;
          color: #000000 !important;
          padding-top: 8px !important;
          padding-bottom: 8px !important;
          cursor: default !important;
          vertical-align: middle !important;
        }
        #expeditions-tab-container-harmonized .pill-btn-expeditions:hover:not(:disabled) {
          background: #dadada !important;
        }
        #expeditions-tab-container-harmonized .pill-btn-expeditions:disabled {
          color: #9e9e9e !important;
          cursor: not-allowed !important;
          opacity: 0.65 !important;
        }
      `}</style>

      {!showForm ? (
        <div className="space-y-6">
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
                      backgroundColor: '#f5f7fa',
                      color: '#000000',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#dadada')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f5f7fa')}
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
                  title={t("Plus d'options")}
                >
                  <img
                    src="https://civilprom.s3.eu-north-1.amazonaws.com/3dotsgris.svg"
                    alt="Options"
                    style={{ width: '18px', height: '18px', display: 'block', pointerEvents: 'none' }}
                    referrerPolicy="no-referrer"
                  />
                  <select
                    id="expeditions-more-options-dropdown"
                    aria-label={t("Plus d'options")}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'spreadsheet') {
                        const url = getTenantSpreadsheetUrl('spreadsheetExpeditions', companyInfo);
                        if (url) openTenantSpreadsheetUrl(url);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ WebkitAppearance: 'menulist-button', appearance: 'auto', border: 'none', outline: 'none' }}
                  >
                    <option value="" disabled hidden></option>
                    <option
                      value="spreadsheet"
                      disabled={!getTenantSpreadsheetUrl('spreadsheetExpeditions', companyInfo)}
                    >
                      {t('Ouvrir l’éditeur Spreadsheets')}
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
                      320
                    );
                    handleRefreshClick();
                  }}
                  disabled={isRefreshingLocal}
                  className={
                    clickedPill === 'refresh-expeditions'
                      ? 'sidebar-nav-click-shrink-wave'
                      : ''
                  }
                  style={{
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

                {/* Search query */}
                <div className="relative bg-white">
                  <input
                    type="text"
                    placeholder={t('Recherche rapide')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-bar-expeditions w-48 sm:w-64 focus:outline-none"
                    style={{
                      backgroundColor: '#f5f7fa',
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: 'none',
                      padding: '9px 19px',
                      fontSize: '18px',
                      fontWeight: '100',
                      color: '#000',
                    }}
                  />
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
          <div className="bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="py-3 pr-4">{t('Volume.')}</th>
                    <th className="py-3 px-4">{t('Poids Estimé.')}</th>
                    <th className="py-3 px-4">{t('Ouverture.')}</th>
                    <th className="py-3 px-4">{t('Actualisé.')}</th>
                    <th className="py-3 px-4">{t('Contexte.')}</th>
                    <th className="py-3 px-4">{t('Préparateur.')}</th>
                    <th className="py-3 px-4">{t('Destinataire.')}</th>
                    <th className="py-3 px-4">{t('Transporteur.')}</th>
                    <th className="py-3 px-4">{t('Numéro Suivi.')}</th>
                    <th className="py-3 px-4">{t('Statut.')}</th>
                    <th className="py-3 pl-4 text-right">{t('Actions.')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpeditions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="p-8 text-center"
                        style={{ color: '#9e9e9e', fontSize: '18px' }}
                      >
                        {t('Aucune expédition enregistrée.')}
                      </td>
                    </tr>
                  ) : (
                    filteredExpeditions.map((exp) => {
                      const trackingUrl = getCarrierTrackingUrl(
                        exp.transporteur,
                        exp.numeroSuivi
                      );
                      return (
                        <tr key={exp.id}>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {exp.nombrePieces !== undefined && exp.nombrePieces !== ''
                              ? exp.nombrePieces
                              : '0'}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            {exp.poidsKgEstim !== undefined && exp.poidsKgEstim !== ''
                              ? `${exp.poidsKgEstim} kg`
                              : '0 kg'}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            {exp.dateCreation || '-'}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            {exp.dateActualise || exp.dateCreation || '-'}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            {exp.contexte || '-'}
                          </td>
                          <td className="py-2 px-4 max-w-[200px] truncate" title={exp.preparateur}>
                            {exp.preparateur || '-'}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            {exp.destinataire || '-'}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            {exp.transporteur || '-'}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            {exp.numeroSuivi || '-'}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            {exp.statut || 'Aucune information'}
                          </td>
                          <td className="py-2 pl-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setClickedPill(`edit-${exp.id}`);
                                  setTimeout(
                                    () =>
                                      setClickedPill((prev) =>
                                        prev === `edit-${exp.id}` ? null : prev
                                      ),
                                    320
                                  );
                                  handleEdit(exp);
                                }}
                                style={pillButtonStyle}
                                className={`pill-btn-expeditions ${
                                  clickedPill === `edit-${exp.id}`
                                    ? 'sidebar-nav-click-shrink-wave'
                                    : ''
                                }`}
                              >
                                {t('Modifier')}
                              </button>

                              <button
                                type="button"
                                disabled={!trackingUrl}
                                onClick={() => {
                                  if (!trackingUrl) return;
                                  setClickedPill(`suivi-${exp.id}`);
                                  setTimeout(
                                    () =>
                                      setClickedPill((prev) =>
                                        prev === `suivi-${exp.id}` ? null : prev
                                      ),
                                    320
                                  );
                                  openExternalUrlInNewTab(trackingUrl);
                                }}
                                style={pillButtonStyle}
                                className={`pill-btn-expeditions ${
                                  clickedPill === `suivi-${exp.id}`
                                    ? 'sidebar-nav-click-shrink-wave'
                                    : ''
                                }`}
                              >
                                {t('Suivi')}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setClickedPill(`delete-${exp.id}`);
                                  setTimeout(
                                    () =>
                                      setClickedPill((prev) =>
                                        prev === `delete-${exp.id}` ? null : prev
                                      ),
                                    320
                                  );
                                  setConfirmDeleteId(exp.id);
                                }}
                                style={pillButtonStyle}
                                className={`pill-btn-expeditions ${
                                  clickedPill === `delete-${exp.id}`
                                    ? 'sidebar-nav-click-shrink-wave'
                                    : ''
                                }`}
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
        </div>
      ) : (
        /* FORM VIEW (inspired by DÉFIBRILLATEURS / ACHATS FOURNISSEURS) */
        <div
          className="w-full"
          style={{
            background: '#ffffff',
            borderRadius: '0px',
            border: 'none',
            boxShadow: 'none',
            padding: '0px',
          }}
        >
          <div
            className="sticky top-0 z-30 flex items-center justify-between gap-4 flex-wrap"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(8px)',
              paddingTop: '14px',
              paddingBottom: '18px',
              marginBottom: '28px',
              borderBottom: '1px solid #dadada',
            }}
          >
            <h3
              className="m-0 tracking-tight"
              style={{
                fontSize: '33px',
                color: '#000000',
                fontWeight: '100',
                cursor: 'default',
              }}
            >
              {editingId ? t('Modifier l’expédition') : t('Nouvelle expédition')}
            </h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={resetForm}
                style={{
                  ...customButtonStyle,
                  backgroundColor: '#f5f7fa',
                  color: '#000000',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = '#dadada')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = '#f5f7fa')
                }
              >
                {t('Annuler')}
              </button>
              <button
                type="submit"
                form="expeditions-form"
                style={blueButtonStyle}
                className="hover:opacity-90"
              >
                {editingId ? t('Enregistrer') : t('Enregistrer')}
              </button>
            </div>
          </div>

          <form
            id="expeditions-form"
            onSubmit={handleSave}
            className="space-y-6 pb-12"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contexte. */}
              <div>
                <label style={formLabelStyle}>{t('Contexte.')}</label>
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
                <label style={formLabelStyle}>{t('Référence.')}</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t('Entrez une référence.')}
                  className="w-full"
                />
              </div>

              {/* Expéditeur. */}
              <div>
                <label style={formLabelStyle}>{t('Expéditeur.')}</label>
                <select
                  value={expediteur}
                  onChange={(e) => {
                    const nextExp = e.target.value;
                    setExpediteur(nextExp);
                    if (nextExp && destinataire === nextExp) {
                      setDestinataire('');
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
              <div>
                <label style={formLabelStyle}>{t('Destinataire.')}</label>
                <select
                  value={destinataire}
                  onChange={(e) => setDestinataire(e.target.value)}
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

              {/* Colisage Pièce(s). */}
              <div>
                <label style={formLabelStyle}>{t('Colisage Pièce(s).')}</label>
                <button
                  type="button"
                  onClick={() => setIsColisageSidePaneOpen(true)}
                  className="w-full text-left flex items-center justify-between"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #dadada',
                    borderRadius: '13px',
                    fontSize: '18px',
                    color: colisageStats.checkedItemsCount > 0 ? '#000000' : '#9ca3af',
                    padding: '0 14px',
                    height: '43px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#000000')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#dadada')}
                >
                  <span>
                    {`Colisage de l’expédition (${colisageStats.checkedItemsCount}).`}
                  </span>
                  <Search className="w-4 h-4 text-black shrink-0" />
                </button>
              </div>

              {/* Préparateur. */}
              <div className="space-y-3">
                <div>
                  <label style={formLabelStyle}>{t('Préparateur.')}</label>
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
                        const label = m.name || m.email;
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
                        const label = m.name || m.email;
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
                  <label style={formLabelStyle}>{t('Transporteur.')}</label>
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
                    height: '43px',
                    borderRadius: '13px',
                    fontSize: '18px',
                    fontWeight: '100',
                    border: 'none',
                    backgroundColor: formTrackingUrl ? '#2e54ff' : '#f5f7fa',
                    color: formTrackingUrl ? '#ffffff' : '#9e9e9e',
                    cursor: formTrackingUrl ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {t('Ouvrir le suivi')}
                </button>
              </div>

              {/* Numéro Suivi. */}
              <div>
                <label style={formLabelStyle}>{t('Numéro Suivi.')}</label>
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
                <label style={formLabelStyle}>{t('Code Postal Destinataire.')}</label>
                <input
                  type="text"
                  value={codePostalDestinataire}
                  onChange={(e) =>
                    setCodePostalDestinataire(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                    )
                  }
                  placeholder={t('Ex: 01234.')}
                  className="w-full sm:w-56"
                />
              </div>

              {/* Statut. */}
              <div>
                <label style={formLabelStyle}>{t('Statut.')}</label>
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
                <label style={formLabelStyle}>{t('Commentaire.')}</label>
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
      {isColisageSidePaneOpen && (
        <div
          className="fixed inset-0 z-[9999] flex justify-end bg-black/40 animate-fadeIn"
          onClick={() => setIsColisageSidePaneOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Side-pane header */}
            <div
              className="p-6 flex items-center justify-between border-b"
              style={{ borderColor: '#dadada' }}
            >
              <h4
                className="m-0"
                style={{ fontSize: '24px', color: '#000000', fontWeight: '100' }}
              >
                {`Colisage de l’expédition (${colisageStats.checkedItemsCount}).`}
              </h4>
              <button
                type="button"
                onClick={() => setIsColisageSidePaneOpen(false)}
                className="p-2 rounded-full hover:bg-[#f5f7fa] transition-colors cursor-pointer"
                style={{ border: 'none', background: 'transparent' }}
              >
                <X className="w-6 h-6 text-black" />
              </button>
            </div>

            {/* Estimations top bar */}
            <div
              className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-b"
              style={{ backgroundColor: '#f5f7fa', borderColor: '#dadada' }}
            >
              <div
                className="p-3 bg-white"
                style={{ borderRadius: '13px', border: '1px solid #dadada' }}
              >
                <div style={{ fontSize: '15px', color: '#6b7280' }}>
                  {t('Poids Net (Kilogramme) Estimé:')}
                </div>
                <div style={{ fontSize: '20px', color: '#000000', marginTop: '2px' }}>
                  {`${formatNumberClean(colisageStats.totalWeightKg)} kg`}
                </div>
              </div>
              <div
                className="p-3 bg-white"
                style={{ borderRadius: '13px', border: '1px solid #dadada' }}
              >
                <div style={{ fontSize: '15px', color: '#6b7280' }}>
                  {t('Coût Transport Estimé:')}
                </div>
                <div style={{ fontSize: '20px', color: '#000000', marginTop: '2px' }}>
                  {`${formatNumberClean(colisageStats.totalTransportCostEur)} €`}
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div className="px-6 py-4 border-b" style={{ borderColor: '#dadada' }}>
              <input
                type="text"
                value={colisageSearch}
                onChange={(e) => setColisageSearch(e.target.value)}
                placeholder={t('Rechercher une pièce dans le stock...')}
                className="search-bar-expeditions w-full focus:outline-none"
                style={{
                  backgroundColor: '#f5f7fa',
                  borderRadius: '13px',
                  border: '1px solid #dadada',
                  padding: '10px 16px',
                  fontSize: '18px',
                  color: '#000000',
                }}
              />
            </div>

            {/* Listing of pieces */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {sidePaneDisplayItems.length === 0 ? (
                <div
                  className="text-center py-12"
                  style={{ color: '#9e9e9e', fontSize: '18px' }}
                >
                  {t('Aucune pièce disponible dans les stocks.')}
                </div>
              ) : (
                sidePaneDisplayItems.map((item) => {
                  const state = selectedColisageMap[item.key];
                  const isChecked = Boolean(state?.checked);
                  const volumeVal =
                    state?.volume !== undefined ? state.volume : item.defaultVolume;

                  return (
                    <div
                      key={item.key}
                      onClick={() => toggleColisageItem(item)}
                      className="flex items-center justify-between gap-4 p-3.5 transition-colors cursor-pointer"
                      style={{
                        backgroundColor: isChecked ? '#f0f4ff' : '#ffffff',
                        border: isChecked ? '1px solid #2e54ff' : '1px solid #dadada',
                        borderRadius: '13px',
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Radio-check */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColisageItem(item);
                          }}
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                          style={{
                            border: isChecked
                              ? '2px solid #2e54ff'
                              : '1px solid #9ca3af',
                            backgroundColor: isChecked ? '#2e54ff' : '#ffffff',
                          }}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>

                        {/* Full Title (Format A or B) */}
                        <span
                          className="break-words"
                          style={{
                            fontSize: '17px',
                            color: '#000000',
                            lineHeight: 1.35,
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
                            width: '72px',
                            height: '38px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #dadada',
                            borderRadius: '10px',
                            fontSize: '17px',
                            color: '#000000',
                            padding: '0 8px',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Side-pane footer */}
            <div
              className="p-5 border-t flex items-center justify-between gap-4"
              style={{ borderColor: '#dadada', backgroundColor: '#ffffff' }}
            >
              <div style={{ fontSize: '17px', color: '#000000' }}>
                {`${colisageStats.totalPiecesVolume} pièce(s) au total`}
              </div>
              <button
                type="button"
                onClick={() => setIsColisageSidePaneOpen(false)}
                style={blueButtonStyle}
                className="hover:opacity-90"
              >
                {t('Valider le colisage')}
              </button>
            </div>
          </div>
        </div>
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
                  background: '#ef4444',
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

