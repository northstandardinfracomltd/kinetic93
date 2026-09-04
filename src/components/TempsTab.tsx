import React, { useState } from 'react';
import { PointageLog, Member, CttModelSetting, CttColumnTarget } from '../types';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { t } from '../utils/translate';

const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface TempsTabProps {
  pointages: PointageLog[];
  members?: Member[];
  onUpdatePointages?: (updated: PointageLog[]) => void;
}

const FRENCH_MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

// Helper to calculate Easter Sunday for a given year using Anonymous Gregorian algorithm
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Helper to calculate all French Public Holidays for a given year
function getFrenchHolidaysSet(year: number): Set<string> {
  const holidays = new Set<string>();
  const add = (m: number, d: number) => {
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    holidays.add(`${year}-${mm}-${dd}`);
  };

  // Fixed holidays
  add(1, 1);   // Jour de l'An
  add(5, 1);   // Fête du Travail
  add(5, 8);   // Victoire 1945
  add(7, 14);  // Fête Nationale
  add(8, 15);  // Assomption
  add(11, 1);  // Toussaint
  add(11, 11); // Armistice 1918
  add(12, 25); // Noël

  // Moveable Easter holidays
  const easter = getEasterDate(year);

  // Easter Monday (+1 day)
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  add(easterMonday.getMonth() + 1, easterMonday.getDate());

  // Ascension (+39 days)
  const ascension = new Date(easter);
  ascension.setDate(easter.getDate() + 39);
  add(ascension.getMonth() + 1, ascension.getDate());

  // Whit Monday / Lundi de Pentecôte (+50 days)
  const whitMonday = new Date(easter);
  whitMonday.setDate(easter.getDate() + 50);
  add(whitMonday.getMonth() + 1, whitMonday.getDate());

  return holidays;
}

function parseToIso(dateStr?: string): string {
  if (!dateStr) return '';
  const str = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return str;
}

function parseTimeToSeconds(tStr?: string): number {
  if (!tStr) return 0;
  const str = tStr.trim();
  if (str.includes(':')) {
    const parts = str.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length >= 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 3600 + parts[1] * 60;
    }
  }
  if (str.toLowerCase().includes('h')) {
    const parts = str.toLowerCase().split('h').map((p) => parseInt(p, 10) || 0);
    return parts[0] * 3600 + (parts[1] || 0) * 60;
  }
  const val = parseInt(str, 10);
  return isNaN(val) ? 0 : val * 60;
}

