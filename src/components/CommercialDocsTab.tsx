import React, { useState } from 'react';
import { Plus, Search, Filter, Trash2, Edit2, Download, RefreshCw, X, FileText } from 'lucide-react';
import { CommercialDoc, CommercialDocItem, Client, Variable, StockRecord, Member, CompanyInfo } from '../types';
import HelpBubble from './HelpBubble';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';

interface CommercialDocsTabProps {
  commercialDocs: CommercialDoc[];
  saveCommercialDocs: (docs: CommercialDoc[]) => void;
  clients: Client[];
  variables: Variable[];
  stocks: StockRecord[];
  members: Member[];
  companyInfo: CompanyInfo;
  tenantId?: string;
  t: (key: string) => string;
  handleDownloadDoc?: (doc: CommercialDoc) => void;
  handleTransformDoc?: (doc: CommercialDoc, targetType: 'Devis' | 'Facture' | 'Bon de commande' | 'Bon de livraison') => void;
  triggerPennylaneSync?: (doc: CommercialDoc) => void;
}

export default function CommercialDocsTab({
  commercialDocs,
  saveCommercialDocs,
  clients,
  variables,
  stocks,
  members,
  companyInfo,
  tenantId = 'demo',
  t,
  handleDownloadDoc,
  handleTransformDoc,
  triggerPennylaneSync
}: CommercialDocsTabProps) {
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'Tous' | 'Devis' | 'Facture' | 'Bon de commande' | 'Bon de livraison' | 'Proforma'>('Tous');
  const [isDocFormOpen, setIsDocFormOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  // Form State
  const [docType, setDocType] = useState<'Devis' | 'Facture' | 'Proforma' | 'Bon de commande' | 'Bon de livraison'>('Devis');
  const [docRef, setDocRef] = useState('');
  const [docClientId, setDocClientId] = useState('');
  const [docDateStr, setDocDateStr] = useState(new Date().toISOString().substring(0, 10));
  const [docStatus, setDocStatus] = useState<'Brouillon' | 'Terminé' | 'Accepté' | 'Refusé' | 'Annulé' | 'Supprimé'>('Brouillon');
  const [docItems, setDocItems] = useState<CommercialDocItem[]>([]);
  const [docCommentaire, setDocCommentaire] = useState('');
  const [docCommentaires, setDocCommentaires] = useState('');
  const [docUrlSource, setDocUrlSource] = useState('');
  const [docAssignedMemberName, setDocAssignedMemberName] = useState('');
  const [docHasBonCommande, setDocHasBonCommande] = useState(false);
  const [docBonCommandeReference, setDocBonCommandeReference] = useState('');
  const [docBonCommandeLivraison, setDocBonCommandeLivraison] = useState<'Intervention' | 'Transporteur'>('Transporteur');
  const [docBonCommandeSituation, setDocBonCommandeSituation] = useState<'Ouvert' | 'Envoyé Terminé' | 'Envoyé Logistique' | 'Terminé'>('Ouvert');
  const [docBonCommandeEntete, setDocBonCommandeEntete] = useState('');
  const [docCodeTaxe, setDocCodeTaxe] = useState('');
  const [docPayeurId, setDocPayeurId] = useState('');
  const [docClientIdField, setDocClientIdField] = useState('');

  // Item form input states
  const [selectedPieceId, setSelectedPieceId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedPrice, setSelectedPrice] = useState(0);

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
    fontSize: '15px',
    padding: '8px 16px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
  };

  const itemValueStyle: React.CSSProperties = {
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    fontSize: '16px',
    color: '#000000',
    fontWeight: 100,
  };

  const tenantCommercialDocs = commercialDocs.filter((doc) => {
    if (tenantId !== 'demo') {
      const dEnv = (doc.envId || doc.tenantId || '').trim().toLowerCase();
      const cleanTenant = tenantId.trim().toLowerCase();
      const numTenant = cleanTenant.replace(/^d/i, '');
      if (dEnv === 'demo') return false;
      if (dEnv && dEnv !== cleanTenant && dEnv.replace(/^d/i, '') !== numTenant) return false;
      if (!dEnv && doc.clientDenomination && (doc.clientDenomination.includes('Medical360') || doc.clientDenomination.includes('SecoursProOuest'))) return false;
    }
    return true;
  });

  const filtDocs = tenantCommercialDocs.filter((doc) => {
    const matchType =
      docTypeFilter === 'Tous' ||
      (docTypeFilter === 'Bon de commande' ? (doc.type === 'Bon de commande' || !!doc.hasBonCommande) : doc.type === docTypeFilter);
    const query = docSearchQuery.trim().toLowerCase();
    const matchSearch =
      !query ||
      (doc.ref && doc.ref.toLowerCase().includes(query)) ||
      (doc.clientDenomination && doc.clientDenomination.toLowerCase().includes(query)) ||
      (doc.items && doc.items.some((item) => item.nomPiece && item.nomPiece.toLowerCase().includes(query)));
    return matchType && matchSearch;
  });

  const generateAutoRef = (type: string) => {
    const prefixMap: Record<string, string> = {
      'Devis': 'DEV',
      'Facture': 'FACT',
      'Bon de commande': 'BC',
      'Bon de livraison': 'BL',
      'Proforma': 'PRO'
    };
    const prefix = prefixMap[type] || 'DOC';
    const year = '2026';
    const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
    let maxNum = 0;
    for (const d of commercialDocs) {
      if (d.type === type && d.ref) {
        const match = d.ref.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    return `${prefix}-${year}-${String(maxNum + 1).padStart(4, '0')}`;
  };

  const startNewDoc = () => {
    setEditingDocId(null);
    setDocType('Devis');
    setDocRef(generateAutoRef('Devis'));
    setDocClientId(clients[0]?.id || '');
    setDocDateStr(new Date().toISOString().substring(0, 10));
    setDocStatus('Brouillon');
    setDocItems([]);
    setDocCommentaire('');
    setDocCommentaires('');
    setDocUrlSource('');
    setDocAssignedMemberName(members[0]?.name || '');
    setDocHasBonCommande(false);
    setDocBonCommandeReference('');
    setDocBonCommandeLivraison('Transporteur');
    setDocBonCommandeSituation('Ouvert');
    setDocBonCommandeEntete('');
    setDocCodeTaxe('');
    setDocPayeurId('');
    setDocClientIdField('');
    setIsDocFormOpen(true);
  };

  const startEditDoc = (doc: CommercialDoc) => {
    setEditingDocId(doc.id);
    setDocType(doc.type);
    setDocRef(doc.ref);
    setDocClientId(doc.clientId);
    setDocDateStr(doc.dateStr);
    setDocStatus(doc.status);
    setDocItems(doc.items || []);
    setDocCommentaire(doc.commentaire || '');
    setDocCommentaires(doc.commentaires || '');
    setDocUrlSource(doc.urlSource || '');
    setDocAssignedMemberName(doc.assignedMemberName || '');
    setDocHasBonCommande(!!doc.hasBonCommande);
    setDocBonCommandeReference(doc.bonCommandeReference || '');
    setDocBonCommandeLivraison(doc.bonCommandeLivraison || 'Transporteur');
    setDocBonCommandeSituation(doc.bonCommandeSituation || 'Ouvert');
    setDocBonCommandeEntete(doc.bonCommandeEntete || '');
    setDocCodeTaxe(doc.codeTaxe || '');
    setDocPayeurId(doc.payeurId || '');
    setDocClientIdField(doc.clientIdField || '');
    setIsDocFormOpen(true);
  };

  const handleAddItem = () => {
    if (!selectedPieceId) return;
    const foundVar = variables.find(v => v.id === selectedPieceId);
    if (!foundVar) return;
    const matchedStock = stocks.find(s => s.denominationPieceId === selectedPieceId);
    const ugs = matchedStock?.ugs || '';
    const defaultPrice = matchedStock?.prixVenteHt || (foundVar as any)?.prixVenteHt || 0;
    const newItem: CommercialDocItem = {
      variableId: selectedPieceId,
      nomPiece: `${foundVar.nom} (${foundVar.marque})`,
      prixVenteHt: selectedPrice > 0 ? selectedPrice : defaultPrice,
      quantite: selectedQty > 0 ? selectedQty : 1,
      ugs
    };
    setDocItems([...docItems, newItem]);
    setSelectedPieceId('');
    setSelectedQty(1);
    setSelectedPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    setDocItems(docItems.filter((_, idx) => idx !== index));
  };

  const handleSaveDoc = (e: React.FormEvent) => {
    e.preventDefault();
    const activeClient = clients.find(c => c.id === docClientId);
    if (!activeClient) {
      alert("Veuillez sélectionner un client.");
      return;
    }
    if (docItems.length === 0) {
      alert("Veuillez ajouter au moins une pièce ou une ligne au document.");
      return;
    }
    const calculatedTotalHt = docItems.reduce((acc, item) => acc + (item.prixVenteHt * item.quantite), 0);
    let finalBcRef = docBonCommandeReference;
    if (docHasBonCommande && !finalBcRef) {
      finalBcRef = generateAutoRef('Bon de commande');
    }

    if (editingDocId) {
      const updatedDocs = commercialDocs.map(d => d.id === editingDocId ? {
        ...d,
        ref: docRef || d.ref,
        type: docType,
        clientId: docClientId,
        clientDenomination: activeClient.denomination,
        dateStr: docDateStr,
        status: docStatus,
        items: docItems,
        totalHt: calculatedTotalHt,
        commentaire: docCommentaire,
        commentaires: docCommentaires,
        urlSource: docUrlSource,
        assignedMemberName: docAssignedMemberName,
        hasBonCommande: docHasBonCommande,
        bonCommandeReference: finalBcRef,
        bonCommandeLivraison: docBonCommandeLivraison,
        bonCommandeSituation: docBonCommandeSituation,
        bonCommandeEntete: docBonCommandeEntete,
        codeTaxe: docCodeTaxe,
        payeurId: docPayeurId,
        clientIdField: docClientIdField
      } : d);
      saveCommercialDocs(updatedDocs);
    } else {
      const newDoc: CommercialDoc = {
        id: 'doc-' + Date.now(),
        ref: docRef || generateAutoRef(docType),
        type: docType,
        clientId: docClientId,
        clientDenomination: activeClient.denomination,
        dateStr: docDateStr,
        status: docStatus,
        items: docItems,
        totalHt: calculatedTotalHt,
        commentaire: docCommentaire,
        commentaires: docCommentaires,
        urlSource: docUrlSource,
        assignedMemberName: docAssignedMemberName,
        hasBonCommande: docHasBonCommande,
        bonCommandeReference: finalBcRef,
        bonCommandeLivraison: docBonCommandeLivraison,
        bonCommandeSituation: docBonCommandeSituation,
        bonCommandeEntete: docBonCommandeEntete,
        codeTaxe: docCodeTaxe,
        payeurId: docPayeurId,
        clientIdField: docClientIdField
      };
      saveCommercialDocs([newDoc, ...commercialDocs]);
    }
    setIsDocFormOpen(false);
    setEditingDocId(null);
  };

  const handleDeleteDoc = (id: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce document commercial ?")) {
      saveCommercialDocs(commercialDocs.filter(d => d.id !== id));
    }
  };

  const handleTransform = (doc: CommercialDoc, targetType: 'Devis' | 'Facture' | 'Bon de commande' | 'Bon de livraison') => {
    if (handleTransformDoc) {
      handleTransformDoc(doc, targetType);
    } else {
      const newRef = generateAutoRef(targetType);
      const newDoc: CommercialDoc = {
        ...doc,
        id: 'doc-' + Date.now(),
        ref: newRef,
        type: targetType,
        status: 'Brouillon',
        dateStr: new Date().toISOString().substring(0, 10),
      };
      saveCommercialDocs([newDoc, ...commercialDocs]);
      alert(`${doc.type} ${doc.ref} transformé avec succès en ${targetType} (${newRef})`);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="devis-tab-container-harmonized">
      <style>{`
        #devis-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-devis-input),
        #devis-tab-container-harmonized select:not(.transformer-select),
        #devis-tab-container-harmonized textarea {
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
        #devis-tab-container-harmonized select.transformer-select {
          background: #000000 !important;
          color: #ffffff !important;
          font-size: 18px !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 13px !important;
          padding: 9px 19px !important;
          cursor: pointer !important;
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          text-align: center !important;
          text-align-last: center !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          max-width: 145px !important;
        }
        #devis-tab-container-harmonized select.transformer-select option {
          background: #ffffff !important;
          color: #000000 !important;
        }
        #devis-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-devis-input),
        #devis-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-devis-input),
        #devis-tab-container-harmonized select:not(.transformer-select):hover:not(:disabled),
        #devis-tab-container-harmonized select:not(.transformer-select):focus:not(:disabled),
        #devis-tab-container-harmonized textarea:hover:not(:disabled),
        #devis-tab-container-harmonized textarea:focus:not(:disabled),
        #devis-tab-container-harmonized #search-devis-input:hover,
        #devis-tab-container-harmonized #search-devis-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #devis-tab-container-harmonized select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
        }
        #devis-tab-container-harmonized select option {
          color: #000000 !important;
          background: #ffffff !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #devis-tab-container-harmonized input[type="date"]::-webkit-calendar-picker-indicator {
          display: none !important;
          -webkit-appearance: none !important;
          background: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        #devis-tab-container-harmonized input[type="radio"] {
          appearance: none !important;
          -webkit-appearance: none !important;
          width: 18px !important;
          height: 18px !important;
          border: 1px solid #dedede !important;
          border-radius: 50% !important;
          outline: none !important;
          background-color: #ffffff !important;
          cursor: pointer !important;
          position: relative !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          transition: all 0.2s ease !important;
          margin-right: 6px !important;
        }
        #devis-tab-container-harmonized input[type="radio"]:hover {
          border-color: oklch(0.44 0.16 324.65) !important;
          outline: none !important;
        }
        #devis-tab-container-harmonized input[type="radio"]:checked {
          border-color: oklch(0.44 0.16 324.65) !important;
          background-color: oklch(0.44 0.16 324.65) !important;
          outline: none !important;
        }
        #devis-tab-container-harmonized input[type="radio"]:checked::after {
          content: "" !important;
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: 8px !important;
          height: 8px !important;
          background-color: #ffffff !important;
          border-radius: 50% !important;
        }
        #devis-tab-container-harmonized label,
        #devis-tab-container-harmonized .devis-label-style {
          letter-spacing: normal !important;
          text-transform: none !important;
          font-size: 16px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
        #devis-tab-container-harmonized input:disabled,
        #devis-tab-container-harmonized select:disabled {
          background-color: #f1f5f9 !important;
          color: #555555 !important;
          cursor: not-allowed !important;
          opacity: 0.82 !important;
        }
      `}</style>

      {!isDocFormOpen ? (
        <>
          {/* Dashboard List Header */}
          <div 
            className="bg-white space-y-4"
            style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
              <div>
                <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default' }} id="devis-tab-title">{t("Commandes")}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white">
                {/* Field recherche */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    id="search-devis-input"
                    placeholder={t("Rechercher pièce...")}
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                  />
                  {docSearchQuery && (
                    <button onClick={() => setDocSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filter Type */}
                <div className="flex items-center gap-2 bg-white">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <select
                    value={docTypeFilter}
                    onChange={(e) => setDocTypeFilter(e.target.value as any)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="Tous">{t("Tous les types")}</option>
                    <option value="Devis">{t("Devis")}</option>
                    <option value="Facture">{t("Factures")}</option>
                    <option value="Bon de commande">{t("Bons de commande")}</option>
                    <option value="Bon de livraison">{t("Bons de livraison")}</option>
                    <option value="Proforma">{t("Proforma")}</option>
                  </select>
                </div>

                <button
                  type="button"
                  id="btn-create-commercial-doc"
                  onClick={startNewDoc}
                  style={customButtonStyle}
                >
                  <Plus className="w-4 h-4" />
                  {t("Créer une pièce")}
                </button>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm max-w-[98%] mx-auto">
            {filtDocs.length === 0 ? (
              <EmptyTablePlaceholder message={t("Aucune pièce commerciale enregistrée")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" id="table-commercial-docs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700" style={thStyle}>{t("Réf.")}</th>
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700" style={thStyle}>{t("Type")}</th>
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700" style={thStyle}>{t("Client")}</th>
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700" style={thStyle}>{t("Date")}</th>
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700" style={thStyle}>{t("Articles")}</th>
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700 text-right" style={thStyle}>{t("Total HT")}</th>
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700 text-center" style={thStyle}>{t("Statut")}</th>
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700 text-center" style={thStyle}>{t("Transformer")}</th>
                      <th className="py-3.5 px-4 text-sm font-semibold text-gray-700 text-right" style={thStyle}>{t("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtDocs.map((doc) => {
                      const totalTtc = (doc.totalHt || 0) * 1.2;
                      return (
                        <tr key={doc.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-3 px-4 text-sm font-bold text-gray-900" style={itemValueStyle}>
                            {doc.ref}
                          </td>
                          <td className="py-3 px-4 text-sm" style={itemValueStyle}>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              doc.type === 'Facture' ? 'bg-blue-100 text-blue-800' :
                              doc.type === 'Devis' ? 'bg-purple-100 text-purple-800' :
                              doc.type === 'Bon de commande' ? 'bg-emerald-100 text-emerald-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {doc.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-800" style={itemValueStyle}>
                            {doc.clientDenomination}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600" style={itemValueStyle}>
                            {doc.dateStr}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600" style={itemValueStyle}>
                            {doc.items?.length || 0} {t("article(s)")}
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-medium text-gray-900" style={itemValueStyle}>
                            {(doc.totalHt || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              doc.status === 'Accepté' || doc.status === 'Terminé' ? 'bg-green-100 text-green-800' :
                              doc.status === 'Refusé' || doc.status === 'Annulé' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {doc.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleTransform(doc, e.target.value as any);
                                }
                              }}
                              className="transformer-select text-xs py-1.5 px-3 rounded-lg border border-gray-200 bg-white"
                            >
                              <option value="">{t("Transformer...")}</option>
                              <option value="Devis">{t("En Devis")}</option>
                              <option value="Facture">{t("En Facture")}</option>
                              <option value="Bon de commande">{t("En Bon de commande")}</option>
                              <option value="Bon de livraison">{t("En Bon de livraison")}</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            {handleDownloadDoc && (
                              <button
                                type="button"
                                onClick={() => handleDownloadDoc(doc)}
                                className="p-1.5 text-gray-500 hover:text-black rounded-lg hover:bg-gray-100 transition-colors"
                                title={t("Imprimer / PDF")}
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            {doc.type === 'Facture' && triggerPennylaneSync && (
                              <button
                                type="button"
                                onClick={() => triggerPennylaneSync(doc)}
                                className="p-1.5 text-blue-500 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                                title={t("Synchroniser Pennylane")}
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditDoc(doc)}
                              className="p-1.5 text-gray-500 hover:text-black rounded-lg hover:bg-gray-100 transition-colors"
                              title={t("Modifier")}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="p-1.5 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                              title={t("Supprimer")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Form View */
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <h3 className="text-xl font-bold text-gray-900">
              {editingDocId ? t("Modifier la pièce commerciale") : t("Créer une nouvelle pièce")}
            </h3>
            <button
              type="button"
              onClick={() => setIsDocFormOpen(false)}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveDoc} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("Type de pièce")}</label>
                <select
                  value={docType}
                  onChange={(e) => {
                    const newT = e.target.value as any;
                    setDocType(newT);
                    if (!editingDocId) setDocRef(generateAutoRef(newT));
                  }}
                  className="w-full border border-gray-200 rounded-xl p-2.5 bg-white"
                >
                  <option value="Devis">{t("Devis")}</option>
                  <option value="Facture">{t("Facture")}</option>
                  <option value="Bon de commande">{t("Bon de commande")}</option>
                  <option value="Bon de livraison">{t("Bon de livraison")}</option>
                  <option value="Proforma">{t("Proforma")}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("Référence")}</label>
                <input
                  type="text"
                  value={docRef}
                  onChange={(e) => setDocRef(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2.5"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("Date")}</label>
                <input
                  type="date"
                  value={docDateStr}
                  onChange={(e) => setDocDateStr(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2.5"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("Client")}</label>
                <select
                  value={docClientId}
                  onChange={(e) => setDocClientId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2.5 bg-white"
                  required
                >
                  <option value="">{t("Sélectionner un client...")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.denomination} ({c.ville || c.codePostal || 'Client'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("Statut")}</label>
                <select
                  value={docStatus}
                  onChange={(e) => setDocStatus(e.target.value as any)}
                  className="w-full border border-gray-200 rounded-xl p-2.5 bg-white"
                >
                  <option value="Brouillon">{t("Brouillon")}</option>
                  <option value="Accepté">{t("Accepté")}</option>
                  <option value="Terminé">{t("Terminé")}</option>
                  <option value="Refusé">{t("Refusé")}</option>
                  <option value="Annulé">{t("Annulé")}</option>
                </select>
              </div>
            </div>

            {/* Articles Section */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-4">
              <h4 className="font-semibold text-gray-900 text-sm">{t("Lignes d'articles / Prestations")}</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-gray-50 p-3 rounded-lg">
                <div className="md:col-span-6">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("Article / Pièce")}</label>
                  <select
                    value={selectedPieceId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedPieceId(id);
                      const f = variables.find(v => v.id === id);
                      const st = stocks.find(s => s.denominationPieceId === id);
                      const p = st?.prixVenteHt || (f as any)?.prixVenteHt || 0;
                      if (p) setSelectedPrice(p);
                    }}
                    className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white"
                  >
                    <option value="">{t("Choisir un article...")}</option>
                    {variables.map((v) => {
                      const st = stocks.find(s => s.denominationPieceId === v.id);
                      const p = st?.prixVenteHt || (v as any)?.prixVenteHt || 0;
                      return (
                        <option key={v.id} value={v.id}>
                          {v.nom} ({v.marque}){p > 0 ? ` - ${p} €` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("Qté")}</label>
                  <input
                    type="number"
                    min="1"
                    value={selectedQty}
                    onChange={(e) => setSelectedQty(parseInt(e.target.value, 10) || 1)}
                    className="w-full border border-gray-200 rounded-lg p-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("Prix unitaire HT")}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedPrice}
                    onChange={(e) => setSelectedPrice(parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-200 rounded-lg p-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full bg-black text-white py-2 px-3 rounded-lg text-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    {t("Ajouter")}
                  </button>
                </div>
              </div>

              {/* Items List */}
              {docItems.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500 text-xs">
                        <th className="py-2 text-left">{t("Désignation")}</th>
                        <th className="py-2 text-center">{t("Qté")}</th>
                        <th className="py-2 text-right">{t("Prix Unit. HT")}</th>
                        <th className="py-2 text-right">{t("Total HT")}</th>
                        <th className="py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {docItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 text-gray-800">{item.nomPiece}</td>
                          <td className="py-2 text-center">{item.quantite}</td>
                          <td className="py-2 text-right">{item.prixVenteHt.toFixed(2)} €</td>
                          <td className="py-2 text-right font-medium">{(item.prixVenteHt * item.quantite).toFixed(2)} €</td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 font-bold">
                        <td colSpan={3} className="py-3 text-right">{t("Total HT")} :</td>
                        <td className="py-3 text-right">
                          {docItems.reduce((acc, i) => acc + (i.prixVenteHt * i.quantite), 0).toFixed(2)} €
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Comment Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("Remarques / Mentions")}</label>
                <textarea
                  rows={3}
                  value={docCommentaire}
                  onChange={(e) => setDocCommentaire(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2.5"
                  placeholder={t("Notes visibles sur le document...")}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("Commentaires internes")}</label>
                <textarea
                  rows={3}
                  value={docCommentaires}
                  onChange={(e) => setDocCommentaires(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2.5"
                  placeholder={t("Notes internes réservées à l'équipe...")}
                />
              </div>
            </div>

            {/* Form actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsDocFormOpen(false)}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t("Annuler")}
              </button>
              <button
                type="submit"
                style={customButtonStyle}
              >
                {t("Enregistrer la pièce")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
