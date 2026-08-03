import React, { useState } from 'react';
import { PointageLog, Member } from '../types';
import { Download } from 'lucide-react';
import { t } from '../utils/translate';

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
  members: Member[] = []
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
  }

  const workingDays: DayInfo[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, monthIndex, day);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Exclude Saturdays & Sundays

    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateIso = `${year}-${mm}-${dd}`;
    const displayDate = `${day}/${monthIndex + 1}/${year}`;

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
      const repasSec = parseTimeToSeconds(pt.tempsRepas);
      const tmSec = parseTimeToSeconds(pt.trajetMatin);
      const tsSec = parseTimeToSeconds(pt.trajetSoir);
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
      const tmFormatted = formatDurationField(pt.trajetMatin);
      const tsFormatted = formatDurationField(pt.trajetSoir);
      const repasFormatted = formatDurationField(pt.tempsRepas);
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

export default function TempsTab({ pointages = [], members = [] }: TempsTabProps) {
  const [search, setSearch] = useState('');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('Tous');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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
      rows.push({
        id: `${tech}-${ml.year}-${ml.monthIndex}`,
        techName: tech,
        year: ml.year,
        monthIndex: ml.monthIndex,
        monthLabel: ml.monthLabel,
        achevementDate: ml.achevementDate,
      });
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
    const csvContent = generateMonthlyCSV(techName, year, monthIndex, pointages, members);
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
    fontSize: '16px',
    padding: '10px 20px',
    fontWeight: 'bold',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
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
        <div className="px-4 flex flex-wrap gap-2.5 justify-center sm:justify-start pt-2" id="temps-tech-pills">
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
          <div className="p-16 text-center font-sans lg:py-24 max-w-2xl mx-auto" id="no-pointage-view">
            <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
              {t("Aucun résultat.")}
            </p>
          </div>
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
                        <Download className="w-4 h-4" />
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
    </div>
  );
}
