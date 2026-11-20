import { CttGlobalRules, DEFAULT_CTT_GLOBAL_RULES } from '../types';
import { loadCttGlobalRules } from './cttRules';

// FSM Routing and Schedule Optimizer

export interface Coordinate {
  lat: number;
  lng: number;
}

// Memory cache for geocoded starting addresses to keep client responsive and avoid redundant network calls
const geocodeCache: Record<string, Coordinate> = {};

/**
 * Fetches the coordinates of a French address using the free, official and CORS-friendly French Government Address API.
 */
export async function geocodeAddress(address: string): Promise<Coordinate | null> {
  if (!address || address.trim() === '') return null;
  const cleaned = address.trim();
  if (geocodeCache[cleaned]) {
    return geocodeCache[cleaned];
  }

  try {
    const response = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(cleaned)}&limit=1`
    );
    if (response.ok) {
      const data = await response.json();
      if (data?.features?.[0]?.geometry?.coordinates) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        const coord = { lat, lng };
        geocodeCache[cleaned] = coord;
        return coord;
      }
    }
  } catch (error) {
    // API data.gouv failed or network error, fallback below
  }

  // Fallback to OpenStreetMap Nominatim for international or other addresses
  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleaned)}&limit=1`
    );
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      if (nomData && nomData.length > 0 && nomData[0].lat && nomData[0].lon) {
        const coord = { lat: parseFloat(nomData[0].lat), lng: parseFloat(nomData[0].lon) };
        geocodeCache[cleaned] = coord;
        return coord;
      }
    }
  } catch (e) {
    console.error('Failed to geocode address via fallback:', cleaned, e);
  }

  return null;
}

/**
 * Calculates the Haversine distance between two coordinates in kilometers.
 */
export function getHaversineDistance(c1: Coordinate, c2: Coordinate): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the travel duration in whole hours (1h, 2h, 3h, 4h, etc.)
 * between the technician's starting departure coordinates and the first mission coordinates.
 * In accordance with business rules: "on fonctionne d'heure en heure, donc il faut déterminer
 * dans le calcul du trajet si le technicien a besoin de 1h, 2h, 3h, 4h, etc.... selon son point de départ
 * pour déterminer l'heure probable/estimée de la première mission."
 */
export async function calculateFirstMissionTravelHours(
  startCoord: Coordinate | null,
  firstCoord: Coordinate | null
): Promise<number> {
  if (!startCoord || !firstCoord) return 0;
  if (
    typeof startCoord.lat !== 'number' ||
    typeof startCoord.lng !== 'number' ||
    typeof firstCoord.lat !== 'number' ||
    typeof firstCoord.lng !== 'number' ||
    isNaN(startCoord.lat) ||
    isNaN(startCoord.lng) ||
    isNaN(firstCoord.lat) ||
    isNaN(firstCoord.lng)
  ) {
    return 0;
  }

  const distKm = getHaversineDistance(startCoord, firstCoord);
  // If departure location is essentially identical to the first mission (< 200m), no travel needed
  if (distKm < 0.2) return 0;

  let travelMinutes = 0;

  // 1. Try real road routing via OSRM with a strict 2s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const url = `https://router.project-osrm.org/route/v1/driving/${startCoord.lng},${startCoord.lat};${firstCoord.lng},${firstCoord.lat}?overview=false`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      if (data?.routes?.[0]?.duration !== undefined) {
        const sec = Number(data.routes[0].duration);
        if (!isNaN(sec) && sec > 0) {
          travelMinutes = sec / 60;
        }
      }
    }
  } catch (err) {
    // Network offline or timeout, proceed to fallback
  }

  // 2. High-precision fallback based on real road driving conditions in France
  if (travelMinutes <= 0) {
    const roadDistKm = distKm * 1.25; // 1.25 road curvature factor
    let avgSpeedKmH = 40; // Urban / local
    if (roadDistKm > 80) {
      avgSpeedKmH = 85; // Highway / express
    } else if (roadDistKm > 25) {
      avgSpeedKmH = 65; // National / departmental
    }
    travelMinutes = (roadDistKm / avgSpeedKmH) * 60;
  }

  // Rule: "on fonctionne d'heure en heure, donc il faut déterminer dans le calcul du trajet si le technicien à besoin de 1h, 2h, 3h, 4h, etc."
  const hoursNeeded = Math.max(1, Math.ceil(travelMinutes / 60));
  return hoursNeeded;
}

/**
 * Utility to parse time slot like "14:00pm" or "8:30am" or "14:00" into total minutes from midnight.
 */
export function parseSlotToMinutes(slot: string): number {
  if (!slot) return 480; // Default to 08:00
  const clean = String(slot).trim();
  const match = clean.match(/^(\d+):(\d+)\s*(am|pm)?$/i);
  if (!match) return 480;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toLowerCase() : '';
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export function normalizeIsoDateStr(rawDate: any, fallbackIso?: string): string {
  const s = String(rawDate ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  if (s) {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return formatDate(parsed);
    }
  }
  const fb = String(fallbackIso ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fb)) return fb;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(fb)) {
    const [d, m, y] = fb.split('/');
    return `${y}-${m}-${d}`;
  }
  return formatDate(new Date());
}

