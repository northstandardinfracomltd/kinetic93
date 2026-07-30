import React, { useState } from 'react';
import { t } from '../utils/translate';
import HelpBubble from './HelpBubble';

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

export default function SatisfactionTab({
  customerReviews,
  onUpdateReviews,
}: SatisfactionTabProps) {
  // Search States
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);

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

  // Searching logic
  const filteredReviews = customerReviews.filter((rev) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (rev.clientName && rev.clientName.toLowerCase().includes(q)) ||
      (rev.comment && rev.comment.toLowerCase().includes(q)) ||
      (rev.label && rev.label.toLowerCase().includes(q))
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
            {/* Search Bar Input */}
            <div className="relative w-full sm:w-80 bg-white">
              <input
                type="text"
                id="search-satisfaction-input"
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

            {/* Export CSV Button */}
            <button
              type="button"
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
      />

      {/* Main Table Content */}
      <div className="bg-white overflow-hidden mt-6 rounded-none animate-fadeIn" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filteredReviews.length === 0 ? (
            <div className="p-16 text-center font-sans lg:py-24" id="no-reviews-view">
              <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
                {t("Aucun résultat.")}
              </p>
            </div>
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

