import { jsPDF } from 'jspdf';
import { Defibrillateur, Client, Variable, CompanyInfo } from '../types';
import { formatDateToFR, computeProchaineMaintenance } from '../utils';

interface ColumnDef {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
}

// Columns definition for A4 Landscape (total = 287 mm, spanning page width 297 mm with 5 mm margins)
// Each header strictly ends with a dot '.' as requested by the user and styled in the table view
const COLUMNS: ColumnDef[] = [
  { header: 'Identifiant.', width: 25, bold: true },
  { header: 'N° Série.', width: 22 },
  { header: 'Modèle.', width: 25 },
  { header: 'Client.', width: 28 },
  { header: 'Nom du site.', width: 26 },
  { header: 'Contrat.', width: 24 },
  { header: 'Localisation.', width: 25 },
  { header: 'Garantie.', width: 17, align: 'center' },
  { header: 'Pro. visite.', width: 17, align: 'center' },
  { header: 'Péremption A.', width: 19, align: 'center' },
  { header: 'Péremption P.', width: 19, align: 'center' },
  { header: 'Péremption B.', width: 19, align: 'center' },
  { header: 'Tournée.', width: 21 },
];

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
 * Draws a 100% native vector table cell with white background and crisp vector border.
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
  paddingX = 1.2
) {
  // Pure white vector background as requested (headers and value cells)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225); // #cbd5e1 subtle slate border
  doc.setLineWidth(0.2); // Vector stroke
  doc.rect(x, y, width, height, 'FD');

  // Vector typography (100% vector, laser sharp at any zoom level)
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42); // #0f172a

  const maxW = Math.max(1, width - paddingX * 2);
  const renderedText = truncateVectorText(doc, text, maxW);
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

  const clientMap = new Map(clients.map(c => [c.id, c]));
  const variableMap = new Map(variables.map(v => [v.id, v]));

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
  const subtitleText = `Export Matériel(s) Le ${dateFormatted}`;

  // Build rows data
  const rowsData: string[][] = selectedDefibs.map((df) => {
    const linkedClient = clientMap.get(df.clientId);
    const linkedModel = variableMap.get(df.modeleId);

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
    const locParts = [df.ville, df.cp].filter(Boolean);
    const locStr = locParts.length > 0 ? locParts.join(', ') : (df.numVoie || '-');

    // Dates
    const prochaineMaint = computeProchaineMaintenance(df.derniereMaintenance);
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
      linkedModel?.nom || df.modeleId || '-',
      linkedClient?.denomination || '-',
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

      // Subtitle: Export Matériel(s) Le dd/mm/yyyy
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(0, 0, 0);
      doc.text(subtitleText, textLeft, 12, { baseline: 'middle' });

      tableStartY = page1StartY;
    }

    // 1. Draw Table Header (Pure white background + trailing dot '.' on each header)
    let headerX = marginX;
    for (const col of COLUMNS) {
      // Ensure header ends with a dot
      const headerTitle = col.header.endsWith('.') ? col.header : `${col.header}.`;
      drawVectorCell(doc, headerTitle, headerX, tableStartY, col.width, HEADER_HEIGHT, col.align || 'left', true);
      headerX += col.width;
    }

    // 2. Draw Table Rows (Pure white background for all cells)
    for (let rIdx = 0; rIdx < chunk.rows.length; rIdx++) {
      const row = chunk.rows[rIdx];
      const rowY = tableStartY + HEADER_HEIGHT + rIdx * ROW_HEIGHT;

      let cellX = marginX;
      for (let cIdx = 0; cIdx < COLUMNS.length; cIdx++) {
        const col = COLUMNS[cIdx];
        const cellVal = String(row[cIdx] ?? '-');
        drawVectorCell(doc, cellVal, cellX, rowY, col.width, ROW_HEIGHT, col.align || 'left', col.bold || false);
        cellX += col.width;
      }
    }

    // 3. Footer: Pagination in pure vector black font
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`Page ${pageIdx + 1} / ${totalPages}`, 297 - marginX, 205, { align: 'right', baseline: 'bottom' });
  }

  // Save the native vector PDF
  const cleanDate = new Date().toISOString().slice(0, 10);
  const fileName = `export_materiels_${cleanDate}.pdf`;
  doc.save(fileName);
}
