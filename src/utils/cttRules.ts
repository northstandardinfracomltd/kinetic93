import { CttGlobalRules, DEFAULT_CTT_GLOBAL_RULES } from '../types';

export interface CttViolation {
  tourId: string;
  type: 'max_daily_amplitude' | 'min_consecutive_rest' | 'min_break_rest';
  message: string;
  date?: string;
  details?: string;
}

/**
 * Parses time slots such as "8:00am", "14:30pm", "08:00", "17:30", "8h", "17h30" into minutes from midnight.
 */
export function parseSlotToMinutes(slot: string): number {
  if (!slot) return 480; // 08:00 default
  const rawPart = String(slot).includes('-') ? String(slot).split('-')[0] : String(slot);
  const clean = rawPart.trim().toLowerCase();

  // Format "8h30", "17h", "8h"
  const hMatch = clean.match(/^(\d+)\s*h\s*(\d*)$/i);
  if (hMatch) {
    const hour = parseInt(hMatch[1], 10);
    const min = hMatch[2] ? parseInt(hMatch[2], 10) : 0;
    return hour * 60 + min;
  }

  const ampmMatch = clean.match(/^(\d+):(\d+)\s*(am|pm)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const min = parseInt(ampmMatch[2], 10);
    const isPm = ampmMatch[3].toLowerCase() === 'pm';
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return hour * 60 + min;
  }
  const standardMatch = clean.match(/^(\d+):(\d+)$/);
  if (standardMatch) {
    const hour = parseInt(standardMatch[1], 10);
    const min = parseInt(standardMatch[2], 10);
    return hour * 60 + min;
  }
  const singleNumMatch = clean.match(/^(\d+)$/);
  if (singleNumMatch) {
    const hour = parseInt(singleNumMatch[1], 10);
    return hour * 60;
  }
  return 480;
}

export function parseDateStringToDate(dStr: string): Date | null {
  if (!dStr) return null;
  const clean = String(dStr).trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
  }
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Returns estimated duration of mission in minutes.
 */
export function getMissionDuration(m: any, variables?: any[]): number {
  if (!m) return 75;
  if (m.dureePrestation !== undefined && !isNaN(Number(m.dureePrestation)) && Number(m.dureePrestation) > 0) {
    return Number(m.dureePrestation) + 30; // 30 min travel
  }
  if (Array.isArray(variables) && variables.length > 0) {
    const reasonsToCheck: string[] = [];
    if (Array.isArray(m.reasons) && m.reasons.length > 0) {
      reasonsToCheck.push(...m.reasons);
    } else if (m.reason) {
      reasonsToCheck.push(...String(m.reason).split(',').map((s: string) => s.trim()).filter(Boolean));
    }
    let foundDuration = 0;
    let anyFound = false;
    for (const r of reasonsToCheck) {
      const matchVar = variables.find((v: any) =>
        v && v.category === 'Modèle Raison Prestation' &&
        (String(v.nom || '').toLowerCase().trim() === r.toLowerCase().trim() || v.id === r)
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
      return foundDuration + 30;
    }
  }
  return 75; // standard fallback
}

/**
 * Loads CTT global rules from localStorage / fallback.
 */
export function loadCttGlobalRules(tenantId?: string): CttGlobalRules {
  try {
    const tid = tenantId || (typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') : null) || 'demo';
    const saved = localStorage.getItem(`defib_${tid}_ctt_global_rules`) || localStorage.getItem('ctt_global_rules');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        maxDailyAmplitudeEnabled: !!parsed.maxDailyAmplitudeEnabled,
        maxDailyAmplitudeHours: typeof parsed.maxDailyAmplitudeHours === 'number' && parsed.maxDailyAmplitudeHours >= 1 && parsed.maxDailyAmplitudeHours <= 24 ? parsed.maxDailyAmplitudeHours : DEFAULT_CTT_GLOBAL_RULES.maxDailyAmplitudeHours,
        maxDailyAmplitudeErrorText: parsed.maxDailyAmplitudeErrorText || DEFAULT_CTT_GLOBAL_RULES.maxDailyAmplitudeErrorText,
        minConsecutiveRestEnabled: !!parsed.minConsecutiveRestEnabled,
        minConsecutiveRestHours: typeof parsed.minConsecutiveRestHours === 'number' && parsed.minConsecutiveRestHours >= 1 && parsed.minConsecutiveRestHours <= 24 ? parsed.minConsecutiveRestHours : DEFAULT_CTT_GLOBAL_RULES.minConsecutiveRestHours,
        minConsecutiveRestErrorText: parsed.minConsecutiveRestErrorText || DEFAULT_CTT_GLOBAL_RULES.minConsecutiveRestErrorText,
        minBreakRestEnabled: !!parsed.minBreakRestEnabled,
        minBreakRestMinutes: typeof parsed.minBreakRestMinutes === 'number' && parsed.minBreakRestMinutes >= 1 && parsed.minBreakRestMinutes <= 60 ? parsed.minBreakRestMinutes : DEFAULT_CTT_GLOBAL_RULES.minBreakRestMinutes,
        minBreakRestErrorText: parsed.minBreakRestErrorText || DEFAULT_CTT_GLOBAL_RULES.minBreakRestErrorText,
        minBreakRestTechErrorText: parsed.minBreakRestTechErrorText || DEFAULT_CTT_GLOBAL_RULES.minBreakRestTechErrorText,
      };
    }
  } catch (_) {}
  return { ...DEFAULT_CTT_GLOBAL_RULES };
}

