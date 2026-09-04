import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check, X } from 'lucide-react';
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

const extractMonthFromDate = (dateStr?: string): { key: string; label: string; year: number; month: number } | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const str = dateStr.trim();
  if (!str) return null;

  // 1. YYYY-MM-DD or YYYY/MM/DD
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

  // 2. DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const year = parseInt(dmyMatch[3], 10);
    const month = parseInt(dmyMatch[2], 10);
    if (month >= 1 && month <= 12 && year > 1900) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = `${FRENCH_MONTH_NAMES[month - 1]} ${year}`;
      return { key, label, year, month };
    }
  }

  // 3. Textual month check like "15 Sept 2026", "15 Septembre 2026", etc.
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

  // 4. Fallback new Date(str)
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
  const [isMonthMenuOpen, setIsMonthMenuOpen] = useState(false);
  const monthMenuRef = useRef<HTMLDivElement>(null);

  // Dynamically extract only months that actually exist in the reviews list
  const availableMonths = useMemo<MonthOption[]>(() => {
    const map = new Map<string, MonthOption>();
    for (const rev of customerReviews) {
      const parsed = extractMonthFromDate(rev.dateStr);
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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthMenuRef.current && !monthMenuRef.current.contains(event.target as Node)) {
        setIsMonthMenuOpen(false);
      }
    };
    if (isMonthMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMonthMenuOpen]);

  // Helper date formatter
  const formatToDisplayDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
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

  // CSV Export handler
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
      const date = formatToDisplayDate(rev.dateStr) || '';
      const client = rev.clientName || '';
      const qualite = rev.qualite ?? '';
      const ponctualite = rev.ponctualite ?? '';
      const politesse = rev.politesse ?? '';
      const clartePdf = rev.clartePdf ?? '';
      const explications = rev.explications ?? '';
      const sensibilisation = rev.sensibilisation ?? '';
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
    link.setAttribute('download', `evaluations_satisfaction_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Searching and month filtering logic
  const filteredReviews = customerReviews.filter((rev) => {
    // 1. Month filter
    if (selectedMonth !== 'all') {
      const parsed = extractMonthFromDate(rev.dateStr);
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
            {/* Month Filter Button with Dropdown */}
            <div className="relative" ref={monthMenuRef}>
              <button
                type="button"
                id="btn-filter-month-satisfaction"
                onClick={() => setIsMonthMenuOpen(!isMonthMenuOpen)}
                style={{
                  ...rowActionButtonStyle,
                  backgroundColor: selectedMonth !== 'all' ? '#fa53d5' : '#000000',
                  boxShadow: selectedMonth !== 'all'
                    ? 'inset 0 1px 1px #ffffff00, 0 1px 2px #fa53d533, 0 4px 4px #ffffff00, 0 7px 0 -12px #fa53d5, inset 0 6px 12px #ffffff36'
                    : rowActionButtonStyle.boxShadow,
                }}
                className="cursor-pointer font-sans whitespace-nowrap hover:opacity-85 transition-all flex items-center gap-2 select-none"
                title={t("Filtrer par mois")}
              >
                <Calendar className="w-4 h-4 text-white shrink-0" />
                <span>
                  {selectedMonth === 'all'
                    ? t("Mois")
                    : availableMonths.find((m) => m.key === selectedMonth)?.label || selectedMonth}
                </span>
                {selectedMonth !== 'all' ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMonth('all');
                      setIsMonthMenuOpen(false);
                    }}
                    className="ml-1 p-0.5 rounded-full hover:bg-white/25 transition-colors inline-flex items-center justify-center cursor-pointer"
                    title={t("Effacer le filtre")}
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </span>
                ) : (
                  <ChevronDown
                    className={`w-4 h-4 text-white shrink-0 transition-transform duration-150 ${
                      isMonthMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              {/* Dynamic Month Dropdown Menu */}
              {isMonthMenuOpen && (
                <div
                  id="dropdown-filter-month-satisfaction"
                  className="absolute top-full left-0 mt-2 z-50 bg-white border border-[#dadada] rounded-2xl shadow-xl overflow-hidden min-w-[240px] animate-fadeIn"
                  style={{
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                  }}
                >
                  <div className="py-2 max-h-80 overflow-y-auto">
                    {/* Option: Tous les mois */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth('all');
                        setIsMonthMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-[15px] flex items-center justify-between transition-colors cursor-pointer ${
                        selectedMonth === 'all'
                          ? 'bg-[#ffecf8] text-black font-semibold'
                          : 'text-black hover:bg-[#f8f8f8]'
                      }`}
                    >
                      <span>{t("Tous les mois")}</span>
                      {selectedMonth === 'all' && <Check className="w-4 h-4 text-[#fa53d5]" />}
                    </button>

                    <div className="h-px bg-[#eee] my-1" />

                    {availableMonths.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-neutral-500 italic text-center">
                        {t("Aucun mois disponible")}
                      </div>
                    ) : (
                      availableMonths.map((m) => {
                        const isSelected = selectedMonth === m.key;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => {
                              setSelectedMonth(m.key);
                              setIsMonthMenuOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-[15px] flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#ffecf8] text-black font-semibold'
                                : 'text-black hover:bg-[#f8f8f8]'
                            }`}
                          >
                            <span>{m.label}</span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                  isSelected
                                    ? 'bg-[#fa53d5] text-white'
                                    : 'bg-neutral-100 text-neutral-600'
                                }`}
                              >
                                {m.count}
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-[#fa53d5]" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

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
        style={{ marginBottom: '10px' }}
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
          margin: '0 auto 20px auto',
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
                  <th className="px-4 py-3.5 text-center w-28 whitespace-nowrap" style={thStyle}>{t("Note globale.")}</th>
                  <th className="px-4 py-3.5 w-28 whitespace-nowrap" style={thStyle}>{t("Date.")}</th>
                  <th className="px-4 py-3.5 w-40 whitespace-nowrap" style={thStyle}>{t("Rédacteur.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Qualité.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Ponctualité.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Politesse.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Clarté PDF.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Explications.")}</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap" style={thStyle}>{t("Sensibilisation.")}</th>
                  <th className="px-4 py-3.5" style={thStyle}>{t("Évaluation.")}</th>
                  <th className="px-4 py-3.5 text-right w-24 whitespace-nowrap" style={thStyle}>{t("Action.")}</th>
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
                        <div 
                          style={{ 
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
                            margin: '0 auto'
                          }}
                        >
                          {noteGlobale}
                        </div>
                      </td>

                      {/* Date of review */}
                      <td className="px-4 py-4 font-sans align-middle cursor-default whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          {formatToDisplayDate(rev.dateStr) || '-'}
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

