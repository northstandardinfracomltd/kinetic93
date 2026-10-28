import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../utils/translate';
import { Variable, StockRecord, DistributedStockLocation, Member, CompanyInfo, getTenantSpreadsheetUrl, openTenantSpreadsheetUrl } from '../types';
import { getLocationCustomName } from '../utils';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { SearchSidePane, SearchSidePaneItem } from './SearchSidePane';
import { logDeleteDistributedStock } from '../services/suspiciousActivityService';

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

  const barWidth = 1.5;
  const barcodeHeight = 30;
  const textHeight = 15;
  const totalHeight = barcodeHeight + textHeight;
  const totalWidth = binaryString.length * barWidth;
  
  let rects = '';
  for (let i = 0; i < binaryString.length; i++) {
    if (binaryString[i] === '1') {
      rects += `<rect x="${i * barWidth}" y="0" width="${barWidth}" height="${barcodeHeight}" fill="black" />`;
    }
  }
  
  const textElement = `<text x="${totalWidth / 2}" y="${barcodeHeight + 12}" font-family="'DefibeoMain', 'Civilprom', sans-serif" font-size="10" text-anchor="middle" fill="black">${text}</text>`;
  
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

const ALL_LOCATIONS = [
  'Centrale des stocks',
  'Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E', 'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J',
  'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E', 'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J'
] as const;

interface StocksDistribuesTabProps {
  distributedStocks: DistributedStockLocation[];
  saveDistributedStocks: (updated: DistributedStockLocation[]) => void;
  stocks: StockRecord[];
  saveStocks?: (updated: StockRecord[]) => void;
  variables: Variable[];
  members?: Member[];
  fsmTours?: any[];
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  onNavigateToCentraleStocks?: (ugs: string) => void;
  setActiveTab?: (tab: any) => void;
  companyInfo?: Partial<CompanyInfo> | null;
}

