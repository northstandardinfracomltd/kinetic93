const parseDateDMY = (dateStr?: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Format DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Format YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
};

const isTrueOrOui = (val: any): boolean => {
  if (val === true) return true;
  if (typeof val === 'string') {
    const norm = val.trim().toLowerCase();
    return norm === 'oui' || norm === 'true' || norm === '1' || norm === 'on';
  }
  return false;
};

const isFournitureClient = (val: any): boolean => {
  if (typeof val !== 'string') return false;
  const norm = val.trim().toLowerCase().replace(/\.$/, '');
  return norm === 'fourniture par le client';
};

const resolveStockUgsAndName = (
  selectedVal: string,
  stocks: any[] = [],
  variables: any[] = []
): { ugs: string; productName: string } | null => {
  if (!selectedVal || typeof selectedVal !== 'string') return null;
  const raw = selectedVal.trim();
  if (!raw || raw === 'Non' || raw === 'Aucun' || raw === '-') return null;

  const normRaw = raw.toLowerCase();

  // 1. Direct match in stocks
  const matchedStock = (stocks || []).find((s: any) => {
    const sId = String(s.id || '').trim().toLowerCase();
    const sRef = String(s.reference || s.ugs || s.sku || '').trim().toLowerCase();
    const sDesignation = String(s.designation || s.nom || s.title || s.label || '').trim().toLowerCase();
    const sCombined1 = sRef && sDesignation ? `${sRef} - ${sDesignation}` : '';
    const sCombined2 = sRef && sDesignation ? `${sDesignation} (${sRef})` : '';
    return (
      (sId && sId === normRaw) ||
      (sRef && sRef === normRaw) ||
      (sDesignation && sDesignation === normRaw) ||
      (sCombined1 && sCombined1 === normRaw) ||
      (sCombined2 && sCombined2 === normRaw) ||
      (sDesignation && normRaw.includes(sDesignation) && sDesignation.length > 3)
    );
  });

  if (matchedStock) {
    const ugs = String(matchedStock.reference || matchedStock.ugs || matchedStock.sku || matchedStock.id || raw).trim();
    const productName = String(
      matchedStock.designation || matchedStock.nom || matchedStock.title || matchedStock.label || raw
    ).trim();
    if (ugs) {
      return { ugs, productName: productName || ugs };
    }
  }

  // 2. Match in variables
  const matchedVar = (variables || []).find((v: any) => {
    const vId = String(v.id || '').trim().toLowerCase();
    const vUgs = String(v.ugs || v.reference || v.sku || '').trim().toLowerCase();
    const vTitle = String(v.title || v.nom || v.designation || v.label || v.value || '').trim().toLowerCase();
    return (
      (vId && vId === normRaw) ||
      (vUgs && vUgs === normRaw) ||
      (vTitle && vTitle === normRaw)
    );
  });

  if (matchedVar) {
    const ugs = String(matchedVar.ugs || matchedVar.reference || matchedVar.sku || '').trim();
    const productName = String(
      matchedVar.title || matchedVar.nom || matchedVar.designation || matchedVar.label || matchedVar.value || raw
    ).trim();
    if (ugs) {
      return { ugs, productName: productName || ugs };
    }
  }

  // 3. Fallback if string already encodes UGS or product name
  const parenMatch = raw.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    return { ugs: parenMatch[2].trim(), productName: parenMatch[1].trim() };
  }
  const dashMatch = raw.match(/^([A-Za-z0-9_-]{2,})\s*-\s*(.+)$/);
  if (dashMatch) {
    return { ugs: dashMatch[1].trim(), productName: dashMatch[2].trim() };
  }

  return { ugs: raw, productName: raw };
};

