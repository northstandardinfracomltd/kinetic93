import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { OtherEquipment, Client, Variable, CompanyInfo, openTenantSpreadsheetUrl } from '../types';
import { Plus, Search, Trash2, Edit } from 'lucide-react';
import { generateRandomShortCode } from '../utils';
import { t } from '../utils/translate';
import { getRegionsForCountry } from '../utils/regions';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MapModal from './MapModal';
import HelpBubble from './HelpBubble';
import { SearchSidePane, SearchSidePaneItem } from './SearchSidePane';
import { logDeleteOtherEquipment } from '../services/suspiciousActivityService';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';

const CODE39_PATTERNS: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
  '$': '010101000', '/': '010100010', '+': '010010100', '%': '000101010'
};

function Code39Barcode({ value }: { value: string }) {
  const text = (value || '').trim().toUpperCase();
  if (!text) return null;

  const NARROW_WIDTH = 1.5;
  const WIDE_WIDTH = 3.5;
  const GAP_WIDTH = 1.5;
  const QUIET_ZONE = 12;
  const BAR_HEIGHT = 38;

  const cleanCharList = text.split('').filter(char => CODE39_PATTERNS[char] !== undefined);
  if (cleanCharList.length === 0) return null;

  const wrappedText = '*' + cleanCharList.join('') + '*';

  let totalWidth = QUIET_ZONE * 2;
  for (let i = 0; i < wrappedText.length; i++) {
    const char = wrappedText[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS[' '];
    for (let j = 0; j < 9; j++) {
      const isWide = pattern[j] === '1';
      totalWidth += isWide ? WIDE_WIDTH : NARROW_WIDTH;
    }
    if (i < wrappedText.length - 1) {
      totalWidth += GAP_WIDTH;
    }
  }

  const rects: React.ReactNode[] = [];
  let currentX = QUIET_ZONE;

  for (let i = 0; i < wrappedText.length; i++) {
    const char = wrappedText[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS[' '];
    for (let j = 0; j < 9; j++) {
      const isWide = pattern[j] === '1';
      const width = isWide ? WIDE_WIDTH : NARROW_WIDTH;
      const isBar = j % 2 === 0;

      if (isBar) {
        rects.push(
          <rect
            key={`${i}-${j}`}
            x={currentX}
            y={8}
            width={width}
            height={BAR_HEIGHT}
            fill="black"
          />
        );
      }
      currentX += width;
    }
    if (i < wrappedText.length - 1) {
      currentX += GAP_WIDTH;
    }
  }

  const downloadSvg = () => {
    let rectsSvg = '';
    let currX = QUIET_ZONE;
    for (let i = 0; i < wrappedText.length; i++) {
      const char = wrappedText[i];
      const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS[' '];
      for (let j = 0; j < 9; j++) {
        const isWide = pattern[j] === '1';
        const width = isWide ? WIDE_WIDTH : NARROW_WIDTH;
        const isBar = j % 2 === 0;
        if (isBar) {
          rectsSvg += `<rect x="${currX}" y="8" width="${width}" height="${BAR_HEIGHT}" fill="black" />`;
        }
        currX += width;
      }
      if (i < wrappedText.length - 1) {
        currX += GAP_WIDTH;
      }
    }

    const svgContent = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 74" width="${totalWidth}" height="74" shape-rendering="crispEdges">
  <rect width="${totalWidth}" height="74" fill="white" />
  ${rectsSvg}
  <text x="${totalWidth / 2}" y="64" text-anchor="middle" font-family="Inter, sans-serif" font-weight="bold" font-size="16px" fill="#000000">${text}</text>
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `barcode-${text}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-full p-2" style={{ backgroundColor: 'rgb(245, 247, 250)' }}>
      <svg
        viewBox={`0 0 ${totalWidth} 74`}
        className="max-h-16 mb-2"
        style={{ display: 'block', width: '100%', maxWidth: `${totalWidth}px`, backgroundColor: 'rgb(245, 247, 250)' }}
        shapeRendering="crispEdges"
      >
        <rect width={totalWidth} height={74} fill="rgb(245, 247, 250)" />
        {rects}
        <text
          x={totalWidth / 2}
          y={64}
          textAnchor="middle"
          style={{
            fontFamily: 'var(--font-sans), Inter, sans-serif',
            fontWeight: 'bold',
            fontSize: '16px',
            fill: '#000000'
          }}
        >
          {text}
        </text>
      </svg>
      <button
        type="button"
        onClick={downloadSvg}
        style={{
          backgroundColor: '#0f172a',
          color: '#ffffff',
          boxShadow: 'none',
          borderRadius: '10px',
          fontSize: '18px',
          padding: '9px 19px',
          fontWeight: '100',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: 'none',
          fontFamily: 'var(--font-sans), Inter, sans-serif',
        }}
        className="active:opacity-90 transition-opacity"
      >
        <span>Télécharger</span>
      </button>
    </div>
  );
}

function LocationPickerEvents({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

interface AutresMaterielsTabProps {
  otherEquipments: OtherEquipment[];
  saveOtherEquipments: (items: OtherEquipment[]) => void;
  clients: Client[];
  fsmTours?: any[];
  onUpdateFsmTours?: (updated: any[]) => void;
  setActiveTab?: (tab: any) => void;
  members?: any[];
  defibrillateurs?: any[];
  variables?: Variable[];
  companyInfo?: CompanyInfo;
  isDeveloper?: boolean;
  isReadOnly?: boolean;
  isRefreshing?: boolean;
  onRefreshData?: () => Promise<void> | void;
  initialSearch?: string;
  onSearchChange?: (search: string) => void;
  initialSortFilter?: 'recent' | 'closest_maintenance' | null;
  sortFilterTrigger?: number;
  onShowGmaoReports?: (identifiant: string) => void;
}

const FRENCH_DEPARTMENTS = [
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
  "31", "32", "33", "34", "35", "36", "37", "38", "39", "40",
  "41", "42", "43", "44", "45", "46", "47", "48", "49", "50",
  "51", "52", "53", "54", "55", "56", "57", "58", "59", "60",
  "61", "62", "63", "64", "65", "66", "67", "68", "69", "70",
  "71", "72", "73", "74", "75", "76", "77", "78", "79", "80",
  "81", "82", "83", "84", "85", "86", "87", "88", "89", "90",
  "91", "92", "93", "94", "95", "96", "97", "98", "99", "2A", "2B"
];

function parseEquipmentDate(dateStr?: string | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [dd, mm, yyyy] = trimmed.split('/').map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

// Custom Pink Radio Component
const CustomPinkRadio = ({ value, currentValue, onChange, label }: { value: string, currentValue: string, onChange: (v: string) => void, label: string }) => {
  const isChecked = value === currentValue;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className="inline-flex items-center cursor-pointer gap-2 select-none"
      style={{ fontSize: '16px', color: '#000' }}
    >
      <span
        className="w-5 h-5 rounded-full border flex items-center justify-center transition-all bg-transparent"
        style={{
          borderWidth: '1px',
          borderColor: isChecked ? '#2e54ff' : 'oklch(0.92 0.01 258.78)',
          backgroundColor: 'transparent',
        }}
      >
        {isChecked && <span className="w-2.5 h-2.5 rounded-full bg-[#2e54ff]" />}
      </span>
      {label}
    </button>
  );
};

function getMaintenanceDotColor(prochaineMaintenanceStr: string): string {
  if (!prochaineMaintenanceStr) return '#94a3b8'; // GRIS
  
  const nextMaintenance = new Date(prochaineMaintenanceStr);
  if (isNaN(nextMaintenance.getTime())) return '#94a3b8'; // GRIS
  
  const today = new Date();
  today.setHours(0,0,0,0);
  nextMaintenance.setHours(0,0,0,0);
  
  const diffTime = nextMaintenance.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return '#ef4444'; // ROUGE (expirée)
  }
  
  const diffMonths = diffDays / 30.4375; // average days in a month
  
  if (diffMonths <= 3) {
    return '#f97316'; // ORANGE (sous 3 mois)
  } else if (diffMonths <= 6) {
    return '#3b82f6'; // BLEU (entre sous 3 à 6 mois)
  } else {
    return '#94a3b8'; // GRIS (vide ou plus de 6 mois)
  }
}

export default function AutresMaterielsTab({
  otherEquipments,
  saveOtherEquipments,
  clients,
  fsmTours = [],
  onUpdateFsmTours,
  setActiveTab,
  members = [],
  defibrillateurs = [],
  variables = [],
  companyInfo,
  isDeveloper = false,
  isReadOnly = false,
  isRefreshing = false,
  onRefreshData,
  initialSearch,
  onSearchChange,
  initialSortFilter,
  sortFilterTrigger,
  onShowGmaoReports,
}: AutresMaterielsTabProps) {
  const activeTenantId = typeof window !== 'undefined' ? (localStorage.getItem('defib_tenant_id') || 'demo') : 'demo';
  const [isLocalRefreshing, setIsLocalRefreshing] = useState(false);
  const effectiveRefreshing = isRefreshing || isLocalRefreshing;
  const [clickedPill, setClickedPill] = useState<{ id: string; key: number } | null>(null);
  const triggerPillWave = (id: string) => {
    setClickedPill(null);
    requestAnimationFrame(() => {
      setClickedPill({ id, key: Date.now() });
    });
  };

  const resolvedSpreadsheetUrl = useMemo(() => {
    const raw =
      companyInfo?.spreadsheetAutresMateriels ||
      companyInfo?.spreadsheetAutresMaterielsUrl ||
      (typeof window !== 'undefined'
        ? localStorage.getItem(`defib_${activeTenantId}_spreadsheet_autres_materiels`) ||
          localStorage.getItem(`defib_${activeTenantId.toUpperCase()}_spreadsheet_autres_materiels`) ||
          localStorage.getItem(`defib_${activeTenantId.toLowerCase()}_spreadsheet_autres_materiels`)
        : '') ||
      '';
    return String(raw).trim();
  }, [companyInfo?.spreadsheetAutresMateriels, companyInfo?.spreadsheetAutresMaterielsUrl, activeTenantId]);

  const hasFsmSpreadsheet = useMemo(() => {
    const raw =
      companyInfo?.spreadsheetTournees ||
      companyInfo?.spreadsheetTourneesUrl ||
      companyInfo?.spreadsheetMissionsTournees ||
      companyInfo?.spreadsheetMissionsTourneesUrl ||
      companyInfo?.spreadsheetTourneesMissions ||
      (typeof window !== 'undefined'
        ? localStorage.getItem(`defib_${activeTenantId}_spreadsheet_tournees`) ||
          localStorage.getItem(`defib_${activeTenantId.toUpperCase()}_spreadsheet_tournees`) ||
          localStorage.getItem(`defib_${activeTenantId.toLowerCase()}_spreadsheet_tournees`) ||
          localStorage.getItem(`defib_${activeTenantId}_spreadsheet_missions_tournees`) ||
          localStorage.getItem(`defib_${activeTenantId.toUpperCase()}_spreadsheet_missions_tournees`) ||
          localStorage.getItem(`defib_${activeTenantId.toLowerCase()}_spreadsheet_missions_tournees`)
        : '') ||
      '';
    return Boolean(String(raw).trim());
  }, [
    companyInfo?.spreadsheetTournees,
    companyInfo?.spreadsheetTourneesUrl,
    companyInfo?.spreadsheetMissionsTournees,
    companyInfo?.spreadsheetMissionsTourneesUrl,
    companyInfo?.spreadsheetTourneesMissions,
    activeTenantId,
  ]);

  const handleRefreshClick = async () => {
    if (effectiveRefreshing) return;
    setIsLocalRefreshing(true);
    try {
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err) {
      console.warn('Manual refresh error in AutresMaterielsTab:', err);
    } finally {
      setTimeout(() => setIsLocalRefreshing(false), 500);
    }
  };

  const handleOpenSpreadsheetEditor = () => {
    if (!resolvedSpreadsheetUrl) return;
    openTenantSpreadsheetUrl(resolvedSpreadsheetUrl);
  };

  const [exportMainOuiProgress, setExportMainOuiProgress] = useState<number | null>(null);
  const [cursorExportPos, setCursorExportPos] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 300,
    y: typeof window !== 'undefined' ? 140 : 140,
  });
  const lastMousePosRef = useRef<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 300,
    y: typeof window !== 'undefined' ? 140 : 140,
  });

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (exportMainOuiProgress !== null) {
        setCursorExportPos({ x: e.clientX, y: e.clientY });
      }
    };
    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [exportMainOuiProgress !== null]);

  const handleExportAllMainOuiCsv = async () => {
    if (exportMainOuiProgress !== null) return;
    setCursorExportPos({ ...lastMousePosRef.current });
    setExportMainOuiProgress(5);

    const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 25));

    try {
      await yieldToBrowser();
      setExportMainOuiProgress(15);

      let sheetItems: OtherEquipment[] = [];
      if (resolvedSpreadsheetUrl) {
        try {
          const res = await fetch(
            `/api/sheets/data?tenantId=${encodeURIComponent(activeTenantId)}&type=autresMateriels&forceRefresh=false&offset=0&limit=50000&spreadsheetUrl=${encodeURIComponent(resolvedSpreadsheetUrl)}`
          );
          setExportMainOuiProgress(40);
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.items)) {
              sheetItems = json.items;
            }
          }
        } catch (_) {}
      }

      setExportMainOuiProgress(50);
      await yieldToBrowser();

      const combinedMap = new Map<string, any>();
      const addIfMainOui = (item: any) => {
        if (!item || typeof item !== 'object') return;
        const rawMain = String(item.fsmAutorise ?? 'Oui').trim().toLowerCase();
        const isMainOui = rawMain !== 'non' && rawMain !== 'false' && rawMain !== '0' && rawMain !== 'no';
        if (!isMainOui) return;
        const key = String(item.identifiant || item.id || item.numeroSerie || item.specifiques?.numSerie || '').trim().toUpperCase();
        if (!key) return;
        const existing = combinedMap.get(key);
        combinedMap.set(key, existing ? { ...existing, ...item } : item);
      };

      for (const item of otherEquipments || []) addIfMainOui(item);
      for (const item of sheetItems || []) addIfMainOui(item);

      const recordsToExport = Array.from(combinedMap.values());

      // Exact canonical columns from SpreadSheets mapping (AUTRES_CANONICAL_HEADERS)
      const canonicalCols: Array<{ header: string; field: string; isSpecifique?: boolean; type?: 'yesno' | 'bool' | 'date' }> = [
        { header: 'Identifiant', field: 'identifiant' },
        { header: 'Catégorie', field: 'categorie' },
        { header: 'Client lié', field: 'clientNom' },
        { header: 'Nom et prénom sur site', field: 'nomPrenomSite' },
        { header: 'Téléphone portable sur site', field: 'telephoneSite' },
        { header: 'Email sur site', field: 'emailSite' },
        { header: 'Contrat', field: 'contrat', type: 'yesno' },
        { header: 'Nom du contrat', field: 'nomContrat' },
        { header: 'Référence contrat', field: 'referenceContrat' },
        { header: 'Début du contrat', field: 'debutContrat', type: 'date' },
        { header: 'Fin du contrat', field: 'finContrat', type: 'date' },
        { header: 'Payeur ID', field: 'payeurId' },
        { header: 'Client ID', field: 'clientIdField' },
        { header: 'Numéro et voie', field: 'numeroVoie' },
        { header: 'Ville', field: 'ville' },
        { header: 'Code postal', field: 'codePostal' },
        { header: 'Région', field: 'region' },
        { header: 'Pays', field: 'pays' },
        { header: 'Latitude', field: 'latitude' },
        { header: 'Longitude', field: 'longitude' },
        { header: 'Section 4 — Localisation : Aide d’accès.', field: 'aideAcces' },
        { header: 'Accès 24/7', field: 'acces247', type: 'bool' },
        { header: 'Accès semaine', field: 'accesSemaine', type: 'bool' },
        { header: 'Accès week-end', field: 'accesWeekend', type: 'bool' },
        { header: 'Extérieur', field: 'exterieur', type: 'bool' },
        { header: "Horaires d'ouverture", field: 'horaires' },
        { header: 'Expiration garantie', field: 'expirationGarantie', type: 'date' },
        { header: 'Date de fabrication', field: 'dateFabrication', type: 'date' },
        { header: 'Mise en service', field: 'miseEnService', type: 'date' },
        { header: 'Dernière maintenance', field: 'derniereMaintenance', type: 'date' },
        { header: 'Prochaine maintenance', field: 'prochaineMaintenance', type: 'date' },
        { header: 'Tournée', field: 'tournee' },
        { header: 'Loué', field: 'loue', type: 'yesno' },
        { header: 'Prêté', field: 'prete', type: 'yesno' },
        { header: 'Stocké', field: 'stocke', type: 'yesno' },
        { header: 'Archivé', field: 'archive', type: 'yesno' },
        { header: 'Conforme', field: 'conforme', type: 'yesno' },
        { header: 'Sous-traitance', field: 'sousTraitance', type: 'yesno' },
        { header: 'Maintenance autorisée', field: 'fsmAutorise', type: 'yesno' },
        { header: 'Rappel mensuel auto', field: 'rappelMensuelAuto', type: 'yesno' },
        { header: 'Rappel hebdo auto', field: 'rappelHebdoAuto', type: 'yesno' },
        { header: 'Rappel journalier auto', field: 'rappelJournalierAuto', type: 'yesno' },
        { header: 'Numéro de série', field: 'numSerie', isSpecifique: true },
        { header: 'Marque / Modèle', field: 'marqueModele', isSpecifique: true },
        { header: 'Agent extincteur', field: 'agentExtincteur', isSpecifique: true },
        { header: 'Capacité / Poids', field: 'capacite', isSpecifique: true },
        { header: 'Pression', field: 'pression', isSpecifique: true },
        { header: "Date d'épreuve", field: 'dateEpreuve', isSpecifique: true, type: 'date' },
        { header: 'Date de recharge', field: 'dateRecharge', isSpecifique: true, type: 'date' },
        { header: 'Emplacements', field: 'emplacements', isSpecifique: true },
        { header: 'Commentaire spécifique', field: 'commentaireSpecifique', isSpecifique: true },
      ];

      const escapeCsvCell = (val: any): string => {
        const s = val === undefined || val === null ? '' : String(val);
        if (s.includes('"') || s.includes(',') || s.includes(';') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const clientById = new Map<string, Client>();
      for (const c of clients || []) {
        if (c?.id) clientById.set(c.id, c);
      }

      const csvLines: string[] = [canonicalCols.map(c => escapeCsvCell(c.header)).join(',')];
      const total = recordsToExport.length;
      const chunkSize = Math.max(50, Math.ceil(total / 8));

      for (let idx = 0; idx < total; idx++) {
        const item = recordsToExport[idx];
        const rowCells = canonicalCols.map(col => {
          let val: any = col.isSpecifique ? item.specifiques?.[col.field] : item[col.field];
          if ((val === undefined || val === null || val === '') && item._rawSheetRow && item._rawSheetRow[col.header] !== undefined) {
            val = item._rawSheetRow[col.header];
          }
          if ((val === undefined || val === null || val === '') && item.specifiques && item.specifiques[col.header] !== undefined) {
            val = item.specifiques[col.header];
          }

          if (col.field === 'identifiant' && !val && item.id) {
            val = item.id;
          } else if (col.field === 'clientNom' && !val && item.clientId) {
            const matchedCli = clientById.get(item.clientId);
            val = matchedCli?.denomination || item.clientId;
          } else if (col.field === 'numeroVoie' && !val) {
            val = item.numVoie;
          } else if (col.field === 'codePostal' && !val) {
            val = item.cp;
          } else if (col.field === 'aideAcces' && !val) {
            val = item.commentaireAdresse || item.emplacement;
          } else if (col.field === 'expirationGarantie' && !val) {
            val = item.finGarantie;
          } else if (col.field === 'dateFabrication' && !val) {
            val = item.fabrication;
          } else if (col.isSpecifique && col.field === 'numSerie' && !val) {
            val = item.numeroSerie;
          } else if (col.isSpecifique && col.field === 'marqueModele' && !val) {
            val = item.modele || item.modeleId;
          } else if (col.isSpecifique && col.field === 'emplacements' && !val) {
            val = item.emplacement || item.aideAcces;
          } else if (col.isSpecifique && col.field === 'commentaireSpecifique' && !val) {
            val = item.commentaire;
          } else if (col.field === 'fsmAutorise') {
            val = 'Oui';
          }

          if (val === undefined || val === null) return '';
          if (col.type === 'bool') {
            if (val === '') return '';
            return val === true || String(val).toLowerCase() === 'oui' || String(val).toLowerCase() === 'true' ? 'Oui' : 'Non';
          }
          return escapeCsvCell(val);
        });

        csvLines.push(rowCells.join(','));

        if (idx > 0 && idx % chunkSize === 0) {
          const pct = Math.min(95, 50 + Math.round(((idx + 1) / Math.max(1, total)) * 45));
          setExportMainOuiProgress(pct);
          await yieldToBrowser();
        }
      }

      setExportMainOuiProgress(100);
      await yieldToBrowser();

      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute('download', `autres_materiels_maintenance_oui_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error('Export CSV Autres Matériels Main. Oui error:', err);
    } finally {
      setTimeout(() => {
        setExportMainOuiProgress(null);
      }, 350);
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isHelpFaqOpen, setIsHelpFaqOpen] = useState(false);
  const [selectedHelpFaqIndex, setSelectedHelpFaqIndex] = useState<number | null>(null);
  const [helpIntroTyped, setHelpIntroTyped] = useState('');
  const [helpAnswerTyped, setHelpAnswerTyped] = useState('');
  const [helpAnswerDone, setHelpAnswerDone] = useState(false);
  const [helpResetTick, setHelpResetTick] = useState(0);
  const helpChatScrollRef = useRef<HTMLDivElement | null>(null);

  const HELP_FAQ_ITEMS = useMemo(() => [
    {
      q: "À quoi sert l’onglet « Autres Matériels » ?",
      a: "Vous y trouverez l’infogérance et la traçabilité de l’ensemble des matériels enregistrés autres que des défibrillateurs. Il peut notamment s’agir d’extincteurs, de purificateur d’air, de BIMP, etc.",
    },
    {
      q: "Comment fonctionne le filtre « Récemment » ?",
      a: "Il affiche uniquement les matériels récemment ajoutés ou modifiés.",
    },
    {
      q: "Comment fonctionne le filtre « Pro.Main.Urgente » ?",
      a: "Il affiche les matériels dont au moins une date critique est dépassée (alerte rouge) ou arrive à échéance sous 3 mois (alerte orange). C’est le filtre idéal pour identifier les interventions prioritaires.",
    },
    {
      q: "Comment fonctionne le filtre « Indicatif Postal » ?",
      a: "Il filtre les matériels selon leur département. La recherche s’effectue en sélectionnant le code départemental à deux chiffres (ex. : 03 ou 33) et se base sur le code postal renseigné.",
    },
    {
      q: "À quoi sert le bouton « Actualiser Données » ?",
      a: "Si vous travaillez à plusieurs sur différents postes, ce bouton permet de synchroniser l'affichage instantanément avec les dernières modifications enregistrées.",
    },
    {
      q: "Comment accéder à la cartographie ?",
      a: "Cliquez sur le menu contextuel (les trois points gris), puis sélectionnez Consulter la cartographie.",
    },
    {
      q: "Comment adapter l’affichage à la taille de l’écran ?",
      a: "Cliquez sur le menu contextuel (les trois points gris), puis sélectionnez Minimiser et ajuster l’affichage.",
    },
    {
      q: "Comment masquer certaines colonnes du tableau ?",
      a: "Cliquez sur le menu contextuel (les trois points gris), puis sélectionnez Gérer la visibilité des colonnes.",
    },
    {
      q: "À quoi sert l’accès aux feuilles de calcul (Google Sheets) ?",
      a: "Par principe de redondance, vos données sont synchronisées entre le serveur et une feuille de calcul en ligne. Ce format vous permet de modifier directement vos données en masse, ou encore de brancher des outils d'automatisation externes (ex. : Zapier, Make, n8n).",
    },
    {
      q: "Comment rechercher un appareil spécifique ?",
      a: "Utilisez la barre de recherche située en haut à droite pour rechercher par numéro de série, identifiant interne ou numéro de lot. Saisissez au moins 3 caractères pour lancer la requête.",
    },
    {
      q: "Comment créer un matériel à l’unité ?",
      a: "Cliquez sur le bouton Nouveau situé en haut à droite de l'écran.",
    },
    {
      q: "Comment supprimer un matériel ?",
      a: "Sur la ligne du matériel concerné, cliquez sur le bouton Supprimer situé dans la colonne des actions.",
    },
    {
      q: "Comment modifier un matériel?",
      a: "Cliquez directement sur la ligne du matériel ou sur le bouton Modifier dans la colonne des actions.",
    },
    {
      q: "Comment modifier plusieurs matériels en masse ?",
      a: "Cochez les cases à gauche des appareils à modifier. Dans la barre d'outils supérieure qui apparaît, cliquez sur Corriger. Un volet latéral s'ouvre : sélectionnez le ou les champs à mettre à jour et appliquez les nouvelles valeurs.",
    },
    {
      q: "Comment épingler des matériels en haut de liste ?",
      a: "Cochez la case à gauche des lignes souhaitées, puis cliquez sur Dés/Épingler dans la barre supérieure. Un défibrillateur épinglé reste en haut du tableau et se distingue par une bordure bleue latérale.",
    },
    {
      q: "Comment ajouter un ou plusieurs matériels à une tournée ?",
      a: "Cochez les lignes concernées, puis cliquez sur Tournée dans la barre supérieure. Remarque : Si le bouton est grisé, vérifiez qu'aucun appareil sélectionné n'est déjà rattaché à une tournée en cours. Seules les tournées au statut « Brouillon » sont accessibles.",
    },
    {
      q: "Comment forcer le retrait de matériels d'une tournée ?",
      a: "Cochez les lignes souhaitées, puis cliquez sur Nettoyer des tournées dans la barre supérieure. Remarque : Si le bouton est grisé, la mission est déjà validée, en cours, ou la tournée n'est plus au statut « Brouillon ». Vous pouvez également effectuer cette action directement depuis l’onglet dédié aux tournées.",
    },
    {
      q: "Qu'est-ce que le système de variables ?",
      a: "Defibeo vous permet de personnaliser les listes déroulantes. Vous pouvez ajouter, modifier ou supprimer ces entrées depuis l’onglet Variables.",
    },
    {
      q: "Qu'est-ce que l'identifiant ?",
      a: "C'est une référence unique générée automatiquement par le logiciel pour chaque matériel (analogue à une immatriculation interne). Non modifiable, elle assure la traçabilité de la fiche en complément du numéro de série constructeur.",
    },
  ], []);

  useEffect(() => {
    if (!isHelpFaqOpen) {
      setSelectedHelpFaqIndex(null);
      setHelpIntroTyped('');
      setHelpAnswerTyped('');
      setHelpAnswerDone(false);
      return;
    }
    const introText = "Ressources d’aide populaires :";
    let idx = 0;
    setHelpIntroTyped('');
    const interval = window.setInterval(() => {
      idx += 1;
      setHelpIntroTyped(introText.slice(0, idx));
      if (idx >= introText.length) {
        window.clearInterval(interval);
      }
    }, 18);
    return () => window.clearInterval(interval);
  }, [isHelpFaqOpen, helpResetTick]);

  useEffect(() => {
    if (selectedHelpFaqIndex === null || !HELP_FAQ_ITEMS[selectedHelpFaqIndex]) {
      setHelpAnswerTyped('');
      setHelpAnswerDone(false);
      return;
    }
    const fullAnswer = HELP_FAQ_ITEMS[selectedHelpFaqIndex].a;
    let idx = 0;
    setHelpAnswerTyped('');
    setHelpAnswerDone(false);
    const interval = window.setInterval(() => {
      idx += 2;
      if (idx >= fullAnswer.length) {
        setHelpAnswerTyped(fullAnswer);
        setHelpAnswerDone(true);
        window.clearInterval(interval);
      } else {
        setHelpAnswerTyped(fullAnswer.slice(0, idx));
      }
      if (helpChatScrollRef.current) {
        helpChatScrollRef.current.scrollTop = helpChatScrollRef.current.scrollHeight;
      }
    }, 14);
    return () => window.clearInterval(interval);
  }, [selectedHelpFaqIndex, HELP_FAQ_ITEMS]);

  // Pinned items state (persisted in localStorage)
  const [pinnedOtherIds, setPinnedOtherIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pinned_autres_materiels');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleTogglePinSelected = () => {
    if (selectedIds.length === 0) return;
    setPinnedOtherIds(prev => {
      const nextSet = new Set(prev);
      for (const id of selectedIds) {
        if (nextSet.has(id)) {
          nextSet.delete(id);
        } else {
          nextSet.add(id);
        }
      }
      const updated = Array.from(nextSet);
      try {
        localStorage.setItem('pinned_autres_materiels', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };
  const [isTourDropdownOpen, setIsTourDropdownOpen] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [sortFilter, setSortFilter] = useState<'recent' | 'closest_maintenance' | null>(initialSortFilter || null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  useEffect(() => {
    if (initialSortFilter !== undefined) {
      setSortFilter(initialSortFilter);
    }
  }, [initialSortFilter, sortFilterTrigger]);

  useEffect(() => {
    const handleExternalNav = (e: Event) => {
      const custom = e as CustomEvent<{ search?: string; sortFilter?: 'recent' | 'closest_maintenance' | null }>;
      if (custom.detail) {
        if (custom.detail.search !== undefined) {
          setSearchQuery(custom.detail.search);
          if (onSearchChange) onSearchChange(custom.detail.search);
        }
        if (custom.detail.sortFilter !== undefined) {
          setSortFilter(custom.detail.sortFilter);
        }
        setCategoryFilter('Tous');
        setIsFormOpen(false);
      }
    };
    window.addEventListener('autres-materiels-external-filter', handleExternalNav);
    return () => window.removeEventListener('autres-materiels-external-filter', handleExternalNav);
  }, [onSearchChange]);

  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const recentSearchesStorageKey = `defib_${activeTenantId}_recent_materiels_searches`;
  const readStoredRecentSearches = (tenantKey: string): string[] => {
    if (typeof window === 'undefined') return [];
    const candidateStores: Storage[] = [];
    try {
      if (window.localStorage) candidateStores.push(window.localStorage);
    } catch (_) {}
    try {
      if (window.sessionStorage) candidateStores.push(window.sessionStorage);
    } catch (_) {}

    for (const store of candidateStores) {
      try {
        const raw =
          store.getItem(tenantKey) ||
          store.getItem('defib_recent_materiels_searches');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const valid = parsed
              .map((item) => String(item || '').trim())
              .filter((item) => item.length >= 2)
              .slice(0, 5);
            if (valid.length > 0) return valid;
          }
        }
      } catch (_) {}
    }
    return [];
  };

  const persistRecentSearchesToCache = (tenantKey: string, list: string[]) => {
    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify(list);
    try {
      window.sessionStorage?.setItem(tenantKey, serialized);
      window.sessionStorage?.setItem('defib_recent_materiels_searches', serialized);
    } catch (_) {}
    try {
      window.localStorage?.setItem(tenantKey, serialized);
      window.localStorage?.setItem('defib_recent_materiels_searches', serialized);
    } catch (_) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (
            k &&
            !k.includes('recent_materiels_searches') &&
            !k.includes('recent_defib_searches') &&
            (k.includes('_cache') || k.includes('_sheet_') || k.includes('_defibs') || k.includes('_clients'))
          ) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => {
          try {
            window.localStorage.removeItem(k);
          } catch (_) {}
        });
        window.localStorage?.setItem(tenantKey, serialized);
        window.localStorage?.setItem('defib_recent_materiels_searches', serialized);
      } catch (__) {}
    }
  };

  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readStoredRecentSearches(`defib_${activeTenantId}_recent_materiels_searches`)
  );

  useEffect(() => {
    const stored = readStoredRecentSearches(recentSearchesStorageKey);
    if (stored.length > 0) {
      setRecentSearches(stored);
    }
  }, [recentSearchesStorageKey]);

  const saveRecentSearch = React.useCallback(
    (term: string) => {
      const trimmed = String(term || '').trim();
      if (trimmed.length < 2) return;
      setRecentSearches((prev) => {
        const base = prev.length > 0 ? prev : readStoredRecentSearches(recentSearchesStorageKey);
        const updated = [
          trimmed,
          ...base.filter((item) => item.trim().length >= 2 && item.toLowerCase() !== trimmed.toLowerCase()),
        ].slice(0, 5);
        persistRecentSearchesToCache(recentSearchesStorageKey, updated);
        return updated;
      });
    },
    [recentSearchesStorageKey]
  );

  // Save recent search after user pauses typing
  useEffect(() => {
    const trimmed = String(searchQuery || '').trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      saveRecentSearch(trimmed);
    }, 1000);
    return () => clearTimeout(timer);
  }, [searchQuery, saveRecentSearch]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OtherEquipment | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('Tous');
  const [isMapOpen, setIsMapOpen] = useState(false);

  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [isTableFitView, setIsTableFitView] = useState<boolean>(false);
  const [tableFitScale, setTableFitScale] = useState<number>(1);
  const naturalTableWidthRef = useRef<number>(1500);

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
          const naturalW = naturalTableWidthRef.current || 1500;
          const scale = Math.min(1, Math.max(0.1, (clientW - 2) / naturalW));
          setTableFitScale(scale);
        }
      } else {
        setTableFitScale(1);
      }
      return next;
    });
  };

  const isTourTermine = (t: any): boolean => {
    const st = String(t?.status || t?.statut || t?.situation || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return st === 'termine' || st === 'terminee';
  };

  const isAnySelectedInTour = useMemo(() => {
    return selectedIds.some(id => {
      const item = otherEquipments.find(e => e.id === id);
      if (!item) return false;
      return (fsmTours || []).some(t =>
        (t.missions || []).some((m: any) => (m.defibIdentifiant || m.identifiant) === item.identifiant)
      );
    });
  }, [selectedIds, otherEquipments, fsmTours]);

  const canCleanSelectedFromTours = useMemo(() => {
    if (selectedIds.length === 0) return false;
    return selectedIds.every(id => {
      const item = otherEquipments.find(e => e.id === id);
      if (!item || !item.identifiant) return false;
      const targetIdent = String(item.identifiant).trim();
      const matchingTours = (fsmTours || []).filter(t =>
        (t?.missions || []).some((m: any) => String(m?.defibIdentifiant || m?.identifiant || '').trim() === targetIdent)
      );
      return matchingTours.length > 0 && matchingTours.every(t => isTourTermine(t));
    });
  }, [selectedIds, otherEquipments, fsmTours]);

  const handleCleanSelectedFromTours = () => {
    if (!onUpdateFsmTours || !canCleanSelectedFromTours) return;
    const selectedIdents = new Set<string>();
    for (const id of selectedIds) {
      const item = otherEquipments.find(e => e.id === id);
      if (item?.identifiant) {
        selectedIdents.add(String(item.identifiant).trim());
      }
    }
    if (selectedIdents.size === 0) return;

    const updatedTours = (fsmTours || []).map(t => {
      if (!t || !isTourTermine(t) || !Array.isArray(t.missions)) return t;
      const filteredMissions = t.missions.filter(
        (m: any) => !selectedIdents.has(String(m?.defibIdentifiant || m?.identifiant || '').trim())
      );
      if (filteredMissions.length === t.missions.length) return t;
      return {
        ...t,
        missions: filteredMissions,
      };
    });

    onUpdateFsmTours(updatedTours);
    setSelectedIds([]);
  };

  // Form Fields State
  const [clientId, setClientId] = useState('');
  const [nomPrenomSite, setNomPrenomSite] = useState('');
  const [telephoneSite, setTelephoneSite] = useState('');
  const [emailSite, setEmailSite] = useState('');
  const [contrat, setContrat] = useState<'Oui' | 'Non'>('Non');
  const [nomContrat, setNomContrat] = useState('');
  const [referenceContrat, setReferenceContrat] = useState('');
  const [debutContrat, setDebutContrat] = useState('');
  const [finContrat, setFinContrat] = useState('');
  const [payeurId, setPayeurId] = useState('');
  const [clientIdField, setClientIdField] = useState('');

  const [numeroVoie, setNumeroVoie] = useState('');
  const [ville, setVille] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [region, setRegion] = useState('');
  const [pays, setPays] = useState('France');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [aideAcces, setAideAcces] = useState('');
  const [accesPermanent, setAccesPermanent] = useState<'Oui' | 'Non'>('Oui');
  const [accesJoursOuvres, setAccesJoursOuvres] = useState<'Oui' | 'Non'>('Oui');
  const [accesWeekend, setAccesWeekend] = useState<'Oui' | 'Non'>('Non');
  const [installeExterieur, setInstalleExterieur] = useState<'Oui' | 'Non'>('Non');

  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [tempLat, setTempLat] = useState<number>(48.8566);
  const [tempLng, setTempLng] = useState<number>(2.3522);

  const handleManualUpdateCoordinates = async () => {
    const query = [numeroVoie, codePostal, ville, region, pays].filter(Boolean).join(', ');
    if (query.trim().length > 5) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        const data = await res.json();
        if (data && data.length > 0) {
          setLatitude(data[0].lat);
          setLongitude(data[0].lon);
        }
      } catch (e) {
        console.error('Geocoding error:', e);
      }
    }
  };

  const [schedules, setSchedules] = useState<{
    days: string[];
    fermetureMidi: boolean;
    openMorning: string;
    closeMorning: string;
    openAfternoon: string;
    closeAfternoon: string;
    openContinuous: string;
    closeContinuous: string;
  }[]>([
    {
      days: [],
      fermetureMidi: false,
      openMorning: '09:00',
      closeMorning: '12:00',
      openAfternoon: '14:00',
      closeAfternoon: '18:00',
      openContinuous: '09:00',
      closeContinuous: '17:00'
    }
  ]);

  const handleToggleDay = (idx: number, day: string) => {
    const isTakenElsewhere = schedules.some((s, i) => i !== idx && s.days.includes(day));
    if (isTakenElsewhere) return;

    setSchedules(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const days = item.days.includes(day)
        ? item.days.filter(d => d !== day)
        : [...item.days, day];
      return { ...item, days };
    }));
  };

  const handleUpdateScheduleField = (idx: number, field: string, value: any) => {
    setSchedules(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, [field]: value };
    }));
  };

  const handleAddSchedule = () => {
    if (schedules.length >= 2) return;
    setSchedules(prev => {
      if (prev.length >= 2) return prev;
      return [
        ...prev,
        {
          days: [],
          fermetureMidi: false,
          openMorning: '09:00',
          closeMorning: '12:00',
          openAfternoon: '14:00',
          closeAfternoon: '18:00',
          openContinuous: '09:00',
          closeContinuous: '17:00'
        }
      ];
    });
  };

  const handleRemoveSchedule = (idx: number) => {
    setSchedules(prev => prev.filter((_, i) => i !== idx));
  };

  const [expirationGarantie, setExpirationGarantie] = useState('');
  const [fabrication, setFabrication] = useState('');
  const [miseEnService, setMiseEnService] = useState('');
  const [derniereMaintenance, setDerniereMaintenance] = useState('');
  const [sortieUsine, setSortieUsine] = useState('');
  const [prochaineMaintenance, setProchaineMaintenance] = useState('');

  const handleDerniereMaintenanceChange = (val: string) => {
    setDerniereMaintenance(val);
    if (val) {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        date.setMonth(date.getMonth() + 12);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        setProchaineMaintenance(`${yyyy}-${mm}-${dd}`);
      }
    }
  };

  const [categorie, setCategorie] = useState('Extincteur');
  const [identifiant, setIdentifiant] = useState('');
  const [tournee, setTournee] = useState('Centre');

  // Specific variables per category
  const [specifiques, setSpecifiques] = useState<Record<string, any>>({});

  // Client Search in dropdown
  const [clientSearchText, setClientSearchText] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isSidePaneClientOpen, setIsSidePaneClientOpen] = useState(false);

  const clientSidePaneItems: SearchSidePaneItem[] = useMemo(() => {
    return (clients || []).map((c) => ({
      id: c.id,
      label: c.denomination || 'Client sans nom',
      raw: c,
    }));
  }, [clients]);

  // Map client denomination
  // Moved clientMap lookup declaration up or we already have it.
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  const getLinkedClientForItem = (item: OtherEquipment) => {
    if (!item) return undefined;
    if (item.clientId) {
      const direct = clientMap.get(item.clientId);
      if (direct) return direct;
      const lowerRef = String(item.clientId || '').trim().toLowerCase();
      const byNameOrCode = clients.find(
        c =>
          (c.denomination && String(c.denomination).trim().toLowerCase() === lowerRef) ||
          (c.clientIdField && String(c.clientIdField).trim().toLowerCase() === lowerRef)
      );
      if (byNameOrCode) return byNameOrCode;
    }
    if (item.clientIdField) {
      const lowerCode = String(item.clientIdField || '').trim().toLowerCase();
      const byCode = clients.find(
        c =>
          (c.clientIdField && String(c.clientIdField).trim().toLowerCase() === lowerCode) ||
          (c.id && String(c.id).trim().toLowerCase() === lowerCode)
      );
      if (byCode) return byCode;
    }
    return undefined;
  };

  // Filter clients for dropdown
  const filteredClientsForDropdown = useMemo(() => {
    if (!clientSearchText) return clients;
    
    // Check if what is typed is exactly the label of the currently selected client.
    // If so, and the user re-focuses or clicks, show all clients so they can change easily.
    const chosen = clientId ? clientMap.get(clientId) : null;
    const selectedLabel = chosen ? `${chosen.denomination} (${chosen.siret || chosen.id})` : null;
    if (clientSearchText === selectedLabel) {
      return clients;
    }

    const lower = clientSearchText.toLowerCase();
    return clients.filter(c => 
      c.denomination.toLowerCase().includes(lower) ||
      c.id.toLowerCase().includes(lower) ||
      (c.siret || '').toLowerCase().includes(lower)
    );
  }, [clients, clientSearchText, clientId, clientMap]);

  // Autopopulate client data
  const handleClientSelect = (clId: string) => {
    setClientId(clId);
    const chosen = clientMap.get(clId);
    if (chosen) {
      setNomPrenomSite(chosen.nomPrenomSite || '');
      setTelephoneSite(chosen.telephoneSite || chosen.phone || '');
      setEmailSite(chosen.emailSite || chosen.email || '');
      setContrat(chosen.contrat || 'Non');
      setNomContrat(chosen.nomContrat || '');
      setReferenceContrat(chosen.referenceContrat || '');
      setDebutContrat(chosen.debutContrat || '');
      setFinContrat(chosen.finContrat || '');
      setPayeurId(chosen.payeurId || '');
      setClientIdField(chosen.clientIdField || '');
      
      const labelStr = `${chosen.denomination} (${chosen.siret || chosen.id})`;
      setClientSearchText(labelStr);
    } else {
      setClientSearchText('');
      setNomPrenomSite('');
      setTelephoneSite('');
      setEmailSite('');
      setContrat('Non');
      setNomContrat('');
      setReferenceContrat('');
      setDebutContrat('');
      setFinContrat('');
      setPayeurId('');
      setClientIdField('');
    }
    setIsClientDropdownOpen(false);
  };

  // Re-roll random identifiant button helper
  const reRollIdentifiant = () => {
    const existingIds = [
      ...(defibrillateurs || []).map((d: any) => d.identifiant),
      ...otherEquipments.map((o: any) => o.identifiant)
    ].filter(Boolean);
    setIdentifiant(generateRandomShortCode(existingIds));
  };

  // Open Form for Create
  const handleOpenNewForm = () => {
    setEditingItem(null);
    setClientId('');
    setNomPrenomSite('');
    setTelephoneSite('');
    setEmailSite('');
    setContrat('Non');
    setNomContrat('');
    setReferenceContrat('');
    setDebutContrat('');
    setFinContrat('');
    setPayeurId('');
    setClientIdField('');
    setNumeroVoie('');
    setVille('');
    setCodePostal('');
    setRegion('');
    setPays('France');
    setLatitude('');
    setLongitude('');
    setAideAcces('');
    setAccesPermanent('Oui');
    setAccesJoursOuvres('Oui');
    setAccesWeekend('Non');
    setInstalleExterieur('Non');
    setExpirationGarantie('');
    setFabrication('');
    setMiseEnService('');
    setDerniereMaintenance('');
    setSortieUsine('');
    setProchaineMaintenance('');
    setCategorie('Extincteur');
    
    // Generate unique short code clashing neither with other equipments nor with defibrillateurs
    const existingIds = [
      ...defibrillateurs.map((d: any) => d.identifiant),
      ...otherEquipments.map((o: any) => o.identifiant)
    ].filter(Boolean);
    setIdentifiant(generateRandomShortCode(existingIds));

    setTournee('Centre');
    setSpecifiques({});
    setClientSearchText('');
    setSchedules([
      {
        days: [],
        fermetureMidi: false,
        openMorning: '09:00',
        closeMorning: '12:00',
        openAfternoon: '14:00',
        closeAfternoon: '18:00',
        openContinuous: '09:00',
        closeContinuous: '17:00'
      }
    ]);
    setIsFormOpen(true);
  };

  // Open Form for Edit
  const handleOpenEditForm = (item: OtherEquipment) => {
    setEditingItem(item);
    setClientId(item.clientId || '');
    setNomPrenomSite(item.nomPrenomSite || '');
    setTelephoneSite(item.telephoneSite || '');
    setEmailSite(item.emailSite || '');
    setContrat(item.contrat || 'Non');
    setNomContrat(item.nomContrat || '');
    setReferenceContrat(item.referenceContrat || '');
    setDebutContrat(item.debutContrat || '');
    setFinContrat(item.finContrat || '');
    setPayeurId(item.payeurId || '');
    setClientIdField(item.clientIdField || '');
    setNumeroVoie(item.numeroVoie || (item as any).numVoie || '');
    if (item.horaires) {
      try {
        const parsed = typeof item.horaires === 'string' ? JSON.parse(item.horaires) : item.horaires;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSchedules(
            parsed.map((s: any) => ({
              days: Array.isArray(s?.days) ? s.days : [],
              fermetureMidi: Boolean(s?.fermetureMidi),
              openMorning: s?.openMorning || '09:00',
              closeMorning: s?.closeMorning || '12:00',
              openAfternoon: s?.openAfternoon || '14:00',
              closeAfternoon: s?.closeAfternoon || '18:00',
              openContinuous: s?.openContinuous || '09:00',
              closeContinuous: s?.closeContinuous || '17:00',
            }))
          );
        } else {
          setSchedules([
            {
              days: [],
              fermetureMidi: false,
              openMorning: '09:00',
              closeMorning: '12:00',
              openAfternoon: '14:00',
              closeAfternoon: '18:00',
              openContinuous: '09:00',
              closeContinuous: '17:00'
            }
          ]);
        }
      } catch (e) {
        setSchedules([
          {
            days: [],
            fermetureMidi: false,
            openMorning: '09:00',
            closeMorning: '12:00',
            openAfternoon: '14:00',
            closeAfternoon: '18:00',
            openContinuous: '09:00',
            closeContinuous: '17:00'
          }
        ]);
      }
    } else {
      setSchedules([
        {
          days: [],
          fermetureMidi: false,
          openMorning: '09:00',
          closeMorning: '12:00',
          openAfternoon: '14:00',
          closeAfternoon: '18:00',
          openContinuous: '09:00',
          closeContinuous: '17:00'
        }
      ]);
    }
    setVille(item.ville || '');
    setCodePostal(item.codePostal || (item as any).cp || '');
    setRegion(item.region || '');
    setPays(item.pays || 'France');
    setLatitude(item.latitude || '');
    setLongitude(item.longitude || '');
    setAideAcces(item.aideAcces || '');
    setAccesPermanent(item.accesPermanent || 'Oui');
    setAccesJoursOuvres(item.accesJoursOuvres || 'Oui');
    setAccesWeekend(item.accesWeekend || 'Non');
    setInstalleExterieur(item.installeExterieur || 'Non');
    setExpirationGarantie(item.expirationGarantie || '');
    setFabrication(item.fabrication || '');
    setMiseEnService(item.miseEnService || '');
    setDerniereMaintenance(item.derniereMaintenance || '');
    setSortieUsine(item.sortieUsine || '');
    setProchaineMaintenance(item.prochaineMaintenance || '');
    setCategorie(item.categorie || 'Extincteur');

    // Fallback/load identifiant
    if (!item.identifiant) {
      const existingIds = [
        ...defibrillateurs.map((d: any) => d.identifiant),
        ...otherEquipments.map((o: any) => o.identifiant)
      ].filter(Boolean);
      item.identifiant = generateRandomShortCode(existingIds);
    }
    setIdentifiant(item.identifiant || '');

    setTournee(item.tournee || 'Centre');
    let parsedSpecifiques: Record<string, any> = {};
    if (item.specifiques) {
      if (typeof item.specifiques === 'string') {
        try {
          const parsed = JSON.parse(item.specifiques);
          if (parsed && typeof parsed === 'object') parsedSpecifiques = parsed;
        } catch (_) {}
      } else if (typeof item.specifiques === 'object') {
        parsedSpecifiques = item.specifiques;
      }
    }
    setSpecifiques(parsedSpecifiques);
    
    const cl = getLinkedClientForItem(item);
    if (cl) {
      setClientId(cl.id);
    }
    const clientLabel = cl ? `${cl.denomination} (${cl.siret || cl.id})` : (item.clientId || item.nomPrenomSite || '');
    setClientSearchText(clientLabel);
    setIsFormOpen(true);
  };

  // Delete Action
  const handleDeleteItem = (id: string) => {
    if (isDeveloper || isReadOnly) {
      alert("Action non autorisée : Le rôle Développeur est en mode lecture seule.");
      return;
    }
    const target = otherEquipments.find(item => item.id === id);
    if (target) {
      const activeTenant = localStorage.getItem('defib_tenant_id') || 'demo';
      const identifiant = target.identifiant || id;
      const serialNumber = (target as any).numeroSerie || target.identifiant || 'Sans numéro de série';
      logDeleteOtherEquipment(activeTenant, identifiant, serialNumber).catch(() => {});
    }
    const updated = otherEquipments.filter(item => item.id !== id);
    saveOtherEquipments(updated);
  };

  const RECENT_OTHER_TTL_MS = 30 * 60 * 1000;
  const [recentOtherTimestamps, setRecentOtherTimestamps] = useState<Record<string, number>>(() => {
    try {
      const saved =
        sessionStorage.getItem(`defib_${activeTenantId}_recent_autres_timestamps`) ||
        localStorage.getItem(`defib_${activeTenantId}_recent_autres_timestamps`);
      if (saved) {
        const parsed = JSON.parse(saved);
        const now = Date.now();
        const valid: Record<string, number> = {};
        for (const [k, ts] of Object.entries(parsed)) {
          if (typeof ts === 'number' && now - ts < RECENT_OTHER_TTL_MS) {
            valid[k.toLowerCase()] = ts;
          }
        }
        return valid;
      }
    } catch (_) {}
    return {};
  });

  const recordRecentOtherChange = (keys: (string | undefined | null)[]) => {
    const cleanKeys = keys.filter(Boolean).map(k => String(k).trim().toLowerCase());
    if (cleanKeys.length === 0) return;
    const now = Date.now();
    setRecentOtherTimestamps(prev => {
      const updated = { ...prev };
      cleanKeys.forEach((k, idx) => {
        updated[k] = now - idx;
      });
      try {
        const str = JSON.stringify(updated);
        sessionStorage.setItem(`defib_${activeTenantId}_recent_autres_timestamps`, str);
        localStorage.setItem(`defib_${activeTenantId}_recent_autres_timestamps`, str);
      } catch (_) {}
      return updated;
    });
  };

  // Submit Action
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeveloper || isReadOnly) {
      alert("Action non autorisée : Le rôle Développeur est en mode lecture seule.");
      return;
    }

    const itemData: OtherEquipment = {
      id: editingItem ? editingItem.id : 'oe_' + Date.now(),
      identifiant,
      clientId,
      nomPrenomSite,
      telephoneSite,
      emailSite,
      contrat,
      nomContrat,
      referenceContrat,
      debutContrat,
      finContrat,
      payeurId: String(payeurId || '').trim(),
      clientIdField: String(clientIdField || '').trim(),
      numeroVoie,
      ville,
      codePostal,
      region,
      pays,
      latitude,
      longitude,
      aideAcces,
      accesPermanent,
      accesJoursOuvres,
      accesWeekend,
      installeExterieur,
      horaires: JSON.stringify(schedules),
      expirationGarantie,
      fabrication,
      miseEnService,
      derniereMaintenance,
      sortieUsine,
      prochaineMaintenance,
      categorie,
      tournee,
      specifiques,
    };

    let updatedList: OtherEquipment[];
    if (editingItem) {
      updatedList = otherEquipments.map(item => item.id === editingItem.id ? itemData : item);
    } else {
      updatedList = [...otherEquipments, itemData];
    }

    recordRecentOtherChange([itemData.id, itemData.identifiant]);
    saveOtherEquipments(updatedList);
    setIsFormOpen(false);
  };

  // Update specific values
  const handleSpecifiqueChange = (key: string, val: any) => {
    setSpecifiques(prev => ({
      ...prev,
      [key]: val
    }));
  };

  const handleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const buildMissionFromAutreId = (id: string, index: number) => {
    const item = otherEquipments.find(e => e.id === id);
    const client = clients.find(c => c.id === item?.clientId);
    const clientName = client ? client.denomination : (item?.nomPrenomSite || 'Nom du Site');
    const siteName = item?.nomPrenomSite || '';
    const eqIdent = item?.identifiant || item?.categorie || 'Autre Matériel';
    const ts = Date.now() + index;
    const ref = `INT-2026-${String(ts).slice(-5).padStart(5, '0')}`;
    const cp = item?.codePostal || '';
    const ville = item?.ville || '';
    const clientAddress = [item?.numeroVoie, cp, ville].filter(Boolean).join(', ');
    return {
      id: `fsm-m-auto-${ts}-${index}`,
      interventionReference: ref,
      clientName,
      siteName,
      clientId: item?.clientId || '',
      defibIdentifiant: eqIdent,
      identifiant: eqIdent,
      defibNumeroSerie: (item as any)?.numeroSerie || item?.specifiques?.numSerie || '',
      cp,
      ville,
      clientAddress,
      equipmentType: item?.categorie || 'Autre Matériel',
      reason: '',
      reasons: [],
      requiredParts: [],
      status: 'Brouillon',
      priority: 'Normale',
      time: '14:00'
    };
  };

  const executeNouvelleTournee = () => {
    if (!onUpdateFsmTours) return;
    const missions = selectedIds.map((id, index) => buildMissionFromAutreId(id, index));

    const newTour = {
      id: 'fsm-tour-auto-' + Date.now(),
      title: "Nouvelle tournée sans titre",
      techName: members.find((m: any) => m.role === 'Maintenance Terrain' || m.role?.toLowerCase().includes('tech'))?.name || members[0]?.name || '',
      startDate: new Date().toISOString().split('T')[0],
      status: 'Brouillon',
      missions
    };

    onUpdateFsmTours([...fsmTours, newTour]);
    setSelectedIds([]);
    setIsTourDropdownOpen(false);
    setSelectedDraftId(null);

    if (setActiveTab) {
      setActiveTab('fsm');
    }
  };

  const executeAddToTrier = () => {
    if (!onUpdateFsmTours) return;
    const missionsToAdd = selectedIds.map((id, index) => buildMissionFromAutreId(id, index));

    let existingTrierTour = fsmTours.find(t => t.id === 'a-trier');
    let updated;
    if (existingTrierTour) {
      updated = fsmTours.map(t => {
        if (t.id === 'a-trier') {
          return {
            ...t,
            missions: [...t.missions, ...missionsToAdd]
          };
        }
        return t;
      });
    } else {
      const newTrierTour = {
        id: 'a-trier',
        title: 'Missions à trier',
        techName: '',
        startDate: 'A trier',
        status: 'Brouillon',
        missions: missionsToAdd,
        vehicule: 'Aucun',
        calculated: false
      };
      updated = [newTrierTour, ...fsmTours];
    }

    onUpdateFsmTours(updated);
    setSelectedIds([]);
    setIsTourDropdownOpen(false);
    setSelectedDraftId(null);
    if (setActiveTab) {
      setActiveTab('fsm');
    }
  };

  const executeAddTournee = (targetTourId: string) => {
    if (!onUpdateFsmTours) return;
    const targetTour = fsmTours.find(t => t.id === targetTourId);
    if (!targetTour) return;

    if (['À faire', 'En cours', 'Effectué', 'Terminé'].includes(targetTour.status)) {
      alert("Erreur : vous ne pouvez ajouter des missions qu'à une tournée en situation Brouillon.");
      return;
    }

    const updated = fsmTours.map(t => {
      if (t.id === targetTourId) {
        const addedMissions = selectedIds.map((id, index) => buildMissionFromAutreId(id, index));
        return {
          ...t,
          missions: [...t.missions, ...addedMissions]
        };
      }
      return t;
    });

    onUpdateFsmTours(updated);

    setSelectedIds([]);
    setIsTourDropdownOpen(false);
    setSelectedDraftId(null);

    if (setActiveTab) {
      setActiveTab('fsm');
    }
  };

  const isInitialView = useMemo(() => {
    return (
      !searchQuery.trim() &&
      categoryFilter === 'Tous' &&
      selectedDepartment === null &&
      sortFilter === null
    );
  }, [searchQuery, categoryFilter, selectedDepartment, sortFilter]);

  // Filtered List
  const filteredList = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    let baseList = otherEquipments.filter(item => {
      // 1. Category Filter
      const matchesCategory = categoryFilter === 'Tous' || item.categorie === categoryFilter;
      if (!matchesCategory) return false;

      // 2. Department filter (Indicatif Postal)
      if (selectedDepartment && selectedDepartment !== '__ALL__') {
        const rawCp = ((item as any).codePostal || (item as any).cp || '').toString().trim().replace(/\s+/g, '').toUpperCase();
        if (!rawCp) return false;
        if (selectedDepartment === '2A') {
          if (!rawCp.startsWith('2A') && !rawCp.startsWith('200') && !rawCp.startsWith('201')) {
            return false;
          }
        } else if (selectedDepartment === '2B') {
          if (!rawCp.startsWith('2B') && !rawCp.startsWith('202') && !rawCp.startsWith('206')) {
            return false;
          }
        } else {
          const normalized = /^\d{4}$/.test(rawCp) ? '0' + rawCp : rawCp;
          if (!normalized.startsWith(selectedDepartment)) {
            return false;
          }
        }
      }

      // 3. Pro.Main. Urgente filter (only considers Prochaine maintenance: expired or < 90 days)
      if (sortFilter === 'closest_maintenance') {
        const mDate = parseEquipmentDate(item.prochaineMaintenance);
        if (!mDate) return false;
        mDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((mDate.getTime() - todayTime) / (1000 * 60 * 60 * 24));
        if (diffDays > 90) return false;
      }

      // 4. Search Query Filter
      if (!searchQuery) return true;
      const lower = searchQuery.toLowerCase().trim();
      const resolvedCl = getLinkedClientForItem(item);
      const clName = resolvedCl?.denomination || item.clientId || '';
      const matchesSpecifiques = item.specifiques && Object.values(item.specifiques).some(val => 
        typeof val === 'string' && val.toLowerCase().includes(lower)
      );
      return (
        (item.categorie || '').toLowerCase().includes(lower) ||
        (item.identifiant || '').toLowerCase().includes(lower) ||
        clName.toLowerCase().includes(lower) ||
        (item.ville || '').toLowerCase().includes(lower) ||
        (item.tournee || '').toLowerCase().includes(lower) ||
        (item.aideAcces || '').toLowerCase().includes(lower) ||
        (item.nomPrenomSite || '').toLowerCase().includes(lower) ||
        (item.nomContrat || '').toLowerCase().includes(lower) ||
        (item.referenceContrat || '').toLowerCase().includes(lower) ||
        (item.numeroVoie || '').toLowerCase().includes(lower) ||
        (item.codePostal || '').toLowerCase().includes(lower) ||
        Boolean(matchesSpecifiques)
      );
    });

    if (isInitialView) {
      const now = Date.now();
      const getCacheTs = (item: OtherEquipment): number => {
        const k1 = item.id ? String(item.id).trim().toLowerCase() : '';
        const k2 = item.identifiant ? String(item.identifiant).trim().toLowerCase() : '';
        const ts =
          (k1 && recentOtherTimestamps[k1]) ||
          (k2 && recentOtherTimestamps[k2]) ||
          0;
        return ts && now - ts < RECENT_OTHER_TTL_MS ? ts : 0;
      };
      const cachedRecent = baseList.filter(it => getCacheTs(it) > 0);
      cachedRecent.sort((a, b) => getCacheTs(b) - getCacheTs(a));
      if (cachedRecent.length > 0) {
        baseList = cachedRecent;
      } else {
        baseList = [];
      }
    } else if (sortFilter === 'recent') {
      const totalLen = otherEquipments.length;
      const indexMap = new Map(otherEquipments.map((it, idx) => [it.id, totalLen - idx]));
      baseList = [...baseList].sort((a, b) => {
        const tA = (a as any).updatedAt ? new Date((a as any).updatedAt).getTime() : (indexMap.get(a.id) ?? 0);
        const tB = (b as any).updatedAt ? new Date((b as any).updatedAt).getTime() : (indexMap.get(b.id) ?? 0);
        return tB - tA;
      });
    } else if (sortFilter === 'closest_maintenance') {
      const dateMap = new Map<string, number>();
      for (const item of baseList) {
        const parsed = parseEquipmentDate(item.prochaineMaintenance);
        dateMap.set(item.id, parsed ? parsed.getTime() : Infinity);
      }
      const indexMap = new Map(otherEquipments.map((it, idx) => [it.id, idx]));
      baseList = [...baseList].sort((a, b) => {
        const timeA = dateMap.get(a.id) ?? Infinity;
        const timeB = dateMap.get(b.id) ?? Infinity;
        if (timeA !== timeB) return timeA - timeB;
        return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
      });
    }

    if (pinnedOtherIds.length > 0 && (!isInitialView || baseList.length > 0)) {
      const pinnedSet = new Set(pinnedOtherIds);
      const pinnedItems = baseList.filter(item => pinnedSet.has(item.id));
      const unpinnedItems = baseList.filter(item => !pinnedSet.has(item.id));
      return [...pinnedItems, ...unpinnedItems];
    }

    return baseList;
  }, [otherEquipments, searchQuery, categoryFilter, clientMap, pinnedOtherIds, sortFilter, selectedDepartment, isInitialView, recentOtherTimestamps]);

  // Color mappings for Category badge
  const getCategorieBadgeStyle = (cat: string) => {
    switch(cat) {
      case 'Extincteur':
        return { backgroundColor: '#e0f2fe', color: '#0369a1' }; // Blue
      case "Boucle d'induction magnétique portable (BIMP)":
        return { backgroundColor: '#fae8ff', color: '#a21caf' }; // Purple
      case 'Purificateur d’air':
        return { backgroundColor: '#ecfdf5', color: '#047857' }; // Green
      case 'Signalisation':
        return { backgroundColor: '#fef3c7', color: '#b45309' }; // Amber
      case 'Éclairage de secours':
        return { backgroundColor: '#fff1f2', color: '#e11d48' }; // Rose
      case 'Systèmes hydrants':
        return { backgroundColor: '#e0f2fe', color: '#2563eb' }; // Dark Blue
      case 'Détecteur de fumée':
        return { backgroundColor: '#ffedd5', color: '#ea580c' }; // Orange
      case 'Détection incendie (SSI)':
        return { backgroundColor: '#f3e8ff', color: '#7e22ce' }; // Violet
      case 'Désenfumage':
        return { backgroundColor: '#f1f5f9', color: '#334155' }; // Slate
      default:
        return { backgroundColor: '#f8fafc', color: '#64748b' };
    }
  };

  // Color mappings for Tournée
  const getTourneeBadgeClass = (tour: string) => {
    switch(tour) {
      case 'Nord': return 'bg-blue-100 text-blue-800';
      case 'Sud': return 'bg-orange-100 text-orange-800';
      case 'Est': return 'bg-purple-100 text-purple-800';
      case 'Ouest': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: 'rgb(80 97 122)',
    cursor: 'default',
    whiteSpace: 'nowrap',
    position: 'relative',
    top: 0,
    backgroundColor: '#ffffff',
    zIndex: 10,
    borderTop: '0px solid transparent',
    borderBottom: '0px solid transparent',
  };

  const searchInputStyle: React.CSSProperties = {
    border: '1px solid #dedede',
    borderRadius: '13px',
    padding: '9px 19px',
    fontSize: '18px',
    fontWeight: '100',
    color: '#000000',
    backgroundColor: '#ffffff',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    outline: (isSearchHovered || isSearchFocused) ? '2.5px solid #2e54ff' : 'none',
    outlineOffset: (isSearchHovered || isSearchFocused) ? '2px' : '0px',
    transition: 'all 0s',
    width: '100%',
    boxSizing: 'border-box',
  };

  const customButtonStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#ffffff',
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

  const rowActionButtonStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    boxShadow: 'none',
    borderRadius: '10px',
    fontSize: '16px',
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

  const rowActionButton18Style: React.CSSProperties = {
    ...rowActionButtonStyle,
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontSize: '18px',
    padding: '9px 19px',
  };

  return (
    <div className="w-full font-sans select-text pb-12" id="autres-materiels-tab-container">
      <style>{`
        #autres-materiels-tab-container tbody tr:hover,
        #autres-materiels-tab-container tbody tr:hover > td,
        #autres-materiels-tab-container tbody tr.is-row-selected,
        #autres-materiels-tab-container tbody tr.is-row-selected > td {
          background-color: rgb(245, 247, 250) !important;
        }
      `}</style>
      {!isFormOpen ? (
        <>
          {/* Top action block & Search metrics */}
          <div 
            className="bg-white space-y-4"
            style={{ borderRadius: '0px', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
              <div>
                <div 
                  className="relative inline-flex items-center p-1 bg-white select-none overflow-hidden" 
                  id="autres-materiels-nav-toggle"
                  style={{ 
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    borderRadius: '15px',
                    border: '1px solid #dadada',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <div
                    id="autres-materiels-nav-active-slider"
                    ref={(el) => {
                      if (el && !el.dataset.initialized) {
                        el.dataset.initialized = 'true';
                        const btnDefib = document.getElementById('toggle-nav-defibrillateurs-from-autres');
                        const btnAutres = document.getElementById('toggle-nav-autres-materiels-active');
                        if (btnDefib && btnAutres) {
                          el.style.transition = 'none';
                          el.style.left = `${btnDefib.offsetLeft}px`;
                          el.style.width = `${btnDefib.offsetWidth}px`;
                          void el.offsetWidth;
                          el.style.transition = 'left 0.16s cubic-bezier(0.22, 1, 0.36, 1), width 0.16s cubic-bezier(0.22, 1, 0.36, 1)';
                          requestAnimationFrame(() => {
                            el.style.left = `${btnAutres.offsetLeft}px`;
                            el.style.width = `${btnAutres.offsetWidth}px`;
                          });
                        }
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      bottom: '4px',
                      left: '4px',
                      width: 'calc(50% - 4px)',
                      borderRadius: '13px',
                      backgroundColor: '#2e54ff',
                      transition: 'left 0.16s cubic-bezier(0.22, 1, 0.36, 1), width 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
                      zIndex: 0,
                      pointerEvents: 'none',
                    }}
                    className="shadow-sm"
                  />
                  <button
                    type="button"
                    id="toggle-nav-defibrillateurs-from-autres"
                    onClick={() => {
                      const slider = document.getElementById('autres-materiels-nav-active-slider');
                      const btnDefib = document.getElementById('toggle-nav-defibrillateurs-from-autres');
                      const btnAutres = document.getElementById('toggle-nav-autres-materiels-active');
                      if (slider && btnDefib) {
                        slider.style.left = `${btnDefib.offsetLeft}px`;
                        slider.style.width = `${btnDefib.offsetWidth}px`;
                      }
                      if (btnDefib) btnDefib.style.color = '#ffffff';
                      if (btnAutres) btnAutres.style.color = '#000000';
                      setTimeout(() => {
                        setActiveTab && setActiveTab('defibrillateurs');
                      }, 150);
                    }}
                    style={{
                      fontSize: '18px',
                      borderRadius: '13px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      color: '#000000',
                      transition: 'color 0.14s ease',
                      position: 'relative',
                      zIndex: 1,
                    }}
                    className="px-4 py-1.5 font-bold text-center whitespace-nowrap"
                  >
                    {t("Défibrillateurs")}
                  </button>
                  <button
                    type="button"
                    id="toggle-nav-autres-materiels-active"
                    onClick={() => setActiveTab && setActiveTab('autres-materiels')}
                    style={{
                      fontSize: '18px',
                      borderRadius: '13px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      color: '#ffffff',
                      transition: 'color 0.14s ease',
                      position: 'relative',
                      zIndex: 1,
                    }}
                    className="px-4 py-1.5 font-bold text-center whitespace-nowrap"
                  >
                    {t("Autres Matériels")}
                  </button>
                </div>
              </div>

              {/* Both search and buttons are placed directly next to the title */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Button Aide */}
                <button
                  type="button"
                  id="btn-autres-materiels-help"
                  onClick={() => setIsHelpFaqOpen(true)}
                  style={{
                    ...customButtonStyle,
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    borderRadius: '13px',
                    fontSize: '14px',
                    padding: '4px 11px 5px 11px',
                    boxShadow: 'none',
                  }}
                >
                  Aide
                </button>

                {/* Field recherche (Search input) */}
                <div className="relative w-full sm:w-64" style={{ width: '256px', minWidth: '256px', maxWidth: '256px' }}>
                  <style>{`
                    #search-materiels-input::placeholder {
                      color: rgb(222, 222, 222) !important;
                      opacity: 1 !important;
                    }
                  `}</style>
                  <input
                    ref={searchInputRef}
                    type="text"
                    id="search-materiels-input"
                    name="defib_quick_search_materiels_no_autofill"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-form-type="other"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (onSearchChange) onSearchChange(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (searchQuery.trim()) {
                          saveRecentSearch(searchQuery);
                        }
                        setIsSearchFocused(false);
                        searchInputRef.current?.blur();
                      } else if (e.key === 'Escape') {
                        setIsSearchFocused(false);
                        searchInputRef.current?.blur();
                      }
                    }}
                    placeholder={t('Recherche rapide')}
                    className="w-full text-black placeholder:text-[rgb(222,222,222)] placeholder:font-light outline-none"
                    style={{
                      ...searchInputStyle,
                      paddingRight: searchQuery && searchQuery.length > 0 ? '36px' : searchInputStyle.paddingRight,
                    }}
                    onMouseEnter={() => setIsSearchHovered(true)}
                    onMouseLeave={() => setIsSearchHovered(false)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => {
                      if (searchQuery.trim()) {
                        saveRecentSearch(searchQuery);
                      }
                      setIsSearchFocused(false);
                    }}
                  />
                  {searchQuery && searchQuery.length > 0 && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSearchQuery('');
                        if (onSearchChange) onSearchChange('');
                      }}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        backgroundColor: 'transparent',
                        border: 'none',
                        boxShadow: 'none',
                        padding: '4px',
                        margin: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 10,
                      }}
                      title={t('Vider la recherche')}
                    >
                      <img
                        src="https://civilprom.s3.eu-north-1.amazonaws.com/close-black.svg"
                        alt=""
                        style={{ width: '22px', height: '22px', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  )}
                  {isSearchFocused && (
                    <div
                      id="search-materiels-recent-dropdown"
                      className="absolute left-0 top-full mt-1.5 bg-white z-50 py-2.5 font-sans animate-fadeIn"
                      style={{
                        width: '100%',
                        minWidth: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                        borderRadius: '13px',
                        border: '1px solid #dedede',
                        backgroundColor: '#ffffff',
                        boxShadow: 'none',
                      }}
                    >
                      <div
                        className="px-4 pb-1.5 text-left select-none"
                        style={{
                          fontSize: '18px',
                          fontWeight: 100,
                          color: '#000000',
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                        }}
                      >
                        {t('Recherche(s) récente(s):')}
                      </div>
                      {recentSearches.length === 0 ? (
                        <div
                          className="px-4 py-1 text-left select-none"
                          style={{
                            fontSize: '18px',
                            fontWeight: 100,
                            color: 'rgb(190, 202, 219)',
                            fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                          }}
                        >
                          {t('Aucune recherche récente')}
                        </div>
                      ) : (
                        recentSearches.slice(0, 5).map((item, idx) => (
                          <button
                            key={`${item}-${idx}`}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSearchQuery(item);
                              if (onSearchChange) {
                                onSearchChange(item);
                              }
                              saveRecentSearch(item);
                              setIsSearchFocused(false);
                              searchInputRef.current?.blur();
                            }}
                            className="w-full text-left px-4 py-1.5 truncate cursor-pointer border-0 bg-transparent hover:text-[#2e54ff] transition-colors"
                            style={{
                              fontSize: '18px',
                              fontWeight: 100,
                              color: '#000000',
                              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                            }}
                            title={item}
                          >
                            {item}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!resolvedSpreadsheetUrl}
                    onClick={() => {
                      if (!resolvedSpreadsheetUrl) return;
                      handleOpenNewForm();
                    }}
                    id="btn-add-materiel"
                    style={{
                      ...customButtonStyle,
                      backgroundColor: 'rgb(46 84 255)',
                      boxShadow: 'none',
                      opacity: !resolvedSpreadsheetUrl ? 0.45 : 1,
                      cursor: !resolvedSpreadsheetUrl ? 'not-allowed' : 'pointer',
                    }}
                    title={!resolvedSpreadsheetUrl ? "Veuillez renseigner l'URL du Spreadsheet Autres Matériels dans les paramètres du tenant." : undefined}
                  >
                    Nouveau
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Filters Pills Row */}
          <div 
            className="flex flex-wrap items-center gap-2.5 justify-start" 
            id="autres-materiels-category-pills"
            style={{ maxWidth: '98%', margin: '0 auto', marginTop: '14px', padding: '0px' }}
          >
            {(['Tous', 'Extincteur', "Boucle d'induction magnétique portable (BIMP)", 'Purificateur d’air', 'Signalisation', 'Éclairage de secours', 'Systèmes hydrants', 'Détecteur de fumée', 'Détection incendie (SSI)', 'Désenfumage'] as const).map((filterOpt) => {
              let count = 0;
              if (filterOpt === 'Tous') {
                count = otherEquipments.length;
              } else {
                count = otherEquipments.filter(s => s.categorie === filterOpt).length;
              }
              
              const isActive = categoryFilter === filterOpt;
              return (
                <button
                  key={filterOpt}
                  type="button"
                  onClick={() => {
                    triggerPillWave(`cat-${filterOpt}`);
                    setCategoryFilter(filterOpt);
                  }}
                  style={{
                    borderRadius: '1000px',
                    padding: '8px 16px',
                    fontSize: '18px',
                    fontWeight: 100,
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    backgroundColor: isActive ? '#2e54ff' : 'rgb(232 236 255)',
                    color: isActive ? '#ffffff' : '#2e54ff',
                    border: 'none',
                    boxShadow: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  className={`relative overflow-hidden transition-all select-none ${clickedPill?.id === `cat-${filterOpt}` ? 'sidebar-nav-click-shrink-wave' : ''}`}
                >
                  {filterOpt} ({count})
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                triggerPillWave('recent');
                setSortFilter(prev => prev === 'recent' ? null : 'recent');
              }}
              style={{
                borderRadius: '1000px',
                padding: '8px 16px',
                fontSize: '18px',
                fontWeight: 100,
                cursor: 'pointer',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                backgroundColor: sortFilter === 'recent' ? 'rgb(142 25 92)' : 'rgb(255 217 239)',
                color: sortFilter === 'recent' ? '#fff' : 'rgb(142 25 92)',
                border: 'none',
                boxShadow: 'none',
                transition: 'all 0.15s ease'
              }}
              className={`relative overflow-hidden transition-all select-none ${clickedPill?.id === 'recent' ? 'sidebar-nav-click-shrink-wave' : ''}`}
            >
              {t("Récemment")}
            </button>

            <button
              type="button"
              id="btn-filter-pro-main-urgente-autres"
              onClick={() => {
                triggerPillWave('closest_maintenance');
                setSortFilter(prev => prev === 'closest_maintenance' ? null : 'closest_maintenance');
              }}
              style={{
                borderRadius: '1000px',
                padding: '8px 16px',
                fontSize: '18px',
                fontWeight: 100,
                cursor: 'pointer',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                backgroundColor: sortFilter === 'closest_maintenance' ? '#e21d1d' : 'rgb(255 219 219)',
                color: sortFilter === 'closest_maintenance' ? '#fff' : 'rgb(210 55 32)',
                border: 'none',
                boxShadow: 'none',
                transition: 'all 0.15s ease'
              }}
              className={`relative overflow-hidden transition-all select-none ${clickedPill?.id === 'closest_maintenance' ? 'sidebar-nav-click-shrink-wave' : ''}`}
            >
              {t("Pro.Main. Urgente")}
            </button>

            {/* Filter: Indicatif postal court */}
            {selectedDepartment ? (
              <button
                type="button"
                id="filter-postal-court-select-autres"
                onClick={() => {
                  triggerPillWave('postal');
                  setSelectedDepartment(null);
                }}
                style={{
                  borderRadius: '1000px',
                  padding: '8px 16px',
                  fontSize: '18px',
                  fontWeight: 100,
                  cursor: 'pointer',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  backgroundColor: '#591690',
                  color: '#fff',
                  border: 'none',
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
                className={`relative overflow-hidden transition-all select-none ${clickedPill?.id === 'postal' ? 'sidebar-nav-click-shrink-wave' : ''}`}
                title={`${t("Indicatif Postal")} (${selectedDepartment})`}
              >
                {`${t("Indicatif Postal")} (${selectedDepartment})`}
              </button>
            ) : (
              <div
                className={`relative inline-block overflow-hidden rounded-full ${clickedPill?.id === 'postal' ? 'sidebar-nav-click-shrink-wave' : ''}`}
              >
                <style>{`
                  #filter-postal-court-select-autres {
                    appearance: none !important;
                    -webkit-appearance: none !important;
                    -moz-appearance: none !important;
                    background-image: none !important;
                  }
                  #filter-postal-court-select-autres::-ms-expand {
                    display: none !important;
                  }
                `}</style>
                <select
                  id="filter-postal-court-select-autres"
                  value=""
                  onMouseDown={() => triggerPillWave('postal')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && val !== '__ALL__') {
                      setSelectedDepartment(val);
                    }
                  }}
                  style={{
                    borderRadius: '1000px',
                    padding: '8px 16px',
                    fontSize: '18px',
                    fontWeight: 100,
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    backgroundColor: 'rgb(230 197 255)',
                    color: '#591690',
                    border: 'none',
                    boxShadow: 'none',
                    outline: 'none',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    backgroundImage: 'none',
                    textAlign: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  className="transition-all select-none"
                  title={t("Indicatif Postal")}
                >
                  <option value="" disabled style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>
                    {t("Indicatif Postal")}
                  </option>
                  {FRENCH_DEPARTMENTS.map((dept) => (
                    <option
                      key={dept}
                      value={dept}
                      style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
                    >
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              id="btn-refresh-data-autres-materiels"
              onClick={() => {
                triggerPillWave('refresh-autres');
                handleRefreshClick();
              }}
              disabled={effectiveRefreshing}
              style={{
                borderRadius: '1000px',
                padding: '8px 16px',
                fontSize: '18px',
                fontWeight: 100,
                cursor: 'pointer',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                backgroundColor: 'rgb(192 248 252)',
                color: 'rgb(5 112 114)',
                border: 'none',
                boxShadow: 'none',
                transition: 'all 0.15s ease'
              }}
              className={`relative overflow-hidden hover:opacity-80 transition-all select-none cursor-pointer ${clickedPill?.id === 'refresh-autres' ? 'sidebar-nav-click-shrink-wave' : ''}`}
              title={t("Actualiser les données")}
            >
              {effectiveRefreshing ? t("Actualisation...") : t("Actualiser les données")}
            </button>

            {/* 3-dots Native System Dropdown */}
            <div
              className="relative inline-flex items-center justify-center cursor-pointer transition-opacity hover:opacity-80"
              style={{
                background: '#f5f7fa',
                borderRadius: '100px',
                padding: '12px'
              }}
              title={t("Plus")}
            >
              <img
                src="https://civilprom.s3.eu-north-1.amazonaws.com/3dotsgris.svg"
                alt={t("Plus")}
                style={{ width: '18px', height: '18px' }}
                className="w-[18px] h-[18px] object-contain shrink-0 pointer-events-none"
                referrerPolicy="no-referrer"
              />
              <select
                id="autres-materiels-more-options-dropdown"
                aria-label={t("Plus")}
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'toggle-fit-view') {
                    toggleTableFitView();
                  } else if (val === 'spreadsheet-editor') {
                    handleOpenSpreadsheetEditor();
                  } else if (val === 'open-map') {
                    setIsMapOpen(true);
                  } else if (val === 'export-all-main-oui') {
                    handleExportAllMainOuiCsv();
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              >
                <option value="" disabled>
                  —
                </option>
                <option value="toggle-fit-view">
                  {isTableFitView ? t("Retourner l’affichage standard") : t("Minimiser et ajuster l’affichage")}
                </option>
                <option value="spreadsheet-editor" disabled={!resolvedSpreadsheetUrl}>
                  {t("Ouvrir l'éditeur SpreadSheets")}
                </option>
                <option value="open-map">
                  {t("Consulter la cartographie")}
                </option>
                <option value="export-all-main-oui">
                  {t("Exporter Tous Main. Oui")}
                </option>
              </select>
            </div>
          </div>

          {/* Dynamic bulk Action Bar at the top of the table if at least one record checked */}
          {selectedIds.length > 0 && (
            <div 
              className="p-4 flex items-center justify-between gap-4 animate-fadeIn" 
              id="bulk-actions-status-bar"
              style={{
                backgroundColor: 'rgb(245, 247, 250)',
                border: 'none',
                borderRadius: '16px',
                maxWidth: '98%',
                margin: '16px auto',
              }}
            >
              <div className="flex items-center gap-2">
                <span 
                  className="rounded-full inline-flex items-center justify-center font-bold font-sans shrink-0"
                  style={{
                    backgroundColor: 'rgb(61, 220, 132)',
                    color: 'rgb(21, 99, 55)',
                    fontSize: '18px',
                    height: '35px',
                    width: '35px',
                    lineHeight: 1,
                    padding: 0,
                    margin: 0,
                    textAlign: 'center',
                    textBoxTrim: 'trim-both' as any,
                    textBoxEdge: 'cap alphabetic' as any,
                    cursor: 'default',
                  }}
                >
                  {selectedIds.length}
                </span>
                <span 
                  className="font-sans"
                  style={{ fontSize: '18px', color: '#000000', fontWeight: '100', cursor: 'default' }}
                >
                  Sélectionné(s)
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePinSelected}
                  id="btn-bulk-pin-autres-materiels"
                  style={rowActionButton18Style}
                  className="cursor-pointer"
                >
                  Dés/Épingler
                </button>

                {/* Action Tournee Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    disabled={!hasFsmSpreadsheet}
                    onClick={() => {
                      if (!hasFsmSpreadsheet) return;
                      if (!isTourDropdownOpen) {
                        window.dispatchEvent(
                          new CustomEvent('defib-manual-refresh-spreadsheet', {
                            detail: { tabType: 'tournees' },
                          })
                        );
                      }
                      setIsTourDropdownOpen(!isTourDropdownOpen);
                    }}
                    style={{
                      ...rowActionButton18Style,
                      opacity: !hasFsmSpreadsheet ? 0.45 : 1,
                      cursor: !hasFsmSpreadsheet ? 'not-allowed' : 'pointer',
                    }}
                    className={!hasFsmSpreadsheet ? 'cursor-not-allowed' : 'cursor-pointer'}
                    title={!hasFsmSpreadsheet ? "Veuillez renseigner l'URL du Spreadsheet Tournées & Missions dans les paramètres du tenant." : undefined}
                  >
                    <span>Tournée</span>
                  </button>
                  {isTourDropdownOpen && hasFsmSpreadsheet && (
                    <div 
                      className="absolute right-0 mt-1 w-72 bg-white rounded-lg z-50 py-2.5 font-sans animate-fadeIn text-left"
                      style={{ 
                        fontSize: '18px',
                        border: '1px solid rgb(218 218 218)',
                        boxShadow: 'none',
                        color: '#000000',
                      }}
                    >
                      <div className="px-3 pb-2 bg-transparent text-center flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={!hasFsmSpreadsheet}
                          onClick={() => {
                            if (!hasFsmSpreadsheet) return;
                            executeNouvelleTournee();
                          }}
                          style={{
                            ...rowActionButton18Style,
                            width: '100%',
                            opacity: !hasFsmSpreadsheet ? 0.45 : 1,
                            cursor: !hasFsmSpreadsheet ? 'not-allowed' : 'pointer',
                          }}
                          className="w-full text-center transition-colors cursor-pointer"
                        >
                          Nouvelle Tournée
                        </button>

                        <button
                          type="button"
                          disabled={!hasFsmSpreadsheet}
                          onClick={() => {
                            if (!hasFsmSpreadsheet) return;
                            executeAddToTrier();
                          }}
                          style={{
                            ...rowActionButton18Style,
                            width: '100%',
                            backgroundColor: '#0f172a',
                            borderColor: '#000000',
                            color: '#ffffff',
                            opacity: !hasFsmSpreadsheet ? 0.45 : 1,
                            cursor: !hasFsmSpreadsheet ? 'not-allowed' : 'pointer',
                          }}
                          className="w-full text-center transition-colors cursor-pointer hover:opacity-90"
                        >
                          À trier
                        </button>
                      </div>

                      {selectedDraftId && (
                        <div className="px-3 pb-2 bg-transparent text-center">
                          <button
                            type="button"
                            onClick={() => {
                              executeAddTournee(selectedDraftId);
                            }}
                            style={{
                              ...rowActionButton18Style,
                              width: '100%',
                              boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, #2e54ff 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                              background: '#2e54ff'
                            }}
                            className="w-full text-center transition-colors cursor-pointer"
                          >
                            Confirmer l'action
                          </button>
                        </div>
                      )}
                      
                      {(() => {
                        const drafts = (fsmTours || []).filter(
                          t => t && t.id !== 'a-trier' && (!t.status || !['À faire', 'En cours', 'Effectué', 'Terminé'].includes(t.status))
                        );
                        if (drafts.length === 0) {
                          return (
                            <div className="px-4 py-2 text-black font-sans text-center font-normal" style={{ fontSize: '15px' }}>
                              Aucune tournée en brouillon
                            </div>
                          );
                        }
                        return drafts.map(t => {
                          const isSelected = selectedDraftId === t.id;
                          const tourTitle = t.title || t.name || t.tourIdentifiant || 'Nouvelle Tournée';
                          const displayTitle = tourTitle.length > 25 ? tourTitle.substring(0, 25) + '(...)' : tourTitle;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setSelectedDraftId(isSelected ? null : t.id);
                              }}
                              className="w-full text-left px-4 py-2 font-semibold truncate cursor-pointer border-0 bg-transparent hover:bg-transparent"
                              style={{ 
                                fontSize: '16px',
                                color: isSelected ? '#2e54ff' : '#000000',
                                textDecoration: isSelected ? 'underline' : 'none'
                              }}
                            >
                              {displayTitle}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCleanSelectedFromTours}
                  disabled={!canCleanSelectedFromTours}
                  id="btn-clean-tours-autres-materiels"
                  style={{
                    ...rowActionButton18Style,
                    opacity: !canCleanSelectedFromTours ? 0.45 : 1,
                    cursor: !canCleanSelectedFromTours ? 'not-allowed' : 'pointer',
                  }}
                  title={
                    !canCleanSelectedFromTours
                      ? "Action impossible : chaque matériel sélectionné doit être présent dans une tournée ayant impérativement le statut « Terminé »."
                      : "Supprimer le(s) matériel(s) sélectionné(s) des tournées terminées"
                  }
                  className={!canCleanSelectedFromTours ? 'cursor-not-allowed select-none' : 'cursor-pointer select-none'}
                >
                  Nettoyer des tournées
                </button>
              </div>
            </div>
          )}

          {/* Main Table Records Sheet */}
          <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
            <div 
              ref={bottomScrollRef}
              className={isTableFitView ? "overflow-x-hidden" : "overflow-x-auto"}
              style={isTableFitView ? { width: '100%', overflowX: 'hidden' } : undefined}
            >
              {isInitialView && filteredList.length === 0 ? (
                <div className="p-16 text-center font-sans lg:py-24">
                  <img
                    src="https://civilprom.s3.eu-north-1.amazonaws.com/illustration_nodatadefibeo.svg"
                    alt=""
                    className="mx-auto mb-4 block select-none pointer-events-none"
                    style={{ width: '200px', height: 'auto' }}
                    referrerPolicy="no-referrer"
                  />
                  <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
                    {t("Recherchez un/des matériel(s) pour le/les afficher.")}
                  </p>
                  <p style={{ color: '#000000', fontSize: '14px', fontWeight: 100, marginTop: '6px' }}>
                    {`Vous avez ${otherEquipments.length} autres matériel(s) sur Defibeo.`}
                  </p>
                </div>
              ) : filteredList.length === 0 ? (
                <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
              ) : (
              <table 
                className="w-full text-left font-sans border-collapse text-xs" 
                style={{ 
                  borderTop: '0px solid transparent', 
                  borderBottom: '0px solid transparent',
                  ...(isTableFitView ? {
                    zoom: tableFitScale,
                    width: `${naturalTableWidthRef.current || 1500}px`,
                    minWidth: `${naturalTableWidthRef.current || 1500}px`,
                    transition: 'zoom 0.15s ease'
                  } : {
                    width: '100%'
                  })
                }}
              >
                <thead>
                  <tr className="bg-transparent" style={{ borderTop: '0px solid transparent', borderBottom: '0px solid transparent' }}>
                    <th className="px-4 py-3.5 w-12 text-center select-none" style={{ cursor: 'default', position: 'relative', top: 0, backgroundColor: '#ffffff', zIndex: 10, borderTop: '0px solid transparent', borderBottom: '0px solid transparent' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const isAllSelected = filteredList.length > 0 && selectedIds.length === filteredList.length;
                          if (isAllSelected) {
                            setSelectedIds([]);
                          } else {
                            setSelectedIds(filteredList.map(item => item.id));
                          }
                        }}
                        id="select-all-radio-checkbox"
                        className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center focus:outline-hidden focus:ring-2 focus:ring-[#2e54ff]/20 cursor-pointer mx-auto ${
                          (filteredList.length > 0 && selectedIds.length === filteredList.length)
                            ? 'bg-transparent'
                            : 'bg-white hover:border-[#2e54ff]'
                        }`}
                        style={{
                          borderWidth: '1px',
                          borderColor: (filteredList.length > 0 && selectedIds.length === filteredList.length)
                            ? '#2e54ff'
                            : 'oklch(0.92 0.01 258.78)',
                        }}
                        role="checkbox"
                        aria-checked={filteredList.length > 0 && selectedIds.length === filteredList.length}
                      >
                        {(filteredList.length > 0 && selectedIds.length === filteredList.length) && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#2e54ff] transition-all scale-100" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Catégorie.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Identifiant.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Client.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Localisation.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Expir. garantie.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Pro. visite.</th>
                    <th className="px-4 py-3.5 text-center whitespace-nowrap" style={thStyle}>Tournée.</th>
                    <th className="px-4 py-3.5 text-right w-12 whitespace-nowrap" style={thStyle}>Actions.</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 text-xs">
                  {(
                    filteredList.map((item, rowIdx) => {
                      const clientData = getLinkedClientForItem(item);
                      const isRowChecked = selectedIds.includes(item.id);
                      const isPinned = pinnedOtherIds.includes(item.id);

                      const activeAlerts: any[] = [];
                      const seenVarIds = new Set<string>();
                      const candidateRefs = [
                        (item as any).modeleId,
                        (item as any).modele,
                        (item as any).variableId,
                        item.specifiques?.modeleFiltre,
                        item.specifiques?.typeFiltre,
                        item.specifiques?.pieceFiltreDerniereMaintenance,
                        item.specifiques?.autrePieceConsommableDerniereMaintenance,
                        ...(item.specifiques ? Object.values(item.specifiques).filter(v => typeof v === 'string') : [])
                      ].filter(Boolean);

                      candidateRefs.forEach(refVal => {
                        const trimmed = String(refVal).trim();
                        if (!trimmed) return;
                        const lower = trimmed.toLowerCase();
                        const v = (variables || []).find(
                          x =>
                            x &&
                            (x.id === trimmed ||
                              (x.identifiant && x.identifiant.trim().toLowerCase() === lower) ||
                              (x.nom && x.nom.trim().toLowerCase() === lower))
                        );
                        if (v && v.rappelAlerteOption && !seenVarIds.has(v.id)) {
                          seenVarIds.add(v.id);
                          activeAlerts.push({
                            option: v.rappelAlerteOption,
                            desc: v.rappelObservation || '',
                            debut: v.rappelDateDebut,
                            fin: v.rappelDateFin
                          });
                        }
                      });

                      return (
                        <tr 
                          key={`${item.id}_${rowIdx}`} 
                          onClick={() => {
                            if (searchQuery.trim()) {
                              saveRecentSearch(searchQuery);
                            }
                            handleOpenEditForm(item);
                          }}
                          className={`group hover:bg-[rgb(245,247,250)] transition-all cursor-pointer ${
                            isRowChecked ? 'bg-[rgb(245,247,250)] is-row-selected' : ''
                          }`}
                          style={{
                            ...(isPinned ? { boxShadow: 'inset 3px 0 0 0 #2e54ff' } : {}),
                            ...(isRowChecked ? { backgroundColor: 'rgb(245, 247, 250)' } : {}),
                          }}
                        >
                          {/* Checkbox column */}
                          <td className="px-4 py-5 text-center relative" onClick={(e) => e.stopPropagation()}>
                            {isPinned && (
                              <div 
                                className="absolute left-0 top-0 bottom-0 pointer-events-none" 
                                style={{ width: '3px', backgroundColor: '#2e54ff', zIndex: 2 }} 
                              />
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleSelectRow(item.id, e)}
                              id={`radio-checkbox-row-${item.id}`}
                              className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center focus:outline-hidden focus:ring-2 focus:ring-[#2e54ff]/20 cursor-pointer mx-auto ${
                                isRowChecked
                                  ? 'bg-transparent'
                                  : 'bg-white hover:border-[#2e54ff]'
                              }`}
                              style={{
                                borderWidth: '1px',
                                borderColor: isRowChecked ? '#2e54ff' : 'oklch(0.92 0.01 258.78)',
                              }}
                              role="checkbox"
                              aria-checked={isRowChecked}
                            >
                              {isRowChecked && (
                                <span className="w-2.5 h-2.5 rounded-full bg-[#2e54ff] transition-all scale-100" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            <div className="flex flex-col items-start gap-1">
                              <span 
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '1000px',
                                  backgroundColor: '#ffffff',
                                  border: '1px solid oklch(0.92 0.01 258.78)',
                                  color: '#000000',
                                  fontSize: '16px',
                                  fontWeight: 100,
                                  padding: '4px 12px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <span 
                                  className="w-2 h-2 rounded-full mr-2 shrink-0" 
                                  style={{ backgroundColor: getMaintenanceDotColor(item.prochaineMaintenance) }}
                                />
                                {item.categorie}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-5 select-all whitespace-nowrap font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{item.identifiant || '—'}</span>
                              {activeAlerts.map((a, idx) => {
                                const text = a.option.split(' — ')[0];
                                return (
                                  <span 
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0 select-none"
                                    style={{ backgroundColor: 'rgb(210, 45, 11)', color: '#fff', fontSize: '10px' }}
                                    title={`${a.option}${a.debut ? ` (du ${a.debut}${a.fin ? ` au ${a.fin}` : ''})` : ''}${a.desc ? ` : ${a.desc}` : ''}`}
                                  >
                                    Alerte/Rappel : {text}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {clientData ? clientData.denomination : (item.clientId || item.nomPrenomSite || '')}
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {item.ville}{item.codePostal ? ` (${item.codePostal})` : ''}
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {item.expirationGarantie || '—'}
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {item.prochaineMaintenance || '—'}
                          </td>
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {(() => {
                              const matchingTour = (fsmTours || []).find(t => 
                                t.missions?.some((m: any) => m.defibIdentifiant === item.identifiant)
                              );
                              if (matchingTour) {
                                return (
                                  <span 
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '1000px',
                                      backgroundColor: '#ffffff',
                                      border: '1px solid oklch(0.92 0.01 258.78)',
                                      color: '#000000',
                                      fontSize: '16px',
                                      fontWeight: 100,
                                      padding: '4px 12px',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {matchingTour.title || 'Tournée'}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </td>
                          <td className="px-4 py-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (onShowGmaoReports) {
                                    onShowGmaoReports(item.identifiant || '');
                                  } else if (setActiveTab) {
                                    setActiveTab('gmao');
                                  }
                                }}
                                style={rowActionButton18Style}
                                className="transition-colors cursor-pointer"
                              >
                                {t("Historique")}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (searchQuery.trim()) {
                                    saveRecentSearch(searchQuery);
                                  }
                                  handleOpenEditForm(item);
                                }}
                                style={{ ...rowActionButton18Style, backgroundColor: 'rgb(46, 84, 255)' }}
                                className="transition-colors cursor-pointer"
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleDeleteItem(item.id);
                                }}
                                style={{ ...rowActionButton18Style, backgroundColor: 'rgb(210, 45, 11)' }}
                                className="transition-colors cursor-pointer"
                              >
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              )}
            </div>
            
          </div>

          <div style={{ fontSize: '18px', color: '#000000', fontWeight: 'bold', cursor: 'default' }} className="p-4 font-sans text-left" id="autres-materiels-total-summary">
            Total matériels (Tous): {otherEquipments.length}.
          </div>
        </>
      ) : (
        /* FORM VIEW */
        <div className="w-full max-w-[1000px] space-y-6 font-sans animate-fadeIn mx-auto" id="materiel-form-overlay">
          {/* Header */}
          <div 
            className="flex items-center bg-white"
            style={{ borderRadius: '0px', width: '98%', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
            id="materiel-form-header-box"
          >
            <div className="grid grid-cols-3 items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                id="btn-close-materiel-modal"
                style={{
                  ...rowActionButton18Style,
                  backgroundColor: 'rgb(210, 45, 11)',
                  width: '100%',
                }}
                className="w-full transition-colors cursor-pointer"
              >
                <span>Fermer</span>
              </button>

              <button
                type="button"
                disabled={!editingItem}
                onClick={() => {
                  if (!editingItem) return;
                  const targetIdentifiant = identifiant || editingItem?.identifiant || '';
                  setIsFormOpen(false);
                  if (onShowGmaoReports) {
                    onShowGmaoReports(targetIdentifiant);
                  } else {
                    setActiveTab('gmao');
                  }
                }}
                id="btn-history-materiel-modal"
                style={{
                  ...rowActionButton18Style,
                  width: '100%',
                  opacity: !editingItem ? 0.5 : 1,
                  cursor: !editingItem ? 'not-allowed' : 'pointer',
                }}
                className="w-full transition-colors"
              >
                <span>Historique</span>
              </button>

              <button
                type="submit"
                form="materiel-core-form"
                id="btn-submit-materiel-form"
                style={{
                  ...rowActionButton18Style,
                  width: '100%',
                  backgroundColor: 'rgb(46, 84, 255)',
                  color: '#ffffff',
                  boxShadow: 'none'
                }}
                className="w-full transition-all cursor-pointer border-0"
              >
                Enregistrer
              </button>
            </div>
          </div>

          <div
            className="w-full animate-fadeIn mt-6"
            style={{ marginTop: '24px' }}
            id="materiel-form-box"
          >
            <style>{`
              #materiel-core-form input:not([type="radio"]):not([type="checkbox"]),
              #materiel-core-form select,
              #materiel-core-form textarea {
                padding: 12px !important;
                border: 1px solid #DCE1EA !important;
                border-radius: 13px !important;
                font-size: 16px !important;
                font-weight: 100 !important;
                background: #ffffff !important;
                color: #000000 !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                box-sizing: border-box !important;
                outline: none !important;
                transition: all 0s !important;
                width: 100% !important;
              }
              #materiel-core-form input:not([type="radio"]):not([type="checkbox"]):hover,
              #materiel-core-form input:not([type="radio"]):not([type="checkbox"]):focus,
              #materiel-core-form select:hover,
              #materiel-core-form select:focus,
              #materiel-core-form textarea:hover,
              #materiel-core-form textarea:focus {
                outline: 2.5px solid #2e54ff !important;
                outline-offset: 2px !important;
                transition: all 0s !important;
              }
              #materiel-core-form input:not([type="radio"]):not([type="checkbox"])::placeholder,
              #materiel-core-form textarea::placeholder,
              #materiel-core-form input:not([type="radio"]):not([type="checkbox"])::-webkit-input-placeholder,
              #materiel-core-form textarea::-webkit-input-placeholder {
                color: #BECADB !important;
                opacity: 1 !important;
                font-weight: 100 !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
              }
              #materiel-core-form input:disabled,
              #materiel-core-form select:disabled,
              #materiel-core-form textarea:disabled {
                color: #000000 !important;
                -webkit-text-fill-color: #000000 !important;
                background-color: #f1f5f9 !important;
                opacity: 0.95 !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                cursor: not-allowed !important;
              }
              #materiel-core-form input:disabled:hover,
              #materiel-core-form input:disabled:focus,
              #materiel-core-form select:disabled:hover,
              #materiel-core-form select:disabled:focus,
              #materiel-core-form textarea:disabled:hover,
              #materiel-core-form textarea:disabled:focus {
                outline: none !important;
              }
              #materiel-core-form select {
                appearance: none !important;
                -webkit-appearance: none !important;
                -moz-appearance: none !important;
                background-image: none !important;
              }
              #materiel-core-form select option {
                color: #000000 !important;
                background: #ffffff !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
              }
              #materiel-core-form input[type="date"]::-webkit-calendar-picker-indicator,
              .no-clock-icon::-webkit-calendar-picker-indicator {
                display: none !important;
                -webkit-appearance: none !important;
                background: none !important;
                width: 0 !important;
                height: 0 !important;
              }
              #materiel-core-form label,
              #materiel-core-form .section-title-label,
              #materiel-core-form span.block.uppercase {
                letter-spacing: normal !important;
                text-transform: none !important;
                font-size: 16px !important;
                color: #000000 !important;
                font-weight: 600 !important;
              }
            `}</style>
            
            <form onSubmit={handleFormSubmit} id="materiel-core-form">
              <div className="space-y-0" style={{ width: '98%', maxWidth: '98%', margin: 'auto' }}>
              
              {/* SECTION 1 - CATÉGORIE ET IDENTIFIANT */}
              <div 
                className="p-5 relative space-y-3"
                style={{
                  backgroundColor: 'rgb(245, 247, 250)',
                  border: 'none',
                  borderRadius: '18px 18px 0px 0px',
                }}
              >
                <div className="mb-2 bg-transparent">
                  <span 
                    className="inline-block font-sans"
                    style={{
                      backgroundColor: 'rgb(61, 220, 132)',
                      color: 'rgb(17, 88, 48)',
                      fontSize: '18px',
                      borderRadius: '1000px',
                      padding: '7px 15px',
                      cursor: 'default',
                      fontWeight: 100,
                      textTransform: 'none',
                    }}
                  >
                    1 — Catégorie et identifiant
                  </span>
                </div>

                {identifiant && (
                  <div className="mb-4" style={{ backgroundColor: 'rgb(245, 247, 250)' }}>
                    <Code39Barcode value={identifiant} />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Sélection de Catégorie */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Sélection d'une catégorie *</label>
                    <select 
                      value={categorie} 
                      onChange={(e) => {
                        setCategorie(e.target.value);
                        setSpecifiques({}); // Reset fields on category switch
                      }}
                    >
                      <option value="Extincteur">Extincteur</option>
                      <option value="Boucle d'induction magnétique portable (BIMP)">Boucle d'induction magnétique portable (BIMP)</option>
                      <option value="Purificateur d’air">Purificateur d’air</option>
                      <option value="Signalisation">Signalisation</option>
                      <option value="Éclairage de secours">Éclairage de secours</option>
                      <option value="Systèmes hydrants">Systèmes hydrants</option>
                      <option value="Détecteur de fumée">Détecteur de fumée</option>
                      <option value="Détection incendie (SSI)">Détection incendie (SSI)</option>
                      <option value="Désenfumage">Désenfumage</option>
                    </select>
                  </div>

                  {/* Identifiant */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Identifiant unique.</label>
                    <div className="flex gap-2 items-center">
                      <input 
                        type="text" 
                        value={identifiant} 
                        readOnly 
                        className="bg-slate-50 border border-[#DCE1EA] text-slate-600 font-mono font-semibold cursor-not-allowed flex-1 rounded p-2 focus:outline-none"
                        style={{
                          fontSize: '15.5px'
                        }}
                      />
                      {!editingItem && (
                        <button
                          type="button"
                          onClick={reRollIdentifiant}
                          title="Générer un code aléatoire libre"
                          style={rowActionButton18Style}
                          className="shrink-0 font-sans"
                        >
                          Générer
                        </button>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* SECTION 2 - CLIENT */}
              <div 
                className="p-5 relative space-y-3"
                style={{
                  backgroundColor: 'rgb(245, 247, 250)',
                  border: 'none',
                  borderRadius: '0px',
                }}
              >
                <div className="mb-2 bg-transparent">
                  <span 
                    className="inline-block font-sans"
                    style={{
                      backgroundColor: 'rgb(61, 220, 132)',
                      color: 'rgb(17, 88, 48)',
                      fontSize: '18px',
                      borderRadius: '1000px',
                      padding: '7px 15px',
                      cursor: 'default',
                      fontWeight: 100,
                      textTransform: 'none',
                    }}
                  >
                    2 — Client
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Client Select Dropdown */}
                  <div className="space-y-1 relative" id="client-select-lookup-container">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase">Sélection du client.</label>
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
                      value={clientId}
                      onChange={(e) => handleClientSelect(e.target.value)}
                    >
                      <option value="">Sélectionnez un client...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.denomination}{c.clientIdField ? ` (${c.clientIdField})` : c.siret ? ` (${c.siret})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Nom et prenom */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Contact.</label>
                    <input
                      type="text"
                      value={nomPrenomSite}
                      onChange={(e) => setNomPrenomSite(e.target.value)}
                      placeholder="Entrez un nom et prénom."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Telephone portable */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Téléphone du contact.</label>
                    <input
                      type="text"
                      value={telephoneSite}
                      onChange={(e) => setTelephoneSite(e.target.value)}
                      placeholder="Entrez un numéro."
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Email du contact.</label>
                    <input
                      type="email"
                      value={emailSite}
                      onChange={(e) => setEmailSite(e.target.value)}
                      placeholder="Entrez un email."
                    />
                  </div>
                </div>

                {/* Titre du contrat (Full Width) */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase">Titre du contrat.</label>
                  <input
                    type="text"
                    value={nomContrat}
                    placeholder="Automatique à la sélection"
                    disabled
                    className="bg-slate-100 text-slate-500 cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Contrat en cours */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Contrat en cours.</label>
                    <input
                      type="text"
                      value={contrat}
                      disabled
                      className="bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                  </div>

                  {/* Payeur ID */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Payeur ID</label>
                    <input
                      type="text"
                      value={payeurId}
                      disabled
                      placeholder="Payeur ID"
                      className="bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                  </div>

                  {/* Client ID */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Client ID</label>
                    <input
                      type="text"
                      value={clientIdField}
                      disabled
                      placeholder="Client ID"
                      className="bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Reference contrat */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Référence du contrat.</label>
                    <input
                      type="text"
                      value={referenceContrat}
                      placeholder="Automatique à la sélection"
                      disabled
                      className="bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                  </div>

                  {/* Début contrat */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Début du contrat.</label>
                    <input
                      type="date"
                      value={debutContrat}
                      disabled
                      className="bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                  </div>

                  {/* Fin contrat */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Expiration du contrat.</label>
                    <input
                      type="date"
                      value={finContrat}
                      disabled
                      className="bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>

              </div>

              {/* SECTION 3 - LOCALISATION */}
              <div 
                className="p-5 relative space-y-3"
                style={{
                  backgroundColor: 'rgb(245, 247, 250)',
                  border: 'none',
                  borderRadius: '0px',
                }}
              >
                <div className="mb-2 bg-transparent">
                  <span 
                    className="inline-block font-sans"
                    style={{
                      backgroundColor: 'rgb(61, 220, 132)',
                      color: 'rgb(17, 88, 48)',
                      fontSize: '18px',
                      borderRadius: '1000px',
                      padding: '7px 15px',
                      cursor: 'default',
                      fontWeight: 100,
                      textTransform: 'none',
                    }}
                  >
                    3 — Localisation
                  </span>
                </div>

                {(() => {
                  const normalizeAddr = (val?: string | null) =>
                    String(val || '')
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, ' ')
                      .trim();

                  const normVoie = normalizeAddr(numeroVoie);
                  const normCp = normalizeAddr(codePostal);
                  const normVille = normalizeAddr(ville);
                  const currentId = String(editingItem?.id || '').trim().toLowerCase();
                  const currentIdentifiant = String(editingItem?.identifiant || identifiant || '').trim().toLowerCase();

                  let otherDefibsCount = 0;
                  let otherMaterielsCount = 0;

                  if (normVoie) {
                    for (const df of (defibrillateurs || [])) {
                      if (!df) continue;
                      const dfVoie = normalizeAddr((df as any).numeroVoie || df.numVoie || '');
                      if (!dfVoie || dfVoie !== normVoie) continue;
                      const dfCp = normalizeAddr((df as any).codePostal || df.cp || '');
                      const dfVille = normalizeAddr(df.ville || '');
                      if (normCp && dfCp && normCp !== dfCp) continue;
                      if (!normCp && normVille && dfVille && normVille !== dfVille) continue;
                      otherDefibsCount++;
                    }

                    for (const eq of (otherEquipments || [])) {
                      if (!eq) continue;
                      const eqId = String(eq.id || '').trim().toLowerCase();
                      const eqIdent = String(eq.identifiant || '').trim().toLowerCase();
                      if ((currentId && eqId === currentId) || (currentIdentifiant && eqIdent === currentIdentifiant)) {
                        continue;
                      }
                      const eqVoie = normalizeAddr(eq.numeroVoie || (eq as any).numVoie || '');
                      if (!eqVoie || eqVoie !== normVoie) continue;
                      const eqCp = normalizeAddr(eq.codePostal || (eq as any).cp || '');
                      const eqVille = normalizeAddr(eq.ville || '');
                      if (normCp && eqCp && normCp !== eqCp) continue;
                      if (!normCp && normVille && eqVille && normVille !== eqVille) continue;
                      otherMaterielsCount++;
                    }
                  }

                  const safeVoie = String(numeroVoie || '').trim();
                  const safeCp = String(codePostal || '').trim();
                  const safeVille = String(ville || '').trim();
                  const searchAddressValue = safeVoie || [safeVoie, safeCp, safeVille].filter(Boolean).join(' ');

                  return (
                    <div className="flex flex-col gap-2 pb-1 w-full">
                      <span className="font-medium" style={{ fontSize: '16px', color: '#000', cursor: 'default' }}>
                        À cette adresse postale, il y a {otherDefibsCount} autre(s) défibrillateur(s) et {otherMaterielsCount} autres matériels.
                      </span>
                      <div className="grid grid-cols-2 gap-2 w-full">
                        <button
                          type="button"
                          disabled={otherDefibsCount === 0}
                          onClick={() => {
                            if (otherDefibsCount === 0) return;
                            const q = searchAddressValue;
                            setIsFormOpen(false);
                            setEditingItem(null);
                            if (setActiveTab) {
                              setActiveTab('defibrillateurs', true);
                              setTimeout(() => {
                                window.dispatchEvent(
                                  new CustomEvent('defib-external-filter', {
                                    detail: { search: q, sortFilter: 'closest_maintenance' },
                                  })
                                );
                              }, 30);
                            }
                          }}
                          style={{
                            width: '100%',
                            backgroundColor: '#0f172a',
                            color: '#ffffff',
                            borderRadius: '10px',
                            padding: '10px 16px',
                            fontSize: '18px',
                            fontWeight: 100,
                            border: 'none',
                            opacity: otherDefibsCount === 0 ? 0.4 : 1,
                            cursor: otherDefibsCount === 0 ? 'not-allowed' : 'pointer',
                          }}
                          className="w-full text-center justify-center transition-opacity select-none"
                        >
                          Voir les {otherDefibsCount} défibrillateur(s)
                        </button>
                        <button
                          type="button"
                          disabled={otherMaterielsCount === 0}
                          onClick={() => {
                            if (otherMaterielsCount === 0) return;
                            const q = searchAddressValue;
                            setIsFormOpen(false);
                            setEditingItem(null);
                            setSearchQuery(q);
                            if (onSearchChange) onSearchChange(q);
                            setSortFilter('closest_maintenance');
                          }}
                          style={{
                            width: '100%',
                            backgroundColor: '#0f172a',
                            color: '#ffffff',
                            borderRadius: '10px',
                            padding: '10px 16px',
                            fontSize: '18px',
                            fontWeight: 100,
                            border: 'none',
                            opacity: otherMaterielsCount === 0 ? 0.4 : 1,
                            cursor: otherMaterielsCount === 0 ? 'not-allowed' : 'pointer',
                          }}
                          className="w-full text-center justify-center transition-opacity select-none"
                        >
                          Voir les {otherMaterielsCount} autre(s) matériel(s)
                        </button>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Numéro et voie */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Numéro et voie.</label>
                    <input
                      type="text"
                      value={numeroVoie}
                      onChange={(e) => setNumeroVoie(e.target.value)}
                      placeholder="Entrez un numéro et une rue."
                    />
                  </div>

                  {/* Ville */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Ville.</label>
                    <input
                      type="text"
                      value={ville}
                      onChange={(e) => setVille(e.target.value)}
                      placeholder="Entrez une ville."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Code postal */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Code postal.</label>
                    <input
                      type="text"
                      value={codePostal}
                      onChange={(e) => setCodePostal(e.target.value)}
                      placeholder="Entrez un code postal."
                    />
                  </div>

                  {/* Région */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Région.</label>
                    <select value={region} onChange={(e) => setRegion(e.target.value)}>
                      <option value="">Sélectionner une région...</option>
                      {getRegionsForCountry(pays).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {/* Pays */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Pays.</label>
                    <select
                      value={pays}
                      onChange={(e) => setPays(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-[#DCE1EA] rounded-lg text-xs bg-white text-slate-700 font-semibold"
                    >
                      <option value="France">France</option>
                      <option value="Espagne">Espagne</option>
                      <option value="Portugal">Portugal</option>
                      <option value="Suisse">Suisse</option>
                      <option value="Luxembourg">Luxembourg</option>
                      <option value="Belgique">Belgique</option>
                      <option value="Allemagne">Allemagne</option>
                      <option value="Pays-Bas">Pays-Bas</option>
                      <option value="Royaume-Uni">Royaume-Uni</option>
                      <option value="Irlande">Irlande</option>
                      <option value="Suède">Suède</option>
                      <option value="Pologne">Pologne</option>
                      <option value="Tchéquie">Tchéquie</option>
                      <option value="Autriche">Autriche</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Latitude */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Latitude.</label>
                    <input
                      type="text"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder=""
                    />
                  </div>

                  {/* Longitude */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Longitude.</label>
                    <input
                      type="text"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder=""
                    />
                  </div>
                </div>

                <div className="pt-1 space-y-2">
                  <button
                    type="button"
                    onClick={handleManualUpdateCoordinates}
                    style={{ ...rowActionButton18Style, width: '100%', textTransform: 'none' }}
                    className="font-sans"
                  >
                    Actualiser les coordonnées
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const savedLat = parseFloat(latitude) || 48.8566;
                      const savedLng = parseFloat(longitude) || 2.3522;
                      setTempLat(savedLat);
                      setTempLng(savedLng);
                      setIsMapPickerOpen(true);
                    }}
                    style={{ ...rowActionButton18Style, width: '100%', textTransform: 'none' }}
                    className="font-sans"
                  >
                    Ajuster la position
                  </button>
                </div>

                {/* Aide d'accès */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase">Aide d’accès.</label>
                  <textarea
                    value={aideAcces}
                    onChange={(e) => setAideAcces(e.target.value)}
                    placeholder="Entrez un commentaire."
                    rows={2}
                  />
                </div>

                {/* Horaires d'ouverture section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider font-sans">
                      Horaires d'ouverture
                    </span>
                    {schedules.length < 2 && (
                      <button
                        type="button"
                        onClick={handleAddSchedule}
                        style={{ ...rowActionButton18Style, textTransform: 'none', minWidth: '200px', borderRadius: '10px' }}
                        className="font-sans"
                      >
                        Nouvelle plage
                      </button>
                    )}
                  </div>

                  {schedules.map((sch, schIdx) => (
                    <div key={schIdx} style={{ borderRadius: '13px', border: 'none', backgroundColor: 'rgb(245, 247, 250)', padding: 0 }} className="p-0 relative space-y-3">
                      {/* Midi closing toggle & Supprimer button aligned on the exact same right edge as Nouvelle plage */}
                      <div className="flex items-center justify-between gap-2 select-none">
                        <button
                          type="button"
                          id={`mid-close-${schIdx}`}
                          onClick={() => handleUpdateScheduleField(schIdx, 'fermetureMidi', !sch.fermetureMidi)}
                          className="inline-flex items-center gap-2 cursor-pointer select-none"
                        >
                          <span
                            className="w-5 h-5 rounded-full border flex items-center justify-center transition-all bg-transparent"
                            style={{
                              borderWidth: '1px',
                              borderColor: sch.fermetureMidi ? '#2e54ff' : 'oklch(0.92 0.01 258.78)',
                              backgroundColor: 'transparent',
                            }}
                          >
                            {sch.fermetureMidi && <span className="w-2.5 h-2.5 rounded-full bg-[#2e54ff]" />}
                          </span>
                          <span className="font-semibold text-black font-sans" style={{ fontSize: '16px' }}>
                            Fermeture le midi (4 plages horaires)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveSchedule(schIdx)}
                          style={{
                            ...rowActionButton18Style,
                            textTransform: 'none',
                            borderRadius: '10px',
                            minWidth: '200px',
                            fontSize: '18px',
                            backgroundColor: 'rgb(210, 45, 11)',
                          }}
                          className="font-bold text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer font-sans"
                        >
                          Supprimer
                        </button>
                      </div>

                      {/* Time Inputs */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {sch.fermetureMidi ? (
                          <>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Ouv. Matin</label>
                              <input
                                type="time"
                                value={sch.openMorning}
                                onChange={(e) => handleUpdateScheduleField(schIdx, 'openMorning', e.target.value)}
                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 no-clock-icon"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Ferm. Midi</label>
                              <input
                                type="time"
                                value={sch.closeMorning}
                                onChange={(e) => handleUpdateScheduleField(schIdx, 'closeMorning', e.target.value)}
                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 no-clock-icon"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">RéOuv. Midi</label>
                              <input
                                type="time"
                                value={sch.openAfternoon}
                                onChange={(e) => handleUpdateScheduleField(schIdx, 'openAfternoon', e.target.value)}
                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 no-clock-icon"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Ferm. Soir</label>
                              <input
                                type="time"
                                value={sch.closeAfternoon}
                                onChange={(e) => handleUpdateScheduleField(schIdx, 'closeAfternoon', e.target.value)}
                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 no-clock-icon"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Ouv. Général</label>
                              <input
                                type="time"
                                value={sch.openContinuous}
                                onChange={(e) => handleUpdateScheduleField(schIdx, 'openContinuous', e.target.value)}
                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 no-clock-icon"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Ferm. Général</label>
                              <input
                                type="time"
                                value={sch.closeContinuous}
                                onChange={(e) => handleUpdateScheduleField(schIdx, 'closeContinuous', e.target.value)}
                                className="w-full p-1 text-[11px] border border-slate-250 rounded focus:ring-indigo-500 no-clock-icon"
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Day checkboxes (Lundi to Dimanche) */}
                      <div className="space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase font-sans">Jours de la semaine</span>
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
                            const isDayTakenElsewhere = schedules.some((s, i) => i !== schIdx && s.days.includes(dayObj.key));
                            return (
                              <button
                                key={dayObj.key}
                                type="button"
                                disabled={isDayTakenElsewhere}
                                onClick={() => handleToggleDay(schIdx, dayObj.key)}
                                style={{ 
                                  borderRadius: '100px', 
                                  fontSize: '16px',
                                  borderColor: isChecked ? '#000000' : isDayTakenElsewhere ? '#e2e8f0' : '#d7d7d7' 
                                }}
                                className={`px-4 py-1.5 font-semibold border transition-all select-none font-sans ${
                                  isChecked
                                    ? 'bg-[#0f172a] text-white shadow-sm cursor-pointer'
                                    : isDayTakenElsewhere
                                      ? 'bg-slate-100 text-slate-400 opacity-40 cursor-not-allowed'
                                      : 'bg-white text-black cursor-pointer'
                                }`}
                              >
                                {dayObj.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Localisation radio switches */}
                <div className="grid grid-cols-1 gap-4 pt-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Installé en extérieur.</label>
                    <div className="flex space-x-3">
                      <CustomPinkRadio value="Oui" currentValue={installeExterieur} onChange={(v) => setInstalleExterieur(v as any)} label="Oui" />
                      <CustomPinkRadio value="Non" currentValue={installeExterieur} onChange={(v) => setInstalleExterieur(v as any)} label="Non" />
                    </div>
                  </div>
                </div>

              </div>

              {/* SECTION 4 - DATES */}
              <div 
                className="p-5 relative space-y-3"
                style={{
                  backgroundColor: 'rgb(245, 247, 250)',
                  border: 'none',
                  borderRadius: '0px',
                }}
              >
                <div className="mb-2 bg-transparent">
                  <span 
                    className="inline-block font-sans"
                    style={{
                      backgroundColor: 'rgb(61, 220, 132)',
                      color: 'rgb(17, 88, 48)',
                      fontSize: '18px',
                      borderRadius: '1000px',
                      padding: '7px 15px',
                      cursor: 'default',
                      fontWeight: 100,
                      textTransform: 'none',
                    }}
                  >
                    4 — Dates
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Expiration de garantie.</label>
                    <input type="date" value={expirationGarantie} onChange={(e) => setExpirationGarantie(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Date de fabrication.</label>
                    <input type="date" value={fabrication} onChange={(e) => setFabrication(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Mise en service.</label>
                    <input type="date" value={miseEnService} onChange={(e) => setMiseEnService(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Dernière maintenance.</label>
                    <input type="date" value={derniereMaintenance} onChange={(e) => handleDerniereMaintenanceChange(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Sortie d'usine.</label>
                    <input type="date" value={sortieUsine} onChange={(e) => setSortieUsine(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Prochaine maintenance.</label>
                    <input type="date" value={prochaineMaintenance} onChange={(e) => setProchaineMaintenance(e.target.value)} />
                  </div>
                </div>

              </div>

              {/* SECTION 5 - CHAMPS SPÉCIFIQUES PROFESSIONNELS DYNAMIQUES */}
              <div 
                className="p-5 relative space-y-3"
                style={{
                  backgroundColor: 'rgb(245, 247, 250)',
                  border: 'none',
                  borderRadius: '0px 0px 18px 18px',
                }}
              >
                <div className="mb-2 bg-transparent">
                  <span 
                    className="inline-block font-sans"
                    style={{
                      backgroundColor: 'rgb(61, 220, 132)',
                      color: 'rgb(17, 88, 48)',
                      fontSize: '18px',
                      borderRadius: '1000px',
                      padding: '7px 15px',
                      cursor: 'default',
                      fontWeight: 100,
                      textTransform: 'none',
                    }}
                  >
                    5 — Caractéristiques techniques : {categorie}
                  </span>
                </div>

                <div className="pt-2">
                  
                  {/* 1. EXTINCTEUR */}
                  {categorie === 'Extincteur' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Sélectionner le type d'agent extincteur</label>
                          <select 
                            value={specifiques.agentExtincteur || 'Eau pulvérisée'} 
                            onChange={(e) => handleSpecifiqueChange('agentExtincteur', e.target.value)}
                          >
                            <option value="Eau pulvérisée">Eau pulvérisée</option>
                            <option value="CO2">CO2</option>
                            <option value="Poudre">Poudre</option>
                            <option value="Mousse">Mousse</option>
                            <option value="Unique">Unique</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label>Indiquer la capacité de l'appareil</label>
                          <input 
                            type="text" 
                            value={specifiques.capacite || ''} 
                            placeholder="Ex: 6 Litres ou 2 kg" 
                            onChange={(e) => handleSpecifiqueChange('capacite', e.target.value)} 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Vérifier la pression ou la masse</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Conforme" currentValue={specifiques.pressionConforme || 'Conforme'} onChange={(v) => handleSpecifiqueChange('pressionConforme', v)} label="Conforme" />
                            <CustomPinkRadio value="Non conforme" currentValue={specifiques.pressionConforme || 'Conforme'} onChange={(v) => handleSpecifiqueChange('pressionConforme', v)} label="Non conforme" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Contrôler la présence du plomb et de la goupille</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Présents / Intacts" currentValue={specifiques.plombGoupille || 'Présents / Intacts'} onChange={(v) => handleSpecifiqueChange('plombGoupille', v)} label="Présents" />
                            <CustomPinkRadio value="Absents / Brisés" currentValue={specifiques.plombGoupille || 'Présents / Intacts'} onChange={(v) => handleSpecifiqueChange('plombGoupille', v)} label="Absents" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. BIMP */}
                  {categorie === "Boucle d'induction magnétique portable (BIMP)" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Vérifier le niveau de charge de la batterie</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Correct" currentValue={specifiques.chargeBatterie || 'Correct'} onChange={(v) => handleSpecifiqueChange('chargeBatterie', v)} label="Correct" />
                            <CustomPinkRadio value="Insuffisant" currentValue={specifiques.chargeBatterie || 'Correct'} onChange={(v) => handleSpecifiqueChange('chargeBatterie', v)} label="Insuffisant" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Valider la qualité du test audio</label>
                          <select 
                            value={specifiques.testAudio || 'Excellente'} 
                            onChange={(e) => handleSpecifiqueChange('testAudio', e.target.value)}
                          >
                            <option value="Excellente">Excellente</option>
                            <option value="Distorsion légère">Distorsion légère</option>
                            <option value="Grésillements importants">Grésillements importants</option>
                            <option value="Aucun son">Aucun son</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Inspecter l'état de la connectique et du micro</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Bon état" currentValue={specifiques.connectiqueMicro || 'Bon état'} onChange={(v) => handleSpecifiqueChange('connectiqueMicro', v)} label="Bon état" />
                            <CustomPinkRadio value="Dégradé / À remplacer" currentValue={specifiques.connectiqueMicro || 'Bon état'} onChange={(v) => handleSpecifiqueChange('connectiqueMicro', v)} label="Dégradé / À remplacer" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Confirmer la présence du pictogramme obligatoire</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Oui" currentValue={specifiques.pictogramme || 'Oui'} onChange={(v) => handleSpecifiqueChange('pictogramme', v)} label="Oui" />
                            <CustomPinkRadio value="Non" currentValue={specifiques.pictogramme || 'Oui'} onChange={(v) => handleSpecifiqueChange('pictogramme', v)} label="Non" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. PURIFICATEUR D'AIR */}
                  {categorie === 'Purificateur d’air' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Série.</label>
                          <input 
                            type="text" 
                            value={specifiques.serie || ''} 
                            placeholder="Série" 
                            onChange={(e) => handleSpecifiqueChange('serie', e.target.value)} 
                          />
                        </div>

                        <div className="space-y-1">
                          <label>Type de filtre.</label>
                          <select 
                            value={specifiques.typeFiltre || ''} 
                            onChange={(e) => handleSpecifiqueChange('typeFiltre', e.target.value)}
                          >
                            <option value="">Sélectionner un type de filtre</option>
                            {(variables || []).filter(v => v.category === 'Type Filtre Purificateur').map(v => (
                              <option key={v.id} value={v.nom}>{v.nom}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="space-y-1">
                          <label>Modèle de filtre.</label>
                          <select 
                            value={specifiques.modeleFiltre || ''} 
                            onChange={(e) => handleSpecifiqueChange('modeleFiltre', e.target.value)}
                          >
                            <option value="">Sélectionner un modèle de filtre</option>
                            {(variables || []).filter(v => v.category === 'Modèle Filtre Purificateur').map(v => (
                              <option key={v.id} value={v.nom}>{v.nom}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Nettoyage lors de la dernière intervention.</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Oui" currentValue={specifiques.nettoyageDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('nettoyageDerniereIntervention', v)} label="Oui" />
                            <CustomPinkRadio value="Non" currentValue={specifiques.nettoyageDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('nettoyageDerniereIntervention', v)} label="Non" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Désinfection lors de la dernière intervention.</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Oui" currentValue={specifiques.desinfectionDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('desinfectionDerniereIntervention', v)} label="Oui" />
                            <CustomPinkRadio value="Non" currentValue={specifiques.desinfectionDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('desinfectionDerniereIntervention', v)} label="Non" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Test de fonctionnement lors de la dernière intervention.</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Oui" currentValue={specifiques.testFonctionnementDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('testFonctionnementDerniereIntervention', v)} label="Oui" />
                            <CustomPinkRadio value="Non" currentValue={specifiques.testFonctionnementDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('testFonctionnementDerniereIntervention', v)} label="Non" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Pièce filtre lors de la dernière maintenance.</label>
                          <input 
                            type="text" 
                            disabled 
                            readOnly 
                            className="bg-slate-100 text-slate-500 cursor-not-allowed" 
                            value={specifiques.pieceFiltreDerniereMaintenance || ''} 
                            placeholder="Inconnu" 
                          />
                        </div>

                        <div className="space-y-1">
                          <label>Autre pièce consommable lors de la dernière maintenance.</label>
                          <input 
                            type="text" 
                            disabled 
                            readOnly 
                            className="bg-slate-100 text-slate-500 cursor-not-allowed" 
                            value={specifiques.autrePieceConsommableDerniereMaintenance || ''} 
                            placeholder="Inconnu" 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4. SIGNALISATION */}
                  {categorie === 'Signalisation' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Identifier la nature du panneau</label>
                          <select 
                            value={specifiques.naturePanneau || 'Évacuation'} 
                            onChange={(e) => handleSpecifiqueChange('naturePanneau', e.target.value)}
                          >
                            <option value="Évacuation">Évacuation</option>
                            <option value="Danger / Interdiction">Danger / Interdiction</option>
                            <option value="Moyens de secours">Moyens de secours</option>
                            <option value="Sécurité incendie">Sécurité incendie</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label>Confirmer la parfaite visibilité du panneau</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Visible" currentValue={specifiques.visibilite || 'Visible'} onChange={(v) => handleSpecifiqueChange('visibilite', v)} label="Visible" />
                            <CustomPinkRadio value="Masqué / Obstacle" currentValue={specifiques.visibilite || 'Visible'} onChange={(v) => handleSpecifiqueChange('visibilite', v)} label="Masqué / Obstacle" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Vérifier la solidité de la fixation</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Correcte" currentValue={specifiques.solidiateFixation || 'Correcte'} onChange={(v) => handleSpecifiqueChange('solidiateFixation', v)} label="Correcte" />
                            <CustomPinkRadio value="Instable / À refaire" currentValue={specifiques.solidiateFixation || 'Correcte'} onChange={(v) => handleSpecifiqueChange('solidiateFixation', v)} label="Instable / À refaire" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Valider la cohérence du fléchage d'évacuation</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Cohérent" currentValue={specifiques.coherenceFleche || 'Cohérent'} onChange={(v) => handleSpecifiqueChange('coherenceFleche', v)} label="Cohérent" />
                            <CustomPinkRadio value="Incorrect" currentValue={specifiques.coherenceFleche || 'Cohérent'} onChange={(v) => handleSpecifiqueChange('coherenceFleche', v)} label="Incorrect" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. ÉCLAIRAGE DE SECOURS */}
                  {categorie === 'Éclairage de secours' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label>Déterminer le type de bloc autonome</label>
                          <select 
                            value={specifiques.blocType || 'BAES Évacuation'} 
                            onChange={(e) => handleSpecifiqueChange('blocType', e.target.value)}
                          >
                            <option value="BAES Évacuation">BAES Évacuation</option>
                            <option value="BAES Ambiance">BAES Ambiance</option>
                            <option value="BAEH Habitation">BAEH Habitation</option>
                            <option value="Bloc bi-fonction">Bloc bi-fonction</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label>Préciser la technologie du bloc</label>
                          <select 
                            value={specifiques.techBloc || 'SATI (Auto-testable)'} 
                            onChange={(e) => handleSpecifiqueChange('techBloc', e.target.value)}
                          >
                            <option value="SATI (Auto-testable)">SATI (Auto-testable)</option>
                            <option value="Standard (Télécommandable)">Standard (Télécommandable)</option>
                            <option value="Connecté sans fil">Connecté sans fil</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label>Indiquer la durée d'autonomie constatée</label>
                          <input 
                            type="text" 
                            value={specifiques.durreAutonomie || ''} 
                            placeholder="Ex: 1 heure 15 minutes" 
                            onChange={(e) => handleSpecifiqueChange('durreAutonomie', e.target.value)} 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Valider le test de commutation automatique</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Réussi" currentValue={specifiques.testCommutation || 'Réussi'} onChange={(v) => handleSpecifiqueChange('testCommutation', v)} label="Réussi" />
                            <CustomPinkRadio value="Échoué" currentValue={specifiques.testCommutation || 'Réussi'} onChange={(v) => handleSpecifiqueChange('testCommutation', v)} label="Échoué" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Vérifier l'état des ampoules ou des LED</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Opérationnelles" currentValue={specifiques.etatAmpoule || 'Opérationnelles'} onChange={(v) => handleSpecifiqueChange('etatAmpoule', v)} label="Opérationnelles" />
                            <CustomPinkRadio value="Défectueuses" currentValue={specifiques.etatAmpoule || 'Opérationnelles'} onChange={(v) => handleSpecifiqueChange('etatAmpoule', v)} label="Défectueuses" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 6. SYSTÈMES HYDRANTS */}
                  {categorie === 'Systèmes hydrants' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label>Sélectionner le type d'appareil hydrant</label>
                          <select 
                            value={specifiques.typeHydrant || 'RIA DN25'} 
                            onChange={(e) => handleSpecifiqueChange('typeHydrant', e.target.value)}
                          >
                            <option value="RIA DN25">RIA DN25</option>
                            <option value="RIA DN33">RIA DN33</option>
                            <option value="Poteau d'incendie">Poteau d'incendie</option>
                            <option value="Bouche d'incendie">Bouche d'incendie</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label>Pression hydrostatique mesurée (bars)</label>
                          <input 
                            type="text" 
                            value={specifiques.pressionEau || ''} 
                            placeholder="Ex: 3.5 bars" 
                            onChange={(e) => handleSpecifiqueChange('pressionEau', e.target.value)} 
                          />
                        </div>

                        <div className="space-y-1">
                          <label>Débit d'eau obtenu (L/min)</label>
                          <input 
                            type="text" 
                            value={specifiques.debitEau || ''} 
                            placeholder="Ex: 150 L/min" 
                            onChange={(e) => handleSpecifiqueChange('debitEau', e.target.value)} 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Contrôler l'état visuel du tuyau et de la lance</label>
                          <select 
                            value={specifiques.etatTuyau || 'Parfait état'} 
                            onChange={(e) => handleSpecifiqueChange('etatTuyau', e.target.value)}
                          >
                            <option value="Parfait état">Parfait état</option>
                            <option value="Légère usure sans fuite">Légère usure sans fuite</option>
                            <option value="Craquelé / À remplacer">Craquelé / À remplacer</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label>Confirmer l'accessibilité permanente de la zone</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Dégagée" currentValue={specifiques.accessibilite || 'Dégagée'} onChange={(v) => handleSpecifiqueChange('accessibilite', v)} label="Dégagée" />
                            <CustomPinkRadio value="Encombrée" currentValue={specifiques.accessibilite || 'Dégagée'} onChange={(v) => handleSpecifiqueChange('accessibilite', v)} label="Encombrée" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 7. DÉTECTEUR DE FUMÉE */}
                  {categorie === 'Détecteur de fumée' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Renseigner la date limite de remplacement</label>
                          <input 
                            type="text" 
                            value={specifiques.remplacementMax || ''} 
                            placeholder="Ex: Décembre 2031" 
                            onChange={(e) => handleSpecifiqueChange('remplacementMax', e.target.value)} 
                          />
                        </div>

                        <div className="space-y-1">
                          <label>Valider le test de déclenchement à l'aérosol</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Positif" currentValue={specifiques.declenchementAerosol || 'Positif'} onChange={(v) => handleSpecifiqueChange('declenchementAerosol', v)} label="Positif" />
                            <CustomPinkRadio value="Négatif" currentValue={specifiques.declenchementAerosol || 'Positif'} onChange={(v) => handleSpecifiqueChange('declenchementAerosol', v)} label="Négatif" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Vérifier l'absence de signal de pile faible</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Aucun signal" currentValue={specifiques.testPileFaible || 'Aucun signal'} onChange={(v) => handleSpecifiqueChange('testPileFaible', v)} label="Aucun signal" />
                            <CustomPinkRadio value="Signal actif / Alerte" currentValue={specifiques.testPileFaible || 'Aucun signal'} onChange={(v) => handleSpecifiqueChange('testPileFaible', v)} label="Signal actif" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Contrôler l'empoussièrement de la chambre de mesure</label>
                          <select 
                            value={specifiques.propreteChambre || 'Propre'} 
                            onChange={(e) => handleSpecifiqueChange('propreteChambre', e.target.value)}
                          >
                            <option value="Propre">Propre</option>
                            <option value="Faiblement empoussiérée">Faiblement empoussiérée</option>
                            <option value="Très encrassée / À nettoyer">Très encrassée / À nettoyer</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 8. DETECTION INCENDIE (SSI) */}
                  {categorie === 'Détection incendie (SSI)' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label>Sélectionner le type de centrale inspectée</label>
                          <select 
                            value={specifiques.stextContent || 'ECS (Détection)'} 
                            onChange={(e) => handleSpecifiqueChange('stextContent', e.target.value)}
                          >
                            <option value="ECS (Détection)">ECS (Détection)</option>
                            <option value="CMSI (Mise en sécurité)">CMSI (Mise en sécurité)</option>
                            <option value="SMSI (Système intégré)">SMSI (Système intégré)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label>Noter la tension des batteries de secours</label>
                          <input 
                            type="text" 
                            value={specifiques.tensionBat || ''} 
                            placeholder="Ex: 24.2 Volts" 
                            onChange={(e) => handleSpecifiqueChange('tensionBat', e.target.value)} 
                          />
                        </div>

                        <div className="space-y-1">
                          <label>Nombre de défauts présents à l'historique</label>
                          <input 
                            type="text" 
                            value={specifiques.historiqueDefauts || ''} 
                            placeholder="Ex: 0 défaut" 
                            onChange={(e) => handleSpecifiqueChange('historiqueDefauts', e.target.value)} 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Vérifier l'absence de voyant de dérangement</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Aucun défaut" currentValue={specifiques.absenceVoyant || 'Aucun défaut'} onChange={(v) => handleSpecifiqueChange('absenceVoyant', v)} label="Aucun défaut" />
                            <CustomPinkRadio value="Dérangement présent" currentValue={specifiques.absenceVoyant || 'Aucun défaut'} onChange={(v) => handleSpecifiqueChange('absenceVoyant', v)} label="Dérangement présent" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Valider le test de transmission de l'alarme</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Transmis" currentValue={specifiques.transmissionAlarme || 'Transmis'} onChange={(v) => handleSpecifiqueChange('transmissionAlarme', v)} label="Transmis" />
                            <CustomPinkRadio value="Non transmis / Échec" currentValue={specifiques.transmissionAlarme || 'Transmis'} onChange={(v) => handleSpecifiqueChange('transmissionAlarme', v)} label="Échec" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 9. DÉSENFUMAGE */}
                  {categorie === 'Désenfumage' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Identifier le mode de télécommande</label>
                          <select 
                            value={specifiques.telecommande || 'Pneumatique (CO2)'} 
                            onChange={(e) => handleSpecifiqueChange('telecommande', e.target.value)}
                          >
                            <option value="Pneumatique (CO2)">Pneumatique (CO2)</option>
                            <option value="Électrique (24V/48V)">Électrique (24V/48V)</option>
                            <option value="Mécanique (Câble)">Mécanique (Câble)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label>État des cartouches de gaz ou des fusibles</label>
                          <select 
                            value={specifiques.cartouchesGaz || 'Intactes'} 
                            onChange={(e) => handleSpecifiqueChange('cartouchesGaz', e.target.value)}
                          >
                            <option value="Intactes">Intactes</option>
                            <option value="Percées / À remplacer">Percées / À remplacer</option>
                            <option value="Non applicable">Non applicable</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Confirmer l'ouverture complète de l'exutoire</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Ouverture totale" currentValue={specifiques.exutoireOuverture || 'Ouverture totale'} onChange={(v) => handleSpecifiqueChange('exutoireOuverture', v)} label="Ouverture totale" />
                            <CustomPinkRadio value="Ouverture partielle / Blocage" currentValue={specifiques.exutoireOuverture || 'Ouverture totale'} onChange={(v) => handleSpecifiqueChange('exutoireOuverture', v)} label="Ouverture partielle" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label>Valider la facilité de réarmement du système</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Réarmé avec succès" currentValue={specifiques.rearmement || 'Réarmé avec succès'} onChange={(v) => handleSpecifiqueChange('rearmement', v)} label="Réussi" />
                            <CustomPinkRadio value="Blocage au réarmement" currentValue={specifiques.rearmement || 'Réarmé avec succès'} onChange={(v) => handleSpecifiqueChange('rearmement', v)} label="Blocage" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label>Inspecter l'état des câbles et des poulies de liaison</label>
                          <div className="flex space-x-4 py-1">
                            <CustomPinkRadio value="Bon état" currentValue={specifiques.etatPoulies || 'Bon état'} onChange={(v) => handleSpecifiqueChange('etatPoulies', v)} label="Bon état" />
                            <CustomPinkRadio value="Usure prononcée / À remplacer" currentValue={specifiques.etatPoulies || 'Bon état'} onChange={(v) => handleSpecifiqueChange('etatPoulies', v)} label="Usure prononcée" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Commentaire (One line - Always present in tech Section 5) */}
                  <div className="space-y-1 mt-4 pt-2">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Commentaire de visite technique (Une seule ligne).</label>
                    <input
                      type="text"
                      value={specifiques.commentaire || ''}
                      placeholder="Commentaire de terrain (RAS, etc.)"
                      onChange={(e) => handleSpecifiqueChange('commentaire', e.target.value)}
                    />
                  </div>

                </div>
              </div>

              </div>
            </form>
          </div>

        </div>
      )}

      {isMapPickerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.3)]">

            {/* Map Container */}
            <div className="relative h-80 w-full bg-slate-100">
              <MapContainer
                center={[tempLat, tempLng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright font-sans">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationPickerEvents onPick={(lat, lng) => {
                  setTempLat(lat);
                  setTempLng(lng);
                }} />
                <Marker 
                  position={[tempLat, tempLng]}
                  icon={L.divIcon({
                    html: `
                      <div class="relative flex items-center justify-center" style="transform: translate(-12px, -12px);">
                        <div class="absolute w-8 h-8 rounded-full bg-black/30 animate-ping"></div>
                        <div class="w-5 h-5 rounded-full bg-[#0f172a] border-2 border-white shadow-lg"></div>
                      </div>
                    `,
                    className: 'custom-picker-icon',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                  })}
                />
              </MapContainer>
            </div>

            {/* Live coordinates display */}
            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="block font-semibold text-black font-sans" style={{ fontSize: '16px' }}>Latitude du point.</span>
                  <span className="block font-bold text-black font-sans" style={{ fontSize: '18px', marginTop: '4px' }}>{tempLat.toFixed(6)}</span>
                </div>
                <div>
                  <span className="block font-semibold text-black font-sans" style={{ fontSize: '16px' }}>Longitude du point.</span>
                  <span className="block font-bold text-black font-sans" style={{ fontSize: '18px', marginTop: '4px' }}>{tempLng.toFixed(6)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 flex gap-3 bg-white">
              <button
                type="button"
                onClick={() => setIsMapPickerOpen(false)}
                style={{ borderRadius: '13px', fontSize: '18px' }}
                className="flex-1 py-3 bg-[#0f172a] hover:bg-neutral-900 text-white font-bold transition-all cursor-pointer font-sans"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setLatitude(tempLat.toFixed(6));
                  setLongitude(tempLng.toFixed(6));
                  setIsMapPickerOpen(false);
                }}
                style={{ borderRadius: '13px', fontSize: '18px', backgroundColor: '#2563eb' }}
                className="flex-1 py-3 hover:bg-blue-700 text-white font-bold transition-all cursor-pointer font-sans"
              >
                Valider la position
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cartographie GIS Overlay */}
      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        items={filteredList}
        otherEquipments={otherEquipments}
        clients={clients}
        selectedIds={selectedIds}
        onToggleSelect={(id) => {
          setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
        }}
        fsmTours={fsmTours}
        executeNouvelleTournee={executeNouvelleTournee}
        executeAddToTrier={executeAddToTrier}
        executeAddTournee={executeAddTournee}
        isAnySelectedInTour={isAnySelectedInTour}
      />

      {/* Side Pane Search for Client */}
      <SearchSidePane
        isOpen={isSidePaneClientOpen}
        onClose={() => setIsSidePaneClientOpen(false)}
        paneId="autres-materiels-client-side-pane"
        items={clientSidePaneItems}
        selectedId={clientId}
        onSelect={(item) => handleClientSelect(item.id)}
        searchPlaceholder="Entrez votre recherche"
        searchFilter={(item, q) => {
          const denom = (item.label || '').toLowerCase();
          const sub = (item.subtitle || '').toLowerCase();
          const badge = (item.badge || '').toLowerCase();
          const c = item.raw;
          const siret = (c?.siret || '').toLowerCase();
          const ville = (c?.ville || '').toLowerCase();
          return denom.includes(q) || sub.includes(q) || badge.includes(q) || siret.includes(q) || ville.includes(q);
        }}
      />

      {/* 📥 Floating Cursor Export Progress Indicator ("Génération du fichier...n%") 📥 */}
      {exportMainOuiProgress !== null && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${cursorExportPos.x + 14}px`,
            top: `${cursorExportPos.y + 10}px`,
            zIndex: 1000001,
            pointerEvents: 'none',
            color: '#000000',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
            whiteSpace: 'nowrap',
          }}
        >
          {`${t("Génération du fichier...")}${Math.max(1, Math.min(100, Math.round(exportMainOuiProgress)))}%`}
        </div>,
        document.body
      )}

      {/* 📚 AIDE CHAT AGENT SIDE PANE 📚 */}
      {isHelpFaqOpen && typeof document !== 'undefined' && createPortal(
        <div
          id="autres-materiels-help-faq-side-pane-backdrop"
          className="fixed inset-0 z-[99990] flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"
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
            zIndex: 99990,
          }}
          onClick={() => setIsHelpFaqOpen(false)}
        >
          <div
            id="autres-materiels-help-faq-side-pane"
            className="relative w-full sm:w-[480px] shadow-2xl flex flex-col shrink-0 transform transition-transform duration-200 ease-in-out"
            onClick={(e) => e.stopPropagation()}
            style={{
              height: '100vh',
              minHeight: '100dvh',
              maxHeight: '100dvh',
              backgroundColor: '#F5F7FA',
              borderLeft: 'none',
              borderRadius: '0px',
              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
            }}
          >
            <div
              ref={helpChatScrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 pb-28"
            >
              {/* Incoming typing text: Ressources d’aide populaires : (hidden once a question is selected) */}
              {selectedHelpFaqIndex === null && (
                <>
                  <div className="flex flex-col items-start animate-fadeIn">
                    <div
                      className="transition-all relative select-text w-full"
                      style={{
                        backgroundColor: 'transparent',
                        fontSize: '18px',
                        border: 'none',
                        boxShadow: 'none',
                        padding: 0,
                        color: '#000000',
                        cursor: 'default',
                      }}
                    >
                      <p
                        className="leading-relaxed whitespace-pre-wrap break-words m-0 select-text"
                        style={{
                          fontSize: '18px',
                          color: '#000000',
                          cursor: 'default',
                        }}
                      >
                        {helpIntroTyped}
                      </p>
                    </div>
                  </div>

                  {/* System dropdown below */}
                  <div className="w-full animate-fadeIn">
                    <select
                      id="autres-materiels-help-faq-select"
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setSelectedHelpFaqIndex(null);
                        } else {
                          setSelectedHelpFaqIndex(Number(val));
                        }
                      }}
                      style={{
                        width: '100%',
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        border: '1px solid #DCE1EA',
                        borderRadius: '13px',
                        padding: '9px 14px',
                        fontSize: '18px',
                        fontWeight: '100',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        backgroundImage: 'none',
                        outline: 'none',
                      }}
                    >
                      <option value="">Sélection d’un sujet.</option>
                      {HELP_FAQ_ITEMS.map((item, idx) => (
                        <option key={idx} value={String(idx)}>
                          {item.q}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* First response: Selected Question */}
              {selectedHelpFaqIndex !== null && HELP_FAQ_ITEMS[selectedHelpFaqIndex] && (
                <>
                  <div className="flex flex-col items-start animate-fadeIn">
                    <div
                      className="transition-all relative select-text w-full"
                      style={{
                        padding: '15px 20px',
                        background: 'rgb(233, 235, 239)',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#000000',
                        cursor: 'default',
                        borderRadius: '13px',
                        border: 'none',
                        boxShadow: 'none',
                      }}
                    >
                      <p
                        className="leading-relaxed whitespace-pre-wrap break-words m-0 select-text"
                        style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#000000',
                          cursor: 'default',
                        }}
                      >
                        {HELP_FAQ_ITEMS[selectedHelpFaqIndex].q}
                      </p>
                    </div>
                  </div>

                  {/* Second response right after: Answer */}
                  <div className="flex flex-col items-start animate-fadeIn">
                    <div
                      className="transition-all relative select-text w-full"
                      style={{
                        backgroundColor: 'transparent',
                        fontSize: '18px',
                        border: 'none',
                        boxShadow: 'none',
                        padding: 0,
                        color: '#000000',
                        cursor: 'default',
                      }}
                    >
                      <p
                        className="leading-relaxed whitespace-pre-wrap break-words m-0 select-text"
                        style={{
                          fontSize: '18px',
                          color: '#000000',
                          cursor: 'default',
                        }}
                      >
                        {helpAnswerTyped}
                      </p>
                    </div>
                  </div>

                  {/* After the answer is displayed: "Vous avez encore besoin d’aide ?" + full-width "Contacter l’assistance" + full-width "Recommencer" */}
                  {helpAnswerDone && (
                    <div className="flex flex-col items-start space-y-3 w-full animate-fadeIn">
                      <div
                        className="transition-all relative select-text w-full"
                        style={{
                          backgroundColor: 'transparent',
                          fontSize: '18px',
                          border: 'none',
                          boxShadow: 'none',
                          padding: 0,
                          color: '#000000',
                          cursor: 'default',
                        }}
                      >
                        <p
                          className="leading-relaxed whitespace-pre-wrap break-words m-0 select-text"
                          style={{
                            fontSize: '18px',
                            color: '#000000',
                            cursor: 'default',
                          }}
                        >
                          Vous avez encore besoin d’aide ?
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsHelpFaqOpen(false);
                          if (setActiveTab) setActiveTab('assistance');
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: '#2e54ff',
                          color: '#ffffff',
                          borderRadius: '13px',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          padding: '11px 22px',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                          boxShadow: 'none',
                        }}
                        className="w-full text-center cursor-pointer animate-none whitespace-nowrap"
                      >
                        Contacter l’assistance
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHelpFaqIndex(null);
                          setHelpAnswerTyped('');
                          setHelpAnswerDone(false);
                          setHelpResetTick((prev) => prev + 1);
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: 'rgb(210, 45, 11)',
                          color: '#ffffff',
                          borderRadius: '13px',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          padding: '11px 22px',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                          boxShadow: 'none',
                        }}
                        className="w-full text-center cursor-pointer animate-none whitespace-nowrap"
                      >
                        Recommencer
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Floating Bottom Button (Only Fermer) */}
            <div
              className="absolute bottom-0 left-0 right-0 p-6 flex gap-4 z-20 pointer-events-none"
              style={{ backgroundColor: 'transparent', background: 'transparent' }}
            >
              <button
                type="button"
                onClick={() => setIsHelpFaqOpen(false)}
                style={{
                  backgroundColor: 'rgb(210, 45, 11)',
                  color: '#ffffff',
                  borderRadius: '13px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  padding: '11px 22px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  boxShadow: 'none',
                }}
                className="flex-1 text-center cursor-pointer animate-none pointer-events-auto"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
