import React, { useState, useMemo, useEffect } from 'react';
import { Defibrillateur, Client, Variable } from '../types';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronDown } from 'lucide-react';
import { REGIONS_BY_COUNTRY } from '../utils/regions';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  defibrillateurs?: any[];
  items?: any[];
  otherEquipments?: any[];
  clients: Client[];
  variables?: Variable[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  fsmTours?: any[];
  executeNouvelleTournee?: () => void;
  executeAddToTrier?: () => void;
  executeAddTournee?: (targetTourId: string) => void;
  isAnySelectedInTour?: boolean;
}

interface ViewTarget {
  center: [number, number];
  zoom: number;
  id: number;
  bounds?: [[number, number], [number, number]];
}

// Sub-component to programmatically handle centering and zooming the Leaflet map ONLY when viewTarget changes
function ChangeMapView({ viewTarget }: { viewTarget: ViewTarget | null }) {
  const map = useMap();
  const lastHandledId = React.useRef<number>(0);

  useEffect(() => {
    if (viewTarget && viewTarget.id !== lastHandledId.current) {
      lastHandledId.current = viewTarget.id;
      if (viewTarget.bounds) {
        map.fitBounds(viewTarget.bounds, { padding: [60, 60], maxZoom: 11, animate: true });
      } else {
        map.setView(viewTarget.center, viewTarget.zoom, { animate: true });
      }
    }
  }, [viewTarget, map]);

  return null;
}

// Predefined region coordinates and bounds for France
const REGION_CENTERS: Record<string, { center: [number, number]; zoom: number; bounds?: [[number, number], [number, number]] }> = {
  'Auvergne-Rhône-Alpes': { center: [45.5, 4.8], zoom: 8, bounds: [[44.1, 2.0], [46.8, 7.2]] },
  'Bourgogne-Franche-Comté': { center: [47.2, 4.8], zoom: 8, bounds: [[46.1, 2.8], [48.4, 7.1]] },
  'Bretagne': { center: [48.2, -2.8], zoom: 8, bounds: [[47.2, -4.8], [48.9, -1.0]] },
  'Centre-Val de Loire': { center: [47.5, 1.7], zoom: 8, bounds: [[46.3, 0.0], [48.9, 3.2]] },
  'Corse': { center: [42.1, 9.1], zoom: 9, bounds: [[41.3, 8.5], [43.1, 9.6]] },
  'Grand Est': { center: [48.7, 5.5], zoom: 8, bounds: [[47.4, 3.3], [50.2, 8.3]] },
  'Hauts-de-France': { center: [50.1, 2.8], zoom: 8, bounds: [[48.8, 1.3], [51.1, 4.3]] },
  'Île-de-France': { center: [48.7, 2.5], zoom: 9, bounds: [[48.1, 1.4], [49.2, 3.6]] },
  'Normandie': { center: [49.1, 0.2], zoom: 8, bounds: [[48.3, -1.9], [50.1, 1.8]] },
  'Nouvelle-Aquitaine': { center: [45.3, 0.2], zoom: 7, bounds: [[42.7, -1.8], [47.2, 2.6]] },
  'Occitanie': { center: [43.6, 2.2], zoom: 8, bounds: [[42.3, -0.3], [45.0, 4.9]] },
  'Pays de la Loire': { center: [47.5, -0.8], zoom: 8, bounds: [[46.2, -2.6], [48.6, 0.9]] },
  'Provence-Alpes-Côte d\'Azur': { center: [43.9, 6.0], zoom: 8, bounds: [[42.9, 4.2], [45.3, 7.8]] },
  'Guadeloupe': { center: [16.25, -61.55], zoom: 10, bounds: [[15.8, -61.8], [16.6, -61.0]] },
  'Martinique': { center: [14.65, -61.0], zoom: 10, bounds: [[14.3, -61.3], [14.9, -60.8]] },
  'Guyane': { center: [3.9, -53.1], zoom: 7, bounds: [[2.1, -54.6], [5.8, -51.6]] },
  'La Réunion': { center: [-21.1, 55.5], zoom: 10, bounds: [[-21.4, 55.2], [-20.8, 55.9]] },
  'Mayotte': { center: [-12.8, 45.1], zoom: 11, bounds: [[-13.0, 45.0], [-12.6, 45.3]] },
};

