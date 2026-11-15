import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, ZoomControl, useMap } from 'react-leaflet';
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
import { CttGlobalRules, Defibrillateur, OtherEquipment, Client, Variable, Member, CompanyInfo } from '../types';

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
  isWebapp?: boolean;
  preferredNavApp?: string;
  tenantId?: string;
  companyInfo?: CompanyInfo;
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
  addressQuery: string;
  estimatedDateIso: string;
  estimatedDateFormatted: string;
  estimatedSlotLabel: string;
  estimatedDurationLabel: string;
  isSpontaneousEvent?: boolean;
}

interface TechStartPoint {
  coord: Coordinate;
  displayCoord: [number, number];
  techName: string;
  addressLabel: string;
}

interface RouteLegSegmentInfo {
  id: string;
  dayLabel: string;
  fromLabel: string;
  toLabel: string;
  minutes: number;
  kmFormatted: string;
  midpoint: [number, number];
  offsetY: number;
}

interface TechLiveLocation {
  name: string;
  email?: string;
  lat: number;
  lng: number;
  updatedAt?: number;
}

const MISSION_STATUS_LEGEND: { label: string; color: string }[] = [
  { label: 'Brouillon', color: 'rgb(184, 164, 164)' },
  { label: 'Attente Client', color: 'rgb(141, 158, 60)' },
  { label: 'Accepté Client', color: 'rgb(23, 144, 75)' },
  { label: 'Refusé Client', color: 'rgb(146, 37, 14)' },
  { label: 'Rejet mission', color: 'rgb(178, 13, 83)' },
  { label: 'À faire', color: 'rgb(15, 98, 195)' },
  { label: 'Attente', color: 'rgb(67, 98, 135)' },
  { label: 'Effectué', color: 'rgb(93, 44, 216)' },
  { label: 'Événement spontané', color: '#000000' },
];

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

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeDateToIso(raw?: any): string {
  const s = String(raw || '').trim();
  if (!s || s === 'A trier' || s === 'a-trier' || s === 'Non définie') return '';
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return '';
}

function computeDayLabel(legDateIso: string, baseTourDateIso: string): string {
  if (!legDateIso || !baseTourDateIso) return 'J1';
  const dLeg = new Date(`${legDateIso}T00:00:00`);
  const dBase = new Date(`${baseTourDateIso}T00:00:00`);
  if (isNaN(dLeg.getTime()) || isNaN(dBase.getTime())) return 'J1';
  const diffDays = Math.round((dLeg.getTime() - dBase.getTime()) / 86400000);
  const dayNum = Math.max(1, diffDays + 1);
  return `J${dayNum}`;
}

function computeMissionDurationFromVariables(mission: any, variables: Variable[]): string {
  if (!mission || mission._isSpontaneousEvent) return '';
  const reasonsToCheck: string[] = [];
  if (Array.isArray(mission.reasons) && mission.reasons.length > 0) {
    mission.reasons.forEach((r: any) => {
      const s = String(r || '').trim();
      if (s) reasonsToCheck.push(s);
    });
  } else {
    const rawReason = String(
      mission.reason || mission.motif || mission.typePrestation || ''
    ).trim();
    if (rawReason) {
      rawReason
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(s => reasonsToCheck.push(s));
    }
  }

  let totalMinutes = 0;
  let foundAny = false;

  if (reasonsToCheck.length > 0 && Array.isArray(variables) && variables.length > 0) {
    for (const r of reasonsToCheck) {
      const rNorm = r.toLowerCase().trim();
      const matchedVar = variables.find(
        (v: any) =>
          v &&
          v.category === 'Modèle Raison Prestation' &&
          (String(v.nom || '').toLowerCase().trim() === rNorm || String(v.id || '').trim() === r)
      );
      if (
        matchedVar &&
        matchedVar.dureePrestation !== undefined &&
        matchedVar.dureePrestation !== null &&
        String(matchedVar.dureePrestation).trim() !== ''
      ) {
        const d = Number(matchedVar.dureePrestation);
        if (!isNaN(d) && d > 0) {
          totalMinutes += d;
          foundAny = true;
        }
      }
    }
  }

  if (!foundAny && mission.dureePrestation !== undefined && mission.dureePrestation !== null) {
    const direct = Number(mission.dureePrestation);
    if (!isNaN(direct) && direct > 0) {
      totalMinutes = direct;
      foundAny = true;
    }
  }

  return foundAny && totalMinutes > 0 ? `${totalMinutes} min(s)` : '';
}

function formatTimeAgo(updatedAt: number | undefined, now: number): string {
  if (!updatedAt || isNaN(updatedAt) || updatedAt <= 0) {
    return 'Position en direct';
  }
  const diffSec = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (diffSec < 60) {
    return "Il y a moins d'1 min";
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `Il y a ${diffMin} min`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `Il y a ${diffHours} h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `Il y a ${diffDays} j`;
}

function createMissionPassageIcon(bgColor: string, label: string | number): L.DivIcon {
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
        border: none;
        box-shadow: none;
        cursor: pointer;
        user-select: none;
        box-sizing: border-box;
      ">
        ${label}
      </div>
    `,
    iconSize: [43, 43],
    iconAnchor: [21.5, 21.5],
    popupAnchor: [0, -22],
  });
}

function createCheckerboardDepartureIcon(): L.DivIcon {
  return L.divIcon({
    className: 'defibeo-tour-route-marker-icon',
    html: `
      <div style="
        width: 43px;
        height: 43px;
        min-width: 43px;
        min-height: 43px;
        border-radius: 9999px;
        background-color: #000000;
        background-image: repeating-conic-gradient(#000000 0% 25%, #ffffff 0% 50%);
        background-size: 14px 14px;
        background-position: center;
        border: none;
        box-shadow: none;
        user-select: none;
        box-sizing: border-box;
      "></div>
    `,
    iconSize: [43, 43],
    iconAnchor: [21.5, 21.5],
  });
}

