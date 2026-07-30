import React, { useState } from 'react';
import { GedDocument } from '../types';
import { t } from '../utils/translate';

interface GedTabProps {
  gedDocs: GedDocument[];
  saveGedDocs: (updated: GedDocument[]) => void;
  isGedFormOpen: boolean;
  setIsGedFormOpen: (open: boolean) => void;
  handleConsultGed: (doc: GedDocument) => void;
}

export default function GedTab({
  gedDocs,
  saveGedDocs,
  isGedFormOpen,
  setIsGedFormOpen,
  handleConsultGed,
}: GedTabProps) {
  const [gedTitle, setGedTitle] = useState('');
  const [gedCategory, setGedCategory] = useState('');
  const [gedFileName, setGedFileName] = useState('');
  const [selectedGedFile, setSelectedGedFile] = useState<File | null>(null);

  // Search & Filters State
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const startNewGed = () => {
    setGedTitle('');
    setGedCategory('');
    setGedFileName('');
    setSelectedGedFile(null);
    setIsGedFormOpen(true);
  };

  const handleSaveGed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gedTitle.trim()) {
      alert('Veuillez spécifier un titre pour le document.');
      return;
    }

    let finalSize = '0 Mo';
    let finalFileName = gedFileName.trim();
    if (!finalFileName) {
      finalFileName = gedTitle.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
    }

    const onComplete = (fileContent?: string) => {
      const newDoc: GedDocument = {
        id: 'ged-' + Date.now(),
        title: gedTitle,
        category: gedCategory,
        fileName: finalFileName,
        fileSize: finalSize,
        dateStr: new Date().toLocaleDateString('fr-FR'),
        fileContent: fileContent,
      };

      saveGedDocs([newDoc, ...gedDocs]);
      setIsGedFormOpen(false);
      setSelectedGedFile(null);
    };

    if (selectedGedFile) {
      const bytes = selectedGedFile.size;
      const mb = bytes / (1024 * 1024);
      if (mb < 0.1) {
        finalSize = (bytes / 1024).toFixed(1) + ' Ko';
      } else {
        finalSize = mb.toFixed(2) + ' Mo';
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        onComplete(reader.result as string);
      };
      reader.readAsDataURL(selectedGedFile);
    } else {
      // simulate random size if they typed custom name but no real file payload selected
      finalSize = (Math.random() * 4 + 0.5).toFixed(2) + ' Mo';
      onComplete();
    }
  };

  const handleDeleteGed = (id: string) => {
    const updated = gedDocs.filter(d => d.id !== id);
    saveGedDocs(updated);
  };

  // Harmonized styling constants
  const customButtonStyle: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '12px',
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
    borderRadius: '10px',
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

  const filteredDocs = gedDocs.filter((doc) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.category.toLowerCase().includes(q) ||
      doc.fileName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn" id="ged-tab-container-harmonized">
      <style>{`
        #ged-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-ged-input),
        #ged-tab-container-harmonized select,
        #ged-tab-container-harmonized textarea {
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
        #ged-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-ged-input),
        #ged-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-ged-input),
        #ged-tab-container-harmonized select:hover:not(:disabled),
        #ged-tab-container-harmonized select:focus:not(:disabled),
        #ged-tab-container-harmonized textarea:hover:not(:disabled),
        #ged-tab-container-harmonized textarea:focus:not(:disabled),
        #ged-tab-container-harmonized #search-ged-input:hover,
        #ged-tab-container-harmonized #search-ged-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #ged-tab-container-harmonized select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #ged-tab-container-harmonized select option {
          color: #000000 !important;
          background: #ffffff !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #ged-tab-container-harmonized label,
        #ged-tab-container-harmonized .ged-label-style {
          letter-spacing: normal !important;
          text-transform: none !important;
          font-size: 16px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #ged-tab-container-harmonized input:disabled,
        #ged-tab-container-harmonized select:disabled {
          background-color: #f1f5f9 !important;
          color: #555555 !important;
          cursor: not-allowed !important;
          opacity: 0.82 !important;
        }
      `}</style>
      
      {!isGedFormOpen ? (
        <>
          {/* Dashboard List Header with search bar and button */}
          <div 
            className="bg-white space-y-4"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
              <div>
                <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default' }} id="ged-tab-title">{t("GED")}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white">
                {/* Search Bar Input */}
                <div className="relative w-full sm:w-80 bg-white">
                  <input
                    type="text"
                    id="search-ged-input"
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

                <button
                  onClick={startNewGed}
                  style={customButtonStyle}
                  className="font-sans"
                >
                  {t("Nouveau")}
                </button>
              </div>
            </div>
          </div>

          {/* Main Table Records Sheet */}
          <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
            <div className="overflow-x-auto">
              {filteredDocs.length === 0 ? (
                <div className="p-16 text-center font-sans lg:py-24" id="no-ged-view">
                  <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
                    {t("Aucun résultat.")}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left font-sans border-collapse text-xs" id="ged-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
                  <thead>
                    <tr className="bg-transparent">
                      <th className="px-4 py-3.5" style={thStyle}>{t("Titre.")}</th>
                      <th className="px-4 py-3.5" style={thStyle}>{t("Catégorie.")}</th>
                      <th className="px-4 py-3.5" style={thStyle}>{t("Date.")}</th>
                      <th className="px-4 py-3.5 text-right w-24" style={thStyle}>{t("Actions.")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 text-xs">
                    {filteredDocs.map((doc) => {
                      return (
                        <tr key={doc.id} className="group hover:bg-[#ffecf8] transition-all cursor-pointer">
                          
                          {/* Titre */}
                          <td className="px-4 py-5 font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            <div className="font-semibold text-slate-850" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                              {doc.title.length > 25 ? `${doc.title.substring(0, 25)}...` : doc.title}
                            </div>
                          </td>

                          {/* Catégorie */}
                          <td className="px-4 py-5 text-left whitespace-nowrap">
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
                                padding: '6px 18px',
                                whiteSpace: 'nowrap',
                                fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                              }}
                            >
                              {t(doc.category)}
                            </span>
                          </td>

                          {/* Date d'émission */}
                          <td className="px-4 py-5 font-mono text-black text-left whitespace-nowrap" style={{ fontSize: '15px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            {doc.dateStr}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-5 text-right whitespace-nowrap bg-transparent" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex gap-2 bg-transparent">
                              <button
                                type="button"
                                onClick={() => handleConsultGed(doc)}
                                style={rowActionButton18Style}
                                className="cursor-pointer font-sans"
                              >
                                {t("Consulter")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteGed(doc.id)}
                                style={rowActionButton18Style}
                                className="cursor-pointer font-sans"
                              >
                                {t("Supprimer")}
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
        <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="ged-form-overlay">
          
          {/* Header Box styled exactly like DefibTab Form Header */}
          <div 
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', width: '98%', maxWidth: '98%', margin: 'auto', padding: '20px' }}
            id="ged-form-header-box"
          >
            <div>
              <h3 className="text-2xl font-bold font-gochi" id="form-modal-title" style={{ color: '#00', cursor: 'default' }}>
                {t("Nouveau fichier")}
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsGedFormOpen(false);
                }}
                id="btn-close-ged-modal"
                style={rowActionButton18Style}
                className="transition-colors cursor-pointer"
              >
                <span>{t("Annuler")}</span>
              </button>

              <button
                type="submit"
                form="ged-document-form"
                id="btn-submit-ged-form"
                style={{
                  ...rowActionButton18Style,
                  backgroundColor: 'rgb(53, 86, 236)',
                  color: '#ffffff',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                }}
                className="transition-all cursor-pointer"
              >
                <span>{t("Enregistrer")}</span>
              </button>
            </div>
          </div>

          {/* Elegant height spacing block to separate header box and form perfectly */}
          <div style={{ height: '16px' }} className="bg-transparent" />

          <form 
            id="ged-document-form"
            onSubmit={handleSaveGed} 
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
              
              {/* Title field */}
              <div className="flex flex-col gap-1 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ged-label-style">{t("Titre.")}</label>
                <input
                  type="text"
                  value={gedTitle}
                  onChange={(e) => setGedTitle(e.target.value)}
                  placeholder={t("Entrez un titre pour le fichier.")}
                  className="font-sans focus:outline-none w-full"
                  required
                />
              </div>

              {/* Category field */}
              <div className="flex flex-col gap-1 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ged-label-style">{t("Catégorie.")}</label>
                <select
                  value={gedCategory}
                  onChange={(e) => setGedCategory(e.target.value)}
                  className="font-sans focus:outline-none w-full cursor-pointer"
                  required
                >
                  <option value="" disabled hidden>{t("Sélectionnez une catégorie.")}</option>
                  <option value="Appel d'offre.">{t("Appel d'offre.")}</option>
                  <option value="Formation.">{t("Formation.")}</option>
                  <option value="Processus.">{t("Processus.")}</option>
                  <option value="Juridique.">{t("Juridique.")}</option>
                  <option value="Maintenance.">{t("Maintenance.")}</option>
                  <option value="Veille.">{t("Veille.")}</option>
                  <option value="Lettre.">{t("Lettre.")}</option>
                  <option value="Autre.">{t("Autre.")}</option>
                </select>
              </div>

              {/* Document upload zone */}
              <div className="flex flex-col gap-1 md:col-span-2 bg-white">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ged-label-style">
                  {t("Téléchargement du fichier.")}
                </label>
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    const MAX_SIZE_BYTES = 300 * 1024; // 300 Ko
                    if (file.size > MAX_SIZE_BYTES) {
                      alert(t("Le fichier dépasse la limite autorisée de 300 Ko (Taille du fichier sélectionné : ") + (file.size / 1024).toFixed(0) + t(" Ko). Veuillez compresser votre document pour ne pas surcharger le stockage cloud."));
                      return;
                    }
                    setSelectedGedFile(file);
                    setGedFileName(file.name);
                  }}
                  onClick={() => document.getElementById('ged-file-upload-input')?.click()}
                  className="p-8 text-center space-y-4 hover:bg-[#ffecf8]/20 transition-all cursor-pointer"
                  style={{ borderRadius: '13px', border: 'none', backgroundColor: '#fdecff' }}
                >
                  <input
                    type="file"
                    id="ged-file-upload-input"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const MAX_SIZE_BYTES = 300 * 1024; // 300 Ko
                      if (file.size > MAX_SIZE_BYTES) {
                        alert(t("Le fichier dépasse la limite autorisée de 300 Ko (Taille du fichier sélectionné : ") + (file.size / 1024).toFixed(0) + t(" Ko). Veuillez compresser votre document pour ne pas surcharger le stockage cloud."));
                        return;
                      }
                      setSelectedGedFile(file);
                      setGedFileName(file.name);
                    }}
                  />
                  
                  <div className="font-sans" style={{ fontSize: '16px', color: '#000000' }}>
                    {selectedGedFile ? (
                      <span className="font-bold inline-block" style={{ fontSize: '16px', padding: '9px 16px', backgroundColor: '#501655', border: 'none', color: '#ffffff', borderRadius: '9999px' }}>
                        {t("Votre fichier téléchargé :")} {selectedGedFile.name} ({(selectedGedFile.size / 1024).toFixed(0)} Ko)
                      </span>
                    ) : (
                      <span style={{ color: '#000000', fontSize: '16px' }}>
                        {t("Cliquez dans cette zone ou glissez directement votre fichier.")}
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
