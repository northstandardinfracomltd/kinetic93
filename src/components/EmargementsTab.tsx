import React, { useState, useRef, useEffect } from 'react';
import { EmargementRecord, EmargementStagiaireItem, FormationRecord, StagiaireRecord, Member } from '../types';

interface EmargementsTabProps {
  emargements: EmargementRecord[];
  saveEmargements: (updated: EmargementRecord[]) => void;
  formations: FormationRecord[];
  stagiaires: StagiaireRecord[];
  members: Member[];
}

interface SignaturePadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
}

function SignaturePad({ value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [value]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL());
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div className="space-y-2">
      <div className="border border-slate-300 rounded-[13px] overflow-hidden bg-white relative">
        <canvas
          ref={canvasRef}
          width={350}
          height={120}
          className="w-full h-[120px] cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-red-600 hover:text-red-800 underline font-medium cursor-pointer"
        >
          Effacer la signature
        </button>
      </div>
    </div>
  );
}

export default function EmargementsTab({
  emargements,
  saveEmargements,
  formations,
  stagiaires,
  members,
}: EmargementsTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [formationId, setFormationId] = useState('');
  const [statut, setStatut] = useState<'Brouillon' | 'Terminé'>('Brouillon');
  const [stagiairesItems, setStagiairesItems] = useState<EmargementStagiaireItem[]>([]);

  // Search
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const getFormationDisplayLabel = (fId: string) => {
    const f = formations.find((item) => item.id === fId);
    if (!f) return fId || '-';
    const formateurObj = members.find((m) => m.id === f.formateurId);
    const formateurName = formateurObj
      ? `${formateurObj.firstname || ''} ${formateurObj.lastname || ''}`.trim() || formateurObj.email
      : f.formateurId || 'Aucun';
    const dateFormatted = f.dateHeure ? f.dateHeure.replace('T', ' ') : 'Date non définie';
    return `${f.intitule || 'Formation'} - ${dateFormatted} - ${formateurName}`;
  };

  const getStagiaireDisplayLabel = (sId: string) => {
    const s = stagiaires.find((item) => item.id === sId);
    if (!s) return sId || '-';
    const dateNaiss = s.dateNaissance ? s.dateNaissance : 'Date non renseignée';
    return `${s.nomPrenom || 'Stagiaire'} - ${dateNaiss}`;
  };

  const startNewEmargement = () => {
    setFormationId('');
    setStatut('Brouillon');
    setStagiairesItems([]);
    setEditingId(null);
    setIsFormOpen(true);
  };

  const startEditEmargement = (e: EmargementRecord) => {
    setFormationId(e.formationId || '');
    setStatut(e.statut || 'Brouillon');
    setStagiairesItems(e.stagiaires ? JSON.parse(JSON.stringify(e.stagiaires)) : []);
    setEditingId(e.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Voulez-vous vraiment supprimer cet émargement ?')) {
      const updated = emargements.filter((item) => item.id !== id);
      saveEmargements(updated);
    }
  };

  const handleAddStagiaireItem = () => {
    if (stagiairesItems.length >= 50) {
      alert('Nombre maximum de 50 stagiaires atteint.');
      return;
    }

    const now = new Date();
    const formattedNow = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    const newItem: EmargementStagiaireItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      stagiaireId: '',
      present: 'Non',
      signature: '',
      horodatage: formattedNow,
      validation: 'Non',
    };

    setStagiairesItems([...stagiairesItems, newItem]);
  };

  const handleRemoveStagiaireItem = (id: string) => {
    setStagiairesItems(stagiairesItems.filter((item) => item.id !== id));
  };

  const handleUpdateStagiaireItem = (id: string, fields: Partial<EmargementStagiaireItem>) => {
    setStagiairesItems(
      stagiairesItems.map((item) => {
        if (item.id === id) {
          return { ...item, ...fields };
        }
        return item;
      })
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formationId) {
      alert('Veuillez sélectionner une formation.');
      return;
    }

    const now = new Date().toISOString();
    let updatedList: EmargementRecord[];

    if (editingId) {
      updatedList = emargements.map((item) => {
        if (item.id === editingId) {
          return {
            ...item,
            formationId,
            statut,
            stagiaires: stagiairesItems,
            updatedAt: now,
          };
        }
        return item;
      });
    } else {
      const newRecord: EmargementRecord = {
        id: `emarg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        formationId,
        statut,
        stagiaires: stagiairesItems,
        createdAt: now,
        updatedAt: now,
      };
      updatedList = [newRecord, ...emargements];
    }

    saveEmargements(updatedList);
    setIsFormOpen(false);
  };

  const filteredEmargements = emargements.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const label = getFormationDisplayLabel(item.formationId).toLowerCase();
    return label.includes(q) || item.statut?.toLowerCase().includes(q);
  });

  const blackButtonStyle: React.CSSProperties = {
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

  const blueButtonStyle: React.CSSProperties = {
    ...blackButtonStyle,
    backgroundColor: 'rgb(53, 86, 236)',
    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
  };

  const purpleButtonStyle: React.CSSProperties = {
    ...blackButtonStyle,
    backgroundColor: '#9333ea',
    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, #9333ea 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
  };

  const searchInputStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: '13px',
    backgroundColor: '#ffffff',
    border: '1px solid #dedede',
    color: '#000000',
    fontSize: '16px',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    outline: isSearchFocused ? '2.5px solid #fa53d5' : isSearchHovered ? '2.5px solid #fa53d5' : 'none',
    outlineOffset: '2px',
    transition: 'all 0s',
  };

  const cellStyle: React.CSSProperties = {
    fontSize: '16px',
    color: '#000000',
    whiteSpace: 'nowrap',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    cursor: 'default',
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

  return (
    <div id="emargements-tab-container" className="space-y-6 animate-fadeIn">
      <style>{`
        #emargements-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-emargements-input),
        #emargements-tab-container select,
        #emargements-tab-container textarea {
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
        #emargements-tab-container input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-emargements-input),
        #emargements-tab-container input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-emargements-input),
        #emargements-tab-container select:hover:not(:disabled),
        #emargements-tab-container select:focus:not(:disabled),
        #emargements-tab-container #search-emargements-input:hover,
        #emargements-tab-container #search-emargements-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #emargements-tab-container label {
          letter-spacing: normal !important;
          text-transform: none !important;
          font-size: 16px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
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
                  className="text-2xl font-bold tracking-tight bg-white"
                  style={{ color: '#000000', cursor: 'default', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
                >
                  Émargements
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white">
                <input
                  type="text"
                  id="search-emargements-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher."
                  className="w-48 sm:w-64 outline-none"
                  style={searchInputStyle}
                  onMouseEnter={() => setIsSearchHovered(true)}
                  onMouseLeave={() => setIsSearchHovered(false)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                />

                <button onClick={startNewEmargement} style={blueButtonStyle}>
                  Nouveau
                </button>
              </div>
            </div>
          </div>

          {/* Table Section */}
          <div
            className="bg-white shadow-xs overflow-hidden"
            style={{
              border: '1px solid #dadada',
              borderRadius: '18px',
              maxWidth: '98%',
              margin: 'auto',
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid #dedede', backgroundColor: '#f9fafb' }}>
                    <th className="px-6 py-4" style={thStyle}>Formation.</th>
                    <th className="px-6 py-4" style={thStyle}>Stagiaire(s).</th>
                    <th className="px-6 py-4" style={thStyle}>Statut.</th>
                    <th className="px-6 py-4 text-right" style={thStyle}>Action.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEmargements.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500" style={cellStyle}>
                        Aucun émargement enregistré.
                      </td>
                    </tr>
                  ) : (
                    filteredEmargements.map((item) => {
                      const count = item.stagiaires?.length || 0;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4" style={cellStyle}>
                            <span
                              style={{
                                borderRadius: '13px',
                                backgroundColor: '#e0e7ff',
                                color: '#3730a3',
                                padding: '4px 12px',
                                fontSize: '16px',
                                fontWeight: 500,
                                display: 'inline-block',
                              }}
                            >
                              {getFormationDisplayLabel(item.formationId)}
                            </span>
                          </td>
                          <td className="px-6 py-4" style={cellStyle}>{count}</td>
                          <td className="px-6 py-4" style={cellStyle}>
                            <span
                              style={{
                                borderRadius: '13px',
                                backgroundColor: item.statut === 'Terminé' ? '#dcfce7' : '#fef3c7',
                                color: item.statut === 'Terminé' ? '#166534' : '#92400e',
                                padding: '4px 12px',
                                fontSize: '16px',
                                fontWeight: 500,
                                display: 'inline-block',
                              }}
                            >
                              {item.statut}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => startEditEmargement(item)}
                              style={{ ...blackButtonStyle, padding: '6px 14px', fontSize: '16px' }}
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              style={{ ...blackButtonStyle, backgroundColor: '#dc2626', padding: '6px 14px', fontSize: '16px' }}
                            >
                              Supprimer
                            </button>
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
        /* Form View */
        <div
          className="bg-white p-6 space-y-6"
          style={{
            border: '1px solid #dadada',
            borderRadius: '18px',
            maxWidth: '98%',
            margin: 'auto',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4">
            <h2
              className="text-2xl font-bold"
              style={{ color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
            >
              {editingId ? 'Modification Émargement' : 'Nouveau Émargement'}
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                style={blackButtonStyle}
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={blueButtonStyle}
              >
                Enregistrer
              </button>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sélection formation */}
              <div>
                <label htmlFor="emarg-formation" className="block mb-1">Sélection formation.</label>
                <select
                  id="emarg-formation"
                  value={formationId}
                  onChange={(e) => setFormationId(e.target.value)}
                  className="w-full"
                  required
                >
                  <option value="">-- Sélectionner une formation --</option>
                  {formations.map((f) => (
                    <option key={f.id} value={f.id}>
                      {getFormationDisplayLabel(f.id)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Statut */}
              <div>
                <label htmlFor="emarg-statut" className="block mb-1">Statut.</label>
                <select
                  id="emarg-statut"
                  value={statut}
                  onChange={(e) => setStatut(e.target.value as 'Brouillon' | 'Terminé')}
                  className="w-full"
                >
                  <option value="Brouillon">Brouillon</option>
                  <option value="Terminé">Terminé</option>
                </select>
              </div>
            </div>

            {/* Sub-form Stagiaires */}
            <div className="border-t pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-black">
                  Stagiaires ({stagiairesItems.length}/50)
                </h3>
              </div>

              <button
                type="button"
                onClick={handleAddStagiaireItem}
                disabled={stagiairesItems.length >= 50}
                style={{ ...blueButtonStyle, width: '100%' }}
              >
                Ajouter un stagiaire
              </button>

              <div className="space-y-6 pt-2">
                {stagiairesItems.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    Aucun stagiaire ajouté. Cliquez sur le bouton ci-dessus pour ajouter un stagiaire.
                  </p>
                ) : (
                  stagiairesItems.map((stItem, index) => (
                    <div
                      key={stItem.id}
                      className="p-5 border border-slate-200 rounded-[18px] bg-slate-50/50 space-y-4 relative"
                    >
                      <div className="flex items-center justify-between border-b pb-2">
                        <span className="font-bold text-black" style={{ fontSize: '16px' }}>
                          Stagiaire #{index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStagiaireItem(stItem.id)}
                          style={{ ...blackButtonStyle, backgroundColor: '#dc2626', padding: '4px 12px', fontSize: '14px' }}
                        >
                          Supprimer
                        </button>
                      </div>

                      {/* Sélection stagiaire */}
                      <div>
                        <label className="block mb-1">Sélection stagiaire.</label>
                        <select
                          value={stItem.stagiaireId}
                          onChange={(e) => handleUpdateStagiaireItem(stItem.id, { stagiaireId: e.target.value })}
                          className="w-full"
                        >
                          <option value="">-- Sélectionner un stagiaire --</option>
                          {stagiaires.map((s) => (
                            <option key={s.id} value={s.id}>
                              {getStagiaireDisplayLabel(s.id)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Présent (Radio) */}
                      <div>
                        <label className="block mb-2">Présent.</label>
                        <div className="flex items-center gap-6">
                          <label className="flex items-center gap-2 cursor-pointer text-black" style={{ fontWeight: 400 }}>
                            <input
                              type="radio"
                              name={`present_${stItem.id}`}
                              value="Oui"
                              checked={stItem.present === 'Oui'}
                              onChange={() => handleUpdateStagiaireItem(stItem.id, { present: 'Oui' })}
                              className="w-5 h-5 accent-blue-600 cursor-pointer"
                            />
                            Oui
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-black" style={{ fontWeight: 400 }}>
                            <input
                              type="radio"
                              name={`present_${stItem.id}`}
                              value="Non"
                              checked={stItem.present === 'Non'}
                              onChange={() => handleUpdateStagiaireItem(stItem.id, { present: 'Non' })}
                              className="w-5 h-5 accent-blue-600 cursor-pointer"
                            />
                            Non
                          </label>
                        </div>
                      </div>

                      {/* Conditionnel si Oui à Présent */}
                      {stItem.present === 'Oui' && (
                        <div className="space-y-4 border-t pt-4 border-slate-200">
                          {/* Signature */}
                          <div>
                            <label className="block mb-1">Signature.</label>
                            <SignaturePad
                              value={stItem.signature}
                              onChange={(dataUrl) => handleUpdateStagiaireItem(stItem.id, { signature: dataUrl })}
                            />
                          </div>

                          {/* Horodatage */}
                          <div>
                            <label className="block mb-1">Horodatage.</label>
                            <input
                              type="text"
                              value={stItem.horodatage || ''}
                              onChange={(e) => handleUpdateStagiaireItem(stItem.id, { horodatage: e.target.value })}
                              className="w-full"
                              placeholder="ex: 06/08/2026 14:30"
                            />
                          </div>

                          {/* Validation */}
                          <div>
                            <label className="block mb-2">Validation.</label>
                            <div className="flex items-center gap-6">
                              <label className="flex items-center gap-2 cursor-pointer text-black" style={{ fontWeight: 400 }}>
                                <input
                                  type="radio"
                                  name={`validation_${stItem.id}`}
                                  value="Oui"
                                  checked={stItem.validation === 'Oui'}
                                  onChange={() => handleUpdateStagiaireItem(stItem.id, { validation: 'Oui' })}
                                  className="w-5 h-5 accent-blue-600 cursor-pointer"
                                />
                                Oui
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-black" style={{ fontWeight: 400 }}>
                                <input
                                  type="radio"
                                  name={`validation_${stItem.id}`}
                                  value="Non"
                                  checked={stItem.validation === 'Non'}
                                  onChange={() => handleUpdateStagiaireItem(stItem.id, { validation: 'Non' })}
                                  className="w-5 h-5 accent-blue-600 cursor-pointer"
                                />
                                Non
                              </label>
                            </div>
                          </div>

                          {/* Bouton Télécharger certificat si validation === 'Oui' */}
                          {stItem.validation === 'Oui' && (
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  // Click intentionally does nothing for now as specified
                                }}
                                style={{ ...purpleButtonStyle, width: '100%' }}
                              >
                                Télécharger le certificat PDF
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                style={blackButtonStyle}
              >
                Fermer
              </button>
              <button
                type="submit"
                style={blueButtonStyle}
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
