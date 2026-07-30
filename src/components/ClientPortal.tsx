import React, { useState, useRef, useEffect } from 'react';
import { Client, Defibrillateur, CommercialDoc, CompanyInfo, Variable, OtherEquipment, PointageAutoVigilance } from '../types';
import { formatDateToFR, computeProchaineMaintenance, formatDateToMonthYear } from '../utils';
import { t } from '../utils/translate';

interface ClientPortalProps {
  clients: Client[];
  defibrillateurs: Defibrillateur[];
  otherEquipments?: OtherEquipment[];
  commercialDocs: CommercialDoc[];
  variables: Variable[];
  onClose: () => void;
  onLogout: () => void;
  initialClient?: Client | null;
  companyInfo: CompanyInfo;
  generatedReports?: any[];
  onUpdateGeneratedReports?: (reports: any[]) => void;
  fsmTours?: any[];
  onUpdateFsmTours?: (tours: any[]) => void;
  onUpdateClient?: (client: Client) => void;
  stocks?: any[];
  pointagesAutoVigilance?: PointageAutoVigilance[];
  onAddPointageAutoVigilance?: (newPt: PointageAutoVigilance) => void;
  onAddTicket?: (ticketData: any) => string;
  onAddNotification?: (category: 'Stocks' | 'Défibrillateurs' | 'Interventions' | 'Factures & Devis' | 'Système', title: string) => void;
}

interface BarcodeProps {
  text: string;
}

function Barcode({ text }: BarcodeProps) {
  const sanitized = '*' + text.toUpperCase().replace(/[^0-9A-Z\-.\s]/g, '-') + '*';
  
  const charMap: { [key: string]: string } = {
    '0': 'b s b S B s B s b', '1': 'B s b S b s b s B', '2': 'b s B S b s b s B',
    '3': 'B s B S b s b s b', '4': 'b s b S B s b s B', '5': 'B s b S B s b s b',
    '6': 'b s B S B s b s b', '7': 'b s b S b s B s B', '8': 'B s b S b s B s b',
    '9': 'b s B S b s B s b', 'A': 'B s b s b S b s B', 'B': 'b s B s b S b s B',
    'C': 'B s B s b S b s b', 'D': 'b s b s B S b s B', 'E': 'B s b s B S b s b',
    'F': 'b s B s B S b s b', 'G': 'b s b s b S B s B', 'H': 'B s b s b S B s b',
    'I': 'b s B s b S B s b', 'J': 'b s b s B S B s b', 'K': 'B s b s b s b S B',
    'L': 'b s B s b s b S B', 'M': 'B s B s b s b S b', 'N': 'b s b s B s b S B',
    'O': 'B s b s B s b S b', 'P': 'b s B s B s b S b', 'Q': 'b s b s b s B S B',
    'R': 'B s b s b s B S b', 'S': 'b s B s b s B S b', 'T': 'b s b s B s B S b',
    'U': 'B S b s b s b s B', 'V': 'b S B s b s b s B', 'W': 'B S B s b s b s b',
    'X': 'b S b s B s b s B', 'Y': 'B S b s B s b s b', 'Z': 'b S B s B s b s b',
    '-': 'b S b s b s B s B', '.': 'B S b s b s B s b', ' ': 'b S B s b s B s b',
    '*': 'b S b s B s B s b'
  };

  const getWidthStr = (char: string) => {
    return charMap[char] || charMap['-'];
  };

  let x = 10;
  const rects: React.JSX.Element[] = [];
  const narrowWidth = 1.8;
  const wideWidth = 4.2;
  const height = 55;

  for (let i = 0; i < sanitized.length; i++) {
    const pattern = getWidthStr(sanitized[i]);
    const elements = pattern.split(' ');
    
    elements.forEach((el, index) => {
      const isBar = index % 2 === 0;
      const isWide = el === el.toUpperCase();
      const currentWidth = isWide ? wideWidth : narrowWidth;
      
      if (isBar) {
        rects.push(
          <rect key={`${i}-${index}`} x={x} y={10} width={currentWidth} height={height} fill="black" />
        );
      }
      x += currentWidth;
    });
    x += narrowWidth;
  }

  const svgWidth = x + 10;
  const svgHeight = height + 30;

  return (
    <div className="flex flex-col items-center p-2 bg-white max-w-xs mx-auto">
      <svg id={`barcode-${text}`} width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto block">
        {rects}
        <text x={svgWidth / 2} y={height + 25} textAnchor="middle" style={{ fontSize: '18px', letterSpacing: 'normal' }} className="font-sans font-semibold fill-black">
          {text}
        </text>
      </svg>
    </div>
  );
}

const handleDownloadBarcode = (text: string) => {
  const svgEl = document.getElementById(`barcode-${text}`);
  if (!svgEl) return;
  const svgString = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  const downloadLink = document.createElement('a');
  downloadLink.href = svgUrl;
  downloadLink.download = `codebarre_${text}.svg`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
};

const CODE39_MAP: { [key: string]: string } = {
  '0': '101001101101',
  '1': '110100101011',
  '2': '101100101011',
  '3': '110110010101',
  '4': '101001101011',
  '5': '110100110101',
  '6': '101100110101',
  '7': '101001011011',
  '8': '110100101101',
  '9': '101100101101',
  'A': '110101001011',
  'B': '101101001011',
  'C': '110110100101',
  'D': '101011001011',
  'E': '110101100101',
  'F': '101101100101',
  'G': '101010011011',
  'H': '110101001101',
  'I': '101101001101',
  'J': '101011001101',
  'K': '110101010011',
  'L': '101101010011',
  'M': '110110101001',
  'N': '101011010011',
  'O': '110101101001',
  'P': '101101101001',
  'Q': '101010110011',
  'R': '110101011001',
  'S': '101101011001',
  'T': '101011011001',
  'U': '110010101011',
  'V': '100110101011',
  'W': '110011010101',
  'X': '100101101011',
  'Y': '110010110101',
  'Z': '100111010101',
  '-': '100101011101',
  '.': '110010101101',
  ' ': '100110101101',
  '*': '100101101101',
  '$': '100100100101',
  '/': '100100101001',
  '+': '100101001001',
  '%': '101001001001'
};

function generateBarcodeSVGString(text: string): string {
  const cleanText = '*' + text.toUpperCase().replace(/[^0-9A-Z\-\.\ \$\/\+\%]/g, '-') + '*';
  let binaryString = '';
  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    binaryString += CODE39_MAP[char] || CODE39_MAP['-'];
    binaryString += '0';
  }

  const barWidth = 2.0;
  const barcodeHeight = 45;
  const textHeight = 20;
  const totalHeight = barcodeHeight + textHeight;
  const totalWidth = binaryString.length * barWidth;
  
  let rects = '';
  for (let i = 0; i < binaryString.length; i++) {
    if (binaryString[i] === '1') {
      rects += `<rect x="${i * barWidth}" y="0" width="${barWidth}" height="${barcodeHeight}" fill="black" />`;
    }
  }
  
  const textElement = `<text x="${totalWidth / 2}" y="${barcodeHeight + 16}" font-family="'DefibeoMain', 'Civilprom', sans-serif" font-size="14" text-anchor="middle" fill="black">${text}</text>`;
  
  return `<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">${rects}${textElement}</svg>`;
}

