// Defibeo GMAO & Rapports Module
import React, { useState } from 'react';
import { Download, Search, Filter, X, Save } from 'lucide-react';
import { Client, Variable, Defibrillateur, Member, CompanyInfo, StockRecord, OtherEquipment } from '../types';
import HelpBubble from './HelpBubble';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import GmaoCorrectionForm from './GmaoCorrectionForm';
import GmaoOtherEquipmentCorrectionForm from './GmaoOtherEquipmentCorrectionForm';
import { generateReportModerationComment } from '../utils/moderationComment';
import { triggerEmail6RapportIntervention } from '../utils/emailService';

function getContrastingTextColor(hexColor?: string) {
  if (!hexColor) return '#000000';
  let hex = hexColor.trim().replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length !== 6) return '#000000';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 150) ? '#000000' : '#ffffff';
}

const formatDateTimeDisplay = (dStr: string, sStr: string) => {
  if (!dStr) return '';
  const parts = dStr.split('-');
  const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dStr;
  if (!sStr) return formattedDate;
  return `${formattedDate} (${sStr})`;
};

export interface GmaoTabProps {
  generatedReports: any[];
  setGeneratedReports: React.Dispatch<React.SetStateAction<any[]>>;
  saveReports: (reports: any[]) => void;
  clients: Client[];
  saveClients: (clients: Client[]) => void;
  defibrillateurs: Defibrillateur[];
  saveDefibs?: (defibs: Defibrillateur[]) => void;
  dropboxActive?: boolean;
  dropboxAccessToken?: string;
  otherEquipments: OtherEquipment[];
  saveOtherEquipments: (equipments: OtherEquipment[]) => void;
  stocks: StockRecord[];
  saveStocks: (stocks: StockRecord[]) => void;
  variables: Variable[];
  members: Member[];
  loggedUser: any;
  companyInfo: CompanyInfo;
  tenantId?: string;
  settings?: any;
  handleDownloadReport: (rep: any) => void;
  handleUpdateDefib?: (id: string, updates: any) => void;
  fsmTours?: any[];
  setActiveTab?: (tab: any) => void;
  t: (key: string) => string;
}