function createLegPillIcon(leg: RouteLegSegmentInfo, isWebapp?: boolean): L.DivIcon {
  const safeDay = escapeHtml(leg.dayLabel || 'J1');
  const text = `Temps estimé point ${escapeHtml(leg.fromLabel)} vers ${escapeHtml(leg.toLabel)}: ${leg.minutes} min(s) pour ${escapeHtml(leg.kmFormatted)} km(s).`;

  return L.divIcon({
    className: 'defibeo-tour-route-leg-pill-icon',
    html: `
      <div
        class="defibeo-leg-pill-card ${isWebapp ? 'defibeo-leg-pill-webapp' : ''}"
        style="
          --leg-offset-y: ${leg.offsetY}px;
          transform: translate(-50%, calc(-50% + ${leg.offsetY}px));
          transform-origin: center center;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          width: max-content;
          max-width: ${isWebapp ? '98vw' : 'none'};
          box-sizing: border-box;
          background-color: #ffffff;
          color: #000000;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif;
          font-size: 18px;
          font-weight: 600;
          padding: 6px 14px 6px 8px;
          border-radius: 9999px;
          border: none;
          box-shadow: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          user-select: none;
          line-height: 1.25;
        "
      >
        <span style="
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 34px;
          height: 34px;
          padding: 0 8px;
          border-radius: 9999px;
          background-color: #000000;
          color: #ffffff;
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
          flex-shrink: 0;
        ">${safeDay}</span>
        <span style="overflow: hidden; text-overflow: ellipsis;">${text}</span>
      </div>
    `,
  });
}