// Department to French region lookup table
const DEPT_TO_REGION: Record<string, string> = {
  '01': 'Auvergne-Rhône-Alpes', '03': 'Auvergne-Rhône-Alpes', '07': 'Auvergne-Rhône-Alpes', '15': 'Auvergne-Rhône-Alpes', '26': 'Auvergne-Rhône-Alpes', '38': 'Auvergne-Rhône-Alpes', '42': 'Auvergne-Rhône-Alpes', '43': 'Auvergne-Rhône-Alpes', '63': 'Auvergne-Rhône-Alpes', '69': 'Auvergne-Rhône-Alpes', '73': 'Auvergne-Rhône-Alpes', '74': 'Auvergne-Rhône-Alpes',
  '21': 'Bourgogne-Franche-Comté', '25': 'Bourgogne-Franche-Comté', '39': 'Bourgogne-Franche-Comté', '58': 'Bourgogne-Franche-Comté', '70': 'Bourgogne-Franche-Comté', '71': 'Bourgogne-Franche-Comté', '89': 'Bourgogne-Franche-Comté', '90': 'Bourgogne-Franche-Comté',
  '22': 'Bretagne', '29': 'Bretagne', '35': 'Bretagne', '56': 'Bretagne',
  '18': 'Centre-Val de Loire', '28': 'Centre-Val de Loire', '36': 'Centre-Val de Loire', '37': 'Centre-Val de Loire', '41': 'Centre-Val de Loire', '45': 'Centre-Val de Loire',
  '2A': 'Corse', '2B': 'Corse',
  '08': 'Grand Est', '10': 'Grand Est', '51': 'Grand Est', '52': 'Grand Est', '54': 'Grand Est', '55': 'Grand Est', '57': 'Grand Est', '67': 'Grand Est', '68': 'Grand Est', '88': 'Grand Est',
  '02': 'Hauts-de-France', '59': 'Hauts-de-France', '60': 'Hauts-de-France', '62': 'Hauts-de-France', '80': 'Hauts-de-France',
  '75': 'Île-de-France', '77': 'Île-de-France', '78': 'Île-de-France', '91': 'Île-de-France', '92': 'Île-de-France', '93': 'Île-de-France', '94': 'Île-de-France', '95': 'Île-de-France',
  '14': 'Normandie', '27': 'Normandie', '50': 'Normandie', '61': 'Normandie', '76': 'Normandie',
  '16': 'Nouvelle-Aquitaine', '17': 'Nouvelle-Aquitaine', '19': 'Nouvelle-Aquitaine', '23': 'Nouvelle-Aquitaine', '24': 'Nouvelle-Aquitaine', '33': 'Nouvelle-Aquitaine', '40': 'Nouvelle-Aquitaine', '47': 'Nouvelle-Aquitaine', '64': 'Nouvelle-Aquitaine', '79': 'Nouvelle-Aquitaine', '86': 'Nouvelle-Aquitaine', '87': 'Nouvelle-Aquitaine',
  '09': 'Occitanie', '11': 'Occitanie', '12': 'Occitanie', '30': 'Occitanie', '31': 'Occitanie', '32': 'Occitanie', '34': 'Occitanie', '46': 'Occitanie', '48': 'Occitanie', '65': 'Occitanie', '81': 'Occitanie', '82': 'Occitanie',
  '44': 'Pays de la Loire', '49': 'Pays de la Loire', '53': 'Pays de la Loire', '72': 'Pays de la Loire', '85': 'Pays de la Loire',
  '04': 'Provence-Alpes-Côte d\'Azur', '05': 'Provence-Alpes-Côte d\'Azur', '06': 'Provence-Alpes-Côte d\'Azur', '13': 'Provence-Alpes-Côte d\'Azur', '83': 'Provence-Alpes-Côte d\'Azur', '84': 'Provence-Alpes-Côte d\'Azur',
  '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'La Réunion', '976': 'Mayotte'
};

// Check if a mission is active (not cancelled, done, or deleted)
function isMissionActive(mission: any, tour: any): boolean {
  if (!mission) return false;
  const mStatus = String(mission.status || mission.missionStatus || mission.situation || '').trim().toLowerCase();
  const tStatus = String(tour?.status || '').trim().toLowerCase();

  // If tour is inactive
  if (['annulée', 'annulee', 'annulé', 'annule', 'terminée', 'terminee', 'terminé', 'termine', 'supprimée', 'supprimee', 'supprimé', 'supprime', 'fait'].includes(tStatus)) {
    return false;
  }
  // If mission is inactive
  if (['annulée', 'annulee', 'annulé', 'annule', 'fait', 'effectué', 'effectue', 'terminée', 'terminee', 'terminé', 'termine', 'validé', 'valide', 'supprimé', 'supprime'].includes(mStatus)) {
    return false;
  }

  return true;
}

// Check if item is included in any planned/active mission in fsmTours
function hasPlannedMission(item: any, fsmTours: any[]): boolean {
  if (!item || !fsmTours || fsmTours.length === 0) return false;
  const itemIdent = (item.identifiant || '').trim().toLowerCase();
  const itemId = (item.id || '').trim();

  return fsmTours.some(tour => {
    const missions = tour.missions || tour.passages || [];
    return missions.some((m: any) => {
      const mIdent = String(m.defibIdentifiant || m.identifiant || '').trim().toLowerCase();
      const mEquipId = String(m.equipmentId || m.defibId || m.id || '').trim();

      const isMatch = (itemIdent && mIdent && itemIdent === mIdent) ||
                      (itemId && (mEquipId === itemId || m.equipmentId === itemId || m.defibId === itemId));

      if (!isMatch) return false;
      return isMissionActive(m, tour);
    });
  });
}

// Helper to determine the region of an item
function getItemRegion(item: any, clientMap: Map<string, Client>): string {
  if (item.region && item.region.trim()) {
    return item.region.trim();
  }
  const client = item.clientId ? clientMap.get(item.clientId) : null;
  if (client?.region && client.region.trim()) {
    return client.region.trim();
  }
  const cp = (item.cp || item.codePostal || client?.codePostal || '').trim();
  if (cp.length >= 2) {
    const dept = cp.startsWith('97') ? cp.substring(0, 3) : cp.substring(0, 2);
    if (DEPT_TO_REGION[dept]) {
      return DEPT_TO_REGION[dept];
    }
  }
  return '';
}

// Helper functions for date parsing to match getSafetyStatus from DefibTab
function parseDateHelper(dStr: string | undefined | null): Date | null {
  if (!dStr) return null;
  const parts = dStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }
  const fallback = Date.parse(dStr);
  if (!isNaN(fallback)) {
    return new Date(fallback);
  }
  return null;
}

