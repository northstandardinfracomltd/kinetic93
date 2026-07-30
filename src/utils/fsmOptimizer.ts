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
    if (!response.ok) throw new Error('Geocoding response not ok');
    const data = await response.json();
    if (data?.features?.[0]?.geometry?.coordinates) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      const coord = { lat, lng };
      geocodeCache[cleaned] = coord;
      return coord;
    }
  } catch (error) {
    console.error('Failed to geocode address:', cleaned, error);
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
 * Orders missions using a Nearest-Neighbor Traveling Salesperson algorithm.
 * Starts from the technician's start address and proceeds point-by-point,
 * sorting either by closest (proche) or furthest (loin).
 */
export function sortMissionsByProximity(
  missions: any[],
  startCoord: Coordinate,
  equipmentCoords: Record<string, Coordinate>,
  preference: 'loin' | 'proche' = 'proche'
): any[] {
  if (missions.length === 0) return [];

  const hasForced = missions.some(m => m.isForced || (m.isManualDate && m.isManualSlot));

  if (!hasForced) {
    return sortSingleSegment(missions, startCoord, equipmentCoords, preference);
  }

  const result: any[] = [];
  let currentStart = startCoord;
  let currentSegment: any[] = [];

  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    const isForced = !!(m.isForced || (m.isManualDate && m.isManualSlot));

    if (isForced) {
      if (currentSegment.length > 0) {
        const sortedSeg = sortSingleSegment(currentSegment, currentStart, equipmentCoords, preference);
        result.push(...sortedSeg);
        currentSegment = [];
      }
      result.push(m);
      const forcedCoord = equipmentCoords[m.defibIdentifiant];
      if (forcedCoord) {
        currentStart = forcedCoord;
      }
    } else {
      currentSegment.push(m);
    }
  }

  if (currentSegment.length > 0) {
    const sortedSeg = sortSingleSegment(currentSegment, currentStart, equipmentCoords, preference);
    result.push(...sortedSeg);
  }

  return result;
}

function sortSingleSegment(
  missions: any[],
  startCoord: Coordinate,
  equipmentCoords: Record<string, Coordinate>,
  preference: 'loin' | 'proche' = 'proche'
): any[] {
  if (missions.length <= 1) return [...missions];

  const noCoordsMissions = missions.filter(m => !equipmentCoords[m.defibIdentifiant]);
  const hasCoordsMissions = missions.filter(m => equipmentCoords[m.defibIdentifiant]);

  const unvisited = [...hasCoordsMissions];
  const ordered: any[] = [];
  let currentCoord = startCoord;

  while (unvisited.length > 0) {
    let selectedIdx = -1;
    let selectedDist = preference === 'loin' ? -1 : Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const m = unvisited[i];
      const coord = equipmentCoords[m.defibIdentifiant];
      if (!coord) continue;
      const dist = getHaversineDistance(currentCoord, coord);

      if (preference === 'loin') {
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

  return [...noCoordsMissions, ...ordered];
}

/**
 * Utility to parse time slot like "14:00pm" or "8:30am" into total minutes from midnight.
 */
function parseSlotToMinutes(slot: string): number {
  if (!slot) return 480; // Default to 08:00
  const match = slot.match(/^(\d+):(\d+)(am|pm)$/i);
  if (!match) return 480;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  return hour * 60 + minute;
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

export function getMissionDurationInMinutes(reason: string): number {
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
  tech?: any
): any[] {
  if (!missions || missions.length === 0) return [];

  let currentCursorDate = new Date(tourStartDate || new Date().toISOString().split('T')[0]);
  if (isNaN(currentCursorDate.getTime())) {
    currentCursorDate = new Date();
  }
  let currentCursorMinutes = 0;

  // Find all forced mission indices
  const forcedIndices = missions
    .map((m, idx) => ((m.isForced || (m.isManualDate && m.isManualSlot)) ? idx : -1))
    .filter(idx => idx !== -1);

  const result: any[] = new Array(missions.length);

  let i = 0;
  while (i < missions.length) {
    const m = missions[i];
    const isForced = !!(m.isForced || (m.isManualDate && m.isManualSlot));

    if (isForced) {
      // 1. FORCED MISSION: Keep exact user-specified date and slot
      const forcedDate = m.estimatedDate || tourStartDate;
      const forcedSlot = m.estimatedSlot || '8:00am';
      const duration = getMissionDurationInMinutes(m.reason || '');
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
        const duration = getMissionDurationInMinutes(m.reason || '');

        let assignedStartMinutes = 0;
        let daysChecked = 0;
        while (true) {
          let intervals = getOverlappingIntervals(currentCursorDate, eq, tech);
          if (intervals.length === 0 || daysChecked > 30) {
            intervals = [{ start: 480, end: 1080 }];
          }
          let found = false;
          for (const interval of intervals) {
            const candidateStart = Math.max(currentCursorMinutes, interval.start);
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
        const duration = getMissionDurationInMinutes(m.reason || '');

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
            const candStart = (candDateStr === formatDate(currentCursorDate))
              ? Math.max(currentCursorMinutes, interval.start)
              : interval.start;

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
            const durK = getMissionDurationInMinutes(mK.reason || '');

            let startMinsK = limitMins - durK;
            if (startMinsK < 480) {
              limitDateObj = addDays(limitDateObj, -1);
              limitMins = 1080;
              startMinsK = limitMins - durK;
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
