import { jsPDF } from 'jspdf';
import { Client, CommercialDoc, Defibrillateur, FormationRecord, OtherEquipment, Variable } from '../types';
import { formatDateToFR } from '../utils';

export interface TourLogisticsExportContext {
  tour: any;
  tourDraft?: any;
  defibrillateurs: Defibrillateur[];
  otherEquipments: OtherEquipment[];
  formations?: FormationRecord[];
  clients: Client[];
  commercialDocs: CommercialDoc[];
  variables: Variable[];
  generatedReports?: any[];
}

interface ParsedRequiredPartRow {
  index: number;
  partLabel: string;
  volume: number;
  isSentToClient: boolean;
  isProvidedByClient: boolean;
  expeditionRef: string;
  clientName: string;
  siteName: string;
  localisation: string;
  equipmentIdentifiant: string;
  equipmentType: string;
  equipmentModel: string;
  interventionRef: string;
  missionStatus: string;
  estimatedDate: string;
  estimatedSlot: string;
  bonCommandeRef: string;
  autreReference: string;
  statutFacturation: string;
  reasonsLabel: string;
  commentaireTech: string;
}

interface PdfTableColumn {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

export function generateTourLogisticsPdf(ctx: TourLogisticsExportContext): void {
  const {
    tour: t,
    tourDraft = {},
    defibrillateurs = [],
    otherEquipments = [],
    formations = [],
    clients = [],
    commercialDocs = [],
    variables = [],
    generatedReports = [],
  } = ctx;

  const tourTitle = String(tourDraft.title !== undefined ? tourDraft.title : (t.title || t.name || 'Sans titre')).trim();
  const tourIdentifiant = String(t.tourIdentifiant || t.id || '-').trim();
  const tourTech = String(tourDraft.techName !== undefined ? tourDraft.techName : (t.techName || 'Non assigné')).trim() || 'Non assigné';
  const rawStartDate = String(tourDraft.startDate !== undefined ? tourDraft.startDate : (t.startDate || '')).trim();
  const tourStartDate = rawStartDate ? (formatDateToFR(rawStartDate) || rawStartDate) : '-';
  const tourStatus = String(tourDraft.status !== undefined ? tourDraft.status : (t.status || 'Brouillon')).trim();
  const tourVehicule = String(tourDraft.vehicule !== undefined ? tourDraft.vehicule : (t.vehicule || '-')).trim() || '-';
  const tourRegion = String(tourDraft.region !== undefined ? tourDraft.region : (t.region || '-')).trim() || '-';
  const tourCommentaire = String(tourDraft.commentaire !== undefined ? tourDraft.commentaire : (t.commentaire || '')).trim();

  const missions: any[] = Array.isArray(t.missions) ? t.missions : [];
  const rows: ParsedRequiredPartRow[] = [];

  let globalPartIndex = 1;

  for (const m of missions) {
    if (!m) continue;
    const reqParts: string[] = Array.isArray(m.requiredParts) ? m.requiredParts : [];
    if (reqParts.length === 0) continue;

    const isFormationMission =
      m.equipmentType === 'Formation' ||
      (typeof m.equipmentType === 'string' && m.equipmentType.toLowerCase().includes('formation')) ||
      (!m.equipmentType && !!m.formationId && String(m.formationId).toLowerCase() !== 'aucune information');

    const matchedDefib = defibrillateurs.find((d: any) => d && d.identifiant === m.defibIdentifiant);
    const matchedOther = !matchedDefib
      ? otherEquipments.find((o: any) => o && o.identifiant === m.defibIdentifiant)
      : null;
    const matchedFormation = isFormationMission
      ? formations.find((f: any) => f && (f.id === m.formationId || f.id === m.defibIdentifiant))
      : null;

    // Resolve Client
    const matchedClient = (() => {
      const targetClientId =
        matchedFormation?.clientId ||
        matchedDefib?.clientId ||
        matchedOther?.clientId ||
        m.clientId;
      if (targetClientId) {
        const found = clients.find(c => c && c.id === targetClientId);
        if (found) return found;
      }
      if (m.clientName) {
        const mName = String(m.clientName).toLowerCase();
        const found = clients.find(c => {
          if (!c || !c.denomination) return false;
          const cDenom = c.denomination.toLowerCase();
          return mName.includes(cDenom) || cDenom.includes(mName);
        });
        if (found) return found;
      }
      return null;
    })();

    const clientName =
      matchedClient?.denomination ||
      m.clientName ||
      (matchedDefib as any)?.clientNom ||
      '-';

    // Resolve Site & Localisation
    const rawSite = isFormationMission
      ? (m.siteName || '')
      : matchedDefib
      ? (matchedDefib.nomSite || '')
      : matchedOther
      ? (matchedOther.nomPrenomSite || '')
      : '';
    const siteName =
      rawSite === 'Représentant Standard' || rawSite === 'Représentant standard'
        ? ''
        : String(rawSite || '').trim();

    const localisation = (() => {
      if (isFormationMission) {
        if (m.location) return String(m.location).trim();
        if (matchedFormation) {
          return [matchedFormation.adresse, matchedFormation.ville, matchedFormation.codePostal]
            .filter(Boolean)
            .join(', ');
        }
        return String(m.address || '-').trim();
      }
      const numVoie = matchedDefib
        ? (matchedDefib.numVoie || (matchedDefib as any).numeroVoie || (matchedDefib as any).adresse || '')
        : matchedOther
        ? (matchedOther.numeroVoie || (matchedOther as any).numVoie || (matchedOther as any).adresse || '')
        : (m.address || '');
      const ville = matchedDefib ? (matchedDefib.ville || '') : matchedOther ? (matchedOther.ville || '') : '';
      const cp = matchedDefib
        ? ((matchedDefib as any).codePostal || matchedDefib.cp || '')
        : matchedOther
        ? (matchedOther.codePostal || (matchedOther as any).cp || '')
        : '';
      return [numVoie, ville, cp].map(s => String(s || '').trim()).filter(Boolean).join(', ') || '-';
    })();

    // Resolve Equipment Identifiant, Type & Model
    const equipmentIdentifiant = String(m.defibIdentifiant || m.formationId || '-').trim() || '-';
    const equipmentType = String(
      m.equipmentType ||
        (isFormationMission
          ? 'Formation'
          : matchedDefib
          ? 'Défibrillateur'
          : matchedOther
          ? 'Autre matériel'
          : '-')
    ).trim();

    const equipmentModel = (() => {
      if (matchedDefib) {
        const vModel = variables.find(v => v && v.id === matchedDefib.modeleId);
        return vModel?.nom || (matchedDefib as any).modele || '-';
      }
      if (matchedOther) {
        const otherModeleId = (matchedOther as any).modeleId || (matchedOther as any).modele;
        const vModel = variables.find(v => v && v.id === otherModeleId);
        return vModel?.nom || (matchedOther as any).modele || '-';
      }
      return '-';
    })();

    // Resolve Référence intervention
    const interventionRef = (() => {
      if (m.interventionReference) return String(m.interventionReference).trim();
      const matchedReport = generatedReports.find(
        (r: any) =>
          r &&
          ((r.missionId && r.missionId === m.id) ||
            (r.defibIdentifiant && r.defibIdentifiant === m.defibIdentifiant))
      );
      return matchedReport?.interventionReference ? String(matchedReport.interventionReference).trim() : '-';
    })();

    // Resolve Bon de commande
    const bonCommandeRef = (() => {
      const rawBcId = String(m.bonCommandeId || '').trim();
      const rawCustomBc = String(m.customBonCommande || '').trim();
      if (rawBcId && rawBcId !== 'custom') {
        const matchedBcDoc = commercialDocs.find(
          bcDoc =>
            bcDoc &&
            (bcDoc.id === rawBcId ||
              bcDoc.bonCommandeEntete === rawBcId ||
              bcDoc.bonCommandeReference === rawBcId ||
              bcDoc.ref === rawBcId)
        );
        if (matchedBcDoc) {
          return String(
            matchedBcDoc.bonCommandeEntete ||
              matchedBcDoc.bonCommandeReference ||
              matchedBcDoc.ref ||
              rawBcId
          ).trim();
        }
        return rawCustomBc || rawBcId;
      }
      return rawCustomBc || '-';
    })();

    const autreReference = String(m.autreReference || '-').trim() || '-';
    const statutFacturation = String(m.statutFacturation || 'Aucune information').trim() || '-';
    const missionStatus = String(m.status || 'Brouillon').trim();
    const estimatedDate = m.estimatedDate ? (formatDateToFR(m.estimatedDate) || m.estimatedDate) : '-';
    const estimatedSlot = String(m.estimatedSlot || '-').trim() || '-';
    const reasonsLabel =
      Array.isArray(m.reasons) && m.reasons.length > 0
        ? m.reasons.join(', ')
        : String(m.reason || '-').trim() || '-';
    const commentaireTech = String(m.commentaireInterne || '').trim();
    const expeditionRef = String(m.expedition || '').trim();

    const sentParts: string[] = Array.isArray(m.sentToClientParts) ? m.sentToClientParts : [];
    const providedParts: string[] = Array.isArray(m.providedByClientParts) ? m.providedByClientParts : [];

    for (const rawPart of reqParts) {
      const partStr = String(rawPart || '').trim();
      if (!partStr) continue;

      let volume = 1;
      const qteMatch = partStr.match(/Qté\s*:\s*(\d+)/i) || partStr.match(/\(x(\d+)\)/i);
      if (qteMatch && qteMatch[1]) {
        const parsedVol = parseInt(qteMatch[1], 10);
        if (Number.isFinite(parsedVol) && parsedVol > 0) {
          volume = parsedVol;
        }
      }

      const cleanedPartLabel = partStr
        .replace(/\s*-\s*Qté\s*:\s*\d+/gi, '')
        .replace(/\s*\(x\d+\)\s*$/i, '')
        .trim();

      const isSentToClient = sentParts.includes(rawPart);
      const isProvidedByClient = providedParts.includes(rawPart);

      rows.push({
        index: globalPartIndex++,
        partLabel: cleanedPartLabel || partStr,
        volume,
        isSentToClient,
        isProvidedByClient,
        expeditionRef: isSentToClient ? expeditionRef : '',
        clientName,
        siteName,
        localisation,
        equipmentIdentifiant,
        equipmentType,
        equipmentModel,
        interventionRef,
        missionStatus,
        estimatedDate,
        estimatedSlot,
        bonCommandeRef,
        autreReference,
        statutFacturation,
        reasonsLabel,
        commentaireTech,
      });
    }
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const marginX = 10;
  const marginY = 12;
  const contentWidth = pageWidth - marginX * 2; // 277mm
  let y = marginY;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - marginY) {
      doc.addPage();
      y = marginY;
    }
  };

