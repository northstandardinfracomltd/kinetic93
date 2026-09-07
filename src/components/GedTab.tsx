import React, { useState, useEffect, useCallback } from 'react';
import { GedDocument } from '../types';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { t } from '../utils/translate';
import { uploadFileToGoogleDrive, getGoogleDriveCredentials } from '../utils/googleDrive';

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
  const [gedFileUrl, setGedFileUrl] = useState('');

  // Google Drive connector state
  const [googleDriveActive, setGoogleDriveActive] = useState(false);
  const [googleDriveEmail, setGoogleDriveEmail] = useState('');
  const [googleDriveAccessToken, setGoogleDriveAccessToken] = useState('');

  // Loading & error states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Search & Filters State
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Refresh Google Drive credentials from Firestore / localStorage
  const refreshDriveCredentials = useCallback(async () => {
    try {
      const creds = await getGoogleDriveCredentials();
      setGoogleDriveActive(creds.active);
      setGoogleDriveEmail(creds.email);
      setGoogleDriveAccessToken(creds.token);
    } catch (e) {
      console.warn("Could not check Google Drive credentials:", e);
    }
  }, []);

  useEffect(() => {
    refreshDriveCredentials();

    const onStorageChange = () => {
      refreshDriveCredentials();
    };
    const onWindowFocus = () => {
      refreshDriveCredentials();
    };

    window.addEventListener('storage', onStorageChange);
    window.addEventListener('focus', onWindowFocus);
    return () => {
      window.removeEventListener('storage', onStorageChange);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [refreshDriveCredentials]);

  useEffect(() => {
    if (isGedFormOpen) {
      refreshDriveCredentials();
      setSubmitError(null);
    }
  }, [isGedFormOpen, refreshDriveCredentials]);

  const startNewGed = () => {
    setGedTitle('');
    setGedCategory('');
    setGedFileName('');
    setSelectedGedFile(null);
    setGedFileUrl('');
    setSubmitError(null);
    refreshDriveCredentials();
    setIsGedFormOpen(true);
  };

  const handleSaveGed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!gedTitle.trim()) {
      const err = t("Veuillez spécifier un titre pour le document.");
      setSubmitError(err);
      alert(err);
      return;
    }

    if (!gedCategory) {
      const err = t("Veuillez sélectionner une catégorie.");
      setSubmitError(err);
      alert(err);
      return;
    }

    // Strict Google Drive check
    const creds = await getGoogleDriveCredentials();
    const driveIsActive = creds.active && Boolean(creds.token);
    setGoogleDriveActive(creds.active);
    setGoogleDriveEmail(creds.email);
    setGoogleDriveAccessToken(creds.token);

    if (!driveIsActive) {
      const err = t("Veuillez activer le connecteur Google Drive pour continuer.");
      setSubmitError(err);
      alert(err);
      return;
    }

    if (!selectedGedFile && !gedFileUrl.trim()) {
      const err = t("Veuillez sélectionner un fichier à téléverser sur Google Drive.");
      setSubmitError(err);
      alert(err);
      return;
    }

    setIsUploading(true);
    setUploadProgressText(t("Téléversement du fichier sur Google Drive..."));

    try {
      let finalUrl = gedFileUrl.trim();
      let finalSize = '0 Mo';
      let finalFileName = gedFileName.trim();

      if (selectedGedFile) {
        finalFileName = selectedGedFile.name;
        const bytes = selectedGedFile.size;
        const mb = bytes / (1024 * 1024);
        if (mb < 0.1) {
          finalSize = (bytes / 1024).toFixed(1) + ' Ko';
        } else {
          finalSize = mb.toFixed(2) + ' Mo';
        }

        // Upload to Google Drive
        finalUrl = await uploadFileToGoogleDrive(creds.token, selectedGedFile);
        setGedFileUrl(finalUrl);
      } else if (!finalFileName) {
        finalFileName = gedTitle.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
        finalSize = '1.0 Mo';
      }

      const newDoc: GedDocument = {
        id: 'ged-' + Date.now(),
        title: gedTitle.trim(),
        category: gedCategory,
        fileName: finalFileName,
        fileSize: finalSize,
        dateStr: new Date().toLocaleDateString('fr-FR'),
        fileUrl: finalUrl,
        driveUrl: finalUrl,
      };

      saveGedDocs([newDoc, ...gedDocs]);

      // Reset form fields
      setGedTitle('');
      setGedCategory('');
      setGedFileName('');
      setSelectedGedFile(null);
      setGedFileUrl('');
      setSubmitError(null);

      // Redirect immediately back to GED table view
      setIsGedFormOpen(false);
    } catch (err: any) {
      console.error("Erreur lors de l'enregistrement GED sur Google Drive:", err);
      const msg = err?.message || t("Une erreur est survenue lors de l'upload sur Google Drive.");
      setSubmitError(msg);
      alert(msg);
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
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
                  id="btn-new-ged-doc"
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
                <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
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
                        <tr 
                          key={doc.id} 
                          className="group hover:bg-[#ffecf8] transition-all cursor-pointer"
                          onClick={() => {
                            const targetUrl = doc.driveUrl || doc.fileUrl;
                            if (targetUrl) {
                              window.open(targetUrl, '_blank');
                            } else {
                              handleConsultGed(doc);
                            }
                          }}
                        >
                          
                          {/* Titre */}
                          <td className="px-4 py-5 font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                            <div className="font-semibold text-slate-850 flex items-center gap-2" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                              <span>{doc.title.length > 35 ? `${doc.title.substring(0, 35)}...` : doc.title}</span>
                              {(doc.driveUrl || doc.fileUrl) && (
                                <span className="inline-flex items-center text-[11px] font-normal text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  Google Drive
                                </span>
                              )}
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
                                onClick={() => {
                                  const targetUrl = doc.driveUrl || doc.fileUrl;
                                  if (targetUrl) {
                                    window.open(targetUrl, '_blank');
                                  } else {
                                    handleConsultGed(doc);
                                  }
                                }}
                                style={rowActionButton18Style}
                                className="cursor-pointer font-sans"
                                id={`btn-consult-ged-${doc.id}`}
                              >
                                {t("Consulter")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteGed(doc.id)}
                                style={rowActionButton18Style}
                                className="cursor-pointer font-sans"
                                id={`btn-delete-ged-${doc.id}`}
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
                disabled={isUploading}
                id="btn-close-ged-modal"
                style={rowActionButton18Style}
                className="transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>{t("Annuler")}</span>
              </button>

              <button
                type="submit"
                form="ged-document-form"
                disabled={isUploading}
                id="btn-submit-ged-form"
                style={{
                  ...rowActionButton18Style,
                  backgroundColor: isUploading ? '#7c8fa6' : 'rgb(53, 86, 236)',
                  color: '#ffffff',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                }}
                className="transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>{t("Téléversement...")}</span>
                  </span>
                ) : (
                  <span>{t("Enregistrer")}</span>
                )}
              </button>
            </div>
          </div>

          {/* Elegant height spacing block to separate header box and form perfectly */}
          <div style={{ height: '16px' }} className="bg-transparent" />

          {/* Form Container */}
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
            {/* Error Banner if any */}
            {submitError && (
              <div 
                className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-sm flex items-start gap-3"
                id="ged-submit-error-banner"
              >
                <span className="text-base leading-none">⚠️</span>
                <div className="flex-1 font-medium">{submitError}</div>
              </div>
            )}

            {/* Google Drive Connector Status Indicator */}
            {googleDriveActive && googleDriveAccessToken ? (
              <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-sm">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                  <span className="font-semibold">{t("Connecteur Google Drive actif")}</span>
                  {googleDriveEmail && (
                    <span className="text-emerald-700 text-xs">({googleDriveEmail})</span>
                  )}
                </div>
                <span className="text-xs text-emerald-700 font-medium hidden sm:inline">
                  {t("Stockage dans le dossier 'Defibeo'")}
                </span>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-sm flex items-start gap-2.5">
                <span className="text-base leading-none">⚠️</span>
                <div className="flex-1">
                  <span className="font-bold">{t("Connecteur Google Drive inactif : ")}</span>
                  <span>
                    {t("Veuillez activer le connecteur Google Drive pour continuer. Rendez-vous dans Paramètres > Connecteurs API.")}
                  </span>
                </div>
              </div>
            )}

            {isUploading && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-sm flex items-center gap-3">
                <svg className="animate-spin h-5 w-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="font-medium">{uploadProgressText}</span>
              </div>
            )}

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
                  disabled={isUploading}
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
                  disabled={isUploading}
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

              {/* URL Google Drive Field */}
              <div className="flex flex-col gap-1 md:col-span-2 bg-white">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ged-label-style">
                    {t("URL Google Drive du fichier.")}
                  </label>
                  {gedFileUrl && (
                    <a
                      href={gedFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#3556ec] hover:underline font-medium inline-flex items-center gap-1"
                    >
                      <span>{t("Tester le lien Google Drive")}</span>
                      <span>↗</span>
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  id="ged-file-url-input"
                  value={gedFileUrl}
                  onChange={(e) => setGedFileUrl(e.target.value)}
                  placeholder={t("Ce champ reçoit l'URL partagée Google Drive générée lors du téléversement...")}
                  className="font-sans focus:outline-none w-full"
                  disabled={isUploading}
                />
                <span className="text-xs text-slate-500 font-sans">
                  {t("L'URL Google Drive sera automatiquement renseignée lors du téléversement et permettra de consulter le document en un clic.")}
                </span>
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
                    if (isUploading) return;
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo
                    if (file.size > MAX_SIZE_BYTES) {
                      alert(t("Le fichier dépasse la limite autorisée de 50 Mo."));
                      return;
                    }
                    setSelectedGedFile(file);
                    setGedFileName(file.name);
                  }}
                  onClick={() => {
                    if (!isUploading) {
                      document.getElementById('ged-file-upload-input')?.click();
                    }
                  }}
                  className="p-8 text-center space-y-4 hover:bg-[#ffecf8]/20 transition-all cursor-pointer"
                  style={{ borderRadius: '13px', border: 'none', backgroundColor: '#fdecff' }}
                >
                  <input
                    type="file"
                    id="ged-file-upload-input"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo
                      if (file.size > MAX_SIZE_BYTES) {
                        alert(t("Le fichier dépasse la limite autorisée de 50 Mo."));
                        return;
                      }
                      setSelectedGedFile(file);
                      setGedFileName(file.name);
                    }}
                  />
                  
                  <div className="font-sans" style={{ fontSize: '16px', color: '#000000' }}>
                    {selectedGedFile ? (
                      <span className="font-bold inline-block" style={{ fontSize: '16px', padding: '9px 16px', backgroundColor: '#501655', border: 'none', color: '#ffffff', borderRadius: '9999px' }}>
                        {t("Votre fichier sélectionné :")} {selectedGedFile.name} ({(selectedGedFile.size / 1024).toFixed(0)} Ko)
                      </span>
                    ) : (
                      <span style={{ color: '#000000', fontSize: '16px' }}>
                        {t("Cliquez dans cette zone ou glissez directement votre fichier (PDF, image, document...).")}
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
