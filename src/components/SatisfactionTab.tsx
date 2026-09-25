import React, { useState, useMemo, useEffect, useRef } from 'react';
import { t } from '../utils/translate';
import HelpBubble from './HelpBubble';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';

interface Review {
  id: string;
  clientName: string;
  comment: string;
  label?: string;
  defibId?: string;
  interventionReference?: string;
  interventionRef?: string;
  intervention?: string;
  qualite?: number;
  ponctualite?: number;
  politesse?: number;
  clartePdf?: number;
  explications?: number;
  sensibilisation?: number;
  npsScore?: number;
  nps?: number;
  dateStr?: string;
  date?: string;
  createdAt?: string | number;
}

interface SatisfactionTabProps {
  customerReviews: Review[];
  onUpdateReviews: (updated: Review[]) => void;
  onShowInterventionDetails?: (interventionRef: string) => void;
}

const FRENCH_MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

interface MonthOption {
  key: string; // e.g. "2026-09"
  label: string; // e.g. "Septembre 2026"
  year: number;
  month: number; // 1-12
  count: number;
}

const getReviewDate = (rev: Review): string => {
  return rev.dateStr || rev.date || (rev.createdAt ? String(rev.createdAt) : '') || '';
};

const extractMonthFromDate = (dateStr?: string): { key: string; label: string; year: number; month: number } | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const str = dateStr.trim();
  if (!str) return null;

  // 1. YYYY-MM-DD or YYYY/MM/DD or ISO string starting with YYYY-MM
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    if (month >= 1 && month <= 12 && year > 1900) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = `${FRENCH_MONTH_NAMES[month - 1]} ${year}`;
      return { key, label, year, month };
    }
  }

  // 2. DD-MM-YYYY or DD/MM/YYYY (with 2 to 4 digits year)
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyMatch) {
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    const month = parseInt(dmyMatch[2], 10);
    if (month >= 1 && month <= 12 && year > 1900) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = `${FRENCH_MONTH_NAMES[month - 1]} ${year}`;
      return { key, label, year, month };
    }
  }

  // 3. Numeric timestamp string (seconds or ms)
  if (/^\d{10,13}$/.test(str)) {
    const num = parseInt(str, 10);
    const d = new Date(num > 10000000000 ? num : num * 1000);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      if (year > 1900 && month >= 1 && month <= 12) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const label = `${FRENCH_MONTH_NAMES[month - 1]} ${year}`;
        return { key, label, year, month };
      }
    }
  }

  // 4. Textual month check like "15 Sept 2026", "15 Septembre 2026", etc.
  const monthRegexes = [
    { m: 1, re: /janv/i },
    { m: 2, re: /f[ée]vr/i },
    { m: 3, re: /mars/i },
    { m: 4, re: /avr/i },
    { m: 5, re: /mai/i },
    { m: 6, re: /juin/i },
    { m: 7, re: /juil/i },
    { m: 8, re: /ao[uû]/i },
    { m: 9, re: /sept/i },
    { m: 10, re: /oct/i },
    { m: 11, re: /nov/i },
    { m: 12, re: /d[ée]c/i },
  ];

  const yearMatch = str.match(/\b(20\d{2}|19\d{2})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    for (const item of monthRegexes) {
      if (item.re.test(str)) {
        const month = item.m;
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const label = `${FRENCH_MONTH_NAMES[month - 1]} ${year}`;
        return { key, label, year, month };
      }
    }
  }

  // 5. Fallback new Date(str)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    if (year > 1900 && month >= 1 && month <= 12) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = `${FRENCH_MONTH_NAMES[month - 1]} ${year}`;
      return { key, label, year, month };
    }
  }

  return null;
};