export default function ClientPortal({
  clients,
  defibrillateurs,
  otherEquipments = [],
  commercialDocs,
  variables,
  onClose,
  onLogout,
  initialClient = null,
  companyInfo,
  generatedReports = [],
  onUpdateGeneratedReports,
  fsmTours = [],
  onUpdateFsmTours,
  onUpdateClient,
  stocks = [],
  pointagesAutoVigilance = [],
  onAddPointageAutoVigilance,
  onAddTicket,
  onAddNotification,
}: ClientPortalProps) {
  const [activePortalTab, setActivePortalTab] = useState<'defibs' | 'bills' | 'reports' | 'info' | 'autovigilance'>('defibs');
  const [reportsFilter, setReportsFilter] = useState<'upcoming' | 'validated'>('validated');
  const [isCommunicationDismissed, setIsCommunicationDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('dismissed_portal_communication') === 'true';
    }
    return false;
  });

  const authenticatedClient = initialClient;

  // Contact editing states
  const [isEditingContacts, setIsEditingContacts] = useState(false);
  const [c1Nom, setC1Nom] = useState('');
  const [c1Tel, setC1Tel] = useState('');
  const [c1Email, setC1Email] = useState('');
  const [c1Type, setC1Type] = useState('');

  const [c2Nom, setC2Nom] = useState('');
  const [c2Tel, setC2Tel] = useState('');
  const [c2Email, setC2Email] = useState('');
  const [c2Type, setC2Type] = useState('');

  const [c3Nom, setC3Nom] = useState('');
  const [c3Tel, setC3Tel] = useState('');
  const [c3Email, setC3Email] = useState('');
  const [c3Type, setC3Type] = useState('');

  const [c4Nom, setC4Nom] = useState('');
  const [c4Tel, setC4Tel] = useState('');
  const [c4Email, setC4Email] = useState('');
  const [c4Type, setC4Type] = useState('');

  const [c5Nom, setC5Nom] = useState('');
  const [c5Tel, setC5Tel] = useState('');
  const [c5Email, setC5Email] = useState('');
  const [c5Type, setC5Type] = useState('');

  useEffect(() => {
    if (authenticatedClient) {
      setC1Nom(authenticatedClient.nomPrenomSite || '');
      setC1Tel(authenticatedClient.telephoneSite || '');
      setC1Email(authenticatedClient.emailSite || '');
      setC1Type(authenticatedClient.typeContact1 || '');

      setC2Nom(authenticatedClient.nomContact2 || '');
      setC2Tel(authenticatedClient.telephoneSite2 || '');
      setC2Email(authenticatedClient.emailSite2 || '');
      setC2Type(authenticatedClient.typeContact2 || '');

      setC3Nom(authenticatedClient.nomContact3 || '');
      setC3Tel(authenticatedClient.telephoneSite3 || '');
      setC3Email(authenticatedClient.emailSite3 || '');
      setC3Type(authenticatedClient.typeContact3 || '');

      setC4Nom(authenticatedClient.nomContact4 || '');
      setC4Tel(authenticatedClient.telephoneSite4 || '');
      setC4Email(authenticatedClient.emailSite4 || '');
      setC4Type(authenticatedClient.typeContact4 || '');

      setC5Nom(authenticatedClient.nomContact5 || '');
      setC5Tel(authenticatedClient.telephoneSite5 || '');
      setC5Email(authenticatedClient.emailSite5 || '');
      setC5Type(authenticatedClient.typeContact5 || '');
    }
  }, [authenticatedClient]);

  // Contact form state variables
  const [contactSelectedEquipId, setContactSelectedEquipId] = useState('autre');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSuccessMsg, setContactSuccessMsg] = useState('');
  const [contactErrorMsg, setContactErrorMsg] = useState('');

  useEffect(() => {
    if (authenticatedClient?.email) {
      setContactEmail(authenticatedClient.email);
    }
  }, [authenticatedClient]);

  // Signature related states & refs
  const [clientSignature, setClientSignature] = useState(authenticatedClient?.clientSignatureImage || '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const clientCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingSig = useRef(false);

  // Contract-specific states in ClientPortal
  const [portalRedactionContrat, setPortalRedactionContrat] = useState('');
  const [portalDateSignatureContrat, setPortalDateSignatureContrat] = useState('');
  const [portalSigneParContrat, setPortalSigneParContrat] = useState('');
  const [portalSignatureClientContratImage, setPortalSignatureClientContratImage] = useState('');
  const [contractSaveSuccess, setContractSaveSuccess] = useState(false);
  const [portalAccessKey, setPortalAccessKey] = useState('');
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPhone, setPortalPhone] = useState('');
  const [passwordSaveSuccess, setPasswordSaveSuccess] = useState(false);

  const portalContractCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingPortalContractSig = useRef(false);

  useEffect(() => {
    if (authenticatedClient) {
      setPortalRedactionContrat(authenticatedClient.redactionContrat || '');
      setPortalDateSignatureContrat(authenticatedClient.dateSignatureContrat || new Date().toISOString().split('T')[0]);
      setPortalSigneParContrat(authenticatedClient.signeParContrat || '');
      setPortalSignatureClientContratImage(authenticatedClient.signatureClientContratImage || '');
      setPortalAccessKey(authenticatedClient.accessKey || '');
      setPortalEmail(authenticatedClient.email || '');
      setPortalPhone(authenticatedClient.phone || '');
    }
  }, [authenticatedClient]);

  useEffect(() => {
    if (activePortalTab === 'bills' && companyInfo?.enableDevisFactures === 'Non') {
      setActivePortalTab('defibs');
    }
  }, [activePortalTab, companyInfo]);

  useEffect(() => {
    if (activePortalTab === 'info' && portalSignatureClientContratImage && portalContractCanvasRef.current) {
      const canvas = portalContractCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = portalSignatureClientContratImage;
      }
    }
  }, [portalSignatureClientContratImage, activePortalTab]);

  const startDrawingPortalContractSig = (e: React.MouseEvent | React.TouchEvent) => {
    if (authenticatedClient?.signatureClientContratImage) return; // Read-only once saved
    e.preventDefault();
    const canvas = portalContractCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingPortalContractSig.current = true;
    const pos = getEventCoordsSig(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const drawPortalContractSig = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingPortalContractSig.current) return;
    e.preventDefault();
    const canvas = portalContractCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getEventCoordsSig(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawingPortalContractSig = () => {
    if (!isDrawingPortalContractSig.current) return;
    isDrawingPortalContractSig.current = false;
    const canvas = portalContractCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL();
      setPortalSignatureClientContratImage(dataUrl);
    }
  };

  const clearPortalContractSignature = () => {
    if (authenticatedClient?.signatureClientContratImage) return; // Read-only once saved
    const canvas = portalContractCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setPortalSignatureClientContratImage('');
  };

  const handleSavePortalContract = () => {
    if (!authenticatedClient || !onUpdateClient) return;
    if (!portalSigneParContrat.trim()) {
      alert("Veuillez renseigner le champ 'Signé par' avant d'enregistrer.");
      return;
    }
    if (!portalSignatureClientContratImage) {
      alert("Veuillez signer avant d'enregistrer.");
      return;
    }

    const updated: Client = {
      ...authenticatedClient,
      dateSignatureContrat: portalDateSignatureContrat,
      signeParContrat: portalSigneParContrat.trim(),
      signatureClientContratImage: portalSignatureClientContratImage,
    };

    onUpdateClient(updated);
    setContractSaveSuccess(true);
    setTimeout(() => {
      setContractSaveSuccess(false);
    }, 3000);
  };

  const handleDownloadContractPDF = () => {
    if (!authenticatedClient) return;
    const compLogo = companyInfo.logo || '';
    const compName = companyInfo.name || 'Défibeo Solutions';
    const compEmail = companyInfo.email || '';
    const compPhone = companyInfo.phone || '';
    const compWebsite = companyInfo.website || '';

    // Format date beautifully under contract options
    const formattedDate = portalDateSignatureContrat ? new Date(portalDateSignatureContrat).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) : '-';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Contrat de Maintenance - ${authenticatedClient.denomination || 'Client'}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @font-face {
            font-family: "Gochi";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: "Civilprom";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
            font-weight: 100 900;
            font-style: normal;
            font-display: swap;
          }
          
          @page {
            size: auto;
            margin: 0;
          }
          
          body, select, input, textarea, div, p, span, h1, h2, h3, h4, table, tr, th, td, a {
            font-family: "Civilprom", sans-serif !important;
            font-weight: 100 !important;
            color: #000000 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            font-size: 16px !important;
          }
          
          .text-large {
            font-size: 18px !important;
          }
          
          h1.doc-title {
            font-family: "Gochi" !important;
            font-size: 55px !important;
            font-weight: normal !important;
            line-height: 1 !important;
          }
          
          .blue-link {
            color: #2563eb !important;
            text-decoration: underline !important;
            font-weight: 100 !important;
          }
          
          @media print {
            body { background: white !important; padding: 0 !important; margin: 1.6cm 1.6cm 1.6cm 1.6cm !important; }
            .max-w-3xl { border: none !important; box-shadow: none !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; }
          }
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        </style>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </head>
      <body class="bg-white text-black p-8">
        <div class="max-w-3xl mx-auto p-4 md:p-8" style="background-color: #ffffff; display: flex; flex-direction: column; gap: 24px; box-sizing: border-box;">
          
          <!-- HAUT DE PAGE / COORDONNEES -->
          <div class="flex justify-between items-start pb-4" style="border-bottom: none;">
            <div>
              ${compLogo ? `<img src="${compLogo}" style="max-width: 300px; max-height: 100px; object-fit: contain; margin-bottom: 12px; display: block;" referrerPolicy="no-referrer" />` : ''}
              <span class="text-large" style="display: block; margin-bottom: 4px;">${compName}</span>
              <div>${compEmail}</div>
              <div>${compPhone}</div>
              <div style="margin-top: 2px;"><a href="https://${compWebsite}" target="_blank" class="blue-link">${compWebsite}</a></div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: bold;">CONTRAT DE MAINTENANCE</div>
              <div style="margin-top: 4px; color: #555;">Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
              <div style="margin-top: 4px; color: #555; font-size: 14px !important;">
                Début : <strong>${formatDateToFR(authenticatedClient.debutContrat) || authenticatedClient.debutContrat || '-'}</strong>
              </div>
              <div style="margin-top: 2px; color: #555; font-size: 14px !important;">
                Expiration : <strong>${formatDateToFR(authenticatedClient.finContrat) || authenticatedClient.finContrat || '-'}</strong>
              </div>
            </div>
          </div>

          <!-- TITRE DU DOCUMENT / INFOS CLIENT -->
          <div class="grid grid-cols-2 gap-6 avoid-break" style="margin-top: 20px;">
            <div>
              <h1 class="doc-title" style="margin-bottom: 10px;">CONTRAT</h1>
              <div style="font-size: 14px !important; color: #555 !important; display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
                <div>Numéro de marché : <strong>${authenticatedClient.numeroMarche || '-'}</strong></div>
                <div>Payeur ID : <strong>${authenticatedClient.payeurId || '-'}</strong></div>
                <div>Client ID : <strong>${authenticatedClient.clientIdField || '-'}</strong></div>
              </div>
            </div>
            <div style="border: 1px solid #dcdcdc; padding: 16px; border-radius: 12px; background-color: #ffffff;">
              <div style="margin-bottom: 6px; font-weight: bold; color: #555;">Client bénéficiaire.</div>
              <div style="font-size: 24px !important; font-weight: bold !important; margin-bottom: 6px; line-height: 1.2 !important;">${authenticatedClient.denomination || 'Non renseigné'}</div>
              ${authenticatedClient.siret ? `<div style="margin-bottom: 2px;">SIRET. ${authenticatedClient.siret}</div>` : ''}
              ${authenticatedClient.nomPrenomSite ? `<div style="margin-bottom: 2px;">Contact site. ${authenticatedClient.nomPrenomSite}</div>` : ''}
              ${authenticatedClient.email ? `<div style="margin-bottom: 2px;">Email. ${authenticatedClient.email}</div>` : ''}
              ${authenticatedClient.phone ? `<div style="margin-bottom: 2px;">${t("Téléphone.")} ${authenticatedClient.phone}</div>` : ''}
            </div>
          </div>

          <!-- CORPS DU CONTRAT -->
          <div class="avoid-break" style="border: 1px solid #dcdcdc; border-radius: 12px; padding: 20px; background-color: #fafafa; margin-top: 10px;">
            <div style="white-space: pre-wrap; font-size: 15px !important; line-height: 1.6 !important; color: #333333 !important;">
              ${portalRedactionContrat || "Aucun détail contractuel n'est rédigé."}
            </div>
          </div>

          <!-- SIGNATURES -->
          <div class="avoid-break" style="border: 1px solid #dcdcdc; border-radius: 12px; padding: 20px; background-color: #ffffff; margin-top: 10px;">
            <div class="grid grid-cols-2 gap-6" style="margin-top: 12px;">
              <div>
                <div style="font-weight: bold; margin-bottom: 6px; color: #555;">Le prestataire :</div>
                <div style="font-size: 15px !important; font-weight: bold !important;">${compName}</div>
                <div style="font-size: 13px !important; color: #64748b; margin-top: 4px;">Signé électroniquement par défaut de service contractuel.</div>
              </div>
              <div style="border-left: 1px solid #e2e8f0; padding-left: 20px;">
                <div style="font-weight: bold; margin-bottom: 6px; color: #555;">Le Client :</div>
                <div style="font-size: 15px !important;"><span style="color: #64748b;">Signataire :</span> <strong>${portalSigneParContrat || '-'}</strong></div>
                <div style="font-size: 13px !important; color: #64748b; margin-top: 2px;">Date signature : ${formattedDate}</div>
                
                <div style="margin-top: 12px; text-align: center;">
                  ${portalSignatureClientContratImage ? `
                    <div style="display: inline-block; padding: 6px; border-radius: 8px; background-color: #fff;">
                      <img src="${portalSignatureClientContratImage}" style="max-height: 70px; max-width: 220px; object-fit: contain;" alt="Signature Client" />
                    </div>
                  ` : `
                    <div style="border: 1px dashed #dcdcdc; padding: 20px; color: #a1a1a1; font-style: italic; font-size: 14px !important; border-radius: 8px;">
                      Contrat en attente de signature client
                    </div>
                  `}
                </div>
              </div>
            </div>
          </div>

        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  useEffect(() => {
    if (authenticatedClient) {
      setClientSignature(authenticatedClient.clientSignatureImage || '');
    }
  }, [authenticatedClient]);

  useEffect(() => {
    if (activePortalTab === 'info' && clientSignature && clientCanvasRef.current) {
      const canvas = clientCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = clientSignature;
      }
    }
  }, [clientSignature, activePortalTab]);

  const startDrawingSig = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = clientCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingSig.current = true;
    const pos = getEventCoordsSig(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const drawSig = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingSig.current) return;
    e.preventDefault();
    const canvas = clientCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getEventCoordsSig(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawingSig = () => {
    if (!isDrawingSig.current) return;
    isDrawingSig.current = false;
    const canvas = clientCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL();
      setClientSignature(dataUrl);
    }
  };

  const clearSignatureSig = () => {
    const canvas = clientCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setClientSignature('');
  };

  const getEventCoordsSig = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleSaveSignature = () => {
    if (!authenticatedClient) return;
    if (onUpdateClient) {
      const updated: Client = {
        ...authenticatedClient,
        clientSignatureImage: clientSignature || undefined,
      };
      onUpdateClient(updated);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    }
  };

  const handleSaveContacts = () => {
    if (!authenticatedClient) return;
    if (onUpdateClient) {
      const updated: Client = {
        ...authenticatedClient,
        nomPrenomSite: c1Nom,
        telephoneSite: c1Tel,
        emailSite: c1Email,
        typeContact1: c1Type,

        nomContact2: c2Nom,
        telephoneSite2: c2Tel,
        emailSite2: c2Email,
        typeContact2: c2Type,

        nomContact3: c3Nom,
        telephoneSite3: c3Tel,
        emailSite3: c3Email,
        typeContact3: c3Type,

        nomContact4: c4Nom,
        telephoneSite4: c4Tel,
        emailSite4: c4Email,
        typeContact4: c4Type,

        nomContact5: c5Nom,
        telephoneSite5: c5Tel,
        emailSite5: c5Email,
        typeContact5: c5Type,
      };
      onUpdateClient(updated);
      setIsEditingContacts(false);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    }
  };

  const handleSavePassword = () => {
    if (!authenticatedClient) return;
    if (onUpdateClient) {
      const updated: Client = {
        ...authenticatedClient,
        email: portalEmail.trim(),
        phone: portalPhone.trim(),
        accessKey: portalAccessKey.trim()
      };
      onUpdateClient(updated);
      setPasswordSaveSuccess(true);
      setTimeout(() => {
        setPasswordSaveSuccess(false);
      }, 3000);
    }
  };

  const renderEditField = (label: string, value: string, onChange: (val: string) => void) => {
    return (
      <div className="space-y-1">
        <span className="block text-[18px] font-bold text-black font-sans select-none">
          {label}
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          className="w-full text-[18px] text-black bg-white focus:outline-none transition-all placeholder:text-gray-400 font-sans"
          style={{
            border: '1px solid #cfcfcf',
            borderRadius: '11px',
            padding: '10px 14px',
            fontWeight: 100,
            height: '48px'
          }}
        />
      </div>
    );
  };

  const renderEditSelectField = (label: string, value: string, onChange: (val: string) => void, options: string[]) => {
    return (
      <div className="space-y-1">
        <span className="block text-[18px] font-bold text-black font-sans select-none">
          {label}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-[18px] text-black bg-white focus:outline-none transition-all font-sans cursor-pointer appearance-none"
          style={{
            border: '1px solid #cfcfcf',
            borderRadius: '11px',
            padding: '10px 14px',
            height: '48px',
          }}
        >
          <option value="">{t("Sélectionnez")}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {t(opt)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  // Filter content for the logged-in client
  const clientDefibs = authenticatedClient
    ? defibrillateurs.filter((df) => df.clientId === authenticatedClient.id)
    : [];

  const clientOthers = authenticatedClient
    ? otherEquipments.filter((oth) => oth.clientId === authenticatedClient.id)
    : [];

  // Pointages form states
  const [selectedEquipId, setSelectedEquipId] = useState('');
  const [pointageDate, setPointageDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [pointageComment, setPointageComment] = useState<'En fonctionnement et accessible' | 'Problème résolu' | 'Problème non résolu' | 'Problème non résolu et assistance demandée'>('En fonctionnement et accessible');
  const [pointageSuccess, setPointageSuccess] = useState(false);

  const assignedEquipment = [
    ...clientDefibs.map(d => ({
      id: d.id,
      identifiant: d.identifiant,
      nom: `${variables.find(v => v.id === d.modeleId)?.nom || 'Défibrillateur'} (${d.identifiant})`,
      type: 'defib'
    })),
    ...clientOthers.map(o => ({
      id: o.id,
      identifiant: o.identifiant,
      nom: `${o.categorie || 'Autre matériel'} (${o.identifiant})`,
      type: 'other'
    }))
  ];

  const checkedEquipIdsOnSameDay = (pointagesAutoVigilance || [])
    .filter(p => p.clientId === authenticatedClient?.id && p.date === pointageDate)
    .map(p => p.equipementId);

  const filteredAssignedEquipment = assignedEquipment.filter(eq => !checkedEquipIdsOnSameDay.includes(eq.id));

  useEffect(() => {
    if (selectedEquipId) {
      const alreadyChecked = (pointagesAutoVigilance || [])
        .some(p => p.clientId === authenticatedClient?.id && p.date === pointageDate && p.equipementId === selectedEquipId);
      if (alreadyChecked) {
        setSelectedEquipId('');
      }
    }
  }, [pointageDate, pointagesAutoVigilance, selectedEquipId, authenticatedClient]);

  const handleSavePointage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticatedClient) return;
    if (!selectedEquipId) {
      alert('Veuillez sélectionner un matériel.');
      return;
    }
    const equip = assignedEquipment.find(eq => eq.id === selectedEquipId);
    if (!equip) return;

    if (onAddPointageAutoVigilance) {
      const newPt: PointageAutoVigilance = {
        id: 'pt_av_' + Date.now(),
        clientId: authenticatedClient.id,
        equipementId: equip.id,
        equipementIdentifiant: equip.identifiant,
        equipementNom: equip.nom,
        date: pointageDate,
        commentaire: pointageComment,
        createdAt: new Date().toISOString()
      };
      onAddPointageAutoVigilance(newPt);
      setSelectedEquipId('');
      setPointageSuccess(true);
      setTimeout(() => {
        setPointageSuccess(false);
      }, 3000);
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSuccessMsg('');
    setContactErrorMsg('');

    if (!contactEmail.trim()) {
      setContactErrorMsg(t("Veuillez saisir votre adresse e-mail."));
      return;
    }
    if (!contactMessage.trim()) {
      setContactErrorMsg(t("Veuillez rédiger un message."));
      return;
    }

    let targetId = 'Autre';
    let targetLabel = 'Autre';
    if (contactSelectedEquipId !== 'autre') {
      const found = assignedEquipment.find(eq => eq.id === contactSelectedEquipId);
      if (found) {
        targetId = found.identifiant || found.id;
        targetLabel = found.nom;
      }
    }

    if (onAddTicket) {
      const isDefib = assignedEquipment.find(eq => eq.id === contactSelectedEquipId)?.type === 'defib';
      const ticketObjet = isDefib ? 'Défibrillateur endommagé' : 'Autre';

      const ticketId = onAddTicket({
        identifiant: targetId,
        objet: ticketObjet,
        message: `${contactMessage}\n\n[Client: ${authenticatedClient?.denomination || 'Client'}]\n[Matériel: ${targetLabel}]`,
        email: contactEmail.trim(),
        phone: authenticatedClient?.phone || '',
      });

      if (onAddNotification) {
        onAddNotification(
          'Défibrillateurs',
          `${t("Nouveau ticket")} ${ticketId} - ${authenticatedClient?.denomination || 'Client'} (${targetId})`
        );
      }

      setContactSuccessMsg(`${t("Votre demande a bien été envoyée à l'exploitant. Ticket")} ${ticketId}`);
      setContactMessage('');
    } else {
      setContactErrorMsg(t("Le service de support n'est pas disponible pour le moment."));
    }
  };

  const clientDocs = authenticatedClient
    ? commercialDocs.filter((doc) => doc.clientId === authenticatedClient.id)
    : [];

  // Downloader for Devis et Factures
  const handleDownloadDoc = (doc: CommercialDoc) => {
    const totalTva = doc.totalHt * 0.20;
    const totalTtc = doc.totalHt * 1.20;
    
    const formatDateStr = (dateStr: string) => {
      if (!dateStr) return '';
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    const itemsHtml = doc.items.map((item, idx) => {
      const isLast = idx === doc.items.length - 1;
      return `
        <tr style="${isLast ? '' : 'border-bottom: 1px solid #dcdcdc;'}">
          <td style="padding: 12px 8px;">${item.nomPiece}</td>
          <td style="padding: 12px 8px; text-align: right;">${item.prixVenteHt.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</td>
          <td style="padding: 12px 8px; text-align: center;">${item.quantite}</td>
          <td style="padding: 12px 8px; text-align: right;">${(item.prixVenteHt * item.quantite).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</td>
        </tr>
      `;
    }).join('');

    const clientObj = clients.find(c => c.id === doc.clientId) || clients.find(c => c.denomination === doc.clientDenomination);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>${doc.type} ${doc.ref}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @font-face {
            font-family: "Gochi";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: "Civilprom";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
            font-weight: 100 900;
            font-style: normal;
            font-display: swap;
          }
          
          @page {
            size: auto;
            margin: 0;
          }
          
          body, select, input, textarea, div, p, span, h1, h2, h3, h4, table, tr, th, td, a {
            font-family: "Civilprom", sans-serif !important;
            font-weight: 100 !important;
            color: #000000 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            font-size: 16px !important;
          }
          
          .text-large {
            font-size: 18px !important;
          }
          
          h1.doc-title {
            font-family: "Gochi" !important;
            font-size: 55px !important;
            font-weight: normal !important;
            line-height: 1 !important;
          }
          
          .blue-link {
            color: #2563eb !important;
            text-decoration: underline !important;
            font-weight: 100 !important;
          }
          
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; padding: 0 !important; margin: 1.6cm 1.6cm 1.6cm 1.6cm !important; }
            .max-w-3xl { border: none !important; box-shadow: none !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; }
          }
        </style>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </head>
      <body class="bg-white text-black p-8">
        <div class="max-w-3xl mx-auto p-4 md:p-8" style="background-color: #ffffff; display: flex; flex-direction: column; gap: 24px; box-sizing: border-box;">
          
          <!-- HAUT DE PAGE / COORDONNEES -->
          <div class="flex justify-between items-start pb-4">
            <div>
              ${companyInfo.logo ? `<img src="${companyInfo.logo}" style="max-width: 300px; max-height: 100px; object-fit: contain; margin-bottom: 12px; display: block;" referrerPolicy="no-referrer" />` : ''}
              <span class="text-large" style="display: block; margin-bottom: 4px;">${companyInfo.name}</span>
              <div>${companyInfo.email}</div>
              <div>${companyInfo.phone}</div>
              <div style="margin-top: 2px;"><a href="https://${companyInfo.website}" target="_blank" class="blue-link">${companyInfo.website}</a></div>
            </div>
            <div style="text-align: right;">
              <div>${formatDateStr(doc.dateStr)}</div>
            </div>
          </div>

          <!-- TITRE DU DOCUMENT / INFOS CLIENT -->
          <div class="grid grid-cols-2 gap-6" style="margin-top: 20px;">
            <div>
              <h1 class="doc-title">${doc.type === 'Devis' ? 'DEVIS' : 'FACTURE'}</h1>
              <p style="margin: 4px 0 0 0;">Référence : ${doc.ref}</p>
              <p style="margin: 4px 0 0 0;">Remarque : ${doc.commentaire || ''}</p>
              <p style="margin: 4px 0 0 0;">Référence du contrat : ${clientObj?.referenceContrat || '-'}</p>
              <p style="margin: 4px 0 0 0;">Numéro de marché : ${clientObj?.numeroMarche || '-'}</p>
              <p style="margin: 4px 0 0 0;">Payeur ID : ${clientObj?.payeurId || '-'}</p>
              <p style="margin: 4px 0 0 0;">Client ID : ${clientObj?.clientIdField || '-'}</p>
            </div>
            <div style="border: 1px solid #dcdcdc; padding: 16px; border-radius: 12px; background-color: #ffffff;">
              <div style="margin-bottom: 6px;">Client.</div>
              <div style="font-size: 24px !important; font-weight: bold !important; margin-bottom: 6px; line-height: 1.2 !important;">${clientObj ? clientObj.denomination : doc.clientDenomination}</div>
              ${clientObj ? `
                ${clientObj.nomPrenomSite ? `<div style="margin-bottom: 2px;">Contact. ${clientObj.nomPrenomSite}</div>` : ''}
                ${clientObj.siret ? `<div style="margin-bottom: 2px;">Numéro fiscal. ${clientObj.siret}</div>` : ''}
                ${clientObj.email ? `<div style="margin-bottom: 2px;">Email. ${clientObj.email}</div>` : ''}
                ${clientObj.phone ? `<div style="margin-bottom: 2px;">${t("Téléphone.")} ${clientObj.phone}</div>` : ''}
              ` : ''}
            </div>
          </div>

          <!-- TABLEAU DES PRESTATIONS / PIECES -->
          <div style="border: 1px solid #dcdcdc; border-radius: 12px; overflow: hidden; margin-top: 20px; background-color: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid #dcdcdc;">
                  <th style="padding: 10px 8px; font-weight: 100 !important;">Description.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: right;">Prix unitaire.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: center;">Volume.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: right;">Total ligne.</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- SECTION DE COMMODITES DES CALCULS (TOTALS) -->
          <div style="display: flex; justify-content: flex-end; padding-top: 16px;">
            <div style="width: 256px; border: 1px solid #dcdcdc; border-radius: 12px; padding: 16px; background-color: #ffffff; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between;">
                <span>Total HT.</span>
                <span>${doc.totalHt.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Total TVA (20%).</span>
                <span>${totalTva.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</span>
              </div>
              <div style="display: flex; justify-content: space-between;" class="text-large">
                <span>Total TTC.</span>
                <span>${totalTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</span>
              </div>
            </div>
          </div>

          <!-- MENTIONS LEGALES ET CONDITIONS -->
          ${companyInfo.mentionsLegalesFactures || companyInfo.conditionsLegalesLink ? `
            <div style="border: 1px solid #dcdcdc; border-radius: 12px; padding: 16px; background-color: #ffffff; display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
              ${companyInfo.mentionsLegalesFactures ? `<div style="font-size: 15px !important;">Mentions légales : ${companyInfo.mentionsLegalesFactures}</div>` : ''}
              ${companyInfo.conditionsLegalesLink ? `<div style="font-xs !important;">Conditions légales : <a href="${companyInfo.conditionsLegalesLink}" target="_blank" class="blue-link">${companyInfo.conditionsLegalesLink}</a></div>` : ''}
            </div>
          ` : ''}

        </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleDownloadBonCommande = (doc: CommercialDoc) => {
    if (!doc.hasBonCommande) return;

    const totalTva = doc.totalHt * 0.20;
    const totalTtc = doc.totalHt * 1.20;
    
    const formatDateStr = (dateStr: string) => {
      if (!dateStr) return '';
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    const itemsHtml = doc.items.map((item, idx) => {
      const isLast = idx === doc.items.length - 1;
      const itemUgs = item.ugs || stocks.find((s: any) => s.denominationPieceId === item.variableId)?.ugs || '—';
      return `
        <tr style="${isLast ? '' : 'border-bottom: 1px solid #dcdcdc;'}">
          <td style="padding: 12px 8px; font-family: monospace;">${itemUgs}</td>
          <td style="padding: 12px 8px;">${item.nomPiece}</td>
          <td style="padding: 12px 8px; text-align: right;">${item.prixVenteHt.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</td>
          <td style="padding: 12px 8px; text-align: center;">${item.quantite}</td>
          <td style="padding: 12px 8px; text-align: right;">${(item.prixVenteHt * item.quantite).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</td>
        </tr>
      `;
    }).join('');

    const clientObj = clients.find(c => c.id === doc.clientId) || clients.find(c => c.denomination === doc.clientDenomination);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Bon de commande ${doc.bonCommandeReference || 'Sans réf'}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @font-face {
            font-family: "Gochi";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: "Civilprom";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
            font-weight: 100 900;
            font-style: normal;
            font-display: swap;
          }
          
          @page {
            size: auto;
            margin: 0;
          }
          
          body, select, input, textarea, div, p, span, h1, h2, h3, h4, table, tr, th, td, a {
            font-family: "Civilprom", sans-serif !important;
            font-weight: 100 !important;
            color: #000000 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            font-size: 16px !important;
          }
          
          .text-large {
            font-size: 18px !important;
          }
          
          h1.doc-title {
            font-family: "Gochi" !important;
            font-size: 55px !important;
            font-weight: normal !important;
            line-height: 1 !important;
          }
          
          .blue-link {
            color: #2563eb !important;
            text-decoration: underline !important;
            font-weight: 100 !important;
          }
          
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; padding: 0 !important; margin: 1.6cm 1.6cm 1.6cm 1.6cm !important; }
            .max-w-3xl { border: none !important; box-shadow: none !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; }
          }
        </style>
      </head>
      <body class="bg-white text-black p-8">
        <div class="max-w-3xl mx-auto p-4 md:p-8" style="background-color: #ffffff; display: flex; flex-direction: column; gap: 24px; box-sizing: border-box;">
          
          <!-- HAUT DE PAGE / COORDONNEES -->
          <div class="flex justify-between items-start pb-4">
            <div>
              ${companyInfo.logo ? `<img src="${companyInfo.logo}" style="max-width: 300px; max-height: 100px; object-fit: contain; margin-bottom: 12px; display: block;" referrerPolicy="no-referrer" />` : ''}
              <span class="text-large" style="display: block; margin-bottom: 4px;">${companyInfo.name}</span>
              <div>${companyInfo.email}</div>
              <div>${companyInfo.phone}</div>
              <div style="margin-top: 2px;"><a href="https://${companyInfo.website}" target="_blank" class="blue-link">${companyInfo.website}</a></div>
            </div>
            <div style="text-align: right;">
              <div>${formatDateStr(doc.dateStr)}</div>
            </div>
          </div>

          <!-- TITRE DU DOCUMENT / INFOS CLIENT -->
          <div class="grid grid-cols-2 gap-6" style="margin-top: 20px;">
            <div>
              <h1 class="doc-title">BON DE COMMANDE</h1>
              <p style="margin: 4px 0 0 0;">Référence BC : ${doc.bonCommandeReference || '-'}</p>
              <p style="margin: 4px 0 0 0;">Livraison : ${doc.bonCommandeLivraison || '-'}</p>
              <p style="margin: 4px 0 0 0;">Situation : ${doc.bonCommandeSituation || '-'}</p>
              <p style="margin: 4px 0 0 0;">Remarque : ${doc.commentaire || ''}</p>
              <p style="margin: 4px 0 0 0;">Entête : ${doc.bonCommandeEntete || '-'}</p>
              <p style="margin: 4px 0 0 0;">Référence du contrat : ${clientObj?.referenceContrat || '-'}</p>
              <p style="margin: 4px 0 0 0;">Numéro de marché : ${clientObj?.numeroMarche || '-'}</p>
              <p style="margin: 4px 0 0 0;">Payeur ID : ${clientObj?.payeurId || '-'}</p>
              <p style="margin: 4px 0 0 0;">Client ID : ${clientObj?.clientIdField || '-'}</p>
            </div>
            <div style="border: 1px solid #dcdcdc; padding: 16px; border-radius: 12px; background-color: #ffffff;">
              <div style="margin-bottom: 6px;">Client.</div>
              <div style="font-size: 24px !important; font-weight: bold !important; margin-bottom: 6px; line-height: 1.2 !important;">${clientObj ? clientObj.denomination : doc.clientDenomination}</div>
              ${clientObj ? `
                ${clientObj.nomPrenomSite ? `<div style="margin-bottom: 2px;">Contact. ${clientObj.nomPrenomSite}</div>` : ''}
                ${clientObj.siret ? `<div style="margin-bottom: 2px;">Numéro fiscal. ${clientObj.siret}</div>` : ''}
                ${clientObj.email ? `<div style="margin-bottom: 2px;">Email. ${clientObj.email}</div>` : ''}
                ${clientObj.phone ? `<div style="margin-bottom: 2px;">Téléphone. ${clientObj.phone}</div>` : ''}
              ` : ''}
            </div>
          </div>

          <!-- TABLEAU DES PRESTATIONS / PIECES -->
          <div style="border: 1px solid #dcdcdc; border-radius: 12px; overflow: hidden; margin-top: 20px; background-color: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid #dcdcdc;">
                  <th style="padding: 10px 8px; font-weight: 100 !important;">UGS.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important;">Description.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: right;">Prix unitaire.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: center;">Volume.</th>
                  <th style="padding: 10px 8px; font-weight: 100 !important; text-align: right;">Total ligne.</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- SECTION DE COMMODITES DES CALCULS (TOTALS) -->
          <div style="display: flex; justify-content: flex-end; padding-top: 16px;">
            <div style="width: 256px; border: 1px solid #dcdcdc; border-radius: 12px; padding: 16px; background-color: #ffffff; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between;">
                <span>Total HT.</span>
                <span>${doc.totalHt.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Total TVA (20%).</span>
                <span>${totalTva.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</span>
              </div>
              <div style="display: flex; justify-content: space-between;" class="text-large">
                <span>Total TTC.</span>
                <span>${totalTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€</span>
              </div>
            </div>
          </div>

          <!-- MENTIONS LEGALES ET CONDITIONS -->
          ${companyInfo.mentionsLegalesFactures || companyInfo.conditionsLegalesLink ? `
            <div style="border: 1px solid #dcdcdc; border-radius: 12px; padding: 16px; background-color: #ffffff; display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
              ${companyInfo.mentionsLegalesFactures ? `<div style="font-size: 15px !important;">Mentions légales : ${companyInfo.mentionsLegalesFactures}</div>` : ''}
              ${companyInfo.conditionsLegalesLink ? `<div style="font-xs !important;">Conditions légales : <a href="${companyInfo.conditionsLegalesLink}" target="_blank" class="blue-link">${companyInfo.conditionsLegalesLink}</a></div>` : ''}
            </div>
          ` : ''}

        </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const computeDurationText = (startStr: string, endStr: string): string => {
    if (!startStr || !endStr) return "-";
    const parseDateString = (str: string): Date | null => {
      if (!str) return null;
      const match = str.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        const hours = parseInt(match[4], 10);
        const minutes = parseInt(match[5], 10);
        const seconds = match[6] ? parseInt(match[6], 10) : 0;
        return new Date(year, month, day, hours, minutes, seconds);
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return parsed;
      try {
        const parts = str.trim().split(' ');
        if (parts.length >= 2) {
          const dateParts = parts[0].split(/[/-]/);
          const timeParts = parts[1].split(':');
          if (dateParts.length === 3 && timeParts.length >= 2) {
            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const year = parseInt(dateParts[2], 10);
            const hours = parseInt(timeParts[0], 10);
            const minutes = parseInt(timeParts[1], 10);
            const seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
            return new Date(year, month, day, hours, minutes, seconds);
          }
        }
      } catch (e) {}
      return null;
    };

    const start = parseDateString(startStr);
    const end = parseDateString(endStr);
    if (!start || !end) return "-";
    let diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) diffMs = 0;
    const totalSecs = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (num: number) => String(num).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const handleDownloadReport = (report: any) => {
    const snapshot = report.defibSnapshot || defibrillateurs.find(d => d.id === report.defibId || d.identifiant === report.defibIdentifiant) || {};
    const pdfLogo = companyInfo.logo || '';
    const pdfHeaderImg = companyInfo.pdfHeaderImg || '';
    const pdfPageHeaderText = companyInfo.pdfPageHeaderText || '';
    const pdfPageFooterText = companyInfo.pdfPageFooterText || '';
    const pdfLastPageInfoText = companyInfo.pdfLastPageInfoText || '';
    const pdfHeaderBgColor = companyInfo.pdfHeaderBgColor || '#7c2882';
    const pdfCardBorderColor = companyInfo.pdfCardBorderColor || '#7d2882';
    const pdfCardBgColor = companyInfo.pdfCardBgColor || '#fef2ff';
    const pdfLabelTextColor = companyInfo.pdfLabelTextColor || '#9f71a2';
    const hasLastPage = !!pdfLastPageInfoText.trim();

    const compLogo = companyInfo.logo || '';
    const compName = companyInfo.name || 'Défibeo Solutions';
    const compEmail = companyInfo.email || '';
    const compPhone = companyInfo.phone || '';
    const compWebsite = companyInfo.website || '';

    let htmlContent = '';
    const isOther = snapshot.categorie && snapshot.categorie !== 'Défibrillateur';

    if (isOther) {
      // Filter out typical top-level keys to get custom equipment properties!
      const topLevelKeys = [
        'id', 'clientId', 'nomPrenomSite', 'telephoneSite', 'emailSite', 'contrat', 'nomContrat', 'referenceContrat',
        'debutContrat', 'finContrat', 'pays', 'codePostal', 'cp', 'ville', 'adresseComplexe', 'identifiant',
        'codeNfc', 'statutGmao', 'categorie', 'conforme', 'miseEnServiceDate', 'miseEnService', 'commentaireGmao'
      ];
      
      const customProperties = Object.entries(snapshot).filter(([k, v]) => {
        return !topLevelKeys.includes(k) && v !== undefined && v !== null && v !== '' && typeof v !== 'object';
      });

      let clientFound = clients.find(c => c.id === snapshot.clientId) || authenticatedClient;
      if (!clientFound && snapshot.clientId) {
        clientFound = clients.find(c => c.denomination === snapshot.clientId || c.id === snapshot.clientId);
      }
      if (!clientFound && report.clientId) {
        clientFound = clients.find(c => c.id === report.clientId);
      }
      const clientName = clientFound ? clientFound.denomination : (snapshot.nomPrenomSite || 'Non rattaché');

      const totalPages = hasLastPage ? 3 : 2;
      const docTitle = report.title ? report.title : `Rapport d’intervention - ${snapshot.categorie || ''}`;

      const renderHeader = (title: string) => {
        const showHeaderImg = pdfHeaderImg ? `<img src="${pdfHeaderImg}" style="max-height: 80px; max-width: 100%; object-fit: contain;" alt="Header Illustration" referrerPolicy="no-referrer" />` : '';
        const showHeaderLogo = pdfLogo ? `<img src="${pdfLogo}" style="max-height: 80px; object-fit: contain;" alt="Logo" referrerPolicy="no-referrer" />` : '';
        const showHeaderInfoText = pdfPageHeaderText ? `<div style="font-size: 14px; color: #000000; text-align: left; font-family: 'Civilprom', sans-serif !important;">${pdfPageHeaderText}</div>` : '';
        const showEmail = compEmail ? `<div>${compEmail}</div>` : '';
        const showPhone = compPhone ? `<div>${compPhone}</div>` : '';

        return `
          <div class="pdf-global-header" style="display: flex; flex-direction: row; width: calc(100% - 30mm); margin: 10mm 15mm 15px 15mm; padding-bottom: 10px; font-family: 'Civilprom', 'Inter', sans-serif !important; align-items: center; box-sizing: border-box;">
            <div style="width: 25%; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box; padding-right: 5px;">
              ${showHeaderLogo}
            </div>
            <div style="width: 35%; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left; box-sizing: border-box; padding: 0 5px; gap: 4px;">
              ${showHeaderImg}
              ${showHeaderInfoText}
            </div>
            <div style="width: 20%; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box; padding: 0 5px;">
              <div style="font-size: 14px; font-weight: bold !important; color: #000000; text-align: left; line-height: 1.1;">
                ${title}
              </div>
            </div>
            <div style="width: 20%; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; text-align: right; box-sizing: border-box; padding-left: 5px; font-size: 14px; color: #000000; gap: 2px;">
              <div style="font-weight: bold !important; margin-bottom: 2px;">${compName}</div>
              ${showEmail}
              ${showPhone}
            </div>
          </div>
        `;
      };

      const renderFooter = (pageIndex: number, pagesTotal: number) => `
        <div class="pdf-footer" style="position: absolute; bottom: 15mm; left: 15mm; right: 15mm; display: flex; flex-direction: row; justify-content: space-between; align-items: flex-end; font-size: 13px; color: #000000; padding-top: 8px; font-family: 'Civilprom', 'Inter', sans-serif !important; box-sizing: border-box; width: calc(100% - 30mm); border-top: none;">
          <div style="flex: 1; text-align: left; padding-right: 20px; color: #000000; font-size: 13px;">
            <p style="margin: 0; color: #000000; font-size: 13px; text-align: left; font-weight: normal !important; line-height: 1.4;">${pdfPageFooterText || ''}</p>
          </div>
          <div style="font-weight: bold !important; white-space: nowrap; color: #000000; font-size: 13px;">
            Page ${pageIndex} / ${pagesTotal}
          </div>
        </div>
      `;

      htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <title>Rapport - ${snapshot.identifiant || report.defibIdentifiant || '-'}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            @font-face {
              font-family: "Civilprom";
              src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
              font-weight: 100 900;
              font-style: normal;
              font-display: swap;
            }
            @font-face {
              font-family: "Gochi";
              src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
              font-weight: normal;
              font-style: normal;
              font-display: swap;
            }
            * {
              box-sizing: border-box;
              font-family: "Civilprom", "Inter", sans-serif !important;
              font-weight: 100 !important;
            }
            @page {
              size: A4 portrait;
              margin: 0;
            }
            body {
              font-family: "Civilprom", "Inter", sans-serif !important;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            #print-container {
              width: 210mm;
              margin: 0 auto;
              background-color: #ffffff;
            }
            .pdf-page {
              position: relative;
              width: 210mm;
              height: 297mm;
              padding: 0px;
              box-sizing: border-box;
              background-color: #ffffff;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              gap: 15px;
              page-break-after: always;
              break-after: page;
            }
            .pdf-header {
              font-family: "Gochi", cursive !important;
              font-size: 32px;
              font-weight: normal !important;
              text-align: center;
              color: #000000;
              margin-top: -10px;
              margin-bottom: 4px;
            }
            .pdf-grid {
              display: flex;
              flex-direction: column;
              gap: 12px;
              width: calc(100% - 30mm);
              margin: 0 15mm;
            }
            .pdf-card {
              border: 2px solid ${pdfCardBorderColor};
              border-radius: 13px;
              background-color: ${pdfCardBgColor};
              padding: 0px;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .pdf-card-header {
              padding: 10px 14px;
              font-size: 16px;
              background-color: ${pdfHeaderBgColor};
              color: #ffffff;
              border-bottom: none;
              text-align: center;
              font-weight: bold !important;
            }
            .pdf-card-body {
              padding: 8px 14px 12px 14px;
              font-size: 16px;
              display: flex;
              flex-direction: column;
              gap: 4px;
              color: #000000;
            }
            .pdf-line {
              color: #000000;
              line-height: 1.35;
              font-size: 16px;
            }
            .pdf-label {
              color: ${pdfLabelTextColor};
            }
            .pdf-bold {
              color: #000000;
            }
            .pdf-footer {
              position: absolute;
              bottom: 15mm;
              right: 15mm;
              font-size: 11px;
              color: #000000;
            }
          </style>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </head>
        <body class="bg-white">
          <div id="print-container">
            <!-- PAGE 1 -->
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- BARCODE HEADER -->
                <div style="display: flex; justify-content: center; width: 100%; margin-bottom: 5px; margin-top: -5px;">
                  <div style="text-align: center;">
                    ${generateBarcodeSVGString(snapshot.identifiant || report.defibIdentifiant || "EQUIP")}
                  </div>
                </div>

                <!-- SECTION 1 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">1 — Informations générales.</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Client :</span> <span class="pdf-bold">${clientName || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Contact sur place :</span> <span class="pdf-bold">${snapshot.nomPrenomSite || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Téléphone du contact :</span> <span class="pdf-bold">${snapshot.telephoneSite || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Email du contact :</span> <span class="pdf-bold">${snapshot.emailSite || ''}</span></div>
                    <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Sous contrat :</span> <span class="pdf-bold">${snapshot.contrat || 'Non'}</span></div>
                    ${snapshot.contrat === 'Oui' ? `
                      <div class="pdf-line"><span class="pdf-label">Nom du contrat :</span> <span class="pdf-bold">${snapshot.nomContrat || ''}</span></div>
                      <div class="pdf-line"><span class="pdf-label">Référence contrat :</span> <span class="pdf-bold">${snapshot.referenceContrat || ''}</span></div>
                    ` : ''}
                  </div>
                </div>

                <!-- SECTION 2 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">2 — Spécifications du matériel (${snapshot.categorie}).</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Catégorie :</span> <span class="pdf-bold">${snapshot.categorie || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Identifiant unique :</span> <span class="pdf-bold">${snapshot.identifiant || ''}</span></div>
                    ${snapshot.codeNfc ? `<div class="pdf-line"><span class="pdf-label">Code NFC :</span> <span class="pdf-bold">${snapshot.codeNfc}</span></div>` : ''}
                    <div class="pdf-line"><span class="pdf-label">Statut GMAO :</span> <span class="pdf-bold">${snapshot.statutGmao || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Mise en service :</span> <span class="pdf-bold">${snapshot.miseEnServiceDate || snapshot.miseEnService || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Conformité générale :</span> <span class="pdf-bold ${snapshot.conforme === 'Non' ? 'text-rose-600 font-bold' : 'text-emerald-600'}">${snapshot.conforme || 'Oui'}</span></div>
                  </div>
                </div>
              </div>
              ${renderFooter(1, totalPages)}
            </div>

            <!-- PAGE 2 -->
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- CUSTOM SECTION / CHECKPOINTS -->
                ${customProperties.length > 0 ? `
                  <div class="pdf-card">
                    <div class="pdf-card-header">3 — Paramètres spécifiques & Vérifications.</div>
                    <div class="pdf-card-body">
                      ${customProperties.map(([key, val]) => `
                        <div class="pdf-line"><span class="pdf-label" style="text-transform: capitalize;">${key.replace(/([A-Z])/g, ' $1')}:</span> <span class="pdf-bold">${val}</span></div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}

                <!-- ACTIONS, NOTES & CAPTURE EVIDENCE -->
                <div class="pdf-card">
                  <div class="pdf-card-header">4 — Clôture de l'intervention.</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Technicien intervenant :</span> <span class="pdf-bold">${report.techName || 'Administrateur'}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Date d’intervention :</span> <span class="pdf-bold">${report.date || '-'}</span></div>
                    ${report.endTimeStamp ? `<div class="pdf-line"><span class="pdf-label">Heure de fin :</span> <span class="pdf-bold">${report.endTimeStamp}</span></div>` : ''}
                    <div class="pdf-line" style="margin-bottom: 4px;">
                      <span class="pdf-label">Commentaire / Remarques :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireGmao || snapshot.commentaire || 'Aucun commentaire.'}</span>
                    </div>

                    <div style="display: flex; flex-direction: row; gap: 20px; width: 100%; padding-top: 8px; margin-top: 4px;">
                      <!-- Photos (Up to 3 photos stacked vertically) -->
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                        <div class="pdf-line" style="font-size: 16px; font-weight: bold !important;">Photographies de l'intervention.</div>
                        
                        ${report.photoUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie globale du défibrillateur.</span>
                          </div>
                        ` : ''}

                        ${report.photoArriereUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoArriereUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Arrière" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie arrière / étiquette.</span>
                          </div>
                        ` : ''}

                        ${report.photoResultatTestUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoResultatTestUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Résultat Test" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Résultat du test.</span>
                          </div>
                        ` : ''}

                        ${(!report.photoUrl && !report.photoArriereUrl && !report.photoResultatTestUrl) ? '<div style="font-size: 15px; color: #a1a1a1; font-style: italic;">Aucune photographie</div>' : ''}
                      </div>

                      <!-- Signature Technicien -->
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        <div class="pdf-line" style="font-size: 16px;">Signature technicien.</div>
                        ${report.techSignature ? `
                          <div style="background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 60px; max-width: 150px;">
                            <img src="${report.techSignature}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature" />
                          </div>
                        ` : `
                          <div style="font-size: 15px; color: #a1a1a1; font-style: italic;">
                            Non signée
                          </div>
                        `}
                      </div>

                      <!-- Signature Client -->
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        <div class="pdf-line" style="font-size: 16px;">Signature client.</div>
                        ${(report.clientPinCode && report.clientPinCode.trim()) ? `
                          <div style="font-size: 11px; margin-bottom: 2px;">
                            <span class="pdf-label" style="font-size:11px; color:#555;">Code validation:</span> 
                            <span class="pdf-bold" style="font-size:11px; font-family: monospace !important; font-weight: bold !important; color:#000;">${report.clientPinCode}</span>
                          </div>
                        ` : ''}
                        ${clientFound && clientFound.clientSignatureImage ? `
                          <div style="background: transparent; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; max-height: 80px; max-width: 150px; gap: 2px; margin-top: 4px;">
                            <img src="${clientFound.clientSignatureImage}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature Client" />
                            <div style="font-size: 10px; color: #1e293b; font-style: italic; font-weight: bold !important;">Signé électroniquement (dessin)</div>
                          </div>
                        ` : `
                          ${(report.clientPinCode && report.clientPinCode.trim()) ? `
                            <div style="font-size: 10px; color: #1e293b; font-style: italic; font-weight: bold !important; margin-top: 4px;">
                              Signé électroniquement par PIN (${report.clientPinCode})
                            </div>
                          ` : `
                            <div style="font-size: 13px; color: #a1a1a1; font-style: italic; margin-top: 4px;">
                              Non signée
                            </div>
                          `}
                        `}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              ${renderFooter(2, totalPages)}
            </div>

            ${hasLastPage ? `
              <!-- PAGE 3 -->
              <div class="pdf-page">
                ${renderHeader(docTitle)}
                <div class="pdf-grid" style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
                  <div class="pdf-card" style="flex: 1; min-height: 120mm; display: flex; flex-direction: column;">
                    <div class="pdf-card-header" style="font-weight: bold !important; margin-bottom: 10px;">
                      Informations complémentaires
                    </div>
                    <div class="pdf-card-body" style="font-size: 15px; color: #000000; white-space: pre-line; line-height: 1.5; flex: 1;">
                      ${pdfLastPageInfoText}
                    </div>
                  </div>
                </div>
                ${renderFooter(3, totalPages)}
              </div>
            ` : ''}

          </div>
        </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return;
    } else {
      // Resolving Client Name
      let clientFound = clients.find(c => c.id === snapshot.clientId) || authenticatedClient;
      if (!clientFound && snapshot.clientId) {
        clientFound = clients.find(c => c.denomination === snapshot.clientId || c.id === snapshot.clientId);
      }
      if (!clientFound && report.clientId) {
        clientFound = clients.find(c => c.id === report.clientId);
      }
      const clientName = clientFound ? clientFound.denomination : (snapshot.nomPrenomSite || 'Non rattaché');

      // Resolving Model names from Variable list
      const defibModel = variables.find(v => v.id === snapshot.modeleId);
      const selectedModelVar = defibModel;

      const isVisibleNumeroAtlasante = selectedModelVar ? (selectedModelVar.visibiliteNumeroAtlasante !== 'Non') : true;
      const isVisibleVersionLogiciel = selectedModelVar ? (selectedModelVar.visibiliteVersionLogiciel !== 'Non') : true;
      const isVisibleFactureBrouillon = selectedModelVar ? (selectedModelVar.visibiliteFactureBrouillon !== 'Non') : true;
      const isVisiblePadPakAdulte = selectedModelVar ? (selectedModelVar.visibilitePadPakAdulte !== 'Non') : true;
      const isVisibleLotPadPakA = selectedModelVar ? (selectedModelVar.visibiliteLotPadPakA !== 'Non') : true;
      const isVisiblePeremptionPadPakA = selectedModelVar ? (selectedModelVar.visibilitePeremptionPadPakA !== 'Non') : true;
      const isVisibleLotP = selectedModelVar ? (selectedModelVar.visibiliteLotP !== 'Non') : true;
      const isVisiblePadPakPediatrique = selectedModelVar ? (selectedModelVar.visibilitePadPakPediatrique !== 'Non') : true;
      const isVisibleLotPadPakP = selectedModelVar ? (selectedModelVar.visibiliteLotPadPakP !== 'Non') : true;
      const isVisiblePeremptionPadPakP = selectedModelVar ? (selectedModelVar.visibilitePeremptionPadPakP !== 'Non') : true;
      const isVisibleFabricationBatterie = selectedModelVar ? (selectedModelVar.visibiliteFabricationBatterie !== 'Non') : true;
      const isVisibleInsertionBatterie = selectedModelVar ? (selectedModelVar.visibiliteInsertionBatterie !== 'Non') : true;
      const isVisiblePeremptionBatterie = selectedModelVar ? (selectedModelVar.visibilitePeremptionBatterie !== 'Non') : true;
      const isVisiblePourcentageBatterie = selectedModelVar ? (selectedModelVar.visibilitePourcentageBatterie !== 'Non') : true;
      const isVisibleGantsPresents = selectedModelVar ? (selectedModelVar.visibiliteGantsPresents !== 'Non') : true;
      const isVisiblePeremptionServiettes = selectedModelVar ? (selectedModelVar.visibilitePeremptionServiettes !== 'Non') : true;
      const isVisibleServiettesPresentes = selectedModelVar ? (selectedModelVar.visibiliteServiettesPresentes !== 'Non') : true;
      const isVisiblePeremptionMasque = selectedModelVar ? (selectedModelVar.visibilitePeremptionMasque !== 'Non') : true;
      const isVisibleMasquePresent = selectedModelVar ? (selectedModelVar.visibiliteMasquePresent !== 'Non') : true;
      const isVisibleCiseauxPresents = selectedModelVar ? (selectedModelVar.visibiliteCiseauxPresents !== 'Non') : true;
      const isVisiblePeremptionTrousse = selectedModelVar ? (selectedModelVar.visibilitePeremptionTrousse !== 'Non') : true;
      const isVisibleRasoir = selectedModelVar ? (selectedModelVar.visibiliteRasoir !== 'Non') : true;
      const isVisibleBranchementElectrodes = selectedModelVar ? (selectedModelVar.visibiliteBranchementElectrodes !== 'Non') : true;
      const isVisibleGuidesVocaux = selectedModelVar ? (selectedModelVar.visibiliteGuidesVocaux !== 'Non') : true;
      const isVisibleMessageNumeriqueConforme = selectedModelVar ? (selectedModelVar.visibiliteMessageNumeriqueConforme !== 'Non') : true;
      const isVisibleEquipeMessageNumerique = selectedModelVar ? (selectedModelVar.visibiliteEquipeMessageNumerique !== 'Non') : true;
      const isVisibleVoyantConforme = selectedModelVar ? (selectedModelVar.visibiliteVoyantConforme !== 'Non') : true;
      const isVisibleNettoyage = selectedModelVar ? (selectedModelVar.visibiliteNettoyage !== 'Non') : true;
      const isVisiblePiecesJointes = selectedModelVar ? (selectedModelVar.visibilitePiecesJointes !== 'Non') : true;

      const defibModelName = defibModel ? `${defibModel.marque} ${defibModel.nom}` : (snapshot.modeleId || 'Non spécifié');

      const coffretModel = variables.find(v => v.id === snapshot.modeleCoffretId);
      const coffretModelName = coffretModel ? `${coffretModel.marque} ${coffretModel.nom}` : (snapshot.modeleCoffretId || 'Non spécifié');

      const electrodeAModel = variables.find(v => v.id === snapshot.modeleElectrodeAId);
      const electrodeAModelName = electrodeAModel ? `${electrodeAModel.marque} ${electrodeAModel.nom}` : (snapshot.modeleElectrodeAId || 'Non spécifié');

      const electrodeASecoursModel = variables.find(v => v.id === snapshot.modeleElectrodeASecoursId);
      const electrodeASecoursModelName = electrodeASecoursModel ? `${electrodeASecoursModel.marque} ${electrodeASecoursModel.nom}` : '';

      const electrodePModel = variables.find(v => v.id === snapshot.modeleElectrodePId);
      const electrodePModelName = electrodePModel ? `${electrodePModel.marque} ${electrodePModel.nom}` : (snapshot.modeleElectrodePId || 'Non spécifié');

      const electrodePSecoursModel = variables.find(v => v.id === snapshot.modeleElectrodePSecoursId);
      const electrodePSecoursModelName = electrodePSecoursModel ? `${electrodePSecoursModel.marque} ${electrodePSecoursModel.nom}` : '';

      const batterieModel = variables.find(v => v.id === snapshot.modeleBatterieId);
      const batterieModelName = batterieModel ? `${batterieModel.marque} ${batterieModel.nom}` : (snapshot.modeleBatterieId || 'Non spécifié');

      // Helper to resolve stock pieces
      const getStockPieceLabel = (stockId: string) => {
        if (!stockId) return '-';
        const stockItem = stocks ? stocks.find((s: any) => s.id === stockId) : null;
        if (!stockItem) return stockId;
        const variableItem = variables.find((v: any) => v.id === stockItem.denominationPieceId);
        if (!variableItem) return `Pièce (${stockItem.denominationPieceId})`;
        return `${variableItem.nom} (${variableItem.marque})`;
      };

      // Helper to resolve service label
      const getServiceLabel = (serviceId: string) => {
        if (!serviceId) return '';
        const stockItem = stocks ? stocks.find((s: any) => s.id === serviceId) : null;
        if (stockItem) {
          const variable = variables.find((v: any) => v.id === stockItem.denominationPieceId);
          return variable ? `${variable.nom} (${variable.marque})` : 'Service';
        }
        const variable = variables.find((v: any) => v.id === serviceId);
        if (variable) {
          return `${variable.nom} (${variable.marque})`;
        }
        return serviceId;
      };

      const selElectrodeA = getStockPieceLabel(report.selectionElectrodeARemplacee);
      const selElectrodeASecours = getStockPieceLabel(report.selectionElectrodeASecoursRemplacee);
      const selElectrodeP = getStockPieceLabel(report.selectionElectrodePRemplacee);
      const selElectrodePSecours = getStockPieceLabel(report.selectionElectrodePSecoursRemplacee);
      const selBatterie = getStockPieceLabel(report.selectionBatterieRemplacee);
      const selKitSecours = getStockPieceLabel(report.selectionKitSecoursRemplace);

      const totalPages = hasLastPage ? 6 : 5;
      const docTitle = report.title ? report.title : 'Rapport d’intervention GMAO';

      const renderHeader = (title: string) => {
        const showHeaderImg = pdfHeaderImg ? `<img src="${pdfHeaderImg}" style="max-height: 80px; max-width: 100%; object-fit: contain;" alt="Header Illustration" referrerPolicy="no-referrer" />` : '';
        const showHeaderLogo = pdfLogo ? `<img src="${pdfLogo}" style="max-height: 80px; object-fit: contain;" alt="Logo" referrerPolicy="no-referrer" />` : '';
        const showHeaderInfoText = pdfPageHeaderText ? `<div style="font-size: 14px; color: #000000; text-align: left; font-family: 'Civilprom', sans-serif !important;">${pdfPageHeaderText}</div>` : '';
        const showEmail = compEmail ? `<div>${compEmail}</div>` : '';
        const showPhone = compPhone ? `<div>${compPhone}</div>` : '';

        return `
          <div class="pdf-global-header" style="display: flex; flex-direction: row; width: calc(100% - 30mm); margin: 10mm 15mm 15px 15mm; padding-bottom: 10px; font-family: 'Civilprom', 'Inter', sans-serif !important; align-items: center; box-sizing: border-box;">
            <div style="width: 25%; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box; padding-right: 5px;">
              ${showHeaderLogo}
            </div>
            <div style="width: 35%; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left; box-sizing: border-box; padding: 0 5px; gap: 4px;">
              ${showHeaderImg}
              ${showHeaderInfoText}
            </div>
            <div style="width: 20%; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box; padding: 0 5px;">
              <div style="font-size: 14px; font-weight: bold !important; color: #000000; text-align: left; line-height: 1.1;">
                ${title}
              </div>
            </div>
            <div style="width: 20%; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; text-align: right; box-sizing: border-box; padding-left: 5px; font-size: 14px; color: #000000; gap: 2px;">
              <div style="font-weight: bold !important; margin-bottom: 2px;">${compName}</div>
              ${showEmail}
              ${showPhone}
            </div>
          </div>
        `;
      };

      const renderFooter = (pageIndex: number, pagesTotal: number) => `
        <div class="pdf-footer" style="position: absolute; bottom: 15mm; left: 15mm; right: 15mm; display: flex; flex-direction: row; justify-content: space-between; align-items: flex-end; font-size: 13px; color: #000000; padding-top: 8px; font-family: 'Civilprom', 'Inter', sans-serif !important; box-sizing: border-box; width: calc(100% - 30mm); border-top: none;">
          <div style="flex: 1; text-align: left; padding-right: 20px; color: #000000; font-size: 13px;">
            <p style="margin: 0; color: #000000; font-size: 13px; text-align: left; font-weight: normal !important; line-height: 1.4;">${pdfPageFooterText || ''}</p>
          </div>
          <div style="font-weight: bold !important; white-space: nowrap; color: #000000; font-size: 13px;">
            Page ${pageIndex} / ${pagesTotal}
          </div>
        </div>
      `;

      htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <title>Rapport - ${snapshot.identifiant || report.defibIdentifiant || '-'}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

            @font-face {
              font-family: "Civilprom";
              src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
              font-weight: 100 900;
              font-style: normal;
              font-display: swap;
            }

            @font-face {
              font-family: "Gochi";
              src: url("https://civilprom.s3.eu-north-1.amazonaws.com/gochi.otf") format("opentype");
              font-weight: normal;
              font-style: normal;
              font-display: swap;
            }

            * {
              box-sizing: border-box;
              font-family: "Civilprom", "Inter", sans-serif !important;
              font-weight: 100 !important;
            }

            @page {
              size: A4 portrait;
              margin: 0;
            }

            body {
              font-family: "Civilprom", "Inter", sans-serif !important;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            #print-container {
              width: 210mm;
              margin: 0 auto;
              background-color: #ffffff;
            }

            .pdf-page {
              position: relative;
              width: 210mm;
              height: 297mm;
              padding: 0px;
              box-sizing: border-box;
              background-color: #ffffff;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              gap: 15px;
              page-break-after: always;
              break-after: page;
            }

            .pdf-page:last-child {
              page-break-after: avoid;
              break-after: avoid;
            }

            .pdf-header {
              font-family: "Gochi", cursive !important;
              font-size: 32px;
              font-weight: normal !important;
              text-align: left;
              color: #000000;
              margin-top: -10px;
              margin-bottom: 4px;
              padding: 0;
              border: none;
            }

            .pdf-grid {
              display: flex;
              flex-direction: column;
              gap: 12px;
              width: calc(100% - 30mm);
              margin: 0 15mm;
            }

            .pdf-card {
              border: 2px solid ${pdfCardBorderColor};
              border-radius: 13px;
              background-color: ${pdfCardBgColor};
              padding: 0px;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .pdf-card-header {
              background-color: ${pdfHeaderBgColor};
              color: #ffffff;
              border-bottom: none;
              font-size: 16px;
              font-weight: bold !important;
              text-align: center;
              padding: 10px 14px;
              font-family: "Civilprom", sans-serif !important;
            }

            .pdf-card-body {
              padding: 8px 14px 12px 14px;
              font-size: 16px;
              font-family: "Civilprom", sans-serif !important;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              gap: 4px;
              color: #000000;
            }

            .pdf-line {
              color: #000000;
              line-height: 1.35;
              font-size: 16px;
              text-align: left;
              font-family: "Civilprom", sans-serif !important;
            }

            .pdf-label {
              color: ${pdfLabelTextColor};
              font-family: "Civilprom", sans-serif !important;
            }

            .pdf-bold {
              font-weight: 100 !important;
              color: #000000;
              font-family: "Civilprom", sans-serif !important;
            }

            .pdf-footer {
              position: absolute;
              bottom: 15mm;
              right: 15mm;
              font-size: 11px;
              color: #000000;
              font-family: "Civilprom", sans-serif;
              font-weight: 100 !important;
            }
          </style>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </head>
        <body class="bg-white">
          
          <div id="print-container">

            <!-- PAGE 1 -->
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- BARCODE HEADER -->
                <div style="display: flex; justify-content: center; width: 100%; margin-bottom: 5px; margin-top: -5px;">
                  <div style="text-align: center;">
                    ${generateBarcodeSVGString(snapshot.identifiant || report.defibIdentifiant || "EQUIP")}
                  </div>
                </div>

                <!-- SECTION 1 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">1 — Informations générales.</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Client :</span> <span class="pdf-bold">${clientName || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Contact :</span> <span class="pdf-bold">${snapshot.nomPrenomSite || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Téléphone du contact :</span> <span class="pdf-bold">${snapshot.telephoneSite || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Email du contact :</span> <span class="pdf-bold">${snapshot.emailSite || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Identifiant :</span> <span class="pdf-bold">${snapshot.identifiant || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Série :</span> <span class="pdf-bold">${snapshot.numeroSerie || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Modèle :</span> <span class="pdf-bold">${snapshot.modeleId ? defibModelName : ''}</span></div>
                    <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Contrat :</span> <span class="pdf-bold">${snapshot.contrat || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Référence du contrat :</span> <span class="pdf-bold">${snapshot.referenceContrat || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Catégorie du contrat :</span> <span class="pdf-bold">${snapshot.nomContrat || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Facture :</span> <span class="pdf-bold">${report.emettreFactureBrouillon || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Service facturé :</span> <span class="pdf-bold">${report.serviceEmettreId ? getServiceLabel(report.serviceEmettreId) : ''}</span></div>
                    <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Voie :</span> <span class="pdf-bold">${snapshot.numVoie || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Ville :</span> <span class="pdf-bold">${snapshot.ville || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Code Postal :</span> <span class="pdf-bold">${snapshot.cp || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Région :</span> <span class="pdf-bold">${snapshot.region || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Pays :</span> <span class="pdf-bold">${snapshot.pays || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Latitude GPS :</span> <span class="pdf-bold">${snapshot.latitude || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Longitude GPS :</span> <span class="pdf-bold">${snapshot.longitude || ''}</span></div>
                    <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Fabrication :</span> <span class="pdf-bold">${snapshot.fabrication || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Mise en service :</span> <span class="pdf-bold">${snapshot.miseEnService || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Fin de garantie :</span> <span class="pdf-bold">${snapshot.finGarantie || ''}</span></div>
                  </div>
                </div>
              </div>

              ${renderFooter(1, totalPages)}
            </div>

            <!-- PAGE 2 -->
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- SECTION 2 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">2 — Coffret.</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Modèle de boîtier :</span> <span class="pdf-bold">${coffretModelName || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Lot de boîtier :</span> <span class="pdf-bold">${snapshot.numeroLotCoffret || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Équipé d’une alarme :</span> <span class="pdf-bold">${report.equipeAlarme || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Alarme fonctionnelle :</span> <span class="pdf-bold">${report.alarme || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Dispositif d’armoire connectée :</span> <span class="pdf-bold">${report.armoireConnectee || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Dispositif handicap :</span> <span class="pdf-bold">${report.dispositifHandicap || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Signalétique conforme :</span> <span class="pdf-bold">${report.signaletiqueConforme || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Commentaire concernant le boîtier :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireCoffret || ''}</span></div>
                  </div>
                </div>

                <!-- SECTION 3 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">3 — Vérifications techniques.</div>
                  <div class="pdf-card-body" style="gap: 3px;">
                    <div class="pdf-line"><span class="pdf-label">Conforme à mon arrivée :</span> <span class="pdf-bold">${report.techConformeArrivee || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Commentaire sur l’état à mon arrivée :</span> <span class="pdf-bold">${report.techCommentaireArrivee || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Nettoyage :</span> <span class="pdf-bold">${report.techNettoyage || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Voyant conforme :</span> <span class="pdf-bold">${report.techVoyantConforme || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Équipé d’un message numérique :</span> <span class="pdf-bold">${report.techEquipeMessageNumerique || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Message numérique conforme :</span> <span class="pdf-bold">${report.techMessageNumeroConforme || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Guides vocaux conformes :</span> <span class="pdf-bold">${report.techGuidesVocauxConformes || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Branchement conforme des électrodes :</span> <span class="pdf-bold">${report.techBranchementElectrodesConforme || ''}</span></div>
                  </div>
                </div>
              </div>

              ${renderFooter(2, totalPages)}
            </div>

            <!-- PAGE 3 -->
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- SECTION 4 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">4 — Électrode Adulte ou Mixte (A).</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Modèle d'électrode A :</span> <span class="pdf-bold">${electrodeAModelName || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Lot A :</span> <span class="pdf-bold">${snapshot.lotElectrodeA || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Insertion :</span> <span class="pdf-bold">${snapshot.insertionElectrodeA || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Péremption :</span> <span class="pdf-bold">${snapshot.peremptionElectrodeA || ''}</span></div>
                    
                    <div class="pdf-line"><span class="pdf-label">Modèle électrode secours :</span> <span class="pdf-bold">${electrodeASecoursModelName || 'Aucun'}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Lot de secours :</span> <span class="pdf-bold">${snapshot.lotElectrodeASecours || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Péremption de secours :</span> <span class="pdf-bold">${snapshot.peremptionSecoursElectrodeA || ''}</span></div>
                    
                    <div class="pdf-line"><span class="pdf-label">Électrode A remplacée :</span> <span class="pdf-bold">${report.electrodeARemplacee || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Sélection de l'électrode remplacée :</span> <span class="pdf-bold">${selElectrodeA || ''}</span></div>
                    
                    <div class="pdf-line"><span class="pdf-label">Électrode A Secours remplacée :</span> <span class="pdf-bold">${report.electrodeASecoursRemplacee || 'Non'}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Sélection de l'électrode Secours A remplacée :</span> <span class="pdf-bold">${selElectrodeASecours || ''}</span></div>
                    
                    <div class="pdf-line"><span class="pdf-label">Électrode A conforme et fonctionnelle :</span> <span class="pdf-bold">${report.electrodeAConformeSante || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Commentaire concernant l’électrode A :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireElectrodeA || ''}</span></div>
                  </div>
                </div>

                <!-- SECTION 5 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">5 — Électrode Pédiatrique (P).</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Modèle d'électrode P :</span> <span class="pdf-bold">${electrodePModelName || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Lot P :</span> <span class="pdf-bold">${snapshot.lotElectrodeP || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Péremption :</span> <span class="pdf-bold">${snapshot.peremptionElectrodeP || ''}</span></div>
                    
                    <div class="pdf-line"><span class="pdf-label">Modèle électrode secours :</span> <span class="pdf-bold">${electrodePSecoursModelName || 'Aucun'}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Lot de secours :</span> <span class="pdf-bold">${snapshot.lotElectrodePSecours || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Péremption de secours :</span> <span class="pdf-bold">${snapshot.peremptionSecoursElectrodeP || ''}</span></div>
                    
                    <div class="pdf-line"><span class="pdf-label">Électrode P remplacée :</span> <span class="pdf-bold">${report.electrodePRemplacee || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Sélection de l'électrode remplacée :</span> <span class="pdf-bold">${selElectrodeP || ''}</span></div>
                    
                    <div class="pdf-line"><span class="pdf-label">Électrode P Secours remplacée :</span> <span class="pdf-bold">${report.electrodePSecoursRemplacee || 'Non'}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Sélection de l'électrode Secours P remplacée :</span> <span class="pdf-bold">${selElectrodePSecours || ''}</span></div>
                    
                    <div class="pdf-line"><span class="pdf-label">Électrode P conforme et fonctionnelle :</span> <span class="pdf-bold">${report.electrodePConformeSante || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Commentaire concernant l’électrode P :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireElectrodeP || ''}</span></div>
                  </div>
                </div>
              </div>

              ${renderFooter(3, totalPages)}
            </div>

            <!-- PAGE 4 -->
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- SECTION 6 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">6 — Batterie (B).</div>
                  <div class="pdf-card-body">
                    <div class="pdf-line"><span class="pdf-label">Modèle de batterie :</span> <span class="pdf-bold">${batterieModelName || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Pourcentage de charge :</span> <span class="pdf-bold">${snapshot.pourcentageBatterie ? snapshot.pourcentageBatterie + '%' : ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Lot B :</span> <span class="pdf-bold">${snapshot.lotBatterie || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Péremption :</span> <span class="pdf-bold">${snapshot.peremptionBatterie || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Batterie remplacée :</span> <span class="pdf-bold">${report.batterieRemplacee || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Sélection de la batterie remplacée :</span> <span class="pdf-bold">${selBatterie || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Batterie conforme et fonctionnelle :</span> <span class="pdf-bold">${report.batterieConformeSante || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Commentaire concernant la batterie :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireBatterie || ''}</span></div>
                  </div>
                </div>

                <!-- SECTION 7 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">7 — Vérifications du kit de secours.</div>
                  <div class="pdf-card-body" style="gap: 3px;">
                    <div class="pdf-line"><span class="pdf-label">Trousse de secours présente :</span> <span class="pdf-bold">${report.kitTrousseSecoursPresent || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Kit de secours remplacé ou ajouté :</span> <span class="pdf-bold">${report.kitSecoursRemplaceOuAjoute || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Sélection d’un kit de secours :</span> <span class="pdf-bold">${selKitSecours || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Ciseaux présents :</span> <span class="pdf-bold">${report.kitCiseauxPresents || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Masque présent :</span> <span class="pdf-bold">${report.kitMasquePresent || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Péremption du masque :</span> <span class="pdf-bold">${report.kitPeremptionMasque || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Serviettes présentes :</span> <span class="pdf-bold">${report.kitServiettesPresentes || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Péremption des serviettes :</span> <span class="pdf-bold">${report.kitPeremptionServiettes || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Paires de gants présents :</span> <span class="pdf-bold">${report.kitGantsPresents || ''}</span></div>
                    <div class="pdf-line"><span class="pdf-label">Rasoir :</span> <span class="pdf-bold">${report.kitRasoirPresent || ''}</span></div>
                  </div>
                </div>
              </div>

              ${renderFooter(4, totalPages)}
            </div>

            <!-- PAGE 5 -->
            <div class="pdf-page">
              ${renderHeader(docTitle)}

              <div class="pdf-grid">
                <!-- SECTION 8 -->
                <div class="pdf-card">
                  <div class="pdf-card-header">8 — Diagnostic et clôture.</div>
                  <div class="pdf-card-body" style="display: flex; flex-direction: column; gap: 6px;">
                    <div class="pdf-line">
                      <span class="pdf-label">Défibrillateur conforme et prêt à l’usage :</span> <span class="pdf-bold">${snapshot.conforme === 'Oui' || report.conforme === 'Oui' ? 'Oui' : 'Non'}</span>
                    </div>
                    <div class="pdf-line" style="margin-top: 15px;">
                      <span class="pdf-label">Horodatage entrant :</span> <span class="pdf-bold">${report.date || '-'}</span>
                    </div>
                    <div class="pdf-line">
                      <span class="pdf-label">Horodatage clôture :</span> <span class="pdf-bold">${report.endTimeStamp || '-'}</span>
                    </div>
                    <div class="pdf-line">
                      <span class="pdf-label">Durée :</span> <span class="pdf-bold">${computeDurationText(report.date, report.endTimeStamp)}</span>
                    </div>
                    <div class="pdf-line" style="margin-top: 15px;">
                      <span class="pdf-label">Commentaire :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaire || report.defibSnapshot?.commentaire || '-'}</span>
                    </div>
                    <div class="pdf-line" style="margin-top: 6px;">
                      <span class="pdf-label">Fichier(s) :</span>
                      <span class="pdf-bold">
                        ${report.attachments && report.attachments.length > 0
                          ? report.attachments.map((file: any) => `<a href="${file.url}" target="_blank" style="color: #772a7e; text-decoration: underline; margin-right: 8px;">${file.name}</a>`).join(', ')
                          : '-'}
                      </span>
                    </div>
                    <div class="pdf-line" style="margin-top: 6px; margin-bottom: 4px;">
                      <span class="pdf-label">Technicien :</span> <span class="pdf-bold">${report.techName || '-'}</span>
                    </div>
                    
                    <div style="display: flex; flex-direction: row; gap: 20px; width: 100%; padding-top: 8px; margin-top: 4px;">
                      <!-- Photos (Up to 3 photos stacked vertically) -->
                      ${isVisiblePiecesJointes ? `
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                        <div class="pdf-line" style="font-size: 16px; font-weight: bold !important;">Photographies de l'intervention.</div>
                        
                        ${report.photoUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie globale du défibrillateur.</span>
                          </div>
                        ` : ''}

                        ${report.photoArriereUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoArriereUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Arrière" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie arrière / étiquette.</span>
                          </div>
                        ` : ''}

                        ${report.photoResultatTestUrl ? `
                          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                              <img src="${report.photoResultatTestUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Resultat Test" referrerPolicy="no-referrer" />
                            </div>
                            <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Résultat du test.</span>
                          </div>
                        ` : ''}

                      </div>
                      ` : ''}

                      <!-- Signature Technicien -->
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        <div class="pdf-line" style="font-size: 16px;">Signature technicien.</div>
                        ${report.techSignature ? `
                          <div style="background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 60px; max-width: 150px;">
                            <img src="${report.techSignature}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature" />
                          </div>
                        ` : `
                          <div style="font-size: 16px; color: #000000; font-style: italic;">
                            Non signée
                          </div>
                        `}
                      </div>

                      <!-- Signature Client -->
                      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        <div class="pdf-line" style="font-size: 16px;">Signature client.</div>
                        ${(report.clientPinCode && report.clientPinCode.trim()) ? `
                          <div style="font-size: 11px; margin-bottom: 2px; font-family: 'Civilprom', sans-serif !important;">
                            <span class="pdf-label" style="font-size:11px; color:rgb(138, 138, 138); font-family: 'Civilprom', sans-serif !important;">Code validation :</span> 
                            <span class="pdf-bold" style="font-size:11px; font-family: 'Civilprom', sans-serif !important; font-weight: bold !important; color:#000;">${report.clientPinCode}</span>
                          </div>
                        ` : ''}
                        ${clientFound && clientFound.clientSignatureImage ? `
                          <div style="background: transparent; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; max-height: 80px; max-width: 150px; gap: 2px; margin-top: 4px;">
                            <img src="${clientFound.clientSignatureImage}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature Client" />
                            <div style="font-size: 10px; color: #1e293b; font-style: italic; font-weight: bold !important;">Signé électroniquement (dessin)</div>
                          </div>
                        ` : `
                          ${(report.clientPinCode && report.clientPinCode.trim()) ? `
                            <div style="font-size: 11px; color: #1e293b; font-style: italic; font-weight: bold !important; margin-top: 4px;">
                              Signé électroniquement par PIN (${report.clientPinCode})
                            </div>
                          ` : `
                            <div style="font-size: 13px; color: #a1a1a1; font-style: italic; margin-top: 4px;">
                              Non signée
                            </div>
                          `}
                        `}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              ${renderFooter(5, totalPages)}
            </div>

            ${hasLastPage ? `
              <!-- PAGE 6 -->
              <div class="pdf-page">
                ${renderHeader(docTitle)}
                <div class="pdf-grid" style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
                  <div class="pdf-card" style="flex: 1; min-height: 120mm; display: flex; flex-direction: column;">
                    <div class="pdf-card-header" style="font-weight: bold !important; margin-bottom: 10px;">
                      Informations complémentaires
                    </div>
                    <div class="pdf-card-body" style="font-size: 15px; color: #000000; white-space: pre-line; line-height: 1.5; flex: 1;">
                      ${pdfLastPageInfoText}
                    </div>
                  </div>
                </div>
                ${renderFooter(6, totalPages)}
              </div>
            ` : ''}

          </div>
        </body>
        </html>
      `;
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  // Loading state if client information is currently initializing
  if (!authenticatedClient) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-[#7e2e86] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium font-sans">{t('Chargement du portail client...') || 'Loading client portal...'}</p>
        </div>
      </div>
    );
  }

  // Helper for displaying styled read-only attributes
  const renderField = (label: string, value: React.ReactNode, isMaterial: boolean = false) => {
    const translatedLabel = t(label);
    const trimmedLabel = translatedLabel.trim();
    const labelWithPeriod = trimmedLabel.endsWith('.') ? trimmedLabel : `${trimmedLabel}.`;
    
    let displayValue = value;
    if (typeof value === 'string') {
      displayValue = t(value);
    }
    const rawValStr = displayValue !== null && displayValue !== undefined ? String(displayValue).trim() : '';
    const hasValue = rawValStr !== '' && rawValStr !== '-';
    const finalValue = hasValue ? displayValue : '-';

    return (
      <div className="space-y-1">
        <span 
          className="block font-bold select-none font-sans"
          style={{ color: 'black', fontSize: '18px', textTransform: 'none' }}
        >
          {labelWithPeriod}
        </span>
        <div 
          className="select-text font-sans"
          style={{ 
            fontSize: '18px', 
            color: isMaterial ? '#772a7e' : 'black', 
            fontWeight: isMaterial ? 'bold' : 100,
            border: isMaterial ? 'none' : '1px solid #cfcfcf',
            borderRadius: '13px',
            padding: '10px 14px',
            cursor: 'default',
            minHeight: '48px',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isMaterial ? 'rgb(253 234 255)' : '#ffffff'
          }}
        >
          {finalValue}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans select-none">
      {/* Top sticky navigation bar with requested maintainer title */}
      <header 
        className="sticky top-0 z-50 px-4 py-5 shrink-0 border-b border-purple-950/20 shadow-md bg-gradient-to-r from-[#7e2e86] to-[#36093a]"
      >
        <div className="max-w-7xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between font-sans">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
            <h1 className="text-lg font-black text-white animate-fadeIn" style={{ letterSpacing: 'normal' }}>
              {companyInfo?.name || 'Défibeo Solutions'}
            </h1>
            <div className="flex flex-wrap gap-2 items-center">
              {companyInfo?.phone && (
                <a
                  href={`tel:${companyInfo.phone}`}
                  className="px-5 py-2 text-base font-medium bg-white/10 hover:bg-white/20 select-all text-white border border-white/15 rounded-full flex items-center transition-all duration-200 outline-none hover:opacity-100"
                >
                  <span>{companyInfo.phone}</span>
                </a>
              )}
              {companyInfo?.email && (
                <a
                  href={`mailto:${companyInfo.email}`}
                  className="px-5 py-2 text-base font-medium bg-white/10 hover:bg-white/20 select-all text-white border border-white/15 rounded-full flex items-center transition-all duration-200 outline-none hover:opacity-100"
                >
                  <span>{companyInfo.email}</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center">
            <button
              onClick={onLogout}
              className="px-5 py-2.5 text-[18px] text-white rounded-xl select-none cursor-pointer border-0 shadow-sm outline-none transition-none brightness-100 hover:brightness-100 hover:opacity-100 hover:scale-100 hover:bg-[#3556ec] active:bg-[#3556ec]"
              style={{
                boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                background: '#3556ec',
                backgroundColor: '#3556ec',
                fontWeight: 100,
              }}
            >
              {t('Quitter')}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-6">
        
        {/* Navigation Tabs (Stacks vertically on mobile, horizontally on sm screens) */}
        <div 
          className="flex flex-col sm:flex-row gap-1.5 p-1.5 bg-slate-200/60"
          style={{ borderRadius: '13px' }}
        >
          <button
            onClick={() => setActivePortalTab('defibs')}
            className={`w-full sm:flex-1 py-3 sm:py-2 text-center text-[18px] font-bold text-black transition-all border-0 cursor-pointer ${
              activePortalTab === 'defibs'
                ? 'bg-white shadow-xs'
                : 'bg-transparent hover:bg-white/45'
            }`}
            style={{ borderRadius: '12px' }}
          >
            {t('Matériels')}
          </button>
          <button
            onClick={() => setActivePortalTab('autovigilance')}
            className={`w-full sm:flex-1 py-3 sm:py-2 text-center text-[18px] font-bold text-black transition-all border-0 cursor-pointer ${
              activePortalTab === 'autovigilance'
                ? 'bg-white shadow-xs'
                : 'bg-transparent hover:bg-white/45'
            }`}
            style={{ borderRadius: '12px' }}
          >
            {t('Pointages')}
          </button>
          {companyInfo?.enableDevisFactures !== 'Non' && (
            <button
              onClick={() => setActivePortalTab('bills')}
              className={`w-full sm:flex-1 py-3 sm:py-2 text-center text-[18px] font-bold text-black transition-all border-0 cursor-pointer ${
                activePortalTab === 'bills'
                  ? 'bg-white shadow-xs'
                  : 'bg-transparent hover:bg-white/45'
              }`}
              style={{ borderRadius: '12px' }}
            >
              {t('Commandes')}
            </button>
          )}
          <button
            onClick={() => setActivePortalTab('reports')}
            className={`w-full sm:flex-1 py-3 sm:py-2 text-center text-[18px] font-bold text-black transition-all border-0 cursor-pointer ${
              activePortalTab === 'reports'
                ? 'bg-white shadow-xs'
                : 'bg-transparent hover:bg-white/45'
            }`}
            style={{ borderRadius: '12px' }}
          >
            {t('Interventions')}
          </button>
          <button
            onClick={() => setActivePortalTab('info')}
            className={`w-full sm:flex-1 py-3 sm:py-2 text-center text-[18px] font-bold text-black transition-all border-0 cursor-pointer ${
              activePortalTab === 'info'
                ? 'bg-white shadow-xs'
                : 'bg-transparent hover:bg-white/45'
            }`}
            style={{ borderRadius: '12px' }}
          >
            {t('Informations')}
          </button>
        </div>

        {/* Content Wrapper - Completely flat (NO padding, NO border, NO background) */}
        <div className="space-y-6">
          
          {/* Section 1: Défibrillateurs & Autres matériels */}
          {activePortalTab === 'defibs' && (
            <div className="space-y-6">
              {companyInfo?.communicationPortailClient && !isCommunicationDismissed && (
                <div 
                  className="font-sans text-black relative animate-fadeIn flex flex-col gap-4"
                >
                  <div className="text-left">
                    <p className="font-medium leading-relaxed whitespace-pre-line" style={{ color: '#000', fontSize: '16px', cursor: 'default' }}>
                      {companyInfo.communicationPortailClient}
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem('dismissed_portal_communication', 'true');
                        setIsCommunicationDismissed(true);
                      }}
                      style={{
                        fontSize: '18px',
                        backgroundColor: '#000000',
                        color: '#ffffff',
                        boxShadow: 'none',
                        borderRadius: '13px',
                        border: 'none',
                        padding: '10px 20px',
                        cursor: 'pointer'
                      }}
                      className="font-semibold transition-all"
                    >
                      {t("J'ai compris")}
                    </button>
                  </div>
                </div>
              )}

              {(clientDefibs.length === 0 && clientOthers.length === 0) ? (
                <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl p-5 text-slate-500 font-sans">
                  {t("Aucun matériel enregistré pour le moment.")}
                </div>
              ) : (
                <div className="space-y-6">
                  {clientDefibs.length > 0 && (
                  <div className="space-y-6">
                    {clientDefibs.map((df) => {
                      const modelNom = variables.find(v => v.id === df.modeleId)?.nom || df.modeleId || 'Non spécifié';
                      const electrodeAPeremp = formatDateToFR(df.peremptionElectrodeA) || df.peremptionElectrodeA;
                      const electrodePPeremp = formatDateToFR(df.peremptionElectrodeP) || df.peremptionElectrodeP;
                      const batteriePeremp = formatDateToFR(df.peremptionBatterie) || df.peremptionBatterie;

                      const activeAlerts: any[] = [];
                      const modelIds = [
                        df.modeleId,
                        df.modeleCoffretId,
                        df.modeleElectrodeAId,
                        df.modeleElectrodeASecoursId,
                        df.modeleElectrodePId,
                        df.modeleElectrodePSecoursId,
                        df.modeleBatterieId
                      ].filter(Boolean);
                      modelIds.forEach(id => {
                        const v = variables.find(x => x.id === id);
                        if (v && v.rappelAlerteOption) {
                          activeAlerts.push({
                            option: v.rappelAlerteOption,
                            desc: v.rappelObservation || '',
                            debut: v.rappelDateDebut,
                            fin: v.rappelDateFin
                          });
                        }
                      });

                      let recurrenceAutoVigilance = 'Aucune';
                      if (df.rappelMensuelAuto === 'Oui') {
                        recurrenceAutoVigilance = 'Mensuelle';
                      } else if (df.rappelHebdoAuto === 'Oui') {
                        recurrenceAutoVigilance = 'Hebdomadaire';
                      } else if (df.rappelJournalierAuto === 'Oui') {
                        recurrenceAutoVigilance = 'Journalière';
                      }

                      return (
                        <div
                          key={df.id}
                          className="bg-white p-5 space-y-4"
                          style={{
                            border: '1px solid #cfcfcf',
                            borderRadius: '13px',
                          }}
                        >
                          <div className="flex items-center gap-3 select-none flex-wrap">
                            <h2 className="text-[18px] font-black text-[#7e2e86]" style={{ letterSpacing: 'normal' }}>
                              {df.identifiant}
                            </h2>
                            <span 
                              style={{ 
                                backgroundColor: '#45114a',
                                color: '#fff',
                                fontSize: '18px',
                                borderRadius: '100px',
                                padding: '10px 15px',
                                fontWeight: 'bold',
                                lineHeight: 'normal'
                              }}
                              className="font-sans"
                            >
                              Défibrillateur
                            </span>
                            <span 
                              style={{ 
                                backgroundColor: '#45114a',
                                color: '#fff',
                                fontSize: '18px',
                                borderRadius: '100px',
                                padding: '10px 15px',
                                fontWeight: 'bold',
                                lineHeight: 'normal'
                              }}
                              className="font-sans"
                            >
                              {`Pointage : ${recurrenceAutoVigilance}`}
                            </span>
                          </div>

                          {/* Active Alert warning banner */}
                          {activeAlerts.length > 0 && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-red-950 font-sans leading-relaxed text-sm animate-pulse">
                              <h4 className="font-bold flex items-center gap-1.5 text-red-800">
                                ⚠️ Signalement incident matériel (Fabricant)
                              </h4>
                              {activeAlerts.map((a, idx) => (
                                <div key={idx} className="space-y-1">
                                  <div className="font-semibold text-red-700">
                                    {a.option}
                                    {a.debut && ` (depuis le ${a.debut}${a.fin ? ` jusqu'au ${a.fin}` : ''})`}
                                  </div>
                                  {a.desc && <p className="text-xs text-red-900 font-light">{a.desc}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Barcode and Download button in first place */}
                          <div className="flex flex-col items-center gap-2">
                            <Barcode text={df.identifiant || 'DEFIB'} />
                            <button
                              type="button"
                              onClick={() => handleDownloadBarcode(df.identifiant || 'DEFIB')}
                              style={{ fontSize: '18px' }}
                              className="px-6 py-2 bg-black text-white font-bold rounded-xl transition-all cursor-pointer shadow-sm border-none outline-none"
                            >
                              Télécharger
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {renderField('Identifiant', df.identifiant, true)}
                            {renderField('Série', df.numeroSerie, true)}
                            {renderField('Modèle', modelNom, true)}
                            {renderField('Contrat en cours', df.contrat || 'Non', true)}
                            {renderField('Numéro et voie', df.numVoie, true)}
                            {renderField('Ville', df.ville, true)}
                            {renderField('Code postal', df.cp, true)}
                            {renderField('Région', df.region, true)}
                            {renderField('Pays', df.pays, true)}
                            {renderField('Expiration de garantie', formatDateToFR(df.finGarantie) || df.finGarantie, true)}
                            {renderField('Dernière maintenance', formatDateToFR(df.derniereMaintenance) || df.derniereMaintenance, true)}
                            {renderField('Prochaine maintenance indicative.', formatDateToMonthYear(computeProchaineMaintenance(df.derniereMaintenance)), true)}
                            {renderField('Électrode Adulte ou Mixte, Péremption', electrodeAPeremp, true)}
                            {renderField('Électrode Pédiatrique, Péremption', electrodePPeremp, true)}
                            {renderField('Batterie, Péremption', batteriePeremp, true)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {clientOthers.length > 0 && (
                  <div className="space-y-6">
                    {clientOthers.map((oth) => {
                      const expireGarantie = formatDateToFR(oth.expirationGarantie) || oth.expirationGarantie;
                      const derniereMaint = formatDateToFR(oth.derniereMaintenance) || oth.derniereMaintenance;
                      const prochaineMaint = formatDateToFR(oth.prochaineMaintenance) || oth.prochaineMaintenance;
                      const miseServ = formatDateToFR(oth.miseEnService) || oth.miseEnService;

                      return (
                        <div
                          key={oth.id}
                          className="bg-white p-5 space-y-4"
                          style={{
                            border: '1px solid #cfcfcf',
                            borderRadius: '13px',
                          }}
                        >
                          <div className="flex items-center gap-3 select-none">
                            <h2 className="text-[18px] font-black text-[#7e2e86]" style={{ letterSpacing: 'normal' }}>
                              {oth.identifiant}
                            </h2>
                            <span 
                              style={{ 
                                backgroundColor: '#45114a',
                                color: '#fff',
                                fontSize: '18px',
                                borderRadius: '100px',
                                padding: '10px 15px',
                                fontWeight: 'bold',
                                lineHeight: 'normal'
                              }}
                              className="font-sans"
                            >
                              {oth.categorie}
                            </span>
                          </div>
                          
                          {/* Barcode and Download button in first place */}
                          <div className="flex flex-col items-center gap-2">
                            <Barcode text={oth.identifiant || 'OTHER'} />
                            <button
                              type="button"
                              onClick={() => handleDownloadBarcode(oth.identifiant || 'OTHER')}
                              style={{ fontSize: '18px' }}
                              className="px-6 py-2 bg-black text-white font-bold rounded-xl transition-all cursor-pointer shadow-sm border-none outline-none"
                            >
                              Télécharger
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {renderField('Identifiant', oth.identifiant, true)}
                            {renderField('Catégorie', oth.categorie, true)}
                            {renderField('Série', oth.specifiques?.numeroSerie || '-', true)}
                            {renderField('Contrat en cours', oth.contrat || 'Non', true)}
                            {renderField('Numéro et voie', oth.numeroVoie, true)}
                            {renderField('Ville', oth.ville, true)}
                            {renderField('Code postal', oth.codePostal || '', true)}
                            {renderField('Région', oth.region || '', true)}
                            {renderField('Pays', oth.pays || '', true)}
                            {renderField('Expiration de garantie', expireGarantie, true)}
                            {renderField('Dernière maintenance', derniereMaint, true)}
                            {renderField('Prochaine maintenance', prochaineMaint, true)}
                            {renderField('Mise en service', miseServ, true)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* Section 2: Devis et factures */}
          {activePortalTab === 'bills' && (
            clientDocs.length === 0 ? null : (
              <div className="space-y-6">
                {clientDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-white p-6 space-y-6"
                    style={{
                      border: '1px solid #cfcfcf',
                      borderRadius: '13px',
                    }}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                      {renderField('Objet ou commentaire', doc.commentaire || doc.ref, true)}
                      {renderField('Type', doc.type, true)}
                      {renderField('Référence', doc.ref, true)}
                      {renderField('Situation', doc.status, true)}
                      {renderField('Total HT', `${doc.totalHt.toFixed(2)} €`, true)}
                    </div>

                    {/* Télécharger Button & Optional Bon de Commande Button */}
                    <div className="flex flex-col gap-3 mt-6">
                      {doc.hasBonCommande && (
                        <button
                          type="button"
                          onClick={() => handleDownloadBonCommande(doc)}
                          className="w-full py-3 bg-[#111827] text-white text-[18px] rounded-xl font-sans font-bold hover:bg-[#1f2937] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md border-none"
                        >
                          {t("Télécharger bon de commande")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownloadDoc(doc)}
                        className="w-full py-3 bg-[#3556ec] text-white text-[18px] rounded-xl font-sans font-bold hover:bg-[#2b48cd] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md border-none"
                      >
                        {t("Télécharger")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Section 4: Interventions */}
          {activePortalTab === 'reports' && (
            (() => {
              const handleUpdateSituation = (targetRep: any, newStatus: 'Accepté Client' | 'Refusé Client') => {
                const updatedReports = generatedReports.map(r => {
                  if (
                    r.id === targetRep.id || 
                    (r.missionId && r.missionId === targetRep.missionId) ||
                    (r.interventionReference && targetRep.interventionReference && r.interventionReference === targetRep.interventionReference)
                  ) {
                    return {
                      ...r,
                      missionStatus: newStatus,
                      status: newStatus
                    };
                  }
                  return r;
                });

                if (onUpdateGeneratedReports) {
                  onUpdateGeneratedReports(updatedReports);
                }

                if (fsmTours && onUpdateFsmTours) {
                  const updatedTours = fsmTours.map(tour => {
                    let tourChanged = false;
                    const updatedMissions = (tour.missions || []).map((m: any) => {
                      if (
                        (targetRep.missionId && m.id === targetRep.missionId) ||
                        (targetRep.interventionReference && m.interventionReference && m.interventionReference === targetRep.interventionReference) ||
                        (targetRep.defibIdentifiant && m.defibIdentifiant === targetRep.defibIdentifiant)
                      ) {
                        tourChanged = true;
                        return { ...m, status: newStatus };
                      }
                      return m;
                    });

                    if (tourChanged) {
                      return { ...tour, missions: updatedMissions };
                    }
                    return tour;
                  });

                  onUpdateFsmTours(updatedTours);
                }
              };

              const clientDefibIds = new Set(clientDefibs.map(df => df.id));
              const clientDefibIdents = new Set(clientDefibs.map(df => df.identifiant));
              const clientOtherIds = new Set(clientOthers.map(o => o.id));
              const clientOtherIdents = new Set(clientOthers.map(o => o.identifiant));

              const clientReports = generatedReports.filter(rep => {
                const isUpcoming = rep.isUpcoming || rep.status === 'À venir' || rep.status === 'upcoming' || rep.upcoming || rep.isFuture;
                if (reportsFilter === 'upcoming') {
                  if (!isUpcoming) return false;
                } else {
                  if (isUpcoming || !rep.validated) return false;
                }
                const snapClientId = rep.defibSnapshot?.clientId;
                if (snapClientId && snapClientId === authenticatedClient.id) return true;
                if (rep.defibId && (clientDefibIds.has(rep.defibId) || clientOtherIds.has(rep.defibId))) return true;
                if (rep.defibIdentifiant && (clientDefibIdents.has(rep.defibIdentifiant) || clientOtherIdents.has(rep.defibIdentifiant))) return true;
                return false;
              });

              return (
                <div className="space-y-6">
                  {/* Toggle Segmenté À venir / Validées */}
                  <div 
                    className="flex items-center p-1 bg-white select-none w-fit" 
                    style={{ 
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      borderRadius: '15px',
                      border: '1px solid #dadada',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setReportsFilter('upcoming')}
                      style={{
                        fontSize: '18px',
                        borderRadius: '13px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: reportsFilter === 'upcoming' ? '#fe4eba' : 'transparent',
                        color: reportsFilter === 'upcoming' ? '#ffffff' : '#000000',
                        transition: 'none',
                      }}
                      className={`px-4 py-1.5 font-bold ${
                        reportsFilter === 'upcoming' ? 'shadow-sm' : ''
                      }`}
                    >
                      {t("À venir")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportsFilter('validated')}
                      style={{
                        fontSize: '18px',
                        borderRadius: '13px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: reportsFilter === 'validated' ? '#fe4eba' : 'transparent',
                        color: reportsFilter === 'validated' ? '#ffffff' : '#000000',
                        transition: 'none',
                      }}
                      className={`px-4 py-1.5 font-bold ${
                        reportsFilter === 'validated' ? 'shadow-sm' : ''
                      }`}
                    >
                      {t("Validées")}
                    </button>
                  </div>

                  {clientReports.length === 0 ? null : (
                    <div className="space-y-6">
                      {clientReports.map((rep) => {
                        const snap = rep.defibSnapshot || {};
                        const isUpcoming = rep.isUpcoming || rep.status === 'À venir' || rep.status === 'upcoming' || rep.upcoming || rep.isFuture;
                        const currentSituation = rep.missionStatus || (isUpcoming ? 'Brouillon' : 'Effectué');

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

                        const planifiedEffectueVal = formatDateTimeDisplay(dateVal, slotVal);

                        return (
                          <div
                            key={rep.id}
                            className="bg-white p-6 space-y-6"
                            style={{
                              border: '1px solid #cfcfcf',
                              borderRadius: '13px',
                            }}
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                              {/* Planifié/Effectué. */}
                              <div className="space-y-1">
                                <label className="block text-[18px] font-bold text-black font-sans select-none">
                                  {t("Planifié/Effectué.")}
                                </label>
                                <input
                                  type="text"
                                  value={planifiedEffectueVal}
                                  disabled
                                  className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                                />
                              </div>

                              {/* Catégorie matériel. */}
                              <div className="space-y-1">
                                <label className="block text-[18px] font-bold text-black font-sans select-none">
                                  {t("Catégorie matériel.")}
                                </label>
                                <input
                                  type="text"
                                  value={snap.categorie || 'Défibrillateur'}
                                  disabled
                                  className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                                />
                              </div>

                              {/* Identifiant. */}
                              <div className="space-y-1">
                                <label className="block text-[18px] font-bold text-black font-sans select-none">
                                  {t("Identifiant.")}
                                </label>
                                <input
                                  type="text"
                                  value={rep.defibIdentifiant || snap.identifiant || ''}
                                  disabled
                                  className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                                />
                              </div>

                              {/* Série. */}
                              <div className="space-y-1">
                                <label className="block text-[18px] font-bold text-black font-sans select-none">
                                  {t("Série.")}
                                </label>
                                <input
                                  type="text"
                                  value={snap.numeroSerie || snap.specifiques?.numeroSerie || ''}
                                  disabled
                                  className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                                />
                              </div>

                              {/* Technicien. */}
                              <div className="space-y-1">
                                <label className="block text-[18px] font-bold text-black font-sans select-none">
                                  {t("Technicien.")}
                                </label>
                                <input
                                  type="text"
                                  value={rep.techName || ''}
                                  disabled
                                  className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                                />
                              </div>

                              {/* Situation. */}
                              <div className="space-y-1">
                                <label className="block text-[18px] font-bold text-black font-sans select-none">
                                  {t("Situation.")}
                                </label>
                                <input
                                  type="text"
                                  value={currentSituation}
                                  disabled
                                  className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                                />
                              </div>
                            </div>

                            {/* Buttons Autoriser & Refuser if Situation is 'Attente Client' */}
                            {currentSituation === 'Attente Client' && (
                              <div className="flex items-center gap-4 pt-2">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSituation(rep, 'Accepté Client')}
                                  style={{ backgroundColor: 'rgb(55 131 83)', boxShadow: 'none' }}
                                  className="flex-1 py-3 text-white text-[18px] rounded-xl font-sans font-bold transition-all border-none cursor-pointer text-center"
                                >
                                  {t("Autoriser")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSituation(rep, 'Refusé Client')}
                                  style={{ backgroundColor: 'rgb(157 33 33)', boxShadow: 'none' }}
                                  className="flex-1 py-3 text-white text-[18px] rounded-xl font-sans font-bold transition-all border-none cursor-pointer text-center"
                                >
                                  {t("Refuser")}
                                </button>
                              </div>
                            )}

                            {/* Télécharger Button - visible only when status is Effectué */}
                            {currentSituation === 'Effectué' && (
                              <div className="mt-6">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadReport(rep)}
                                  className="w-full py-3 bg-[#3556ec] text-white text-[18px] rounded-xl font-sans font-bold hover:bg-[#2b48cd] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                                >
                                  {t("Télécharger")}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()
          )}

           {/* Section: Pointages auto-vigilance */}
          {activePortalTab === 'autovigilance' && (
            <div className="space-y-8">
              {/* Info-div for verification items */}
              <div 
                className="p-5 rounded-2xl border flex flex-col gap-3 font-sans text-[16px] text-black bg-slate-50/50"
                style={{
                  borderColor: 'rgb(226, 232, 240)',
                  maxWidth: '100%',
                }}
              >
                <div className="font-bold text-[18px] text-[#7e2e86]">
                  {t("Réservé uniquement aux contrôles des défibrillateurs. Le pointage d’auto-vigilance n’est pas destiné aux autres types de matériels.")}
                </div>
                <div className="font-bold text-[18px] text-black">
                  {t("Quatre vérifications simples pour votre pointage :")}
                </div>
                <ul className="space-y-2 list-none pl-0 m-0">
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 select-none">—</span>
                    <span>
                      <strong className="font-semibold">{t("Témoin lumineux :")}</strong> {t("Vert, prêt à l'emploi. Rouge, intervention nécessaire.")}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 select-none">—</span>
                    <span>
                      <strong className="font-semibold">{t("Électrodes :")}</strong> {t("Contrôlez la date de péremption, car un gel asséché perd en efficacité.")}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 select-none">—</span>
                    <span>
                      <strong className="font-semibold">{t("Batterie :")}</strong> {t("Contrôlez sa validité pour garantir puissance du choc.")}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 select-none">—</span>
                    <span>
                      <strong className="font-semibold">{t("Signalétique :")}</strong> {t("Les panneaux doivent êtres visibles, vérifiez les.")}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 select-none">—</span>
                    <span>
                      <strong className="font-semibold">{t("Boîtier/Armoire :")}</strong> {t("Vérifiez le bon état.")}
                    </span>
                  </li>
                </ul>
                <div className="mt-1 font-semibold text-[#7e2e86]">
                  {t("En cas de doute, anticipez et contactez-nous.")}
                </div>
              </div>

              <div id="new-pointage-container">
                {assignedEquipment.length === 0 ? null : (
                  <form onSubmit={handleSavePointage} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      {/* Sélection du matériel */}
                      <div className="space-y-1 min-w-0">
                        <label className="block text-[18px] font-bold text-black font-sans">
                          {t('Sélection du matériel *')}
                        </label>
                        <select
                          required
                          value={selectedEquipId}
                          onChange={(e) => setSelectedEquipId(e.target.value)}
                          className="w-full text-[18px] text-black bg-white hover:outline hover:outline-2 hover:outline-[#772a7e] hover:outline-offset-2 focus:ring-0 focus:outline focus:outline-2 focus:outline-[#772a7e] focus:outline-offset-2 transition-all cursor-pointer appearance-none min-w-0"
                          style={{
                            border: '1px solid #cfcfcf',
                            borderRadius: '11px',
                            padding: '10px 14px',
                            fontWeight: 100,
                            height: '48px',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            MozAppearance: 'none',
                            boxSizing: 'border-box',
                            maxWidth: '100%'
                          }}
                        >
                          <option value="">{t('-- Choisir un matériel --')}</option>
                          {filteredAssignedEquipment.filter(eq => eq.type === 'defib').map((eq) => (
                            <option key={eq.id} value={eq.id}>
                              {eq.nom}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Date */}
                      <div className="space-y-1 min-w-0">
                        <label className="block text-[18px] font-bold text-black font-sans">
                          {t('Date *')}
                        </label>
                        <input
                          type="date"
                          required
                          disabled
                          value={pointageDate}
                          onChange={(e) => setPointageDate(e.target.value)}
                          className="w-full text-[18px] text-[#475569] bg-[#f1f5f9] cursor-not-allowed transition-all [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none min-w-0"
                          style={{
                            border: '1px solid #cfcfcf',
                            borderRadius: '11px',
                            padding: '10px 14px',
                            fontWeight: 100,
                            height: '48px',
                            boxSizing: 'border-box',
                            maxWidth: '100%'
                          }}
                        />
                      </div>

                      {/* Commentaire */}
                      <div className="space-y-1 min-w-0">
                        <label className="block text-[18px] font-bold text-black font-sans">
                          {t('Commentaire *')}
                        </label>
                        <select
                          required
                          value={pointageComment}
                          onChange={(e) => setPointageComment(e.target.value as any)}
                          className="w-full text-[18px] text-black bg-white hover:outline hover:outline-2 hover:outline-[#772a7e] hover:outline-offset-2 focus:ring-0 focus:outline focus:outline-2 focus:outline-[#772a7e] focus:outline-offset-2 transition-all cursor-pointer appearance-none min-w-0"
                          style={{
                            border: '1px solid #cfcfcf',
                            borderRadius: '11px',
                            padding: '10px 14px',
                            fontWeight: 100,
                            height: '48px',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            MozAppearance: 'none',
                            boxSizing: 'border-box',
                            maxWidth: '100%'
                          }}
                        >
                          <option value="En fonctionnement et accessible">{t('En fonctionnement et accessible')}</option>
                          <option value="Problème résolu">{t('Problème résolu')}</option>
                          <option value="Problème non résolu">{t('Problème non résolu')}</option>
                          <option value="Problème non résolu et assistance demandée">{t('Problème non résolu et assistance demandée')}</option>
                        </select>
                      </div>

                      {/* Button */}
                      <div className="w-full">
                        <button
                          type="submit"
                          className="w-full text-white bg-[#3556ec] hover:bg-[#2b48cd] transition-all cursor-pointer outline-none border-none shrink-0 font-bold shadow-md"
                          style={{
                            borderRadius: '11px',
                            fontSize: '18px',
                            height: '48px',
                          }}
                        >
                          {t('Enregistrer')}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>

              {/* Liste des pointages */}
              <div id="historique-pointage-container" className="mt-8">
                {!pointagesAutoVigilance || pointagesAutoVigilance.filter(p => p.clientId === authenticatedClient?.id).length === 0 ? (
                  null
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-sans text-sm border-collapse">
                      <thead>
                        <tr className="text-black font-bold font-sans" style={{ fontSize: '18px' }}>
                          <th className="py-3 px-2">{t('Date.')}</th>
                          <th className="py-3 px-2">{t('Matériel.')}</th>
                          <th className="py-3 px-2">{t('Identifiant.')}</th>
                          <th className="py-3 px-2">{t('Situation.')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...pointagesAutoVigilance]
                          .filter(p => p.clientId === authenticatedClient?.id)
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((pt) => {
                            return (
                              <tr key={pt.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 px-2 text-black font-sans" style={{ fontSize: '18px' }}>
                                  {formatDateToFR ? formatDateToFR(pt.date) : pt.date}
                                </td>
                                <td className="py-3 px-2 text-black font-sans" style={{ fontSize: '18px' }}>
                                  {pt.equipementNom}
                                </td>
                                <td className="py-3 px-2 text-black font-sans" style={{ fontSize: '18px' }}>
                                  {pt.equipementIdentifiant}
                                </td>
                                <td className="py-3 px-2 text-black font-sans" style={{ fontSize: '18px' }}>
                                  {t(pt.commentaire)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 3: Informations (contrat) */}
          {activePortalTab === 'info' && (
            <div className="space-y-6">
              <div
                className="bg-white p-5 list-none"
                style={{
                  border: '1px solid #cfcfcf',
                  borderRadius: '13px',
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {/* Entreprise */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Entreprise.")}
                    </label>
                    <input
                      type="text"
                      value={authenticatedClient.denomination || ''}
                      disabled
                      className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                    />
                  </div>

                  {/* Identifiant fiscal */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Identifiant fiscal.")}
                    </label>
                    <input
                      type="text"
                      value={authenticatedClient.siret || ''}
                      disabled
                      className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Email.")}
                    </label>
                    <input
                      type="text"
                      value={portalEmail}
                      onChange={(e) => setPortalEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-[18px] text-black bg-white hover:border-[#772a7e] focus:border-[#772a7e] focus:outline-none font-sans"
                    />
                  </div>

                  {/* Téléphone */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Téléphone.")}
                    </label>
                    <input
                      type="text"
                      value={portalPhone}
                      onChange={(e) => setPortalPhone(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-[18px] text-black bg-white hover:border-[#772a7e] focus:border-[#772a7e] focus:outline-none font-sans"
                    />
                  </div>

                  {/* Mot de passe */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Mot de passe.")}
                    </label>
                    <input
                      type="text"
                      value={portalAccessKey}
                      onChange={(e) => setPortalAccessKey(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-[18px] text-black bg-white hover:border-[#772a7e] focus:border-[#772a7e] focus:outline-none font-sans"
                    />
                  </div>

                  {/* Identifiant unique */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Identifiant unique.")}
                    </label>
                    <input
                      type="text"
                      value={authenticatedClient.id || ''}
                      disabled
                      className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={handleSavePassword}
                    className="w-full py-3 bg-[#3556ec] text-white text-[18px] rounded-xl font-sans font-bold hover:bg-[#2b48cd] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    {t("Enregistrer")}
                  </button>
                </div>

                {passwordSaveSuccess && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 font-sans text-[16px] text-center">
                    {t("Mot de passe mis à jour avec succès.")}
                  </div>
                )}
              </div>

              {/* Card Commentaire (si existant) */}
              {authenticatedClient.commentaire && (
                <div
                  className="bg-white p-5 list-none space-y-2 text-slate-800"
                  style={{
                    border: '1px solid #cfcfcf',
                    borderRadius: '13px',
                  }}
                >
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Commentaire / Notes</h3>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap font-sans">{authenticatedClient.commentaire}</p>
                </div>
              )}

              {/* Card Contrat */}
              {portalRedactionContrat && portalRedactionContrat.trim() !== '' && (
                <div
                  className="bg-white p-5 list-none space-y-6"
                  style={{
                    border: '1px solid #cfcfcf',
                    borderRadius: '13px',
                  }}
                >
                  <div>
                    <h3 className="text-[18px] font-black text-black select-none font-sans" style={{ letterSpacing: 'normal' }}>
                      Contrat.
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {/* Catégorie du contrat */}
                    <div className="space-y-1">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Catégorie du contrat.")}
                      </label>
                      <input
                        type="text"
                        value={authenticatedClient.nomContrat || ''}
                        disabled
                        className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                      />
                    </div>

                    {/* Référence du contrat */}
                    <div className="space-y-1">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Référence du contrat.")}
                      </label>
                      <input
                        type="text"
                        value={authenticatedClient.referenceContrat || ''}
                        disabled
                        className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                      />
                    </div>

                    {/* Numéro de marché */}
                    <div className="space-y-1">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Numéro de marché.")}
                      </label>
                      <input
                        type="text"
                        value={authenticatedClient.numeroMarche || ''}
                        disabled
                        className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                      />
                    </div>

                    {/* Début */}
                    <div className="space-y-1">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Début.")}
                      </label>
                      <input
                        type="date"
                        value={authenticatedClient.debutContrat || ''}
                        disabled
                        className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                      />
                    </div>

                    {/* Expiration */}
                    <div className="space-y-1">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Expiration.")}
                      </label>
                      <input
                        type="date"
                        value={authenticatedClient.finContrat || ''}
                        disabled
                        className="w-full border-none rounded-xl p-3 text-[18px] font-bold text-[#772a7e] bg-[#fdeaff] focus:outline-none disabled:bg-[#fdeaff] disabled:text-[#772a7e] font-sans cursor-not-allowed"
                      />
                    </div>

                    {/* Empty cell for layout alignment on 3 columns */}
                    <div className="hidden md:block"></div>

                    {/* Rédaction du contrat */}
                    <div className="space-y-1 col-span-full">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Rédaction du contrat.")}
                      </label>
                      <div 
                        className="w-full text-[#772a7e] font-bold font-sans whitespace-pre-wrap select-text border-none rounded-xl p-4 bg-[#fdeaff] cursor-not-allowed"
                        style={{ fontSize: '18px' }}
                      >
                        {portalRedactionContrat}
                      </div>
                    </div>

                    {/* Date de signature */}
                    <div className="space-y-1">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Date.")}
                      </label>
                      <input
                        type="date"
                        value={portalDateSignatureContrat}
                        onChange={(e) => setPortalDateSignatureContrat(e.target.value)}
                        disabled={!!authenticatedClient?.signatureClientContratImage}
                        className={`w-full rounded-xl p-3 text-[18px] font-sans focus:outline-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none ${
                          !!authenticatedClient?.signatureClientContratImage
                            ? "border-none font-bold text-[#772a7e] bg-[#fdeaff] disabled:bg-[#fdeaff] disabled:text-[#772a7e] cursor-not-allowed"
                            : "border border-slate-200 text-black bg-white hover:border-[#772a7e] focus:border-[#772a7e]"
                        }`}
                      />
                    </div>

                    {/* Signé par */}
                    <div className="space-y-1">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Signataire.")}
                      </label>
                      <input
                        type="text"
                        value={portalSigneParContrat}
                        onChange={(e) => setPortalSigneParContrat(e.target.value)}
                        disabled={!!authenticatedClient?.signatureClientContratImage}
                        placeholder="Nom du signataire"
                        className={`w-full rounded-xl p-3 text-[18px] font-sans focus:outline-none ${
                          !!authenticatedClient?.signatureClientContratImage
                            ? "border-none font-bold text-[#772a7e] bg-[#fdeaff] disabled:bg-[#fdeaff] disabled:text-[#772a7e] cursor-not-allowed"
                            : "border border-slate-200 text-black bg-white hover:border-[#772a7e] focus:border-[#772a7e]"
                        }`}
                      />
                    </div>

                    {/* Signature du client */}
                    <div className="space-y-1 flex flex-col">
                      <label className="block text-[18px] font-bold text-black font-sans select-none">
                        {t("Signature.")}
                      </label>
                      <div className="flex flex-col items-center justify-center p-2 bg-transparent">
                        {authenticatedClient?.signatureClientContratImage ? (
                          <div className="bg-white border border-slate-200 rounded-lg p-1 w-[320px] h-[120px] flex items-center justify-center">
                            <img 
                              src={authenticatedClient.signatureClientContratImage} 
                              alt="Signature client sous contrat" 
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        ) : (
                          <>
                            <canvas
                              ref={portalContractCanvasRef}
                              width={320}
                              height={120}
                              className="bg-white border border-slate-200 cursor-crosshair rounded-lg"
                              onMouseDown={startDrawingPortalContractSig}
                              onMouseMove={drawPortalContractSig}
                              onMouseUp={stopDrawingPortalContractSig}
                              onMouseLeave={stopDrawingPortalContractSig}
                              onTouchStart={startDrawingPortalContractSig}
                              onTouchMove={drawPortalContractSig}
                              onTouchEnd={stopDrawingPortalContractSig}
                            />
                            <div className="flex justify-between items-center w-full mt-2 px-1">
                              <button
                                type="button"
                                onClick={clearPortalContractSignature}
                                className="px-6 py-3 text-white transition-all cursor-pointer outline-none border-none font-bold"
                                style={{
                                  backgroundColor: '#000000',
                                  borderRadius: '13px',
                                  fontSize: '18px',
                                  boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff1f',
                                }}
                              >
                                {t("Effacer")}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions row: Download button always visible, Save button visible if not signed yet */}
                  <div className="pt-4 mt-2">
                    <div className={authenticatedClient?.signatureClientContratImage ? "w-full" : "grid grid-cols-2 gap-3 w-full"}>
                      <button
                        type="button"
                        onClick={handleDownloadContractPDF}
                        className="w-full py-3 text-white transition-all cursor-pointer flex items-center justify-center gap-2 border-none outline-none font-bold"
                        style={{
                          backgroundColor: '#000000',
                          borderRadius: '13px',
                          fontSize: '18px',
                          boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff1f',
                        }}
                      >
                        {t("Télécharger")}
                      </button>

                      {!authenticatedClient?.signatureClientContratImage && (
                        <button
                          type="button"
                          onClick={handleSavePortalContract}
                          className="w-full py-3 text-white transition-all cursor-pointer outline-none border-none font-bold"
                          style={{
                            backgroundColor: '#3556ec',
                            borderRadius: '13px',
                            fontSize: '18px',
                            boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                          }}
                        >
                          {t("Signer")}
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* Card Contacts de l'Établissement */}
              <div
                className="bg-white p-5 list-none space-y-4"
                style={{
                  border: '1px solid #cfcfcf',
                  borderRadius: '13px',
                }}
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-[18px] font-black text-black select-none font-sans" style={{ letterSpacing: 'normal' }}>
                      {t("Contacts.")}
                    </h3>
                    <div className="mt-2 text-[16px] text-slate-600 font-sans leading-relaxed">
                      {t("Pour information, tous les contacts de type Planification reçoivent les communications relatives aux interventions des techniciens et les rapports PDF émis par notre entreprise.")}
                    </div>
                  </div>
                </div>

                <div className="space-y-6 pt-2">
                  {/* Edit Contact 1 */}
                  <div className="pb-2">
                    <div className="inline-block px-3 py-1 text-[14px] font-bold rounded-full font-sans select-none mb-3" style={{ backgroundColor: '#411046', color: '#ffffff' }}>
                      Contact 1
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      {renderEditSelectField(t('Type'), c1Type, setC1Type, ['Direction', 'Responsable', 'Commercial', 'Technique', 'Acheteur', 'Planification', 'Autre'])}
                      {renderEditField(t('Nom & Prénom'), c1Nom, setC1Nom)}
                      {renderEditField(t('Téléphone'), c1Tel, setC1Tel)}
                      {renderEditField(t('Email'), c1Email, setC1Email)}
                    </div>
                  </div>

                  {/* Edit Contact 2 */}
                  <div className="pb-2">
                    <div className="inline-block px-3 py-1 text-[14px] font-bold rounded-full font-sans select-none mb-3" style={{ backgroundColor: '#411046', color: '#ffffff' }}>
                      Contact 2
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      {renderEditSelectField(t('Type'), c2Type, setC2Type, ['Direction', 'Responsable', 'Commercial', 'Technique', 'Acheteur', 'Planification', 'Autre'])}
                      {renderEditField(t('Nom & Prénom'), c2Nom, setC2Nom)}
                      {renderEditField(t('Téléphone'), c2Tel, setC2Tel)}
                      {renderEditField(t('Email'), c2Email, setC2Email)}
                    </div>
                  </div>

                  {/* Edit Contact 3 */}
                  <div className="pb-2">
                    <div className="inline-block px-3 py-1 text-[14px] font-bold rounded-full font-sans select-none mb-3" style={{ backgroundColor: '#411046', color: '#ffffff' }}>
                      Contact 3
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      {renderEditSelectField(t('Type'), c3Type, setC3Type, ['Direction', 'Responsable', 'Commercial', 'Technique', 'Acheteur', 'Planification', 'Autre'])}
                      {renderEditField(t('Nom & Prénom'), c3Nom, setC3Nom)}
                      {renderEditField(t('Téléphone'), c3Tel, setC3Tel)}
                      {renderEditField(t('Email'), c3Email, setC3Email)}
                    </div>
                  </div>

                  {/* Edit Contact 4 */}
                  <div className="pb-2">
                    <div className="inline-block px-3 py-1 text-[14px] font-bold rounded-full font-sans select-none mb-3" style={{ backgroundColor: '#411046', color: '#ffffff' }}>
                      Contact 4
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      {renderEditSelectField(t('Type'), c4Type, setC4Type, ['Direction', 'Responsable', 'Commercial', 'Technique', 'Acheteur', 'Planification', 'Autre'])}
                      {renderEditField(t('Nom & Prénom'), c4Nom, setC4Nom)}
                      {renderEditField(t('Téléphone'), c4Tel, setC4Tel)}
                      {renderEditField(t('Email'), c4Email, setC4Email)}
                    </div>
                  </div>

                  {/* Edit Contact 5 */}
                  <div className="pb-2">
                    <div className="inline-block px-3 py-1 text-[14px] font-bold rounded-full font-sans select-none mb-3" style={{ backgroundColor: '#411046', color: '#ffffff' }}>
                      Contact 5
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      {renderEditSelectField(t('Type'), c5Type, setC5Type, ['Direction', 'Responsable', 'Commercial', 'Technique', 'Acheteur', 'Planification', 'Autre'])}
                      {renderEditField(t('Nom & Prénom'), c5Nom, setC5Nom)}
                      {renderEditField(t('Téléphone'), c5Tel, setC5Tel)}
                      {renderEditField(t('Email'), c5Email, setC5Email)}
                    </div>
                  </div>
                </div>

                {/* Save Button for Contacts */}
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleSaveContacts}
                    className="w-full py-3 text-white transition-all cursor-pointer border-none outline-none font-bold"
                    style={{
                      backgroundColor: '#3556ec',
                      borderRadius: '13px',
                      fontSize: '18px',
                      boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                    }}
                  >
                    {t("Enregistrer")}
                  </button>
                </div>
              </div>

              {/* Card Signature pour le client */}
              <div
                className="bg-white p-5 list-none space-y-4"
                style={{
                  border: '1px solid #cfcfcf',
                  borderRadius: '13px',
                }}
              >
                <div>
                  <h3 className="text-[18px] font-black text-black select-none font-sans" style={{ letterSpacing: 'normal' }}>
                    {t("Signature à distance.")}
                  </h3>
                </div>

                <div className="flex flex-col items-center justify-center py-2">
                  <div className="border border-slate-300 rounded-xl overflow-hidden bg-white" style={{ width: '300px', height: '150px' }}>
                    <canvas
                      ref={clientCanvasRef}
                      width={300}
                      height={150}
                      className="touch-none cursor-crosshair block bg-white"
                      onMouseDown={startDrawingSig}
                      onMouseMove={drawSig}
                      onMouseUp={stopDrawingSig}
                      onMouseLeave={stopDrawingSig}
                      onTouchStart={startDrawingSig}
                      onTouchMove={drawSig}
                      onTouchEnd={stopDrawingSig}
                    />
                  </div>
                </div>

                {/* Single PIN display inline */}
                <div className="text-[18px] text-black font-sans select-none pt-1">
                  {t("Votre PIN de signature à communiquer au technicien : ")}
                  <span className="font-extrabold text-[#3556ec] ml-1 select-all">
                    {authenticatedClient?.signaturePin || t('Non défini')}
                  </span>
                </div>

                {/* Both buttons side-by-side, full-width (50% / 50%) */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={clearSignatureSig}
                    className="w-full py-3 text-white transition-all cursor-pointer border-none outline-none font-bold"
                    style={{
                      backgroundColor: '#000000',
                      borderRadius: '13px',
                      fontSize: '18px',
                      boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff1f',
                    }}
                  >
                    {t("Effacer")}
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleSaveSignature}
                    className="w-full py-3 text-white transition-all cursor-pointer border-none outline-none font-bold"
                    style={{
                      backgroundColor: '#3556ec',
                      borderRadius: '13px',
                      fontSize: '18px',
                      boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                    }}
                  >
                    {t("Enregistrer")}
                  </button>
                </div>
              </div>

              {/* Formulaire de Contact */}
              <div
                className="bg-white p-5 list-none space-y-4"
                style={{
                  border: '1px solid #cfcfcf',
                  borderRadius: '13px',
                }}
              >
                <div>
                  <h3 className="text-[18px] font-black text-black select-none font-sans" style={{ letterSpacing: 'normal' }}>
                    {t("Formulaire de demande ou signalement.")}
                  </h3>
                </div>

                <form onSubmit={handleContactSubmit} className="space-y-4">
                  {/* Equipment select */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Matériel concerné.")}
                    </label>
                    <select
                      value={contactSelectedEquipId}
                      onChange={(e) => setContactSelectedEquipId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-[18px] text-black bg-white focus:outline-none font-sans appearance-none"
                    >
                      <option value="autre">{t("Autre demande / Problème général")}</option>
                      {assignedEquipment.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.nom}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Email field */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Votre adresse e-mail.")}
                    </label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-[18px] text-black bg-white focus:outline-none font-sans"
                      placeholder="exemple@email.com"
                    />
                  </div>

                  {/* Message field */}
                  <div className="space-y-1">
                    <label className="block text-[18px] font-bold text-black font-sans select-none">
                      {t("Votre message.")}
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-[18px] text-black bg-white focus:outline-none font-sans resize-y"
                      placeholder={t("Entrez un texte pour présenter la demande ou le signalement.")}
                    />
                  </div>

                  {/* Success & Error messages */}
                  {contactSuccessMsg && (
                    <div className="text-green-600 font-sans font-bold select-none" style={{ fontSize: '18px' }}>
                      {contactSuccessMsg}
                    </div>
                  )}

                  {contactErrorMsg && (
                    <div className="text-red-600 font-sans font-bold select-none" style={{ fontSize: '18px' }}>
                      {contactErrorMsg}
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full py-3 text-white transition-all cursor-pointer border-none outline-none font-bold"
                      style={{
                        backgroundColor: '#3556ec',
                        borderRadius: '13px',
                        fontSize: '18px',
                        boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #3556ec, inset 0 6px 12px #ffffff1f',
                      }}
                    >
                      {t("Envoyer")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
