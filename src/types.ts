export interface SignaturePin {
  code: string;
  createdAt: string;
  status: 'émis' | 'validé';
  validatedAt?: string;
  reportTitle?: string;
}

export interface Client {
  id: string;
  denomination: string;
  siret: string; // Numéro d'enregistrement de l'entreprise
  email: string;
  phone: string;
  accessKey?: string; // Clé d'accès pour le portail client
  signaturePin?: string; // Single signature PIN code valid for all interventions
  signaturePins?: SignaturePin[]; // Array of signature pin codes for validation
  clientSignatureImage?: string; // Signature drawing saved by the client in their portal
  
  // Site Information & Contract details for autopopulation
  nomPrenomSite: string;
  telephoneSite: string;
  emailSite: string;
  contrat: 'Oui' | 'Non';
  nomContrat: string;
  referenceContrat: string;
  debutContrat: string;
  finContrat: string;
  numeroMarche?: string;

  typeContact1?: string;
  typeContact2?: string;
  typeContact3?: string;
  typeContact4?: string;
  typeContact5?: string;
  nomContact2?: string;
  telephoneSite2?: string;
  emailSite2?: string;
  nomContact3?: string;
  telephoneSite3?: string;
  emailSite3?: string;
  nomContact4?: string;
  telephoneSite4?: string;
  emailSite4?: string;
  nomContact5?: string;
  telephoneSite5?: string;
  emailSite5?: string;
  commentaire?: string;
  redactionContrat?: string;
  dateSignatureContrat?: string;
  signeParContrat?: string;
  signatureClientContratImage?: string;
  payeurId?: string;
  clientIdField?: string;
  valeurContrat?: string;
}

export type VariableCategory = 'Modèle Défibrillateur' | 'Modèle Coffret' | 'Modèle Électrode' | 'Modèle Batterie' | 'Modèle Contrat' | 'Modèle Service' | 'Fournisseur' | 'Modèle Raison Prestation' | 'Drapeau GMAO' | 'Drapeau post-intervention' | 'Type Filtre Purificateur' | 'Modèle Filtre Purificateur';

export interface Variable {
  id: string;
  nom: string;
  marque: string;
  description: string;
  category: VariableCategory;
  imageUrl?: string; // Appliqué si category === 'Modèle Défibrillateur'
  couleurHex?: string; // Appliqué si category === 'Drapeau GMAO' ou 'Drapeau post-intervention'
  identifiant?: string;
  rappelAlerteOption?: string;
  rappelDateDebut?: string;
  rappelDateFin?: string;
  rappelObservation?: string;

  // Modèle de défibrillateur custom visibility configurations
  visibiliteNumeroAtlasante?: 'Oui' | 'Non';
  visibiliteVersionLogiciel?: 'Oui' | 'Non';
  visibiliteFactureBrouillon?: 'Oui' | 'Non';
  visibilitePadPakAdulte?: 'Oui' | 'Non';
  visibiliteLotPadPakA?: 'Oui' | 'Non';
  visibilitePeremptionPadPakA?: 'Oui' | 'Non';
  visibiliteLotP?: 'Oui' | 'Non';
  visibilitePadPakPediatrique?: 'Oui' | 'Non';
  visibiliteLotPadPakP?: 'Oui' | 'Non';
  visibilitePeremptionPadPakP?: 'Oui' | 'Non';
  visibiliteFabricationBatterie?: 'Oui' | 'Non';
  visibiliteInsertionBatterie?: 'Oui' | 'Non';
  visibilitePeremptionBatterie?: 'Oui' | 'Non';
  visibilitePourcentageBatterie?: 'Oui' | 'Non';
  visibiliteGantsPresents?: 'Oui' | 'Non';
  visibilitePeremptionServiettes?: 'Oui' | 'Non';
  visibiliteServiettesPresentes?: 'Oui' | 'Non';
  visibilitePeremptionMasque?: 'Oui' | 'Non';
  visibiliteMasquePresent?: 'Oui' | 'Non';
  visibiliteCiseauxPresents?: 'Oui' | 'Non';
  visibilitePeremptionTrousse?: 'Oui' | 'Non';
  visibiliteRasoir?: 'Oui' | 'Non';
  visibiliteBranchementElectrodes?: 'Oui' | 'Non';
  visibiliteGuidesVocaux?: 'Oui' | 'Non';
  visibiliteMessageNumeriqueConforme?: 'Oui' | 'Non';
  visibiliteEquipeMessageNumerique?: 'Oui' | 'Non';
  visibiliteVoyantConforme?: 'Oui' | 'Non';
  visibiliteNettoyage?: 'Oui' | 'Non';
  visibilitePiecesJointes?: 'Oui' | 'Non';
  infosTechnicien?: string;
}