export const GmaoTab: React.FC<GmaoTabProps> = ({
  generatedReports,
  setGeneratedReports,
  saveReports,
  clients,
  saveClients,
  defibrillateurs,
  saveDefibs,
  dropboxActive = false,
  dropboxAccessToken = '',
  otherEquipments,
  saveOtherEquipments,
  stocks,
  saveStocks,
  variables,
  members,
  loggedUser,
  companyInfo,
  tenantId,
  settings,
  handleDownloadReport,
  handleUpdateDefib,
  fsmTours = [],
  setActiveTab,
  t
}) => {
  const [gmaoSearchQuery, setGmaoSearchQuery] = useState('');
  const [gmaoFilter, setGmaoFilter] = useState<'upcoming' | 'moderation' | 'validated'>('upcoming');
  const [managingReportId, setManagingReportId] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [isSpontaneousReportOpen, setIsSpontaneousReportOpen] = useState(false);
  const [selectedSpontaneousOtherEquipment, setSelectedSpontaneousOtherEquipment] = useState<any | null>(null);
  const [editReportForm, setEditReportForm] = useState<any | null>(null);
  const [dropboxError, setDropboxError] = useState<string | null>(null);

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

            const thStyle: React.CSSProperties = {
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              fontWeight: 100,
              letterSpacing: 'normal',
              textTransform: 'none',
              color: '#000000',
              cursor: 'default',
            };

            const isGmaoController = (() => {
              if (!loggedUser || !loggedUser.email) return true;
              const m = members.find(lm => lm.email?.toLowerCase().trim() === loggedUser.email.toLowerCase().trim());
              if (!m) return true;
              
              const isSuperAdmin = m.role === 'Super-Administrateur' || 
                                   m.role === 'Propriétaire / Admin' || 
                                   m.role?.toLowerCase().includes('super') || 
                                   m.role?.toLowerCase().includes('propriétaire');
              
              const isControllerSubRole = m.adminSubRole === 'Contrôleur' || 
                                          m.adminSubRole === 'Administrateur & Contrôleur';
                                          
              return !!(isSuperAdmin || isControllerSubRole);
            })();

            const filteredReports = generatedReports.filter((rep) => {
              const isFormation = 
                rep.equipmentType === 'Formation' ||
                rep.equipmentType?.toLowerCase()?.includes('formation') ||
                rep.defibSnapshot?.categorie === 'Formation' ||
                rep.defibSnapshot?.categorie?.toLowerCase()?.includes('formation') ||
                !!rep.formationId ||
                rep.defibIdentifiant === 'Formation';
              if (isFormation) return false;

              const isEffectue = 
                rep.missionStatus === 'Effectué' ||
                rep.conforme === 'Conforme' ||
                rep.conforme === 'Non Conforme' ||
                rep.conforme === 'Intervention impossible';

              const isUpcoming = !isEffectue && (rep.isUpcoming || rep.status === 'À venir' || rep.status === 'upcoming' || rep.upcoming || rep.isFuture);

              if (gmaoFilter === 'upcoming') {
                if (!isUpcoming) return false;
              } else if (gmaoFilter === 'validated') {
                if (!rep.validated) return false;
              } else if (gmaoFilter === 'moderation') {
                if (rep.validated || isUpcoming) return false;
              }

              const query = gmaoSearchQuery.toLowerCase().trim();
              if (!query) return true;
              
              const titleMatch = (rep.title || '').toLowerCase().includes(query);
              const identifiantMatch = (rep.defibIdentifiant || '').toLowerCase().includes(query);
              const serieMatch = (rep.defibSnapshot?.numeroSerie || '').toLowerCase().includes(query);
              const techMatch = (rep.techName || '').toLowerCase().includes(query);
              
              return titleMatch || identifiantMatch || serieMatch || techMatch;
            });

            return (
              <div className="space-y-6 animate-fadeIn" id="gmao-tab-container">
                <style>{`
                  #gmao-tab-container input:not([type="radio"]):not([type="checkbox"]):not(#search-gmao-input),
                  #gmao-tab-container select,
                  #gmao-tab-container textarea {
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
                  #gmao-tab-container input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-gmao-input),
                  #gmao-tab-container input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-gmao-input),
                  #gmao-tab-container select:hover:not(:disabled),
                  #gmao-tab-container select:focus:not(:disabled),
                  #gmao-tab-container textarea:hover:not(:disabled),
                  #gmao-tab-container textarea:focus:not(:disabled),
                  #gmao-tab-container #search-gmao-input:hover,
                  #gmao-tab-container #search-gmao-input:focus {
                    outline: 2.5px solid #fa53d5 !important;
                    outline-offset: 2px !important;
                    transition: all 0s !important;
                  }
                  #gmao-tab-container select {
                    appearance: none !important;
                    -webkit-appearance: none !important;
                    -moz-appearance: none !important;
                    background-image: none !important;
                  }
                  #gmao-tab-container select option {
                    color: #000000 !important;
                    background: #ffffff !important;
                    font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                  }
                  #gmao-tab-container input[type="date"]::-webkit-calendar-picker-indicator {
                    display: none !important;
                    -webkit-appearance: none !important;
                    background: none !important;
                    width: 0 !important;
                    height: 0 !important;
                  }
                  #gmao-tab-container label,
                  #gmao-tab-container .gmao-label-style {
                    letter-spacing: normal !important;
                    text-transform: none !important;
                    font-size: 16px !important;
                    color: #000000 !important;
                    font-weight: 600 !important;
                    font-family: "DefibeoMain", "Civilprom", sans-serif !important;
                  }
                  #gmao-tab-container select.padding-with-dot {
                    padding-left: 27px !important;
                  }
                  #gmao-tab-container input:disabled,
                  #gmao-tab-container select:disabled {
                    background-color: #f1f5f9 !important;
                    color: #555555 !important;
                    cursor: not-allowed !important;
                    opacity: 0.82 !important;
                  }
                `}</style>

                {/* Upper Action Block & Search metrics */}
                <div 
                  className="bg-white space-y-4"
                  style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight font-gochi" style={{ color: '#000000', cursor: 'default' }} id="gmao-tab-title">GMAO</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Field recherche (Search input) */}
                      <div className="relative w-full sm:w-64">
                        <input
                          type="text"
                          id="search-gmao-input"
                          value={gmaoSearchQuery}
                          onChange={(e) => setGmaoSearchQuery(e.target.value)}
                          placeholder="Recherche."
                          className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
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
                            transition: 'all 0s',
                          }}
                        />
                      </div>

                      {/* 3-item Segmented Toggle for 'À venir' / 'Modération' / 'Validés' */}
                      <div 
                        className="flex items-center p-1 bg-white select-none" 
                        style={{ 
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                          borderRadius: '15px',
                          border: '1px solid #dadada',
                          backgroundColor: '#ffffff',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setGmaoFilter('upcoming')}
                          style={{
                            fontSize: '18px',
                            borderRadius: '13px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: gmaoFilter === 'upcoming' ? '#fe4eba' : 'transparent',
                            color: gmaoFilter === 'upcoming' ? '#ffffff' : '#000000',
                            transition: 'none',
                          }}
                          className={`px-4 py-1.5 font-bold ${
                            gmaoFilter === 'upcoming' ? 'shadow-sm' : ''
                          }`}
                        >
                          {t("À venir")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setGmaoFilter('moderation')}
                          style={{
                            fontSize: '18px',
                            borderRadius: '13px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: gmaoFilter === 'moderation' ? '#fe4eba' : 'transparent',
                            color: gmaoFilter === 'moderation' ? '#ffffff' : '#000000',
                            transition: 'none',
                          }}
                          className={`px-4 py-1.5 font-bold ${
                            gmaoFilter === 'moderation' ? 'shadow-sm' : ''
                          }`}
                        >
                          {t("Modération")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setGmaoFilter('validated')}
                          style={{
                            fontSize: '18px',
                            borderRadius: '13px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: gmaoFilter === 'validated' ? '#fe4eba' : 'transparent',
                            color: gmaoFilter === 'validated' ? '#ffffff' : '#000000',
                            transition: 'none',
                          }}
                          className={`px-4 py-1.5 font-bold ${
                            gmaoFilter === 'validated' ? 'shadow-sm' : ''
                          }`}
                        >
                          {t("Validés")}
                        </button>
                      </div>


                      {/* Black button 'Rapport spontané' */}
                      <button
                        type="button"
                        id="btn-spontaneous-report-main"
                        onClick={() => {
                          setSelectedSpontaneousOtherEquipment(null);
                          setEditingReportId(null);
                          setEditReportForm(null);
                          setIsSpontaneousReportOpen(true);
                        }}
                        style={{
                          backgroundColor: '#000000',
                          color: '#ffffff',
                          fontSize: '18px',
                          padding: '9px 19px',
                          borderRadius: '13px',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                          fontWeight: 'bold',
                        }}
                        className="hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center font-bold"
                      >
                        {t("Rapport spontané")}
                      </button>
                      {/* No Actualiser button */}
                    </div>
                  </div>
                </div>

                <HelpBubble 
                  cacheKey="help_dismissed_gmao_options" 
                  imageSrc="https://civilprom.s3.eu-north-1.amazonaws.com/TERRA.svg"
                  imageAlt="Guide Rapports PDF"
                >
                  <p>
                    <strong>Aide concernant l’option Gérer :</strong> Pour chaque rapport, le bouton Gérer ouvre un volet latéral vous permettant de consulter le commentaire du technicien, de sélectionner un ou plusieurs drapeaux de signalement et de suivi, d’ajouter un commentaire interne et bien plus encore. En soi, il permet d’effectuer un traitement post-rapport directement depuis le logiciel principal. Le saviez-vous ? Les drapeaux sélectionnés s'affichent en début de ligne dans le tableau, selon la couleur configurée dans votre variable Drapeau GMAO.
                  </p>
                  <p>
                    <strong>Aide concernant l’option Corriger :</strong> Pour chaque rapport, le bouton Corriger ouvre un volet latéral permettant de modifier manuellement les informations renseignées par le technicien depuis le logiciel.
                  </p>
                  <p>
                    <strong>Aide concernant l’option Valider :</strong> Pour chaque rapport, le bouton Valider permet d'approuver définitivement le document complété par le technicien. Conformément à la législation, ce fichier PDF devient alors inaltérable.
                  </p>
                  <p>
                    <strong>Aide concernant l’option Télécharger :</strong> Pour chaque rapport, le bouton Télécharger permet d’exporter le document au format PDF.
                  </p>
                  <p>
                    <strong>Aide concernant la navigation À venir, Modération et Validés :</strong> Les rapports générés par les techniciens depuis la webapp s’affichent dans l’onglet Modération. L'onglet À venir regroupe les rapports attendus selon les maintenances prévues dans Tournées & Missions. L'onglet Validés réunit l'ensemble des rapports définitivement clôturés.
                  </p>
                </HelpBubble>

                <div 
                  className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn transition-all text-left"
                  style={{
                    borderColor: 'rgb(218, 218, 218)',
                    background: '#ffffff00',
                    boxShadow: 'none',
                    maxWidth: '98%',
                    margin: '15px auto 5px auto',
                  }}
                >
                  <p 
                    className="font-sans leading-relaxed flex-1"
                    style={{ 
                      fontSize: '16px', 
                      fontWeight: 400, 
                      color: '#000000', 
                      cursor: 'default' 
                    }}
                  >
                    Uniquement un membre contrôleur ou administrateur-contrôleur est en capacité de modifier et valider les documents émis qui actualisent la base de données.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('parametres');
                      setTimeout(() => {
                        const el = document.getElementById('settings-section-members');
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 300);
                    }}
                    className="font-sans font-semibold active:scale-95 transition-all border-0 cursor-pointer shrink-0 inline-flex items-center justify-center text-center whitespace-nowrap"
                    style={{
                      backgroundColor: '#000000',
                      color: '#ffffff',
                      fontSize: '18px',
                      borderRadius: '13px',
                      padding: '8px 20px',
                    }}
                  >
                    Gérer les membres
                  </button>
                </div>

                {dropboxError && (
                  <div className="space-y-2 mt-4 mb-4">
                    <div className="text-red-600 font-sans font-light text-sm text-left">
                      {dropboxError}
                    </div>
                    {(dropboxError.includes("Autorisation insuffisante") || dropboxError.includes("401") || dropboxError.includes("expiré")) && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2 max-w-2xl">
                        <p className="font-bold text-red-900">💡 Guide de configuration & génération de Token Dropbox :</p>
                        <ol className="list-decimal list-inside space-y-1 text-[11px] text-red-700">
                          <li>Allez sur la <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-red-900">Console Dropbox Developer</a>.</li>
                          <li>Sélectionnez votre application Dropbox.</li>
                          <li>Allez dans l'onglet <strong className="font-bold">Permissions</strong>.</li>
                          <li>Cochez la case <strong className="font-bold">files.content.write</strong> (et <strong className="font-bold">files.content.read</strong>).</li>
                          <li>Cliquez sur <strong className="font-bold">Submit</strong> en bas de la page.</li>
                          <li>Retournez dans <strong className="font-bold">Settings</strong>, puis cliquez sur <strong className="font-bold">Generate</strong> pour obtenir un nouveau token.</li>
                          <li>Mettez à jour le token dans les réglages de l'application (bouton engrenage ⚙️).</li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}

                {/* Main Table Records Sheet */}
                <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
                  <div className="overflow-x-auto">
                    {filteredReports.length === 0 ? (
                      <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
                    ) : (
                      <table className="w-full text-left font-sans border-collapse text-xs" id="gmao-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
                        <thead>
                          <tr className="bg-transparent">
                            <th className="px-4 py-3.5 w-10 text-center" style={thStyle}></th>
                            <th className="px-4 py-3.5" style={thStyle}>Horodatage.</th>
                            <th className="px-4 py-3.5" style={thStyle}>Catégorie matériel.</th>
                            <th className="px-4 py-3.5" style={thStyle}>Série.</th>
                            <th className="px-4 py-3.5" style={thStyle}>Identifiant.</th>
                            <th className="px-4 py-3.5" style={thStyle}>Technicien.</th>
                            <th className="px-4 py-3.5" style={thStyle}>Réf. Intervention.</th>
                            <th className="px-4 py-3.5" style={thStyle}>Origine.</th>
                            <th className="px-4 py-3.5" style={thStyle}>Planifié/Effectué.</th>
                            <th className="px-4 py-3.5" style={thStyle}>Situation.</th>
                            <th className="px-4 py-3.5 text-right w-12" style={thStyle}>Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-700 text-xs">
                          {filteredReports.map((rep) => {
                            const isConforme = (rep.defibSnapshot?.conforme || 'Oui') === 'Oui';
                            const isEffectue = 
                              rep.missionStatus === 'Effectué' ||
                              rep.conforme === 'Conforme' ||
                              rep.conforme === 'Non Conforme' ||
                              rep.conforme === 'Intervention impossible';

                            const isUpcoming = gmaoFilter === 'upcoming' || (!isEffectue && (rep.isUpcoming || rep.status === 'À venir' || rep.status === 'upcoming' || rep.upcoming || rep.isFuture));
                            const isValidated = gmaoFilter === 'validated' || !!rep.validated;
                            const isModeration = gmaoFilter === 'moderation' || (!isUpcoming && !isValidated);

                            // Button states according to specifications:
                            // — À VENIR : Gérer (Enabled), Corriger (Disabled), Valider (Disabled), Télécharger (Disabled)
                            // — MODÉRATION : Gérer (Enabled), Corriger (Enabled), Valider (Enabled), Télécharger (Enabled)
                            // — VALIDÉS : Gérer (Enabled), Corriger (Disabled), Valider (Disabled), Télécharger (Enabled)
                            const isGererDisabled = !isGmaoController;
                            const isCorrigerDisabled = isUpcoming || isValidated || !isGmaoController;
                            const isValiderDisabled = isUpcoming || isValidated || !isGmaoController;
                            const isTelechargerDisabled = isUpcoming;

                            const getBtnStyle = (isDisabled: boolean) => ({
                              ...rowActionButtonStyle,
                              opacity: isDisabled ? 0.35 : 1,
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              backgroundColor: isDisabled ? '#cbd5e1' : '#000000',
                              color: isDisabled ? '#64748b' : '#ffffff',
                              boxShadow: isDisabled ? 'none' : rowActionButtonStyle.boxShadow,
                              border: 'none',
                            });
                            
                            // Retrieve category name elegantly
                            const getCategoryName = (r: any) => {
                              if (r.defibSnapshot?.categorie) {
                                return r.defibSnapshot.categorie;
                              }
                              if (r.title && r.title.trim().toUpperCase().startsWith("RAPPORT TECHNIQUE - ")) {
                                const raw = r.title.trim().substring(20);
                                return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
                              }
                              return "Défibrillateur";
                            };

                            return (
                              <tr key={rep.id} className="group hover:bg-[#ffecf8] transition-all cursor-pointer">
                                {/* Conforme Status Dot Banner column & Flag Voyants */}
                                <td className="px-3 py-5 text-center whitespace-nowrap" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  <div className="inline-flex items-center justify-center gap-2">
                                    {rep.drapeaux && rep.drapeaux.length > 0 && (
                                      <div className="inline-flex items-center gap-2">
                                        {rep.drapeaux.map((flag: any, fIdx: number) => {
                                          const borderColor = flag.couleurHex?.trim() || '#000000';
                                          return (
                                            <div
                                              key={flag.id || fIdx}
                                              className="relative inline-flex items-center justify-center shrink-0"
                                              style={{ width: '20px', height: '20px' }}
                                              title={flag.nom}
                                            >
                                              <div
                                                className="absolute inset-0"
                                                style={{
                                                  border: `3px solid ${borderColor}`,
                                                  backgroundColor: 'transparent',
                                                  transform: 'rotate(45deg)',
                                                  borderRadius: '6px',
                                                }}
                                              />
                                              <span
                                                className="relative z-10 font-bold leading-none select-none"
                                                style={{
                                                  fontSize: '16px',
                                                  color: '#000000',
                                                  fontFamily: 'sans-serif',
                                                }}
                                              >
                                                !
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <span 
                                      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${isConforme ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                                      title={isConforme ? "Conforme" : "Non conforme"}
                                    />
                                  </div>
                                </td>

                                {/* Date / Horodatage */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  {rep.date}
                                </td>

                                {/* Catégorie matériel */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  <div 
                                    style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '8px',
                                      border: '1px solid rgb(231, 231, 231)',
                                      borderRadius: '1000px',
                                      padding: '4px 12px',
                                      backgroundColor: '#ffffff',
                                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                    }} 
                                    className="whitespace-nowrap font-medium"
                                  >
                                    {getCategoryName(rep)}
                                  </div>
                                </td>

                                {/* Série */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  {rep.defibSnapshot?.numeroSerie && rep.defibSnapshot.numeroSerie.trim() ? (
                                    <div 
                                      style={{ 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '8px',
                                        border: '1px solid rgb(231, 231, 231)',
                                        borderRadius: '1000px',
                                        padding: '4px 12px',
                                        backgroundColor: '#ffffff',
                                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                      }} 
                                      className="whitespace-nowrap font-medium"
                                    >
                                      {rep.defibSnapshot.numeroSerie}
                                    </div>
                                  ) : null}
                                </td>

                                 {/* Identifiant */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  {rep.defibIdentifiant && rep.defibIdentifiant.trim() ? (
                                    <div 
                                      style={{ 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '8px',
                                        border: '1px solid rgb(231, 231, 231)',
                                        borderRadius: '1000px',
                                        padding: '4px 12px',
                                        backgroundColor: '#ffffff',
                                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                      }} 
                                      className="whitespace-nowrap font-medium"
                                    >
                                      {rep.defibIdentifiant}
                                    </div>
                                  ) : null}
                                </td>

                                {/* Technicien */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  {rep.techName && rep.techName.trim() ? (
                                    <div className="font-medium text-[#000000] whitespace-nowrap" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                      {rep.techName}
                                    </div>
                                  ) : null}
                                </td>

                                {/* Réf. Intervention */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  {rep.interventionReference && rep.interventionReference.trim() ? (
                                    <div 
                                      style={{ 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '8px',
                                        border: '1px solid rgb(231, 231, 231)',
                                        borderRadius: '1000px',
                                        padding: '4px 12px',
                                        backgroundColor: '#ffffff',
                                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                      }} 
                                      className="whitespace-nowrap font-medium"
                                    >
                                      {rep.interventionReference}
                                    </div>
                                  ) : null}
                                </td>

                                {/* Origine. */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  {(() => {
                                    const raw = (rep.origin || `${rep.tourDate || ''} ${rep.tourName || ''}`).trim();
                                    if (!raw) return '—';
                                    return raw.length > 20 ? raw.substring(0, 20) + '...' : raw;
                                  })()}
                                </td>

                                {/* Planifié/Effectué. */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  {(() => {
                                    let matchMission: any = null;
                                    let matchTour: any = null;
                                    if (fsmTours && fsmTours.length > 0) {
                                      for (const tour of fsmTours) {
                                        if (!tour.missions) continue;
                                        const found = tour.missions.find((m: any) => 
                                          (rep.missionId && m.id === rep.missionId) ||
                                          (rep.interventionReference && m.interventionReference && m.interventionReference === rep.interventionReference) ||
                                          (rep.defibIdentifiant && m.defibIdentifiant && m.defibIdentifiant === rep.defibIdentifiant)
                                        );
                                        if (found) {
                                          matchMission = found;
                                          matchTour = tour;
                                          break;
                                        }
                                      }
                                    }

                                    let dateVal = '';
                                    let slotVal = '';

                                    if (isUpcoming) {
                                      dateVal = matchMission?.estimatedDate || rep.estimatedDate || matchTour?.startDate || matchTour?.date || rep.tourDate || rep.date || '';
                                      slotVal = matchMission?.estimatedSlot || rep.estimatedSlot || matchMission?.creneau || '09:00';
                                    } else {
                                      dateVal = rep.date || matchMission?.executedAt || matchMission?.completedAt || '';
                                      slotVal = rep.endTimeStamp || rep.time || matchMission?.endTimeStamp || '';
                                    }

                                    const formatDateTimeDisplay = (dStr: string, sStr: string) => {
                                      const cleanD = (dStr || '').trim();
                                      const cleanS = (sStr || '').trim();
                                      if (!cleanD || cleanD === 'À venir') return '—';

                                      let dPart = '';
                                      let tPart = '';

                                      if (cleanD.includes(' ')) {
                                        const parts = cleanD.split(/\s+/);
                                        dPart = parts[0];
                                        tPart = parts[1] || cleanS;
                                      } else if (cleanD.includes('T')) {
                                        const parts = cleanD.split('T');
                                        dPart = parts[0];
                                        tPart = (parts[1] || '').substring(0, 5);
                                      } else {
                                        dPart = cleanD;
                                        tPart = cleanS;
                                      }

                                      let formattedDate = dPart;
                                      if (dPart.includes('-')) {
                                        const segs = dPart.split('-');
                                        if (segs.length === 3) {
                                          if (segs[0].length === 4) {
                                            formattedDate = `${segs[2].padStart(2, '0')}/${segs[1].padStart(2, '0')}/${segs[0]}`;
                                          } else if (segs[2].length === 4) {
                                            formattedDate = `${segs[0].padStart(2, '0')}/${segs[1].padStart(2, '0')}/${segs[2]}`;
                                          }
                                        }
                                      } else if (dPart.includes('/')) {
                                        const segs = dPart.split('/');
                                        if (segs.length === 3) {
                                          if (segs[0].length === 4) {
                                            formattedDate = `${segs[2].padStart(2, '0')}/${segs[1].padStart(2, '0')}/${segs[0]}`;
                                          } else {
                                            formattedDate = `${segs[0].padStart(2, '0')}/${segs[1].padStart(2, '0')}/${segs[2]}`;
                                          }
                                        }
                                      }

                                      let formattedTime = '00:00';
                                      if (tPart) {
                                        const match = tPart.match(/(\d{1,2})[:hH](\d{2})/);
                                        if (match) {
                                          formattedTime = `${match[1].padStart(2, '0')}:${match[2]}`;
                                        } else if (/^\d{1,2}$/.test(tPart)) {
                                          formattedTime = `${tPart.padStart(2, '0')}:00`;
                                        } else {
                                          formattedTime = tPart;
                                        }
                                      } else {
                                        formattedTime = '09:00';
                                      }

                                      if (!formattedDate || formattedDate === 'À venir') return '—';
                                      return `${formattedDate} ${formattedTime}`;
                                    };

                                    return formatDateTimeDisplay(dateVal, slotVal);
                                  })()}
                                </td>

                                {/* Situation. */}
                                <td className="px-4 py-5 whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                                  {(() => {
                                    const sit = rep.missionStatus || (isUpcoming ? 'Brouillon' : 'Effectué');
                                    const dotColor = 
                                      sit === 'Brouillon' ? '#94a3b8' :
                                      sit === 'Attente Client' ? '#f59e0b' :
                                      sit === 'Accepté Client' ? '#16a34a' :
                                      sit === 'Refusé Client' ? '#dc2626' :
                                      sit === 'Rejet mission' ? '#dc2626' :
                                      sit === 'À faire' ? '#3b82f6' :
                                      sit === 'En cours' ? '#ef4444' :
                                      sit === 'Effectué' ? '#22c55e' :
                                      sit === 'Attente' ? '#94a3b8' : '#3b82f6';

                                    return (
                                      <div 
                                        style={{ 
                                          display: 'inline-flex', 
                                          alignItems: 'center', 
                                          gap: '8px',
                                          border: '1px solid rgb(231, 231, 231)',
                                          borderRadius: '1000px',
                                          padding: '4px 12px',
                                          backgroundColor: '#ffffff',
                                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif'
                                        }} 
                                        className="whitespace-nowrap font-medium"
                                      >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: dotColor, display: 'inline-block' }} />
                                        <span>{sit}</span>
                                      </div>
                                    );
                                  })()}
                                </td>

                                {/* Actions */}
                                <td className="px-4 py-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <div className="inline-flex gap-2">
                                    <button
                                      type="button"
                                      disabled={isGererDisabled}
                                      onClick={() => !isGererDisabled && setManagingReportId(rep.id)}
                                      style={getBtnStyle(isGererDisabled)}
                                      className={isGererDisabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'}
                                    >
                                      Gérer
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isCorrigerDisabled}
                                      onClick={() => !isCorrigerDisabled && setEditingReportId(rep.id)}
                                      style={getBtnStyle(isCorrigerDisabled)}
                                      className={isCorrigerDisabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'}
                                    >
                                      Corriger
                                    </button>
                                    <button
                                      type="button"
                                      disabled={rep.validated || !isGmaoController}
                                      onClick={() => {
                                        const updatedReports = generatedReports.map(r => r.id === rep.id ? { ...r, validated: true } : r);
                                        saveReports(updatedReports);

                                        // Update "Centrale des stocks" (Volume=0, Situation=Utilisé, Commentaire=Ref intervention)
                                        const usedTraceIds = [
                                          rep.selectionElectrodeARemplacee,
                                          rep.selectionElectrodeASecoursRemplacee,
                                          rep.selectionElectrodePRemplacee,
                                          rep.selectionElectrodePSecoursRemplacee,
                                          rep.selectionBatterieRemplacee,
                                          rep.selectionKitSecoursRemplace
                                        ].filter(id => id && id !== 'Autre');

                                        if (usedTraceIds.length > 0) {
                                          const updatedStocksList = stocks.map(st => {
                                            let stChanged = false;
                                            let decrementQty = 0;
                                            const updatedTraces = (st.traceabilities || []).map(tr => {
                                              if (usedTraceIds.includes(tr.id)) {
                                                stChanged = true;
                                                if (tr.situation === 'Disponible') {
                                                  decrementQty++;
                                                }
                                                return {
                                                  ...tr,
                                                  volume: 0,
                                                  situation: 'Utilisé' as const,
                                                  comment: rep.interventionReference || 'Ref: ' + (rep.id || 'sans-id')
                                                };
                                              }
                                              return tr;
                                            });

                                            if (stChanged) {
                                              return {
                                                ...st,
                                                quantite: Math.max(0, (st.quantite || 0) - decrementQty),
                                                traceabilities: updatedTraces
                                              };
                                            }
                                            return st;
                                          });
                                          saveStocks(updatedStocksList);
                                        }

                                        // Update the main equipment database and send validation email to the client
                                        const snap = rep.defibSnapshot;
                                        if (snap) {
                                          const uuid = snap.id || rep.defibId;
                                          const ident = snap.identifiant || rep.defibIdentifiant;

                                          const isDefib = defibrillateurs.some(df => df.id === uuid || df.identifiant === ident);
                                          if (isDefib) {
                                            const updatedList = defibrillateurs.map(df => {
                                              if (df.id === uuid || df.identifiant === ident) {
                                                return {
                                                  ...snap,
                                                  derniereMaintenance: snap.derniereMaintenance || new Date().toISOString().split('T')[0]
                                                };
                                              }
                                              return df;
                                            });
                                            saveDefibs(updatedList);
                                          } else {
                                            const isOther = otherEquipments.some(o => o.id === uuid || o.identifiant === ident);
                                            if (isOther) {
                                              const updatedList = otherEquipments.map(o => {
                                                if (o.id === uuid || o.identifiant === ident) {
                                                  return snap;
                                                }
                                                return o;
                                              });
                                              saveOtherEquipments(updatedList);
                                            }
                                          }

                                          // Trigger Email 6: RAPPORT DE MAINTENANCE AU CLIENT
                                          if (!rep.disableClientEmail) {
                                            try {
                                              const matchingClient = clients?.find((c: any) => c.id === snap.clientId);
                                              const clientEmail = snap.emailSite || matchingClient?.email || matchingClient?.emailSite;
                                              if (clientEmail && clientEmail.trim()) {
                                                triggerEmail6RapportIntervention(
                                                  clientEmail.trim(),
                                                  snap.identifiant || rep.defibIdentifiant || '',
                                                  rep.date || new Date().toLocaleString('fr-FR'),
                                                  companyInfo.name || 'Défibeo Suite',
                                                  companyInfo.email || ''
                                                ).catch(e => console.error("Error triggering Email 6 during GMAO validation:", e));
                                              }
                                            } catch (err6) {
                                              console.error("Error sending validation email during GMAO validation:", err6);
                                            }
                                          }
                                        }

                                        // Upload validated intervention report to Dropbox if active
                                        setDropboxError(null);
                                        if (dropboxActive && dropboxAccessToken) {
                                          (async () => {
                                            try {
                                              const { generateReportPDF, uploadToDropbox } = await import('../utils/dropbox');
                                              const pdfBytes = generateReportPDF(rep);
                                              const ident = snap ? (snap.identifiant || rep.defibIdentifiant) : (rep.defibIdentifiant || rep.id);
                                              const fileName = `Rapport_Intervention_${ident}_${rep.date || 'sans-date'}.pdf`;
                                              await uploadToDropbox(dropboxAccessToken, fileName, pdfBytes);
                                            } catch (dropboxErr: any) {
                                              console.error("Dropbox report upload failed on validation:", dropboxErr);
                                              let cleanMsg = "Impossible d'uploader le rapport sur Dropbox, vérifiez les identifiants.";
                                              if (dropboxErr.message && (dropboxErr.message.includes("401") || dropboxErr.message.includes("expired") || dropboxErr.message.includes("invalid_access_token") || dropboxErr.message.includes("Unauthorized"))) {
                                                cleanMsg = "Erreur Dropbox 401 : Le token d'accès est invalide ou expiré (les tokens temporaires Dropbox expirent au bout de 4 heures). Veuillez générer un nouveau token d'accès dans votre console Dropbox Developer.";
                                              } else
                                              if (dropboxErr.message && dropboxErr.message.includes("missing_scope")) {
                                                cleanMsg = "Erreur Dropbox : Autorisation insuffisante. Veuillez activer la permission 'files.content.write' dans votre console Dropbox Developer, puis générez un nouveau token.";
                                              }
                                              setDropboxError(cleanMsg);
                                            }
                                          })();
                                        }

                                        if (rep.disableClientEmail) {
                                          alert("Le rapport d'intervention a été validé avec succès ! L'état de l'équipement a été mis à jour.");
                                        } else {
                                          alert("Le rapport d'intervention a été validé avec succès ! L'état de l'équipement a été mis à jour et un e-mail avec le rapport a été envoyé au client.");
                                        }
                                      }}
                                      style={getBtnStyle(isValiderDisabled)}
                                      className={isValiderDisabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'}
                                    >
                                      {isValidated ? 'Validé' : 'Valider'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isTelechargerDisabled}
                                      onClick={() => !isTelechargerDisabled && handleDownloadReport(rep)}
                                      style={getBtnStyle(isTelechargerDisabled)}
                                      className={isTelechargerDisabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'}
                                    >
                                      Télécharger
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

                {/* Side-bar popup for managing report moderation flags & comments */}
                {(() => {
                  const managingReport = generatedReports.find(r => r.id === managingReportId);
                  if (!managingReport) return null;

                  return (
                    <div 
                      className="fixed inset-0 z-[9999] flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"
                      style={{ top: 0, left: 0, right: 0, bottom: 0, height: '100vh', width: '100vw' }}
                      onClick={() => setManagingReportId(null)}
                    >
                      <div 
                        className="relative w-full max-w-xl bg-white flex flex-col overflow-hidden animate-slideLeft h-full"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
                          borderLeft: '1px solid #e2e8f0',
                        }}
                      >
                        {/* Drawer Body without inner padding/border div */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white font-sans">
                          {/* Field: Commentaire du technicien. (Disabled textarea showing section 11 Commentaire interne) */}
                          <div className="space-y-2">
                            <label className="block text-[18px] font-medium text-[#000]">
                              Commentaire du technicien.
                            </label>
                            <textarea
                              disabled
                              rows={3}
                              value={managingReport.defibSnapshot?.commentaireInterne || managingReport.commentaireInterne || ''}
                              className="w-full p-3 text-[16px] text-[#000] border border-slate-300 rounded-lg bg-slate-100 resize-y min-h-[90px] focus:outline-none cursor-not-allowed opacity-90"
                            />
                          </div>

                          {/* Field A: Drapeau GMAO */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-[16px] font-medium text-[#000]">
                                Drapeau GMAO
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setManagingReportId(null);
                                  setActiveTab('variables');
                                }}
                                style={{ fontSize: '16px', textDecoration: 'none' }}
                                className="text-[16px] text-blue-600 hover:text-blue-800 cursor-pointer bg-transparent border-0 p-0 font-medium font-sans no-underline hover:no-underline"
                              >
                                Nouvelle variable drapeau
                              </button>
                            </div>

                            {/* Select Lookup Dropdown */}
                            <select
                              value=""
                              onChange={(e) => {
                                const valId = e.target.value;
                                if (!valId) return;
                                const foundVar = variables.find(v => v.id === valId && (v.category === 'Drapeau GMAO' || v.category === 'Drapeau post-intervention'));
                                if (foundVar) {
                                  const currentFlags = managingReport.drapeaux || [];
                                  if (!currentFlags.some((f: any) => f.id === foundVar.id || f.nom === foundVar.nom)) {
                                    const newFlag = {
                                      id: foundVar.id,
                                      nom: foundVar.nom,
                                      couleurHex: foundVar.couleurHex || ''
                                    };
                                    const updatedReports = generatedReports.map(r => 
                                      r.id === managingReport.id ? { ...r, drapeaux: [...currentFlags, newFlag] } : r
                                    );
                                    saveReports(updatedReports);
                                  }
                                }
                              }}
                              className="w-full p-2.5 text-[16px] text-[#000] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer"
                            >
                              <option value="">-- Sélectionner un drapeau GMAO --</option>
                              {variables
                                .filter(v => v.category === 'Drapeau GMAO' || v.category === 'Drapeau post-intervention')
                                .map(v => (
                                  <option key={v.id} value={v.id}>
                                    {v.nom} {v.couleurHex ? `(${v.couleurHex})` : ''}
                                  </option>
                                ))}
                            </select>

                            {/* Selected Flags as Pills / Gélules */}
                            {managingReport.drapeaux && managingReport.drapeaux.length > 0 ? (
                              <div className="flex flex-wrap gap-2.5 pt-1">
                                {managingReport.drapeaux.map((flag: any, idx: number) => {
                                  const hex = flag.couleurHex?.trim();
                                  const txtColor = hex ? getContrastingTextColor(hex) : '#0f172a';
                                  return (
                                    <span
                                      key={flag.id || idx}
                                      onClick={() => {
                                        const updatedFlags = (managingReport.drapeaux || []).filter((_: any, i: number) => i !== idx);
                                        const updatedReports = generatedReports.map(r => 
                                          r.id === managingReport.id ? { ...r, drapeaux: updatedFlags } : r
                                        );
                                        saveReports(updatedReports);
                                      }}
                                      className="inline-flex items-center px-4 py-2 rounded-full text-[18px] font-medium cursor-pointer transition-colors select-none hover:!bg-[#851010] hover:!text-white"
                                      style={{
                                        backgroundColor: hex || '#f1f5f9',
                                        color: txtColor,
                                        border: 'none',
                                      }}
                                      title="Cliquer pour supprimer"
                                    >
                                      {flag.nom}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>

                          {/* Field B: Commentaire */}
                          <div className="space-y-1.5 pt-1">
                            <label className="block text-[16px] font-medium text-[#000]">
                              Commentaire
                            </label>
                            <textarea
                              value={
                                managingReport.commentaire !== undefined && managingReport.commentaire !== null && managingReport.commentaire !== ''
                                  ? managingReport.commentaire
                                  : (!managingReport.isUpcoming ? generateReportModerationComment(managingReport, defibrillateurs) : '')
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                const updatedReports = generatedReports.map(r => 
                                  r.id === managingReport.id ? { ...r, commentaire: val } : r
                                );
                                saveReports(updatedReports);
                              }}
                              placeholder="Entrez un commentaire."
                              className="w-full p-3 text-[16px] text-[#000] border border-slate-300 rounded-lg bg-slate-50/50 resize-y min-h-[120px] focus:outline-none focus:ring-0 focus:border-slate-300 font-sans"
                            />
                          </div>

                          {/* Toggle: Désactiver l'email au client. */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="block text-[16px] font-medium text-[#000]">
                              Désactiver l’email au client.
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const updatedValue = !managingReport.disableClientEmail;
                                const updatedReports = generatedReports.map(r => 
                                  r.id === managingReport.id ? { ...r, disableClientEmail: updatedValue } : r
                                );
                                saveReports(updatedReports);
                              }}
                              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none shrink-0"
                              style={{
                                backgroundColor: managingReport.disableClientEmail ? '#fe4eba' : '#cbd5e1',
                                cursor: 'pointer',
                                border: 'none',
                              }}
                            >
                              <span
                                className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm"
                                style={{
                                  transform: managingReport.disableClientEmail ? 'translateX(24px)' : 'translateX(4px)',
                                }}
                              />
                            </button>
                          </div>

                          {/* Field: Situation. */}
                          <div className="space-y-1.5 pt-2">
                            <label className="block text-[16px] font-medium text-[#000]">
                              Situation.
                            </label>
                            <select
                              value={managingReport.missionStatus || (managingReport.isUpcoming ? 'Brouillon' : 'Effectué')}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updatedReports = generatedReports.map(r => 
                                  r.id === managingReport.id ? { ...r, missionStatus: val } : r
                                );
                                saveReports(updatedReports);
                              }}
                              className="w-full p-2.5 text-[16px] text-[#000] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer font-sans"
                            >
                              <option value="Effectué">Effectué</option>
                              <option value="Rejet mission">Rejet mission</option>
                              <option value="En cours">En cours</option>
                              <option value="À faire">À faire</option>
                              <option value="Attente">Attente</option>
                              <option value="Attente Client">Attente Client</option>
                              <option value="Accepté Client">Accepté Client</option>
                              <option value="Refusé Client">Refusé Client</option>
                              <option value="Brouillon">Brouillon</option>
                            </select>
                          </div>

                          {/* Field: Raison de rejet (visible if situation is Rejet mission or intervention impossible) */}
                          {(managingReport.missionStatus === 'Rejet mission' || managingReport.conforme === 'Intervention impossible' || managingReport.statutMaintenance === 'IMPOSSIBLE') && (
                            <div className="space-y-1.5 pt-2">
                              <label className="block text-[16px] font-medium text-[#000]">
                                Raison de rejet de mission.
                              </label>
                              <input
                                type="text"
                                maxLength={100}
                                value={managingReport.rejectionReason || managingReport.reasonImpossible || managingReport.techCommentaireArrivee || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updatedReports = generatedReports.map(r => 
                                    r.id === managingReport.id ? { ...r, rejectionReason: val, reasonImpossible: val, techCommentaireArrivee: val } : r
                                  );
                                  saveReports(updatedReports);
                                }}
                                placeholder="Entrez la raison du rejet..."
                                className="w-full p-2.5 text-[16px] text-[#000] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-0 focus:border-slate-300 font-sans"
                              />
                            </div>
                          )}

                          {/* Enregistrer & Fermer Buttons */}
                          <div className="pt-2 space-y-3">
                            <button
                              type="button"
                              onClick={() => {
                                saveReports(generatedReports);
                                setManagingReportId(null);
                              }}
                              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[18px] font-medium transition-colors cursor-pointer border-none shadow-sm"
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              onClick={() => setManagingReportId(null)}
                              className="w-full py-3.5 bg-black text-white rounded-xl text-[18px] font-medium hover:bg-slate-800 transition-colors cursor-pointer border-none"
                            >
                              Fermer
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Side-bar popup for editing report correction form (Corriger) / Spontaneous Report */}
                {(() => {
                  if (!editingReportId && !isSpontaneousReportOpen) return null;
                  const repToEdit = editingReportId ? generatedReports.find(r => r.id === editingReportId) : undefined;
                  if (editingReportId && !repToEdit) return null;

                  return (
                    <div 
                      className="fixed inset-0 z-[9999] flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"
                      style={{ top: 0, left: 0, right: 0, bottom: 0, height: '100vh', width: '100vw' }}
                      onClick={() => {
                        setEditingReportId(null);
                        setEditReportForm(null);
                        setIsSpontaneousReportOpen(false);
                        setSelectedSpontaneousOtherEquipment(null);
                      }}
                    >
                      <div 
                        className="relative w-full max-w-xl md:max-w-2xl bg-white flex flex-col overflow-hidden animate-slideLeft h-full"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
                          borderLeft: '1px solid #e2e8f0',
                        }}
                      >
                        <div className="flex-1 overflow-y-auto bg-white font-sans relative">
                          {selectedSpontaneousOtherEquipment ? (
                            <GmaoOtherEquipmentCorrectionForm
                              otherEquipment={selectedSpontaneousOtherEquipment}
                              clients={clients}
                              forceSmartphoneLayout={true}
                              isNew={true}
                              isWebapp={true}
                              otherEquipments={otherEquipments}
                              defibrillateurs={defibrillateurs}
                              variables={variables}
                              stocks={stocks}
                              onSelectDefibrillator={() => {
                                setSelectedSpontaneousOtherEquipment(null);
                              }}
                              onSelectOtherEquipment={(otherEq) => {
                                setSelectedSpontaneousOtherEquipment(otherEq);
                              }}
                              onCancel={() => {
                                setIsSpontaneousReportOpen(false);
                                setSelectedSpontaneousOtherEquipment(null);
                                setEditingReportId(null);
                                setEditReportForm(null);
                              }}
                              onSave={(updatedReport) => {
                                const reportId = "REP-" + Date.now();
                                const currentAdminName = members.find(m => m.email === companyInfo.email)?.name || companyInfo.name || "Administrateur";
                                const submission = {
                                  ...updatedReport,
                                  id: reportId,
                                  techName: updatedReport.techName || currentAdminName,
                                  date: updatedReport.date || new Date().toLocaleString("fr-FR"),
                                  validated: false,
                                  missionStatus: 'Effectué',
                                };
                                saveReports([submission, ...generatedReports]);
                                if (updatedReport.otherEquipmentSnapshot) {
                                  const updatedList = otherEquipments.map(o => o.id === updatedReport.otherEquipmentSnapshot.id ? updatedReport.otherEquipmentSnapshot : o);
                                  saveOtherEquipments(updatedList);
                                }
                                setIsSpontaneousReportOpen(false);
                                setSelectedSpontaneousOtherEquipment(null);
                                setEditingReportId(null);
                                setEditReportForm(null);
                              }}
                            />
                          ) : (
                            <GmaoCorrectionForm
                              key={isSpontaneousReportOpen ? 'spontaneous-report-new' : `edit-${editingReportId}`}
                              report={repToEdit}
                              isNew={isSpontaneousReportOpen}
                              isWebapp={true}
                              forceSmartphoneLayout={true}
                              onSave={(updatedReport) => {
                                if (isSpontaneousReportOpen) {
                                  const currentAdminName = members.find(m => m.email === companyInfo.email)?.name || companyInfo.name || "Administrateur";
                                  const reportId = "REP-" + Date.now();
                                  const submission = {
                                    ...updatedReport,
                                    id: reportId,
                                    techName: updatedReport.techName || currentAdminName,
                                    date: updatedReport.date || new Date().toLocaleString("fr-FR"),
                                    validated: false,
                                    missionStatus: 'Effectué',
                                  };
                                  saveReports([submission, ...generatedReports]);
                                  if (updatedReport.defibSnapshot) {
                                    handleUpdateDefib(updatedReport.defibSnapshot);
                                  }
                                  if (updatedReport.clientPinCode && updatedReport.defibSnapshot?.clientId) {
                                    const targetClientId = updatedReport.defibSnapshot.clientId;
                                    const typedPin = updatedReport.clientPinCode.trim().toUpperCase();
                                    
                                    const updatedClients = clients.map(cl => {
                                      if (cl.id === targetClientId) {
                                        const originalPins = cl.signaturePins || [];
                                        const matchIndex = originalPins.findIndex(p => p.code.toUpperCase() === typedPin);
                                        let newPins = [...originalPins];
                                        if (matchIndex !== -1) {
                                          newPins[matchIndex] = {
                                            ...newPins[matchIndex],
                                            status: 'validé',
                                            validatedAt: new Date().toISOString(),
                                            reportTitle: updatedReport.title || "Rapport d'Intervention"
                                          };
                                        } else {
                                          newPins.push({
                                            code: typedPin,
                                            createdAt: new Date().toISOString(),
                                            status: 'validé',
                                            validatedAt: new Date().toISOString(),
                                            reportTitle: updatedReport.title || "Rapport d'Intervention"
                                          });
                                        }
                                        return {
                                          ...cl,
                                          signaturePins: newPins
                                        };
                                      }
                                      return cl;
                                    });
                                    saveClients(updatedClients);
                                  }
                                  setIsSpontaneousReportOpen(false);
                                  setSelectedSpontaneousOtherEquipment(null);
                                } else {
                                  const updatedReports = generatedReports.map(r => r.id === editingReportId ? updatedReport : r);
                                  saveReports(updatedReports);
                                  if (updatedReport.defibSnapshot) {
                                    handleUpdateDefib(updatedReport.defibSnapshot);
                                  }
                                  
                                  if (updatedReport.clientPinCode && updatedReport.defibSnapshot?.clientId) {
                                    const targetClientId = updatedReport.defibSnapshot.clientId;
                                    const typedPin = updatedReport.clientPinCode.trim().toUpperCase();
                                    
                                    const updatedClients = clients.map(cl => {
                                      if (cl.id === targetClientId) {
                                        const originalPins = cl.signaturePins || [];
                                        const matchIndex = originalPins.findIndex(p => p.code.toUpperCase() === typedPin);
                                        let newPins = [...originalPins];
                                        if (matchIndex !== -1) {
                                          newPins[matchIndex] = {
                                            ...newPins[matchIndex],
                                            status: 'validé',
                                            validatedAt: new Date().toISOString(),
                                            reportTitle: updatedReport.title || "Rapport d'Intervention"
                                          };
                                        } else {
                                          newPins.push({
                                            code: typedPin,
                                            createdAt: new Date().toISOString(),
                                            status: 'validé',
                                            validatedAt: new Date().toISOString(),
                                            reportTitle: updatedReport.title || "Rapport d'Intervention"
                                          });
                                        }
                                        return {
                                          ...cl,
                                          signaturePins: newPins
                                        };
                                      }
                                      return cl;
                                    });
                                    saveClients(updatedClients);
                                  }

                                  setEditingReportId(null);
                                  setEditReportForm(null);
                                }
                              }}
                              onCancel={() => {
                                setEditingReportId(null);
                                setEditReportForm(null);
                                setIsSpontaneousReportOpen(false);
                                setSelectedSpontaneousOtherEquipment(null);
                              }}
                              clients={clients}
                              variables={variables}
                              defibrillateurs={defibrillateurs}
                              otherEquipments={otherEquipments}
                              onSelectOtherEquipment={(otherEq) => {
                                setSelectedSpontaneousOtherEquipment(otherEq);
                              }}
                              stocks={stocks}
                              onUpdateStocks={saveStocks}
                              members={members}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}              </div>
            );

};

export default GmaoTab;
