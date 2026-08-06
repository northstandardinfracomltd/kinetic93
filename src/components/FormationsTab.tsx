import React, { useState } from 'react';
import { FormationRecord, Variable, Member, Client, AppTab } from '../types';
import { getRegionsForCountry } from '../utils/regions';

interface FormationsTabProps {
  formations: FormationRecord[];
  saveFormations: (updated: FormationRecord[]) => void;
  variables: Variable[];
  members: Member[];
  clients: Client[];
  setActiveTab?: (tab: any) => void;
  fsmTours?: any[];
  onUpdateFsmTours?: (updated: any[]) => void;
}

const CRENEAU_OPTIONS = [
  '8:00am',
  '8:30am',
  '9:00am',
  '9:30am',
  '10:00am',
  '10:30am',
  '11:00am',
  '11:30am',
  '12:00pm',
  '12:30pm',
  '13:00pm',
  '13:30pm',
  '14:00pm',
  '14:30pm',
  '15:00pm',
  '15:30pm',
  '16:00pm',
  '16:30pm',
  '17:00pm',
  '17:30pm',
  '18:00pm',
  '18:30pm',
  '19:00pm'
];

export default function FormationsTab({
  formations,
  saveFormations,
  variables,
  members,
  clients,
  setActiveTab,
  fsmTours,
  onUpdateFsmTours,
}: FormationsTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Selection & Tour actions state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isTourDropdownOpen, setIsTourDropdownOpen] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  // Form states
  const [intitule, setIntitule] = useState('');
  const [date, setDate] = useState('');
  const [creneau, setCreneau] = useState('14:00pm');
  const [dateHeure, setDateHeure] = useState('');
  const [formateurId, setFormateurId] = useState('');
  const [statut, setStatut] = useState<'Brouillon' | 'Terminé'>('Brouillon');
  const [commentaire, setCommentaire] = useState('');
  const [reasons, setReasons] = useState<string[]>([]);

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
    setDate(new Date().toISOString().split('T')[0]);
    setCreneau('14:00pm');
    setDateHeure('');
    setFormateurId('');
    setStatut('Brouillon');
    setCommentaire('');
    setReasons([]);
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
    const pDate = f.date || (f.dateHeure ? f.dateHeure.split('T')[0].split(' ')[0] : new Date().toISOString().split('T')[0]);
    const pSlot = f.creneau || (f.dateHeure ? formatTimeToSlot(f.dateHeure) : '14:00pm');
    setDate(pDate);
    setCreneau(pSlot);
    setDateHeure(f.dateHeure || '');
    setFormateurId(f.formateurId || '');
    setStatut(f.statut || 'Brouillon');
    setCommentaire(f.commentaire || '');
    const currentReasons = Array.isArray(f.reasons)
      ? f.reasons
      : (f.reason ? f.reason.split(', ').map((s) => s.trim()).filter(Boolean) : []);
    setReasons(currentReasons);
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

    const computedDateHeure = date && creneau ? `${date} ${creneau}` : (date || dateHeure);
    const now = new Date().toISOString();
    let updatedList: FormationRecord[];

    if (editingId) {
      updatedList = formations.map((f) => {
        if (f.id === editingId) {
          return {
            ...f,
            intitule,
            date,
            creneau,
            dateHeure: computedDateHeure,
            formateurId,
            statut,
            commentaire,
            reasons,
            reason: reasons.join(', '),
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
        date,
        creneau,
        dateHeure: computedDateHeure,
        formateurId,
        statut,
        commentaire,
        reasons,
        reason: reasons.join(', '),
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

  const isAnySelectedInTour = selectedIds.some((fId) =>
    (fsmTours || []).some((t: any) =>
      (t.missions || []).some((m: any) =>
        m.formationId === fId ||
        m.id?.includes(fId) ||
        (m.equipmentType === 'Formation' && (m.defibIdentifiant === fId || m.formationId === fId))
      )
    )
  );

  const formatTimeToSlot = (dateHeureStr: string) => {
    if (!dateHeureStr || !dateHeureStr.includes('T')) return '14:00pm';
    const timePart = dateHeureStr.split('T')[1].substring(0, 5);
    const [hStr, mStr] = timePart.split(':');
    const h = parseInt(hStr, 10);
    if (isNaN(h)) return '14:00pm';
    const m = mStr || '00';
    const suffix = h >= 12 ? 'pm' : 'am';
    return `${h}:${m}${suffix}`;
  };

  const createMissionFromFormation = (fId: string, index: number) => {
    const f = formations.find((item) => item.id === fId);
    const client = clients.find((c) => c.id === f?.clientId);
    const clientName = client ? client.denomination : (f?.clientId || 'Nom du Client');
    const rawDate = f?.date || (f?.dateHeure ? f.dateHeure.split('T')[0].split(' ')[0] : new Date().toISOString().split('T')[0]);
    const rawSlot = f?.creneau || (f?.dateHeure ? formatTimeToSlot(f.dateHeure) : '14:00pm');
    let rawTime = '14:00';
    if (rawSlot) {
      const cleanSlot = rawSlot.replace('am', '').replace('pm', '').trim();
      const parts = cleanSlot.split(':');
      if (parts.length === 2) {
        const hh = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        rawTime = `${hh}:${mm}`;
      }
    }
    const reasonText = f?.reasons && f.reasons.length > 0 ? f.reasons.join(', ') : (f?.intitule || 'Formation');
    const reasonsArray = f?.reasons && f.reasons.length > 0 ? f.reasons : (f?.intitule ? [f.intitule] : ['Formation']);
    const addressText = [f?.adresse, f?.codePostal, f?.ville].filter(Boolean).join(', ');

    return {
      id: 'fsm-m-auto-fmt-' + Date.now() + '-' + index,
      formationId: f?.id || fId,
      defibIdentifiant: f?.intitule || f?.id || 'Formation',
      equipmentType: 'Formation',
      clientName,
      clientId: f?.clientId || '',
      reason: reasonText,
      reasons: reasonsArray,
      requiredParts: [],
      status: 'Brouillon',
      priority: 'Normale',
      time: rawTime,
      estimatedDate: rawDate,
      estimatedSlot: rawSlot,
      isForced: true,
      isManualDate: true,
      isManualSlot: true,
      address: addressText,
      location: addressText,
    };
  };

  const executeNouvelleTournee = () => {
    if (!onUpdateFsmTours) return;
    const missions = selectedIds.map((id, index) => createMissionFromFormation(id, index));
    const defaultTech = members.find((m: any) => m.role === 'Maintenance Terrain' || m.role?.toLowerCase().includes('tech'))?.name || members[0]?.name || '';
    const newTour = {
      id: 'fsm-tour-auto-' + Date.now(),
      title: 'Nouvelle tournée sans titre',
      techName: defaultTech,
      startDate: missions[0]?.estimatedDate || new Date().toISOString().split('T')[0],
      status: 'Brouillon',
      missions,
    };
    onUpdateFsmTours([...(fsmTours || []), newTour]);
    setSelectedIds([]);
    setIsTourDropdownOpen(false);
    setSelectedDraftId(null);
    if (setActiveTab) setActiveTab('fsm');
  };

  const executeAddToTrier = () => {
    if (!onUpdateFsmTours) return;
    const missionsToAdd = selectedIds.map((id, index) => createMissionFromFormation(id, index));
    let existingTrierTour = (fsmTours || []).find((t: any) => t.id === 'a-trier');
    let updated: any[];
    if (existingTrierTour) {
      updated = (fsmTours || []).map((t: any) => {
        if (t.id === 'a-trier') {
          return { ...t, missions: [...t.missions, ...missionsToAdd] };
        }
        return t;
      });
    } else {
      const newTrierTour = {
        id: 'a-trier',
        title: 'Missions à trier',
        techName: '',
        startDate: 'A trier',
        status: 'Brouillon',
        missions: missionsToAdd,
      };
      updated = [...(fsmTours || []), newTrierTour];
    }
    onUpdateFsmTours(updated);
    setSelectedIds([]);
    setIsTourDropdownOpen(false);
    setSelectedDraftId(null);
    if (setActiveTab) setActiveTab('fsm');
  };

  const executeAddTournee = (tourId: string) => {
    if (!onUpdateFsmTours) return;
    const missionsToAdd = selectedIds.map((id, index) => createMissionFromFormation(id, index));
    const updated = (fsmTours || []).map((t: any) => {
      if (t.id === tourId) {
        return { ...t, missions: [...t.missions, ...missionsToAdd] };
      }
      return t;
    });
    onUpdateFsmTours(updated);
    setSelectedIds([]);
    setIsTourDropdownOpen(false);
    setSelectedDraftId(null);
    if (setActiveTab) setActiveTab('fsm');
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
    const submitBtn = document.querySelector('#formation-core-form button[type="submit"]') || document.querySelector('button[form="formation-core-form"]');
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
              margin: '0 auto 24px auto',
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

                {selectedIds.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      disabled={isAnySelectedInTour}
                      onClick={() => {
                        if (!isAnySelectedInTour) {
                          setIsTourDropdownOpen(!isTourDropdownOpen);
                        }
                      }}
                      title={isAnySelectedInTour ? "Action impossible : l'une des formations sélectionnées fait déjà partie d'une tournée." : "Associer à une tournée"}
                      style={{
                        ...rowActionButton18Style,
                        opacity: isAnySelectedInTour ? 0.6 : 1,
                        cursor: isAnySelectedInTour ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <span>Tournée</span>
                    </button>
                    {isTourDropdownOpen && !isAnySelectedInTour && (
                      <div 
                        className="absolute right-0 mt-1 w-72 bg-white rounded-lg z-50 py-2.5 font-sans animate-fadeIn"
                        style={{ 
                          fontSize: '18px',
                          border: '1px solid rgb(218 218 218)',
                          boxShadow: 'none'
                        }}
                      >
                        <div className="px-3 pb-2 bg-transparent flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => executeNouvelleTournee()}
                            style={{
                              ...rowActionButton18Style,
                              width: '100%',
                            }}
                            className="w-full text-center transition-colors cursor-pointer"
                          >
                            Nouvelle Tournée
                          </button>

                          <button
                            type="button"
                            onClick={() => executeAddToTrier()}
                            style={{
                              ...rowActionButton18Style,
                              width: '100%',
                              backgroundColor: '#000000',
                              borderColor: '#000000',
                              color: '#ffffff'
                            }}
                            className="w-full text-center transition-colors cursor-pointer hover:opacity-90"
                          >
                            À trier
                          </button>
                        </div>

                        {selectedDraftId && (
                          <div className="px-3 pb-2 bg-transparent">
                            <button
                              type="button"
                              onClick={() => executeAddTournee(selectedDraftId)}
                              style={{
                                ...rowActionButton18Style,
                                width: '100%',
                                boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                                background: 'rgb(53, 86, 236)'
                              }}
                              className="w-full text-center transition-colors cursor-pointer"
                            >
                              Confirmer l'action
                            </button>
                          </div>
                        )}
                        
                        {(() => {
                          const drafts = (fsmTours || []).filter(t => (t.status || 'Brouillon') === 'Brouillon' && t.id !== 'a-trier');
                          if (drafts.length === 0) {
                            return (
                              <div className="px-4 py-2 text-black font-sans text-center" style={{ fontSize: '15px' }}>
                                Aucune tournée en brouillon
                              </div>
                            );
                          }
                          return drafts.map(t => {
                            const isSelected = selectedDraftId === t.id;
                            const tourTitle = t.title || 'Nouvelle Tournée';
                            const displayTitle = tourTitle.length > 25 ? tourTitle.substring(0, 25) + '(...)' : tourTitle;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setSelectedDraftId(isSelected ? null : t.id)}
                                className="w-full text-left px-4 py-2 font-semibold truncate cursor-pointer border-0 bg-transparent hover:bg-transparent"
                                style={{ 
                                  fontSize: '16px',
                                  color: isSelected ? 'rgb(254, 78, 186)' : '#000000',
                                  textDecoration: isSelected ? 'underline' : 'none'
                                }}
                              >
                                {displayTitle}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                )}

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
                    <th className="px-4 py-3.5 w-12 text-center select-none" style={{ cursor: 'default', position: 'sticky', top: 0, backgroundColor: '#ffffff', zIndex: 10, borderBottom: '1px solid rgb(218, 218, 218)' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedIds.length === filteredFormations.length && filteredFormations.length > 0) {
                            setSelectedIds([]);
                          } else {
                            setSelectedIds(filteredFormations.map(f => f.id));
                          }
                        }}
                        id="select-all-radio-checkbox"
                        className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center focus:outline-hidden focus:ring-2 focus:ring-[#fe4eba]/20 cursor-pointer mx-auto ${
                          selectedIds.length === filteredFormations.length && filteredFormations.length > 0
                            ? 'border-[#fe4eba] bg-transparent'
                            : 'border-slate-400 bg-white hover:border-[#fe4eba]'
                        }`}
                        style={{ borderWidth: '2.5px' }}
                        role="checkbox"
                        aria-checked={selectedIds.length === filteredFormations.length && filteredFormations.length > 0}
                      >
                        {selectedIds.length === filteredFormations.length && filteredFormations.length > 0 && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Formation.</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Date & Créneau.</th>
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
                      <td colSpan={8} className="p-16 text-center font-sans lg:py-24" style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
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
                      const formattedDate = f.date && f.creneau 
                        ? `${f.date} ${f.creneau}` 
                        : (f.dateHeure ? f.dateHeure.replace('T', ' ') : '-');
                      const isRowSelected = selectedIds.includes(f.id);

                      return (
                        <tr
                          key={f.id}
                          onClick={() => startEditFormation(f)}
                          className={`group hover:bg-[#ffecf8] transition-all cursor-pointer ${
                            isRowSelected ? 'bg-[#ffecf8]/60' : ''
                          }`}
                        >
                          <td className="px-4 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isRowSelected) {
                                  setSelectedIds(selectedIds.filter(id => id !== f.id));
                                } else {
                                  setSelectedIds([...selectedIds, f.id]);
                                }
                              }}
                              id={`radio-checkbox-row-${f.id}`}
                              className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center focus:outline-hidden focus:ring-2 focus:ring-[#fe4eba]/20 cursor-pointer mx-auto ${
                                isRowSelected
                                  ? 'border-[#fe4eba] bg-transparent'
                                  : 'border-slate-400 bg-white hover:border-[#fe4eba]'
                              }`}
                              style={{ borderWidth: '2.5px' }}
                              role="checkbox"
                              aria-checked={isRowSelected}
                            >
                              {isRowSelected && (
                                <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] transition-all scale-100" />
                              )}
                            </button>
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
        <div
          className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto min-h-screen pt-0 pb-4"
          id="formation-form-overlay"
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
            id="formation-form-header-box"
            onClick={(e) => e.stopPropagation()}
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

          <div
            className="w-full animate-fadeIn mt-6"
            style={{ marginTop: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
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
                            className="font-bold cursor-pointer"
                            style={{ border: 'none', background: 'none', color: 'oklch(54.6% .245 262.881)', fontSize: '16px' }}
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
                          <option key={v.id} value={v.nom}>
                            {v.nom}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date */}
                    <div className="space-y-1">
                      <label htmlFor="form-date" className="block mb-1">Date.</label>
                      <input
                        type="date"
                        id="form-date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full"
                        required
                      />
                    </div>

                    {/* Créneau */}
                    <div className="space-y-1">
                      <label htmlFor="form-creneau" className="block mb-1">Créneau.</label>
                      <select
                        id="form-creneau"
                        value={creneau}
                        onChange={(e) => setCreneau(e.target.value)}
                        className="w-full"
                      >
                        <option value="">-- Non défini --</option>
                        {CRENEAU_OPTIONS.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </select>
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
                        {members
                          .filter((m) => m.role?.toLowerCase() === 'technicien')
                          .map((m, idx) => {
                            const val = m.id || m.email || m.name || `m_${idx}`;
                            const name = (m.name || `${m.firstname || ''} ${m.lastname || ''}`).trim() || m.email;
                            return (
                              <option key={val} value={val}>
                                {name}
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    {/* Statut (Radio) */}
                    <div className="space-y-1">
                      <label className="block mb-2">Statut.</label>
                      <div className="flex items-center gap-6 py-2">
                        <button
                          type="button"
                          onClick={() => setStatut('Brouillon')}
                          className="inline-flex items-center cursor-pointer gap-2 select-none"
                          style={{ fontSize: '16px', color: '#000' }}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${statut === 'Brouillon' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                            {statut === 'Brouillon' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                          </span>
                          Brouillon
                        </button>

                        <button
                          type="button"
                          onClick={() => setStatut('Terminé')}
                          className="inline-flex items-center cursor-pointer gap-2 select-none"
                          style={{ fontSize: '16px', color: '#000' }}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${statut === 'Terminé' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                            {statut === 'Terminé' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                          </span>
                          Terminé
                        </button>
                      </div>
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

                  {/* Raison/Prestation. (Stand-alone multi-selection with capsules on the right) */}
                  <div className="pt-2 space-y-1.5 relative font-sans w-full bg-transparent">
                    <label className="block mb-1" style={{ fontSize: "16px", color: "#000000", fontWeight: 500 }}>
                      Raison/Prestation.
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full items-center bg-transparent">
                      {/* Dropdown Select on the left */}
                      <div className="md:col-span-1 w-full bg-transparent">
                        <select
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              if (!reasons.includes(val)) {
                                setReasons([...reasons, val]);
                              }
                              e.target.value = "";
                            }
                          }}
                          className="w-full"
                        >
                          <option value="">-- Sélectionner une raison / prestation --</option>
                          {variables
                            .filter((v) => v.category === 'Modèle Raison Prestation')
                            .map((v) => {
                              const isSelected = reasons.includes(v.nom);
                              return (
                                <option key={v.id} value={v.nom} disabled={isSelected}>
                                  {v.nom} {isSelected ? '(Déjà ajoutée)' : ''}
                                </option>
                              );
                            })}
                        </select>
                      </div>

                      {/* Selected Reasons Capsules listed on the right */}
                      <div className="md:col-span-3 w-full bg-transparent">
                        <div className="flex flex-wrap gap-1.5 min-h-[42px] items-center bg-transparent">
                          {reasons.length > 0 ? (
                            reasons.map((reasonStr) => (
                              <span
                                key={reasonStr}
                                onClick={() => setReasons(reasons.filter((r) => r !== reasonStr))}
                                style={{
                                  fontFamily: 'DefibeoMain, Civilprom, sans-serif',
                                }}
                                className="cursor-pointer inline-flex items-center rounded-full bg-white border border-slate-200 text-slate-800 text-[15px] px-3.5 py-1.5 font-medium hover:bg-[#8e1010] hover:border-[#8e1010] hover:text-white transition-all duration-150 select-none"
                                title="Cliquez pour supprimer"
                              >
                                {reasonStr}
                              </span>
                            ))
                          ) : null}
                        </div>
                      </div>
                    </div>
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
