import React, { useState } from 'react';
import { AchatFournisseur, Variable } from '../types';
import { ShoppingBag, Eye, Trash2, Edit, Plus, FileText, Upload, Search, X } from 'lucide-react';
import { t } from '../utils/translate';

interface AchatsFournisseursTabProps {
  achatsFournisseurs: AchatFournisseur[];
  saveAchatsFournisseurs: (updated: AchatFournisseur[]) => void;
  variables: Variable[];
}

export default function AchatsFournisseursTab({
  achatsFournisseurs,
  saveAchatsFournisseurs,
  variables,
}: AchatsFournisseursTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAchatId, setEditingAchatId] = useState<string | null>(null);

  // Form States
  const [reference, setReference] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [comment, setComment] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | undefined>(undefined);
  const [pdfName, setPdfName] = useState<string | undefined>(undefined);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Filter variables of category 'Fournisseur'
  const supplierVariables = variables.filter((v) => v.category === 'Fournisseur');

  // Multi-format support for auto-generating references
  const generateNextReference = () => {
    const prefix = 'BL';
    const year = '2026';
    const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
    let maxNum = 0;
    for (const a of achatsFournisseurs) {
      if (a.reference) {
        const match = a.reference.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
    return `${prefix}-${year}-${maxNum + 1}`;
  };

  const startNewAchat = () => {
    const nextRef = generateNextReference();
    setReference(nextRef);
    setOrderReference('');
    setSupplierId('');
    setComment('');
    setPdfUrl(undefined);
    setPdfName(undefined);
    setEditingAchatId(null);
    setIsFormOpen(true);
  };

  const startEditAchat = (achat: AchatFournisseur) => {
    setReference(achat.reference);
    setOrderReference(achat.orderReference);
    setSupplierId(achat.supplierId);
    setComment(achat.comment);
    setPdfUrl(achat.pdfUrl);
    setPdfName(achat.pdfName);
    setEditingAchatId(achat.id);
    setIsFormOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPdfUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAchat = (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierId) {
      alert('Veuillez sélectionner un fournisseur.');
      return;
    }

    const selectedSup = supplierVariables.find((s) => s.id === supplierId);
    const supplierName = selectedSup ? selectedSup.nom : 'Fournisseur inconnu';

    if (editingAchatId) {
      const updated = achatsFournisseurs.map((a) =>
        a.id === editingAchatId
          ? {
              ...a,
              orderReference,
              supplierId,
              supplierName,
              comment,
              pdfUrl,
              pdfName,
            }
          : a
      );
      saveAchatsFournisseurs(updated);
    } else {
      const newAchat: AchatFournisseur = {
        id: 'achat-' + Date.now(),
        reference,
        orderReference,
        supplierId,
        supplierName,
        comment,
        pdfUrl,
        pdfName,
        dateStr: new Date().toLocaleDateString('fr-FR'),
      };
      saveAchatsFournisseurs([newAchat, ...achatsFournisseurs]);
    }

    setIsFormOpen(false);
  };

  const handleDeleteAchat = (id: string) => {
    const updated = achatsFournisseurs.filter((a) => a.id !== id);
    saveAchatsFournisseurs(updated);
  };

  // Consult uploaded PDF
  const handleConsultPdf = (achat: AchatFournisseur) => {
    if (!achat.pdfUrl) {
      alert(t("Aucun fichier n'est rattaché à cet achat."));
      return;
    }
    const a = document.createElement('a');
    a.href = achat.pdfUrl;
    a.download = achat.pdfName || 'achat.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Filters logic
  const filteredAchats = achatsFournisseurs.filter((achat) => {
    const matchesSearch =
      achat.reference.toLowerCase().includes(search.toLowerCase()) ||
      achat.orderReference.toLowerCase().includes(search.toLowerCase()) ||
      achat.supplierName.toLowerCase().includes(search.toLowerCase()) ||
      achat.comment.toLowerCase().includes(search.toLowerCase());

    const matchesSupplier = supplierFilter ? achat.supplierId === supplierFilter : true;

    return matchesSearch && matchesSupplier;
  });

  // Theme support
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

  const searchInputStyle: React.CSSProperties = {
    border: '1px solid #dedede',
    borderRadius: '13px',
    padding: '9px 19px',
    fontSize: '18px',
    fontWeight: '100',
    color: '#000000',
    backgroundColor: '#ffffff',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    outline: isSearchHovered || isSearchFocused ? '2.5px solid #fa53d5' : 'none',
    outlineOffset: isSearchHovered || isSearchFocused ? '2px' : '0px',
    transition: 'all 0s',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
    fontSize: '16px',
    whiteSpace: 'nowrap',
  };

  const smallBlackButtonStyle: React.CSSProperties = {
    backgroundColor: '#000000',
    color: '#ffffff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '13px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: '100',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
  };

  const smallBlueButtonStyle: React.CSSProperties = {
    ...smallBlackButtonStyle,
    backgroundColor: 'rgb(53, 86, 236)',
    color: '#ffffff',
    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
  };

  const cellStyle: React.CSSProperties = {
    fontSize: '16px',
    color: '#000000',
    whiteSpace: 'nowrap',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    cursor: 'default',
  };

  return (
    <div id="achats-tab-container-harmonized" className="space-y-6 animate-fadeIn">
      <style>{`
        #achats-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-achats-input),
        #achats-tab-container-harmonized select,
        #achats-tab-container-harmonized textarea {
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
        #achats-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-achats-input),
        #achats-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-achats-input),
        #achats-tab-container-harmonized select:hover:not(:disabled),
        #achats-tab-container-harmonized select:focus:not(:disabled),
        #achats-tab-container-harmonized textarea:hover:not(:disabled),
        #achats-tab-container-harmonized textarea:focus:not(:disabled),
        #achats-tab-container-harmonized #search-achats-input:hover,
        #achats-tab-container-harmonized #search-achats-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #achats-tab-container-harmonized select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #achats-tab-container-harmonized select option {
          color: #000000 !important;
          background: #ffffff !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #achats-tab-container-harmonized label,
        #achats-tab-container-harmonized .achats-label-style {
          letter-spacing: normal !important;
          text-transform: none !important;
          font-size: 16px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #achats-tab-container-harmonized input:disabled,
        #achats-tab-container-harmonized select:disabled {
          background-color: #f1f5f9 !important;
          color: #555555 !important;
          cursor: not-allowed !important;
          opacity: 0.82 !important;
        }
        #achats-tab-container-harmonized input::placeholder,
        #achats-tab-container-harmonized textarea::placeholder {
          color: #000000 !important;
          opacity: 1 !important;
        }
      `}</style>

      {!isFormOpen ? (
        <>
          {/* Header Section */}
          <div
            className="bg-white space-y-4"
            style={{
              border: '1px solid #dadada',
              borderTop: 'none',
              borderRadius: '0px 0px 18px 18px',
              maxWidth: '98%',
              margin: 'auto',
              padding: '20px',
              backgroundColor: '#ffffff',
            }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
              <div>
                <h2
                  className="text-2xl font-bold tracking-tight font-gochi bg-white"
                  style={{ color: '#000000', cursor: 'default', fontFamily: 'Gochi, sans-serif' }}
                >
                  {t("Achats fournisseurs")}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white">
                {/* Search query */}
                <div className="relative bg-white">
                  <input
                    type="text"
                    id="search-achats-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("Rechercher.")}
                    className="w-48 sm:w-64 text-black placeholder-[#747474] placeholder:font-light outline-none"
                    style={searchInputStyle}
                    onMouseEnter={() => setIsSearchHovered(true)}
                    onMouseLeave={() => setIsSearchHovered(false)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                  />
                </div>

                <button onClick={startNewAchat} style={customButtonStyle} className="font-sans">
                  {t("Nouveau")}
                </button>
              </div>
            </div>
          </div>

          {/* MAIN RECORDS TABLE */}
          <div className="bg-white overflow-hidden mt-6 rounded-none">
            <div className="overflow-x-auto">
              <table
                className="w-full text-left font-sans border-collapse text-xs"
                style={{
                  borderTop: '1px solid rgb(218, 218, 218)',
                  borderBottom: '1px solid rgb(218, 218, 218)',
                }}
              >
                <thead>
                  <tr className="bg-transparent">
                    <th className="px-4 py-3.5" style={thStyle}>
                      {t("Référence.")}
                    </th>
                    <th className="px-4 py-3.5" style={thStyle}>
                      {t("Réf. Commande.")}
                    </th>
                    <th className="px-4 py-3.5" style={thStyle}>
                      {t("Fournisseur.")}
                    </th>
                    <th className="px-4 py-3.5" style={thStyle}>
                      {t("Commentaire.")}
                    </th>
                    <th className="px-4 py-3.5" style={thStyle}>
                      {t("Date.")}
                    </th>
                    <th className="px-4 py-3.5 text-right w-36" style={thStyle}>
                      {t("Actions.")}
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 text-xs">
                  {filteredAchats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center font-sans lg:py-24 text-sm bg-white" style={{ color: '#000000', fontWeight: 100, fontSize: '16px' }}>
                        {t("Aucun résultat.")}
                      </td>
                    </tr>
                  ) : (
                    filteredAchats.map((achat) => {
                      return (
                        <tr
                          key={achat.id}
                          className="group hover:bg-[#ffecf8] transition-all cursor-pointer border-b border-slate-100"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, a, input, select, option')) return;
                            startEditAchat(achat);
                          }}
                        >
                          {/* Reference */}
                          <td
                            className="px-4 py-4 whitespace-nowrap"
                            style={cellStyle}
                          >
                            {achat.reference || ''}
                          </td>

                          {/* Order Reference */}
                          <td
                            className="px-4 py-4 whitespace-nowrap"
                            style={cellStyle}
                          >
                            {achat.orderReference || ''}
                          </td>

                          {/* Supplier */}
                          <td
                            className="px-4 py-4 whitespace-nowrap"
                            style={cellStyle}
                          >
                            {achat.supplierName || ''}
                          </td>

                          {/* Comment */}
                          <td
                            className="px-4 py-4 whitespace-nowrap"
                            style={cellStyle}
                          >
                            {achat.comment || ''}
                          </td>

                          {/* Date */}
                          <td
                            className="px-4 py-4 whitespace-nowrap"
                            style={cellStyle}
                          >
                            {achat.dateStr || ''}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-4 align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2 bg-transparent">
                              {achat.pdfUrl && (
                                <button
                                  type="button"
                                  onClick={() => handleConsultPdf(achat)}
                                  style={smallBlackButtonStyle}
                                >
                                  {t("Télécharger")}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => startEditAchat(achat)}
                                style={smallBlackButtonStyle}
                              >
                                {t("Modifier")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAchat(achat.id)}
                                style={smallBlackButtonStyle}
                              >
                                {t("Supprimer")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* FORM VIEW */
        <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="achats-form-overlay-harmonized">
          
          {/* Header Box styled exactly like other forms */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
            style={{
              border: '1px solid #dadada',
              borderTop: 'none',
              borderRadius: '0px 0px 18px 18px',
              width: '98%',
              maxWidth: '98%',
              margin: 'auto',
              padding: '20px',
            }}
            id="achats-form-header-box"
          >
            <div>
              <h3 className="text-2xl font-bold font-gochi" style={{ fontFamily: 'Gochi, sans-serif', color: '#000', cursor: 'default' }}>
                {editingAchatId ? t("Modifier l’achat fournisseur") : t("Nouvel achat fournisseur")}
              </h3>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                style={smallBlackButtonStyle}
                className="transition-colors cursor-pointer"
              >
                {t("Annuler")}
              </button>

              <button
                type="submit"
                form="achats-fournisseurs-form"
                style={smallBlueButtonStyle}
                className="transition-all cursor-pointer"
              >
                {t("Enregistrer")}
              </button>
            </div>
          </div>

          {/* Spacer block */}
          <div style={{ height: '16px' }} className="bg-transparent" />

          {/* Form container below header */}
          <form
            id="achats-fournisseurs-form"
            onSubmit={handleSaveAchat}
            className="space-y-6 bg-white p-6 border-none"
            style={{
              border: '1px solid rgb(218, 218, 218)',
              borderRadius: '18px',
              width: '98%',
              maxWidth: '98%',
              margin: 'auto',
            }}
          >
            {/* Reference */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider achats-label-style">
                {t("Référence.")}
              </label>
              <input
                type="text"
                value={reference}
                disabled
                className="w-full focus:outline-none bg-slate-50 border border-slate-200 text-slate-500 rounded-md py-2 px-3 font-mono cursor-not-allowed text-sm"
              />
            </div>

            {/* Commande Reference */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider achats-label-style">
                {t("Référence de commande fournisseur.")}
              </label>
              <input
                type="text"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value)}
                placeholder={t("Entrez une référence du fournisseur.")}
                className="w-full"
                required
              />
            </div>

            {/* Fournisseur Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider achats-label-style">
                {t("Sélection du fournisseur.")}
              </label>

              {supplierVariables.length === 0 ? (
                <div className="p-3 border border-pink-200 rounded-2xl bg-pink-50/50 text-xs text-pink-700 font-sans">
                  <p className="font-bold mb-1">{t("Aucun fournisseur configuré.")}</p>
                  {t("Veuillez aller dans l'onglet")} <strong>{t("Variables")}</strong> {t("et ajouter un fournisseur de catégorie 'Fournisseur' d'abord pour pouvoir lier cet achat.")}
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full pr-10 cursor-pointer"
                    required
                  >
                    <option value="">{t("Sélection d'un fournisseur.")}</option>
                    {supplierVariables.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Comment */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider achats-label-style">
                {t("Commentaire.")}
              </label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("Entrez un commentaire.")}
                className="w-full"
              />
            </div>

            {/* PDF File upload / download */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider achats-label-style">
                {t("Fichier de la commande. (PDF)")}
              </label>

              <div className="border border-solid border-[#D5D5D5] hover:border-[#fa53d5]/50 transition-colors rounded-2xl p-6 text-center cursor-pointer bg-white relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
                <p className="font-sans font-medium" style={{ fontSize: '18px', color: '#000000' }}>
                  {pdfName ? pdfName : t("Sélection d'un fichier PDF.")}
                </p>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