export function normalizeSlotString(rawSlot: any): string {
  const s = String(rawSlot ?? '').trim();
  if (!s || s === '--:--' || s.toLowerCase() === '-- non défini --' || s.toLowerCase() === 'non renseigné') {
    return '8:00am';
  }
  const mins = parseSlotToMinutes(s);
  const clamped = Math.max(480, Math.min(1140, Math.round(mins / 30) * 30));
  return formatMinutesToSlot(clamped);
}

export function isMissionForcedSlotOrDate(m: any): boolean {
  if (!m) return false;
  const isFormation = Boolean(
    m.equipmentType === 'Formation' ||
    m.equipmentType?.toLowerCase().includes('formation') ||
    m.formationId ||
    m._isSpontaneousEvent
  );
  if (isFormation) return true;

  const rawPrio = String(m.priority ?? '').trim();
  if (m.isForced === false || rawPrio === '0' || rawPrio.toLowerCase() === 'false') return false;
  if (rawPrio === '1' || rawPrio.toLowerCase() === 'true') return true;
  if (m.isForced === true) return true;

  return Boolean(m.isManualDate && m.isManualSlot);
}

/**
 * Orders missions using a Traveling Salesperson algorithm.
 * Starts from the technician's start address and proceeds point-by-point:
 * - For the first point from the technician's start address, picks either the closest (proche)
 *   or furthest (loin) point according to the technician's preference.
 * - Then optimizes the route point-by-point through all remaining points.
 * - If any missions have forced dates/slots, respects their chronological constraints and adjusts
 *   the route around them (allowing back-and-forth trips when forced dates/slots require it).
 */
