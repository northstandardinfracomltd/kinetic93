export function isUpcomingReport(rep: any): boolean {
  if (!rep) return false;
  return Boolean(
    rep.isUpcoming === true ||
      rep.upcoming === true ||
      rep.isFuture === true ||
      rep.status === 'À venir' ||
      rep.status === 'upcoming' ||
      rep.statut === 'À venir' ||
      rep.date === 'À venir' ||
      (typeof rep.id === 'string' && rep.id.startsWith('REP-UPCOMING-'))
  );
}

export function resolveReportVersionActuelle(rep: any, gai?: any): number {
  const rawVal =
    rep?.versionActuelle !== undefined && rep?.versionActuelle !== null && String(rep.versionActuelle).trim() !== ''
      ? rep.versionActuelle
      : gai?._rawSheetRow?.['Version actuelle'] ??
        gai?._rawSheetRow?.['Version actuelle.'] ??
        gai?.versionActuelle;

  if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
    const parsed = parseInt(String(rawVal).trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      if (parsed === 0 && !isUpcomingReport(rep)) {
        return 1;
      }
      return parsed;
    }
  }

  return isUpcomingReport(rep) ? 0 : 1;
}

export function resolveReportLogsChangements(rep: any, gai?: any): string {
  const rawVal =
    rep?.logsChangements !== undefined && rep?.logsChangements !== null && String(rep.logsChangements).trim() !== ''
      ? rep.logsChangements
      : gai?._rawSheetRow?.['Logs Changements'] ??
        gai?._rawSheetRow?.['Logs Changements.'] ??
        gai?.logsChangements ??
        rep?.logsChangements ??
        '';
  return String(rawVal ?? '').trim();
}

export function formatChangeDateDdMmYyyy(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export interface TrackedFieldDef {
  key: string;
  label: string;
  getValue: (rep: any) => string;
}

const cleanStr = (val: any): string => {
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val ? 'Oui' : 'Non';
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (item && typeof item === 'object') {
          return String(item.label || item.name || item.nom || item.url || item.id || '').trim();
        }
        return String(item ?? '').trim();
      })
      .filter(Boolean)
      .join(', ');
  }
  const s = String(val).trim();
  if (s === '-' || s === '—') return '';
  return s;
};

const cleanDateForCompare = (val: any): string => {
  const s = cleanStr(val);
  if (!s) return '';
  const dmy = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const ymd = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return s;
};

const pickField = (rep: any, ...keys: string[]): string => {
  if (!rep) return '';
  const snap = rep.defibSnapshot && typeof rep.defibSnapshot === 'object' ? rep.defibSnapshot : {};
  for (const k of keys) {
    const topVal = rep[k];
    if (topVal !== undefined && topVal !== null && String(topVal).trim() !== '') {
      return cleanStr(topVal);
    }
    const snapVal = snap[k];
    if (snapVal !== undefined && snapVal !== null && String(snapVal).trim() !== '') {
      return cleanStr(snapVal);
    }
  }
  return '';
};

