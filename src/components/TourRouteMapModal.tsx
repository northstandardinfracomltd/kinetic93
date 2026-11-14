import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Coordinate,
  geocodeAddress,
  sortMissionsByProximity,
  scheduleMissions,
  calculateFirstMissionTravelHours,
  getHaversineDistance,
} from '../utils/fsmOptimizer';
import { formatDateToFR } from '../utils';
import { CttGlobalRules, Defibrillateur, OtherEquipment, Client, Variable, Member } from '../types';

interface TourRouteMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  tour: any;
  technician: Member | null;
  defibrillateurs: Defibrillateur[];
  otherEquipments: OtherEquipment[];
  formations?: any[];
  clients: Client[];
  variables: Variable[];
  cttGlobalRules: CttGlobalRules;
  allTours: any[];
  onCalculatedMissions?: (tourId: string, scheduledMissions: any[]) => void;
}

interface RouteMissionPoint {
  mission: any;
  passageNumber: number;
  coord: Coordinate;
  displayCoord: [number, number];
  bgColor: string;
  equipmentIdentifiant: string;
  equipmentTypeLabel: string;
  clientLabel: string;
  estimatedDateFormatted: string;
  estimatedSlotLabel: string;
}

function getMissionStatusPictogramColor(status?: string): string {
  const sitNorm = String(status || 'Brouillon').toLowerCase().trim();
  if (sitNorm === 'brouillon') return 'rgb(184, 164, 164)';
  if (sitNorm === 'attente client') return 'rgb(141, 158, 60)';
  if (sitNorm === 'accepté client' || sitNorm === 'accepte client') return 'rgb(23, 144, 75)';
  if (sitNorm === 'refusé client' || sitNorm === 'refuse client') return 'rgb(146, 37, 14)';
  if (sitNorm === 'rejet mission' || sitNorm === 'rejet') return 'rgb(178, 13, 83)';
  if (sitNorm === 'à faire' || sitNorm === 'a faire') return 'rgb(15, 98, 195)';
  if (sitNorm === 'attente') return 'rgb(67, 98, 135)';
  if (sitNorm === 'effectué' || sitNorm === 'effectue' || sitNorm === 'effectuée') return 'rgb(93, 44, 216)';
  return 'rgb(184, 164, 164)';
}

function createMissionPassageIcon(bgColor: string, passageNumber: number): L.DivIcon {
  return L.divIcon({
    className: 'defibeo-tour-route-marker-icon',
    html: `
      <div style="
        width: 43px;
        height: 43px;
        min-width: 43px;
        min-height: 43px;
        border-radius: 9999px;
        background: ${bgColor};
        background-color: ${bgColor};
        color: #ffffff;
        font-family: 'DefibeoMain', 'Civilprom', sans-serif;
        font-weight: 700;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2.5px solid #ffffff;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28);
        cursor: pointer;
        user-select: none;
        box-sizing: border-box;
      ">
        ${passageNumber}
      </div>
    `,
    iconSize: [43, 43],
    iconAnchor: [21.5, 21.5],
    tooltipAnchor: [24, 0],
  });
}

function AutoFitRouteBounds({
  points,
  roadPositions,
}: {
  points: RouteMissionPoint[];
  roadPositions: [number, number][];
}) {
  const map = useMap();
  const fittedRef = useRef<string>('');

  useEffect(() => {
    const allLatLngs: [number, number][] =
      roadPositions.length >= 2
        ? roadPositions
        : points.map(p => p.displayCoord);

    if (allLatLngs.length === 0) return;

    const sig = `${points.map(p => `${p.passageNumber}:${p.coord.lat.toFixed(4)},${p.coord.lng.toFixed(4)}`).join('|')}_${roadPositions.length}`;
    if (fittedRef.current === sig) return;
    fittedRef.current = sig;

    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
        if (allLatLngs.length === 1) {
          map.setView(allLatLngs[0], 14, { animate: true });
        } else {
          const bounds = L.latLngBounds(allLatLngs);
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16, animate: true });
          }
        }
      } catch (_) {}
    }, 100);

    return () => clearTimeout(timer);
  }, [points, roadPositions, map]);

  return null;
}