export function sortMissionsByProximity(
  missions: any[],
  startCoord: Coordinate,
  equipmentCoords: Record<string, Coordinate>,
  preference: 'loin' | 'proche' = 'proche',
  tourStartDate?: string,
  variables?: any[]
): any[] {
  if (!missions || missions.length === 0) return [];

  const normPref: 'loin' | 'proche' =
    String(preference || '').toLowerCase().includes('loin') ||
    String(preference || '').toLowerCase().includes('éloigné') ||
    String(preference || '').toLowerCase().includes('eloigne')
      ? 'loin'
      : 'proche';

  const hasForced = missions.some(m => isMissionForcedSlotOrDate(m));

  if (!hasForced) {
    return sortSingleSegment(missions, startCoord, equipmentCoords, normPref, true);
  }

  // Separate forced vs non-forced missions
  const forcedMissions = missions.filter(m => isMissionForcedSlotOrDate(m));
  const nonForcedMissions = missions.filter(m => !isMissionForcedSlotOrDate(m));

  const baseDateStr = normalizeIsoDateStr(tourStartDate);

  // Sort forced missions chronologically by (estimatedDate, estimatedSlot)
  const sortedForced = [...forcedMissions].sort((a, b) => {
    const dateA = normalizeIsoDateStr(a.estimatedDate, baseDateStr);
    const dateB = normalizeIsoDateStr(b.estimatedDate, baseDateStr);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const slotA = parseSlotToMinutes(a.estimatedSlot || '8:00am');
    const slotB = parseSlotToMinutes(b.estimatedSlot || '8:00am');
    return slotA - slotB;
  });

  if (nonForcedMissions.length === 0) {
    return sortedForced;
  }

  // Interleave non-forced missions into the available time windows before/between/after forced missions
  const unvisitedNonForced = [...nonForcedMissions];
  const result: any[] = [];
  let currentCoord: Coordinate = startCoord;
  let cursorDateStr = baseDateStr;
  let cursorMins = 480; // 08:00 start of day

  const pickNextNonForcedIdx = (fromCoord: Coordinate, isVeryFirstPick: boolean): number => {
    let bestIdx = -1;
    const useFarthest = isVeryFirstPick && normPref === 'loin';
    let bestDist = useFarthest ? -1 : Infinity;

    for (let i = 0; i < unvisitedNonForced.length; i++) {
      const cand = unvisitedNonForced[i];
      const cCoord = equipmentCoords[cand.defibIdentifiant];
      if (!cCoord) continue;
      const d = getHaversineDistance(fromCoord, cCoord);
      if (useFarthest) {
        if (d > bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      } else {
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
    }
    return bestIdx !== -1 ? bestIdx : 0;
  };

  const advanceSimulatedCursor = (
    cDateStr: string,
    cMins: number,
    durationMins: number,
    isFirstOfTour: boolean,
    candCoord?: Coordinate
  ): { startDateStr: string; startMins: number; endDateStr: string; endMins: number } => {
    let simDate = new Date(`${cDateStr}T00:00:00`);
    if (isNaN(simDate.getTime())) simDate = new Date();
    let simMins = Math.ceil(Math.max(480, cMins) / 30) * 30;

    if (isFirstOfTour && candCoord) {
      const distKm = getHaversineDistance(startCoord, candCoord);
      if (distKm >= 0.2) {
        const roadDistKm = distKm * 1.25;
        const speed = roadDistKm > 80 ? 85 : roadDistKm > 25 ? 65 : 40;
        const travelHours = Math.max(1, Math.ceil(((roadDistKm / speed) * 60) / 60));
        simMins = Math.max(simMins, 480 + travelHours * 60);
      }
    }

    // Respect lunch break around 12:00 - 13:00
    if (simMins < 720 && simMins + durationMins > 780) {
      simMins = 780;
    } else if (simMins >= 720 && simMins < 780) {
      simMins = 780;
    }

    if (simMins + durationMins > 1080) {
      simDate = addDays(simDate, 1);
      simMins = 480;
    }

    const startDateStr = formatDate(simDate);
    const nextSlotMins = Math.ceil((simMins + durationMins) / 30) * 30;
    return {
      startDateStr,
      startMins: simMins,
      endDateStr: startDateStr,
      endMins: simMins + durationMins > nextSlotMins ? simMins + durationMins : nextSlotMins,
    };
  };

  for (const forcedM of sortedForced) {
    const fDateStr = normalizeIsoDateStr(forcedM.estimatedDate, cursorDateStr);
    const fStartMins = parseSlotToMinutes(forcedM.estimatedSlot || '8:00am');
    const fDuration = getMissionDurationInMinutes(forcedM.reason || '', variables, forcedM);

    // Fit as many non-forced missions as possible before forcedM's (fDateStr, fStartMins)
    while (unvisitedNonForced.length > 0) {
      const candIdx = pickNextNonForcedIdx(currentCoord, result.length === 0);
      const cand = unvisitedNonForced[candIdx];
      const candCoord = equipmentCoords[cand.defibIdentifiant];
      const candDuration = getMissionDurationInMinutes(cand.reason || '', variables, cand);

      const sim = advanceSimulatedCursor(cursorDateStr, cursorMins, candDuration, result.length === 0, candCoord);

      const fitsBeforeForced =
        sim.endDateStr < fDateStr ||
        (sim.endDateStr === fDateStr && sim.startMins + candDuration <= fStartMins);

      if (fitsBeforeForced) {
        unvisitedNonForced.splice(candIdx, 1);
        result.push(cand);
        cursorDateStr = sim.endDateStr;
        cursorMins = Math.ceil((sim.startMins + candDuration) / 30) * 30;
        if (cursorMins >= 1080) {
          const nextDay = addDays(new Date(`${cursorDateStr}T00:00:00`), 1);
          if (!isNaN(nextDay.getTime())) {
            cursorDateStr = formatDate(nextDay);
            cursorMins = 480;
          }
        }
        if (candCoord) {
          currentCoord = candCoord;
        }
      } else {
        break;
      }
    }

    // Place the forced mission at its forced time
    result.push(forcedM);
    const fCoord = equipmentCoords[forcedM.defibIdentifiant];
    if (fCoord) {
      currentCoord = fCoord;
    }
    const fEndSlotMins = Math.ceil((fStartMins + fDuration) / 30) * 30;
    if (fDateStr > cursorDateStr || (fDateStr === cursorDateStr && fEndSlotMins > cursorMins)) {
      cursorDateStr = fDateStr;
      cursorMins = fEndSlotMins;
      if (cursorMins >= 1080) {
        const nextDay = addDays(new Date(`${cursorDateStr}T00:00:00`), 1);
        if (!isNaN(nextDay.getTime())) {
          cursorDateStr = formatDate(nextDay);
          cursorMins = 480;
        }
      }
    }
  }

  // Append any remaining non-forced missions starting from the last visited coordinate
  if (unvisitedNonForced.length > 0) {
    const remainingSorted = sortSingleSegment(
      unvisitedNonForced,
      currentCoord,
      equipmentCoords,
      normPref,
      result.length === 0
    );
    result.push(...remainingSorted);
  }

  return result;
}

function sortSingleSegment(
  missions: any[],
  startCoord: Coordinate,
  equipmentCoords: Record<string, Coordinate>,
  preference: 'loin' | 'proche' = 'proche',
  isFirstFromDeparture: boolean = true
): any[] {
  if (missions.length <= 1) return [...missions];

  const noCoordsMissions = missions.filter(m => !equipmentCoords[m.defibIdentifiant]);
  const hasCoordsMissions = missions.filter(m => equipmentCoords[m.defibIdentifiant]);

  const unvisited = [...hasCoordsMissions];
  const ordered: any[] = [];
  let currentCoord = startCoord;

  while (unvisited.length > 0) {
    let selectedIdx = -1;
    // Only use 'loin' (furthest point) on the very first step from the technician's departure point;
    // subsequent steps chain nearest-neighbor to build a coherent optimized route.
    const pickFurthest = isFirstFromDeparture && ordered.length === 0 && preference === 'loin';
    let selectedDist = pickFurthest ? -1 : Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const m = unvisited[i];
      const coord = equipmentCoords[m.defibIdentifiant];
      if (!coord) continue;
      const dist = getHaversineDistance(currentCoord, coord);

      if (pickFurthest) {
        if (dist > selectedDist) {
          selectedDist = dist;
          selectedIdx = i;
        }
      } else {
        if (dist < selectedDist) {
          selectedDist = dist;
          selectedIdx = i;
        }
      }
    }

    if (selectedIdx !== -1) {
      const [chosenMission] = unvisited.splice(selectedIdx, 1);
      ordered.push(chosenMission);
      currentCoord = equipmentCoords[chosenMission.defibIdentifiant] || currentCoord;
    } else {
      ordered.push(...unvisited);
      break;
    }
  }

  // Apply 2-opt local optimization on ordered[1..n-1] while keeping ordered[0] fixed as the chosen starting mission
  if (ordered.length >= 4) {
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 50) {
      improved = false;
      iterations++;
      for (let i = 1; i < ordered.length - 2; i++) {
        for (let k = i + 1; k < ordered.length - 1; k++) {
          const cPrev = equipmentCoords[ordered[i - 1].defibIdentifiant];
          const cI = equipmentCoords[ordered[i].defibIdentifiant];
          const cK = equipmentCoords[ordered[k].defibIdentifiant];
          const cNext = equipmentCoords[ordered[k + 1].defibIdentifiant];
          if (!cPrev || !cI || !cK || !cNext) continue;

          const currentDist =
            getHaversineDistance(cPrev, cI) + getHaversineDistance(cK, cNext);
          const newDist =
            getHaversineDistance(cPrev, cK) + getHaversineDistance(cI, cNext);

          if (newDist + 0.01 < currentDist) {
            const reversed = ordered.slice(i, k + 1).reverse();
            ordered.splice(i, k - i + 1, ...reversed);
            improved = true;
          }
        }
      }
    }
  }

  return [...ordered, ...noCoordsMissions];
}

