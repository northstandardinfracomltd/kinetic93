import React, { useState, useMemo } from 'react';
import { Variable, VariableCategory, Defibrillateur, StockRecord, DistributedStockLocation, OtherEquipment, AchatFournisseur } from '../types';
import { Plus, Search, Trash2, Edit2, X, Sliders, Box, Image as ImageIcon, Sparkles } from 'lucide-react';
import { t } from '../utils/translate';

// Custom Radio Component with exact design styling (representing white gap, rose border and pink dot)
function FormRadio({
  label,
  checked,
  onChange,
  disabled
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={`inline-flex items-center gap-2 select-none justify-start text-left ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      style={{ fontSize: '15px', color: '#000000', fontWeight: '500' }}
    >
      <span 
        className="rounded-full relative transition-all bg-white"
        style={{
          border: checked ? '2.5px solid #fe4eba' : '2.5px solid #cbd5e1',
          width: '20px',
          height: '20px',
          minWidth: '20px',
          minHeight: '20px',
          backgroundColor: '#ffffff'
        }}
      >
        {checked && (
          <span 
            className="rounded-full bg-[#fe4eba] absolute" 
            style={{ 
              width: '9px', 
              height: '9px',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)'
            }} 
          />
        )}
      </span>
      <span className="text-[15px] font-semibold text-black">{label}</span>
    </button>
  );
}

interface VariableTabProps {
  variables: Variable[];
  onAddVariable: (variable: Omit<Variable, 'id'>) => void;
  onUpdateVariable: (variable: Variable) => void;
  onDeleteVariable: (id: string) => void;
  defibrillateurs?: Defibrillateur[];
  stocks?: StockRecord[];
  distributedStocks?: DistributedStockLocation[];
  otherEquipments?: OtherEquipment[];
  achatsFournisseurs?: AchatFournisseur[];
  fsmTours?: any[];
}

// Visual presets of premium defibrillator photos to select instantly
const IMAGE_PRESETS = [
  {
    name: 'Bleu Médical Hospital',
    url: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=120&h=120&q=80',
  },
  {
    name: 'Jaune Fluo Sauvetage',
    url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=120&h=120&q=80',
  },
  {
    name: 'Rouge Secourisme Urgence',
    url: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=120&h=120&q=80',
  },
  {
    name: 'Mallette Pro Orange',
    url: 'https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?auto=format&fit=crop&w=120&h=120&q=80',
  },
];

const CATEGORIES: VariableCategory[] = [
  'Modèle Défibrillateur',
  'Modèle Coffret',
  'Modèle Électrode',
  'Modèle Batterie',
  'Modèle Contrat',
  'Modèle Service',
  'Fournisseur',
  'Modèle Raison Prestation',
  'Drapeau GMAO',
  'Type Filtre Purificateur',
  'Modèle Filtre Purificateur',
];

export default function VariableTab({
  variables,
  onAddVariable,
  onUpdateVariable,
  onDeleteVariable,
  defibrillateurs = [],
  stocks = [],
  distributedStocks = [],
  otherEquipments = [],
  achatsFournisseurs = [],
  fsmTours = [],
}: VariableTabProps) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('Tous');

  const isVariableUsed = (v: Variable): boolean => {
    const id = v.id;
    const nomLower = (v.nom || '').trim().toLowerCase();
    const identLower = (v.identifiant || '').trim().toLowerCase();

    // 1. Defibrillateurs
    const inDefibs = (defibrillateurs || []).some(d => 
      d.modeleId === id ||
      d.modeleCoffretId === id ||
      d.modeleElectrodeAId === id ||
      d.modeleElectrodeASecoursId === id ||
      d.modeleElectrodePId === id ||
      d.modeleElectrodePSecoursId === id ||
      d.modeleBatterieId === id ||
      d.modeleBatterieSecoursId === id
    );
    if (inDefibs) return true;

    // 2. Stocks (Centrale)
    const inStocks = (stocks || []).some(s => 
      (s as any).denominationPieceId === id ||
      (s as any).variableId === id ||
      ((s as any).denom && (s as any).denom.trim().toLowerCase() === nomLower) ||
      ((s as any).denom && identLower && (s as any).denom.trim().toLowerCase() === identLower)
    );
    if (inStocks) return true;

    // 3. Distributed Stocks
    const inDistrib = (distributedStocks || []).some(ds => 
      (ds as any).denominationPieceId === id ||
      (ds as any).variableId === id ||
      ((ds as any).denom && (ds as any).denom.trim().toLowerCase() === nomLower) ||
      ((ds as any).denom && identLower && (ds as any).denom.trim().toLowerCase() === identLower)
    );
    if (inDistrib) return true;

    // 4. Other equipments
    const inOther = (otherEquipments || []).some(oe => 
      (oe as any).variableId === id ||
      (oe as any).modele === id ||
      ((oe as any).modele && (oe as any).modele.trim().toLowerCase() === nomLower)
    );
    if (inOther) return true;

    // 5. Achats fournisseurs
    const inAchats = ((achatsFournisseurs as any) || []).some((af: any) => 
      af.variableId === id ||
      (af.denom && af.denom.trim().toLowerCase() === nomLower)
    );
    if (inAchats) return true;

    // 6. FSM Tours
    const inFsm = (fsmTours || []).some(t => {
      if (Array.isArray((t as any).missions)) {
        return (t as any).missions.some((m: any) => {
          if (Array.isArray(m.requiredParts)) {
            return m.requiredParts.some((p: any) => 
              p === id || 
              (typeof p === 'string' && (p.toLowerCase() === nomLower || (identLower && p.toLowerCase() === identLower)))
            );
          }
          return false;
        });
      }
      return false;
    });
    if (inFsm) return true;

    return false;
  };
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);

  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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
    fontSize: '16px',
    padding: '8px 16px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
  };

  const rowActionButton18Style: React.CSSProperties = {
    ...rowActionButtonStyle,
    fontSize: '18px',
    padding: '9px 19px',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
  };

  // Form State
  const [category, setCategory] = useState<VariableCategory | ''>('');
  const [nom, setNom] = useState('');
  const [marque, setMarque] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [couleurHex, setCouleurHex] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [error, setError] = useState('');

  // Rappel or Alert section fields
  const [rappelAlerteOption, setRappelAlerteOption] = useState('');
  const [rappelDateDebut, setRappelDateDebut] = useState('');
  const [rappelDateFin, setRappelDateFin] = useState('');
  const [rappelObservation, setRappelObservation] = useState('');

  // Custom visibility configuration fields
  const [visibiliteNumeroAtlasante, setVisibiliteNumeroAtlasante] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteVersionLogiciel, setVisibiliteVersionLogiciel] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteFactureBrouillon, setVisibiliteFactureBrouillon] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePadPakAdulte, setVisibilitePadPakAdulte] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteLotPadPakA, setVisibiliteLotPadPakA] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePeremptionPadPakA, setVisibilitePeremptionPadPakA] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteLotP, setVisibiliteLotP] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePadPakPediatrique, setVisibilitePadPakPediatrique] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteLotPadPakP, setVisibiliteLotPadPakP] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePeremptionPadPakP, setVisibilitePeremptionPadPakP] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteFabricationBatterie, setVisibiliteFabricationBatterie] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteInsertionBatterie, setVisibiliteInsertionBatterie] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePeremptionBatterie, setVisibilitePeremptionBatterie] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePourcentageBatterie, setVisibilitePourcentageBatterie] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteGantsPresents, setVisibiliteGantsPresents] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePeremptionServiettes, setVisibilitePeremptionServiettes] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteServiettesPresentes, setVisibiliteServiettesPresentes] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePeremptionMasque, setVisibilitePeremptionMasque] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteMasquePresent, setVisibiliteMasquePresent] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteCiseauxPresents, setVisibiliteCiseauxPresents] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePeremptionTrousse, setVisibilitePeremptionTrousse] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteRasoir, setVisibiliteRasoir] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteBranchementElectrodes, setVisibiliteBranchementElectrodes] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteGuidesVocaux, setVisibiliteGuidesVocaux] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteMessageNumeriqueConforme, setVisibiliteMessageNumeriqueConforme] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteEquipeMessageNumerique, setVisibiliteEquipeMessageNumerique] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteVoyantConforme, setVisibiliteVoyantConforme] = useState<'Oui' | 'Non'>('Oui');
  const [visibiliteNettoyage, setVisibiliteNettoyage] = useState<'Oui' | 'Non'>('Oui');
  const [visibilitePiecesJointes, setVisibilitePiecesJointes] = useState<'Oui' | 'Non'>('Oui');
  const [infosTechnicien, setInfosTechnicien] = useState('');

  // Filtering variables
  const filteredVariables = useMemo(() => {
    return variables.filter((v) => {
      const matchSearch =
        (v.nom || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.marque || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.identifiant || '').toLowerCase().includes(search.toLowerCase());
      
      const matchCategory = filterCategory === 'Tous' || v.category === filterCategory;

      return matchSearch && matchCategory;
    });
  }, [variables, search, filterCategory]);

  const openAddModal = () => {
    setEditingVariable(null);
    setCategory('');
    setNom('');
    setMarque('Standard');
    setDescription('');
    setImageUrl('');
    setCouleurHex('');
    setIdentifiant('');
    setRappelAlerteOption('');
    setRappelDateDebut('');
    setRappelDateFin('');
    setRappelObservation('');
    setVisibiliteNumeroAtlasante('Oui');
    setVisibiliteVersionLogiciel('Oui');
    setVisibiliteFactureBrouillon('Oui');
    setVisibilitePadPakAdulte('Oui');
    setVisibiliteLotPadPakA('Oui');
    setVisibilitePeremptionPadPakA('Oui');
    setVisibiliteLotP('Oui');
    setVisibilitePadPakPediatrique('Oui');
    setVisibiliteLotPadPakP('Oui');
    setVisibilitePeremptionPadPakP('Oui');
    setVisibiliteFabricationBatterie('Oui');
    setVisibiliteInsertionBatterie('Oui');
    setVisibilitePeremptionBatterie('Oui');
    setVisibilitePourcentageBatterie('Oui');
    setVisibiliteGantsPresents('Oui');
    setVisibilitePeremptionServiettes('Oui');
    setVisibiliteServiettesPresentes('Oui');
    setVisibilitePeremptionMasque('Oui');
    setVisibiliteMasquePresent('Oui');
    setVisibiliteCiseauxPresents('Oui');
    setVisibilitePeremptionTrousse('Oui');
    setVisibiliteRasoir('Oui');
    setVisibiliteBranchementElectrodes('Oui');
    setVisibiliteGuidesVocaux('Oui');
    setVisibiliteMessageNumeriqueConforme('Oui');
    setVisibiliteEquipeMessageNumerique('Oui');
    setVisibiliteVoyantConforme('Oui');
    setVisibiliteNettoyage('Oui');
    setVisibilitePiecesJointes('Oui');
    setInfosTechnicien('');
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (v: Variable) => {
    setEditingVariable(v);
    setCategory(v.category);
    setNom(v.nom);
    setMarque(v.marque || 'Standard');
    setDescription(v.description);
    setImageUrl(v.imageUrl || '');
    setCouleurHex(v.couleurHex || '');
    setIdentifiant(v.identifiant || '');
    setRappelAlerteOption(v.rappelAlerteOption || '');
    setRappelDateDebut(v.rappelDateDebut || '');
    setRappelDateFin(v.rappelDateFin || '');
    setRappelObservation(v.rappelObservation || '');
    setVisibiliteNumeroAtlasante(v.visibiliteNumeroAtlasante || 'Oui');
    setVisibiliteVersionLogiciel(v.visibiliteVersionLogiciel || 'Oui');
    setVisibiliteFactureBrouillon(v.visibiliteFactureBrouillon || 'Oui');
    setVisibilitePadPakAdulte(v.visibilitePadPakAdulte || 'Oui');
    setVisibiliteLotPadPakA(v.visibiliteLotPadPakA || 'Oui');
    setVisibilitePeremptionPadPakA(v.visibilitePeremptionPadPakA || 'Oui');
    setVisibiliteLotP(v.visibiliteLotP || 'Oui');
    setVisibilitePadPakPediatrique(v.visibilitePadPakPediatrique || 'Oui');
    setVisibiliteLotPadPakP(v.visibiliteLotPadPakP || 'Oui');
    setVisibilitePeremptionPadPakP(v.visibilitePeremptionPadPakP || 'Oui');
    setVisibiliteFabricationBatterie(v.visibiliteFabricationBatterie || 'Oui');
    setVisibiliteInsertionBatterie(v.visibiliteInsertionBatterie || 'Oui');
    setVisibilitePeremptionBatterie(v.visibilitePeremptionBatterie || 'Oui');
    setVisibilitePourcentageBatterie(v.visibilitePourcentageBatterie || 'Oui');
    setVisibiliteGantsPresents(v.visibiliteGantsPresents || 'Oui');
    setVisibilitePeremptionServiettes(v.visibilitePeremptionServiettes || 'Oui');
    setVisibiliteServiettesPresentes(v.visibiliteServiettesPresentes || 'Oui');
    setVisibilitePeremptionMasque(v.visibilitePeremptionMasque || 'Oui');
    setVisibiliteMasquePresent(v.visibiliteMasquePresent || 'Oui');
    setVisibiliteCiseauxPresents(v.visibiliteCiseauxPresents || 'Oui');
    setVisibilitePeremptionTrousse(v.visibilitePeremptionTrousse || 'Oui');
    setVisibiliteRasoir(v.visibiliteRasoir || 'Oui');
    setVisibiliteBranchementElectrodes(v.visibiliteBranchementElectrodes || 'Oui');
    setVisibiliteGuidesVocaux(v.visibiliteGuidesVocaux || 'Oui');
    setVisibiliteMessageNumeriqueConforme(v.visibiliteMessageNumeriqueConforme || 'Oui');
    setVisibiliteEquipeMessageNumerique(v.visibiliteEquipeMessageNumerique || 'Oui');
    setVisibiliteVoyantConforme(v.visibiliteVoyantConforme || 'Oui');
    setVisibiliteNettoyage(v.visibiliteNettoyage || 'Oui');
    setVisibilitePiecesJointes(v.visibilitePiecesJointes || 'Oui');
    setInfosTechnicien(v.infosTechnicien || '');
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!category) {
      setError('La catégorie est requise.');
      return;
    }
    if (!nom.trim()) {
      setError('Le titre de la variable est requis.');
      return;
    }

    const hideRappelAlerte = category === 'Modèle Contrat' || category === 'Modèle Service' || category === 'Fournisseur' || category === 'Modèle Raison Prestation' || category === 'Drapeau GMAO' || category === 'Drapeau post-intervention' || category === 'Type Filtre Purificateur' || category === 'Modèle Filtre Purificateur';

    let formattedHex = couleurHex.trim();
    if ((category === 'Drapeau GMAO' || category === 'Drapeau post-intervention') && formattedHex) {
      if (!formattedHex.startsWith('#')) {
        formattedHex = '#' + formattedHex;
      }
    }

    const payload: any = {
      category: category as VariableCategory,
      nom: nom.trim(),
      marque: marque.trim() || 'Standard',
      description: description.trim(),
      imageUrl: category === 'Modèle Défibrillateur' ? imageUrl.trim() : undefined,
      couleurHex: (category === 'Drapeau GMAO' || category === 'Drapeau post-intervention') ? (formattedHex || undefined) : undefined,
      identifiant: identifiant.trim() || undefined,
      rappelAlerteOption: hideRappelAlerte ? undefined : (rappelAlerteOption || undefined),
      rappelDateDebut: hideRappelAlerte ? undefined : (rappelDateDebut || undefined),
      rappelDateFin: hideRappelAlerte ? undefined : (rappelDateFin || undefined),
      rappelObservation: hideRappelAlerte ? undefined : (rappelObservation || undefined),
    };

    if (category === 'Modèle Défibrillateur') {
      payload.visibiliteNumeroAtlasante = visibiliteNumeroAtlasante;
      payload.visibiliteVersionLogiciel = visibiliteVersionLogiciel;
      payload.visibiliteFactureBrouillon = visibiliteFactureBrouillon;
      payload.visibilitePadPakAdulte = visibilitePadPakAdulte;
      payload.visibiliteLotPadPakA = visibiliteLotPadPakA;
      payload.visibilitePeremptionPadPakA = visibilitePeremptionPadPakA;
      payload.visibiliteLotP = visibiliteLotP;
      payload.visibilitePadPakPediatrique = visibilitePadPakPediatrique;
      payload.visibiliteLotPadPakP = visibiliteLotPadPakP;
      payload.visibilitePeremptionPadPakP = visibilitePeremptionPadPakP;
      payload.visibiliteFabricationBatterie = visibiliteFabricationBatterie;
      payload.visibiliteInsertionBatterie = visibiliteInsertionBatterie;
      payload.visibilitePeremptionBatterie = visibilitePeremptionBatterie;
      payload.visibilitePourcentageBatterie = visibilitePourcentageBatterie;
      payload.visibiliteGantsPresents = visibiliteGantsPresents;
      payload.visibilitePeremptionServiettes = visibilitePeremptionServiettes;
      payload.visibiliteServiettesPresentes = visibiliteServiettesPresentes;
      payload.visibilitePeremptionMasque = visibilitePeremptionMasque;
      payload.visibiliteMasquePresent = visibiliteMasquePresent;
      payload.visibiliteCiseauxPresents = visibiliteCiseauxPresents;
      payload.visibilitePeremptionTrousse = visibilitePeremptionTrousse;
      payload.visibiliteRasoir = visibiliteRasoir;
      payload.visibiliteBranchementElectrodes = visibiliteBranchementElectrodes;
      payload.visibiliteGuidesVocaux = visibiliteGuidesVocaux;
      payload.visibiliteMessageNumeriqueConforme = visibiliteMessageNumeriqueConforme;
      payload.visibiliteEquipeMessageNumerique = visibiliteEquipeMessageNumerique;
      payload.visibiliteVoyantConforme = visibiliteVoyantConforme;
      payload.visibiliteNettoyage = visibiliteNettoyage;
      payload.visibilitePiecesJointes = visibilitePiecesJointes;
      payload.infosTechnicien = infosTechnicien.trim();
    }

    if (editingVariable) {
      onUpdateVariable({
        id: editingVariable.id,
        ...payload,
      });
    } else {
      onAddVariable(payload);
    }

    setIsModalOpen(false);
  };

  if (isModalOpen) {
    const hideRappelAlerte = category === 'Modèle Contrat' || category === 'Modèle Service' || category === 'Fournisseur' || category === 'Modèle Raison Prestation' || category === 'Drapeau GMAO' || category === 'Drapeau post-intervention' || category === 'Type Filtre Purificateur' || category === 'Modèle Filtre Purificateur';

    return (
      <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="variable-form-overlay">
        {/* Form Header */}
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
          style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px' }}
          id="variable-form-header-box"
        >
          <div>
            <h3 className="text-2xl font-bold font-gochi" id="variable-modal-title" style={{ color: '#000000', cursor: 'default' }}>
              {editingVariable ? 'Modification Variable' : 'Nouvelle Variable'}
            </h3>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              id="btn-close-variable-modal"
              style={rowActionButton18Style}
              className="transition-colors cursor-pointer"
            >
              Fermer
            </button>

            <button
              type="submit"
              form="variable-form"
              id="btn-submit-variable-form"
              style={{
                ...rowActionButton18Style,
                backgroundColor: 'rgb(53, 86, 236)',
                color: '#ffffff',
                boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
              }}
              className="transition-all cursor-pointer"
            >
              Enregistrer
            </button>
          </div>
        </div>

        {/* Form Box */}
        <div
          className="w-full animate-fadeIn mt-6"
          style={{ marginTop: '24px' }}
          id="variable-form-box"
        >
          <style>{`
             #variable-form input:not([type="radio"]):not([type="checkbox"]),
             #variable-form select,
             #variable-form textarea {
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
               width: 100% !important;
             }
             #variable-form input:not([type="radio"]):not([type="checkbox"]):hover,
             #variable-form input:not([type="radio"]):not([type="checkbox"]):focus,
             #variable-form select:hover,
             #variable-form select:focus,
             #variable-form textarea:hover,
             #variable-form textarea:focus {
               outline: 2.5px solid #fa53d5 !important;
               outline-offset: 2px !important;
               transition: all 0s !important;
             }
             #variable-form input:not([type="radio"]):not([type="checkbox"])::placeholder,
             #variable-form textarea::placeholder {
               color: #8c8c8c !important;
               opacity: 1 !important;
               font-weight: 100 !important;
               font-family: "DefibeoMain", "Civilprom", sans-serif !important;
             }
             #variable-form select {
               appearance: none !important;
               -webkit-appearance: none !important;
               -moz-appearance: none !important;
               background-image: none !important;
             }
             #variable-form select option {
               color: #000000 !important;
               background: #ffffff !important;
               font-family: "DefibeoMain", "Civilprom", sans-serif !important;
             }
             #variable-form input:disabled {
               background: #f1f5f9 !important;
               color: #64748b !important;
               cursor: not-allowed !important;
               opacity: 0.8 !important;
             }
             #variable-form input:disabled:hover,
             #variable-form input:disabled:focus {
               outline: none !important;
             }
             #variable-form label {
               letter-spacing: normal !important;
               text-transform: none !important;
               font-size: 16px !important;
               color: #000000 !important;
               font-weight: 600 !important;
             }
          `}</style>
          
          <form onSubmit={handleSubmit} id="variable-form" className="space-y-6">
            {error && (
              <div
                className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-sans mb-4"
                id="variable-form-error"
                style={{ maxWidth: '98%', margin: 'auto' }}
              >
                {error}
              </div>
            )}

            <div className="space-y-6" style={{ maxWidth: '98%', margin: 'auto' }}>
              <div 
                className="bg-white p-5 space-y-4"
                style={{
                  border: '1px solid rgb(218, 218, 218)',
                  borderRadius: '18px',
                }}
              >
                {/* Sélection Catégorie */}
                <div className="space-y-1">
                  <label htmlFor="select-variable-category" className="block text-[11px] font-bold text-slate-500 uppercase">
                    Catégorie.
                  </label>
                  <select
                    id="select-variable-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as VariableCategory)}
                  >
                    <option value="" disabled hidden>Sélectionnez une catégorie.</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Titre de la variable */}
                <div className="space-y-1">
                  <label htmlFor="input-variable-nom" className="block text-[11px] font-bold text-slate-500 uppercase">
                    Titre de la variable.
                  </label>
                  <input
                    type="text"
                    id="input-variable-nom"
                    value={nom}
                    onChange={(e) => {
                      const filtered = e.target.value.replace(/[^a-zA-Z0-9\s-àâäéèêëîïôöùûüçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜÇŒÆ]/g, '');
                      setNom(filtered);
                    }}
                    required
                  />
                </div>

                {/* Identifiant. (optionnel) */}
                <div className="space-y-1">
                  <label htmlFor="input-variable-identifiant" className="block text-[11px] font-bold text-slate-500 uppercase">
                    Identifiant. (optionnel)
                  </label>
                  <input
                    type="text"
                    id="input-variable-identifiant"
                    value={identifiant}
                    onChange={(e) => setIdentifiant(e.target.value)}
                    placeholder="Ex: REF123"
                  />
                </div>

                {/* Optional Line Source de l'image (No sub-div, simple list flow) */}
                {category === 'Modèle Défibrillateur' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="input-variable-image" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Lien source de l'image.
                      </label>
                      <a
                        href="https://defibeo.com/school/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline"
                        style={{ textDecoration: 'none' }}
                      >
                        Récupérer un lien source
                      </a>
                    </div>
                    <input
                      type="url"
                      id="input-variable-image"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://"
                    />
                  </div>
                )}

                {/* Couleur hexadécimale (spécifique à Drapeau GMAO) */}
                {(category === 'Drapeau GMAO' || category === 'Drapeau post-intervention') && (
                  <div className="space-y-1">
                    <label htmlFor="input-variable-couleur-hex" className="block text-[11px] font-bold text-slate-500 uppercase">
                      Couleur hexadécimale (ex: #FF0000).
                    </label>
                    <input
                      type="text"
                      id="input-variable-couleur-hex"
                      value={couleurHex}
                      onChange={(e) => setCouleurHex(e.target.value)}
                      placeholder="#3556EC"
                      className="w-full"
                    />
                  </div>
                )}

                {/* Identifiant unique. */}
                <div className="space-y-1">
                  <label htmlFor="input-variable-unique-id" className="block text-[11px] font-bold text-slate-500 uppercase">
                    {t("Identifiant unique.")}
                  </label>
                  <input
                    type="text"
                    id="input-variable-unique-id"
                    value={editingVariable ? editingVariable.id : 'Nouveau (généré automatiquement)'}
                    disabled
                  />
                </div>

                {/* Commentaire sur la variable */}
                <div className="space-y-1">
                  <label htmlFor="input-variable-desc" className="block text-[11px] font-bold text-slate-500 uppercase">
                    {t("Commentaire sur la variable.")}
                  </label>
                  <textarea
                    id="input-variable-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("Entrez un commentaire.")}
                    rows={4}
                  />
                </div>
              </div>

              {/* Section Gérer les champs visibles */}
              {category === 'Modèle Défibrillateur' && (
                <div 
                  className="bg-white p-5 space-y-4 animate-fadeIn"
                  style={{
                    border: '1px solid rgb(218, 218, 218)',
                    borderRadius: '18px',
                  }}
                >
                  <div className="mb-2 bg-transparent">
                    <span 
                      className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                      style={{
                        backgroundColor: '#7b2882',
                        borderRadius: '1000px',
                        cursor: 'default',
                        fontWeight: 100,
                        textTransform: 'none',
                      }}
                    >
                      Gérer les champs visibles
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'Visibilité du champ : Numéro Atlasanté (Identification et photos).', value: visibiliteNumeroAtlasante, setter: setVisibiliteNumeroAtlasante },
                      { label: 'Visibilité du champ : Version du logiciel (Identification et photos).', value: visibiliteVersionLogiciel, setter: setVisibiliteVersionLogiciel },
                      { label: 'Visibilité du champ : Émettre un facture brouillon (Client).', value: visibiliteFactureBrouillon, setter: setVisibiliteFactureBrouillon },
                      { label: 'Visibilité du champ : PadPak (Électrode Adulte).', value: visibilitePadPakAdulte, setter: setVisibilitePadPakAdulte },
                      { label: 'Visibilité du champ : Lot PadPak A (Électrode Adulte).', value: visibiliteLotPadPakA, setter: setVisibiliteLotPadPakA },
                      { label: 'Visibilité du champ : Péremption PadPak A (Électrode Adulte).', value: visibilitePeremptionPadPakA, setter: setVisibilitePeremptionPadPakA },
                      { label: 'Visibilité du champ : Lot P (Électrode Pédiatrique).', value: visibiliteLotP, setter: setVisibiliteLotP },
                      { label: 'Visibilité du champ : PadPak (Électrode Pédiatrique).', value: visibilitePadPakPediatrique, setter: setVisibilitePadPakPediatrique },
                      { label: 'Visibilité du champ : Lot PadPak P (Électrode Pédiatrique).', value: visibiliteLotPadPakP, setter: setVisibiliteLotPadPakP },
                      { label: 'Visibilité du champ : Péremption PadPak P (Électrode Pédiatrique).', value: visibilitePeremptionPadPakP, setter: setVisibilitePeremptionPadPakP },
                      { label: 'Visibilité du champ : Fabrication (Batterie).', value: visibiliteFabricationBatterie, setter: setVisibiliteFabricationBatterie },
                      { label: 'Visibilité du champ : Insertion (Batterie).', value: visibiliteInsertionBatterie, setter: setVisibiliteInsertionBatterie },
                      { label: 'Visibilité du champ : Péremption (Batterie).', value: visibilitePeremptionBatterie, setter: setVisibilitePeremptionBatterie },
                      { label: 'Visibilité du champ : Pourcentage de charge (Batterie).', value: visibilitePourcentageBatterie, setter: setVisibilitePourcentageBatterie },
                      { label: 'Visibilité du champ : Paire de gants présents (Kit de secours).', value: visibiliteGantsPresents, setter: setVisibiliteGantsPresents },
                      { label: 'Visibilité du champ : Péremption des serviettes (Kit de secours).', value: visibilitePeremptionServiettes, setter: setVisibilitePeremptionServiettes },
                      { label: 'Visibilité du champ : Serviettes présentes (Kit de secours).', value: visibiliteServiettesPresentes, setter: setVisibiliteServiettesPresentes },
                      { label: 'Visibilité du champ : Péremption du masque (Kit de secours).', value: visibilitePeremptionMasque, setter: setVisibilitePeremptionMasque },
                      { label: 'Visibilité du champ : Masque présent (Kit de secours).', value: visibiliteMasquePresent, setter: setVisibiliteMasquePresent },
                      { label: 'Visibilité du champ : Ciseaux présents (Kit de secours).', value: visibiliteCiseauxPresents, setter: setVisibiliteCiseauxPresents },
                      { label: 'Visibilité du champ : Péremption de la trousse (Kit de secours).', value: visibilitePeremptionTrousse, setter: setVisibilitePeremptionTrousse },
                      { label: 'Visibilité du champ : Rasoir (Kit de secours).', value: visibiliteRasoir, setter: setVisibiliteRasoir },
                      { label: 'Visibilité du champ : Branchement conforme des électrodes (Vérifications).', value: visibiliteBranchementElectrodes, setter: setVisibiliteBranchementElectrodes },
                      { label: 'Visibilité du champ : Guides vocaux conformes (Vérifications).', value: visibiliteGuidesVocaux, setter: setVisibiliteGuidesVocaux },
                      { label: 'Visibilité du champ : Message numérique conforme (Vérifications).', value: visibiliteMessageNumeriqueConforme, setter: setVisibiliteMessageNumeriqueConforme },
                      { label: 'Visibilité du champ : Équipé d’un message numérique (Vérifications).', value: visibiliteEquipeMessageNumerique, setter: setVisibiliteEquipeMessageNumerique },
                      { label: 'Visibilité du champ : Voyant conforme (Vérifications).', value: visibiliteVoyantConforme, setter: setVisibiliteVoyantConforme },
                      { label: 'Visibilité du champ : Nettoyage (Vérifications).', value: visibiliteNettoyage, setter: setVisibiliteNettoyage },
                      { label: 'Visibilité du champ : Pièces jointes (1 à 3 fichiers) (Clôture).', value: visibilitePiecesJointes, setter: setVisibilitePiecesJointes },
                    ].map((cfg, i) => (
                      <div key={i} className="space-y-1 p-2 bg-transparent rounded-lg">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase">
                          {cfg.label}
                        </label>
                        <div className="flex gap-6 items-center pt-1">
                          <FormRadio 
                            label="Oui" 
                            checked={cfg.value === 'Oui'} 
                            onChange={() => cfg.setter('Oui')} 
                          />
                          <FormRadio 
                            label="Non" 
                            checked={cfg.value === 'Non'} 
                            onChange={() => cfg.setter('Non')} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 space-y-1">
                    <label htmlFor="input-infos-technicien" className="block text-[11px] font-bold text-slate-500 uppercase">
                      Info(s) au technicien.
                    </label>
                    <textarea
                      id="input-infos-technicien"
                      value={infosTechnicien}
                      onChange={(e) => setInfosTechnicien(e.target.value)}
                      placeholder="Entrez des informations ou consignes pour le technicine."
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {/* Section Rappel ou alerte */}
              {!hideRappelAlerte && (
                <div 
                  className="bg-white p-5 space-y-4 animate-fadeIn"
                  style={{
                    border: '1px solid rgb(218, 218, 218)',
                    borderRadius: '18px',
                  }}
                >
                  <div className="mb-2 bg-transparent">
                    <span 
                      className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                      style={{
                        backgroundColor: '#7b2882',
                        borderRadius: '1000px',
                        cursor: 'default',
                        fontWeight: 100,
                        textTransform: 'none',
                      }}
                    >
                      {t("Rappel ou alerte")}
                    </span>
                  </div>

                  <div 
                    className="font-sans leading-relaxed"
                    style={{
                      fontSize: '16px',
                      color: '#000000',
                      cursor: 'default',
                    }}
                  >
                    {t("Défibeo ne peut légalement pas être un tiers pour notifier les remontées sur les incidents techniques de matériel médical. C’est pourquoi cet emplacement est réservé à l’enregistrement des remontées des fabricants, communément appelées FSCA (Field Safety Corrective Action). Votre alerte remonte visuellement sur votre onglet « Défibrillateurs » et votre client voit également, depuis son portail, un incident relatif au matériel.")}
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="select-variable-rappel-option" className="block text-[11px] font-bold text-slate-500 uppercase">
                      {t("Type d'alerte / rappel.")}
                    </label>
                    <select
                      id="select-variable-rappel-option"
                      value={rappelAlerteOption}
                      onChange={(e) => setRappelAlerteOption(e.target.value)}
                    >
                      <option value="">{t("Aucun rappel ou alerte actif.")}</option>
                      <option value="Mise à jour logicielle — Orange">{t("Mise à jour logicielle — Orange")}</option>
                      <option value="Rappel atelier — Rouge">{t("Rappel atelier — Rouge")}</option>
                      <option value="Modification notice d'utilisation — Orange">{t("Modification notice d'utilisation — Orange")}</option>
                      <option value="Retrait du marché — Rouge">{t("Retrait du marché — Rouge")}</option>
                      <option value="Observation courante — Orange">{t("Observation courante — Orange")}</option>
                      <option value="Observation grave — Rouge">{t("Observation grave — Rouge")}</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label htmlFor="input-variable-rappel-debut" className="block text-[11px] font-bold text-slate-500 uppercase">
                        {t("Date de début.")}
                      </label>
                      <input
                        type="date"
                        id="input-variable-rappel-debut"
                        value={rappelDateDebut}
                        onChange={(e) => setRappelDateDebut(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="input-variable-rappel-fin" className="block text-[11px] font-bold text-slate-500 uppercase">
                        {t("Date de fin.")}
                      </label>
                      <input
                        type="date"
                        id="input-variable-rappel-fin"
                        value={rappelDateFin}
                        onChange={(e) => setRappelDateFin(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="input-variable-rappel-obs" className="block text-[11px] font-bold text-slate-500 uppercase">
                      {t("Observation sur le rappel ou l’alerte.")}
                    </label>
                    <textarea
                      id="input-variable-rappel-obs"
                      value={rappelObservation}
                      onChange={(e) => setRappelObservation(e.target.value)}
                      placeholder={t("Observation sur le rappel ou l’alerte.")}
                      rows={3}
                    />
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="variable-tab-container">
      {/* Upper Action Block & Search metrics */}
      <div 
        className="bg-white space-y-4"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" id="variable-tab-title" style={{ color: '#000000', cursor: 'default' }}>Variables</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white">
            {/* Field recherche (Search input) */}
            <div className="relative w-full sm:w-64 bg-white">
              <input
                type="text"
                id="search-variable-input"
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

            <button
              onClick={openAddModal}
              id="btn-add-variable"
              className="font-sans"
              style={{
                ...customButtonStyle,
                backgroundColor: 'rgb(53, 86, 236)',
                boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
              }}
            >
              Nouveau
            </button>
          </div>
        </div>
      </div>

      {/* Filters Pills Row - placed outside the header block, exactly like FSM and Stocks */}
      <div className="px-4 flex flex-wrap gap-2.5 justify-center sm:justify-start pt-5" id="variables-category-pills">
        {['Tous', ...CATEGORIES].map((cat) => {
          const isSelected = filterCategory === cat;
          let count = 0;
          if (cat === 'Tous') {
            count = variables.length;
          } else {
            count = variables.filter(v => v.category === cat).length;
          }
          
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              style={{
                borderRadius: '1000px',
                padding: '10px 20px',
                fontSize: '18px',
                fontWeight: 100,
                cursor: 'pointer',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                backgroundColor: isSelected ? '#fa53d5' : '#ffffff',
                color: isSelected ? '#ffffff' : '#000000',
                border: isSelected ? '1px solid #fa53d5' : '1px solid rgb(218, 218, 218)',
                transition: 'all 0.15s ease'
              }}
              className="transition-all"
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Main Table Records Sheet */}
      <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filteredVariables.length === 0 ? (
            <div className="p-16 text-center font-sans lg:py-24" id="no-variables-view">
              <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>Aucun résultat.</p>
            </div>
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="variables-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead>
                <tr className="bg-transparent border-b border-slate-100">
                  <th className="px-4 py-3.5 w-14 text-left whitespace-nowrap" style={thStyle}>Miniature.</th>
                  <th className="px-4 py-3.5 text-left whitespace-nowrap" style={thStyle}>Identifiant.</th>
                  <th className="px-4 py-3.5 text-left" style={thStyle}>Titre de la variable.</th>
                  <th className="px-4 py-3.5 text-left" style={thStyle}>Catégorie.</th>
                  <th className="px-4 py-3.5 text-left w-12" style={thStyle}>Actions.</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs">
                {filteredVariables.map((v) => {
                  const used = isVariableUsed(v);
                  return (
                    <tr
                      key={v.id}
                      id={`variable-row-${v.id}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button, a, input, select, option')) return;
                        openEditModal(v);
                      }}
                      className="group hover:bg-[#ffecf8] transition-all cursor-pointer"
                    >
                      {/* Visual box column */}
                      <td className="px-4 py-3.5">
                        <div className="w-14 h-14 rounded-md bg-white border border-slate-200 overflow-hidden relative flex items-center justify-center p-1.5" style={{ backgroundColor: '#ffffff' }}>
                          {v.category === 'Modèle Défibrillateur' && v.imageUrl ? (
                            <img
                              src={v.imageUrl}
                              alt={v.nom}
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                        </div>
                      </td>

                      {/* Identifiant */}
                      <td className="px-4 py-5 font-sans text-left whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                        {v.identifiant || ''}
                      </td>

                      {/* Nom de l'équipement */}
                      <td className="px-4 py-5 font-sans text-left" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                        <div className="font-semibold text-slate-950">
                          {v.nom}
                        </div>
                      </td>

                      {/* Catégorie technique */}
                      <td className="px-4 py-5 font-sans text-left">
                        <span 
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            borderRadius: '1000px',
                            backgroundColor: '#ffffff',
                            border: '1px solid rgb(231, 231, 231)',
                            color: '#000000',
                            fontSize: '16px',
                            fontWeight: 100,
                            padding: '4px 12px',
                          }}
                        >
                          {v.category}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-5 text-left whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => openEditModal(v)}
                            id={`btn-edit-variable-${v.id}`}
                            style={rowActionButton18Style}
                            className="cursor-pointer"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => {
                              if (!used) {
                                if (window.confirm(`Voulez-vous vraiment supprimer la variable "${v.nom}" ?`)) {
                                  onDeleteVariable(v.id);
                                }
                              }
                            }}
                            disabled={used}
                            title={used ? "Cette variable ne peut pas être supprimée car elle est utilisée au moins 1 fois dans un autre compartiment." : "Supprimer la variable"}
                            id={`btn-delete-variable-${v.id}`}
                            style={{
                              ...rowActionButton18Style,
                              opacity: used ? 0.35 : 1,
                              cursor: used ? 'not-allowed' : 'pointer'
                            }}
                            className="transition-all"
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

    </div>
  );
}
