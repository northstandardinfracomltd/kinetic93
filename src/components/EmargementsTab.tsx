import React, { useState, useRef, useEffect } from 'react';
import { EmargementRecord, EmargementStagiaireItem, FormationRecord, StagiaireRecord, Member, CompanyInfo } from '../types';

interface EmargementsTabProps {
  emargements: EmargementRecord[];
  saveEmargements: (updated: EmargementRecord[]) => void;
  formations: FormationRecord[];
  stagiaires: StagiaireRecord[];
  members: Member[];
  companyInfo?: CompanyInfo;
}

interface SignaturePadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
}

function SignaturePad({ value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [value]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    ctx.beginPath();
    ctx.moveTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL());
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div className="space-y-2" style={{ maxWidth: '380px', width: '100%' }}>
      <div className="border border-slate-300 rounded-[13px] overflow-hidden bg-white relative">
        <canvas
          ref={canvasRef}
          width={380}
          height={140}
          className="w-full h-[140px] cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleClear}
          className="text-slate-600 hover:text-black font-medium cursor-pointer"
          style={{ fontSize: '16px', border: 'none', background: 'none' }}
        >
          Effacer la signature
        </button>
      </div>
    </div>
  );
}

export default function EmargementsTab({
  emargements,
  saveEmargements,
  formations,
  stagiaires,
  members,
  companyInfo,
}: EmargementsTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [formationId, setFormationId] = useState('');
  const [statut, setStatut] = useState<'Brouillon' | 'Terminé'>('Brouillon');
  const [stagiairesItems, setStagiairesItems] = useState<EmargementStagiaireItem[]>([]);

  // Search
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleDownloadCertificat = (stItem: EmargementStagiaireItem) => {
    const stagiaire = stagiaires.find((s) => s.id === stItem.stagiaireId);
    const stagiaireName = stagiaire ? stagiaire.nomPrenom : (stItem.stagiaireId || 'Stagiaire');

    const formation = formations.find((f) => f.id === formationId);
    const formationTitle = formation ? formation.intitule : 'Formation';

    const dateHorodatage = stItem.horodatage || (formation?.dateHeure ? formation.dateHeure.replace('T', ' ') : new Date().toLocaleDateString('fr-FR'));

    const formateurObj = members.find((m) => m.id === formation?.formateurId || m.email === formation?.formateurId);
    const formateurName = formateurObj
      ? ((formateurObj.name || `${formateurObj.firstname || ''} ${formateurObj.lastname || ''}`).trim() || formateurObj.email || 'Non renseigné')
      : (formation?.formateurId || 'Non renseigné');

    const lieuParts = [formation?.ville, formation?.codePostal].filter(Boolean);
    const lieuFormation = lieuParts.length > 0
      ? lieuParts.join(' ')
      : ([formation?.adresse, formation?.ville].filter(Boolean).join(', ') || 'Non renseigné');

    const companyName = companyInfo?.name || 'Entreprise';
    const logoUrl = companyInfo?.logo || companyInfo?.pdfHeaderImg || '';
    const stagiaireSig = stItem.signature || '';

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Certificat de Formation - ${stagiaireName}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 0;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      background-color: #ffffff;
      font-family: "DefibeoMain", "Civilprom", system-ui, -apple-system, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-wrapper {
      width: 297mm;
      height: 210mm;
      padding: 10mm;
      margin: 0 auto;
      background: #ffffff;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      font-family: "DefibeoMain", "Civilprom", system-ui, -apple-system, sans-serif;
    }
    .corniche-border {
      flex: 1;
      width: 100%;
      height: 100%;
      border: 10px solid #65216D;
      outline: 3px solid #FD4EBB;
      outline-offset: -12px;
      padding: 24px 36px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #ffffff;
      position: relative;
    }
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 10px;
    }
    .logo-img {
      max-height: 55px;
      max-width: 220px;
      object-fit: contain;
    }
    .company-title {
      font-size: 20px;
      font-weight: 800;
      color: #65216D;
      letter-spacing: 0.5px;
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
    }
    .company-sub {
      font-size: 12px;
      color: #000000;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
    }
    .cert-heading {
      text-align: center;
      margin: 6px 0;
    }
    .cert-title {
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
      font-size: 32px;
      font-weight: 700;
      color: #65216D;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin: 0;
    }
    .cert-sub {
      font-size: 14px;
      color: #000000;
      margin-top: 4px;
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
    }
    .cert-body {
      text-align: center;
      margin: 6px 0;
    }
    .cert-intro {
      font-size: 15px;
      color: #000000;
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
    }
    .stagiaire-name {
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
      font-size: 28px;
      font-weight: 700;
      color: #0362FF;
      display: inline-block;
      padding: 4px 24px;
      margin: 8px 0;
    }
    .formation-banner {
      background: #ffffff;
      border: 2px solid #0362FF;
      border-radius: 13px;
      padding: 12px 20px;
      margin: 8px auto;
      max-width: 92%;
      text-align: center;
    }
    .formation-title {
      font-size: 20px;
      font-weight: 700;
      color: #65216D;
      margin: 0;
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 28px;
      background: #ffffff;
      border: 2px solid #65216D;
      border-radius: 13px;
      padding: 12px 20px;
      font-size: 14px;
      color: #000000;
      margin: 6px 0;
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
    }
    .info-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .info-label {
      font-weight: 700;
      color: #65216D;
      min-width: 160px;
    }
    .signatures-container {
      display: flex;
      justify-content: space-between;
      gap: 30px;
      margin-top: 10px;
    }
    .signature-card {
      flex: 1;
      border: 2px solid #65216D;
      border-radius: 13px;
      padding: 10px 14px;
      background: #ffffff;
      min-height: 90px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-family: "DefibeoMain", "Civilprom", system-ui, sans-serif;
    }
    .sig-title {
      font-size: 12px;
      font-weight: 700;
      color: #65216D;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .sig-body {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 4px;
    }
    .sig-image {
      max-height: 55px;
      max-width: 100%;
      object-fit: contain;
    }

    @media print {
      body {
        width: 297mm;
        height: 210mm;
      }
      .page-wrapper {
        width: 297mm;
        height: 210mm;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="corniche-border">
      <!-- HEADER -->
      <div class="header-bar">
        <div>
          ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="Logo" />` : `<div class="company-title">${companyName}</div>`}
        </div>
        <div style="text-align: right;">
          <div class="company-title" style="font-size: 16px;">${companyName}</div>
          <div class="company-sub">Organisme de Formation</div>
        </div>
      </div>

      <!-- TITLE -->
      <div class="cert-heading">
        <h1 class="cert-title">Certificat de Formation</h1>
        <div class="cert-sub">Attestation officielle de fin de formation et d'émargement</div>
      </div>

      <!-- BODY -->
      <div class="cert-body">
        <div class="cert-intro">Ce certificat est attribué à :</div>
        <div class="stagiaire-name">${stagiaireName}</div>
        <div class="cert-intro">pour avoir suivi et validé avec succès la formation :</div>
      </div>

      <!-- FORMATION TITLE -->
      <div class="formation-banner">
        <div class="formation-title">${formationTitle}</div>
      </div>

      <!-- DETAILS GRID -->
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Date (Horodatage) :</span>
          <span>${dateHorodatage}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Formateur :</span>
          <span>${formateurName}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Lieu de la formation :</span>
          <span>${lieuFormation}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Entreprise délivrance :</span>
          <span>${companyName}</span>
        </div>
      </div>

      <!-- SIGNATURES & TAMPON -->
      <div class="signatures-container">
        <div class="signature-card">
          <div class="sig-title">Signature du Stagiaire</div>
          <div class="sig-body">
            ${stagiaireSig ? `<img src="${stagiaireSig}" class="sig-image" alt="Signature Stagiaire" />` : `<span style="font-size: 12px; color: #000000; font-style: italic;">[ Signature Stagiaire ]</span>`}
          </div>
        </div>
        <div class="signature-card">
          <div class="sig-title">Tampon & Signature de l'Entreprise</div>
          <div class="sig-body"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const getFormationDisplayLabel = (fId: string) => {
    const f = formations.find((item) => item.id === fId);
    if (!f) return fId || '-';
    const formateurObj = members.find((m) => m.id === f.formateurId);
    const formateurName = formateurObj
      ? (formateurObj.name || `${formateurObj.firstname || ''} ${formateurObj.lastname || ''}`).trim() || formateurObj.email
      : f.formateurId || 'Aucun';
    const dateFormatted = f.dateHeure ? f.dateHeure.replace('T', ' ') : 'Date non définie';
    return `${f.intitule || 'Formation'} - ${dateFormatted} - ${formateurName}`;
  };

  const getStagiaireDisplayLabel = (sId: string) => {
    const s = stagiaires.find((item) => item.id === sId);
    if (!s) return sId || '-';
    const dateNaiss = s.dateNaissance ? s.dateNaissance : 'Date non renseignée';
    return `${s.nomPrenom || 'Stagiaire'} - ${dateNaiss}`;
  };

  const startNewEmargement = () => {
    setFormationId('');
    setStatut('Brouillon');
    setStagiairesItems([]);
    setEditingId(null);
    setIsFormOpen(true);
  };

  const startEditEmargement = (e: EmargementRecord) => {
    setFormationId(e.formationId || '');
    setStatut(e.statut || 'Brouillon');
    setStagiairesItems(e.stagiaires ? JSON.parse(JSON.stringify(e.stagiaires)) : []);
    setEditingId(e.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm('Voulez-vous vraiment supprimer cet émargement ?')) {
      const updated = emargements.filter((item) => item.id !== id);
      saveEmargements(updated);
    }
  };

  const handleAddStagiaireItem = () => {
    if (stagiairesItems.length >= 50) {
      alert('Nombre maximum de 50 stagiaires atteint.');
      return;
    }

    const now = new Date();
    const formattedNow = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    const newItem: EmargementStagiaireItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      stagiaireId: '',
      present: 'Non',
      signature: '',
      horodatage: formattedNow,
      validation: 'Non',
    };

    setStagiairesItems([...stagiairesItems, newItem]);
  };

  const handleRemoveStagiaireItem = (id: string) => {
    setStagiairesItems(stagiairesItems.filter((item) => item.id !== id));
  };

  const handleUpdateStagiaireItem = (id: string, fields: Partial<EmargementStagiaireItem>) => {
    setStagiairesItems(
      stagiairesItems.map((item) => {
        if (item.id === id) {
          return { ...item, ...fields };
        }
        return item;
      })
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formationId) {
      alert('Veuillez sélectionner une formation.');
      return;
    }

    const now = new Date().toISOString();
    let updatedList: EmargementRecord[];

    if (editingId) {
      updatedList = emargements.map((item) => {
        if (item.id === editingId) {
          return {
            ...item,
            formationId,
            statut,
            stagiaires: stagiairesItems,
            updatedAt: now,
          };
        }
        return item;
      });
    } else {
      const newRecord: EmargementRecord = {
        id: `emarg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        formationId,
        statut,
        stagiaires: stagiairesItems,
        createdAt: now,
        updatedAt: now,
      };
      updatedList = [newRecord, ...emargements];
    }

    saveEmargements(updatedList);
    setIsFormOpen(false);
  };

  const filteredEmargements = emargements.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const label = getFormationDisplayLabel(item.formationId).toLowerCase();
    return label.includes(q) || item.statut?.toLowerCase().includes(q);
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

  const purpleButtonStyle: React.CSSProperties = {
    ...rowActionButton18Style,
    backgroundColor: '#9333ea',
    boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, #9333ea 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
  };

  const triggerFormShakeAndScroll = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const submitBtn = document.querySelector('#emargement-core-form button[type="submit"]') || document.querySelector('button[form="emargement-core-form"]');
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
    <div id="emargements-tab-container" className="space-y-6">
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
                  Émargements
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    id="search-emargements-input"
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

                <button onClick={startNewEmargement} style={blueButtonStyle}>
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
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Stagiaire(s).</th>
                    <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Statut.</th>
                    <th className="px-4 py-3.5 text-right whitespace-nowrap" style={thStyle}>Actions.</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 text-xs">
                  {filteredEmargements.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-16 text-center font-sans lg:py-24" style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
                        Aucun résultat.
                      </td>
                    </tr>
                  ) : (
                    filteredEmargements.map((item) => {
                      const count = item.stagiaires?.length || 0;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => startEditEmargement(item)}
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
                              {getFormationDisplayLabel(item.formationId)}
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
                              {count}
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
                              {item.statut}
                            </span>
                          </td>
                          <td className="px-4 py-5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => startEditEmargement(item)}
                                style={rowActionButton18Style}
                              >
                                Modifier
                              </button>
                              <button
                                onClick={(e) => handleDelete(item.id, e)}
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
          className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto min-h-screen py-4"
          id="emargement-form-overlay"
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
              margin: 'auto',
              padding: '20px',
            }}
            id="emargement-form-header-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-2xl font-bold font-gochi" style={{ color: '#000000', cursor: 'default' }}>
                {editingId ? 'Modification Émargement' : 'Nouveau Émargement'}
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
                form="emargement-core-form"
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
              #emargement-core-form input:not([type="radio"]):not([type="checkbox"]),
              #emargement-core-form select,
              #emargement-core-form textarea {
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
              #emargement-core-form input:not([type="radio"]):not([type="checkbox"]):hover,
              #emargement-core-form input:not([type="radio"]):not([type="checkbox"]):focus,
              #emargement-core-form select:hover,
              #emargement-core-form select:focus,
              #emargement-core-form textarea:hover,
              #emargement-core-form textarea:focus {
                outline: 2.5px solid #fa53d5 !important;
                outline-offset: 2px !important;
                transition: all 0s !important;
              }
              #emargement-core-form select {
                appearance: none !important;
                -webkit-appearance: none !important;
                -moz-appearance: none !important;
                background-image: none !important;
              }
              #emargement-core-form select option {
                color: #000000 !important;
                background: #ffffff !important;
                font-family: "DefibeoMain", "Civilprom", sans-serif !important;
              }
              #emargement-core-form label {
                letter-spacing: normal !important;
                text-transform: none !important;
                font-size: 16px !important;
                color: #000000 !important;
                font-weight: 600 !important;
              }
            `}</style>

            <form onSubmit={handleSave} className="space-y-6" id="emargement-core-form">
              <div className="space-y-0" style={{ maxWidth: '98%', margin: 'auto' }}>
                {/* Section 1 - Configuration de l'émargement */}
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
                      1 — Configuration de l'émargement
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Sélection formation */}
                    <div className="space-y-1">
                      <label htmlFor="emarg-formation" className="block mb-1">Sélection formation.</label>
                      <select
                        id="emarg-formation"
                        value={formationId}
                        onChange={(e) => setFormationId(e.target.value)}
                        className="w-full"
                        required
                      >
                        <option value="">-- Sélectionner une formation --</option>
                        {formations.map((f) => (
                          <option key={f.id} value={f.id}>
                            {getFormationDisplayLabel(f.id)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Statut */}
                    <div className="space-y-1">
                      <label htmlFor="emarg-statut" className="block mb-1">Statut.</label>
                      <select
                        id="emarg-statut"
                        value={statut}
                        onChange={(e) => setStatut(e.target.value as 'Brouillon' | 'Terminé')}
                        className="w-full"
                      >
                        <option value="Brouillon">Brouillon</option>
                        <option value="Terminé">Terminé</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2 - Stagiaires de la formation */}
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
                      2 — Liste des stagiaires ({stagiairesItems.length}/50)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddStagiaireItem}
                    disabled={!editingId || stagiairesItems.length >= 50}
                    style={{
                      ...blueButtonStyle,
                      width: '100%',
                      opacity: !editingId ? 0.5 : 1,
                      cursor: !editingId ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Ajouter un stagiaire
                  </button>

                  <div className="space-y-6 pt-2">
                    {!editingId ? (
                      <p className="text-gray-500 text-center py-4 font-sans font-medium" style={{ fontSize: '15px' }}>
                        Veuillez d'abord enregistrer l'émargement avant de pouvoir ajouter des stagiaires.
                      </p>
                    ) : stagiairesItems.length === 0 ? (
                      <p className="text-gray-500 text-center py-4 font-sans font-medium" style={{ fontSize: '15px' }}>
                        Aucun stagiaire ajouté. Cliquez sur le bouton ci-dessus pour ajouter un stagiaire.
                      </p>
                    ) : (
                      stagiairesItems.map((stItem, index) => {
                        const otherSelectedIds = stagiairesItems
                          .filter((i) => i.id !== stItem.id)
                          .map((i) => i.stagiaireId);
                        const availableStagiaires = stagiaires.filter(
                          (s) => !otherSelectedIds.includes(s.id)
                        );

                        return (
                          <div
                            key={stItem.id}
                            className="p-5 border border-slate-200 rounded-[18px] bg-white space-y-4 relative"
                          >
                            <div className="flex items-center justify-between pb-2">
                              <span className="font-bold text-black font-sans" style={{ fontSize: '16px' }}>
                                Stagiaire #{index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveStagiaireItem(stItem.id)}
                                style={{
                                  ...rowActionButton18Style,
                                  backgroundColor: '#991b1b',
                                  borderRadius: '13px',
                                  fontSize: '16px',
                                  padding: '6px 14px',
                                }}
                              >
                                Supprimer
                              </button>
                            </div>

                            {/* Sélection stagiaire */}
                            <div className="space-y-1">
                              <label className="block mb-1">Sélection stagiaire.</label>
                              <select
                                value={stItem.stagiaireId}
                                onChange={(e) => handleUpdateStagiaireItem(stItem.id, { stagiaireId: e.target.value })}
                                className="w-full"
                              >
                                <option value="">-- Sélectionner un stagiaire --</option>
                                {availableStagiaires.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {getStagiaireDisplayLabel(s.id)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Présent (Radio) */}
                            <div className="space-y-1 pt-2">
                              <label className="block mb-2">Présent.</label>
                              <div className="flex items-center gap-6 py-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStagiaireItem(stItem.id, { present: 'Oui' })}
                                  className="inline-flex items-center cursor-pointer gap-2 select-none"
                                  style={{ fontSize: '16px', color: '#000' }}
                                >
                                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${stItem.present === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                                    {stItem.present === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                                  </span>
                                  Oui
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleUpdateStagiaireItem(stItem.id, { present: 'Non' })}
                                  className="inline-flex items-center cursor-pointer gap-2 select-none"
                                  style={{ fontSize: '16px', color: '#000' }}
                                >
                                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${stItem.present === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                                    {stItem.present === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                                  </span>
                                  Non
                                </button>
                              </div>
                            </div>

                            {/* Conditionnel si Oui à Présent */}
                            {stItem.present === 'Oui' && (
                              <div className="space-y-4 pt-4 border-t border-slate-200">
                                {/* Signature */}
                                <div className="space-y-1">
                                  <label className="block mb-1">Signature.</label>
                                  <SignaturePad
                                    value={stItem.signature}
                                    onChange={(dataUrl) => handleUpdateStagiaireItem(stItem.id, { signature: dataUrl })}
                                  />
                                </div>

                                {/* Horodatage */}
                                <div className="space-y-1">
                                  <label className="block mb-1">Horodatage.</label>
                                  <input
                                    type="text"
                                    value={stItem.horodatage || ''}
                                    onChange={(e) => handleUpdateStagiaireItem(stItem.id, { horodatage: e.target.value })}
                                    className="w-full"
                                    placeholder="ex: 06/08/2026 14:30"
                                  />
                                </div>

                                {/* Validation */}
                                <div className="space-y-1 pt-2">
                                  <label className="block mb-2">Validation.</label>
                                  <div className="flex items-center gap-6 py-1">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateStagiaireItem(stItem.id, { validation: 'Oui' })}
                                      className="inline-flex items-center cursor-pointer gap-2 select-none"
                                      style={{ fontSize: '16px', color: '#000' }}
                                    >
                                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${stItem.validation === 'Oui' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                                        {stItem.validation === 'Oui' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                                      </span>
                                      Oui
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleUpdateStagiaireItem(stItem.id, { validation: 'Non' })}
                                      className="inline-flex items-center cursor-pointer gap-2 select-none"
                                      style={{ fontSize: '16px', color: '#000' }}
                                    >
                                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${stItem.validation === 'Non' ? 'border-[#fe4eba]' : 'border-slate-300 bg-white'}`}>
                                        {stItem.validation === 'Non' && <span className="w-2.5 h-2.5 rounded-full bg-[#fe4eba]" />}
                                      </span>
                                      Non
                                    </button>
                                  </div>
                                </div>

                                {/* Bouton Télécharger certificat si validation === 'Oui' */}
                                {stItem.validation === 'Oui' && (
                                  <div className="pt-2">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadCertificat(stItem)}
                                      style={{ ...purpleButtonStyle, width: '100%' }}
                                    >
                                      Télécharger le certificat
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
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
