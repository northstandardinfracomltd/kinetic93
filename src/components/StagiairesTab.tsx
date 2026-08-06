import React, { useState } from 'react';
import { StagiaireRecord } from '../types';

interface StagiairesTabProps {
  stagiaires: StagiaireRecord[];
  saveStagiaires: (updated: StagiaireRecord[]) => void;
}

export default function StagiairesTab({
  stagiaires,
  saveStagiaires,
}: StagiairesTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [nomPrenom, setNomPrenom] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [sexe, setSexe] = useState<'Homme' | 'Femme'>('Homme');

  const [adresse, setAdresse] = useState('');
  const [ville, setVille] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [region, setRegion] = useState('');
  const [pays, setPays] = useState('France');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const startNewStagiaire = () => {
    setNomPrenom('');
    setDateNaissance('');
    setEmail('');
    setTelephone('');
    setSexe('Homme');
    setAdresse('');
    setVille('');
    setCodePostal('');
    setRegion('');
    setPays('France');
    setEditingId(null);
    setIsFormOpen(true);
  };

  const startEditStagiaire = (s: StagiaireRecord) => {
    setNomPrenom(s.nomPrenom || '');
    setDateNaissance(s.dateNaissance || '');
    setEmail(s.email || '');
    setTelephone(s.telephone || '');
    setSexe(s.sexe || 'Homme');
    setAdresse(s.adresse || '');
    setVille(s.ville || '');
    setCodePostal(s.codePostal || '');
    setRegion(s.region || '');
    setPays(s.pays || 'France');
    setEditingId(s.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Voulez-vous vraiment supprimer ce stagiaire ?')) {
      const updated = stagiaires.filter((item) => item.id !== id);
      saveStagiaires(updated);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!nomPrenom.trim()) {
      alert('Veuillez saisir un nom & prénom.');
      return;
    }

    const now = new Date().toISOString();
    let updatedList: StagiaireRecord[];

    if (editingId) {
      updatedList = stagiaires.map((s) => {
        if (s.id === editingId) {
          return {
            ...s,
            nomPrenom,
            dateNaissance,
            email,
            telephone,
            sexe,
            adresse,
            ville,
            codePostal,
            region,
            pays,
            updatedAt: now,
          };
        }
        return s;
      });
    } else {
      const newRecord: StagiaireRecord = {
        id: `stag_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        nomPrenom,
        dateNaissance,
        email,
        telephone,
        sexe,
        adresse,
        ville,
        codePostal,
        region,
        pays,
        createdAt: now,
        updatedAt: now,
      };
      updatedList = [newRecord, ...stagiaires];
    }

    saveStagiaires(updatedList);
    setIsFormOpen(false);
  };

  const filteredStagiaires = stagiaires.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.nomPrenom?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.telephone?.toLowerCase().includes(q) ||
      s.ville?.toLowerCase().includes(q) ||
      s.codePostal?.toLowerCase().includes(q)
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
    <div id="stagiaires-tab-container" className="space-y-6 animate-fadeIn">
      <style>{`
        #stagiaires-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-stagiaires-input),
        #stagiaires-tab-container select,
        #stagiaires-tab-container textarea {
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
        #stagiaires-tab-container input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-stagiaires-input),
        #stagiaires-tab-container input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-stagiaires-input),
        #stagiaires-tab-container select:hover:not(:disabled),
        #stagiaires-tab-container select:focus:not(:disabled),
        #stagiaires-tab-container #search-stagiaires-input:hover,
        #stagiaires-tab-container #search-stagiaires-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #stagiaires-tab-container label {
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
                  Stagiaires
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white">
                <input
                  type="text"
                  id="search-stagiaires-input"
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

                <button onClick={startNewStagiaire} style={blueButtonStyle}>
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
                    <th className="px-6 py-4" style={thStyle}>Nom & Prénom.</th>
                    <th className="px-6 py-4" style={thStyle}>Naissance.</th>
                    <th className="px-6 py-4" style={thStyle}>Sexe.</th>
                    <th className="px-6 py-4" style={thStyle}>Localisation.</th>
                    <th className="px-6 py-4 text-right" style={thStyle}>Action.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStagiaires.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500" style={cellStyle}>
                        Aucun stagiaire enregistré.
                      </td>
                    </tr>
                  ) : (
                    filteredStagiaires.map((s) => {
                      const loc = [s.ville, s.codePostal].filter(Boolean).join(', ') || '-';
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
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
                              {s.nomPrenom || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4" style={cellStyle}>{s.dateNaissance || '-'}</td>
                          <td className="px-6 py-4" style={cellStyle}>{s.sexe || '-'}</td>
                          <td className="px-6 py-4" style={cellStyle}>{loc}</td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => startEditStagiaire(s)}
                              style={{ ...blackButtonStyle, padding: '6px 14px', fontSize: '16px' }}
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleDelete(s.id)}
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
              {editingId ? 'Modification Stagiaire' : 'Nouveau Stagiaire'}
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
              {/* Nom & Prénom */}
              <div>
                <label htmlFor="stag-nomprenom" className="block mb-1">Nom & Prénom.</label>
                <input
                  type="text"
                  id="stag-nomprenom"
                  value={nomPrenom}
                  onChange={(e) => setNomPrenom(e.target.value)}
                  className="w-full"
                  required
                  placeholder="ex: Jean Dupont"
                />
              </div>

              {/* Date de naissance */}
              <div>
                <label htmlFor="stag-naissance" className="block mb-1">Date de naissance.</label>
                <input
                  type="date"
                  id="stag-naissance"
                  value={dateNaissance}
                  onChange={(e) => setDateNaissance(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="stag-email" className="block mb-1">Email.</label>
                <input
                  type="email"
                  id="stag-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full"
                  placeholder="ex: jean.dupont@example.com"
                />
              </div>

              {/* Téléphone */}
              <div>
                <label htmlFor="stag-telephone" className="block mb-1">Téléphone.</label>
                <input
                  type="tel"
                  id="stag-telephone"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  className="w-full"
                  placeholder="ex: 06 12 34 56 78"
                />
              </div>
            </div>

            {/* Sexe (Radio) */}
            <div>
              <label className="block mb-2">Sexe.</label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer font-normal text-black" style={{ fontWeight: 400 }}>
                  <input
                    type="radio"
                    name="stag-sexe"
                    value="Homme"
                    checked={sexe === 'Homme'}
                    onChange={() => setSexe('Homme')}
                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                  />
                  Homme
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-normal text-black" style={{ fontWeight: 400 }}>
                  <input
                    type="radio"
                    name="stag-sexe"
                    value="Femme"
                    checked={sexe === 'Femme'}
                    onChange={() => setSexe('Femme')}
                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                  />
                  Femme
                </label>
              </div>
            </div>

            {/* Adresse & Localisation */}
            <div className="space-y-4 border-t pt-4">
              <div>
                <label htmlFor="stag-adresse" className="block mb-1">Numéro et voie.</label>
                <input
                  type="text"
                  id="stag-adresse"
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  className="w-full"
                  placeholder="ex: 15 Rue des Fleurs"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Ville */}
                <div>
                  <label htmlFor="stag-ville" className="block mb-1">Ville.</label>
                  <input
                    type="text"
                    id="stag-ville"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* Code postal */}
                <div>
                  <label htmlFor="stag-cp" className="block mb-1">Code postal.</label>
                  <input
                    type="text"
                    id="stag-cp"
                    value={codePostal}
                    onChange={(e) => setCodePostal(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* Région */}
                <div>
                  <label htmlFor="stag-region" className="block mb-1">Région.</label>
                  <input
                    type="text"
                    id="stag-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* Pays */}
                <div>
                  <label htmlFor="stag-pays" className="block mb-1">Pays.</label>
                  <input
                    type="text"
                    id="stag-pays"
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
