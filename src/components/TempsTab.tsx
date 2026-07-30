import React, { useState } from 'react';
import { PointageLog } from '../types';
import { Clock } from 'lucide-react';
import { t } from '../utils/translate';

interface TempsTabProps {
  pointages: PointageLog[];
  onUpdatePointages: (updated: PointageLog[]) => void;
}

export default function TempsTab({
  pointages,
  onUpdatePointages,
}: TempsTabProps) {
  // Search States
  const [search, setSearch] = useState('');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('Tous');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Inline editing states encapsulated cleanly
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
  } | null>(null);

  const parseToYYYYMMDD = (dateStr: string): string => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    return dateStr;
  };

  const formatToDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  const handleEditPointageValue = (
    id: string,
    startDate: string,
    startTime: string,
    endDate: string,
    endTime: string
  ) => {
    const updated = pointages.map(p => {
      if (p.id === id) {
        let durationSeconds = p.durationSeconds;
        let finalEndDate = endDate || p.endDate || startDate;
        try {
          if (startDate && startTime && finalEndDate && endTime) {
            const startStr = `${startDate}T${startTime}:00`;
            const endStr = `${finalEndDate}T${endTime}:00`;
            const startMs = Date.parse(startStr);
            const endMs = Date.parse(endStr);
            if (!isNaN(startMs) && !isNaN(endMs)) {
              durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
            }
          }
        } catch (err) {}
        return {
          ...p,
          startDate: formatToDisplayDate(startDate),
          startTime,
          endDate: formatToDisplayDate(finalEndDate),
          endTime,
          durationSeconds,
          isOngoing: false
        };
      }
      return p;
    });
    onUpdatePointages(updated);
  };

  const handleDeletePointage = (id: string) => {
    const updated = pointages.filter(p => p.id !== id);
    onUpdatePointages(updated);
    if (editingId === id) {
      setEditingId(null);
      setEditForm(null);
    }
  };

  const handleExportTemps = (techName: string) => {
    if (!techName || techName === 'Tous') return;

    const itemsToExport = pointages.filter(p => p.techName === techName);

    const headers = [
      'Technicien.',
      'Début.',
      'Fin.',
      'Durée totale.'
    ];

    let csvContent = '\ufeff'; // BOM for UTF-8 compatibility
    csvContent += headers.map(h => `"${h}"`).join(';') + '\n';

    itemsToExport.forEach(p => {
      const debutDate = formatToDisplayDate(p.startDate);
      const debutTime = p.startTime || '';
      const debutFormatted = `${debutDate} ${debutTime}`.trim();

      const finDate = p.isOngoing ? "En cours" : formatToDisplayDate(p.endDate || p.startDate);
      const finTime = p.isOngoing ? "" : (p.endTime || '');
      const finFormatted = p.isOngoing ? "En cours" : `${finDate} ${finTime}`.trim();

      const dureeTotale = p.isOngoing
        ? "Vacation active"
        : `${Math.round((p.durationSeconds || 0) / 60)} min (${((p.durationSeconds || 0) / 3600).toFixed(2)} h)`;

      const row = [
        p.techName || '',
        debutFormatted,
        finFormatted,
        dureeTotale
      ];

      csvContent += row.map(val => `"${String(val !== undefined && val !== null ? val : '').replace(/"/g, '""')}"`).join(';') + '\n';
    });

    const formattedDate = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    const fileName = `Export Temps ${techName} au ${formattedDate}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Harmonized styling constants
  const actionButtonStyle: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '0.75rem',
    fontSize: '16px',
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

  const actionButton18Style: React.CSSProperties = {
    ...actionButtonStyle,
    fontSize: '18px',
    padding: '9px 19px',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
  };

  const inputStyle: React.CSSProperties = {
    border: '1px solid #dedede',
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '13px',
    fontWeight: '100',
    backgroundColor: '#ffffff',
    color: '#000000',
    outline: 'none',
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

  // List of unique technicians in pointages
  const technicians = Array.from(new Set(pointages.map(p => p.techName))).filter(Boolean).sort();

  // Searching logic
  const filteredPointages = pointages.filter((p) => {
    if (selectedTechFilter !== 'Tous' && p.techName !== selectedTechFilter) {
      return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.techName.toLowerCase().includes(q) ||
      p.startDate.toLowerCase().includes(q) ||
      (p.endDate && p.endDate.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn" id="temps-tab-container-harmonized">
      <style>{`
        #temps-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-temps-input),
        #temps-tab-container-harmonized select,
        #temps-tab-container-harmonized textarea {
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
        #temps-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-temps-input),
        #temps-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-temps-input) {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #temps-tab-container-harmonized input#search-temps-input {
          font-size: 18px !important;
        }
        #temps-tab-container-harmonized input#search-temps-input::placeholder {
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          font-weight: 100 !important;
        }
        /* Hide native calendar and clock picker icons */
        #temps-tab-container-harmonized input[type="date"]::-webkit-calendar-picker-indicator,
        #temps-tab-container-harmonized input[type="time"]::-webkit-calendar-picker-indicator {
          display: none !important;
          -webkit-appearance: none !important;
        }
      `}</style>
      
      {/* Tab Header Dashboard with search input on the right */}
      <div 
        className="bg-white space-y-4"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default' }} id="temps-tab-title">{t("Temps")}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white">
            {selectedTechFilter !== 'Tous' && (
              <button
                type="button"
                onClick={() => handleExportTemps(selectedTechFilter)}
                style={{
                  ...actionButton18Style,
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
                className="cursor-pointer font-sans bg-black text-white rounded whitespace-nowrap"
              >
                {t("Télécharger CSV")}
              </button>
            )}

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
      <div className="px-4 flex flex-wrap gap-2.5 justify-center sm:justify-start pt-5" id="temps-tech-pills">
        {['Tous', ...technicians].map((filterOpt) => {
          let count = 0;
          if (filterOpt === 'Tous') {
            count = pointages.length;
          } else {
            count = pointages.filter((p) => p.techName === filterOpt).length;
          }

          return (
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
                transition: 'all 0.15s ease'
              }}
              className="transition-all"
            >
              {t(filterOpt)} ({count})
            </button>
          );
        })}
      </div>

      {/* Pointage Records */}
      <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        {filteredPointages.length === 0 ? (
          <div className="p-16 text-center font-sans lg:py-24 max-w-2xl mx-auto" id="no-pointage-view">
            <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
              {t("Aucun résultat.")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans border-collapse text-xs" id="temps-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead>
                <tr className="bg-transparent">
                  <th className="px-4 py-3.5" style={thStyle}>{t("Technicien.")}</th>
                  <th className="px-4 py-3.5" style={thStyle}>{t("Début.")}</th>
                  <th className="px-4 py-3.5" style={thStyle}>{t("Fin.")}</th>
                  <th className="px-4 py-3.5" style={thStyle}>{t("Durée totale.")}</th>
                  <th className="px-4 py-3.5 text-right w-24" style={thStyle}>{t("Actions.")}</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs">
                {filteredPointages.map((p) => {
                  const isEditing = editingId === p.id;
                  const formattedDur = p.isOngoing 
                    ? t("Vacation active") 
                    : `${Math.round((p.durationSeconds || 0) / 60)} min (${((p.durationSeconds || 0) / 3600).toFixed(2)} h)`;

                  return (
                    <tr key={p.id} className="group hover:bg-[#ffecf8] transition-all cursor-pointer">
                      
                      {/* Technicien */}
                      <td className="px-4 py-5 font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{p.techName}</div>
                      </td>

                      {/* Début vacation */}
                      <td className="px-4 py-5 font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {isEditing && editForm ? (
                          <div className="flex flex-col gap-1.5 max-w-[170px] bg-transparent">
                            <input
                              type="date"
                              value={editForm.startDate}
                              onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                              style={inputStyle}
                              className="w-full font-mono font-bold"
                            />
                            <input
                              type="time"
                              value={editForm.startTime}
                              onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                              style={inputStyle}
                              className="w-full font-mono font-bold"
                            />
                          </div>
                        ) : (
                          <div style={{ color: '#000000', whiteSpace: 'nowrap' }}>
                            <span className="font-bold font-mono text-[16px]" style={{ color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{formatToDisplayDate(p.startDate)}</span>
                            <span className="font-mono text-[16px]" style={{ color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', marginLeft: '6px' }}>{p.startTime}</span>
                          </div>
                        )}
                      </td>

                      {/* Fin vacation */}
                      <td className="px-4 py-5 font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {isEditing && editForm ? (
                          <div className="flex flex-col gap-1.5 max-w-[170px] bg-transparent">
                            <input
                              type="date"
                              value={editForm.endDate}
                              onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                              style={inputStyle}
                              className="w-full font-mono font-bold"
                            />
                            <input
                              type="time"
                              value={editForm.endTime}
                              onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                              style={inputStyle}
                              className="w-full font-mono font-bold"
                            />
                          </div>
                        ) : p.isOngoing ? (
                          <span 
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '1000px',
                              backgroundColor: '#ffffff',
                              border: '1px solid rgb(231, 231, 231)',
                              color: '#000000',
                              fontSize: '16px',
                              fontWeight: 100,
                              padding: '4px 12px',
                              whiteSpace: 'nowrap',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                            }}
                            className="animate-pulse"
                          >
                            {t("En cours")}
                          </span>
                        ) : (
                          <div style={{ color: '#000000', whiteSpace: 'nowrap' }}>
                            <span className="font-bold font-mono text-[16px]" style={{ color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{formatToDisplayDate(p.endDate || p.startDate)}</span>
                            <span className="font-mono text-[16px]" style={{ color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', marginLeft: '6px' }}>{p.endTime || ''}</span>
                          </div>
                        )}
                      </td>

                      {/* Durée totale */}
                      <td className="px-4 py-5 font-mono" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        {p.isOngoing ? (
                          <span className="text-slate-500 italic" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{t("En cours...")}</span>
                        ) : (
                          <span className="font-bold text-black" style={{ color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{formattedDur}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-5 text-right whitespace-nowrap bg-transparent" onClick={(e) => e.stopPropagation()}>
                        {isEditing && editForm ? (
                          <div className="inline-flex gap-2 bg-transparent">
                            <button
                              type="button"
                              onClick={() => {
                                handleEditPointageValue(
                                  p.id,
                                  editForm.startDate,
                                  editForm.startTime,
                                  editForm.endDate,
                                  editForm.endTime
                                );
                                setEditingId(null);
                                setEditForm(null);
                              }}
                              style={actionButton18Style}
                              className="cursor-pointer text-white font-sans bg-black rounded"
                            >
                              {t("Enregistrer")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditForm(null);
                              }}
                              style={actionButton18Style}
                              className="cursor-pointer text-white font-sans bg-black rounded"
                            >
                              {t("Annuler")}
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-2 bg-transparent">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(p.id);
                                setEditForm({
                                  startDate: parseToYYYYMMDD(p.startDate),
                                  startTime: p.startTime,
                                  endDate: parseToYYYYMMDD(p.endDate || p.startDate),
                                  endTime: p.endTime || p.startTime
                                });
                              }}
                              style={actionButton18Style}
                              className="cursor-pointer font-sans bg-black rounded"
                            >
                              {t("Modifier")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePointage(p.id)}
                              style={actionButton18Style}
                              className="cursor-pointer font-sans bg-black rounded"
                            >
                              {t("Supprimer")}
                            </button>
                          </div>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