/**
 * Analyzes a tour's missions against CttGlobalRules and returns any persistent violations.
 */
export function checkTourCttViolations(
  tour: any,
  rules: CttGlobalRules,
  variables?: any[],
  allTours?: any[]
): CttViolation[] {
  const violations: CttViolation[] = [];
  if (!tour || !Array.isArray(tour.missions) || tour.missions.length === 0) {
    return violations;
  }

  const getSlot = (m: any) => m?.estimatedSlot || m?.creneau || m?.slot || m?.creneauHoraire || m?.estimatedTime || m?.time;

  // Filter out cancelled / draft rejected missions
  const activeMissions = tour.missions.filter((m: any) => {
    if (!m) return false;
    const sit = String(m.status || '').toLowerCase();
    return !sit.includes('rejet') && !sit.includes('annul');
  });

  if (activeMissions.length === 0) return violations;

  // Group missions by estimatedDate
  const missionsByDate: Record<string, any[]> = {};
  activeMissions.forEach((m: any) => {
    const d = m.estimatedDate || tour.startDate;
    if (!d) return;
    if (!missionsByDate[d]) missionsByDate[d] = [];
    missionsByDate[d].push(m);
  });

  const sortedDates = Object.keys(missionsByDate).sort((a, b) => {
    const da = parseDateStringToDate(a);
    const db = parseDateStringToDate(b);
    if (da && db) return da.getTime() - db.getTime();
    return a.localeCompare(b);
  });

  // 1. Check Max Daily Amplitude
  if (rules.maxDailyAmplitudeEnabled && rules.maxDailyAmplitudeHours > 0) {
    const maxMinutes = rules.maxDailyAmplitudeHours * 60;
    for (const dateStr of sortedDates) {
      const dayMissions = missionsByDate[dateStr].filter(m => getSlot(m));
      if (dayMissions.length >= 1) {
        let minStart = Infinity;
        let maxEnd = -Infinity;

        dayMissions.forEach(m => {
          const start = parseSlotToMinutes(getSlot(m));
          const duration = getMissionDuration(m, variables);
          if (start < minStart) minStart = start;
          if (start + duration > maxEnd) maxEnd = start + duration;
        });

        if (minStart !== Infinity && maxEnd !== -Infinity) {
          const amplitude = maxEnd - minStart;
          if (amplitude > maxMinutes) {
            const actualHours = (amplitude / 60).toFixed(1);
            violations.push({
              tourId: tour.id,
              type: 'max_daily_amplitude',
              date: dateStr,
              message: rules.maxDailyAmplitudeErrorText || DEFAULT_CTT_GLOBAL_RULES.maxDailyAmplitudeErrorText,
              details: `Date : ${dateStr} — Amplitude journalière constatée : ${actualHours}h (limite maximale : ${rules.maxDailyAmplitudeHours}h)`
            });
          }
        }
      }
    }
  }

  // 2. Check Min Consecutive Rest between 2 consecutive days
  if (rules.minConsecutiveRestEnabled && rules.minConsecutiveRestHours > 0) {
    const minRestMinutes = rules.minConsecutiveRestHours * 60;

    // Check consecutive days inside the current tour
    for (let k = 0; k < sortedDates.length - 1; k++) {
      const date1Str = sortedDates[k];
      const date2Str = sortedDates[k + 1];

      const d1 = parseDateStringToDate(date1Str);
      const d2 = parseDateStringToDate(date2Str);
      if (!d1 || !d2) continue;

      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

      // Strictly consecutive calendar days (J to J+1)
      if (diffDays === 1) {
        const missionsDay1 = missionsByDate[date1Str].filter(m => getSlot(m));
        const missionsDay2 = missionsByDate[date2Str].filter(m => getSlot(m));

        if (missionsDay1.length > 0 && missionsDay2.length > 0) {
          let maxEndDay1 = -Infinity;
          missionsDay1.forEach(m => {
            const start = parseSlotToMinutes(getSlot(m));
            const duration = getMissionDuration(m, variables);
            if (start + duration > maxEndDay1) maxEndDay1 = start + duration;
          });

          let minStartDay2 = Infinity;
          missionsDay2.forEach(m => {
            const start = parseSlotToMinutes(getSlot(m));
            if (start < minStartDay2) minStartDay2 = start;
          });

          if (maxEndDay1 !== -Infinity && minStartDay2 !== Infinity) {
            const restMinutes = (1440 - maxEndDay1) + minStartDay2;
            if (restMinutes < minRestMinutes) {
              const actualRestHours = (restMinutes / 60).toFixed(1);
              violations.push({
                tourId: tour.id,
                type: 'min_consecutive_rest',
                date: `${date1Str} ➜ ${date2Str}`,
                message: rules.minConsecutiveRestErrorText || DEFAULT_CTT_GLOBAL_RULES.minConsecutiveRestErrorText,
                details: `Entre ${date1Str} et ${date2Str} — Repos constaté : ${actualRestHours}h (minimum requis : ${rules.minConsecutiveRestHours}h)`
              });
            }
          }
        }
      }
    }

    // Cross-tour check if allTours is provided and tour has a techName
    if (Array.isArray(allTours) && allTours.length > 1 && tour.techName && sortedDates.length > 0) {
      const firstTourDate = sortedDates[0];
      const dFirst = parseDateStringToDate(firstTourDate);
      if (dFirst) {
        const otherToursOfTech = allTours.filter(ot =>
          ot && ot.id !== tour.id &&
          ot.techName && String(ot.techName).trim().toLowerCase() === String(tour.techName).trim().toLowerCase() &&
          Array.isArray(ot.missions) && ot.missions.length > 0
        );

        for (const ot of otherToursOfTech) {
          const otActive = ot.missions.filter((m: any) => {
            if (!m) return false;
            const sit = String(m.status || '').toLowerCase();
            return !sit.includes('rejet') && !sit.includes('annul') && getSlot(m);
          });
          for (const m of otActive) {
            const mDateStr = m.estimatedDate || ot.startDate;
            const dPrev = parseDateStringToDate(mDateStr);
            if (!dPrev) continue;
            const diffDays = Math.round((dFirst.getTime() - dPrev.getTime()) / (1000 * 3600 * 24));
            if (diffDays === 1) {
              // Day - 1 in another tour!
              const startOt = parseSlotToMinutes(getSlot(m));
              const durOt = getMissionDuration(m, variables);
              const endOt = startOt + durOt;

              const day1Missions = missionsByDate[firstTourDate].filter(miss => getSlot(miss));
              if (day1Missions.length > 0) {
                let minStartToday = Infinity;
                day1Missions.forEach(miss => {
                  const s = parseSlotToMinutes(getSlot(miss));
                  if (s < minStartToday) minStartToday = s;
                });

                if (minStartToday !== Infinity) {
                  const restMinutes = (1440 - endOt) + minStartToday;
                  if (restMinutes < minRestMinutes) {
                    const actualRestHours = (restMinutes / 60).toFixed(1);
                    const alreadyPresent = violations.some(v => v.type === 'min_consecutive_rest' && v.date === `${mDateStr} ➜ ${firstTourDate}`);
                    if (!alreadyPresent) {
                      violations.push({
                        tourId: tour.id,
                        type: 'min_consecutive_rest',
                        date: `${mDateStr} ➜ ${firstTourDate}`,
                        message: rules.minConsecutiveRestErrorText || DEFAULT_CTT_GLOBAL_RULES.minConsecutiveRestErrorText,
                        details: `Entre ${mDateStr} (Tournée précédente) et ${firstTourDate} — Repos constaté : ${actualRestHours}h (minimum requis : ${rules.minConsecutiveRestHours}h)`
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. Check Min Break Rest (Repos repas entre 12h et 14h)
  if (rules.minBreakRestEnabled && rules.minBreakRestMinutes > 0) {
    const requiredBreakMins = rules.minBreakRestMinutes;
    const windowStart = 720; // 12h00 in minutes
    const windowEnd = 840;   // 14h00 in minutes

    for (const dateStr of sortedDates) {
      const dayMissions = missionsByDate[dateStr].filter(m => getSlot(m));
      if (dayMissions.length === 0) continue;

      let earliestMissionStart = Infinity;
      let latestMissionEnd = -Infinity;

      const busyIntervals: { start: number; end: number }[] = [];
      dayMissions.forEach(m => {
        const s = parseSlotToMinutes(getSlot(m));
        const d = getMissionDuration(m, variables);
        const e = s + d;
        if (s < earliestMissionStart) earliestMissionStart = s;
        if (e > latestMissionEnd) latestMissionEnd = e;

        // Clip busy interval to [windowStart, windowEnd]
        const clipStart = Math.max(windowStart, s);
        const clipEnd = Math.min(windowEnd, e);
        if (clipStart < clipEnd) {
          busyIntervals.push({ start: clipStart, end: clipEnd });
        }
      });

      // The rule applies if missions on that day span across lunchtime
      const spansLunch = earliestMissionStart < windowEnd && latestMissionEnd > windowStart;
      if (!spansLunch) {
        continue;
      }

      // Merge overlapping busy intervals
      busyIntervals.sort((a, b) => a.start - b.start);
      const merged: { start: number; end: number }[] = [];
      busyIntervals.forEach(cur => {
        if (merged.length === 0) {
          merged.push({ ...cur });
        } else {
          const last = merged[merged.length - 1];
          if (cur.start <= last.end) {
            last.end = Math.max(last.end, cur.end);
          } else {
            merged.push({ ...cur });
          }
        }
      });

      // Calculate the maximum continuous free time inside [12:00, 14:00]
      let maxContinuousFree = 0;
      let cursor = windowStart;
      merged.forEach(b => {
        if (b.start > cursor) {
          const free = b.start - cursor;
          if (free > maxContinuousFree) maxContinuousFree = free;
        }
        cursor = Math.max(cursor, b.end);
      });
      if (windowEnd > cursor) {
        const free = windowEnd - cursor;
        if (free > maxContinuousFree) maxContinuousFree = free;
      }

      if (maxContinuousFree < requiredBreakMins) {
        violations.push({
          tourId: tour.id,
          type: 'min_break_rest',
          date: dateStr,
          message: rules.minBreakRestErrorText || DEFAULT_CTT_GLOBAL_RULES.minBreakRestErrorText,
          details: `Date : ${dateStr} — Pause repas constatée : ${maxContinuousFree} min entre 12h et 14h (minimum requis : ${requiredBreakMins} min)`
        });
      }
    }
  }

  return violations;
}

function toIsoDateForAlert(dStr: any): string {
  if (!dStr) return '';
  const clean = String(dStr).trim();
  if (!clean) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const dd = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  const d = parseDateStringToDate(clean);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatIsoToFRForAlert(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

function getFrenchWeekdayFromIso(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[d.getDay()] || '';
}

/**
 * Mission duration for suggested tour alerts:
 * Default 60 min (1h) per mission UNLESS the mission's reason(s)/prestation(s)
 * match variables with dureePrestation (in minutes), in which case sum those minutes.
 */
export function getMissionDurationForAlert(m: any, variables?: any[]): number {
  if (!m) return 60;
  if (Array.isArray(variables) && variables.length > 0) {
    const reasonsToCheck: string[] = [];
    if (Array.isArray(m.reasons) && m.reasons.length > 0) {
      reasonsToCheck.push(...m.reasons);
    } else if (m.reason) {
      reasonsToCheck.push(...String(m.reason).split(',').map((s: string) => s.trim()).filter(Boolean));
    }
    let foundDuration = 0;
    let anyFound = false;
    for (const r of reasonsToCheck) {
      const matchVar = variables.find((v: any) =>
        v && v.category === 'Modèle Raison Prestation' &&
        (String(v.nom || '').toLowerCase().trim() === String(r).toLowerCase().trim() || v.id === r)
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
      return foundDuration;
    }
  }
  if (m.dureePrestation !== undefined && m.dureePrestation !== null && !isNaN(Number(m.dureePrestation)) && Number(m.dureePrestation) > 0) {
    return Number(m.dureePrestation);
  }
  return 60;
}

/**
 * Computes the list of suggested alerts ("Alertes suggérées :") for a given tour.
 */
export function computeTourSuggestedAlerts(
  tour: any,
  draftVal: any,
  members: any[],
  rules: CttGlobalRules,
  variables?: any[],
  allTours?: any[]
): string[] {
  const alerts: string[] = [];
  if (!tour) return alerts;

  const getSlot = (m: any) => m?.estimatedSlot || m?.creneau || m?.slot || m?.creneauHoraire || m?.estimatedTime || m?.time;

  const techName = String(draftVal?.techName !== undefined ? draftVal.techName : (tour.techName || '')).trim();
  const startRaw = draftVal?.startDate !== undefined ? draftVal.startDate : (tour.startDate || '');
  const startIso = toIsoDateForAlert(startRaw);

  const activeMissions = (Array.isArray(tour.missions) ? tour.missions : []).filter((m: any) => {
    if (!m) return false;
    const sit = String(m.status || '').toLowerCase();
    return !sit.includes('rejet') && !sit.includes('annul');
  });

  // Collect all mission dates (ISO) and determine the tour's calendar day span
  const missionIsoDates: string[] = [];
  activeMissions.forEach((m: any) => {
    const mIso = toIsoDateForAlert(m.estimatedDate || startIso);
    if (mIso) missionIsoDates.push(mIso);
  });

  const tourDaysSet = new Set<string>();
  if (startIso) {
    let maxIso = startIso;
    missionIsoDates.forEach(d => {
      if (d > maxIso) maxIso = d;
    });
    const cur = new Date(`${startIso}T00:00:00`);
    const end = new Date(`${maxIso}T00:00:00`);
    let guard = 0;
    while (!isNaN(cur.getTime()) && !isNaN(end.getTime()) && cur <= end && guard < 90) {
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      tourDaysSet.add(`${yyyy}-${mm}-${dd}`);
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
  }
  missionIsoDates.forEach(d => tourDaysSet.add(d));
  const tourDaysIso = Array.from(tourDaysSet).sort();

  const techMember = (techName && techName !== 'Aucun' && Array.isArray(members))
    ? members.find((m: any) => m && m.name && String(m.name).trim().toLowerCase() === techName.toLowerCase())
    : undefined;

  // Helper to get open schedule intervals for a given French weekday from techMember.semaineTypique
  const getScheduleIntervalsForDay = (schedules: any[], dayName: string): { start: number; end: number }[] => {
    const intervals: { start: number; end: number }[] = [];
    if (!dayName || !Array.isArray(schedules)) return intervals;
    schedules.forEach((s: any) => {
      if (!s || s.openForMissions === false) return;
      const daysArr = Array.isArray(s.days) ? s.days : [];
      const matchesDay = daysArr.some((d: any) => String(d || '').trim().toLowerCase() === dayName.toLowerCase());
      if (!matchesDay) return;
      if (s.fermetureMidi) {
        const s1 = parseSlotToMinutes(s.openMorning || '09:00');
        const e1 = parseSlotToMinutes(s.closeMorning || '12:00');
        if (s1 < e1) intervals.push({ start: s1, end: e1 });
        const s2 = parseSlotToMinutes(s.openAfternoon || '14:00');
        const e2 = parseSlotToMinutes(s.closeAfternoon || '18:00');
        if (s2 < e2) intervals.push({ start: s2, end: e2 });
      } else {
        const s1 = parseSlotToMinutes(s.openContinuous || '09:00');
        const e1 = parseSlotToMinutes(s.closeContinuous || '17:00');
        if (s1 < e1) intervals.push({ start: s1, end: e1 });
      }
    });
    return intervals;
  };

  const isMissionCompatibleWithSchedules = (m: any, schedules: any[]): boolean => {
    const mIso = toIsoDateForAlert(m.estimatedDate || startIso);
    if (!mIso) return false;
    const dayName = getFrenchWeekdayFromIso(mIso);
    const intervals = getScheduleIntervalsForDay(schedules, dayName);
    if (intervals.length === 0) return false;
    const slotStr = getSlot(m);
    if (!slotStr) return false;
    const mStart = parseSlotToMinutes(slotStr);
    const mEnd = mStart + getMissionDurationForAlert(m, variables);
    return intervals.some(iv => mStart >= iv.start && mEnd <= iv.end);
  };

  // 1 & 2. Semaine typique checks
  const validSchedules = (techMember && Array.isArray(techMember.semaineTypique))
    ? techMember.semaineTypique.filter((s: any) => s && Array.isArray(s.days) && s.days.length > 0)
    : [];

  if (techMember && validSchedules.length > 0) {
    // Alert 1: Au moins une mission de la tournée n'est pas compatible avec une période de semaine typique du technicien sélectionné.
    if (activeMissions.length > 0) {
      const hasIncompatibleMission = activeMissions.some((m: any) => !isMissionCompatibleWithSchedules(m, validSchedules));
      if (hasIncompatibleMission) {
        alerts.push("Au moins une mission de la tournée n’est pas compatible avec une période de semaine typique du technicien sélectionné.");
      }
    }

    // Alert 2: La tournée n'est pas compatible avec une période de semaine typique du technicien sélectionné.
    if (tourDaysIso.length > 0) {
      const hasIncompatibleTourDay = tourDaysIso.some(dIso => {
        const dayName = getFrenchWeekdayFromIso(dIso);
        return getScheduleIntervalsForDay(validSchedules, dayName).length === 0;
      });
      const hasIncompatibleTourMission = activeMissions.some((m: any) => !isMissionCompatibleWithSchedules(m, validSchedules));
      if (hasIncompatibleTourDay || hasIncompatibleTourMission) {
        alerts.push("La tournée n’est pas compatible avec une période de semaine typique du technicien sélectionné.");
      }
    }
  }

  // 3 & 4. Périodes d'indisponibilité checks
  const validAbsences = (techMember && Array.isArray(techMember.absences))
    ? techMember.absences
        .map((a: any) => {
          if (!a) return null;
          const aStart = toIsoDateForAlert(a.startDate);
          const aEnd = toIsoDateForAlert(a.endDate || a.startDate) || aStart;
          if (!aStart) return null;
          return { aStart, aEnd };
        })
        .filter(Boolean) as { aStart: string; aEnd: string }[]
    : [];

  if (techMember && validAbsences.length > 0) {
    // Alert 3: Au moins une mission de la tournée n'est pas compatible avec une période d'indisponibilité du technicien sélectionné.
    if (activeMissions.length > 0) {
      const hasMissionInAbsence = activeMissions.some((m: any) => {
        const mIso = toIsoDateForAlert(m.estimatedDate || startIso);
        if (!mIso) return false;
        return validAbsences.some(abs => mIso >= abs.aStart && mIso <= abs.aEnd);
      });
      if (hasMissionInAbsence) {
        alerts.push("Au moins une mission de la tournée n’est pas compatible avec une période d’indisponibilité du technicien sélectionné.");
      }
    }

    // Alert 4: La tournée n'est pas compatible avec une période d'indisponibilité du technicien sélectionné.
    if (tourDaysIso.length > 0) {
      const hasTourInAbsence = tourDaysIso.some(dIso =>
        validAbsences.some(abs => dIso >= abs.aStart && dIso <= abs.aEnd)
      );
      if (hasTourInAbsence) {
        alerts.push("La tournée n’est pas compatible avec une période d’indisponibilité du technicien sélectionné.");
      }
    }
  }

  // Group active missions with time slots by ISO date for rules 5, 6, 7
  const missionsByIsoDate: Record<string, any[]> = {};
  activeMissions.forEach((m: any) => {
    const mIso = toIsoDateForAlert(m.estimatedDate || startIso);
    if (!mIso || !getSlot(m)) return;
    if (!missionsByIsoDate[mIso]) missionsByIsoDate[mIso] = [];
    missionsByIsoDate[mIso].push(m);
  });
  const sortedMissionIsoDates = Object.keys(missionsByIsoDate).sort();

  // 5. Amplitude maximale journalière
  if (rules && rules.maxDailyAmplitudeEnabled && rules.maxDailyAmplitudeHours > 0) {
    const maxMinutes = rules.maxDailyAmplitudeHours * 60;
    for (const dateIso of sortedMissionIsoDates) {
      const dayMissions = missionsByIsoDate[dateIso];
      if (!dayMissions || dayMissions.length === 0) continue;
      let minStart = Infinity;
      let maxEnd = -Infinity;
      dayMissions.forEach((m: any) => {
        const start = parseSlotToMinutes(getSlot(m));
        const dur = getMissionDurationForAlert(m, variables);
        if (start < minStart) minStart = start;
        if (start + dur > maxEnd) maxEnd = start + dur;
      });
      if (minStart !== Infinity && maxEnd !== -Infinity && (maxEnd - minStart) > maxMinutes) {
        alerts.push(
          `L’amplitude maximale journalière est de ${rules.maxDailyAmplitudeHours}h. Le ${formatIsoToFRForAlert(dateIso)}, cette amplitude est dépassée.`
        );
      }
    }
  }

  // 6. Amplitude minimale de repos entre 2 jours consécutifs
  if (rules && rules.minConsecutiveRestEnabled && rules.minConsecutiveRestHours > 0) {
    const minRestMinutes = rules.minConsecutiveRestHours * 60;

    // Combine current tour missions and (if technician is selected) other tours of the same technician
    const combinedByDate: Record<string, { start: number; end: number; isCurrentTour: boolean }[]> = {};
    sortedMissionIsoDates.forEach(dateIso => {
      combinedByDate[dateIso] = (missionsByIsoDate[dateIso] || []).map((m: any) => {
        const s = parseSlotToMinutes(getSlot(m));
        const d = getMissionDurationForAlert(m, variables);
        return { start: s, end: s + d, isCurrentTour: true };
      });
    });

    if (techName && techName !== 'Aucun' && Array.isArray(allTours)) {
      allTours.forEach((ot: any) => {
        if (!ot || ot.id === tour.id) return;
        const otTech = String(ot.techName || '').trim();
        if (!otTech || otTech.toLowerCase() !== techName.toLowerCase()) return;
        const otStartIso = toIsoDateForAlert(ot.startDate);
        (Array.isArray(ot.missions) ? ot.missions : []).forEach((m: any) => {
          if (!m) return;
          const sit = String(m.status || '').toLowerCase();
          if (sit.includes('rejet') || sit.includes('annul')) return;
          const slot = getSlot(m);
          if (!slot) return;
          const mIso = toIsoDateForAlert(m.estimatedDate || otStartIso);
          if (!mIso) return;
          const s = parseSlotToMinutes(slot);
          const d = getMissionDurationForAlert(m, variables);
          if (!combinedByDate[mIso]) combinedByDate[mIso] = [];
          combinedByDate[mIso].push({ start: s, end: s + d, isCurrentTour: false });
        });
      });
    }

    const allCombinedDates = Object.keys(combinedByDate).sort();
    for (let i = 0; i < allCombinedDates.length - 1; i++) {
      const d1Iso = allCombinedDates[i];
      const d2Iso = allCombinedDates[i + 1];
      const list1 = combinedByDate[d1Iso];
      const list2 = combinedByDate[d2Iso];
      if (!list1.some(x => x.isCurrentTour) && !list2.some(x => x.isCurrentTour)) continue;

      const dt1 = new Date(`${d1Iso}T00:00:00`);
      const dt2 = new Date(`${d2Iso}T00:00:00`);
      if (isNaN(dt1.getTime()) || isNaN(dt2.getTime())) continue;
      const diffDays = Math.round((dt2.getTime() - dt1.getTime()) / (1000 * 3600 * 24));
      if (diffDays === 1) {
        const maxEndDay1 = Math.max(...list1.map(x => x.end));
        const minStartDay2 = Math.min(...list2.map(x => x.start));
        const restMinutes = (1440 - maxEndDay1) + minStartDay2;
        if (restMinutes < minRestMinutes) {
          alerts.push(
            `L’amplitude minimale de repos entre 2 jours consécutifs est de ${rules.minConsecutiveRestHours}h. Entre le ${formatIsoToFRForAlert(d1Iso)} et le ${formatIsoToFRForAlert(d2Iso)}, cette amplitude est inférieure.`
          );
        }
      }
    }
  }

  // 7. Amplitude minimale de repos à la mi-journée pour la pause repas (entre 11h et 15h)
  if (rules && rules.minBreakRestEnabled && rules.minBreakRestMinutes > 0) {
    const requiredBreakMins = rules.minBreakRestMinutes;
    const windowStart = 11 * 60; // 11h00 = 660
    const windowEnd = 15 * 60;   // 15h00 = 900

    for (const dateIso of sortedMissionIsoDates) {
      const dayMissions = missionsByIsoDate[dateIso];
      if (!dayMissions || dayMissions.length === 0) continue;

      const busyIntervals: { start: number; end: number }[] = [];
      dayMissions.forEach((m: any) => {
        const s = parseSlotToMinutes(getSlot(m));
        const d = getMissionDurationForAlert(m, variables);
        const e = s + d;
        const clipStart = Math.max(windowStart, s);
        const clipEnd = Math.min(windowEnd, e);
        if (clipStart < clipEnd) {
          busyIntervals.push({ start: clipStart, end: clipEnd });
        }
      });

      if (busyIntervals.length === 0) continue;

      busyIntervals.sort((a, b) => a.start - b.start);
      const merged: { start: number; end: number }[] = [];
      busyIntervals.forEach(cur => {
        if (merged.length === 0) {
          merged.push({ ...cur });
        } else {
          const last = merged[merged.length - 1];
          if (cur.start <= last.end) {
            last.end = Math.max(last.end, cur.end);
          } else {
            merged.push({ ...cur });
          }
        }
      });

      let maxContinuousFree = 0;
      let cursor = windowStart;
      merged.forEach(b => {
        if (b.start > cursor) {
          const free = b.start - cursor;
          if (free > maxContinuousFree) maxContinuousFree = free;
        }
        cursor = Math.max(cursor, b.end);
      });
      if (windowEnd > cursor) {
        const free = windowEnd - cursor;
        if (free > maxContinuousFree) maxContinuousFree = free;
      }

      if (maxContinuousFree < requiredBreakMins) {
        alerts.push(
          `L’amplitude minimale de repos à la mi-journée pour la pause repas est de ${requiredBreakMins}min. Le ${formatIsoToFRForAlert(dateIso)}, il semble que le technicien ne bénéficiera pas de ce temps disponible.`
        );
      }
    }
  }

  return alerts;
}