export default function SatisfactionTab({
  customerReviews,
  onUpdateReviews,
  onShowInterventionDetails,
}: SatisfactionTabProps) {
  // Search States
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);

  // Month filter state
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  // Performance Drawer & Period States
  const [isPerformancePaneOpen, setIsPerformancePaneOpen] = useState(false);
  const [satStartDate, setSatStartDate] = useState<string>('');
  const [satEndDate, setSatEndDate] = useState<string>('');
  const [npsStartDate, setNpsStartDate] = useState<string>('');
  const [npsEndDate, setNpsEndDate] = useState<string>('');

  // Dynamically extract only months that actually exist in the reviews list
  const availableMonths = useMemo<MonthOption[]>(() => {
    const map = new Map<string, MonthOption>();
    for (const rev of customerReviews) {
      const parsed = extractMonthFromDate(getReviewDate(rev));
      if (parsed) {
        if (!map.has(parsed.key)) {
          map.set(parsed.key, { ...parsed, count: 1 });
        } else {
          map.get(parsed.key)!.count += 1;
        }
      }
    }
    // Sort chronologically descending (most recent first)
    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [customerReviews]);

  // If the active filter is removed because of review deletion, reset to 'all'
  useEffect(() => {
    if (selectedMonth !== 'all' && !availableMonths.some((m) => m.key === selectedMonth)) {
      setSelectedMonth('all');
    }
  }, [availableMonths, selectedMonth]);

  // Label du mois sélectionné pour ajuster automatiquement la largeur du select
  const selectedMonthLabel = useMemo(() => {
    if (selectedMonth === 'all') return t("Tous les mois") || "Tous les mois";
    const found = availableMonths.find((m) => m.key === selectedMonth);
    return found ? found.label : selectedMonth;
  }, [selectedMonth, availableMonths]);

  // Helper date formatter
  const formatToDisplayDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    const clean = dateStr.trim();
    // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
    const ymd = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymd) {
      return `${String(ymd[3]).padStart(2, '0')}-${String(ymd[2]).padStart(2, '0')}-${ymd[1]}`;
    }
    // DD-MM-YYYY or DD/MM/YYYY
    const dmy = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) {
      return `${String(dmy[1]).padStart(2, '0')}-${String(dmy[2]).padStart(2, '0')}-${dmy[3]}`;
    }
    return clean;
  };

  const parseReviewTimestamp = (rev: Review): Date | null => {
    const raw = getReviewDate(rev);
    if (!raw) return null;
    const s = raw.trim();
    const matchISO = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (matchISO) {
      return new Date(parseInt(matchISO[1], 10), parseInt(matchISO[2], 10) - 1, parseInt(matchISO[3], 10));
    }
    const matchFR = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (matchFR) {
      return new Date(parseInt(matchFR[3], 10), parseInt(matchFR[2], 10) - 1, parseInt(matchFR[1], 10));
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    return null;
  };

  // Performance Side-Pane: Satisfaction Moyenne with Date Range filter
  const perfSatisfaction = useMemo(() => {
    let reviews = customerReviews;
    if (satStartDate || satEndDate) {
      let startTs = -Infinity;
      let endTs = Infinity;
      if (satStartDate) {
        const m = satStartDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) startTs = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 0, 0, 0, 0).getTime();
      }
      if (satEndDate) {
        const m = satEndDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) endTs = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 23, 59, 59, 999).getTime();
      }
      reviews = reviews.filter((r) => {
        const d = parseReviewTimestamp(r);
        if (!d) return false;
        const t = d.getTime();
        return t >= startTs && t <= endTs;
      });
    }

    const validNotes: number[] = [];
    reviews.forEach((rev) => {
      const nums = [rev.qualite, rev.ponctualite, rev.politesse, rev.clartePdf, rev.explications, rev.sensibilisation].filter(
        (v): v is number => typeof v === 'number' && !isNaN(v)
      );
      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0);
        validNotes.push(sum / nums.length);
      } else if (rev.label) {
        if (rev.label === 'Excellent' || rev.label === 'Parfait') validNotes.push(4);
        else if (rev.label === 'Moyen') validNotes.push(2.5);
        else if (rev.label === 'Décevant') validNotes.push(1.5);
        else if (rev.label === 'Médiocre') validNotes.push(1);
      }
    });

    if (validNotes.length === 0) {
      return {
        scoreDisplay: "-",
        totalCount: 0,
        pctScore: "-",
      };
    }

    const totalSum = validNotes.reduce((a, b) => a + b, 0);
    const avg = totalSum / validNotes.length;
    const formatted = avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(1);
    const pct = Math.round((avg / 4) * 100);

    return {
      scoreDisplay: `${formatted}/4`,
      totalCount: validNotes.length,
      pctScore: `${pct}%`,
    };
  }, [customerReviews, satStartDate, satEndDate]);

  // Performance Side-Pane: Score NPS with Date Range filter
  const perfNps = useMemo(() => {
    let reviews = customerReviews.filter((rev) => {
      const score = typeof rev.npsScore === 'number' ? rev.npsScore : (typeof rev.nps === 'number' ? rev.nps : null);
      return score !== null && !isNaN(score);
    });

    if (npsStartDate || npsEndDate) {
      let startTs = -Infinity;
      let endTs = Infinity;
      if (npsStartDate) {
        const m = npsStartDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) startTs = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 0, 0, 0, 0).getTime();
      }
      if (npsEndDate) {
        const m = npsEndDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) endTs = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 23, 59, 59, 999).getTime();
      }
      reviews = reviews.filter((r) => {
        const d = parseReviewTimestamp(r);
        if (!d) return false;
        const t = d.getTime();
        return t >= startTs && t <= endTs;
      });
    }

    const totalCount = reviews.length;
    if (totalCount === 0) {
      return {
        scoreDisplay: "-",
        npsInt: null,
        totalCount: 0,
        promotersCount: 0,
        passivesCount: 0,
        detractorsCount: 0,
        pctPromoters: 0,
        pctPassives: 0,
        pctDetractors: 0,
      };
    }

    let promoters = 0;
    let passives = 0;
    let detractors = 0;

    reviews.forEach((rev) => {
      const score = typeof rev.npsScore === 'number' ? rev.npsScore : (typeof rev.nps === 'number' ? rev.nps : 0);
      if (score >= 9) {
        promoters++;
      } else if (score >= 7) {
        passives++;
      } else {
        detractors++;
      }
    });

    const pctPromoters = (promoters / totalCount) * 100;
    const pctDetractors = (detractors / totalCount) * 100;
    const pctPassives = (passives / totalCount) * 100;

    const npsValue = Math.round(pctPromoters - pctDetractors);
    const clampedNps = Math.max(-100, Math.min(100, npsValue));
    const scoreDisplay = clampedNps > 0 ? `+${clampedNps}` : `${clampedNps}`;

    return {
      scoreDisplay,
      npsInt: clampedNps,
      totalCount,
      promotersCount: promoters,
      passivesCount: passives,
      detractorsCount: detractors,
      pctPromoters: Math.round(pctPromoters),
      pctPassives: Math.round(pctPassives),
      pctDetractors: Math.round(pctDetractors),
    };
  }, [customerReviews, npsStartDate, npsEndDate]);

  const getNoteGlobale = (rev: Review): string => {
    const nums = [rev.qualite, rev.ponctualite, rev.politesse, rev.clartePdf, rev.explications, rev.sensibilisation].filter(
      (v): v is number => typeof v === 'number' && !isNaN(v)
    );
    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      return avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(1);
    }
    // Backward compatibility for old review label
    if (rev.label) {
      if (rev.label === 'Excellent' || rev.label === 'Parfait') return '4';
      if (rev.label === 'Moyen') return '2.5';
      if (rev.label === 'Décevant') return '1.5';
      if (rev.label === 'Médiocre') return '1';
    }
    return '-';
  };

  const handleDeleteReview = (id: string) => {
    const updated = customerReviews.filter(r => r.id !== id);
    onUpdateReviews(updated);
    setDeleteReviewId(null);
  };

  const getPercentageFromNote = (noteStr: string): string => {
    if (!noteStr || noteStr === '-') return '-';
    const num = parseFloat(String(noteStr).replace(',', '.'));
    if (isNaN(num)) return '-';
    const pct = (num / 4) * 100;
    return `${Math.round(pct)}%`;
  };

  // Brand aesthetic styling constants matching other panels
  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
  };

  const roundBadgeStyle: React.CSSProperties = {
    width: '27px',
    height: '27px',
    borderRadius: '50%',
    backgroundColor: '#fe4eba',
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: '11px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    flexShrink: 0,
    userSelect: 'none',
  };

  const percentBadgeStyle: React.CSSProperties = {
    ...roundBadgeStyle,
    width: '46px',
    height: '46px',
    fontSize: '13.5px',
    letterSpacing: '-0.3px',
  };

  const rowActionButtonStyle: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '10px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
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
    outline: (isSearchHovered || isSearchFocused) ? '2.5px solid #fa53d5' : 'none',
    outlineOffset: (isSearchHovered || isSearchFocused) ? '2px' : '0px',
    transition: 'all 0s',
  };

  // Searching and month filtering logic - calculates exactly the rows displayed on screen
  const filteredReviews = useMemo(() => {
    return customerReviews.filter((rev) => {
      // 1. Month filter
      if (selectedMonth !== 'all') {
        const parsed = extractMonthFromDate(getReviewDate(rev));
        if (!parsed || parsed.key !== selectedMonth) {
          return false;
        }
      }

      // 2. Search query filter
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (rev.clientName && rev.clientName.toLowerCase().includes(q)) ||
        (rev.comment && rev.comment.toLowerCase().includes(q)) ||
        (rev.label && rev.label.toLowerCase().includes(q)) ||
        (rev.interventionReference && rev.interventionReference.toLowerCase().includes(q)) ||
        (rev.interventionRef && rev.interventionRef.toLowerCase().includes(q)) ||
        (rev.intervention && rev.intervention.toLowerCase().includes(q)) ||
        (rev.defibId && rev.defibId.toLowerCase().includes(q))
      );
    });
  }, [customerReviews, selectedMonth, search]);

  // CSV Export handler - exports dynamically based on the current display and title
  const handleExportCSV = () => {
    const headers = [
      "Note globale",
      "Date",
      "Intervention",
      "Rédacteur",
      "Qualité",
      "Ponctualité",
      "Politesse",
      "Clarté PDF",
      "Explications",
      "Sensibilisation",
      "NPS Score /10",
      "Évaluation"
    ];

    const rows = filteredReviews.map(rev => {
      const note = getNoteGlobale(rev);
      const date = formatToDisplayDate(getReviewDate(rev)) || '';
      const intervention = rev.interventionReference || rev.interventionRef || rev.intervention || '';
      const client = rev.clientName || '';
      const qualite = rev.qualite !== undefined && rev.qualite !== null ? rev.qualite : '';
      const ponctualite = rev.ponctualite !== undefined && rev.ponctualite !== null ? rev.ponctualite : '';
      const politesse = rev.politesse !== undefined && rev.politesse !== null ? rev.politesse : '';
      const clartePdf = rev.clartePdf !== undefined && rev.clartePdf !== null ? rev.clartePdf : '';
      const explications = rev.explications !== undefined && rev.explications !== null ? rev.explications : '';
      const sensibilisation = rev.sensibilisation !== undefined && rev.sensibilisation !== null ? rev.sensibilisation : '';
      const npsScore = rev.npsScore !== undefined && rev.npsScore !== null ? rev.npsScore : (rev.nps !== undefined && rev.nps !== null ? rev.nps : '');
      const evaluation = (rev.comment || '').replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');

      return [
        `"${note}"`,
        `"${date}"`,
        `"${intervention.replace(/"/g, '""')}"`,
        `"${client.replace(/"/g, '""')}"`,
        `"${qualite}"`,
        `"${ponctualite}"`,
        `"${politesse}"`,
        `"${clartePdf}"`,
        `"${explications}"`,
        `"${sensibilisation}"`,
        `"${npsScore}"`,
        `"${evaluation}"`
      ].join(';');
    });

    const csvContent = "\uFEFF" + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    // Dynamic file name based on current display / period title
    const selectedMonthOption = availableMonths.find((m) => m.key === selectedMonth);
    const periodLabel = selectedMonth === 'all'
      ? 'Tous_les_mois'
      : (selectedMonthOption ? selectedMonthOption.label.replace(/\s+/g, '_') : selectedMonth);

    link.setAttribute('download', `evaluations_satisfaction_${periodLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Dynamic column averages for the second header row based on displayed reviews
  const columnAverages = useMemo(() => {
    const calcAvg = (key: 'qualite' | 'ponctualite' | 'politesse' | 'clartePdf' | 'explications' | 'sensibilisation'): string => {
      const nums = filteredReviews
        .map((r) => r[key])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v));
      if (nums.length === 0) return '-';
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      return avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(1);
    };

    const allNoteGlobaleNums = filteredReviews
      .map((r) => {
        const ng = getNoteGlobale(r);
        return ng !== '-' ? parseFloat(ng.replace(',', '.')) : null;
      })
      .filter((v): v is number => v !== null && !isNaN(v));

    const noteGlobaleAvg = allNoteGlobaleNums.length > 0
      ? (() => {
          const sum = allNoteGlobaleNums.reduce((a, b) => a + b, 0);
          const avg = sum / allNoteGlobaleNums.length;
          return avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(1);
        })()
      : '-';

    const qualite = calcAvg('qualite');
    const ponctualite = calcAvg('ponctualite');
    const politesse = calcAvg('politesse');
    const clartePdf = calcAvg('clartePdf');
    const explications = calcAvg('explications');
    const sensibilisation = calcAvg('sensibilisation');

    const npsNums = filteredReviews
      .map((r) => (typeof r.npsScore === 'number' ? r.npsScore : (typeof r.nps === 'number' ? r.nps : null)))
      .filter((v): v is number => v !== null && !isNaN(v));

    const npsScoreAvg = npsNums.length > 0
      ? (() => {
          const sum = npsNums.reduce((a, b) => a + b, 0);
          const avg = sum / npsNums.length;
          return avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(1);
        })()
      : '-';

    const getNpsPercentage = (scoreStr: string): string => {
      if (!scoreStr || scoreStr === '-') return '-';
      const num = parseFloat(String(scoreStr).replace(',', '.'));
      if (isNaN(num)) return '-';
      const pct = (num / 10) * 100;
      return `${Math.round(pct)}%`;
    };

    return {
      noteGlobale: noteGlobaleAvg,
      noteGlobalePct: getPercentageFromNote(noteGlobaleAvg),
      qualite,
      qualitePct: getPercentageFromNote(qualite),
      ponctualite,
      ponctualitePct: getPercentageFromNote(ponctualite),
      politesse,
      politessePct: getPercentageFromNote(politesse),
      clartePdf,
      clartePdfPct: getPercentageFromNote(clartePdf),
      explications,
      explicationsPct: getPercentageFromNote(explications),
      sensibilisation,
      sensibilisationPct: getPercentageFromNote(sensibilisation),
      npsScore: npsScoreAvg,
      npsScorePct: getNpsPercentage(npsScoreAvg),
    };
  }, [filteredReviews]);

  return (
    <div className="space-y-6 animate-fadeIn" id="satisfaction-tab-container-harmonized">
      <style>{`
        #satisfaction-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-satisfaction-input) {
          padding: 12px !important;
          border: 1px solid #dedede !important;
          border-radius: 13px !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
        }
        #satisfaction-tab-container-harmonized input#search-satisfaction-input {
          font-size: 18px !important;
        }
        #satisfaction-tab-container-harmonized input#search-satisfaction-input::placeholder {
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          font-weight: 100 !important;
        }
        #satisfaction-tab-container-harmonized #search-satisfaction-input:hover,
        #satisfaction-tab-container-harmonized #search-satisfaction-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
      `}</style>
      
      {/* Header Box aligned with other modules */}
      <div 
        className="bg-white space-y-4 animate-fadeIn"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default' }} id="satisfaction-tab-title">{t("Satisfaction")}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white">
            {/* Search Bar Input */}
            <div className="relative w-full sm:w-80 bg-white">
              <input
                type="text"
                id="search-satisfaction-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Rechercher.") || t("Recherche.") || "Rechercher."}
                className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                style={searchInputStyle}
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
            </div>

            {/* Filter Month Button / Native Dropdown (Largeur auto selon le texte affiché) */}
            <div className="relative inline-flex items-center">
              <button
                type="button"
                style={{
                  ...rowActionButtonStyle,
                  width: 'auto',
                  whiteSpace: 'nowrap',
                }}
                className="cursor-pointer font-sans hover:opacity-80 transition-all select-none"
              >
                <span>{selectedMonthLabel}</span>
              </button>
              <select
                id="filter-month-satisfaction"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title={t("Filtrer par mois")}
              >
                <option value="all" className="bg-white text-black font-normal">
                  {t("Tous les mois")}
                </option>
                {availableMonths.map((m) => (
                  <option key={m.key} value={m.key} className="bg-white text-black font-normal">
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Performance Button */}
            <button
              type="button"
              id="btn-satisfaction-performance"
              onClick={() => setIsPerformancePaneOpen(true)}
              style={rowActionButtonStyle}
              className="cursor-pointer font-sans whitespace-nowrap hover:opacity-80 transition-all"
            >
              <span>{t("Performance")}</span>
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              id="btn-export-satisfaction-csv"
              onClick={handleExportCSV}
              style={rowActionButtonStyle}
              className="cursor-pointer font-sans whitespace-nowrap hover:opacity-80 transition-all"
            >
              <span>{t("Exporter")}</span>
            </button>
          </div>
        </div>
      </div>

      <HelpBubble 
        cacheKey="help_dismissed_satisfaction" 
        text="Retrouvez ici les retours de vos clients suite au lien envoyé après chaque intervention. Ces données permettent de mesurer la satisfaction globale et d'identifier d'éventuels points d'amélioration pour vos services. Chaque retour est horodaté et associé à l'évaluation donnée par le client." 
        style={{ marginBottom: '16px' }}
      />

      {/* Fixed Info Div: Satisfaction Form Preview */}
      <div 
        id="satisfaction-form-preview-card"
        className="p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn transition-all"
        style={{
          borderColor: 'rgb(203 192 206)',
          background: 'rgba(255, 255, 255, 0)',
          backgroundColor: 'rgba(255, 255, 255, 0)',
          boxShadow: 'none',
          maxWidth: '98%',
          margin: '20px auto',
        }}
      >
        <div className="flex flex-col md:flex-row items-center md:items-center gap-4 flex-1">
          <div className="flex items-start gap-3 w-full">
            <p 
              className="font-sans leading-relaxed"
              style={{ 
                fontSize: '16px', 
                fontWeight: 400, 
                color: '#000000', 
                cursor: 'default' 
              }}
            >
              {t("Le formulaire de satisfaction comporte des champs permettant au client d'évaluer la prestation perçue, notamment par rapport au savoir-être du technicien et au résultat matériel de l'intervention. Vous pouvez consulter un aperçu du formulaire.")}
            </p>
          </div>
        </div>
        <a
          id="btn-preview-satisfaction-form"
          href="https://consoledefibeo.deroesch.com/satisfaction"
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans font-semibold active:scale-95 transition-all border-0 cursor-pointer shrink-0 inline-flex items-center justify-center text-center whitespace-nowrap"
          style={{
            backgroundColor: 'rgb(0, 0, 0)',
            color: 'rgb(255, 255, 255)',
            fontSize: '18px',
            borderRadius: '13px',
            padding: '10px 20px',
            boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgb(255 255 255 / 29%) 0px 6px 12px inset',
            textDecoration: 'none',
          }}
        >
          {t("Aperçu du formulaire")}
        </a>
      </div>

      {/* Main Table Content */}
      <div className="bg-white overflow-hidden mt-6 rounded-none animate-fadeIn" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans border-collapse text-xs" id="satisfaction-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
            <thead>
              <tr className="bg-transparent">
                <th className="px-3 pt-3 pb-1.5 text-center min-w-[120px] whitespace-nowrap" style={thStyle}>{t("Note globale.")}</th>
                <th className="px-4 pt-3 pb-1.5 w-28 whitespace-nowrap" style={thStyle}>{t("Date.")}</th>
                <th className="px-4 pt-3 pb-1.5 w-36 whitespace-nowrap" style={thStyle}>{t("Intervention.")}</th>
                <th className="px-4 pt-3 pb-1.5 w-40 whitespace-nowrap" style={thStyle}>{t("Rédacteur.")}</th>
                <th className="px-2 pt-3 pb-1.5 text-center min-w-[105px] whitespace-nowrap" style={thStyle}>{t("Qualité.")}</th>
                <th className="px-2 pt-3 pb-1.5 text-center min-w-[105px] whitespace-nowrap" style={thStyle}>{t("Ponctualité.")}</th>
                <th className="px-2 pt-3 pb-1.5 text-center min-w-[105px] whitespace-nowrap" style={thStyle}>{t("Politesse.")}</th>
                <th className="px-2 pt-3 pb-1.5 text-center min-w-[105px] whitespace-nowrap" style={thStyle}>{t("Clarté PDF.")}</th>
                <th className="px-2 pt-3 pb-1.5 text-center min-w-[105px] whitespace-nowrap" style={thStyle}>{t("Explications.")}</th>
                <th className="px-2 pt-3 pb-1.5 text-center min-w-[105px] whitespace-nowrap" style={thStyle}>{t("Sensibilisation.")}</th>
                <th className="px-2 pt-3 pb-1.5 text-center min-w-[110px] whitespace-nowrap" style={thStyle}>{t("NPS Score /10.")}</th>
                <th className="px-4 pt-3 pb-1.5" style={thStyle}>{t("Évaluation.")}</th>
                <th className="px-4 pt-3 pb-1.5 text-right w-44 whitespace-nowrap" style={thStyle}>{t("Actions.")}</th>
              </tr>
              {/* Second header row: column averages */}
              <tr className="bg-transparent" style={{ borderBottom: '1px solid rgb(218, 218, 218)' }}>
                <th className="px-3 pt-1.5 pb-3 text-center align-middle whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-[2px]">
                    <div style={roundBadgeStyle} title={t("Moyenne Note globale")}>
                      {columnAverages.noteGlobale === '-' ? '-' : columnAverages.noteGlobale}
                    </div>
                    <div style={percentBadgeStyle} title={t("Moyenne Note globale (%)")}>
                      {columnAverages.noteGlobalePct === '-' ? '-' : columnAverages.noteGlobalePct}
                    </div>
                  </div>
                </th>
                <th className="px-4 pt-1.5 pb-3"></th>
                <th className="px-4 pt-1.5 pb-3"></th>
                <th className="px-4 pt-1.5 pb-3"></th>
                <th className="px-2 pt-1.5 pb-3 text-center align-middle whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-[2px]">
                    <div style={roundBadgeStyle} title={t("Moyenne Qualité")}>
                      {columnAverages.qualite === '-' ? '-' : columnAverages.qualite}
                    </div>
                    <div style={percentBadgeStyle} title={t("Moyenne Qualité (%)")}>
                      {columnAverages.qualitePct === '-' ? '-' : columnAverages.qualitePct}
                    </div>
                  </div>
                </th>
                <th className="px-2 pt-1.5 pb-3 text-center align-middle whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-[2px]">
                    <div style={roundBadgeStyle} title={t("Moyenne Ponctualité")}>
                      {columnAverages.ponctualite === '-' ? '-' : columnAverages.ponctualite}
                    </div>
                    <div style={percentBadgeStyle} title={t("Moyenne Ponctualité (%)")}>
                      {columnAverages.ponctualitePct === '-' ? '-' : columnAverages.ponctualitePct}
                    </div>
                  </div>
                </th>
                <th className="px-2 pt-1.5 pb-3 text-center align-middle whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-[2px]">
                    <div style={roundBadgeStyle} title={t("Moyenne Politesse")}>
                      {columnAverages.politesse === '-' ? '-' : columnAverages.politesse}
                    </div>
                    <div style={percentBadgeStyle} title={t("Moyenne Politesse (%)")}>
                      {columnAverages.politessePct === '-' ? '-' : columnAverages.politessePct}
                    </div>
                  </div>
                </th>
                <th className="px-2 pt-1.5 pb-3 text-center align-middle whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-[2px]">
                    <div style={roundBadgeStyle} title={t("Moyenne Clarté PDF")}>
                      {columnAverages.clartePdf === '-' ? '-' : columnAverages.clartePdf}
                    </div>
                    <div style={percentBadgeStyle} title={t("Moyenne Clarté PDF (%)")}>
                      {columnAverages.clartePdfPct === '-' ? '-' : columnAverages.clartePdfPct}
                    </div>
                  </div>
                </th>
                <th className="px-2 pt-1.5 pb-3 text-center align-middle whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-[2px]">
                    <div style={roundBadgeStyle} title={t("Moyenne Explications")}>
                      {columnAverages.explications === '-' ? '-' : columnAverages.explications}
                    </div>
                    <div style={percentBadgeStyle} title={t("Moyenne Explications (%)")}>
                      {columnAverages.explicationsPct === '-' ? '-' : columnAverages.explicationsPct}
                    </div>
                  </div>
                </th>
                <th className="px-2 pt-1.5 pb-3 text-center align-middle whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-[2px]">
                    <div style={roundBadgeStyle} title={t("Moyenne Sensibilisation")}>
                      {columnAverages.sensibilisation === '-' ? '-' : columnAverages.sensibilisation}
                    </div>
                    <div style={percentBadgeStyle} title={t("Moyenne Sensibilisation (%)")}>
                      {columnAverages.sensibilisationPct === '-' ? '-' : columnAverages.sensibilisationPct}
                    </div>
                  </div>
                </th>
                <th className="px-2 pt-1.5 pb-3 text-center align-middle whitespace-nowrap">
                  <div className="inline-flex items-center justify-center gap-[2px]">
                    <div style={roundBadgeStyle} title={t("Moyenne NPS Score")}>
                      {columnAverages.npsScore === '-' ? '-' : columnAverages.npsScore}
                    </div>
                    <div style={percentBadgeStyle} title={t("Moyenne NPS Score (%)")}>
                      {columnAverages.npsScorePct === '-' ? '-' : columnAverages.npsScorePct}
                    </div>
                  </div>
                </th>
                <th className="px-4 pt-1.5 pb-3"></th>
                <th className="px-4 pt-1.5 pb-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="text-slate-700 text-xs text-black">
              {filteredReviews.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12">
                    <EmptyTablePlaceholder className="p-12 text-center font-sans lg:py-16" />
                  </td>
                </tr>
              ) : (
                filteredReviews.map((rev) => {
                  const truncatedClientName = rev.clientName && rev.clientName.length > 15 
                    ? `${rev.clientName.substring(0, 15)}...` 
                    : rev.clientName || '-';

                  const cleanComment = rev.comment ? rev.comment.replace(/\r?\n|\r/g, " ").trim() : '';
                  const truncatedComment = cleanComment.length > 30 
                    ? `${cleanComment.substring(0, 30)}...` 
                    : cleanComment || '-';

                  const noteGlobale = getNoteGlobale(rev);

                  return (
                    <tr key={rev.id} className="group hover:bg-[#ffecf8] transition-all cursor-pointer">
                      
                      {/* Round badges for Note globale (Note + Pourcentage) */}
                      <td className="px-3 py-4 align-middle text-center cursor-default whitespace-nowrap">
                        <div className="inline-flex items-center justify-center gap-[2px]">
                          <div style={roundBadgeStyle} title={`${noteGlobale}/4`}>
                            {noteGlobale === '-' ? '-' : noteGlobale}
                          </div>
                          <div style={percentBadgeStyle} title={getPercentageFromNote(noteGlobale)}>
                            {getPercentageFromNote(noteGlobale) === '-' ? '-' : getPercentageFromNote(noteGlobale)}
                          </div>
                        </div>
                      </td>

                      {/* Date of review */}
                      <td className="px-4 py-4 font-sans align-middle cursor-default whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          {formatToDisplayDate(getReviewDate(rev)) || '-'}
                        </div>
                      </td>

                      {/* Intervention Reference */}
                      <td className="px-4 py-4 font-sans align-middle cursor-default whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="font-bold text-black whitespace-nowrap" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          {rev.interventionReference || rev.interventionRef || rev.intervention || ''}
                        </div>
                      </td>

                      {/* Customer Info (Rédacteur) */}
                      <td className="px-4 py-4 font-sans align-middle cursor-default whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="font-bold text-black whitespace-nowrap" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          {truncatedClientName}
                        </div>
                      </td>

                      {/* Qualité */}
                      <td className="px-3 py-4 text-center align-middle font-medium" style={{ fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {rev.qualite ?? '-'}
                      </td>

                      {/* Ponctualité */}
                      <td className="px-3 py-4 text-center align-middle font-medium" style={{ fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {rev.ponctualite ?? '-'}
                      </td>

                      {/* Politesse */}
                      <td className="px-3 py-4 text-center align-middle font-medium" style={{ fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {rev.politesse ?? '-'}
                      </td>

                      {/* Clarté PDF */}
                      <td className="px-3 py-4 text-center align-middle font-medium" style={{ fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {rev.clartePdf ?? '-'}
                      </td>

                      {/* Explications */}
                      <td className="px-3 py-4 text-center align-middle font-medium" style={{ fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {rev.explications ?? '-'}
                      </td>

                      {/* Sensibilisation */}
                      <td className="px-3 py-4 text-center align-middle font-medium" style={{ fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {rev.sensibilisation ?? '-'}
                      </td>

                      {/* NPS Score /10 */}
                      <td className="px-3 py-4 text-center align-middle font-medium" style={{ fontSize: '16px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {rev.npsScore ?? rev.nps ?? '-'}
                      </td>

                      {/* Comment (Évaluation) */}
                      <td className="px-4 py-4 font-sans align-middle cursor-default whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="text-black" style={{ color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          {truncatedComment}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-right align-middle whitespace-nowrap bg-transparent" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={!((rev.interventionReference || rev.interventionRef || rev.intervention || '').trim())}
                            onClick={() => {
                              const refVal = (rev.interventionReference || rev.interventionRef || rev.intervention || '').trim();
                              if (refVal && onShowInterventionDetails) {
                                onShowInterventionDetails(refVal);
                              }
                            }}
                            style={{
                              ...rowActionButtonStyle,
                              opacity: ((rev.interventionReference || rev.interventionRef || rev.intervention || '').trim()) ? 1 : 0.4,
                              cursor: ((rev.interventionReference || rev.interventionRef || rev.intervention || '').trim()) ? 'pointer' : 'not-allowed',
                            }}
                            className="font-sans bg-transparent hover:opacity-80 transition-all"
                            title={((rev.interventionReference || rev.interventionRef || rev.intervention || '').trim()) ? t("Détails intervention") : t("Aucune référence intervention")}
                          >
                            <span>{t("Détails intervention")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReview(rev.id)}
                            style={rowActionButtonStyle}
                            className="cursor-pointer font-sans bg-transparent hover:opacity-80 transition-all"
                          >
                            <span>{t("Supprimer")}</span>
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                }))}
              </tbody>
            </table>
        </div>
      </div>

      {/* Side-pane Performance */}
      {isPerformancePaneOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"
          style={{ top: 0, left: 0, right: 0, bottom: 0, height: '100vh', width: '100vw' }}
          onClick={() => setIsPerformancePaneOpen(false)}
        >
          <div 
            className="relative w-full max-w-xl bg-white flex flex-col overflow-hidden animate-slideLeft h-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-28 pt-8">
              
              {/* BLOC 1 : Satisfaction Moyenne */}
              <div 
                style={{
                  border: '1px solid rgb(218, 218, 218)',
                  borderRadius: '18px',
                  padding: '24px',
                  backgroundColor: '#ffffff',
                }}
                className="space-y-4 shadow-3xs"
              >
                <div className="flex items-center justify-between">
                  <h4 
                    style={{ fontSize: '18px', fontWeight: 600, color: '#000000', fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                    className="cursor-default"
                  >
                    {t("Satisfaction Moyenne.") || "Satisfaction Moyenne."}
                  </h4>
                  {(satStartDate || satEndDate) && (
                    <button
                      type="button"
                      onClick={() => { setSatStartDate(''); setSatEndDate(''); }}
                      className="text-xs text-slate-500 hover:text-black underline cursor-pointer font-sans"
                    >
                      {t("Réinitialiser")}
                    </button>
                  )}
                </div>

                {/* Date range filter fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label 
                      htmlFor="input-sat-start-date" 
                      className="block text-xs font-semibold text-slate-600 uppercase"
                      style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                    >
                      {t("Début.") || "Début."}
                    </label>
                    <input
                      type="date"
                      id="input-sat-start-date"
                      value={satStartDate}
                      onChange={(e) => setSatStartDate(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        border: '1px solid #dedede',
                        borderRadius: '13px',
                        fontSize: '16px',
                        fontWeight: 100,
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        boxSizing: 'border-box',
                        outline: 'none',
                        width: '100%',
                      }}
                      className="hover:border-slate-400 focus:border-[#fa53d5] transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label 
                      htmlFor="input-sat-end-date" 
                      className="block text-xs font-semibold text-slate-600 uppercase"
                      style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                    >
                      {t("Fin.") || "Fin."}
                    </label>
                    <input
                      type="date"
                      id="input-sat-end-date"
                      value={satEndDate}
                      onChange={(e) => setSatEndDate(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        border: '1px solid #dedede',
                        borderRadius: '13px',
                        fontSize: '16px',
                        fontWeight: 100,
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        boxSizing: 'border-box',
                        outline: 'none',
                        width: '100%',
                      }}
                      className="hover:border-slate-400 focus:border-[#fa53d5] transition-colors"
                    />
                  </div>
                </div>

                {/* Metric results */}
                <div 
                  className="pt-2 flex flex-col items-center justify-center text-center p-4 rounded-xl"
                  style={{ backgroundColor: '#fafafa', border: '1px solid #f0f0f0' }}
                >
                  <div className="flex items-center justify-center gap-[2px]">
                    <div 
                      style={{ 
                        fontSize: '34px', 
                        fontWeight: 900, 
                        color: '#000000', 
                        fontFamily: "'Gochi', cursive, sans-serif",
                        lineHeight: 1
                      }}
                    >
                      {perfSatisfaction.scoreDisplay}
                    </div>
                    <div 
                      style={percentBadgeStyle}
                    >
                      {perfSatisfaction.pctScore === '-' ? '-' : perfSatisfaction.pctScore}
                    </div>
                  </div>
                  <div 
                    className="text-sm text-slate-600 mt-2"
                    style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                  >
                    {perfSatisfaction.totalCount === 0
                      ? "-"
                      : `${perfSatisfaction.totalCount} ${perfSatisfaction.totalCount > 1 ? t("avis enregistrés") : t("avis enregistré")}`}
                  </div>
                </div>
              </div>

              {/* BLOC 2 : Score NPS */}
              <div 
                style={{
                  border: '1px solid rgb(218, 218, 218)',
                  borderRadius: '18px',
                  padding: '24px',
                  backgroundColor: '#ffffff',
                }}
                className="space-y-4 shadow-3xs"
              >
                <div className="flex items-center justify-between">
                  <h4 
                    style={{ fontSize: '18px', fontWeight: 600, color: '#000000', fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                    className="cursor-default"
                  >
                    {t("Score NPS.") || "Score NPS."}
                  </h4>
                  {(npsStartDate || npsEndDate) && (
                    <button
                      type="button"
                      onClick={() => { setNpsStartDate(''); setNpsEndDate(''); }}
                      className="text-xs text-slate-500 hover:text-black underline cursor-pointer font-sans"
                    >
                      {t("Réinitialiser")}
                    </button>
                  )}
                </div>

                {/* Date range filter fields without any mention of 'Par défaut : all time' */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label 
                      htmlFor="input-nps-start-date" 
                      className="block text-xs font-semibold text-slate-600 uppercase"
                      style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                    >
                      {t("Début.") || "Début."}
                    </label>
                    <input
                      type="date"
                      id="input-nps-start-date"
                      value={npsStartDate}
                      onChange={(e) => setNpsStartDate(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        border: '1px solid #dedede',
                        borderRadius: '13px',
                        fontSize: '16px',
                        fontWeight: 100,
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        boxSizing: 'border-box',
                        outline: 'none',
                        width: '100%',
                      }}
                      className="hover:border-slate-400 focus:border-[#fa53d5] transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label 
                      htmlFor="input-nps-end-date" 
                      className="block text-xs font-semibold text-slate-600 uppercase"
                      style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                    >
                      {t("Fin.") || "Fin."}
                    </label>
                    <input
                      type="date"
                      id="input-nps-end-date"
                      value={npsEndDate}
                      onChange={(e) => setNpsEndDate(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        border: '1px solid #dedede',
                        borderRadius: '13px',
                        fontSize: '16px',
                        fontWeight: 100,
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        boxSizing: 'border-box',
                        outline: 'none',
                        width: '100%',
                      }}
                      className="hover:border-slate-400 focus:border-[#fa53d5] transition-colors"
                    />
                  </div>
                </div>

                {/* Score Big Display */}
                <div 
                  className="pt-2 flex flex-col items-center justify-center text-center p-4 rounded-xl"
                  style={{ backgroundColor: '#fafafa', border: '1px solid #f0f0f0' }}
                >
                  <div 
                    style={{ 
                      fontSize: '44px', 
                      fontWeight: 900, 
                      color: perfNps.npsInt === null ? '#000000' : (perfNps.npsInt > 0 ? '#10b981' : (perfNps.npsInt < 0 ? '#ef4444' : '#000000')), 
                      fontFamily: "'Gochi', cursive, sans-serif",
                      lineHeight: 1
                    }}
                  >
                    {perfNps.scoreDisplay}
                  </div>
                  <div 
                    className="text-xs text-slate-500 mt-1"
                    style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                  >
                    {perfNps.totalCount === 0 
                      ? "-" 
                      : (perfNps.npsInt !== null ? `${t("Indice NPS")} (${perfNps.scoreDisplay})` : '')}
                  </div>
                </div>

                {/* Breakdown Categories: Promoteurs, Passifs, Détracteurs */}
                <div className="space-y-2 pt-1 font-sans">
                  {/* Promoteurs */}
                  <div 
                    className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-black text-sm flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] inline-block shrink-0"></span>
                        <span>{t("Promoteurs (9-10)")}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {t("Clients très enthousiastes")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-black text-base">
                        {perfNps.pctPromoters}%
                      </div>
                      <div className="text-xs text-slate-500">
                        {perfNps.promotersCount} {perfNps.promotersCount > 1 ? t("avis") : t("avis")}
                      </div>
                    </div>
                  </div>

                  {/* Passifs */}
                  <div 
                    className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-black text-sm flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] inline-block shrink-0"></span>
                        <span>{t("Passifs (7-8)")}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {t("Clients neutres (exclus du calcul direct)")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-black text-base">
                        {perfNps.pctPassives}%
                      </div>
                      <div className="text-xs text-slate-500">
                        {perfNps.passivesCount} {perfNps.passivesCount > 1 ? t("avis") : t("avis")}
                      </div>
                    </div>
                  </div>

                  {/* Détracteurs */}
                  <div 
                    className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-black text-sm flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] inline-block shrink-0"></span>
                        <span>{t("Détracteurs (0-6)")}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {t("Clients insatisfaits ou à risque")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-black text-base">
                        {perfNps.pctDetractors}%
                      </div>
                      <div className="text-xs text-slate-500">
                        {perfNps.detractorsCount} {perfNps.detractorsCount > 1 ? t("avis") : t("avis")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Floating Bottom Fermer Button (hors de div scrollable) */}
            <div className="absolute bottom-5 left-5 right-5 z-20">
              <button
                type="button"
                id="btn-close-performance-pane"
                onClick={() => setIsPerformancePaneOpen(false)}
                style={{
                  width: '100%',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: '600',
                  padding: '13px 20px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  border: 'none',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
                className="hover:bg-neutral-800 transition-colors"
              >
                <span>{t("Fermer")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

