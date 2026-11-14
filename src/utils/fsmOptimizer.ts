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

export function isMissionForcedSlotOrDate(m: any): boolean {
  if (!m) return false;
  return Boolean(
    m.isForced ||
    (m.isManualDate && m.isManualSlot) ||
    m.equipmentType === 'Formation' ||
    m.equipmentType?.toLowerCase().includes('formation') ||
    m.formationId
  );
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

  const baseDateStr =
    (tourStartDate && /^\d{4}-\d{2}-\d{2}$/.test(tourStartDate.trim()))
      ? tourStartDate.trim()
      : new Date().toISOString().split('T')[0];

  // Sort forced missions chronologically by (estimatedDate, estimatedSlot)
  const sortedForced = [...forcedMissions].sort((a, b) => {
    const dateA = (a.estimatedDate && String(a.estimatedDate).trim()) || baseDateStr;
    const dateB = (b.estimatedDate && String(b.estimatedDate).trim()) || baseDateStr;
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
  ): { endDateStr: string; endMins: number } => {
    let simDate = new Date(cDateStr);
    if (isNaN(simDate.getTime())) simDate = new Date();
    let simMins = Math.max(480, cMins);

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

    return {
      endDateStr: formatDate(simDate),
      endMins: simMins + durationMins
    };
  };

  for (const forcedM of sortedForced) {
    const fDateStr = (forcedM.estimatedDate && String(forcedM.estimatedDate).trim()) || cursorDateStr;
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
        (sim.endDateStr === fDateStr && sim.endMins <= fStartMins);

      if (fitsBeforeForced) {
        unvisitedNonForced.splice(candIdx, 1);
        result.push(cand);
        cursorDateStr = sim.endDateStr;
        cursorMins = sim.endMins;
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
    if (fDateStr > cursorDateStr || (fDateStr === cursorDateStr && fStartMins + fDuration > cursorMins)) {
      cursorDateStr = fDateStr;
      cursorMins = fStartMins + fDuration;
      if (cursorMins >= 1080) {
        const nextDay = addDays(new Date(cursorDateStr), 1);
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
 * If manual overrides exist on date or slot, respects them and updates the scheduling cursor!
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

  let currentCursorDate = new Date(tourStartDate || new Date().toISOString().split('T')[0]);
  if (isNaN(currentCursorDate.getTime())) {
    currentCursorDate = new Date();
  }
  let currentCursorMinutes = 0;

  // Find all forced mission indices
  const forcedIndices = missions
    .map((m, idx) => ((m.isForced || (m.isManualDate && m.isManualSlot) || m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId) ? idx : -1))
    .filter(idx => idx !== -1);

  const result: any[] = new Array(missions.length);

  // Helper to test if a candidate slot on targetDate violates CTT rules
  const checkCttCandidate = (targetDateStr: string, candStart: number, candEnd: number, prevScheduled: any[]) => {
    // Rule 1: Max daily amplitude
    if (cttRules.maxDailyAmplitudeEnabled && cttRules.maxDailyAmplitudeHours > 0) {
      const dayMissions = prevScheduled.filter(m => m && m.estimatedDate === targetDateStr && m.estimatedSlot);
      if (dayMissions.length > 0) {
        const earliest = Math.min(...dayMissions.map(m => parseSlotToMinutes(m.estimatedSlot)));
        const amplitude = candEnd - earliest;
        if (amplitude > cttRules.maxDailyAmplitudeHours * 60) {
          return { valid: false, reason: 'max_amplitude' };
        }
      }
    }

    // Rule 2: Min consecutive rest from day - 1
    let adjustedStart = candStart;
    if (cttRules.minConsecutiveRestEnabled && cttRules.minConsecutiveRestHours > 0) {
      const dTarget = new Date(targetDateStr);
      const yesterday = formatDate(addDays(dTarget, -1));
      let yesterdayMissions = prevScheduled.filter(m => m && m.estimatedDate === yesterday && m.estimatedSlot);

      // Also check other tours for the same technician if prevScheduled has no missions yesterday
      if (yesterdayMissions.length === 0 && Array.isArray(allTours) && tech?.name) {
        const otherTours = allTours.filter(ot =>
          ot && ot.techName && String(ot.techName).trim().toLowerCase() === String(tech.name).trim().toLowerCase()
        );
        for (const ot of otherTours) {
          const otActive = (ot.missions || []).filter((m: any) => {
            const mDate = m?.estimatedDate || ot.startDate;
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
          const earliestAllowed = maxEndYesterday + (cttRules.minConsecutiveRestHours * 60) - 1440;
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
      const duration = candEnd - candStart;

      const dayMissions = prevScheduled.filter(m => m && m.estimatedDate === targetDateStr && m.estimatedSlot);
      let maxPriorEnd = 0;
      dayMissions.forEach(m => {
        const s = parseSlotToMinutes(m.estimatedSlot);
        const d = getMissionDurationInMinutes(m.reason || '', variables, m);
        if (s + d > maxPriorEnd) maxPriorEnd = s + d;
      });

      // Case A: Prior mission ended during lunch [12:00, 14:00]
      if (maxPriorEnd >= windowStart && maxPriorEnd < windowEnd) {
        const breakEnd = maxPriorEnd + requiredBreak;
        if (adjustedStart < breakEnd) {
          adjustedStart = breakEnd;
        }
      }
      // Case B: Prior mission ended before 12:00 (or no prior missions)
      else if (maxPriorEnd < windowStart) {
        // If candidate would start in the first portion of lunch
        if (adjustedStart >= windowStart && adjustedStart < windowStart + requiredBreak) {
          adjustedStart = windowStart + requiredBreak;
        }
        // If candidate starts before 12:00, but ends after 14:00 - requiredBreak,
        // it leaves less than requiredBreak free continuous minutes before 14:00
        else if (adjustedStart < windowStart && (adjustedStart + duration) > (windowEnd - requiredBreak)) {
          // If candidate cannot finish before 12:00, schedule break at 12:00 and push candidate after break
          adjustedStart = windowStart + requiredBreak;
        }
      }
    }

    return { valid: true, adjustedStart };
  };

  let i = 0;
  while (i < missions.length) {
    const m = missions[i];
    const isForced = !!(m.isForced || (m.isManualDate && m.isManualSlot) || m.equipmentType === 'Formation' || m.equipmentType?.toLowerCase().includes('formation') || !!m.formationId);

    if (isForced) {
      // 1. FORCED MISSION: Keep exact user-specified date and slot
      const forcedDate = m.estimatedDate || tourStartDate;
      const forcedSlot = m.estimatedSlot || '8:00am';
      const duration = getMissionDurationInMinutes(m.reason || '', variables, m);
      const startMins = parseSlotToMinutes(forcedSlot);

      result[i] = {
        ...m,
        estimatedDate: forcedDate,
        estimatedSlot: forcedSlot,
        isForced: true,
        isManualDate: true,
        isManualSlot: true,
      };

      currentCursorDate = new Date(forcedDate);
      if (isNaN(currentCursorDate.getTime())) {
        currentCursorDate = new Date(tourStartDate);
      }
      currentCursorMinutes = startMins + duration;
      if (currentCursorMinutes >= 1440) {
        currentCursorDate = addDays(currentCursorDate, 1);
        currentCursorMinutes = 0;
      }
      i++;
    } else {
      // 2. NON-FORCED MISSION: Check if there is a next forced mission
      const nextForcedIdx = forcedIndices.find(idx => idx > i);

      if (nextForcedIdx === undefined) {
        // No remaining forced missions: standard forward scheduling
        const eq = equipmentDetails[m.defibIdentifiant];
        const duration = getMissionDurationInMinutes(m.reason || '', variables, m);

        let assignedStartMinutes = 0;
        let daysChecked = 0;
        while (true) {
          let intervals = getOverlappingIntervals(currentCursorDate, eq, tech);
          if (intervals.length === 0 || daysChecked > 30) {
            intervals = [{ start: 480, end: 1080 }];
          }
          let found = false;
          const candDateStr = formatDate(currentCursorDate);

          for (const interval of intervals) {
            let candidateStart = Math.max(currentCursorMinutes, interval.start);

            // SPECIAL RULE: For the first mission of the tour (i === 0), incorporate travel time from technician departure point
            if (i === 0 && firstMissionTravelHours > 0) {
              const techInts = getTechnicianIntervals(currentCursorDate, tech);
              const dayTechStart = (techInts.length > 0 && techInts[0].start) ? techInts[0].start : 480;
              const earliestArrival = dayTechStart + (firstMissionTravelHours * 60);
              candidateStart = Math.max(earliestArrival, interval.start);
            }

            const cttCheck = checkCttCandidate(candDateStr, candidateStart, candidateStart + duration, result.slice(0, i));
            if (!cttCheck.valid) {
              continue; // Exceeds max daily amplitude, cannot fit today
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

        result[i] = {
          ...m,
          estimatedDate: assignedDate,
          estimatedSlot: assignedSlot,
        };

        currentCursorMinutes = assignedStartMinutes + duration;
        if (currentCursorMinutes >= 1440) {
          currentCursorDate = addDays(currentCursorDate, 1);
          currentCursorMinutes = 0;
        }
        i++;
      } else {
        // There is a next forced mission at nextForcedIdx
        const nextForcedMission = missions[nextForcedIdx];
        const nextForcedDateStr = nextForcedMission.estimatedDate || tourStartDate;
        const nextForcedSlotStr = nextForcedMission.estimatedSlot || '8:00am';
        const nextForcedStartMins = parseSlotToMinutes(nextForcedSlotStr);

        const nextForcedDateObj = new Date(nextForcedDateStr);
        if (currentCursorDate > nextForcedDateObj) {
          currentCursorDate = nextForcedDateObj;
        }

        const eq = equipmentDetails[m.defibIdentifiant];
        const duration = getMissionDurationInMinutes(m.reason || '', variables, m);

        let candidateStartMins = 0;
        let daysChecked = 0;
        let candidateDate = new Date(currentCursorDate);
        let foundForward = false;

        while (daysChecked <= 30) {
          const candDateStr = formatDate(candidateDate);
          if (candDateStr > nextForcedDateStr) break;

          let intervals = getOverlappingIntervals(candidateDate, eq, tech);
          if (intervals.length === 0) {
            intervals = [{ start: 480, end: 1080 }];
          }

          for (const interval of intervals) {
            let candStart = (candDateStr === formatDate(currentCursorDate))
              ? Math.max(currentCursorMinutes, interval.start)
              : interval.start;

            // SPECIAL RULE: For the first mission of the tour (i === 0), incorporate travel time from technician departure point
            if (i === 0 && firstMissionTravelHours > 0) {
              const techInts = getTechnicianIntervals(candidateDate, tech);
              const dayTechStart = (techInts.length > 0 && techInts[0].start) ? techInts[0].start : 480;
              const earliestArrival = dayTechStart + (firstMissionTravelHours * 60);
              candStart = Math.max(earliestArrival, interval.start);
            }

            const cttCheck = checkCttCandidate(candDateStr, candStart, candStart + duration, result.slice(0, i));
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
          currentCursorMinutes = 0;
          daysChecked++;
        }

        if (foundForward) {
          const assignedDate = formatDate(candidateDate);
          const assignedSlot = formatMinutesToSlot(candidateStartMins);

          result[i] = {
            ...m,
            estimatedDate: assignedDate,
            estimatedSlot: assignedSlot,
          };

          currentCursorDate = candidateDate;
          currentCursorMinutes = candidateStartMins + duration;
          if (currentCursorMinutes >= 1440) {
            currentCursorDate = addDays(currentCursorDate, 1);
            currentCursorMinutes = 0;
          }
          i++;
        } else {
          // Backward scheduling for all unassigned missions up to nextForcedIdx - 1
          let limitDateObj = new Date(nextForcedDateStr);
          let limitMins = nextForcedStartMins;

          for (let k = nextForcedIdx - 1; k >= i; k--) {
            const mK = missions[k];
            const durK = getMissionDurationInMinutes(mK.reason || '', variables, mK);

            let startMinsK = limitMins - durK;
            if (cttRules.minBreakRestEnabled && cttRules.minBreakRestMinutes > 0) {
              if (limitMins > 720 && limitMins <= 720 + cttRules.minBreakRestMinutes) {
                limitMins = 720;
                startMinsK = limitMins - durK;
              }
            }
            if (startMinsK < 480) {
              limitDateObj = addDays(limitDateObj, -1);
              limitMins = 1080;
              startMinsK = limitMins - durK;
            }

            if (k === 0 && firstMissionTravelHours > 0) {
              const techInts = getTechnicianIntervals(limitDateObj, tech);
              const dayTechStart = (techInts.length > 0 && techInts[0].start) ? techInts[0].start : 480;
              const earliestArrival = dayTechStart + (firstMissionTravelHours * 60);
              if (startMinsK < earliestArrival) {
                startMinsK = earliestArrival;
              }
            }

            const kDateStr = formatDate(limitDateObj);
            const kSlotStr = formatMinutesToSlot(startMinsK);

            result[k] = {
              ...mK,
              estimatedDate: kDateStr,
              estimatedSlot: kSlotStr,
            };

            limitMins = startMinsK;
          }

          i = nextForcedIdx;
        }
      }
    }
  }

  return result;
}
