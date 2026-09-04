import React, { useState, useMemo, useEffect } from 'react';
import { t } from '../utils/translate';
import HelpBubble from './HelpBubble';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';

interface Review {
  id: string;
  clientName: string;
  comment: string;
  label?: string;
  defibId?: string;
  qualite?: number;
  ponctualite?: number;
  politesse?: number;
  clartePdf?: number;
  explications?: number;
  sensibilisation?: number;
  dateStr?: string;
  date?: string;
  createdAt?: string | number;
}

interface SatisfactionTabProps {
  customerReviews: Review[];
  onUpdateReviews: (updated: Review[]) => void;
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
}: SatisfactionTabProps) {
  // Search States
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);

  // Month filter state
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

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
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: '#fe4eba',
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: '15px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    margin: '0 auto',
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
        (rev.defibId && rev.defibId.toLowerCase().includes(q))
      );
    });
  }, [customerReviews, selectedMonth, search]);

  // CSV Export handler - exports dynamically based on the current display and title
  const handleExportCSV = () => {
    const headers = [
      "Note globale",
      "Date",
      "Rédacteur",
      "Qualité",
      "Ponctualité",
      "Politesse",
      "Clarté PDF",
      "Explications",
      "Sensibilisation",
      "Évaluation"
    ];

    const rows = filteredReviews.map(rev => {
      const note = getNoteGlobale(rev);
      const date = formatToDisplayDate(getReviewDate(rev)) || '';
      const client = rev.clientName || '';
      const qualite = rev.qualite !== undefined && rev.qualite !== null ? rev.qualite : '';
      const ponctualite = rev.ponctualite !== undefined && rev.ponctualite !== null ? rev.ponctualite : '';
      const politesse = rev.politesse !== undefined && rev.politesse !== null ? rev.politesse : '';
      const clartePdf = rev.clartePdf !== undefined && rev.clartePdf !== null ? rev.clartePdf : '';
      const explications = rev.explications !== undefined && rev.explications !== null ? rev.explications : '';
      const sensibilisation = rev.sensibilisation !== undefined && rev.sensibilisation !== null ? rev.sensibilisation : '';
      const evaluation = (rev.comment || '').replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');

      return [
        `"${note}"`,
        `"${date}"`,
        `"${client.replace(/"/g, '""')}"`,
        `"${qualite}"`,
        `"${ponctualite}"`,
        `"${politesse}"`,
        `"${clartePdf}"`,
        `"${explications}"`,
        `"${sensibilisation}"`,
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

    return {
      qualite: calcAvg('qualite'),
      ponctualite: calcAvg('ponctualite'),
      politesse: calcAvg('politesse'),
      clartePdf: calcAvg('clartePdf'),
      explications: calcAvg('explications'),
      sensibilisation: calcAvg('sensibilisation'),
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
            {/* Native System Dropdown for Month Filter */}
            <select
              id="filter-month-satisfaction"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                ...rowActionButtonStyle,
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                backgroundColor: '#000000',
                boxShadow: rowActionButtonStyle.boxShadow,
                textAlign: 'center',
                textAlignLast: 'center',
              }}
              className="cursor-pointer font-sans whitespace-nowrap hover:opacity-85 transition-all outline-none"
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
          {filteredReviews.length === 0 ? (
            <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="satisfaction-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead>
                <tr className="bg-transparent">
                  <th className="px-4 pt-3 pb-1.5 text-center w-28 whitespace-nowrap" style={thStyle}>{t("Note globale.")}</th>
                  <th className="px-4 pt-3 pb-1.5 w-28 whitespace-nowrap" style={thStyle}>{t("Date.")}</th>
                  <th className="px-4 pt-3 pb-1.5 w-40 whitespace-nowrap" style={thStyle}>{t("Rédacteur.")}</th>
                  <th className="px-3 pt-3 pb-1.5 text-center whitespace-nowrap" style={thStyle}>{t("Qualité.")}</th>
                  <th className="px-3 pt-3 pb-1.5 text-center whitespace-nowrap" style={thStyle}>{t("Ponctualité.")}</th>
                  <th className="px-3 pt-3 pb-1.5 text-center whitespace-nowrap" style={thStyle}>{t("Politesse.")}</th>
                  <th className="px-3 pt-3 pb-1.5 text-center whitespace-nowrap" style={thStyle}>{t("Clarté PDF.")}</th>
                  <th className="px-3 pt-3 pb-1.5 text-center whitespace-nowrap" style={thStyle}>{t("Explications.")}</th>
                  <th className="px-3 pt-3 pb-1.5 text-center whitespace-nowrap" style={thStyle}>{t("Sensibilisation.")}</th>
                  <th className="px-4 pt-3 pb-1.5" style={thStyle}>{t("Évaluation.")}</th>
                  <th className="px-4 pt-3 pb-1.5 text-right w-24 whitespace-nowrap" style={thStyle}>{t("Action.")}</th>
                </tr>
                {/* Second header row: column averages */}
                <tr className="bg-transparent" style={{ borderBottom: '1px solid rgb(218, 218, 218)' }}>
                  <th className="px-4 pt-1.5 pb-3 text-center"></th>
                  <th className="px-4 pt-1.5 pb-3"></th>
                  <th className="px-4 pt-1.5 pb-3"></th>
                  <th className="px-3 pt-1.5 pb-3 text-center align-middle">
                    <div style={roundBadgeStyle} title={t("Moyenne Qualité")}>
                      {columnAverages.qualite}
                    </div>
                  </th>
                  <th className="px-3 pt-1.5 pb-3 text-center align-middle">
                    <div style={roundBadgeStyle} title={t("Moyenne Ponctualité")}>
                      {columnAverages.ponctualite}
                    </div>
                  </th>
                  <th className="px-3 pt-1.5 pb-3 text-center align-middle">
                    <div style={roundBadgeStyle} title={t("Moyenne Politesse")}>
                      {columnAverages.politesse}
                    </div>
                  </th>
                  <th className="px-3 pt-1.5 pb-3 text-center align-middle">
                    <div style={roundBadgeStyle} title={t("Moyenne Clarté PDF")}>
                      {columnAverages.clartePdf}
                    </div>
                  </th>
                  <th className="px-3 pt-1.5 pb-3 text-center align-middle">
                    <div style={roundBadgeStyle} title={t("Moyenne Explications")}>
                      {columnAverages.explications}
                    </div>
                  </th>
                  <th className="px-3 pt-1.5 pb-3 text-center align-middle">
                    <div style={roundBadgeStyle} title={t("Moyenne Sensibilisation")}>
                      {columnAverages.sensibilisation}
                    </div>
                  </th>
                  <th className="px-4 pt-1.5 pb-3"></th>
                  <th className="px-4 pt-1.5 pb-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs text-black">
                {filteredReviews.map((rev) => {
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
                      
                      {/* Round badge for Note globale */}
                      <td className="px-4 py-4 align-middle text-center cursor-default">
                        <div style={roundBadgeStyle}>
                          {noteGlobale}
                        </div>
                      </td>

                      {/* Date of review */}
                      <td className="px-4 py-4 font-sans align-middle cursor-default whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          {formatToDisplayDate(getReviewDate(rev)) || '-'}
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

                      {/* Comment (Évaluation) */}
                      <td className="px-4 py-4 font-sans align-middle cursor-default whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="text-black" style={{ color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          {truncatedComment}
                        </div>
                      </td>

                      {/* Actions (Action) */}
                      <td className="px-4 py-4 text-right align-middle whitespace-nowrap bg-transparent" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleDeleteReview(rev.id)}
                          style={rowActionButtonStyle}
                          className="cursor-pointer font-sans bg-transparent hover:opacity-80 transition-all"
                        >
                          <span>{t("Supprimer")}</span>
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}

