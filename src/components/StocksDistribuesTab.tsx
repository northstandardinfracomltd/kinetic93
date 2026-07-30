import React, { useState, useMemo } from 'react';
import { t } from '../utils/translate';
import { Variable, StockRecord, DistributedStockLocation, Member } from '../types';
import { getLocationCustomName } from '../utils';

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
}: StocksDistribuesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Inventory states
  const [isInventoryMode, setIsInventoryMode] = useState<boolean>(false);
  const [checkedTraceabilityIds, setCheckedTraceabilityIds] = useState<Record<string, boolean>>({});

  // Form states - now maps to a StockRecord (Centrale des stocks) instead of raw variable
  const [selectedStockId, setSelectedStockId] = useState('');
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

  const handleExportInvTraca = (selectedLocationName: string) => {
    if (!selectedLocationName) return;

    const itemsToExport = distributedStocks.filter(item => item.locationName === selectedLocationName);

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
      'Inventaire de traçabilité.'
    ];

    let csvContent = '\ufeff'; // BOM for UTF-8 compatibility
    csvContent += headers.map(h => `"${h}"`).join(';') + '\n';

    itemsToExport.forEach(item => {
      const matchedStock = stocks.find(s => s.id === item.stockId || s.denominationPieceId === item.denominationPieceId);
      const vObj = variables.find(v => v.id === item.denominationPieceId);
      const rowStats = getPieceOutgoingStats(item.denominationPieceId);

      // Movements formatting
      const mvs = matchedStock?.mouvements || [];
      const movementsText = mvs.map(mv => {
        const circulation = mv.type || '';
        const raccordement = mv.emplacement || '';
        const volume = mv.volume !== undefined && mv.volume !== null ? mv.volume : '';
        const dateFormatted = mv.date ? new Date(mv.date).toLocaleDateString('fr-FR') : '';
        const situation = mv.statut || '';
        return `${circulation}, ${raccordement}, ${volume}, ${dateFormatted}, ${situation}`;
      }).join('\n');

      // Traceability formatting
      const trs = (matchedStock?.traceabilities || []).filter(t => {
        return t.situation === 'Disponible' || t.situation === 'Signalé manquant';
      });
      const traceText = trs.map(t => {
        const lotOrSerial = t.lotOrSerial || '';
        const expirationFormatted = t.expirationDate ? new Date(t.expirationDate).toLocaleDateString('fr-FR') : '';
        const volume = t.volume !== undefined && t.volume !== null ? t.volume : '1';
        const situation = t.situation || '';
        return `${lotOrSerial}, ${expirationFormatted}, ${volume}, ${situation}`;
      }).join('\n');

      const row = [
        selectedLocationName,
        matchedStock?.ugs || '',
        vObj ? vObj.nom : '',
        item.volumeDisponible !== undefined && item.volumeDisponible !== null ? item.volumeDisponible : 0,
        item.volumeReserve !== undefined && item.volumeReserve !== null ? item.volumeReserve : 0,
        item.volumeEntrant !== undefined && item.volumeEntrant !== null ? item.volumeEntrant : 0,
        rowStats.week1.vol,
        rowStats.week2.vol,
        rowStats.next30.vol,
        movementsText,
        traceText
      ];

      csvContent += row.map(val => `"${String(val !== undefined && val !== null ? val : '').replace(/"/g, '""')}"`).join(';') + '\n';
    });

    const formattedDate = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    const fileName = `Export CSV ${selectedLocationName} au ${formattedDate}.csv`;

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
    const linkedStockId = item.stockId || stocks.find(s => s.denominationPieceId === item.denominationPieceId)?.id || '';
    setSelectedStockId(linkedStockId);
    setLocationName(item.locationName);
    setVolumeDisponible(item.volumeDisponible);
    setVolumeReserve(item.volumeReserve);
    setVolumeEntrant(item.volumeEntrant);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const updated = distributedStocks.filter(x => x.id !== id);
    saveDistributedStocks(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockId) return;

    const matchedStock = stocks.find(s => s.id === selectedStockId);
    if (!matchedStock) return;

    if (editingId) {
      const originalItem = distributedStocks.find(it => it.id === editingId);
      const oldLocationName = originalItem?.locationName;

      const updated = distributedStocks.map(it => {
        if (it.id === editingId) {
          return {
            ...it,
            denominationPieceId: matchedStock.denominationPieceId,
            stockId: matchedStock.id,
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
      if (saveStocks && oldLocationName && oldLocationName !== locationName) {
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
      const matchedStock = stocks.find(s => s.id === item.stockId || s.denominationPieceId === item.denominationPieceId);
      const ugsVal = matchedStock?.ugs || '';
      
      const vObj = variables.find(v => v.id === item.denominationPieceId);
      const pieceName = vObj ? vObj.nom.toLowerCase() : '';
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

  const rowActionButton18Style: React.CSSProperties = {
    ...rowActionButtonStyle,
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
    whiteSpace: 'nowrap',
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
    outline: (isSearchHovered || isSearchFocused) ? '2.5px solid #fa53d5' : 'none',
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
        #stocks-distribues-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-distributed-input),
        #stocks-distribues-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-distributed-input),
        #stocks-distribues-tab-container-harmonized select:hover:not(:disabled),
        #stocks-distribues-tab-container-harmonized select:focus:not(:disabled),
        #stocks-distribues-tab-container-harmonized textarea:hover:not(:disabled),
        #stocks-distribues-tab-container-harmonized textarea:focus:not(:disabled),
        #stocks-distribues-tab-container-harmonized #search-distributed-input:hover,
        #stocks-distribues-tab-container-harmonized #search-distributed-input:focus {
          outline: 2.5px solid #fa53d5 !important;
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
          background-color: #f1f5f9 !important;
          color: #555555 !important;
          cursor: not-allowed !important;
          opacity: 0.82 !important;
        }
      `}</style>

      {!showForm ? (
        <>
          {/* Header Section */}
          <div 
            className="bg-white space-y-4"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
              <div>
                <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default' }} id="stocks-distribues-tab-title">Stocks distribués</h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white">
                {/* Field recherche (Search input) */}
                <div className="relative w-full sm:w-80 bg-white">
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

                {/* Attention requise button */}
                <button
                  type="button"
                  onClick={() => setAttentionFilterActive(!attentionFilterActive)}
                  style={{
                    ...customButtonStyle,
                    backgroundColor: attentionFilterActive ? '#fa53d5' : '#000000',
                    color: '#ffffff',
                    border: 'none',
                  }}
                  className="font-sans transition-all select-none"
                >
                  {t("Attention requise")}
                </button>

                {/* Export inv. traça. button with dropdown lookup */}
                <div className="relative bg-white flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                    style={{
                      ...customButtonStyle,
                      backgroundColor: '#000000',
                      color: '#ffffff',
                      border: 'none',
                    }}
                    className="font-sans transition-all select-none"
                  >
                    {t("Export inv. traça.")}
                  </button>
                  {showExportDropdown && (
                    <div 
                      className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-lg p-3 z-50 flex flex-col gap-2 text-left"
                      style={{ boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}
                    >
                      <label className="text-xs font-bold text-slate-500 uppercase font-sans">Emplacement</label>
                      <select
                        value={exportLocation}
                        onChange={(e) => {
                          const val = e.target.value;
                          setExportLocation(val);
                          handleExportInvTraca(val);
                          setExportLocation('');
                          setShowExportDropdown(false);
                        }}
                        className="w-full bg-white text-black p-2 rounded border border-slate-200 text-xs font-sans"
                        style={{ minHeight: '36px' }}
                      >
                        <option value="" disabled hidden>Choisir l'emplacement</option>
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
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleOpenNewForm}
                  style={customButtonStyle}
                  className="font-sans"
                >
                  Nouveau
                </button>
              </div>
            </div>
          </div>

          {/* Filters Pills Row - identical style to Centrale des stocks */}
          <div className="px-4 flex flex-wrap gap-2.5 justify-center sm:justify-start pt-5" id="stocks-distributed-storage-pills">
            {['Tous', ...ALL_LOCATIONS]
              .filter((loc) => loc === 'Tous' || (countMap[loc] || 0) > 0)
              .map((loc) => {
                const count = countMap[loc] || 0;
                const isSelected = locationFilter === loc;
                return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocationFilter(loc)}
                  style={{
                    borderRadius: '1000px',
                    padding: '10px 20px',
                    fontSize: '15px',
                    fontWeight: 100,
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    backgroundColor: isSelected ? '#fa53d5' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#000000',
                    border: isSelected ? '1px solid #fa53d5' : '1px solid rgb(218, 218, 218)',
                    boxShadow: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  className="transition-all"
                >
                  {loc === 'Tous' ? loc : (() => {
                    const assignedTech = members.find(m => m.role === 'Technicien' && m.locationLink === loc);
                    const customName = getLocationCustomName(loc);
                    return assignedTech ? `${assignedTech.name} — ${customName}` : customName;
                  })()} ({count})
                </button>
              );
            })}
          </div>

          {/* Distributed Stock Table List - identical to Centrale des stocks table */}
          <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans border-collapse text-xs" id="stocks-distribues-record-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
                <thead>
                  <tr className="bg-transparent">
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
                      <td colSpan={10} className="py-16 text-center font-sans lg:py-24 text-sm bg-white" style={{ color: '#000000', fontWeight: 100, fontSize: '16px' }}>
                        Aucun résultat.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const matchedStock = stocks.find(s => s.id === item.stockId || s.denominationPieceId === item.denominationPieceId);
                      const ugsCode = matchedStock?.ugs || '';
                      
                      const vObj = variables.find(v => v.id === item.denominationPieceId);
                      const pieceName = vObj ? vObj.nom : 'Dénomination inconnue';
                      const pieceCat = vObj ? vObj.category : '-';

                      const rowStats = getPieceOutgoingStats(item.denominationPieceId);

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
                          className="group hover:bg-[#ffecf8] transition-all cursor-pointer"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, a, input, select, option')) return;
                            handleEditClick(item);
                          }}
                        >
                          {/* UGS */}
                          <td className="px-4 py-5 whitespace-nowrap font-sans text-slate-800" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif', fontSize: '16px', color: '#000000' }}>
                            {ugsCode || '-'}
                          </td>
                          {/* Pièce ou service */}
                          <td className="px-4 py-5 whitespace-nowrap font-sans text-black" style={{ fontSize: '16px', color: '#000000', whiteSpace: 'nowrap' }}>
                            <span className="font-semibold">{pieceName}</span> <span className="text-black font-normal">({pieceCat})</span>
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
                                border: '1px solid rgb(231, 231, 231)',
                                color: '#000000',
                                fontSize: '15px',
                                fontWeight: 100,
                                padding: '6px 18px',
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
                          <td className="px-4 py-5 text-center whitespace-nowrap font-semibold" style={{ fontSize: '15px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {item.volumeDisponible}
                          </td>
                          {/* Qté réservée */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {item.volumeReserve}
                          </td>
                          {/* Qté entrante */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {item.volumeEntrant}
                          </td>
                          {/* Sortant Sem */}
                          <td className="px-4 py-5 text-center whitespace-nowrap font-semibold" style={{ fontSize: '15px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {rowStats.week1.vol}
                          </td>
                          {/* Sortant Sem Pro */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {rowStats.week2.vol}
                          </td>
                          {/* Sortant 7 à 30 jours */}
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
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
                                  backgroundColor: '#000000',
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
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', width: '98%', maxWidth: '98%', margin: 'auto', padding: '20px' }}
            id="distributed-form-header-box"
          >
            <div>
              <h3 className="text-2xl font-bold font-gochi" id="distributed-form-title" style={{ color: '#000', cursor: 'default' }}>
                {editingId ? t("Modification Stock Distribué") : t("Nouveau Stock Distribué")}
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                style={rowActionButton18Style}
                className="transition-colors cursor-pointer"
              >
                <span>{t("Annuler")}</span>
              </button>

              <button
                type="submit"
                form="distributed-stock-form"
                style={{
                  ...rowActionButton18Style,
                  backgroundColor: 'rgb(53, 86, 236)',
                  color: '#ffffff',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                }}
                className="transition-all cursor-pointer"
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
            className="space-y-6 bg-white p-5 border-none"
            style={{
              border: '1px solid rgb(218, 218, 218)',
              borderRadius: '18px',
              width: '98%',
              maxWidth: '98%',
              margin: 'auto'
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 bg-white font-sans text-sm">
              
              {/* Section Propriétés Capsule */}
              <div className="flex bg-white md:col-span-4 select-none mb-1">
                <span 
                  className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                  style={{
                    color: '#fff',
                    backgroundColor: '#5f1f66',
                    fontSize: '16px',
                    border: 'none',
                    textTransform: 'none',
                    letterSpacing: 'normal'
                  }}
                >
                  Propriétés
                </span>
              </div>

              {/* Piece Selection - looks up Centrale des stocks records */}
              <div className="flex flex-col gap-1 bg-white md:col-span-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Équipement de la centrale des stocks *</label>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  disabled={!!selectedStockId}
                  className="w-full bg-white text-black cursor-pointer"
                  required
                >
                  <option value="" disabled hidden>Sélectionnez un item de la centrale des stocks</option>
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
              <div className="md:col-span-4 mt-2" style={{ borderTop: '1px solid rgb(218, 218, 218)', margin: '0 -20px' }} />
              <div className="md:col-span-4 pt-5 mt-2 bg-white flex flex-col gap-4">
                <div className="flex bg-white select-none">
                  <span 
                    className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                    style={{
                      color: '#fff',
                      backgroundColor: '#5f1f66',
                      fontSize: '16px',
                      border: 'none',
                      textTransform: 'none',
                      letterSpacing: 'normal'
                    }}
                  >
                    Emplacement
                  </span>
                </div>

                <div className="flex flex-col gap-1 bg-white">
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
              <div className="md:col-span-4 mt-2" style={{ borderTop: '1px solid rgb(218, 218, 218)', margin: '0 -20px' }} />
              <div className="md:col-span-4 pt-5 mt-2 bg-white flex flex-col gap-4">
                <div className="flex bg-white select-none">
                  <span 
                    className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                    style={{
                      color: '#fff',
                      backgroundColor: '#5f1f66',
                      fontSize: '16px',
                      border: 'none',
                      textTransform: 'none',
                      letterSpacing: 'normal'
                    }}
                  >
                    Volumes
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-5 bg-white">
                  {/* Volume Disponible */}
                  <div className="flex flex-col gap-1 bg-white md:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Volume disponible *</label>
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
                  <div className="flex flex-col gap-1 bg-white md:col-span-1">
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
                  <div className="flex flex-col gap-1 bg-white md:col-span-1">
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
                  <div className="flex flex-col gap-1 bg-white md:col-span-1">
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-white mt-1">
                  {/* Sortant cette semaine */}
                  <div className="flex flex-col gap-1 bg-white">
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
                  <div className="flex flex-col gap-1 bg-white">
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
                  <div className="flex flex-col gap-1 bg-white">
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
              <div className="md:col-span-4 mt-2" style={{ borderTop: '1px solid rgb(218, 218, 218)', margin: '0 -20px' }} />
              <div className="md:col-span-4 pt-5 mt-2 bg-white flex flex-col gap-4">
                <div className="flex bg-white select-none">
                  <span 
                    className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                    style={{
                      color: '#fff',
                      backgroundColor: '#5f1f66',
                      fontSize: '16px',
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
                                    color: '#fa53d5',
                                    fontSize: '18px',
                                    lineHeight: '1',
                                    cursor: 'default'
                                  }}
                                >
                                  {mv.type === 'Réapprovisionnement fournisseur' ? '↓' : 
                                   mv.type === 'Distribution' ? '→' : 
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
                                    className="text-[#fa53d5] hover:underline font-bold font-sans"
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
                  <div className="md:col-span-4 mt-2" style={{ borderTop: '1px solid rgb(218, 218, 218)', margin: '0 -20px' }} />
                  <div className="md:col-span-4 pt-5 mt-2 bg-white flex flex-col gap-4">
                    <div className="flex bg-white select-none">
                      <span 
                        className="inline-flex items-center px-4 py-1.5 rounded-full font-semibold font-sans"
                        style={{
                          color: '#fff',
                          backgroundColor: '#5f1f66',
                          fontSize: '16px',
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
                        backgroundColor: isInventoryMode ? "#2563eb" : "#000000",
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
                                        className="inline-block"
                                        dangerouslySetInnerHTML={{ __html: generateBarcodeSVGString(trace.lotOrSerial) }} 
                                      />
                                      <button
                                        type="button"
                                        onClick={() => downloadBarcodeSVG(trace.lotOrSerial)}
                                        style={{
                                          backgroundColor: '#000000',
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

    </div>
  );
}