function computeProchaineMaintenance(derniereM: string | undefined | null): string {
  if (!derniereM) return '';
  const parsed = parseDateHelper(derniereM);
  if (!parsed) return '';
  const next = new Date(parsed);
  next.setFullYear(next.getFullYear() + 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSafetyStatusColor(item: any): string {
  const datesToCheck: Date[] = [];
  
  // 1. Prochaine maintenance or Derniere maintenance
  if (item.prochaineMaintenance) {
    const pmDate = parseDateHelper(item.prochaineMaintenance);
    if (pmDate) datesToCheck.push(pmDate);
  } else if (item.derniereMaintenance) {
    const prochaineMaintStr = computeProchaineMaintenance(item.derniereMaintenance);
    const mDate = parseDateHelper(prochaineMaintStr);
    if (mDate) datesToCheck.push(mDate);
  }

  // 2. Péremption Électrode A
  if (item.peremptionElectrodeA) {
    const eADate = parseDateHelper(item.peremptionElectrodeA);
    if (eADate) datesToCheck.push(eADate);
  }

  // 3. Péremption Électrode P
  if (item.peremptionElectrodeP) {
    const ePDate = parseDateHelper(item.peremptionElectrodeP);
    if (ePDate) datesToCheck.push(ePDate);
  }

  // 4. Péremption Batterie / Expiration garantie
  if (item.peremptionBatterie) {
    const bDate = parseDateHelper(item.peremptionBatterie);
    if (bDate) datesToCheck.push(bDate);
  } else if (item.expirationGarantie) {
    const gDate = parseDateHelper(item.expirationGarantie);
    if (gDate) datesToCheck.push(gDate);
  }

  if (datesToCheck.length === 0) {
    return '#94a3b8'; // gray
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const hasExpired = datesToCheck.some(d => {
    const checkDate = new Date(d);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < today;
  });
  if (hasExpired) {
    return '#ef4444'; // red
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
    return '#f97316'; // orange
  }

  const hasUnder6Months = datesToCheck.some(d => {
    const dDiff = getDaysDiff(d);
    return dDiff >= 90 && dDiff <= 180;
  });
  if (hasUnder6Months) {
    return '#3b82f6'; // blue
  }

  return '#22c55e'; // green
}

// Custom Leaflet marker generator (round position point; when selected, shows stylized radio check with centered pink dot)
const createCustomIcon = (colorHex: string, activeFocused: boolean, isChecked: boolean) => {
  const scaleStyle = activeFocused 
    ? `transform: scale(1.3);` 
    : ``;

  if (isChecked) {
    return L.divIcon({
      html: `
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background-color: #ffffff;
          border: 2.5px solid #fe4eba;
          box-shadow: 0 2px 6px rgba(254, 78, 186, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          ${scaleStyle}
          transition: all 0.2s ease-in-out;
          cursor: pointer;
        ">
          <div style="width: 9px; height: 9px; border-radius: 50%; background-color: #fe4eba;"></div>
        </div>
      `,
      className: 'custom-leaflet-icon',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -10]
    });
  }

  return L.divIcon({
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background-color: ${colorHex};
        border: 2px solid #ffffff;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
        ${scaleStyle}
        transition: all 0.2s ease-in-out;
        cursor: pointer;
      "></div>
    `,
    className: 'custom-leaflet-icon',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10]
  });
};

// Global cache for custom icons to prevent recreating L.divIcon thousands of times
const iconCache = new Map<string, L.DivIcon>();

const getCustomIcon = (colorHex: string, activeFocused: boolean, isChecked: boolean) => {
  const key = `${colorHex}_${activeFocused ? '1' : '0'}_${isChecked ? '1' : '0'}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = createCustomIcon(colorHex, activeFocused, isChecked);
    iconCache.set(key, icon);
  }
  return icon;
};

// Memoized Marker component for fast map updates with thousands of points
const DefibMarker = React.memo(function DefibMarker({
  item,
  coords,
  isFocused,
  isChecked,
  statusColor,
  clientDenomination,
  onSelect,
  onToggleSelect
}: {
  item: any;
  coords: [number, number];
  isFocused: boolean;
  isChecked: boolean;
  statusColor: string;
  clientDenomination: string;
  onSelect: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}) {
  const icon = getCustomIcon(statusColor, isFocused, isChecked);

  return (
    <Marker
      position={coords}
      icon={icon}
      eventHandlers={{
        click: (e) => {
          onSelect(item.id);
          onToggleSelect?.(item.id);
          e.target.openPopup();
        },
        mouseover: (e) => {
          e.target.openPopup();
        }
      }}
    >
      <Popup closeButton={false}>
        <PopupContent item={item} coords={coords} clientDenomination={clientDenomination} />
      </Popup>
    </Marker>
  );
});

// Popup Content component using map trigger actions
function PopupContent({ 
  item, 
  coords,
  clientDenomination
}: { 
  item: any; 
  coords: [number, number];
  clientDenomination: string;
}) {
  const map = useMap();
  const identifiant = item.identifiant || 'Équipement';
  const numVoie = item.numVoie || item.numeroVoie || '';
  const ville = item.ville || '';
  const cp = item.cp || item.codePostal || '';
  const categorie = item.categorie || item.typeMat || item.type || '';

  return (
    <div className="font-sans text-left" style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif", fontSize: '18px', color: '#000000', padding: '0px', lineHeight: '1.4', cursor: 'default', userSelect: 'none' }}>
      <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '2px', color: '#000000', fontFamily: "'DefibeoMain', 'Civilprom', sans-serif", cursor: 'default' }}>
        {identifiant}
      </div>

      {categorie && (
        <div style={{ marginTop: '2px', marginBottom: '6px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '1000px',
              backgroundColor: '#ffffff',
              border: '1px solid rgb(231, 231, 231)',
              color: '#000000',
              fontSize: '14px',
              fontWeight: 100,
              padding: '2px 10px',
              lineHeight: '1.2',
              whiteSpace: 'nowrap'
            }}
          >
            <span 
              style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: '#fe4eba', 
                marginRight: '6px',
                display: 'inline-block',
                flexShrink: 0
              }} 
            />
            {categorie}
          </span>
        </div>
      )}

      <div style={{ fontWeight: 'normal', fontSize: '18px', color: '#000000', marginBottom: '2px', fontFamily: "'DefibeoMain', 'Civilprom', sans-serif", cursor: 'default' }}>
        {clientDenomination}
      </div>
      <div style={{ fontWeight: 'normal', fontSize: '18px', color: '#000000', marginBottom: '6px', fontFamily: "'DefibeoMain', 'Civilprom', sans-serif", cursor: 'default' }}>
        {numVoie ? `${numVoie}, ` : ''}{ville} {cp ? `(${cp})` : ''}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          map.flyTo(coords, 14, { animate: true, duration: 0.6 });
        }}
        style={{
          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
          fontSize: '16px',
          color: 'rgb(53, 86, 236)',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: '4px 0 0 0',
          cursor: 'pointer',
          textDecoration: 'none',
          display: 'block'
        }}
      >
        Centrer sur la carte
      </button>
    </div>
  );
}

