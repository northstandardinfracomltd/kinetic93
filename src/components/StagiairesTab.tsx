import React, { useState } from 'react';
import { StagiaireRecord } from '../types';
import { getRegionsForCountry } from '../utils/regions';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';

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

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  const rowActionButton18Style: React.CSSProperties = {
    backgroundColor: '#000000',
    color: '#ffffff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '13px',
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

  const triggerFormShakeAndScroll = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const submitBtn = document.querySelector('#stagiaire-core-form button[type="submit"]') || document.querySelector('button[form="stagiaire-core-form"]');
    if (submitBtn) {
      submitBtn.classList.remove('shake-element');
      void (submitBtn as HTMLElement).offsetWidth;
      submitBtn.classList.add('shake-element');
      setTimeout(() => {
        submitBtn.classList.remove('shake-element');
      }, 500);
    }
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
    <div id="stagiaires-tab-container" className="space-y-6">
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
              margin: '0 auto 24px auto',
              padding: '20px',
              backgroundColor: '#ffffff',
            }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold tracking-tight font-gochi" style={{ color: '#000000', cursor: 'default' }}>
                  Stagiaires
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    id="search-stagiaires-input"
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

                <button onClick={startNewStagiaire} style={blueButtonStyle}>
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
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Nom & Prénom.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Naissance.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Sexe.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Localisation.</th>
                    <th className="px-4 py-3.5 text-right whitespace-nowrap" style={thStyle}>Actions.</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 text-xs">
                  {filteredStagiaires.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
                      </td>
                    </tr>
                  ) : (
                    filteredStagiaires.map((s) => {
                      const loc = [s.ville, s.codePostal].filter(Boolean).join(', ') || '-';
                      return (
                        <tr
                          key={s.id}
                          onClick={() => startEditStagiaire(s)}
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
                              {s.nomPrenom || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {s.dateNaissance || '-'}
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
                              {s.sexe || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                            {loc}
                          </td>
                          <td className="px-4 py-5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => startEditStagiaire(s)}
                                style={rowActionButton18Style}
                              >
                                Modifier
                              </button>
                              <button
                                onClick={(e) => handleDelete(s.id, e)}
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
        <div
          className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto min-h-screen pt-0 pb-4"
          id="stagiaire-form-overlay"
          onClick={triggerFormShakeAndScroll}
        >
          {/* Detached Form Header Box */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
            style={{
              border: '1px solid #dadada',
              borderTop: 'none',
              borderRadius: '0px 0px 18px 18px',
              maxWidth: '98%',
              margin: '0 auto',
              marginTop: '0px',
              padding: '20px',
            }}
            id="stagiaire-form-header-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-2xl font-bold font-gochi" style={{ color: '#000000', cursor: 'default' }}>
                {editingId ? 'Modification Stagiaire' : 'Nouveau Stagiaire'}
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
                form="stagiaire-core-form"
                style={blueButtonStyle}
                className="transition-all"
              >
                Enregistrer
              </button>
            </div>
          </div>

          <div
            className="w-full animate-fadeIn mt-6"
            style={{ marginTop: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              #stagiaire-core-form input:not([type="radio"]):not([type="checkbox"]),
              #stagiaire-core-form select,
              #stagiaire-core-form textarea {
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
              #stagiaire-core-form input:not([type="radio"]):not([type="checkbox"]):hover,
              #stagiaire-core-form input:not([type="radio"]):not([type="checkbox"]):focus,
              #stagiaire-core-form select:hover,
              #stagiaire-core-form select:focus,
              #stagiaire-core-form textarea:hover,
              #stagiaire-core-form textarea:focus {
                outline: 2.5px solid #fa53d5 !important;
                outline-offset: 2px !important;
                transition: all 0s !important;
              }
              #stagiaire-core-form select {
                appearance: none !important;
                -webkit-appearance: none !important;
                -moz-appearance: none !important;
                background-image: none !important;
              }
              #stagiaire-core-form select option {
                color: #000000 !important;
                background: #ffffff !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
              }
              #stagiaire-core-form input[type="date"]::-webkit-calendar-picker-indicator {
                display: none !important;
                -webkit-appearance: none !important;
                background: none !important;
                width: 0 !important;
                height: 0 !important;
              }
              #stagiaire-core-form label {
                letter-spacing: normal !important;
                text-transform: none !important;
                font-size: 16px !important;
                color: #000000 !important;
                font-weight: 600 !important;
              }
            `}</style>

            <form onSubmit={handleSave} className="space-y-6" id="stagiaire-core-form">
              <div className="space-y-0" style={{ maxWidth: '98%', margin: 'auto' }}>
                {/* Section 1 - Informations Personnelles */}
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
                      1 — Informations personnelles
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Nom & Prénom */}
                    <div className="space-y-1">
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
                    <div className="space-y-1">
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
                    <div className="space-y-1">
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
                    <div className="space-y-1">
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
                  <div className="space-y-1 pt-2">
                    <label className="block mb-2">Sexe.</label>
                    <div className="flex items-center gap-6 py-1">
                      <button
                        type="button"
                        onClick={() => setSexe('Homme')}
                        className="inline-flex items-center cursor-pointer gap-2 select-none"
                        style={{ fontSize: '16px', color: '#000' }}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${sexe === 'Homme' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                          {sexe === 'Homme' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                        </span>
                        Homme
                      </button>

                      <button
                        type="button"
                        onClick={() => setSexe('Femme')}
                        className="inline-flex items-center cursor-pointer gap-2 select-none"
                        style={{ fontSize: '16px', color: '#000' }}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${sexe === 'Femme' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                          {sexe === 'Femme' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                        </span>
                        Femme
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 2 - Localisation */}
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
                      2 — Adresse et localisation
                    </span>
                  </div>

                  <div className="space-y-1">
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

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    {/* Ville */}
                    <div className="space-y-1">
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
                    <div className="space-y-1">
                      <label htmlFor="stag-cp" className="block mb-1">Code postal.</label>
                      <input
                        type="text"
                        id="stag-cp"
                        value={codePostal}
                        onChange={(e) => setCodePostal(e.target.value)}
                        className="w-full"
                      />
                    </div>

                    {/* Région Dropdown */}
                    <div className="space-y-1">
                      <label htmlFor="stag-region" className="block mb-1">Région.</label>
                      <select
                        id="stag-region"
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
                      <label htmlFor="stag-pays" className="block mb-1">Pays.</label>
                      <select
                        id="stag-pays"
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
