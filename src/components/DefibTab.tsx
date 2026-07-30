import React, { useState, useMemo, useEffect } from 'react';
import { Defibrillateur, Client, Variable, CompanyInfo } from '../types';
import { t } from '../utils/translate';
import MapModal from './MapModal';
import HelpBubble from './HelpBubble';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { runMonthlyVigilanceCampaign } from '../utils/emailService';
import { checkIfDefibIdentifiantExistsAnywhere, fetchCollectionFromFirestore } from '../firebase';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function LocationPickerEvents({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

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

  // Render text wrapped with start/stop asterisk
  const cleanCharList = text.split('').filter(char => CODE39_PATTERNS[char] !== undefined);
  if (cleanCharList.length === 0) return null;

  const wrappedText = '*' + cleanCharList.join('') + '*';

  // Pass 1: Compute total width
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

  // Pass 2: Generate bars
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
    <div className="flex flex-col items-center justify-center w-full bg-white max-w-full p-2">
      <style>{`
        /* Supprimer l'icône horloge native dans les inputs de type time */
        .no-clock-icon::-webkit-calendar-picker-indicator {
          display: none !important;
          -webkit-appearance: none !important;
          background: transparent !important;
        }
      `}</style>
      <svg
        viewBox={`0 0 ${totalWidth} 74`}
        className="max-h-16 mb-2"
        style={{ display: 'block', width: '100%', maxWidth: `${totalWidth}px` }}
        shapeRendering="crispEdges"
      >
        <rect width={totalWidth} height={74} fill="white" />
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
          backgroundColor: '#000000',
          color: '#ffffff',
          boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
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

import {
  formatDateToFR,
  exportToCSV,
  REGIONS_FRANCAISES,
  generateRandomShortCode,
  computeProchaineMaintenance
} from '../utils';
import { getRegionsForCountry, REGIONS_BY_COUNTRY } from '../utils/regions';
import {
  Plus,
  Search,
  Trash2,
  Download,
  Edit,
  X,
  Sliders,
  Check,
  AlertTriangle,
  ChevronDown,
  FolderLock,
  Palette,
  Eye,
  Settings,
  XCircle,
  HelpCircle,
  Activity,
  User,
  Package,
  MapPin,
  Calendar,
  Zap,
  Info,
  Layers,
  Sparkles,
  RefreshCw,
  Clock,
  Filter,
  Map as MapIcon
} from 'lucide-react';

function parseDateHelper(dStr: string | undefined | null): Date | null {
  if (!dStr) return null;
  const s = dStr.trim();
  if (!s) return null;
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
  }
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
  }
  const fallback = Date.parse(s);
  if (!isNaN(fallback)) {
    return new Date(fallback);
  }
  return null;
}

