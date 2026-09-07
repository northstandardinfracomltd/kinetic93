import React, { useState, useRef, useEffect } from 'react';
import { SupportTicket, Member, Client, CompanyInfo } from '../types';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { ChevronDown, X } from 'lucide-react';

export const CRITICITE_OPTIONS: Array<{
  value: 'Urgent' | 'Semaine prochaine' | 'Ce mois' | 'Mois prochain' | 'Non renseigné';
  label: string;
  color: string;
}> = [
  { value: 'Urgent', label: 'Urgent', color: '#ce293e' },
  { value: 'Semaine prochaine', label: 'Semaine prochaine', color: '#de5815' },
  { value: 'Ce mois', label: 'Ce mois', color: '#8944af' },
  { value: 'Mois prochain', label: 'Mois prochain', color: '#235dbe' },
  { value: 'Non renseigné', label: 'Non renseigné', color: '#38917a' },
];

export const getCriticiteColor = (crit: string): string => {
  switch (crit) {
    case 'Urgent':
      return '#ce293e';
    case 'Semaine prochaine':
      return '#de5815';
    case 'Ce mois':
      return '#8944af';
    case 'Mois prochain':
      return '#235dbe';
    case 'Non renseigné':
    default:
      return '#38917a';
  }
};

interface CrmTabProps {
  tickets: SupportTicket[];
  members: Member[];
  clients: Client[];
  companyInfo: CompanyInfo;
  tenantId?: string;
  onSaveTickets: (updated: SupportTicket[]) => void;
  t: (key: string) => string;
}