async function fetchRoadSegmentGeometry(coords: Coordinate[]): Promise<[number, number][]> {
  if (coords.length < 2) {
    return coords.map(c => [c.lat, c.lng]);
  }

  // Deduplicate consecutive identical coordinates (< 15 meters) to avoid OSRM zero-length leg issues
  const deduped: Coordinate[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (getHaversineDistance(prev, coords[i]) >= 0.015) {
      deduped.push(coords[i]);
    }
  }

  if (deduped.length < 2) {
    return coords.map(c => [c.lat, c.lng]);
  }

  // Chunk into batches of up to 25 waypoints (with 1 overlapping waypoint between chunks)
  const CHUNK_SIZE = 25;
  const fullPath: [number, number][] = [];

  for (let startIdx = 0; startIdx < deduped.length - 1; startIdx += CHUNK_SIZE - 1) {
    const chunk = deduped.slice(startIdx, startIdx + CHUNK_SIZE);
    if (chunk.length < 2) break;

    const coordQuery = chunk.map(c => `${c.lng},${c.lat}`).join(';');
    const endpoints = [
      `https://router.project-osrm.org/route/v1/driving/${coordQuery}?overview=full&geometries=geojson`,
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordQuery}?overview=full&geometries=geojson`,
    ];

    let chunkGeometry: [number, number][] | null = null;

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const rawCoords = data?.routes?.[0]?.geometry?.coordinates;
          if (Array.isArray(rawCoords) && rawCoords.length >= 2) {
            chunkGeometry = rawCoords.map((pair: [number, number]) => [pair[1], pair[0]]);
            break;
          }
        }
      } catch (_) {
        // Try next routing endpoint
      }
    }

    if (!chunkGeometry) {
      // Try pair-by-pair routing if a large chunk failed
      const pairPath: [number, number][] = [];
      for (let j = 0; j < chunk.length - 1; j++) {
        const a = chunk[j];
        const b = chunk[j + 1];
        const pairQuery = `${a.lng},${a.lat};${b.lng},${b.lat}`;
        let pairGeom: [number, number][] | null = null;
        for (const base of [
          'https://router.project-osrm.org/route/v1/driving',
          'https://routing.openstreetmap.de/routed-car/route/v1/driving',
        ]) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(`${base}/${pairQuery}?overview=full&geometries=geojson`, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (res.ok) {
              const data = await res.json();
              const rawCoords = data?.routes?.[0]?.geometry?.coordinates;
              if (Array.isArray(rawCoords) && rawCoords.length >= 2) {
                pairGeom = rawCoords.map((p: [number, number]) => [p[1], p[0]]);
                break;
              }
            }
          } catch (_) {}
        }
        const seg = pairGeom || [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ];
        if (pairPath.length > 0 && seg.length > 0) {
          pairPath.push(...seg.slice(1));
        } else {
          pairPath.push(...seg);
        }
      }
      chunkGeometry = pairPath;
    }

    if (fullPath.length > 0 && chunkGeometry.length > 0) {
      fullPath.push(...chunkGeometry.slice(1));
    } else {
      fullPath.push(...chunkGeometry);
    }
  }

  return fullPath;
}

export const TourRouteMapModal: React.FC<TourRouteMapModalProps> = ({
  isOpen,
  onClose,
  tour,
  technician,
  defibrillateurs,
  otherEquipments,
  formations = [],
  clients,
  variables,
  cttGlobalRules,
  allTours,
  onCalculatedMissions,
}) => {
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [missionPoints, setMissionPoints] = useState<RouteMissionPoint[]>([]);
  const [roadPositions, setRoadPositions] = useState<[number, number][]>([]);

  useEffect(() => {
    if (!isOpen || !tour || !technician) {
      setMissionPoints([]);
      setRoadPositions([]);
      return;
    }

    let cancelled = false;

    const buildOptimizedRoute = async () => {
      setIsLoadingRoute(true);

      try {
        // 1. Resolve technician departure coordinates
        let startCoord: Coordinate | null = null;
        if (
          technician.startAddressLat !== undefined &&
          technician.startAddressLng !== undefined &&
          String(technician.startAddressLat).trim() !== '' &&
          String(technician.startAddressLng).trim() !== ''
        ) {
          const parsedLat = Number(technician.startAddressLat);
          const parsedLng = Number(technician.startAddressLng);
          if (!isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat !== 0 && parsedLng !== 0) {
            startCoord = { lat: parsedLat, lng: parsedLng };
          }
        }

        if (!startCoord) {
          const composedTechAddress =
            (technician.startAddress && technician.startAddress.trim()) ||
            [
              technician.startAddressStreet,
              technician.startAddressZip,
              technician.startAddressCity,
              technician.startAddressCountry || 'France',
            ]
              .filter(Boolean)
              .join(' ');
          if (composedTechAddress.trim()) {
            startCoord = await geocodeAddress(composedTechAddress);
          }
        }

        if (!startCoord || cancelled) {
          setIsLoadingRoute(false);
          return;
        }

        // 2. Resolve coordinates and equipment details for every mission in the tour
        const equipmentCoords: Record<string, Coordinate> = {};
        const equipmentDetails: Record<string, any> = {};
        const rawMissions: any[] = Array.isArray(tour.missions) ? tour.missions : [];

        for (let i = 0; i < rawMissions.length; i++) {
          const m = rawMissions[i];
          const key = m.defibIdentifiant || m.id || `mission_${i}`;
          const defib = defibrillateurs.find(d => d.identifiant === m.defibIdentifiant);
          const other = !defib ? otherEquipments.find(o => o.identifiant === m.defibIdentifiant) : undefined;
          const formation =
            !defib && !other
              ? formations.find(
                  (f: any) =>
                    (m.formationId && f.id === m.formationId) ||
                    (m.defibIdentifiant && f.identifiant === m.defibIdentifiant)
                )
              : undefined;

          const eq: any = defib || other || formation;
          if (eq) {
            equipmentDetails[key] = eq;
            if (m.defibIdentifiant) {
              equipmentDetails[m.defibIdentifiant] = eq;
            }
          }

          let lat = eq ? parseFloat(String(eq.latitude ?? '')) : NaN;
          let lng = eq ? parseFloat(String(eq.longitude ?? '')) : NaN;
          if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
            lat = parseFloat(String(m.latitude ?? ''));
            lng = parseFloat(String(m.longitude ?? ''));
          }

          if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
            equipmentCoords[key] = { lat, lng };
            if (m.defibIdentifiant) {
              equipmentCoords[m.defibIdentifiant] = { lat, lng };
            }
          } else {
            // Geocode from equipment or mission address
            const addressParts = eq
              ? [eq.numVoie || eq.numeroVoie || eq.adresse || eq.lieu, eq.cp || eq.codePostal, eq.ville, eq.pays || 'France']
              : [m.address || m.lieu || m.nomSite, m.cp, m.ville, 'France'];
            const addressStr = addressParts.filter(Boolean).join(' ').trim();
            if (addressStr) {
              const geocoded = await geocodeAddress(addressStr);
              if (geocoded) {
                equipmentCoords[key] = geocoded;
                if (m.defibIdentifiant) {
                  equipmentCoords[m.defibIdentifiant] = geocoded;
                }
              }
            }
          }
        }

        if (cancelled) return;

        // 3. Optimize route order taking into account technician startCoord, preference ('proche' / 'loin'), and forced dates/slots
        const rawPref = String(technician.optimizationPreference || '').toLowerCase();
        const preference: 'loin' | 'proche' =
          rawPref.includes('loin') || rawPref.includes('éloigné') || rawPref.includes('eloigne')
            ? 'loin'
            : 'proche';

        const sortedMissions = sortMissionsByProximity(
          rawMissions,
          startCoord,
          equipmentCoords,
          preference,
          tour.startDate,
          variables
        );

        const firstMissionKey =
          sortedMissions.length > 0
            ? sortedMissions[0].defibIdentifiant || sortedMissions[0].id
            : '';
        const firstCoord = firstMissionKey ? equipmentCoords[firstMissionKey] || null : null;

        const firstMissionTravelHours =
          startCoord && firstCoord
            ? await calculateFirstMissionTravelHours(startCoord, firstCoord)
            : startCoord
            ? 1
            : 0;

        const scheduledMissions = scheduleMissions(
          sortedMissions,
          tour.startDate,
          equipmentDetails,
          technician,
          firstMissionTravelHours,
          variables,
          cttGlobalRules,
          allTours
        );

        if (cancelled) return;

        if (onCalculatedMissions) {
          onCalculatedMissions(tour.id, scheduledMissions);
        }

        // 4. Build mission marker points with slight visual offset if two missions share identical coordinates
        const clientMap = new Map<string, Client>();
        (clients || []).forEach(c => {
          if (c.id) clientMap.set(String(c.id).trim(), c);
          if (c.clientId) clientMap.set(String(c.clientId).trim(), c);
        });

        const builtPoints: RouteMissionPoint[] = [];

        scheduledMissions.forEach((m: any, idx: number) => {
          const key = m.defibIdentifiant || m.id || `mission_${idx}`;
          const coord = equipmentCoords[key] || (m.defibIdentifiant ? equipmentCoords[m.defibIdentifiant] : undefined);
          if (!coord) return;

          const defib = defibrillateurs.find(d => d.identifiant === m.defibIdentifiant);
          const other = !defib ? otherEquipments.find(o => o.identifiant === m.defibIdentifiant) : undefined;
          const eq: any = defib || other || equipmentDetails[key];

          // Equipment identifier
          const equipmentIdentifiant = String(m.defibIdentifiant || eq?.identifiant || m.interventionReference || `Mission ${idx + 1}`).trim();

          // Equipment type
          const isFormation =
            m.equipmentType === 'Formation' ||
            m.equipmentType?.toLowerCase().includes('formation') ||
            Boolean(m.formationId);
          const equipmentTypeLabel = isFormation
            ? 'Formation'
            : m.equipmentType ||
              (defib
                ? 'Défibrillateur'
                : other
                ? other.categorie || 'Autre matériel'
                : m.reason?.toLowerCase().includes('autre')
                ? 'Autre matériel'
                : 'Défibrillateur');

          // Client label
          const rawClientId = String(eq?.clientId || m.clientId || '').trim();
          const matchedClient = rawClientId ? clientMap.get(rawClientId) : undefined;
          const clientLabel =
            matchedClient?.denomination ||
            eq?.clientNom ||
            m.clientName ||
            eq?.nomSite ||
            m.nomSite ||
            'Client non renseigné';

          // Estimated Date & Slot
          const rawDate = m.estimatedDate || tour.startDate || '';
          const estimatedDateFormatted = rawDate ? formatDateToFR(rawDate) : 'Non définie';
          const estimatedSlotLabel = m.estimatedSlot && String(m.estimatedSlot).trim() !== ''
            ? String(m.estimatedSlot).trim()
            : 'Non défini';

          builtPoints.push({
            mission: m,
            passageNumber: idx + 1,
            coord,
            displayCoord: [coord.lat, coord.lng],
            bgColor: getMissionStatusPictogramColor(m.status),
            equipmentIdentifiant,
            equipmentTypeLabel,
            clientLabel,
            estimatedDateFormatted,
            estimatedSlotLabel,
          });
        });

        // Apply subtle radial offset when multiple missions in the same tour share the exact same coordinates
        const groups: number[][] = [];
        const assigned = new Set<number>();
        for (let i = 0; i < builtPoints.length; i++) {
          if (assigned.has(i)) continue;
          const group = [i];
          assigned.add(i);
          for (let j = i + 1; j < builtPoints.length; j++) {
            if (assigned.has(j)) continue;
            const d = getHaversineDistance(builtPoints[i].coord, builtPoints[j].coord);
            if (d < 0.02) {
              group.push(j);
              assigned.add(j);
            }
          }
          if (group.length > 1) {
            groups.push(group);
          }
        }

        groups.forEach(group => {
          const radius = 0.00022;
          group.forEach((ptIdx, k) => {
            const angle = (2 * Math.PI * k) / group.length;
            const base = builtPoints[ptIdx].coord;
            builtPoints[ptIdx].displayCoord = [
              base.lat + radius * Math.cos(angle),
              base.lng + radius * Math.sin(angle) * 1.35,
            ];
          });
        });

        setMissionPoints(builtPoints);

        // 5. Fetch real road geometry along streets connecting mission 1 -> mission 2 -> ... -> mission N
        const orderedCoords = builtPoints.map(p => p.coord);
        const roadGeom = await fetchRoadSegmentGeometry(orderedCoords);
        if (!cancelled) {
          setRoadPositions(roadGeom);
        }
      } catch (err) {
        console.error('Failed to build tour route map:', err);
      } finally {
        if (!cancelled) {
          setIsLoadingRoute(false);
        }
      }
    };

    buildOptimizedRoute();

    return () => {
      cancelled = true;
    };
  }, [isOpen, tour?.id, tour?.startDate, technician?.id, technician?.name, technician?.optimizationPreference]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-white z-[5000] w-screen h-screen overflow-hidden flex flex-col"
      id="tour-route-map-overlay"
    >
      <style>{`
        .defibeo-tour-route-marker-icon {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-tooltip.defibeo-route-hover-pill {
          background-color: #ffffff !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 16px !important;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14) !important;
          padding: 12px 16px !important;
          color: #000000 !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
          white-space: nowrap !important;
        }
        .leaflet-tooltip.defibeo-route-hover-pill::before {
          display: none !important;
        }
      `}</style>

      <div className="relative w-full h-full flex-1">
        {/* Top-Center Loading Indicator while computing road trace */}
        {isLoadingRoute && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[4000] py-2.5 px-5 rounded-full flex items-center justify-center gap-2.5 pointer-events-none animate-fadeIn"
            style={{
              backgroundColor: '#2e54ff',
              color: '#ffffff',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              fontSize: '15px',
              boxShadow: '0 4px 15px rgba(46, 84, 255, 0.35)',
            }}
          >
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
            <span>Calcul du parcours optimisé dans les voies...</span>
          </div>
        )}

        {/* Top-Right Close Button */}
        <div className="absolute top-4 right-4 z-[4000] flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            id="btn-tour-route-map-close"
            style={{
              backgroundColor: 'rgb(210, 45, 11)',
              boxShadow: 'none',
              borderRadius: '12px',
              fontSize: '18px',
              padding: '9px 19px',
              fontWeight: 'normal',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              transition: 'all 0.1s ease-in-out',
            }}
            className="hover:opacity-90 cursor-pointer select-none"
          >
            Fermer
          </button>
        </div>

        <MapContainer
          center={[46.603354, 1.888334]}
          zoom={6}
          style={{ width: '100%', height: '100%', minHeight: '100vh', backgroundColor: '#f8fafc' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          <AutoFitRouteBounds points={missionPoints} roadPositions={roadPositions} />

          {/* Blue road-following trace */}
          {roadPositions.length >= 2 && (
            <Polyline
              positions={roadPositions}
              pathOptions={{
                color: '#2e54ff',
                weight: 5,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          )}

          {/* Mission Points (Status color circle + Passage number inside + Hover Gélule) */}
          {missionPoints.map(pt => {
            const icon = createMissionPassageIcon(pt.bgColor, pt.passageNumber);
            return (
              <Marker
                key={`${pt.mission.id || pt.equipmentIdentifiant}_${pt.passageNumber}`}
                position={pt.displayCoord}
                icon={icon}
              >
                <Tooltip
                  direction="right"
                  offset={[24, 0]}
                  opacity={1}
                  className="defibeo-route-hover-pill"
                >
                  <div
                    style={{
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      color: '#000000',
                      lineHeight: '1.4',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '17px',
                        color: '#000000',
                        marginBottom: '4px',
                      }}
                    >
                      {pt.equipmentIdentifiant}
                    </div>
                    <div style={{ marginBottom: '6px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: '1000px',
                          backgroundColor: 'rgb(61, 220, 132)',
                          color: 'rgb(19, 100, 55)',
                          fontSize: '14px',
                          fontWeight: 700,
                          padding: '3px 11px',
                          lineHeight: '1.2',
                        }}
                      >
                        {pt.equipmentTypeLabel}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#000000',
                        marginBottom: '2px',
                      }}
                    >
                      Client : <span style={{ fontWeight: 400 }}>{pt.clientLabel}</span>
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#000000',
                        marginBottom: '2px',
                      }}
                    >
                      Date estimée : <span style={{ fontWeight: 400 }}>{pt.estimatedDateFormatted}</span>
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#000000',
                      }}
                    >
                      Créneau estimé : <span style={{ fontWeight: 400 }}>{pt.estimatedSlotLabel}</span>
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};
export default TourRouteMapModal;