export interface Defibrillateur {
  id: string;
  
  // Section 1 - Défibrillateur
  identifiant: string; // Unique short code, format format AAA-111
  numeroSerie: string;
  commentaire: string;
  commentaireInterne?: string;
  modeleId: string; // Lookup Variable category 'Modèle Défibrillateur'
  numeroAtlasante?: string;
  versionLogiciel?: string;
  
  // Section 2 - Client
  clientId: string; // Lookup Client
  nomSite?: string; // Nom du site
  categorieEtablissement?: string; // Catégorie d'établissement
  nomPrenomSite: string;
  telephoneSite: string;
  emailSite: string;
  contrat: 'Oui' | 'Non';
  nomContrat: string;
  referenceContrat: string;
  debutContrat: string;
  finContrat: string;
  payeurId?: string;
  clientIdField?: string;

  // Section 3 - Coffret
  modeleCoffretId: string; // Lookup Variable category 'Modèle Coffret'
  numeroLotCoffret: string;
  commentaireCoffret: string;

  // Section 4 - Accès
  numVoie: string;
  ville: string;
  cp: string;
  region: string;
  pays: string;
  latitude: string;
  longitude: string;
  commentaireAdresse: string;
  acces247: boolean;
  accesSemaine: boolean;
  accesWeekend: boolean;
  exterieur: boolean;
  horaires?: string;

  // Section 5 - Dates
  finGarantie: string;
  fabrication: string;
  miseEnService: string;
  derniereMaintenance: string;
  sortieFabricant: string;

  // Section 6 - Électrode Mixte ou Adulte (A)
  hasElectrodeASecours?: 'Oui' | 'Non';
  modeleElectrodeAId: string; // Lookup Variable category 'Modèle Électrode'
  lotElectrodeA: string;
  insertionElectrodeA: string;
  peremptionElectrodeA: string;
  livraisonElectrodeA: string;
  situationElectrodeA: 'Vert' | 'Orange' | 'Rouge';
  commentaireElectrodeA: string;
  peremptionSecoursElectrodeA: string;
  modeleElectrodeASecoursId?: string;
  lotElectrodeASecours?: string;
  hasPadpakA?: 'Oui' | 'Non';
  lotPadpakA?: string;
  peremptionPadpakA?: string;

  // Section 7 - Électrode Pédiatrique (P)
  hasElectrodePSecours?: 'Oui' | 'Non';
  modeleElectrodePId: string; // Lookup Variable category 'Modèle Électrode'
  lotElectrodeP: string;
  insertionElectrodeP: string;
  peremptionElectrodeP: string;
  livraisonElectrodeP: string;
  situationElectrodeP: 'Vert' | 'Orange' | 'Rouge';
  commentaireElectrodeP: string;
  peremptionSecoursElectrodeP: string;
  modeleElectrodePSecoursId?: string;
  lotElectrodePSecours?: string;
  hasPadpakP?: 'Oui' | 'Non';
  lotPadpakP?: string;
  peremptionPadpakP?: string;

  // Section 8 - Batterie (B)
  hasBatterieSecours?: 'Oui' | 'Non';
  modeleBatterieId: string; // Lookup Variable category 'Modèle Batterie'
  lotBatterie: string;
  insertionBatterie: string;
  fabricationBatterie?: string;
  peremptionBatterie: string;
  livraisonBatterie: string;
  situationBatterie: 'Vert' | 'Orange' | 'Rouge';
  pourcentageBatterie: string; // Deux chiffres max (0-99/100)
  commentaireBatterie: string;
  modeleBatterieSecoursId?: string;
  lotBatterieSecours?: string;
  peremptionBatterieSecours?: string;
  peremptionTrousse?: string;

  // Section 9 - Catégories
  loue: 'Oui' | 'Non';
  prete: 'Oui' | 'Non';
  stocke: 'Oui' | 'Non';
  archive: 'Oui' | 'Non';
  conforme: 'Oui' | 'Non';
  sousTraitance: 'Oui' | 'Non';
  fsmAutorise: 'Oui' | 'Non';
  victimeSurvie: 'Oui' | 'Non';
  victimeSansSurvie: 'Oui' | 'Non';
  ageVictime: string; // deux chiffres
  commentaireCampagneRappel: string;
  rappelMensuelAuto?: 'Oui' | 'Non';
  rappelHebdoAuto?: 'Oui' | 'Non';
  rappelJournalierAuto?: 'Oui' | 'Non';
}