export default function StocksDistribuesTab({
  distributedStocks = [],
  saveDistributedStocks,
  stocks = [],
  saveStocks,
  variables = [],
  members = [],
  fsmTours = [],
  searchQuery: externalSearchQuery,
  setSearchQuery: externalSetSearchQuery,
  onNavigateToCentraleStocks,
  setActiveTab,
  companyInfo,
}: StocksDistribuesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Inventory states
  const [isInventoryMode, setIsInventoryMode] = useState<boolean>(false);
  const [checkedTraceabilityIds, setCheckedTraceabilityIds] = useState<Record<string, boolean>>({});

  // Form states - now maps to a StockRecord (Centrale des stocks) instead of raw variable
  const [selectedStockId, setSelectedStockId] = useState('');
  const [isSidePaneStockOpen, setIsSidePaneStockOpen] = useState(false);

  const stockSidePaneItems: SearchSidePaneItem[] = useMemo(() => {
    return (stocks || []).map((st) => {
      const vObj = variables.find(v => v.id === st.denominationPieceId);
      const pieceName = vObj ? vObj.nom : 'Dénomination inconnue';
      return {
        id: st.id,
        label: pieceName,
        raw: { st, vObj },
      };
    });
  }, [stocks, variables]);
  const [locationName, setLocationName] = useState<DistributedStockLocation['locationName']>('Centrale des stocks');
  const [volumeDisponible, setVolumeDisponible] = useState<number>(0);
  const [volumeReserve, setVolumeReserve] = useState<number>(0);
  const [volumeEntrant, setVolumeEntrant] = useState<number>(0);

  // Search/filter states
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : localSearchQuery;
  const setSearchQuery = externalSetSearchQuery !== undefined ? externalSetSearchQuery : setLocalSearchQuery;

  const [locationFilter, setLocationFilter] = useState<string>('Tous');

  // New Filters
  const [attentionFilterActive, setAttentionFilterActive] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [exportLocation, setExportLocation] = useState('');
  const [isFilterSidePaneOpen, setIsFilterSidePaneOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [clickedPill, setClickedPill] = useState<string | null>(null);
  const [spreadsheetVersion, setSpreadsheetVersion] = useState(0);
  const [slidingNavTab, setSlidingNavTab] = useState<'stocks' | 'stocks-distribues'>('stocks-distribues');

  useEffect(() => {
    const handleSpreadsheetUpdated = () => setSpreadsheetVersion((v) => v + 1);
    window.addEventListener('defib-tenant-spreadsheets-updated', handleSpreadsheetUpdated);
    window.addEventListener('storage', handleSpreadsheetUpdated);
    return () => {
      window.removeEventListener('defib-tenant-spreadsheets-updated', handleSpreadsheetUpdated);
      window.removeEventListener('storage', handleSpreadsheetUpdated);
    };
  }, []);

  const resolvedSpreadsheetUrl = useMemo(() => {
    return getTenantSpreadsheetUrl('spreadsheetStocksDistribues', companyInfo);
  }, [companyInfo, spreadsheetVersion]);

  const handleRefreshDistributedStocks = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      window.dispatchEvent(
        new CustomEvent('defib-manual-refresh-spreadsheet', {
          detail: { spreadsheetKey: 'spreadsheetStocksDistribues', idSuffix: 'stocks-distribues' },
        })
      );
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  // Search input state highlights
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Load selected stock item from Centrale des stocks
  const mainStockItem = useMemo(() => {
    if (!selectedStockId) return null;
    return stocks.find(s => s.id === selectedStockId) || null;
  }, [selectedStockId, stocks]);

  // Load selected stock movements from Centrale des stocks
  const selectedPieceMovements = useMemo(() => {
    return mainStockItem?.mouvements || [];
  }, [mainStockItem]);

  const traceabilities = useMemo(() => {
    const raw = mainStockItem?.traceabilities || [];
    return raw.filter(t => {
      if (t.situation !== 'Disponible' && t.situation !== 'Signalé manquant') {
        return false;
      }
      let currentLoc = 'Centrale';
      if (t.emplacement) {
        currentLoc = t.emplacement;
      } else {
        const matchedMv = selectedPieceMovements.find(mv => mv.id === t.movementId);
        if (matchedMv) {
          if (matchedMv.type === 'Réapprovisionnement fournisseur') {
            currentLoc = 'Centrale';
          } else if (matchedMv.emplacement) {
            if (matchedMv.emplacement.includes(' : ')) {
              currentLoc = matchedMv.emplacement.split(' : ')[1];
            } else {
              currentLoc = matchedMv.emplacement;
            }
          }
        }
      }
      return currentLoc === locationName;
    });
  }, [mainStockItem, locationName, selectedPieceMovements]);

  // Dynamically calculate outgoing volumes and impacted defibrillators from active tours
  const getPieceOutgoingStats = useMemo(() => {
    return (denomPieceId: string) => {
      const stats = {
        week1: { vol: 0, defibs: [] as string[] },
        week2: { vol: 0, defibs: [] as string[] },
        next30: { vol: 0, defibs: [] as string[] }
      };

      if (!denomPieceId) return stats;

      const vObj = variables.find(v => v.id === denomPieceId);
      if (!vObj) return stats;

      const pieceNameLower = vObj.nom.toLowerCase().trim();

      const getDaysDiff = (dateStr: string) => {
        if (!dateStr) return 999;
        const base = new Date();
        base.setHours(0,0,0,0);
        const target = new Date(dateStr);
        target.setHours(0,0,0,0);
        const diffTime = target.getTime() - base.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      };

      const activeToursList = (fsmTours || []).filter(t => 
        t.status === 'Brouillon' || t.status === 'À faire' || t.status === 'En cours'
      );

      activeToursList.forEach(tour => {
        const diffDays = getDaysDiff(tour.startDate);
        const missions = tour.missions || tour.passages || [];
        
        missions.forEach((m: any) => {
          const parts = m.requiredParts || [];
          const matchCount = parts.filter((p: string) => p && p.toLowerCase().trim() === pieceNameLower).length;
          
          if (matchCount > 0) {
            const defibId = m.defibIdentifiant || m.identifiant || 'Inconnu';
            
            if (diffDays <= 7) {
              stats.week1.vol += matchCount;
              if (!stats.week1.defibs.includes(defibId)) {
                stats.week1.defibs.push(defibId);
              }
            } else if (diffDays > 7 && diffDays <= 14) {
              stats.week2.vol += matchCount;
              if (!stats.week2.defibs.includes(defibId)) {
                stats.week2.defibs.push(defibId);
              }
            }
            
            if (diffDays > 7 && diffDays <= 30) {
              stats.next30.vol += matchCount;
              if (!stats.next30.defibs.includes(defibId)) {
                stats.next30.defibs.push(defibId);
              }
            }
          }
        });
      });

      return stats;
    };
  }, [fsmTours, variables]);

  const outgoingStats = useMemo(() => {
    const matchedStock = stocks.find(s => s.id === selectedStockId);
    if (!matchedStock) return { week1: { vol: 0, defibs: [] }, week2: { vol: 0, defibs: [] }, next30: { vol: 0, defibs: [] } };
    return getPieceOutgoingStats(matchedStock.denominationPieceId);
  }, [getPieceOutgoingStats, selectedStockId, stocks]);

  const handleExportInvTraca = () => {
    // 1. Gather all items to export across all locations (distributed stocks + central stock items)
    const itemsToExport: Array<{
      locationName: string;
      stockId?: string;
      denominationPieceId: string;
      volumeDisponible: number;
      volumeReserve: number;
      volumeEntrant: number;
    }> = distributedStocks.map(ds => ({
      locationName: ds.locationName,
      stockId: ds.stockId,
      denominationPieceId: ds.denominationPieceId,
      volumeDisponible: ds.volumeDisponible,
      volumeReserve: ds.volumeReserve,
      volumeEntrant: ds.volumeEntrant
    }));

    // Include Central des stocks items from `stocks` that are not already in `distributedStocks` for 'Centrale des stocks'
    stocks.forEach(s => {
      const alreadyInDistributed = distributedStocks.some(ds => 
        ds.locationName === 'Centrale des stocks' && (ds.stockId === s.id || ds.denominationPieceId === s.denominationPieceId)
      );
      if (!alreadyInDistributed) {
        const hasQtyOrTrace = (Number(s.quantite) || 0) > 0 || (Number(s.quantiteReservee) || 0) > 0 || (s.traceabilities || []).length > 0;
        if (hasQtyOrTrace) {
          itemsToExport.push({
            locationName: 'Centrale des stocks',
            stockId: s.id,
            denominationPieceId: s.denominationPieceId,
            volumeDisponible: Number(s.quantite) || 0,
            volumeReserve: Number(s.quantiteReservee) || 0,
            volumeEntrant: 0
          });
        }
      }
    });

    // Sort items by location order then by piece name
    const locationPriority: Record<string, number> = {};
    ALL_LOCATIONS.forEach((loc, idx) => {
      locationPriority[loc] = idx;
    });

    itemsToExport.sort((a, b) => {
      const prioA = locationPriority[a.locationName] ?? 99;
      const prioB = locationPriority[b.locationName] ?? 99;
      if (prioA !== prioB) return prioA - prioB;
      
      const nameA = variables.find(v => v.id === a.denominationPieceId)?.nom || '';
      const nameB = variables.find(v => v.id === b.denominationPieceId)?.nom || '';
      return nameA.localeCompare(nameB);
    });

    const headers = [
      'Emplacement.',
      'UGS.',
      'Pièce ou service.',
      'Qté disponible.',
      'Qté réservée.',
      'Qté entrante.',
      'Sortant Sem.',
      'Sortant Sem. Pro.',
      'Sortant 7 à 30 jours.',
      'Mouvements.',
      'Inventaire de traçabilité.',
      'Attribution des sorties.'
    ];

    let csvContent = '\ufeff'; // BOM for UTF-8 compatibility
    csvContent += headers.map(h => `"${h}"`).join(';') + '\n';

    itemsToExport.forEach(item => {
      const matchedStock = stocks.find(s => s.id === item.stockId || s.denominationPieceId === item.denominationPieceId);
      const vObj = variables.find(v => v.id === item.denominationPieceId);
      const rowStats = getPieceOutgoingStats(item.denominationPieceId);

      // Emplacement label with assigned technician name
      const assignedTech = members.find(m => m.role === 'Technicien' && m.locationLink === item.locationName);
      const customName = getLocationCustomName(item.locationName);
      const locationLabel = assignedTech ? `${assignedTech.name} — ${customName}` : customName;

      // Movements formatting
      const mvs = (matchedStock?.mouvements || []).filter(mv => {
        if (!mv.emplacement) return item.locationName === 'Centrale des stocks';
        const loc = mv.emplacement.includes(' : ') ? mv.emplacement.split(' : ')[1] : mv.emplacement;
        return loc === item.locationName || (loc === 'Centrale' && item.locationName === 'Centrale des stocks');
      });
      const mvsToUse = mvs.length > 0 ? mvs : (matchedStock?.mouvements || []);
      const movementsText = mvsToUse.map(mv => {
        const circulation = mv.type || '';
        const raccordement = mv.emplacement || '';
        const volume = mv.volume !== undefined && mv.volume !== null ? mv.volume : '';
        const dateFormatted = mv.date ? new Date(mv.date).toLocaleDateString('fr-FR') : '';
        const situation = mv.statut || '';
        return `${circulation}, ${raccordement}, ${volume}, ${dateFormatted}, ${situation}`;
      }).join('\n');

      // Traceability formatting for this location
      const trs = (matchedStock?.traceabilities || []).filter(t => {
        if (t.situation !== 'Disponible' && t.situation !== 'Signalé manquant') return false;
        let currentLoc = 'Centrale des stocks';
        if (t.emplacement) {
          currentLoc = t.emplacement;
        } else {
          const matchedMv = (matchedStock?.mouvements || []).find(mv => mv.id === t.movementId);
          if (matchedMv) {
            if (matchedMv.type === 'Réapprovisionnement fournisseur') {
              currentLoc = 'Centrale des stocks';
            } else if (matchedMv.emplacement) {
              if (matchedMv.emplacement.includes(' : ')) {
                currentLoc = matchedMv.emplacement.split(' : ')[1];
              } else {
                currentLoc = matchedMv.emplacement;
              }
            }
          }
        }
        const normLoc = (loc: string) => loc === 'Centrale' ? 'Centrale des stocks' : loc;
        return normLoc(currentLoc) === normLoc(item.locationName);
      });
      
      const trsToUse = trs.length > 0 ? trs : (item.locationName === 'Centrale des stocks' ? (matchedStock?.traceabilities || []).filter(t => t.situation === 'Disponible' || t.situation === 'Signalé manquant') : []);

      const traceText = trsToUse.map(t => {
        const lotOrSerial = t.lotOrSerial || '';
        const expirationFormatted = t.expirationDate ? new Date(t.expirationDate).toLocaleDateString('fr-FR') : '';
        const volume = t.volume !== undefined && t.volume !== null ? t.volume : '1';
        const situation = t.situation || '';
        return `${lotOrSerial}, ${expirationFormatted}, ${volume}, ${situation}`;
      }).join('\n');

      // Attribution des sorties formatting:
      // Format: « lot_number, client_company, ref_interv, bon_commande, date_estimee, reason(s)_list »
      const attributionLines: string[] = [];
      if (vObj) {
        const pieceNameLower = vObj.nom.toLowerCase().trim();
        const activeToursList = (fsmTours || []).filter(t => 
          t.status === 'Brouillon' || t.status === 'À faire' || t.status === 'En cours'
        );

        activeToursList.forEach(tour => {
          if (assignedTech && item.locationName !== 'Centrale des stocks') {
            const tourTech = (tour.techName || tour.technicianName || tour.technicien || '').trim().toLowerCase();
            const techName = (assignedTech.name || '').trim().toLowerCase();
            if (tourTech && techName && tourTech !== techName) {
              return;
            }
          }

          const missions = tour.missions || tour.passages || [];
          missions.forEach((m: any) => {
            const parts = m.requiredParts || [];
            const matchesPiece = parts.some((p: string) => p && p.toLowerCase().trim() === pieceNameLower);

            if (matchesPiece) {
              const lotNumber = m.lotNumber || m.lotOrSerial || m.lot || '';
              const clientCompany = m.clientName || m.clientCompany || m.client || '';
              const refInterv = m.refIntervention || m.refInterv || m.ref || m.id || '';
              const bonCommande = m.bonCommandeId || m.bonCommande || m.bc || '';
              
              const rawDate = tour.startDate || tour.date || m.dateEstimee || m.date || '';
              let dateFormatted = rawDate;
              if (rawDate && typeof rawDate === 'string' && rawDate.includes('-') && rawDate.length === 10) {
                dateFormatted = rawDate.split('-').reverse().join('/');
              } else if (rawDate) {
                try {
                  const d = new Date(rawDate);
                  if (!isNaN(d.getTime())) {
                    dateFormatted = d.toLocaleDateString('fr-FR');
                  }
                } catch (e) {
                  // Keep rawDate
                }
              }

              const reasonsRaw = m.reasons || m.reason || m.motif || m.typePrestation || '';
              const reasonsList = Array.isArray(reasonsRaw) ? reasonsRaw.join(' / ') : String(reasonsRaw);

              attributionLines.push(`${lotNumber}, ${clientCompany}, ${refInterv}, ${bonCommande}, ${dateFormatted}, ${reasonsList}`);
            }
          });
        });
      }

      const attributionText = attributionLines.join('\n');

      const row = [
        locationLabel,
        matchedStock?.ugs || '',
        vObj ? vObj.nom : '',
        item.volumeDisponible !== undefined && item.volumeDisponible !== null ? item.volumeDisponible : 0,
        item.volumeReserve !== undefined && item.volumeReserve !== null ? item.volumeReserve : 0,
        item.volumeEntrant !== undefined && item.volumeEntrant !== null ? item.volumeEntrant : 0,
        rowStats.week1.vol,
        rowStats.week2.vol,
        rowStats.next30.vol,
        movementsText,
        traceText,
        attributionText
      ];

      csvContent += row.map(val => `"${String(val !== undefined && val !== null ? val : '').replace(/"/g, '""')}"`).join(';') + '\n';
    });

    const formattedDate = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    const fileName = `Export CSV Inventaire Traça au ${formattedDate}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenNewForm = () => {
    setEditingId(null);
    setSelectedStockId('');
    setLocationName('Entrepôt A');
    setVolumeDisponible(0);
    setVolumeReserve(0);
    setVolumeEntrant(0);
    setShowForm(true);
  };

  const handleEditClick = (item: DistributedStockLocation) => {
    setEditingId(item.id);
    const matchedSt = stocks.find(
      s =>
        (item.stockId && s.id === item.stockId) ||
        (item.ugs && s.ugs && s.ugs.trim().toLowerCase() === item.ugs.trim().toLowerCase()) ||
        (item.denominationPieceId &&
          (s.denominationPieceId === item.denominationPieceId ||
            String(s.denominationPieceId || '').trim().toLowerCase() === String(item.denominationPieceId).trim().toLowerCase()))
    );
    const linkedStockId = matchedSt?.id || item.stockId || '';
    setSelectedStockId(linkedStockId);
    setLocationName(item.locationName);
    setVolumeDisponible(item.volumeDisponible);
    setVolumeReserve(item.volumeReserve);
    setVolumeEntrant(item.volumeEntrant);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const target = distributedStocks.find(x => x.id === id);
    if (target) {
      const itemStockName = variables.find(v => v.id === target.denominationPieceId)?.nom || target.denominationPieceId || target.ugs || 'Équipement';
      const activeTenant = localStorage.getItem('defib_tenant_id') || 'demo';
      logDeleteDistributedStock(activeTenant, itemStockName).catch(() => {});
    }
    const updated = distributedStocks.filter(x => x.id !== id);
    saveDistributedStocks(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      const originalItem = distributedStocks.find(it => it.id === editingId);
      if (!originalItem) return;

      const matchedStock = stocks.find(s => s.id === selectedStockId || s.id === originalItem.stockId || s.denominationPieceId === originalItem.denominationPieceId);
      const denomId = matchedStock?.denominationPieceId || originalItem.denominationPieceId || '';
      const stId = matchedStock?.id || originalItem.stockId || selectedStockId || '';
      const oldLocationName = originalItem.locationName;

      const updated = distributedStocks.map(it => {
        if (it.id === editingId) {
          return {
            ...it,
            denominationPieceId: denomId,
            stockId: stId,
            locationName,
            volumeDisponible: Number(volumeDisponible) || 0,
            volumeReserve: Number(volumeReserve) || 0,
            volumeEntrant: Number(volumeEntrant) || 0
          };
        }
        return it;
      });
      saveDistributedStocks(updated);

      // propagate the storage location change to all traceabilities matching this stock's old location name
      if (matchedStock && saveStocks && oldLocationName && oldLocationName !== locationName) {
        const movementsList = matchedStock.mouvements || [];
        const updatedStocks = stocks.map(st => {
          if (st.id === matchedStock.id) {
            const updatedTraceabilities = (st.traceabilities || []).map(t => {
              let currentLoc = 'Centrale';
              if (t.emplacement) {
                currentLoc = t.emplacement;
              } else {
                const matchedMv = movementsList.find(mv => mv.id === t.movementId);
                if (matchedMv) {
                  if (matchedMv.type === 'Réapprovisionnement fournisseur') {
                    currentLoc = 'Centrale';
                  } else if (matchedMv.emplacement) {
                    if (matchedMv.emplacement.includes(' : ')) {
                      currentLoc = matchedMv.emplacement.split(' : ')[1];
                    } else {
                      currentLoc = matchedMv.emplacement;
                    }
                  }
                }
              }

              if (currentLoc === oldLocationName) {
                return {
                  ...t,
                  emplacement: locationName
                };
              }
              return t;
            });

            return {
              ...st,
              traceabilities: updatedTraceabilities
            };
          }
          return st;
        });
        saveStocks(updatedStocks);
      }
    } else {
      if (!selectedStockId) return;

      const matchedStock = stocks.find(s => s.id === selectedStockId);
      if (!matchedStock) return;

      const newItem: DistributedStockLocation = {
        id: 'ds_' + Date.now(),
        denominationPieceId: matchedStock.denominationPieceId,
        stockId: matchedStock.id,
        locationName,
        volumeDisponible: Number(volumeDisponible) || 0,
        volumeReserve: Number(volumeReserve) || 0,
        volumeEntrant: Number(volumeEntrant) || 0
      };
      saveDistributedStocks([newItem, ...distributedStocks]);
    }

    // Reset
    setShowForm(false);
    setEditingId(null);
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return distributedStocks.filter(item => {
      // Find matching Stock Central Record to check UGS too
      const matchedStock = stocks.find(
        s =>
          (item.stockId && s.id === item.stockId) ||
          (item.ugs && s.ugs && s.ugs.trim().toLowerCase() === item.ugs.trim().toLowerCase()) ||
          (item.denominationPieceId &&
            (s.denominationPieceId === item.denominationPieceId ||
              String(s.denominationPieceId || '').trim().toLowerCase() === String(item.denominationPieceId).trim().toLowerCase()))
      );
      const ugsVal = matchedStock?.ugs || item.ugs || '';
      const targetDenom = item.denominationPieceId || matchedStock?.denominationPieceId || '';
      
      const vObj = variables.find(
        v => v.id === targetDenom || (v.nom && targetDenom && v.nom.trim().toLowerCase() === String(targetDenom).trim().toLowerCase())
      );
      const pieceName = vObj ? vObj.nom.toLowerCase() : String(targetDenom).toLowerCase();
      const cat = vObj ? vObj.category.toLowerCase() : '';
      const query = searchQuery.trim().toLowerCase();
      
      const matchesSearch = !query ||
        pieceName.includes(query) || 
        cat.includes(query) || 
        ugsVal.toLowerCase().includes(query);
        
      const matchesLoc = locationFilter === 'Tous' || item.locationName === locationFilter;
      if (!matchesSearch || !matchesLoc) return false;

      if (attentionFilterActive) {
        const rowStats = getPieceOutgoingStats(item.denominationPieceId);
        const totalNeeded = rowStats.week1.vol + rowStats.week2.vol + rowStats.next30.vol;
        return item.volumeDisponible < totalNeeded;
      }

      return true;
    });
  }, [distributedStocks, variables, stocks, searchQuery, locationFilter, attentionFilterActive, getPieceOutgoingStats]);

  // Compute counts map for filter pills
  const countMap = useMemo(() => {
    const map: Record<string, number> = {
      'Tous': distributedStocks.length
    };
    ALL_LOCATIONS.forEach(loc => {
      map[loc] = 0;
    });
    distributedStocks.forEach(ds => {
      if (map[ds.locationName] !== undefined) {
        map[ds.locationName]++;
      }
    });
    return map;
  }, [distributedStocks]);

  // Styling constants designed exactly like StocksTab
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

  const rowActionButtonStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#fff',
    boxShadow: 'none',
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

  const rowActionButton18Style: React.CSSProperties = {
    ...rowActionButtonStyle,
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: 'rgb(80 97 122)',
    fontSize: '16px',
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
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="stocks-distribues-tab-container-harmonized">
      <style>{`
        #stocks-distribues-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-distributed-input),
        #stocks-distribues-tab-container-harmonized select,
        #stocks-distribues-tab-container-harmonized textarea {
          padding: 12px !important;
          border: 1px solid #dce1ea !important;
          border-radius: 13px !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          background: #fff !important;
          background-color: #fff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
        }
        #stocks-distribues-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-distributed-input)::placeholder,
        #stocks-distribues-tab-container-harmonized textarea::placeholder {
          color: #becadb !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-distribues-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-distributed-input)::-webkit-input-placeholder,
        #stocks-distribues-tab-container-harmonized textarea::-webkit-input-placeholder {
          color: #becadb !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-distribues-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-distributed-input)::-moz-placeholder,
        #stocks-distribues-tab-container-harmonized textarea::-moz-placeholder {
          color: #becadb !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-distribues-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-distributed-input),
        #stocks-distribues-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-distributed-input),
        #stocks-distribues-tab-container-harmonized select:hover:not(:disabled),
        #stocks-distribues-tab-container-harmonized select:focus:not(:disabled),
        #stocks-distribues-tab-container-harmonized textarea:hover:not(:disabled),
        #stocks-distribues-tab-container-harmonized textarea:focus:not(:disabled),
        #stocks-distribues-tab-container-harmonized #search-distributed-input:hover,
        #stocks-distribues-tab-container-harmonized #search-distributed-input:focus {
          outline: 2.5px solid #2e54ff !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #stocks-distribues-tab-container-harmonized select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #stocks-distribues-tab-container-harmonized select option {
          color: #000000 !important;
          background: #ffffff !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-distribues-tab-container-harmonized input[type="date"]::-webkit-calendar-picker-indicator {
          display: none !important;
          -webkit-appearance: none !important;
          background: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        #stocks-distribues-tab-container-harmonized label {
          letter-spacing: normal !important;
          text-transform: none !important;
          font-size: 16px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-distribues-tab-container-harmonized input:disabled,
        #stocks-distribues-tab-container-harmonized select:disabled {
          background: #fff !important;
          background-color: #fff !important;
          border: 1px solid #dce1ea !important;
          color: #555555 !important;
          cursor: not-allowed !important;
          opacity: 1 !important;
        }
        #stocks-distribues-tab-container-harmonized #stocks-distribues-record-table,
        #stocks-distribues-tab-container-harmonized #stocks-distribues-record-table thead,
        #stocks-distribues-tab-container-harmonized #stocks-distribues-record-table tbody,
        #stocks-distribues-tab-container-harmonized #stocks-distribues-record-table tr,
        #stocks-distribues-tab-container-harmonized #stocks-distribues-record-table th,
        #stocks-distribues-tab-container-harmonized #stocks-distribues-record-table td {
          border: 0px solid transparent !important;
          border-top: 0px solid transparent !important;
          border-bottom: 0px solid transparent !important;
          border-left: 0px solid transparent !important;
          border-right: 0px solid transparent !important;
        }
        #stocks-distribues-tab-container-harmonized #stocks-distribues-record-table thead th {
          background-color: #ffffff !important;
          color: rgb(80 97 122) !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          letter-spacing: normal !important;
          text-transform: none !important;
        }
        #stocks-distribues-tab-container-harmonized #stocks-distribues-record-table tbody tr:hover {
          background-color: #f5f7fa !important;
        }
      `}</style>

      {!showForm ? (
        <>
          {/* Header Section */}
          <div 
            className="bg-white space-y-4"
            style={{ borderRadius: '0px', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
              <div>
                <div 
                  className="relative inline-grid grid-cols-2 items-center p-1 bg-white select-none overflow-hidden" 
                  id="stocks-distribues-nav-toggle"
                  style={{ 
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    borderRadius: '15px',
                    border: '1px solid #dadada',
                    backgroundColor: '#ffffff',
                  }}
                >
                  {/* Animated sliding pill indicator */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: '4px',
                      bottom: '4px',
                      left: '4px',
                      width: 'calc((100% - 8px) / 2)',
                      backgroundColor: '#2e54ff',
                      borderRadius: '13px',
                      transform: slidingNavTab === 'stocks' ? 'translateX(0%)' : 'translateX(100%)',
                      transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                      pointerEvents: 'none',
                      zIndex: 0,
                    }}
                  />
                  <button
                    type="button"
                    id="toggle-nav-centrale-stocks-from-distribues"
                    onClick={() => {
                      setSlidingNavTab('stocks');
                      setTimeout(() => {
                        if (setActiveTab) {
                          setActiveTab('stocks');
                        } else if (onNavigateToCentraleStocks) {
                          onNavigateToCentraleStocks('');
                        }
                      }, 150);
                    }}
                    style={{
                      fontSize: '18px',
                      borderRadius: '13px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      color: slidingNavTab === 'stocks' ? '#ffffff' : '#000000',
                      transition: 'color 0.15s ease',
                    }}
                    className="relative z-10 px-4 py-1.5 font-bold text-center whitespace-nowrap"
                  >
                    {t("Centrale des Stocks")}
                  </button>
                  <button
                    type="button"
                    id="toggle-nav-stocks-distribues-active"
                    onClick={() => {
                      setSlidingNavTab('stocks-distribues');
                      if (setActiveTab) setActiveTab('stocks-distribues');
                    }}
                    style={{
                      fontSize: '18px',
                      borderRadius: '13px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      color: slidingNavTab === 'stocks-distribues' ? '#ffffff' : '#000000',
                      transition: 'color 0.15s ease',
                    }}
                    className="relative z-10 px-4 py-1.5 font-bold text-center whitespace-nowrap"
                  >
                    {t("Stocks Distribués")}
                  </button>
                </div>
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
                  title={t("Plus")}
                >
                  <img
                    src="https://civilprom.s3.eu-north-1.amazonaws.com/3dotsgris.svg"
                    alt={t("Plus")}
                    style={{ width: '18px', height: '18px', display: 'block', pointerEvents: 'none' }}
                    referrerPolicy="no-referrer"
                  />
                  <select
                    id="stocks-distribues-more-options-dropdown"
                    aria-label={t("Plus")}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'open-filters') {
                        setIsFilterSidePaneOpen(true);
                      } else if (val === 'export-inv-traca') {
                        handleExportInvTraca();
                      } else if (val === 'spreadsheet-editor') {
                        if (resolvedSpreadsheetUrl) {
                          openTenantSpreadsheetUrl(resolvedSpreadsheetUrl);
                        }
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    style={{ WebkitAppearance: 'menulist-button', appearance: 'auto', border: 'none', outline: 'none' }}
                  >
                    <option value="" disabled hidden></option>
                    <option value="open-filters">
                      {t("Appliquer des filtres")}
                    </option>
                    <option value="export-inv-traca">
                      {t("Export inventaire traçabilité")}
                    </option>
                    <option value="spreadsheet-editor" disabled={!resolvedSpreadsheetUrl}>
                      {t("Ouvrir l’éditeur SpreadSheets")}
                    </option>
                  </select>
                </div>

                {/* Actualiser les données Pill Button */}
                <button
                  type="button"
                  id="btn-refresh-data-stocks-distribues"
                  onClick={() => {
                    setClickedPill('refresh-stocks-distribues');
                    setTimeout(() => setClickedPill((prev) => (prev === 'refresh-stocks-distribues' ? null : prev)), 480);
                    handleRefreshDistributedStocks();
                  }}
                  disabled={isRefreshing}
                  className={`relative overflow-hidden hover:opacity-80 transition-all select-none cursor-pointer ${clickedPill === 'refresh-stocks-distribues' ? 'sidebar-nav-click-shrink-wave' : ''}`}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '1000px',
                    padding: '8px 16px',
                    fontSize: '18px',
                    fontWeight: 100,
                    cursor: isRefreshing ? 'wait' : 'pointer',
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
                  title={t("Actualiser les données")}
                >
                  <span>{isRefreshing ? t("Actualisation...") : t("Actualiser les données")}</span>
                </button>

                {/* Field recherche (Search input) */}
                <div className="relative w-full sm:w-56 bg-white">
                  <input
                    type="text"
                    id="search-distributed-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Recherche."
                    className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                    style={searchInputStyle}
                    onMouseEnter={() => setIsSearchHovered(true)}
                    onMouseLeave={() => setIsSearchHovered(false)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                  />
                </div>

                {(() => {
                  const hasDistStocksSpreadsheet = Boolean(resolvedSpreadsheetUrl);
                  return (
                    <button
                      type="button"
                      disabled={!hasDistStocksSpreadsheet}
                      onClick={() => {
                        if (!hasDistStocksSpreadsheet) return;
                        handleOpenNewForm();
                      }}
                      style={{
                        ...customButtonStyle,
                        backgroundColor: 'rgb(46, 84, 255)',
                        boxShadow: 'none',
                        opacity: !hasDistStocksSpreadsheet ? 0.45 : 1,
                        cursor: !hasDistStocksSpreadsheet ? 'not-allowed' : 'pointer',
                      }}
                      className="font-sans"
                      title={!hasDistStocksSpreadsheet ? "Veuillez renseigner l'URL du Spreadsheet Stocks Distribués dans les paramètres du tenant." : undefined}
                    >
                      Nouveau
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Distributed Stock Table List */}
          <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans border-collapse text-xs" id="stocks-distribues-record-table" style={{ border: '0px solid transparent', borderTop: '0px solid transparent', borderBottom: '0px solid transparent' }}>
                <thead>
                  <tr className="bg-white" style={{ borderTop: '0px solid transparent', borderBottom: '0px solid transparent' }}>
                    <th className="px-4 py-3.5 w-14 text-left whitespace-nowrap" style={thStyle}>Miniature.</th>
                    <th className="px-4 py-3.5" style={thStyle}>UGS</th>
                    <th className="px-4 py-3.5" style={thStyle}>Pièce ou service.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Emplacement</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Qté disponible.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Qté réservée.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Qté entrante.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Sortant Sem.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Sortant Sem. Pro.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Sortant 7 à 30 jours.</th>
                    <th className="px-4 py-3.5 text-right w-24" style={thStyle}>Actions.</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 text-xs">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        <EmptyTablePlaceholder className="py-16 text-center font-sans lg:py-24 text-sm bg-white" />
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const matchedStock = stocks.find(
                        s =>
                          (item.stockId && s.id === item.stockId) ||
                          (item.ugs && s.ugs && s.ugs.trim().toLowerCase() === item.ugs.trim().toLowerCase()) ||
                          (item.denominationPieceId &&
                            (s.denominationPieceId === item.denominationPieceId ||
                              String(s.denominationPieceId || '').trim().toLowerCase() === String(item.denominationPieceId).trim().toLowerCase()))
                      );
                      const ugsCode = matchedStock?.ugs || item.ugs || '';
                      const targetDenom = item.denominationPieceId || matchedStock?.denominationPieceId || '';
                      
                      const vObj = variables.find(
                        v => v.id === targetDenom || (v.nom && targetDenom && v.nom.trim().toLowerCase() === String(targetDenom).trim().toLowerCase())
                      );
                      const pieceName = vObj ? vObj.nom : (targetDenom || 'Dénomination inconnue');
                      const pieceCat = vObj ? vObj.category : '-';

                      const rowStats = getPieceOutgoingStats(vObj ? vObj.id : targetDenom);

                      const hasTraceabilitiesInThisLocation = (() => {
                        if (!matchedStock || !matchedStock.traceabilities) return false;
                        return matchedStock.traceabilities.some(t => {
                          let currentLoc = 'Centrale des stocks';
                          if (t.emplacement) {
                            currentLoc = t.emplacement;
                          } else {
                            const matchedMv = (matchedStock.mouvements || []).find(mv => mv.id === t.movementId);
                            if (matchedMv) {
                              if (matchedMv.type === 'Réapprovisionnement fournisseur') {
                                currentLoc = 'Centrale des stocks';
                              } else if (matchedMv.emplacement) {
                                if (matchedMv.emplacement.includes(' : ')) {
                                  currentLoc = matchedMv.emplacement.split(' : ')[1];
                                } else {
                                  currentLoc = matchedMv.emplacement;
                                }
                              }
                            }
                          }
                          const normLoc = (loc: string) => loc === 'Centrale' ? 'Centrale des stocks' : loc;
                          return normLoc(currentLoc) === normLoc(item.locationName);
                        });
                      })();

                      const isDeleteDisabled = (item.volumeDisponible || 0) !== 0 ||
                                               (item.volumeReserve || 0) !== 0 ||
                                               (item.volumeEntrant || 0) !== 0 ||
                                               hasTraceabilitiesInThisLocation;

                      return (
                        <tr
                          key={item.id}
                          className="group hover:bg-[#f5f7fa] transition-all cursor-pointer"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, a, input, select, option')) return;
                            handleEditClick(item);
                          }}
                        >
                          {/* Miniature thumbnail column */}
                          <td className="px-4 py-3.5">
                            <div className="w-14 h-14 rounded-md bg-white border border-slate-200 overflow-hidden relative flex items-center justify-center p-1.5" style={{ backgroundColor: '#ffffff' }}>
                              {vObj?.imageUrl ? (
                                <img
                                  src={vObj.imageUrl}
                                  alt=""
                                  className="w-full h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                            </div>
                          </td>
                          {/* UGS */}
                          <td className="px-4 py-5 whitespace-nowrap font-sans uppercase tracking-wide" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif', fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {ugsCode || '-'}
                          </td>
                          {/* Pièce ou service */}
                          <td className="px-4 py-5 whitespace-nowrap font-sans text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif', fontSize: '16px', color: '#000000', fontWeight: 100, whiteSpace: 'nowrap' }}>
                            <span className="font-semibold text-slate-950">{pieceName}</span> <span className="text-black font-normal">({pieceCat})</span>
                          </td>
                          {/* Emplacement */}
                          <td className="px-4 py-5 text-center whitespace-nowrap">
                            <span 
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '1000px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #E0E5EC',
                                color: '#000000',
                                fontSize: '16px',
                                fontWeight: 100,
                                padding: '4px 12px',
                                whiteSpace: 'nowrap',
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                              }}
                            >
                              {(() => {
                                const assignedTech = members.find(m => m.role === 'Technicien' && m.locationLink === item.locationName);
                                const customName = getLocationCustomName(item.locationName);
                                return assignedTech ? `${assignedTech.name} — ${customName}` : customName;
                              })()}
                            </span>
                          </td>
                          {/* Qté disponible */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {item.volumeDisponible}
                          </td>
                          {/* Qté réservée */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {item.volumeReserve}
                          </td>
                          {/* Qté entrante */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {item.volumeEntrant}
                          </td>
                          {/* Sortant Sem */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {rowStats.week1.vol}
                          </td>
                          {/* Sortant Sem Pro */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {rowStats.week2.vol}
                          </td>
                          {/* Sortant 7 à 30 jours */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {rowStats.next30.vol}
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-5 text-right whitespace-nowrap bg-transparent" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex gap-2 bg-transparent">
                              <button
                                type="button"
                                onClick={() => onNavigateToCentraleStocks?.(ugsCode)}
                                style={{
                                  ...rowActionButtonStyle,
                                  backgroundColor: '#0f172a',
                                  color: '#ffffff',
                                }}
                                className="cursor-pointer font-sans"
                              >
                                Centrale
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditClick(item)}
                                style={rowActionButtonStyle}
                                className="cursor-pointer font-sans"
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                disabled={isDeleteDisabled}
                                onClick={() => handleDelete(item.id)}
                                style={{
                                  ...rowActionButtonStyle,
                                  opacity: isDeleteDisabled ? 0.35 : 1,
                                  cursor: isDeleteDisabled ? 'not-allowed' : 'pointer'
                                }}
                                className="font-sans"
                                title={isDeleteDisabled ? "Impossible de supprimer : stock non nul ou éléments de traçabilité présents" : "Supprimer"}
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
            </div>
          </div>
        </>
      ) : (
        /* Form mode styled exactly like main form overlay in StocksTab */
        <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="stocks-distributed-form-overlay">
          
          {/* Header Box styled exactly like DefibTab Form Header */}
          <div 
            className="flex items-center bg-white"
            style={{ borderRadius: '0px', width: '98%', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
            id="distributed-form-header-box"
          >
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                style={{
                  ...rowActionButton18Style,
                  flex: 1,
                  width: '50%',
                }}
                className="flex-1 transition-colors cursor-pointer"
              >
                <span>{t("Annuler")}</span>
              </button>

              <button
                type="submit"
                form="distributed-stock-form"
                style={{
                  ...rowActionButton18Style,
                  flex: 1,
                  width: '50%',
                  backgroundColor: '#2e54ff',
                  color: '#ffffff',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, #2e54ff 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                }}
                className="flex-1 transition-all cursor-pointer"
              >
                <span>{t("Enregistrer")}</span>
              </button>
            </div>
          </div>

          {/* Elegant height spacing block to separate header box and form perfectly */}
          <div style={{ height: '16px' }} className="bg-transparent" />

          <form 
            id="distributed-stock-form"
            onSubmit={handleSubmit} 
            className="space-y-6 p-5 border-none"
            style={{
              backgroundColor: 'rgb(245, 247, 250)',
              border: 'none',
              borderRadius: '18px',
              width: '98%',
              maxWidth: '98%',
              margin: 'auto'
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 font-sans text-sm">
              
              {/* Section Propriétés Capsule */}
              <div className="flex md:col-span-4 select-none mb-1">
                <span 
                  className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                  style={{
                    color: 'rgb(21 99 55)',
                    backgroundColor: 'rgb(61 220 132)',
                    fontSize: '18px',
                    border: 'none',
                    textTransform: 'none',
                    letterSpacing: 'normal'
                  }}
                >
                  Propriétés
                </span>
              </div>

              {/* Piece Selection - looks up Centrale des stocks records */}
              <div className="flex flex-col gap-1 md:col-span-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Équipement de la centrale des stocks *</label>
                  {!editingId && (
                    <button
                      type="button"
                      onClick={() => setIsSidePaneStockOpen(true)}
                      className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                      style={{ textDecoration: 'none' }}
                    >
                      Rechercher
                    </button>
                  )}
                </div>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  disabled={!!selectedStockId}
                  className="w-full bg-white text-black cursor-pointer"
                  required
                >
                  <option value="" disabled hidden>Sélectionnez un item de la centrale des stocks</option>
                  {selectedStockId && !stocks.some(st => st.id === selectedStockId) && (
                    <option value={selectedStockId}>
                      {(() => {
                        const orig = distributedStocks.find(it => it.id === editingId);
                        const vObj = orig ? variables.find(v => v.id === orig.denominationPieceId) : null;
                        return vObj ? `${vObj.nom} (${vObj.category || ''})` : 'Équipement associé';
                      })()}
                    </option>
                  )}
                  {stocks.map(st => {
                    const vObj = variables.find(v => v.id === st.denominationPieceId);
                    const pieceName = vObj ? vObj.nom : 'Dénomination inconnue';
                    const pieceCat = vObj ? vObj.category : '';
                    const ugsLabel = st.ugs ? ` [UGS: ${st.ugs}]` : '';
                    return (
                      <option key={st.id} value={st.id}>
                        {pieceName} ({pieceCat}){ugsLabel}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Section Emplacement */}
              <div className="md:col-span-4 pt-5 mt-2 flex flex-col gap-4">
                <div className="flex select-none">
                  <span 
                    className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                    style={{
                      color: 'rgb(21 99 55)',
                      backgroundColor: 'rgb(61 220 132)',
                      fontSize: '18px',
                      border: 'none',
                      textTransform: 'none',
                      letterSpacing: 'normal'
                    }}
                  >
                    Emplacement
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Emplacement de stockage *</label>
                  <select
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value as any)}
                    className="w-full bg-white text-black cursor-pointer"
                    required
                  >
                    {ALL_LOCATIONS.map(loc => {
                      const assignedTech = members.find(m => m.role === 'Technicien' && m.locationLink === loc);
                      const customName = getLocationCustomName(loc);
                      const label = assignedTech ? `${assignedTech.name} — ${customName}` : customName;
                      return (
                        <option key={loc} value={loc}>{label}</option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Section Volumes */}
              <div className="md:col-span-4 pt-5 mt-2 flex flex-col gap-4">
                <div className="flex select-none">
                  <span 
                    className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                    style={{
                      color: 'rgb(21 99 55)',
                      backgroundColor: 'rgb(61 220 132)',
                      fontSize: '18px',
                      border: 'none',
                      textTransform: 'none',
                      letterSpacing: 'normal'
                    }}
                  >
                    Volumes
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  {/* Volume Disponible */}
                  <div className="flex flex-col gap-1 md:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Volume total disponible *</label>
                    <input
                      type="number"
                      min="0"
                      value={volumeDisponible}
                      onChange={(e) => setVolumeDisponible(Number(e.target.value))}
                      className="w-full"
                      required
                    />
                  </div>

                  {/* Volume Réserve */}
                  <div className="flex flex-col gap-1 md:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Volume réservé *</label>
                    <input
                      type="number"
                      value={volumeReserve}
                      disabled
                      readOnly
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>

                  {/* Volume Entrant */}
                  <div className="flex flex-col gap-1 md:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Volume entrant *</label>
                    <input
                      type="number"
                      value={volumeEntrant}
                      disabled
                      readOnly
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>

                  {/* Total indicator (calculated) */}
                  <div className="flex flex-col gap-1 md:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Volume total</label>
                    <input
                      type="number"
                      value={volumeDisponible + volumeReserve}
                      disabled
                      readOnly
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>
                </div>

                {/* Section 2: Projections volumes sortants directly under volumes as fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-1">
                  {/* Sortant cette semaine */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sortant cette semaine.</label>
                    <input
                      type="number"
                      value={outgoingStats.week1.vol}
                      disabled
                      readOnly
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>

                  {/* Sortant semaine prochaine */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sortant semaine prochaine.</label>
                    <input
                      type="number"
                      value={outgoingStats.week2.vol}
                      disabled
                      readOnly
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>

                  {/* Sortant 7 à 30 jours */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sortant 7 à 30 jours.</label>
                    <input
                      type="number"
                      value={outgoingStats.next30.vol}
                      disabled
                      readOnly
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>
                </div>

              </div>

              {/* Section Mouvements */}
              <div className="md:col-span-4 pt-5 mt-2 flex flex-col gap-4">
                <div className="flex select-none">
                  <span 
                    className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                    style={{
                      color: 'rgb(21 99 55)',
                      backgroundColor: 'rgb(61 220 132)',
                      fontSize: '18px',
                      border: 'none',
                      textTransform: 'none',
                      letterSpacing: 'normal'
                    }}
                  >
                    Mouvements
                  </span>
                </div>

                {selectedPieceMovements.length > 0 && (
                  <div 
                    className="overflow-x-auto border rounded-xl mt-2 bg-white" 
                    style={{ borderColor: 'oklch(0.88 0 0)', borderWidth: '1px' }}
                  >
                    <table className="w-full text-left font-sans border-collapse text-xs">
                      <thead>
                        <tr className="bg-white" style={{ borderBottom: '1px solid oklch(0.88 0 0)' }}>
                          <th className="px-3 py-3 text-center font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap', cursor: 'default' }}>Indicateur.</th>
                          <th className="px-3 py-3 font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap', cursor: 'default' }}>Circulation.</th>
                          <th className="px-3 py-3 font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap', cursor: 'default' }}>Raccordement.</th>
                          <th className="px-3 py-3 text-center font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap', cursor: 'default' }}>Volume.</th>
                          <th className="px-3 py-3 text-center font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap', cursor: 'default' }}>Suivi du colis.</th>
                          <th className="px-3 py-3 text-center font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap', cursor: 'default' }}>Date.</th>
                          <th className="px-3 py-3 text-center font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap', cursor: 'default' }}>Situation.</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {selectedPieceMovements.map((mv, index) => {
                          return (
                            <tr 
                              key={mv.id} 
                              className="hover:bg-slate-50 transition-all font-sans bg-white text-black" 
                              style={{ borderBottom: index === selectedPieceMovements.length - 1 ? 'none' : '1px solid oklch(0.88 0 0)' }}
                            >
                              {/* Indicator (Pink text with 18px arrow) */}
                              <td className="px-3 py-2 whitespace-nowrap bg-white text-center" style={{ cursor: 'default' }}>
                                <span 
                                  className="inline-flex items-center justify-center font-bold font-sans"
                                  style={{ 
                                    color: '#2e54ff',
                                    fontSize: '18px',
                                    lineHeight: '1',
                                    cursor: 'default'
                                  }}
                                >
                                  {mv.type === 'Réapprovisionnement fournisseur' ? '↓' : 
                                   mv.type === 'Distribution' ? '→' : 
                                   mv.type === 'Expédition directe au client' ? '↗' : 
                                   mv.type === 'Annulation' ? '↑' : '←'}
                                </span>
                              </td>
                              {/* Type / Circulation */}
                              <td 
                                className="px-3 py-2 bg-white font-medium text-black"
                                style={{ fontSize: '16px', whiteSpace: 'nowrap', color: '#000000', cursor: 'default' }}
                              >
                                {mv.type || ''}
                              </td>
                              {/* Raccordement */}
                              <td 
                                className="px-3 py-2 bg-white font-medium text-black"
                                style={{ fontSize: '16px', whiteSpace: 'nowrap', color: '#000000', cursor: 'default' }}
                              >
                                {mv.emplacement || ''}
                              </td>
                              {/* Volume */}
                              <td 
                                className="px-3 py-2 text-center bg-white font-semibold text-black"
                                style={{ fontSize: '16px', whiteSpace: 'nowrap', color: '#000000', cursor: 'default' }}
                              >
                                {mv.volume !== undefined && mv.volume !== null ? mv.volume : ''}
                              </td>
                              {/* Suivi du colis */}
                              <td className="px-3 py-2 text-center bg-white text-black font-semibold" style={{ fontSize: '16px', whiteSpace: 'nowrap', color: '#000000', cursor: 'default' }}>
                                {mv.trackingLink ? (
                                  <a
                                    href={mv.trackingLink.startsWith('http') ? mv.trackingLink : `https://${mv.trackingLink}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#2e54ff] hover:underline font-bold font-sans"
                                    style={{ cursor: 'pointer' }}
                                    title="Suivre le colis"
                                  >
                                    Ouvrir le lien
                                  </a>
                                ) : (
                                  ''
                                )}
                              </td>
                              {/* Date */}
                              <td 
                                className="px-3 py-2 text-center bg-white font-medium text-black"
                                style={{ fontSize: '16px', whiteSpace: 'nowrap', color: '#000000', cursor: 'default' }}
                              >
                                {mv.date ? new Date(mv.date).toLocaleDateString('fr-FR') : ''}
                              </td>
                              {/* Situation */}
                              <td className="px-3 py-2 text-center bg-white font-medium text-black" style={{ fontSize: '16px', cursor: 'default' }}>
                                {mv.statut || ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>

              {/* Section Inventaire de traçabilité en lecture seule */}
              {mainStockItem?.traceabilityEnabled && traceabilities.length > 0 && (
                <>
                  <div className="md:col-span-4 pt-5 mt-2 flex flex-col gap-4">
                    <div className="flex select-none">
                      <span 
                        className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                        style={{
                          color: 'rgb(21 99 55)',
                          backgroundColor: 'rgb(61 220 132)',
                          fontSize: '18px',
                          border: 'none',
                          textTransform: 'none',
                          letterSpacing: 'normal'
                        }}
                      >
                        {t("Inventaire de traçabilité")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isInventoryMode) {
                          // CONFIRM
                          if (!mainStockItem || !stocks || !saveStocks) return;
                          const updatedTraceabilities = (mainStockItem.traceabilities || []).map((t) => {
                            if (t.situation === "Disponible" || t.situation === "Signalé manquant") {
                              let currentLoc = 'Centrale';
                              if (t.emplacement) {
                                currentLoc = t.emplacement;
                              } else {
                                const matchedMv = selectedPieceMovements.find(mv => mv.id === t.movementId);
                                if (matchedMv) {
                                  if (matchedMv.type === 'Réapprovisionnement fournisseur') {
                                    currentLoc = 'Centrale';
                                  } else if (matchedMv.emplacement) {
                                    if (matchedMv.emplacement.includes(' : ')) {
                                      currentLoc = matchedMv.emplacement.split(' : ')[1];
                                    } else {
                                      currentLoc = matchedMv.emplacement;
                                    }
                                  }
                                }
                              }
                              if (currentLoc !== locationName) {
                                return t;
                              }

                              const isChecked = checkedTraceabilityIds[t.id];
                              let newSituation = t.situation;
                              if (isChecked) {
                                if (t.situation === "Disponible") {
                                  // do nothing
                                } else if (t.situation === "Signalé manquant") {
                                  newSituation = "Disponible";
                                }
                              } else {
                                if (t.situation === "Disponible") {
                                  newSituation = "Signalé manquant";
                                } else if (t.situation === "Signalé manquant") {
                                  newSituation = "Signalé manquant";
                                }
                              }
                              return { ...t, situation: newSituation };
                            }
                            return t;
                          });

                          const updatedStocks = stocks.map((st) => {
                            if (st.id === mainStockItem.id) {
                              return { ...st, traceabilities: updatedTraceabilities };
                            }
                            return st;
                          });
                          saveStocks(updatedStocks);
                          setIsInventoryMode(false);
                        } else {
                          // PROCEED
                          const initialChecked: Record<string, boolean> = {};
                          traceabilities.forEach((t) => {
                            initialChecked[t.id] = false;
                          });
                          setCheckedTraceabilityIds(initialChecked);
                          setIsInventoryMode(true);
                        }
                      }}
                      style={{
                        width: "100%",
                        backgroundColor: isInventoryMode ? "#2563eb" : "#0f172a",
                        color: "#ffffff",
                        borderRadius: "13px",
                        fontSize: "18px",
                        fontWeight: "bold",
                        padding: "12px 16px",
                        border: "none",
                        cursor: "pointer",
                      }}
                      className="font-sans active:scale-[0.98] transition-all block"
                    >
                      {isInventoryMode ? "Confirmer l’inventaire" : "Procéder à l’inventaire"}
                    </button>

                    {isInventoryMode && (
                      <p className="font-sans font-medium" style={{ color: "#000000", fontSize: "18px" }}>
                        Cochez les lignes des matériels dont vous disposez dans votre emplacement.
                      </p>
                    )}

                      <div 
                        className="overflow-x-auto border rounded-xl mt-2 bg-white" 
                        style={{ borderColor: 'oklch(0.88 0 0)', borderWidth: '1px' }}
                      >
                        <table className="w-full text-left font-sans border-collapse text-xs">
                          <thead>
                            <tr className="bg-white" style={{ borderBottom: '1px solid oklch(0.88 0 0)' }}>
                              {isInventoryMode && (
                                <th
                                  className="px-3 py-3 font-semibold text-black font-sans text-center"
                                  style={{ fontSize: '16px', color: '#000000', width: '60px' }}
                                >
                                  Select.
                                </th>
                              )}
                              <th className="px-3 py-3 font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap' }}>Barre-code.</th>
                              <th className="px-3 py-3 font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap' }}>Mouvement.</th>
                              <th className="px-3 py-3 font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap' }}>Numéro de lot ou série.</th>
                              <th className="px-3 py-3 font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap' }}>Date de péremption.</th>
                              <th className="px-3 py-3 text-center font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap' }}>Volume.</th>
                              <th className="px-3 py-3 font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap' }}>Commentaire.</th>
                              <th className="px-3 py-3 font-semibold text-black font-sans" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap' }}>Situation.</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {traceabilities.map((trace, idx) => {
                              return (
                                <tr 
                                  key={trace.id} 
                                  className="hover:bg-slate-50 transition-all font-sans bg-white text-black" 
                                  style={{ borderBottom: idx === traceabilities.length - 1 ? 'none' : '1px solid oklch(0.88 0 0)' }}
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
                                            borderColor: checkedTraceabilityIds[trace.id] ? "#2e54ff" : "#cbd5e1",
                                            borderWidth: "2px",
                                          }}
                                        >
                                          {checkedTraceabilityIds[trace.id] && (
                                            <div
                                              className="w-3 h-3 rounded-full"
                                              style={{ backgroundColor: "#2e54ff" }}
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
                                        className="inline-block"
                                        dangerouslySetInnerHTML={{ __html: generateBarcodeSVGString(trace.lotOrSerial) }} 
                                      />
                                      <button
                                        type="button"
                                        onClick={() => downloadBarcodeSVG(trace.lotOrSerial)}
                                        style={{
                                          backgroundColor: '#0f172a',
                                          color: '#ffffff',
                                          padding: '10px 20px',
                                          fontSize: '18px',
                                          borderRadius: '13px',
                                        }}
                                        className="font-sans font-bold active:scale-95 transition-all cursor-pointer border-0"
                                        title="Imprimer / Télécharger"
                                      >
                                        Imprimer
                                      </button>
                                    </div>
                                  </td>

                                  {/* Mouvement */}
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
                                      <option value="" disabled hidden>Sélectionnez un mouvement</option>
                                      <option value="Autre">Autre (Aucun mouvement)</option>
                                      {selectedPieceMovements.filter(mv => mv.type !== 'Annulation').map(mv => (
                                        <option key={mv.id} value={mv.id}>
                                          {mv.date} - {mv.type} (Vol: {mv.volume})
                                        </option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* Numéro de lot ou série */}
                                  <td className="px-3 py-2 bg-white align-middle">
                                    <input
                                      type="text"
                                      value={trace.lotOrSerial}
                                      disabled
                                      readOnly
                                      className="w-full font-semibold font-sans cursor-not-allowed"
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

                                  {/* Date de péremption */}
                                  <td className="px-3 py-2 bg-white align-middle">
                                    <input
                                      type="date"
                                      value={trace.expirationDate || ''}
                                      disabled
                                      readOnly
                                      className="w-full font-sans cursor-not-allowed"
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

                                  {/* Commentaire */}
                                  <td className="px-3 py-2 bg-white align-middle">
                                    <input
                                      type="text"
                                      value={trace.comment || ''}
                                      disabled
                                      readOnly
                                      placeholder="-"
                                      className="w-full font-sans cursor-not-allowed"
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
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                  </div>
                </>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Side Pane Search for Équipement de la centrale des stocks */}
      <SearchSidePane
        isOpen={isSidePaneStockOpen}
        onClose={() => setIsSidePaneStockOpen(false)}
        paneId="stocks-distribues-equipment-search-side-pane"
        items={stockSidePaneItems}
        selectedId={selectedStockId}
        onSelect={(item) => setSelectedStockId(item.id)}
        searchPlaceholder="Entrez votre recherche"
        searchFilter={(item, q) => {
          const l = (item.label || '').toLowerCase();
          const s = (item.subtitle || '').toLowerCase();
          const b = (item.badge || '').toLowerCase();
          const raw = item.raw;
          const ugs = (raw?.st?.ugs || '').toLowerCase();
          const cat = (raw?.vObj?.category || '').toLowerCase();
          return l.includes(q) || s.includes(q) || b.includes(q) || ugs.includes(q) || cat.includes(q);
        }}
      />

      {/* Side Pane Filters for Stocks Distribués */}
      {isFilterSidePaneOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99990] flex justify-end"
          id="stocks-distributed-filter-side-pane-container"
        >
          {/* Backdrop */}
          <div
            onClick={() => setIsFilterSidePaneOpen(false)}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs"
          />

          {/* Side Pane */}
          <div
            className="relative w-full sm:w-[460px] shadow-2xl flex flex-col transform transition-transform duration-200 ease-in-out z-10"
            id="stocks-distributed-filter-side-pane"
            onClick={(e) => e.stopPropagation()}
            style={{
              height: '100vh',
              minHeight: '100dvh',
              maxHeight: '100dvh',
              borderLeft: 'none',
              borderRadius: '0px',
              backgroundColor: '#F5F7FA',
              color: '#50617A',
              fontSize: '18px',
            }}
          >
            <div className="flex-1 overflow-y-auto p-6 pt-8" style={{ color: '#50617A', fontSize: '18px' }}>
              <div className="flex flex-wrap gap-2.5 items-center" id="stocks-distributed-storage-pills">
                {/* Tous pill */}
                {(() => {
                  const isSelected = !attentionFilterActive && locationFilter === 'Tous';
                  const count = countMap['Tous'] || 0;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setClickedPill('dist-filter-tous');
                        setTimeout(() => setClickedPill((prev) => (prev === 'dist-filter-tous' ? null : prev)), 480);
                        setAttentionFilterActive(false);
                        setLocationFilter('Tous');
                      }}
                      style={{
                        borderRadius: '1000px',
                        padding: '10px 20px',
                        fontSize: '18px',
                        fontWeight: 100,
                        cursor: 'pointer',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        backgroundColor: isSelected ? '#2e54ff' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#50617A',
                        border: isSelected ? '1px solid #2e54ff' : '1px solid rgb(218, 218, 218)',
                        boxShadow: 'none',
                        transition: 'all 0.15s ease'
                      }}
                      className={`relative overflow-hidden transition-all select-none cursor-pointer ${clickedPill === 'dist-filter-tous' ? 'sidebar-nav-click-shrink-wave' : ''}`}
                    >
                      {t("Tous")} ({count})
                    </button>
                  );
                })()}

                {/* Attention requise pill */}
                {(() => {
                  const isSelected = attentionFilterActive;
                  const attentionCount = distributedStocks.filter(item => {
                    const rowStats = getPieceOutgoingStats(item.denominationPieceId);
                    const totalNeeded = rowStats.week1.vol + rowStats.week2.vol + rowStats.next30.vol;
                    return item.volumeDisponible < totalNeeded;
                  }).length;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setClickedPill('dist-filter-attention');
                        setTimeout(() => setClickedPill((prev) => (prev === 'dist-filter-attention' ? null : prev)), 480);
                        setAttentionFilterActive(!attentionFilterActive);
                      }}
                      style={{
                        borderRadius: '1000px',
                        padding: '10px 20px',
                        fontSize: '18px',
                        fontWeight: 100,
                        cursor: 'pointer',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        backgroundColor: isSelected ? '#2e54ff' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#50617A',
                        border: isSelected ? '1px solid #2e54ff' : '1px solid rgb(218, 218, 218)',
                        boxShadow: 'none',
                        transition: 'all 0.15s ease'
                      }}
                      className={`relative overflow-hidden transition-all select-none cursor-pointer ${clickedPill === 'dist-filter-attention' ? 'sidebar-nav-click-shrink-wave' : ''}`}
                    >
                      {t("Attention requise")} ({attentionCount})
                    </button>
                  );
                })()}

                {/* Location pills (if any distributed stock exists in locations) */}
                {ALL_LOCATIONS
                  .filter((loc) => (countMap[loc] || 0) > 0)
                  .map((loc) => {
                    const count = countMap[loc] || 0;
                    const isSelected = locationFilter === loc && !attentionFilterActive;
                    return (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => {
                          setClickedPill(`dist-filter-loc-${loc}`);
                          setTimeout(() => setClickedPill((prev) => (prev === `dist-filter-loc-${loc}` ? null : prev)), 480);
                          setAttentionFilterActive(false);
                          setLocationFilter(loc);
                        }}
                        style={{
                          borderRadius: '1000px',
                          padding: '10px 20px',
                          fontSize: '18px',
                          fontWeight: 100,
                          cursor: 'pointer',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                          backgroundColor: isSelected ? '#2e54ff' : '#ffffff',
                          color: isSelected ? '#ffffff' : '#50617A',
                          border: isSelected ? '1px solid #2e54ff' : '1px solid rgb(218, 218, 218)',
                          boxShadow: 'none',
                          transition: 'all 0.15s ease'
                        }}
                        className={`relative overflow-hidden transition-all select-none cursor-pointer ${clickedPill === `dist-filter-loc-${loc}` ? 'sidebar-nav-click-shrink-wave' : ''}`}
                      >
                        {(() => {
                          const assignedTech = members.find(m => m.role === 'Technicien' && m.locationLink === loc);
                          const customName = getLocationCustomName(loc);
                          return assignedTech ? `${assignedTech.name} — ${customName}` : customName;
                        })()} ({count})
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Bottom Fermer Button */}
            <div className="p-5 shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex items-center gap-3" style={{ background: 'transparent' }}>
              <button
                type="button"
                onClick={() => setIsFilterSidePaneOpen(false)}
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
                className="w-full text-center cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all"
              >
                {t("Fermer")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
