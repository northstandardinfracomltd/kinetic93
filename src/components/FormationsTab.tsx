import React, { useState } from 'react';
import { FormationRecord, Variable, Member, Client, AppTab } from '../types';

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

  const handleDelete = (id: string) => {
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
    const formateurName = formateurObj ? `${formateurObj.firstname || ''} ${formateurObj.lastname || ''}` : '';
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
    <div id="formations-tab-container" className="space-y-6 animate-fadeIn">
      <style>{`
        #formations-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-formations-input),
        #formations-tab-container select,
        #formations-tab-container textarea {
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
        #formations-tab-container input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-formations-input),
        #formations-tab-container input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-formations-input),
        #formations-tab-container select:hover:not(:disabled),
        #formations-tab-container select:focus:not(:disabled),
        #formations-tab-container textarea:hover:not(:disabled),
        #formations-tab-container textarea:focus:not(:disabled),
        #formations-tab-container #search-formations-input:hover,
        #formations-tab-container #search-formations-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #formations-tab-container select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #formations-tab-container label {
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
                  Formations
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white">
                <input
                  type="text"
                  id="search-formations-input"
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

                <button onClick={startNewFormation} style={blueButtonStyle}>
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
                    <th className="px-6 py-4" style={thStyle}>Date & Heure.</th>
                    <th className="px-6 py-4" style={thStyle}>Formateur.</th>
                    <th className="px-6 py-4" style={thStyle}>Statut.</th>
                    <th className="px-6 py-4" style={thStyle}>Client.</th>
                    <th className="px-6 py-4" style={thStyle}>Localisation.</th>
                    <th className="px-6 py-4 text-right" style={thStyle}>Action.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredFormations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500" style={cellStyle}>
                        Aucune formation enregistrée.
                      </td>
                    </tr>
                  ) : (
                    filteredFormations.map((f) => {
                      const formateurObj = members.find((m) => m.id === f.formateurId);
                      const formateurName = formateurObj
                        ? `${formateurObj.firstname || ''} ${formateurObj.lastname || ''}`.trim() || formateurObj.email
                        : f.formateurId || '-';

                      const clientObj = clients.find((c) => c.id === f.clientId);
                      const clientName = clientObj ? clientObj.denomination : f.clientId || '-';
                      const loc = [f.ville, f.codePostal].filter(Boolean).join(', ') || '-';

                      const formattedDate = f.dateHeure
                        ? f.dateHeure.replace('T', ' ')
                        : '-';

                      return (
                        <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
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
                              {f.intitule || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4" style={cellStyle}>{formattedDate}</td>
                          <td className="px-6 py-4" style={cellStyle}>
                            <span
                              style={{
                                borderRadius: '13px',
                                backgroundColor: '#f3e8ff',
                                color: '#6b21a8',
                                padding: '4px 12px',
                                fontSize: '16px',
                                fontWeight: 500,
                                display: 'inline-block',
                              }}
                            >
                              {formateurName}
                            </span>
                          </td>
                          <td className="px-6 py-4" style={cellStyle}>
                            <span
                              style={{
                                borderRadius: '13px',
                                backgroundColor: f.statut === 'Terminé' ? '#dcfce7' : '#fef3c7',
                                color: f.statut === 'Terminé' ? '#166534' : '#92400e',
                                padding: '4px 12px',
                                fontSize: '16px',
                                fontWeight: 500,
                                display: 'inline-block',
                              }}
                            >
                              {f.statut}
                            </span>
                          </td>
                          <td className="px-6 py-4" style={cellStyle}>{clientName}</td>
                          <td className="px-6 py-4" style={cellStyle}>{loc}</td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => startEditFormation(f)}
                              style={{ ...blackButtonStyle, padding: '6px 14px', fontSize: '16px' }}
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleDelete(f.id)}
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
              {editingId ? 'Modification Formation' : 'Nouvelle Formation'}
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

          <form onSubmit={handleSave} className="space-y-8">
            {/* Section 1 — Informations sur la formation */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-black border-b pb-2">
                1 — Informations sur la formation
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Intitulé */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="form-intitule">Intitulé.</label>
                    {setActiveTab && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('variables')}
                        className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                        style={{ border: 'none', background: 'none' }}
                      >
                        Nouvelle variable
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
                      <option key={v.id} value={v.title}>
                        {v.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date & Heure */}
                <div>
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
                <div>
                  <label htmlFor="form-formateur" className="block mb-1">Formateur.</label>
                  <select
                    id="form-formateur"
                    value={formateurId}
                    onChange={(e) => setFormateurId(e.target.value)}
                    className="w-full"
                  >
                    <option value="">-- Sélectionner un formateur --</option>
                    {members.map((m) => {
                      const name = `${m.firstname || ''} ${m.lastname || ''}`.trim() || m.email;
                      return (
                        <option key={m.id} value={m.id}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Statut */}
                <div>
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
              <div>
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

            {/* Section 2 — Client et lieu de la formation */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-black border-b pb-2">
                2 — Client et lieu de la formation
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client */}
                <div>
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
                <div>
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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Ville */}
                <div>
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
                <div>
                  <label htmlFor="form-cp" className="block mb-1">Code postal.</label>
                  <input
                    type="text"
                    id="form-cp"
                    value={codePostal}
                    onChange={(e) => setCodePostal(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* Région */}
                <div>
                  <label htmlFor="form-region" className="block mb-1">Région.</label>
                  <input
                    type="text"
                    id="form-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* Pays */}
                <div>
                  <label htmlFor="form-pays" className="block mb-1">Pays.</label>
                  <input
                    type="text"
                    id="form-pays"
                    value={pays}
                    onChange={(e) => setPays(e.target.value)}
                    className="w-full"
                  />
                </div>
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
