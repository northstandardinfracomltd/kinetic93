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
  const clean = String(slot).trim().toLowerCase();

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
