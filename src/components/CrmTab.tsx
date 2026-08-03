import React, { useState } from 'react';
import { SupportTicket, Member, Client, CompanyInfo } from '../types';

interface CrmTabProps {
  tickets: SupportTicket[];
  members: Member[];
  clients: Client[];
  companyInfo: CompanyInfo;
  onSaveTickets: (updated: SupportTicket[]) => void;
  t: (key: string) => string;
}

export const CrmTab: React.FC<CrmTabProps> = ({
  tickets,
  members,
  clients,
  companyInfo,
  onSaveTickets,
  t
}) => {
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'Tous' | 'Nouveau' | 'En cours' | 'Terminé'>('Tous');
  
  // Side-pane drawer state
  const [isPaneOpen, setIsPaneOpen] = useState(false);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);

  // Form State
  const [formRef, setFormRef] = useState('');
  const [formCategorie, setFormCategorie] = useState<'Technique' | 'Commercial' | 'Réclamation' | 'Sans Catégorie'>('Sans Catégorie');
  const [formSituation, setFormSituation] = useState<'Nouveau' | 'En cours' | 'Terminé'>('Nouveau');
  const [formCriticite, setFormCriticite] = useState<'Urgent' | 'Semaine prochaine' | 'Ce mois' | 'Mois prochain' | 'Non renseigné'>('Non renseigné');
  const [formOuverture, setFormOuverture] = useState('');
  const [formDerActual, setFormDerActual] = useState('');
  const [formObjet, setFormObjet] = useState('');
  const [formCollaborateur, setFormCollaborateur] = useState('');
  const [formClientSelect, setFormClientSelect] = useState('Autre');
  const [formCustomClientName, setFormCustomClientName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const getTodayFormatted = (): string => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const generateNextReference = (): string => {
    const envCode = (typeof window !== 'undefined' ? localStorage.getItem('defib_short_env_id') : null) || 'D18';
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);

    let maxNum = tickets.length;
    tickets.forEach((t) => {
      const ref = t.reference || t.id;
      if (ref) {
        const match = ref.match(/^(\d{1,5})/);
        if (match) {
          const parsed = parseInt(match[1], 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    });

    const nextIndex = maxNum + 1;
    const numPadded = String(nextIndex).padStart(5, '0');
    return `${numPadded}-${envCode}-${mm}${yy}`;
  };

  const openNewTicketPane = () => {
    setEditingTicketId(null);
    const newRef = generateNextReference();
    const today = getTodayFormatted();
    setFormRef(newRef);
    setFormCategorie('Sans Catégorie');
    setFormSituation('Nouveau');
    setFormCriticite('Non renseigné');
    setFormOuverture(today);
    setFormDerActual(today);
    setFormObjet('');
    setFormCollaborateur(members.length > 0 ? members[0].name : 'Non attribué');
    setFormClientSelect('Autre');
    setFormCustomClientName('');
    setFormDescription('');
    setIsPaneOpen(true);
  };

  const openEditTicketPane = (ticket: SupportTicket) => {
    setEditingTicketId(ticket.id);
    setFormRef(ticket.reference || ticket.id);
    setFormCategorie((ticket.categorie as any) || 'Sans Catégorie');
    
    // Normalize situation
    let sit: 'Nouveau' | 'En cours' | 'Terminé' = 'Nouveau';
    const sVal = ticket.situation || ticket.status;
    if (sVal === 'En cours') sit = 'En cours';
    else if (sVal === 'Terminé' || sVal === 'Résolu') sit = 'Terminé';
    setFormSituation(sit);

    setFormCriticite((ticket.criticite as any) || 'Non renseigné');
    setFormOuverture(ticket.dateOuverture || ticket.date || getTodayFormatted());
    setFormDerActual(ticket.dateDerniereActualisation || ticket.dateOuverture || ticket.date || getTodayFormatted());
    setFormObjet(ticket.objet || '');
    setFormCollaborateur(ticket.collaborateur || (members.length > 0 ? members[0].name : 'Non attribué'));

    // Handle Client selection vs Autre
    const currentClientVal = ticket.client || ticket.email || '';
    const foundClient = clients.find(c => (c.denomination || (c as any).name || '') === currentClientVal);
    if (foundClient) {
      setFormClientSelect(currentClientVal);
      setFormCustomClientName('');
    } else if (currentClientVal) {
      setFormClientSelect('Autre');
      setFormCustomClientName(ticket.customClientName || currentClientVal);
    } else {
      setFormClientSelect('Autre');
      setFormCustomClientName('');
    }

    setFormDescription(ticket.description || ticket.message || '');
    setIsPaneOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const today = getTodayFormatted();
    const resolvedClientName = formClientSelect === 'Autre' 
      ? (formCustomClientName.trim() || 'Client Autre')
      : formClientSelect;

    if (editingTicketId) {
      // Update existing ticket
      const updatedList = tickets.map((t) => {
        if (t.id === editingTicketId) {
          return {
            ...t,
            reference: formRef,
            categorie: formCategorie,
            situation: formSituation,
            status: formSituation === 'Terminé' ? 'Résolu' : formSituation,
            criticite: formCriticite,
            dateOuverture: formOuverture || today,
            dateDerniereActualisation: today,
            objet: formObjet.trim().slice(0, 55),
            collaborateur: formCollaborateur,
            client: resolvedClientName,
            isCustomClient: formClientSelect === 'Autre',
            customClientName: formClientSelect === 'Autre' ? formCustomClientName : '',
            description: formDescription,
            message: formDescription,
          };
        }
        return t;
      });
      onSaveTickets(updatedList);
    } else {
      // Create new ticket
      const newTicket: SupportTicket = {
        id: formRef,
        reference: formRef,
        identifiant: formRef,
        categorie: formCategorie,
        situation: formSituation,
        status: formSituation === 'Terminé' ? 'Résolu' : formSituation,
        criticite: formCriticite,
        dateOuverture: formOuverture || today,
        dateDerniereActualisation: today,
        objet: formObjet.trim().slice(0, 55) || 'Sans objet',
        collaborateur: formCollaborateur,
        client: resolvedClientName,
        isCustomClient: formClientSelect === 'Autre',
        customClientName: formClientSelect === 'Autre' ? formCustomClientName : '',
        description: formDescription,
        message: formDescription,
        email: resolvedClientName,
        phone: '',
        date: formOuverture || today,
      };
      onSaveTickets([newTicket, ...tickets]);
    }

    setIsPaneOpen(false);
  };

  const handleQuickTerminate = (ticketId: string) => {
    const today = getTodayFormatted();
    const updated = tickets.map((t) => {
      if (t.id === ticketId) {
        return {
          ...t,
          situation: 'Terminé' as const,
          status: 'Résolu' as const,
          dateDerniereActualisation: today,
        };
      }
      return t;
    });
    onSaveTickets(updated);
  };

  const handleDeleteTicket = (ticketId: string) => {
    const updated = tickets.filter((t) => t.id !== ticketId);
    onSaveTickets(updated);
  };

  // Filtered tickets list
  const filteredTickets = tickets.filter((t) => {
    const sit = t.situation || (t.status === 'Résolu' ? 'Terminé' : t.status) || 'Nouveau';
    const matchesFilter = ticketStatusFilter === 'Tous' || sit === ticketStatusFilter;

    const q = ticketSearch.toLowerCase().trim();
    if (!q) return matchesFilter;

    const ref = (t.reference || t.id || '').toLowerCase();
    const obj = (t.objet || '').toLowerCase();
    const cli = (t.client || t.email || '').toLowerCase();
    const col = (t.collaborateur || '').toLowerCase();
    const cat = (t.categorie || '').toLowerCase();
    const desc = (t.description || t.message || '').toLowerCase();

    const matchesQuery = ref.includes(q) || obj.includes(q) || cli.includes(q) || col.includes(q) || cat.includes(q) || desc.includes(q);
    return matchesFilter && matchesQuery;
  });

  const countNew = tickets.filter(t => (t.situation || t.status) === 'Nouveau').length;
  const countProgress = tickets.filter(t => (t.situation || t.status) === 'En cours').length;
  const countTermine = tickets.filter(t => (t.situation || t.status) === 'Terminé' || t.status === 'Résolu').length;

  const customButtonStyle: React.CSSProperties = {
    backgroundColor: '#3556ec',
    color: '#ffffff',
    borderRadius: '13px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: 'normal',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.15s ease',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 600,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
    fontSize: '15px',
  };

  const geluleStyle: React.CSSProperties = {
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
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    cursor: 'default',
  };

  const cellTextStyle: React.CSSProperties = {
    color: '#000000',
    fontSize: '16px',
    fontWeight: 400,
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    cursor: 'default',
  };

  const rowActionButtonStyle: React.CSSProperties = {
    backgroundColor: '#000000',
    color: '#ffffff',
    borderRadius: '13px',
    fontSize: '18px',
    fontWeight: 'normal',
    padding: '8px 18px',
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
  };

  const selectStyle: React.CSSProperties = {
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundImage: 'none',
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="crm-tab-container">
      <style>{`
        #crm-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-crm-input),
        #crm-tab-container select,
        #crm-tab-container textarea {
          padding: 10px 12px !important;
          border: 1px solid #c9bfcd !important;
          border-radius: 13px !important;
          font-size: 16px !important;
          font-weight: 400 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
          width: 100% !important;
        }
        #crm-tab-container select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #crm-tab-container input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-crm-input),
        #crm-tab-container input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-crm-input),
        #crm-tab-container select:hover:not(:disabled),
        #crm-tab-container select:focus:not(:disabled),
        #crm-tab-container textarea:hover:not(:disabled),
        #crm-tab-container textarea:focus:not(:disabled),
        #crm-tab-container #search-crm-input:hover,
        #crm-tab-container #search-crm-input:focus {
          outline: 2px solid #3556ec !important;
          outline-offset: 1px !important;
        }
        #crm-tab-container input:disabled,
        #crm-tab-container select:disabled {
          background-color: #e2d9e6 !important;
          color: #000000 !important;
          cursor: not-allowed !important;
          opacity: 0.9 !important;
        }
        #crm-tab-container label {
          font-size: 18px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          margin-bottom: 4px !important;
          display: block !important;
        }
      `}</style>

      {/* Header section with Title and Action buttons */}
      <div 
        className="bg-white space-y-4"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi" style={{ color: '#000000', cursor: 'default' }} id="crm-tab-title">
              Dossiers & Tickets
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <input
              type="text"
              id="search-crm-input"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder="Recherche."
              style={{
                border: '1px solid #dedede',
                borderRadius: '13px',
                padding: '9px 19px',
                fontSize: '18px',
                fontWeight: '100',
                color: '#000000',
                backgroundColor: '#ffffff',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                outline: 'none',
                width: '260px',
              }}
            />

            {/* Nouveau Dossier/Ticket Button */}
            <button
              type="button"
              onClick={openNewTicketPane}
              id="btn-new-ticket"
              style={customButtonStyle}
              className="hover:bg-[#2b48cc] transition-colors"
            >
              Nouveau Dossier/Ticket
            </button>
          </div>
        </div>
      </div>

      {/* Status Filter Pills */}
      <div className="px-4 flex flex-wrap gap-2.5 justify-center sm:justify-start mt-6 mb-4" id="crm-status-pills">
        {(['Tous', 'Nouveau', 'En cours', 'Terminé'] as const).map((filterOpt) => {
          const isSelected = ticketStatusFilter === filterOpt;
          return (
            <button
              key={filterOpt}
              type="button"
              onClick={() => setTicketStatusFilter(filterOpt)}
              style={{
                borderRadius: '1000px',
                padding: '8px 18px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                backgroundColor: isSelected ? '#3556ec' : '#ffffff',
                color: isSelected ? '#ffffff' : '#000000',
                border: isSelected ? '1px solid #3556ec' : '1px solid rgb(218, 218, 218)',
                transition: 'all 0.15s ease'
              }}
            >
              {filterOpt}
              {filterOpt === 'Tous' && ` (${tickets.length})`}
              {filterOpt === 'Nouveau' && ` (${countNew})`}
              {filterOpt === 'En cours' && ` (${countProgress})`}
              {filterOpt === 'Terminé' && ` (${countTermine})`}
            </button>
          );
        })}
      </div>

      {/* Main Table */}
      <div className="bg-white overflow-hidden mt-4" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filteredTickets.length === 0 ? (
            <div className="p-16 text-center font-sans lg:py-24" id="no-crm-view">
              <p style={{ color: '#000000', fontSize: '18px', fontWeight: 400, cursor: 'default' }}>
                Aucun résultat.
              </p>
            </div>
          ) : (
            <table className="w-full text-left font-sans border-collapse text-sm" id="crm-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3.5" style={thStyle}>Référence.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Criticité.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Catégorie.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Situation.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Ouverture.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Der.Actual.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Objet.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Collaborateur.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Client.</th>
                  <th className="px-4 py-3.5 text-right" style={thStyle}>Actions.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.map((t) => {
                  const refVal = t.reference || t.id;
                  const critVal = t.criticite || 'Non renseigné';
                  const catVal = t.categorie || 'Sans Catégorie';
                  const sitVal = t.situation || (t.status === 'Résolu' ? 'Terminé' : t.status) || 'Nouveau';
                  const ouvVal = t.dateOuverture || t.date || '—';
                  const derVal = t.dateDerniereActualisation || t.dateOuverture || t.date || '—';
                  const rawObjet = t.objet || '';
                  const truncatedObjet = rawObjet.length > 40 ? rawObjet.substring(0, 40) + '...' : rawObjet;
                  const colVal = t.collaborateur || 'Non attribué';
                  const cliVal = t.client || t.email || 'Autre';

                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      {/* Référence. (in gelule) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span style={geluleStyle}>
                          {refVal}
                        </span>
                      </td>

                      {/* Criticité. (in gelule) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span style={geluleStyle}>
                          {critVal}
                        </span>
                      </td>

                      {/* Catégorie. */}
                      <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                        {catVal}
                      </td>

                      {/* Situation. (in gelule) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span style={geluleStyle}>
                          {sitVal}
                        </span>
                      </td>

                      {/* Ouverture. */}
                      <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                        {ouvVal}
                      </td>

                      {/* Der.Actual. */}
                      <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                        {derVal}
                      </td>

                      {/* Objet. (max 40 chars) */}
                      <td className="px-4 py-4 whitespace-nowrap max-w-[220px] truncate" style={cellTextStyle} title={rawObjet}>
                        {truncatedObjet}
                      </td>

                      {/* Collaborateur. */}
                      <td className="px-4 py-4 whitespace-nowrap" style={cellTextStyle}>
                        {colVal}
                      </td>

                      {/* Client. (in gelule) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span style={geluleStyle}>
                          {cliVal}
                        </span>
                      </td>

                      {/* Actions. */}
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditTicketPane(t)}
                            style={rowActionButtonStyle}
                            className="hover:bg-zinc-800 transition-colors"
                          >
                            Gérer
                          </button>
                          {sitVal !== 'Terminé' && (
                            <button
                              type="button"
                              onClick={() => handleQuickTerminate(t.id)}
                              style={rowActionButtonStyle}
                              className="hover:bg-zinc-800 transition-colors"
                            >
                              Terminer
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteTicket(t.id)}
                            style={rowActionButtonStyle}
                            className="hover:bg-zinc-800 transition-colors"
                          >
                            Supprimer
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

      {/* SIDE PANE DRAWER (MODAL / SLIDE-OVER) */}
      {isPaneOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Overlay backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setIsPaneOpen(false)}
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md sm:max-w-xl bg-white shadow-2xl flex flex-col p-6 overflow-y-auto">
              
              {/* Form */}
              <form onSubmit={handleSaveForm} className="space-y-5 flex-1 pt-2">
                
                {/* 1. Référence */}
                <div>
                  <label>Référence.</label>
                  <input
                    type="text"
                    value={formRef}
                    disabled
                    readOnly
                  />
                </div>

                {/* 2. Sélection Catégorie */}
                <div>
                  <label>Sélection Catégorie.</label>
                  <select
                    value={formCategorie}
                    onChange={(e: any) => setFormCategorie(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="Technique">Technique</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Réclamation">Réclamation</option>
                    <option value="Sans Catégorie">Sans Catégorie</option>
                  </select>
                </div>

                {/* 3. Situation */}
                <div>
                  <label>Situation.</label>
                  <select
                    value={formSituation}
                    onChange={(e: any) => setFormSituation(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="Nouveau">Nouveau</option>
                    <option value="En cours">En cours</option>
                    <option value="Terminé">Terminé</option>
                  </select>
                </div>

                {/* 4. Criticité */}
                <div>
                  <label>Criticité.</label>
                  <select
                    value={formCriticite}
                    onChange={(e: any) => setFormCriticite(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="Semaine prochaine">Semaine prochaine</option>
                    <option value="Ce mois">Ce mois</option>
                    <option value="Mois prochain">Mois prochain</option>
                    <option value="Non renseigné">Non renseigné</option>
                  </select>
                </div>

                {/* 5. Ouverture */}
                <div>
                  <label>Ouverture.</label>
                  <input
                    type="text"
                    value={formOuverture}
                    disabled
                    readOnly
                  />
                </div>

                {/* 6. Dernière actualisation */}
                <div>
                  <label>Dernière actualisation.</label>
                  <input
                    type="text"
                    value={formDerActual}
                    disabled
                    readOnly
                  />
                </div>

                {/* 7. Objet */}
                <div>
                  <label>Objet.</label>
                  <input
                    type="text"
                    maxLength={55}
                    placeholder="Entrez un objet (max 55 caractères)"
                    value={formObjet}
                    onChange={(e) => setFormObjet(e.target.value)}
                    required
                  />
                  <div className="text-right text-xs text-slate-500 mt-1">
                    {formObjet.length}/55
                  </div>
                </div>

                {/* 8. Collaborateur */}
                <div>
                  <label>Collaborateur.</label>
                  <select
                    value={formCollaborateur}
                    onChange={(e) => setFormCollaborateur(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="Non attribué">Non attribué</option>
                    {members.map((m) => (
                      <option key={m.id || m.email || m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 9. Client */}
                <div>
                  <label>Client.</label>
                  <select
                    value={formClientSelect}
                    onChange={(e) => setFormClientSelect(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="Autre">Autre</option>
                    {clients.map((c) => {
                      const cName = c.denomination || (c as any).name || c.id || 'Client';
                      return (
                        <option key={c.id || cName} value={cName}>
                          {cName}
                        </option>
                      );
                    })}
                  </select>

                  {/* Manual input if "Autre" is selected */}
                  {formClientSelect === 'Autre' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        placeholder="Entrez le nom du client"
                        value={formCustomClientName}
                        onChange={(e) => setFormCustomClientName(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* 10. Description */}
                <div>
                  <label>Description.</label>
                  <textarea
                    rows={4}
                    placeholder="Entrez une description détaillée..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>

                {/* Buttons */}
                <div className="pt-4 space-y-2">
                  <button
                    type="submit"
                    style={{
                      backgroundColor: '#3556ec',
                      color: '#ffffff',
                      borderRadius: '13px',
                      padding: '14px',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      border: 'none',
                      width: '100%',
                      cursor: 'pointer',
                    }}
                    className="hover:bg-[#2b48cc] transition-colors"
                  >
                    Enregistrer
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPaneOpen(false)}
                    style={{
                      backgroundColor: '#000000',
                      color: '#ffffff',
                      borderRadius: '13px',
                      padding: '14px',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      border: 'none',
                      width: '100%',
                      cursor: 'pointer',
                    }}
                    className="hover:bg-zinc-800 transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