export const REPORT_TRACKED_FIELDS: TrackedFieldDef[] = [
  { key: 'interventionReference', label: 'Référence intervention', getValue: (r) => pickField(r, 'interventionReference', 'reportNumber') },
  { key: 'autreReference', label: 'Autre référence', getValue: (r) => pickField(r, 'autreReference') },
  { key: 'reportTitle', label: 'Titre du document', getValue: (r) => pickField(r, 'reportTitle', 'title') },
  { key: 'reasons', label: 'Raison(s) de la prestation', getValue: (r) => pickField(r, 'reasons', 'reason') },
  { key: 'techName', label: 'Technicien', getValue: (r) => pickField(r, 'techName') },
  { key: 'date', label: 'Horodatage entrant', getValue: (r) => pickField(r, 'date') },
  { key: 'missionSite', label: 'Site de la mission', getValue: (r) => pickField(r, 'missionSite', 'siteMission') },
  { key: 'identifiant', label: 'Identifiant', getValue: (r) => pickField(r, 'defibIdentifiant', 'identifiant') },
  { key: 'numeroSerie', label: 'Série', getValue: (r) => pickField(r, 'numeroSerie') },
  { key: 'modele', label: 'Modèle de défibrillateur', getValue: (r) => pickField(r, 'modele', 'modeleId') },
  { key: 'typeDefibrillateur', label: 'Type de défibrillateur', getValue: (r) => pickField(r, 'typeDefibrillateur') },
  { key: 'numeroAtlasante', label: 'Numéro Atlasanté', getValue: (r) => pickField(r, 'numeroAtlasante') },
  { key: 'versionLogiciel', label: 'Version du logiciel', getValue: (r) => pickField(r, 'versionLogiciel') },
  { key: 'materielInterchangeClient', label: 'Matériel inter-changé par le client', getValue: (r) => pickField(r, 'materielInterchangeClient') },
  { key: 'commentaireChangement', label: 'Commentaire changement', getValue: (r) => pickField(r, 'commentaireChangement') },
  { key: 'fournitureMaterielPret', label: 'Fourniture d’un matériel de prêt', getValue: (r) => pickField(r, 'fournitureMaterielPret', 'pretEnCours') },
  { key: 'selectionMaterielPrete', label: 'Sélection du matériel prêté', getValue: (r) => pickField(r, 'selectionMaterielPrete', 'pretId') },
  { key: 'clientName', label: 'Client', getValue: (r) => pickField(r, 'clientName', 'entreprise', 'clientId') },
  { key: 'nomPrenomSite', label: 'Contact', getValue: (r) => pickField(r, 'nomPrenomSite') },
  { key: 'telephoneSite', label: 'Téléphone du contact', getValue: (r) => pickField(r, 'telephoneSite') },
  { key: 'emailSite', label: 'Email du contact', getValue: (r) => pickField(r, 'emailSite') },
  { key: 'contrat', label: 'Contrat', getValue: (r) => pickField(r, 'contrat') },
  { key: 'referenceContrat', label: 'Référence du contrat', getValue: (r) => pickField(r, 'referenceContrat') },
  { key: 'nomContrat', label: 'Catégorie de contrat', getValue: (r) => pickField(r, 'nomContrat') },
  { key: 'modeleCoffret', label: 'Modèle de boîtier', getValue: (r) => pickField(r, 'modeleCoffret', 'modeleCoffretId') },
  { key: 'numeroLotCoffret', label: 'Lot de boîtier', getValue: (r) => pickField(r, 'numeroLotCoffret') },
  { key: 'coffretRemplace', label: 'Coffret remplacé', getValue: (r) => pickField(r, 'coffretRemplace') },
  { key: 'selectionCoffretRemplace', label: 'Sélection coffret remplacé', getValue: (r) => pickField(r, 'selectionCoffretRemplace') },
  { key: 'origineCoffretInstalle', label: 'Origine coffret installé', getValue: (r) => pickField(r, 'origineCoffretInstalle') },
  { key: 'equipeAlarme', label: 'Équipé d’une alarme', getValue: (r) => pickField(r, 'equipeAlarme') },
  { key: 'alarme', label: 'Alarme fonctionnelle', getValue: (r) => pickField(r, 'alarme') },
  { key: 'armoireConnectee', label: 'Dispositif d’armoire connectée', getValue: (r) => pickField(r, 'armoireConnectee') },
  { key: 'dispositifHandicap', label: 'Dispositif handicap', getValue: (r) => pickField(r, 'dispositifHandicap') },
  { key: 'signaletiqueConforme', label: 'Signalétique conforme', getValue: (r) => pickField(r, 'signaletiqueConforme') },
  { key: 'installeExterieur', label: 'Installé en extérieur', getValue: (r) => pickField(r, 'installeExterieur') },
  { key: 'commentaireCoffret', label: 'Commentaire concernant le boîtier', getValue: (r) => pickField(r, 'commentaireCoffret') },
  { key: 'numVoie', label: 'Voie', getValue: (r) => pickField(r, 'numVoie') },
  { key: 'ville', label: 'Ville', getValue: (r) => pickField(r, 'ville') },
  { key: 'cp', label: 'Code postal', getValue: (r) => pickField(r, 'cp') },
  { key: 'region', label: 'Région', getValue: (r) => pickField(r, 'region') },
  { key: 'pays', label: 'Pays', getValue: (r) => pickField(r, 'pays') },
  { key: 'latitude', label: 'Latitude GPS', getValue: (r) => pickField(r, 'latitude') },
  { key: 'longitude', label: 'Longitude GPS', getValue: (r) => pickField(r, 'longitude') },
  { key: 'acces247', label: 'Accès 24h/24 et 7j/7', getValue: (r) => pickField(r, 'acces247') },
  { key: 'accesSemaine', label: 'Plage horaire en semaine', getValue: (r) => pickField(r, 'accesSemaine') },
  { key: 'accesWeekend', label: 'Plage horaire le weekend', getValue: (r) => pickField(r, 'accesWeekend') },
  { key: 'commentaireAdresse', label: 'Commentaire concernant l’adresse', getValue: (r) => pickField(r, 'commentaireAdresse', 'emplacement') },
  { key: 'fabrication', label: 'Fabrication', getValue: (r) => pickField(r, 'fabrication', '_s5_fabrication') },
  { key: 'preconisationRemplacement', label: 'Préconisation de remplacement', getValue: (r) => pickField(r, 'preconisationRemplacement') },
  { key: 'recommandationPreconisationRemplacement', label: 'Recommandation pour la préconisation de remplacement', getValue: (r) => pickField(r, 'recommandationPreconisationRemplacement') },
  { key: 'miseEnService', label: 'Mise en service', getValue: (r) => pickField(r, 'miseEnService', '_s5_miseEnService') },
  { key: 'finGarantie', label: 'Fin de garantie', getValue: (r) => pickField(r, 'finGarantie') },
  { key: 'sortieFabricant', label: 'Sortie d’usine', getValue: (r) => pickField(r, 'sortieFabricant') },
  { key: 'derniereMaintenance', label: 'Dernière maintenance', getValue: (r) => pickField(r, 'derniereMaintenance') },
  { key: 'prochaineMaintenance', label: 'Prochaine maintenance', getValue: (r) => pickField(r, 'prochaineMaintenance') },
  { key: 'modeleElectrodeA', label: 'Modèle d’électrode A', getValue: (r) => pickField(r, 'modeleElectrodeA', '_s6_modeleElectrodeA', 'modeleElectrodeAId') },
  { key: 'lotElectrodeA', label: 'Lot A', getValue: (r) => pickField(r, 'lotElectrodeA', '_s6_lotElectrodeA') },
  { key: 'peremptionElectrodeA', label: 'Péremption A', getValue: (r) => pickField(r, 'peremptionElectrodeA', '_s6_peremptionElectrodeA') },
  { key: 'insertionElectrodeA', label: 'Insertion A', getValue: (r) => pickField(r, 'insertionElectrodeA', 'fabricationElectrodeA', '_s6_fabricationElectrodeA') },
  { key: 'livraisonElectrodeA', label: 'Livraison A', getValue: (r) => pickField(r, 'livraisonElectrodeA') },
  { key: 'modeleElectrodeSecoursA', label: 'Modèle d’électrode de secours A', getValue: (r) => pickField(r, 'modeleElectrodeSecoursA', '_s6s_modeleElectrodeSecoursA', 'modeleElectrodeASecoursId') },
  { key: 'lotElectrodeSecoursA', label: 'Lot de l’électrode de secours A', getValue: (r) => pickField(r, 'lotElectrodeSecoursA', 'lotElectrodeASecours', '_s6s_lotElectrodeSecoursA') },
  { key: 'peremptionSecoursElectrodeA', label: 'Péremption de l’électrode de secours A', getValue: (r) => pickField(r, 'peremptionSecoursElectrodeA', 'peremptionElectrodeSecoursA', '_s6s_peremptionElectrodeSecoursA') },
  { key: 'electrodeARemplacee', label: 'Électrode A remplacée', getValue: (r) => pickField(r, 'electrodeARemplacee', '_s6_remplaceElectrodeA') },
  { key: 'electrodeAConformeSante', label: 'Électrode A conforme et fonctionnelle', getValue: (r) => pickField(r, 'electrodeAConformeSante') },
  { key: 'origineElectrodeAInstallee', label: 'Origine de l’électrode A installée', getValue: (r) => pickField(r, 'origineElectrodeAInstallee') },
  { key: 'electrodeASecoursRemplacee', label: 'Électrode A Secours remplacée', getValue: (r) => pickField(r, 'electrodeASecoursRemplacee', '_s6s_remplaceElectrodeSecoursA') },
  { key: 'origineElectrodeSecoursAInstallee', label: 'Origine de l’électrode secours A installée', getValue: (r) => pickField(r, 'origineElectrodeSecoursAInstallee') },
  { key: 'hasPadpakA', label: 'PadPak A', getValue: (r) => pickField(r, 'hasPadpakA') },
  { key: 'lotPadpakA', label: 'Lot PadPak A', getValue: (r) => pickField(r, 'lotPadpakA') },
  { key: 'peremptionPadpakA', label: 'Péremption PadPak A', getValue: (r) => pickField(r, 'peremptionPadpakA') },
  { key: 'commentaireElectrodeA', label: 'Commentaire concernant l’électrode A', getValue: (r) => pickField(r, 'commentaireElectrodeA') },
  { key: 'modeleElectrodeP', label: 'Modèle d’électrode P', getValue: (r) => pickField(r, 'modeleElectrodeP', '_s7_modeleElectrodeP', 'modeleElectrodePId') },
  { key: 'lotElectrodeP', label: 'Lot P', getValue: (r) => pickField(r, 'lotElectrodeP', '_s7_lotElectrodeP') },
  { key: 'peremptionElectrodeP', label: 'Péremption P', getValue: (r) => pickField(r, 'peremptionElectrodeP', '_s7_peremptionElectrodeP') },
  { key: 'insertionElectrodeP', label: 'Insertion P', getValue: (r) => pickField(r, 'insertionElectrodeP', 'fabricationElectrodeP', '_s7_fabricationElectrodeP') },
  { key: 'livraisonElectrodeP', label: 'Livraison P', getValue: (r) => pickField(r, 'livraisonElectrodeP') },
  { key: 'modeleElectrodeSecoursP', label: 'Modèle d’électrode de secours P', getValue: (r) => pickField(r, 'modeleElectrodeSecoursP', '_s7s_modeleElectrodeSecoursP', 'modeleElectrodePSecoursId') },
  { key: 'lotElectrodeSecoursP', label: 'Lot de l’électrode de secours P', getValue: (r) => pickField(r, 'lotElectrodeSecoursP', 'lotElectrodePSecours', '_s7s_lotElectrodeSecoursP') },
  { key: 'peremptionSecoursElectrodeP', label: 'Péremption de l’électrode de secours P', getValue: (r) => pickField(r, 'peremptionSecoursElectrodeP', 'peremptionElectrodeSecoursP', '_s7s_peremptionElectrodeSecoursP') },
  { key: 'electrodePRemplacee', label: 'Électrode P remplacée', getValue: (r) => pickField(r, 'electrodePRemplacee', '_s7_remplaceElectrodeP') },
  { key: 'electrodePConformeSante', label: 'Électrode P conforme et fonctionnelle', getValue: (r) => pickField(r, 'electrodePConformeSante') },
  { key: 'origineElectrodePInstallee', label: 'Origine de l’électrode P installée', getValue: (r) => pickField(r, 'origineElectrodePInstallee') },
  { key: 'electrodePSecoursRemplacee', label: 'Électrode P Secours remplacée', getValue: (r) => pickField(r, 'electrodePSecoursRemplacee', '_s7s_remplaceElectrodeSecoursP') },
  { key: 'origineElectrodeSecoursPInstallee', label: 'Origine de l’électrode secours P installée', getValue: (r) => pickField(r, 'origineElectrodeSecoursPInstallee') },
  { key: 'hasPadpakP', label: 'PadPak P', getValue: (r) => pickField(r, 'hasPadpakP') },
  { key: 'lotPadpakP', label: 'Lot PadPak P', getValue: (r) => pickField(r, 'lotPadpakP') },
  { key: 'peremptionPadpakP', label: 'Péremption PadPak P', getValue: (r) => pickField(r, 'peremptionPadpakP') },
  { key: 'commentaireElectrodeP', label: 'Commentaire concernant l’électrode P', getValue: (r) => pickField(r, 'commentaireElectrodeP') },
  { key: 'modeleBatterie', label: 'Modèle de batterie B', getValue: (r) => pickField(r, 'modeleBatterie', '_s8_modeleBatterie', 'modeleBatterieId') },
  { key: 'pourcentageBatterie', label: 'Pourcentage de charge B', getValue: (r) => pickField(r, 'pourcentageBatterie') },
  { key: 'lotBatterie', label: 'Lot B', getValue: (r) => pickField(r, 'lotBatterie', '_s8_lotBatterie') },
  { key: 'peremptionBatterie', label: 'Péremption B', getValue: (r) => pickField(r, 'peremptionBatterie', '_s8_peremptionBatterie') },
  { key: 'fabricationBatterie', label: 'Fabrication B', getValue: (r) => pickField(r, 'fabricationBatterie', '_s8_fabricationBatterie') },
  { key: 'insertionBatterie', label: 'Insertion B', getValue: (r) => pickField(r, 'insertionBatterie', 'miseEnServiceBatterie', '_s8_miseEnServiceBatterie') },
  { key: 'livraisonBatterie', label: 'Livraison B', getValue: (r) => pickField(r, 'livraisonBatterie') },
  { key: 'batterieRemplacee', label: 'Batterie remplacée', getValue: (r) => pickField(r, 'batterieRemplacee', '_s8_remplaceBatterie') },
  { key: 'batterieConformeSante', label: 'Batterie conforme et fonctionnelle', getValue: (r) => pickField(r, 'batterieConformeSante') },
  { key: 'origineBatterieInstallee', label: 'Origine de la batterie installée', getValue: (r) => pickField(r, 'origineBatterieInstallee') },
  { key: 'pourcentageChargeNouvelleBatterie', label: 'Pourcentage de charge nouvelle batterie', getValue: (r) => pickField(r, 'pourcentageChargeNouvelleBatterie') },
  { key: 'commentaireBatterie', label: 'Commentaire concernant la batterie', getValue: (r) => pickField(r, 'commentaireBatterie') },
  { key: 'techConformeArrivee', label: 'Conforme à mon arrivée', getValue: (r) => pickField(r, 'techConformeArrivee') },
  { key: 'techCommentaireArrivee', label: 'Commentaire sur l’état à mon arrivée', getValue: (r) => pickField(r, 'techCommentaireArrivee') },
  { key: 'techNettoyage', label: 'Nettoyage', getValue: (r) => pickField(r, 'techNettoyage') },
  { key: 'techVoyantConforme', label: 'Voyant conforme', getValue: (r) => pickField(r, 'techVoyantConforme') },
  { key: 'techEquipeMessageNumerique', label: 'Équipé d’un message numérique', getValue: (r) => pickField(r, 'techEquipeMessageNumerique') },
  { key: 'techMessageNumeroConforme', label: 'Message numérique conforme', getValue: (r) => pickField(r, 'techMessageNumeroConforme') },
  { key: 'techGuidesVocauxConformes', label: 'Guides vocaux conformes', getValue: (r) => pickField(r, 'techGuidesVocauxConformes') },
  { key: 'techBranchementElectrodesConforme', label: 'Branchement conforme des électrodes', getValue: (r) => pickField(r, 'techBranchementElectrodesConforme') },
  { key: 'techDelivranceChocConforme', label: 'Délivrance de choc conforme', getValue: (r) => pickField(r, 'techDelivranceChocConforme') },
  { key: 'kitTrousseSecoursPresent', label: 'Trousse de secours présente', getValue: (r) => pickField(r, 'kitTrousseSecoursPresent') },
  { key: 'kitPeremption', label: 'Péremption de la trousse', getValue: (r) => pickField(r, 'kitPeremption', 'peremptionTrousse') },
  { key: 'kitSecoursRemplaceOuAjoute', label: 'Kit de secours remplacé ou ajouté', getValue: (r) => pickField(r, 'kitSecoursRemplaceOuAjoute') },
  { key: 'origineKitSecoursInstalle', label: 'Origine du kit de secours installé', getValue: (r) => pickField(r, 'origineKitSecoursInstalle') },
  { key: 'kitCiseauxPresents', label: 'Ciseaux présents', getValue: (r) => pickField(r, 'kitCiseauxPresents') },
  { key: 'kitMasquePresent', label: 'Masque présent', getValue: (r) => pickField(r, 'kitMasquePresent') },
  { key: 'kitPeremptionMasque', label: 'Péremption du masque', getValue: (r) => pickField(r, 'kitPeremptionMasque') },
  { key: 'kitServiettesPresentes', label: 'Serviettes présentes', getValue: (r) => pickField(r, 'kitServiettesPresentes') },
  { key: 'kitPeremptionServiettes', label: 'Péremption des serviettes', getValue: (r) => pickField(r, 'kitPeremptionServiettes') },
  { key: 'kitGantsPresents', label: 'Paires de gants présents', getValue: (r) => pickField(r, 'kitGantsPresents') },
  { key: 'kitRasoirPresent', label: 'Rasoir', getValue: (r) => pickField(r, 'kitRasoirPresent') },
  { key: 'conforme', label: 'Défibrillateur conforme et prêt à l’usage', getValue: (r) => pickField(r, 'conforme') },
  { key: 'diagnosticCommentaire', label: 'Commentaire de diagnostic et de clôture', getValue: (r) => pickField(r, 'diagnosticCommentaire', 'commentaireGmao') },
  { key: 'clientPinCode', label: 'Signature client avec PIN', getValue: (r) => pickField(r, 'clientPinCode') },
  { key: 'endTimeStamp', label: 'Horodatage de clôture', getValue: (r) => pickField(r, 'endTimeStamp') },
  { key: 'demandeDevis', label: 'Demande de devis', getValue: (r) => pickField(r, 'demandeDevis') },
  { key: 'devisAutreInfo', label: 'Précisions pour Autre', getValue: (r) => pickField(r, 'devisAutreInfo') },
  { key: 'devisPriorite', label: 'Priorité', getValue: (r) => pickField(r, 'devisPriorite') },
  { key: 'commentaireInterne', label: 'Commentaire interne', getValue: (r) => pickField(r, 'commentaireInterne', 'internalComment') },
];

