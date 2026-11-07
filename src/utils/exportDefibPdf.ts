import { jsPDF } from 'jspdf';
import { Defibrillateur, Client, Variable, CompanyInfo } from '../types';
import { formatDateToFR, computeProchaineMaintenance } from '../utils';

interface ColumnDef {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  noTruncate?: boolean;
}

// Base columns definition for A4 Landscape (total = 287 mm, spanning page width 297 mm with 5 mm margins)
// Each header strictly ends with a dot '.' as requested by the user and styled in the table view
const BASE_COLUMNS: ColumnDef[] = [
  { header: 'Identifiant.', width: 22, bold: true },
  { header: 'N° Série.', width: 27, noTruncate: true },
  { header: 'Modèle.', width: 24 },
  { header: 'Client.', width: 26 },
  { header: 'Nom du site.', width: 24 },
  { header: 'Contrat.', width: 23 },
  { header: 'Localisation.', width: 23 },
  { header: 'Garantie.', width: 18, align: 'center' },
  { header: 'Pro. visite.', width: 18, align: 'center' },
  { header: 'Péremption A.', width: 21, align: 'center', noTruncate: true },
  { header: 'Péremption P.', width: 21, align: 'center', noTruncate: true },
  { header: 'Péremption B.', width: 21, align: 'center', noTruncate: true },
  { header: 'Tournée.', width: 19 },
];

const isPlaceholderClientVal = (val?: string | null): boolean => {
  if (!val) return true;
  const s = String(val).trim().toLowerCase();
  return (
    !s ||
    s === '-' ||
    s === '—' ||
    s === 'n/a' ||
    s === 'na' ||
    s === 'null' ||
    s === 'undefined' ||
    s === 'aucun' ||
    s === 'inconnu' ||
    s === 'non renseigné' ||
    s === 'non renseigne'
  );
};

async function loadTenantLogoData(url?: string): Promise<{ dataUrl: string; width: number; height: number; format: 'PNG' | 'JPEG' } | null> {
  if (!url || !url.trim()) return null;

  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const img = new Image();
          img.onload = () => {
            const format = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            resolve({
              dataUrl,
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
              format,
            });
          };
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // Continue with fallback
  }

  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({
              dataUrl,
              width: canvas.width,
              height: canvas.height,
              format: 'PNG',
            });
            return;
          }
        } catch {
          // Cross-origin tainted canvas
        }
        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
}

/**
 * Truncates text with an ellipsis if it exceeds the maximum vector width in mm.
 */
function truncateVectorText(doc: jsPDF, text: string, maxW: number): string {
  if (!text) return '-';
  if (doc.getTextWidth(text) <= maxW) return text;

  let truncated = text;
  const ellipsis = '…';
  while (truncated.length > 1 && doc.getTextWidth(truncated + ellipsis) > maxW) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + ellipsis;
}

/**
 * Draws a 100% native vector table cell with white background and crisp black vector border.
 */
function drawVectorCell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: 'left' | 'center' | 'right' = 'left',
  bold = false,
  noTruncate = false,
  paddingX = 1.2
) {
  // Pure white vector background and pure black border as requested
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(x, y, width, height, 'FD');

  // Vector typography (100% vector, laser sharp at any zoom level)
  const baseFontSize = 7.2;
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(0, 0, 0);

  const safeText = text || '-';
  const maxW = Math.max(1, width - paddingX * 2);
  let renderedText = safeText;

  if (noTruncate) {
    // Never truncate with '…'; scale font size down slightly if needed so full value fits
    let fontSize = baseFontSize;
    while (fontSize > 4.5 && doc.getTextWidth(renderedText) > maxW) {
      fontSize -= 0.2;
      doc.setFontSize(fontSize);
    }
  } else {
    renderedText = truncateVectorText(doc, safeText, maxW);
  }

  const textY = y + height / 2;

  if (align === 'center') {
    doc.text(renderedText, x + width / 2, textY, { align: 'center', baseline: 'middle' });
  } else if (align === 'right') {
    doc.text(renderedText, x + width - paddingX, textY, { align: 'right', baseline: 'middle' });
  } else {
    doc.text(renderedText, x + paddingX, textY, { align: 'left', baseline: 'middle' });
  }
}