export const getReportSpecificAlerts = (
  report: any,
  defibrillateurs: any[] = [],
  stocks: any[] = [],
  variables: any[] = [],
  fsmTours: any[] = []
): string[] => {
  if (!report) return [];
  const snap = report.fullDataSnapshot || {};
  const alerts: string[] = [];

  // 1. Section 5 — Dates : Préconisation de remplacement.
  const preconisation =
    report.preconisationRemplacement !== undefined
      ? report.preconisationRemplacement
      : snap.preconisationRemplacement;
  if (isTrueOrOui(preconisation)) {
    const obsRaw =
      report.recommandationPreconisationRemplacement ??
      snap.recommandationPreconisationRemplacement ??
      '';
    const obs = String(obsRaw || '').trim() || 'Aucune observation';
    const cleanObs = obs.replace(/\.$/, '');
    alerts.push(
      `! Le technicien mentionne une préconisation de remplacement du défibrillateur, observation : ${cleanObs}.`
    );
  }

  // 2. Origine matériel installé = « Fourniture par le client. »
  const originFields: Array<{ keys: string[]; label: string }> = [
    { keys: ['origineCoffretInstalle'], label: 'Origine coffret installé.' },
    { keys: ['origineElectrodeAInstallee'], label: 'Origine de l’électrode A installée.' },
    {
      keys: ['origineElectrodeSecoursAInstallee', 'origineElectrodeASecoursInstallee'],
      label: 'Origine de l’électrode secours A installée.'
    },
    { keys: ['origineElectrodePInstallee'], label: 'Origine de l’électrode P installée.' },
    {
      keys: ['origineElectrodeSecoursPInstallee', 'origineElectrodePSecoursInstallee'],
      label: 'Origine de l’électrode secours P installée.'
    },
    { keys: ['origineBatterieInstallee'], label: 'Origine de la batterie installée.' },
    { keys: ['origineKitSecoursInstalle'], label: 'Origine du kit de secours installé.' }
  ];

  for (const field of originFields) {
    let val: any = undefined;
    for (const k of field.keys) {
      if (report[k] !== undefined && report[k] !== '') {
        val = report[k];
        break;
      }
      if (snap[k] !== undefined && snap[k] !== '') {
        val = snap[k];
        break;
      }
    }
    if (isFournitureClient(val)) {
      alerts.push(
        `! Le technicien mentionne ce matériel installé comme fourniture par le client pour : ${field.label}`
      );
    }
  }

  // 3. Deux UGS similaires dans les produits sélectionnés (Sections 6, 7, 8)
  const selectionFields: Array<{ keys: string[] }> = [
    { keys: ['selectionElectrodeARemplacee', 'destockElectrodeA'] },
    { keys: ['selectionElectrodeASecoursRemplacee', 'destockElectrodeSecoursA'] },
    { keys: ['selectionElectrodePRemplacee', 'destockElectrodeP'] },
    { keys: ['selectionElectrodePSecoursRemplacee', 'destockElectrodeSecoursP'] },
    { keys: ['selectionBatterieRemplacee', 'destockBatterie'] }
  ];

  const resolvedSelections: Array<{ ugs: string; productName: string }> = [];
  for (const sf of selectionFields) {
    let rawVal = '';
    for (const k of sf.keys) {
      const candidate = report[k] ?? snap[k];
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        rawVal = candidate.trim();
        break;
      }
    }
    if (rawVal) {
      const resolved = resolveStockUgsAndName(rawVal, stocks, variables);
      if (resolved && resolved.ugs) {
        resolvedSelections.push(resolved);
      }
    }
  }

  const ugsCounts = new Map<string, { count: number; ugs: string; productName: string }>();
  for (const item of resolvedSelections) {
    const key = item.ugs.trim().toLowerCase();
    const existing = ugsCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      ugsCounts.set(key, { count: 1, ugs: item.ugs, productName: item.productName });
    }
  }
  for (const entry of ugsCounts.values()) {
    if (entry.count >= 2) {
      alerts.push(
        `! Le technicien mentionne deux UGS similaires, probable incohérence : ${entry.ugs} (${entry.productName}).`
      );
    }
  }

  // 4. Section 11 : Pièce(s) jointe(s) téléchargée(s)
  const attachmentsArr =
    (Array.isArray(report.attachments) && report.attachments.length > 0 ? report.attachments : null) ||
    (Array.isArray(snap.attachments) && snap.attachments.length > 0 ? snap.attachments : null) ||
    (Array.isArray(report.piecesJointes) && report.piecesJointes.length > 0 ? report.piecesJointes : null) ||
    (Array.isArray(snap.piecesJointes) && snap.piecesJointes.length > 0 ? snap.piecesJointes : null);

  const hasSingleAttachment = Boolean(
    attachmentsArr ||
      (report.pieceJointe1Url && String(report.pieceJointe1Url).trim() !== '') ||
      (report.pieceJointe2Url && String(report.pieceJointe2Url).trim() !== '') ||
      (report.pieceJointe3Url && String(report.pieceJointe3Url).trim() !== '') ||
      (snap.pieceJointe1Url && String(snap.pieceJointe1Url).trim() !== '') ||
      (snap.pieceJointe2Url && String(snap.pieceJointe2Url).trim() !== '') ||
      (snap.pieceJointe3Url && String(snap.pieceJointe3Url).trim() !== '') ||
      (report.pieceJointeDevisDataUrl && String(report.pieceJointeDevisDataUrl).trim() !== '') ||
      (snap.pieceJointeDevisDataUrl && String(snap.pieceJointeDevisDataUrl).trim() !== '') ||
      (report.pieceJointeDevisName && String(report.pieceJointeDevisName).trim() !== '') ||
      (snap.pieceJointeDevisName && String(snap.pieceJointeDevisName).trim() !== '')
  );

  if (hasSingleAttachment) {
    alerts.push(`! Le technicien à téléchargé une ou plusieurs pièce(s) jointe(s).`);
  }

  // 5. Section 1 : Fourniture d'un matériel de prêt ? = Oui
  const pretVal =
    report.fournitureMaterielPret ??
    snap.fournitureMaterielPret ??
    report.pretEnCours ??
    snap.pretEnCours;
  if (isTrueOrOui(pretVal)) {
    alerts.push(`! Le technicien mentionne un matériel prêté.`);
  }

  // 6. En dehors du form Rapport PDF : Mission rejetée par le technicien
  let isRejected =
    report.missionStatus === 'Rejet mission' ||
    snap.missionStatus === 'Rejet mission' ||
    Boolean(report.rejectionReason && String(report.rejectionReason).trim() !== '') ||
    Boolean(report.raisonRejet && String(report.raisonRejet).trim() !== '') ||
    Boolean(snap.rejectionReason && String(snap.rejectionReason).trim() !== '');

  let rejectionReasonText = String(
    report.rejectionReason ||
      report.raisonRejet ||
      snap.rejectionReason ||
      snap.raisonRejet ||
      ''
  ).trim();

  if (!isRejected && Array.isArray(fsmTours) && fsmTours.length > 0) {
    const repMissionId = String(report.missionId || snap.missionId || '').trim();
    const repIntervRef = String(report.interventionReference || snap.interventionReference || '').trim();
    const repDefibId = String(report.defibIdentifiant || snap.defibIdentifiant || '').trim();

    for (const tour of fsmTours) {
      const points = Array.isArray(tour?.points) ? tour.points : [];
      for (const pt of points) {
        const ptId = String(pt.id || '').trim();
        const ptIntervRef = String(pt.interventionReference || '').trim();
        const ptDefibId = String(pt.defibIdentifiant || pt.defibrillateurIdentifiant || '').trim();

        const matchesMission =
          (repMissionId && ptId && repMissionId === ptId) ||
          (repIntervRef && ptIntervRef && repIntervRef === ptIntervRef) ||
          (!repMissionId && !repIntervRef && repDefibId && ptDefibId && repDefibId === ptDefibId && report.isUpcoming);

        if (matchesMission && (pt.status === 'Rejet mission' || (pt.rejectionReason && String(pt.rejectionReason).trim() !== ''))) {
          isRejected = true;
          if (!rejectionReasonText && pt.rejectionReason) {
            rejectionReasonText = String(pt.rejectionReason).trim();
          }
          break;
        }
      }
      if (isRejected) break;
    }
  }

  if (isRejected) {
    const cleanReason = (rejectionReasonText || 'Non précisée').replace(/\.$/, '');
    alerts.push(`! Le technicien à rejeté la mission pour la raison suivante : ${cleanReason}.`);
  }

  return alerts;
};

