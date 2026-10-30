import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../utils/translate';
import { Variable, StockRecord, Defibrillateur, StockMovement, DistributedStockLocation, CommercialDoc, AchatFournisseur, StockTraceability, Member, LogisticsNotification, CompanyInfo, getTenantSpreadsheetUrl, openTenantSpreadsheetUrl } from '../types';
import { getLocationCustomName, generateRandomShortCode } from '../utils';
import HelpBubble from './HelpBubble';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { Check, X } from 'lucide-react';
import { SearchSidePane, SearchSidePaneItem } from './SearchSidePane';
import { logDeleteStockCenter } from '../services/suspiciousActivityService';

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
  'Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E',
  'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J',
  'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E',
  'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J'
];

interface StocksTabProps {
  stocks: StockRecord[];
  variables: Variable[];
  defibrillateurs: Defibrillateur[];
  saveDefibs?: (defibs: Defibrillateur[]) => void;
  onAddDefib?: (defib: Omit<Defibrillateur, 'id'>) => void;
  saveStocks: (updated: StockRecord[]) => void;
  showStockForm: boolean;
  setShowStockForm: (show: boolean) => void;
  distributedStocks?: DistributedStockLocation[];
  onNavigateToDistributedStocks?: (ugs: string) => void;
  stockSearchQuery?: string;
  setStockSearchQuery?: (q: string) => void;
  commercialDocs?: CommercialDoc[];
  achatsFournisseurs?: AchatFournisseur[];
  setActiveTab?: (tab: any, bypassBlock?: boolean) => void;
  members?: Member[];
  saveDistributedStocks?: (updated: DistributedStockLocation[]) => void;
  logisticsNotifications?: LogisticsNotification[];
  saveLogisticsNotifications?: (updated: LogisticsNotification[]) => void;
  isDeveloper?: boolean;
  isReadOnly?: boolean;
  companyInfo?: Partial<CompanyInfo> | null;
}