function createLiveTechPinIcon(name: string, updatedAt: number | undefined, nowTs: number): L.DivIcon {
  const safeName = escapeHtml(name);
  const timeAgoLabel = escapeHtml(formatTimeAgo(updatedAt, nowTs));

  return L.divIcon({
    className: 'defibeo-tour-route-live-tech-icon',
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        width: max-content;
        transform: translate(-50%, calc(-100% + 7px));
        pointer-events: auto;
      ">
        <div style="
          background-color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 8px 12px;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif;
          white-space: nowrap;
          text-align: left;
          margin-bottom: 10px;
          box-shadow: none;
        ">
          <div style="font-size: 18px; font-weight: bold; color: #000000; line-height: 1.25;">${safeName}</div>
          <div style="font-size: 18px; font-weight: 100; color: #000000; line-height: 1.25; margin-top: 2px;">${timeAgoLabel}</div>
        </div>
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background-color: rgb(210, 45, 11);
          border: none;
          box-shadow: 0 0 0 7px rgba(210, 45, 11, 0.35);
          animation: defibeo-route-tech-sonar 2s infinite ease-out;
          flex-shrink: 0;
        "></div>
      </div>
    `,
  });
}

function buildNavigationHref(
  addressQuery: string,
  coord: Coordinate,
  isWebapp?: boolean,
  preferredNavApp?: string
): string {
  const targetQuery =
    addressQuery && addressQuery.trim() !== ''
      ? addressQuery.trim()
      : `${coord.lat},${coord.lng}`;
  const encoded = encodeURIComponent(targetQuery);

  if (!isWebapp) {
    return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  }

  const app = String(preferredNavApp || 'google-maps').toLowerCase().trim();
  if (app === 'waze') {
    return `https://waze.com/ul?q=${encoded}&navigate=yes`;
  }
  if (app === 'apple-maps' || app === 'apple' || app === 'plans') {
    return `https://maps.apple.com/?q=${encoded}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

const animatedRunnerIcon = L.divIcon({
  className: 'defibeo-tour-route-runner-icon',
  html: `
    <div style="
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: #ff4f00;
      background-color: #ff4f00;
      box-shadow: 0 0 0 5px rgba(255, 79, 0, 0.32);
      border: none;
      pointer-events: none;
    "></div>
  `,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/**
 * Animates a point moving along the road polyline in a continuous loop
 * at a slower, calm speed to show the direction of travel.
 */
function AnimatedRouteDot({ roadPositions }: { roadPositions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (!roadPositions || roadPositions.length < 2) return;

    const segLengths: number[] = [];
    const cumLengths: number[] = [0];
    let totalLen = 0;

    for (let i = 0; i < roadPositions.length - 1; i++) {
      const a = roadPositions[i];
      const b = roadPositions[i + 1];
      const dLat = b[0] - a[0];
      const dLng = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) * 0.5 * Math.PI) / 180);
      const len = Math.sqrt(dLat * dLat + dLng * dLng);
      segLengths.push(len);
      totalLen += len;
      cumLengths.push(totalLen);
    }

    if (totalLen <= 0) return;

    const marker = L.marker(roadPositions[0], {
      icon: animatedRunnerIcon,
      interactive: false,
      zIndexOffset: -1000,
    }).addTo(map);

    // Slower speed along the route trace
    const DURATION_MS = Math.max(36000, Math.min(72000, Math.round(totalLen * 32000)));
    const startTime = performance.now();
    let rafId = 0;

    const animate = (now: number) => {
      const elapsed = (now - startTime) % DURATION_MS;
      const progress = elapsed / DURATION_MS;
      const targetDist = progress * totalLen;

      let low = 0;
      let high = segLengths.length - 1;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (cumLengths[mid + 1] < targetDist) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }

      const segLen = segLengths[low] || 0;
      const segStartDist = cumLengths[low] || 0;
      const t = segLen > 0 ? Math.min(1, Math.max(0, (targetDist - segStartDist) / segLen)) : 0;

      const pA = roadPositions[low];
      const pB = roadPositions[low + 1] || pA;
      const lat = pA[0] + (pB[0] - pA[0]) * t;
      const lng = pA[1] + (pB[1] - pA[1]) * t;

      marker.setLatLng([lat, lng]);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      try {
        map.removeLayer(marker);
      } catch (_) {}
    };
  }, [roadPositions, map]);

  return null;
}

function AutoFitRouteBounds({
  techStartPoint,
  points,
  roadPositions,
}: {
  techStartPoint: TechStartPoint | null;
  points: RouteMissionPoint[];
  roadPositions: [number, number][];
}) {
  const map = useMap();
  const fittedRef = useRef<string>('');

  useEffect(() => {
    const fallbackPoints: [number, number][] = [
      ...(techStartPoint ? [techStartPoint.displayCoord] : []),
      ...points.map(p => p.displayCoord),
    ];
    const allLatLngs: [number, number][] =
      roadPositions.length >= 2 ? roadPositions : fallbackPoints;

    if (allLatLngs.length === 0) return;

    const sig = `${techStartPoint ? `${techStartPoint.coord.lat.toFixed(4)},${techStartPoint.coord.lng.toFixed(4)}` : 'none'}_${points
      .map(p => `${p.passageNumber}:${p.coord.lat.toFixed(4)},${p.coord.lng.toFixed(4)}`)
      .join('|')}_${roadPositions.length}`;
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
  }, [techStartPoint, points, roadPositions, map]);

  return null;
}

function getPointAlongPolyline(path: [number, number][], fraction = 0.5): [number, number] {
  if (path.length === 0) return [46.603354, 1.888334];
  if (path.length === 1) return path[0];
  const clampedFraction = Math.max(0.15, Math.min(0.85, fraction));
  if (path.length === 2) {
    return [
      path[0][0] + (path[1][0] - path[0][0]) * clampedFraction,
      path[0][1] + (path[1][1] - path[0][1]) * clampedFraction,
    ];
  }

  let total = 0;
  const segs: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const dLat = path[i + 1][0] - path[i][0];
    const dLng = path[i + 1][1] - path[i][1];
    const l = Math.sqrt(dLat * dLat + dLng * dLng);
    segs.push(l);
    total += l;
  }

  if (total <= 0) return path[Math.floor(path.length * clampedFraction)];
  const target = total * clampedFraction;
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= target) {
      const r = segs[i] > 0 ? (target - acc) / segs[i] : 0.5;
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * r,
        path[i][1] + (path[i + 1][1] - path[i][1]) * r,
      ];
    }
    acc += segs[i];
  }
  return path[Math.floor(path.length * clampedFraction)];
}

function formatKmValue(km: number): string {
  if (!isFinite(km) || km <= 0) return '0,1';
  const rounded = Math.round(km * 10) / 10;
  return rounded % 1 === 0 ? String(rounded.toFixed(0)) : rounded.toFixed(1).replace('.', ',');
}

async function fetchRouteGeometryAndLegs(
  waypoints: { coord: Coordinate; label: string; dateIso: string }[],
  baseTourDateIso: string
): Promise<{
  roadPositions: [number, number][];
  legSegments: RouteLegSegmentInfo[];
}> {
  if (waypoints.length < 2) {
    return {
      roadPositions: waypoints.map(w => [w.coord.lat, w.coord.lng]),
      legSegments: [],
    };
  }

  const fullPath: [number, number][] = [];
  const rawLegs: {
    id: string;
    dayLabel: string;
    fromLabel: string;
    toLabel: string;
    minutes: number;
    kmFormatted: string;
    legPath: [number, number][];
    midpoint: [number, number];
    offsetY: number;
  }[] = [];

  const CHUNK_SIZE = 25;

  for (let startIdx = 0; startIdx < waypoints.length - 1; startIdx += CHUNK_SIZE - 1) {
    const chunk = waypoints.slice(startIdx, startIdx + CHUNK_SIZE);
    if (chunk.length < 2) break;

    const coordQuery = chunk.map(w => `${w.coord.lng},${w.coord.lat}`).join(';');
    const endpoints = [
      `https://router.project-osrm.org/route/v1/driving/${coordQuery}?overview=full&geometries=geojson&steps=true`,
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordQuery}?overview=full&geometries=geojson&steps=true`,
    ];

    let routeData: any = null;

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          if (json?.routes?.[0]?.geometry?.coordinates?.length >= 2) {
            routeData = json.routes[0];
            break;
          }
        }
      } catch (_) {}
    }

    if (routeData) {
      const chunkGeom: [number, number][] = routeData.geometry.coordinates.map(
        (pair: [number, number]) => [pair[1], pair[0]]
      );
      if (fullPath.length > 0 && chunkGeom.length > 0) {
        fullPath.push(...chunkGeom.slice(1));
      } else {
        fullPath.push(...chunkGeom);
      }

      const osrmLegs: any[] = Array.isArray(routeData.legs) ? routeData.legs : [];
      for (let j = 0; j < chunk.length - 1; j++) {
        const wpA = chunk[j];
        const wpB = chunk[j + 1];
        const osrmLeg = osrmLegs[j];

        const stepCoords: [number, number][] = [[wpA.coord.lat, wpA.coord.lng]];
        if (osrmLeg && Array.isArray(osrmLeg.steps)) {
          osrmLeg.steps.forEach((st: any) => {
            const cList = st?.geometry?.coordinates;
            if (Array.isArray(cList)) {
              cList.forEach((p: [number, number]) => {
                if (Array.isArray(p) && p.length >= 2) {
                  stepCoords.push([p[1], p[0]]);
                }
              });
            }
          });
        }
        stepCoords.push([wpB.coord.lat, wpB.coord.lng]);

        const legPath: [number, number][] =
          stepCoords.length >= 2
            ? stepCoords
            : [
                [wpA.coord.lat, wpA.coord.lng],
                [wpB.coord.lat, wpB.coord.lng],
              ];

        const distKm =
          osrmLeg && typeof osrmLeg.distance === 'number' && osrmLeg.distance > 0
            ? osrmLeg.distance / 1000
            : Math.max(0.1, getHaversineDistance(wpA.coord, wpB.coord) * 1.25);

        const durationMins =
          osrmLeg && typeof osrmLeg.duration === 'number' && osrmLeg.duration > 0
            ? Math.max(1, Math.round(osrmLeg.duration / 60))
            : Math.max(
                1,
                Math.round(
                  (distKm / (distKm > 80 ? 85 : distKm > 25 ? 65 : 45)) * 60
                )
              );

        const segmentDateIso = wpB.dateIso || wpA.dateIso || baseTourDateIso;
        const dayLabel = computeDayLabel(segmentDateIso, baseTourDateIso);
        const legIdx = startIdx + j;

        rawLegs.push({
          id: `leg_${legIdx}_${wpA.label}_${wpB.label}`,
          dayLabel,
          fromLabel: wpA.label,
          toLabel: wpB.label,
          minutes: durationMins,
          kmFormatted: formatKmValue(distKm),
          legPath,
          midpoint: getPointAlongPolyline(legPath, 0.5),
          offsetY: 0,
        });
      }
    } else {
      for (let j = 0; j < chunk.length - 1; j++) {
        const wpA = chunk[j];
        const wpB = chunk[j + 1];
        const distKm = Math.max(0.1, getHaversineDistance(wpA.coord, wpB.coord) * 1.25);
        const durationMins = Math.max(
          1,
          Math.round((distKm / (distKm > 80 ? 85 : distKm > 25 ? 65 : 45)) * 60)
        );
        const seg: [number, number][] = [
          [wpA.coord.lat, wpA.coord.lng],
          [wpB.coord.lat, wpB.coord.lng],
        ];
        if (fullPath.length > 0) {
          fullPath.push(seg[1]);
        } else {
          fullPath.push(...seg);
        }
        const segmentDateIso = wpB.dateIso || wpA.dateIso || baseTourDateIso;
        const dayLabel = computeDayLabel(segmentDateIso, baseTourDateIso);
        const legIdx = startIdx + j;

        rawLegs.push({
          id: `leg_${legIdx}_${wpA.label}_${wpB.label}`,
          dayLabel,
          fromLabel: wpA.label,
          toLabel: wpB.label,
          minutes: durationMins,
          kmFormatted: formatKmValue(distKm),
          legPath: seg,
          midpoint: getPointAlongPolyline(seg, 0.5),
          offsetY: 0,
        });
      }
    }
  }

  // Compute overall route bounding span to detect pills that would visually collide at initial zoom
  let maxSpanKm = 10;
  for (let i = 0; i < waypoints.length; i++) {
    for (let k = i + 1; k < waypoints.length; k++) {
      const d = getHaversineDistance(waypoints[i].coord, waypoints[k].coord);
      if (d > maxSpanKm) maxSpanKm = d;
    }
  }
  const collisionRadiusKm = Math.max(1.5, maxSpanKm * 0.16);

  // Spread pills along their own segment path & vertical offset when two leg midpoints are close
  const fractions = [0.5, 0.35, 0.65, 0.25, 0.75];
  for (let i = 0; i < rawLegs.length; i++) {
    let overlapCount = 0;
    for (let k = 0; k < i; k++) {
      const d = getHaversineDistance(
        { lat: rawLegs[i].midpoint[0], lng: rawLegs[i].midpoint[1] },
        { lat: rawLegs[k].midpoint[0], lng: rawLegs[k].midpoint[1] }
      );
      if (d < collisionRadiusKm) {
        overlapCount++;
      }
    }
    if (overlapCount > 0) {
      const frac = fractions[overlapCount % fractions.length];
      rawLegs[i].midpoint = getPointAlongPolyline(rawLegs[i].legPath, frac);
      rawLegs[i].offsetY =
        overlapCount % 2 === 1
          ? 48 * Math.ceil(overlapCount / 2)
          : -48 * Math.ceil(overlapCount / 2);
    }
  }

  const legSegments: RouteLegSegmentInfo[] = rawLegs.map(l => ({
    id: l.id,
    dayLabel: l.dayLabel,
    fromLabel: l.fromLabel,
    toLabel: l.toLabel,
    minutes: l.minutes,
    kmFormatted: l.kmFormatted,
    midpoint: l.midpoint,
    offsetY: l.offsetY,
  }));

  return { roadPositions: fullPath, legSegments };
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
  isWebapp = false,
  preferredNavApp = 'google-maps',
  tenantId,
  companyInfo,
}) => {
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [techStartPoint, setTechStartPoint] = useState<TechStartPoint | null>(null);
  const [missionPoints, setMissionPoints] = useState<RouteMissionPoint[]>([]);
  const [roadPositions, setRoadPositions] = useState<[number, number][]>([]);
  const [legSegments, setLegSegments] = useState<RouteLegSegmentInfo[]>([]);

  // Initially hidden legend + technician position overlay panel, toggled by "Infos Affichage"
  const [showDisplayInfoPanel, setShowDisplayInfoPanel] = useState<boolean>(false);

  // Live technician position overlay toggle ("Superposer la position du technicien.")
  const [showLiveTechPosition, setShowLiveTechPosition] = useState<boolean>(false);
  const [liveTechLocation, setLiveTechLocation] = useState<TechLiveLocation | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  const effectiveTenantId = useMemo(() => {
    if (tenantId) return tenantId;
    try {
      return localStorage.getItem('defib_tenant_id') || 'demo';
    } catch (_) {
      return 'demo';
    }
  }, [tenantId]);

  const fetchSelectedTechLivePosition = useCallback(async () => {
    if (!technician) {
      setLiveTechLocation(null);
      return;
    }

    const techName = String(technician.name || '').trim();
    const normName = techName.toLowerCase();
    const normEmail = String(technician.email || '').trim().toLowerCase();

    try {
      let livetrackSheetUrl = String((companyInfo as any)?.spreadsheetLivetrack || '').trim();
      if (!livetrackSheetUrl) {
        try {
          livetrackSheetUrl =
            localStorage.getItem(`defib_${effectiveTenantId}_spreadsheet_livetrack`) ||
            localStorage.getItem(`defib_${effectiveTenantId.toUpperCase()}_spreadsheet_livetrack`) ||
            localStorage.getItem(`defib_${effectiveTenantId.toLowerCase()}_spreadsheet_livetrack`) ||
            '';
        } catch (_) {}
      }

      const params = new URLSearchParams({ tenantId: effectiveTenantId, refresh: 'true' });
      if (livetrackSheetUrl) {
        params.set('spreadsheetUrl', livetrackSheetUrl);
      }

      let found: TechLiveLocation | null = null;
      const res = await fetch(`/api/tech-locations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const locations = data?.locations || {};
        if (normName && locations[normName]) {
          const loc = locations[normName];
          const lat = Number(loc.lat);
          const lng = Number(loc.lng);
          if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
            found = {
              name: loc.name || techName,
              email: loc.email || technician.email,
              lat,
              lng,
              updatedAt: loc.updatedAt,
            };
          }
        }
        if (!found) {
          for (const [key, rawLoc] of Object.entries(locations)) {
            const loc = rawLoc as any;
            const kLower = String(key || '').trim().toLowerCase();
            const nLower = String(loc?.name || '').trim().toLowerCase();
            const eLower = String(loc?.email || '').trim().toLowerCase();
            if (
              (normName && (kLower === normName || nLower === normName || kLower.includes(normName) || normName.includes(nLower))) ||
              (normEmail && eLower && eLower === normEmail)
            ) {
              const lat = Number(loc?.lat);
              const lng = Number(loc?.lng);
              if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
                found = {
                  name: loc.name || techName,
                  email: loc.email || technician.email,
                  lat,
                  lng,
                  updatedAt: loc.updatedAt,
                };
                break;
              }
            }
          }
        }
      }

      if (!found && technician.lastKnownLat !== undefined && technician.lastKnownLng !== undefined) {
        const mLat = Number(technician.lastKnownLat);
        const mLng = Number(technician.lastKnownLng);
        if (!isNaN(mLat) && !isNaN(mLng) && (mLat !== 0 || mLng !== 0)) {
          found = {
            name: techName,
            email: technician.email,
            lat: mLat,
            lng: mLng,
            updatedAt: technician.lastKnownLocationAt ? Number(technician.lastKnownLocationAt) : undefined,
          };
        }
      }

      if (!found && techName) {
        try {
          const localLat = parseFloat(localStorage.getItem(`defib_${effectiveTenantId}_tech_live_lat_${techName}`) || '');
          const localLng = parseFloat(localStorage.getItem(`defib_${effectiveTenantId}_tech_live_lng_${techName}`) || '');
          const localAt = parseInt(localStorage.getItem(`defib_${effectiveTenantId}_tech_live_at_${techName}`) || '', 10);
          if (!isNaN(localLat) && !isNaN(localLng) && (localLat !== 0 || localLng !== 0)) {
            found = {
              name: techName,
              email: technician.email,
              lat: localLat,
              lng: localLng,
              updatedAt: !isNaN(localAt) ? localAt : undefined,
            };
          }
        } catch (_) {}
      }

      setNowTs(Date.now());
      setLiveTechLocation(found);
    } catch (_) {}
  }, [technician, effectiveTenantId, companyInfo]);

  useEffect(() => {
    if (!isOpen || !showLiveTechPosition) {
      return;
    }
    fetchSelectedTechLivePosition();
    const interval = setInterval(() => {
      fetchSelectedTechLivePosition();
    }, 15000);
    return () => clearInterval(interval);
  }, [isOpen, showLiveTechPosition, fetchSelectedTechLivePosition]);

  useEffect(() => {
    if (!isOpen || !tour || !technician) {
      setTechStartPoint(null);
      setMissionPoints([]);
      setRoadPositions([]);
      setLegSegments([]);
      return;
    }

    let cancelled = false;

    const buildOptimizedRoute = async () => {
      setIsLoadingRoute(true);

      try {
        // 1. Resolve technician departure & return coordinates & readable address
        let startCoord: Coordinate | null = null;
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

        if (!startCoord && composedTechAddress.trim()) {
          startCoord = await geocodeAddress(composedTechAddress);
        }

        if (!startCoord || cancelled) {
          setIsLoadingRoute(false);
          return;
        }

        const startPt: TechStartPoint = {
          coord: startCoord,
          displayCoord: [startCoord.lat, startCoord.lng],
          techName: technician.name || 'Technicien',
          addressLabel:
            composedTechAddress.trim() ||
            `${startCoord.lat.toFixed(5)}, ${startCoord.lng.toFixed(5)}`,
        };
        setTechStartPoint(startPt);

        // 2. Resolve coordinates and equipment details for every mission in the tour
        const equipmentCoords: Record<string, Coordinate> = {};
        const equipmentDetails: Record<string, any> = {};
        const rawMissions: any[] = Array.isArray(tour.missions) ? tour.missions : [];

        for (let i = 0; i < rawMissions.length; i++) {
          const m = rawMissions[i];
          const ident = m.defibIdentifiant || m.identifiant || '';
          const key = ident || m.id || `mission_${i}`;
          const defib = defibrillateurs.find(d => d.identifiant === ident || d.id === ident);
          const other = !defib ? otherEquipments.find(o => o.identifiant === ident || o.id === ident) : undefined;
          const formation =
            !defib && !other
              ? formations.find(
                  (f: any) =>
                    (m.formationId && f.id === m.formationId) ||
                    (ident && (f.identifiant === ident || f.id === ident))
                )
              : undefined;

          const eq: any = defib || other || formation;
          if (eq) {
            equipmentDetails[key] = eq;
            if (ident) {
              equipmentDetails[ident] = eq;
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
            if (ident) {
              equipmentCoords[ident] = { lat, lng };
            }
          } else {
            const addressParts = eq
              ? [eq.numVoie || eq.numeroVoie || eq.adresse || eq.lieu, eq.cp || eq.codePostal, eq.ville, eq.pays || 'France']
              : [m.address || m.lieu || m.nomSite, m.cp, m.ville, 'France'];
            const addressStr = addressParts.filter(Boolean).join(' ').trim();
            if (addressStr) {
              const geocoded = await geocodeAddress(addressStr);
              if (geocoded) {
                equipmentCoords[key] = geocoded;
                if (ident) {
                  equipmentCoords[ident] = geocoded;
                }
              }
            }
          }
        }

        if (cancelled) return;

        const normalizedMissions = rawMissions.map((m, idx) => ({
          ...m,
          defibIdentifiant: m.defibIdentifiant || m.identifiant || m.id || `mission_${idx}`,
        }));

        // 2b. Load spontaneous events integrated into this tour and resolve their coordinates
        const tourKeys = [
          tour.tourIdentifiant,
          tour.id,
          tour.title,
          tour.name,
        ]
          .map((v: any) => String(v || '').trim().toLowerCase())
          .filter(Boolean);

        let allSpontaneousEvents: any[] = [];
        try {
          const savedSpont =
            localStorage.getItem(`defib_${effectiveTenantId}_spontaneous_events`) ||
            localStorage.getItem('defib_spontaneous_events');
          if (savedSpont) {
            const parsed = JSON.parse(savedSpont);
            if (Array.isArray(parsed)) allSpontaneousEvents = parsed;
          }
        } catch (_) {}

        try {
          const sheetUrl =
            String((companyInfo as any)?.spreadsheetAutresEvents || (companyInfo as any)?.spreadsheetAutresEventsUrl || '').trim() ||
            localStorage.getItem(`defib_${effectiveTenantId}_spreadsheet_autres_events`) ||
            '';
          if (sheetUrl && sheetUrl.includes('docs.google.com/spreadsheets')) {
            const sessionTok = localStorage.getItem('defib_session_token') || '';
            const res = await fetch(
              `/api/sheets/collection?tenantId=${encodeURIComponent(effectiveTenantId)}&type=autresEvents&spreadsheetUrl=${encodeURIComponent(sheetUrl)}`,
              {
                headers: {
                  ...(sessionTok ? { 'x-defibeo-session': sessionTok } : {}),
                  'x-defibeo-tenant': effectiveTenantId,
                },
              }
            );
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data?.items) && data.items.length > 0) {
                const byId = new Map<string, any>();
                allSpontaneousEvents.forEach((ev: any) => {
                  if (ev?.id) byId.set(String(ev.id), ev);
                });
                data.items.forEach((it: any, idx: number) => {
                  const id = String(it.id || `spont_${effectiveTenantId}_${idx}`);
                  const existing = byId.get(id);
                  byId.set(id, {
                    ...existing,
                    ...it,
                    id,
                    tournee: String(it.tournee ?? it['Tournée'] ?? it['Tournée.'] ?? existing?.tournee ?? '').trim(),
                    voie: String(it.voie ?? it['Voie'] ?? it['Voie.'] ?? existing?.voie ?? '').trim(),
                    latitude: it.latitude ?? it['Latitude'] ?? it['Latitude.'] ?? existing?.latitude,
                    longitude: it.longitude ?? it['Longitude'] ?? it['Longitude.'] ?? existing?.longitude,
                  });
                });
                allSpontaneousEvents = Array.from(byId.values());
              }
            }
          }
        } catch (_) {}

        const matchedSpontaneousEvents = allSpontaneousEvents.filter((ev: any) => {
          if (!ev) return false;
          const evTourVals = [
            ev.tournee,
            ev.tourId,
            ev.tourTitle,
            ev['Tournée'],
            ev['Tournée.'],
          ]
            .map((v: any) => String(v || '').trim().toLowerCase())
            .filter(Boolean);
          if (evTourVals.length === 0) return false;
          return evTourVals.some((tv: string) => tourKeys.includes(tv));
        });

        const spontaneousRouteItems: any[] = [];
        for (let i = 0; i < matchedSpontaneousEvents.length; i++) {
          const ev = matchedSpontaneousEvents[i];
          const spontKey = `spont_route_${ev.id || i}`;
          let lat = parseFloat(String(ev.latitude ?? '').replace(',', '.'));
          let lng = parseFloat(String(ev.longitude ?? '').replace(',', '.'));
          let coord: Coordinate | null = null;
          if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
            coord = { lat, lng };
          } else {
            const voieStr = String(ev.voie || '').trim();
            if (voieStr) {
              coord = await geocodeAddress(voieStr);
            }
          }
          if (coord) {
            equipmentCoords[spontKey] = coord;
            const isoDt = normalizeDateToIso(ev.date) || normalizeDateToIso(tour.startDate) || '';
            spontaneousRouteItems.push({
              id: spontKey,
              defibIdentifiant: spontKey,
              _isSpontaneousEvent: true,
              _spontaneousEvent: ev,
              isForced: true,
              isManualDate: Boolean(isoDt),
              isManualSlot: Boolean(ev.creneau),
              estimatedDate: isoDt,
              estimatedSlot: String(ev.creneau || '9:00am').trim(),
              address: String(ev.voie || '').trim(),
              latitude: coord.lat,
              longitude: coord.lng,
              intitule: String(ev.intitule || 'Événement spontané').trim(),
              commentaire: String(ev.commentaire || '').trim(),
            });
          }
        }

        if (cancelled) return;

        const combinedRouteItems = [...normalizedMissions, ...spontaneousRouteItems];

        // 3. Optimize route order taking into account technician startCoord, preference ('proche' / 'loin'), and forced dates/slots
        const rawPref = String(technician.optimizationPreference || '').toLowerCase();
        const preference: 'loin' | 'proche' =
          rawPref.includes('loin') || rawPref.includes('éloigné') || rawPref.includes('eloigne')
            ? 'loin'
            : 'proche';

        const sortedMissions = sortMissionsByProximity(
          combinedRouteItems,
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
          const onlyRealMissions = scheduledMissions.filter((m: any) => !m?._isSpontaneousEvent);
          onCalculatedMissions(tour.id, onlyRealMissions);
        }

        // 4. Build mission marker points with slight visual offset if two missions share identical coordinates
        const clientMap = new Map<string, Client>();
        (clients || []).forEach(c => {
          if (c.id) clientMap.set(String(c.id).trim(), c);
          if (c.clientId) clientMap.set(String(c.clientId).trim(), c);
        });

        const builtPoints: RouteMissionPoint[] = [];

        scheduledMissions.forEach((m: any, idx: number) => {
          const ident = m.defibIdentifiant || m.identifiant || '';
          const key = ident || m.id || `mission_${idx}`;
          const coord = equipmentCoords[key] || (ident ? equipmentCoords[ident] : undefined);
          if (!coord) return;

          const rawDate = m.estimatedDate || tour.startDate || '';
          const estimatedDateIso = normalizeDateToIso(rawDate);
          const estimatedDateFormatted = rawDate ? formatDateToFR(rawDate) : 'Non définie';
          const estimatedSlotLabel =
            m.estimatedSlot && String(m.estimatedSlot).trim() !== ''
              ? String(m.estimatedSlot).trim()
              : 'Non défini';

          if (m._isSpontaneousEvent) {
            builtPoints.push({
              mission: m,
              passageNumber: idx + 1,
              coord,
              displayCoord: [coord.lat, coord.lng],
              bgColor: '#000000',
              equipmentIdentifiant: String(m.intitule || 'Événement spontané').trim(),
              equipmentTypeLabel: 'Événement spontané',
              clientLabel: String(m.commentaire || '—').trim(),
              addressQuery: String(m.address || '').trim(),
              estimatedDateIso,
              estimatedDateFormatted,
              estimatedSlotLabel,
              estimatedDurationLabel: '',
              isSpontaneousEvent: true,
            });
            return;
          }

          const defib = defibrillateurs.find(d => d.identifiant === ident || d.id === ident);
          const other = !defib ? otherEquipments.find(o => o.identifiant === ident || o.id === ident) : undefined;
          const eq: any = defib || other || equipmentDetails[key];

          const equipmentIdentifiant = String(ident || eq?.identifiant || m.interventionReference || `Mission ${idx + 1}`).trim();

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

          const rawClientId = String(eq?.clientId || m.clientId || '').trim();
          const matchedClient = rawClientId ? clientMap.get(rawClientId) : undefined;
          const clientLabel =
            matchedClient?.denomination ||
            eq?.clientNom ||
            m.clientName ||
            eq?.nomSite ||
            m.nomSite ||
            'Client non renseigné';

          const addrParts = eq
            ? [eq.numVoie || eq.numeroVoie || eq.adresse || eq.lieu, eq.cp || eq.codePostal, eq.ville, eq.pays || 'France']
            : [m.address || m.lieu || m.nomSite, m.cp, m.ville, 'France'];
          const addressQuery = addrParts.filter(Boolean).join(', ').trim();

          const estimatedDurationLabel = computeMissionDurationFromVariables(m, variables);

          builtPoints.push({
            mission: m,
            passageNumber: idx + 1,
            coord,
            displayCoord: [coord.lat, coord.lng],
            bgColor: getMissionStatusPictogramColor(m.status),
            equipmentIdentifiant,
            equipmentTypeLabel,
            clientLabel,
            addressQuery,
            estimatedDateIso,
            estimatedDateFormatted,
            estimatedSlotLabel,
            estimatedDurationLabel,
          });
        });

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

        // Determine base tour start date (ISO YYYY-MM-DD) for J1, J2, ... calculation
        let baseTourDateIso = normalizeDateToIso(tour.startDate);
        const validMissionDates = builtPoints
          .map(p => p.estimatedDateIso)
          .filter(Boolean)
          .sort();
        if (!baseTourDateIso && validMissionDates.length > 0) {
          baseTourDateIso = validMissionDates[0];
        } else if (baseTourDateIso && validMissionDates.length > 0 && validMissionDates[0] < baseTourDateIso) {
          baseTourDateIso = validMissionDates[0];
        }

        const firstDayIso = builtPoints[0]?.estimatedDateIso || baseTourDateIso;
        const lastDayIso = builtPoints[builtPoints.length - 1]?.estimatedDateIso || baseTourDateIso;

        // 5. Fetch real road geometry and per-leg travel time & distance pills: D -> 1 -> ... -> N -> D
        const orderedWaypoints: { coord: Coordinate; label: string; dateIso: string }[] = [
          { coord: startCoord, label: 'D', dateIso: firstDayIso },
          ...builtPoints.map(p => ({
            coord: p.coord,
            label: String(p.passageNumber),
            dateIso: p.estimatedDateIso || baseTourDateIso,
          })),
          { coord: startCoord, label: 'D', dateIso: lastDayIso },
        ];
        const { roadPositions: roadGeom, legSegments: computedLegs } =
          await fetchRouteGeometryAndLegs(orderedWaypoints, baseTourDateIso);
        if (!cancelled) {
          setRoadPositions(roadGeom);
          setLegSegments(computedLegs);
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
        .defibeo-tour-route-marker-icon,
        .defibeo-tour-route-runner-icon,
        .defibeo-tour-route-leg-pill-icon,
        .defibeo-tour-route-live-tech-icon {
          background: transparent !important;
          border: none !important;
          width: auto !important;
          height: auto !important;
        }
        .defibeo-route-hover-popup .leaflet-popup-content-wrapper {
          background-color: #ffffff !important;
          border: none !important;
          border-radius: 16px !important;
          box-shadow: none !important;
          padding: 0 !important;
          height: auto !important;
          max-height: none !important;
          color: #000000 !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        .defibeo-route-hover-popup .leaflet-popup-content {
          margin: 0 !important;
          padding: 18px !important;
          height: auto !important;
          max-height: none !important;
          width: auto !important;
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        .defibeo-route-hover-popup .defibeo-route-type-pill {
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        .defibeo-route-hover-popup .leaflet-popup-tip-container {
          display: none !important;
        }
        @media (max-width: 767px) {
          .defibeo-leg-pill-card {
            transform: translate(-50%, calc(-50% + calc(var(--leg-offset-y, 0px) * 0.25))) scale(0.25) !important;
            transform-origin: center center !important;
            max-width: 392vw !important;
          }
          #tour-route-map-legend-panel {
            max-width: min(280px, calc(100vw - 32px)) !important;
          }
        }
        @keyframes defibeo-route-tech-sonar {
          0% {
            box-shadow: 0 0 0 6px rgba(210, 45, 11, 0.38), 0 0 0 0 rgba(210, 45, 11, 0.55);
          }
          70% {
            box-shadow: 0 0 0 8px rgba(210, 45, 11, 0.32), 0 0 0 18px rgba(210, 45, 11, 0);
          }
          100% {
            box-shadow: 0 0 0 6px rgba(210, 45, 11, 0.38), 0 0 0 0 rgba(210, 45, 11, 0);
          }
        }
      `}</style>

      <div className="relative w-full h-full flex-1">
        {/* Top-Left Floating Sticky Legend + Technician Live Position Toggle (Shown when "Infos Affichage" is clicked) */}
        {showDisplayInfoPanel && (
          <div
            className="absolute top-4 left-4 z-[4000] flex flex-col select-none pointer-events-auto"
            style={{
              gap: '10px',
              maxWidth: 'min(340px, calc(100vw - 32px))',
            }}
            id="tour-route-map-legend-panel"
          >
            {/* Legend Card */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                padding: '16px 18px',
                boxShadow: 'none',
                border: 'none',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              }}
            >
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#000000',
                  marginBottom: '10px',
                  lineHeight: 1.25,
                }}
              >
                Légende des couleurs:
              </div>
              <div
                className="flex flex-col"
                style={{ gap: '8px' }}
              >
                {MISSION_STATUS_LEGEND.map(item => (
                  <div
                    key={item.label}
                    className="flex items-center"
                    style={{ gap: '10px' }}
                  >
                    <span
                      className="rounded-full shrink-0"
                      style={{
                        width: '16px',
                        height: '16px',
                        backgroundColor: item.color,
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#000000',
                        lineHeight: 1.25,
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Toggle ON/OFF: Superposer la position du technicien. */}
            <div
              onClick={() => setShowLiveTechPosition(prev => !prev)}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                padding: '14px 18px',
                boxShadow: 'none',
                border: 'none',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                cursor: 'pointer',
              }}
              className="flex items-center justify-between gap-3"
            >
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#000000',
                  lineHeight: 1.25,
                }}
              >
                Superposer la position du technicien.
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showLiveTechPosition}
                onClick={e => {
                  e.stopPropagation();
                  setShowLiveTechPosition(prev => !prev);
                }}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '9999px',
                  backgroundColor: showLiveTechPosition ? '#2e54ff' : '#cbd5e1',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: showLiveTechPosition ? '22px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: 'none',
                  }}
                />
              </button>
            </div>
          </div>
        )}

        {/* Top-Center Loading Indicator while computing road trace */}
        {isLoadingRoute && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[4000] py-2.5 px-5 rounded-full flex items-center justify-center pointer-events-none animate-fadeIn"
            style={{
              backgroundColor: '#2e54ff',
              color: '#ffffff',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              fontSize: '18px',
              boxShadow: 'none',
              border: 'none',
            }}
          >
            <span>Chargement du parcours.</span>
          </div>
        )}

        {/* Action Buttons ("Infos Affichage" on the left + "Fermer" on the right):
            Top-Right on Main Software (50%/50% on mobile), Floating Sticky Bottom 50%/50% on Webapp */}
        {!isWebapp ? (
          <div className="fixed bottom-0 left-0 right-0 p-4 sm:bottom-auto sm:left-auto sm:top-4 sm:right-4 sm:p-0 z-[4000] flex items-center gap-3 pointer-events-auto">
            <button
              type="button"
              onClick={() => setShowDisplayInfoPanel(prev => !prev)}
              id="btn-tour-route-map-info"
              style={{
                backgroundColor: '#2e54ff',
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
              className="w-1/2 sm:w-auto hover:opacity-90 cursor-pointer select-none text-center"
            >
              Infos Affichage
            </button>
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
              className="w-1/2 sm:w-auto hover:opacity-90 cursor-pointer select-none text-center"
            >
              Fermer
            </button>
          </div>
        ) : (
          <div className="fixed bottom-0 left-0 right-0 p-4 z-[4000] flex items-center gap-3 pointer-events-auto">
            <button
              type="button"
              onClick={() => setShowDisplayInfoPanel(prev => !prev)}
              id="btn-tour-route-map-info-webapp"
              style={{
                backgroundColor: '#2e54ff',
                boxShadow: 'none',
                borderRadius: '14px',
                fontSize: '18px',
                padding: '14px 20px',
                fontWeight: 'bold',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                width: '50%',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              }}
              className="w-1/2 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer select-none text-center"
            >
              Infos
            </button>
            <button
              type="button"
              onClick={onClose}
              id="btn-tour-route-map-close-webapp"
              style={{
                backgroundColor: 'rgb(210, 45, 11)',
                boxShadow: 'none',
                borderRadius: '14px',
                fontSize: '18px',
                padding: '14px 20px',
                fontWeight: 'bold',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                width: '50%',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              }}
              className="w-1/2 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer select-none text-center"
            >
              Fermer
            </button>
          </div>
        )}

        <MapContainer
          center={[46.603354, 1.888334]}
          zoom={6}
          style={{ width: '100%', height: '100%', minHeight: '100vh', backgroundColor: '#f8fafc' }}
          zoomControl={false}
        >
          {!isWebapp && <ZoomControl position="bottomright" />}

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          <AutoFitRouteBounds
            techStartPoint={techStartPoint}
            points={missionPoints}
            roadPositions={roadPositions}
          />

          {/* Orange road-following trace */}
          {roadPositions.length >= 2 && (
            <>
              <Polyline
                positions={roadPositions}
                pathOptions={{
                  color: '#ff4f00',
                  weight: 5,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <AnimatedRouteDot roadPositions={roadPositions} />
            </>
          )}

          {/* Per-Leg Estimated Time & Distance Pills along the route */}
          {legSegments.map(leg => (
            <Marker
              key={leg.id}
              position={leg.midpoint}
              icon={createLegPillIcon(leg, isWebapp)}
              interactive={false}
              zIndexOffset={500}
            />
          ))}

          {/* Live Technician Position Overlay (when toggle is ON) */}
          {showLiveTechPosition && liveTechLocation && (
            <Marker
              position={[liveTechLocation.lat, liveTechLocation.lng]}
              icon={createLiveTechPinIcon(
                liveTechLocation.name,
                liveTechLocation.updatedAt,
                nowTs
              )}
              zIndexOffset={2500}
            />
          )}

          {/* Technician Départ & Retour Point (Checkerboard without 'D' and without hover popup) */}
          {techStartPoint && (
            <Marker
              position={techStartPoint.displayCoord}
              icon={createCheckerboardDepartureIcon()}
              interactive={false}
              zIndexOffset={1500}
            />
          )}

          {/* Mission Points (Status color circle + Passage number inside + Hover/Click Popup with 'Y aller') */}
          {missionPoints.map(pt => {
            const icon = createMissionPassageIcon(pt.bgColor, pt.passageNumber);
            const navHref = buildNavigationHref(
              pt.addressQuery,
              pt.coord,
              isWebapp,
              preferredNavApp
            );

            return (
              <Marker
                key={`${pt.mission.id || pt.equipmentIdentifiant}_${pt.passageNumber}`}
                position={pt.displayCoord}
                icon={icon}
                zIndexOffset={4000}
                eventHandlers={{
                  mouseover: e => {
                    e.target.openPopup();
                  },
                  click: e => {
                    e.target.openPopup();
                  },
                }}
              >
                <Popup closeButton={false} className="defibeo-route-hover-popup">
                  <div
                    style={{
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      color: '#000000',
                      fontSize: '18px',
                      lineHeight: '1.45',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      height: 'auto',
                      maxHeight: 'none',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '18px',
                        color: '#000000',
                        marginBottom: '6px',
                      }}
                    >
                      {pt.equipmentIdentifiant}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <span
                        className="defibeo-route-type-pill"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: '1000px',
                          backgroundColor: 'rgb(61, 220, 132)',
                          color: 'rgb(19, 100, 55)',
                          fontSize: '18px',
                          fontWeight: 700,
                          padding: '5px 14px',
                          lineHeight: '1.25',
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                        }}
                      >
                        {pt.equipmentTypeLabel}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#000000',
                        marginBottom: '4px',
                      }}
                    >
                      {pt.isSpontaneousEvent ? 'Commentaire :' : 'Client :'}{' '}
                      <span style={{ fontWeight: 400 }}>{pt.clientLabel}</span>
                    </div>
                    {pt.isSpontaneousEvent && pt.addressQuery && (
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 600,
                          color: '#000000',
                          marginBottom: '4px',
                        }}
                      >
                        Adresse : <span style={{ fontWeight: 400 }}>{pt.addressQuery}</span>
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#000000',
                        marginBottom: '4px',
                      }}
                    >
                      Date estimée : <span style={{ fontWeight: 400 }}>{pt.estimatedDateFormatted}</span>
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#000000',
                        marginBottom: pt.isSpontaneousEvent ? '12px' : '4px',
                      }}
                    >
                      Créneau estimé : <span style={{ fontWeight: 400 }}>{pt.estimatedSlotLabel}</span>
                    </div>
                    {!pt.isSpontaneousEvent && (
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 600,
                          color: '#000000',
                          marginBottom: '12px',
                        }}
                      >
                        Durée estimée :{' '}
                        {pt.estimatedDurationLabel ? (
                          <span style={{ fontWeight: 400 }}>{pt.estimatedDurationLabel}</span>
                        ) : null}
                      </div>
                    )}
                    <div>
                      <a
                        href={navHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          backgroundColor: '#2e54ff',
                          color: '#ffffff',
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                          fontSize: '18px',
                          fontWeight: 700,
                          padding: '10px 18px',
                          borderRadius: '12px',
                          textDecoration: 'none',
                          border: 'none',
                          boxShadow: 'none',
                          cursor: 'pointer',
                        }}
                        className="hover:opacity-90 transition-opacity"
                      >
                        Y aller
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};
export default TourRouteMapModal;