export const hasReportAlerts = (
  report: any,
  defibrillateurs: any[] = [],
  stocks: any[] = [],
  variables: any[] = [],
  fsmTours: any[] = []
): boolean => {
  if (!report) return false;
  const specificAlerts = getReportSpecificAlerts(report, defibrillateurs, stocks, variables, fsmTours);
  if (specificAlerts.length > 0) return true;

  const existingComment = String(report.commentaire || report.fullDataSnapshot?.commentaire || '');
  if (existingComment.includes('! Le technicien ')) return true;

  return false;
};

export const generateReportModerationComment = (
  report: any,
  defibrillateurs: any[] = [],
  stocks: any[] = [],
  variables: any[] = [],
  fsmTours: any[] = []
): string => {
  if (!report) return '';
  const snap = report.fullDataSnapshot || {};
  const getVal = (key: string) => (report[key] !== undefined ? report[key] : snap[key]);

  const lines: string[] = [];

  // Specific new technician alerts (! Le technicien ...)
  const specificAlerts = getReportSpecificAlerts(report, defibrillateurs, stocks, variables, fsmTours);
  for (const alertLine of specificAlerts) {
    if (!lines.includes(alertLine)) {
      lines.push(alertLine);
    }
  }

  // Find matching defibrillateur
  const defibId = getVal('defibIdentifiant');
  const serial = getVal('numeroSerie') || getVal('serial');
  const matchedDefib = (defibrillateurs || []).find(
    (d: any) =>
      (defibId && d.identifiant && String(d.identifiant).trim() === String(defibId).trim()) ||
      (serial && d.serial && String(d.serial).trim() === String(serial).trim())
  );

  // 1. Check Mandatory Fields
  const mandatoryKeys = [
    'interventionReference',
    'dateIntervention',
    'etatFinal',
    'techName',
    'siteClient',
    'numeroSerie',
    'marque',
    'modele',
    'typeDefibrillateur',
    'electrodeARemplacee',
    'peremptionElectrodeA',
    'electrodePRemplacee',
    'batterieRemplacee',
    'dateBatterie'
  ];
  const hasMissingMandatory = mandatoryKeys.some((k) => {
    const v = getVal(k);
    return v === undefined || v === null || String(v).trim() === '';
  });

  if (hasMissingMandatory) {
    lines.push('— Champs obligatoire incomplet.');
  }

  // 2. Check Coherence / Potential Errors
  let hasCoherenceIssue = false;
  const dateInterv = parseDateDMY(getVal('dateIntervention'));
  const dateFab = parseDateDMY(getVal('dateFabrication'));
  const dateMiseEnService = parseDateDMY(getVal('dateMiseEnService'));
  const datePerempA = parseDateDMY(getVal('peremptionElectrodeA'));
  const datePerempASec = parseDateDMY(getVal('peremptionElectrodeASecours'));
  const datePerempP = parseDateDMY(getVal('peremptionElectrodeP'));
  const datePerempPSec = parseDateDMY(getVal('peremptionElectrodePSecours'));
  const dateBat = parseDateDMY(getVal('dateBatterie'));
  const typeDateBat = getVal('typeDateBatterie');

  if (dateFab && dateMiseEnService && dateMiseEnService < dateFab) {
    hasCoherenceIssue = true;
  }
  if (dateInterv) {
    if (getVal('electrodeARemplacee') === 'Oui' && datePerempA && datePerempA <= dateInterv) {
      hasCoherenceIssue = true;
    }
    if (getVal('electrodeASecoursRemplacee') === 'Oui' && datePerempASec && datePerempASec <= dateInterv) {
      hasCoherenceIssue = true;
    }
    if (getVal('electrodePRemplacee') === 'Oui' && datePerempP && datePerempP <= dateInterv) {
      hasCoherenceIssue = true;
    }
    if (getVal('electrodePSecoursRemplacee') === 'Oui' && datePerempPSec && datePerempPSec <= dateInterv) {
      hasCoherenceIssue = true;
    }
    if (
      getVal('batterieRemplacee') === 'Oui' &&
      typeDateBat === "Date d'expiration" &&
      dateBat &&
      dateBat <= dateInterv
    ) {
      hasCoherenceIssue = true;
    }
  }

  const etatFinal = getVal('etatFinal');
  const allValidStates = [
    getVal('etatSignaletique'),
    getVal('etatCoffret'),
    getVal('etatDae'),
    getVal('etatElectrodeA'),
    getVal('etatElectrodeASecours'),
    getVal('etatElectrodeP'),
    getVal('etatElectrodePSecours'),
    getVal('etatBatterie'),
    getVal('etatKitSecours')
  ].filter(Boolean);

  if (etatFinal === 'Opérationnel' && allValidStates.some((s) => String(s).includes('Hors service'))) {
    hasCoherenceIssue = true;
  }

  if (hasCoherenceIssue) {
    lines.push('— Potentielle(s) erreur(s) relevée(s).');
  }

  // 3. Check Data Discrepancies with Defibrillateur record
  if (matchedDefib) {
    const comparePairs = [
      [getVal('marque'), matchedDefib.marque],
      [getVal('modele'), matchedDefib.modele],
      [getVal('numeroSerie'), matchedDefib.serial],
      [getVal('typeDefibrillateur'), matchedDefib.typeDefibrillateur],
      [getVal('dateFabrication'), matchedDefib.fabricationDate],
      [getVal('dateMiseEnService'), matchedDefib.ServiceDate],
      [getVal('localisation'), matchedDefib.localisation],
      [getVal('designation'), matchedDefib.emplacement]
    ];
    const hasDiff = comparePairs.some(([repVal, defVal]) => {
      const r = String(repVal || '').trim();
      const d = String(defVal || '').trim();
      return r !== '' && d !== '' && r.toLowerCase() !== d.toLowerCase();
    });
    if (hasDiff) {
      lines.push('— Différence(s) de donnée(s) relevée(s).');
    }
  }

  // Preserve any existing user/custom lines in report.commentaire without overwriting
  const existingComment = String(report.commentaire ?? snap.commentaire ?? '').trim();
  if (existingComment) {
    const existingLines = existingComment
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const merged: string[] = [...existingLines];
    for (const newLine of lines) {
      if (!merged.includes(newLine)) {
        merged.push(newLine);
      }
    }
    return merged.join('\n');
  }

  return lines.join('\n');
};

export const mergeReportModerationComment = (
  existingComment: string | undefined | null,
  report: any,
  defibrillateurs: any[] = [],
  stocks: any[] = [],
  variables: any[] = [],
  fsmTours: any[] = []
): string => {
  const base = String(existingComment ?? report?.commentaire ?? report?.fullDataSnapshot?.commentaire ?? '').trim();
  const specificAlerts = getReportSpecificAlerts(report, defibrillateurs, stocks, variables, fsmTours);

  const lines = base
    ? base
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  for (const alertLine of specificAlerts) {
    if (!lines.includes(alertLine)) {
      lines.push(alertLine);
    }
  }

  return lines.join('\n');
};