export interface SupportTicket {
  id: string; // e.g. #123456
  identifiant: string;
  objet: 'Défibrillateur utilisé' | 'Défibrillateur endommagé' | 'Défibrillateur hors service' | 'Autre' | 'Formulaire intégré';
  message: string;
  email: string;
  phone: string;
  date: string;
  status: 'Nouveau' | 'En cours' | 'Résolu';
  reponse?: string;
}

export interface MemberSchedule {
  days: string[];
  fermetureMidi: boolean;
  openMorning: string;
  closeMorning: string;
  openAfternoon: string;
  closeAfternoon: string;
  openContinuous: string;
  closeContinuous: string;
  commentaire?: string;
  openForMissions?: boolean;
}

export interface MemberAbsence {
  startDate: string;
  endDate: string;
  commentaire: string;
}

export interface Member {
  name: string;
  role: string;
  email: string;
  status: string;
  lastActive: string;
  pin: string;
  signature?: string;
  locationLink?: string;
  gpsSharingLink?: string;
  adminSubRole?: 'Administrateur' | 'Administration' | 'Planification' | 'Logistique' | 'Comptabilité' | 'Contrôleur' | 'Administrateur & Contrôleur';
  competences?: string[];
  semaineTypique?: MemberSchedule[];
  absences?: MemberAbsence[];
  startAddress?: string;
  startAddressStreet?: string;
  startAddressCity?: string;
  startAddressZip?: string;
  startAddressRegion?: string;
  startAddressCountry?: string;
  startAddressLat?: number;
  startAddressLng?: number;
  optimizationPreference?: 'loin' | 'proche';
  googleCalEmail?: string;
  googleCalId?: string;
}

export interface CompanyInfo {
  name: string;
  logo: string;
  website: string;
  email: string;
  phone: string;
  nomLogiciel?: string;
  conditionsLegalesLink?: string;
  mentionsLegalesFactures?: string;
  customLocationNames?: Record<string, string>;
  enableAutoEmails?: 'Oui' | 'Non';
  enableSatisfactionAvis?: 'Oui' | 'Non';
  enableDevisFactures?: 'Oui' | 'Non';
  gmailPartageLocalisation?: string;
  disableHelpsAndTutorials?: 'Oui' | 'Non';
  hiddenTabs?: string[];
  communicationPortailClient?: string;
  pdfHeaderImg?: string;
  pdfPageHeaderText?: string;
  pdfPageFooterText?: string;
  pdfLastPageInfoText?: string;
  pdfHeaderBgColor?: string;
  pdfCardBorderColor?: string;
  pdfCardBgColor?: string;
  pdfLabelTextColor?: string;
}

export interface PointageLog {
  id: string;
  techName: string;
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  durationSeconds?: number;
  isOngoing: boolean;
  comment?: string;
}

export interface StockMovement {
  id: string;
  type: 'Réapprovisionnement fournisseur' | 'Distribution' | 'Rapatriement' | 'Annulation';
  volume: number;
  date: string;
  statut: 'Préparation' | 'Expédié' | 'Terminé' | 'Annulé';
  bonCommande?: string;
  trackingLink?: string;
  emplacement?: string;
  isCanceled?: boolean;
}

export interface DistributedStockLocation {
  id: string;
  denominationPieceId: string;
  stockId?: string;
  ugs?: string;
  locationName: 'Centrale des stocks' | 'Entrepôt A' | 'Entrepôt B' | 'Entrepôt C' | 'Entrepôt D' | 'Entrepôt E' | 'Entrepôt F' | 'Entrepôt G' | 'Entrepôt H' | 'Entrepôt I' | 'Entrepôt J' | 'Véhicule A' | 'Véhicule B' | 'Véhicule C' | 'Véhicule D' | 'Véhicule E' | 'Véhicule F' | 'Véhicule G' | 'Véhicule H' | 'Véhicule I' | 'Véhicule J';
  volumeDisponible: number;
  volumeReserve: number;
  volumeEntrant: number;
}

export interface StockTraceability {
  id: string;
  movementId: string;
  lotOrSerial: string;
  expirationDate?: string;
  volume: number; // always 1
  situation: 'Disponible' | 'Utilisé' | 'Indisponible' | 'Signalé manquant' | 'Prêté';
  emplacement?: string;
  comment?: string;
  bonCommande?: string;
  client?: string;
  dateEstimee?: string;
  reservationInfo?: string;
}