function secondsToHMMSS(totalSec: number): string {
  if (totalSec <= 0) return '0:00:00';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDurationField(val?: string): string {
  if (!val || val.trim() === '') return '';
  const sec = parseTimeToSeconds(val);
  if (sec <= 0) return '';
  return secondsToHMMSS(sec);
}

function calculateAmplitudeSeconds(startTime?: string, endTime?: string): number {
  if (!startTime || !endTime) return 0;
  const startSec = parseTimeToSeconds(startTime);
  const endSec = parseTimeToSeconds(endTime);
  if (endSec > startSec) {
    return endSec - startSec;
  }
  return 0;
}

// Generate the full CSV content for a technician for a given month
function generateMonthlyCSV(
  techName: string,
  year: number,
  monthIndex: number,
  pointages: PointageLog[],
  members: Member[] = [],
  settings: CttModelSetting[] = []
): string {
  const monthLabel = `${FRENCH_MONTH_NAMES[monthIndex]} ${year}`;
  const holidays = getFrenchHolidaysSet(year);
  const member = members.find(
    (m) => m.name === techName || m.name?.toLowerCase() === techName.toLowerCase()
  );

  const csvLines: string[][] = [];

  // Line 1: Titre fixe
  csvLines.push(['CTT Planning Horaires', '', '', '', '', '', '', '', '', '', '', '']);
  // Line 2: Sous-titre variable
  csvLines.push([`${techName} - ${monthLabel}`, '', '', '', '', '', '', '', '', '', '', '']);
  // Line 3: Ligne vide d'espacement
  csvLines.push(['', '', '', '', '', '', '', '', '', '', '', '']);
  // Line 4: Labels du tableau
  csvLines.push([
    'Date',
    'Début Journée',
    'Fin Journée',
    'Amplitude Journée',
    'Temps Trajet Matin',
    'Temps Trajet Soir',
    'Temps Repas',
    'Amplitude Journée',
    'Temps Administratif/Autres',
    'Amplitude Hebdomadaire ',
    'Crédit Heures',
    'Commentaires'
  ]);

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  interface DayInfo {
    day: number;
    dateObj: Date;
    dateIso: string;
    displayDate: string;
    mondayIso: string;
    type: 'absence' | 'holiday' | 'pointage' | 'nodata';
    absenceReason?: string;
    pointage?: PointageLog;
    workedCTTSec: number;
    adminSec: number;
    adjustedTmSec?: number;
    adjustedTsSec?: number;
    adjustedRepasSec?: number;
  }

  const workingDays: DayInfo[] = [];

  const DAY_KEYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, monthIndex, day);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Exclude Saturdays & Sundays

    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateIso = `${year}-${mm}-${dd}`;
    const displayDate = `${day}/${monthIndex + 1}/${year}`;
    const currentDayLabel = DAY_KEYS[dayOfWeek];

    // Compute Monday ISO for week grouping
    const mon = new Date(dateObj);
    const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    mon.setDate(mon.getDate() - diffToMon);
    const monMM = String(mon.getMonth() + 1).padStart(2, '0');
    const monDD = String(mon.getDate()).padStart(2, '0');
    const mondayIso = `${mon.getFullYear()}-${monMM}-${monDD}`;

    // 1) Absence check
    let absenceReason: string | undefined;
    if (member && member.absences) {
      const matchAbs = member.absences.find((abs) => {
        if (!abs.startDate) return false;
        const absStart = parseToIso(abs.startDate);
        const absEnd = abs.endDate ? parseToIso(abs.endDate) : absStart;
        return absStart <= dateIso && dateIso <= absEnd;
      });
      if (matchAbs) {
        absenceReason = matchAbs.commentaire || 'Absence';
      }
    }

    if (absenceReason) {
      workingDays.push({
        day,
        dateObj,
        dateIso,
        displayDate,
        mondayIso,
        type: 'absence',
        absenceReason,
        workedCTTSec: 0,
        adminSec: 0,
      });
      continue;
    }

    // 2) French Holiday check
    if (holidays.has(dateIso)) {
      workingDays.push({
        day,
        dateObj,
        dateIso,
        displayDate,
        mondayIso,
        type: 'holiday',
        workedCTTSec: 0,
        adminSec: 0,
      });
      continue;
    }

    // 3) Pointage check
    const pt = pointages.find((p) => {
      if (p.techName !== techName) return false;
      const pIso = parseToIso(p.startDate);
      return pIso === dateIso;
    });

    if (pt) {
      const amplitudeSec = calculateAmplitudeSeconds(pt.startTime, pt.endTime);
      let repasSec = parseTimeToSeconds(pt.tempsRepas);
      let tmSec = parseTimeToSeconds(pt.trajetMatin);
      let tsSec = parseTimeToSeconds(pt.trajetSoir);

      // Apply CTT model settings if matching day of the week
      if (settings && settings.length > 0) {
        settings.forEach((s) => {
          if (!s.setting1 || !s.setting1.includes(currentDayLabel)) return;
          const mins = Math.min(500, Math.max(1, typeof s.setting5 === 'number' && !isNaN(s.setting5) ? s.setting5 : parseInt(String(s.setting5), 10) || 0));
          const deltaSec = mins * 60;
          if (deltaSec <= 0) return;

          if (s.setting4 === 'Temps Trajet Matin') {
            if (s.setting2) {
              // Retirer du temps effectif
              tmSec = Math.max(0, tmSec - deltaSec);
            } else if (s.setting3) {
              // Ajouter au temps effectif
              tmSec = tmSec + deltaSec;
            }
          } else if (s.setting4 === 'Temps Trajet Soir') {
            if (s.setting2) {
              tsSec = Math.max(0, tsSec - deltaSec);
            } else if (s.setting3) {
              tsSec = tsSec + deltaSec;
            }
          } else if (s.setting4 === 'Temps Repas') {
            if (s.setting2) {
              repasSec = Math.max(0, repasSec - deltaSec);
            } else if (s.setting3) {
              repasSec = repasSec + deltaSec;
            }
          }
        });
      }

      const workedCTTSec = Math.max(0, amplitudeSec - repasSec - tmSec - tsSec);
      const adminSec = parseTimeToSeconds(pt.tempsAdmin);

      workingDays.push({
        day,
        dateObj,
        dateIso,
        displayDate,
        mondayIso,
        type: 'pointage',
        pointage: pt,
        workedCTTSec,
        adminSec,
        adjustedTmSec: tmSec,
        adjustedTsSec: tsSec,
        adjustedRepasSec: repasSec,
      });
      continue;
    }

    // 4) No data
    workingDays.push({
      day,
      dateObj,
      dateIso,
      displayDate,
      mondayIso,
      type: 'nodata',
      workedCTTSec: 0,
      adminSec: 0,
    });
  }

  // Calculate Week Totals
  const weekTotalsMap = new Map<string, number>();
  const firstDayOfWeekMap = new Map<string, string>(); // mondayIso -> first dateIso in this month

  workingDays.forEach((wd) => {
    const currentTot = weekTotalsMap.get(wd.mondayIso) || 0;
    weekTotalsMap.set(wd.mondayIso, currentTot + wd.workedCTTSec + wd.adminSec);

    if (!firstDayOfWeekMap.has(wd.mondayIso)) {
      firstDayOfWeekMap.set(wd.mondayIso, wd.dateIso);
    }
  });

  // Build CSV Rows
  workingDays.forEach((wd) => {
    const isFirstDayInMonthForWeek = firstDayOfWeekMap.get(wd.mondayIso) === wd.dateIso;
    const weekTotalSec = weekTotalsMap.get(wd.mondayIso) || 0;
    const weeklyAmplitudeCol =
      isFirstDayInMonthForWeek && weekTotalSec > 0 ? secondsToHMMSS(weekTotalSec) : '';

    if (wd.type === 'absence') {
      csvLines.push([
        wd.displayDate,
        `Période d'indisponibilité : ${wd.absenceReason}`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        weeklyAmplitudeCol,
        '',
        ''
      ]);
    } else if (wd.type === 'holiday') {
      csvLines.push([
        wd.displayDate,
        'Jour Férié (France)',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        weeklyAmplitudeCol,
        '',
        ''
      ]);
    } else if (wd.type === 'nodata') {
      csvLines.push([
        wd.displayDate,
        'Aucune donnée.',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        weeklyAmplitudeCol,
        '',
        ''
      ]);
    } else if (wd.type === 'pointage' && wd.pointage) {
      const pt = wd.pointage;
      const amplitudeSec = calculateAmplitudeSeconds(pt.startTime, pt.endTime);
      const ampFormatted = amplitudeSec > 0 ? secondsToHMMSS(amplitudeSec) : '';
      
      const tmFormatted = wd.adjustedTmSec !== undefined
        ? (wd.adjustedTmSec > 0 ? secondsToHMMSS(wd.adjustedTmSec) : (pt.trajetMatin ? '0:00:00' : ''))
        : formatDurationField(pt.trajetMatin);
      const tsFormatted = wd.adjustedTsSec !== undefined
        ? (wd.adjustedTsSec > 0 ? secondsToHMMSS(wd.adjustedTsSec) : (pt.trajetSoir ? '0:00:00' : ''))
        : formatDurationField(pt.trajetSoir);
      const repasFormatted = wd.adjustedRepasSec !== undefined
        ? (wd.adjustedRepasSec > 0 ? secondsToHMMSS(wd.adjustedRepasSec) : (pt.tempsRepas ? '0:00:00' : ''))
        : formatDurationField(pt.tempsRepas);
      const workedCTTFormatted = wd.workedCTTSec > 0 ? secondsToHMMSS(wd.workedCTTSec) : '';
      const adminFormatted = formatDurationField(pt.tempsAdmin);

      csvLines.push([
        wd.displayDate,
        pt.startTime || '',
        pt.endTime || '',
        ampFormatted,
        tmFormatted,
        tsFormatted,
        repasFormatted,
        workedCTTFormatted,
        adminFormatted,
        weeklyAmplitudeCol,
        '',
        pt.comment || ''
      ]);
    }
  });

  // Bottom Footer
  csvLines.push(['', '', '', '', '', '', '', '', '', '', '', '']);
  csvLines.push([
    '',
    '',
    '',
    '',
    '"Fait à _________, le ___/___/___                                  "',
    '',
    '',
    '',
    '',
    'Heure(s) Supplémentaire(s)',
    '',
    ''
  ]);
  csvLines.push([
    '',
    '',
    '',
    '',
    'Signature Employé : _____________',
    '',
    '',
    '',
    '',
    '0:00:00',
    '',
    ''
  ]);

  return (
    '\ufeff' +
    csvLines
      .map((row) =>
        row
          .map((cell) => {
            if (cell.startsWith('"') && cell.endsWith('"')) return cell;
            if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
              return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
          })
          .join(',')
      )
      .join('\n')
  );
}

