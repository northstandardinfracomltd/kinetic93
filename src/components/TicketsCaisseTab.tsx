import React, { useState } from 'react';
import { Member } from '../types';
import { t } from '../utils/translate';

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
}

export default function TicketsCaisseTab({
  expenses,
  onUpdateExpenses,
  members,
}: TicketsCaisseTabProps) {
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

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amountTtc) {
      alert('Veuillez remplir les informations obligatoires (Désignation et Montant TTC).');
      return;
    }

    const t = parseFloat(amountTtc) || 0;
    const h = parseFloat(amountHt) || (t * 0.80);
    const v = parseFloat(amountTva) || (t * 0.20);

    // Simulate standard template attachment url if they dragged a file
    let finalPhotoUrl = photoUrl;
    if (selectedPhotoFile && !finalPhotoUrl) {
      finalPhotoUrl = 'https://picsum.photos/800/600?random=' + Date.now();
    }

    const newExpense: Expense = {
      id: 'exp-' + Date.now(),
      techName: techName.trim() || 'Thierry Martin',
      title: title.trim(),
      amountTtc: t,
      amountHt: h,
      amountTva: v,
      dateStr: dateStr || new Date().toISOString().split('T')[0],
      photoUrl: finalPhotoUrl || undefined
    };

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
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
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
    color: '#000000',
    cursor: 'default',
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
        }
        #tickets-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-tickets-input),
        #tickets-tab-container-harmonized select,
        #tickets-tab-container-harmonized textarea {
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
        #tickets-tab-container-harmonized select {
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
        #tickets-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-tickets-input),
        #tickets-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-tickets-input),
        #tickets-tab-container-harmonized select:hover:not(:disabled),
        #tickets-tab-container-harmonized select:focus:not(:disabled),
        #tickets-tab-container-harmonized textarea:hover:not(:disabled),
        #tickets-tab-container-harmonized textarea:focus:not(:disabled),
        #tickets-tab-container-harmonized #search-tickets-input:hover,
        #tickets-tab-container-harmonized #search-tickets-input:focus {
          outline: 2.5px solid #fa53d5 !important;
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
          cursor: not-allowed !important;
          opacity: 0.82 !important;
        }
      `}</style>

      {!isFormOpen ? (
        <>
          {/* Dashboard List Header with search bar and button */}
          <div 
            className="bg-white space-y-4"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
              <div>
                <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default' }} id="tickets-tab-title">Tickets Caisse</h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white">
                {/* Search Bar Input */}
                <div className="relative w-full sm:w-80 bg-white">
                  <input
                    type="text"
                    id="search-tickets-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Recherche."
                    className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                    style={searchInputStyle}
                    onMouseEnter={() => setIsSearchHovered(true)}
                    onMouseLeave={() => setIsSearchHovered(false)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                  />
                </div>

                <button
                  onClick={startNewTicket}
                  style={customButtonStyle}
                  className="font-sans"
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
                <div className="p-16 text-center font-sans lg:py-24" id="no-tickets-view">
                  <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
                    {t("Aucun résultat.")}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left font-sans border-collapse text-xs" id="tickets-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
                  <thead>
                    <tr className="bg-transparent">
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
                    {filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="group hover:bg-[#ffecf8] transition-all cursor-pointer">
                        
                        {/* Employé */}
                        <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          <span className="font-bold text-black block" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{exp.techName}</span>
                        </td>

                        {/* Objet */}
                        <td className="px-4 py-5 font-sans whitespace-nowrap truncate max-w-[250px]" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          <div className="font-bold text-black truncate" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }} title={exp.title}>
                            {exp.title}
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-5 font-mono whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{formatToDisplayDate(exp.dateStr)}</div>
                        </td>

                        {/* Total HT */}
                        <td className="px-4 py-5 font-mono text-right whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{Number(exp.amountHt || 0).toFixed(2)}€</div>
                        </td>

                        {/* Total TVA */}
                        <td className="px-4 py-5 font-mono text-right whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{Number(exp.amountTva || 0).toFixed(2)}€</div>
                        </td>

                        {/* Total TTC */}
                        <td className="px-4 py-5 font-mono text-right whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                          <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{Number(exp.amountTtc || 0).toFixed(2)}€</div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-5 text-right whitespace-nowrap bg-transparent" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex gap-2 bg-transparent">
                            {exp.photoUrl ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = exp.photoUrl || '';
                                  link.target = '_blank';
                                  link.download = `Justificatif_${exp.id}_${exp.title.replace(/\s+/g, '_')}.png`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                                style={rowActionButton18Style}
                                className="cursor-pointer font-sans"
                              >
                                Justificatif
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(exp.id)}
                              style={rowActionButton18Style}
                              className="cursor-pointer font-sans text-white text-white"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
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
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', width: '98%', maxWidth: '98%', margin: 'auto', padding: '20px' }}
            id="tickets-form-header-box"
          >
            <div>
              <h3 className="text-2xl font-bold font-gochi" id="form-modal-title" style={{ color: '#000', cursor: 'default' }}>
                Nouveau Ticket de Caisse
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                }}
                id="btn-close-tickets-modal"
                style={rowActionButton18Style}
                className="transition-colors cursor-pointer"
              >
                <span>Annuler</span>
              </button>

              <button
                type="submit"
                form="tickets-caisse-form"
                id="btn-submit-tickets-form"
                style={{
                  ...rowActionButton18Style,
                  backgroundColor: 'rgb(53, 86, 236)',
                  color: '#ffffff',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                }}
                className="transition-all cursor-pointer"
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
            className="space-y-6 bg-white p-5 mx-auto"
            style={{
              border: '1px solid rgb(218, 218, 218)',
              borderRadius: '18px',
              width: '98%',
              maxWidth: '98%',
              margin: 'auto'
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white">
              
              {/* Technicien Lookup */}
              <div className="flex flex-col gap-1 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">{t("Employé.")}</label>
                <select
                  value={techName}
                  onChange={(e) => setTechName(e.target.value)}
                  className="font-sans focus:outline-none w-full cursor-pointer"
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
              <div className="flex flex-col gap-1 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">{t("Entreprise ou objet.")}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={15}
                  placeholder={t("Entrez un commentaire.")}
                  className="font-sans focus:outline-none w-full"
                  required
                />
              </div>

              {/* Date d'achat */}
              <div className="flex flex-col gap-1 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">{t("Date du paiement.")}</label>
                <input
                  type="text"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  placeholder="Ex: 2026-06-09"
                  className="font-sans focus:outline-none w-full"
                  required
                />
              </div>

              {/* Montant TTC */}
              <div className="flex flex-col gap-1 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">{t("Total TTC (€).")}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountTtc}
                  onChange={(e) => handleTtcChange(e.target.value)}
                  placeholder="0.00"
                  className="font-sans focus:outline-none w-full"
                  required
                />
              </div>

              {/* Montant HT calculated */}
              <div className="flex flex-col gap-1 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">Total HT (€).</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountHt}
                  onChange={(e) => setAmountHt(e.target.value)}
                  className="font-sans focus:outline-none w-full"
                  placeholder="0.00"
                />
              </div>

              {/* Montant TVA calculated */}
              <div className="flex flex-col gap-1 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider tickets-label-style">Total TVA (€).</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountTva}
                  onChange={(e) => setAmountTva(e.target.value)}
                  className="font-sans focus:outline-none w-full"
                  placeholder="0.00"
                />
              </div>

              {/* Document upload zone */}
              <div className="flex flex-col gap-1 md:col-span-2 bg-white">
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
                  className="p-8 text-center space-y-4 hover:bg-[#ffecf8]/20 transition-all cursor-pointer"
                  style={{ borderRadius: '13px', border: 'none', backgroundColor: '#fdecff' }}
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
                  
                  <div className="font-sans" style={{ fontSize: '16px', color: '#000000' }}>
                    {selectedPhotoFile ? (
                      <span className="font-bold inline-block" style={{ fontSize: '16px', padding: '9px 16px', backgroundColor: '#501655', border: 'none', color: '#ffffff', borderRadius: '9999px' }}>
                        Votre fichier téléchargé : {selectedPhotoFile.name} ({(selectedPhotoFile.size / (1024 * 1024)).toFixed(2)} Mo)
                      </span>
                    ) : (
                      <span style={{ color: '#000000', fontSize: '16px' }}>
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