export async function exportSelectedDefibsToPDF({
  selectedDefibs,
  clients,
  variables,
  companyInfo,
  fsmTours = [],
}: {
  selectedDefibs: Defibrillateur[];
  clients: Client[];
  variables: Variable[];
  companyInfo?: CompanyInfo;
  fsmTours?: any[];
}) {
  if (!selectedDefibs || selectedDefibs.length === 0) return;

  // Multi-key client lookup map (matches DefibTab.tsx getLinkedClientForDefib)
  const clientMap = new Map<string, Client>();
  for (const c of clients || []) {
    if (!c) continue;
    if (c.id && !isPlaceholderClientVal(c.id)) {
      clientMap.set(c.id, c);
      clientMap.set(c.id.trim().toLowerCase(), c);
    }
    if (c.clientIdField && !isPlaceholderClientVal(c.clientIdField)) {
      const cif = c.clientIdField.trim();
      clientMap.set(cif, c);
      clientMap.set(cif.toLowerCase(), c);
    }
    if (c.siret && !isPlaceholderClientVal(c.siret)) {
      clientMap.set(`siret:${c.siret.trim().toLowerCase()}`, c);
    }
    if (c.denomination && c.denomination.trim()) {
      const denomKey = c.denomination.trim().toLowerCase();
      clientMap.set(denomKey, c);
      const normDenomKey = denomKey
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&#0*39;/g, "'")
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (normDenomKey) {
        clientMap.set(normDenomKey, c);
      }
    }
    if ((c as any).nomSite && String((c as any).nomSite).trim()) {
      clientMap.set(String((c as any).nomSite).trim().toLowerCase(), c);
    }
  }

  const getLinkedClientForDefib = (df: any): Client | undefined => {
    if (!df) return undefined;
    const rawId = String(df.clientId || '').trim();
    if (rawId && !isPlaceholderClientVal(rawId)) {
      const byId = clientMap.get(rawId) || clientMap.get(rawId.toLowerCase());
      if (byId) return byId;
    }
    const rawField = String(df.clientIdField || '').trim();
    if (rawField && !isPlaceholderClientVal(rawField)) {
      const byField = clientMap.get(rawField) || clientMap.get(rawField.toLowerCase());
      if (byField) return byField;
    }
    if (df.clientNom && String(df.clientNom).trim()) {
      const rawNom = String(df.clientNom).trim().toLowerCase();
      const byNom = clientMap.get(rawNom);
      if (byNom) return byNom;
      const normNom = rawNom
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&#0*39;/g, "'")
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (normNom && clientMap.has(normNom)) return clientMap.get(normNom);
    }
    if (rawId && !isPlaceholderClientVal(rawId)) {
      const bySiret = clientMap.get(`siret:${rawId.toLowerCase()}`);
      if (bySiret) return bySiret;
    }
    if (rawField && !isPlaceholderClientVal(rawField)) {
      const bySiret = clientMap.get(`siret:${rawField.toLowerCase()}`);
      if (bySiret) return bySiret;
    }
    if (df.nomSite && String(df.nomSite).trim()) {
      const rawSite = String(df.nomSite).trim().toLowerCase();
      const bySite = clientMap.get(rawSite);
      if (bySite) return bySite;
      const normSite = rawSite
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&#0*39;/g, "'")
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (normSite && clientMap.has(normSite)) return clientMap.get(normSite);
    }
    return undefined;
  };

  // Multi-key variable lookup map
  const variableMap = new Map<string, Variable>();
  for (const v of variables || []) {
    if (!v) continue;
    if (v.id) variableMap.set(v.id, v);
    if (v.identifiant) variableMap.set(v.identifiant.trim(), v);
    if (v.nom) variableMap.set(v.nom.trim(), v);
  }

  // A4 Landscape geometry in mm
  const marginX = 5; // 5 mm margin left & right
  const page1StartY = 16; // Table starts at 16 mm on Page 1
  const subsequentStartY = 7; // Table starts at 7 mm on subsequent pages
  const HEADER_HEIGHT = 7.2; // mm
  const ROW_HEIGHT = 6.4; // mm
  const maxContentBottomY = 201; // mm (leaves 9 mm for footer pagination)

  // Formatted date dd/mm/yyyy
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateFormatted = `${dd}/${mm}/${yyyy}`;

  // Build rows data
  const rowsData: string[][] = selectedDefibs.map((df) => {
    const linkedClient = getLinkedClientForDefib(df);
    const rawModelKey = String(df.modeleId || (df as any).modele || '').trim();
    const linkedModel = variableMap.get(rawModelKey);

    // Client display value
    const clientDisplay =
      linkedClient?.denomination ||
      (df.clientNom && !isPlaceholderClientVal(df.clientNom) ? df.clientNom : '') ||
      (df.clientId && !isPlaceholderClientVal(df.clientId) && !String(df.clientId).startsWith('cli-') ? df.clientId : '') ||
      '-';

    // Contrat label
    const activeContrat = linkedClient ? linkedClient.contrat : df.contrat;
    const activeNomContrat = linkedClient
      ? (linkedClient.nomContrat === 'Sans contrat de maintenance' ? '' : linkedClient.nomContrat)
      : df.nomContrat;
    const activeFinContrat = linkedClient ? linkedClient.finContrat : df.finContrat;
    let contratStr = '-';
    if (activeContrat === 'Oui') {
      contratStr = `Oui${activeNomContrat ? ` (${activeNomContrat})` : ''}${activeFinContrat ? ` exp. ${formatDateToFR(activeFinContrat)}` : ''}`;
    } else if (activeContrat) {
      contratStr = activeContrat;
    }

    // Localisation
    const locParts = [df.ville, df.cp || (df as any).codePostal].filter(Boolean);
    const locStr = locParts.length > 0 ? locParts.join(', ') : (df.numVoie || (df as any).numeroVoie || '-');

    // Dates
    const prochaineMaint =
      (df as any).prochaineMaintenance ||
      (df as any).prochaine_visite ||
      (df as any).prochaine_v ||
      computeProchaineMaintenance(df.derniereMaintenance);
    const finGarantie = formatDateToFR(df.finGarantie) || '-';
    const proVisite = formatDateToFR(prochaineMaint) || '-';
    const perempA = formatDateToFR(df.peremptionElectrodeA) || '-';
    const perempP = formatDateToFR(df.peremptionElectrodeP) || '-';
    const perempB = formatDateToFR(df.peremptionBatterie) || '-';

    // Tournée
    const matchingTours = (fsmTours || []).filter((t: any) =>
      t.missions?.some((m: any) => m.defibIdentifiant === df.identifiant)
    );
    let tourneeStr = '-';
    if (matchingTours.length > 0) {
      const latestTour = matchingTours[matchingTours.length - 1];
      const matchMission = latestTour.missions?.find((m: any) => m.defibIdentifiant === df.identifiant);
      const isRejected = matchMission && matchMission.status !== 'Effectué' && matchMission.rejectionReason;
      if (isRejected) {
        tourneeStr = `Non fait : ${latestTour.title || 'Tournée'}`;
      } else {
        tourneeStr = `${latestTour.title || 'Tournée'}${latestTour.status ? ` (${latestTour.status})` : ''}`;
      }
    }

    return [
      df.identifiant || '-',
      df.numeroSerie || '-',
      linkedModel?.nom || rawModelKey || '-',
      clientDisplay,
      df.nomSite || '-',
      contratStr,
      locStr,
      finGarantie,
      proVisite,
      perempA,
      perempP,
      perempB,
      tourneeStr,
    ];
  });

  // Calculate row capacity per page
  const page1AvailableH = maxContentBottomY - page1StartY;
  const page1MaxRows = Math.floor((page1AvailableH - HEADER_HEIGHT) / ROW_HEIGHT);

  const subsequentAvailableH = maxContentBottomY - subsequentStartY;
  const subsequentMaxRows = Math.floor((subsequentAvailableH - HEADER_HEIGHT) / ROW_HEIGHT);

  const pageRowChunks: { startIdx: number; rows: string[][]; isFirstPage: boolean }[] = [];
  const remainingRows = [...rowsData];
  let currentStartIdx = 0;

  // First page chunk
  const p1Rows = remainingRows.splice(0, page1MaxRows);
  pageRowChunks.push({ startIdx: currentStartIdx, rows: p1Rows, isFirstPage: true });
  currentStartIdx += p1Rows.length;

  // Subsequent pages chunks
  while (remainingRows.length > 0) {
    const chunk = remainingRows.splice(0, subsequentMaxRows);
    pageRowChunks.push({ startIdx: currentStartIdx, rows: chunk, isFirstPage: false });
    currentStartIdx += chunk.length;
  }

  const totalPages = pageRowChunks.length;

  // Pre-load logo if available
  let logoData: { dataUrl: string; width: number; height: number; format: 'PNG' | 'JPEG' } | null = null;
  if (companyInfo?.logo) {
    logoData = await loadTenantLogoData(companyInfo.logo);
  }

  // Create native vector jsPDF instance (Landscape A4)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Dynamically adjust N° Série. column width if any serial number is wider than the base 27 mm
  const columns: ColumnDef[] = BASE_COLUMNS.map((c) => ({ ...c }));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  let maxSerieWidthMm = columns[1].width;
  for (const row of rowsData) {
    const serieVal = String(row[1] || '-');
    const neededMm = doc.getTextWidth(serieVal) + 3.0; // 1.2mm padding each side + safety margin
    if (neededMm > maxSerieWidthMm) {
      maxSerieWidthMm = neededMm;
    }
  }
  const cappedSerieWidthMm = Math.min(48, Math.ceil(maxSerieWidthMm));
  const extraSerieMm = cappedSerieWidthMm - columns[1].width;
  if (extraSerieMm > 0) {
    columns[1].width = cappedSerieWidthMm;
    // Borrow extra mm proportionally from truncatable text columns: Modèle (2), Client (3), Nom du site (4), Contrat (5), Localisation (6)
    const donorIndices = [2, 3, 4, 5, 6];
    let remainingToBorrow = extraSerieMm;
    let pass = 0;
    while (remainingToBorrow > 0 && pass < 20) {
      for (const idx of donorIndices) {
        if (remainingToBorrow <= 0) break;
        if (columns[idx].width > 16) {
          const step = Math.min(1, remainingToBorrow);
          columns[idx].width -= step;
          remainingToBorrow -= step;
        }
      }
      pass++;
    }
  }

  // Render each page with 100% native vector graphics (no canvas flattening)
  for (let pageIdx = 0; pageIdx < pageRowChunks.length; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    const chunk = pageRowChunks[pageIdx];
    let tableStartY = subsequentStartY;

    if (chunk.isFirstPage) {
      // Page 1 Header: Tenant Logo + Company Name Title + Subtitle
      let textLeft = marginX;
      if (logoData && logoData.width > 0 && logoData.height > 0) {
        const maxLogoW = 32; // mm
        const maxLogoH = 9.5; // mm
        let renderW = (logoData.width / logoData.height) * maxLogoH;
        let renderH = maxLogoH;
        if (renderW > maxLogoW) {
          renderW = maxLogoW;
          renderH = (logoData.height / logoData.width) * maxLogoW;
        }
        try {
          doc.addImage(logoData.dataUrl, logoData.format, marginX, 3.5, renderW, renderH);
          textLeft = marginX + renderW + 3.5;
        } catch (err) {
          console.warn('Could not render logo in PDF:', err);
        }
      }

      // Company Name
      const companyName = companyInfo?.name || 'Gestionnaire de Défibrillateurs';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(0, 0, 0);
      doc.text(companyName, textLeft, 7, { baseline: 'middle' });

      // Second line: left-aligned "Export Matériel(s)" and right-aligned "Le dd/mm/yyyy"
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(0, 0, 0);
      doc.text('Export Matériel(s)', textLeft, 12, { align: 'left', baseline: 'middle' });
      doc.text(`Le ${dateFormatted}`, 297 - marginX, 12, { align: 'right', baseline: 'middle' });

      tableStartY = page1StartY;
    }

    // 1. Draw Table Header (Pure white background + trailing dot '.' on each header, never truncated)
    let headerX = marginX;
    for (const col of columns) {
      const headerTitle = col.header.endsWith('.') ? col.header : `${col.header}.`;
      drawVectorCell(doc, headerTitle, headerX, tableStartY, col.width, HEADER_HEIGHT, col.align || 'left', true, true);
      headerX += col.width;
    }

    // 2. Draw Table Rows (Pure white background for all cells)
    for (let rIdx = 0; rIdx < chunk.rows.length; rIdx++) {
      const row = chunk.rows[rIdx];
      const rowY = tableStartY + HEADER_HEIGHT + rIdx * ROW_HEIGHT;

      let cellX = marginX;
      for (let cIdx = 0; cIdx < columns.length; cIdx++) {
        const col = columns[cIdx];
        const cellVal = String(row[cIdx] ?? '-');
        drawVectorCell(
          doc,
          cellVal,
          cellX,
          rowY,
          col.width,
          ROW_HEIGHT,
          col.align || 'left',
          col.bold || false,
          col.noTruncate || false
        );
        cellX += col.width;
      }
    }

    // 3. Footer: Left-aligned "Logiciel Defibeo" and Right-aligned Pagination in pure vector black font
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Logiciel Defibeo', marginX, 205, { align: 'left', baseline: 'bottom' });
    doc.text(`Page ${pageIdx + 1} / ${totalPages}`, 297 - marginX, 205, { align: 'right', baseline: 'bottom' });
  }

  // Save the native vector PDF
  const cleanDate = new Date().toISOString().slice(0, 10);
  const fileName = `export_materiels_${cleanDate}.pdf`;
  doc.save(fileName);
}
