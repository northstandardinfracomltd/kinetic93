import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Client, Variable, StockRecord } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { getRegionsForCountry } from '../utils/regions';

interface GmaoOtherEquipmentCorrectionFormProps {
  otherEquipment: any;
  clients: Client[];
  onCancel: () => void;
  onSave: (payload: any) => void;
  forceSmartphoneLayout?: boolean;
  isNew?: boolean;
  isWebapp?: boolean;
  otherEquipments?: any[];
  defibrillateurs?: any[];
  variables?: Variable[];
  stocks?: StockRecord[];
  onSelectDefibrillator?: (defibId: string) => void;
  onSelectOtherEquipment?: (otherEquipment: any) => void;
}

const CODE39_PATTERNS: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
  '$': '010101000', '/': '010100010', '+': '010010100', '%': '000101010'
};

function Code39Barcode({ value }: { value: string }) {
  const text = (value || '').trim().toUpperCase();
  if (!text) return null;

  const NARROW_WIDTH = 1.5;
  const WIDE_WIDTH = 3.5;
  const GAP_WIDTH = 1.5;
  const QUIET_ZONE = 12;
  const BAR_HEIGHT = 38;

  const cleanCharList = text.split('').filter(char => CODE39_PATTERNS[char] !== undefined);
  if (cleanCharList.length === 0) return null;

  const wrappedText = '*' + cleanCharList.join('') + '*';

  let totalWidth = QUIET_ZONE * 2;
  for (let i = 0; i < wrappedText.length; i++) {
    const char = wrappedText[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS[' '];
    for (let j = 0; j < 9; j++) {
      const isWide = pattern[j] === '1';
      totalWidth += isWide ? WIDE_WIDTH : NARROW_WIDTH;
    }
    if (i < wrappedText.length - 1) {
      totalWidth += GAP_WIDTH;
    }
  }

  const rects: React.ReactNode[] = [];
  let currentX = QUIET_ZONE;

  for (let i = 0; i < wrappedText.length; i++) {
    const char = wrappedText[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS[' '];
    for (let j = 0; j < 9; j++) {
      const isWide = pattern[j] === '1';
      const width = isWide ? WIDE_WIDTH : NARROW_WIDTH;
      const isBar = j % 2 === 0;

      if (isBar) {
        rects.push(
          <rect
            key={`${i}-${j}`}
            x={currentX}
            y={8}
            width={width}
            height={BAR_HEIGHT}
            fill="black"
          />
        );
      }
      currentX += width;
    }
    if (i < wrappedText.length - 1) {
      currentX += GAP_WIDTH;
    }
  }

  const downloadSvg = () => {
    let rectsSvg = '';
    let currX = QUIET_ZONE;
    for (let i = 0; i < wrappedText.length; i++) {
      const char = wrappedText[i];
      const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS[' '];
      for (let j = 0; j < 9; j++) {
        const isWide = pattern[j] === '1';
        const width = isWide ? WIDE_WIDTH : NARROW_WIDTH;
        const isBar = j % 2 === 0;
        if (isBar) {
          rectsSvg += `<rect x="${currX}" y="8" width="${width}" height="${BAR_HEIGHT}" fill="black" />`;
        }
        currX += width;
      }
      if (i < wrappedText.length - 1) {
        currX += GAP_WIDTH;
      }
    }

    const svgContent = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 74" width="${totalWidth}" height="74" shape-rendering="crispEdges">
  <rect width="${totalWidth}" height="74" fill="white" />
  ${rectsSvg}
  <text x="${totalWidth / 2}" y="64" text-anchor="middle" font-family="Inter, sans-serif" font-weight="bold" font-size="16px" fill="#000000">${text}</text>
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `barcode-${text}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full bg-white max-w-full p-2">
      <svg
        viewBox={`0 0 ${totalWidth} 74`}
        className="max-h-16 mb-2"
        style={{ display: 'block', width: '100%', maxWidth: `${totalWidth}px` }}
        shapeRendering="crispEdges"
      >
        <rect width={totalWidth} height={74} fill="white" />
        {rects}
        <text
          x={totalWidth / 2}
          y={64}
          textAnchor="middle"
          style={{
            fontFamily: 'var(--font-sans), Inter, sans-serif',
            fontWeight: 'bold',
            fontSize: '16px',
            fill: '#000000'
          }}
        >
          {text}
        </text>
      </svg>
      <button
        type="button"
        onClick={downloadSvg}
        style={{
          backgroundColor: '#000000',
          color: '#ffffff',
          boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
          borderRadius: '10px',
          fontSize: '18px',
          padding: '9px 19px',
          fontWeight: '100',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: 'none',
          fontFamily: 'var(--font-sans), Inter, sans-serif',
        }}
        className="active:opacity-90 transition-opacity"
      >
        <span>Télécharger</span>
      </button>
    </div>
  );
}

// Custom Pink Radio Component
const CustomPinkRadio = ({ value, currentValue, onChange, label }: { value: string, currentValue: string, onChange: (v: string) => void, label: string }) => {
  const isChecked = value === currentValue;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className="inline-flex items-center cursor-pointer gap-2 select-none"
      style={{ fontSize: '16px', color: '#000' }}
    >
      <span className={`w-5 h-5 rounded-full border-2 relative transition-all bg-white col-span-1 shrink-0 ${isChecked ? 'border-[#fe4eba]' : 'border-slate-300'}`}>
        {isChecked && (
          <span 
            className="w-2.5 h-2.5 rounded-full bg-[#fe4eba] absolute" 
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          />
        )}
      </span>
      {label}
    </button>
  );
};

const rowActionButtonStyle: React.CSSProperties = {
  backgroundColor: '#000',
  color: '#fff',
  boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
  borderRadius: '10px',
  fontSize: '16px',
  padding: '11px 22px',
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

export default function GmaoOtherEquipmentCorrectionForm({
  otherEquipment,
  clients,
  onCancel,
  onSave,
  forceSmartphoneLayout = false,
  isNew = false,
  isWebapp = false,
  otherEquipments = [],
  defibrillateurs = [],
  variables = [],
  stocks = [],
  onSelectDefibrillator,
  onSelectOtherEquipment
}: GmaoOtherEquipmentCorrectionFormProps) {
  const [isLookupScannerOpen, setIsLookupScannerOpen] = useState(false);
  const [errorText, setErrorText] = useState("");

  // Section 1 - Client fields
  const [clientId, setClientId] = useState(otherEquipment?.clientId || '');
  const [nomPrenomSite, setNomPrenomSite] = useState(otherEquipment?.nomPrenomSite || '');
  const [telephoneSite, setTelephoneSite] = useState(otherEquipment?.telephoneSite || '');
  const [emailSite, setEmailSite] = useState(otherEquipment?.emailSite || '');
  const [contrat, setContrat] = useState<'Oui' | 'Non'>(otherEquipment?.contrat || 'Oui');
  const [nomContrat, setNomContrat] = useState(otherEquipment?.nomContrat || '');
  const [referenceContrat, setReferenceContrat] = useState(otherEquipment?.referenceContrat || '');
  const [debutContrat, setDebutContrat] = useState(otherEquipment?.debutContrat || '');
  const [finContrat, setFinContrat] = useState(otherEquipment?.finContrat || '');

  // Lookups search
  const [clientSearchText, setClientSearchText] = useState(() => {
    const cl = clients.find(c => c.id === (otherEquipment?.clientId || ''));
    return cl ? `${cl.denomination} (${cl.siret || cl.id})` : '';
  });
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  // Section 2 - Localisation
  const [numeroVoie, setNumeroVoie] = useState(otherEquipment?.numeroVoie || '');
  const [ville, setVille] = useState(otherEquipment?.ville || '');
  const [codePostal, setCodePostal] = useState(otherEquipment?.codePostal || '');
  const [region, setRegion] = useState(otherEquipment?.region || '');
  const [pays, setPays] = useState(otherEquipment?.pays || 'France');
  const [latitude, setLatitude] = useState(otherEquipment?.latitude || '');
  const [longitude, setLongitude] = useState(otherEquipment?.longitude || '');
  const [aideAcces, setAideAcces] = useState(otherEquipment?.aideAcces || '');
  const [accesPermanent, setAccesPermanent] = useState<'Oui' | 'Non'>(otherEquipment?.accesPermanent || 'Oui');
  const [accesJoursOuvres, setAccesJoursOuvres] = useState<'Oui' | 'Non'>(otherEquipment?.accesJoursOuvres || 'Oui');
  const [accesWeekend, setAccesWeekend] = useState<'Oui' | 'Non'>(otherEquipment?.accesWeekend || 'Non');
  const [installeExterieur, setInstalleExterieur] = useState<'Oui' | 'Non'>(otherEquipment?.installeExterieur || 'Non');

  // Section 3 - Dates
  const [expirationGarantie, setExpirationGarantie] = useState(otherEquipment?.expirationGarantie || '');
  const [fabrication, setFabrication] = useState(otherEquipment?.fabrication || '');
  const [miseEnService, setMiseEnService] = useState(otherEquipment?.miseEnService || '');
  const [derniereMaintenance, setDerniereMaintenance] = useState(otherEquipment?.derniereMaintenance || '');
  const [sortieUsine, setSortieUsine] = useState(otherEquipment?.sortieUsine || '');
  const [prochaineMaintenance, setProchaineMaintenance] = useState(otherEquipment?.prochaineMaintenance || '');

  // Section 4 - Catégorie and Identifiant
  const [categorie, setCategorie] = useState(otherEquipment?.categorie || 'Extincteur');
  const [identifiant, setIdentifiant] = useState(otherEquipment?.identifiant || '');

  // Section 5 - Specifiques
  const [specifiques, setSpecifiques] = useState<Record<string, any>>(otherEquipment?.specifiques || {});

  // Photograph & Signature fields
  const [photoUrl, setPhotoUrl] = useState(otherEquipment?.photoUrl || '');
  const [photoGlobaleUrl, setPhotoGlobaleUrl] = useState(otherEquipment?.photoGlobaleUrl || otherEquipment?.photoUrl || '');
  const [photoArriereUrl, setPhotoArriereUrl] = useState(otherEquipment?.photoArriereUrl || '');
  const [photoLedsUrl, setPhotoLedsUrl] = useState(otherEquipment?.photoLedsUrl || '');
  const [techSignature, setTechSignature] = useState(otherEquipment?.techSignature || '');
  const [endTimeStamp, setEndTimeStamp] = useState(otherEquipment?.endTimeStamp || '');

  const fileInputGlobaleRef = useRef<HTMLInputElement | null>(null);
  const fileInputArriereRef = useRef<HTMLInputElement | null>(null);
  const fileInputLedsRef = useRef<HTMLInputElement | null>(null);

  const handleFileChangeGlobale = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoGlobaleUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChangeArriere = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoArriereUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChangeLeds = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoLedsUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const purifierFilterStockOptions = useMemo(() => {
    const options: { id: string; name: string }[] = [];
    const addedNames = new Set<string>();

    (stocks || []).forEach(st => {
      const varObj = (variables || []).find(v => v.id === st.denominationPieceId);
      if (varObj && varObj.category === 'Modèle Filtre Purificateur') {
        const name = varObj.marque && varObj.marque !== 'Standard'
          ? `${varObj.nom} (${varObj.marque})`
          : varObj.nom;
        const label = `${name}${st.ugs ? ` (UGS: ${st.ugs})` : ''}`;
        if (!addedNames.has(label)) {
          addedNames.add(label);
          options.push({ id: st.id, name: label });
        }
      }
    });

    (variables || []).filter(v => v.category === 'Modèle Filtre Purificateur').forEach(v => {
      const label = v.marque && v.marque !== 'Standard' ? `${v.nom} (${v.marque})` : v.nom;
      if (!addedNames.has(label)) {
        addedNames.add(label);
        options.push({ id: v.id, name: label });
      }
    });

    return options;
  }, [stocks, variables]);

  useEffect(() => {
    if (otherEquipment) {
      setClientId(otherEquipment.clientId || '');
      setNomPrenomSite(otherEquipment.nomPrenomSite || '');
      setTelephoneSite(otherEquipment.telephoneSite || '');
      setEmailSite(otherEquipment.emailSite || '');
      setContrat(otherEquipment.contrat || 'Oui');
      setNomContrat(otherEquipment.nomContrat || '');
      setReferenceContrat(otherEquipment.referenceContrat || '');
      setDebutContrat(otherEquipment.debutContrat || '');
      setFinContrat(otherEquipment.finContrat || '');
      
      const cl = clients.find(c => c.id === (otherEquipment.clientId || ''));
      setClientSearchText(cl ? `${cl.denomination} (${cl.siret || cl.id})` : '');
      
      setNumeroVoie(otherEquipment.numeroVoie || '');
      setVille(otherEquipment.ville || '');
      setCodePostal(otherEquipment.codePostal || '');
      setRegion(otherEquipment.region || '');
      setPays(otherEquipment.pays || 'France');
      setLatitude(otherEquipment.latitude || '');
      setLongitude(otherEquipment.longitude || '');
      setAideAcces(otherEquipment.aideAcces || '');
      setAccesPermanent(otherEquipment.accesPermanent || 'Oui');
      setAccesJoursOuvres(otherEquipment.accesJoursOuvres || 'Oui');
      setAccesWeekend(otherEquipment.accesWeekend || 'Non');
      setInstalleExterieur(otherEquipment.installeExterieur || 'Non');
      
      setExpirationGarantie(otherEquipment.expirationGarantie || '');
      setFabrication(otherEquipment.fabrication || '');
      setMiseEnService(otherEquipment.miseEnService || '');
      setDerniereMaintenance(otherEquipment.derniereMaintenance || '');
      setSortieUsine(otherEquipment.sortieUsine || '');
      setProchaineMaintenance(otherEquipment.prochaineMaintenance || '');
      
      setCategorie(otherEquipment.categorie || 'Extincteur');
      setIdentifiant(otherEquipment.identifiant || '');
      setSpecifiques(otherEquipment.specifiques || {});
      setPhotoUrl(otherEquipment.photoUrl || '');
      setPhotoGlobaleUrl(otherEquipment.photoGlobaleUrl || otherEquipment.photoUrl || '');
      setPhotoArriereUrl(otherEquipment.photoArriereUrl || '');
      setPhotoLedsUrl(otherEquipment.photoLedsUrl || '');
      setTechSignature(otherEquipment.techSignature || '');
      setEndTimeStamp(otherEquipment.endTimeStamp || '');
    }
  }, [otherEquipment, clients]);

  const handleEqLookupChange = (val: string) => {
    setErrorText('');
    if (!val) return;
    if (val.startsWith('OTHER:')) {
      const otherId = val.substring(6);
      const matchedOther = otherEquipments.find(o => o.id === otherId);
      if (matchedOther && onSelectOtherEquipment) {
        onSelectOtherEquipment(matchedOther);
      }
    } else {
      if (onSelectDefibrillator) {
        onSelectDefibrillator(val);
      }
    }
  };
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  // Helper to handle date next maintenance +12m
  const handleDerniereMaintenanceChange = (val: string) => {
    setDerniereMaintenance(val);
    if (val) {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        date.setMonth(date.getMonth() + 12);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        setProchaineMaintenance(`${yyyy}-${mm}-${dd}`);
      }
    }
  };

  // Loading signature canvas if available
  useEffect(() => {
    if (techSignature && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = techSignature;
      }
    }
  }, [techSignature]);

  // Client search engine
  const filteredClientsForDropdown = clients.filter(c => {
    if (!clientSearchText) return true;
    const term = clientSearchText.toLowerCase();
    return (
      c.denomination.toLowerCase().includes(term) ||
      (c.siret && c.siret.toLowerCase().includes(term)) ||
      c.id.toLowerCase().includes(term)
    );
  });

  const handleClientSelect = (cId: string) => {
    const cl = clients.find(c => c.id === cId);
    if (cl) {
      setClientId(cl.id);
      setClientSearchText(`${cl.denomination} (${cl.siret || cl.id})`);
      setIsClientDropdownOpen(false);
    }
  };

  const handleSpecifiqueChange = (key: string, value: any) => {
    setSpecifiques(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Base64 file converter
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const r = new FileReader();
      r.onload = (event) => {
        if (event.target?.result) {
          setPhotoUrl(event.target.result as string);
        }
      };
      r.readAsDataURL(files[0]);
    }
  };

  const triggerCameraInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Canvas drawing Helpers
  const getEventCoords = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else {
      const me = e as React.MouseEvent;
      return {
        x: me.clientX - rect.left,
        y: me.clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawing.current = true;
    const pos = getEventCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getEventCoords(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        setTechSignature(canvas.toDataURL());
        if (!endTimeStamp) {
          const nowStr = new Date().toLocaleString('fr-FR');
          setEndTimeStamp(nowStr);
        }
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setTechSignature('');
        setEndTimeStamp('');
      }
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const interventionDate = new Date().toISOString().split('T')[0];

    const updatedSpecifiques = {
      ...specifiques,
      ...(categorie === 'Purificateur d’air' ? {
        serie: specifiques.serie || identifiant || '',
        typeFiltre: specifiques.typeFiltre || '',
        modeleFiltre: specifiques.modeleFiltre || '',
        derniereIntervention: interventionDate,
        nettoyageDerniereIntervention: specifiques.nettoyageEffectue || specifiques.nettoyageDerniereIntervention || 'Oui',
        desinfectionDerniereIntervention: specifiques.desinfectionEffectuee || specifiques.desinfectionDerniereIntervention || 'Oui',
        testFonctionnementDerniereIntervention: specifiques.testFonctionnementEffectue || specifiques.testFonctionnementDerniereIntervention || 'Oui',
        pieceFiltreDerniereMaintenance: specifiques.changementPieceFiltre || specifiques.pieceFiltreDerniereMaintenance || '',
        autrePieceConsommableDerniereMaintenance: specifiques.changementAutrePieceConsommable || specifiques.autrePieceConsommableDerniereMaintenance || ''
      } : {})
    };

    const snapshotPayload = {
      ...otherEquipment,
      clientId,
      nomPrenomSite,
      telephoneSite,
      emailSite,
      contrat,
      nomContrat,
      referenceContrat,
      debutContrat,
      finContrat,
      numeroVoie,
      ville,
      codePostal,
      region,
      pays,
      latitude,
      longitude,
      aideAcces,
      accesPermanent,
      accesJoursOuvres,
      accesWeekend,
      installeExterieur,
      expirationGarantie,
      fabrication,
      miseEnService,
      derniereMaintenance: interventionDate,
      sortieUsine,
      prochaineMaintenance,
      categorie,
      identifiant: (categorie === 'Purificateur d’air' && specifiques.serie) ? specifiques.serie : (identifiant || otherEquipment?.identifiant || ''),
      specifiques: updatedSpecifiques,
      endTimeStamp: endTimeStamp || new Date().toLocaleString('fr-FR'),
      photoUrl: photoGlobaleUrl || photoUrl || undefined,
      techSignature: techSignature || undefined
    };

    setTimeout(() => {
      onSave({
        title: `RAPPORT TECHNIQUE - ${categorie.toUpperCase()}`,
        defibSnapshot: snapshotPayload, // store other equipment inside defibSnapshot so existing backoffice table properties resolve automatically
        photoUrl: photoGlobaleUrl || photoUrl || undefined,
        photoGlobaleUrl: photoGlobaleUrl || undefined,
        photoArriereUrl: photoArriereUrl || undefined,
        photoLedsUrl: photoLedsUrl || undefined,
        techSignature: techSignature || undefined,
        endTimeStamp: endTimeStamp || new Date().toLocaleString('fr-FR')
      });
      setSaving(false);
    }, 1500);
  };

  const rowActionButton18Style: React.CSSProperties = {
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
    fontWeight: 100,
    fontSize: '18px',
    padding: '11px 20px',
    borderRadius: '13px',
    border: '1px solid rgb(218, 218, 218)',
    backgroundColor: '#ffffff',
    color: '#000000',
    transition: 'all 0.15s ease'
  };

  return (
    <div className={isWebapp ? "w-full space-y-6 font-sans animate-fadeIn max-w-full text-black pb-12 px-2 sm:px-4 bg-white" : "w-full space-y-6 font-sans animate-fadeIn max-w-full md:max-w-3xl lg:max-w-5xl mx-auto text-black pb-12 px-0 md:px-4 bg-white md:border md:border-slate-200 md:shadow-lg md:rounded-3xl"} id="gmao-other-eq-correction-layout">
      {/* Header */}
      <div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '100%', margin: 'auto', padding: '20px' }}
      >
        <div>
          <h3 className="text-2xl font-bold font-gochi" style={{ color: '#000000', cursor: 'default' }}>
            RAPPORT AUTRE MATÉRIEL
          </h3>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            style={{
              ...rowActionButton18Style,
              backgroundColor: '#000000',
              color: '#ffffff',
              border: '1px solid #000000',
            }}
            className="transition-colors cursor-pointer font-semibold"
          >
            Fermer
          </button>

          <button
            type="submit"
            form="other-eq-core-form"
            disabled={saving}
            style={{
              ...rowActionButton18Style,
              backgroundColor: 'rgb(53, 86, 236)',
              color: '#ffffff',
              border: '1px solid rgb(53, 86, 236)',
              opacity: saving ? 0.5 : 1,
            }}
            className="transition-all cursor-pointer font-semibold"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="w-full mt-6" style={{ marginTop: '24px' }}>
        <style>{`
          #other-eq-core-form input:not([type="radio"]):not([type="checkbox"]),
          #other-eq-core-form select,
          #other-eq-core-form textarea {
            padding: 12px !important;
            border: 1px solid #dedede !important;
            border-radius: 13px !important;
            font-size: 16px !important;
            font-weight: 100 !important;
            background: #ffffff !important;
            color: #000000 !important;
            outline: none !important;
            width: 100% !important;
          }
          #other-eq-core-form input:not([type="radio"]):not([type="checkbox"]):hover,
          #other-eq-core-form input:not([type="radio"]):not([type="checkbox"]):focus,
          #other-eq-core-form select:hover,
          #other-eq-core-form select:focus,
          #other-eq-core-form textarea:hover,
          #other-eq-core-form textarea:focus {
            outline: 2.5px solid #fa53d5 !important;
            outline-offset: 2px !important;
          }
          #other-eq-core-form label {
            font-size: 14px !important;
            color: #000000 !important;
            font-weight: 600 !important;
          }
          #other-eq-core-form input[type="date"]::-webkit-calendar-picker-indicator {
            display: none !important;
            -webkit-appearance: none;
          }
        `}</style>
             <form onSubmit={handleSubmit} id="other-eq-core-form" className="space-y-4">
          
          {/* SECTION 0 - CONFIGURATION */}
          {isNew && (
            <div className="bg-white p-5 space-y-3" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px' }} id="other-report-conf-box">
              <div className="mb-2">
                <span 
                  className="text-white px-3 py-1 text-[13px] inline-block font-semibold" 
                  style={{ 
                    backgroundColor: 'oklch(0.44 0.16 324.65)', 
                    borderRadius: '1000px',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 100,
                    textTransform: 'none',
                  }}
                >
                  0 — Configuration
                </span>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-black uppercase tracking-wider">
                  Sélectionner un équipement.
                </label>
                <div className="flex gap-1.5 animate-fadeIn">
                  <select
                    value={`OTHER:${otherEquipment?.id}`}
                    onChange={(e) => handleEqLookupChange(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <option value="">Sélection d'un matériel.</option>
                    {defibrillateurs.length > 0 && (
                      <optgroup label="DÉFIBRILLATEURS (DAE)">
                        {defibrillateurs.map(df => (
                          <option key={df.id} value={df.id}>
                            Défibrillateur - {df.identifiant} - {df.numeroSerie || "Sans série"}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otherEquipments.length > 0 && (
                      <optgroup label="AUTRES MATÉRIELS">
                        {otherEquipments.map(o => (
                          <option key={o.id} value={`OTHER:${o.id}`}>
                            {o.categorie || "Autre"} - {o.identifiant} - {o.id.substring(0, 8).toUpperCase()}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorText('');
                      setIsLookupScannerOpen(true);
                    }}
                    style={rowActionButton18Style}
                    className="shrink-0 transition-colors cursor-pointer font-sans bg-black text-white hover:bg-neutral-900"
                  >
                    Scan
                  </button>
                </div>
                {errorText && (
                  <p className="text-red-500 text-xs font-bold mt-1">{errorText}</p>
                )}
                {isLookupScannerOpen && (
                  <BarcodeScannerModal
                    isOpen={isLookupScannerOpen}
                    onClose={() => setIsLookupScannerOpen(false)}
                    onScanSuccess={(scannedText) => {
                      let cleanedText = scannedText.trim();
                      if (cleanedText.startsWith('*') && cleanedText.endsWith('*') && cleanedText.length > 2) {
                        cleanedText = cleanedText.slice(1, -1);
                      }
                      const textUpper = cleanedText.toUpperCase();
                      const matchingDefib = defibrillateurs.find(
                        d => (d.identifiant || '').toUpperCase() === textUpper || (d.numeroSerie || '').toUpperCase() === textUpper
                      );
                      if (matchingDefib) {
                        handleEqLookupChange(matchingDefib.id);
                      } else {
                        const matchingOther = otherEquipments.find(
                          o => (o.identifiant || '').toUpperCase() === textUpper || (o.id || '').toUpperCase() === textUpper
                        );
                        if (matchingOther) {
                          handleEqLookupChange(`OTHER:${matchingOther.id}`);
                        } else {
                          setErrorText(`Aucun équipement trouvé avec le code-barres "${scannedText}".`);
                        }
                      }
                      setIsLookupScannerOpen(false);
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* SECTION 1 - CATÉGORIE ET IDENTIFIANT */}
          <div className="bg-white p-5 space-y-3" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px' }}>
            <div className="mb-2">
              <span className="text-white px-3 py-1 text-[13px] inline-block font-semibold" style={{ backgroundColor: 'oklch(0.44 0.16 324.65)', borderRadius: '1000px' }}>
                1 — Catégorie et identifiant
              </span>
            </div>

            {!isNew && identifiant && (
              <div className="mb-4">
                <Code39Barcode value={identifiant} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Catégorie.</label>
                <input type="text" value={categorie} readOnly className="bg-slate-100 cursor-not-allowed" />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Identifiant unique.</label>
                <input type="text" value={identifiant} readOnly className="bg-slate-100 cursor-not-allowed" />
              </div>
            </div>
          </div>

          {/* SECTION 2 - CLIENT */}
          <div className="bg-white p-5 space-y-3" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px' }}>
            <div className="mb-2">
              <span className="text-white px-3 py-1 text-[13px] inline-block font-semibold" style={{ backgroundColor: 'oklch(0.44 0.16 324.65)', borderRadius: '1000px' }}>
                2 — Client
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 relative">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Sélection du client.</label>
                <input
                  type="text"
                  value={clientSearchText}
                  onFocus={() => setIsClientDropdownOpen(true)}
                  onChange={(e) => {
                    setClientSearchText(e.target.value);
                    setIsClientDropdownOpen(true);
                    if (clientId) setClientId('');
                  }}
                  onBlur={() => setTimeout(() => setIsClientDropdownOpen(false), 250)}
                  placeholder="Rechercher un client."
                  className="w-full bg-white border border-slate-200 rounded p-2 text-xs"
                />
                {isClientDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg mt-1 shadow-lg divide-y divide-slate-100">
                    {filteredClientsForDropdown.length === 0 ? (
                      <div className="p-3 text-slate-500 text-xs">Aucun client trouvé</div>
                    ) : (
                      filteredClientsForDropdown.map(c => {
                        const labelStr = `${c.denomination} (${c.siret || c.id})`;
                        return (
                           <button
                             key={c.id}
                             type="button"
                             onMouseDown={() => handleClientSelect(c.id)}
                             className="w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-[#ffecf8] transition-colors font-semibold border-0 cursor-pointer"
                           >
                             {labelStr}
                           </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Contact.</label>
                <input type="text" value={nomPrenomSite} onChange={(e) => setNomPrenomSite(e.target.value)} placeholder="Entrez un nom et prénom." />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Téléphone du contact.</label>
                <input type="text" value={telephoneSite} onChange={(e) => setTelephoneSite(e.target.value)} placeholder="Entrez un numéro." />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Email du contact.</label>
                <input type="email" value={emailSite} onChange={(e) => setEmailSite(e.target.value)} placeholder="Entrez un email." />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="space-y-1 md:w-1/3">
                <label className="block text-[11px] font-bold text-slate-500">Contrat en cours.</label>
                <div className="flex items-center space-x-4 py-1">
                  <CustomPinkRadio value="Oui" currentValue={contrat} onChange={(val) => setContrat(val as 'Oui' | 'Non')} label="Oui" />
                  <CustomPinkRadio value="Non" currentValue={contrat} onChange={(val) => setContrat(val as 'Oui' | 'Non')} label="Non" />
                </div>
              </div>
              <div className="space-y-1 flex-1">
                <label className="block text-[11px] font-bold text-slate-500">Titre du contrat.</label>
                <input type="text" value={nomContrat} onChange={(e) => setNomContrat(e.target.value)} placeholder="" disabled={contrat === 'Non'} />
              </div>
              <div className="space-y-1 flex-1">
                <label className="block text-[11px] font-bold text-slate-500">Référence du contrat.</label>
                <input type="text" value={referenceContrat} onChange={(e) => setReferenceContrat(e.target.value)} placeholder="" disabled={contrat === 'Non'} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Début du contrat.</label>
                <input type="date" value={debutContrat} onChange={(e) => setDebutContrat(e.target.value)} disabled={contrat === 'Non'} />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Expiration du contrat.</label>
                <input type="date" value={finContrat} onChange={(e) => setFinContrat(e.target.value)} disabled={contrat === 'Non'} />
              </div>
            </div>
          </div>

          {/* SECTION 3 - LOCALISATION */}
          <div className="bg-white p-5 space-y-3" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px' }}>
            <div className="mb-2">
              <span className="text-white px-3 py-1 text-[13px] inline-block font-semibold" style={{ backgroundColor: 'oklch(0.44 0.16 324.65)', borderRadius: '1000px' }}>
                3 — Localisation
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500">Numéro et voie.</label>
                <input type="text" value={numeroVoie} onChange={(e) => setNumeroVoie(e.target.value)} placeholder="Entrez un numéro et une rue." />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Ville.</label>
                <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Entrez une ville." />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Code postal.</label>
                <input type="text" value={codePostal} onChange={(e) => setCodePostal(e.target.value)} placeholder="Entrez un code postal." />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Région.</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">Sélectionner une région...</option>
                  {getRegionsForCountry(pays).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Pays.</label>
                <select value={pays} onChange={(e) => setPays(e.target.value)}>
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
                  <option value="Tchéquie">Tchéquie</option>
                  <option value="Autriche">Autriche</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Latitude.</label>
                <input type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Longitude.</label>
                <input type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-500">Aide d’accès.</label>
              <textarea value={aideAcces} onChange={(e) => setAideAcces(e.target.value)} rows={2} style={{ resize: 'none' }} placeholder="Entrez un commentaire." />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-500 uppercase">Accès permanent.</label>
                <div className="flex gap-4"><CustomPinkRadio value="Oui" currentValue={accesPermanent} onChange={(v) => setAccesPermanent(v as any)} label="Oui" /><CustomPinkRadio value="Non" currentValue={accesPermanent} onChange={(v) => setAccesPermanent(v as any)} label="Non" /></div>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-500 uppercase">Accès jours ouvrés.</label>
                <div className="flex gap-4"><CustomPinkRadio value="Oui" currentValue={accesJoursOuvres} onChange={(v) => setAccesJoursOuvres(v as any)} label="Oui" /><CustomPinkRadio value="Non" currentValue={accesJoursOuvres} onChange={(v) => setAccesJoursOuvres(v as any)} label="Non" /></div>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-500 uppercase">Accès week-end.</label>
                <div className="flex gap-4"><CustomPinkRadio value="Oui" currentValue={accesWeekend} onChange={(v) => setAccesWeekend(v as any)} label="Oui" /><CustomPinkRadio value="Non" currentValue={accesWeekend} onChange={(v) => setAccesWeekend(v as any)} label="Non" /></div>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-500 uppercase">Installé en extérieur.</label>
                <div className="flex gap-4"><CustomPinkRadio value="Oui" currentValue={installeExterieur} onChange={(v) => setInstalleExterieur(v as any)} label="Oui" /><CustomPinkRadio value="Non" currentValue={installeExterieur} onChange={(v) => setInstalleExterieur(v as any)} label="Non" /></div>
              </div>
            </div>
          </div>

          {/* SECTION 4 - DATES */}
          <div className="bg-white p-5 space-y-3" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px' }}>
            <div className="mb-2">
              <span className="text-white px-3 py-1 text-[13px] inline-block font-semibold" style={{ backgroundColor: 'oklch(0.44 0.16 324.65)', borderRadius: '1000px' }}>
                4 — Dates
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Date de fabrication.</label>
                <input type="date" value={fabrication} onChange={(e) => setFabrication(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Mise en service.</label>
                <input type="date" value={miseEnService} onChange={(e) => setMiseEnService(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Expiration de garantie.</label>
                <input type="date" value={expirationGarantie} onChange={(e) => setExpirationGarantie(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Sortie d'usine.</label>
                <input type="date" value={sortieUsine} onChange={(e) => setSortieUsine(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Dernière maintenance.</label>
                <input type="date" value={derniereMaintenance} onChange={(e) => handleDerniereMaintenanceChange(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500">Prochaine maintenance.</label>
                <input type="date" value={prochaineMaintenance} onChange={(e) => setProchaineMaintenance(e.target.value)} />
              </div>
            </div>
          </div>

          {/* SECTION 5 - CHAMPS SPÉCIFIQUES */}
          <div className="bg-white p-5 space-y-3 font-sans text-black text-[15px]" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px' }}>
            <div className="mb-2">
              <span className="text-white px-3 py-1 text-[13px] inline-block font-semibold" style={{ backgroundColor: 'oklch(0.44 0.16 324.65)', borderRadius: '1000px' }}>
                5 — Caractéristiques Techniques : {categorie}
              </span>
            </div>

            <div className="pt-2">
              {/* 1. EXTINCTEUR */}
              {categorie === 'Extincteur' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Type d'agent extincteur</label>
                      <select value={specifiques.agentExtincteur || 'Eau pulvérisée'} onChange={(e) => handleSpecifiqueChange('agentExtincteur', e.target.value)}>
                        <option value="Eau pulvérisée">Eau pulvérisée</option>
                        <option value="CO2">CO2</option>
                        <option value="Poudre">Poudre</option>
                        <option value="Mousse">Mousse</option>
                        <option value="Unique">Unique</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>Capacité de l'appareil</label>
                      <input type="text" value={specifiques.capacite || ''} placeholder="Ex: 6 Litres ou 2 kg" onChange={(e) => handleSpecifiqueChange('capacite', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Vérifier la pression ou la masse</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Conforme" currentValue={specifiques.pressionConforme || 'Conforme'} onChange={(v) => handleSpecifiqueChange('pressionConforme', v)} label="Conforme" />
                        <CustomPinkRadio value="Non conforme" currentValue={specifiques.pressionConforme || 'Conforme'} onChange={(v) => handleSpecifiqueChange('pressionConforme', v)} label="Non conforme" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label>Contrôler la présence du plomb et de la goupille</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Présents / Intacts" currentValue={specifiques.plombGoupille || 'Présents / Intacts'} onChange={(v) => handleSpecifiqueChange('plombGoupille', v)} label="Présents" />
                        <CustomPinkRadio value="Absents / Brisés" currentValue={specifiques.plombGoupille || 'Présents / Intacts'} onChange={(v) => handleSpecifiqueChange('plombGoupille', v)} label="Absents" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. BIMP */}
              {categorie === "Boucle d'induction magnétique portable (BIMP)" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Niveau de charge de la batterie</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Correct" currentValue={specifiques.chargeBatterie || 'Correct'} onChange={(v) => handleSpecifiqueChange('chargeBatterie', v)} label="Correct" />
                        <CustomPinkRadio value="Insuffisant" currentValue={specifiques.chargeBatterie || 'Correct'} onChange={(v) => handleSpecifiqueChange('chargeBatterie', v)} label="Insuffisant" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label>Qualité du test audio</label>
                      <select value={specifiques.testAudio || 'Excellente'} onChange={(e) => handleSpecifiqueChange('testAudio', e.target.value)}>
                        <option value="Excellente">Excellente</option>
                        <option value="Distorsion légère">Distorsion légère</option>
                        <option value="Grésillements importants">Grésillements importants</option>
                        <option value="Aucun son">Aucun son</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Inspecter l'état de la connectique et du micro</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Bon état" currentValue={specifiques.connectiqueMicro || 'Bon état'} onChange={(v) => handleSpecifiqueChange('connectiqueMicro', v)} label="Bon état" />
                        <CustomPinkRadio value="Dégradé / À remplacer" currentValue={specifiques.connectiqueMicro || 'Bon état'} onChange={(v) => handleSpecifiqueChange('connectiqueMicro', v)} label="Dégradé / À remplacer" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label>Confirmer la présence du pictogramme obligatoire</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Oui" currentValue={specifiques.pictogramme || 'Oui'} onChange={(v) => handleSpecifiqueChange('pictogramme', v)} label="Oui" />
                        <CustomPinkRadio value="Non" currentValue={specifiques.pictogramme || 'Oui'} onChange={(v) => handleSpecifiqueChange('pictogramme', v)} label="Non" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. PURIFICATEUR D'AIR */}
              {categorie === 'Purificateur d’air' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-black uppercase tracking-wider block">Série.</label>
                      <input 
                        type="text" 
                        value={specifiques.serie || identifiant || ''} 
                        placeholder="Série" 
                        onChange={(e) => handleSpecifiqueChange('serie', e.target.value)} 
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-black uppercase tracking-wider block">Type de filtre.</label>
                      <select 
                        value={specifiques.typeFiltre || ''} 
                        onChange={(e) => handleSpecifiqueChange('typeFiltre', e.target.value)}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Sélectionner un type de filtre</option>
                        {(variables || []).filter(v => v.category === 'Type Filtre Purificateur').map(v => (
                          <option key={v.id} value={v.nom}>{v.nom}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-black uppercase tracking-wider block">Modèle de filtre.</label>
                      <select 
                        value={specifiques.modeleFiltre || ''} 
                        onChange={(e) => handleSpecifiqueChange('modeleFiltre', e.target.value)}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Sélectionner un modèle de filtre</option>
                        {(variables || []).filter(v => v.category === 'Modèle Filtre Purificateur').map(v => (
                          <option key={v.id} value={v.nom}>{v.nom}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-black uppercase tracking-wider block">Nettoyage effectué.</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Oui" currentValue={specifiques.nettoyageEffectue || specifiques.nettoyageDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('nettoyageEffectue', v)} label="Oui" />
                        <CustomPinkRadio value="Non" currentValue={specifiques.nettoyageEffectue || specifiques.nettoyageDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('nettoyageEffectue', v)} label="Non" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-black uppercase tracking-wider block">Désinfection effectuée.</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Oui" currentValue={specifiques.desinfectionEffectuee || specifiques.desinfectionDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('desinfectionEffectuee', v)} label="Oui" />
                        <CustomPinkRadio value="Non" currentValue={specifiques.desinfectionEffectuee || specifiques.desinfectionDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('desinfectionEffectuee', v)} label="Non" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-black uppercase tracking-wider block">Test de fonctionnement effectué.</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Oui" currentValue={specifiques.testFonctionnementEffectue || specifiques.testFonctionnementDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('testFonctionnementEffectue', v)} label="Oui" />
                        <CustomPinkRadio value="Non" currentValue={specifiques.testFonctionnementEffectue || specifiques.testFonctionnementDerniereIntervention || 'Oui'} onChange={(v) => handleSpecifiqueChange('testFonctionnementEffectue', v)} label="Non" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-black uppercase tracking-wider block">Changement de pièce filtre.</label>
                      <select 
                        value={specifiques.changementPieceFiltre || specifiques.pieceFiltreDerniereMaintenance || ''} 
                        onChange={(e) => handleSpecifiqueChange('changementPieceFiltre', e.target.value)}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Aucune</option>
                        {purifierFilterStockOptions.map(opt => (
                          <option key={opt.id} value={opt.name}>{opt.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-black uppercase tracking-wider block">Changement autre pièce consommable.</label>
                      <select 
                        value={specifiques.changementAutrePieceConsommable || specifiques.autrePieceConsommableDerniereMaintenance || ''} 
                        onChange={(e) => handleSpecifiqueChange('changementAutrePieceConsommable', e.target.value)}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Aucune</option>
                        {purifierFilterStockOptions.map(opt => (
                          <option key={opt.id} value={opt.name}>{opt.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-slate-200 mt-2">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-black uppercase tracking-wider">
                        Photographie globale du matériel.
                      </label>
                      {photoGlobaleUrl && (
                        <div className="text-[14px] text-green-600 font-bold leading-none py-1 flex items-center gap-2">
                          <span>✓ Chargé</span>
                          <img src={photoGlobaleUrl} alt="Aperçu globale" className="h-12 w-12 object-cover rounded border" />
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => fileInputGlobaleRef.current?.click()}
                          style={rowActionButton18Style}
                          className="transition-colors cursor-pointer font-sans"
                        >
                          Photographier
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          ref={fileInputGlobaleRef}
                          onChange={handleFileChangeGlobale}
                          className="hidden"
                        />
                        {photoGlobaleUrl && (
                          <button
                            type="button"
                            onClick={() => setPhotoGlobaleUrl('')}
                            style={{ ...rowActionButton18Style, backgroundColor: '#ef4444', color: '#ffffff' }}
                            className="transition-colors cursor-pointer font-sans hover:bg-red-600"
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-black uppercase tracking-wider">
                        Photographie arrière / étiquette.
                      </label>
                      {photoArriereUrl && (
                        <div className="text-[14px] text-green-600 font-bold leading-none py-1 flex items-center gap-2">
                          <span>✓ Chargé</span>
                          <img src={photoArriereUrl} alt="Aperçu arrière" className="h-12 w-12 object-cover rounded border" />
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => fileInputArriereRef.current?.click()}
                          style={rowActionButton18Style}
                          className="transition-colors cursor-pointer font-sans"
                        >
                          Photographier
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          ref={fileInputArriereRef}
                          onChange={handleFileChangeArriere}
                          className="hidden"
                        />
                        {photoArriereUrl && (
                          <button
                            type="button"
                            onClick={() => setPhotoArriereUrl('')}
                            style={{ ...rowActionButton18Style, backgroundColor: '#ef4444', color: '#ffffff' }}
                            className="transition-colors cursor-pointer font-sans hover:bg-red-600"
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-black uppercase tracking-wider">
                        Photographie en fonctionnement (leds).
                      </label>
                      {photoLedsUrl && (
                        <div className="text-[14px] text-green-600 font-bold leading-none py-1 flex items-center gap-2">
                          <span>✓ Chargé</span>
                          <img src={photoLedsUrl} alt="Aperçu leds" className="h-12 w-12 object-cover rounded border" />
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => fileInputLedsRef.current?.click()}
                          style={rowActionButton18Style}
                          className="transition-colors cursor-pointer font-sans"
                        >
                          Photographier
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          ref={fileInputLedsRef}
                          onChange={handleFileChangeLeds}
                          className="hidden"
                        />
                        {photoLedsUrl && (
                          <button
                            type="button"
                            onClick={() => setPhotoLedsUrl('')}
                            style={{ ...rowActionButton18Style, backgroundColor: '#ef4444', color: '#ffffff' }}
                            className="transition-colors cursor-pointer font-sans hover:bg-red-600"
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. SIGNALISATION */}
              {categorie === 'Signalisation' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Nature du panneau</label>
                      <select value={specifiques.naturePanneau || 'Évacuation'} onChange={(e) => handleSpecifiqueChange('naturePanneau', e.target.value)}>
                        <option value="Évacuation">Évacuation</option>
                        <option value="Danger / Interdiction">Danger / Interdiction</option>
                        <option value="Moyens de secours">Moyens de secours</option>
                        <option value="Sécurité incendie">Sécurité incendie</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>Visibilité du panneau</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Visible" currentValue={specifiques.visibilite || 'Visible'} onChange={(v) => handleSpecifiqueChange('visibilite', v)} label="Visible" />
                        <CustomPinkRadio value="Masqué / Obstacle" currentValue={specifiques.visibilite || 'Visible'} onChange={(v) => handleSpecifiqueChange('visibilite', v)} label="Masqué / Obstacle" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Solidité de la fixation</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Correcte" currentValue={specifiques.solidiateFixation || 'Correcte'} onChange={(v) => handleSpecifiqueChange('solidiateFixation', v)} label="Correcte" />
                        <CustomPinkRadio value="Instable / À refaire" currentValue={specifiques.solidiateFixation || 'Correcte'} onChange={(v) => handleSpecifiqueChange('solidiateFixation', v)} label="Instable / À refaire" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label>Cohérence du fléchage d'évacuation</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Cohérent" currentValue={specifiques.coherenceFleche || 'Cohérent'} onChange={(v) => handleSpecifiqueChange('coherenceFleche', v)} label="Cohérent" />
                        <CustomPinkRadio value="Incorrect" currentValue={specifiques.coherenceFleche || 'Cohérent'} onChange={(v) => handleSpecifiqueChange('coherenceFleche', v)} label="Incorrect" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. ÉCLAIRAGE DE SECOURS */}
              {categorie === 'Éclairage de secours' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label>Type de bloc autonome</label>
                      <select value={specifiques.blocType || 'BAES Évacuation'} onChange={(e) => handleSpecifiqueChange('blocType', e.target.value)}>
                        <option value="BAES Évacuation">BAES Évacuation</option>
                        <option value="BAES Ambiance">BAES Ambiance</option>
                        <option value="BAEH Habitation">BAEH Habitation</option>
                        <option value="Bloc bi-fonction">Bloc bi-fonction</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>Technologie du bloc</label>
                      <select value={specifiques.techBloc || 'SATI (Auto-testable)'} onChange={(e) => handleSpecifiqueChange('techBloc', e.target.value)}>
                        <option value="SATI (Auto-testable)">SATI (Auto-testable)</option>
                        <option value="Standard (Télécommandable)">Standard (Télécommandable)</option>
                        <option value="Connecté sans fil">Connecté sans fil</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>Durée d'autonomie constatée</label>
                      <input type="text" value={specifiques.durreAutonomie || ''} placeholder="Ex: 1 h 15" onChange={(e) => handleSpecifiqueChange('durreAutonomie', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Test de commutation automatique</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Réussi" currentValue={specifiques.testCommutation || 'Réussi'} onChange={(v) => handleSpecifiqueChange('testCommutation', v)} label="Réussi" />
                        <CustomPinkRadio value="Échoué" currentValue={specifiques.testCommutation || 'Réussi'} onChange={(v) => handleSpecifiqueChange('testCommutation', v)} label="Échoué" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label>Vérifier l'état des ampoules ou des LED</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Opérationnelles" currentValue={specifiques.etatAmpoule || 'Opérationnelles'} onChange={(v) => handleSpecifiqueChange('etatAmpoule', v)} label="Opérationnelles" />
                        <CustomPinkRadio value="Défectueuses" currentValue={specifiques.etatAmpoule || 'Opérationnelles'} onChange={(v) => handleSpecifiqueChange('etatAmpoule', v)} label="Défectueuses" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. SYSTÈMES HYDRANTS */}
              {categorie === 'Systèmes hydrants' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label>Type d'hydrant</label>
                      <select value={specifiques.typeHydrant || 'RIA DN25'} onChange={(e) => handleSpecifiqueChange('typeHydrant', e.target.value)}>
                        <option value="RIA DN25">RIA DN25</option>
                        <option value="RIA DN33">RIA DN33</option>
                        <option value="Poteau d'incendie">Poteau d'incendie</option>
                        <option value="Bouche d'incendie">Bouche d'incendie</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>Pression hydrostatique (bars)</label>
                      <input type="text" value={specifiques.pressionEau || ''} placeholder="Ex: 3.5 bars" onChange={(e) => handleSpecifiqueChange('pressionEau', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label>Débit d'eau (L/min)</label>
                      <input type="text" value={specifiques.debitEau || ''} placeholder="Ex: 150 L/min" onChange={(e) => handleSpecifiqueChange('debitEau', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>État visuel du tuyau / lance</label>
                      <select value={specifiques.etatTuyau || 'Parfait état'} onChange={(e) => handleSpecifiqueChange('etatTuyau', e.target.value)}>
                        <option value="Parfait état">Parfait état</option>
                        <option value="Légère usure sans fuite">Légère usure sans fuite</option>
                        <option value="Craquelé / À remplacer">Craquelé / À remplacer</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>Accessibilité permanente de la zone</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Dégagée" currentValue={specifiques.accessibilite || 'Dégagée'} onChange={(v) => handleSpecifiqueChange('accessibilite', v)} label="Dégagée" />
                        <CustomPinkRadio value="Encombrée" currentValue={specifiques.accessibilite || 'Dégagée'} onChange={(v) => handleSpecifiqueChange('accessibilite', v)} label="Encombrée" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 7. DÉTECTEUR DE FUMÉE */}
              {categorie === 'Détecteur de fumée' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Date limite de remplacement</label>
                      <input type="text" value={specifiques.remplacementMax || ''} placeholder="Ex: Décembre 2031" onChange={(e) => handleSpecifiqueChange('remplacementMax', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label>Test déclenchement aérosol</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Positif" currentValue={specifiques.declenchementAerosol || 'Positif'} onChange={(v) => handleSpecifiqueChange('declenchementAerosol', v)} label="Positif" />
                        <CustomPinkRadio value="Négatif" currentValue={specifiques.declenchementAerosol || 'Positif'} onChange={(v) => handleSpecifiqueChange('declenchementAerosol', v)} label="Négatif" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Vérifier l'absence de signal pile faible</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Aucun signal" currentValue={specifiques.testPileFaible || 'Aucun signal'} onChange={(v) => handleSpecifiqueChange('testPileFaible', v)} label="Aucun signal" />
                        <CustomPinkRadio value="Signal actif / Alerte" currentValue={specifiques.testPileFaible || 'Aucun signal'} onChange={(v) => handleSpecifiqueChange('testPileFaible', v)} label="Signal actif" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label>Empoussièrement de la chambre</label>
                      <select value={specifiques.propreteChambre || 'Propre'} onChange={(e) => handleSpecifiqueChange('propreteChambre', e.target.value)}>
                        <option value="Propre">Propre</option>
                        <option value="Faiblement empoussiérée">Faiblement empoussiérée</option>
                        <option value="Très encrassée / À nettoyer">Très encrassée / À nettoyer</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* 8. DETECTION INCENDIE (SSI) */}
              {categorie === 'Détection incendie (SSI)' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label>Type de centrale</label>
                      <select value={specifiques.stextContent || 'ECS (Détection)'} onChange={(e) => handleSpecifiqueChange('stextContent', e.target.value)}>
                        <option value="ECS (Détection)">ECS (Détection)</option>
                        <option value="CMSI (Mise en sécurité)">CMSI (Mise en sécurité)</option>
                        <option value="SMSI (Système intégré)">SMSI (Système intégré)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>Tension des batteries (V)</label>
                      <input type="text" value={specifiques.tensionBat || ''} placeholder="Ex: 24.2 V" onChange={(e) => handleSpecifiqueChange('tensionBat', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label>Nombre de défauts (Historique)</label>
                      <input type="text" value={specifiques.historiqueDefauts || ''} placeholder="Ex: 0" onChange={(e) => handleSpecifiqueChange('historiqueDefauts', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Voyant de dérangement</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Aucun défaut" currentValue={specifiques.absenceVoyant || 'Aucun défaut'} onChange={(v) => handleSpecifiqueChange('absenceVoyant', v)} label="Aucun défaut" />
                        <CustomPinkRadio value="Dérangement présent" currentValue={specifiques.absenceVoyant || 'Aucun défaut'} onChange={(v) => handleSpecifiqueChange('absenceVoyant', v)} label="Dérangement" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label>Test de transmission alarme</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Transmis" currentValue={specifiques.transmissionAlarme || 'Transmis'} onChange={(v) => handleSpecifiqueChange('transmissionAlarme', v)} label="Transmis" />
                        <CustomPinkRadio value="Non transmis / Échec" currentValue={specifiques.transmissionAlarme || 'Transmis'} onChange={(v) => handleSpecifiqueChange('transmissionAlarme', v)} label="Échec" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 9. DÉSENFUMAGE */}
              {categorie === 'Désenfumage' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Mode de télécommande</label>
                      <select value={specifiques.telecommande || 'Pneumatique (CO2)'} onChange={(e) => handleSpecifiqueChange('telecommande', e.target.value)}>
                        <option value="Pneumatique (CO2)">Pneumatique (CO2)</option>
                        <option value="Électrique (24V/48V)">Électrique (24V/48V)</option>
                        <option value="Mécanique (Câble)">Mécanique (Câble)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>État des cartouches / fusibles</label>
                      <select value={specifiques.cartouchesGaz || 'Intactes'} onChange={(e) => handleSpecifiqueChange('cartouchesGaz', e.target.value)}>
                        <option value="Intactes">Intactes</option>
                        <option value="Percées / À remplacer">Percées / À remplacer</option>
                        <option value="Non applicable">Non applicable</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>Ouverture de l'exutoire</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Ouverture totale" currentValue={specifiques.exutoireOuverture || 'Ouverture totale'} onChange={(v) => handleSpecifiqueChange('exutoireOuverture', v)} label="Totale" />
                        <CustomPinkRadio value="Ouverture partielle / Blocage" currentValue={specifiques.exutoireOuverture || 'Ouverture totale'} onChange={(v) => handleSpecifiqueChange('exutoireOuverture', v)} label="Partielle" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label>Facilité de réarmement</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Réarmé avec succès" currentValue={specifiques.rearmement || 'Réarmé avec succès'} onChange={(v) => handleSpecifiqueChange('rearmement', v)} label="Réussi" />
                        <CustomPinkRadio value="Blocage au réarmement" currentValue={specifiques.rearmement || 'Réarmé avec succès'} onChange={(v) => handleSpecifiqueChange('rearmement', v)} label="Blocage" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label>État des câbles / poulies</label>
                      <div className="flex space-x-4 py-1">
                        <CustomPinkRadio value="Bon état" currentValue={specifiques.etatPoulies || 'Bon état'} onChange={(v) => handleSpecifiqueChange('etatPoulies', v)} label="Bon état" />
                        <CustomPinkRadio value="Usure prononcée / À remplacer" currentValue={specifiques.etatPoulies || 'Bon état'} onChange={(v) => handleSpecifiqueChange('etatPoulies', v)} label="Usure / À remplacer" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Commentaire de visite technique */}
              <div className="space-y-1 mt-4 pt-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Commentaire de visite technique (Une seule ligne)</label>
                <input
                  type="text"
                  value={specifiques.commentaire || ''}
                  placeholder="Ex: RAS. Tout est conforme aux normes."
                  onChange={(e) => handleSpecifiqueChange('commentaire', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ADDED INTERACTIVE SECTIONS FOR TECHNICIANS: PHOTO & SIGNATURE */}
          
          {/* Photo Cliché */}
          <div className="bg-white p-5 space-y-4 shadow-sm" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px' }}>
            <span className="text-white px-3 py-1 text-[13px] inline-block font-semibold mb-2" style={{ backgroundColor: 'oklch(0.44 0.16 324.65)', borderRadius: '1000px' }}>
              6 — Preuve Visuelle
            </span>
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-black uppercase tracking-wider">
                Photographie du matériel.
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={rowActionButton18Style}
                  className="transition-colors cursor-pointer font-sans"
                >
                  Photographier
                </button>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {photoUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      style={{
                        ...rowActionButton18Style,
                        backgroundColor: '#ef4444',
                      }}
                      className="transition-colors cursor-pointer font-sans hover:bg-red-600"
                    >
                      Supprimer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (photoUrl) window.open(photoUrl, '_blank');
                      }}
                      style={{
                        ...rowActionButton18Style,
                        backgroundColor: 'rgb(53, 86, 236)',
                      }}
                      className="transition-colors cursor-pointer font-sans hover:bg-blue-700"
                    >
                      Aperçu
                    </button>
                  </>
                )}
              </div>
              {photoUrl && (
                <div className="mt-3">
                  <img src={photoUrl} alt="Intervention audit" className="max-h-48 rounded-lg shadow border" />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 7: SIGNATURE */}
          <div className="bg-white p-5 space-y-4 shadow-sm" style={{ border: '1px solid rgb(218, 218, 218)', borderRadius: '18px' }}>
            <span className="text-white px-3 py-1 text-[13px] inline-block font-semibold" style={{ backgroundColor: 'oklch(0.44 0.16 324.65)', borderRadius: '1000px' }}>
              7 — Clôture & Signature
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-black uppercase">
                  Signature du technicien.
                </label>
                <div className="border border-slate-200 rounded-lg p-2 bg-white relative">
                  <canvas
                    ref={canvasRef}
                    width={350}
                    height={150}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full bg-white rounded border border-slate-200 cursor-crosshair touch-none"
                    style={{ height: '120px' }}
                  />
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-[16px] text-black font-semibold font-sans">
                      Dessiner votre signature ci-dessus
                    </span>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="text-[16px] text-red-500 font-bold hover:underline cursor-pointer"
                    >
                      Effacer
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="end-timestamp" className="block text-[11px] font-bold text-black uppercase">
                  Horodatage de clôture.
                </label>
                <input
                  type="text"
                  id="end-timestamp"
                  value={endTimeStamp}
                  onChange={(e) => setEndTimeStamp(e.target.value)}
                  placeholder="Signez pour appliquer l’horodatage."
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                />
              </div>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