  const writeWrappedLine = (text: string, fontSize = 9, isBold = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const lines: string[] = doc.splitTextToSize(String(text || ''), contentWidth);
    const lineHeight = fontSize * 0.42;
    for (const line of lines) {
      ensureSpace(lineHeight + 1);
      doc.text(line, marginX, y);
      y += lineHeight;
    }
  };

  const drawTable = (columns: PdfTableColumn[], tableRows: string[][]) => {
    const fontSize = 7.5;
    const lineHeight = 3.3;
    const padX = 1.6;
    const padY = 1.8;

    const renderRow = (cells: string[], isHeader: boolean) => {
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(fontSize);

      const wrappedCells: string[][] = columns.map((col, colIdx) => {
        const rawText = String(cells[colIdx] ?? '');
        const maxTextW = Math.max(4, col.width - padX * 2);
        return doc.splitTextToSize(rawText, maxTextW);
      });

      const maxLines = Math.max(1, ...wrappedCells.map(lines => lines.length));
      const rowHeight = maxLines * lineHeight + padY * 2;

      if (!isHeader && y + rowHeight > pageHeight - marginY) {
        doc.addPage();
        y = marginY;
        renderRow(columns.map(c => c.header), true);
      }

      let curX = marginX;
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const lines = wrappedCells[i];

        if (isHeader) {
          doc.setFillColor(235, 238, 242);
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.25);
          doc.rect(curX, y, col.width, rowHeight, 'FD');
        } else {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.2);
          doc.rect(curX, y, col.width, rowHeight, 'S');
        }

        doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);

        for (let lIdx = 0; lIdx < lines.length; lIdx++) {
          const lineStr = lines[lIdx];
          const textY = y + padY + (lIdx + 0.82) * lineHeight;
          if (col.align === 'center') {
            doc.text(lineStr, curX + col.width / 2, textY, { align: 'center' });
          } else if (col.align === 'right') {
            doc.text(lineStr, curX + col.width - padX, textY, { align: 'right' });
          } else {
            doc.text(lineStr, curX + padX, textY);
          }
        }

        curX += col.width;
      }

      y += rowHeight;
    };

    // Ensure enough room for header + at least 1 row
    if (y + 16 > pageHeight - marginY) {
      doc.addPage();
      y = marginY;
    }

    renderRow(columns.map(c => c.header), true);
    for (const r of tableRows) {
      renderRow(r, false);
    }
  };

  // Document Header
  doc.setTextColor(0, 0, 0);
  writeWrappedLine(`EXPORT LOGISTIQUE - LISTING DES PIÈCES REQUISES`, 12, true);
  y += 1;
  writeWrappedLine(
    `Tournée : ${tourTitle}  |  ID : ${tourIdentifiant}  |  Situation : ${tourStatus}  |  Technicien : ${tourTech}  |  Date début : ${tourStartDate}  |  Véhicule : ${tourVehicule}  |  Région : ${tourRegion}`,
    8.5,
    false
  );
  if (tourCommentaire) {
    writeWrappedLine(`Commentaire tournée : ${tourCommentaire}`, 8.5, false);
  }
  const totalVolumeAll = rows.reduce((acc, r) => acc + r.volume, 0);
  writeWrappedLine(
    `Date d'export : ${new Date().toLocaleString('fr-FR')}  |  Lignes de pièces : ${rows.length}  |  Volume total : ${totalVolumeAll}`,
    8.5,
    false
  );
  y += 3;

  if (rows.length === 0) {
    writeWrappedLine(`Aucune pièce requise n'est renseignée dans les missions de cette tournée.`, 10, false);
  } else {
    // 1. Main table of all required parts per mission (total width = 277mm)
    const detailColumns: PdfTableColumn[] = [
      { header: '#', width: 8, align: 'center' },
      { header: 'Pièce requise', width: 48, align: 'left' },
      { header: 'Volume', width: 13, align: 'center' },
      { header: 'Envoyé au client', width: 23, align: 'center' },
      { header: 'Fourniture client', width: 22, align: 'center' },
      { header: 'Client / Site', width: 44, align: 'left' },
      { header: 'Identifiant matériel', width: 35, align: 'left' },
      { header: 'Réf. Bon de commande', width: 28, align: 'left' },
      { header: 'Réf. Autre référence', width: 28, align: 'left' },
      { header: 'Réf. Interv. / Facturation', width: 28, align: 'left' },
    ];

    const detailTableRows: string[][] = rows.map(row => {
      const sentText = row.isSentToClient
        ? `Oui${row.expeditionRef ? `\n(${row.expeditionRef})` : ''}`
        : 'Non';
      const providedText = row.isProvidedByClient ? 'Oui' : 'Non';
      const clientCell = [
        row.clientName,
        row.siteName ? `Site : ${row.siteName}` : '',
        row.localisation && row.localisation !== '-' ? row.localisation : '',
      ]
        .filter(Boolean)
        .join('\n');
      const equipmentCell = [
        row.equipmentIdentifiant,
        row.equipmentType && row.equipmentType !== '-' ? row.equipmentType : '',
        row.equipmentModel && row.equipmentModel !== '-' ? row.equipmentModel : '',
      ]
        .filter(Boolean)
        .join('\n');
      const intervFactCell = [
        row.interventionRef && row.interventionRef !== '-' ? row.interventionRef : '-',
        row.statutFacturation && row.statutFacturation !== 'Aucune information' ? row.statutFacturation : '',
        row.estimatedDate && row.estimatedDate !== '-' ? row.estimatedDate : '',
      ]
        .filter(Boolean)
        .join('\n');

      return [
        String(row.index),
        row.partLabel,
        String(row.volume),
        sentText,
        providedText,
        clientCell || '-',
        equipmentCell || '-',
        row.bonCommandeRef || '-',
        row.autreReference || '-',
        intervFactCell || '-',
      ];
    });

    drawTable(detailColumns, detailTableRows);

    // 2. Aggregated summary table by piece name
    y += 6;
    ensureSpace(22);
    writeWrappedLine(`RÉCAPITULATIF CUMULÉ DES VOLUMES PAR PIÈCE`, 10, true);
    y += 1.5;

    const summaryMap = new Map<
      string,
      {
        partLabel: string;
        totalVolume: number;
        sentVolume: number;
        providedVolume: number;
        toCarryVolume: number;
      }
    >();

    for (const r of rows) {
      const key = r.partLabel;
      const existing = summaryMap.get(key) || {
        partLabel: r.partLabel,
        totalVolume: 0,
        sentVolume: 0,
        providedVolume: 0,
        toCarryVolume: 0,
      };
      existing.totalVolume += r.volume;
      if (r.isSentToClient) existing.sentVolume += r.volume;
      if (r.isProvidedByClient) existing.providedVolume += r.volume;
      if (!r.isSentToClient && !r.isProvidedByClient) existing.toCarryVolume += r.volume;
      summaryMap.set(key, existing);
    }

    const summaryColumns: PdfTableColumn[] = [
      { header: 'Pièce requise', width: 117, align: 'left' },
      { header: 'Volume total', width: 40, align: 'center' },
      { header: 'À embarquer', width: 40, align: 'center' },
      { header: 'Envoyé au client', width: 40, align: 'center' },
      { header: 'Fourniture par le client', width: 40, align: 'center' },
    ];

    const summaryTableRows: string[][] = Array.from(summaryMap.values()).map(item => [
      item.partLabel,
      String(item.totalVolume),
      String(item.toCarryVolume),
      String(item.sentVolume),
      String(item.providedVolume),
    ]);

    drawTable(summaryColumns, summaryTableRows);
  }

  const safeTourSlug = (tourIdentifiant || tourTitle || 'Tournee')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  doc.save(`Export_Logistique_${safeTourSlug}.pdf`);
}