function hasPointageInMonth(
  techName: string,
  year: number,
  monthIndex: number,
  pointages: PointageLog[]
): boolean {
  if (!pointages || pointages.length === 0) return false;
  return pointages.some((p) => {
    if (!p.techName) return false;
    if (p.techName !== techName && p.techName.toLowerCase() !== techName.toLowerCase()) return false;
    const iso = parseToIso(p.startDate);
    if (!iso || iso.length < 7) return false;
    const parts = iso.split('-');
    const y = parseInt(parts[0], 10);
    const mIdx = parseInt(parts[1], 10) - 1;
    return y === year && mIdx === monthIndex;
  });
}

export default function TempsTab({ pointages = [], members = [] }: TempsTabProps) {
  const [search, setSearch] = useState('');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('Tous');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Settings for CTT Model (0 to 4 parameters)
  const [cttSettings, setCttSettings] = useState<CttModelSetting[]>(() => {
    try {
      const saved = localStorage.getItem('ctt_model_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 4);
        }
      }
    } catch (e) {
      console.error('Failed to load ctt_model_settings from localStorage', e);
    }
    return [];
  });

  const [isSettingsPaneOpen, setIsSettingsPaneOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<CttModelSetting[]>([]);

  const openSettingsPane = () => {
    setDraftSettings(JSON.parse(JSON.stringify(cttSettings)));
    setIsSettingsPaneOpen(true);
  };

  const closeSettingsPane = () => {
    setIsSettingsPaneOpen(false);
  };

  const handleSaveSettings = () => {
    const sanitized = draftSettings.slice(0, 4).map((s) => ({
      ...s,
      setting0: (s.setting0 || '').slice(0, 30),
      setting5: Math.min(500, Math.max(1, typeof s.setting5 === 'number' && !isNaN(s.setting5) && s.setting5 >= 1 ? s.setting5 : 1)),
    }));
    setCttSettings(sanitized);
    try {
      localStorage.setItem('ctt_model_settings', JSON.stringify(sanitized));
    } catch (e) {
      console.error('Failed to save ctt_model_settings to localStorage', e);
    }
    setIsSettingsPaneOpen(false);
  };

  const handleAddParam = () => {
    if (draftSettings.length >= 4) return;
    const newParam: CttModelSetting = {
      id: `ctt_param_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      setting0: '',
      setting1: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'],
      setting2: false,
      setting3: false,
      setting4: 'Temps Trajet Matin',
      setting5: 30,
    };
    setDraftSettings([...draftSettings, newParam]);
  };

  const handleDeleteParam = (index: number) => {
    setDraftSettings(draftSettings.filter((_, i) => i !== index));
  };

  const handleUpdateParam = (index: number, updates: Partial<CttModelSetting>) => {
    setDraftSettings((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    );
  };

  const handleToggleDay = (index: number, day: string) => {
    setDraftSettings((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const days = item.setting1 || [];
        const nextDays = days.includes(day)
          ? days.filter((d) => d !== day)
          : [...days, day];
        return { ...item, setting1: nextDays };
      })
    );
  };

  // Extract technician list
  const techNamesFromMembers = (members || [])
    .filter((m) => m.role === 'Technicien' || m.role?.toLowerCase().includes('tech'))
    .map((m) => m.name)
    .filter(Boolean);

  const techNamesFromPointages = (pointages || []).map((p) => p.techName).filter(Boolean);

  const allTechnicians = Array.from(
    new Set([...techNamesFromMembers, ...techNamesFromPointages])
  ).sort();

  // If no technicians found specifically as Technicien role, fall back to all member names or pointage techNames
  const technicians =
    allTechnicians.length > 0
      ? allTechnicians
      : Array.from(
          new Set([
            ...(members || []).map((m) => m.name),
            ...(pointages || []).map((p) => p.techName),
          ])
        )
          .filter(Boolean)
          .sort();

  // Generate 12 recent months up to current month plus any additional months from pointages
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const monthSet = new Set<string>();
  const monthList: { year: number; monthIndex: number; monthLabel: string; achevementDate: string }[] = [];

  const addMonth = (y: number, mIdx: number) => {
    const key = `${y}-${mIdx}`;
    if (monthSet.has(key)) return;
    monthSet.add(key);

    const monthLabel = `${FRENCH_MONTH_NAMES[mIdx]} ${y}`;
    // Achèvement indicatif: 1st day of month + 1
    const nextMonth = new Date(y, mIdx + 1, 1);
    const d = String(nextMonth.getDate()).padStart(2, '0');
    const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
    const achevementDate = `${d}/${m}/${nextMonth.getFullYear()}`;

    monthList.push({ year: y, monthIndex: mIdx, monthLabel, achevementDate });
  };

  // Add last 12 months
  for (let i = 0; i < 12; i++) {
    const d = new Date(currentYear, currentMonth - i, 1);
    addMonth(d.getFullYear(), d.getMonth());
  }

  // Add months from pointages
  (pointages || []).forEach((p) => {
    const iso = parseToIso(p.startDate);
    if (iso && iso.length >= 7) {
      const parts = iso.split('-');
      const y = parseInt(parts[0], 10);
      const mIdx = parseInt(parts[1], 10) - 1;
      if (!isNaN(y) && !isNaN(mIdx) && mIdx >= 0 && mIdx <= 11) {
        addMonth(y, mIdx);
      }
    }
  });

  // Build grid of rows: (Technician x Month)
  interface MonthlyRow {
    id: string;
    techName: string;
    year: number;
    monthIndex: number;
    monthLabel: string;
    achevementDate: string;
  }

  const rows: MonthlyRow[] = [];

  const techToUse = selectedTechFilter === 'Tous' ? technicians : [selectedTechFilter];

  techToUse.forEach((tech) => {
    monthList.forEach((ml) => {
      if (hasPointageInMonth(tech, ml.year, ml.monthIndex, pointages)) {
        rows.push({
          id: `${tech}-${ml.year}-${ml.monthIndex}`,
          techName: tech,
          year: ml.year,
          monthIndex: ml.monthIndex,
          monthLabel: ml.monthLabel,
          achevementDate: ml.achevementDate,
        });
      }
    });
  });

  // Filter rows by search
  const filteredRows = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.techName.toLowerCase().includes(q) ||
      r.monthLabel.toLowerCase().includes(q) ||
      r.achevementDate.toLowerCase().includes(q)
    );
  });

  const handleDownloadCSV = (techName: string, year: number, monthIndex: number) => {
    const csvContent = generateMonthlyCSV(techName, year, monthIndex, pointages, members, cttSettings);
    const monthLabel = `${FRENCH_MONTH_NAMES[monthIndex]}_${year}`;
    const fileName = `CTT_${techName.replace(/\s+/g, '_')}_${monthLabel}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const actionButtonStyle: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    borderRadius: '13px',
    fontSize: '18px',
    padding: '10px 20px',
    fontWeight: 'bold',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.15s ease',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
    fontSize: '16px',
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
    outline: isSearchHovered || isSearchFocused ? '2.5px solid #fa53d5' : 'none',
    outlineOffset: isSearchHovered || isSearchFocused ? '2px' : '0px',
    transition: 'all 0s',
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="temps-tab-container-harmonized">
      <style>{`
        #temps-tab-container-harmonized input#search-temps-input {
          font-size: 18px !important;
        }
        #temps-tab-container-harmonized input#search-temps-input::placeholder {
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          font-weight: 100 !important;
        }
        #temps-settings-pane input:not([type="radio"]):not([type="checkbox"]),
        #temps-settings-pane select {
          padding: 10px 14px !important;
          border: 1px solid #c9bfcd !important;
          border-radius: 13px !important;
          font-size: 16px !important;
          font-weight: 400 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
          width: 100% !important;
        }
        #temps-settings-pane select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          cursor: pointer !important;
        }
        #temps-settings-pane input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled),
        #temps-settings-pane input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled),
        #temps-settings-pane select:hover:not(:disabled),
        #temps-settings-pane select:focus:not(:disabled) {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
        }
      `}</style>

      {/* Tab Header Dashboard */}
      <div
        className="bg-white space-y-4"
        style={{
          border: '1px solid #dadada',
          borderTop: 'none',
          borderRadius: '0px 0px 18px 18px',
          maxWidth: '98%',
          margin: 'auto',
          padding: '20px',
          backgroundColor: '#ffffff',
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
          <div>
            <h2
              className="text-2xl font-bold tracking-tight font-gochi bg-white"
              style={{ color: '#000000', cursor: 'default' }}
              id="temps-tab-title"
            >
              {t("Temps")}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white">
            {/* Bouton Réglages du modèle */}
            <button
              type="button"
              onClick={openSettingsPane}
              style={actionButtonStyle}
              className="hover:bg-zinc-800 transition-colors shrink-0"
              id="btn-model-settings"
            >
              {t("Réglages du modèle")}
            </button>

            {/* Search Bar Input */}
            <div className="relative w-full sm:w-80 bg-white">
              <input
                type="text"
                id="search-temps-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Recherche.")}
                className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                style={searchInputStyle}
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filters Pills Row */}
      {technicians.length > 0 && (
        <div className="px-4 flex flex-wrap gap-2.5 justify-center sm:justify-start mt-6 mb-4" id="temps-tech-pills">
          {['Tous', ...technicians].map((filterOpt) => (
            <button
              key={filterOpt}
              type="button"
              onClick={() => setSelectedTechFilter(filterOpt)}
              style={{
                borderRadius: '1000px',
                padding: '10px 20px',
                fontSize: '15px',
                fontWeight: 100,
                cursor: 'pointer',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                backgroundColor: selectedTechFilter === filterOpt ? '#fa53d5' : '#ffffff',
                color: selectedTechFilter === filterOpt ? '#ffffff' : '#000000',
                border: selectedTechFilter === filterOpt ? '1px solid #fa53d5' : '1px solid rgb(218, 218, 218)',
                boxShadow: 'none',
                transition: 'all 0.15s ease',
              }}
              className="transition-all"
            >
              {t(filterOpt)}
            </button>
          ))}
        </div>
      )}

      {/* CTT Monthly Table */}
      <div
        className="bg-white overflow-hidden mt-6 rounded-none"
        style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}
      >
        {filteredRows.length === 0 ? (
          <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24 max-w-2xl mx-auto" />
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left font-sans border-collapse text-sm"
              id="temps-table"
              style={{
                borderTop: '1px solid rgb(218, 218, 218)',
                borderBottom: '1px solid rgb(218, 218, 218)',
              }}
            >
              <thead>
                <tr className="bg-transparent border-b border-slate-200">
                  <th className="px-6 py-4" style={thStyle}>
                    {t("Technicien.")}
                  </th>
                  <th className="px-6 py-4" style={thStyle}>
                    {t("Mois.")}
                  </th>
                  <th className="px-6 py-4" style={thStyle}>
                    {t("Achèvement indicatif.")}
                  </th>
                  <th className="px-6 py-4 text-right" style={thStyle}>
                    {t("Actions.")}
                  </th>
                </tr>
              </thead>
              <tbody className="text-slate-800 text-sm">
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="group hover:bg-[#ffecf8] transition-all border-b border-slate-100"
                  >
                    {/* Technicien */}
                    <td
                      className="px-6 py-4 font-sans"
                      style={{
                        fontSize: '16px',
                        color: '#000000',
                        fontWeight: 'bold',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      }}
                    >
                      {row.techName}
                    </td>

                    {/* Mois */}
                    <td
                      className="px-6 py-4 font-sans"
                      style={{
                        fontSize: '16px',
                        color: '#000000',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      }}
                    >
                      {row.monthLabel}
                    </td>

                    {/* Achèvement indicatif */}
                    <td
                      className="px-6 py-4 font-sans"
                      style={{
                        fontSize: '16px',
                        color: '#000000',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      }}
                    >
                      {row.achevementDate}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right whitespace-nowrap bg-transparent">
                      <button
                        type="button"
                        onClick={() => handleDownloadCSV(row.techName, row.year, row.monthIndex)}
                        style={actionButtonStyle}
                        className="hover:opacity-90 active:scale-95 font-sans bg-black text-white rounded"
                      >
                        {t("Télécharger")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SIDE PANE DRAWER: RÉGLAGES DU MODÈLE CSV */}
      {isSettingsPaneOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="temps-settings-pane-wrapper">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={closeSettingsPane}
          />

          {/* Drawer Container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10" id="temps-settings-pane">
            <div className="w-screen max-w-md sm:max-w-xl bg-white shadow-2xl flex flex-col p-6 overflow-y-auto">
              {/* Parameters List */}
              <div className="space-y-5 flex-1 pt-2 pb-2">
                {draftSettings.map((param, idx) => (
                  <div
                    key={param.id}
                    className="space-y-4 p-4 relative"
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '13px',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    {/* Parameter Header */}
                    <div className="flex items-center justify-between">
                      <span
                        className="text-base font-bold text-black"
                        style={{ fontFamily: '"Gochi", cursive, sans-serif' }}
                      >
                        PARAMÈTRES #{idx + 1} {param.setting0 ? `— ${param.setting0}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteParam(idx)}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-red-50"
                      >
                        {t("Supprimer")}
                      </button>
                    </div>

                    {/* SETTING0: Titre du paramètre */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 font-sans mb-1">
                        {t("Titre du paramètre.")}
                      </label>
                      <input
                        type="text"
                        maxLength={30}
                        value={param.setting0}
                        onChange={(e) => handleUpdateParam(idx, { setting0: e.target.value })}
                        placeholder={t("Nom ou repère (max 30 car.)")}
                      />
                      <div className="text-right text-[11px] text-slate-400 mt-1 font-sans">
                        {param.setting0.length}/30
                      </div>
                    </div>

                    {/* SETTING1: Appliquer aux jours */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 font-sans mb-1">
                        {t("Appliquer aux jours.")}
                      </label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {WEEK_DAYS.map((dayLabel) => {
                          const isSelected = (param.setting1 || []).includes(dayLabel);
                          return (
                            <button
                              key={dayLabel}
                              type="button"
                              onClick={() => handleToggleDay(idx, dayLabel)}
                              style={{
                                borderRadius: '100px',
                                fontSize: '15px',
                                borderColor: isSelected ? '#000000' : '#d7d7d7',
                              }}
                              className={`px-3.5 py-1.5 font-semibold border transition-all select-none font-sans cursor-pointer ${
                                isSelected
                                  ? 'bg-black text-white shadow-sm'
                                  : 'bg-white text-black hover:border-black'
                              }`}
                            >
                              {dayLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* SETTING2 & SETTING3: Toggles (Retirer / Ajouter) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* SETTING2: Retirer du temps effectif */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
                        <span className="text-xs font-semibold text-black select-none pr-2">
                          {t("Retirer du temps effectif.")}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={param.setting2}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              handleUpdateParam(idx, {
                                setting2: checked,
                                setting3: checked ? false : param.setting3,
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-[#dbdbdb] rounded-full cursor-pointer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#dbdbdb] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#fe4eba]" />
                        </label>
                      </div>

                      {/* SETTING3: Ajouter au temps effectif */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
                        <span className="text-xs font-semibold text-black select-none pr-2">
                          {t("Ajouter au temps effectif.")}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={param.setting3}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              handleUpdateParam(idx, {
                                setting3: checked,
                                setting2: checked ? false : param.setting2,
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-[#dbdbdb] rounded-full cursor-pointer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#dbdbdb] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#fe4eba]" />
                        </label>
                      </div>
                    </div>

                    {/* SETTING4: Colonne attribuée */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 font-sans mb-1">
                        {t("Colonne attribuée.")}
                      </label>
                      <select
                        value={param.setting4}
                        onChange={(e) =>
                          handleUpdateParam(idx, { setting4: e.target.value as CttColumnTarget })
                        }
                      >
                        <option value="Temps Trajet Matin">Temps Trajet Matin</option>
                        <option value="Temps Trajet Soir">Temps Trajet Soir</option>
                        <option value="Temps Repas">Temps Repas</option>
                      </select>
                    </div>

                    {/* SETTING5: Valeur (Mins) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 font-sans mb-1">
                        {t("Valeur (Mins).")}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={3}
                        value={param.setting5 === 0 ? '' : param.setting5}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          if (raw === '') {
                            handleUpdateParam(idx, { setting5: 0 });
                            return;
                          }
                          const num = parseInt(raw, 10);
                          const clamped = Math.min(500, Math.max(1, num));
                          handleUpdateParam(idx, { setting5: clamped });
                        }}
                        onBlur={() => {
                          if (!param.setting5 || param.setting5 < 1) {
                            handleUpdateParam(idx, { setting5: 1 });
                          }
                        }}
                        placeholder="1 à 500"
                      />
                      <div className="text-right text-[11px] text-slate-400 mt-1 font-sans">
                        {t("Min: 1 min — Max: 500 mins (chiffres uniquement)")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Actions: Ajouter un paramètre, Enregistrer & Fermer */}
              <div className="pt-4 space-y-2 mt-auto shrink-0">
                <button
                  type="button"
                  onClick={handleAddParam}
                  disabled={draftSettings.length >= 4}
                  style={{
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    borderRadius: '13px',
                    padding: '14px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    border: 'none',
                    width: '100%',
                    cursor: draftSettings.length >= 4 ? 'not-allowed' : 'pointer',
                    opacity: draftSettings.length >= 4 ? 0.4 : 1,
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                  className={draftSettings.length >= 4 ? '' : 'hover:bg-zinc-800 transition-colors'}
                >
                  + {t("Ajouter un paramètre")} ({draftSettings.length}/4)
                </button>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  style={{
                    backgroundColor: '#3556ec',
                    color: '#ffffff',
                    borderRadius: '13px',
                    padding: '14px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    border: 'none',
                    width: '100%',
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                  className="hover:bg-[#2b48cc] transition-colors"
                >
                  {t("Enregistrer")}
                </button>

                <button
                  type="button"
                  onClick={closeSettingsPane}
                  style={{
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    borderRadius: '13px',
                    padding: '14px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    border: 'none',
                    width: '100%',
                    cursor: 'pointer',
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                  className="hover:bg-zinc-800 transition-colors"
                >
                  {t("Fermer")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
