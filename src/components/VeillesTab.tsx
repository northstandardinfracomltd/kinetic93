import React, { useState } from 'react';
import { VeilleRecord, getTenantSpreadsheetUrl, openTenantSpreadsheetUrl } from '../types';
import { t } from '../utils/translate';
import HelpBubble from './HelpBubble';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';

interface VeillesTabProps {
  veilles: VeilleRecord[];
  onDeleteVeille: (id: string) => void;
}

export default function VeillesTab({ veilles, onDeleteVeille }: VeillesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [clickedPill, setClickedPill] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshVeilles = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      window.dispatchEvent(
        new CustomEvent('defib-manual-refresh-spreadsheet', {
          detail: { spreadsheetKey: 'spreadsheetReleveConcurrentiel', idSuffix: 'releve-concurrentiel' },
        })
      );
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
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
    outline: (isSearchHovered || isSearchFocused) ? '2.5px solid #2e54ff' : 'none',
    outlineOffset: (isSearchHovered || isSearchFocused) ? '2px' : '0px',
    transition: 'all 0s',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: 'rgb(80 97 122)',
    backgroundColor: '#ffffff',
    fontSize: '16px',
    cursor: 'default',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    fontSize: '18px',
    color: '#000000',
    fontWeight: 100,
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
  };

  const actionButton18Style: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#fff',
    boxShadow: 'none',
    borderRadius: '0.75rem',
    fontSize: '18px',
    padding: '11px 22px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    cursor: 'pointer',
    border: 'none',
  };

  const filteredVeilles = veilles.filter((v) => {
    const term = searchTerm.toLowerCase();
    return (
      v.commune.toLowerCase().includes(term) ||
      v.mainteneurActuel.toLowerCase().includes(term) ||
      v.contactNomPrenom.toLowerCase().includes(term) ||
      v.contactEmail.toLowerCase().includes(term) ||
      v.contactTelephone.toLowerCase().includes(term)
    );
  });

  const resolvedSpreadsheetUrl = getTenantSpreadsheetUrl('spreadsheetReleveConcurrentiel');

  return (
    <div className="space-y-6 animate-fadeIn" id="veilles-tab-container">
      <style>{`
        #veilles-tab-container #search-veilles-input::placeholder {
          color: rgb(222, 222, 222) !important;
          opacity: 1 !important;
          font-weight: 100 !important;
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #veilles-tab-container table,
        #veilles-tab-container thead,
        #veilles-tab-container tbody,
        #veilles-tab-container tr,
        #veilles-tab-container th,
        #veilles-tab-container td {
          border: 0px solid transparent !important;
          border-top: 0px solid transparent !important;
          border-bottom: 0px solid transparent !important;
          border-left: 0px solid transparent !important;
          border-right: 0px solid transparent !important;
        }
        #veilles-tab-container thead th {
          background-color: #ffffff !important;
          color: rgb(80 97 122) !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          letter-spacing: normal !important;
          text-transform: none !important;
        }
        #veilles-tab-container tbody tr:hover {
          background-color: #f5f7fa !important;
        }
      `}</style>
      {/* Header Panel */}
      <div 
        className="bg-white space-y-4"
        style={{ borderRadius: '0px', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
          <div />

          <div className="flex flex-wrap items-center gap-2.5 bg-white">
            {/* 3 Dots More Options Dropdown */}
            <div
              className="relative inline-flex items-center justify-center shrink-0 hover:opacity-80 transition-all select-none cursor-pointer"
              style={{
                background: '#f5f7fa',
                borderRadius: '100px',
                padding: '12px',
                cursor: 'pointer',
              }}
              title={t("Plus d'options")}
            >
              <img
                src="https://civilprom.s3.eu-north-1.amazonaws.com/3dotsgris.svg"
                alt="Options"
                style={{ width: '18px', height: '18px', display: 'block', pointerEvents: 'none' }}
                referrerPolicy="no-referrer"
              />
              <select
                id="veilles-more-options-dropdown"
                aria-label={t("Plus d'options")}
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'spreadsheet') {
                    const url = getTenantSpreadsheetUrl('spreadsheetReleveConcurrentiel');
                    if (url) openTenantSpreadsheetUrl(url);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ WebkitAppearance: 'menulist-button', appearance: 'auto', border: 'none', outline: 'none' }}
              >
                <option value="" disabled hidden></option>
                <option value="spreadsheet" disabled={!resolvedSpreadsheetUrl}>
                  {t("Ouvrir l’éditeur Spreadsheets")}
                </option>
              </select>
            </div>

            {/* Actualiser les données Pill Button */}
            <button
              type="button"
              id="btn-refresh-data-releve-concurrentiel"
              onClick={() => {
                setClickedPill('refresh-releve-concurrentiel');
                setTimeout(() => setClickedPill((prev) => (prev === 'refresh-releve-concurrentiel' ? null : prev)), 320);
                handleRefreshVeilles();
              }}
              disabled={isRefreshing}
              className={clickedPill === 'refresh-releve-concurrentiel' ? 'sidebar-nav-click-shrink-wave' : ''}
              style={{
                borderRadius: '1000px',
                padding: '8px 16px',
                fontSize: '18px',
                fontWeight: 100,
                cursor: isRefreshing ? 'wait' : 'pointer',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                backgroundColor: 'rgb(192 248 252)',
                color: 'rgb(5 112 114)',
                border: 'none',
                boxShadow: 'none',
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
              }}
              title={t("Actualiser les données")}
            >
              <span>{isRefreshing ? t("Actualisation...") : t("Actualiser les données")}</span>
            </button>

            <div className="relative w-full sm:w-80 bg-white">
              <input
                type="text"
                id="search-veilles-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Recherche rapide"
                className="w-full text-black outline-none"
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

      {/* Table Records Panel */}
      <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filteredVeilles.length === 0 ? (
            <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="veilles-table" style={{ border: '0px solid transparent' }}>
              <thead>
                <tr className="bg-white">
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Commune.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Volume.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Mainteneur.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Prochaine.Maint.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Contact.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Email.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Téléphone.</th>
                  <th className="px-4 py-3.5 text-right w-24 whitespace-nowrap" style={thStyle}>Actions.</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs">
                {filteredVeilles.map((v) => (
                  <tr key={v.id} className="group hover:bg-[#f5f7fa] transition-all cursor-pointer">
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif"' }}>{v.commune}</div>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      {v.volume}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      {v.mainteneurActuel}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      {v.prochaineMaintenance ? new Date(v.prochaineMaintenance).toLocaleDateString('fr-FR') : '-'}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      {v.contactNomPrenom}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      <a href={`mailto:${v.contactEmail}`} className="text-blue-600 hover:underline">
                        {v.contactEmail}
                      </a>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap text-slate-500" style={tdStyle}>
                      {v.contactTelephone}
                    </td>
                    <td className="px-4 py-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onDeleteVeille(v.id)}
                        style={actionButton18Style}
                        className="cursor-pointer font-sans bg-[#0f172a] rounded"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
