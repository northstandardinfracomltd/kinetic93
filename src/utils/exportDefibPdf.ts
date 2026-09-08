import { jsPDF } from 'jspdf';
import { Defibrillateur, Client, Variable, CompanyInfo } from '../types';
import { formatDateToFR, computeProchaineMaintenance } from '../utils';

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url || !url.trim()) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      resolve(null);
    };
    img.src = url;
  });
}

interface ColumnDef {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
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

  // Create A4 Landscape PDF
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // ~297 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // ~210 mm
  const marginX = 10;
  const marginBottom = 14;

  // Header: Tenant Logo on top-left
  let logoOffsetLeft = marginX;
  if (companyInfo?.logo) {
    try {
      const img = await loadImage(companyInfo.logo);
      if (img && img.width > 0 && img.height > 0) {
        const maxW = 38;
        const maxH = 14;
        let renderW = (img.width / img.height) * maxH;
        let renderH = maxH;
        if (renderW > maxW) {
          renderW = maxW;
          renderH = (img.height / img.width) * maxW;
        }
        doc.addImage(img, 'PNG', marginX, 8, renderW, renderH);
        logoOffsetLeft = marginX + renderW + 8;
      }
    } catch {
      // Fallback cleanly
    }
  }

  // Header Title and Info
  const companyName = companyInfo?.name || 'Gestionnaire de Défibrillateurs';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(companyName, logoOffsetLeft, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  const nowStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  doc.text(
    `Export des défibrillateurs sélectionnés — ${selectedDefibs.length} équipement(s) — Édité le ${nowStr}`,
    logoOffsetLeft,
    19
  );

  // Divider line under header
  doc.setDrawColor(218, 218, 218);
  doc.setLineWidth(0.3);
  doc.line(marginX, 25, pageWidth - marginX, 25);

  // Column definitions (total width: 277 mm, perfectly fits 297mm page with 10mm margins)
  const columns: ColumnDef[] = [
    { header: 'Identifiant', width: 25, bold: true },
    { header: 'N° Série', width: 22 },
    { header: 'Modèle', width: 25 },
    { header: 'Client', width: 28 },
    { header: 'Nom du site', width: 24 },
    { header: 'Contrat', width: 26 },
    { header: 'Localisation', width: 24 },
    { header: 'Garantie', width: 17, align: 'center' },
    { header: 'Pro. visite', width: 17, align: 'center' },
    { header: 'Péremp. A', width: 16, align: 'center' },
    { header: 'Péremp. P', width: 16, align: 'center' },
    { header: 'Péremp. B', width: 16, align: 'center' },
    { header: 'Tournée', width: 21 },
  ];

  const headerHeight = 7;
  const rowHeight = 6.2;
  let currentY = 28;

  const drawTableHeader = (y: number) => {
    let x = marginX;
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.2);

    columns.forEach((col) => {
      doc.rect(x, y, col.width, headerHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(20, 20, 20);

      const textY = y + 4.6;
      if (col.align === 'center') {
        doc.text(col.header, x + col.width / 2, textY, { align: 'center' });
      } else if (col.align === 'right') {
        doc.text(col.header, x + col.width - 2, textY, { align: 'right' });
      } else {
        doc.text(col.header, x + 2, textY);
      }
      x += col.width;
    });
  };

  // Draw initial header
  drawTableHeader(currentY);
  currentY += headerHeight;

  // Prepare table data rows
  selectedDefibs.forEach((df, index) => {
    // Check if new page is needed
    if (currentY + rowHeight > pageHeight - marginBottom) {
      doc.addPage();
      currentY = 12;
      drawTableHeader(currentY);
      currentY += headerHeight;
    }

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

    const rowValues = [
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

    // Background color (alternating rows)
    const isEven = index % 2 === 0;
    if (isEven) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(250, 251, 253);
    }

    doc.setDrawColor(228, 231, 236);
    doc.setLineWidth(0.15);

    let cellX = marginX;
    columns.forEach((col, cIdx) => {
      doc.rect(cellX, currentY, col.width, rowHeight, 'FD');

      let val = String(rowValues[cIdx] || '');
      doc.setFont('helvetica', col.bold ? 'bold' : 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(35, 45, 60);

      const maxTextWidth = col.width - 3;
      // Truncate text with ellipsis if it exceeds column width
      if (doc.getTextWidth(val) > maxTextWidth) {
        while (val.length > 3 && doc.getTextWidth(val + '…') > maxTextWidth) {
          val = val.slice(0, -1);
        }
        val += '…';
      }

      const textY = currentY + 4.2;
      if (col.align === 'center') {
        doc.text(val, cellX + col.width / 2, textY, { align: 'center' });
      } else if (col.align === 'right') {
        doc.text(val, cellX + col.width - 1.5, textY, { align: 'right' });
      } else {
        doc.text(val, cellX + 1.5, textY);
      }

      cellX += col.width;
    });

    currentY += rowHeight;
  });

  // Footers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    doc.text(
      `Page ${p} / ${totalPages}`,
      pageWidth - marginX - 16,
      pageHeight - 6
    );
    if (companyInfo?.name) {
      doc.text(companyInfo.name, marginX, pageHeight - 6);
    }
  }

  // Filename with current date
  const cleanDate = new Date().toISOString().slice(0, 10);
  const fileName = `defibrillateurs_selection_${cleanDate}.pdf`;
  doc.save(fileName);
}
