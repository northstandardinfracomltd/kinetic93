import React, { useState } from 'react';
import { FormationRecord, Variable, Member, Client, AppTab } from '../types';
import { getRegionsForCountry } from '../utils/regions';

interface FormationsTabProps {
  formations: FormationRecord[];
  saveFormations: (updated: FormationRecord[]) => void;
  variables: Variable[];
  members: Member[];
  clients: Client[];
  setActiveTab?: (tab: AppTab) => void;
}

export default function FormationsTab({
  formations,
  saveFormations,
  variables,
  members,
  clients,
  setActiveTab,
}: FormationsTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [intitule, setIntitule] = useState('');
  const [dateHeure, setDateHeure] = useState('');
  const [formateurId, setFormateurId] = useState('');
  const [statut, setStatut] = useState<'Brouillon' | 'Terminé'>('Brouillon');
  const [commentaire, setCommentaire] = useState('');

  const [clientId, setClientId] = useState('');
  const [adresse, setAdresse] = useState('');
  const [ville, setVille] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [region, setRegion] = useState('');
  const [pays, setPays] = useState('France');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Filter variables of category 'Formation'
  const formationVariables = variables.filter((v) => v.category === 'Formation');

  const startNewFormation = () => {
    setIntitule('');
    setDateHeure(new Date().toISOString().slice(0, 16));
    setFormateurId('');
    setStatut('Brouillon');
    setCommentaire('');
    setClientId('');
    setAdresse('');
    setVille('');
    setCodePostal('');
    setRegion('');
    setPays('France');
    setEditingId(null);
    setIsFormOpen(true);
  };

  const startEditFormation = (f: FormationRecord) => {
    setIntitule(f.intitule || '');
    setDateHeure(f.dateHeure || '');
    setFormateurId(f.formateurId || '');
    setStatut(f.statut || 'Brouillon');
    setCommentaire(f.commentaire || '');
    setClientId(f.clientId || '');
    setAdresse(f.adresse || '');
    setVille(f.ville || '');
    setCodePostal(f.codePostal || '');
    setRegion(f.region || '');
    setPays(f.pays || 'France');
    setEditingId(f.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm('Voulez-vous vraiment supprimer cette formation ?')) {
      const updated = formations.filter((item) => item.id !== id);
      saveFormations(updated);
    }
  };

  const handleClientChange = (cId: string) => {
    setClientId(cId);
    if (cId) {
      const foundClient = clients.find((c) => c.id === cId);
      if (foundClient) {
        if (foundClient.adresse) setAdresse(foundClient.adresse);
        if (foundClient.ville) setVille(foundClient.ville);
        if (foundClient.codePostal) setCodePostal(foundClient.codePostal);
        if (foundClient.region) setRegion(foundClient.region);
        if (foundClient.pays) setPays(foundClient.pays);
      }
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!intitule) {
      alert('Veuillez sélectionner un intitulé de formation.');
      return;
    }

    const now = new Date().toISOString();
    let updatedList: FormationRecord[];

    if (editingId) {
      updatedList = formations.map((f) => {
        if (f.id === editingId) {
          return {
            ...f,
            intitule,
            dateHeure,
            formateurId,
            statut,
            commentaire,
            clientId,
            adresse,
            ville,
            codePostal,
            region,
            pays,
            updatedAt: now,
          };
        }
        return f;
      });
    } else {
      const newRecord: FormationRecord = {
        id: `form_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        intitule,
        dateHeure,
        formateurId,
        statut,
        commentaire,
        clientId,
        adresse,
        ville,
        codePostal,
        region,
        pays,
        createdAt: now,
        updatedAt: now,
      };
      updatedList = [newRecord, ...formations];
    }

    saveFormations(updatedList);
    setIsFormOpen(false);
  };

  const filteredFormations = formations.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const formateurObj = members.find((m) => m.id === f.formateurId);
    const formateurName = formateurObj
      ? (formateurObj.name || `${formateurObj.firstname || ''} ${formateurObj.lastname || ''}`).trim() || formateurObj.email
      : '';
    const clientObj = clients.find((c) => c.id === f.clientId);
    const clientName = clientObj ? clientObj.denomination : '';
    return (
      f.intitule?.toLowerCase().includes(q) ||
      formateurName.toLowerCase().includes(q) ||
      clientName.toLowerCase().includes(q) ||
      f.ville?.toLowerCase().includes(q) ||
      f.codePostal?.toLowerCase().includes(q) ||
      f.statut?.toLowerCase().includes(q)
    );
  });

  const rowActionButton18Style: React.CSSProperties = {
    backgroundColor: '#000000',
    color: '#ffffff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '10px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: '100',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
  };

  const blueButtonStyle: React.CSSProperties = {
    ...rowActionButton18Style,
    backgroundColor: 'rgb(53, 86, 236)',
    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
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

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    backgroundColor: '#ffffff',
  };

  return (
    <div id="formations-tab-container" className="space-y-6">
      {!isFormOpen ? (
        <>
          {/* Top Header Block */}
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold tracking-tight font-gochi" style={{ color: '#000000', cursor: 'default' }}>
                  Formations
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    id="search-formations-input"
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

                <button onClick={startNewFormation} style={blueButtonStyle}>
                  Nouveau
                </button>
              </div>
            </div>
          </div>

          {/* Main Records Table Sheet - Full Width */}
          <div className="bg-white overflow-hidden rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
            <div className="overflow-x-auto">
              <table
                className="w-full text-left font-sans border-collapse text-xs"
                id="records-table"
                style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}
              >
                <thead>
                  <tr className="bg-transparent">
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Formation.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Date & Heure.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Formateur.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Statut.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Client.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Localisation.</th>
                    <th className="px-4 py-3.5 text-right whitespace-nowrap" style={thStyle}>Actions.</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 text-xs">
                  {filteredFormations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-16 text-center font-sans lg:py-24" style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
                        Aucun résultat.
                      </td>
                    </tr>
                  ) : (
                    filteredFormations.map((f) => {
                      const formateurObj = members.find((m) => m.id === f.formateurId);
                      const formateurName = formateurObj
                        ? (formateurObj.name || `${formateurObj.firstname || ''} ${formateurObj.lastname || ''}`).trim() || formateurObj.email
                        : f.formateurId || '-';

                      const clientObj = clients.find((c) => c.id === f.clientId);
                      const clientName = clientObj ? clientObj.denomination : f.clientId || '-';
                      const loc = [f.ville, f.codePostal].filter(Boolean).join(', ') || '-';
                      const formattedDate = f.dateHeure ? f.dateHeure.replace('T', ' ') : '-';

                      return (
                        <tr
                          key={f.id}
                          onClick={() => startEditFormation(f)}
                          className="group hover:bg-[#ffecf8] transition-all cursor-pointer"
                        >
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                border: '1px solid rgb(231, 231, 231)',
                                borderRadius: '1000px',
                                padding: '4px 12px',
                                backgroundColor: '#ffffff',
                                color: '#000000',
                                fontSize: '16px',
                                fontWeight: 100,
                              }}
                            >
                              {f.intitule || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {formattedDate}
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                border: '1px solid rgb(231, 231, 231)',
                                borderRadius: '1000px',
                                padding: '4px 12px',
                                backgroundColor: '#ffffff',
                                color: '#000000',
                                fontSize: '16px',
                                fontWeight: 100,
                              }}
                            >
                              {formateurName}
                            </span>
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                border: '1px solid rgb(231, 231, 231)',
                                borderRadius: '1000px',
                                padding: '4px 12px',
                                backgroundColor: '#ffffff',
                                color: '#000000',
                                fontSize: '16px',
                                fontWeight: 100,
                              }}
                            >
                              {f.statut}
                            </span>
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {clientName}
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {loc}
                          </td>
                          <td className="px-4 py-5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => startEditFormation(f)}
                                style={rowActionButton18Style}
                              >
                                Modifier
                              </button>
                              <button
                                onClick={(e) => handleDelete(f.id, e)}
                                style={{ ...rowActionButton18Style, backgroundColor: '#991b1b' }}
                              >
                                Supprimer
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
        /* Form Overlay */
        <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="formation-form-overlay">
          {/* Detached Form Header Box */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
            style={{
              border: '1px solid #dadada',
              borderTop: 'none',
              borderRadius: '0px 0px 18px 18px',
              maxWidth: '98%',
              margin: 'auto',
              padding: '20px',
            }}
            id="formation-form-header-box"
          >
            <div>
              <h3 className="text-2xl font-bold font-gochi" style={{ color: '#000000', cursor: 'default' }}>
                {editingId ? 'Modification Formation' : 'Nouvelle Formation'}
              </h3>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                style={rowActionButton18Style}
                className="transition-colors cursor-pointer"
              >
                <span>Fermer</span>
              </button>

              <button
                type="submit"
                form="formation-core-form"
                style={blueButtonStyle}
                className="transition-all"
              >
                Enregistrer
              </button>
            </div>
          </div>

          <div className="w-full animate-fadeIn mt-6" style={{ marginTop: '24px' }}>
            <style>{`
              #formation-core-form input:not([type="radio"]):not([type="checkbox"]),
              #formation-core-form select,
              #formation-core-form textarea {
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
              #formation-core-form input:not([type="radio"]):not([type="checkbox"]):hover,
              #formation-core-form input:not([type="radio"]):not([type="checkbox"]):focus,
              #formation-core-form select:hover,
              #formation-core-form select:focus,
              #formation-core-form textarea:hover,
              #formation-core-form textarea:focus {
                outline: 2.5px solid #fa53d5 !important;
                outline-offset: 2px !important;
                transition: all 0s !important;
              }
              #formation-core-form select {
                appearance: none !important;
                -webkit-appearance: none !important;
                -moz-appearance: none !important;
                background-image: none !important;
              }
              #formation-core-form select option {
                color: #000000 !important;
                background: #ffffff !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
              }
              #formation-core-form input[type="date"]::-webkit-calendar-picker-indicator,
              #formation-core-form input[type="datetime-local"]::-webkit-calendar-picker-indicator {
                display: none !important;
                -webkit-appearance: none !important;
                background: none !important;
                width: 0 !important;
                height: 0 !important;
              }
              #formation-core-form label {
                letter-spacing: normal !important;
                text-transform: none !important;
                font-size: 16px !important;
                color: #000000 !important;
                font-weight: 600 !important;
              }
              #formation-core-form input[type="radio"] {
                appearance: none !important;
                -webkit-appearance: none !important;
                width: 18px !important;
                height: 18px !important;
                border: 2px solid #cbd5e1 !important;
                border-radius: 50% !important;
                background-color: #ffffff !important;
                outline: none !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.2s ease !important;
                margin-right: 6px !important;
              }
              #formation-core-form input[type="radio"]:hover,
              #formation-core-form input[type="radio"]:checked {
                border-color: oklch(0.44 0.16 324.65) !important;
                background-color: oklch(0.44 0.16 324.65) !important;
              }
              #formation-core-form input[type="radio"]:checked::after {
                content: "" !important;
                width: 8px !important;
                height: 8px !important;
                background-color: #ffffff !important;
                border-radius: 50% !important;
                display: block !important;
              }
            `}</style>

            <form onSubmit={handleSave} className="space-y-6" id="formation-core-form">
              <div className="space-y-0" style={{ maxWidth: '98%', margin: 'auto' }}>
                {/* Section 1 - Informations sur la formation */}
                <div
                  className="bg-white p-5 relative space-y-4"
                  style={{
                    border: '1px solid rgb(218, 218, 218)',
                    borderRadius: '18px 18px 0px 0px',
                  }}
                >
                  <div className="mb-2 bg-transparent">
                    <span
                      className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                      style={{
                        backgroundColor: 'oklch(0.44 0.16 324.65)',
                        borderRadius: '1000px',
                        cursor: 'default',
                        fontWeight: 100,
                        textTransform: 'none',
                      }}
                    >
                      1 — Informations sur la formation
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Intitulé */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="form-intitule">Intitulé.</label>
                        {setActiveTab && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('variables')}
                            className="text-[14px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                            style={{ border: 'none', background: 'none' }}
                          >
                            + Variable
                          </button>
                        )}
                      </div>
                      <select
                        id="form-intitule"
                        value={intitule}
                        onChange={(e) => setIntitule(e.target.value)}
                        className="w-full"
                        required
                      >
                        <option value="">-- Sélectionner une formation --</option>
                        {formationVariables.map((v) => (
                          <option key={v.id} value={v.nom}>
                            {v.nom}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date & Heure */}
                    <div className="space-y-1">
                      <label htmlFor="form-dateheure" className="block mb-1">Date & Heure.</label>
                      <input
                        type="datetime-local"
                        id="form-dateheure"
                        value={dateHeure}
                        onChange={(e) => setDateHeure(e.target.value)}
                        className="w-full"
                        required
                      />
                    </div>

                    {/* Formateur */}
                    <div className="space-y-1">
                      <label htmlFor="form-formateur" className="block mb-1">Formateur.</label>
                      <select
                        id="form-formateur"
                        value={formateurId}
                        onChange={(e) => setFormateurId(e.target.value)}
                        className="w-full"
                      >
                        <option value="">-- Sélectionner un formateur --</option>
                        {members.map((m) => {
                          const name = (m.name || `${m.firstname || ''} ${m.lastname || ''}`).trim() || m.email;
                          return (
                            <option key={m.id} value={m.id}>
                              {name}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Statut */}
                    <div className="space-y-1">
                      <label htmlFor="form-statut" className="block mb-1">Statut.</label>
                      <select
                        id="form-statut"
                        value={statut}
                        onChange={(e) => setStatut(e.target.value as 'Brouillon' | 'Terminé')}
                        className="w-full"
                      >
                        <option value="Brouillon">Brouillon</option>
                        <option value="Terminé">Terminé</option>
                      </select>
                    </div>
                  </div>

                  {/* Commentaire */}
                  <div className="space-y-1">
                    <label htmlFor="form-commentaire" className="block mb-1">Commentaire.</label>
                    <textarea
                      id="form-commentaire"
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value)}
                      rows={3}
                      className="w-full"
                      placeholder="Notes et commentaires..."
                    />
                  </div>
                </div>

                {/* Section 2 - Client et lieu de la formation */}
                <div
                  className="bg-white p-5 relative space-y-4"
                  style={{
                    border: '1px solid rgb(218, 218, 218)',
                    borderTop: 'none',
                    borderRadius: '0px 0px 18px 18px',
                  }}
                >
                  <div className="mb-2 bg-transparent">
                    <span
                      className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                      style={{
                        backgroundColor: 'oklch(0.44 0.16 324.65)',
                        borderRadius: '1000px',
                        cursor: 'default',
                        fontWeight: 100,
                        textTransform: 'none',
                      }}
                    >
                      2 — Client et lieu de la formation
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Client */}
                    <div className="space-y-1">
                      <label htmlFor="form-client" className="block mb-1">Client.</label>
                      <select
                        id="form-client"
                        value={clientId}
                        onChange={(e) => handleClientChange(e.target.value)}
                        className="w-full"
                      >
                        <option value="">-- Sélectionner un client --</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.denomination}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Numéro et voie */}
                    <div className="space-y-1">
                      <label htmlFor="form-adresse" className="block mb-1">Numéro et voie.</label>
                      <input
                        type="text"
                        id="form-adresse"
                        value={adresse}
                        onChange={(e) => setAdresse(e.target.value)}
                        className="w-full"
                        placeholder="ex: 12 Rue de la Paix"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    {/* Ville */}
                    <div className="space-y-1">
                      <label htmlFor="form-ville" className="block mb-1">Ville.</label>
                      <input
                        type="text"
                        id="form-ville"
                        value={ville}
                        onChange={(e) => setVille(e.target.value)}
                        className="w-full"
                      />
                    </div>

                    {/* Code postal */}
                    <div className="space-y-1">
                      <label htmlFor="form-cp" className="block mb-1">Code postal.</label>
                      <input
                        type="text"
                        id="form-cp"
                        value={codePostal}
                        onChange={(e) => setCodePostal(e.target.value)}
                        className="w-full"
                      />
                    </div>

                    {/* Région Dropdown */}
                    <div className="space-y-1">
                      <label htmlFor="form-region" className="block mb-1">Région.</label>
                      <select
                        id="form-region"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="w-full"
                      >
                        <option value="">Choisir une région.</option>
                        {getRegionsForCountry(pays).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Pays Dropdown */}
                    <div className="space-y-1">
                      <label htmlFor="form-pays" className="block mb-1">Pays.</label>
                      <select
                        id="form-pays"
                        value={pays}
                        onChange={(e) => setPays(e.target.value)}
                        className="w-full"
                      >
                        <option value="France">France</option>
                        <option value="Espagne">Espagne</option>
                        <option value="Portugal">Portugal</option>
                        <option value="Suisse">Suisse</option>
                        <option value="Luxembourg">Luxembourg</option>
                        <option value="Belgique">Belgique</option>
                        <option value="Allemagne">Allemagne</option>
                        <option value="Pays-Bas">Pays-Bas</option>
                        <option value="Royaume-Uni">Royaume-Uni</option>
                        <option value="Irlande">Irlande</option>
                        <option value="Suède">Suède</option>
                        <option value="Pologne">Pologne</option>
                        <option value="Italie">Italie</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
