import { jsPDF } from 'jspdf';
import { Defibrillateur, Client, Variable, CompanyInfo } from '../types';
import { formatDateToFR, computeProchaineMaintenance } from '../utils';

interface ColumnDef {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
}

const FONT_FAMILY = '"Civilprom", "DefibeoMain", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

async function loadTenantLogo(url?: string): Promise<HTMLImageElement | null> {
  if (!url || !url.trim()) return null;
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = objUrl;
      });
    }
  } catch {
    // Fallback to standard crossOrigin image
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

function drawCellText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: 'left' | 'center' | 'right' = 'left',
  paddingX = 14
) {
  const maxW = Math.max(10, width - paddingX * 2);
  const renderedText = truncateText(ctx, text, maxW);
  const textY = y + height / 2;

  ctx.textBaseline = 'middle';
  if (align === 'center') {
    ctx.textAlign = 'center';
    ctx.fillText(renderedText, x + width / 2, textY);
  } else if (align === 'right') {
    ctx.textAlign = 'right';
    ctx.fillText(renderedText, x + width - paddingX, textY);
  } else {
    ctx.textAlign = 'left';
    ctx.fillText(renderedText, x + paddingX, textY);
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

  // Ensure document fonts are loaded so Civilprom / DefibeoMain is applied to the Canvas
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // Continue if fonts.ready fails
    }
  }

  const clientMap = new Map(clients.map(c => [c.id, c]));
  const variableMap = new Map(variables.map(v => [v.id, v]));

  // Canvas dimensions for A4 Landscape (10px per mm => 2970 x 2100 px, ~254 DPI)
  const canvasW = 2970;
  const canvasH = 2100;
  const marginX = 50; // 5 mm (reduced page padding)
  const marginBottom = 70; // 7 mm (reduced bottom padding)
  const tableW = canvasW - marginX * 2; // 2870 px

  // Formatted date dd/mm/yyyy
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateFormatted = `${dd}/${mm}/${yyyy}`;
  const subtitleText = `Export Matériel(s) Le ${dateFormatted}`;

  // Columns definition (total 2870 px, spanning full reduced-padding table width)
  const columns: ColumnDef[] = [
    { header: 'Identifiant', width: 260, bold: true },
    { header: 'N° Série', width: 230 },
    { header: 'Modèle', width: 260 },
    { header: 'Client', width: 300 },
    { header: 'Nom du site', width: 255 },
    { header: 'Contrat', width: 275 },
    { header: 'Localisation', width: 250 },
    { header: 'Garantie', width: 170, align: 'center' },
    { header: 'Pro. visite', width: 170, align: 'center' },
    { header: 'Péremp. A', width: 160, align: 'center' },
    { header: 'Péremp. P', width: 160, align: 'center' },
    { header: 'Péremp. B', width: 160, align: 'center' },
    { header: 'Tournée', width: 220 },
  ];

  // Identical font-size for both table headers and values
  const TABLE_FONT_SIZE = 22;
  const HEADER_HEIGHT = 65;
  const ROW_HEIGHT = 58;
  const BORDER_COLOR = '#cbd5e1';
  const BORDER_WIDTH = 1;

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

  // Calculate pages
  const page1StartY = 135; // Compact header with reduced padding
  const page1AvailableH = canvasH - marginBottom - page1StartY;
  const page1MaxRows = Math.floor((page1AvailableH - HEADER_HEIGHT) / ROW_HEIGHT);

  const subsequentStartY = 50;
  const subsequentAvailableH = canvasH - marginBottom - subsequentStartY;
  const subsequentMaxRows = Math.floor((subsequentAvailableH - HEADER_HEIGHT) / ROW_HEIGHT);

  const pageRowChunks: { startIdx: number; rows: string[][]; isFirstPage: boolean }[] = [];
  let remainingRows = [...rowsData];
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
  let logoImg: HTMLImageElement | null = null;
  if (companyInfo?.logo) {
    logoImg = await loadTenantLogo(companyInfo.logo);
  }

  // Create jsPDF instance
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Render each page to an HTML Canvas
  for (let pageIdx = 0; pageIdx < pageRowChunks.length; pageIdx++) {
    const chunk = pageRowChunks[pageIdx];
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    const renderPage = (includeLogo: boolean) => {
      // White page background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);

      let tableStartY = subsequentStartY;

      if (chunk.isFirstPage) {
        // Page 1 Header: Tenant Logo and Titles with reduced top padding
        let textLeft = marginX;
        if (includeLogo && logoImg && logoImg.width > 0 && logoImg.height > 0) {
          const maxLogoW = 320;
          const maxLogoH = 85;
          let renderW = (logoImg.width / logoImg.height) * maxLogoH;
          let renderH = maxLogoH;
          if (renderW > maxLogoW) {
            renderW = maxLogoW;
            renderH = (logoImg.height / logoImg.width) * maxLogoW;
          }
          ctx.drawImage(logoImg, marginX, 35, renderW, renderH);
          textLeft = marginX + renderW + 35;
        }

        // Company Name Title
        const companyName = companyInfo?.name || 'Gestionnaire de Défibrillateurs';
        ctx.font = `bold 28px ${FONT_FAMILY}`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(companyName, textLeft, 58);

        // Subtitle: Export Matériel(s) Le dd/mm/yyyy in #000
        ctx.font = `normal 22px ${FONT_FAMILY}`;
        ctx.fillStyle = '#000000';
        ctx.fillText(subtitleText, textLeft, 95);

        // NOTE: Line divider above table is intentionally removed per user feedback!
        tableStartY = page1StartY;
      }

      // Draw Table Header
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(marginX, tableStartY, tableW, HEADER_HEIGHT);

      let headerX = marginX;
      for (const col of columns) {
        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = BORDER_WIDTH;
        ctx.strokeRect(headerX, tableStartY, col.width, HEADER_HEIGHT);

        ctx.font = `bold ${TABLE_FONT_SIZE}px ${FONT_FAMILY}`;
        ctx.fillStyle = '#0f172a';
        drawCellText(ctx, col.header, headerX, tableStartY, col.width, HEADER_HEIGHT, col.align || 'left');
        headerX += col.width;
      }

      // Draw Table Rows
      for (let rIdx = 0; rIdx < chunk.rows.length; rIdx++) {
        const row = chunk.rows[rIdx];
        const rowY = tableStartY + HEADER_HEIGHT + rIdx * ROW_HEIGHT;
        const isEven = (chunk.startIdx + rIdx) % 2 === 0;

        // Background: alternating white and clean light slate (no dark backgrounds!)
        ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
        ctx.fillRect(marginX, rowY, tableW, ROW_HEIGHT);

        let cellX = marginX;
        for (let cIdx = 0; cIdx < columns.length; cIdx++) {
          const col = columns[cIdx];
          ctx.strokeStyle = BORDER_COLOR;
          ctx.lineWidth = BORDER_WIDTH;
          ctx.strokeRect(cellX, rowY, col.width, ROW_HEIGHT);

          ctx.font = `${col.bold ? 'bold ' : 'normal '}${TABLE_FONT_SIZE}px ${FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          const cellVal = String(row[cIdx] ?? '-');
          drawCellText(ctx, cellVal, cellX, rowY, col.width, ROW_HEIGHT, col.align || 'left');

          cellX += col.width;
        }
      }

      // Footer: Tenant commercial name REMOVED per user feedback; pagination in color #000
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#000000';
      ctx.font = `normal 20px ${FONT_FAMILY}`;
      ctx.textAlign = 'right';
      ctx.fillText(`Page ${pageIdx + 1} / ${totalPages}`, canvasW - marginX, canvasH - 30);
    };

    renderPage(true);

    let imgData: string;
    try {
      imgData = canvas.toDataURL('image/jpeg', 0.95);
    } catch {
      // In case canvas was tainted by cross-origin logo, re-render without external logo
      renderPage(false);
      imgData = canvas.toDataURL('image/jpeg', 0.95);
    }

    if (pageIdx > 0) {
      doc.addPage('a4', 'landscape');
    }
    doc.addImage(imgData, 'JPEG', 0, 0, 297, 210);
  }

  // Save the generated PDF
  const cleanDate = new Date().toISOString().slice(0, 10);
  const fileName = `export_materiels_${cleanDate}.pdf`;
  doc.save(fileName);
}
