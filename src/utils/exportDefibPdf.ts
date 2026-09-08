import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Defibrillateur, Client, Variable, CompanyInfo } from '../types';
import { formatDateToFR, computeProchaineMaintenance } from '../utils';

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url || !url.trim()) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // If CORS fails on external image, fallback to null gracefully
      resolve(null);
    };
    img.src = url;
  });
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

  const pageWidth = doc.internal.pageSize.getWidth(); // 297 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
  const marginX = 10;
  let startY = 10;

  // Header: Tenant Logo on top-left
  let logoOffsetLeft = marginX;
  if (companyInfo?.logo) {
    try {
      const img = await loadImage(companyInfo.logo);
      if (img && img.width > 0 && img.height > 0) {
        const maxW = 42;
        const maxH = 15;
        let renderW = (img.width / img.height) * maxH;
        let renderH = maxH;
        if (renderW > maxW) {
          renderW = maxW;
          renderH = (img.height / img.width) * maxW;
        }
        doc.addImage(img, 'PNG', marginX, 10, renderW, renderH);
        logoOffsetLeft = marginX + renderW + 8;
      }
    } catch {
      // Ignore logo error, keep clean layout
    }
  }

  // Header Title and Info
  const companyName = companyInfo?.name || 'Gestionnaire de Défibrillateurs';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(companyName, logoOffsetLeft, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  const nowStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  doc.text(
    `Export des défibrillateurs sélectionnés — ${selectedDefibs.length} équipement(s) — Édité le ${nowStr}`,
    logoOffsetLeft,
    20
  );

  // Divider line
  doc.setDrawColor(218, 218, 218);
  doc.setLineWidth(0.3);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  startY = 30;

  // Prepare table headers matching the Table View
  const headers = [
    [
      'Identifiant',
      'N° Série',
      'Modèle',
      'Client',
      'Nom du site',
      'Contrat',
      'Localisation',
      'Expir. garantie',
      'Pro. visite',
      'Péremp. A',
      'Péremp. P',
      'Péremp. B',
      'Tournée',
    ],
  ];

  // Prepare table data rows
  const rows = selectedDefibs.map((df) => {
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
        tourneeStr = `Non effectué : ${latestTour.title || 'Tournée'}`;
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

  // Call autoTable to render compact landscape table
  autoTable(doc, {
    head: headers,
    body: rows,
    startY,
    margin: { left: marginX, right: marginX, bottom: 12 },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [245, 247, 250],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.2,
      lineColor: [210, 215, 225],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 26, fontStyle: 'bold' }, // Identifiant
      1: { cellWidth: 22 }, // Série
      2: { cellWidth: 24 }, // Modèle
      3: { cellWidth: 28 }, // Client
      4: { cellWidth: 24 }, // Nom du site
      5: { cellWidth: 26 }, // Contrat
      6: { cellWidth: 24 }, // Localisation
      7: { cellWidth: 17, halign: 'center' }, // Garantie
      8: { cellWidth: 17, halign: 'center' }, // Pro. visite
      9: { cellWidth: 17, halign: 'center' }, // Péremp A
      10: { cellWidth: 17, halign: 'center' }, // Péremp P
      11: { cellWidth: 17, halign: 'center' }, // Péremp B
      12: { cellWidth: 'auto' }, // Tournée
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const str = `Page ${data.pageNumber} / ${(doc as any).internal.getNumberOfPages()}`;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(130, 130, 130);
      doc.text(str, pageWidth - marginX - 18, pageHeight - 6);
      if (companyInfo?.name) {
        doc.text(companyInfo.name, marginX, pageHeight - 6);
      }
    },
  });

  // Filename with current date
  const cleanDate = new Date().toISOString().slice(0, 10);
  const fileName = `defibrillateurs_selection_${cleanDate}.pdf`;
  doc.save(fileName);
}
