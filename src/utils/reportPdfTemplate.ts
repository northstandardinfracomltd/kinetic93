import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { CompanyInfo, formatPdfHeaderText } from '../types';

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
  '%': '101001001001',
};

export const generateBarcodeSVGString = (text: string): string => {
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
};

export const computeDurationText = (startStr: string, endStr: string): string => {
  if (!startStr || !endStr) return '-';
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
    } catch (_) {}
    return null;
  };

  const start = parseDateString(startStr);
  const end = parseDateString(endStr);
  if (!start || !end) return '-';
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

export interface OfficialReportBuildParams {
  report: any;
  companyInfo?: Partial<CompanyInfo> | any;
  defibrillateurs?: any[];
  otherEquipments?: any[];
  clients?: any[];
  variables?: any[];
  stocks?: any[];
  members?: any[];
  fsmTours?: any[];
  commercialDocs?: any[];
  autoPrint?: boolean;
}

/**
 * Generates the exact multi-page A4 HTML report used in LOGICIEL PRINCIPAL > RAPPORTS PDF > Télécharger.
 */
export function buildOfficialReportHtml(params: OfficialReportBuildParams): string {
  const report = { ...(params.report || {}) };
  const effectiveCompanyInfo: any = { ...(params.companyInfo || {}) };
  const defibrillateurs = params.defibrillateurs || [];
  const otherEquipments = params.otherEquipments || [];
  const clients = params.clients || [];
  const variables = params.variables || [];
  const stocks = params.stocks || [];
  const members = params.members || [];
  const fsmTours = params.fsmTours || [];
  const autoPrint = params.autoPrint !== false;

  const rawSnap = report.defibSnapshot || {};
  const equipIdent = String(rawSnap.identifiant || report.identifiant || report.defibIdentifiant || '').trim().toLowerCase();
  const equipSn = String(rawSnap.numeroSerie || report.numeroSerie || '').trim().toLowerCase();
  const matchedDefib =
    defibrillateurs.find((d: any) => {
      const dIdent = String(d.identifiant || '').trim().toLowerCase();
      const dSn = String(d.numeroSerie || '').trim().toLowerCase();
      return (equipIdent && (dIdent === equipIdent || String(d.id || '').trim().toLowerCase() === equipIdent)) || (equipSn && dSn === equipSn);
    }) ||
    (otherEquipments || []).find((oe: any) => {
      const oeIdent = String(oe.identifiant || '').trim().toLowerCase();
      return equipIdent && (oeIdent === equipIdent || String(oe.id || '').trim().toLowerCase() === equipIdent);
    });

  const nonEmptyReportFields: Record<string, any> = {};
  for (const [rk, rv] of Object.entries(report)) {
    if (rk !== 'id' && rk !== 'defibSnapshot' && rv !== undefined && rv !== null && rv !== '') {
      nonEmptyReportFields[rk] = rv;
    }
  }

  const snapshot: Record<string, any> = {
    ...(matchedDefib || {}),
    ...rawSnap,
    ...nonEmptyReportFields,
    modeleId: rawSnap.modeleId || report.modele || matchedDefib?.modeleId || '',
    modeleCoffretId: rawSnap.modeleCoffretId || report.modeleCoffret || (matchedDefib as any)?.modeleCoffretId || '',
    modeleElectrodeAId: rawSnap.modeleElectrodeAId || report.modeleElectrodeA || (matchedDefib as any)?.modeleElectrodeAId || '',
    modeleElectrodeASecoursId: rawSnap.modeleElectrodeASecoursId || report.modeleElectrodeSecoursA || (matchedDefib as any)?.modeleElectrodeASecoursId || '',
    modeleElectrodePId: rawSnap.modeleElectrodePId || report.modeleElectrodeP || (matchedDefib as any)?.modeleElectrodePId || '',
    modeleElectrodePSecoursId: rawSnap.modeleElectrodePSecoursId || report.modeleElectrodeSecoursP || (matchedDefib as any)?.modeleElectrodePSecoursId || '',
    modeleBatterieId: rawSnap.modeleBatterieId || report.modeleBatterie || (matchedDefib as any)?.modeleBatterieId || '',
    insertionElectrodeA: rawSnap.insertionElectrodeA || rawSnap.fabricationElectrodeA || report.fabricationElectrodeA || (matchedDefib as any)?.insertionElectrodeA || '',
    insertionBatterie: rawSnap.insertionBatterie || rawSnap.miseEnServiceBatterie || report.miseEnServiceBatterie || (matchedDefib as any)?.insertionBatterie || '',
    peremptionSecoursElectrodeA: rawSnap.peremptionSecoursElectrodeA || rawSnap.peremptionElectrodeSecoursA || report.peremptionElectrodeSecoursA || (matchedDefib as any)?.peremptionSecoursElectrodeA || '',
    lotElectrodeASecours: rawSnap.lotElectrodeASecours || rawSnap.lotElectrodeSecoursA || report.lotElectrodeSecoursA || (matchedDefib as any)?.lotElectrodeASecours || '',
    peremptionSecoursElectrodeP: rawSnap.peremptionSecoursElectrodeP || rawSnap.peremptionElectrodeSecoursP || report.peremptionElectrodeSecoursP || (matchedDefib as any)?.peremptionSecoursElectrodeP || '',
    lotElectrodePSecours: rawSnap.lotElectrodePSecours || rawSnap.lotElectrodeSecoursP || report.lotElectrodeSecoursP || (matchedDefib as any)?.lotElectrodePSecours || '',
    peremptionTrousse: report.kitPeremption || report.peremptionKit || rawSnap.peremptionTrousse || rawSnap.peremptionKit || (matchedDefib as any)?.peremptionTrousse || '',
    commentaire: report.diagnosticCommentaire || rawSnap.commentaire || report.remarques || (matchedDefib as any)?.commentaire || '',
  };

  const pdfLogo = effectiveCompanyInfo.logo || '';
  const pdfHeaderImg = effectiveCompanyInfo.pdfHeaderImg || '';
  const pdfPageHeaderText = effectiveCompanyInfo.pdfPageHeaderText || '';
  const pdfPageFooterText = effectiveCompanyInfo.pdfPageFooterText || '';
  const pdfLastPageInfoText = effectiveCompanyInfo.pdfLastPageInfoText || '';
  const hasLastPage = !!String(pdfLastPageInfoText).trim();
  const pdfHeaderBgColor = effectiveCompanyInfo.pdfHeaderBgColor || '#7c2882';
  const pdfCardBorderColor = effectiveCompanyInfo.pdfCardBorderColor || '#7d2882';
  const pdfCardBgColor = effectiveCompanyInfo.pdfCardBgColor || '#fef2ff';
  const pdfLabelTextColor = effectiveCompanyInfo.pdfLabelTextColor || '#9f71a2';

  const compName = effectiveCompanyInfo.name || 'Défibeo Solutions';
  const compEmail = effectiveCompanyInfo.email || '';
  const compPhone = effectiveCompanyInfo.phone || '';

  const clientCandidates = [snapshot.clientId, report.clientId, report.clientName, report.entreprise]
    .filter(Boolean)
    .map(s => String(s).trim().toLowerCase());
  let clientFound = clients.find((c: any) => {
    const cKeys = [c.id, c.clientIdField, c.denomination]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
    return cKeys.some(k => clientCandidates.includes(k));
  });
  if (!clientFound) {
    const siteEmail = snapshot.emailSite || report.emailSite || '';
    if (siteEmail) {
      clientFound = clients.find((c: any) => c.email && c.email.toLowerCase().trim() === siteEmail.toLowerCase().trim());
    }
  }
  if (!clientFound) {
    const siteNom = snapshot.nomPrenomSite || '';
    if (siteNom) {
      clientFound = clients.find((c: any) => c.denomination === siteNom || c.nomPrenomSite === siteNom);
    }
  }
  const clientName = clientFound
    ? clientFound.denomination
    : (report.clientName || report.entreprise || snapshot.clientId || snapshot.nomPrenomSite || 'Non rattaché');

  const clientIdField = clientFound?.clientIdField || report.clientIdField || snapshot.clientIdField || '';
  const payeurId = clientFound?.payeurId || report.payeurId || snapshot.payeurId || '';

  let autreReferenceVal = report.autreReference || report.customReference || snapshot.autreReference || '';
  if (!autreReferenceVal) {
    for (const tour of fsmTours || []) {
      for (const m of tour.missions || []) {
        if (
          (report.missionId && m.id === report.missionId) ||
          (report.interventionReference && m.interventionReference === report.interventionReference) ||
          (report.defibIdentifiant && m.defibIdentifiant === report.defibIdentifiant) ||
          (snapshot.identifiant && m.defibIdentifiant === snapshot.identifiant)
        ) {
          if (m.autreReference) {
            autreReferenceVal = m.autreReference;
            break;
          }
        }
      }
      if (autreReferenceVal) break;
    }
  }

  const renderHeader = () => {
    const showHeaderImg = pdfHeaderImg
      ? `<img src="${pdfHeaderImg}" style="max-height: 55px; max-width: 100%; object-fit: contain;" alt="Header Illustration" referrerPolicy="no-referrer" crossorigin="anonymous" />`
      : '';
    const showHeaderLogo = pdfLogo
      ? `<img src="${pdfLogo}" style="max-height: 80px; object-fit: contain;" alt="Logo" referrerPolicy="no-referrer" crossorigin="anonymous" />`
      : '';
    const showHeaderInfoText = pdfPageHeaderText
      ? `<div style="font-size: 14px; color: #000000; text-align: left; font-family: 'Civilprom', sans-serif !important;">${formatPdfHeaderText(pdfPageHeaderText)}</div>`
      : '';
    const showEmail = compEmail ? `<div>${compEmail}</div>` : '';
    const showPhone = compPhone ? `<div>${compPhone}</div>` : '';

    return `
      <div class="pdf-global-header" style="display: flex; flex-direction: row; width: calc(100% - 30mm); margin: 10mm 15mm 15px 15mm; padding-bottom: 10px; font-family: 'Civilprom', 'Inter', sans-serif !important; align-items: flex-start; box-sizing: border-box;">
        <div style="width: 20%; display: flex; align-items: flex-start; justify-content: flex-start; box-sizing: border-box; padding-right: 5px;">
          ${showHeaderLogo}
        </div>
        <div style="width: 50%; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; text-align: left; box-sizing: border-box; padding: 0 5px; gap: 4px;">
          ${showHeaderImg}
          ${showHeaderInfoText}
        </div>
        <div style="width: 30%; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start; text-align: right; box-sizing: border-box; padding-left: 5px; font-size: 14px; color: #000000; gap: 2px;">
          <div style="font-weight: bold !important; margin-bottom: 2px;">${compName}</div>
          ${showEmail}
          ${showPhone}
        </div>
      </div>
    `;
  };

  const renderFooter = (pageIndex: number, pagesTotal: number) => `
    <div class="pdf-footer" style="position: absolute; bottom: 15mm; left: 15mm; right: 15mm; display: flex; flex-direction: row; justify-content: space-between; align-items: flex-end; font-size: 8px; color: #000000; padding-top: 8px; font-family: 'Civilprom', 'Inter', sans-serif !important; box-sizing: border-box; width: calc(100% - 30mm); border-top: none;">
      <div style="flex: 1; text-align: left; padding-right: 20px; color: #000000; font-size: 8px;">
        <p style="margin: 0; color: #000000; font-size: 8px; text-align: left; font-weight: normal !important; line-height: 1.4;">${pdfPageFooterText || ''}</p>
      </div>
      <div style="font-weight: bold !important; white-space: nowrap; color: #000000; font-size: 8px;">
        Page ${pageIndex} / ${pagesTotal}
      </div>
    </div>
  `;

  const autoPrintScript = autoPrint
    ? `<script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);
        };
      </script>`
    : '';

  if (snapshot.categorie && snapshot.categorie !== 'Défibrillateur') {
    const topLevelKeys = [
      'id', 'clientId', 'nomPrenomSite', 'telephoneSite', 'emailSite', 'contrat', 'nomContrat', 'referenceContrat',
      'debutContrat', 'finContrat', 'pays', 'codePostal', 'cp', 'ville', 'adresseComplexe', 'identifiant',
      'codeNfc', 'statutGmao', 'categorie', 'conforme', 'miseEnServiceDate', 'miseEnService', 'commentaireGmao'
    ];

    const customProperties = Object.entries(snapshot).filter(([k, v]) => {
      return !topLevelKeys.includes(k) && v !== undefined && v !== null && v !== '' && typeof v !== 'object';
    });

    const totalPages = hasLastPage ? 3 : 2;
    const docTitle = report.title ? report.title : `Rapport d’intervention - ${snapshot.categorie || ''}`;

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Rapport - ${snapshot.identifiant || report.defibIdentifiant || '-'}</title>
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
          .text-rose-600 {
            color: #e11d48 !important;
          }
          .text-emerald-600 {
            color: #059669 !important;
          }
          .font-bold {
            font-weight: bold !important;
          }
          .pdf-footer {
            position: absolute;
            bottom: 15mm;
            right: 15mm;
            font-size: 11px;
            color: #000000;
          }
        </style>
        ${autoPrintScript}
      </head>
      <body class="bg-white">
        <div id="print-container">
          <!-- PAGE 1 -->
          <div class="pdf-page">
            ${renderHeader()}

            <div class="pdf-grid">
              <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 10px; box-sizing: border-box;">
                <div style="flex: 1; text-align: left; padding-right: 15px; box-sizing: border-box;">
                  <h1 style="font-size: 20px; font-weight: bold; color: #000000; margin: 0; font-family: 'Civilprom', sans-serif !important;">${docTitle}</h1>
                </div>
                <div style="flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center;">
                  ${generateBarcodeSVGString(snapshot.identifiant || report.defibIdentifiant || 'EQUIP')}
                </div>
              </div>

              <!-- SECTION 1 -->
              <div class="pdf-card">
                <div class="pdf-card-header">1 — Informations générales.</div>
                <div class="pdf-card-body" style="display: flex; flex-direction: column; gap: 4px;">
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Client :</span> <span class="pdf-bold">${clientName || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Client ID / Code Affaire :</span> <span class="pdf-bold">${clientIdField || '—'}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Payeur ID :</span> <span class="pdf-bold">${payeurId || '—'}</span></div>
                  </div>
                  <div class="pdf-line"><span class="pdf-label">Contact sur place :</span> <span class="pdf-bold">${snapshot.nomPrenomSite || ''}</span></div>
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Téléphone du contact :</span> <span class="pdf-bold">${snapshot.telephoneSite || ''}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Email du contact :</span> <span class="pdf-bold">${snapshot.emailSite || ''}</span></div>
                  </div>
                  <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Type matériel :</span> <span class="pdf-bold">${snapshot.categorie || 'Autre'}</span></div>
                  <div class="pdf-line"><span class="pdf-label">Version du logiciel :</span> <span class="pdf-bold">${snapshot.versionLogiciel || '—'}</span></div>
                  <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Référence intervention :</span> <span class="pdf-bold">${report.interventionReference || '—'}</span></div>
                    <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Autre référence :</span> <span class="pdf-bold">${autreReferenceVal || '—'}</span></div>
                  </div>
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
            ${renderHeader()}

            <div class="pdf-grid">
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
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                      <div class="pdf-line" style="font-size: 16px; font-weight: bold !important;">Photographies de l'intervention.</div>

                      ${report.photoUrl ? `
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                          <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                            <img src="${report.photoUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo" referrerPolicy="no-referrer" crossorigin="anonymous" />
                          </div>
                          <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie globale du défibrillateur.</span>
                        </div>
                      ` : ''}

                      ${report.photoArriereUrl ? `
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                          <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                            <img src="${report.photoArriereUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Arrière" referrerPolicy="no-referrer" crossorigin="anonymous" />
                          </div>
                          <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie arrière / étiquette.</span>
                        </div>
                      ` : ''}

                      ${report.photoResultatTestUrl ? `
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                          <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                            <img src="${report.photoResultatTestUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Résultat Test" referrerPolicy="no-referrer" crossorigin="anonymous" />
                          </div>
                          <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Résultat du test.</span>
                        </div>
                      ` : ''}
                    </div>

                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                      ${(() => {
                        const buildSvgSig = (label: string) => {
                          const safe = String(label || 'Signé').replace(/[<>&"']/g, '').trim() || 'Signé';
                          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70" viewBox="0 0 220 70"><text x="10" y="42" font-family="Brush Script MT, Segoe Script, Apple Chancery, cursive, sans-serif" font-size="26" font-style="italic" fill="#0f172a">${safe}</text><path d="M 10 52 Q 95 44 195 54" stroke="#0f172a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
                          return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
                        };
                        const tName = String(report.techName || report.technicien || snapshot.techName || '').trim();
                        const matchedM =
                          (members || []).find((m: any) =>
                            tName &&
                            ((m.name && m.name.trim().toLowerCase() === tName.toLowerCase()) ||
                             (m.email && m.email.trim().toLowerCase() === tName.toLowerCase()))
                          ) || (members || []).find((m: any) => m.signature && String(m.signature).startsWith('data:image'));
                        let tSig =
                          report.techSignature ||
                          snapshot.techSignature ||
                          matchedM?.signature ||
                          '';
                        if (!tSig && typeof window !== 'undefined') {
                          try {
                            for (let i = 0; i < localStorage.length; i++) {
                              const k = localStorage.key(i) || '';
                              if (k.includes('_tech_signature_')) {
                                const v = localStorage.getItem(k) || '';
                                if (v.startsWith('data:image')) {
                                  tSig = v;
                                  break;
                                }
                              }
                            }
                          } catch (_) {}
                        }
                        if (!tSig && tName) {
                          tSig = buildSvgSig(tName);
                        }
                        if (!tSig) return '';
                        return `
                          <div class="pdf-line" style="font-size: 16px;">Signature technicien.</div>
                          <div style="background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 60px; max-width: 150px;">
                            <img src="${tSig}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature" crossorigin="anonymous" />
                          </div>
                        `;
                      })()}
                    </div>

                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                      ${(() => {
                        const rawClientSig = String(report.clientPinCode || snapshot.clientPinCode || '').trim();
                        const isSigImg = rawClientSig.startsWith('data:image') || rawClientSig.startsWith('http');
                        let sigImgUrl =
                          (isSigImg ? rawClientSig : '') ||
                          (clientFound && (clientFound.clientSignatureImage || (clientFound as any).signatureClientContratImage || (clientFound as any).signatureClient)) ||
                          report.clientSignatureImage ||
                          report.signatureClientContratImage ||
                          snapshot.clientSignatureImage ||
                          snapshot.signatureClientContratImage ||
                          '';
                        if (
                          sigImgUrl &&
                          (sigImgUrl.startsWith('data:image/svg+xml') ||
                            decodeURIComponent(sigImgUrl).toLowerCase().includes('représentant standard') ||
                            decodeURIComponent(sigImgUrl).toLowerCase().includes('representant standard'))
                        ) {
                          sigImgUrl = '';
                        }
                        const pinCodeVal = !isSigImg ? rawClientSig : '';
                        return `
                          <div class="pdf-line" style="font-size: 16px;">Signature client.</div>
                          ${pinCodeVal ? `
                            <div style="font-size: 13px; margin-bottom: 2px; color: #000000; font-family: 'DefibeoMain', 'Civilprom', sans-serif !important; font-weight: 100 !important;">
                              <span style="font-size: 13px; color: #000000; font-family: 'DefibeoMain', 'Civilprom', sans-serif !important; font-weight: 100 !important;">Code validation: ${pinCodeVal}</span>
                            </div>
                          ` : ''}
                          ${sigImgUrl ? `
                            <div style="background: transparent; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; max-height: 80px; max-width: 150px; margin-top: 4px;">
                              <img src="${sigImgUrl}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature Client" crossorigin="anonymous" />
                            </div>
                          ` : ''}
                        `;
                      })()}
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
              ${renderHeader()}
              <div class="pdf-grid" style="display: flex; flex-direction: column; justify-content: flex-start;">
                <div class="pdf-card" style="display: flex; flex-direction: column;">
                  <div class="pdf-card-header" style="font-weight: bold !important; margin-bottom: 10px;">
                    Informations complémentaires
                  </div>
                  <div class="pdf-card-body" style="font-size: 15px; color: #000000; white-space: pre-line; line-height: 1.5;">
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
  }

  const findVariableByModelRef = (ref: any) => {
    if (!ref) return undefined;
    const clean = String(ref).trim().toLowerCase();
    if (!clean) return undefined;
    return variables.find((v: any) => {
      const vId = String(v.id || '').trim().toLowerCase();
      const vNom = String(v.nom || '').trim().toLowerCase();
      const vMarqueNom = `${v.marque || ''} ${v.nom || ''}`.trim().toLowerCase();
      const vNomMarque = `${v.nom || ''} (${v.marque || ''})`.trim().toLowerCase();
      return vId === clean || vNom === clean || vMarqueNom === clean || vNomMarque === clean;
    });
  };

  const formatModelDisplayName = (modelVar: any, fallbackRef: any, emptyFallback = 'Non spécifié') => {
    if (modelVar) {
      return `${modelVar.marque ? modelVar.marque + ' ' : ''}${modelVar.nom || ''}`.trim();
    }
    return fallbackRef ? String(fallbackRef) : emptyFallback;
  };

  const defibModel = findVariableByModelRef(snapshot.modeleId || snapshot.modele);
  const selectedModelVar = defibModel;

  const isVisibleVersionLogiciel = selectedModelVar ? (selectedModelVar.visibiliteVersionLogiciel !== 'Non') : true;
  const isVisiblePadPakAdulte = selectedModelVar ? (selectedModelVar.visibilitePadPakAdulte !== 'Non') : true;
  const isVisibleLotPadPakA = selectedModelVar ? (selectedModelVar.visibiliteLotPadPakA !== 'Non') : true;
  const isVisiblePeremptionPadPakA = selectedModelVar ? (selectedModelVar.visibilitePeremptionPadPakA !== 'Non') : true;
  const isVisibleLotP = selectedModelVar ? (selectedModelVar.visibiliteLotP !== 'Non') : true;
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

  const defibModelName = formatModelDisplayName(defibModel, snapshot.modeleId || snapshot.modele);
  const coffretModel = findVariableByModelRef(snapshot.modeleCoffretId || snapshot.modeleCoffret);
  const coffretModelName = formatModelDisplayName(coffretModel, snapshot.modeleCoffretId || snapshot.modeleCoffret);
  const electrodeAModel = findVariableByModelRef(snapshot.modeleElectrodeAId || snapshot.modeleElectrodeA);
  const electrodeAModelName = formatModelDisplayName(electrodeAModel, snapshot.modeleElectrodeAId || snapshot.modeleElectrodeA);
  const electrodeASecoursModel = findVariableByModelRef(snapshot.modeleElectrodeASecoursId || snapshot.modeleElectrodeSecoursA);
  const electrodeASecoursModelName = formatModelDisplayName(electrodeASecoursModel, snapshot.modeleElectrodeASecoursId || snapshot.modeleElectrodeSecoursA, '');
  const electrodePModel = findVariableByModelRef(snapshot.modeleElectrodePId || snapshot.modeleElectrodeP);
  const electrodePModelName = formatModelDisplayName(electrodePModel, snapshot.modeleElectrodePId || snapshot.modeleElectrodeP);
  const electrodePSecoursModel = findVariableByModelRef(snapshot.modeleElectrodePSecoursId || snapshot.modeleElectrodeSecoursP);
  const electrodePSecoursModelName = formatModelDisplayName(electrodePSecoursModel, snapshot.modeleElectrodePSecoursId || snapshot.modeleElectrodeSecoursP, '');
  const batterieModel = findVariableByModelRef(snapshot.modeleBatterieId || snapshot.modeleBatterie);
  const batterieModelName = formatModelDisplayName(batterieModel, snapshot.modeleBatterieId || snapshot.modeleBatterie);

  const getStockPieceLabel = (stockId: string) => {
    if (!stockId) return '-';
    const cleanRef = String(stockId).trim().toLowerCase();
    const stockItem = stocks.find((s: any) => {
      const sKeys = [s.id, s.identifiant, s.ugs, s.denominationPieceId, s.denominationPieceNom]
        .filter(Boolean)
        .map(x => String(x).trim().toLowerCase());
      return sKeys.includes(cleanRef);
    });
    if (!stockItem) {
      const directVar = findVariableByModelRef(stockId);
      if (directVar) return `${directVar.nom}${directVar.marque ? ` (${directVar.marque})` : ''}`;
      return stockId;
    }
    const variableItem = findVariableByModelRef(stockItem.denominationPieceId || stockItem.denominationPieceNom);
    if (!variableItem) {
      return stockItem.denominationPieceNom || stockItem.denominationPieceId || stockId;
    }
    return `${variableItem.nom}${variableItem.marque ? ` (${variableItem.marque})` : ''}`;
  };

  const selElectrodeA = getStockPieceLabel(report.selectionElectrodeARemplacee || report.destockElectrodeA || snapshot.destockElectrodeA);
  const selElectrodeASecours = getStockPieceLabel(report.selectionElectrodeASecoursRemplacee || report.destockElectrodeSecoursA || snapshot.destockElectrodeSecoursA);
  const selElectrodeP = getStockPieceLabel(report.selectionElectrodePRemplacee || report.destockElectrodeP || snapshot.destockElectrodeP);
  const selElectrodePSecours = getStockPieceLabel(report.selectionElectrodePSecoursRemplacee || report.destockElectrodeSecoursP || snapshot.destockElectrodeSecoursP);
  const selBatterie = getStockPieceLabel(report.selectionBatterieRemplacee || report.destockBatterie || snapshot.destockBatterie);
  const selKitSecours = getStockPieceLabel(report.selectionKitSecoursRemplace || report.destockKit || snapshot.destockKit);

  const pdfHideElectrodeSecoursA = effectiveCompanyInfo.pdfHideElectrodeSecoursA === 'Oui';
  const pdfHideElectrodeSecoursP = effectiveCompanyInfo.pdfHideElectrodeSecoursP === 'Oui';
  const pdfHideKitSecours = effectiveCompanyInfo.pdfHideKitSecours === 'Oui';
  const pdfSimplifyCoffret = effectiveCompanyInfo.pdfSimplifyCoffret === 'Oui';
  const pdfHideVerificationsTechniques = effectiveCompanyInfo.pdfHideVerificationsTechniques === 'Oui';
  const pdfHideHorodatagesDiagnostic = effectiveCompanyInfo.pdfHideHorodatagesDiagnostic === 'Oui';
  const pdfShowDemandeDevisDetails = effectiveCompanyInfo.pdfShowDemandeDevisDetails === 'Oui';

  const totalPages = hasLastPage ? 6 : 5;
  const rawDocTitle = String(report.reportTitle || report.title || snapshot.reportTitle || snapshot.title || '').trim();
  const docTitle =
    !rawDocTitle || rawDocTitle === 'RAPPORT TECHNIQUE DÉFIBRILLATEUR' || /^rapport d['’]intervention gmao$/i.test(rawDocTitle)
      ? 'RAPPORT D’INTERVENTION'
      : rawDocTitle;

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Rapport - ${snapshot.identifiant || report.defibIdentifiant || '-'}</title>
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
    </head>
    <body class="bg-white">
      <div id="print-container">
        <!-- PAGE 1 -->
        <div class="pdf-page">
          ${renderHeader()}

          <div class="pdf-grid">
            <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 10px; box-sizing: border-box;">
              <div style="flex: 1; text-align: left; padding-right: 15px; box-sizing: border-box;">
                <h1 style="font-size: 20px; font-weight: bold; color: #000000; margin: 0; font-family: 'Civilprom', sans-serif !important;">${docTitle}</h1>
              </div>
              <div style="flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center;">
                ${generateBarcodeSVGString(snapshot.identifiant || report.defibIdentifiant || 'EQUIP')}
              </div>
            </div>

            <!-- SECTION 1 -->
            <div class="pdf-card">
              <div class="pdf-card-header">1 — Informations générales.</div>
              <div class="pdf-card-body" style="display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Client :</span> <span class="pdf-bold">${clientName || ''}</span></div>
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Client ID / Code Affaire :</span> <span class="pdf-bold">${clientIdField || '—'}</span></div>
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Payeur ID :</span> <span class="pdf-bold">${payeurId || '—'}</span></div>
                </div>
                <div class="pdf-line"><span class="pdf-label">Contact :</span> <span class="pdf-bold">${snapshot.nomPrenomSite || ''}</span></div>
                <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Téléphone du contact :</span> <span class="pdf-bold">${snapshot.telephoneSite || ''}</span></div>
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Email du contact :</span> <span class="pdf-bold">${snapshot.emailSite || ''}</span></div>
                </div>
                <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Voie :</span> <span class="pdf-bold">${snapshot.numVoie || ''}</span></div>
                <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Ville :</span> <span class="pdf-bold">${snapshot.ville || ''}</span></div>
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Code Postal :</span> <span class="pdf-bold">${snapshot.cp || ''}</span></div>
                </div>
                <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Région :</span> <span class="pdf-bold">${snapshot.region || ''}</span></div>
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Pays :</span> <span class="pdf-bold">${snapshot.pays || ''}</span></div>
                </div>
                <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Latitude GPS :</span> <span class="pdf-bold">${snapshot.latitude || ''}</span></div>
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Longitude GPS :</span> <span class="pdf-bold">${snapshot.longitude || ''}</span></div>
                </div>
                <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Type matériel :</span> <span class="pdf-bold">${snapshot.categorie || 'Défibrillateur'}</span></div>
                <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Référence intervention :</span> <span class="pdf-bold">${report.interventionReference || '—'}</span></div>
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Autre référence :</span> <span class="pdf-bold">${autreReferenceVal || '—'}</span></div>
                </div>
                <div style="display: flex; flex-direction: row; gap: 20px; width: 100%;">
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Identifiant :</span> <span class="pdf-bold">${snapshot.identifiant || report.defibIdentifiant || ''}</span></div>
                  <div class="pdf-line" style="flex: 1;"><span class="pdf-label">Série :</span> <span class="pdf-bold">${snapshot.numeroSerie || report.numeroSerie || ''}</span></div>
                </div>
                <div class="pdf-line"><span class="pdf-label">Modèle :</span> <span class="pdf-bold">${(snapshot.modeleId || snapshot.modele) ? defibModelName : ''}</span></div>
                ${isVisibleVersionLogiciel ? `<div class="pdf-line"><span class="pdf-label">Version du logiciel :</span> <span class="pdf-bold">${snapshot.versionLogiciel || '—'}</span></div>` : ''}
                <div class="pdf-line"><span class="pdf-label">Type Défibrillateur :</span> <span class="pdf-bold">${defibModel?.typeDefibrillateur || snapshot.typeDefibrillateur || (snapshot.dea === 'Oui' || report.dea === 'Oui' ? 'DEA' : 'DSA')}</span></div>
                <div class="pdf-line" style="margin-top: 10px;"><span class="pdf-label">Date Fabrication :</span> <span class="pdf-bold">${snapshot.fabrication || ''}</span></div>
                <div class="pdf-line"><span class="pdf-label">Date Mise en service :</span> <span class="pdf-bold">${snapshot.miseEnService || ''}</span></div>
              </div>
            </div>
          </div>

          ${renderFooter(1, totalPages)}
        </div>

        <!-- PAGE 2 -->
        <div class="pdf-page">
          ${renderHeader()}

          <div class="pdf-grid">
            <!-- SECTION 2 -->
            <div class="pdf-card">
              <div class="pdf-card-header">2 — Batterie (B).</div>
              <div class="pdf-card-body">
                <div class="pdf-line"><span class="pdf-label">Référence de batterie :</span> <span class="pdf-bold">${batterieModelName || ''}</span></div>
                ${isVisiblePourcentageBatterie ? `<div class="pdf-line"><span class="pdf-label">Pourcentage de charge :</span> <span class="pdf-bold">${snapshot.pourcentageBatterie ? (String(snapshot.pourcentageBatterie).includes('%') ? snapshot.pourcentageBatterie : snapshot.pourcentageBatterie + '%') : ''}</span></div>` : ''}
                <div class="pdf-line"><span class="pdf-label">Lot B :</span> <span class="pdf-bold">${snapshot.lotBatterie || ''}</span></div>
                ${isVisiblePeremptionBatterie ? `<div class="pdf-line"><span class="pdf-label">Péremption :</span> <span class="pdf-bold">${snapshot.peremptionBatterie || ''}</span></div>` : ''}
                ${isVisibleFabricationBatterie ? `<div class="pdf-line"><span class="pdf-label">Fabrication :</span> <span class="pdf-bold">${snapshot.fabricationBatterie || ''}</span></div>` : ''}
                ${isVisibleInsertionBatterie ? `<div class="pdf-line"><span class="pdf-label">Insertion :</span> <span class="pdf-bold">${snapshot.insertionBatterie || snapshot.miseEnServiceBatterie || ''}</span></div>` : ''}
                <div class="pdf-line"><span class="pdf-label">Batterie remplacée :</span> <span class="pdf-bold">${report.batterieRemplacee || report.remplaceBatterie || snapshot.remplaceBatterie || 'Non'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Sélection de la batterie remplacée :</span> <span class="pdf-bold">${selBatterie || ''}</span></div>
                <div class="pdf-line"><span class="pdf-label">Pourcentage de charge nouvelle batterie :</span> <span class="pdf-bold">${(report.pourcentageChargeNouvelleBatterie || snapshot.pourcentageChargeNouvelleBatterie) ? (String(report.pourcentageChargeNouvelleBatterie || snapshot.pourcentageChargeNouvelleBatterie).includes('%') ? (report.pourcentageChargeNouvelleBatterie || snapshot.pourcentageChargeNouvelleBatterie) : (report.pourcentageChargeNouvelleBatterie || snapshot.pourcentageChargeNouvelleBatterie) + '%') : ''}</span></div>
                <div class="pdf-line"><span class="pdf-label">Batterie conforme et fonctionnelle :</span> <span class="pdf-bold">${report.batterieConformeSante || snapshot.batterieConformeSante || report.conforme || snapshot.conforme || 'Oui'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Commentaire concernant la batterie :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireBatterie || ''}</span></div>
              </div>
            </div>

            ${!pdfHideVerificationsTechniques ? `
            <!-- SECTION 3 -->
            <div class="pdf-card">
              <div class="pdf-card-header">3 — Vérifications techniques.</div>
              <div class="pdf-card-body" style="gap: 3px;">
                <div class="pdf-line"><span class="pdf-label">Conforme à mon arrivée :</span> <span class="pdf-bold">${report.techConformeArrivee || report.verificationsConformes || snapshot.verificationsConformes || 'Oui'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Commentaire sur l’état à mon arrivée :</span> <span class="pdf-bold">${report.techCommentaireArrivee || ''}</span></div>
                ${isVisibleNettoyage ? `<div class="pdf-line"><span class="pdf-label">Nettoyage :</span> <span class="pdf-bold">${report.techNettoyage || report.verificationsConformes || snapshot.verificationsConformes || 'Oui'}</span></div>` : ''}
                ${isVisibleVoyantConforme ? `<div class="pdf-line"><span class="pdf-label">Voyant conforme :</span> <span class="pdf-bold">${report.techVoyantConforme || report.verificationsConformes || snapshot.verificationsConformes || 'Oui'}</span></div>` : ''}
                ${isVisibleEquipeMessageNumerique ? `<div class="pdf-line"><span class="pdf-label">Équipé d’un message numérique :</span> <span class="pdf-bold">${report.techEquipeMessageNumerique || report.ecran || snapshot.ecran || 'Non'}</span></div>` : ''}
                ${isVisibleEquipeMessageNumerique && isVisibleMessageNumeriqueConforme ? `<div class="pdf-line"><span class="pdf-label">Message numérique conforme :</span> <span class="pdf-bold">${report.techMessageNumeroConforme || ((report.techEquipeMessageNumerique || report.ecran || snapshot.ecran) === 'Oui' ? (report.verificationsConformes || snapshot.verificationsConformes || 'Oui') : 'Non')}</span></div>` : ''}
                ${isVisibleGuidesVocaux ? `<div class="pdf-line"><span class="pdf-label">Guides vocaux conformes :</span> <span class="pdf-bold">${report.techGuidesVocauxConformes || report.verificationsConformes || snapshot.verificationsConformes || 'Oui'}</span></div>` : ''}
                ${isVisibleBranchementElectrodes ? `<div class="pdf-line"><span class="pdf-label">Branchement conforme des électrodes :</span> <span class="pdf-bold">${report.techBranchementElectrodesConforme || report.verificationsConformes || snapshot.verificationsConformes || 'Oui'}</span></div>` : ''}
              </div>
            </div>
            ` : ''}
          </div>

          ${renderFooter(2, totalPages)}
        </div>

        <!-- PAGE 3 -->
        <div class="pdf-page">
          ${renderHeader()}

          <div class="pdf-grid">
            <!-- SECTION 4 -->
            <div class="pdf-card">
              <div class="pdf-card-header">4 — Électrode Adulte ou Mixte (A).</div>
              <div class="pdf-card-body">
                <div class="pdf-line"><span class="pdf-label">Modèle d'électrode A :</span> <span class="pdf-bold">${electrodeAModelName || ''}</span></div>
                ${isVisibleLotPadPakA ? `<div class="pdf-line"><span class="pdf-label">Lot A :</span> <span class="pdf-bold">${snapshot.lotElectrodeA || ''}</span></div>` : ''}
                ${isVisiblePadPakAdulte ? `<div class="pdf-line"><span class="pdf-label">Insertion :</span> <span class="pdf-bold">${snapshot.insertionElectrodeA || snapshot.fabricationElectrodeA || ''}</span></div>` : ''}
                ${isVisiblePeremptionPadPakA ? `<div class="pdf-line"><span class="pdf-label">Péremption :</span> <span class="pdf-bold">${snapshot.peremptionElectrodeA || ''}</span></div>` : ''}

                <div class="pdf-line"><span class="pdf-label">Modèle électrode secours :</span> <span class="pdf-bold">${electrodeASecoursModelName || 'Aucun'}</span></div>
                ${isVisibleLotPadPakA ? `<div class="pdf-line"><span class="pdf-label">Lot de secours :</span> <span class="pdf-bold">${snapshot.lotElectrodeASecours || snapshot.lotElectrodeSecoursA || ''}</span></div>` : ''}
                ${isVisiblePeremptionPadPakA ? `<div class="pdf-line"><span class="pdf-label">Péremption de secours :</span> <span class="pdf-bold">${snapshot.peremptionSecoursElectrodeA || snapshot.peremptionElectrodeSecoursA || ''}</span></div>` : ''}

                <div class="pdf-line"><span class="pdf-label">Électrode A remplacée :</span> <span class="pdf-bold">${report.electrodeARemplacee || report.remplaceElectrodeA || snapshot.remplaceElectrodeA || 'Non'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Sélection de l'électrode remplacée :</span> <span class="pdf-bold">${selElectrodeA || ''}</span></div>

                ${!pdfHideElectrodeSecoursA ? `
                <div class="pdf-line"><span class="pdf-label">Électrode A Secours remplacée :</span> <span class="pdf-bold">${report.electrodeASecoursRemplacee || report.remplaceElectrodeSecoursA || snapshot.remplaceElectrodeSecoursA || 'Non'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Sélection de l'électrode Secours A remplacée :</span> <span class="pdf-bold">${selElectrodeASecours || ''}</span></div>
                ` : ''}

                <div class="pdf-line"><span class="pdf-label">Électrode A conforme et fonctionnelle :</span> <span class="pdf-bold">${report.electrodeAConformeSante || snapshot.electrodeAConformeSante || report.conforme || snapshot.conforme || 'Oui'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Commentaire :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireElectrodeA || ''}</span></div>
              </div>
            </div>

            <!-- SECTION 5 -->
            <div class="pdf-card">
              <div class="pdf-card-header">5 — Électrode Pédiatrique (P).</div>
              <div class="pdf-card-body">
                <div class="pdf-line"><span class="pdf-label">Modèle d'électrode P :</span> <span class="pdf-bold">${electrodePModelName || ''}</span></div>
                ${isVisibleLotP ? `<div class="pdf-line"><span class="pdf-label">Lot P :</span> <span class="pdf-bold">${snapshot.lotElectrodeP || ''}</span></div>` : ''}
                ${isVisiblePeremptionPadPakP ? `<div class="pdf-line"><span class="pdf-label">Péremption :</span> <span class="pdf-bold">${snapshot.peremptionElectrodeP || ''}</span></div>` : ''}

                <div class="pdf-line"><span class="pdf-label">Modèle électrode secours :</span> <span class="pdf-bold">${electrodePSecoursModelName || 'Aucun'}</span></div>
                ${isVisibleLotP ? `<div class="pdf-line"><span class="pdf-label">Lot de secours :</span> <span class="pdf-bold">${snapshot.lotElectrodePSecours || snapshot.lotElectrodeSecoursP || ''}</span></div>` : ''}
                ${isVisiblePeremptionPadPakP ? `<div class="pdf-line"><span class="pdf-label">Péremption de secours :</span> <span class="pdf-bold">${snapshot.peremptionSecoursElectrodeP || snapshot.peremptionElectrodeSecoursP || ''}</span></div>` : ''}

                <div class="pdf-line"><span class="pdf-label">Électrode P remplacée :</span> <span class="pdf-bold">${report.electrodePRemplacee || report.remplaceElectrodeP || snapshot.remplaceElectrodeP || 'Non'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Sélection de l'électrode remplacée :</span> <span class="pdf-bold">${selElectrodeP || ''}</span></div>

                ${!pdfHideElectrodeSecoursP ? `
                <div class="pdf-line"><span class="pdf-label">Électrode P Secours remplacée :</span> <span class="pdf-bold">${report.electrodePSecoursRemplacee || report.remplaceElectrodeSecoursP || snapshot.remplaceElectrodeSecoursP || 'Non'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Sélection de l'électrode Secours P remplacée :</span> <span class="pdf-bold">${selElectrodePSecours || ''}</span></div>
                ` : ''}

                <div class="pdf-line"><span class="pdf-label">Électrode P conforme et fonctionnelle :</span> <span class="pdf-bold">${report.electrodePConformeSante || snapshot.electrodePConformeSante || report.conforme || snapshot.conforme || 'Oui'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Commentaire concernant l’électrode P :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireElectrodeP || ''}</span></div>
              </div>
            </div>
          </div>

          ${renderFooter(3, totalPages)}
        </div>

        <!-- PAGE 4 -->
        <div class="pdf-page">
          ${renderHeader()}

          <div class="pdf-grid">
            <!-- SECTION 6 -->
            <div class="pdf-card">
              <div class="pdf-card-header">6 — Coffret.</div>
              <div class="pdf-card-body">
                <div class="pdf-line"><span class="pdf-label">Modèle de boîtier :</span> <span class="pdf-bold">${coffretModelName || ''}</span></div>
                <div class="pdf-line"><span class="pdf-label">Lot de boîtier :</span> <span class="pdf-bold">${snapshot.numeroLotCoffret || ''}</span></div>
                ${!pdfSimplifyCoffret ? `
                <div class="pdf-line"><span class="pdf-label">Équipé d’une alarme :</span> <span class="pdf-bold">${report.equipeAlarme || snapshot.equipeAlarme || 'Oui'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Alarme fonctionnelle :</span> <span class="pdf-bold">${report.alarme || snapshot.alarme || snapshot.alarmeCoffret || 'Oui'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Dispositif d’armoire connectée :</span> <span class="pdf-bold">${report.armoireConnectee || snapshot.armoireConnectee || 'Non'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Dispositif handicap :</span> <span class="pdf-bold">${report.dispositifHandicap || snapshot.dispositifHandicap || 'Non'}</span></div>
                ` : ''}
                <div class="pdf-line"><span class="pdf-label">Signalétique conforme :</span> <span class="pdf-bold">${report.signaletiqueConforme || snapshot.signaletiqueConforme || snapshot.signaletiqueBoitier || 'Oui'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Installé en extérieur :</span> <span class="pdf-bold">${report.installeExterieur || snapshot.installeExterieur || (report.exterieur !== undefined ? (report.exterieur ? 'Oui' : 'Non') : '') || (snapshot.exterieur !== undefined ? (snapshot.exterieur ? 'Oui' : 'Non') : '') || 'Non'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Commentaire :</span> <span class="pdf-bold" style="white-space: pre-line;">${snapshot.commentaireCoffret || ''}</span></div>
              </div>
            </div>

            <!-- SECTION 7 -->
            <div class="pdf-card">
              <div class="pdf-card-header">7 — Vérifications du kit de secours.</div>
              <div class="pdf-card-body" style="gap: 3px;">
                <div class="pdf-line"><span class="pdf-label">Trousse de secours présente :</span> <span class="pdf-bold">${report.kitTrousseSecoursPresent || snapshot.kitTrousseSecoursPresent || 'Oui'}</span></div>
                ${isVisiblePeremptionTrousse ? `<div class="pdf-line"><span class="pdf-label">Péremption de la trousse :</span> <span class="pdf-bold">${report.kitPeremption || report.peremptionKit || snapshot.peremptionTrousse || snapshot.peremptionKit || ''}</span></div>` : ''}
                <div class="pdf-line"><span class="pdf-label">Kit de secours remplacé ou ajouté :</span> <span class="pdf-bold">${report.kitSecoursRemplaceOuAjoute || report.remplaceKit || snapshot.remplaceKit || 'Non'}</span></div>
                <div class="pdf-line"><span class="pdf-label">Sélection d’un kit de secours :</span> <span class="pdf-bold">${selKitSecours || ''}</span></div>
                ${!pdfHideKitSecours ? `
                ${isVisibleCiseauxPresents ? `<div class="pdf-line"><span class="pdf-label">Ciseaux présents :</span> <span class="pdf-bold">${report.kitCiseauxPresents || report.kitCiseaux || snapshot.kitCiseauxPresents || 'Oui'}</span></div>` : ''}
                ${isVisibleMasquePresent ? `<div class="pdf-line"><span class="pdf-label">Masque présent :</span> <span class="pdf-bold">${report.kitMasquePresent || report.kitMasque || snapshot.kitMasquePresent || 'Oui'}</span></div>` : ''}
                ${isVisibleMasquePresent && isVisiblePeremptionMasque ? `<div class="pdf-line"><span class="pdf-label">Péremption du masque :</span> <span class="pdf-bold">${report.kitPeremptionMasque || snapshot.kitPeremptionMasque || report.kitPeremption || snapshot.peremptionTrousse || ''}</span></div>` : ''}
                ${isVisibleServiettesPresentes ? `<div class="pdf-line"><span class="pdf-label">Serviettes présentes :</span> <span class="pdf-bold">${report.kitServiettesPresentes || report.kitCompresses || snapshot.kitServiettesPresentes || 'Oui'}</span></div>` : ''}
                ${isVisibleServiettesPresentes && isVisiblePeremptionServiettes ? `<div class="pdf-line"><span class="pdf-label">Péremption des serviettes :</span> <span class="pdf-bold">${report.kitPeremptionServiettes || snapshot.kitPeremptionServiettes || report.kitPeremption || snapshot.peremptionTrousse || ''}</span></div>` : ''}
                ${isVisibleGantsPresents ? `<div class="pdf-line"><span class="pdf-label">Paires de gants présents :</span> <span class="pdf-bold">${report.kitGantsPresents || report.kitGants || snapshot.kitGantsPresents || 'Oui'}</span></div>` : ''}
                ${isVisibleRasoir ? `<div class="pdf-line"><span class="pdf-label">Rasoir :</span> <span class="pdf-bold">${report.kitRasoirPresent || report.kitRasoir || snapshot.kitRasoirPresent || 'Oui'}</span></div>` : ''}
                ` : ''}
              </div>
            </div>
          </div>

          ${renderFooter(4, totalPages)}
        </div>

        <!-- PAGE 5 -->
        <div class="pdf-page">
          ${renderHeader()}

          <div class="pdf-grid">
            <!-- SECTION 8 -->
            <div class="pdf-card">
              <div class="pdf-card-header">8 — Diagnostic et clôture.</div>
              <div class="pdf-card-body" style="display: flex; flex-direction: column; gap: 6px;">
                <div class="pdf-line">
                  <span class="pdf-label">Défibrillateur conforme et prêt à l’usage :</span> <span class="pdf-bold">${(snapshot.conforme === 'Non' || report.conforme === 'Non') ? 'Non' : 'Oui'}</span>
                </div>
                ${!pdfHideHorodatagesDiagnostic ? `
                <div class="pdf-line" style="margin-top: 15px;">
                  <span class="pdf-label">Horodatage entrant :</span> <span class="pdf-bold">${report.date || '-'}</span>
                </div>
                <div class="pdf-line">
                  <span class="pdf-label">Horodatage clôture :</span> <span class="pdf-bold">${report.endTimeStamp || snapshot.endTimeStamp || '-'}</span>
                </div>
                <div class="pdf-line">
                  <span class="pdf-label">Durée :</span> <span class="pdf-bold">${computeDurationText(report.date, report.endTimeStamp || snapshot.endTimeStamp)}</span>
                </div>
                ` : ''}
                ${(pdfShowDemandeDevisDetails && (report.demandeDevis === true || report.demandeDevis === 'Oui' || snapshot.demandeDevis === true || snapshot.demandeDevis === 'Oui')) ? `
                <div class="pdf-line" style="margin-top: 10px;">
                  <span class="pdf-label">Demande de devis :</span> <span class="pdf-bold">Oui</span>
                </div>
                <div class="pdf-line">
                  <span class="pdf-label">Priorité :</span> <span class="pdf-bold">${report.devisPriorite || snapshot.devisPriorite || 'Moyenne'}</span>
                </div>
                <div class="pdf-line">
                  <span class="pdf-label">Pièce(s) / Service(s) demandé(s) :</span>
                  <span class="pdf-bold">${
                    (Array.isArray(report.devisArticlesSelectionnes) && report.devisArticlesSelectionnes.length > 0)
                      ? report.devisArticlesSelectionnes.join(', ')
                      : (Array.isArray(snapshot.devisArticlesSelectionnes) && snapshot.devisArticlesSelectionnes.length > 0)
                      ? snapshot.devisArticlesSelectionnes.join(', ')
                      : (report.motifDemandeDevis || snapshot.motifDemandeDevis || report.devisAutreInfo || snapshot.devisAutreInfo || report.descriptionDemandeDevis || snapshot.descriptionDemandeDevis || 'Aucun')
                  }</span>
                </div>
                ` : ''}
                <div class="pdf-line" style="margin-top: 15px;">
                  <span class="pdf-label">Commentaire :</span> <span class="pdf-bold" style="white-space: pre-line;">${report.diagnosticCommentaire || snapshot.commentaire || report.defibSnapshot?.commentaire || '-'}</span>
                </div>
                <div class="pdf-line" style="margin-top: 6px;">
                  <span class="pdf-label">Fichier(s) :</span>
                  <span class="pdf-bold">
                    ${report.attachments && report.attachments.length > 0
                      ? report.attachments.map((file: any) => `<a href="${file.url}" target="_blank" style="color: #772a7e; text-decoration: underline; margin-right: 8px;">${file.name}</a>`).join(', ')
                      : (report.pieceJointeDevisName || snapshot.pieceJointeDevisName || '-')}
                  </span>
                </div>
                <div class="pdf-line" style="margin-top: 6px; margin-bottom: 4px;">
                  <span class="pdf-label">Technicien :</span> <span class="pdf-bold">${report.techName || '-'}</span>
                </div>

                <div style="display: flex; flex-direction: row; gap: 20px; width: 100%; padding-top: 8px; margin-top: 4px;">
                  ${isVisiblePiecesJointes ? `
                  <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                    <div class="pdf-line" style="font-size: 16px; font-weight: bold !important;">Photographies de l'intervention.</div>

                    ${(report.photoUrl || snapshot.photoUrl) ? `
                      <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                        <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                          <img src="${report.photoUrl || snapshot.photoUrl}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo" referrerPolicy="no-referrer" crossorigin="anonymous" />
                        </div>
                        <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie globale du défibrillateur.</span>
                      </div>
                    ` : ''}

                    ${(report.photoArriereUrl || report.photo2Url || snapshot.photo2Url) ? `
                      <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                        <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                          <img src="${report.photoArriereUrl || report.photo2Url || snapshot.photo2Url}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Arrière" referrerPolicy="no-referrer" crossorigin="anonymous" />
                        </div>
                        <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Photographie arrière / étiquette.</span>
                      </div>
                    ` : ''}

                    ${(report.photoResultatTestUrl || report.photo3Url || snapshot.photo3Url) ? `
                      <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                        <div style="border: none; border-radius: 11px; overflow: hidden; background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 100px; max-width: 200px;">
                          <img src="${report.photoResultatTestUrl || report.photo3Url || snapshot.photo3Url}" style="max-height: 100px; border-radius: 11px; max-width: 200px; object-fit: contain;" alt="Photo Resultat Test" referrerPolicy="no-referrer" crossorigin="anonymous" />
                        </div>
                        <span class="pdf-label" style="font-size: 8px; color: #000000; font-family: 'Civilprom', sans-serif !important;">Résultat du test.</span>
                      </div>
                    ` : ''}
                  </div>
                  ` : ''}

                  <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    ${(() => {
                      const buildSvgSig = (label: string) => {
                        const safe = String(label || 'Signé').replace(/[<>&"']/g, '').trim() || 'Signé';
                        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70" viewBox="0 0 220 70"><text x="10" y="42" font-family="Brush Script MT, Segoe Script, Apple Chancery, cursive, sans-serif" font-size="26" font-style="italic" fill="#0f172a">${safe}</text><path d="M 10 52 Q 95 44 195 54" stroke="#0f172a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
                        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
                      };
                      const tName = String(report.techName || report.technicien || snapshot.techName || '').trim();
                      const matchedM =
                        (members || []).find((m: any) =>
                          tName &&
                          ((m.name && m.name.trim().toLowerCase() === tName.toLowerCase()) ||
                           (m.email && m.email.trim().toLowerCase() === tName.toLowerCase()))
                        ) || (members || []).find((m: any) => m.signature && String(m.signature).startsWith('data:image'));
                      let tSig =
                        report.techSignature ||
                        snapshot.techSignature ||
                        matchedM?.signature ||
                        '';
                      if (!tSig && typeof window !== 'undefined') {
                        try {
                          for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i) || '';
                            if (k.includes('_tech_signature_')) {
                              const v = localStorage.getItem(k) || '';
                              if (v.startsWith('data:image')) {
                                tSig = v;
                                break;
                              }
                            }
                          }
                        } catch (_) {}
                      }
                      if (!tSig && tName) {
                        tSig = buildSvgSig(tName);
                      }
                      if (!tSig) return '';
                      return `
                        <div class="pdf-line" style="font-size: 16px;">Signature technicien.</div>
                        <div style="background: transparent; display: flex; justify-content: flex-start; align-items: center; max-height: 60px; max-width: 150px;">
                          <img src="${tSig}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature" crossorigin="anonymous" />
                        </div>
                      `;
                    })()}
                  </div>

                  <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    ${(() => {
                      const rawClientSig = String(report.clientPinCode || snapshot.clientPinCode || '').trim();
                      const isSigImg = rawClientSig.startsWith('data:image') || rawClientSig.startsWith('http');
                      let sigImgUrl =
                        (isSigImg ? rawClientSig : '') ||
                        (clientFound && (clientFound.clientSignatureImage || (clientFound as any).signatureClientContratImage || (clientFound as any).signatureClient)) ||
                        report.clientSignatureImage ||
                        report.signatureClientContratImage ||
                        snapshot.clientSignatureImage ||
                        snapshot.signatureClientContratImage ||
                        '';
                      if (
                        sigImgUrl &&
                        (sigImgUrl.startsWith('data:image/svg+xml') ||
                          decodeURIComponent(sigImgUrl).toLowerCase().includes('représentant standard') ||
                          decodeURIComponent(sigImgUrl).toLowerCase().includes('representant standard'))
                      ) {
                        sigImgUrl = '';
                      }
                      const pinCodeVal = !isSigImg ? rawClientSig : '';
                      return `
                        <div class="pdf-line" style="font-size: 16px;">Signature client.</div>
                        ${pinCodeVal ? `
                          <div style="font-size: 13px; margin-bottom: 2px; color: #000000; font-family: 'DefibeoMain', 'Civilprom', sans-serif !important; font-weight: 100 !important;">
                            <span style="font-size: 13px; color: #000000; font-family: 'DefibeoMain', 'Civilprom', sans-serif !important; font-weight: 100 !important;">Code validation: ${pinCodeVal}</span>
                          </div>
                        ` : ''}
                        ${sigImgUrl ? `
                          <div style="background: transparent; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; max-height: 80px; max-width: 150px; margin-top: 4px;">
                            <img src="${sigImgUrl}" style="max-height: 55px; max-width: 150px; object-fit: contain;" alt="Signature Client" crossorigin="anonymous" />
                          </div>
                        ` : ''}
                      `;
                    })()}
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
            ${renderHeader()}
            <div class="pdf-grid" style="display: flex; flex-direction: column; justify-content: flex-start;">
              <div class="pdf-card" style="display: flex; flex-direction: column;">
                <div class="pdf-card-header" style="font-weight: bold !important; margin-bottom: 10px;">
                  Informations complémentaires
                </div>
                <div class="pdf-card-body" style="font-size: 15px; color: #000000; white-space: pre-line; line-height: 1.5;">
                  ${pdfLastPageInfoText}
                </div>
              </div>
            </div>
            ${renderFooter(6, totalPages)}
          </div>
        ` : ''}
      </div>

      ${autoPrintScript}
    </body>
    </html>
  `;
}

/**
 * Renders the exact multi-page A4 HTML report from LOGICIEL PRINCIPAL > RAPPORTS PDF > Télécharger
 * into a multi-page PDF binary and directly downloads it without opening a new tab.
 */
export async function downloadOfficialReportPdfDirectly(
  params: OfficialReportBuildParams,
  fileName: string
): Promise<void> {
  const htmlContent = buildOfficialReportHtml({ ...params, autoPrint: false });

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Could not access offscreen iframe document');
    }

    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    // Wait for fonts and images to load inside iframe
    await new Promise<void>(resolve => {
      const checkReady = async () => {
        try {
          if ((iframeDoc as any).fonts && (iframeDoc as any).fonts.ready) {
            await Promise.race([
              (iframeDoc as any).fonts.ready,
              new Promise(r => setTimeout(r, 1200)),
            ]);
          }
        } catch (_) {}

        const imgs = Array.from(iframeDoc.querySelectorAll('img'));
        await Promise.all(
          imgs.map(
            img =>
              new Promise<void>(imgResolve => {
                if (img.complete) {
                  imgResolve();
                  return;
                }
                const timer = setTimeout(() => imgResolve(), 1500);
                img.onload = () => {
                  clearTimeout(timer);
                  imgResolve();
                };
                img.onerror = () => {
                  clearTimeout(timer);
                  imgResolve();
                };
              })
          )
        );
        setTimeout(() => resolve(), 150);
      };

      if (iframeDoc.readyState === 'complete') {
        checkReady();
      } else {
        iframe.onload = () => checkReady();
        setTimeout(() => checkReady(), 800);
      }
    });

    const pages = Array.from(iframeDoc.querySelectorAll('.pdf-page')) as HTMLElement[];
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const targets = pages.length > 0 ? pages : [iframeDoc.body];

    for (let i = 0; i < targets.length; i++) {
      const pageEl = targets[i];
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        width: pageEl.offsetWidth || 794,
        height: pageEl.offsetHeight || 1123,
        windowWidth: pageEl.offsetWidth || 794,
        windowHeight: pageEl.offsetHeight || 1123,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    const pdfArrayBuffer = pdf.output('arraybuffer');
    const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
  } finally {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}