export default function StocksTab({
  stocks,
  variables,
  defibrillateurs = [],
  saveDefibs,
  onAddDefib,
  saveStocks,
  showStockForm,
  setShowStockForm,
  distributedStocks = [],
  onNavigateToDistributedStocks,
  stockSearchQuery: externalStockSearchQuery,
  setStockSearchQuery: externalSetStockSearchQuery,
  commercialDocs = [],
  achatsFournisseurs = [],
  setActiveTab,
  members = [],
  saveDistributedStocks,
  logisticsNotifications = [],
  saveLogisticsNotifications,
  isDeveloper = false,
  isReadOnly = false,
  companyInfo,
}: StocksTabProps) {
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState<boolean>(false);
  const [isFilterSidePaneOpen, setIsFilterSidePaneOpen] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [clickedPill, setClickedPill] = useState<string | null>(null);
  const [spreadsheetVersion, setSpreadsheetVersion] = useState<number>(0);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [slidingNavTab, setSlidingNavTab] = useState<'stocks' | 'stocks-distribues'>('stocks');

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
    return getTenantSpreadsheetUrl('spreadsheetStocks', companyInfo);
  }, [companyInfo, spreadsheetVersion]);

  const handleRefreshStocks = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      window.dispatchEvent(
        new CustomEvent('defib-manual-refresh-spreadsheet', {
          detail: { spreadsheetKey: 'spreadsheetStocks', idSuffix: 'stocks' },
        })
      );
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };
  const [showFormInfoBanner, setShowFormInfoBanner] = useState<boolean>(() => {
    return localStorage.getItem('defib_hide_stocks_form_info_banner') !== 'true';
  });
  const [newDenomStr, setNewDenomStr] = useState('');
  const [newQty, setNewQty] = useState<number>(0);
  const [newQtyReservee, setNewQtyReservee] = useState<number>(0);

  const availableBcs = useMemo(() => {
    if (!commercialDocs || commercialDocs.length === 0) return [];
    const bcs = commercialDocs
      .filter(doc => doc.hasBonCommande && doc.bonCommandeReference && doc.bonCommandeReference.trim() !== '')
      .map(doc => doc.bonCommandeReference!.trim());
    return Array.from(new Set(bcs));
  }, [commercialDocs]);

  // Stock Movement States
  const [mouvements, setMouvements] = useState<StockMovement[]>([]);
  const [newMvType, setNewMvType] = useState<'Réapprovisionnement fournisseur' | 'Distribution' | 'Rapatriement' | 'Expédition directe au client'>('Distribution');
  const [newMvVolume, setNewMvVolume] = useState<number>(1);
  const [newMvDate, setNewMvDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [newMvStatut, setNewMvStatut] = useState<'Préparation' | 'Expédié' | 'Terminé' | 'Annulé'>('Préparation');
  const [newMvBonCommande, setNewMvBonCommande] = useState<string>('');
  const [newMvCustomBonCommande, setNewMvCustomBonCommande] = useState<string>('');
  const [newMvProvenanceSelect, setNewMvProvenanceSelect] = useState<string>('');
  const [newMvCustomProvenance, setNewMvCustomProvenance] = useState<string>('');
  const [newMvTrackingLink, setNewMvTrackingLink] = useState<string>('');
  const [newMvEmplacement, setNewMvEmplacement] = useState<string>('');
  const [showMvForm, setShowMvForm] = useState<boolean>(false);
  const [newUgs, setNewUgs] = useState<string>('');

  // Traçabilité States
  const [traceabilityEnabled, setTraceabilityEnabled] = useState<boolean>(false);
  const [traceabilities, setTraceabilities] = useState<StockTraceability[]>([]);
  const [selectedSituationFilter, setSelectedSituationFilter] = useState<string>('Toutes situations');

  const isDefibrillator = useMemo(() => {
    const matchedVar = variables.find(v => v.id === newDenomStr);
    return matchedVar?.category === 'Modèle Défibrillateur';
  }, [variables, newDenomStr]);
  
  // Nouveau Inventaire Form States
  const [showTraceabilityForm, setShowTraceabilityForm] = useState<boolean>(false);
  const [selectedMovementId, setSelectedMovementId] = useState<string>('');
  const [lotOrSerial, setLotOrSerial] = useState<string>('');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [situation, setSituation] = useState<'Disponible' | 'Utilisé' | 'Indisponible' | 'Signalé manquant' | 'Prêté'>('Disponible');

  // New States for Selected Traceabilities Distribution Form
  const [selectedTraceIds, setSelectedTraceIds] = useState<string[]>([]);
  const [distribEmplacement, setDistribEmplacement] = useState<string>('');
  const [distribDate, setDistribDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [distribSuiviColis, setDistribSuiviColis] = useState<string>('');
  const [distribStatut, setDistribStatut] = useState<'Préparation' | 'Expédié' | 'Terminé' | 'Annulé'>('Préparation');
  const [distribMvType, setDistribMvType] = useState<'Distribution' | 'Rapatriement'>('Distribution');

  // Helper to determine the location for a traceability item
  const getTraceLocation = (trace: StockTraceability) => {
    if (trace.emplacement) return trace.emplacement;
    const matchedMv = mouvements.find(mv => mv.id === trace.movementId);
    if (matchedMv) {
      if (matchedMv.type === 'Réapprovisionnement fournisseur') {
        return 'Centrale des stocks';
      } else if ((matchedMv.type === 'Distribution' || matchedMv.type === 'Rapatriement') && matchedMv.emplacement) {
        if (matchedMv.emplacement.includes(' : ')) {
          return matchedMv.emplacement.split(' : ')[1];
        } else {
          return matchedMv.emplacement;
        }
      } else if (matchedMv.emplacement) {
        if (matchedMv.emplacement.includes(' : ')) {
          return matchedMv.emplacement.split(' : ')[1];
        } else {
          return matchedMv.emplacement;
        }
      }
    }
    return 'Centrale des stocks';
  };

  const getReservationInfoText = (trace: StockTraceability) => {
    if (trace.reservationInfo) {
      return trace.reservationInfo;
    }
    if (trace.bonCommande || trace.client || trace.dateEstimee) {
      const bc = trace.bonCommande || '—';
      const cl = trace.client || '—';
      const dt = trace.dateEstimee || '—';
      return `${bc} — ${cl} — ${dt}`;
    }
    const matchedDoc = (commercialDocs || []).find(doc => 
      doc.hasBonCommande && 
      doc.bonCommandeReference &&
      doc.items && 
      doc.items.some(it => it.variableId === newDenomStr || (newUgs && it.ugs === newUgs))
    );
    if (matchedDoc) {
      const bc = matchedDoc.bonCommandeReference || matchedDoc.ref || '—';
      const cl = matchedDoc.clientDenomination || '—';
      const dt = matchedDoc.dateStr || '—';
      return `${bc} — ${cl} — ${dt}`;
    }
    return '—';
  };

  const handleSelectedDistributionSubmit = () => {
    if (selectedTraceIds.length === 0) return;
    if (!distribEmplacement) {
      alert("Veuillez sélectionner un emplacement d'envoi.");
      return;
    }
    if (!distribDate) {
      alert("La date de distribution est requise.");
      return;
    }

    // Create the movement ID
    const mvId = 'mv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const currentVar = variables.find(v => v.id === newDenomStr);
    const itemName = currentVar ? currentVar.nom : 'Pièce';
    const ugsCode = newUgs || '0001';
    
    // Movement emplacement label
    const mvEmplacementStr = `${itemName} ${ugsCode} : ${distribEmplacement}`;

    // Create a new movement record
    const newMv: StockMovement = {
      id: mvId,
      type: distribMvType,
      volume: selectedTraceIds.length,
      date: distribDate,
      statut: distribStatut,
      bonCommande: '',
      trackingLink: distribSuiviColis,
      emplacement: mvEmplacementStr
    };

    // Update mouvements state
    setMouvements(prev => [...prev, newMv]);

    // Update traceabilities' emplacement and movementId
    const updatedTraceabilities = traceabilities.map(t => {
      if (selectedTraceIds.includes(t.id)) {
        return {
          ...t,
          emplacement: distribEmplacement,
          movementId: mvId
        };
      }
      return t;
    });
    setTraceabilities(updatedTraceabilities);

    // Update Distributed Stocks list
    const isTermine = distribStatut === 'Terminé';
    const isEnTransit = distribStatut === 'Préparation' || distribStatut === 'Expédié';

    let updatedDistributedStocks = [...distributedStocks];
    let centralDecrementCount = 0;
    let centralIncrementCount = 0;

    selectedTraceIds.forEach(id => {
      const t = traceabilities.find(item => item.id === id);
      if (!t) return;
      const srcLoc = getTraceLocation(t);

      // Decrement the source
      if (srcLoc === 'Centrale des stocks') {
        centralDecrementCount++;
      } else {
        const srcIndex = updatedDistributedStocks.findIndex(
          ds => ds.locationName === srcLoc && ds.denominationPieceId === newDenomStr
        );
        if (srcIndex >= 0) {
          const dsSrc = updatedDistributedStocks[srcIndex];
          updatedDistributedStocks[srcIndex] = {
            ...dsSrc,
            volumeDisponible: Math.max(0, dsSrc.volumeDisponible - 1)
          };
        }
      }

      // Increment the destination (only if dest is different from src)
      if (srcLoc !== distribEmplacement) {
        if (distribEmplacement === 'Centrale des stocks') {
          if (isTermine) {
            centralIncrementCount++;
          }
        } else {
          const destIndex = updatedDistributedStocks.findIndex(
            ds => ds.locationName === distribEmplacement && ds.denominationPieceId === newDenomStr
          );
          if (destIndex >= 0) {
            const dsDest = updatedDistributedStocks[destIndex];
            updatedDistributedStocks[destIndex] = {
              ...dsDest,
              volumeDisponible: dsDest.volumeDisponible + (isTermine ? 1 : 0),
              volumeEntrant: (dsDest.volumeEntrant || 0) + (isEnTransit ? 1 : 0)
            };
          } else {
            const newDs: DistributedStockLocation = {
              id: 'ds_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              denominationPieceId: newDenomStr,
              stockId: editingStockId || undefined,
              locationName: distribEmplacement as any,
              volumeDisponible: isTermine ? 1 : 0,
              volumeReserve: 0,
              volumeEntrant: isEnTransit ? 1 : 0
            };
            updatedDistributedStocks.unshift(newDs);
          }
        }
      }
    });

    if (saveDistributedStocks) {
      saveDistributedStocks(updatedDistributedStocks);
    }

    if (centralDecrementCount > 0) {
      setNewQty(prev => Math.max(0, prev - centralDecrementCount));
    }
    if (centralIncrementCount > 0) {
      setNewQty(prev => prev + centralIncrementCount);
    }

    // Reset selection and form
    setSelectedTraceIds([]);
    setDistribEmplacement('');
    setDistribSuiviColis('');
    setDistribStatut('Préparation');
    setDistribDate(new Date().toISOString().split('T')[0]);
    setDistribMvType('Distribution');

    alert("La distribution des pièces sélectionnées a été enregistrée avec succès !");
  };

  const filteredDistributedStocks = useMemo(() => {
    return distributedStocks.filter(ds => ds.denominationPieceId === newDenomStr);
  }, [distributedStocks, newDenomStr]);

  const availableLocationOptions = useMemo(() => {
    const locSet = new Set<string>();

    // Add all standard locations except 'Centrale des stocks'
    ALL_LOCATIONS.filter(loc => loc !== 'Centrale des stocks').forEach(loc => locSet.add(loc));

    // Add any locationLink from technician members
    members.forEach(m => {
      if (m.role === 'Technicien' && m.locationLink && m.locationLink !== 'Centrale des stocks') {
        locSet.add(m.locationLink);
      }
    });

    // Add any existing distributedStock locationName
    filteredDistributedStocks.forEach(ds => {
      if (ds.locationName && ds.locationName !== 'Centrale des stocks') {
        locSet.add(ds.locationName);
      }
    });

    const currentVar = variables.find(v => v.id === newDenomStr);
    const itemName = currentVar ? currentVar.nom : 'Pièce';
    const matchedStock = stocks.find(s => s.id === editingStockId || s.denominationPieceId === newDenomStr);
    const ugsCode = newUgs || (matchedStock ? matchedStock.ugs : '0001');

    return Array.from(locSet).map(locName => {
      const assignedTech = members.find(m => m.role === 'Technicien' && m.locationLink === locName);
      const customLocName = getLocationCustomName(locName);
      const techPart = assignedTech ? `${assignedTech.name} — ` : '';
      const fullLabel = `${itemName} — ${techPart}${customLocName}`;

      const valueStr = `${itemName} ${ugsCode} : ${locName}`;

      return {
        locName,
        label: fullLabel,
        value: valueStr
      };
    });
  }, [members, filteredDistributedStocks, variables, newDenomStr, stocks, editingStockId, newUgs]);

  useEffect(() => {
    if (newMvType === 'Distribution' || newMvType === 'Rapatriement') {
      if (availableLocationOptions.length > 0) {
        if (!newMvEmplacement || !availableLocationOptions.some(opt => opt.value === newMvEmplacement)) {
          setNewMvEmplacement(availableLocationOptions[0].value);
        }
      } else {
        setNewMvEmplacement('');
      }
    } else if (newMvType === 'Réapprovisionnement fournisseur') {
      if (achatsFournisseurs.length > 0) {
        if (!newMvProvenanceSelect) {
          setNewMvProvenanceSelect(achatsFournisseurs[0].reference);
          setNewMvEmplacement(achatsFournisseurs[0].reference);
        }
      } else {
        setNewMvProvenanceSelect('custom');
        setNewMvEmplacement(newMvCustomProvenance);
      }
    } else if (newMvType === 'Expédition directe au client') {
      // Managed via Commande field / custom BC
    } else {
      setNewMvEmplacement('');
    }
  }, [newMvType, availableLocationOptions, achatsFournisseurs]);

  const handleAddMovementInline = () => {
    const finalVol = newMvType === 'Expédition directe au client' ? 1 : newMvVolume;
    if (finalVol <= 0) {
      alert("Le volume doit être supérieur à 0");
      return;
    }
    if (newMvType === 'Distribution' && finalVol > Number(newQty)) {
      alert(`Le volume (${finalVol}) ne peut pas être supérieur à la quantité disponible (${newQty}).`);
      return;
    }
    if (!newMvDate) {
      alert("La date est requise");
      return;
    }
    if (newMvType === 'Réapprovisionnement fournisseur') {
      if (newMvProvenanceSelect === 'custom') {
        if (!newMvCustomProvenance.trim()) {
          alert("Veuillez saisir une provenance personnalisée.");
          return;
        }
      } else if (!newMvProvenanceSelect && !newMvEmplacement) {
        alert("Veuillez sélectionner un achat fournisseur (référence BL) ou choisir 'Autre'.");
        return;
      }
    }
    if (newMvType === 'Distribution' && !newMvEmplacement) {
      alert("Veuillez sélectionner un emplacement.");
      return;
    }
    if (newMvType === 'Expédition directe au client') {
      if (!newMvBonCommande) {
        alert("Veuillez sélectionner ou saisir une commande.");
        return;
      }
      if (newMvBonCommande === 'custom' && !newMvCustomBonCommande.trim()) {
        alert("Veuillez saisir le bon de commande.");
        return;
      }
    }

    const bcVal = newMvType === 'Expédition directe au client'
      ? (newMvBonCommande === 'custom' ? newMvCustomBonCommande.trim() : newMvBonCommande)
      : newMvBonCommande;

    let locText = newMvEmplacement;
    if (newMvType === 'Réapprovisionnement fournisseur') {
      if (newMvProvenanceSelect === 'custom') {
        locText = newMvCustomProvenance.trim();
      } else {
        locText = newMvProvenanceSelect || newMvEmplacement;
      }
    } else if (newMvType === 'Expédition directe au client') {
      if (newMvBonCommande === 'custom') {
        locText = newMvCustomBonCommande.trim();
      } else {
        const foundDoc = commercialDocs.find(d => (d.bonCommandeReference && d.bonCommandeReference === newMvBonCommande) || d.ref === newMvBonCommande || d.id === newMvBonCommande);
        locText = foundDoc
          ? `${foundDoc.bonCommandeEntete || foundDoc.bonCommandeReference || foundDoc.ref}${foundDoc.clientDenomination ? ` (${foundDoc.clientDenomination})` : ''}`
          : newMvBonCommande;
      }
    }

    const newMv: StockMovement = {
      id: 'mv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: newMvType,
      volume: finalVol,
      date: newMvDate,
      statut: newMvStatut,
      bonCommande: bcVal,
      trackingLink: newMvTrackingLink,
      emplacement: locText
    };

    // If movement is Distribution, ensure a record exists in distributedStocks
    if (newMvType === 'Distribution' && newMvEmplacement && saveDistributedStocks) {
      const targetLoc = newMvEmplacement.includes(' : ') ? newMvEmplacement.split(' : ')[1] : newMvEmplacement;
      if (targetLoc && targetLoc !== 'Centrale des stocks') {
        let updatedDs = [...distributedStocks];
        const existingIndex = updatedDs.findIndex(ds => ds.denominationPieceId === newDenomStr && ds.locationName === targetLoc);

        const isTermine = newMvStatut === 'Terminé';
        const isEnTransit = newMvStatut === 'Préparation' || newMvStatut === 'Expédié';
        const volumeNum = Number(newMvVolume) || 1;

        if (existingIndex >= 0) {
          const existingDs = updatedDs[existingIndex];
          updatedDs[existingIndex] = {
            ...existingDs,
            volumeDisponible: existingDs.volumeDisponible + (isTermine ? volumeNum : 0),
            volumeEntrant: (existingDs.volumeEntrant || 0) + (isEnTransit ? volumeNum : 0)
          };
        } else {
          const newDs: DistributedStockLocation = {
            id: 'ds_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            denominationPieceId: newDenomStr,
            stockId: editingStockId || undefined,
            locationName: targetLoc as any,
            volumeDisponible: isTermine ? volumeNum : 0,
            volumeReserve: 0,
            volumeEntrant: isEnTransit ? volumeNum : 0
          };
          updatedDs.unshift(newDs);
        }

        saveDistributedStocks(updatedDs);
      }
    }

    setMouvements([...mouvements, newMv]);
    setNewMvVolume(1);
    setNewMvBonCommande('');
    setNewMvCustomBonCommande('');
    setNewMvProvenanceSelect('');
    setNewMvCustomProvenance('');
    setNewMvTrackingLink('');
    setNewMvEmplacement('');
    setShowMvForm(false);
  };

  const handleAddTraceabilityInline = () => {
    if (!selectedMovementId) {
      alert("Veuillez sélectionner un mouvement.");
      return;
    }
    if (!lotOrSerial.trim()) {
      alert("Le numéro de lot ou série est requis.");
      return;
    }

    const matchedMv = mouvements.find(mv => mv.id === selectedMovementId);
    let initialLocation = 'Centrale des stocks';
    if (matchedMv) {
      if (matchedMv.type === 'Réapprovisionnement fournisseur') {
        initialLocation = 'Centrale des stocks';
      } else if (matchedMv.emplacement) {
        if (matchedMv.emplacement.includes(' : ')) {
          initialLocation = matchedMv.emplacement.split(' : ')[1];
        } else {
          initialLocation = matchedMv.emplacement;
        }
      }
    }

    const newTrace: StockTraceability = {
      id: 'tr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      movementId: selectedMovementId,
      lotOrSerial: lotOrSerial.trim(),
      expirationDate: expirationDate || undefined,
      volume: 1,
      situation: situation,
      emplacement: initialLocation
    };
    setTraceabilities([...traceabilities, newTrace]);
    
    // Reset form states
    setSelectedMovementId('');
    setLotOrSerial('');
    setExpirationDate('');
    setSituation('Disponible');
    setShowTraceabilityForm(false);
  };

  const handleExtractDeployDefib = (trace: StockTraceability, traceIdx: number) => {
    if (isDeveloper || isReadOnly) {
      alert("Action non autorisée : Le rôle Développeur est en mode lecture seule.");
      return;
    }
    if (trace.volume === 0) {
      return;
    }

    const existingIds = (defibrillateurs || []).map(df => df.identifiant);
    const newIdentifiant = generateRandomShortCode(existingIds);

    const newDefib: Defibrillateur = {
      id: 'df_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      identifiant: newIdentifiant,
      numeroSerie: trace.lotOrSerial ? trace.lotOrSerial.trim() : '',
      commentaire: trace.comment ? trace.comment.trim() : '',
      commentaireInterne: '',
      modeleId: newDenomStr || '',
      numeroAtlasante: '',
      versionLogiciel: '',
      clientId: '',
      nomSite: '',
      categorieEtablissement: '',
      nomPrenomSite: '',
      telephoneSite: '',
      emailSite: '',
      contrat: 'Non',
      nomContrat: '',
      referenceContrat: '',
      debutContrat: '',
      finContrat: '',
      payeurId: '',
      clientIdField: '',
      modeleCoffretId: '',
      numeroLotCoffret: '',
      commentaireCoffret: '',
      numVoie: '',
      ville: '',
      cp: '',
      region: 'Île-de-France',
      pays: 'France',
      latitude: '',
      longitude: '',
      commentaireAdresse: '',
      acces247: false,
      accesSemaine: true,
      accesWeekend: false,
      exterieur: false,
      horaires: '[]',
      finGarantie: trace.expirationDate ? trace.expirationDate.trim() : '',
      fabrication: '',
      miseEnService: new Date().toISOString().split('T')[0],
      derniereMaintenance: '',
      sortieFabricant: '',
      modeleElectrodeAId: '',
      lotElectrodeA: '',
      insertionElectrodeA: '',
      peremptionElectrodeA: '',
      livraisonElectrodeA: '',
      situationElectrodeA: 'Vert',
      commentaireElectrodeA: '',
      peremptionSecoursElectrodeA: '',
      modeleElectrodePId: '',
      lotElectrodeP: '',
      insertionElectrodeP: '',
      peremptionElectrodeP: '',
      livraisonElectrodeP: '',
      situationElectrodeP: 'Vert',
      commentaireElectrodeP: '',
      peremptionSecoursElectrodeP: '',
      modeleBatterieId: '',
      lotBatterie: '',
      insertionBatterie: '',
      peremptionBatterie: '',
      livraisonBatterie: '',
      situationBatterie: 'Vert',
      pourcentageBatterie: '',
      commentaireBatterie: '',
      loue: 'Non',
      prete: 'Non',
      stocke: 'Non',
      archive: 'Non',
      conforme: 'Oui',
      sousTraitance: 'Non',
      fsmAutorise: 'Non',
      victimeSurvie: 'Non',
      victimeSansSurvie: 'Non',
      ageVictime: '',
      commentaireCampagneRappel: '',
    };

    if (onAddDefib) {
      onAddDefib(newDefib);
    } else if (saveDefibs) {
      saveDefibs([...(defibrillateurs || []), newDefib]);
    }

    // Update the traceability item in traceabilities state with volume = 0
    const updatedTraceabilities = traceabilities.map((t, i) => {
      if (t.id === trace.id || i === traceIdx) {
        return {
          ...t,
          volume: 0,
        };
      }
      return t;
    });
    setTraceabilities(updatedTraceabilities);

    // If editing existing stock record, persist the change immediately
    if (editingStockId) {
      const updatedStocks = stocks.map(st => {
        if (st.id === editingStockId) {
          return {
            ...st,
            traceabilities: updatedTraceabilities
          };
        }
        return st;
      });
      saveStocks(updatedStocks);
    }

    // Show native system alert dialog
    alert("Information système : Ajouté avec succès dans l’onglet Défibrillateurs.");
  };

  const handleUpdateMovementStatus = (mvId: string, status: 'Préparation' | 'Expédié' | 'Terminé' | 'Annulé') => {
    const updated = mouvements.map((m) => {
      if (m.id === mvId) {
        return { ...m, statut: status };
      }
      return m;
    });
    setMouvements(updated);
  };

  const handleUpdateMovementTrackingLink = (mvId: string, link: string) => {
    const updated = mouvements.map((m) => {
      if (m.id === mvId) {
        return { ...m, trackingLink: link };
      }
      return m;
    });
    setMouvements(updated);
  };

  const handleUpdateMovementBonCommande = (mvId: string, bc: string) => {
    const updated = mouvements.map((m) => {
      if (m.id === mvId) {
        return { ...m, bonCommande: bc };
      }
      return m;
    });
    setMouvements(updated);
  };

  const handleCancelMovement = (mvId: string) => {
    const clickedMv = mouvements.find(m => m.id === mvId);
    if (!clickedMv) return;

    // Mark cliked row as canceled (and its status also updated to Annulé visually, as the user says "disable toutes actions possible")
    const updatedMouvements = mouvements.map((m) => {
      if (m.id === mvId) {
        return { ...m, isCanceled: true, statut: 'Annulé' as const };
      }
      return m;
    });

    const todayStr = new Date().toISOString().split('T')[0];

    // Generate a brand new movement line
    const annulationMv: StockMovement = {
      id: 'mv_ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'Annulation',
      volume: clickedMv.volume,
      date: todayStr,
      statut: 'Préparation',
      bonCommande: '',
      trackingLink: '',
      emplacement: 'Centrale des stocks',
      isCanceled: true // Canceled / disabled by definition since it's an Annulation row
    };

    setMouvements([...updatedMouvements, annulationMv]);
  };

  const handleRemoveMovement = (mvId: string) => {
    setMouvements(mouvements.filter(m => m.id !== mvId));
  };

  React.useEffect(() => {
    if (newDenomStr) {
      const available = variables.filter(v => !stocks.some(s => s.denominationPieceId === v.id && s.id !== editingStockId));
      const isCurrentValid = available.some(v => v.id === newDenomStr);
      if (!isCurrentValid) {
        setNewDenomStr('');
      }
    }
  }, [variables.length, stocks.length, editingStockId, newDenomStr]);

  // Grouped variables for the "Pièce ou service" select with category intercalaires / optgroups
  const groupedStockVariables = useMemo(() => {
    const CATEGORY_MAPPING: Record<string, { label: string; order: number }> = {
      'Modèle Défibrillateur': { label: 'DÉFIBRILLATEURS', order: 1 },
      'Modèle Électrode': { label: 'ÉLECTRODES', order: 2 },
      'Modèle Batterie': { label: 'BATTERIES', order: 3 },
      'Modèle Coffret': { label: 'COFFRETS', order: 4 },
      'Modèle Service': { label: 'SERVICES', order: 5 },
      'Modèle Contrat': { label: 'CONTRATS', order: 6 },
      'Modèle Filtre Purificateur': { label: 'FILTRES PURIFICATEURS', order: 7 },
      'Type Filtre Purificateur': { label: 'TYPES FILTRES', order: 8 },
      'Formation': { label: 'FORMATIONS', order: 9 },
      'Modèle Signalétique': { label: 'SIGNALÉTIQUE', order: 10 },
      'Modèle Scellé': { label: 'SCELLÉS', order: 11 },
      'Modèle Autocollant': { label: 'AUTOCOLLANTS', order: 12 },
      'Modèle Kit de secours': { label: 'KITS DE SECOURS', order: 13 },
      'Modèle Pièce Autre': { label: 'PIÈCES AUTRES', order: 14 },
    };

    const excluded = new Set([
      'Fournisseur',
      'Modèle Raison Prestation',
      'Drapeau GMAO',
      'Drapeau post-intervention',
    ]);

    const available = variables.filter(v => 
      !excluded.has(v.category) &&
      !stocks.some(s => s.denominationPieceId === v.id && s.id !== editingStockId)
    );

    const groupsMap = new Map<string, { label: string; order: number; items: typeof variables }>();

    available.forEach(v => {
      const catConfig = CATEGORY_MAPPING[v.category] || {
        label: (v.category || 'AUTRES').toUpperCase(),
        order: 99,
      };

      if (!groupsMap.has(v.category)) {
        groupsMap.set(v.category, {
          label: catConfig.label,
          order: catConfig.order,
          items: [],
        });
      }
      groupsMap.get(v.category)!.items.push(v);
    });

    return Array.from(groupsMap.values())
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [variables, stocks, editingStockId]);

  const groupedFilterStockVariables = useMemo(() => {
    const CATEGORY_MAPPING: Record<string, { label: string; order: number }> = {
      'Modèle Défibrillateur': { label: 'DÉFIBRILLATEURS', order: 1 },
      'Modèle Électrode': { label: 'ÉLECTRODES', order: 2 },
      'Modèle Batterie': { label: 'BATTERIES', order: 3 },
      'Modèle Coffret': { label: 'COFFRETS', order: 4 },
      'Modèle Service': { label: 'SERVICES', order: 5 },
      'Modèle Contrat': { label: 'CONTRATS', order: 6 },
      'Modèle Filtre Purificateur': { label: 'FILTRES PURIFICATEURS', order: 7 },
      'Type Filtre Purificateur': { label: 'TYPES FILTRES', order: 8 },
      'Formation': { label: 'FORMATIONS', order: 9 },
      'Modèle Signalétique': { label: 'SIGNALÉTIQUE', order: 10 },
      'Modèle Scellé': { label: 'SCELLÉS', order: 11 },
      'Modèle Autocollant': { label: 'AUTOCOLLANTS', order: 12 },
      'Modèle Kit de secours': { label: 'KITS DE SECOURS', order: 13 },
      'Modèle Pièce Autre': { label: 'PIÈCES AUTRES', order: 14 },
    };

    const excluded = new Set([
      'Fournisseur',
      'Modèle Raison Prestation',
      'Drapeau GMAO',
      'Drapeau post-intervention',
    ]);

    const available = variables.filter(v => !excluded.has(v.category));
    const groupsMap = new Map<string, { label: string; order: number; items: typeof variables }>();

    available.forEach(v => {
      const catConfig = CATEGORY_MAPPING[v.category] || {
        label: (v.category || 'AUTRES').toUpperCase(),
        order: 99,
      };

      if (!groupsMap.has(v.category)) {
        groupsMap.set(v.category, {
          label: catConfig.label,
          order: catConfig.order,
          items: [],
        });
      }
      groupsMap.get(v.category)!.items.push(v);
    });

    return Array.from(groupsMap.values())
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [variables]);
  
  const [newLivDate, setNewLivDate] = useState<string>('');
  const [newReapDate, setNewReapDate] = useState<string>('');
  const [newValAchat, setNewValAchat] = useState<string>('');
  const [newMarge, setNewMarge] = useState<string>('');
  const [newPrixHt, setNewPrixHt] = useState<string>('');
  const [newStorage, setNewStorage] = useState<string>('');
  const [newCommentaire, setNewCommentaire] = useState<string>('');
  const [newUsageRecommandeIds, setNewUsageRecommandeIds] = useState<string[]>([]);
  const [isSidePanePieceOpen, setIsSidePanePieceOpen] = useState(false);

  // Additional Propriétés fields
  const [newPoidsNet, setNewPoidsNet] = useState<string>('');
  const [newDimensionLongueur, setNewDimensionLongueur] = useState<string>('');
  const [newDimensionLargeur, setNewDimensionLargeur] = useState<string>('');
  const [newDimensionHauteur, setNewDimensionHauteur] = useState<string>('');
  const [newFraisFixeCoutStockage, setNewFraisFixeCoutStockage] = useState<string>('');
  const [newFraisFixeCoutTransport, setNewFraisFixeCoutTransport] = useState<string>('');
  const [newGarantieMois, setNewGarantieMois] = useState<string>('');
  const [newNombreColisParUnite, setNewNombreColisParUnite] = useState<string>('');

  // Fournisseurs section fields (1 to 3)
  const [newFournisseur1, setNewFournisseur1] = useState<string>('');
  const [isFournisseur1Autre, setIsFournisseur1Autre] = useState<boolean>(false);
  const [newReferenceFournisseur1, setNewReferenceFournisseur1] = useState<string>('');
  const [newPrixAchatFournisseur1, setNewPrixAchatFournisseur1] = useState<string>('');

  const [newFournisseur2, setNewFournisseur2] = useState<string>('');
  const [isFournisseur2Autre, setIsFournisseur2Autre] = useState<boolean>(false);
  const [newReferenceFournisseur2, setNewReferenceFournisseur2] = useState<string>('');
  const [newPrixAchatFournisseur2, setNewPrixAchatFournisseur2] = useState<string>('');

  const [newFournisseur3, setNewFournisseur3] = useState<string>('');
  const [isFournisseur3Autre, setIsFournisseur3Autre] = useState<boolean>(false);
  const [newReferenceFournisseur3, setNewReferenceFournisseur3] = useState<string>('');
  const [newPrixAchatFournisseur3, setNewPrixAchatFournisseur3] = useState<string>('');

  const supplierVariables = useMemo(() => {
    return variables.filter(v => v.category === 'Fournisseur');
  }, [variables]);

  const populateStockExtraFields = (st?: StockRecord) => {
    setNewPoidsNet(st?.poidsNet ?? '');
    setNewDimensionLongueur(st?.dimensionLongueur ?? '');
    setNewDimensionLargeur(st?.dimensionLargeur ?? '');
    setNewDimensionHauteur(st?.dimensionHauteur ?? '');
    setNewFraisFixeCoutStockage(st?.fraisFixeCoutStockage ?? '');
    setNewFraisFixeCoutTransport(st?.fraisFixeCoutTransport ?? '');
    setNewGarantieMois(st?.garantieMois ?? '');
    setNewNombreColisParUnite(st?.nombreColisParUnite ?? '');

    const resolveSup = (raw?: string) => {
      const val = (raw ?? '').trim();
      if (!val) return { val: '', isAutre: false };
      const matched = supplierVariables.find(
        v => v.id === val || (v.nom && v.nom.trim().toLowerCase() === val.toLowerCase())
      );
      if (matched) return { val: matched.nom, isAutre: false };
      return { val, isAutre: true };
    };

    const s1 = resolveSup(st?.fournisseur1);
    setNewFournisseur1(s1.val);
    setIsFournisseur1Autre(s1.isAutre);
    setNewReferenceFournisseur1(st?.referenceFournisseur1 ?? '');
    setNewPrixAchatFournisseur1(st?.prixAchatFournisseur1 ?? '');

    const s2 = resolveSup(st?.fournisseur2);
    setNewFournisseur2(s2.val);
    setIsFournisseur2Autre(s2.isAutre);
    setNewReferenceFournisseur2(st?.referenceFournisseur2 ?? '');
    setNewPrixAchatFournisseur2(st?.prixAchatFournisseur2 ?? '');

    const s3 = resolveSup(st?.fournisseur3);
    setNewFournisseur3(s3.val);
    setIsFournisseur3Autre(s3.isAutre);
    setNewReferenceFournisseur3(st?.referenceFournisseur3 ?? '');
    setNewPrixAchatFournisseur3(st?.prixAchatFournisseur3 ?? '');
  };

  const pieceSidePaneItems: SearchSidePaneItem[] = useMemo(() => {
    const items: SearchSidePaneItem[] = [];
    groupedStockVariables.forEach(group => {
      group.items.forEach(v => {
        items.push({
          id: v.id,
          label: v.nom,
          raw: v,
        });
      });
    });
    return items;
  }, [groupedStockVariables]);

  // Search & Filter State
  const [localStockSearchQuery, setLocalStockSearchQuery] = useState('');
  const stockSearchQuery = externalStockSearchQuery !== undefined ? externalStockSearchQuery : localStockSearchQuery;
  const setStockSearchQuery = externalSetStockSearchQuery !== undefined ? externalSetStockSearchQuery : setLocalStockSearchQuery;
  const [stockStorageFilter, setStockStorageFilter] = useState<'Tous' | 'ReqPrev2M' | 'ReqPrev2to6M'>('Tous');
  const [stockPieceFilter, setStockPieceFilter] = useState<string>('');
  const [stockUgsFilter, setStockUgsFilter] = useState<string>('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeStocksTenantId = typeof window !== 'undefined' ? (localStorage.getItem('defib_tenant_id') || 'demo') : 'demo';
  const recentSearchesStorageKey = `defib_${activeStocksTenantId}_recent_stocks_searches`;
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeStocksTenantId}_recent_stocks_searches`) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((s) => typeof s === 'string' && s.trim().length >= 5)
            .map((s) => s.trim())
            .slice(0, 5);
        }
      }
    } catch (_) {}
    return [];
  });

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(recentSearchesStorageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecentSearches(
            parsed
              .filter((s) => typeof s === 'string' && s.trim().length >= 5)
              .map((s) => s.trim())
              .slice(0, 5)
          );
          return;
        }
      }
    } catch (_) {}
    setRecentSearches([]);
  }, [recentSearchesStorageKey]);

  const saveRecentSearch = React.useCallback(
    (term: string) => {
      const trimmed = (term || '').trim();
      if (trimmed.length < 5) return;
      setRecentSearches((prev) => {
        const filtered = prev.filter(
          (item) => item.trim().length >= 5 && item.toLowerCase() !== trimmed.toLowerCase()
        );
        const updated = [trimmed, ...filtered].slice(0, 5);
        try {
          localStorage.setItem(recentSearchesStorageKey, JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });
    },
    [recentSearchesStorageKey]
  );

  // Save recent search only after 3 seconds without typing (if >= 5 characters)
  useEffect(() => {
    const trimmed = (stockSearchQuery || '').trim();
    if (trimmed.length < 5) return;
    const timer = setTimeout(() => {
      saveRecentSearch(trimmed);
    }, 3000);
    return () => clearTimeout(timer);
  }, [stockSearchQuery, saveRecentSearch]);

  // Valeur (HT) des stocks disponibles
  const totalStockValueHT = useMemo(() => {
    const sum = stocks.reduce((acc, item) => {
      const qty = typeof item.quantite === 'number' ? item.quantite : parseFloat(item.quantite as any) || 0;
      const price = typeof item.valeurAchat === 'number' ? item.valeurAchat : parseFloat(item.valeurAchat as any) || 0;
      return acc + (qty * price);
    }, 0);
    return `${sum.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;
  }, [stocks]);

  // Helper to dynamically calculate prevoiance for any variable id
  const getPrevoianceForVariable = useMemo(() => {
    return (denomId: string, qty: number) => {
      if (!denomId) return { bis2M: 0, bis2to6M: 0, totalToOrder: 0 };

      const today = new Date();
      const twoMonthsFromNow = new Date();
      twoMonthsFromNow.setMonth(today.getMonth() + 2);
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(today.getMonth() + 6);

      let bis2M = 0;
      let bis2to6M = 0;

      defibrillateurs.forEach(df => {
        // 1. Modèle: défibrillateur
        if (df.modeleId === denomId && df.finGarantie) {
          const gDate = new Date(df.finGarantie);
          if (!isNaN(gDate.getTime())) {
            if (gDate <= twoMonthsFromNow) {
              bis2M++;
            } else if (gDate > twoMonthsFromNow && gDate <= sixMonthsFromNow) {
              bis2to6M++;
            }
          }
        }

        // 2. Modèle : Électrode Adulte ou Mixte
        if (df.modeleElectrodeAId === denomId && df.peremptionElectrodeA) {
          const aDate = new Date(df.peremptionElectrodeA);
          if (!isNaN(aDate.getTime())) {
            if (aDate <= twoMonthsFromNow) {
              bis2M++;
            } else if (aDate > twoMonthsFromNow && aDate <= sixMonthsFromNow) {
              bis2to6M++;
            }
          }
        }

        // 3. Modèle : Électrode Secours
        if (df.modeleElectrodeASecoursId === denomId && df.peremptionSecoursElectrodeA) {
          const sDate = new Date(df.peremptionSecoursElectrodeA);
          if (!isNaN(sDate.getTime())) {
            if (sDate <= twoMonthsFromNow) {
              bis2M++;
            } else if (sDate > twoMonthsFromNow && sDate <= sixMonthsFromNow) {
              bis2to6M++;
            }
          }
        }

        // 4. Modèle : Électrode Pédiatrique
        if (df.modeleElectrodePId === denomId && df.peremptionElectrodeP) {
          const pDate = new Date(df.peremptionElectrodeP);
          if (!isNaN(pDate.getTime())) {
            if (pDate <= twoMonthsFromNow) {
              pDate.setHours(0,0,0,0);
              bis2M++;
            } else if (pDate > twoMonthsFromNow && pDate <= sixMonthsFromNow) {
              bis2to6M++;
            }
          }
        }

        // 5. Modèle : Batterie
        if (df.modeleBatterieId === denomId && df.peremptionBatterie) {
          const bDate = new Date(df.peremptionBatterie);
          if (!isNaN(bDate.getTime())) {
            if (bDate <= twoMonthsFromNow) {
              bis2M++;
            } else if (bDate > twoMonthsFromNow && bDate <= sixMonthsFromNow) {
              bis2to6M++;
            }
          }
        }
      });

      const totalToOrder = Math.max(0, (bis2M + bis2to6M) - qty);

      return {
        bis2M,
        bis2to6M,
        totalToOrder
      };
    };
  }, [defibrillateurs]);

  // Dynamic Prévoyance Calculation
  const prevoianceData = useMemo(() => {
    return getPrevoianceForVariable(newDenomStr, Number(newQty));
  }, [newDenomStr, getPrevoianceForVariable, newQty]);

  // Help auto-fill pricing fields
  const handleAchatChange = (valStr: string) => {
    setNewValAchat(valStr);
    const ach = parseFloat(valStr) || 0;
    const pri = parseFloat(newPrixHt) || 0;
    const mar = parseFloat(newMarge) || 0;
    
    if (pri > 0) {
      setNewMarge((pri - ach).toFixed(2));
    } else if (mar > 0) {
      setNewPrixHt((ach + mar).toFixed(2));
    } else {
      setNewPrixHt(valStr);
    }
  };

  const handleMargeChange = (valStr: string) => {
    setNewMarge(valStr);
    const ach = parseFloat(newValAchat) || 0;
    const mar = parseFloat(valStr) || 0;
    setNewPrixHt((ach + mar).toFixed(2));
  };

  const handlePrixChange = (valStr: string) => {
    setNewPrixHt(valStr);
    const ach = parseFloat(newValAchat) || 0;
    const pri = parseFloat(valStr) || 0;
    setNewMarge((pri - ach).toFixed(2));
  };

  const handleAddStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeveloper || isReadOnly) {
      alert("Action non autorisée : Le rôle Développeur est en mode lecture seule.");
      return;
    }
    if (!newDenomStr) return;

    // Check if this variable is already used by another stock record
    const isAlreadyUsed = stocks.some(s => s.denominationPieceId === newDenomStr && s.id !== editingStockId);
    if (isAlreadyUsed) {
      alert("Erreur : La variable sélectionnée est déjà utilisée pour un autre stock. Une variable ne peut être configurée qu'une seule fois dans les stocks.");
      return;
    }

    // Check if the UGS is unique
    const formattedUgs = (newUgs || '').trim();
    if (formattedUgs) {
      const isUgsAlreadyUsed = stocks.some(s => s.ugs && s.ugs.trim().toLowerCase() === formattedUgs.toLowerCase() && s.id !== editingStockId);
      if (isUgsAlreadyUsed) {
        alert(`Erreur : L'UGS "${formattedUgs}" est déjà associé à un autre stock. L'UGS doit être unique.`);
        return;
      }
    }

    const finalLivDate = newLivDate;
    const finalReapDate = newReapDate;
    const finalStorage = newStorage || 'Entrepôt A';

    const sanitizePipe = (val: any) => String(val ?? '').replace(/[|;]/g, ' ').trim();
    const serializedInventaire = traceabilities
      .map((tr) =>
        [
          sanitizePipe(tr.emplacement || 'Centrale des stocks'),
          sanitizePipe(tr.lotOrSerial || ''),
          sanitizePipe(tr.expirationDate || ''),
          sanitizePipe(tr.situation || 'Disponible'),
          sanitizePipe(tr.reservationInfo || ''),
          tr.volume !== undefined && tr.volume !== null && String(tr.volume).trim() !== '' ? String(tr.volume).trim() : '1',
          sanitizePipe(tr.comment || ''),
        ].join('|')
      )
      .join(';')
      .slice(0, 50000);

    if (editingStockId) {
      const updated = stocks.map(st => {
        if (st.id === editingStockId) {
          return {
            ...st,
            denominationPieceId: newDenomStr,
            quantite: Number(newQty),
            quantiteReservee: Number(newQtyReservee),
            quantiteTotale: Number(newQty) + Number(newQtyReservee),
            livraisonDate: finalLivDate,
            reapprovisionnementDate: finalReapDate,
            valeurAchat: Number(newValAchat) || 0,
            marge: Number(newMarge) || 0,
            prixVenteHt: Number(newPrixHt) || 0,
            stockage: finalStorage,
            besoinProjete2Mois: prevoianceData.bis2M,
            besoinProjete2a6Mois: prevoianceData.bis2to6M,
            totalACommander: prevoianceData.totalToOrder,
            commentaire: newCommentaire,
            mouvements: mouvements,
            ugs: newUgs || '0001',
            traceabilityEnabled: traceabilityEnabled,
            traceabilities: traceabilities,
            inventaire: serializedInventaire,
            usageRecommandeIds: newUsageRecommandeIds,
            poidsNet: newPoidsNet,
            dimensionLongueur: newDimensionLongueur,
            dimensionLargeur: newDimensionLargeur,
            dimensionHauteur: newDimensionHauteur,
            fraisFixeCoutStockage: newFraisFixeCoutStockage,
            fraisFixeCoutTransport: newFraisFixeCoutTransport,
            garantieMois: newGarantieMois,
            nombreColisParUnite: newNombreColisParUnite,
            fournisseur1: newFournisseur1,
            referenceFournisseur1: newReferenceFournisseur1,
            prixAchatFournisseur1: newPrixAchatFournisseur1,
            fournisseur2: newFournisseur2,
            referenceFournisseur2: newReferenceFournisseur2,
            prixAchatFournisseur2: newPrixAchatFournisseur2,
            fournisseur3: newFournisseur3,
            referenceFournisseur3: newReferenceFournisseur3,
            prixAchatFournisseur3: newPrixAchatFournisseur3,
          };
        }
        return st;
      });
      saveStocks(updated);
      setEditingStockId(null);
    } else {
      const newItem: StockRecord = {
        id: 'st_' + Date.now(),
        denominationPieceId: newDenomStr,
        quantite: Number(newQty),
        quantiteReservee: Number(newQtyReservee),
        quantiteTotale: Number(newQty) + Number(newQtyReservee),
        livraisonDate: finalLivDate,
        reapprovisionnementDate: finalReapDate,
        valeurAchat: Number(newValAchat) || 0,
        marge: Number(newMarge) || 0,
        prixVenteHt: Number(newPrixHt) || 0,
        stockage: finalStorage,
        besoinProjete2Mois: prevoianceData.bis2M,
        besoinProjete2a6Mois: prevoianceData.bis2to6M,
        totalACommander: prevoianceData.totalToOrder,
        commentaire: newCommentaire,
        mouvements: mouvements,
        ugs: newUgs || '0001',
        traceabilityEnabled: traceabilityEnabled,
        traceabilities: traceabilities,
        inventaire: serializedInventaire,
        usageRecommandeIds: newUsageRecommandeIds,
        poidsNet: newPoidsNet,
        dimensionLongueur: newDimensionLongueur,
        dimensionLargeur: newDimensionLargeur,
        dimensionHauteur: newDimensionHauteur,
        fraisFixeCoutStockage: newFraisFixeCoutStockage,
        fraisFixeCoutTransport: newFraisFixeCoutTransport,
        garantieMois: newGarantieMois,
        nombreColisParUnite: newNombreColisParUnite,
        fournisseur1: newFournisseur1,
        referenceFournisseur1: newReferenceFournisseur1,
        prixAchatFournisseur1: newPrixAchatFournisseur1,
        fournisseur2: newFournisseur2,
        referenceFournisseur2: newReferenceFournisseur2,
        prixAchatFournisseur2: newPrixAchatFournisseur2,
        fournisseur3: newFournisseur3,
        referenceFournisseur3: newReferenceFournisseur3,
        prixAchatFournisseur3: newPrixAchatFournisseur3,
      };
      saveStocks([newItem, ...stocks]);
    }

    if (saveDistributedStocks && mouvements.length > 0) {
      let updatedDs = [...distributedStocks];
      let dsChanged = false;

      mouvements.forEach(mv => {
        if (mv.type === 'Distribution' && mv.emplacement) {
          const targetLoc = mv.emplacement.includes(' : ') ? mv.emplacement.split(' : ')[1] : mv.emplacement;
          if (targetLoc && targetLoc !== 'Centrale des stocks') {
            const existingIndex = updatedDs.findIndex(ds => ds.denominationPieceId === newDenomStr && ds.locationName === targetLoc);
            if (existingIndex < 0) {
              const isTermine = mv.statut === 'Terminé';
              const isEnTransit = mv.statut === 'Préparation' || mv.statut === 'Expédié';
              const volumeNum = Number(mv.volume) || 1;

              const newDs: DistributedStockLocation = {
                id: 'ds_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                denominationPieceId: newDenomStr,
                stockId: editingStockId || undefined,
                locationName: targetLoc as any,
                volumeDisponible: isTermine ? volumeNum : 0,
                volumeReserve: 0,
                volumeEntrant: isEnTransit ? volumeNum : 0
              };
              updatedDs.unshift(newDs);
              dsChanged = true;
            }
          }
        }
      });

      if (dsChanged) {
        saveDistributedStocks(updatedDs);
      }
    }
    
    // Reset
    setNewQty(0);
    setNewQtyReservee(0);
    setNewLivDate('');
    setNewReapDate('');
    setNewValAchat('');
    setNewMarge('');
    setNewPrixHt('');
    setNewStorage('Entrepôt A');
    setNewCommentaire('');
    setNewUsageRecommandeIds([]);
    populateStockExtraFields(undefined);
    setNewUgs('');
    setMouvements([]);
    setTraceabilityEnabled(false);
    setTraceabilities([]);
    setSelectedMovementId('');
    setLotOrSerial('');
    setExpirationDate('');
    setSituation('Disponible');
    setShowTraceabilityForm(false);
    setShowStockForm(false);

    // Reset selection and distribution states
    setSelectedTraceIds([]);
    setDistribEmplacement('');
    setDistribSuiviColis('');
    setDistribStatut('Préparation');
    setDistribDate(new Date().toISOString().split('T')[0]);
  };

  const handleSaveAndRedirectToVariables = () => {
    if (newDenomStr) {
      handleAddStockSubmit({ preventDefault: () => {} } as any);
    } else {
      setShowStockForm(false);
    }
    if (setActiveTab) {
      setActiveTab('variables', true);
    }
  };

  const handleOpenNewForm = () => {
    if (showStockForm) {
      setShowStockForm(false);
      setEditingStockId(null);
    } else {
      setEditingStockId(null);
      setNewDenomStr('');
      setNewQty(0);
      setNewQtyReservee(0);
      setNewLivDate('');
      setNewReapDate('');
      setNewValAchat('');
      setNewMarge('');
      setNewPrixHt('');
      setNewStorage('Entrepôt A');
      setNewCommentaire('');
      setNewUsageRecommandeIds([]);
      populateStockExtraFields(undefined);
      setMouvements([]);
      setTraceabilityEnabled(false);
      setTraceabilities([]);
      setSelectedMovementId('');
      setLotOrSerial('');
      setExpirationDate('');
      setSituation('Disponible');
      setShowTraceabilityForm(false);
      
      // Reset selection and distribution states
      setSelectedTraceIds([]);
      setDistribEmplacement('');
      setDistribSuiviColis('');
      setDistribStatut('Préparation');
      setDistribDate(new Date().toISOString().split('T')[0]);
      
      // Auto-generate UGS
      const numbers = stocks
        .map(s => parseInt(s.ugs || '', 10))
        .filter(n => !isNaN(n));
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      const nextUgsVal = String(max + 1).padStart(4, '0');
      setNewUgs(nextUgsVal);

      setShowStockForm(true);
    }
  };

  // Harmonized styling constants
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

  const tagColors: Record<string, string> = {
    'Entrepôt A': 'bg-amber-100 text-amber-900 border-amber-300',
    'Entrepôt B': 'bg-orange-100 text-orange-950 border-orange-300',
    'Véhicule A': 'bg-teal-100 text-teal-900 border-teal-300',
    'Véhicule B': 'bg-cyan-100 text-cyan-900 border-cyan-300',
    'Véhicule C': 'bg-indigo-100 text-indigo-900 border-indigo-300',
  };

  const filteredStocks = stocks.filter((st) => {
    const vObj = variables.find(
      v => v.id === st.denominationPieceId || (v.nom && st.denominationPieceId && v.nom.trim().toLowerCase() === String(st.denominationPieceId).trim().toLowerCase())
    );
    const modelNom = vObj ? vObj.nom.toLowerCase() : '';
    const modelMarque = vObj ? vObj.marque.toLowerCase() : '';
    const modelCat = vObj ? vObj.category.toLowerCase() : '';
    
    let matchesStorage = false;
    if (stockStorageFilter === 'Tous') {
      matchesStorage = true;
    } else if (stockStorageFilter === 'ReqPrev2M') {
      const prev = getPrevoianceForVariable(st.denominationPieceId, st.quantite);
      const val = st.besoinProjete2Mois !== undefined ? Math.max(st.besoinProjete2Mois, prev.bis2M) : prev.bis2M;
      matchesStorage = val >= 1;
    } else if (stockStorageFilter === 'ReqPrev2to6M') {
      const prev = getPrevoianceForVariable(st.denominationPieceId, st.quantite);
      const val = st.besoinProjete2a6Mois !== undefined ? Math.max(st.besoinProjete2a6Mois, prev.bis2to6M) : prev.bis2to6M;
      matchesStorage = val >= 1;
    }

    const matchesPiece = !stockPieceFilter || st.denominationPieceId === stockPieceFilter || (vObj && vObj.id === stockPieceFilter);
    const ugsFilterTrimmed = stockUgsFilter.trim().toLowerCase();
    const matchesUgs = !ugsFilterTrimmed || (st.ugs || '0001').toLowerCase().includes(ugsFilterTrimmed);
    
    const query = stockSearchQuery.trim().toLowerCase();
    const matchesSearch = !query || 
      modelNom.includes(query) ||
      modelMarque.includes(query) ||
      modelCat.includes(query) ||
      (st.ugs && st.ugs.toLowerCase().includes(query)) ||
      (st.livraisonDate && st.livraisonDate.toLowerCase().includes(query)) ||
      (st.reapprovisionnementDate && st.reapprovisionnementDate.toLowerCase().includes(query));
      
    return matchesStorage && matchesPiece && matchesUgs && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-fadeIn" id="stocks-tab-container-harmonized">
      <style>{`
        #stocks-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-stock-input),
        #stocks-tab-container-harmonized select,
        #stocks-tab-container-harmonized textarea {
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
        #stocks-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-stock-input)::placeholder,
        #stocks-tab-container-harmonized textarea::placeholder {
          color: #becadb !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-stock-input)::-webkit-input-placeholder,
        #stocks-tab-container-harmonized textarea::-webkit-input-placeholder {
          color: #becadb !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-stock-input)::-moz-placeholder,
        #stocks-tab-container-harmonized textarea::-moz-placeholder {
          color: #becadb !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-stock-input),
        #stocks-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-stock-input),
        #stocks-tab-container-harmonized select:hover:not(:disabled),
        #stocks-tab-container-harmonized select:focus:not(:disabled),
        #stocks-tab-container-harmonized textarea:hover:not(:disabled),
        #stocks-tab-container-harmonized textarea:focus:not(:disabled),
        #stocks-tab-container-harmonized #search-stock-input:hover,
        #stocks-tab-container-harmonized #search-stock-input:focus {
          outline: 2.5px solid #2e54ff !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #stocks-tab-container-harmonized select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #stocks-tab-container-harmonized select option {
          color: #000000 !important;
          background: #ffffff !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-tab-container-harmonized input[type="date"]::-webkit-calendar-picker-indicator {
          display: none !important;
          -webkit-appearance: none !important;
          background: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        #stocks-tab-container-harmonized label,
        #stocks-tab-container-harmonized .stocks-label-style {
          letter-spacing: normal !important;
          text-transform: none !important;
          font-size: 16px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #stocks-tab-container-harmonized input:disabled,
        #stocks-tab-container-harmonized select:disabled {
          background: #fff !important;
          background-color: #fff !important;
          border: 1px solid #dce1ea !important;
          color: #555555 !important;
          cursor: not-allowed !important;
          opacity: 1 !important;
        }
        #stocks-tab-container-harmonized #stocks-record-table,
        #stocks-tab-container-harmonized #stocks-record-table thead,
        #stocks-tab-container-harmonized #stocks-record-table tbody,
        #stocks-tab-container-harmonized #stocks-record-table tr,
        #stocks-tab-container-harmonized #stocks-record-table th,
        #stocks-tab-container-harmonized #stocks-record-table td {
          border: 0px solid transparent !important;
          border-top: 0px solid transparent !important;
          border-bottom: 0px solid transparent !important;
          border-left: 0px solid transparent !important;
          border-right: 0px solid transparent !important;
        }
        #stocks-tab-container-harmonized #stocks-record-table thead th {
          background-color: #ffffff !important;
          color: rgb(80 97 122) !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          letter-spacing: normal !important;
          text-transform: none !important;
        }
        #stocks-tab-container-harmonized #stocks-record-table tbody tr:hover {
          background-color: #f5f7fa !important;
        }
      `}</style>
      
      {!showStockForm ? (
        <>
          {/* Header Section */}
          <div 
            className="bg-white space-y-4"
            style={{ borderRadius: '0px', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-4 flex-wrap bg-white">
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
                    id="stocks-more-options-dropdown"
                    aria-label={t("Plus")}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'open-filters') {
                        setIsFilterSidePaneOpen(true);
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
                    <option value="spreadsheet-editor" disabled={!resolvedSpreadsheetUrl}>
                      {t("Ouvrir l’éditeur SpreadSheets")}
                    </option>
                  </select>
                </div>

                {/* Activité Pill Button */}
                <button
                  type="button"
                  id="btn-activity-notifications-stocks"
                  onClick={() => {
                    setClickedPill('activity-stocks');
                    setTimeout(() => setClickedPill((prev) => (prev === 'activity-stocks' ? null : prev)), 480);
                    setIsNotifDrawerOpen(true);
                  }}
                  className={`relative overflow-hidden hover:opacity-80 transition-all select-none cursor-pointer ${clickedPill === 'activity-stocks' ? 'sidebar-nav-click-shrink-wave' : ''}`}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '1000px',
                    padding: '8px 16px',
                    fontSize: '18px',
                    fontWeight: 100,
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    backgroundColor: 'rgb(255, 217, 239)',
                    color: 'rgb(142, 25, 92)',
                    border: 'none',
                    boxShadow: 'none',
                    transition: 'all 0.15s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                  title={t("Activité")}
                >
                  <span>{t("Activité")}</span>
                </button>

                {/* Actualiser les données Pill Button */}
                <button
                  type="button"
                  id="btn-refresh-data-stocks"
                  onClick={() => {
                    setClickedPill('refresh-stocks');
                    setTimeout(() => setClickedPill((prev) => (prev === 'refresh-stocks' ? null : prev)), 480);
                    handleRefreshStocks();
                  }}
                  disabled={isRefreshing}
                  className={`relative overflow-hidden hover:opacity-80 transition-all select-none cursor-pointer ${clickedPill === 'refresh-stocks' ? 'sidebar-nav-click-shrink-wave' : ''}`}
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
                    ref={searchInputRef}
                    type="text"
                    id="search-stock-input"
                    name="defib_quick_search_stocks_no_autofill"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-form-type="other"
                    value={stockSearchQuery}
                    onChange={(e) => setStockSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (stockSearchQuery.trim()) {
                          saveRecentSearch(stockSearchQuery);
                        }
                        setIsSearchFocused(false);
                        searchInputRef.current?.blur();
                      } else if (e.key === 'Escape') {
                        setIsSearchFocused(false);
                        searchInputRef.current?.blur();
                      }
                    }}
                    placeholder={t("Recherche rapide")}
                    className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                    style={searchInputStyle}
                    onMouseEnter={() => setIsSearchHovered(true)}
                    onMouseLeave={() => setIsSearchHovered(false)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                  />
                  {isSearchFocused && (
                    <div
                      id="search-stock-recent-dropdown"
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
                              setStockSearchQuery(item);
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

                {(() => {
                  const hasStocksSpreadsheet = Boolean(resolvedSpreadsheetUrl);
                  return (
                    <button
                      type="button"
                      disabled={!hasStocksSpreadsheet}
                      onClick={() => {
                        if (!hasStocksSpreadsheet) return;
                        handleOpenNewForm();
                      }}
                      style={{
                        ...customButtonStyle,
                        backgroundColor: 'rgb(46, 84, 255)',
                        boxShadow: 'none',
                        opacity: !hasStocksSpreadsheet ? 0.45 : 1,
                        cursor: !hasStocksSpreadsheet ? 'not-allowed' : 'pointer',
                      }}
                      className="font-sans"
                      title={!hasStocksSpreadsheet ? "Veuillez renseigner l'URL du Spreadsheet Stocks dans les paramètres du tenant." : undefined}
                    >
                      Nouveau
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Indicateur Valeur (HT) des stocks disponibles */}
          <div 
            id="stocks-available-value-indicator"
            className="px-4 pt-4 flex flex-wrap items-center justify-start select-none"
          >
            <div 
              style={{
                borderRadius: '1000px',
                padding: '8px 16px',
                fontSize: '18px',
                fontWeight: 100,
                cursor: 'default',
                fontFamily: 'DefibeoMain, Civilprom, sans-serif',
                backgroundColor: 'rgb(247, 252, 192)',
                color: 'rgb(105, 114, 5)',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <span style={{ marginRight: '6px' }}>
                {t("Valeur (HT) des stocks disponibles :")}
              </span>
              <span>
                {totalStockValueHT}
              </span>
            </div>
          </div>

          {/* Stock Table List */}
          <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans border-collapse text-xs" id="stocks-record-table" style={{ border: '0px solid transparent', borderTop: '0px solid transparent', borderBottom: '0px solid transparent' }}>
                <thead>
                  <tr className="bg-white" style={{ borderTop: '0px solid transparent', borderBottom: '0px solid transparent' }}>
                    <th className="px-4 py-3.5 w-14 text-left whitespace-nowrap" style={thStyle}>Miniature.</th>
                    <th className="px-4 py-3.5" style={thStyle}>UGS</th>
                    <th className="px-4 py-3.5" style={thStyle}>Pièce ou service.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Inv. traça. actif.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Qté disponible.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Qté réservée.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Besoin 2 mois.</th>
                    <th className="px-4 py-3.5 text-center" style={thStyle}>Besoin 2 à 6 mois.</th>
                    <th className="px-4 py-3.5 text-right" style={thStyle}>Tarif fournisseur.</th>
                    <th className="px-4 py-3.5 text-right" style={thStyle}>Tarif de vente HT.</th>
                    <th className="px-4 py-3.5 text-right w-24" style={thStyle}>Actions.</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 text-xs">
                  {filteredStocks.length === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
                      </td>
                    </tr>
                  ) : (
                    filteredStocks.map((st) => {
                      const vObj = variables.find(
                        v => v.id === st.denominationPieceId || (v.nom && st.denominationPieceId && v.nom.trim().toLowerCase() === String(st.denominationPieceId).trim().toLowerCase())
                      );
                      const rawName = vObj ? vObj.nom : (st.denominationPieceId || 'Modèle inconnu');
                      const resolvedDenomId = vObj ? vObj.id : st.denominationPieceId;
                      const resolvedUsageIds = (st.usageRecommandeIds ?? []).map(uid => {
                        const vm = variables.find(
                          v => v.id === uid || (v.nom && uid && v.nom.trim().toLowerCase() === String(uid).trim().toLowerCase())
                        );
                        return vm ? vm.id : uid;
                      });
                      
                      const prev = getPrevoianceForVariable(resolvedDenomId, st.quantite);
                      const besoin2M = st.besoinProjete2Mois !== undefined ? Math.max(st.besoinProjete2Mois, prev.bis2M) : prev.bis2M;
                      const besoin2to6M = st.besoinProjete2a6Mois !== undefined ? Math.max(st.besoinProjete2a6Mois, prev.bis2to6M) : prev.bis2to6M;

                      return (
                        <tr
                          key={st.id}
                          className="group hover:bg-[#f5f7fa] transition-all cursor-pointer"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, a, input, select, option')) return;
                            setEditingStockId(st.id);
                            setNewDenomStr(resolvedDenomId);
                            setNewQty(st.quantite);
                            setNewQtyReservee(st.quantiteReservee ?? 0);
                            setNewLivDate(st.livraisonDate || '');
                            setNewReapDate(st.reapprovisionnementDate || '');
                            setNewValAchat((st.valeurAchat ?? 0).toString());
                            setNewMarge((st.marge ?? 0).toString());
                            setNewPrixHt((st.prixVenteHt ?? 0).toString());
                            setNewStorage(st.stockage);
                            setNewCommentaire(st.commentaire || '');
                            setNewUsageRecommandeIds(resolvedUsageIds);
                            populateStockExtraFields(st);
                            setMouvements(st.mouvements || []);
                            setNewUgs(st.ugs || '');
                            setTraceabilityEnabled(st.traceabilityEnabled ?? false);
                            setTraceabilities(st.traceabilities ?? []);
                            setShowStockForm(true);

                            // Reset selection and distribution states
                            setSelectedTraceIds([]);
                            setDistribEmplacement('');
                            setDistribSuiviColis('');
                            setDistribStatut('Préparation');
                            setDistribDate(new Date().toISOString().split('T')[0]);
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
                          <td className="px-4 py-5 whitespace-nowrap font-sans uppercase tracking-wide" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif', fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {st.ugs || '0001'}
                          </td>
                          <td className="px-4 py-5 whitespace-nowrap font-sans" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif', fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            <span className="font-semibold text-slate-950">{rawName}</span>
                          </td>
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
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
                              }}
                            >
                              {st.traceabilityEnabled ? 'Oui' : 'Non'}
                            </span>
                          </td>
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {st.quantite}
                          </td>
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {st.quantiteReservee ?? 0}
                          </td>
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {besoin2M}
                          </td>
                          <td className="px-4 py-5 text-center whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {besoin2to6M}
                          </td>
                          <td className="px-4 py-5 text-right whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {(st.valeurAchat ?? 0).toFixed(2)} €
                          </td>
                          <td className="px-4 py-5 text-right whitespace-nowrap" style={{ fontSize: '16px', fontWeight: 100, color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {(st.prixVenteHt ?? 0).toFixed(2)} €
                          </td>
                          <td className="px-4 py-5 text-right whitespace-nowrap bg-transparent" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex gap-2 bg-transparent">
                              <button
                                type="button"
                                onClick={() => {
                                  onNavigateToDistributedStocks?.(st.ugs || '');
                                }}
                                style={rowActionButtonStyle}
                                className="cursor-pointer font-sans"
                              >
                                Distribution
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStockId(st.id);
                                  setNewDenomStr(st.denominationPieceId);
                                  setNewQty(st.quantite);
                                  setNewQtyReservee(st.quantiteReservee ?? 0);
                                  setNewLivDate(st.livraisonDate || '');
                                  setNewReapDate(st.reapprovisionnementDate || '');
                                  setNewValAchat((st.valeurAchat ?? 0).toString());
                                  setNewMarge((st.marge ?? 0).toString());
                                  setNewPrixHt((st.prixVenteHt ?? 0).toString());
                                  setNewStorage(st.stockage);
                                  setNewCommentaire(st.commentaire || '');
                                  setNewUsageRecommandeIds(st.usageRecommandeIds ?? []);
                                  populateStockExtraFields(st);
                                  setMouvements(st.mouvements || []);
                                  setNewUgs(st.ugs || '');
                                  setTraceabilityEnabled(st.traceabilityEnabled ?? false);
                                  setTraceabilities(st.traceabilities ?? []);
                                  setShowStockForm(true);

                                  // Reset selection and distribution states
                                  setSelectedTraceIds([]);
                                  setDistribEmplacement('');
                                  setDistribSuiviColis('');
                                  setDistribStatut('Préparation');
                                  setDistribDate(new Date().toISOString().split('T')[0]);
                                }}
                                style={rowActionButtonStyle}
                                className="cursor-pointer font-sans"
                              >
                                Modifier
                              </button>
                              {(() => {
                                const distEntries = (distributedStocks || []).filter(ds => 
                                  ds.stockId === st.id || 
                                  ds.denominationPieceId === st.denominationPieceId || 
                                  (ds.ugs && st.ugs && ds.ugs === st.ugs)
                                );
                                const totalDistQty = distEntries.reduce((acc, ds) => acc + (ds.volumeDisponible || 0) + (ds.volumeReserve || 0) + (ds.volumeEntrant || 0), 0);
                                const hasTraceabilities = (st.traceabilities || []).length > 0;

                                const isDeleteDisabled = (st.quantite || 0) > 0 || 
                                                         (st.quantiteReservee || 0) > 0 || 
                                                         distEntries.length > 0 || 
                                                         totalDistQty > 0 || 
                                                         hasTraceabilities;

                                let deleteTitle = "Supprimer";
                                if (isDeleteDisabled) {
                                  if (distEntries.length > 0 || totalDistQty > 0) {
                                    deleteTitle = "Impossible de supprimer : du stock distribué existe pour cet équipement";
                                  } else if (hasTraceabilities) {
                                    deleteTitle = "Impossible de supprimer : des éléments de traçabilité sont présents";
                                  } else {
                                    deleteTitle = "Impossible de supprimer : le stock en centrale n'est pas nul";
                                  }
                                }

                                return (
                                  <button
                                    type="button"
                                    disabled={isDeleteDisabled}
                                    onClick={() => {
                                      if (isDeleteDisabled) return;
                                      const itemStockName = variables.find(v => v.id === st.denominationPieceId)?.nom || st.denominationPieceId || st.ugs || 'Équipement';
                                      const activeTenant = localStorage.getItem('defib_tenant_id') || 'demo';
                                      logDeleteStockCenter(activeTenant, itemStockName).catch(() => {});
                                      saveStocks(stocks.filter(s => s.id !== st.id));
                                      if (saveDistributedStocks && distEntries.length > 0) {
                                        const remainingDistributed = (distributedStocks || []).filter(ds => 
                                          ds.stockId !== st.id && 
                                          ds.denominationPieceId !== st.denominationPieceId && 
                                          (!ds.ugs || !st.ugs || ds.ugs !== st.ugs)
                                        );
                                        saveDistributedStocks(remainingDistributed);
                                      }
                                    }}
                                    style={{
                                      ...rowActionButtonStyle,
                                      opacity: isDeleteDisabled ? 0.35 : 1,
                                      cursor: isDeleteDisabled ? 'not-allowed' : 'pointer'
                                    }}
                                    className="font-sans"
                                    title={deleteTitle}
                                  >
                                    Supprimer
                                  </button>
                                );
                              })()}
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
        /* New Stock Item Form / Overlay Mode */
        <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="stocks-form-overlay">
          
          {/* Header Box styled exactly like DefibTab Form Header */}
          <div 
            className="flex items-center bg-white"
            style={{ borderRadius: '0px', width: '98%', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
            id="stocks-form-header-box"
          >
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setShowStockForm(false);
                  setEditingStockId(null);
                }}
                id="btn-close-stock-modal"
                style={{
                  ...rowActionButton18Style,
                  borderRadius: '13px',
                  flex: 1,
                  width: '50%',
                }}
                className="flex-1 transition-colors cursor-pointer"
              >
                <span>Annuler</span>
              </button>

              <button
                type="submit"
                form="equipement-stock-form"
                id="btn-submit-stock-form"
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
                <span>Enregistrer</span>
              </button>
            </div>
          </div>

          {/* Elegant height spacing block to separate header box and form perfectly */}
          <div style={{ height: '16px' }} className="bg-transparent" />

          <form 
            id="equipement-stock-form"
            onSubmit={handleAddStockSubmit} 
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 font-sans">
              
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

              {/* Lookup Dénomination variable - 3/4 Width on Row */}
              <div className="flex flex-col gap-1 md:col-span-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Pièce ou service *</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsSidePanePieceOpen(true)}
                      className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                      style={{ textDecoration: 'none' }}
                    >
                      Rechercher
                    </button>
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
                </div>
                <select
                  value={newDenomStr}
                  onChange={(e) => setNewDenomStr(e.target.value)}
                  className="focus:outline-none w-full cursor-pointer font-sans"
                  required
                >
                  <option value="" disabled>Sélectionnez une pièce ou service.</option>
                  {groupedStockVariables.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.identifiant ? `[${v.identifiant}] ` : ''}{v.nom}{v.marque && v.marque !== 'Standard' ? ` (${v.marque})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* UGS Reference Code - 1/4 Width on Row */}
              <div className="flex flex-col gap-1 md:col-span-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">UGS *</label>
                <input
                  type="text"
                  value={newUgs}
                  onChange={(e) => setNewUgs(e.target.value)}
                  placeholder="Ex: 0001"
                  className="focus:outline-none w-full font-sans"
                  required
                />
              </div>

              {/* Quantities Row */}
              <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Quantité disponible.</label>
                  <input
                    type="number"
                    min="0"
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value))}
                    className="focus:outline-none w-full font-sans"
                    required
                    placeholder="0"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Quantité réservée.</label>
                  <input
                    type="number"
                    min="0"
                    value={newQtyReservee}
                    onChange={(e) => setNewQtyReservee(Number(e.target.value))}
                    className="focus:outline-none w-full font-sans"
                    required
                    placeholder="0"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Quantité totale.</label>
                  <input
                    type="number"
                    value={Number(newQty) + Number(newQtyReservee)}
                    disabled
                    readOnly
                    className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Pricing section - 3 elegant columns spanning full row width */}
              <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-5 pt-5">
                {/* Valeur Achat */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Tarif fournisseur. (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newValAchat}
                    onChange={(e) => handleAchatChange(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    required
                    placeholder="0.00"
                  />
                </div>

                {/* Marge */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Marge. (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newMarge}
                    onChange={(e) => handleMargeChange(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    required
                    placeholder="0.00"
                  />
                </div>

                {/* Prix de vente HT */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Tarif de vente. (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPrixHt}
                    onChange={(e) => handlePrixChange(e.target.value)}
                    className="focus:outline-none w-full font-sans text-black"
                    required
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Section Taux de Marge */}
              <div className="md:col-span-4 mt-2 flex flex-col gap-1">
                <div 
                  style={{
                    color: 'rgb(80 97 122)',
                    backgroundColor: 'rgb(233 237 241)',
                    border: 'none',
                    fontSize: '16px'
                  }}
                  className="p-4 rounded-xl mb-4 font-sans font-semibold flex items-center gap-2.5"
                >
                  <span 
                    className="w-3.5 h-3.5 rounded-full inline-block shrink-0" 
                    style={{ 
                      backgroundColor: (() => {
                        const achat = parseFloat(newValAchat) || 0;
                        const marge = parseFloat(newMarge) || 0;
                        const taux = achat > 0 ? (marge / achat) * 100 : 0;
                        if (taux >= 30) return '#10b981'; // vert
                        if (taux >= 15) return '#f97316'; // orange
                        return '#ef4444'; // rouge
                      })()
                    }}
                  />
                  <span>
                    Votre taux de marge est de <strong className="font-extrabold">{(() => {
                      const achat = parseFloat(newValAchat) || 0;
                      const marge = parseFloat(newMarge) || 0;
                      const taux = achat > 0 ? (marge / achat) * 100 : 0;
                      return taux.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                    })()}%</strong>.
                  </span>
                </div>
              </div>

              {/* Additional Propriétés Fields (2 columns grid) */}
              <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    Poids Net (Kilogramme).
                  </label>
                  <input
                    type="text"
                    value={newPoidsNet}
                    onChange={(e) => setNewPoidsNet(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    placeholder="0"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    Dimension Longueur.
                  </label>
                  <input
                    type="text"
                    value={newDimensionLongueur}
                    onChange={(e) => setNewDimensionLongueur(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    placeholder="0"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    Dimension Largeur.
                  </label>
                  <input
                    type="text"
                    value={newDimensionLargeur}
                    onChange={(e) => setNewDimensionLargeur(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    placeholder="0"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    Dimension Hauteur.
                  </label>
                  <input
                    type="text"
                    value={newDimensionHauteur}
                    onChange={(e) => setNewDimensionHauteur(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    placeholder="0"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    Frais Fixe Coût Stockage. (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newFraisFixeCoutStockage}
                    onChange={(e) => setNewFraisFixeCoutStockage(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    placeholder="0.00"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    Frais Fixe Coût Transport. (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newFraisFixeCoutTransport}
                    onChange={(e) => setNewFraisFixeCoutTransport(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    placeholder="0.00"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    Garantie (Mois).
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newGarantieMois}
                    onChange={(e) => setNewGarantieMois(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    placeholder="0"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    Nombre Colis par Unité.
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newNombreColisParUnite}
                    onChange={(e) => setNewNombreColisParUnite(e.target.value)}
                    className="focus:outline-none w-full font-sans"
                    placeholder="1"
                  />
                </div>
              </div>

              {/* Section Fournisseurs */}
              <div className="md:col-span-4 pt-5 mt-2 flex flex-col gap-1">
                <div className="flex mb-2 select-none">
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
                    Fournisseurs
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Fournisseur 1 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Fournisseur. 1
                    </label>
                    <select
                      value={isFournisseur1Autre ? '__AUTRE__' : newFournisseur1}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__AUTRE__') {
                          setIsFournisseur1Autre(true);
                          if (supplierVariables.some(v => v.nom === newFournisseur1)) {
                            setNewFournisseur1('');
                          }
                        } else {
                          setIsFournisseur1Autre(false);
                          setNewFournisseur1(val);
                        }
                      }}
                      className="focus:outline-none w-full cursor-pointer font-sans"
                    >
                      <option value="">Sélectionnez un fournisseur.</option>
                      {supplierVariables.map(sup => (
                        <option key={sup.id} value={sup.nom}>
                          {sup.nom}
                        </option>
                      ))}
                      <option value="__AUTRE__">Autres</option>
                    </select>
                    {isFournisseur1Autre && (
                      <input
                        type="text"
                        value={newFournisseur1}
                        onChange={(e) => setNewFournisseur1(e.target.value)}
                        placeholder="Saisissez le fournisseur..."
                        className="focus:outline-none w-full font-sans mt-1"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Référence Fournisseur. 1
                    </label>
                    <input
                      type="text"
                      value={newReferenceFournisseur1}
                      onChange={(e) => setNewReferenceFournisseur1(e.target.value)}
                      className="focus:outline-none w-full font-sans"
                      placeholder=""
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Prix Achat fournisseur. 1 (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newPrixAchatFournisseur1}
                      onChange={(e) => setNewPrixAchatFournisseur1(e.target.value)}
                      className="focus:outline-none w-full font-sans"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Fournisseur 2 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Fournisseur. 2
                    </label>
                    <select
                      value={isFournisseur2Autre ? '__AUTRE__' : newFournisseur2}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__AUTRE__') {
                          setIsFournisseur2Autre(true);
                          if (supplierVariables.some(v => v.nom === newFournisseur2)) {
                            setNewFournisseur2('');
                          }
                        } else {
                          setIsFournisseur2Autre(false);
                          setNewFournisseur2(val);
                        }
                      }}
                      className="focus:outline-none w-full cursor-pointer font-sans"
                    >
                      <option value="">Sélectionnez un fournisseur.</option>
                      {supplierVariables.map(sup => (
                        <option key={sup.id} value={sup.nom}>
                          {sup.nom}
                        </option>
                      ))}
                      <option value="__AUTRE__">Autres</option>
                    </select>
                    {isFournisseur2Autre && (
                      <input
                        type="text"
                        value={newFournisseur2}
                        onChange={(e) => setNewFournisseur2(e.target.value)}
                        placeholder="Saisissez le fournisseur..."
                        className="focus:outline-none w-full font-sans mt-1"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Référence Fournisseur. 2
                    </label>
                    <input
                      type="text"
                      value={newReferenceFournisseur2}
                      onChange={(e) => setNewReferenceFournisseur2(e.target.value)}
                      className="focus:outline-none w-full font-sans"
                      placeholder=""
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Prix Achat fournisseur. 2 (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newPrixAchatFournisseur2}
                      onChange={(e) => setNewPrixAchatFournisseur2(e.target.value)}
                      className="focus:outline-none w-full font-sans"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Fournisseur 3 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Fournisseur. 3
                    </label>
                    <select
                      value={isFournisseur3Autre ? '__AUTRE__' : newFournisseur3}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__AUTRE__') {
                          setIsFournisseur3Autre(true);
                          if (supplierVariables.some(v => v.nom === newFournisseur3)) {
                            setNewFournisseur3('');
                          }
                        } else {
                          setIsFournisseur3Autre(false);
                          setNewFournisseur3(val);
                        }
                      }}
                      className="focus:outline-none w-full cursor-pointer font-sans"
                    >
                      <option value="">Sélectionnez un fournisseur.</option>
                      {supplierVariables.map(sup => (
                        <option key={sup.id} value={sup.nom}>
                          {sup.nom}
                        </option>
                      ))}
                      <option value="__AUTRE__">Autres</option>
                    </select>
                    {isFournisseur3Autre && (
                      <input
                        type="text"
                        value={newFournisseur3}
                        onChange={(e) => setNewFournisseur3(e.target.value)}
                        placeholder="Saisissez le fournisseur..."
                        className="focus:outline-none w-full font-sans mt-1"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Référence Fournisseur. 3
                    </label>
                    <input
                      type="text"
                      value={newReferenceFournisseur3}
                      onChange={(e) => setNewReferenceFournisseur3(e.target.value)}
                      className="focus:outline-none w-full font-sans"
                      placeholder=""
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      Prix Achat fournisseur. 3 (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newPrixAchatFournisseur3}
                      onChange={(e) => setNewPrixAchatFournisseur3(e.target.value)}
                      className="focus:outline-none w-full font-sans"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Section Prévoyance. */}
              <div className="md:col-span-4 pt-5 mt-2 flex flex-col gap-1">
                <div className="flex mb-2 select-none">
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
                    Prévoyance
                  </span>
                </div>

                {/* Field Usage recommandé. */}
                <div className="flex flex-col gap-1 mb-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                      {t("Usage recommandé.")}
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
                  <div className="flex flex-wrap gap-2 mb-1">
                    {newUsageRecommandeIds.map(id => {
                      const vObj = variables.find(v => v.id === id);
                      if (!vObj) return null;
                      const formattedName = vObj.marque && vObj.marque !== 'Standard'
                        ? `${vObj.marque} ${vObj.nom}`
                        : vObj.nom;
                      return (
                        <span
                          key={id}
                          onClick={() => {
                            setNewUsageRecommandeIds(prev => prev.filter(x => x !== id));
                          }}
                          className="inline-flex items-center px-3 py-1 bg-[#1710a6] text-white border border-[#1710a6] rounded-full text-[16px] font-medium font-sans cursor-pointer hover:bg-[#8e1010] hover:border-[#8e1010] hover:text-white transition-colors"
                          title="Cliquez pour supprimer"
                        >
                          <span>{formattedName}</span>
                        </span>
                      );
                    })}
                  </div>
                  <select
                    value=""
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (selectedId && !newUsageRecommandeIds.includes(selectedId)) {
                        setNewUsageRecommandeIds(prev => [...prev, selectedId]);
                      }
                    }}
                    className="focus:outline-none w-full cursor-pointer font-sans p-2 border border-slate-200 rounded text-slate-700 text-sm"
                  >
                    <option value="" disabled>{t("Choisir le matériel adéquat.")}</option>
                    {variables
                      .filter(v => v.category === 'Modèle Défibrillateur' && !newUsageRecommandeIds.includes(v.id))
                      .map(v => {
                        const label = v.marque && v.marque !== 'Standard'
                          ? `${v.marque} - ${v.nom}`
                          : v.nom;
                        return (
                          <option key={v.id} value={v.id}>
                            {label}
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div 
                  style={{
                    color: 'rgb(80 97 122)',
                    backgroundColor: 'rgb(233 237 241)',
                    border: 'none',
                    fontSize: '16px'
                  }}
                  className="p-4 rounded-xl mb-4 font-sans font-semibold"
                >
                  Nous estimons votre besoin de trésorerie à <strong className="font-extrabold">{((Number(newValAchat) || 0) * (prevoianceData.totalToOrder || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</strong>€{t(", pour l'achat des stocks requis aux actions de maintenances.")}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Besoin projeté à 2 mois.</label>
                    <input
                      type="number"
                      value={prevoianceData.bis2M}
                      disabled
                      readOnly
                      placeholder="0"
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Besoin projeté entre 2 à 6 mois.</label>
                    <input
                      type="number"
                      value={prevoianceData.bis2to6M}
                      disabled
                      readOnly
                      placeholder="0"
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Total à commander.</label>
                    <input
                      type="number"
                      value={prevoianceData.totalToOrder}
                      disabled
                      readOnly
                      placeholder="0"
                      className="focus:outline-none w-full font-sans cursor-not-allowed bg-slate-100 text-slate-700 p-2 border border-slate-200 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Section Inventaire de traçabilité */}
              <div className="md:col-span-4 pt-5 mt-2 flex flex-col gap-4">
                <div className="flex justify-between items-center mb-1 select-none">
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
                  <div className="flex gap-2 items-center">
                    <button
                      type="submit"
                      form="equipement-stock-form"
                      style={{
                        backgroundColor: '#2e54ff',
                        color: '#ffffff',
                        padding: '10px 20px',
                        fontSize: '18px',
                        borderRadius: '13px',
                        boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, #2e54ff 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                      }}
                      className="font-sans font-bold active:scale-95 transition-all cursor-pointer border-0 text-white"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>

                {/* Commentaire. */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">Commentaire.</label>
                  <input
                    type="text"
                    value={newCommentaire}
                    onChange={(e) => setNewCommentaire(e.target.value)}
                    placeholder="Entrez votre commentaire..."
                    className="focus:outline-none w-full font-sans p-2 border border-slate-200 rounded text-xs bg-white text-slate-700"
                  />
                </div>

                {/* Activer la traçabilité des pièces. */}
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                    {t("Activer la traçabilité des pièces.")}
                  </span>
                  <div className="flex gap-4 mt-1 bg-transparent">
                    <button
                      type="button"
                      onClick={() => setTraceabilityEnabled(true)}
                      className="flex items-center gap-2 font-sans font-bold cursor-pointer select-none border-0 bg-transparent text-black"
                      style={{ fontSize: '18px' }}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all bg-white ${traceabilityEnabled === true ? 'border-[#2e54ff]' : 'border-slate-300'}`}
                        style={{ borderWidth: '1px' }}
                      >
                        {traceabilityEnabled === true && <span className="w-2.5 h-2.5 rounded-full bg-[#2e54ff]" />}
                      </span>
                      Oui
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (traceabilities.length > 0) {
                          alert("Impossible de désactiver la traçabilité car des pièces de traçabilité existent déjà dans le tableau.");
                          return;
                        }
                        setTraceabilityEnabled(false);
                      }}
                      disabled={traceabilities.length > 0}
                      className={`flex items-center gap-2 font-sans font-bold select-none border-0 bg-transparent text-black ${traceabilities.length > 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      style={{ fontSize: '18px' }}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all bg-white ${traceabilityEnabled === false ? 'border-[#2e54ff]' : 'border-slate-300'}`}
                        style={{ borderWidth: '1px' }}
                      >
                        {traceabilityEnabled === false && <span className="w-2.5 h-2.5 rounded-full bg-[#2e54ff]" />}
                      </span>
                      Non
                    </button>
                  </div>
                </div>

                {/* 7-column sub-field rows when Activer la traçabilité des pièces. = Oui */}
                {traceabilityEnabled && (() => {
                  const ALL_LOCATIONS = [
                    'Centrale des stocks',
                    'Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E',
                    'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J',
                    'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E',
                    'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J'
                  ];

                  const sanitizePipe = (val: any) => String(val ?? '').replace(/[|;]/g, ' ').trim();
                  const serializedPlaintext = traceabilities
                    .map((tr) =>
                      [
                        sanitizePipe(tr.emplacement || 'Centrale des stocks'),
                        sanitizePipe(tr.lotOrSerial || ''),
                        sanitizePipe(tr.expirationDate || ''),
                        sanitizePipe(tr.situation || 'Disponible'),
                        sanitizePipe(tr.reservationInfo || ''),
                        tr.volume !== undefined && tr.volume !== null && String(tr.volume).trim() !== '' ? String(tr.volume).trim() : '1',
                        sanitizePipe(tr.comment || ''),
                      ].join('|')
                    )
                    .join(';');
                  const totalTraceabilityChars = serializedPlaintext.length;
                  const isMaxCharsReached = totalTraceabilityChars >= 50000;

                  const handleAddNewTraceabilityRow = () => {
                    if (isMaxCharsReached) return;
                    const newItem: StockTraceability = {
                      id: `TR-${newUgs || '0001'}-${Date.now()}-${traceabilities.length + 1}`,
                      movementId: 'Autre',
                      emplacement: 'Centrale des stocks',
                      lotOrSerial: '',
                      expirationDate: '',
                      situation: 'Disponible',
                      reservationInfo: '',
                      volume: 1,
                      comment: '',
                    };
                    setTraceabilities([...traceabilities, newItem]);
                  };

                  return (
                    <div className="flex flex-col gap-4 mt-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <button
                          type="button"
                          id="btn-nouvelle-piece-tracabilite"
                          disabled={isMaxCharsReached}
                          onClick={handleAddNewTraceabilityRow}
                          style={{
                            backgroundColor: isMaxCharsReached ? '#94a3b8' : '#0f172a',
                            color: '#ffffff',
                            padding: '10px 20px',
                            fontSize: '18px',
                            borderRadius: '13px',
                            cursor: isMaxCharsReached ? 'not-allowed' : 'pointer',
                            opacity: isMaxCharsReached ? 0.6 : 1,
                          }}
                          className="font-sans font-bold active:scale-95 transition-all border-0 text-white"
                          title={isMaxCharsReached ? "Limite de 50 000 caractères atteinte pour la cellule Google Spreadsheets." : undefined}
                        >
                          Nouvelle pièce
                        </button>
                      </div>

                      {traceabilities.length > 0 && (
                        <div className="flex flex-col gap-3">
                          {traceabilities.map((trace, idx) => (
                            <div
                              key={trace.id || idx}
                              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3 p-4 rounded-xl bg-white border"
                              style={{ borderColor: '#dce1ea' }}
                            >
                              {/* 1. Emplacement. */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                                  Emplacement.
                                </label>
                                <select
                                  value={trace.emplacement || 'Centrale des stocks'}
                                  onChange={(e) => {
                                    const updated = [...traceabilities];
                                    updated[idx] = { ...updated[idx], emplacement: e.target.value };
                                    setTraceabilities(updated);
                                  }}
                                  className="w-full bg-white text-black p-2 border border-slate-300 rounded font-sans text-xs"
                                >
                                  {ALL_LOCATIONS.map((loc) => {
                                    if (loc === 'Centrale des stocks') {
                                      return (
                                        <option key={loc} value={loc}>
                                          Centrale des stocks
                                        </option>
                                      );
                                    }
                                    const assignedTech = members.find(
                                      (m) => m.role === 'Technicien' && m.locationLink === loc
                                    );
                                    const customName = getLocationCustomName(loc);
                                    const label = assignedTech
                                      ? `${assignedTech.name} — ${customName}`
                                      : customName;
                                    return (
                                      <option key={loc} value={loc}>
                                        {label}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              {/* 2. Numéro de lot ou série. (+ Code-barres & bouton Imprimer à côté) */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                                  Numéro de lot ou série.
                                </label>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <input
                                    type="text"
                                    value={trace.lotOrSerial || ''}
                                    onChange={(e) => {
                                      const updated = [...traceabilities];
                                      updated[idx] = { ...updated[idx], lotOrSerial: e.target.value };
                                      setTraceabilities(updated);
                                    }}
                                    placeholder="Lot / Série"
                                    className="flex-1 min-w-[120px] bg-white text-black p-2 border border-slate-300 rounded font-sans text-xs"
                                  />
                                  <div
                                    className="inline-block bg-transparent shrink-0"
                                    dangerouslySetInnerHTML={{
                                      __html: generateBarcodeSVGString(trace.lotOrSerial || ''),
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => downloadBarcodeSVG(trace.lotOrSerial || '')}
                                    style={{
                                      backgroundColor: '#0f172a',
                                      color: '#ffffff',
                                      padding: '8px 14px',
                                      fontSize: '16px',
                                      borderRadius: '10px',
                                    }}
                                    className="font-sans font-bold active:scale-95 transition-all cursor-pointer border-0 shrink-0"
                                    title="Imprimer / Télécharger"
                                  >
                                    Imprimer
                                  </button>
                                </div>
                              </div>

                              {/* 3. Date de péremption. */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                                  Date de péremption.
                                </label>
                                <input
                                  type="date"
                                  value={trace.expirationDate || ''}
                                  onChange={(e) => {
                                    const updated = [...traceabilities];
                                    updated[idx] = {
                                      ...updated[idx],
                                      expirationDate: e.target.value || '',
                                    };
                                    setTraceabilities(updated);
                                  }}
                                  className="w-full bg-white text-black p-2 border border-slate-300 rounded font-sans text-xs"
                                />
                              </div>

                              {/* 4. Situation. */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                                  Situation.
                                </label>
                                <select
                                  value={
                                    trace.situation === 'Signalé manquant'
                                      ? 'Signalé Manquant'
                                      : trace.situation || 'Disponible'
                                  }
                                  onChange={(e) => {
                                    const updated = [...traceabilities];
                                    updated[idx] = {
                                      ...updated[idx],
                                      situation: e.target.value as any,
                                    };
                                    setTraceabilities(updated);
                                  }}
                                  className="w-full bg-white text-black p-2 border border-slate-300 rounded font-sans text-xs"
                                >
                                  <option value="Disponible">Disponible</option>
                                  <option value="Utilisé">Utilisé</option>
                                  <option value="Indisponible">Indisponible</option>
                                  <option value="Signalé Manquant">Signalé Manquant</option>
                                  <option value="Prêté">Prêté</option>
                                </select>
                              </div>

                              {/* 5. Infos réservation. */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                                  Infos réservation.
                                </label>
                                <input
                                  type="text"
                                  value={trace.reservationInfo ?? ''}
                                  onChange={(e) => {
                                    const updated = [...traceabilities];
                                    updated[idx] = {
                                      ...updated[idx],
                                      reservationInfo: e.target.value,
                                    };
                                    setTraceabilities(updated);
                                  }}
                                  placeholder="Infos réservation..."
                                  className="w-full bg-white text-black p-2 border border-slate-300 rounded font-sans text-xs"
                                />
                              </div>

                              {/* 6. Volume. */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                                  Volume.
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={trace.volume ?? 1}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 1 : Number(e.target.value);
                                    const updated = [...traceabilities];
                                    updated[idx] = {
                                      ...updated[idx],
                                      volume: isNaN(val) ? 1 : val,
                                    };
                                    setTraceabilities(updated);
                                  }}
                                  className="w-full bg-white text-black p-2 border border-slate-300 rounded font-sans text-xs"
                                />
                              </div>

                              {/* 7. Commentaire. + Supprimer */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider stocks-label-style">
                                  Commentaire.
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={trace.comment || ''}
                                    onChange={(e) => {
                                      const updated = [...traceabilities];
                                      updated[idx] = {
                                        ...updated[idx],
                                        comment: e.target.value,
                                      };
                                      setTraceabilities(updated);
                                    }}
                                    placeholder="Commentaire..."
                                    className="flex-1 min-w-0 bg-white text-black p-2 border border-slate-300 rounded font-sans text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTraceabilities(traceabilities.filter((_, i) => i !== idx));
                                    }}
                                    style={{
                                      backgroundColor: '#0f172a',
                                      color: '#ffffff',
                                      padding: '8px 14px',
                                      fontSize: '16px',
                                      borderRadius: '10px',
                                    }}
                                    className="font-sans font-bold active:scale-95 transition-all cursor-pointer border-0 shrink-0"
                                  >
                                    Supprimer
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Side-bar popup for logistics notifications */}
      {isNotifDrawerOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"
          style={{ top: 0, left: 0, right: 0, bottom: 0, height: '100vh', width: '100vw' }}
          onClick={() => setIsNotifDrawerOpen(false)}
        >
          <div 
            className="relative w-full max-w-xl bg-white flex flex-col overflow-hidden animate-slideLeft h-full"
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
              borderLeft: '1px solid #e2e8f0',
            }}
          >
            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 pb-28 bg-slate-50/50">
              {logisticsNotifications.map((alert) => (
                <div 
                  key={alert.id} 
                  className="p-4 rounded-xl bg-white space-y-3 font-sans"
                  style={{
                    border: '1px solid #a6a6a6',
                    boxShadow: 'none',
                  }}
                >
                  <div>
                    <span 
                      className="inline-block px-3 py-1 rounded-full text-white font-medium text-sm"
                      style={{ backgroundColor: '#7C2882', color: '#ffffff' }}
                    >
                      {alert.horodatage}
                    </span>
                  </div>
                  <div className="text-[16px] text-[#000] font-normal">
                    UGS : <span className="font-semibold text-[#000]">{alert.ugs}</span>
                  </div>
                  <div className="text-[16px] text-[#000] font-normal leading-relaxed">
                    Description : {alert.description}
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="block text-[16px] font-medium text-[#000]">Commentaire</label>
                    <textarea
                      value={alert.commentaire || ''}
                      onChange={(e) => {
                        if (saveLogisticsNotifications) {
                          const updated = logisticsNotifications.map(n => n.id === alert.id ? { ...n, commentaire: e.target.value } : n);
                          saveLogisticsNotifications(updated);
                        }
                      }}
                      placeholder="Entrez un commentaire."
                      className="w-full p-2.5 text-[16px] text-[#000] border border-slate-300 rounded-lg bg-slate-50/50 resize-y min-h-[60px] focus:outline-none focus:ring-0 focus:border-slate-300"
                    />
                  </div>

                  <div className="pt-2 flex gap-2.5 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        if (saveLogisticsNotifications) {
                          const updated = logisticsNotifications.filter(n => n.id !== alert.id);
                          saveLogisticsNotifications(updated);
                        }
                      }}
                      style={{
                        width: '50%',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        borderRadius: '10px',
                        padding: '10px 0',
                        fontSize: '18px',
                        fontWeight: '600',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      className="hover:bg-blue-700 transition-colors flex-1"
                    >
                      Terminer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotifDrawerOpen(false);
                        if (onNavigateToDistributedStocks) {
                          onNavigateToDistributedStocks(alert.ugs);
                        }
                      }}
                      style={{
                        width: '50%',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        borderRadius: '10px',
                        padding: '10px 0',
                        fontSize: '18px',
                        fontWeight: '600',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      className="hover:bg-neutral-800 transition-colors flex-1"
                    >
                      Consulter
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Floating Bottom Fermer Button (hors de div) */}
            <div className="absolute bottom-5 left-5 right-5 z-20">
              <button
                onClick={() => setIsNotifDrawerOpen(false)}
                style={{
                  width: '100%',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: '600',
                  padding: '13px 20px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  border: 'none',
                  boxShadow: 'none',
                }}
                className="hover:bg-neutral-800 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side Pane Search for Pièce ou service */}
      <SearchSidePane
        isOpen={isSidePanePieceOpen}
        onClose={() => setIsSidePanePieceOpen(false)}
        paneId="stocks-piece-search-side-pane"
        items={pieceSidePaneItems}
        selectedId={newDenomStr}
        onSelect={(item) => setNewDenomStr(item.id)}
        searchPlaceholder="Entrez votre recherche"
        searchFilter={(item, q) => {
          const l = (item.label || '').toLowerCase();
          const s = (item.subtitle || '').toLowerCase();
          const b = (item.badge || '').toLowerCase();
          const v = item.raw;
          const nom = (v?.nom || '').toLowerCase();
          const ident = (v?.identifiant || '').toLowerCase();
          const ref = (v?.reference || '').toLowerCase();
          const marque = (v?.marque || '').toLowerCase();
          return l.includes(q) || s.includes(q) || b.includes(q) || nom.includes(q) || ident.includes(q) || ref.includes(q) || marque.includes(q);
        }}
      />

      {/* Side Pane Filters for Centrale des Stocks */}
      {isFilterSidePaneOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99990] flex justify-end"
          id="stocks-filter-side-pane-container"
        >
          {/* Backdrop */}
          <div
            onClick={() => setIsFilterSidePaneOpen(false)}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs"
          />

          {/* Side Pane */}
          <div
            className="relative w-full sm:w-[460px] shadow-2xl flex flex-col transform transition-transform duration-200 ease-in-out z-10"
            id="stocks-filter-side-pane"
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
            <div className="flex-1 overflow-y-auto p-6 pt-8 space-y-6" style={{ color: '#50617A', fontSize: '18px' }}>
              <div className="flex flex-wrap gap-2.5 items-center" id="stocks-storage-pills">
                {[
                  { value: 'Tous', label: 'Tous' },
                  { value: 'ReqPrev2M', label: 'Besoin à 2 mois' },
                  { value: 'ReqPrev2to6M', label: 'Besoin 2 à 6 mois' }
                ].map((opt) => {
                  let count = 0;
                  if (opt.value === 'Tous') {
                    count = stocks.length;
                  } else if (opt.value === 'ReqPrev2M') {
                    count = stocks.filter(s => {
                      const prev = getPrevoianceForVariable(s.denominationPieceId, s.quantite);
                      const val = s.besoinProjete2Mois !== undefined ? Math.max(s.besoinProjete2Mois, prev.bis2M) : prev.bis2M;
                      return val >= 1;
                    }).length;
                  } else if (opt.value === 'ReqPrev2to6M') {
                    count = stocks.filter(s => {
                      const prev = getPrevoianceForVariable(s.denominationPieceId, s.quantite);
                      const val = s.besoinProjete2a6Mois !== undefined ? Math.max(s.besoinProjete2a6Mois, prev.bis2to6M) : prev.bis2to6M;
                      return val >= 1;
                    }).length;
                  }

                  const isSelected = stockStorageFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setClickedPill(`filter-${opt.value}`);
                        setTimeout(() => setClickedPill((prev) => (prev === `filter-${opt.value}` ? null : prev)), 480);
                        setStockStorageFilter(opt.value as any);
                        if (opt.value === 'Tous') {
                          setStockPieceFilter('');
                          setStockUgsFilter('');
                        }
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
                      className={`relative overflow-hidden transition-all select-none cursor-pointer ${clickedPill === `filter-${opt.value}` ? 'sidebar-nav-click-shrink-wave' : ''}`}
                    >
                      {t(opt.label)} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Filtre Pièce ou service. */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="stocks-filter-piece-select"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#50617A',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                >
                  {t("Pièce ou service.")}
                </label>
                <select
                  id="stocks-filter-piece-select"
                  value={stockPieceFilter}
                  onChange={(e) => setStockPieceFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #dedede',
                    borderRadius: '13px',
                    fontSize: '18px',
                    fontWeight: 100,
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">{t("Tous")}</option>
                  {groupedFilterStockVariables.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.identifiant ? `[${v.identifiant}] ` : ''}{v.nom}{v.marque && v.marque !== 'Standard' ? ` (${v.marque})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Filtre UGS. */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="stocks-filter-ugs-input"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#50617A',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                >
                  {t("UGS.")}
                </label>
                <input
                  id="stocks-filter-ugs-input"
                  type="text"
                  value={stockUgsFilter}
                  onChange={(e) => setStockUgsFilter(e.target.value)}
                  placeholder="Ex: 0001"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #dedede',
                    borderRadius: '13px',
                    fontSize: '18px',
                    fontWeight: 100,
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                    outline: 'none',
                  }}
                />
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