export function diffReportFormFields(
  oldRep: any,
  newRep: any,
  context?: { variables?: any[]; clients?: any[] }
): string[] {
  if (!oldRep || !newRep) return [];
  const vars = Array.isArray(context?.variables) ? context!.variables! : [];
  const cls = Array.isArray(context?.clients) ? context!.clients! : [];

  const resolveReadableVal = (fieldKey: string, rawVal: string): string => {
    if (!rawVal) return '';
    if (
      fieldKey === 'modele' ||
      fieldKey === 'modeleCoffret' ||
      fieldKey === 'modeleElectrodeA' ||
      fieldKey === 'modeleElectrodeSecoursA' ||
      fieldKey === 'modeleElectrodeP' ||
      fieldKey === 'modeleElectrodeSecoursP' ||
      fieldKey === 'modeleBatterie'
    ) {
      const foundVar = vars.find((v: any) => v && v.id === rawVal);
      if (foundVar) {
        return foundVar.marque && foundVar.marque !== 'Standard'
          ? `${foundVar.nom} (${foundVar.marque})`
          : String(foundVar.nom || rawVal);
      }
    }
    if (fieldKey === 'clientName') {
      const foundClient = cls.find((c: any) => c && (c.id === rawVal || c.clientIdField === rawVal));
      if (foundClient && foundClient.denomination) {
        return String(foundClient.denomination);
      }
    }
    return rawVal;
  };

  const changes: string[] = [];
  for (const field of REPORT_TRACKED_FIELDS) {
    const oldVal = resolveReadableVal(field.key, field.getValue(oldRep));
    const newVal = resolveReadableVal(field.key, field.getValue(newRep));
    if (oldVal === newVal) continue;
    if (cleanDateForCompare(oldVal) === cleanDateForCompare(newVal)) continue;
    const oldDisplay = oldVal || 'vide';
    const newDisplay = newVal || 'vide';
    changes.push(`— ${field.label} était : ${oldDisplay}, désormais : ${newDisplay}.`);
  }
  return changes;
}