export default function MapModal({
  isOpen,
  onClose,
  defibrillateurs,
  items,
  otherEquipments = [],
  clients,
  variables,
  selectedIds = [],
  onToggleSelect,
  fsmTours = [],
  executeNouvelleTournee,
  executeAddToTrier,
  executeAddTournee,
  isAnySelectedInTour = false
}: MapModalProps) {
  // Maps configurations (client lookup)
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  // Filter state for Map Modal side pane
  const [isFilterPaneOpen, setIsFilterPaneOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    includeAutresMateriels: boolean;
    situation: 'Toutes' | 'Sans mission' | 'Avec mission';
    region: string;
  }>({
    includeAutresMateriels: false,
    situation: 'Toutes',
    region: 'Tous',
  });
  const [draftFilters, setDraftFilters] = useState(activeFilters);

  // Close filter pane if modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsFilterPaneOpen(false);
    }
  }, [isOpen]);

  const activeFiltersCount = (activeFilters.includeAutresMateriels ? 1 : 0) +
    (activeFilters.situation !== 'Toutes' ? 1 : 0) +
    (activeFilters.region !== 'Tous' ? 1 : 0);

  // Filter input styling matching application design
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
    backgroundColor: '#000000',
    borderRadius: '12px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: 'normal',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
  };

  const applyFiltersButtonStyle: React.CSSProperties = {
    backgroundColor: 'rgb(53, 86, 236)',
    borderRadius: '12px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: 'normal',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
  };

  // Sur l'affichage Plan, base active list (avec toggle Inclure Autres Matériels)
  const baseActiveList = useMemo(() => {
    const rawList = items || defibrillateurs || [];
    let list = rawList.filter((item: any) => {
      // Pour les défibrillateurs ou tout équipement avec statut de maintenance autorisée
      if (defibrillateurs || item?.fsmAutorise !== undefined || item?.maintenanceAutorisee !== undefined || item?.maintenance_autorisee !== undefined) {
        const rawFsm = (item?.fsmAutorise ?? item?.maintenanceAutorisee ?? item?.maintenance_autorisee ?? '').toString().trim().toLowerCase();
        if (rawFsm === 'non' || rawFsm === 'false' || rawFsm === '0') return false;
        return rawFsm === 'oui' || rawFsm === 'true' || rawFsm === '1' || (!rawFsm && (item?.fsmAutorise || 'Oui') === 'Oui');
      }
      return true;
    });

    if (activeFilters.includeAutresMateriels && otherEquipments && otherEquipments.length > 0) {
      const existingIds = new Set(list.map((i: any) => i.id));
      const validOthers = otherEquipments.filter((o: any) => {
        if (existingIds.has(o.id)) return false;
        const rawFsm = (o?.fsmAutorise ?? o?.maintenanceAutorisee ?? o?.maintenance_autorisee ?? '').toString().trim().toLowerCase();
        if (rawFsm === 'non' || rawFsm === 'false' || rawFsm === '0') return false;
        return true;
      });
      list = [...list, ...validOthers];
    }

    return list;
  }, [items, defibrillateurs, otherEquipments, activeFilters.includeAutresMateriels]);

  // Filtrage selon situation et région
  const activeList = useMemo(() => {
    return baseActiveList.filter((item: any) => {
      // 1. Situation filter: "Sans mission planifiée" ou "Avec mission planifiée"
      if (activeFilters.situation === 'Sans mission') {
        if (hasPlannedMission(item, fsmTours)) return false;
      } else if (activeFilters.situation === 'Avec mission') {
        if (!hasPlannedMission(item, fsmTours)) return false;
      }

      // 2. Region filter
      if (activeFilters.region !== 'Tous') {
        const itemReg = getItemRegion(item, clientMap);
        if (itemReg.toLowerCase() !== activeFilters.region.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [baseActiveList, activeFilters.situation, activeFilters.region, fsmTours, clientMap]);

  // Liste ordonnée de toutes les régions françaises et personnalisées
  const availableRegions = useMemo(() => {
    const regionSet = new Set<string>();
    (REGIONS_BY_COUNTRY["France"] || []).forEach(r => regionSet.add(r));
    (defibrillateurs || []).forEach((d: any) => {
      const r = getItemRegion(d, clientMap);
      if (r) regionSet.add(r);
    });
    (otherEquipments || []).forEach((o: any) => {
      const r = getItemRegion(o, clientMap);
      if (r) regionSet.add(r);
    });
    return Array.from(regionSet).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [defibrillateurs, otherEquipments, clientMap]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isTourDropdownOpen, setIsTourDropdownOpen] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  // User session isolation for map info popup dismissal
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') || 'demo' : 'demo';
  let userEmail = '';
  if (typeof window !== 'undefined') {
    try {
      const savedUser = localStorage.getItem('defib_admin_logged_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed?.email) {
          userEmail = parsed.email.toLowerCase().trim();
        }
      }
    } catch (e) {}
  }
  const effectiveSessionKey = userEmail ? `help_dismissed_map_modal_user_${userEmail}` : `help_dismissed_map_modal`;

  // Check if helps/tutorials are disabled specifically for this user session
  let isHelpsDisabled = false;
  if (typeof window !== 'undefined') {
    const userSpecificDisableKey = userEmail ? `defib_${tenantId}_user_${userEmail}_disable_helps_tutorials` : `defib_${tenantId}_disable_helps_tutorials`;
    if (localStorage.getItem(userSpecificDisableKey) === 'Oui') {
      isHelpsDisabled = true;
    }
  }

  const [isInfoPopupVisible, setIsInfoPopupVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !sessionStorage.getItem(effectiveSessionKey);
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsInfoPopupVisible(!sessionStorage.getItem(effectiveSessionKey));
    }
  }, [effectiveSessionKey, isOpen]);

  const handleDismissInfoPopup = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(effectiveSessionKey, "true");
    }
    setIsInfoPopupVisible(false);
  };
  
  // Real coordinates configuration
  const [viewTarget, setViewTarget] = useState<ViewTarget | null>(null);
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, [number, number]>>({});

  // Comprehensive department center mapping for France
  const DEPT_COORDS: Record<string, [number, number]> = useMemo(() => ({
    '01': [46.000, 5.200], '02': [49.500, 3.600], '03': [46.300, 3.200], '04': [44.100, 6.200], '05': [44.600, 6.100],
    '06': [43.700, 7.250], '07': [44.750, 4.400], '08': [49.600, 4.700], '09': [42.900, 1.600], '10': [48.300, 4.100],
    '11': [43.100, 2.350], '12': [44.350, 2.570], '13': [43.300, 5.400], '14': [49.180, -0.370], '15': [45.030, 2.660],
    '16': [45.650, 0.150], '17': [45.750, -0.630], '18': [47.080, 2.400], '19': [45.270, 1.770], '21': [47.320, 5.040],
    '22': [48.510, -2.760], '23': [46.170, 1.870], '24': [45.180, 0.720], '25': [47.240, 6.020], '26': [44.930, 4.890],
    '27': [49.020, 1.150], '28': [48.440, 1.480], '29': [48.390, -4.480], '2A': [41.920, 8.730], '2B': [42.700, 9.450],
    '30': [43.830, 4.360], '31': [43.600, 1.440], '32': [43.650, 0.580], '33': [44.840, -0.580], '34': [43.610, 3.870],
    '35': [48.110, -1.670], '36': [46.810, 1.690], '37': [47.390, 0.680], '38': [45.180, 5.720], '39': [46.670, 5.550],
    '40': [43.890, -0.500], '41': [47.590, 1.330], '42': [45.430, 4.380], '43': [45.040, 3.880], '44': [47.210, -1.550],
    '45': [47.900, 1.900], '46': [44.450, 1.440], '47': [44.200, 0.620], '48': [44.520, 3.500], '49': [47.470, -0.550],
    '50': [49.110, -1.090], '51': [48.950, 4.360], '52': [48.110, 5.140], '53': [48.070, -0.770], '54': [48.690, 6.180],
    '55': [48.960, 5.380], '56': [47.650, -2.750], '57': [49.120, 6.170], '58': [46.990, 3.160], '59': [50.630, 3.060],
    '60': [49.410, 2.080], '61': [48.430, 0.090], '62': [50.530, 2.640], '63': [45.780, 3.080], '64': [43.300, -0.370],
    '65': [43.230, 0.080], '66': [42.690, 2.890], '67': [48.570, 7.750], '68': [47.750, 7.330], '69': [45.760, 4.830],
    '70': [47.620, 6.150], '71': [46.670, 4.830], '72': [48.000, 0.200], '73': [45.560, 5.920], '74': [45.890, 6.120],
    '75': [48.8566, 2.3522], '76': [49.440, 1.100], '77': [48.600, 2.900], '78': [48.800, 2.130], '79': [46.320, -0.460],
    '80': [49.890, 2.300], '81': [43.920, 2.140], '82': [44.010, 1.350], '83': [43.120, 5.930], '84': [43.950, 4.810],
    '85': [46.670, -1.420], '86': [46.580, 0.340], '87': [45.830, 1.260], '88': [48.170, 6.450], '89': [47.790, 3.570],
    '90': [47.630, 6.860], '91': [48.500, 2.200], '92': [48.880, 2.230], '93': [48.910, 2.480], '94': [48.790, 2.450],
    '95': [49.040, 2.100]
  }), []);

  // Extract / resolve coordinates for 100% of items with jittering to prevent stacked hidden points
  const itemsWithCoords = useMemo(() => {
    const list: { item: any; coords: [number, number] }[] = [];
    const usedCoordsMap = new Map<string, number>();

    for (let i = 0; i < activeList.length; i++) {
      const item = activeList[i];
      let lat = parseFloat(item.latitude || item.lat || '');
      let lng = parseFloat(item.longitude || item.lng || item.lon || '');
      let baseCoords: [number, number] | null = null;

      // 1. Check if direct coordinates are valid (ignoring placeholder defaults if there are better address details)
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        baseCoords = [lat, lng];
      } else if (geocodedCoords[item.id]) {
        baseCoords = geocodedCoords[item.id];
      } else {
        // 2. Check if client associated with item has address/department
        const clientObj = item.clientId ? clientMap.get(item.clientId) : null;
        const cp = (item.cp || item.codePostal || clientObj?.codePostal || '').trim();
        const dept = cp.substring(0, 2);

        if (dept && DEPT_COORDS[dept]) {
          baseCoords = DEPT_COORDS[dept];
        } else if (clientObj?.adresse || item.ville || clientObj?.ville) {
          baseCoords = [46.603354, 1.888334]; // France center default
        } else {
          baseCoords = [46.603354, 1.888334]; // Fallback
        }
      }

      // Apply deterministic spatial offset for co-located items so all items are individually visible
      const key = `${baseCoords[0].toFixed(4)}_${baseCoords[1].toFixed(4)}`;
      const stackIndex = usedCoordsMap.get(key) || 0;
      usedCoordsMap.set(key, stackIndex + 1);

      let finalLat = baseCoords[0];
      let finalLng = baseCoords[1];

      if (stackIndex > 0) {
        const angle = (stackIndex * 137.5) * (Math.PI / 180); // Golden angle distribution
        const radius = 0.0012 * Math.sqrt(stackIndex); // ~100m to 800m offset
        finalLat += Math.sin(angle) * radius;
        finalLng += Math.cos(angle) * radius;
      }

      list.push({ item, coords: [finalLat, finalLng] });
    }
    return list;
  }, [activeList, geocodedCoords, clientMap, DEPT_COORDS]);

  // Progressive batch loading state for high performance
  const [renderedCount, setRenderedCount] = useState<number>(0);
  const [isMapBatchLoading, setIsMapBatchLoading] = useState<boolean>(true);

  // Progressive loading animation effect
  useEffect(() => {
    if (!isOpen) {
      setRenderedCount(0);
      setIsMapBatchLoading(false);
      return;
    }

    setRenderedCount(0);
    setIsMapBatchLoading(true);

    const total = itemsWithCoords.length;
    if (total === 0) {
      const timer = setTimeout(() => setIsMapBatchLoading(false), 500);
      return () => clearTimeout(timer);
    }

    const batchSize = Math.max(1, Math.ceil(total / 12));
    const intervalTime = 40; // ms per tick

    let current = 0;
    const interval = setInterval(() => {
      current = Math.min(current + batchSize, total);
      setRenderedCount(current);

      if (current >= total) {
        clearInterval(interval);
        // Keep banner visible for 700ms at 100% so user can easily read complete count
        setTimeout(() => {
          setIsMapBatchLoading(false);
        }, 700);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isOpen, activeList, itemsWithCoords.length]);

  const displayedItems = useMemo(() => {
    return itemsWithCoords.slice(0, renderedCount);
  }, [itemsWithCoords, renderedCount]);

  // Trigger map view target or auto-zoom to region when opened or when region changes
  useEffect(() => {
    if (!isOpen) return;

    if (activeFilters.region === 'Tous') {
      setViewTarget({
        center: [46.603354, 1.888334],
        zoom: 6,
        id: Date.now()
      });
      return;
    }

    const regionItems = itemsWithCoords.filter(({ item }) => {
      const r = getItemRegion(item, clientMap);
      return r.toLowerCase() === activeFilters.region.toLowerCase();
    });

    if (regionItems.length > 0) {
      if (regionItems.length === 1) {
        setViewTarget({
          center: regionItems[0].coords,
          zoom: 12,
          id: Date.now()
        });
      } else {
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        regionItems.forEach(({ coords }) => {
          if (coords[0] < minLat) minLat = coords[0];
          if (coords[0] > maxLat) maxLat = coords[0];
          if (coords[1] < minLng) minLng = coords[1];
          if (coords[1] > maxLng) maxLng = coords[1];
        });

        if (Math.abs(maxLat - minLat) < 0.005 && Math.abs(maxLng - minLng) < 0.005) {
          setViewTarget({
            center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
            zoom: 12,
            id: Date.now()
          });
        } else {
          setViewTarget({
            center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
            zoom: 8,
            bounds: [[minLat, minLng], [maxLat, maxLng]],
            id: Date.now()
          });
        }
      }
    } else {
      const regConfig = REGION_CENTERS[activeFilters.region];
      if (regConfig) {
        setViewTarget({
          center: regConfig.center,
          zoom: regConfig.zoom,
          bounds: regConfig.bounds,
          id: Date.now()
        });
      }
    }
  }, [isOpen, activeFilters.region, itemsWithCoords, clientMap]);

  // Set initial selected item when opened
  useEffect(() => {
    if (isOpen && activeList.length > 0 && selectedItemId === null) {
      setSelectedItemId(activeList[0].id);
    }
  }, [isOpen, activeList, selectedItemId]);

  // Background geocoding helper using OSM Nominatim
  useEffect(() => {
    if (!isOpen) return;

    const toGeocode = activeList.filter(item => {
      const lat = parseFloat(item.latitude);
      const lng = parseFloat(item.longitude);
      const hasValidCo = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && lat !== 48.8566; // ignore placeholder default
      const numVoie = item.numVoie || item.numeroVoie || '';
      return !hasValidCo && !geocodedCoords[item.id] && (item.ville || numVoie);
    });

    if (toGeocode.length === 0) return;

    let active = true;

    const geocodeAll = async () => {
      for (const item of toGeocode) {
        if (!active) break;
        const numVoie = item.numVoie || item.numeroVoie || '';
        const cp = item.cp || item.codePostal || '';
        const addressQuery = `${numVoie ? numVoie + ', ' : ''}${cp ? cp + ' ' : ''}${item.ville}${item.pays ? ', ' : ''}${item.pays || 'France'}`;
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}`);
          const data = await response.json();
          if (data && data.length > 0) {
            const first = data[0];
            const lat = parseFloat(first.lat);
            const lon = parseFloat(first.lon);
            if (!isNaN(lat) && !isNaN(lon) && active) {
              setGeocodedCoords(prev => ({
                ...prev,
                [item.id]: [lat, lon]
              }));
            }
          }
        } catch (err) {
          console.error("Geocoding failed for: ", addressQuery, err);
        }
        // Polite delay of 1.2s to comply with OpenStreetMap guidelines/Limits
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    };

    geocodeAll();

    return () => {
      active = false;
    };
  }, [isOpen, activeList]);

  // Map active coordinates mapper
  const getDeviceCoords = (item: any): [number, number] | null => {
    const lat = parseFloat(item.latitude);
    const lng = parseFloat(item.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return [lat, lng];
    }
    return geocodedCoords[item.id] || null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white z-[120] w-screen h-screen overflow-hidden flex flex-col" id="map-modal-overlay">
      <style>{`
        /* Style adjustments to completely remove box-shadow effect on Popup wrapper info div */
        .leaflet-popup-content-wrapper {
          box-shadow: none !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important;
          background: #ffffff !important;
        }
        .leaflet-popup-tip {
          box-shadow: none !important;
          border: 1px solid #e2e8f0 !important;
          background: #ffffff !important;
        }
        .leaflet-popup-content {
          margin: 12px 16px !important;
        }
      `}</style>

      <div className="relative w-full h-full flex-1">
        
        {/* Top-Bar Red Loading Banner (Visible as long as points are batch loading) */}
        {isMapBatchLoading && isOpen && (
          <div 
            className="absolute top-0 left-0 right-0 z-[2000] py-2.5 px-4 text-center font-bold shadow-lg flex items-center justify-center gap-3 transition-all animate-fadeIn"
            style={{
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              fontSize: '17px',
              letterSpacing: '0.01em',
              boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)'
            }}
            id="map-loading-topbar"
          >
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span>Veuillez patienter, chargement en cours.</span>
            {itemsWithCoords.length > 0 && (
              <span className="text-sm bg-red-800/60 text-white px-2.5 py-0.5 rounded-full ml-1 font-mono">
                {Math.min(renderedCount, itemsWithCoords.length)} / {itemsWithCoords.length}
              </span>
            )}
          </div>
        )}

        {/* Top-Right Header Container: Tournée button (visible only when selectedIds > 0) + Fermer button */}
        <div className="absolute top-4 right-4 z-[1000] flex items-center gap-3">
          {/* Tournée Dropdown Container */}
          {selectedIds && selectedIds.length > 0 && (
            <div className="relative">
              <button
                type="button"
                disabled={isAnySelectedInTour}
                onClick={() => {
                  if (!isAnySelectedInTour) {
                    setIsTourDropdownOpen(!isTourDropdownOpen);
                  }
                }}
                title={
                  isAnySelectedInTour
                    ? "Action impossible : l'un des défibrillateurs sélectionnés fait déjà partie d'une tournée."
                    : "Associer à une tournée"
                }
                style={{
                  backgroundColor: '#000000',
                  borderRadius: '12px',
                  fontSize: '18px',
                  padding: '9px 19px',
                  fontWeight: 'normal',
                  color: '#ffffff',
                  border: 'none',
                  cursor: isAnySelectedInTour ? 'not-allowed' : 'pointer',
                  opacity: isAnySelectedInTour ? 0.6 : 1,
                  fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                }}
              >
                <span
                  style={{
                    backgroundColor: '#fe4eba',
                    color: '#ffffff',
                    borderRadius: '9999px',
                    padding: '2px 8px',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  {selectedIds.length}
                </span>
                <span>Tournée</span>
              </button>

              {/* Dropdown Menu */}
              {isTourDropdownOpen && !isAnySelectedInTour && (
                <div 
                  className="absolute right-0 mt-1 w-72 bg-white rounded-lg z-[1050] py-2.5 font-sans animate-fadeIn"
                  style={{ 
                    fontSize: '18px',
                    border: '1px solid rgb(218 218 218)',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  <div className="px-3 pb-2 bg-transparent flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        executeNouvelleTournee?.();
                        setIsTourDropdownOpen(false);
                        onClose();
                      }}
                      style={{
                        backgroundColor: '#f3f4f6',
                        borderRadius: '12px',
                        fontSize: '18px',
                        padding: '9px 19px',
                        fontWeight: 'normal',
                        color: '#000000',
                        border: 'none',
                        cursor: 'pointer',
                        width: '100%',
                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                      }}
                      className="w-full text-center transition-colors cursor-pointer hover:bg-slate-200"
                    >
                      Nouvelle Tournée
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        executeAddToTrier?.();
                        setIsTourDropdownOpen(false);
                        onClose();
                      }}
                      style={{
                        backgroundColor: '#000000',
                        borderRadius: '12px',
                        fontSize: '18px',
                        padding: '9px 19px',
                        fontWeight: 'normal',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        width: '100%',
                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
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
                          executeAddTournee?.(selectedDraftId);
                          setIsTourDropdownOpen(false);
                          setSelectedDraftId(null);
                          onClose();
                        }}
                        style={{
                          backgroundColor: 'rgb(53, 86, 236)',
                          borderRadius: '12px',
                          fontSize: '18px',
                          padding: '9px 19px',
                          fontWeight: 'normal',
                          color: '#ffffff',
                          border: 'none',
                          cursor: 'pointer',
                          width: '100%',
                          boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px',
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                        }}
                        className="w-full text-center transition-colors cursor-pointer hover:bg-blue-700"
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
                          className="w-full text-left px-4 py-2 font-semibold truncate cursor-pointer border-0 bg-transparent hover:bg-slate-50 font-sans"
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
          )}

          {/* Bouton Filtres - à côté à gauche du bouton « Fermer » */}
          <button
            type="button"
            onClick={() => {
              setDraftFilters(activeFilters);
              setIsFilterPaneOpen(true);
            }}
            id="btn-map-filters"
            style={{
              backgroundColor: '#000000',
              borderRadius: '12px',
              fontSize: '18px',
              padding: '9px 19px',
              fontWeight: 'normal',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              transition: 'all 0.1s ease-in-out'
            }}
          >
            <span>Filtres</span>
            {activeFiltersCount > 0 && (
              <span
                style={{
                  backgroundColor: '#fe4eba',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '2px 8px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  lineHeight: '1'
                }}
              >
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Floating Close Button in signature blue style */}
          <button
            onClick={onClose}
            id="btn-map-close"
            style={{
              backgroundColor: 'rgb(53, 86, 236)',
              boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
              borderRadius: '12px',
              fontSize: '18px',
              padding: '9px 19px',
              fontWeight: 'normal',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              transition: 'all 0.1s ease-in-out'
            }}
          >
            Fermer
          </button>
        </div>

        {/* Backdrop for filter side pane */}
        {isFilterPaneOpen && (
          <div 
            onClick={() => setIsFilterPaneOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-xs z-[1090] animate-fadeIn cursor-pointer"
          />
        )}

        {/* Filter Side Pane */}
        {isFilterPaneOpen && (
          <div
            id="map-filter-side-pane"
            className="absolute inset-y-0 right-0 w-80 sm:w-96 bg-white shadow-2xl z-[1100] flex flex-col border-l border-slate-200"
            style={{ height: '100%' }}
          >
            {/* Scroll Area containing all fields */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Filter 1: Toggle Inclure Autres Matériels */}
              <div className="py-2">
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span 
                    className="text-[16px] text-black font-sans" 
                    style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif", fontWeight: 100 }}
                  >
                    Inclure Autres Matériels
                  </span>
                  <div className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      id="toggle-map-include-autres-materiels"
                      checked={draftFilters.includeAutresMateriels}
                      onChange={(e) => setDraftFilters({ ...draftFilters, includeAutresMateriels: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#dbdbdb] rounded-full cursor-pointer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#dbdbdb] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#fe4eba]" />
                  </div>
                </label>
              </div>

              {/* Filter 2: Situation Dropdown */}
              <div className="space-y-1.5">
                <label 
                  className="block text-[15px] font-semibold text-black" 
                  style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                >
                  Situation.
                </label>
                <div className="relative">
                  <select
                    value={draftFilters.situation}
                    onChange={(e) => setDraftFilters({ ...draftFilters, situation: e.target.value as any })}
                    style={filterInputStyle}
                    className="cursor-pointer"
                  >
                    <option value="Toutes">Toutes situations</option>
                    <option value="Sans mission">Sans mission planifiée</option>
                    <option value="Avec mission">Avec mission planifiée</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>

              {/* Filter 3: Région Dropdown */}
              <div className="space-y-1.5">
                <label 
                  className="block text-[15px] font-semibold text-black" 
                  style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                >
                  Région.
                </label>
                <div className="relative">
                  <select
                    value={draftFilters.region}
                    onChange={(e) => setDraftFilters({ ...draftFilters, region: e.target.value })}
                    style={filterInputStyle}
                    className="cursor-pointer"
                  >
                    <option value="Tous">Toutes régions</option>
                    {availableRegions.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 bg-white flex gap-4 shrink-0 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const defaults = {
                    includeAutresMateriels: false,
                    situation: 'Toutes' as const,
                    region: 'Tous',
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
                type="button"
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

        {/* Bottom-Left Information Popup Overlay */}
        {!isHelpsDisabled && isInfoPopupVisible && (
          <div 
            id="map-info-popup"
            className="absolute bottom-6 left-6 z-[1000] max-w-xl bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-slate-200 text-black animate-fadeIn flex flex-col md:flex-row md:items-center justify-between gap-4"
            style={{
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              borderColor: 'rgb(218, 218, 218)',
              boxShadow: 'none',
            }}
          >
            <div className="flex-1 text-[16px] leading-relaxed text-black" style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif", cursor: 'default' }}>
              <strong>Bon à savoir :</strong> Cliquez sur les points de position pour les intégrer à une tournée. Si le matériel est déjà présent dans une tournée, il n’est pas possible de le sélectionner. Pour rappel, le rouge correspond à une action requise expirée, l’orange à une échéance de moins de 3 mois, le bleu entre 3 et 6 mois, tandis que le vert signifie qu’aucune action n’est requise et le gris que le logiciel manque d’informations pour déterminer son état.
            </div>
            <button
              type="button"
              onClick={handleDismissInfoPopup}
              className="font-sans font-semibold active:scale-95 transition-all border-0 cursor-pointer shrink-0 self-end md:self-center"
              style={{
                backgroundColor: '#000000',
                color: '#ffffff',
                fontSize: '18px',
                borderRadius: '13px',
                padding: '8px 20px',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              }}
            >
              J'ai compris
            </button>
          </div>
        )}

        {/* Real OpenStreetMap Leaflet Container */}
        <MapContainer 
          center={[46.603354, 1.888334]} 
          zoom={6} 
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <ChangeMapView viewTarget={viewTarget} />

          {/* Plot Markers */}
          {displayedItems.map(({ item, coords }) => {
            const isFocused = item.id === selectedItemId;
            const isChecked = selectedIds.includes(item.id);
            const statusColor = getSafetyStatusColor(item);
            const clientDenomination = clientMap.get(item.clientId)?.denomination || '';

            return (
              <DefibMarker
                key={item.id}
                item={item}
                coords={coords}
                isFocused={isFocused}
                isChecked={isChecked}
                statusColor={statusColor}
                clientDenomination={clientDenomination}
                onSelect={setSelectedItemId}
                onToggleSelect={onToggleSelect}
              />
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