export interface StockRecord {
  id: string;
  denominationPieceId: string; // ID corresponding to a Variable
  quantite: number;
  quantiteReservee?: number;
  livraisonDate: string;
  reapprovisionnementDate: string;
  valeurAchat: number;
  marge: number;
  prixVenteHt: number;
  stockage: string;
  besoinProjete2Mois?: number;
  besoinProjete2a6Mois?: number;
  totalACommander?: number;
  commentaire?: string;
  mouvements?: StockMovement[];
  ugs?: string;
  traceabilityEnabled?: boolean;
  traceabilities?: StockTraceability[];
  usageRecommandeIds?: string[];
}

export interface CommercialDocItem {
  variableId: string;
  nomPiece: string;
  prixVenteHt: number;
  quantite: number;
  ugs?: string;
}

export interface CommercialDoc {
  id: string;
  ref: string;
  type: 'Devis' | 'Facture' | 'Proforma';
  clientId: string;
  clientDenomination: string;
  items: CommercialDocItem[];
  totalHt: number;
  status: 'Brouillon' | 'Terminé' | 'Accepté' | 'Refusé' | 'Annulé' | 'Supprimé';
  dateStr: string;
  commentaire?: string; // This corresponds to "Remarque." (formerly "Objet ou commentaire.")
  commentaires?: string; // New textarea "Commentaires."
  assignedMemberName?: string;
  hasBonCommande?: boolean;
  bonCommandeReference?: string;
  bonCommandeLivraison?: 'Intervention' | 'Transporteur';
  bonCommandeSituation?: 'Ouvert' | 'Envoyé Terminé' | 'Envoyé Logistique' | 'Terminé';
  bonCommandeEntete?: string;
  codeTaxe?: string;
  payeurId?: string;
  clientIdField?: string;
}

export interface GedDocument {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileSize: string;
  dateStr: string;
  fileContent?: string;
  fileUrl?: string;
}

export interface Memo {
  id: string;
  text: string;
  createdAt: number;
}

export interface OtherEquipment {
  id: string;
  identifiant: string;
  
  // Section 1 - Client
  clientId: string;
  nomPrenomSite: string;
  telephoneSite: string;
  emailSite: string;
  contrat: 'Oui' | 'Non';
  nomContrat: string;
  referenceContrat: string;
  debutContrat: string;
  finContrat: string;
  payeurId?: string;
  clientIdField?: string;

  // Section 2 - Localisation
  numeroVoie: string;
  ville: string;
  codePostal: string;
  region: string;
  pays: string;
  latitude: string;
  longitude: string;
  aideAcces: string;
  accesPermanent: 'Oui' | 'Non';
  accesJoursOuvres: 'Oui' | 'Non';
  accesWeekend: 'Oui' | 'Non';
  installeExterieur: 'Oui' | 'Non';

  // Section 3 - Dates
  expirationGarantie: string;
  fabrication: string;
  miseEnService: string;
  derniereMaintenance: string;
  sortieUsine: string;
  prochaineMaintenance: string;

  // Section 4 - Catégorie
  categorie: string;
  tournee?: string;
  horaires?: string;

  // Section 5 - Champs techniques spécifiques
  specifiques: Record<string, any>;
}

export interface PointageAutoVigilance {
  id: string;
  clientId: string;
  equipementId: string;
  equipementIdentifiant: string;
  equipementNom: string;
  date: string;
  commentaire: 'En fonctionnement et accessible' | 'Problème résolu' | 'Problème non résolu' | 'Problème non résolu et assistance demandée';
  createdAt?: string;
}

export interface AchatFournisseur {
  id: string;
  reference: string; // generated code e.g. BL-2026-1
  orderReference: string; // Commander Ref (free input)
  supplierId: string; // lookup of Variable of type 'Fournisseur'
  supplierName: string; // name cache or name lookup
  comment: string; // free text one line
  pdfUrl?: string; // base64 or file/fake url
  pdfName?: string; // filename of PDF if uploaded
  dateStr: string; // date of order
}

export interface AppNotification {
  id: string;
  category: 'Stocks' | 'Défibrillateurs' | 'Interventions' | 'Factures & Devis' | 'Système';
  title: string;
  timestamp: string; // YYYY-MM-DD HH:mm:ss
  situation: 'Nouveau' | 'En cours' | 'Terminé';
}

export interface VeilleRecord {
  id: string;
  commune: string;
  volume: number;
  mainteneurActuel: string;
  prochaineMaintenance: string; // date string YYYY-MM-DD
  contactNomPrenom: string;
  contactEmail: string;
  contactTelephone: string;
  createdAt?: string; // YYYY-MM-DD HH:mm:ss
}

export interface LogisticsNotification {
  id: string;
  horodatage: string;
  description: string;
  ugs: string;
  commentaire?: string;
}