function getSafetyStatus(df: Defibrillateur): { colorClass: string; title: string } {
  const datesToCheck: Date[] = [];
  
  // 1. Prochaine maintenance
  const prochaineMaintStr = computeProchaineMaintenance(df.derniereMaintenance);
  const mDate = parseDateHelper(prochaineMaintStr);
  if (mDate) datesToCheck.push(mDate);

  // 2. Péremption Électrode A
  const eADate = parseDateHelper(df.peremptionElectrodeA);
  if (eADate) datesToCheck.push(eADate);

  // 3. Péremption Électrode P
  const ePDate = parseDateHelper(df.peremptionElectrodeP);
  if (ePDate) datesToCheck.push(ePDate);

  // 4. Péremption Batterie
  const bDate = parseDateHelper(df.peremptionBatterie);
  if (bDate) datesToCheck.push(bDate);

  if (datesToCheck.length === 0) {
    return { colorClass: 'bg-[#94a3b8]', title: 'Rien à signaler' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check from highest severity to lowest
  const hasExpired = datesToCheck.some(d => {
    const checkDate = new Date(d);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < today;
  });
  if (hasExpired) {
    return { colorClass: 'bg-[#ef4444]', title: 'Au moins une date est expirée' };
  }

  const getDaysDiff = (targetDate: Date) => {
    const checkDate = new Date(targetDate);
    checkDate.setHours(0, 0, 0, 0);
    const diffTime = checkDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const hasUnder3Months = datesToCheck.some(d => {
    const dDiff = getDaysDiff(d);
    return dDiff >= 0 && dDiff < 90;
  });
  if (hasUnder3Months) {
    return { colorClass: 'bg-[#f97316]', title: 'Au moins une date est sous 3 mois' };
  }

  const hasUnder6Months = datesToCheck.some(d => {
    const dDiff = getDaysDiff(d);
    return dDiff >= 90 && dDiff <= 180;
  });
  if (hasUnder6Months) {
    return { colorClass: 'bg-[#3b82f6]', title: 'Au moins une date est sous 3 à 6 mois' };
  }

  return { colorClass: 'bg-[#94a3b8]', title: 'Rien à signaler' };
}

function getDateColor(dStr: string | undefined | null): string {
  const parsed = parseDateHelper(dStr);
  if (!parsed) return '#000000';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkDate = new Date(parsed);
  checkDate.setHours(0, 0, 0, 0);

  if (checkDate < today) {
    return '#ef4444';
  }

  const diffTime = checkDate.getTime() - today.getTime();
  const dDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (dDiff >= 0 && dDiff < 90) {
    return '#f97316';
  }

  if (dDiff >= 90 && dDiff <= 180) {
    return '#3b82f6';
  }

  return '#000000';
}

interface DefibTabProps {
  currentLang?: string;
  defibrillateurs: Defibrillateur[];
  clients: Client[];
  variables: Variable[];
  onAddDefib: (defib: Omit<Defibrillateur, 'id'>) => void;
  onUpdateDefib: (defib: Defibrillateur) => void;
  onDeleteDefib: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkEdit: (ids: string[], updates: Partial<Omit<Defibrillateur, 'id'>>) => void;
  fsmTours?: any[];
  onUpdateFsmTours?: (updated: any[]) => void;
  setActiveTab?: (tab: any, bypassBlock?: boolean) => void;
  onShowGmaoReports?: (defibIdentifiant: string) => void;
  companyInfo?: CompanyInfo;
  members?: any[];
}

export default function DefibTab({
  currentLang,
  defibrillateurs,
  clients,
  variables,
  onAddDefib,
  onUpdateDefib,
  onDeleteDefib,
  onBulkDelete,
  onBulkEdit,
  fsmTours = [],
  onUpdateFsmTours,
  setActiveTab,
  onShowGmaoReports,
  companyInfo,
  members = [],
}: DefibTabProps) {
  // Navigation, Search & Filters State
  const [search, setSearch] = useState('');
  const [isFilterPaneOpen, setIsFilterPaneOpen] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const searchInputStyle: React.CSSProperties = {
    border: '1px solid #dedede',
    borderRadius: '13px',
    padding: '9px 19px',
    fontSize: '18px',
    fontWeight: '100',
    color: '#000000',
    backgroundColor: '#ffffff',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    outline: (isSearchHovered || isSearchFocused) ? '2.5px solid #fa53d5' : 'none',
    outlineOffset: (isSearchHovered || isSearchFocused) ? '2px' : '0px',
    transition: 'all 0s',
  };

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
    fontSize: '18px',
    padding: '9px 19px',
  };

  const filterInputStyle: React.CSSProperties = {
    border: '1px solid #dedede',
    borderRadius: '13px',
    padding: '9px 19px',
    fontSize: '16px',
    fontWeight: '100',
    color: '#000000',
    backgroundColor: '#ffffff',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    width: '100%',
  };

  const cancelFiltersButtonStyle: React.CSSProperties = {
    ...rowActionButtonStyle,
    backgroundColor: '#000000',
    color: '#ffffff',
    width: '100%',
  };

  const applyFiltersButtonStyle: React.CSSProperties = {
    ...rowActionButtonStyle,
    backgroundColor: '#000000',
    color: '#ffffff',
    width: '100%',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    backgroundColor: '#ffffff',
    zIndex: 10,
    borderBottom: '1px solid rgb(218, 218, 218)',
  };

  // Active applied filters (1 to 10 filters)
  const [activeFilters, setActiveFilters] = useState({
    region: 'Tous',
    modeleId: 'Tous',
    action3To6: false,
    actionUnder3: false,
    actionExpired: false,
    categorie: 'Tous',
    contrat: 'Tous',
    actionRejected: false,
  });

  // Draft filters inside the sidebar/pane
  const [draftFilters, setDraftFilters] = useState({
    region: 'Tous',
    modeleId: 'Tous',
    action3To6: false,
    actionUnder3: false,
    actionExpired: false,
    categorie: 'Tous',
    contrat: 'Tous',
    actionRejected: false,
  });
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // GÉODAE Atlasanté State
  const [atlasanteActive, setAtlasanteActive] = useState(false);
  const [atlasanteUrlAuth, setAtlasanteUrlAuth] = useState('');
  const [atlasanteDeclarantId, setAtlasanteDeclarantId] = useState('');
  const [isAtlasantePaneOpen, setIsAtlasantePaneOpen] = useState(false);
  const [isAtlasanteUploading, setIsAtlasanteUploading] = useState(false);
  const [atlasanteUploadResults, setAtlasanteUploadResults] = useState<any[]>([]);

  useEffect(() => {
    const activeTenant = localStorage.getItem('defib_tenant_id') || 'demo';
    fetchCollectionFromFirestore<any>('api_connectors', activeTenant).then(data => {
      if (data) {
        if (data.atlasanteActive !== undefined) setAtlasanteActive(data.atlasanteActive);
        if (data.atlasanteUrlAuth !== undefined) setAtlasanteUrlAuth(data.atlasanteUrlAuth);
        if (data.atlasanteDeclarantId !== undefined) setAtlasanteDeclarantId(data.atlasanteDeclarantId);
      }
    }).catch(err => {
      console.error("Error fetching api_connectors inside DefibTab:", err);
    });
  }, []);

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    if (isFormOpen) {
      setSelectedIds([]);
    }
  }, [isFormOpen]);

  const isAnySelectedInTour = selectedIds.some(id => {
    const defib = defibrillateurs.find(d => d.id === id);
    if (!defib) return false;
    return (fsmTours || []).some(t =>
      (t.missions || []).some((m: any) => m.defibIdentifiant === defib.identifiant)
    );
  });
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isClientSearchFocused, setIsClientSearchFocused] = useState(false);
  const [editingDefib, setEditingDefib] = useState<Defibrillateur | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isLotScannerOpen, setIsLotScannerOpen] = useState(false);
  const [isSerieScannerOpen, setIsSerieScannerOpen] = useState(false);
  const [isLotAScannerOpen, setIsLotAScannerOpen] = useState(false);
  const [isLotPScannerOpen, setIsLotPScannerOpen] = useState(false);
  const [isLotBatScannerOpen, setIsLotBatScannerOpen] = useState(false);
  
  // Tour Action State
  const [isTourDropdownOpen, setIsTourDropdownOpen] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  // Campaign State
  const [isCampaignLoading, setIsCampaignLoading] = useState(false);

  const handleTriggerVigilanceCampaign = async () => {
    setIsCampaignLoading(true);
    try {
      const count = await runMonthlyVigilanceCampaign(defibrillateurs, clients, {
        name: companyInfo?.name || "Défibeo Suite",
        email: companyInfo?.email || ""
      });
      alert(`Campagne de rappel d'auto-vigilance exécutée avec succès ! ${count} e-mail(s) ont été envoyés via votre Google Apps Script.`);
    } catch (err) {
      console.error("Failed to run campaign:", err);
      alert("Erreur lors de l'exécution de la campagne d'auto-vigilance. Veuillez vérifier que l'URL d'Apps Script est paramétrée.");
    } finally {
      setIsCampaignLoading(false);
    }
  };

  const handleExportToAtlasanteCSV = () => {
    const selectedDefibs = defibrillateurs.filter(d => selectedIds.includes(d.id));
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const variableMap = new Map(variables.map(v => [v.id, v]));

    const headers = [
      'nom',
      'lat_coor1',
      'long_coor1',
      'acc',
      'acc_lib',
      'disp_j',
      'disp_h',
      'tel_1',
      'etat_fonct',
      'fab_rais',
      'modele',
      'num_serie',
      'dermnt',
      'expt_siren',
      'expt_rais',
      'expt_tel1',
      'expt_email'
    ];

    let csvContent = '\uFEFF' + headers.join(';') + '\n';

    selectedDefibs.forEach(df => {
      const cl = clientMap.get(df.clientId);
      const modDef = variableMap.get(df.modeleId);

      const clientDenom = cl ? cl.denomination : '';
      const identifiantVal = df.identifiant || '';
      const nomVal = `${identifiantVal} ${clientDenom}`.trim();

      const row = [
        nomVal,
        df.latitude || '',
        df.longitude || '',
        'Intérieur',
        'Non',
        'lundi',
        'heures ouvrables',
        cl ? cl.phone : (df.telephoneSite || ''),
        'En fonctionnement',
        clientDenom,
        modDef ? modDef.nom : '',
        df.numeroSerie || '',
        df.derniereMaintenance || '',
        '00000000000000',
        companyInfo?.name || '',
        companyInfo?.phone || '',
        companyInfo?.email || ''
      ];
      csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `export_atlasante_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTransmitToAtlasante = async () => {
    setIsAtlasanteUploading(true);
    setAtlasanteUploadResults([]);

    const selectedDefibs = defibrillateurs.filter(d => selectedIds.includes(d.id));
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const variableMap = new Map(variables.map(v => [v.id, v]));

    const items = selectedDefibs.map(df => {
      const cl = clientMap.get(df.clientId);
      const modDef = variableMap.get(df.modeleId);

      const clientDenom = cl ? cl.denomination : '';
      const identifiantVal = df.identifiant || '';
      const nomVal = `${identifiantVal} ${clientDenom}`.trim();

      const formatDateForApi = (dateStr: string | undefined) => {
        if (!dateStr) return '2000-01-01';
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        const pts = dateStr.split('/');
        if (pts.length === 3) {
          const d = pts[0].padStart(2, '0');
          const m = pts[1].padStart(2, '0');
          const y = pts[2];
          return `${y}-${m}-${d}`;
        }
        return '2000-01-01';
      };

      const latNum = df.latitude ? parseFloat(df.latitude) : 48.8566;
      const lngNum = df.longitude ? parseFloat(df.longitude) : 2.3522;

      const geojsonFeature = {
        type: 'Feature',
        properties: {
          nom: nomVal,
          lat_coor1: latNum,
          long_coor1: lngNum,
          acc: 'Intérieur',
          acc_lib: false,
          disp_j: ['lundi'],
          disp_h: ['heures ouvrables'],
          tel1: cl && cl.phone ? cl.phone : (df.telephoneSite || '+33600000000'),
          etat_fonct: 'En fonctionnement',
          fab_rais: clientDenom || 'DGSDAE',
          modele: modDef ? modDef.nom : 'DGSDAE',
          num_serie: df.numeroSerie || '',
          dermnt: formatDateForApi(df.derniereMaintenance),
          expt_siren: '00000000000000',
          expt_rais: companyInfo?.name || 'Défibeo Solutions',
          expt_tel1: companyInfo?.phone || '+33147200001',
          expt_email: companyInfo?.email || 'contact@defibeo-solutions.com',
          dae_mobile: false
        },
        geometry: {
          type: 'MultiPoint',
          coordinates: [
            [lngNum, latNum]
          ]
        }
      };

      const geojsonCollection = {
        type: 'FeatureCollection',
        name: 'sql_statement',
        crs: {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:OGC:1.3:CRS84'
          }
        },
        features: [geojsonFeature]
      };

      return {
        id: df.id,
        identifiant: df.identifiant,
        numeroSerie: df.numeroSerie || 'N/A',
        geojson: geojsonCollection
      };
    });

    try {
      const response = await fetch('/api/atlasante/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          atlasanteUrlAuth,
          atlasanteDeclarantId,
          items
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setAtlasanteUploadResults(data.results || []);
      } else {
        setAtlasanteUploadResults(items.map(item => ({
          ...item,
          success: false,
          error: data.error || "Échec de l'authentification ou de l'upload",
          details: data.details || ""
        })));
      }
    } catch (err: any) {
      setAtlasanteUploadResults(items.map(item => ({
        ...item,
        success: false,
        error: err.message || "Erreur de connexion"
      })));
    } finally {
      setIsAtlasanteUploading(false);
      setIsAtlasantePaneOpen(true);
    }
  };

  const executeNouvelleTournee = () => {
    if (!onUpdateFsmTours) return;
    const missions = selectedIds.map((id, index) => {
      const defib = defibrillateurs.find(d => d.id === id);
      const client = clients.find(c => c.id === defib?.clientId);
      const clientName = defib?.nomSite || defib?.nomPrenomSite || (client ? client.denomination : 'Nom du Site');
      return {
        id: 'fsm-m-auto-' + Date.now() + '-' + index,
        clientName,
        defibIdentifiant: defib?.identifiant || 'PAR-101',
        equipmentType: 'Défibrillateur',
        reason: 'Maintenance',
        requiredParts: [],
        status: 'Brouillon',
        priority: 'Normale',
        time: '14:00'
      };
    });

    const newTour = {
      id: 'fsm-tour-auto-' + Date.now(),
      title: "Nouvelle tournée sans titre",
      techName: members.find((m: any) => m.role === 'Maintenance Terrain' || m.role?.toLowerCase().includes('tech'))?.name || members[0]?.name || '',
      startDate: new Date().toISOString().split('T')[0],
      status: 'Brouillon',
      missions
    };
    
    onUpdateFsmTours([...fsmTours, newTour]);
    
    // Reset selection and close dropdown
    setSelectedIds([]);
    setIsTourDropdownOpen(false);
    setSelectedDraftId(null);
    
    if (setActiveTab) {
      setActiveTab('fsm');
    }
  };

  const executeAddToTrier = () => {
    if (!onUpdateFsmTours) return;
    const missionsToAdd = selectedIds.map((id, index) => {
      const defib = defibrillateurs.find(d => d.id === id);
      const client = clients.find(c => c.id === defib?.clientId);
      const clientName = defib?.nomSite || defib?.nomPrenomSite || (client ? client.denomination : 'Nom du Site');
      return {
        id: 'fsm-m-auto-' + Date.now() + '-' + index,
        clientName,
        defibIdentifiant: defib?.identifiant || 'PAR-101',
        equipmentType: 'Défibrillateur',
        reason: 'Maintenance',
        requiredParts: [],
        status: 'Brouillon',
        priority: 'Normale',
        time: '14:00'
      };
    });

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

    if ((targetTour.status || 'Brouillon') !== 'Brouillon') {
      alert("Erreur : vous ne pouvez ajouter des missions qu'à une tournée en situation Brouillon.");
      return;
    }

    const updated = fsmTours.map(t => {
      if (t.id === targetTourId) {
        const addedMissions = selectedIds.map((id, index) => {
          const defib = defibrillateurs.find(d => d.id === id);
          const client = clients.find(c => c.id === defib?.clientId);
          const clientName = defib?.nomSite || defib?.nomPrenomSite || (client ? client.denomination : 'Nom du Site');
          return {
            id: 'fsm-m-auto-' + Date.now() + '-' + index,
            clientName,
            defibIdentifiant: defib?.identifiant || 'PAR-101',
            equipmentType: 'Défibrillateur',
            reason: 'Maintenance',
            requiredParts: [],
            status: 'Brouillon',
            priority: 'Normale',
            time: '14:00'
          };
        });
        return {
          ...t,
          missions: [...t.missions, ...addedMissions]
        };
      }
      return t;
    });

    onUpdateFsmTours(updated);

    // Reset selection and close dropdown
    setSelectedIds([]);
    setIsTourDropdownOpen(false);
    setSelectedDraftId(null);

    if (setActiveTab) {
      setActiveTab('fsm');
    }
  };

  // --- SECTIONS FIELD STATE (Form Fields) ---
  const [isSubmitChecking, setIsSubmitChecking] = useState(false);
  
  // Section 1 - Défibrillateur
  const [identifiant, setIdentifiant] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [modeleId, setModeleId] = useState('');
  const [numeroAtlasante, setNumeroAtlasante] = useState('');
  const [versionLogiciel, setVersionLogiciel] = useState('');

  const selectedModelVar = useMemo(() => {
    if (!modeleId) return null;
    return (variables || []).find(v => v.id === modeleId && v.category === 'Modèle Défibrillateur') || null;
  }, [modeleId, variables]);

  const isVisibleNumeroAtlasante = selectedModelVar ? (selectedModelVar.visibiliteNumeroAtlasante !== 'Non') : true;
  const isVisibleVersionLogiciel = selectedModelVar ? (selectedModelVar.visibiliteVersionLogiciel !== 'Non') : true;
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

  // Section 2 - Client Site Link (autopopulates from active client selection)
  const [clientId, setClientId] = useState('');
  const [nomSite, setNomSite] = useState('');
  const [categorieEtablissement, setCategorieEtablissement] = useState('');
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

  // Section 3 - Coffret
  const [modeleCoffretId, setModeleCoffretId] = useState('');
  const [numeroLotCoffret, setNumeroLotCoffret] = useState('');
  const [commentaireCoffret, setCommentaireCoffret] = useState('');

  // Section 4 - Accès
  const [numVoie, setNumVoie] = useState('');
  const [ville, setVille] = useState('');
  const [cp, setCp] = useState('');
  const [region, setRegion] = useState('');
  const [pays, setPays] = useState('France');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [tempLat, setTempLat] = useState<number>(48.8566);
  const [tempLng, setTempLng] = useState<number>(2.3522);
  const [commentaireAdresse, setCommentaireAdresse] = useState('');
  const [acces247, setAcces247] = useState(false);
  const [accesSemaine, setAccesSemaine] = useState(false);
  const [accesWeekend, setAccesWeekend] = useState(false);
  const [exterieur, setExterieur] = useState(false);

  // Horaires d'ouvertures
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
    // Check if the day is already taken in another block
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
    setSchedules(prev => [
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
    ]);
  };

  const handleRemoveSchedule = (idx: number) => {
    setSchedules(prev => prev.filter((_, i) => i !== idx));
  };

  // Ref to track the loaded address so we don't auto-geocode on initial open
  const loadedAddressRef = React.useRef({ numVoie: '', cp: '', ville: '', pays: '' });

  // Auto geocode address on interactive change/typing
  useEffect(() => {
    const trimmedVoie = numVoie.trim();
    const trimmedCp = cp.trim();
    const trimmedVille = ville.trim();
    const trimmedPays = pays.trim();

    // Check if current fields are identical to what was loaded (to prevent overwriting custom coords on form open)
    if (
      trimmedVoie === loadedAddressRef.current.numVoie &&
      trimmedCp === loadedAddressRef.current.cp &&
      trimmedVille === loadedAddressRef.current.ville &&
      trimmedPays === loadedAddressRef.current.pays
    ) {
      return;
    }

    const queryParts = [];
    if (trimmedVoie) queryParts.push(trimmedVoie);
    if (trimmedCp) queryParts.push(trimmedCp);
    if (trimmedVille) queryParts.push(trimmedVille);

    // Only geocode if we have at least a street or a city typed
    if (queryParts.length === 0 || (!trimmedVille && !trimmedVoie)) {
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      const isFranceInstance = !trimmedPays || trimmedPays.toLowerCase() === 'france' || trimmedPays.toLowerCase() === 'fr';

      if (isFranceInstance) {
        // Use the high-accuracy official French government database
        const frenchSearchQuery = `${trimmedVoie} ${trimmedCp} ${trimmedVille}`.trim();
        const apiGovUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(frenchSearchQuery)}&limit=1`;

        fetch(apiGovUrl)
          .then(res => res.json())
          .then(data => {
            if (data && data.features && data.features.length > 0) {
              const feature = data.features[0];
              if (feature.geometry && feature.geometry.coordinates) {
                const [lon, lat] = feature.geometry.coordinates;
                if (lat !== undefined && lon !== undefined) {
                  setLatitude(parseFloat(lat).toFixed(6));
                  setLongitude(parseFloat(lon).toFixed(6));
                }
              }
            }
          })
          .catch(err => {
            console.warn('Official French geocoding API error:', err);
          });
      } else {
        // Fallback or non-France countries: Try structured and then unstructured Nominatim
        let structuredUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1`;
        if (trimmedVoie) {
          structuredUrl += `&street=${encodeURIComponent(trimmedVoie)}`;
        }
        if (trimmedCp) {
          structuredUrl += `&postalcode=${encodeURIComponent(trimmedCp)}`;
        }
        if (trimmedVille) {
          structuredUrl += `&city=${encodeURIComponent(trimmedVille)}`;
        }
        if (trimmedPays) {
          structuredUrl += `&country=${encodeURIComponent(trimmedPays)}`;
        }

        fetch(structuredUrl)
          .then(res => res.json())
          .then(data => {
            if (data && data.length > 0 && data[0].lat && data[0].lon) {
              setLatitude(parseFloat(data[0].lat).toFixed(6));
              setLongitude(parseFloat(data[0].lon).toFixed(6));
            } else {
              const freeQueryParts = [];
              if (trimmedVoie) freeQueryParts.push(trimmedVoie);
              if (trimmedCp) freeQueryParts.push(trimmedCp);
              if (trimmedVille) freeQueryParts.push(trimmedVille);
              if (trimmedPays) freeQueryParts.push(trimmedPays);
              const searchQuery = freeQueryParts.join(', ');

              fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`)
                .then(res => res.json())
                .then(fallbackData => {
                  if (fallbackData && fallbackData.length > 0 && fallbackData[0].lat && fallbackData[0].lon) {
                    setLatitude(parseFloat(fallbackData[0].lat).toFixed(6));
                    setLongitude(parseFloat(fallbackData[0].lon).toFixed(6));
                  }
                })
                .catch(err => console.warn('Free-form geocoding fallback error:', err));
            }
          })
          .catch(err => {
            console.warn('Geocoding error:', err);
          });
      }
    }, 800);

    return () => clearTimeout(delayDebounceFn);
  }, [numVoie, cp, ville, pays]);

  // Section 5 - Dates
  const [finGarantie, setFinGarantie] = useState('');
  const [fabrication, setFabrication] = useState('');
  const [miseEnService, setMiseEnService] = useState('');
  const [derniereMaintenance, setDerniereMaintenance] = useState('');
  const [sortieFabricant, setSortieFabricant] = useState('');

  // Section 6 - Électrode Mixte ou Adulte (A)
  const [hasElectrodeASecours, setHasElectrodeASecours] = useState<'Oui' | 'Non'>('Non');
  const [modeleElectrodeAId, setModeleElectrodeAId] = useState('');
  const [lotElectrodeA, setLotElectrodeA] = useState('');
  const [insertionElectrodeA, setInsertionElectrodeA] = useState('');
  const [peremptionElectrodeA, setPeremptionElectrodeA] = useState('');
  const [livraisonElectrodeA, setLivraisonElectrodeA] = useState('');
  const [situationElectrodeA, setSituationElectrodeA] = useState<'Vert' | 'Orange' | 'Rouge'>('Vert');
  const [commentaireElectrodeA, setCommentaireElectrodeA] = useState('');
  const [peremptionSecoursElectrodeA, setPeremptionSecoursElectrodeA] = useState('');
  const [modeleElectrodeASecoursId, setModeleElectrodeASecoursId] = useState('');
  const [lotElectrodeASecours, setLotElectrodeASecours] = useState('');
  const [lotPadpakA, setLotPadpakA] = useState('');
  const [peremptionPadpakA, setPeremptionPadpakA] = useState('');
  const [hasPadpakA, setHasPadpakA] = useState<'Oui' | 'Non'>('Oui');

  // Section 7 - Électrode Pédiatrique (P)
  const [hasElectrodePSecours, setHasElectrodePSecours] = useState<'Oui' | 'Non'>('Non');
  const [modeleElectrodePId, setModeleElectrodePId] = useState('');
  const [lotElectrodeP, setLotElectrodeP] = useState('');
  const [insertionElectrodeP, setInsertionElectrodeP] = useState('');
  const [peremptionElectrodeP, setPeremptionElectrodeP] = useState('');
  const [livraisonElectrodeP, setLivraisonElectrodeP] = useState('');
  const [situationElectrodeP, setSituationElectrodeP] = useState<'Vert' | 'Orange' | 'Rouge'>('Vert');
  const [commentaireElectrodeP, setCommentaireElectrodeP] = useState('');
  const [peremptionSecoursElectrodeP, setPeremptionSecoursElectrodeP] = useState('');
  const [modeleElectrodePSecoursId, setModeleElectrodePSecoursId] = useState('');
  const [lotElectrodePSecours, setLotElectrodePSecours] = useState('');
  const [lotPadpakP, setLotPadpakP] = useState('');
  const [peremptionPadpakP, setPeremptionPadpakP] = useState('');
  const [hasPadpakP, setHasPadpakP] = useState<'Oui' | 'Non'>('Oui');

  // Section 8 - Batterie (B)
  const [hasBatterieSecours, setHasBatterieSecours] = useState<'Oui' | 'Non'>('Non');
  const [modeleBatterieId, setModeleBatterieId] = useState('');
  const [lotBatterie, setLotBatterie] = useState('');
  const [insertionBatterie, setInsertionBatterie] = useState('');
  const [fabricationBatterie, setFabricationBatterie] = useState('');
  const [peremptionBatterie, setPeremptionBatterie] = useState('');
  const [livraisonBatterie, setLivraisonBatterie] = useState('');
  const [situationBatterie, setSituationBatterie] = useState<'Vert' | 'Orange' | 'Rouge'>('Vert');
  const [pourcentageBatterie, setPourcentageBatterie] = useState('100');
  const [commentaireBatterie, setCommentaireBatterie] = useState('');
  const [modeleBatterieSecoursId, setModeleBatterieSecoursId] = useState('');
  const [lotBatterieSecours, setLotBatterieSecours] = useState('');
  const [peremptionBatterieSecours, setPeremptionBatterieSecours] = useState('');
  const [peremptionTrousse, setPeremptionTrousse] = useState('');

  // Section 9 - Catégories
  const [loue, setLoue] = useState<'Oui' | 'Non'>('Non');
  const [prete, setPrete] = useState<'Oui' | 'Non'>('Non');
  const [stocke, setStocke] = useState<'Oui' | 'Non'>('Non');
  const [archive, setArchive] = useState<'Oui' | 'Non'>('Non');
  const [conforme, setConforme] = useState<'Oui' | 'Non'>('Oui');
  const [sousTraitance, setSousTraitance] = useState<'Oui' | 'Non'>('Non');
  const [fsmAutorise, setFsmAutorise] = useState<'Oui' | 'Non'>('Oui');
  const [victimeSurvie, setVictimeSurvie] = useState<'Oui' | 'Non'>('Non');
  const [victimeSansSurvie, setVictimeSansSurvie] = useState<'Oui' | 'Non'>('Non');
  const [ageVictime, setAgeVictime] = useState('0');
  const [commentaireCampagneRappel, setCommentaireCampagneRappel] = useState('');
  const [rappelMensuelAuto, setRappelMensuelAuto] = useState<'Oui' | 'Non'>('Non');
  const [rappelHebdoAuto, setRappelHebdoAuto] = useState<'Oui' | 'Non'>('Non');
  const [rappelJournalierAuto, setRappelJournalierAuto] = useState<'Oui' | 'Non'>('Non');

  const [formError, setFormError] = useState('');

  // --- BULK EDIT FIELDS ---
  const [bulkApplyModele, setBulkApplyModele] = useState(false);
  const [bulkModeleId, setBulkModeleId] = useState('');

  const [bulkApplyCommentaire, setBulkApplyCommentaire] = useState(false);
  const [bulkCommentaire, setBulkCommentaire] = useState('');

  const [bulkApplyDerniereMaint, setBulkApplyDerniereMaint] = useState(false);
  const [bulkDerniereMaint, setBulkDerniereMaint] = useState('');

  const [bulkApplyProchaineMaint, setBulkApplyProchaineMaint] = useState(false);
  const [bulkProchaineMaint, setBulkProchaineMaint] = useState('');

  const [bulkApplyArchive, setBulkApplyArchive] = useState(false);
  const [bulkArchive, setBulkArchive] = useState<'Oui' | 'Non'>('Non');

  const [bulkApplyConforme, setBulkApplyConforme] = useState(false);
  const [bulkConforme, setBulkConforme] = useState<'Oui' | 'Non'>('Oui');

  const [bulkApplyFsmAutorise, setBulkApplyFsmAutorise] = useState(false);
  const [bulkFsmAutorise, setBulkFsmAutorise] = useState<'Oui' | 'Non'>('Oui');

  const [bulkApplyRappelMensuelAuto, setBulkApplyRappelMensuelAuto] = useState(false);
  const [bulkRappelMensuelAuto, setBulkRappelMensuelAuto] = useState<'Oui' | 'Non'>('Non');

  // --- LOOKUP INDEXES ---
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const variableMap = useMemo(() => new Map(variables.map(v => [v.id, v])), [variables]);

  // Variables categorized lists for fast lookup selects
  const modelesDefib = useMemo(() => variables.filter(v => v.category === 'Modèle Défibrillateur'), [variables]);
  const modelesCoffret = useMemo(() => variables.filter(v => v.category === 'Modèle Coffret'), [variables]);
  const modelesElectrode = useMemo(() => variables.filter(v => v.category === 'Modèle Électrode'), [variables]);
  const modelesBatterie = useMemo(() => variables.filter(v => v.category === 'Modèle Batterie'), [variables]);

  // Autopopulate site / contract fields on Client lookup change
  const handleClientChange = (selectedClientId: string) => {
    setClientId(selectedClientId);
    const linkedClient = clientMap.get(selectedClientId);
    if (linkedClient) {
      setNomPrenomSite(linkedClient.nomPrenomSite || '');
      setTelephoneSite(linkedClient.telephoneSite || '');
      setEmailSite(linkedClient.emailSite || '');
      setContrat(linkedClient.contrat || 'Non');
      setNomContrat(linkedClient.nomContrat || '');
      setReferenceContrat(linkedClient.referenceContrat || '');
      setDebutContrat(linkedClient.debutContrat || '');
      setFinContrat(linkedClient.finContrat || '');
      setPayeurId(linkedClient.payeurId || '');
      setClientIdField(linkedClient.clientIdField || '');
    } else {
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
  };

  // List search & filters computation
  const filteredDefibs = useMemo(() => {
    return defibrillateurs.filter(df => {
      const clientName = clientMap.get(df.clientId)?.denomination || '';
      const modelName = variableMap.get(df.modeleId)?.nom || '';
      const isMatchSearch =
        (df.identifiant || '').toLowerCase().includes(search.toLowerCase()) ||
        (df.numeroSerie || '').toLowerCase().includes(search.toLowerCase()) ||
        (df.numeroAtlasante || '').toLowerCase().includes(search.toLowerCase()) ||
        (df.versionLogiciel || '').toLowerCase().includes(search.toLowerCase()) ||
        (df.ville || '').toLowerCase().includes(search.toLowerCase()) ||
        (clientName || '').toLowerCase().includes(search.toLowerCase()) ||
        (modelName || '').toLowerCase().includes(search.toLowerCase()) ||
        (df.nomPrenomSite || '').toLowerCase().includes(search.toLowerCase()) ||
        (df.nomSite || '').toLowerCase().includes(search.toLowerCase()) ||
        (df.categorieEtablissement || '').toLowerCase().includes(search.toLowerCase());

      const isMatchRegion = activeFilters.region === 'Tous' || df.region === activeFilters.region;
      const isMatchModele = activeFilters.modeleId === 'Tous' || df.modeleId === activeFilters.modeleId;

      // Dates logic
      const datesToCheck: Date[] = [];
      const mDate = parseDateHelper(computeProchaineMaintenance(df.derniereMaintenance));
      if (mDate) datesToCheck.push(mDate);
      const eADate = parseDateHelper(df.peremptionElectrodeA);
      if (eADate) datesToCheck.push(eADate);
      const ePDate = parseDateHelper(df.peremptionElectrodeP);
      if (ePDate) datesToCheck.push(ePDate);
      const bDate = parseDateHelper(df.peremptionBatterie);
      if (bDate) datesToCheck.push(bDate);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const getDaysDiff = (targetDate: Date) => {
        const checkDate = new Date(targetDate);
        checkDate.setHours(0, 0, 0, 0);
        const diffTime = checkDate.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      };

      const hasExpired = datesToCheck.some(d => {
        const checkDate = new Date(d);
        checkDate.setHours(0, 0, 0, 0);
        return checkDate < today;
      });

      const hasUnder3Months = datesToCheck.some(d => {
        const dDiff = getDaysDiff(d);
        return dDiff >= 0 && dDiff < 90;
      });

      const hasUnder6Months = datesToCheck.some(d => {
        const dDiff = getDaysDiff(d);
        return dDiff >= 90 && dDiff <= 180;
      });

      // 3. Action 3-6 Mois Match
      const isMatchAction3To6 = !activeFilters.action3To6 || hasUnder6Months;

      // 4. Action 3 Mois Match
      const isMatchActionUnder3 = !activeFilters.actionUnder3 || hasUnder3Months;

      // 5. Action Expired Match
      const isMatchActionExpired = !activeFilters.actionExpired || hasExpired;

      // 6. Catégorie Match (Loué, Prêté, Stocké, Archivé, Sous-Traitance)
      let isMatchCategorie = true;
      if (activeFilters.categorie !== 'Tous') {
        const cat = activeFilters.categorie;
        if (cat === 'Loué') isMatchCategorie = df.loue === 'Oui';
        else if (cat === 'Prêté') isMatchCategorie = df.prete === 'Oui';
        else if (cat === 'Stocké') isMatchCategorie = df.stocke === 'Oui';
        else if (cat === 'Archivé') isMatchCategorie = df.archive === 'Oui';
        else if (cat === 'Sous-Traitance') isMatchCategorie = df.sousTraitance === 'Oui';
      }

      // 7. Contrat Match
      const clientObj = clientMap.get(df.clientId);
      const activeContrat = clientObj ? (clientObj.contrat || 'Non') : (df.contrat || 'Non');
      const isMatchContrat = activeFilters.contrat === 'Tous' || activeContrat === activeFilters.contrat;

      // 8. Rejeté Match
      const hasBeenRejected = (fsmTours || []).some((t: any) => 
        t.missions?.some((m: any) => 
          m.defibIdentifiant === df.identifiant && m.status !== 'Effectué' && m.rejectionReason
        )
      );
      const isMatchRejected = !activeFilters.actionRejected || hasBeenRejected;

      return isMatchSearch && 
             isMatchRegion && 
             isMatchModele &&
             isMatchAction3To6 &&
             isMatchActionUnder3 &&
             isMatchActionExpired &&
             isMatchCategorie &&
             isMatchContrat &&
             isMatchRejected;
    });
  }, [defibrillateurs, search, activeFilters, clientMap, variableMap, fsmTours]);

  // Synchronization components for top and bottom horizontal scrollbars
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const bottomScrollRef = React.useRef<HTMLDivElement>(null);
  const theadRef = React.useRef<HTMLTableSectionElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState<number>(0);

  const handleTopScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  const updateHeaderStickyPosition = React.useCallback(() => {
    if (!bottomScrollRef.current || !theadRef.current) return;
    const rect = bottomScrollRef.current.getBoundingClientRect();
    const theadHeight = theadRef.current.offsetHeight || 40;
    
    let translateY = 0;
    // We want the headers to stick to the top of the viewport (0px)
    if (rect.top < 0) {
      const maxTranslate = rect.height - theadHeight - 60; // leave some room for table bottom
      translateY = Math.max(0, Math.min(maxTranslate, -rect.top));
    }
    
    const ths = theadRef.current.querySelectorAll('th');
    ths.forEach(th => {
      (th as HTMLElement).style.transform = `translateY(${translateY}px)`;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', updateHeaderStickyPosition, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateHeaderStickyPosition);
    };
  }, [updateHeaderStickyPosition]);

  useEffect(() => {
    if (!bottomScrollRef.current) return;

    const updateWidth = () => {
      if (bottomScrollRef.current) {
        setTableScrollWidth(bottomScrollRef.current.scrollWidth);
        updateHeaderStickyPosition();
      }
    };

    // Delay slightly to make sure the DOM has rendered completely
    const timer = setTimeout(updateWidth, 100);

    const observer = new ResizeObserver(updateWidth);
    observer.observe(bottomScrollRef.current);

    window.addEventListener('resize', updateWidth);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [filteredDefibs, isFormOpen, updateHeaderStickyPosition]);

  // Row selectors
  const handleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredDefibs.map(df => df.id));
    } else {
      setSelectedIds([]);
    }
  };

  const isAllSelected = filteredDefibs.length > 0 && selectedIds.length === filteredDefibs.length;

  // Re-roll random identifiant button helper
  const reRollIdentifiant = () => {
    const existingIds = defibrillateurs.map(df => df.identifiant);
    const code = generateRandomShortCode(existingIds);
    setIdentifiant(code);
  };

  // Populate form state for creation
  const openAddForm = () => {
    setEditingDefib(null);
    setFormError('');

    // Clear loaded address ref to allow auto geocoding for new items
    loadedAddressRef.current = { numVoie: '', cp: '', ville: '', pays: 'France' };

    // Pre-roll unique randomized code
    const existingIds = defibrillateurs.map(df => df.identifiant);
    setIdentifiant(generateRandomShortCode(existingIds));

    // Reset standard fields
    setNumeroSerie('');
    setCommentaire('');
    setNumeroAtlasante('');
    setVersionLogiciel('');
    // Auto-select to the most recently created model variable, or CSPG5, or the first model
    const defaultModel = modelesDefib.length > 0 ? modelesDefib[modelesDefib.length - 1] : null;
    setModeleId(defaultModel ? defaultModel.id : '');

    // Reset client to empty, autotriggering copy
    setClientId('');
    setNomSite('');
    setCategorieEtablissement('');
    setClientSearchQuery('');
    handleClientChange('');

    // Reset Coffret
    setModeleCoffretId('');
    setNumeroLotCoffret('');
    setCommentaireCoffret('');

    // Reset Accès
    setNumVoie('');
    setVille('');
    setCp('');
    setRegion('');
    setLatitude('');
    setLongitude('');
    setPays('France');
    setCommentaireAdresse('');
    setAcces247(false);
    setAccesSemaine(true);
    setAccesWeekend(false);
    setExterieur(false);
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

    // Dates
    setFinGarantie('');
    setFabrication('');
    setMiseEnService('');
    setDerniereMaintenance('');
    setSortieFabricant('');

    // Electrodes Mixed/Adult (A)
    setHasElectrodeASecours('Non');
    setModeleElectrodeAId('');
    setLotElectrodeA('');
    setInsertionElectrodeA('');
    setPeremptionElectrodeA('');
    setLivraisonElectrodeA('');
    setSituationElectrodeA('Vert');
    setCommentaireElectrodeA('');
    setPeremptionSecoursElectrodeA('');
    setModeleElectrodeASecoursId('');
    setLotElectrodeASecours('');
    setLotPadpakA('');
    setPeremptionPadpakA('');
    setHasPadpakA('Oui');

    // Electrodes Pediatric (P)
    setHasElectrodePSecours('Non');
    setModeleElectrodePId('');
    setLotElectrodeP('');
    setInsertionElectrodeP('');
    setPeremptionElectrodeP('');
    setLivraisonElectrodeP('');
    setSituationElectrodeP('Vert');
    setCommentaireElectrodeP('');
    setPeremptionSecoursElectrodeP('');
    setModeleElectrodePSecoursId('');
    setLotElectrodePSecours('');
    setLotPadpakP('');
    setPeremptionPadpakP('');
    setHasPadpakP('Oui');

    // Battery (B)
    setHasBatterieSecours('Non');
    setModeleBatterieId('');
    setLotBatterie('');
    setInsertionBatterie('');
    setFabricationBatterie('');
    setPeremptionBatterie('');
    setLivraisonBatterie('');
    setSituationBatterie('Vert');
    setPourcentageBatterie('');
    setCommentaireBatterie('');
    setModeleBatterieSecoursId('');
    setLotBatterieSecours('');
    setPeremptionBatterieSecours('');

    // Categories
    setLoue('Non');
    setPrete('Non');
    setStocke('Non');
    setArchive('Non');
    setConforme('Oui');
    setSousTraitance('Non');
    setFsmAutorise('Oui');
    setVictimeSurvie('Non');
    setVictimeSansSurvie('Non');
    setAgeVictime('0');
    setCommentaireCampagneRappel('');
    setRappelMensuelAuto('Non');
    setRappelHebdoAuto('Non');
    setRappelJournalierAuto('Non');

    setIsFormOpen(true);
  };

  // Populate state for editing
  const openEditForm = (df: Defibrillateur) => {
    setEditingDefib(df);
    setFormError('');

    // Load initial address values to avoid auto geocoding immediately on load
    loadedAddressRef.current = {
      numVoie: df.numVoie || '',
      cp: df.cp || '',
      ville: df.ville || '',
      pays: df.pays || 'France'
    };

    setIdentifiant(df.identifiant);
    setNumeroSerie(df.numeroSerie);
    setCommentaire(df.commentaire || '');
    setModeleId(df.modeleId);
    setNumeroAtlasante(df.numeroAtlasante || '');
    setVersionLogiciel(df.versionLogiciel || '');

    setClientId(df.clientId);
    const linkedClient = clients.find(c => c.id === df.clientId);
    setClientSearchQuery(linkedClient ? `${linkedClient.denomination} (${linkedClient.siret || ''})` : '');
    setNomSite(df.nomSite || '');
    setCategorieEtablissement(df.categorieEtablissement || '');
    setNomPrenomSite(df.nomPrenomSite || '');
    setTelephoneSite(df.telephoneSite || '');
    setEmailSite(df.emailSite || '');
    setContrat(df.contrat || 'Non');
    setNomContrat(df.nomContrat || '');
    setReferenceContrat(df.referenceContrat || '');
    setDebutContrat(df.debutContrat || '');
    setFinContrat(df.finContrat || '');
    setPayeurId(df.payeurId || '');
    setClientIdField(df.clientIdField || '');

    setModeleCoffretId(df.modeleCoffretId || '');
    setNumeroLotCoffret(df.numeroLotCoffret || '');
    setCommentaireCoffret(df.commentaireCoffret || '');

    setNumVoie(df.numVoie || '');
    setVille(df.ville || '');
    setCp(df.cp || '');
    setRegion(df.region || 'Île-de-France');
    setPays(df.pays || 'France');
    setLatitude(df.latitude || '48.8566');
    setLongitude(df.longitude || '2.3522');
    setCommentaireAdresse(df.commentaireAdresse || '');
    setAcces247(!!df.acces247);
    setAccesSemaine(!!df.accesSemaine);
    setAccesWeekend(!!df.accesWeekend);
    setExterieur(!!df.exterieur);

    if (df.horaires) {
      try {
        setSchedules(JSON.parse(df.horaires));
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

    setFinGarantie(df.finGarantie || '');
    setFabrication(df.fabrication || '');
    setMiseEnService(df.miseEnService || '');
    setDerniereMaintenance(df.derniereMaintenance || '');
    setSortieFabricant(df.sortieFabricant || '');

    setHasElectrodeASecours(df.hasElectrodeASecours || (df.modeleElectrodeASecoursId || df.lotElectrodeASecours || df.peremptionSecoursElectrodeA ? 'Oui' : 'Non'));
    setModeleElectrodeAId(df.modeleElectrodeAId || '');
    setLotElectrodeA(df.lotElectrodeA || '');
    setInsertionElectrodeA(df.insertionElectrodeA || '');
    setPeremptionElectrodeA(df.peremptionElectrodeA || '');
    setLivraisonElectrodeA(df.livraisonElectrodeA || '');
    setSituationElectrodeA(df.situationElectrodeA || 'Vert');
    setCommentaireElectrodeA(df.commentaireElectrodeA || '');
    setPeremptionSecoursElectrodeA(df.peremptionSecoursElectrodeA || '');
    setModeleElectrodeASecoursId(df.modeleElectrodeASecoursId || '');
    setLotElectrodeASecours(df.lotElectrodeASecours || '');
    setLotPadpakA(df.lotPadpakA || '');
    setPeremptionPadpakA(df.peremptionPadpakA || '');
    setHasPadpakA(df.hasPadpakA || 'Oui');

    setHasElectrodePSecours(df.hasElectrodePSecours || (df.modeleElectrodePSecoursId || df.lotElectrodePSecours || df.peremptionSecoursElectrodeP ? 'Oui' : 'Non'));
    setModeleElectrodePId(df.modeleElectrodePId || '');
    setLotElectrodeP(df.lotElectrodeP || '');
    setInsertionElectrodeP(df.insertionElectrodeP || '');
    setPeremptionElectrodeP(df.peremptionElectrodeP || '');
    setLivraisonElectrodeP(df.livraisonElectrodeP || '');
    setSituationElectrodeP(df.situationElectrodeP || 'Vert');
    setCommentaireElectrodeP(df.commentaireElectrodeP || '');
    setPeremptionSecoursElectrodeP(df.peremptionSecoursElectrodeP || '');
    setModeleElectrodePSecoursId(df.modeleElectrodePSecoursId || '');
    setLotElectrodePSecours(df.lotElectrodePSecours || '');
    setLotPadpakP(df.lotPadpakP || '');
    setPeremptionPadpakP(df.peremptionPadpakP || '');
    setHasPadpakP(df.hasPadpakP || 'Oui');

    setHasBatterieSecours(df.hasBatterieSecours || (df.modeleBatterieSecoursId || df.lotBatterieSecours || df.peremptionBatterieSecours ? 'Oui' : 'Non'));
    setModeleBatterieId(df.modeleBatterieId || '');
    setLotBatterie(df.lotBatterie || '');
    setInsertionBatterie(df.insertionBatterie || '');
    setFabricationBatterie(df.fabricationBatterie || '');
    setPeremptionBatterie(df.peremptionBatterie || '');
    setLivraisonBatterie(df.livraisonBatterie || '');
    setSituationBatterie(df.situationBatterie || 'Vert');
    setPourcentageBatterie(df.pourcentageBatterie || '100');
    setCommentaireBatterie(df.commentaireBatterie || '');
    setModeleBatterieSecoursId(df.modeleBatterieSecoursId || '');
    setLotBatterieSecours(df.lotBatterieSecours || '');
    setPeremptionBatterieSecours(df.peremptionBatterieSecours || '');
    setPeremptionTrousse(df.peremptionTrousse || '');

    setLoue(df.loue || 'Non');
    setPrete(df.prete || 'Non');
    setStocke(df.stocke || 'Non');
    setArchive(df.archive || 'Non');
    setConforme(df.conforme || 'Oui');
    setSousTraitance(df.sousTraitance || 'Non');
    setFsmAutorise(df.fsmAutorise || 'Oui');
    setVictimeSurvie(df.victimeSurvie || 'Non');
    setVictimeSansSurvie(df.victimeSansSurvie || 'Non');
    setAgeVictime(df.ageVictime || '0');
    setCommentaireCampagneRappel(df.commentaireCampagneRappel || '');
    setRappelMensuelAuto(df.rappelMensuelAuto || 'Non');
    setRappelHebdoAuto(df.rappelHebdoAuto || 'Non');
    setRappelJournalierAuto(df.rappelJournalierAuto || 'Non');

    setIsFormOpen(true);
  };

   // Submit handler
   const handleFormSubmit = async (e?: React.FormEvent): Promise<boolean> => {
     if (e) e.preventDefault();
     if (isSubmitChecking) return false;
     setFormError('');
 
     // Validation
     if (!identifiant.trim()) {
       setFormError('L\'identifiant unique est requis.');
       return false;
     }
     if (!numeroSerie.trim()) {
       setFormError('Le numéro de série est requis.');
       return false;
     }
 
 
     setIsSubmitChecking(true);
     try {
       // 1. Block Duplicates of Identifiant on creation/editing in local environment
       const isDuplicate = defibrillateurs.some(
         df => (df.identifiant || '').toLowerCase() === identifiant.trim().toLowerCase() && df.id !== editingDefib?.id
       );
       if (isDuplicate) {
         setFormError(`L'identifiant "${identifiant}" existe déjà pour un autre appareil. Reroulez un code unique svp.`);
         setIsSubmitChecking(false);
         return false;
       }
 
       // 2. Block Duplicates globally across ALL environments/tenants
       const identifiantChanged = !editingDefib || (editingDefib.identifiant || '').trim().toUpperCase() !== identifiant.trim().toUpperCase();
       if (identifiantChanged) {
         const globalCheck = await checkIfDefibIdentifiantExistsAnywhere(identifiant, editingDefib?.id);
         if (globalCheck.exists) {
           setFormError(`L'identifiant "${identifiant.toUpperCase()}" existe déjà dans un autre environnement (${globalCheck.tenantName || 'externe'}). L'identifiant doit être unique à travers tous les environnements.`);
           setIsSubmitChecking(false);
           return false;
         }
       }
     } catch (err) {
       console.error('Error validating defibrillator identifier:', err);
      }

      const payload = {
      identifiant: identifiant.trim().toUpperCase(),
      numeroAtlasante: numeroAtlasante.trim(),
      versionLogiciel: versionLogiciel.trim(),
      numeroSerie: numeroSerie.trim(),
      commentaire: commentaire.trim(),
      modeleId,

      clientId,
      nomSite: nomSite.trim(),
      categorieEtablissement: categorieEtablissement.trim(),
      nomPrenomSite: nomPrenomSite.trim(),
      telephoneSite: telephoneSite.trim(),
      emailSite: emailSite.trim(),
      contrat,
      nomContrat: nomContrat.trim(),
      referenceContrat: referenceContrat.trim(),
      debutContrat,
      finContrat,
      payeurId: payeurId.trim(),
      clientIdField: clientIdField.trim(),

      modeleCoffretId,
      numeroLotCoffret: numeroLotCoffret.trim(),
      commentaireCoffret: commentaireCoffret.trim(),

      numVoie: numVoie.trim(),
      ville: ville.trim(),
      cp: cp.trim(),
      region,
      pays,
      latitude,
      longitude,
      commentaireAdresse: commentaireAdresse.trim(),
      acces247,
      accesSemaine,
      accesWeekend,
      exterieur,
      horaires: JSON.stringify(schedules),

      finGarantie,
      fabrication,
      miseEnService,
      derniereMaintenance,
      sortieFabricant,

      modeleElectrodeAId,
      lotElectrodeA: lotElectrodeA.trim(),
      insertionElectrodeA,
      peremptionElectrodeA,
      livraisonElectrodeA,
      situationElectrodeA,
      commentaireElectrodeA: commentaireElectrodeA.trim(),
      hasElectrodeASecours,
      peremptionSecoursElectrodeA: hasElectrodeASecours === 'Oui' ? peremptionSecoursElectrodeA : '',
      modeleElectrodeASecoursId: hasElectrodeASecours === 'Oui' ? modeleElectrodeASecoursId : '',
      lotElectrodeASecours: hasElectrodeASecours === 'Oui' ? lotElectrodeASecours.trim() : '',
      hasPadpakA,
      lotPadpakA: hasPadpakA === 'Oui' ? lotPadpakA.trim() : '',
      peremptionPadpakA: hasPadpakA === 'Oui' ? peremptionPadpakA : '',

      modeleElectrodePId,
      lotElectrodeP: lotElectrodeP.trim(),
      insertionElectrodeP,
      peremptionElectrodeP,
      livraisonElectrodeP,
      situationElectrodeP,
      commentaireElectrodeP: commentaireElectrodeP.trim(),
      hasElectrodePSecours,
      peremptionSecoursElectrodeP: hasElectrodePSecours === 'Oui' ? peremptionSecoursElectrodeP : '',
      modeleElectrodePSecoursId: hasElectrodePSecours === 'Oui' ? modeleElectrodePSecoursId : '',
      lotElectrodePSecours: hasElectrodePSecours === 'Oui' ? lotElectrodePSecours.trim() : '',
      hasPadpakP,
      lotPadpakP: hasPadpakP === 'Oui' ? lotPadpakP.trim() : '',
      peremptionPadpakP: hasPadpakP === 'Oui' ? peremptionPadpakP : '',

      modeleBatterieId,
      lotBatterie: lotBatterie.trim(),
      insertionBatterie,
      fabricationBatterie,
      peremptionBatterie,
      livraisonBatterie,
      situationBatterie,
      pourcentageBatterie: pourcentageBatterie.trim(),
      commentaireBatterie: commentaireBatterie.trim(),
      hasBatterieSecours,
      modeleBatterieSecoursId: hasBatterieSecours === 'Oui' ? modeleBatterieSecoursId : '',
      lotBatterieSecours: hasBatterieSecours === 'Oui' ? lotBatterieSecours.trim() : '',
      peremptionBatterieSecours: hasBatterieSecours === 'Oui' ? peremptionBatterieSecours : '',
      peremptionTrousse,

      loue,
      prete,
      stocke,
      archive,
      conforme,
      sousTraitance,
      fsmAutorise,
      victimeSurvie,
      victimeSansSurvie,
      ageVictime: ageVictime.trim(),
      commentaireCampagneRappel: commentaireCampagneRappel.trim(),
      rappelMensuelAuto,
      rappelHebdoAuto,
      rappelJournalierAuto,
    };

    if (editingDefib) {
      onUpdateDefib({
        id: editingDefib.id,
        ...payload,
      });
    } else {
      onAddDefib(payload);
    }

    setIsFormOpen(false);
    setIsSubmitChecking(false);
    return true;
  };

  const handleSaveAndRedirectToVariables = async () => {
    if (identifiant.trim() && numeroSerie.trim()) {
      await handleFormSubmit();
    } else {
      setIsFormOpen(false);
    }
    if (setActiveTab) {
      setActiveTab('variables', true);
    }
  };

  // Bulk Edit submission
  const handleBulkEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const subtractOneYear = (dateStr: string): string => {
      if (!dateStr) return '';
      const p = dateStr.split('-');
      if (p.length === 3) {
        const year = parseInt(p[0], 10);
        return `${year - 1}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
      }
      return dateStr;
    };

    const updates: Partial<Omit<Defibrillateur, 'id'>> = {};
    if (bulkApplyModele) updates.modeleId = bulkModeleId;
    if (bulkApplyCommentaire) updates.commentaire = bulkCommentaire;
    if (bulkApplyDerniereMaint) updates.derniereMaintenance = bulkDerniereMaint;
    if (bulkApplyProchaineMaint) {
      updates.derniereMaintenance = subtractOneYear(bulkProchaineMaint);
    }
    if (bulkApplyArchive) updates.archive = bulkArchive;
    if (bulkApplyConforme) updates.conforme = bulkConforme;
    if (bulkApplyFsmAutorise) updates.fsmAutorise = bulkFsmAutorise;
    if (bulkApplyRappelMensuelAuto) updates.rappelMensuelAuto = bulkRappelMensuelAuto;

    if (Object.keys(updates).length > 0) {
      onBulkEdit(selectedIds, updates);
    }

    // Reset fields to original/safe defaults
    setBulkApplyModele(false);
    setBulkModeleId('');
    setBulkApplyCommentaire(false);
    setBulkCommentaire('');
    setBulkApplyDerniereMaint(false);
    setBulkDerniereMaint('');
    setBulkApplyProchaineMaint(false);
    setBulkProchaineMaint('');
    setBulkApplyArchive(false);
    setBulkArchive('Non');
    setBulkApplyConforme(false);
    setBulkConforme('Oui');
    setBulkApplyFsmAutorise(false);
    setBulkFsmAutorise('Oui');
    setBulkApplyRappelMensuelAuto(false);
    setBulkRappelMensuelAuto('Non');

    setIsBulkEditOpen(false);
    setSelectedIds([]);
  };

  // Bulk deletion
  const handleBulkDeleteAction = () => {
    onBulkDelete(selectedIds);
    setSelectedIds([]);
  };

  // Safe search resetting helper
  const clearFilters = () => {
    setSearch('');
    const defaults = {
      region: 'Tous',
      modeleId: 'Tous',
      action3To6: false,
      actionUnder3: false,
      actionExpired: false,
      categorie: 'Tous',
      contrat: 'Tous',
    };
    setActiveFilters(defaults);
    setDraftFilters(defaults);
  };

  return (
    <div className="space-y-6" id="defib-tab-container">
      {!isFormOpen && (
        <>
          {/* Top action block & Search metrics */}
          <div 
            className="bg-white space-y-4"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold tracking-tight font-gochi" style={{ color: '#000000', cursor: 'default' }}>{t('Défibrillateurs')}</h2>
              </div>

              {/* Both search and buttons are placed directly next to the title */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Field recherche (Search input) with size reduced */}
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    id="search-defibs-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('Recherche.')}
                    className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                    style={searchInputStyle}
                    onMouseEnter={() => setIsSearchHovered(true)}
                    onMouseLeave={() => setIsSearchHovered(false)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsFilterPaneOpen(true)}
                  id="btn-trigger-filters"
                  style={customButtonStyle}
                >
                  <span>{t('Filtres')}</span>
                  {(() => {
                    const count = [
                      activeFilters.region !== 'Tous',
                      activeFilters.modeleId !== 'Tous',
                      activeFilters.action3To6 === true,
                      activeFilters.actionUnder3 === true,
                      activeFilters.actionExpired === true,
                      activeFilters.categorie !== 'Tous',
                      activeFilters.contrat !== 'Tous',
                      activeFilters.actionRejected === true,
                    ].filter(Boolean).length;
                    return count > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-black text-white bg-[#fe4eba] rounded-full ml-1">
                        {count}
                      </span>
                    ) : null;
                  })()}
                </button>
                <button
                  onClick={() => setIsMapOpen(true)}
                  id="btn-open-map"
                  style={customButtonStyle}
                >
                  {t('Plan')}
                </button>
                <button
                  onClick={() => window.location.reload()}
                  id="btn-refresh-page"
                  style={customButtonStyle}
                >
                  {t('Actualiser')}
                </button>
                <button
                  onClick={openAddForm}
                  id="btn-add-defib"
                  style={{
                    ...customButtonStyle,
                    backgroundColor: 'rgb(53, 86, 236)',
                    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                  }}
                >
                  {t('Nouveau')}
                </button>
              </div>
            </div>
          </div>

            {/* Dynamic bulk Action Bar at the top of the table if at least one record checked */}
            {selectedIds.length > 0 && (
              <div 
                className="p-4 flex items-center justify-between gap-4 animate-fadeIn" 
                id="bulk-actions-status-bar"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid rgb(231, 231, 231)',
                  borderRadius: '16px',
                }}
              >
                <div className="flex items-center gap-2">
                  <span 
                    className="w-6 h-6 text-white rounded-full flex items-center justify-center text-xs font-bold font-sans shrink-0"
                    style={{ backgroundColor: '#fe4eba' }}
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
                    onClick={() => setIsBulkEditOpen(true)}
                    id="btn-bulk-modify"
                    style={rowActionButton18Style}
                    className="cursor-pointer"
                  >
                    Corriger
                  </button>
                  
                  {/* Action Tournee Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled={isAnySelectedInTour}
                      onClick={() => {
                        if (!isAnySelectedInTour) {
                           setIsTourDropdownOpen(!isTourDropdownOpen);
                        }
                      }}
                      title={isAnySelectedInTour ? "Action impossible : l'un des défibrillateurs sélectionnés fait déjà partie d'une tournée." : "Associer à une tournée"}
                      style={{
                        ...rowActionButton18Style,
                        opacity: isAnySelectedInTour ? 0.6 : 1,
                        cursor: isAnySelectedInTour ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <span>Tournée</span>
                    </button>
                    {isTourDropdownOpen && !isAnySelectedInTour && (
                      <div 
                        className="absolute right-0 mt-1 w-72 bg-white rounded-lg z-50 py-2.5 font-sans animate-fadeIn"
                        style={{ 
                          fontSize: '18px',
                          border: '1px solid rgb(218 218 218)',
                          boxShadow: 'none'
                        }}
                      >
                        <div className="px-3 pb-2 bg-transparent flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              executeNouvelleTournee();
                            }}
                            style={{
                              ...rowActionButton18Style,
                              width: '100%',
                            }}
                            className="w-full text-center transition-colors cursor-pointer"
                          >
                            Nouvelle Tournée
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              executeAddToTrier();
                            }}
                            style={{
                              ...rowActionButton18Style,
                              width: '100%',
                              backgroundColor: '#000000',
                              borderColor: '#000000',
                              color: '#ffffff'
                            }}
                            className="w-full text-center transition-colors cursor-pointer hover:opacity-90"
                          >
                            À trier
                          </button>
                        </div>

                        {selectedDraftId && (
                          <div className="px-3 pb-2 bg-transparent">
                            <button
                              type="button"
                              onClick={() => {
                                executeAddTournee(selectedDraftId);
                              }}
                              style={{
                                ...rowActionButton18Style,
                                width: '100%',
                                boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                                background: 'rgb(53, 86, 236)'
                              }}
                              className="w-full text-center transition-colors cursor-pointer"
                            >
                              Confirmer l'action
                            </button>
                          </div>
                        )}
                        
                        {(() => {
                          const drafts = (fsmTours || []).filter(t => (t.status || 'Brouillon') === 'Brouillon' && t.id !== 'a-trier');
                          if (drafts.length === 0) {
                            return (
                              <div className="px-4 py-2 text-black font-sans text-center" style={{ fontSize: '15px' }}>
                                Aucune tournée en brouillon
                              </div>
                            );
                          }
                          return drafts.map(t => {
                            const isSelected = selectedDraftId === t.id;
                            const tourTitle = t.title || 'Nouvelle Tournée';
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
                                  color: isSelected ? 'rgb(254, 78, 186)' : '#000000',
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
                    onClick={() => exportToCSV(defibrillateurs.filter(d => selectedIds.includes(d.id)), clients, variables)}
                    style={rowActionButton18Style}
                    className="cursor-pointer"
                  >
                    CSV
                  </button>
                  {typeof window !== 'undefined' && ((localStorage.getItem('defib_lang') || 'Français, France') === 'Français, France' || localStorage.getItem('defib_lang') === 'Français') && (
                    <button
                      onClick={handleExportToAtlasanteCSV}
                      style={rowActionButton18Style}
                      className="cursor-pointer"
                    >
                      CSV Atlasanté
                    </button>
                  )}
                  {typeof window !== 'undefined' && ((localStorage.getItem('defib_lang') || 'Français, France') === 'Français, France' || localStorage.getItem('defib_lang') === 'Français') && atlasanteActive && (
                    <button
                      onClick={handleTransmitToAtlasante}
                      disabled={isAtlasanteUploading}
                      style={{
                        ...rowActionButton18Style,
                        opacity: isAtlasanteUploading ? 0.6 : 1,
                        cursor: isAtlasanteUploading ? 'not-allowed' : 'pointer'
                      }}
                      className="cursor-pointer"
                    >
                      Envoyer vers Atlasanté
                    </button>
                  )}
                  <button
                    onClick={handleBulkDeleteAction}
                    id="btn-bulk-delete"
                    disabled={isAnySelectedInTour}
                    style={{
                      ...rowActionButton18Style,
                      opacity: isAnySelectedInTour ? 0.4 : 1,
                      cursor: isAnySelectedInTour ? 'not-allowed' : 'pointer'
                    }}
                    title={isAnySelectedInTour ? "Action impossible : l'un des défibrillateurs sélectionnés fait déjà partie d'une tournée." : "Supprimer"}
                    className="cursor-pointer"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            )}
          </div>

          <HelpBubble 
            cacheKey="help_dismissed_defib" 
            text="Sur cet onglet, retrouvez l’ensemble des défibrillateurs gérés dans votre environnement. L’identifiant est généré automatiquement, il s’agit d’une sorte de plaque d’immatriculation avec au centre l’identifiant unique de votre environnement. Cochez chaque ligne pour sélectionner un ou plusieurs défibrillateurs, et vous verrez apparaître des options au-dessus, par exemple pour insérer le ou les défibrillateurs dans une tournée, ou faire une correction de masse." 
          />

      {/* Main Table Records Sheet */}
      <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        {/* Scrollbar supérieur pour faciliter la navigation horizontale sur ordinateur fixe */}
        {filteredDefibs.length > 0 && tableScrollWidth > 0 && (
          <div 
            ref={topScrollRef} 
            onScroll={handleTopScroll} 
            className="overflow-x-auto overflow-y-hidden bg-slate-50 border-b border-slate-100" 
            style={{ height: '14px' }}
          >
            <div style={{ width: `${tableScrollWidth}px`, height: '1px' }}></div>
          </div>
        )}
        <div 
          ref={bottomScrollRef} 
          onScroll={handleBottomScroll} 
          className="overflow-x-auto"
        >
          {filteredDefibs.length === 0 ? (
            <div className="p-16 text-center font-sans lg:py-24" id="no-defibs-view">
              <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>Aucun résultat.</p>
            </div>
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="records-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead ref={theadRef}>
                <tr className="bg-transparent">
                  <th className="px-4 py-3.5 w-12 text-center select-none" style={{ cursor: 'default', position: 'sticky', top: 0, backgroundColor: '#ffffff', zIndex: 10, borderBottom: '1px solid rgb(218, 218, 218)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isAllSelected) {
                          setSelectedIds([]);
                        } else {
                          setSelectedIds(filteredDefibs.map(df => df.id));
                        }
                      }}
                      id="select-all-radio-checkbox"
                      className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center focus:outline-hidden focus:ring-2 focus:ring-[#fe4eba]/20 cursor-pointer mx-auto ${
                        isAllSelected
                          ? 'border-[#fe4eba] bg-transparent'
                          : 'border-slate-400 bg-white hover:border-[#fe4eba]'
                      }`}
                      style={{ borderWidth: '2.5px' }}
                      role="checkbox"
                      aria-checked={isAllSelected}
                    >
                      {isAllSelected && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5 w-14 whitespace-nowrap" style={thStyle}>Miniature.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Identifiant.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Série.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Client.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t("Nom du site.")}</th>
                  <th className="px-4 py-3.5 text-center whitespace-nowrap" style={thStyle}>Contrat.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Localisation.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Expir. garantie.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>{t("Pro. visite.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Péremption A.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Péremption P.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Péremption B.")}</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Tournée.</th>
                  <th className="px-4 py-3.5 text-right w-12 whitespace-nowrap" style={thStyle}>Actions.</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs">
                {filteredDefibs.map(df => {
                  const linkedClient = clientMap.get(df.clientId);
                  const linkedModel = variableMap.get(df.modeleId);
                  const isChecked = selectedIds.includes(df.id);
                  const prochaineMaint = computeProchaineMaintenance(df.derniereMaintenance);

                  const activeAlerts: any[] = [];
                  const modelIds = [
                    df.modeleId,
                    df.modeleCoffretId,
                    df.modeleElectrodeAId,
                    df.modeleElectrodeASecoursId,
                    df.modeleElectrodePId,
                    df.modeleElectrodePSecoursId,
                    df.modeleBatterieId
                  ].filter(Boolean);
                  modelIds.forEach(id => {
                    const v = variableMap.get(id);
                    if (v && v.rappelAlerteOption) {
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
                      key={df.id}
                      id={`defib-row-${df.id}`}
                      onClick={() => openEditForm(df)}
                      className={`group hover:bg-[#ffecf8] transition-all cursor-pointer ${
                        isChecked ? 'bg-[#ffecf8]/60' : ''
                      }`}
                    >
                      {/* Checkbox column */}
                      <td className="px-4 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleSelectRow(df.id, e)}
                          id={`radio-checkbox-row-${df.id}`}
                          className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center focus:outline-hidden focus:ring-2 focus:ring-[#fe4eba]/20 cursor-pointer mx-auto ${
                            isChecked
                              ? 'border-[#fe4eba] bg-transparent'
                              : 'border-slate-400 bg-white hover:border-[#fe4eba]'
                          }`}
                          style={{ borderWidth: '2.5px' }}
                          role="checkbox"
                          aria-checked={isChecked}
                        >
                          {isChecked && (
                            <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                          )}
                        </button>
                      </td>

                      {/* Miniature thumbnail column */}
                      <td className="px-4 py-3.5">
                        <div className="w-14 h-14 rounded-md bg-white border border-slate-200 overflow-hidden relative flex items-center justify-center p-1.5" style={{ backgroundColor: '#ffffff' }}>
                          {linkedModel?.imageUrl ? (
                            <img
                              src={linkedModel.imageUrl}
                              alt=""
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                        </div>
                      </td>

                      {/* Identifiant */}
                      <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              border: '1px solid rgb(231, 231, 231)',
                              borderRadius: '1000px',
                              padding: '4px 12px',
                              backgroundColor: '#ffffff'
                            }} 
                            className="whitespace-nowrap shrink-0"
                          >
                            {(() => {
                              const status = getSafetyStatus(df);
                              return (
                                <span 
                                  className={`w-2 h-2 rounded-full shrink-0 ${status.colorClass}`} 
                                  title={status.title}
                                />
                              );
                            })()}
                            <span className="whitespace-nowrap">{df.identifiant}</span>
                          </div>

                          {activeAlerts.map((a, idx) => {
                            const isRed = a.option.includes('Rouge');
                            const bgColor = isRed ? '#fee2e2' : '#ffedd5';
                            const borderColor = isRed ? '#fca5a5' : '#fed7aa';
                            const textColor = isRed ? '#991b1b' : '#9a3412';
                            const text = a.option.split(' — ')[0];
                            return (
                              <span 
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap animate-pulse shrink-0 border"
                                style={{ backgroundColor: bgColor, borderColor: borderColor, color: textColor }}
                                title={`${a.option}${a.debut ? ` (du ${a.debut}${a.fin ? ` au ${a.fin}` : ''})` : ''}${a.desc ? ` : ${a.desc}` : ''}`}
                              >
                                ⚠️ {text}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Série */}
                      <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                        <div>{df.numeroSerie}</div>
                        {df.numeroAtlasante ? (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5" title="Numéro Atlasanté">
                            Atlas: {df.numeroAtlasante}
                          </div>
                        ) : null}
                      </td>

                      {/* Client */}
                      <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }} title={linkedClient?.denomination}>
                        {linkedClient?.denomination || ''}
                      </td>

                      {/* Nom du site */}
                      <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }} title={df.nomSite}>
                        <div>{df.nomSite || ''}</div>
                        {df.categorieEtablissement ? (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5" title="Catégorie d'établissement">
                            Catégorie: {df.categorieEtablissement}
                          </div>
                        ) : null}
                      </td>

                      {/* Contrat Yes/No */}
                      <td className="px-4 py-5 text-center">
                        {(() => {
                          const activeContrat = linkedClient ? linkedClient.contrat : df.contrat;
                          const activeNomContrat = linkedClient ? (linkedClient.nomContrat === 'Sans contrat de maintenance' ? '' : linkedClient.nomContrat) : df.nomContrat;
                          const activeFinContrat = linkedClient ? linkedClient.finContrat : df.finContrat;
                          if (!activeContrat) return null;
                          return (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '1000px',
                              backgroundColor: '#ffffff',
                              border: '1px solid rgb(231, 231, 231)',
                              color: '#000000',
                              fontSize: '16px',
                              fontWeight: 100,
                              padding: '4px 12px',
                              whiteSpace: 'nowrap',
                            }}>
                              {activeContrat === 'Oui' ? (
                                `Oui${activeNomContrat ? `, ${activeNomContrat}` : ''}${activeFinContrat ? `, Expir.${formatDateToFR(activeFinContrat)}` : ''}`
                              ) : (
                                activeContrat
                              )}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Localisation (ville / cp) */}
                      <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                        {df.ville && df.cp ? `${df.ville}, ${df.cp}` : (df.ville || df.cp || '-')}
                      </td>

                      {/* Fin Garantie */}
                      <td className="px-4 py-5 font-sans" style={{ fontSize: '16px', fontWeight: 100, color: getDateColor(df.finGarantie), backgroundColor: 'transparent' }}>
                        {formatDateToFR(df.finGarantie) || '-'}
                      </td>

                      {/* Prochaine Maintenance */}
                      <td className="px-4 py-5 font-sans" style={{ fontSize: '16px', fontWeight: 100, color: getDateColor(prochaineMaint), backgroundColor: 'transparent' }}>
                        {formatDateToFR(prochaineMaint) || '-'}
                      </td>

                      {/* Electrode Adult Expiry */}
                      <td className="px-3 py-5 text-center font-sans" style={{ fontSize: '16px', fontWeight: 100, color: getDateColor(df.peremptionElectrodeA), backgroundColor: 'transparent' }}>
                        {formatDateToFR(df.peremptionElectrodeA) || '-'}
                      </td>

                      {/* Electrode Pediatric Expiry */}
                      <td className="px-3 py-5 text-center font-sans" style={{ fontSize: '16px', fontWeight: 100, color: getDateColor(df.peremptionElectrodeP), backgroundColor: 'transparent' }}>
                        {formatDateToFR(df.peremptionElectrodeP) || '-'}
                      </td>

                      {/* Battery Expiry */}
                      <td className="px-3 py-5 text-center font-sans" style={{ fontSize: '16px', fontWeight: 100, color: getDateColor(df.peremptionBatterie), backgroundColor: 'transparent' }}>
                        {formatDateToFR(df.peremptionBatterie) || '-'}
                      </td>

                      {/* Tournée association column */}
                      <td className="px-4 py-5 text-left font-sans" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const matchingTours = (fsmTours || []).filter(t => 
                            t.missions?.some((m: any) => m.defibIdentifiant === df.identifiant)
                          );
                          if (matchingTours.length > 0) {
                            // Show only the single most recent one (the last matching one in our list)
                            const latestTour = matchingTours[matchingTours.length - 1];
                            const matchMission = latestTour.missions?.find((m: any) => m.defibIdentifiant === df.identifiant);
                            const isRejected = matchMission && matchMission.status !== 'Effectué' && matchMission.rejectionReason;
                            
                            const rawRejectedDate = matchMission?.rejectedAt || matchMission?.estimatedDate || latestTour.startDate || new Date().toLocaleDateString('fr-FR');
                            const formatToFrDate = (dStr: string) => {
                              if (!dStr) return '';
                              const clean = dStr.replace(/\//g, '-');
                              const pts = clean.split('-');
                              if (pts.length === 3) {
                                if (pts[0].length === 4) {
                                  return `${pts[2]}/${pts[1]}/${pts[0]}`;
                                }
                                return `${pts[0]}/${pts[1]}/${pts[2]}`;
                              }
                              return dStr;
                            };
                            const rejectedDateFormatted = formatToFrDate(rawRejectedDate);

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <span 
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    borderRadius: '1000px',
                                    backgroundColor: '#ffffff',
                                    border: '1px solid rgb(231, 231, 231)',
                                    color: '#000000',
                                    fontSize: '16px',
                                    fontWeight: 100,
                                    padding: '4px 12px',
                                    whiteSpace: 'nowrap',
                                    width: 'fit-content'
                                  }} 
                                  title={latestTour.title}
                                >
                                  {latestTour.title}
                                </span>
                                {isRejected && (
                                  <span 
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      borderRadius: '1000px',
                                      backgroundColor: '#dc2626',
                                      color: '#ffffff',
                                      fontSize: '16px',
                                      fontWeight: 100,
                                      padding: '6px 14px',
                                      whiteSpace: 'nowrap',
                                      width: 'fit-content',
                                      textTransform: 'none'
                                    }}
                                  >
                                    Rejeté {rejectedDateFormatted} : {matchMission.rejectionReason}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex gap-1.5">
                          <button
                            onClick={() => {
                              if (onShowGmaoReports) {
                                onShowGmaoReports(df.identifiant);
                              }
                            }}
                            style={rowActionButton18Style}
                          >
                            {t("Rapport(s)")}
                          </button>
                          <button
                            onClick={() => openEditForm(df)}
                            style={rowActionButton18Style}
                          >
                            Modifier
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

      <div style={{ fontSize: '18px', color: '#000000', fontWeight: 'bold', cursor: 'default' }} className="p-4 font-sans text-left" id="defib-tab-total-summary">
        {t('Total défibrillateurs (Tous)')}: {defibrillateurs.length}.
      </div>

      {/* Cartographie GIS Overlay */}
      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        defibrillateurs={defibrillateurs}
        clients={clients}
        variables={variables}
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
        </>
      )}

      {/* ======================================= */}
      {/* 🛠️ DOUBLE COLUMN SPACIOUS MODAL FORM 🛠️ */}
      {/* ======================================= */}
      {isFormOpen && (
        <div
          className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto"
          id="defib-form-overlay"
        >
          {/* Header */}
          <div 
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px' }}
            id="defib-form-header-box"
          >
            <div>
              <h3 className="text-2xl font-bold font-gochi" id="form-modal-title" style={{ color: '#000000', cursor: 'default' }}>
                {editingDefib ? 'Modification Défibrillateur' : 'Nouveau Défibrillateur'}
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                id="btn-close-defib-modal"
                style={rowActionButton18Style}
                className="transition-colors cursor-pointer"
              >
                <span>Fermer</span>
              </button>

              <button
                type="submit"
                form="defibrillateur-core-form"
                id="btn-submit-defib-form"
                disabled={isSubmitChecking}
                style={{
                  ...rowActionButton18Style,
                  backgroundColor: 'rgb(53, 86, 236)',
                  color: '#ffffff',
                  opacity: isSubmitChecking ? 0.5 : 1,
                  cursor: isSubmitChecking ? 'not-allowed' : 'pointer',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                }}
                className="transition-all"
              >
                {isSubmitChecking ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>

          <div
            className="w-full animate-fadeIn mt-6"
            style={{ marginTop: '24px' }}
            id="defib-form-box"
          >
            {/* Body */}
            <style>{`
              #defibrillateur-core-form input:not([type="radio"]):not([type="checkbox"]),
              #defibrillateur-core-form select,
              #defibrillateur-core-form textarea {
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
              #defibrillateur-core-form input:not([type="radio"]):not([type="checkbox"]):hover,
              #defibrillateur-core-form input:not([type="radio"]):not([type="checkbox"]):focus,
              #defibrillateur-core-form select:hover,
              #defibrillateur-core-form select:focus,
              #defibrillateur-core-form textarea:hover,
              #defibrillateur-core-form textarea:focus {
                outline: 2.5px solid #fa53d5 !important;
                outline-offset: 2px !important;
                transition: all 0s !important;
              }
              #defibrillateur-core-form input:not([type="radio"]):not([type="checkbox"])::placeholder,
              #defibrillateur-core-form textarea::placeholder {
                color: #000000 !important;
                opacity: 1 !important;
                font-weight: 100 !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
              }
              #defibrillateur-core-form input:disabled,
              #defibrillateur-core-form select:disabled,
              #defibrillateur-core-form textarea:disabled {
                color: #000000 !important;
                -webkit-text-fill-color: #000000 !important;
                background-color: #f1f5f9 !important;
                opacity: 0.95 !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                cursor: not-allowed !important;
              }
              #defibrillateur-core-form .white-disabled:disabled {
                background-color: #ffffff !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-text-fill-color: #000000 !important;
              }
              #defibrillateur-core-form input:disabled:hover,
              #defibrillateur-core-form input:disabled:focus,
              #defibrillateur-core-form select:disabled:hover,
              #defibrillateur-core-form select:disabled:focus,
              #defibrillateur-core-form textarea:disabled:hover,
              #defibrillateur-core-form textarea:disabled:focus {
                outline: none !important;
              }
              #defibrillateur-core-form select {
                appearance: none !important;
                -webkit-appearance: none !important;
                -moz-appearance: none !important;
                background-image: none !important;
              }
              #defibrillateur-core-form select option {
                color: #000000 !important;
                background: #ffffff !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
              }
              #defibrillateur-core-form input[type="date"]::-webkit-calendar-picker-indicator {
                display: none !important;
                -webkit-appearance: none !important;
                background: none !important;
                width: 0 !important;
                height: 0 !important;
              }
              #defibrillateur-core-form label,
              #defibrillateur-core-form .section-title-label,
              #defibrillateur-core-form span.block.uppercase {
                letter-spacing: normal !important;
                text-transform: none !important;
                font-size: 16px !important;
                color: #000000 !important;
                font-weight: 600 !important;
              }
              #defibrillateur-core-form input[type="radio"] {
                appearance: none !important;
                -webkit-appearance: none !important;
                width: 18px !important;
                height: 18px !important;
                border: 2px solid #cbd5e1 !important;
                border-radius: 50% !important;
                background-color: #ffffff !important;
                outline: none !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.2s ease !important;
                margin-right: 6px !important;
              }
              #defibrillateur-core-form input[type="radio"]:hover {
                border-color: oklch(0.44 0.16 324.65) !important;
              }
              #defibrillateur-core-form input[type="radio"]:checked {
                border-color: oklch(0.44 0.16 324.65) !important;
                background-color: oklch(0.44 0.16 324.65) !important;
              }
              #defibrillateur-core-form input[type="radio"]:checked::after {
                content: "" !important;
                width: 8px !important;
                height: 8px !important;
                background-color: #ffffff !important;
                border-radius: 50% !important;
                display: block !important;
              }
              #defibrillateur-core-form input[type="checkbox"] {
                appearance: none !important;
                -webkit-appearance: none !important;
                width: 18px !important;
                height: 18px !important;
                border: 2px solid #cbd5e1 !important;
                border-radius: 4px !important;
                background-color: #ffffff !important;
                outline: none !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.2s ease !important;
                margin-right: 6px !important;
              }
              #defibrillateur-core-form input[type="checkbox"]:hover {
                border-color: oklch(0.44 0.16 324.65) !important;
              }
              #defibrillateur-core-form input[type="checkbox"]:checked {
                border-color: oklch(0.44 0.16 324.65) !important;
                background-color: oklch(0.44 0.16 324.65) !important;
              }
              #defibrillateur-core-form input[type="checkbox"]:checked::after {
                content: "✓" !important;
                color: #ffffff !important;
                font-size: 11px !important;
                font-weight: 900 !important;
                display: block !important;
              }
            `}</style>
            <form onSubmit={handleFormSubmit} className="space-y-6" id="defibrillateur-core-form">
              {formError && (
                <div
                  className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold"
                  id="form-submit-error"
                >
                  {formError}
                </div>
              )}

              {/* Stacked Layout: Sections one above another */}
              <div className="space-y-0" style={{ maxWidth: '98%', margin: 'auto' }}>

                  {/* Section 1 - Défibrillateur */}
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderRadius: '18px 18px 0px 0px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        1 — Identification et photos
                      </span>
                    </div>

                    {identifiant && (
                      <div className="mb-4">
                        <Code39Barcode value={identifiant} />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Identifiant */}
                      <div className="space-y-1">
                        <label htmlFor="form-identifiant" className="block text-[11px] font-bold text-slate-500 uppercase">
                          Identifiant.
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            id="form-identifiant"
                            value={identifiant}
                            readOnly
                            placeholder="AAA-111"
                            className="flex-1 min-w-0 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-500 cursor-not-allowed"
                            required
                          />
                          {!editingDefib && (
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

                      {/* Série */}
                      <div className="space-y-1">
                        <label htmlFor="form-serie" className="block text-[11px] font-bold text-slate-500 uppercase">
                          Série.
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            id="form-serie"
                            value={numeroSerie}
                            onChange={(e) => setNumeroSerie(e.target.value)}
                            placeholder="Nombres et chiffres."
                            className="flex-1 min-w-0 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 font-mono"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setIsSerieScannerOpen(true)}
                            style={rowActionButton18Style}
                            className="shrink-0 font-sans"
                          >
                            Scan
                          </button>
                        </div>
                        {isSerieScannerOpen && (
                          <BarcodeScannerModal
                            isOpen={isSerieScannerOpen}
                            onClose={() => setIsSerieScannerOpen(false)}
                            onScanSuccess={(scannedText) => {
                              setNumeroSerie(scannedText);
                              setIsSerieScannerOpen(false);
                            }}
                          />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Modèle Lookup select - spans full column */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="form-modeleid" className="block text-[11px] font-bold text-slate-500 uppercase">
                            Modèle.
                          </label>
                          {setActiveTab && (
                            <button
                              type="button"
                              onClick={handleSaveAndRedirectToVariables}
                              className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                              style={{ textDecoration: 'none' }}
                            >
                              Nouvelle variable
                            </button>
                          )}
                        </div>
                        <select
                          id="form-modeleid"
                          value={modeleId}
                          onChange={(e) => setModeleId(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
                          required
                        >
                          <option value="">-- Sélectionner Modèle --</option>
                          {modelesDefib.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.marque === 'Standard' ? v.nom : `${v.marque} - ${v.nom}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Numéro Atlasanté - single line input */}
                      {isVisibleNumeroAtlasante && typeof window !== 'undefined' && ((localStorage.getItem('defib_lang') || 'Français, France') === 'Français, France' || localStorage.getItem('defib_lang') === 'Français') && (
                        <div className="space-y-1">
                          <label htmlFor="form-numeroatlasante" className="block text-[11px] font-bold text-slate-500 uppercase">
                            Numéro Atlasanté.
                          </label>
                          <input
                            type="text"
                            id="form-numeroatlasante"
                            value={numeroAtlasante}
                            onChange={(e) => setNumeroAtlasante(e.target.value)}
                            placeholder="Entrez le numéro Atlasanté"
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
                          />
                        </div>
                      )}

                      {/* Version du logiciel */}
                      {isVisibleVersionLogiciel && (
                        <div className="space-y-1">
                          <label htmlFor="form-versionlogiciel" className="block text-[11px] font-bold text-slate-500 uppercase">
                            Version du logiciel.
                          </label>
                          <input
                            type="text"
                            id="form-versionlogiciel"
                            value={versionLogiciel}
                            onChange={(e) => setVersionLogiciel(e.target.value)}
                            placeholder="Ex: v1.4.2"
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
                          />
                        </div>
                      )}
                    </div>

                    {/* Commentaire simple */}
                    <div className="space-y-1">
                      <label htmlFor="form-commentaire" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Commentaire.
                      </label>
                      <textarea
                        id="form-commentaire"
                        value={commentaire}
                        onChange={(e) => setCommentaire(e.target.value)}
                        placeholder="Entrez votre commentaire."
                        rows={2}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 resize-none"
                      />
                    </div>
                  </div>

                  {/* Section 2 - Client (Auto-Populate Source) */}
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderTop: 'none',
                      borderRadius: '0px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        2 — Client
                      </span>
                    </div>

                    {/* Client Selector, Nom du site, and Catégorie d'établissement in an equal 3-column grid (33% / 33% / 33%) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Native System Client Dropdown */}
                      <div className="space-y-1 relative">
                        <label htmlFor="form-client-select" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Client.
                        </label>
                        <select
                          id="form-client-select"
                          value={clientId}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            handleClientChange(selectedId);
                          }}
                          className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold"
                        >
                          <option value="">Sélectionnez un client...</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.denomination} {c.siret ? `(${c.siret})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Nom du site field */}
                      <div className="space-y-1">
                        <label htmlFor="form-nom-site" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {t("Nom du site.")}
                        </label>
                        <input
                          type="text"
                          id="form-nom-site"
                          value={nomSite}
                          onChange={(e) => setNomSite(e.target.value)}
                          placeholder={t("Nom du site.")}
                          className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold"
                        />
                      </div>

                      {/* Catégorie d'établissement field */}
                      <div className="space-y-1">
                        <label htmlFor="form-categorie-etablissement" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Catégorie d'établissement.
                        </label>
                        <input
                          type="text"
                          id="form-categorie-etablissement"
                          value={categorieEtablissement}
                          onChange={(e) => setCategorieEtablissement(e.target.value)}
                          placeholder="Catégorie d'établissement."
                          className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold"
                        />
                      </div>
                    </div>

                    {/* Contacts du site fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label htmlFor="form-site-nom" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Nom et prénom.
                        </label>
                        <input
                          type="text"
                          id="form-site-nom"
                          value={nomPrenomSite}
                          onChange={(e) => setNomPrenomSite(e.target.value)}
                          placeholder="Nom et prénom du contact."
                          className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold transition-colors"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="form-site-tel" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Téléphone portable.
                        </label>
                        <input
                          type="text"
                          id="form-site-tel"
                          value={telephoneSite}
                          onChange={(e) => setTelephoneSite(e.target.value)}
                          placeholder="Téléphone du contact."
                          className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-mono font-semibold transition-colors"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="form-site-mail" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Email.
                        </label>
                        <input
                          type="text"
                          id="form-site-mail"
                          value={emailSite}
                          onChange={(e) => setEmailSite(e.target.value)}
                          placeholder="Email du contact."
                          className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold transition-colors truncate"
                        />
                      </div>
                    </div>

                    {/* Enabled Contract fields */}
                    <div className="space-y-1 mt-1 pt-1 font-sans">
                      <label className="block text-[10px] uppercase font-semibold text-slate-400 font-sans">Titre du contrat.</label>
                      <input
                        type="text"
                        value={nomContrat}
                        disabled
                        placeholder="Automatique à la sélection"
                        className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs bg-slate-100 text-slate-500 cursor-not-allowed font-sans"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 font-sans">
                      <div className="space-y-1">
                        <label className="block text-[10px] uppercase font-semibold text-slate-400 font-sans">Contrat en cours.</label>
                        <select
                          value={contrat || 'Non'}
                          disabled
                          className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs bg-white text-slate-800 font-sans cursor-not-allowed white-disabled"
                        >
                          <option value="Oui">Oui</option>
                          <option value="Non">Non</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] uppercase font-semibold text-slate-400 font-sans">Payeur ID</label>
                        <input
                          type="text"
                          value={payeurId}
                          onChange={(e) => setPayeurId(e.target.value)}
                          placeholder="Payeur ID"
                          className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs bg-white text-slate-800 font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] uppercase font-semibold text-slate-400 font-sans">Client ID</label>
                        <input
                          type="text"
                          value={clientIdField}
                          onChange={(e) => setClientIdField(e.target.value)}
                          placeholder="Client ID"
                          className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs bg-white text-slate-800 font-sans"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-sans">
                      <div className="space-y-1 font-sans">
                        <label className="block text-[10px] uppercase font-semibold text-slate-400 font-sans">Référence du contrat.</label>
                        <input
                          type="text"
                          value={referenceContrat}
                          disabled
                          placeholder="Automatique à la sélection"
                          className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs bg-slate-100 text-slate-500 cursor-not-allowed font-mono"
                        />
                      </div>
                      <div className="space-y-1 font-sans">
                        <label className="block text-[10px] uppercase font-semibold text-slate-400 font-sans">Début du contrat.</label>
                        <input
                          type="date"
                          value={debutContrat}
                          disabled
                          className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs bg-slate-100 text-slate-500 cursor-not-allowed font-sans"
                        />
                      </div>
                      <div className="space-y-1 font-sans">
                        <label className="block text-[10px] uppercase font-semibold text-slate-400 font-sans">Expiration du contrat.</label>
                        <input
                          type="date"
                          value={finContrat}
                          disabled
                          className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs bg-slate-100 text-slate-500 cursor-not-allowed font-sans"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 3 - Coffret */}
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderTop: 'none',
                      borderRadius: '0px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        {t("3 — Boîtier")}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Modèle de coffret */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="form-mod-coffret" className="block text-[11px] font-bold text-slate-500 uppercase">
                            Modèle.
                          </label>
                          {setActiveTab && (
                            <button
                              type="button"
                              onClick={handleSaveAndRedirectToVariables}
                              className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                              style={{ textDecoration: 'none' }}
                            >
                              Nouvelle variable
                            </button>
                          )}
                        </div>
                        <select
                          id="form-mod-coffret"
                          value={modeleCoffretId}
                          onChange={(e) => setModeleCoffretId(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
                        >
                          <option value="">-- Sans coffret --</option>
                          {modelesCoffret.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.marque === 'Standard' ? v.nom : `${v.marque} - ${v.nom}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Numéro Lot Coffret */}
                      <div className="space-y-1">
                        <label htmlFor="form-lot-coffret" className="block text-[11px] font-bold text-slate-500 uppercase">
                          Lot.
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            id="form-lot-coffret"
                            value={numeroLotCoffret}
                            onChange={(e) => setNumeroLotCoffret(e.target.value)}
                            placeholder="Nombres et chiffres."
                            className="flex-1 min-w-0 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setIsLotScannerOpen(true)}
                            style={rowActionButton18Style}
                            className="shrink-0 font-sans"
                          >
                            Scan
                          </button>
                        </div>
                        {isLotScannerOpen && (
                          <BarcodeScannerModal
                            isOpen={isLotScannerOpen}
                            onClose={() => setIsLotScannerOpen(false)}
                            onScanSuccess={(scannedText) => {
                              setNumeroLotCoffret(scannedText);
                              setIsLotScannerOpen(false);
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Note Coffret */}
                    <div className="space-y-1">
                      <label htmlFor="form-comm-coffret" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Commentaire.
                      </label>
                      <input
                        type="text"
                        id="form-comm-coffret"
                        value={commentaireCoffret}
                        onChange={(e) => setCommentaireCoffret(e.target.value)}
                        placeholder="Entrez votre commentaire."
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-750"
                      />
                    </div>
                  </div>

                  {/* Section 4 - Accès */}
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderTop: 'none',
                      borderRadius: '0px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        4 — Localisation
                      </span>
                    </div>

                    {/* Localisation fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1 sm:col-span-3">
                        <label htmlFor="form-voie" className="block text-[10px] font-bold text-slate-400 uppercase">Numéro et voie.</label>
                        <input
                          type="text"
                          id="form-voie"
                          value={numVoie}
                          onChange={(e) => setNumVoie(e.target.value)}
                          placeholder="Ex: 1 Rue Dupont."
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="form-ville" className="block text-[10px] font-bold text-slate-400 uppercase">Ville.</label>
                        <input
                          type="text"
                          id="form-ville"
                          value={ville}
                          onChange={(e) => setVille(e.target.value)}
                          placeholder="Ex: Dupont."
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-850 font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="form-cp" className="block text-[10px] font-bold text-slate-400 uppercase">Code postal.</label>
                        <input
                          type="text"
                          id="form-cp"
                          value={cp}
                          onChange={(e) => setCp(e.target.value)}
                          placeholder="Ex: 12345."
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="form-region" className="block text-[10px] font-bold text-slate-400 uppercase">Région.</label>
                        <select
                          id="form-region"
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
                        >
                          <option value="">Choisir une région.</option>
                          {getRegionsForCountry(pays).map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="form-pays" className="block text-[10px] font-bold text-slate-400 uppercase">Pays.</label>
                        <select
                          id="form-pays"
                          value={pays}
                          onChange={(e) => setPays(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700 font-semibold"
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

                      <div className="space-y-1">
                        <label htmlFor="form-lat" className="block text-[10px] font-bold text-slate-400 uppercase">Latitude.</label>
                        <input
                          type="text"
                          id="form-lat"
                          value={latitude}
                          onChange={(e) => setLatitude(e.target.value)}
                          placeholder="Auto-complété."
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-700 font-sans"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="form-lng" className="block text-[10px] font-bold text-slate-400 uppercase">Longitude.</label>
                        <input
                          type="text"
                          id="form-lng"
                          value={longitude}
                          onChange={(e) => setLongitude(e.target.value)}
                          placeholder="Auto-complété."
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-700 font-sans"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
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

                    <div className="space-y-1">
                      <label htmlFor="form-com-adresse" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Aide d'accès.
                      </label>
                      <input
                        type="text"
                        id="form-com-adresse"
                        value={commentaireAdresse}
                        onChange={(e) => setCommentaireAdresse(e.target.value)}
                        placeholder="Entrez votre commentaire."
                        className="w-full px-3 py-1 border border-slate-200 rounded-lg text-xs text-slate-750"
                      />
                    </div>

                    {/* Horaires d'ouverture section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider font-sans">
                          {t("Horaires d'ouverture")}
                        </span>
                        <button
                          type="button"
                          onClick={handleAddSchedule}
                          style={{ ...rowActionButton18Style, textTransform: 'none' }}
                          className="font-sans"
                        >
                          {t("Nouvelle plage")}
                        </button>
                      </div>

                      {schedules.map((sch, schIdx) => (
                        <div key={schIdx} style={{ borderRadius: '13px', border: '1px solid #d7d7d7' }} className="p-3 bg-white relative space-y-3">
                          {schedules.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSchedule(schIdx)}
                              style={{ borderRadius: '13px', fontSize: '16px' }}
                              className="absolute top-2 right-2 px-3 py-1 font-bold text-white bg-[#991b1b] hover:bg-[#7f1d1d] active:scale-95 transition-all cursor-pointer font-sans"
                            >
                              Supprimer
                            </button>
                          )}

                          {/* Midi closing toggle - styled as radio pink */}
                          <div className="flex items-center gap-2 select-none">
                            <button
                              type="button"
                              id={`mid-close-${schIdx}`}
                              onClick={() => handleUpdateScheduleField(schIdx, 'fermetureMidi', !sch.fermetureMidi)}
                              className="inline-flex items-center gap-2 cursor-pointer select-none"
                            >
                              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${sch.fermetureMidi ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                                {sch.fermetureMidi && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                              </span>
                              <span className="font-semibold text-black font-sans" style={{ fontSize: '16px' }}>
                                {t("Fermeture le midi (4 plages horaires)")}
                              </span>
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
                            <span className="block text-[9px] font-bold text-slate-400 uppercase font-sans">{t("Jours de la semaine")}</span>
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
                                        ? 'bg-black text-white shadow-sm cursor-pointer'
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

                    {/* Styled settings representing installation state without deleted access settings */}
                    <div className="pt-2">
                      {/* Implanté en Extérieur */}
                      <div className="p-2 rounded-lg space-y-1 font-sans">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase font-sans">Installé en extérieur.</span>
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => setExterieur(true)}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${exterieur === true ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {exterieur === true && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setExterieur(false)}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${exterieur === false ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {exterieur === false && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 5 - Dates */}
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderTop: 'none',
                      borderRadius: '0px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        5 — Dates
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="form-fin-garantie" className="block text-[10px] font-bold text-slate-400 uppercase">Expiration de garantie.</label>
                        <input
                          type="date"
                          id="form-fin-garantie"
                          value={finGarantie}
                          onChange={(e) => setFinGarantie(e.target.value)}
                          className="w-full px-2.5 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="form-fabrication" className="block text-[10px] font-bold text-slate-400 uppercase">Fabrication.</label>
                        <input
                          type="date"
                          id="form-fabrication"
                          value={fabrication}
                          onChange={(e) => setFabrication(e.target.value)}
                          className="w-full px-2.5 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="form-mise-service" className="block text-[10px] font-bold text-slate-400 uppercase">Mise en service.</label>
                        <input
                          type="date"
                          id="form-mise-service"
                          value={miseEnService}
                          onChange={(e) => setMiseEnService(e.target.value)}
                          className="w-full px-2.5 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="form-der-maint" className="block text-[10px] font-bold text-slate-400 uppercase">Dernière maintenance.</label>
                        <input
                          type="date"
                          id="form-der-maint"
                          value={derniereMaintenance}
                          onChange={(e) => setDerniereMaintenance(e.target.value)}
                          className="w-full px-2.5 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <label htmlFor="form-sortie-fab" className="block text-[10px] font-bold text-slate-400 uppercase">Sortie d'usine.</label>
                        <input
                          type="date"
                          id="form-sortie-fab"
                          value={sortieFabricant}
                          onChange={(e) => setSortieFabricant(e.target.value)}
                          className="w-full px-2.5 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                        />
                      </div>

                      {/* Displaying computed next maintenance date like other input fields */}
                      <div className="space-y-1">
                        <label htmlFor="form-prochaine-maint" className="block text-[10px] font-bold text-slate-400 uppercase">Prochaine maintenance.</label>
                        <input
                          type="text"
                          id="form-prochaine-maint"
                          value={formatDateToFR(computeProchaineMaintenance(derniereMaintenance))}
                          readOnly
                          className="w-full px-2.5 py-1 border border-slate-200 rounded text-xs bg-slate-50 text-slate-700 font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderTop: 'none',
                      borderRadius: '0px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        {t("6 — Électrode Adulte ou Mixte")}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="form-elec-a-lookup" className="block text-[10px] font-bold text-slate-400 uppercase">Modèle.</label>
                          {setActiveTab && (
                            <button
                              type="button"
                              onClick={handleSaveAndRedirectToVariables}
                              className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                              style={{ textDecoration: 'none' }}
                            >
                              Nouvelle variable
                            </button>
                          )}
                        </div>
                        <select
                          id="form-elec-a-lookup"
                          value={modeleElectrodeAId}
                          onChange={(e) => setModeleElectrodeAId(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700"
                        >
                          <option value="">-- Sélectionner Électrode --</option>
                          {modelesElectrode.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.marque === 'Standard' ? v.nom : `${v.marque} - ${v.nom}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      {isVisibleLotPadPakA && (
                        <div className="space-y-1">
                          <label htmlFor="form-elec-a-lot" className="block text-[10px] font-bold text-slate-400 uppercase">Lot.</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              id="form-elec-a-lot"
                              value={lotElectrodeA}
                              onChange={(e) => setLotElectrodeA(e.target.value)}
                              placeholder="Nombres et chiffres."
                              className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded text-xs bg-white font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setIsLotAScannerOpen(true)}
                              style={rowActionButton18Style}
                              className="shrink-0 font-sans"
                            >
                              Scan
                            </button>
                          </div>
                          {isLotAScannerOpen && (
                            <BarcodeScannerModal
                              isOpen={isLotAScannerOpen}
                              onClose={() => setIsLotAScannerOpen(false)}
                              onScanSuccess={(scannedText) => {
                                setLotElectrodeA(scannedText);
                                setIsLotAScannerOpen(false);
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {isVisiblePadPakAdulte && (
                        <div className="space-y-1">
                          <label htmlFor="form-elec-a-ins" className="block text-[9px] font-bold text-slate-400 uppercase">Insertion.</label>
                          <input
                            type="date"
                            id="form-elec-a-ins"
                            value={insertionElectrodeA}
                            onChange={(e) => setInsertionElectrodeA(e.target.value)}
                            className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                          />
                        </div>
                      )}
                      {isVisiblePeremptionPadPakA && (
                        <div className="space-y-1">
                          <label htmlFor="form-elec-a-per" className="block text-[9px] font-bold text-slate-400 uppercase">Péremption.</label>
                          <input
                            type="date"
                            id="form-elec-a-per"
                            value={peremptionElectrodeA}
                            onChange={(e) => setPeremptionElectrodeA(e.target.value)}
                            className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <label htmlFor="form-elec-a-liv" className="block text-[9px] font-bold text-slate-400 uppercase">Livraison.</label>
                        <input
                          type="date"
                          id="form-elec-a-liv"
                          value={livraisonElectrodeA}
                          onChange={(e) => setLivraisonElectrodeA(e.target.value)}
                          className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                        />
                      </div>
                    </div>

                    {/* Électrode de secours radio button */}
                    <div className="space-y-1">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">{t("Électrode de secours.")}</span>
                      <div className="flex gap-4 py-1">
                        <button
                          type="button"
                          onClick={() => setHasElectrodeASecours('Oui')}
                          className="inline-flex items-center cursor-pointer gap-2 select-none"
                          style={{ fontSize: '16px', color: '#000' }}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasElectrodeASecours === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                            {hasElectrodeASecours === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                          </span>
                          Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => setHasElectrodeASecours('Non')}
                          className="inline-flex items-center cursor-pointer gap-2 select-none"
                          style={{ fontSize: '16px', color: '#000' }}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasElectrodeASecours === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                            {hasElectrodeASecours === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                          </span>
                          Non
                        </button>
                      </div>
                    </div>

                    {hasElectrodeASecours === 'Oui' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1 bg-white">
                          <label htmlFor="form-elec-a-sec-lookup" className="block text-[10px] font-bold text-slate-400 uppercase">Modèle d'électrode de secours.</label>
                          <select
                            id="form-elec-a-sec-lookup"
                            value={modeleElectrodeASecoursId}
                            onChange={(e) => setModeleElectrodeASecoursId(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700"
                          >
                            <option value="">-- Sélectionner Électrode --</option>
                            {modelesElectrode.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.marque === 'Standard' ? v.nom : `${v.marque} - ${v.nom}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {isVisibleLotPadPakA && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-elec-a-sec-lot" className="block text-[10px] font-bold text-slate-400 uppercase">Lot de l’électrode de secours.</label>
                            <input
                              type="text"
                              id="form-elec-a-sec-lot"
                              value={lotElectrodeASecours || ''}
                              onChange={(e) => setLotElectrodeASecours(e.target.value)}
                              placeholder="Numéro de lot"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700 font-mono"
                            />
                          </div>
                        )}

                        {isVisiblePeremptionPadPakA && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-elec-a-sec" className="block text-[10px] font-bold text-slate-400 uppercase">Péremption de l’électrode de secours.</label>
                            <input
                              type="date"
                              id="form-elec-a-sec"
                              value={peremptionSecoursElectrodeA}
                              onChange={(e) => setPeremptionSecoursElectrodeA(e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1 bg-white">
                        <label htmlFor="form-elec-a-sit" className="block text-[10px] font-bold text-slate-400 uppercase">Statut.</label>
                        <select
                          id="form-elec-a-sit"
                          value={situationElectrodeA}
                          onChange={(e) => setSituationElectrodeA(e.target.value as any)}
                          className={`w-full px-2 py-1 border border-slate-200 rounded text-xs font-semibold ${
                            situationElectrodeA === 'Vert' ? 'bg-emerald-50 text-emerald-800' : situationElectrodeA === 'Orange' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'
                          }`}
                        >
                          <option value="Vert">Conforme</option>
                          <option value="Orange">Attention</option>
                          <option value="Rouge">Alerte</option>
                        </select>
                      </div>

                      <div className="space-y-1 bg-white">
                        <label htmlFor="form-elec-a-com" className="block text-[11px] font-bold text-slate-500 uppercase font-sans">Commentaire.</label>
                        <input
                          type="text"
                          id="form-elec-a-com"
                          value={commentaireElectrodeA}
                          onChange={(e) => setCommentaireElectrodeA(e.target.value)}
                          placeholder="Entrez votre commentaire."
                          className="w-full px-3 py-1 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    {/* PadPak radio button */}
                    {isVisiblePadPakAdulte && (
                      <div className="space-y-1 bg-white">
                        <span className="block text-[11px] font-bold text-slate-500 uppercase font-sans">PadPak.</span>
                        <div className="flex gap-4 py-1">
                          <button
                            type="button"
                            onClick={() => setHasPadpakA('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none font-semibold"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasPadpakA === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {hasPadpakA === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setHasPadpakA('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none font-semibold"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasPadpakA === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {hasPadpakA === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Lot PadPak A & Péremption PadPak A */}
                    {hasPadpakA === 'Oui' && isVisiblePadPakAdulte && (isVisibleLotPadPakA || isVisiblePeremptionPadPakA) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 bg-white">
                        {isVisibleLotPadPakA && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-lot-padpak-a" className="block text-[11px] font-bold text-slate-500 uppercase font-sans">
                              {t("Lot PadPak A.")}
                            </label>
                            <input
                              type="text"
                              id="form-lot-padpak-a"
                              value={lotPadpakA}
                              onChange={(e) => setLotPadpakA(e.target.value)}
                              placeholder={t("Entrez le numéro de lot.")}
                              className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold"
                            />
                          </div>
                        )}
                        {isVisiblePeremptionPadPakA && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-per-padpak-a" className="block text-[11px] font-bold text-slate-500 uppercase font-sans">
                              {t("Péremption PadPak A.")}
                            </label>
                            <input
                              type="date"
                              id="form-per-padpak-a"
                              value={peremptionPadpakA}
                              onChange={(e) => setPeremptionPadpakA(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold font-mono"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Section 7 - Électrode Pédiatrique (P) */}
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderTop: 'none',
                      borderRadius: '0px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        {t("7 — Électrode Pédiatrique")}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="form-elec-p-lookup" className="block text-[10px] font-bold text-slate-400 uppercase">Modèle.</label>
                          {setActiveTab && (
                            <button
                              type="button"
                              onClick={handleSaveAndRedirectToVariables}
                              className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                              style={{ textDecoration: 'none' }}
                            >
                              Nouvelle variable
                            </button>
                          )}
                        </div>
                        <select
                          id="form-elec-p-lookup"
                          value={modeleElectrodePId}
                          onChange={(e) => setModeleElectrodePId(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700"
                        >
                          <option value="">-- Sélectionner Électrode --</option>
                          {modelesElectrode.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.marque === 'Standard' ? v.nom : `${v.marque} - ${v.nom}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      {isVisibleLotP && (
                        <div className="space-y-1">
                          <label htmlFor="form-elec-p-lot" className="block text-[10px] font-bold text-slate-400 uppercase">Lot.</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              id="form-elec-p-lot"
                              value={lotElectrodeP}
                              onChange={(e) => setLotElectrodeP(e.target.value)}
                              placeholder="Nombres et chiffres."
                              className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded text-xs bg-white font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setIsLotPScannerOpen(true)}
                              style={rowActionButton18Style}
                              className="shrink-0 font-sans"
                            >
                              Scan
                            </button>
                          </div>
                          {isLotPScannerOpen && (
                            <BarcodeScannerModal
                              isOpen={isLotPScannerOpen}
                              onClose={() => setIsLotPScannerOpen(false)}
                              onScanSuccess={(scannedText) => {
                                setLotElectrodeP(scannedText);
                                setIsLotPScannerOpen(false);
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {isVisiblePadPakPediatrique && (
                        <div className="space-y-1">
                          <label htmlFor="form-elec-p-ins" className="block text-[9px] font-bold text-slate-400 uppercase">Insertion.</label>
                          <input
                            type="date"
                            id="form-elec-p-ins"
                            value={insertionElectrodeP}
                            onChange={(e) => setInsertionElectrodeP(e.target.value)}
                            className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                          />
                        </div>
                      )}
                      {isVisiblePeremptionPadPakP && (
                        <div className="space-y-1">
                          <label htmlFor="form-elec-p-per" className="block text-[9px] font-bold text-slate-400 uppercase">Péremption.</label>
                          <input
                            type="date"
                            id="form-elec-p-per"
                            value={peremptionElectrodeP}
                            onChange={(e) => setPeremptionElectrodeP(e.target.value)}
                            className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <label htmlFor="form-elec-p-liv" className="block text-[9px] font-bold text-slate-400 uppercase">Livraison.</label>
                        <input
                          type="date"
                          id="form-elec-p-liv"
                          value={livraisonElectrodeP}
                          onChange={(e) => setLivraisonElectrodeP(e.target.value)}
                          className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                        />
                      </div>
                    </div>

                    {/* Électrode de secours radio button */}
                    <div className="space-y-1">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">{t("Électrode de secours.")}</span>
                      <div className="flex gap-4 py-1">
                        <button
                          type="button"
                          onClick={() => setHasElectrodePSecours('Oui')}
                          className="inline-flex items-center cursor-pointer gap-2 select-none"
                          style={{ fontSize: '16px', color: '#000' }}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasElectrodePSecours === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                            {hasElectrodePSecours === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                          </span>
                          Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => setHasElectrodePSecours('Non')}
                          className="inline-flex items-center cursor-pointer gap-2 select-none"
                          style={{ fontSize: '16px', color: '#000' }}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasElectrodePSecours === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                            {hasElectrodePSecours === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                          </span>
                          Non
                        </button>
                      </div>
                    </div>

                    {hasElectrodePSecours === 'Oui' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1 bg-white">
                          <label htmlFor="form-elec-p-sec-lookup" className="block text-[10px] font-bold text-slate-400 uppercase">Modèle d'électrode de secours.</label>
                          <select
                            id="form-elec-p-sec-lookup"
                            value={modeleElectrodePSecoursId}
                            onChange={(e) => setModeleElectrodePSecoursId(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700"
                          >
                            <option value="">-- Sélectionner Électrode --</option>
                            {modelesElectrode.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.marque === 'Standard' ? v.nom : `${v.marque} - ${v.nom}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {isVisibleLotP && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-elec-p-sec-lot" className="block text-[10px] font-bold text-slate-400 uppercase">Lot de l’électrode de secours.</label>
                            <input
                              type="text"
                              id="form-elec-p-sec-lot"
                              value={lotElectrodePSecours || ''}
                              onChange={(e) => setLotElectrodePSecours(e.target.value)}
                              placeholder="Numéro de lot"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700 font-mono"
                            />
                          </div>
                        )}

                        {isVisiblePeremptionPadPakP && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-elec-p-sec" className="block text-[10px] font-bold text-slate-400 uppercase">Péremption de l’électrode de secours.</label>
                            <input
                              type="date"
                              id="form-elec-p-sec"
                              value={peremptionSecoursElectrodeP}
                              onChange={(e) => setPeremptionSecoursElectrodeP(e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1 bg-white">
                        <label htmlFor="form-elec-p-sit" className="block text-[10px] font-bold text-slate-400 uppercase">Statut.</label>
                        <select
                          id="form-elec-p-sit"
                          value={situationElectrodeP}
                          onChange={(e) => setSituationElectrodeP(e.target.value as any)}
                          className={`w-full px-2 py-1 border border-slate-200 rounded text-xs font-semibold ${
                            situationElectrodeP === 'Vert' ? 'bg-emerald-50 text-emerald-800' : situationElectrodeP === 'Orange' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'
                          }`}
                        >
                          <option value="Vert">Conforme</option>
                          <option value="Orange">Attention</option>
                          <option value="Rouge">Alerte</option>
                        </select>
                      </div>

                      <div className="space-y-1 bg-white">
                        <label htmlFor="form-elec-p-com" className="block text-[11px] font-bold text-slate-500 uppercase font-sans">Commentaire.</label>
                        <input
                          type="text"
                          id="form-elec-p-com"
                          value={commentaireElectrodeP}
                          onChange={(e) => setCommentaireElectrodeP(e.target.value)}
                          placeholder="Entrez votre commentaire."
                          className="w-full px-3 py-1 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    {/* PadPak radio button */}
                    {isVisiblePadPakPediatrique && (
                      <div className="space-y-1 bg-white">
                        <span className="block text-[11px] font-bold text-slate-500 uppercase font-sans">PadPak.</span>
                        <div className="flex gap-4 py-1">
                          <button
                            type="button"
                            onClick={() => setHasPadpakP('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none font-semibold"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasPadpakP === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {hasPadpakP === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setHasPadpakP('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none font-semibold"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasPadpakP === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {hasPadpakP === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Lot PadPak P & Péremption PadPak P */}
                    {hasPadpakP === 'Oui' && isVisiblePadPakPediatrique && (isVisibleLotPadPakP || isVisiblePeremptionPadPakP) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 bg-white">
                        {isVisibleLotPadPakP && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-lot-padpak-p" className="block text-[11px] font-bold text-slate-500 uppercase font-sans">
                              {t("Lot PadPak P.")}
                            </label>
                            <input
                              type="text"
                              id="form-lot-padpak-p"
                              value={lotPadpakP}
                              onChange={(e) => setLotPadpakP(e.target.value)}
                              placeholder={t("Entrez le numéro de lot.")}
                              className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold"
                            />
                          </div>
                        )}
                        {isVisiblePeremptionPadPakP && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-per-padpak-p" className="block text-[11px] font-bold text-slate-500 uppercase font-sans">
                              {t("Péremption PadPak P.")}
                            </label>
                            <input
                              type="date"
                              id="form-per-padpak-p"
                              value={peremptionPadpakP}
                              onChange={(e) => setPeremptionPadpakP(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg text-xs bg-white text-slate-800 font-semibold font-mono"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Section 8 - Batterie (B) */}
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderTop: 'none',
                      borderRadius: '0px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        {t("8 — Batterie")}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="form-bat-lookup" className="block text-[10px] font-bold text-slate-400 uppercase">Modèle.</label>
                          {setActiveTab && (
                            <button
                              type="button"
                              onClick={handleSaveAndRedirectToVariables}
                              className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                              style={{ textDecoration: 'none' }}
                            >
                              Nouvelle variable
                            </button>
                          )}
                        </div>
                        <select
                          id="form-bat-lookup"
                          value={modeleBatterieId}
                          onChange={(e) => setModeleBatterieId(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700"
                        >
                          <option value="">-- Sélectionner Batterie --</option>
                          {modelesBatterie.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.marque === 'Standard' ? v.nom : `${v.marque} - ${v.nom}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="form-bat-lot" className="block text-[10px] font-bold text-slate-400 uppercase">Lot.</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            id="form-bat-lot"
                            value={lotBatterie}
                            onChange={(e) => setLotBatterie(e.target.value)}
                            placeholder="Nombres et chiffres."
                            className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded text-xs bg-white font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setIsLotBatScannerOpen(true)}
                            style={rowActionButton18Style}
                            className="shrink-0 font-sans"
                          >
                            Scan
                          </button>
                        </div>
                        {isLotBatScannerOpen && (
                          <BarcodeScannerModal
                            isOpen={isLotBatScannerOpen}
                            onClose={() => setIsLotBatScannerOpen(false)}
                            onScanSuccess={(scannedText) => {
                              setLotBatterie(scannedText);
                              setIsLotBatScannerOpen(false);
                            }}
                          />
                        )}
                      </div>
                    </div>

                     <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      {isVisiblePeremptionBatterie && (
                        <div className="space-y-1">
                          <label htmlFor="form-bat-per" className="block text-[9px] font-bold text-slate-400 uppercase">Péremption.</label>
                          <input
                            type="date"
                            id="form-bat-per"
                            value={peremptionBatterie}
                            onChange={(e) => setPeremptionBatterie(e.target.value)}
                            className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                          />
                        </div>
                      )}
                      {isVisibleFabricationBatterie && (
                        <div className="space-y-1">
                          <label htmlFor="form-bat-fab" className="block text-[9px] font-bold text-slate-400 uppercase">Fabrication.</label>
                          <input
                            type="date"
                            id="form-bat-fab"
                            value={fabricationBatterie}
                            onChange={(e) => setFabricationBatterie(e.target.value)}
                            className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                          />
                        </div>
                      )}
                      {isVisibleInsertionBatterie && (
                        <div className="space-y-1">
                          <label htmlFor="form-bat-ins" className="block text-[9px] font-bold text-slate-400 uppercase">Insertion.</label>
                          <input
                            type="date"
                            id="form-bat-ins"
                            value={insertionBatterie}
                            onChange={(e) => setInsertionBatterie(e.target.value)}
                            className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <label htmlFor="form-bat-liv" className="block text-[9px] font-bold text-slate-400 uppercase">Livraison.</label>
                        <input
                          type="date"
                          id="form-bat-liv"
                          value={livraisonBatterie}
                          onChange={(e) => setLivraisonBatterie(e.target.value)}
                          className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                        />
                      </div>
                    </div>

                    {/* Batterie de secours radio button */}
                    <div className="space-y-1">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Batterie de secours.</span>
                      <div className="flex gap-4 py-1">
                        <button
                          type="button"
                          onClick={() => setHasBatterieSecours('Oui')}
                          className="inline-flex items-center cursor-pointer gap-2 select-none"
                          style={{ fontSize: '16px', color: '#000' }}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasBatterieSecours === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                            {hasBatterieSecours === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                          </span>
                          Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => setHasBatterieSecours('Non')}
                          className="inline-flex items-center cursor-pointer gap-2 select-none"
                          style={{ fontSize: '16px', color: '#000' }}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${hasBatterieSecours === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                            {hasBatterieSecours === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                          </span>
                          Non
                        </button>
                      </div>
                    </div>

                    {hasBatterieSecours === 'Oui' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1 bg-white">
                          <label htmlFor="form-bat-sec-lookup" className="block text-[10px] font-bold text-slate-400 uppercase">Modèle de batterie de secours.</label>
                          <select
                            id="form-bat-sec-lookup"
                            value={modeleBatterieSecoursId}
                            onChange={(e) => setModeleBatterieSecoursId(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700"
                          >
                            <option value="">-- Sélectionner Batterie --</option>
                            {modelesBatterie.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.marque === 'Standard' ? v.nom : `${v.marque} - ${v.nom}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {isVisiblePeremptionBatterie && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-bat-sec-lot" className="block text-[10px] font-bold text-slate-400 uppercase">Lot de la batterie de secours.</label>
                            <input
                              type="text"
                              id="form-bat-sec-lot"
                              value={lotBatterieSecours || ''}
                              onChange={(e) => setLotBatterieSecours(e.target.value)}
                              placeholder="Numéro de lot"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700 font-mono"
                            />
                          </div>
                        )}

                        {isVisiblePeremptionBatterie && (
                          <div className="space-y-1 bg-white">
                            <label htmlFor="form-bat-sec-per" className="block text-[10px] font-bold text-slate-400 uppercase">Péremption de la batterie de secours.</label>
                            <input
                              type="date"
                              id="form-bat-sec-per"
                              value={peremptionBatterieSecours}
                              onChange={(e) => setPeremptionBatterieSecours(e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="form-bat-sit" className="block text-[10px] font-bold text-slate-400 uppercase">Statut.</label>
                        <select
                          id="form-bat-sit"
                          value={situationBatterie}
                          onChange={(e) => setSituationBatterie(e.target.value as any)}
                          className={`w-full px-2 py-1 border border-slate-200 rounded text-xs font-semibold ${
                            situationBatterie === 'Vert' ? 'bg-emerald-50 text-emerald-800' : situationBatterie === 'Orange' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'
                          }`}
                        >
                          <option value="Vert">Conforme</option>
                          <option value="Orange">Attention</option>
                          <option value="Rouge">Alerte</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="form-bat-pct" className="block text-[10px] font-bold text-slate-400 uppercase">{t("Pourcentage constaté.")}</label>
                        <input
                          type="text"
                          id="form-bat-pct"
                          value={pourcentageBatterie}
                          onChange={(e) => setPourcentageBatterie(e.target.value)}
                          placeholder="Ex: 93%."
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-semibold text-slate-850"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="form-peremption-trousse" className="block text-[11px] font-bold text-slate-500 uppercase">Péremption de la trousse.</label>
                      <input
                        type="date"
                        id="form-peremption-trousse"
                        value={peremptionTrousse}
                        onChange={(e) => setPeremptionTrousse(e.target.value)}
                        className="w-full px-3 py-1 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="form-bat-com" className="block text-[11px] font-bold text-slate-500 uppercase">Commentaire.</label>
                      <input
                        type="text"
                        id="form-bat-com"
                        value={commentaireBatterie}
                        onChange={(e) => setCommentaireBatterie(e.target.value)}
                        placeholder="Entrez votre commentaire."
                        className="w-full px-3 py-1 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Section 9 - Catégories (Toggles) */}
                  <div 
                    className="bg-white p-5 relative space-y-3"
                    style={{
                      border: '1px solid rgb(218, 218, 218)',
                      borderTop: 'none',
                      borderRadius: '0px 0px 18px 18px',
                    }}
                  >
                    <div className="mb-2 bg-transparent">
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
                        {t("9 — Catégories")}
                      </span>
                    </div>

                    {/* Yes/No Choices of Category */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      
                      {/* Loué */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Loué.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setLoue('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${loue === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {loue === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setLoue('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${loue === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {loue === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Prêté */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Prêté.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPrete('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${prete === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {prete === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrete('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${prete === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {prete === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Stocké */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Stocké.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setStocke('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${stocke === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {stocke === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setStocke('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${stocke === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {stocke === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Archivé */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Archivé.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setArchive('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${archive === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {archive === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchive('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${archive === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {archive === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Conforme */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">
                          Conforme.
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConforme('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${conforme === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {conforme === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setConforme('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${conforme === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {conforme === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Sous-traitance */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Opéré en sous-traitance.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setSousTraitance('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${sousTraitance === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {sousTraitance === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setSousTraitance('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${sousTraitance === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {sousTraitance === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* FSM Autorisé */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Maintenance autorisée.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setFsmAutorise('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${fsmAutorise === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {fsmAutorise === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setFsmAutorise('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${fsmAutorise === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {fsmAutorise === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Email Mensuel Auto-Vigilence */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">{t("Email mensuel d'auto-vigilance")}.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRappelMensuelAuto('Oui');
                              setRappelHebdoAuto('Non');
                              setRappelJournalierAuto('Non');
                            }}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${rappelMensuelAuto === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {rappelMensuelAuto === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setRappelMensuelAuto('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${rappelMensuelAuto === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {rappelMensuelAuto === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Email Hebdomadaire Auto-Vigilence */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">{t("Email hebdomadaire d'auto-vigilance")}.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRappelHebdoAuto('Oui');
                              setRappelMensuelAuto('Non');
                              setRappelJournalierAuto('Non');
                            }}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${rappelHebdoAuto === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {rappelHebdoAuto === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setRappelHebdoAuto('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${rappelHebdoAuto === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {rappelHebdoAuto === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Email Journalier Auto-Vigilence */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">{t("Email journalier d'auto-vigilance")}.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRappelJournalierAuto('Oui');
                              setRappelMensuelAuto('Non');
                              setRappelHebdoAuto('Non');
                            }}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${rappelJournalierAuto === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {rappelJournalierAuto === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setRappelJournalierAuto('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${rappelJournalierAuto === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {rappelJournalierAuto === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>

                      {/* Survie */}
                      <div className="p-2 space-y-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Utilisé par une victime.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setVictimeSurvie('Oui')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${victimeSurvie === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {victimeSurvie === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setVictimeSurvie('Non')}
                            className="inline-flex items-center cursor-pointer gap-2 select-none"
                            style={{ fontSize: '16px', color: '#000' }}
                          >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${victimeSurvie === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                              {victimeSurvie === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                            </span>
                            Non
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                      {/* Âge Victime */}
                      <div className="space-y-1 sm:col-span-4">
                        <label htmlFor="form-age" className="block text-[10px] font-bold text-slate-400 uppercase">Âge de la victime.</label>
                        <input
                          type="number"
                          id="form-age"
                          value={ageVictime}
                          onChange={(e) => setAgeVictime(e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-800"
                          style={{ maxWidth: '240px' }}
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
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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
                        <div class="w-5 h-5 rounded-full bg-black border-2 border-white shadow-lg"></div>
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
            <div className="p-4 bg-slate-50">
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
                className="flex-1 py-3 bg-black hover:bg-neutral-900 text-white font-bold transition-all cursor-pointer font-sans"
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

      {/* ======================================= */}
      {/* 🛠️ BULK EDIT / MASS SELECTION SIDE PANE 🛠️ */}
      {/* ======================================= */}
      {isBulkEditOpen && (
        <div 
          className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-white shadow-2xl z-[90] flex flex-col border-l border-slate-200 transform transition-transform animate-none" 
          id="bulk-side-pane"
          style={{ height: '100%' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0">
            <h3 className="text-md font-bold font-sans animate-none" style={{ fontSize: '18px', color: '#000000', cursor: 'default' }}>
              Modification de {selectedIds.length} défibrillateur(s).
            </h3>
          </div>

          <form onSubmit={handleBulkEditSubmit} className="flex-1 flex flex-col min-h-0" id="bulk-edit-form">
            {/* Scroll Area containing all fields */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Toggle 1: Modèle. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBulkApplyModele(!bulkApplyModele)}
                  className="w-full flex items-center justify-between cursor-pointer focus:outline-hidden bg-transparent border-0 text-left p-0 pb-1"
                >
                  <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: bulkApplyModele ? 'bold' : 100 }}>
                    Modèle.
                  </span>
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      bulkApplyModele ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`}
                    style={{ borderWidth: '2.5px' }}
                  >
                    {bulkApplyModele && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                </button>
                
                {bulkApplyModele && (
                  <div className="py-2">
                    <div className="relative">
                      <select
                        value={bulkModeleId}
                        onChange={(e) => setBulkModeleId(e.target.value)}
                        style={{ ...filterInputStyle, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                        className="w-full outline-none"
                      >
                        <option value="">-- Choisir un modèle --</option>
                        {modelesDefib.map(m => (
                          <option key={m.id} value={m.id}>{m.nom}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Toggle 2: Commentaire. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBulkApplyCommentaire(!bulkApplyCommentaire)}
                  className="w-full flex items-center justify-between cursor-pointer focus:outline-hidden bg-transparent border-0 text-left p-0 pb-1"
                >
                  <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: bulkApplyCommentaire ? 'bold' : 100 }}>
                    Commentaire.
                  </span>
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      bulkApplyCommentaire ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`}
                    style={{ borderWidth: '2.5px' }}
                  >
                    {bulkApplyCommentaire && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                </button>
                
                {bulkApplyCommentaire && (
                  <div className="py-2">
                    <input
                      type="text"
                      value={bulkCommentaire}
                      onChange={(e) => setBulkCommentaire(e.target.value)}
                      placeholder="Entrez votre commentaire."
                      style={filterInputStyle}
                      className="outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Toggle 3: Dernière maintenance. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBulkApplyDerniereMaint(!bulkApplyDerniereMaint)}
                  className="w-full flex items-center justify-between cursor-pointer focus:outline-hidden bg-transparent border-0 text-left p-0 pb-1"
                >
                  <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: bulkApplyDerniereMaint ? 'bold' : 100 }}>
                    Dernière maintenance.
                  </span>
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      bulkApplyDerniereMaint ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`}
                    style={{ borderWidth: '2.5px' }}
                  >
                    {bulkApplyDerniereMaint && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                </button>
                
                {bulkApplyDerniereMaint && (
                  <div className="py-2">
                    <input
                      type="date"
                      value={bulkDerniereMaint}
                      onChange={(e) => setBulkDerniereMaint(e.target.value)}
                      style={filterInputStyle}
                      className="outline-none bg-white font-sans text-black [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    />
                  </div>
                )}
              </div>

              {/* Toggle 4: Prochaine maintenance. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBulkApplyProchaineMaint(!bulkApplyProchaineMaint)}
                  className="w-full flex items-center justify-between cursor-pointer focus:outline-hidden bg-transparent border-0 text-left p-0 pb-1"
                >
                  <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: bulkApplyProchaineMaint ? 'bold' : 100 }}>
                    Prochaine maintenance.
                  </span>
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      bulkApplyProchaineMaint ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`}
                    style={{ borderWidth: '2.5px' }}
                  >
                    {bulkApplyProchaineMaint && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                </button>
                
                {bulkApplyProchaineMaint && (
                  <div className="py-2">
                    <input
                      type="date"
                      value={bulkProchaineMaint}
                      onChange={(e) => setBulkProchaineMaint(e.target.value)}
                      style={filterInputStyle}
                      className="outline-none bg-white font-sans text-black [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    />
                  </div>
                )}
              </div>

              {/* Toggle 5: Archivé. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBulkApplyArchive(!bulkApplyArchive)}
                  className="w-full flex items-center justify-between cursor-pointer focus:outline-hidden bg-transparent border-0 text-left p-0 pb-1"
                >
                  <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: bulkApplyArchive ? 'bold' : 100 }}>
                    Archivé.
                  </span>
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      bulkApplyArchive ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`}
                    style={{ borderWidth: '2.5px' }}
                  >
                    {bulkApplyArchive && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                </button>
                
                {bulkApplyArchive && (
                  <div className="py-2 flex items-center gap-6 font-sans">
                    <button
                      type="button"
                      onClick={() => setBulkArchive('Oui')}
                      className="flex items-center gap-2 cursor-pointer focus:outline-hidden bg-transparent border-0"
                    >
                      <div 
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          bulkArchive === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                        }`} 
                        style={{ borderWidth: '2.5px' }}
                      >
                        {bulkArchive === 'Oui' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </div>
                      <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Oui</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBulkArchive('Non')}
                      className="flex items-center gap-2 cursor-pointer focus:outline-hidden bg-transparent border-0"
                    >
                      <div 
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          bulkArchive === 'Non' ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                        }`} 
                        style={{ borderWidth: '2.5px' }}
                      >
                        {bulkArchive === 'Non' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </div>
                      <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Non</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Toggle 6: Conforme. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBulkApplyConforme(!bulkApplyConforme)}
                  className="w-full flex items-center justify-between cursor-pointer focus:outline-hidden bg-transparent border-0 text-left p-0 pb-1"
                >
                  <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: bulkApplyConforme ? 'bold' : 100 }}>
                    Conforme.
                  </span>
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      bulkApplyConforme ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`}
                    style={{ borderWidth: '2.5px' }}
                  >
                    {bulkApplyConforme && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                </button>
                
                {bulkApplyConforme && (
                  <div className="py-2 flex items-center gap-6 font-sans">
                    <button
                      type="button"
                      onClick={() => setBulkConforme('Oui')}
                      className="flex items-center gap-2 cursor-pointer focus:outline-hidden bg-transparent border-0"
                    >
                      <div 
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          bulkConforme === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                        }`} 
                        style={{ borderWidth: '2.5px' }}
                      >
                        {bulkConforme === 'Oui' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </div>
                      <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Oui</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBulkConforme('Non')}
                      className="flex items-center gap-2 cursor-pointer focus:outline-hidden bg-transparent border-0"
                    >
                      <div 
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          bulkConforme === 'Non' ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                        }`} 
                        style={{ borderWidth: '2.5px' }}
                      >
                        {bulkConforme === 'Non' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </div>
                      <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Non</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Toggle 7: Maintenance autorisée. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBulkApplyFsmAutorise(!bulkApplyFsmAutorise)}
                  className="w-full flex items-center justify-between cursor-pointer focus:outline-hidden bg-transparent border-0 text-left p-0 pb-1"
                >
                  <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: bulkApplyFsmAutorise ? 'bold' : 100 }}>
                    Maintenance autorisée.
                  </span>
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      bulkApplyFsmAutorise ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`}
                    style={{ borderWidth: '2.5px' }}
                  >
                    {bulkApplyFsmAutorise && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                </button>
                
                {bulkApplyFsmAutorise && (
                  <div className="py-2 flex items-center gap-6 font-sans">
                    <button
                      type="button"
                      onClick={() => setBulkFsmAutorise('Oui')}
                      className="flex items-center gap-2 cursor-pointer focus:outline-hidden bg-transparent border-0"
                    >
                      <div 
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          bulkFsmAutorise === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                        }`} 
                        style={{ borderWidth: '2.5px' }}
                      >
                        {bulkFsmAutorise === 'Oui' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </div>
                      <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Oui</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBulkFsmAutorise('Non')}
                      className="flex items-center gap-2 cursor-pointer focus:outline-hidden bg-transparent border-0"
                    >
                      <div 
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          bulkFsmAutorise === 'Non' ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                        }`} 
                        style={{ borderWidth: '2.5px' }}
                      >
                        {bulkFsmAutorise === 'Non' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </div>
                      <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Non</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Toggle 8: Email Mensuel AutoVigilance. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBulkApplyRappelMensuelAuto(!bulkApplyRappelMensuelAuto)}
                  className="w-full flex items-center justify-between cursor-pointer focus:outline-hidden bg-transparent border-0 text-left p-0 pb-1"
                >
                  <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: bulkApplyRappelMensuelAuto ? 'bold' : 100 }}>
                    {t("Email mensuel d'auto-vigilance")}.
                  </span>
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      bulkApplyRappelMensuelAuto ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`}
                    style={{ borderWidth: '2.5px' }}
                  >
                    {bulkApplyRappelMensuelAuto && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                </button>
                
                {bulkApplyRappelMensuelAuto && (
                  <div className="py-2 flex items-center gap-6 font-sans">
                    <button
                      type="button"
                      onClick={() => setBulkRappelMensuelAuto('Oui')}
                      className="flex items-center gap-2 cursor-pointer focus:outline-hidden bg-transparent border-0"
                    >
                      <div 
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          bulkRappelMensuelAuto === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                        }`} 
                        style={{ borderWidth: '2.5px' }}
                      >
                        {bulkRappelMensuelAuto === 'Oui' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </div>
                      <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Oui</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBulkRappelMensuelAuto('Non')}
                      className="flex items-center gap-2 cursor-pointer focus:outline-hidden bg-transparent border-0"
                    >
                      <div 
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          bulkRappelMensuelAuto === 'Non' ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                        }`} 
                        style={{ borderWidth: '2.5px' }}
                      >
                        {bulkRappelMensuelAuto === 'Non' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </div>
                      <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Non</span>
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* Footer Actions matching Filters side pane button styles */}
            <div className="p-6 bg-white flex gap-4 shrink-0">
              <button
                type="button"
                onClick={() => setIsBulkEditOpen(false)}
                style={{ ...cancelFiltersButtonStyle, fontSize: '18px' }}
                className="flex-1 text-center font-sans cursor-pointer animate-none"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!bulkApplyModele && !bulkApplyCommentaire && !bulkApplyDerniereMaint && !bulkApplyProchaineMaint && !bulkApplyArchive && !bulkApplyConforme && !bulkApplyFsmAutorise && !bulkApplyRappelMensuelAuto}
                style={{
                  ...applyFiltersButtonStyle,
                  backgroundColor: 'rgb(53, 86, 236)',
                  color: 'rgb(255, 255, 255)',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                  fontSize: '18px',
                }}
                className="flex-1 text-center font-sans cursor-pointer animate-none"
              >
                Confirmer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk side overlay background backdrop */}
      {isBulkEditOpen && (
        <div 
          onClick={() => setIsBulkEditOpen(false)}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-[85]"
        />
      )}

      {/* ============================================== */}
      {/* 📡 GÉODAE ATLASANTÉ TRANSMISSION SIDE PANE 📡 */}
      {/* ============================================== */}
      {isAtlasantePaneOpen && (
        <div 
          className="fixed inset-y-0 right-0 w-80 sm:w-[450px] bg-white shadow-2xl z-[90] flex flex-col border-l border-slate-200" 
          id="atlasante-side-pane"
          style={{ height: '100%' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0">
            <h3 className="text-lg font-bold font-sans text-black">
              Résultat de la transmission.
            </h3>
            <button 
              onClick={() => setIsAtlasantePaneOpen(false)}
              style={{
                backgroundColor: '#000',
                color: '#fff',
                fontSize: '18px',
                padding: '8px 20px',
                borderRadius: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                border: 'none',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
              }}
              className="hover:opacity-95 active:scale-95 transition-all"
            >
              Fermer
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-3">
                {atlasanteUploadResults.map((res, idx) => (
                  <div 
                    key={idx} 
                    className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="font-sans font-bold text-black text-[18px]">
                          {res.identifiant || 'Sans ID'}
                        </div>
                        <div className="font-sans font-bold text-black text-[18px]">
                          {res.numeroSerie || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span 
                          style={{ backgroundColor: '#7b2882', color: '#fff', fontSize: '16px' }}
                          className="px-3.5 py-1.5 font-semibold rounded-full font-sans inline-block text-center"
                        >
                          {res.success ? 'Transmis' : 'Échec'}
                        </span>
                      </div>
                    </div>

                    {res.success && res.data && (
                      <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-100/50 mt-1">
                        {Array.isArray(res.data) && res.data[0] ? (
                          <>
                            <div>Statut: {res.data[0].msg || 'Enregistré'}</div>
                            {res.data[0].gid && <div className="font-mono">ID GÉODAE: {res.data[0].gid}</div>}
                          </>
                        ) : typeof res.data === 'object' ? (
                          JSON.stringify(res.data)
                        ) : (
                          String(res.data)
                        )}
                      </div>
                    )}

                    {!res.success && (
                      <div 
                        style={{ color: '#ef4444', fontSize: '18px' }} 
                        className="mt-1 space-y-1 font-sans"
                      >
                        <div className="font-bold">Erreur : {res.error}</div>
                        {res.details && (
                          <div 
                            style={{ color: '#ef4444', fontSize: '18px' }}
                            className="opacity-90 font-mono break-all max-h-24 overflow-y-auto mt-1"
                          >
                            {res.details}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GÉODAE overlay background backdrop */}
      {isAtlasantePaneOpen && (
        <div 
          onClick={() => {
            if (!isAtlasanteUploading) setIsAtlasantePaneOpen(false);
          }}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-[85]"
        />
      )}

      {/* 🧭 FILTER SIDE PANE / DRAWER 🧭 */}
      {isFilterPaneOpen && (
        <div 
          className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-white shadow-2xl z-[90] flex flex-col border-l border-slate-200 transform transition-transform" 
          id="filter-side-pane"
          style={{ height: '100%' }}
        >
          {/* Scroll Area containing all fields */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Filter 1: Région */}
            <div className="space-y-1.5">
              <div className="relative">
                <select
                  value={draftFilters.region}
                  onChange={(e) => setDraftFilters({ ...draftFilters, region: e.target.value })}
                  style={filterInputStyle}
                >
                  <option value="Tous">Toutes régions.</option>
                  {Array.from(new Set(Object.values(REGIONS_BY_COUNTRY).flat())).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter 2: Modèle Appareil */}
            <div className="space-y-1.5">
              <div className="relative">
                <select
                  value={draftFilters.modeleId}
                  onChange={(e) => setDraftFilters({ ...draftFilters, modeleId: e.target.value })}
                  style={filterInputStyle}
                >
                  <option value="Tous">Tous modèles.</option>
                  {modelesDefib.map(m => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter 6: Catégorie */}
            <div className="space-y-1.5">
              <div className="relative">
                <select
                  value={draftFilters.categorie}
                  onChange={(e) => setDraftFilters({ ...draftFilters, categorie: e.target.value })}
                  style={filterInputStyle}
                >
                  <option value="Tous">Toutes catégories.</option>
                  <option value="Loué">Loué</option>
                  <option value="Prêté">Prêté</option>
                  <option value="Stocké">Stocké</option>
                  <option value="Archivé">Archivé</option>
                  <option value="Sous-Traitance">Sous-Traitance</option>
                </select>
              </div>
            </div>

            {/* Filter 7: Contrat */}
            <div className="space-y-1.5">
              <div className="relative">
                <select
                  value={draftFilters.contrat}
                  onChange={(e) => setDraftFilters({ ...draftFilters, contrat: e.target.value })}
                  style={filterInputStyle}
                >
                  <option value="Tous">Avec ou sans contrat.</option>
                  <option value="Oui">Avec contrat</option>
                  <option value="Non">Sans contrat</option>
                </select>
              </div>
            </div>

            {/* Filter 3: Action Requise 3-6 Mois */}
            <div className="py-1 flex items-center justify-between gap-4">
              <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: 100 }}>Action requise 3 à 6 mois.</span>
              <div className="flex items-center gap-4">
                {/* Oui Option */}
                <button
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, action3To6: true })}
                  className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                >
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      draftFilters.action3To6 ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`} 
                    style={{ borderWidth: '2.5px' }}
                  >
                    {draftFilters.action3To6 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                  <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Oui</span>
                </button>

                {/* Non Option */}
                <button
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, action3To6: false })}
                  className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                >
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      !draftFilters.action3To6 ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`} 
                    style={{ borderWidth: '2.5px' }}
                  >
                    {!draftFilters.action3To6 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                  <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Non</span>
                </button>
              </div>
            </div>

            {/* Filter 4: Action Requise 3 Mois */}
            <div className="py-1 flex items-center justify-between gap-4">
              <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: 100 }}>Action requise 3 mois.</span>
              <div className="flex items-center gap-4">
                {/* Oui Option */}
                <button
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, actionUnder3: true })}
                  className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                >
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      draftFilters.actionUnder3 ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`} 
                    style={{ borderWidth: '2.5px' }}
                  >
                    {draftFilters.actionUnder3 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                  <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Oui</span>
                </button>

                {/* Non Option */}
                <button
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, actionUnder3: false })}
                  className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                >
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      !draftFilters.actionUnder3 ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`} 
                    style={{ borderWidth: '2.5px' }}
                  >
                    {!draftFilters.actionUnder3 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                  <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Non</span>
                </button>
              </div>
            </div>

            {/* Filter 5: Action Requise Expirée */}
            <div className="py-1 flex items-center justify-between gap-4">
              <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: 100 }}>Action requise expirée.</span>
              <div className="flex items-center gap-4">
                {/* Oui Option */}
                <button
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, actionExpired: true })}
                  className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                >
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      draftFilters.actionExpired ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`} 
                    style={{ borderWidth: '2.5px' }}
                  >
                    {draftFilters.actionExpired && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                  <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Oui</span>
                </button>

                {/* Non Option */}
                <button
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, actionExpired: false })}
                  className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                >
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      !draftFilters.actionExpired ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`} 
                    style={{ borderWidth: '2.5px' }}
                  >
                    {!draftFilters.actionExpired && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                  <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Non</span>
                </button>
              </div>
            </div>

            {/* Filter 6: Rejeté(s) en intervention */}
            <div className="py-1 flex items-center justify-between gap-4">
              <span className="text-[16px] text-black font-sans font-semibold" style={{ fontWeight: 100 }}>Rejeté(s) en intervention.</span>
              <div className="flex items-center gap-4">
                {/* Oui Option */}
                <button
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, actionRejected: true })}
                  className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                >
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      draftFilters.actionRejected ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`} 
                    style={{ borderWidth: '2.5px' }}
                  >
                    {draftFilters.actionRejected && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                  <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Oui</span>
                </button>

                {/* Non Option */}
                <button
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, actionRejected: false })}
                  className="flex items-center gap-2 cursor-pointer focus:outline-hidden"
                >
                  <div 
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      !draftFilters.actionRejected ? 'border-[#fe4eba]' : 'border-slate-400 bg-white'
                    }`} 
                    style={{ borderWidth: '2.5px' }}
                  >
                    {!draftFilters.actionRejected && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                    )}
                  </div>
                  <span className="text-[16px] text-black font-sans" style={{ fontWeight: 100 }}>Non</span>
                </button>
              </div>
            </div>

          </div>

          {/* Footer Actions - 50/50 Side by side with zero top divider, matching active column action button styles */}
          <div className="p-6 bg-white flex gap-4 shrink-0">
            <button
              onClick={() => {
                const defaults = {
                  region: 'Tous',
                  modeleId: 'Tous',
                  action3To6: false,
                  actionUnder3: false,
                  actionExpired: false,
                  categorie: 'Tous',
                  contrat: 'Tous',
                  actionRejected: false,
                };
                setDraftFilters(defaults);
                setActiveFilters(defaults);
                setIsFilterPaneOpen(false);
              }}
              style={{ ...cancelFiltersButtonStyle, fontSize: '18px' }}
              className="flex-1 text-center font-sans cursor-pointer animate-none"
            >
              Annuler
            </button>
            <button
              onClick={() => {
                setActiveFilters(draftFilters);
                setIsFilterPaneOpen(false);
              }}
              style={{
                ...applyFiltersButtonStyle,
                backgroundColor: 'rgb(53, 86, 236)',
                color: 'rgb(255, 255, 255)',
                boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                fontSize: '18px',
              }}
              className="flex-1 text-center font-sans cursor-pointer animate-none"
            >
              Appliquer
            </button>
          </div>
        </div>
      )}

      {/* Drawer Overlay backdrop */}
      {isFilterPaneOpen && (
        <div 
          onClick={() => setIsFilterPaneOpen(false)}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-[85]"
        />
      )}


    </div>
  );
}