/**
 * Utility to format minutes from midnight into slot strings matching option values (e.g., "14:00pm" or "8:30am").
 */
function formatMinutesToSlot(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const mm = m < 30 ? '00' : '30';
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h}:${mm}${suffix}`;
}

/**
 * Formats a Date object to "YYYY-MM-DD".
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Increments a Date object by 1 day.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const FRENCH_DAYS = [
  'Dimanche', // 0
  'Lundi',    // 1
  'Mardi',    // 2
  'Mercredi', // 3
  'Jeudi',    // 4
  'Vendredi', // 5
  'Samedi'    // 6
];

function parseTimeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

function getEquipmentIntervals(date: Date, eq: any): { start: number; end: number }[] {
  if (!eq) {
    // Default standard workday: 08:00 to 18:00
    return [{ start: 480, end: 1080 }];
  }

  // 1. Parse schedules if present
  let parsedSchedules: any[] = [];
  if (eq.horaires) {
    try {
      parsedSchedules = JSON.parse(eq.horaires);
    } catch (e) {
      parsedSchedules = [];
    }
  }

  const hasDefinedSchedules = Array.isArray(parsedSchedules) && parsedSchedules.some((s: any) => s.days && s.days.length > 0);

  if (hasDefinedSchedules) {
    const dayName = FRENCH_DAYS[date.getDay()];
    const todaySchedule = parsedSchedules.find((s: any) => s.days && s.days.includes(dayName));
    if (!todaySchedule) {
      return []; // Closed on this day
    }

    if (todaySchedule.fermetureMidi) {
      const intervals = [];
      const openMorning = parseTimeStringToMinutes(todaySchedule.openMorning || '09:00');
      const closeMorning = parseTimeStringToMinutes(todaySchedule.closeMorning || '12:00');
      const openAfternoon = parseTimeStringToMinutes(todaySchedule.openAfternoon || '14:00');
      const closeAfternoon = parseTimeStringToMinutes(todaySchedule.closeAfternoon || '18:00');

      if (closeMorning > openMorning) {
        intervals.push({ start: openMorning, end: closeMorning });
      }
      if (closeAfternoon > openAfternoon) {
        intervals.push({ start: openAfternoon, end: closeAfternoon });
      }
      return intervals;
    } else {
      const openContinuous = parseTimeStringToMinutes(todaySchedule.openContinuous || '09:00');
      const closeContinuous = parseTimeStringToMinutes(todaySchedule.closeContinuous || '17:00');
      if (closeContinuous > openContinuous) {
        return [{ start: openContinuous, end: closeContinuous }];
      }
      return [];
    }
  }

  // 2. Fallback to basic week/weekend/24/7 flags
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;

  let isOpen = false;
  if (eq.acces247 === true) {
    isOpen = true;
  } else if (isWeekend) {
    isOpen = eq.accesWeekend === true;
  } else {
    isOpen = eq.accesSemaine === true || eq.accesSemaine === undefined;
  }

  if (isOpen) {
    // Default to technician standard hours: 08:00 to 18:00
    return [{ start: 480, end: 1080 }];
  }

  return [];
}

function getTechnicianIntervals(date: Date, tech: any): { start: number; end: number }[] {
  if (!tech || !tech.semaineTypique || !Array.isArray(tech.semaineTypique) || tech.semaineTypique.length === 0) {
    // Default standard workday: 08:00 to 18:00 (480 to 1080)
    return [{ start: 480, end: 1080 }];
  }

  const dayName = FRENCH_DAYS[date.getDay()];
  const todaySchedule = tech.semaineTypique.find((s: any) => s.days && s.days.includes(dayName));
  if (!todaySchedule) {
    return []; // Closed/Off on this day
  }

  if (todaySchedule.openForMissions === false) {
    return []; // Not open for missions on this schedule slot
  }

  if (todaySchedule.fermetureMidi) {
    const intervals = [];
    const openMorning = parseTimeStringToMinutes(todaySchedule.openMorning || '08:00');
    const closeMorning = parseTimeStringToMinutes(todaySchedule.closeMorning || '12:00');
    const openAfternoon = parseTimeStringToMinutes(todaySchedule.openAfternoon || '14:00');
    const closeAfternoon = parseTimeStringToMinutes(todaySchedule.closeAfternoon || '18:00');

    if (closeMorning > openMorning) {
      intervals.push({ start: openMorning, end: closeMorning });
    }
    if (closeAfternoon > openAfternoon) {
      intervals.push({ start: openAfternoon, end: closeAfternoon });
    }
    return intervals;
  } else {
    const openContinuous = parseTimeStringToMinutes(todaySchedule.openContinuous || '08:00');
    const closeContinuous = parseTimeStringToMinutes(todaySchedule.closeContinuous || '18:00');
    if (closeContinuous > openContinuous) {
      return [{ start: openContinuous, end: closeContinuous }];
    }
    return [];
  }
}

function getOverlappingIntervals(date: Date, eq: any, tech?: any): { start: number; end: number }[] {
  const eqIntervals = getEquipmentIntervals(date, eq);
  const techIntervals = getTechnicianIntervals(date, tech);

  const overlaps: { start: number; end: number }[] = [];
  for (const eqInt of eqIntervals) {
    for (const techInt of techIntervals) {
      const start = Math.max(eqInt.start, techInt.start);
      const end = Math.min(eqInt.end, techInt.end);
      if (end > start) {
        overlaps.push({ start, end });
      }
    }
  }
  return overlaps;
}

/**
 * Determines if the given day of the week conforms to the opening/access rules.
 * Day of week: 0 = Sunday, 6 = Saturday, 1-5 = Monday-Friday.
 */
function isDateOpenForEquipment(date: Date, eq: any, tech?: any): boolean {
  return getOverlappingIntervals(date, eq, tech).length > 0;
}

export function getMissionDurationInMinutes(reason: string, variables?: any[], mission?: any): number {
  // 1. Direct dureePrestation on mission if present
  if (mission && mission.dureePrestation !== undefined && !isNaN(Number(mission.dureePrestation)) && Number(mission.dureePrestation) > 0) {
    return Number(mission.dureePrestation) + 30; // 30 minutes of travel time
  }

  // 2. Look up duration in variables for Modèle Raison Prestation
  if (Array.isArray(variables) && variables.length > 0) {
    const reasonsToCheck: string[] = [];
    if (mission && Array.isArray(mission.reasons) && mission.reasons.length > 0) {
      reasonsToCheck.push(...mission.reasons);
    } else if (reason) {
      reasonsToCheck.push(...reason.split(',').map((s: string) => s.trim()).filter(Boolean));
    }

    let foundDuration = 0;
    let anyFound = false;
    for (const r of reasonsToCheck) {
      const matchVar = variables.find((v: any) => 
        v.category === 'Modèle Raison Prestation' && 
        (v.nom?.toLowerCase().trim() === r.toLowerCase().trim() || v.id === r)
      );
      if (matchVar && matchVar.dureePrestation !== undefined && matchVar.dureePrestation !== null && !isNaN(Number(matchVar.dureePrestation))) {
        const d = Number(matchVar.dureePrestation);
        if (d > 0) {
          foundDuration += d;
          anyFound = true;
        }
      }
    }

    if (anyFound && foundDuration > 0) {
      return foundDuration + 30; // Prestation duration + 30 minutes of travel time
    }
  }

  // 3. Fallback to existing text parsing
  if (!reason) return 75; // Default: 45 + 30 = 75
  const normalized = reason.toLowerCase();
  
  let interventionMinutes = 45; // Default
  if (normalized.includes('1h30')) {
    interventionMinutes = 90;
  } else if (normalized.includes('1h')) {
    interventionMinutes = 60;
  } else if (normalized.includes('30min') || normalized.includes('30 mins') || normalized.includes('30mins')) {
    interventionMinutes = 30;
  }
  
  return interventionMinutes + 30; // 30 minutes of travel time
}

/**
 * Auto-schedules optimized tour missions sequentially.
 * Allocates time dynamically per mission based on the selected reason, plus 30 mins for travel.
 * Standard workhours: 08:00 to 18:00.
 * If locked/forced overrides exist on date or slot (Verrouillage / Priorité '1' / Accepté Client / À faire),
 * strictly preserves them and adjusts all non-locked missions around them!
 */
export function scheduleMissions(
  missions: any[],
  tourStartDate: string,
  equipmentDetails: Record<string, any>,
  tech?: any,
  firstMissionTravelHours: number = 0,
  variables?: any[],
  customCttRules?: CttGlobalRules,
  allTours?: any[]
): any[] {
  if (!missions || missions.length === 0) return [];
  const cttRules: CttGlobalRules = customCttRules || loadCttGlobalRules();

  const baseTourDateIso = normalizeIsoDateStr(tourStartDate);
  let currentCursorDate = new Date(`${baseTourDateIso}T00:00:00`);
  if (isNaN(currentCursorDate.getTime())) {
    currentCursorDate = new Date();
  }
  let currentCursorMinutes = 0;

  // Helper to test if a candidate slot on targetDate violates CTT rules or overlaps an already scheduled/locked mission
  const checkCttCandidate = (
    targetDateStr: string,
    candStart: number,
    duration: number,
    prevScheduled: any[],
    remainingLockedMissions: any[]
  ) => {
    let adjustedStart = Math.ceil(candStart / 30) * 30;

    // Rule 0: Avoid overlapping any already-scheduled mission or locked mission on targetDateStr
    const sameDayFixed = [
      ...prevScheduled.filter(m => m && m.estimatedDate === targetDateStr && m.estimatedSlot),
      ...remainingLockedMissions.filter(
        m => m && normalizeIsoDateStr(m.estimatedDate, baseTourDateIso) === targetDateStr && m.estimatedSlot
      ),
    ];

    let changedByCollision = true;
    let safetyIter = 0;
    while (changedByCollision && safetyIter < 30) {
      changedByCollision = false;
      safetyIter++;
      for (const fixedM of sameDayFixed) {
        const fStart = parseSlotToMinutes(fixedM.estimatedSlot || '8:00am');
        const fDur = getMissionDurationInMinutes(fixedM.reason || '', variables, fixedM);
        const fEnd = Math.ceil((fStart + fDur) / 30) * 30;
        if (adjustedStart < fEnd && adjustedStart + duration > fStart) {
          adjustedStart = fEnd;
          changedByCollision = true;
        }
      }
    }

    // Rule 1: Max daily amplitude
    if (cttRules.maxDailyAmplitudeEnabled && cttRules.maxDailyAmplitudeHours > 0) {
      const dayMissions = prevScheduled.filter(m => m && m.estimatedDate === targetDateStr && m.estimatedSlot);
      if (dayMissions.length > 0) {
        const earliest = Math.min(...dayMissions.map(m => parseSlotToMinutes(m.estimatedSlot)));
        const amplitude = adjustedStart + duration - earliest;
        if (amplitude > cttRules.maxDailyAmplitudeHours * 60) {
          return { valid: false, reason: 'max_amplitude' };
        }
      }
    }

    // Rule 2: Min consecutive rest from day - 1
    if (cttRules.minConsecutiveRestEnabled && cttRules.minConsecutiveRestHours > 0) {
      const dTarget = new Date(`${targetDateStr}T00:00:00`);
      const yesterday = formatDate(addDays(dTarget, -1));
      let yesterdayMissions = prevScheduled.filter(m => m && m.estimatedDate === yesterday && m.estimatedSlot);

      if (yesterdayMissions.length === 0 && Array.isArray(allTours) && tech?.name) {
        const otherTours = allTours.filter(
          ot =>
            ot &&
            ot.techName &&
            String(ot.techName).trim().toLowerCase() === String(tech.name).trim().toLowerCase()
        );
        for (const ot of otherTours) {
          const otActive = (ot.missions || []).filter((m: any) => {
            const mDate = normalizeIsoDateStr(m?.estimatedDate || ot.startDate, baseTourDateIso);
            return mDate === yesterday && m?.estimatedSlot;
          });
          if (otActive.length > 0) {
            yesterdayMissions.push(...otActive);
          }
        }
      }

      if (yesterdayMissions.length > 0) {
        let maxEndYesterday = -Infinity;
        yesterdayMissions.forEach(m => {
          const s = parseSlotToMinutes(m.estimatedSlot);
          const d = getMissionDurationInMinutes(m.reason || '', variables, m);
          if (s + d > maxEndYesterday) maxEndYesterday = s + d;
        });
        if (maxEndYesterday !== -Infinity) {
          const earliestAllowed = Math.ceil((maxEndYesterday + cttRules.minConsecutiveRestHours * 60 - 1440) / 30) * 30;
          if (adjustedStart < earliestAllowed) {
            adjustedStart = earliestAllowed;
          }
        }
      }
    }

    // Rule 3: Min break rest between 12h and 14h (720 to 840 mins)
    if (cttRules.minBreakRestEnabled && cttRules.minBreakRestMinutes > 0) {
      const requiredBreak = cttRules.minBreakRestMinutes;
      const windowStart = 720; // 12h00
      const windowEnd = 840;   // 14h00

      const dayMissions = prevScheduled.filter(m => m && m.estimatedDate === targetDateStr && m.estimatedSlot);
      let maxPriorEnd = 0;
      dayMissions.forEach(m => {
        const s = parseSlotToMinutes(m.estimatedSlot);
        const d = getMissionDurationInMinutes(m.reason || '', variables, m);
        if (s + d > maxPriorEnd) maxPriorEnd = s + d;
      });

      if (maxPriorEnd >= windowStart && maxPriorEnd < windowEnd) {
        const breakEnd = Math.ceil((maxPriorEnd + requiredBreak) / 30) * 30;
        if (adjustedStart < breakEnd) {
          adjustedStart = breakEnd;
        }
      } else if (maxPriorEnd < windowStart) {
        if (adjustedStart >= windowStart && adjustedStart < windowStart + requiredBreak) {
          adjustedStart = Math.ceil((windowStart + requiredBreak) / 30) * 30;
        } else if (adjustedStart < windowStart && adjustedStart + duration > windowEnd - requiredBreak) {
          adjustedStart = Math.ceil((windowStart + requiredBreak) / 30) * 30;
        }
      }
    }

    // Re-verify no collision after break/rest adjustments
    for (const fixedM of sameDayFixed) {
      const fStart = parseSlotToMinutes(fixedM.estimatedSlot || '8:00am');
      const fDur = getMissionDurationInMinutes(fixedM.reason || '', variables, fixedM);
      const fEnd = Math.ceil((fStart + fDur) / 30) * 30;
      if (adjustedStart < fEnd && adjustedStart + duration > fStart) {
        return { valid: false, reason: 'collision_after_adjustment' };
      }
    }

    return { valid: true, adjustedStart };
  };

  const pending: any[] = [...missions];
  const scheduledResult: any[] = [];

  while (pending.length > 0) {
    const m = pending[0];
    const isForced = isMissionForcedSlotOrDate(m);

    if (isForced) {
      // 1. FORCED / LOCKED MISSION: Keep exact locked date and slot
      const forcedDate = normalizeIsoDateStr(m.estimatedDate, baseTourDateIso);
      const forcedSlot = normalizeSlotString(m.estimatedSlot || '8:00am');
      const duration = getMissionDurationInMinutes(m.reason || '', variables, m);
      const startMins = parseSlotToMinutes(forcedSlot);
      const endMins = Math.ceil((startMins + duration) / 30) * 30;

      scheduledResult.push({
        ...m,
        estimatedDate: forcedDate,
        estimatedSlot: forcedSlot,
        isForced: true,
        isManualDate: true,
        isManualSlot: true,
        priority: '1',
      });

      const curDateStr = formatDate(currentCursorDate);
      if (forcedDate > curDateStr || (forcedDate === curDateStr && endMins > currentCursorMinutes)) {
        currentCursorDate = new Date(`${forcedDate}T00:00:00`);
        if (isNaN(currentCursorDate.getTime())) {
          currentCursorDate = new Date(`${baseTourDateIso}T00:00:00`);
        }
        currentCursorMinutes = endMins;
        if (currentCursorMinutes >= 1080) {
          currentCursorDate = addDays(currentCursorDate, 1);
          currentCursorMinutes = 0;
        }
      }

      pending.shift();
    } else {
      // 2. NON-FORCED MISSION: Check if there is a forced mission ahead in pending
      const nextForcedIdxInPending = pending.findIndex(item => isMissionForcedSlotOrDate(item));
      const remainingLockedMissions = pending.filter(item => isMissionForcedSlotOrDate(item));

      if (nextForcedIdxInPending === -1) {
        // No remaining forced missions: standard forward scheduling
        const eq = equipmentDetails[m.defibIdentifiant];
        const duration = getMissionDurationInMinutes(m.reason || '', variables, m);

        let assignedStartMinutes = 480;
        let daysChecked = 0;
        while (true) {
          let intervals = getOverlappingIntervals(currentCursorDate, eq, tech);
          if (intervals.length === 0 || daysChecked > 30) {
            intervals = [{ start: 480, end: 1080 }];
          }
          let found = false;
          const candDateStr = formatDate(currentCursorDate);

          for (const interval of intervals) {
            let candidateStart = Math.ceil(Math.max(currentCursorMinutes, interval.start) / 30) * 30;

            if (scheduledResult.length === 0 && firstMissionTravelHours > 0) {
              const techInts = getTechnicianIntervals(currentCursorDate, tech);
              const dayTechStart = techInts.length > 0 && techInts[0].start ? techInts[0].start : 480;
              const earliestArrival = dayTechStart + firstMissionTravelHours * 60;
              candidateStart = Math.ceil(Math.max(candidateStart, earliestArrival, interval.start) / 30) * 30;
            }

            const cttCheck = checkCttCandidate(
              candDateStr,
              candidateStart,
              duration,
              scheduledResult,
              remainingLockedMissions
            );
            if (!cttCheck.valid) {
              continue;
            }
            if (cttCheck.adjustedStart !== undefined && cttCheck.adjustedStart > candidateStart) {
              candidateStart = cttCheck.adjustedStart;
            }

            if (candidateStart + duration <= interval.end) {
              assignedStartMinutes = candidateStart;
              found = true;
              break;
            }
          }
          if (found || daysChecked > 31) break;
          currentCursorDate = addDays(currentCursorDate, 1);
          currentCursorMinutes = 0;
          daysChecked++;
        }

        const assignedDate = formatDate(currentCursorDate);
        const assignedSlot = formatMinutesToSlot(assignedStartMinutes);

        scheduledResult.push({
          ...m,
          estimatedDate: assignedDate,
          estimatedSlot: assignedSlot,
          isForced: false,
          isManualDate: false,
          isManualSlot: false,
          priority: '0',
        });

        currentCursorMinutes = Math.ceil((assignedStartMinutes + duration) / 30) * 30;
        if (currentCursorMinutes >= 1080) {
          currentCursorDate = addDays(currentCursorDate, 1);
          currentCursorMinutes = 0;
        }
        pending.shift();
      } else {
        // There is a next forced mission at pending[nextForcedIdxInPending]
        const nextForcedMission = pending[nextForcedIdxInPending];
        const nextForcedDateStr = normalizeIsoDateStr(nextForcedMission.estimatedDate, baseTourDateIso);
        const nextForcedSlotStr = normalizeSlotString(nextForcedMission.estimatedSlot || '8:00am');
        const nextForcedStartMins = parseSlotToMinutes(nextForcedSlotStr);

        const eq = equipmentDetails[m.defibIdentifiant];
        const duration = getMissionDurationInMinutes(m.reason || '', variables, m);

        let candidateStartMins = 480;
        let daysChecked = 0;
        let candidateDate = new Date(currentCursorDate);
        let tempCursorMins = currentCursorMinutes;
        let foundForward = false;

        while (daysChecked <= 30) {
          const candDateStr = formatDate(candidateDate);
          if (candDateStr > nextForcedDateStr) break;

          let intervals = getOverlappingIntervals(candidateDate, eq, tech);
          if (intervals.length === 0) {
            intervals = [{ start: 480, end: 1080 }];
          }

          for (const interval of intervals) {
            let candStart =
              candDateStr === formatDate(currentCursorDate)
                ? Math.ceil(Math.max(tempCursorMins, interval.start) / 30) * 30
                : Math.ceil(interval.start / 30) * 30;

            if (scheduledResult.length === 0 && firstMissionTravelHours > 0) {
              const techInts = getTechnicianIntervals(candidateDate, tech);
              const dayTechStart = techInts.length > 0 && techInts[0].start ? techInts[0].start : 480;
              const earliestArrival = dayTechStart + firstMissionTravelHours * 60;
              candStart = Math.ceil(Math.max(candStart, earliestArrival, interval.start) / 30) * 30;
            }

            const cttCheck = checkCttCandidate(
              candDateStr,
              candStart,
              duration,
              scheduledResult,
              remainingLockedMissions
            );
            if (!cttCheck.valid) {
              continue;
            }
            if (cttCheck.adjustedStart !== undefined && cttCheck.adjustedStart > candStart) {
              candStart = cttCheck.adjustedStart;
            }

            const candEnd = candStart + duration;

            if (candDateStr < nextForcedDateStr) {
              if (candEnd <= interval.end) {
                candidateStartMins = candStart;
                foundForward = true;
                break;
              }
            } else if (candDateStr === nextForcedDateStr) {
              if (candEnd <= Math.min(interval.end, nextForcedStartMins)) {
                candidateStartMins = candStart;
                foundForward = true;
                break;
              }
            }
          }

          if (foundForward) break;
          candidateDate = addDays(candidateDate, 1);
          tempCursorMins = 0;
          daysChecked++;
        }

        if (foundForward) {
          const assignedDate = formatDate(candidateDate);
          const assignedSlot = formatMinutesToSlot(candidateStartMins);

          scheduledResult.push({
            ...m,
            estimatedDate: assignedDate,
            estimatedSlot: assignedSlot,
            isForced: false,
            isManualDate: false,
            isManualSlot: false,
            priority: '0',
          });

          currentCursorDate = candidateDate;
          currentCursorMinutes = Math.ceil((candidateStartMins + duration) / 30) * 30;
          if (currentCursorMinutes >= 1080) {
            currentCursorDate = addDays(currentCursorDate, 1);
            currentCursorMinutes = 0;
          }
          pending.shift();
        } else {
          // Cannot fit this non-forced mission before nextForcedMission:
          // Promote nextForcedMission to be scheduled immediately at its locked date/slot,
          // and adjust this non-forced mission (and subsequent ones) after it!
          const [promotedForced] = pending.splice(nextForcedIdxInPending, 1);
          pending.unshift(promotedForced);
        }
      }
    }
  }

  return scheduledResult;
}
