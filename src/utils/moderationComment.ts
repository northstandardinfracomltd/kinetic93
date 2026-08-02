/**
 * Helper utility to generate automated moderation comments for GMAO reports.
 */

export function isDateInPast(dateStr: string | undefined | null): boolean {
  if (!dateStr || !dateStr.trim()) return false;
  const clean = dateStr.trim();
  let d: Date | null = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    d = new Date(clean + 'T00:00:00');
  } else {
    const match = clean.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      d = new Date(year, month, day);
    } else {
      const parsed = new Date(clean);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }

  if (!d || isNaN(d.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

export function generateReportModerationComment(
  report: any,
  defibrillateurs: any[] = []
): string {
  if (!report) return '';

  const bullets: string[] = [];

  const snap = report.defibSnapshot || {};

  // 1. Électrode Adulte (A)
  const perempA = snap.peremptionElectrodeA || report.peremptionElectrodeA || snap.peremptionPadpakA || report.peremptionPadpakA;
  if (isDateInPast(perempA)) {
    bullets.push('— La date de péremption est dans le passé pour Électrode Adulte (A).');
  }

  // 2. Péremption de l'électrode de secours (A)
  const perempASecours = snap.peremptionSecoursElectrodeA || report.peremptionSecoursElectrodeA;
  if (isDateInPast(perempASecours)) {
    bullets.push('— La date de péremption est dans le passé pour Péremption de l’électrode de secours (A).');
  }

  // 3. Électrode Pédiatrique (P)
  const perempP = snap.peremptionElectrodeP || report.peremptionElectrodeP || snap.peremptionPadpakP || report.peremptionPadpakP;
  if (isDateInPast(perempP)) {
    bullets.push('— La date de péremption est dans le passé pour Électrode Pédiatrique (P).');
  }

  // 4. Péremption de l'électrode de secours (P)
  const perempPSecours = snap.peremptionSecoursElectrodeP || report.peremptionSecoursElectrodeP;
  if (isDateInPast(perempPSecours)) {
    bullets.push('— La date de péremption est dans le passé pour Péremption de l’électrode de secours (P).');
  }

  // 5. Batterie (B)
  const perempBat = snap.peremptionBatterie || report.peremptionBatterie;
  if (isDateInPast(perempBat)) {
    bullets.push('— La date de péremption est dans le passé pour Batterie (B).');
  }

  // 6. Trousse de secours
  const perempTrousse = snap.peremptionTrousse || report.kitPeremption || report.kitPeremptionMasque || report.kitPeremptionServiettes || snap.kitPeremptionMasque || snap.kitPeremptionServiettes;
  if (isDateInPast(perempTrousse)) {
    bullets.push('— La date de péremption est dans le passé pour Trousse de secours.');
  }

  // 7. Numéro de série différent
  const enteredSerial = (snap.numeroSerie || report.numeroSerie || '').trim();
  const defibId = report.defibId || snap.id;
  const origDefib = (defibrillateurs || []).find((d: any) => d.id === defibId || d.identifiant === defibId);
  const origSerial = (origDefib?.numeroSerie || report.originalNumeroSerie || snap.originalNumeroSerie || '').trim();
  if (origSerial && enteredSerial && origSerial.toLowerCase() !== enteredSerial.toLowerCase()) {
    bullets.push('— Le numéro de série entré est différent de celui initialement renseigné.');
  }

  // 8. Intervention impossible
  const isImpossible = 
    snap.conforme === 'Intervention impossible' || 
    report.conforme === 'Intervention impossible' || 
    report.statutMaintenance === 'IMPOSSIBLE' || 
    report.interventionImpossible === 'Oui' || 
    report.missionImpossible === 'Oui';
  
  if (isImpossible) {
    const reasonText = report.techCommentaireArrivee || snap.commentaire || report.commentaireChangement || report.reasonImpossible || report.reason_text_value || 'Raison non spécifiée';
    bullets.push(`— Intervention impossible car : ${reasonText}.`);
  }

  // 9. Pourcentage batterie invalide (doit être entre 20% et 100%)
  const pctStr = snap.pourcentageBatterie !== undefined && snap.pourcentageBatterie !== null ? String(snap.pourcentageBatterie).trim() : (report.pourcentageBatterie !== undefined && report.pourcentageBatterie !== null ? String(report.pourcentageBatterie).trim() : '');
  if (pctStr !== '') {
    const pctVal = parseInt(pctStr, 10);
    if (isNaN(pctVal) || pctVal < 20 || pctVal > 100) {
      bullets.push('— La valeur semble invalide pour Pourcentage de charge de la batterie (doit être entre 20% et 100%).');
    }
  }

  // 10. Matériel inter-changé par le client
  if (report.materielInterchangeClient === 'Oui' || snap.materielInterchangeClient === 'Oui') {
    bullets.push('— Matériel inter-changé par le client : Oui.');
  }

  // 11. Fourniture d'un matériel de prêt
  if (report.fournitureMaterielPret === 'Oui' || snap.fournitureMaterielPret === 'Oui') {
    bullets.push('— Fourniture d’un matériel de prêt : Oui.');
  }

  // 12. Facture brouillon non émise alors que matériels remplacés
  const emettreFacture = report.emettreFactureBrouillon || snap.emettreFactureBrouillon;
  if (emettreFacture !== 'Oui') {
    const replacedItems: string[] = [];
    if (report.kitSecoursRemplaceOuAjoute === 'Oui' || snap.kitSecoursRemplaceOuAjoute === 'Oui') replacedItems.push('kit de secours');
    if (report.batterieRemplacee === 'Oui' || snap.batterieRemplacee === 'Oui') replacedItems.push('Batterie');
    if (report.electrodePRemplacee === 'Oui' || snap.electrodePRemplacee === 'Oui') replacedItems.push('Électrode P');
    if (report.electrodePSecoursRemplacee === 'Oui' || snap.electrodePSecoursRemplacee === 'Oui') replacedItems.push('Électrode P Secours');
    if (report.electrodeARemplacee === 'Oui' || snap.electrodeARemplacee === 'Oui') replacedItems.push('Électrode A');
    if (report.electrodeASecoursRemplacee === 'Oui' || snap.electrodeASecoursRemplacee === 'Oui') replacedItems.push('Électrode A Secours');

    if (replacedItems.length > 0) {
      bullets.push(`— Facture brouillon non émise pour : ${replacedItems.join(', ')}.`);
    }
  }

  // 13. Commentaire interne
  const commInt = snap.commentaireInterne || report.commentaireInterne;
  if (commInt && commInt.trim()) {
    bullets.push(`— Commentaire interne : ${commInt.trim()}.`);
  }

  if (bullets.length === 0) {
    return '';
  }

  return `Problème(s) potentiel(s) ou signalement(s):\n${bullets.join('\n')}`;
}
