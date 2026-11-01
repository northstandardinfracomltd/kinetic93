import React, { useState } from 'react';
import { Member, CompanyInfo, getTenantSpreadsheetUrl, openTenantSpreadsheetUrl } from '../types';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { t } from '../utils/translate';
import { uploadMediaToFirebase } from '../firebase';
import { fetchGoogleDriveStatus, uploadFileToGoogleDrive } from '../utils/googleDrive';

interface Expense {
  id: string;
  techName: string;
  title: string;
  amountTtc: number;
  amountHt: number;
  amountTva: number;
  dateStr: string;
  photoUrl?: string;
}

interface TicketsCaisseTabProps {
  expenses: Expense[];
  onUpdateExpenses: (updated: Expense[]) => void;
  members: Member[];
  companyInfo?: CompanyInfo;
}

export default function TicketsCaisseTab({
  expenses,
  onUpdateExpenses,
  members,
  companyInfo,
}: TicketsCaisseTabProps) {
  const hasTicketsCaisseSpreadsheet = Boolean(getTenantSpreadsheetUrl('spreadsheetTicketsCaisse', companyInfo));
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Form fields
  const [techName, setTechName] = useState<string>(() => {
    return members && members.length > 0 ? members[0].name : '';
  });
  const [title, setTitle] = useState('');
  const [amountTtc, setAmountTtc] = useState<string>('');
  const [amountHt, setAmountHt] = useState<string>('');
  const [amountTva, setAmountTva] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');

  // Search States
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [clickedPill, setClickedPill] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshTickets = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      window.dispatchEvent(
        new CustomEvent('defib-manual-refresh-spreadsheet', {
          detail: { spreadsheetKey: 'spreadsheetTicketsCaisse', idSuffix: 'tickets-caisse' },
        })
      );
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const formatToDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  const startNewTicket = () => {
    setTitle('');
    setAmountTtc('');
    setAmountHt('');
    setAmountTva('');
    setDateStr(new Date().toISOString().split('T')[0]);
    setSelectedPhotoFile(null);
    setPhotoUrl('');
    if (members && members.length > 0) {
      setTechName(members[0].name);
    } else {
      setTechName('');
    }
    setIsFormOpen(true);
  };

  const handleTtcChange = (valStr: string) => {
    setAmountTtc(valStr);
    const ttc = parseFloat(valStr) || 0;
    // Auto calculate HT and TVA with 20% flat on TTC
    const calculatedTva = ttc * 0.20;
    const calculatedHt = ttc - calculatedTva;
    setAmountHt(calculatedHt.toFixed(2));
    setAmountTva(calculatedTva.toFixed(2));
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amountTtc) {
      alert('Veuillez remplir les informations obligatoires (Désignation et Montant TTC).');
      return;
    }

    const t = parseFloat(amountTtc) || 0;
    const h = parseFloat(amountHt) || (t * 0.80);
    const v = parseFloat(amountTva) || (t * 0.20);

    let finalPhotoUrl = photoUrl;
    if (selectedPhotoFile) {
      try {
        const driveStatus = await fetchGoogleDriveStatus();
        if (driveStatus.active) {
          finalPhotoUrl = await uploadFileToGoogleDrive(driveStatus.accessToken, selectedPhotoFile);
        } else {
          finalPhotoUrl = await uploadMediaToFirebase(
            selectedPhotoFile,
            'photos',
            selectedPhotoFile.name || `ticket_caisse_${Date.now()}.jpg`
          );
        }
      } catch (err) {
        console.warn('Fallback upload for receipt photo:', err);
        finalPhotoUrl = await uploadMediaToFirebase(
          selectedPhotoFile,
          'photos',
          selectedPhotoFile.name || `ticket_caisse_${Date.now()}.jpg`
        );
      }
    } else if (finalPhotoUrl && finalPhotoUrl.startsWith('data:')) {
      try {
        const driveStatus = await fetchGoogleDriveStatus();
        if (driveStatus.active) {
          const arr = finalPhotoUrl.split(',');
          const mimeMatch = arr[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const bstr = atob(arr[1] || '');
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) u8arr[n] = bstr.charCodeAt(n);
          const ext = mime.includes('png') ? 'png' : mime.includes('pdf') ? 'pdf' : 'jpg';
          const receiptFile = new File([u8arr], `ticket_caisse_${Date.now()}.${ext}`, { type: mime });
          finalPhotoUrl = await uploadFileToGoogleDrive(driveStatus.accessToken, receiptFile);
        } else {
          finalPhotoUrl = await uploadMediaToFirebase(
            finalPhotoUrl,
            'photos',
            `ticket_caisse_${Date.now()}.jpg`
          );
        }
      } catch (err) {
        console.warn('Fallback dataUrl upload for receipt photo:', err);
        finalPhotoUrl = await uploadMediaToFirebase(
          finalPhotoUrl,
          'photos',
          `ticket_caisse_${Date.now()}.jpg`
        );
      }
    }

    const finalDate = dateStr || new Date().toISOString().split('T')[0];
    const finalUser = techName.trim() || 'Thierry Martin';

    const newExpense: Expense = {
      id: 'exp-' + Date.now(),
      techName: finalUser,
      user: finalUser,
      title: title.trim(),
      merchant: title.trim(),
      amountTtc: t,
      amount: t,
      amountHt: h,
      amountHT: h,
      amountTva: v,
      tva: v,
      dateStr: finalDate,
      date: finalDate,
      photoUrl: finalPhotoUrl || undefined,
      receiptUrl: finalPhotoUrl || undefined,
    } as any;

    onUpdateExpenses([newExpense, ...expenses]);
    
    // reset form
    setTitle('');
    setAmountTtc('');
    setAmountHt('');
    setAmountTva('');
    setSelectedPhotoFile(null);
    setPhotoUrl('');
    setIsFormOpen(false);
  };

  const handleDeleteExpense = (id: string) => {
    const updated = expenses.filter(e => e.id !== id);
    onUpdateExpenses(updated);
  };

  // Harmonized styling constants
  const customButtonStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#fff',
    boxShadow: 'none',
    borderRadius: '0.75rem',
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

  const rowActionButtonStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#fff',
    boxShadow: 'none',
    borderRadius: '0.75rem',
    fontSize: '16px',
    padding: '11px 22px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
  };

  const rowActionButton18Style: React.CSSProperties = {
    ...rowActionButtonStyle,
    fontSize: '18px',
    padding: '9px 19px',
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

  // Searching logic
  const filteredExpenses = expenses.filter((exp) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      exp.id.toLowerCase().includes(q) ||
      exp.techName.toLowerCase().includes(q) ||
      exp.title.toLowerCase().includes(q) ||
      exp.dateStr.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn" id="tickets-tab-container-harmonized">
      <style>{`
        #tickets-tab-container-harmonized input#search-tickets-input {
          font-size: 18px !important;
        }
        #tickets-tab-container-harmonized input#search-tickets-input::placeholder {
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          font-weight: 100 !important;
          color: rgb(222, 222, 222) !important;
          opacity: 1 !important;
        }
        #tickets-tab-container-harmonized table,
        #tickets-tab-container-harmonized thead,
        #tickets-tab-container-harmonized tbody,
        #tickets-tab-container-harmonized tr,
        #tickets-tab-container-harmonized th,
        #tickets-tab-container-harmonized td {
          border: 0px solid transparent !important;
          border-top: 0px solid transparent !important;
          border-bottom: 0px solid transparent !important;
          border-left: 0px solid transparent !important;
          border-right: 0px solid transparent !important;
        }
        #tickets-tab-container-harmonized thead th {
          background-color: #ffffff !important;
          color: rgb(80 97 122) !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          letter-spacing: normal !important;
          text-transform: none !important;
        }
        #tickets-tab-container-harmonized tbody tr:hover {
          background-color: #f5f7fa !important;
        }
        #tickets-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-tickets-input),
        #tickets-tab-container-harmonized select:not(#tickets-caisse-more-options-dropdown),
        #tickets-tab-container-harmonized textarea {
          padding: 12px !important;
          border: 1px solid #DCE1EA !important;
          border-radius: 13px !important;
          font-size: 18px !important;
          font-weight: 100 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
        }
        #tickets-tab-container-harmonized input:not(#search-tickets-input)::placeholder,
        #tickets-tab-container-harmonized textarea::placeholder {
          color: #BECADB !important;
          font-size: 18px !important;
          opacity: 1 !important;
        }
        #tickets-tab-container-harmonized select:not(#tickets-caisse-more-options-dropdown) {
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
        #tickets-tab-container-harmonized select.is-placeholder-select {
          color: #BECADB !important;
        }
        #tickets-tab-container-harmonized select option {
          color: #000000 !important;
          background: #ffffff !important;
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #tickets-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-tickets-input),
        #tickets-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-tickets-input),
        #tickets-tab-container-harmonized select:not(#tickets-caisse-more-options-dropdown):hover:not(:disabled),
        #tickets-tab-container-harmonized select:not(#tickets-caisse-more-options-dropdown):focus:not(:disabled),
        #tickets-tab-container-harmonized textarea:hover:not(:disabled),
        #tickets-tab-container-harmonized textarea:focus:not(:disabled),
        #tickets-tab-container-harmonized #search-tickets-input:hover,
        #tickets-tab-container-harmonized #search-tickets-input:focus {
          outline: 2.5px solid #2e54ff !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #tickets-tab-container-harmonized label,
        #tickets-tab-container-harmonized .tickets-label-style {
          letter-spacing: normal !important;
          text-transform: none !important;
          font-size: 16px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #tickets-tab-container-harmonized input:disabled {
          background-color: #f1f5f9 !important;
          color: #555555 !important;
          border-color: #DCE1EA !important;
          font-size: 18px !important;
          cursor: not-allowed !important;
          opacity: 0.82 !important;
        }
      `}</style>

      {!isFormOpen ? (
        <>
          {/* Dashboard List Header with search bar and button */}
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
                    id="tickets-caisse-more-options-dropdown"
                    aria-label={t("Plus d'options")}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'spreadsheet') {
                        const url = getTenantSpreadsheetUrl('spreadsheetTicketsCaisse', companyInfo);
                        if (url) openTenantSpreadsheetUrl(url);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ WebkitAppearance: 'menulist-button', appearance: 'auto', border: 'none', outline: 'none' }}
                  >
                    <option value="" disabled hidden></option>
                    <option value="spreadsheet" disabled={!hasTicketsCaisseSpreadsheet}>
                      {t("Ouvrir l’éditeur Spreadsheets")}
                    </option>
                  </select>
                </div>

                {/* Actualiser les données Pill Button */}
                <button
                  type="button"
                  id="btn-refresh-data-tickets-caisse"
                  onClick={() => {
                    setClickedPill('refresh-tickets-caisse');
                    setTimeout(() => setClickedPill((prev) => (prev === 'refresh-tickets-caisse' ? null : prev)), 320);
                    handleRefreshTickets();
                  }}
                  disabled={isRefreshing}
                  className={clickedPill === 'refresh-tickets-caisse' ? 'sidebar-nav-click-shrink-wave' : ''}
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

                {/* Search Bar Input */}
                <div className="relative w-full sm:w-80 bg-white">
                  <input
                    type="text"
                    id="search-tickets-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Recherche rapide"
                    className="w-full text-black outline-none"
                    style={searchInputStyle}
                    onMouseEnter={() => setIsSearchHovered(true)}
                    onMouseLeave={() => setIsSearchHovered(false)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                  />
                </div>

                <button
                  type="button"
                  disabled={!hasTicketsCaisseSpreadsheet}
                  onClick={() => {
                    if (!hasTicketsCaisseSpreadsheet) return;
                    startNewTicket();
                  }}
                  style={{
                    ...customButtonStyle,
                    backgroundColor: 'rgb(46, 84, 255)',
                    opacity: !hasTicketsCaisseSpreadsheet ? 0.45 : 1,
                    cursor: !hasTicketsCaisseSpreadsheet ? 'not-allowed' : 'pointer',
                  }}
                  className="font-sans"
                  title={!hasTicketsCaisseSpreadsheet ? "Veuillez renseigner l'URL du Spreadsheet Tickets de Caisse dans les paramètres du tenant." : undefined}
                >
                  Nouveau
                </button>
              </div>
            </div>
          </div>

          {/* Main Table Records Sheet */}
          <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
            <div className="overflow-x-auto">
              {filteredExpenses.length === 0 ? (
                <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
              ) : (
                <table className="w-full text-left font-sans border-collapse text-xs" id="tickets-table" style={{ border: '0px solid transparent' }}>
                  <thead>
                    <tr className="bg-white">
                      <th className="px-4 py-3.5" style={thStyle}>{t("Employé.")}</th>
                      <th className="px-4 py-3.5" style={thStyle}>{t("Objet.")}</th>
                      <th className="px-4 py-3.5" style={thStyle}>{t("Date.")}</th>
                      <th className="px-4 py-3.5 text-right font-mono" style={thStyle}>{t("Total HT.")}</th>
                      <th className="px-4 py-3.5 text-right font-mono" style={thStyle}>{t("Total TVA.")}</th>
                      <th className="px-4 py-3.5 text-right font-mono" style={thStyle}>{t("Total TTC.")}</th>
                      <th className="px-4 py-3.5 text-right w-24" style={thStyle}>{t("Actions.")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 text-xs">
                    {filteredExpenses.map((exp) => {
                      const driveFileUrl = (
                        (exp as any).receiptUrl ||
                        exp.photoUrl ||
                        (exp as any).fileUrl ||
                        (exp as any).url ||
                        ''
                      ).trim();
                      return (
                        <tr key={exp.id} className="group hover:bg-[#f5f7fa] transition-all cursor-pointer">
                          
                          {/* Employé */}
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            <span className="font-bold text-black block" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{exp.techName || (exp as any).user}</span>
                          </td>

                          {/* Objet */}
                          <td className="px-4 py-5 font-sans whitespace-nowrap truncate max-w-[250px]" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            <div className="font-bold text-black truncate" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }} title={exp.title || (exp as any).merchant}>
                              {exp.title || (exp as any).merchant}
                            </div>
                          </td>

                          {/* Date */}
                          <td className="px-4 py-5 font-mono whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{formatToDisplayDate(exp.dateStr || (exp as any).date)}</div>
                          </td>

                          {/* Total HT */}
                          <td className="px-4 py-5 font-mono text-right whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{Number(exp.amountHt ?? (exp as any).amountHT ?? 0).toFixed(2)}€</div>
                          </td>

                          {/* Total TVA */}
                          <td className="px-4 py-5 font-mono text-right whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{Number(exp.amountTva ?? (exp as any).tva ?? 0).toFixed(2)}€</div>
                          </td>

                          {/* Total TTC */}
                          <td className="px-4 py-5 font-mono text-right whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{Number(exp.amountTtc ?? (exp as any).amount ?? 0).toFixed(2)}€</div>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-5 text-right whitespace-nowrap bg-transparent" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex gap-2 bg-transparent">
                              <button
                                type="button"
                                disabled={!driveFileUrl}
                                onClick={() => {
                                  if (!driveFileUrl) return;
                                  openTenantSpreadsheetUrl(driveFileUrl);
                                }}
                                style={{
                                  ...rowActionButton18Style,
                                  backgroundColor: 'rgb(46, 84, 255)',
                                  opacity: driveFileUrl ? 1 : 0.45,
                                  cursor: driveFileUrl ? 'pointer' : 'not-allowed',
                                }}
                                className="font-sans text-white"
                              >
                                Consulter
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(exp.id)}
                                style={{
                                  ...rowActionButton18Style,
                                  backgroundColor: 'rgb(210, 45, 11)',
                                }}
                                className="cursor-pointer font-sans text-white"
                              >
                                Supprimer
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Overlay Mode for adding documents, styled exactly like DefibTab Form Overlay */
        <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="tickets-form-overlay">
          
          {/* Header Box styled exactly like DefibTab Form Header */}
          <div 
            className="flex items-center bg-white"
            style={{ borderRadius: '0px', width: '98%', maxWidth: '98%', margin: 'auto', padding: '10px 0px', border: 'none', backgroundColor: 'rgb(255, 255, 255)' }}
            id="tickets-form-header-box"
          >
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                }}
                id="btn-close-tickets-modal"
                style={{
                  ...rowActionButton18Style,
                  flex: 1,
                  width: '50%',
                  backgroundColor: 'rgb(210, 45, 11)',
                  color: '#ffffff',
                  boxShadow: 'none',
                }}
                className="flex-1 transition-colors cursor-pointer"
              >
                <span>Annuler</span>
              </button>

              <button
                type="submit"
                form="tickets-caisse-form"
                id="btn-submit-tickets-form"
                style={{
                  ...rowActionButton18Style,
                  flex: 1,
                  width: '50%',
                  backgroundColor: 'rgb(46, 84, 255)',
                  color: '#ffffff',
                  boxShadow: 'none',
                }}
                className="flex-1 transition-all cursor-pointer"
              >
                <span>Enregistrer</span>
              </button>
            </div>
          </div>

          {/* Elegant height spacing block to separate header box and form perfectly */}
          <div style={{ height: '16px' }} className="bg-transparent" />

          <form 
            id="tickets-caisse-form"
            onSubmit={handleSaveExpense} 
            className="space-y-6 p-5 mx-auto border-none"
            style={{
              backgroundColor: 'rgb(245, 247, 250)',
              border: 'none',
              borderRadius: '18px',
              width: '98%',
              maxWidth: '98%',
              margin: 'auto'
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-transparent">
              
              {/* Technicien Lookup */}
              <div className="flex flex-col gap-1 bg-transparent">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">{t("Employé.")}</label>
                <select
                  value={techName}
                  onChange={(e) => setTechName(e.target.value)}
                  className={`font-sans focus:outline-none w-full cursor-pointer ${!techName ? 'is-placeholder-select' : ''}`}
                  style={{ fontSize: '18px', borderColor: '#DCE1EA' }}
                  required
                >
                  <option value="" disabled hidden>{t("Sélectionner un employé.")}</option>
                  {members && members.map((m) => (
                    <option key={m.email || m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title / Raison */}
              <div className="flex flex-col gap-1 bg-transparent">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">{t("Entreprise ou objet.")}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={15}
                  placeholder={t("Entrez un commentaire.")}
                  className="font-sans focus:outline-none w-full"
                  style={{ fontSize: '18px', borderColor: '#DCE1EA' }}
                  required
                />
              </div>

              {/* Date d'achat */}
              <div className="flex flex-col gap-1 bg-transparent">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">{t("Date.")}</label>
                <input
                  type="text"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  placeholder="Ex: 2026-06-09"
                  className="font-sans focus:outline-none w-full"
                  style={{ fontSize: '18px', borderColor: '#DCE1EA' }}
                  required
                />
              </div>

              {/* Montant TTC */}
              <div className="flex flex-col gap-1 bg-transparent">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">{t("Total TTC (€).")}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountTtc}
                  onChange={(e) => handleTtcChange(e.target.value)}
                  placeholder="0.00"
                  className="font-sans focus:outline-none w-full"
                  style={{ fontSize: '18px', borderColor: '#DCE1EA' }}
                  required
                />
              </div>

              {/* Montant HT calculated */}
              <div className="flex flex-col gap-1 bg-transparent">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">Total HT (€).</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountHt}
                  onChange={(e) => setAmountHt(e.target.value)}
                  className="font-sans focus:outline-none w-full"
                  style={{ fontSize: '18px', borderColor: '#DCE1EA' }}
                  placeholder="0.00"
                />
              </div>

              {/* Montant TVA calculated */}
              <div className="flex flex-col gap-1 bg-transparent">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">Total TVA (€).</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountTva}
                  onChange={(e) => setAmountTva(e.target.value)}
                  className="font-sans focus:outline-none w-full"
                  style={{ fontSize: '18px', borderColor: '#DCE1EA' }}
                  placeholder="0.00"
                />
              </div>

              {/* Document upload zone */}
              <div className="flex flex-col gap-1 md:col-span-2 bg-transparent">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">
                  Photographie ou fichier du justificatif.
                </label>
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
                    if (file.size > MAX_SIZE_BYTES) {
                      alert(`Le fichier dépasse la limite standard de 10 Mo.`);
                      return;
                    }
                    setSelectedPhotoFile(file);
                    setPhotoUrl(file.name);
                  }}
                  onClick={() => document.getElementById('ticket-photo-upload-input')?.click()}
                  className="p-8 text-center space-y-4 transition-all cursor-pointer"
                  style={{ borderRadius: '13px', border: '1px solid #DCE1EA', backgroundColor: 'rgb(245, 247, 250)' }}
                >
                  <input
                    type="file"
                    id="ticket-photo-upload-input"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
                      if (file.size > MAX_SIZE_BYTES) {
                        alert(`Le fichier dépasse la limite de 10 Mo.`);
                        return;
                      }
                      setSelectedPhotoFile(file);
                      setPhotoUrl(file.name);
                    }}
                  />
                  
                  <div className="font-sans" style={{ fontSize: '18px', color: '#000000' }}>
                    {selectedPhotoFile ? (
                      <span className="font-bold inline-block" style={{ fontSize: '18px', padding: '9px 16px', backgroundColor: 'rgb(46, 84, 255)', border: 'none', color: '#ffffff', borderRadius: '9999px' }}>
                        Votre fichier téléchargé : {selectedPhotoFile.name} ({(selectedPhotoFile.size / (1024 * 1024)).toFixed(2)} Mo)
                      </span>
                    ) : (
                      <span style={{ color: '#000000', fontSize: '18px' }}>
                        Cliquez dans cette zone ou glissez directement votre fichier.
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </form>
        </div>
      )}

    </div>
  );
}