export function computeReportVersionAndChangeLog(
  oldRep: any,
  newRep: any,
  precomputedChangeDescriptions?: string[],
  gaiRecord?: any
): {
  versionActuelle: number;
  logsChangements: string;
  changeDescriptions: string[];
} {
  // 1. If the target report is still "À venir", version is 0
  if (isUpcomingReport(newRep)) {
    return {
      versionActuelle: 0,
      logsChangements: resolveReportLogsChangements(oldRep, gaiRecord),
      changeDescriptions: [],
    };
  }

  // 2. If there was no previous report or the previous report was in "À venir" (or version 0 with no saved date),
  // this is the FIRST save making the report available in Modération => Version actuelle = 1
  const wasFirstSaveFromUpcoming =
    !oldRep ||
    isUpcomingReport(oldRep) ||
    resolveReportVersionActuelle(oldRep, gaiRecord) === 0;

  const existingLogs = resolveReportLogsChangements(oldRep, gaiRecord) || resolveReportLogsChangements(newRep, gaiRecord);

  if (wasFirstSaveFromUpcoming) {
    return {
      versionActuelle: 1,
      logsChangements: existingLogs,
      changeDescriptions: [],
    };
  }

  // 3. Subsequent modification of an already-saved report (version >= 1)
  const prevVersion = Math.max(1, resolveReportVersionActuelle(oldRep, gaiRecord));
  const changeDescriptions =
    Array.isArray(precomputedChangeDescriptions)
      ? precomputedChangeDescriptions
      : diffReportFormFields(oldRep, newRep);

  if (changeDescriptions.length === 0) {
    return {
      versionActuelle: prevVersion,
      logsChangements: existingLogs,
      changeDescriptions: [],
    };
  }

  const nextVersion = prevVersion + 1;
  const datePrefix = formatChangeDateDdMmYyyy(new Date());
  const newLogLine = `${datePrefix} : ${changeDescriptions.join(', ')}`;
  const nextLogs = existingLogs ? `${existingLogs}\n${newLogLine}` : newLogLine;

  return {
    versionActuelle: nextVersion,
    logsChangements: nextLogs,
    changeDescriptions,
  };
}