export const CrmTab: React.FC<CrmTabProps> = ({
  tickets,
  members,
  clients,
  companyInfo,
  tenantId,
  onSaveTickets,
  t
}) => {
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'Tous' | 'Nouveau' | 'En cours' | 'Terminé'>('Tous');
  
  // Side-pane drawer state
  const [isPaneOpen, setIsPaneOpen] = useState(false);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [isSettingsPaneOpen, setIsSettingsPaneOpen] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

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

  // Criticite dropdown custom control state & refs
  const [isCriticiteDropdownOpen, setIsCriticiteDropdownOpen] = useState(false);
  const [isCriticiteHovered, setIsCriticiteHovered] = useState(false);
  const criticiteDropdownRef = useRef<HTMLDivElement>(null);

  // Auto-expand vertical textarea ref for Description
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle click outside for criticite dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        criticiteDropdownRef.current &&
        !criticiteDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCriticiteDropdownOpen(false);
      }
    };

    if (isCriticiteDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCriticiteDropdownOpen]);

  // Auto-expand vertical height of Description textarea
  useEffect(() => {
    if (isPaneOpen && descriptionTextareaRef.current) {
      requestAnimationFrame(() => {
        if (descriptionTextareaRef.current) {
          descriptionTextareaRef.current.style.height = 'auto';
          descriptionTextareaRef.current.style.height = `${Math.max(descriptionTextareaRef.current.scrollHeight, 100)}px`;
        }
      });
    }
  }, [formDescription, isPaneOpen]);

  const activeTenant = tenantId || (typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') : null) || 'demo';

  const getTodayFormatted = (): string => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const generateNextReference = (): string => {
    let envCode = (typeof window !== 'undefined' ? localStorage.getItem('defib_short_env_id') : null);
    if (!envCode) {
      if (activeTenant && activeTenant !== 'demo') {
        envCode = activeTenant.toUpperCase().startsWith('D') ? activeTenant.toUpperCase() : `D${activeTenant.toUpperCase()}`;
      } else {
        envCode = 'D18';
      }
    }
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
            envId: t.envId || activeTenant,
            tenantId: t.tenantId || activeTenant,
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
        envId: activeTenant,
        tenantId: activeTenant,
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
    backgroundColor: 'rgb(53, 86, 236)',
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
    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
    transition: 'background-color 0.15s ease',
  };

  const blackButtonStyle: React.CSSProperties = {
    backgroundColor: '#000000',
    color: '#ffffff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '13px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: 'normal',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0s ease-in-out',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
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
    fontSize: '18px',
  };

  const companyDisplayName = companyInfo?.name || companyInfo?.nomLogiciel || 'Votre Entreprise';
  const embedCode = `<!-- Formulaire de contact Défibeo pour ${companyDisplayName} -->
<div class="defibeo-contact-wrapper" id="defibeo-contact-box" style="max-width: 500px; margin: 20px auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); text-align: left; box-sizing: border-box;">
  <style>
    @font-face {
      font-family: 'Civilprom';
      src: url('https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf') format('opentype');
    }
    #defibeo-contact-box, #defibeo-contact-box * {
      font-family: 'Civilprom', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    #defibeo-contact-box input::placeholder, #defibeo-contact-box textarea::placeholder {
      color: #000000 !important;
      opacity: 0.6;
      font-size: 16px !important;
    }
  </style>

  <h2 style="font-size: 18px; color: #000000; margin-top: 0; margin-bottom: 8px; text-align: left; font-weight: normal;">Envoyer un message à ${companyDisplayName}</h2>
  <p style="font-size: 16px; color: #000000; margin-bottom: 24px; text-align: left; line-height: 1.5;">Vous avez une question ou besoin d'assistance ? Remplissez ce formulaire pour nous contacter.</p>
  
  <form id="defibeo-contact-form" style="display: flex; flex-direction: column; gap: 16px;">
    <input type="hidden" name="tenantId" value="${activeTenant}" />
    
    <div>
      <label style="display: block; font-size: 16px; color: #000000; margin-bottom: 6px;">Adresse Email</label>
      <input type="email" name="email" required style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 13px; font-size: 16px; color: #000000; box-sizing: border-box; outline: none; transition: border-color 0.2s;" placeholder="votre@email.com" />
    </div>
    
    <div>
      <label style="display: block; font-size: 16px; color: #000000; margin-bottom: 6px;">Message</label>
      <textarea name="message" required rows="4" style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 13px; font-size: 16px; color: #000000; box-sizing: border-box; outline: none; transition: border-color 0.2s; resize: vertical;" placeholder="Entrez votre message, veuillez détailler votre demande et mentionner votre nom et votre entreprise."></textarea>
    </div>
    
    <button type="submit" id="defibeo-submit-btn" style="background-color: #3556ec; color: #ffffff; padding: 14px 20px; border: none; border-radius: 13px; font-size: 16px; font-weight: normal; cursor: pointer; transition: background-color 0.2s; display: block; width: 100%; text-align: center; margin-top: 8px;">Envoyer</button>
    
    <div id="defibeo-response-msg" style="display: none; font-size: 14px; text-align: left; margin-top: 10px;"></div>
  </form>

  <script>
    (function() {
      var form = document.getElementById('defibeo-contact-form');
      if (!form) return;
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var btn = document.getElementById('defibeo-submit-btn');
        var msgDiv = document.getElementById('defibeo-response-msg');
        
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.innerText = 'Envoi en cours...';
        
        var tenantId = form.querySelector('[name="tenantId"]').value;
        var email = form.querySelector('[name="email"]').value;
        var message = form.querySelector('[name="message"]').value;
        
        var params = new URLSearchParams();
        params.append('tenantId', tenantId);
        params.append('email', email);
        params.append('message', message);
        
        fetch('${typeof window !== 'undefined' ? window.location.origin : ''}/api/crm/embed-lead', {
          method: 'POST',
          headers: {
            'Accept': 'application/json'
          },
          body: params
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerText = 'Envoyer';
          msgDiv.style.display = 'block';
          msgDiv.style.padding = '0';
          msgDiv.style.border = 'none';
          msgDiv.style.background = 'none';
          
          if (data.success) {
            msgDiv.style.color = '#16a34a';
            msgDiv.innerText = '✓ Message envoyé avec succès. Merci !';
            form.reset();
          } else {
            msgDiv.style.color = '#dc2626';
            msgDiv.innerText = 'Erreur : ' + (data.error || 'Une erreur est survenue.');
          }
        })
        .catch(function(err) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerText = 'Envoyer';
          msgDiv.style.display = 'block';
          msgDiv.style.padding = '0';
          msgDiv.style.border = 'none';
          msgDiv.style.background = 'none';
          msgDiv.style.color = '#dc2626';
          msgDiv.innerText = 'Erreur de connexion.';
        });
      });
    })();
  </script>
</div>`;

  return (
    <div className="space-y-6 animate-fadeIn" id="crm-tab-container">
      <style>{`
        #crm-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-crm-input),
        #crm-tab-container select,
        #crm-tab-container textarea:not(#crm-embed-textarea) {
          padding: 10px 12px !important;
          border: 1px solid #c9bfcd !important;
          border-radius: 13px !important;
          font-size: 18px !important;
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
        #crm-tab-container textarea:not(#crm-embed-textarea):hover:not(:disabled),
        #crm-tab-container textarea:not(#crm-embed-textarea):focus:not(:disabled),
        #crm-tab-container #search-crm-input:hover,
        #crm-tab-container #search-crm-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
        }
        #crm-tab-container input:disabled,
        #crm-tab-container select:disabled {
          background-color: #f1f5f9 !important;
          color: #000000 !important;
          cursor: not-allowed !important;
          opacity: 1 !important;
          font-size: 18px !important;
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
            {/* Réglages CRM Button */}
            <button
              type="button"
              onClick={() => setIsSettingsPaneOpen(true)}
              id="btn-crm-settings"
              style={blackButtonStyle}
              className="hover:bg-zinc-800 transition-colors"
            >
              Réglages CRM
            </button>

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
                backgroundColor: isSelected ? '#000000' : '#ffffff',
                color: isSelected ? '#ffffff' : '#000000',
                border: isSelected ? '1px solid #000000' : '1px solid rgb(218, 218, 218)',
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
            <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
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
                        <span style={geluleStyle} className="inline-flex items-center gap-2">
                          <span>{critVal}</span>
                          <span
                            className="inline-block rounded-full shrink-0"
                            style={{
                              width: '8px',
                              height: '8px',
                              backgroundColor: getCriticiteColor(critVal),
                            }}
                          />
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
                
                {/* 1. Situation (Moved first, 3 cards in 33% 33% 33% with pink radio check) */}
                <div className="space-y-2">
                  <label>Situation.</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['Nouveau', 'En cours', 'Terminé'] as const).map((sit) => {
                      const isSelected = formSituation === sit;
                      return (
                        <div
                          key={sit}
                          onClick={() => setFormSituation(sit)}
                          className="flex items-center justify-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer select-none bg-white hover:border-slate-300 transition-colors"
                          id={`crm-situation-${sit.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <span 
                            className="rounded-full flex items-center justify-center transition-all bg-white shrink-0"
                            style={{
                              border: isSelected ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
                              width: '20px',
                              height: '20px',
                              minWidth: '20px',
                              minHeight: '20px',
                              backgroundColor: '#ffffff'
                            }}
                          >
                            {isSelected && (
                              <span className="rounded-full bg-[#fe4eba]" style={{ width: '9px', height: '9px' }} />
                            )}
                          </span>
                          <span className="text-[16px] font-medium text-slate-900 cursor-pointer select-none font-sans whitespace-nowrap">
                            {sit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Référence, Ouverture, Dernière actualisation (Side-by-side 33% 33% 33%, light-grey disabled, 18px font) */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label>Référence.</label>
                    <input
                      type="text"
                      value={formRef}
                      disabled
                      readOnly
                      style={{ fontSize: '18px', backgroundColor: '#f1f5f9', color: '#000000', cursor: 'not-allowed' }}
                    />
                  </div>

                  <div>
                    <label>Ouverture.</label>
                    <input
                      type="text"
                      value={formOuverture}
                      disabled
                      readOnly
                      style={{ fontSize: '18px', backgroundColor: '#f1f5f9', color: '#000000', cursor: 'not-allowed' }}
                    />
                  </div>

                  <div>
                    <label>Actualisation.</label>
                    <input
                      type="text"
                      value={formDerActual}
                      disabled
                      readOnly
                      style={{ fontSize: '18px', backgroundColor: '#f1f5f9', color: '#000000', cursor: 'not-allowed' }}
                    />
                  </div>
                </div>

                {/* 3. Catégorie & Criticité (Side-by-side 50% 50%) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label>Catégorie.</label>
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

                  <div className="relative" ref={criticiteDropdownRef}>
                    <label>Criticité.</label>
                    <button
                      type="button"
                      id="crm-form-criticite-button"
                      onClick={() => setIsCriticiteDropdownOpen(!isCriticiteDropdownOpen)}
                      onMouseEnter={() => setIsCriticiteHovered(true)}
                      onMouseLeave={() => setIsCriticiteHovered(false)}
                      className="w-full flex items-center justify-between cursor-pointer text-left"
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #c9bfcd',
                        borderRadius: '13px',
                        fontSize: '18px',
                        fontWeight: 400,
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        boxSizing: 'border-box',
                        outline: (isCriticiteHovered || isCriticiteDropdownOpen) ? '2.5px solid #fa53d5' : 'none',
                        outlineOffset: (isCriticiteHovered || isCriticiteDropdownOpen) ? '2px' : '0px',
                        transition: 'all 0s',
                        height: '49px',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span>{formCriticite}</span>
                        <span
                          className="inline-block rounded-full shrink-0"
                          style={{
                            width: '8px',
                            height: '8px',
                            backgroundColor: getCriticiteColor(formCriticite),
                          }}
                        />
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 transition-transform duration-150 shrink-0 ${
                          isCriticiteDropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Hidden native select for accessibility & form compatibility */}
                    <select
                      value={formCriticite}
                      onChange={(e: any) => setFormCriticite(e.target.value)}
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {CRITICITE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* Dropdown Menu */}
                    {isCriticiteDropdownOpen && (
                      <div
                        className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden py-1 animate-fadeIn"
                        style={{
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        }}
                      >
                        {CRITICITE_OPTIONS.map((opt) => {
                          const isSelected = formCriticite === opt.value;
                          return (
                            <div
                              key={opt.value}
                              onClick={() => {
                                setFormCriticite(opt.value);
                                setIsCriticiteDropdownOpen(false);
                              }}
                              className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[18px] text-black">{opt.label}</span>
                                <span
                                  className="inline-block rounded-full shrink-0"
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    backgroundColor: opt.color,
                                  }}
                                />
                              </div>
                              {isSelected && (
                                <span className="text-xs font-bold text-slate-400">✓</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Encart border light-grey, border-radius 13px, padding: Client / Objet / Description / Collaborateur */}
                <div 
                  className="space-y-4 p-4"
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '13px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {/* Client */}
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
                        const cEmail = c.email || c.emailSite || '';
                        const labelText = cEmail ? `${cName} (${cEmail})` : cName;
                        return (
                          <option key={c.id || cName} value={cName}>
                            {labelText}
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

                  {/* Objet */}
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
                    <div className="text-right text-xs text-slate-500 mt-1 font-sans">
                      {formObjet.length}/55
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label>Description.</label>
                    <textarea
                      ref={descriptionTextareaRef}
                      placeholder="Entrez une description détaillée..."
                      value={formDescription}
                      onChange={(e) => {
                        setFormDescription(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.max(e.target.scrollHeight, 100)}px`;
                      }}
                      style={{
                        resize: 'none',
                        overflow: 'hidden',
                        minHeight: '100px',
                      }}
                    />
                  </div>

                  {/* Collaborateur */}
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

      {/* CRM SETTINGS SIDE PANE DRAWER */}
      {isSettingsPaneOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="crm-settings-drawer-modal">
          {/* Overlay backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setIsSettingsPaneOpen(false)}
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md sm:max-w-xl bg-white shadow-2xl flex flex-col p-6 overflow-y-auto justify-between">
              <div>
                {/* Header with Title and Close button */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
                  <h2 className="text-2xl font-bold font-gochi text-black" id="crm-settings-pane-title">
                    Réglages CRM
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsSettingsPaneOpen(false)}
                    className="text-slate-400 hover:text-black transition-colors p-1 rounded-lg"
                    aria-label="Fermer"
                    id="btn-close-crm-settings-top"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Div Intégrez le formulaire de contact à votre site web */}
                  <div 
                    className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left"
                    id="crm-settings-section-embed-form"
                  >
                    <h3 className="text-xl font-bold font-gochi" style={{ color: '#000000', cursor: 'default' }}>
                      Intégrez le formulaire de contact à votre site web
                    </h3>
                    
                    <p className="text-[16px] text-black font-sans leading-relaxed">
                      Générez un formulaire de contact professionnel à intégrer sur votre site internet. Tous les messages envoyés depuis ce formulaire remonteront dans votre onglet CRM et vous recevrez un email de notification.
                    </p>

                    <div className="space-y-3 mt-3">
                      <textarea
                        id="crm-embed-textarea"
                        readOnly
                        value={embedCode}
                        style={{
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '11px',
                          padding: '12px',
                          borderRadius: '8px',
                          border: 'none',
                          resize: 'none',
                          height: '190px',
                          width: '100%',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                        className="select-all"
                      />
                      <button
                        type="button"
                        id="btn-copy-embed-code"
                        onClick={() => {
                          navigator.clipboard.writeText(embedCode);
                          setCopiedEmbed(true);
                          setTimeout(() => setCopiedEmbed(false), 2000);
                        }}
                        style={{
                          backgroundColor: '#000000',
                          color: '#ffffff',
                          fontSize: '18px',
                          fontWeight: 'normal',
                          borderRadius: '12px',
                          padding: '12px 24px',
                          border: 'none',
                          cursor: 'pointer',
                          width: '100%',
                          display: 'block',
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        }}
                        className="hover:opacity-90 active:scale-[0.99] transition-all font-sans"
                      >
                        {copiedEmbed ? "Copié !" : "Copier le code"}
                      </button>
                    </div>
                  </div>

                  {/* Div Recommandations */}
                  <div 
                    className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 text-left"
                    id="crm-settings-section-recommendations"
                  >
                    <h3 className="text-xl font-bold font-gochi" style={{ color: '#000000', cursor: 'default' }}>
                      Recommandations.
                    </h3>
                    <p className="text-[16px] text-black font-sans leading-relaxed">
                      Les clients existants peuvent envoyer leurs demandes directement depuis leur espace client. Nous vous recommandons de créer une page de contact sur votre site web et d’y intégrer le formulaire à l'aide du code prêt à coller ci-dessus. Les demandes envoyées via ce formulaire arriveront également automatiquement dans votre CRM.
                    </p>
                  </div>
                </div>
              </div>

              {/* Full-width Fermer button at bottom */}
              <div className="pt-6">
                <button
                  type="button"
                  id="btn-close-crm-settings-bottom"
                  onClick={() => setIsSettingsPaneOpen(false)}
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
                    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                  }}
                  className="hover:bg-zinc-800 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
