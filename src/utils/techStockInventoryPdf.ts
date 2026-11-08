import { jsPDF } from 'jspdf';
import { CompanyInfo, StockMovement, StockRecord, StockTraceability, Variable } from '../types';

export interface TechInventoryPdfItem {
  stock: StockRecord;
  pieceName: string;
  pieceCategory?: string;
  traces: StockTraceability[];
}

export function formatHorodatageShort(dateOrStr?: Date | string): string {
  if (typeof dateOrStr === 'string' && dateOrStr.trim()) {
    const raw = dateOrStr.trim();
    const m4 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[\s,à]+0?(\d{1,2}):(\d{2})/);
    if (m4) {
      return `${m4[1]}/${m4[2]}/${m4[3].slice(-2)} ${parseInt(m4[4], 10)}:${m4[5]}`;
    }
    const m2 = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})[\s,à]+0?(\d{1,2}):(\d{2})/);
    if (m2) {
      return `${m2[1]}/${m2[2]}/${m2[3]} ${parseInt(m2[4], 10)}:${m2[5]}`;
    }
    return raw;
  }
  const d = dateOrStr instanceof Date ? dateOrStr : new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function doesTraceMatchTechLocationHelper(
  trace: StockTraceability,
  targetLoc: string,
  techName?: string,
  companyInfo?: CompanyInfo,
  stockMouvements?: StockMovement[]
): boolean {
  const cleanTargetLoc = (targetLoc || '').trim();
  const cleanTechName = (techName || '').trim().toLowerCase();
  if (!cleanTargetLoc && !cleanTechName) return false;

  let rawLoc = '';
  if (trace.emplacement && trace.emplacement.trim()) {
    rawLoc = trace.emplacement.trim();
  } else if (stockMouvements && stockMouvements.length > 0) {
    const matchedMv = stockMouvements.find((mv) => mv.id === trace.movementId);
    if (matchedMv) {
      if (matchedMv.type === 'Réapprovisionnement fournisseur') {
        rawLoc = 'Centrale des stocks';
      } else if (matchedMv.emplacement) {
        rawLoc = matchedMv.emplacement.includes(' : ')
          ? matchedMv.emplacement.split(' : ')[1].trim()
          : matchedMv.emplacement.trim();
      }
    }
  }

  if (!rawLoc || rawLoc === 'Centrale' || rawLoc === 'Centrale des stocks') {
    return cleanTargetLoc.toLowerCase() === 'centrale des stocks';
  }

  const normRaw = rawLoc.toLowerCase();
  const normTarget = cleanTargetLoc.toLowerCase();

  if (normTarget && normRaw === normTarget) return true;

  const customName = cleanTargetLoc
    ? (companyInfo?.customLocationNames?.[cleanTargetLoc] || '').trim()
    : '';
  if (customName && normRaw === customName.toLowerCase()) return true;

  if (cleanTechName) {
    if (normRaw.includes(cleanTechName)) return true;
    if (normTarget) {
      const labelWithTarget = `${cleanTechName} — ${normTarget}`;
      const labelWithCustom = customName ? `${cleanTechName} — ${customName.toLowerCase()}` : '';
      if (normRaw === labelWithTarget || (labelWithCustom && normRaw === labelWithCustom)) {
        return true;
      }
    }
  }

  if (normTarget && normRaw.includes(' — ')) {
    const afterDash = normRaw.split(' — ').pop()?.trim() || '';
    if (afterDash === normTarget || (customName && afterDash === customName.toLowerCase())) {
      return true;
    }
  }

  if (normTarget && normRaw.includes(' : ')) {
    const afterColon = normRaw.split(' : ').pop()?.trim() || '';
    if (afterColon === normTarget || (customName && afterColon === customName.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function openTechStockInventoryPdf(params: {
  companyInfo?: CompanyInfo;
  horodatage?: string;
  items: TechInventoryPdfItem[];
  technicianName?: string;
  locationLabel?: string;
}) {
  const { companyInfo, horodatage, items } = params;
  const tenantCommercialName =
    (companyInfo?.nomCommercial && companyInfo.nomCommercial.trim()) ||
    (companyInfo?.name && companyInfo.name.trim()) ||
    'Defibeo';
  const formattedHorodatage = formatHorodatageShort(horodatage);

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = 297;
  const pageH = 210;
  const marginX = 10;
  const contentW = pageW - marginX * 2; // 277 mm
  const maxBottomY = pageH - 12;

  const truncateText = (text: string, maxW: number): string => {
    const s = String(text ?? '-').replace(/[\r\n]+/g, ' ').trim() || '-';
    if (doc.getTextWidth(s) <= maxW) return s;
    let truncated = s;
    const ellipsis = '…';
    while (truncated.length > 1 && doc.getTextWidth(truncated + ellipsis) > maxW) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + ellipsis;
  };

  const drawCell = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts?: {
      bold?: boolean;
      fillRgb?: [number, number, number];
      align?: 'left' | 'center' | 'right';
      fontSize?: number;
    }
  ) => {
    const fill = opts?.fillRgb || [255, 255, 255];
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.setDrawColor(180, 188, 200);
    doc.setLineWidth(0.25);
    doc.rect(x, y, w, h, 'FD');

    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.fontSize || 8.5);
    doc.setTextColor(0, 0, 0);

    const padX = 2;
    const rendered = truncateText(text, Math.max(2, w - padX * 2));
    const textY = y + h / 2;
    const align = opts?.align || 'left';
    if (align === 'center') {
      doc.text(rendered, x + w / 2, textY, { align: 'center', baseline: 'middle' });
    } else if (align === 'right') {
      doc.text(rendered, x + w - padX, textY, { align: 'right', baseline: 'middle' });
    } else {
      doc.text(rendered, x + padX, textY, { align: 'left', baseline: 'middle' });
    }
  };

  let cursorY = 14;

  // Header: Top-left tenant commercial name, top-right horodatage, sub-line title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(tenantCommercialName, marginX, cursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(formattedHorodatage, pageW - marginX, cursorY, { align: 'right' });

  cursorY += 6.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('Inventaire du stock embarqué par le technicien.', marginX, cursorY);

  cursorY += 8;

  // Table columns (total = 277 mm)
  const cols: { header: string; width: number; align?: 'left' | 'center' | 'right' }[] = [
    { header: 'UGS.', width: 22, align: 'center' },
    { header: 'Pièce ou service.', width: 58, align: 'left' },
    { header: 'Emplacement.', width: 38, align: 'left' },
    { header: 'Numéro de lot ou série.', width: 38, align: 'left' },
    { header: 'Date de péremption.', width: 28, align: 'center' },
    { header: 'Situation.', width: 28, align: 'center' },
    { header: 'Volume.', width: 18, align: 'center' },
    { header: 'Infos réservation / Commentaire.', width: 47, align: 'left' },
  ];

  const headerH = 8;
  const rowH = 7;

  const drawTableHeader = () => {
    let hx = marginX;
    for (const col of cols) {
      drawCell(col.header, hx, cursorY, col.width, headerH, {
        bold: true,
        fillRgb: [236, 239, 244],
        align: col.align || 'left',
        fontSize: 8.5,
      });
      hx += col.width;
    }
    cursorY += headerH;
  };

  drawTableHeader();

  let hasRows = false;

  for (const item of items) {
    const { stock, pieceName, pieceCategory, traces } = item;
    const ugsLabel = stock.ugs || '0001';
    const fullPieceLabel = pieceCategory && pieceCategory !== '-' ? `${pieceName} (${pieceCategory})` : pieceName;

    if (!traces || traces.length === 0) {
      if (cursorY + rowH > maxBottomY) {
        doc.addPage('a4', 'landscape');
        cursorY = 14;
        drawTableHeader();
      }
      hasRows = true;
      const rowVals = [
        ugsLabel,
        fullPieceLabel,
        params.locationLabel || '-',
        '-',
        '-',
        'Disponible',
        String(stock.quantite ?? 0),
        stock.commentaire || '-',
      ];
      let cx = marginX;
      for (let c = 0; c < cols.length; c++) {
        drawCell(rowVals[c], cx, cursorY, cols[c].width, rowH, {
          align: cols[c].align || 'left',
          fontSize: 8,
        });
        cx += cols[c].width;
      }
      cursorY += rowH;
    } else {
      for (const tr of traces) {
        if (cursorY + rowH > maxBottomY) {
          doc.addPage('a4', 'landscape');
          cursorY = 14;
          drawTableHeader();
        }
        hasRows = true;
        const empStr = tr.emplacement || params.locationLabel || '-';
        const lotStr = tr.lotOrSerial || '-';
        let expStr = tr.expirationDate || '-';
        if (/^\d{4}-\d{2}-\d{2}$/.test(expStr)) {
          const [y, m, d] = expStr.split('-');
          expStr = `${d}/${m}/${y}`;
        }
        const sitStr =
          tr.situation === 'Signalé manquant'
            ? 'Signalé Manquant'
            : tr.situation || 'Disponible';
        const volStr =
          tr.volume !== undefined && tr.volume !== null && String(tr.volume).trim() !== ''
            ? String(tr.volume)
            : '1';
        const detailsParts = [tr.reservationInfo, tr.comment]
          .map((s) => String(s || '').trim())
          .filter((s) => s && s !== '—' && s !== '-');
        const detailsStr = detailsParts.length > 0 ? detailsParts.join(' — ') : '-';

        const rowVals = [
          ugsLabel,
          fullPieceLabel,
          empStr,
          lotStr,
          expStr,
          sitStr,
          volStr,
          detailsStr,
        ];

        let cx = marginX;
        for (let c = 0; c < cols.length; c++) {
          drawCell(rowVals[c], cx, cursorY, cols[c].width, rowH, {
            align: cols[c].align || 'left',
            fontSize: 8,
          });
          cx += cols[c].width;
        }
        cursorY += rowH;
      }
    }
  }

  if (!hasRows) {
    drawCell(
      'Aucun stock embarqué trouvé pour cet emplacement.',
      marginX,
      cursorY,
      contentW,
      rowH,
      { align: 'center', fontSize: 8.5 }
    );
    cursorY += rowH;
  }

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, '_blank');
  if (!win) {
    doc.save(`inventaire_stock_embarque_${Date.now()}.pdf`);
  }
}

export function buildTechInventoryItemsFromStocks(params: {
  stocks: StockRecord[];
  variables: Variable[];
  targetLocation: string;
  technicianName?: string;
  companyInfo?: CompanyInfo;
}): TechInventoryPdfItem[] {
  const { stocks, variables, targetLocation, technicianName, companyInfo } = params;
  const findStockVariable = (denomIdOrName?: string) => {
    if (!denomIdOrName) return undefined;
    const clean = String(denomIdOrName).trim().toLowerCase();
    return (
      (variables || []).find((v) => v.id === denomIdOrName) ||
      (variables || []).find((v) => v.nom && v.nom.trim().toLowerCase() === clean)
    );
  };

  const hasPositiveVol = (tr: StockTraceability): boolean => {
    const vol =
      tr.volume !== undefined && tr.volume !== null && String(tr.volume).trim() !== ''
        ? Number(tr.volume)
        : 1;
    return !isNaN(vol) && vol >= 1;
  };

  const items: TechInventoryPdfItem[] = [];
  for (const st of stocks || []) {
    if (!Array.isArray(st.traceabilities) || st.traceabilities.length === 0) continue;
    const matchedTraces = st.traceabilities.filter(
      (tr) =>
        doesTraceMatchTechLocationHelper(
          tr,
          targetLocation,
          technicianName,
          companyInfo,
          st.mouvements
        ) && hasPositiveVol(tr)
    );
    if (matchedTraces.length > 0) {
      const vObj = findStockVariable(st.denominationPieceId);
      const pieceName = vObj
        ? vObj.nom
        : (st as any).denominationPieceNom || st.denominationPieceId || 'Pièce inconnue';
      items.push({
        stock: st,
        pieceName,
        pieceCategory: vObj?.category,
        traces: matchedTraces,
      });
    }
  }
  return items;
}
