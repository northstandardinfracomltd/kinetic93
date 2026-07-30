import { Defibrillateur, Client, Variable, OtherEquipment, SupportTicket, CommercialDoc, GedDocument, StockRecord, DistributedStockLocation, VeilleRecord, Member } from './types';

export const REGIONS_FRANCAISES = [
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Bretagne',
  'Centre-Val de Loire',
  'Corse',
  'Grand Est',
  'Hauts-de-France',
  'Île-de-France',
  'Normandie',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Pays de la Loire',
  'Provence-Alpes-Côte d\'Azur'
];

export function generateRandomShortCode(existingIds: string[]): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let attempts = 0;
  
  // Dynamically determine the environment identifier using the short ID
  const tenantIdDigit = typeof window !== 'undefined' 
    ? (localStorage.getItem('defib_short_env_id') || 'D26') 
    : 'D26';

  while (attempts < 1000) {
    const l1 = letters[Math.floor(Math.random() * letters.length)];
    const l2 = letters[Math.floor(Math.random() * letters.length)];
    const l3 = letters[Math.floor(Math.random() * letters.length)];
    const l4 = letters[Math.floor(Math.random() * letters.length)];
    const l5 = letters[Math.floor(Math.random() * letters.length)];
    const l6 = letters[Math.floor(Math.random() * letters.length)];
    const code = `${l1}${l2}${l3}-${tenantIdDigit}-${l4}${l5}${l6}`;
    if (!existingIds.includes(code)) {
      return code;
    }
    attempts++;
  }
  return `SPO-${tenantIdDigit}-DAE`;
}

export function generateRandomPin(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let randLetters = '';
  let randDigits = '';
  for (let i = 0; i < 3; i++) {
    randLetters += letters.charAt(Math.floor(Math.random() * letters.length));
    randDigits += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return `${randLetters}${randDigits}`;
}

export const formatDateWithOffset = (monthsOffset: number, daysOffset: number = 0): string => {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsOffset);
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const INITIAL_CLIENTS: Client[] = [
  {
    id: 'client-demo-1',
    denomination: 'Medical360 Demo',
    siret: '123456',
    email: 'demo1@demo.com',
    phone: '0000000000',
    accessKey: 'DEMO123',
    signaturePin: 'DEMO1',
    typeContact1: 'Direction',
    nomPrenomSite: 'Jean Dupont',
    telephoneSite: '0000000000',
    emailSite: 'demo1@demo.com',
    contrat: 'Oui',
    nomContrat: 'Contrat de maintenance',
    referenceContrat: 'REF-DEMO-01',
    debutContrat: formatDateWithOffset(0),
    finContrat: formatDateWithOffset(12)
  }
];

export const INITIAL_VARIABLES: Variable[] = [
  {
    id: 'CSPG5',
    category: 'Modèle Défibrillateur',
    nom: 'Cardiac Science Powerheart G5',
    marque: 'Cardiac Science',
    description: 'Il s’agit d’un exemple.',
    imageUrl: 'https://civilprom.s3.eu-north-1.amazonaws.com/Cardiac+Science+Powerheart+G5.png'
  },
  {
    id: 'MRP1',
    category: 'Modèle Raison Prestation',
    nom: 'Maintenance 1h Monôme',
    marque: 'Standard',
    description: 'Prestation de maintenance 1h monôme'
  },
  {
    id: 'MRP2',
    category: 'Modèle Raison Prestation',
    nom: 'Installation et formation',
    marque: 'Standard',
    description: 'Prestation d’installation et formation'
  },
  {
    id: 'MRP3',
    category: 'Modèle Raison Prestation',
    nom: 'Visite préventive annuelle',
    marque: 'Standard',
    description: 'Prestation de visite préventive annuelle'
  }
];

export const INITIAL_SPARE_PARTS: any[] = [];

// Seed initial comprehensive Defibrillateurs matching new schema
export const INITIAL_DEFIBRILLATEURS: Defibrillateur[] = [
  {
    id: 'df_1',
    identifiant: 'SPO-D26-DAE',
    numeroSerie: 'SN-G5-998124',
    commentaire: 'Défibrillateur principal de démonstration.',
    modeleId: 'CSPG5', // Cardiac Science Powerheart G5
    clientId: 'c1', // Medical360 - SPO
    nomPrenomSite: 'Jean-Marc DUPONT',
    telephoneSite: '+33 6 12 34 56 78',
    emailSite: 'jm.dupont@secours-ouest.fr',
    contrat: 'Oui',
    nomContrat: 'Abonnement Maintenance Premium',
    referenceContrat: 'REF-2026-SPO',
    debutContrat: '2026-01-01',
    finContrat: '2029-12-31',
    modeleCoffretId: '',
    numeroLotCoffret: '',
    commentaireCoffret: '',
    numVoie: '12 Rue de la Paix',
    ville: 'Paris',
    cp: '75001',
    region: 'Île-de-France',
    pays: 'France',
    latitude: '48.869',
    longitude: '2.332',
    commentaireAdresse: 'Près de l\'accueil principal',
    acces247: true,
    accesSemaine: true,
    accesWeekend: true,
    exterieur: false,
    finGarantie: '2031-01-01',
    fabrication: '2025-12-01',
    miseEnService: '2026-01-01',
    derniereMaintenance: '2026-06-01',
    sortieFabricant: '2025-12-10',
    modeleElectrodeAId: '',
    lotElectrodeA: '',
    insertionElectrodeA: '',
    peremptionElectrodeA: '',
    livraisonElectrodeA: '',
    situationElectrodeA: 'Vert',
    commentaireElectrodeA: '',
    peremptionSecoursElectrodeA: '',
    modeleElectrodePId: '',
    lotElectrodeP: '',
    insertionElectrodeP: '',
    peremptionElectrodeP: '',
    livraisonElectrodeP: '',
    situationElectrodeP: 'Vert',
    commentaireElectrodeP: '',
    peremptionSecoursElectrodeP: '',
    modeleBatterieId: '',
    lotBatterie: '',
    insertionBatterie: '',
    peremptionBatterie: '',
    peremptionTrousse: '',
    livraisonBatterie: '',
    situationBatterie: 'Vert',
    pourcentageBatterie: '100',
    commentaireBatterie: '',
    loue: 'Non',
    prete: 'Non',
    stocke: 'Non',
    archive: 'Non',
    conforme: 'Oui',
    sousTraitance: 'Non',
    fsmAutorise: 'Oui',
    victimeSurvie: 'Non',
    victimeSansSurvie: 'Non',
    ageVictime: '0',
    commentaireCampagneRappel: ''
  }
];

export const DEPRECATED_INITIAL_DEFIBRILLATEURS: Defibrillateur[] = [
  {
    id: 'df_1',
    identifiant: 'PAR-101',
    numeroSerie: 'SN-00918239',
    commentaire: 'Défibrillateur principal situé au rez-de-chaussée près du guichet de sécurité.',
    modeleId: 'v_def_2', // HeartStart HS1
    clientId: 'c3',
    nomPrenomSite: 'Robert PASCAL',
    telephoneSite: '+33 5 56 10 20 31',
    emailSite: 'r.pascal@bordeaux-mairie.fr',
    contrat: 'Non',
    nomContrat: 'Aucun contrat',
    referenceContrat: '-',
    debutContrat: '',
    finContrat: '',
    modeleCoffretId: 'v_cof_1',
    numeroLotCoffret: 'LOT-COF-202a',
    commentaireCoffret: 'Serrure magnétique fonctionnelle. Pas d\'anomalies constatées.',
    numVoie: '12 Place Pey Berland',
    ville: 'Bordeaux',
    cp: '33000',
    region: 'Nouvelle-Aquitaine',
    pays: 'France',
    latitude: '44.8378',
    longitude: '-0.5792',
    commentaireAdresse: 'En intérieur, panneau mural visible depuis la rue.',
    acces247: false,
    accesSemaine: true,
    accesWeekend: false,
    exterieur: false,
    finGarantie: '2029-05-15',
    fabrication: '2024-05-10',
    miseEnService: '2024-06-01',
    derniereMaintenance: '2025-06-12',
    sortieFabricant: '2024-05-20',
    modeleElectrodeAId: 'v_el_2',
    lotElectrodeA: 'LOTA-99824',
    insertionElectrodeA: '2024-06-01',
    peremptionElectrodeA: '2027-06-01',
    livraisonElectrodeA: '2024-05-25',
    situationElectrodeA: 'Vert',
    commentaireElectrodeA: 'Neuves lors de l\'installation initiale.',
    peremptionSecoursElectrodeA: '2028-01-10',
    modeleElectrodePId: 'v_el_p_1',
    lotElectrodeP: 'LOTP-11234',
    insertionElectrodeP: '2024-06-01',
    peremptionElectrodeP: '2026-12-01',
    livraisonElectrodeP: '2024-05-25',
    situationElectrodeP: 'Orange',
    commentaireElectrodeP: 'Nécessitera une attention à la fin de l\'année.',
    peremptionSecoursElectrodeP: '2027-03-15',
    modeleBatterieId: 'v_bat_2',
    lotBatterie: 'LOTB-00912',
    insertionBatterie: '2024-06-01',
    peremptionBatterie: '2028-06-01',
    livraisonBatterie: '2024-05-25',
    situationBatterie: 'Vert',
    pourcentageBatterie: '92',
    commentaireBatterie: 'Tension normale confirmée par l\'appareil.',
    loue: 'Non',
    prete: 'Non',
    stocke: 'Non',
    archive: 'Non',
    conforme: 'Oui',
    sousTraitance: 'Non',
    fsmAutorise: 'Oui',
    victimeSurvie: 'Non',
    victimeSansSurvie: 'Non',
    ageVictime: '0',
    commentaireCampagneRappel: 'Aucune campagne de rappel signalée pour ce numéro de série.',
  },
  {
    id: 'df_2',
    identifiant: 'PAR-102',
    numeroSerie: 'SN-77291102',
    commentaire: 'Défibrillateur externe chauffé dans le hall sportif principal.',
    modeleId: 'v_def_1', // Lifeline AED
    clientId: 'c1',
    nomPrenomSite: 'Jean-Marc DUPONT',
    telephoneSite: '+33 6 12 34 56 78',
    emailSite: 'jm.dupont@secours-ouest.fr',
    contrat: 'Oui',
    nomContrat: 'Abonnement Maintenance Premium',
    referenceContrat: 'REF-2026-SPO',
    debutContrat: '2026-01-01',
    finContrat: '2029-12-31',
    modeleCoffretId: 'v_cof_2',
    numeroLotCoffret: 'LOT-COF-303c',
    commentaireCoffret: 'Coffret alimenté, test témoin chauffage validé.',
    numVoie: '44 Rue du Général de Gaulle',
    ville: 'Nantes',
    cp: '44000',
    region: 'Pays de la Loire',
    pays: 'France',
    latitude: '47.2184',
    longitude: '-1.5536',
    commentaireAdresse: 'Rattaché au mur mitoyen au terrain de football.',
    acces247: true,
    accesSemaine: false,
    accesWeekend: false,
    exterieur: true,
    finGarantie: '2030-03-20',
    fabrication: '2025-02-15',
    miseEnService: '2025-03-01',
    derniereMaintenance: '2026-02-28',
    sortieFabricant: '2025-02-20',
    modeleElectrodeAId: 'v_el_1',
    lotElectrodeA: 'LOTA-1109A',
    insertionElectrodeA: '2025-03-01',
    peremptionElectrodeA: '2028-03-01',
    livraisonElectrodeA: '2025-02-27',
    situationElectrodeA: 'Vert',
    commentaireElectrodeA: 'Sachet stérile non percé.',
    peremptionSecoursElectrodeA: '',
    modeleElectrodePId: 'v_el_p_1',
    lotElectrodeP: 'LOTP-992B',
    insertionElectrodeP: '2025-03-01',
    peremptionElectrodeP: '2026-03-01',
    livraisonElectrodeP: '2025-02-27',
    situationElectrodeP: 'Rouge',
    commentaireElectrodeP: 'ATTENTION : Électrodes pédiatriques périmées, renouvellement commandé.',
    peremptionSecoursElectrodeP: '',
    modeleBatterieId: 'v_bat_1',
    lotBatterie: 'LOTB-9981K',
    insertionBatterie: '2025-03-01',
    peremptionBatterie: '2030-03-01',
    livraisonBatterie: '2025-02-27',
    situationBatterie: 'Vert',
    pourcentageBatterie: '82',
    commentaireBatterie: 'Indicateur de charge stable.',
    loue: 'Oui',
    prete: 'Non',
    stocke: 'Non',
    archive: 'Non',
    conforme: 'Non',
    sousTraitance: 'Non',
    fsmAutorise: 'Non',
    victimeSurvie: 'Oui',
    victimeSansSurvie: 'Non',
    ageVictime: '54',
    commentaireCampagneRappel: '',
  },
  {
    id: 'df_3',
    identifiant: 'PAR-103',
    numeroSerie: 'SN-33928131',
    commentaire: 'DAE Place de la République, fixé sur le pilier ouest.',
    modeleId: 'v_def_3',
    clientId: 'c3',
    nomPrenomSite: 'Jean-Pierre MOREAU',
    telephoneSite: '+33 5 56 10 20 32',
    emailSite: 'jp.moreau@bordeaux-mairie.fr',
    contrat: 'Oui',
    nomContrat: 'Maintenance de Base',
    referenceContrat: 'REF-BOR-2026',
    debutContrat: '2026-02-01',
    finContrat: '2028-02-01',
    modeleCoffretId: 'v_cof_1',
    numeroLotCoffret: 'LOT-COF-110b',
    commentaireCoffret: 'Propre, pas d\'anomalies.',
    numVoie: 'Place de la République',
    ville: 'Bordeaux',
    cp: '33000',
    region: 'Nouvelle-Aquitaine',
    pays: 'France',
    latitude: '44.8350',
    longitude: '-0.5750',
    commentaireAdresse: 'Pilier principal.',
    acces247: true,
    accesSemaine: false,
    accesWeekend: false,
    exterieur: true,
    finGarantie: '2031-01-10',
    fabrication: '2026-01-05',
    miseEnService: '2026-01-20',
    derniereMaintenance: '2026-01-20',
    sortieFabricant: '2026-01-10',
    modeleElectrodeAId: 'v_el_1',
    lotElectrodeA: 'LOTA-120A',
    insertionElectrodeA: '2026-01-20',
    peremptionElectrodeA: '2029-01-20',
    livraisonElectrodeA: '2026-01-15',
    situationElectrodeA: 'Vert',
    commentaireElectrodeA: 'Sachet OK.',
    peremptionSecoursElectrodeA: '',
    modeleElectrodePId: 'v_el_p_1',
    lotElectrodeP: 'LOTP-550A',
    insertionElectrodeP: '2026-01-20',
    peremptionElectrodeP: '2028-01-20',
    livraisonElectrodeP: '2026-01-15',
    situationElectrodeP: 'Vert',
    commentaireElectrodeP: 'En place.',
    peremptionSecoursElectrodeP: '',
    modeleBatterieId: 'v_bat_1',
    lotBatterie: 'LOTB-303A',
    insertionBatterie: '2026-01-20',
    peremptionBatterie: '2031-01-20',
    livraisonBatterie: '2026-01-15',
    situationBatterie: 'Vert',
    pourcentageBatterie: '98',
    commentaireBatterie: 'Piles neuves.',
    loue: 'Non',
    prete: 'Non',
    stocke: 'Non',
    archive: 'Non',
    conforme: 'Oui',
    sousTraitance: 'Non',
    fsmAutorise: 'Oui',
    victimeSurvie: 'Non',
    victimeSansSurvie: 'Non',
    ageVictime: '0',
    commentaireCampagneRappel: '',
  },
  {
    id: 'df_4',
    identifiant: 'PAR-104',
    numeroSerie: 'SN-44918231',
    commentaire: 'Défibrillateur école de Sautron, hall principal.',
    modeleId: 'v_def_2',
    clientId: 'c2',
    nomPrenomSite: 'Sophie BERTRAND',
    telephoneSite: '+33 2 40 44 11 25',
    emailSite: 's.bertrand@sautron-ecole.fr',
    contrat: 'Non',
    nomContrat: 'Aucun contrat',
    referenceContrat: '-',
    debutContrat: '',
    finContrat: '',
    modeleCoffretId: 'v_cof_3',
    numeroLotCoffret: 'LOT-COF-404d',
    commentaireCoffret: 'Serrure sécurisée, OK.',
    numVoie: '18 Rue de la Paix',
    ville: 'Sautron',
    cp: '44880',
    region: 'Pays de la Loire',
    pays: 'France',
    latitude: '47.2639',
    longitude: '-1.6678',
    commentaireAdresse: 'Hall d\'accueil de l\'école primaire.',
    acces247: false,
    accesSemaine: true,
    accesWeekend: false,
    exterieur: false,
    finGarantie: '2028-11-20',
    fabrication: '2023-11-01',
    miseEnService: '2023-11-15',
    derniereMaintenance: '2025-11-15',
    sortieFabricant: '2023-11-05',
    modeleElectrodeAId: 'v_el_2',
    lotElectrodeA: 'LOTA-440B',
    insertionElectrodeA: '2023-11-15',
    peremptionElectrodeA: '2026-11-15',
    livraisonElectrodeA: '2023-11-10',
    situationElectrodeA: 'Vert',
    commentaireElectrodeA: 'Rien à signaler.',
    peremptionSecoursElectrodeA: '',
    modeleElectrodePId: 'v_el_p_1',
    lotElectrodeP: 'LOTP-440P',
    insertionElectrodeP: '2023-11-15',
    peremptionElectrodeP: '2025-11-15',
    livraisonElectrodeP: '2023-11-10',
    situationElectrodeP: 'Rouge',
    commentaireElectrodeP: 'Pédiatriques expirées.',
    peremptionSecoursElectrodeP: '',
    modeleBatterieId: 'v_bat_2',
    lotBatterie: 'LOTB-440Y',
    insertionBatterie: '2023-11-15',
    peremptionBatterie: '2027-11-15',
    livraisonBatterie: '2023-11-10',
    situationBatterie: 'Vert',
    pourcentageBatterie: '45',
    commentaireBatterie: 'La batterie devra être rechargée ou renouvelée l\'année prochaine.',
    loue: 'Non',
    prete: 'Oui',
    stocke: 'Non',
    archive: 'Non',
    conforme: 'Non',
    sousTraitance: 'Non',
    fsmAutorise: 'Oui',
    victimeSurvie: 'Non',
    victimeSansSurvie: 'Non',
    ageVictime: '0',
    commentaireCampagneRappel: '',
  },
  {
    id: 'df_5',
    identifiant: 'PAR-105',
    numeroSerie: 'SN-55819231',
    commentaire: 'DAE Mairie Saint-Herblain, entrée principale.',
    modeleId: 'v_def_1',
    clientId: 'c1',
    nomPrenomSite: 'Claire ALBERT',
    telephoneSite: '+33 2 40 90 22 11',
    emailSite: 'claire.albert@st-herblain.fr',
    contrat: 'Oui',
    nomContrat: 'Contrat Zen',
    referenceContrat: 'REF-STH-2026',
    debutContrat: '2026-03-01',
    finContrat: '2030-03-01',
    modeleCoffretId: 'v_cof_2',
    numeroLotCoffret: 'LOT-COF-505x',
    commentaireCoffret: 'Alarme en service et chauffage fonctionnel.',
    numVoie: 'Avenue de l\'Atlantique',
    ville: 'Saint-Herblain',
    cp: '44800',
    region: 'Pays de la Loire',
    pays: 'France',
    latitude: '47.2105',
    longitude: '-1.6250',
    commentaireAdresse: 'Mairie, entrée du public.',
    acces247: true,
    accesSemaine: false,
    accesWeekend: false,
    exterieur: true,
    finGarantie: '2031-03-15',
    fabrication: '2026-03-01',
    miseEnService: '2026-03-15',
    derniereMaintenance: '2026-03-15',
    sortieFabricant: '2026-03-05',
    modeleElectrodeAId: 'v_el_1',
    lotElectrodeA: 'LOTA-505X',
    insertionElectrodeA: '2026-03-15',
    peremptionElectrodeA: '2029-03-15',
    livraisonElectrodeA: '2026-03-10',
    situationElectrodeA: 'Vert',
    commentaireElectrodeA: 'Parfait état.',
    peremptionSecoursElectrodeA: '',
    modeleElectrodePId: 'v_el_p_1',
    lotElectrodeP: 'LOTP-505P',
    insertionElectrodeP: '2026-03-15',
    peremptionElectrodeP: '2028-03-15',
    livraisonElectrodeP: '2026-03-10',
    situationElectrodeP: 'Vert',
    commentaireElectrodeP: 'Installé.',
    peremptionSecoursElectrodeP: '',
    modeleBatterieId: 'v_bat_1',
    lotBatterie: 'LOTB-505B',
    insertionBatterie: '2026-03-15',
    peremptionBatterie: '2031-03-15',
    livraisonBatterie: '2026-03-10',
    situationBatterie: 'Vert',
    pourcentageBatterie: '100',
    commentaireBatterie: 'Batterie neuve rutilante.',
    loue: 'Non',
    prete: 'Non',
    stocke: 'Non',
    archive: 'Non',
    conforme: 'Oui',
    sousTraitance: 'Non',
    fsmAutorise: 'Oui',
    victimeSurvie: 'Non',
    victimeSansSurvie: 'Non',
    ageVictime: '0',
    commentaireCampagneRappel: '',
  },
];

export function formatDateToFR(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

export function formatDateToMonthYear(dateStr: string): string {
  if (!dateStr || dateStr === '-') return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${month}/${year}`;
  }
  const partsSlash = dateStr.split('/');
  if (partsSlash.length === 3) {
    const [day, month, year] = partsSlash;
    return `${month}/${year}`;
  }
  return dateStr;
}

export function parseFRDateToISO(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateStr;
}

export function computeProchaineMaintenance(derniereMaintenanceStr: string): string {
  if (!derniereMaintenanceStr) return '';
  try {
    const parts = xxxSplitOrRescue(derniereMaintenanceStr);
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const nextYear = year + 1;
      return `${nextYear}-${parts[1]}-${parts[2]}`;
    }
  } catch (e) {}
  return '';
}

function xxxSplitOrRescue(str: string) {
  if (str.includes('/')) {
    const p = str.split('/');
    return [p[2], p[1], p[0]]; // dd/mm/yyyy to yyyy, mm, dd
  }
  return str.split('-');
}

export function exportToCSV(
  defibrillateurs: Defibrillateur[],
  clients: Client[],
  variables: Variable[]
) {
  const clientMap = new Map(clients.map(c => [c.id, c]));

  const headers = [
    "Section 1 — Identification : Identifiant.",
    "Section 1 — Identification : Série.",
    "Section 1 — Identification : Modèle. (Identifiant unique)",
    "Section 1 — Identification : Commentaire.",
    "Section 2 — Client : Client. (Identifiant unique)",
    "Section 2 — Client : Nom et prénom.",
    "Section 2 — Client : Téléphone portable.",
    "Section 2 — Client : Email.",
    "Section 2 — Client : Titre du contrat.",
    "Section 2 — Client : Contrat en cours.",
    "Section 2 — Client : Payeur ID.",
    "Section 2 — Client : Client ID.",
    "Section 2 — Client : Référence du contrat.",
    "Section 2 — Client : Début du contrat.",
    "Section 2 — Client : Expiration du contrat.",
    "Section 3 — Boîtier : Modèle.",
    "Section 3 — Boîtier : Lot.",
    "Section 3 — Boîtier : Commentaire.",
    "Section 4 — Localisation : Numéro et voie.",
    "Section 4 — Localisation : Ville.",
    "Section 4 — Localisation : Code postal.",
    "Section 4 — Localisation : Région.",
    "Section 4 — Localisation : Pays.",
    "Section 4 — Localisation : Latitude.",
    "Section 4 — Localisation : Longitude.",
    "Section 4 — Localisation : Aide d’accès.",
    "Section 5 — Dates : Expiration de garantie.",
    "Section 5 — Dates : Fabrication.",
    "Section 5 — Dates : Mise en service.",
    "Section 5 — Dates : Dernière maintenance.",
    "Section 5 — Dates : Sortie d’usine.",
    "Section 5 — Dates : Prochaine maintenance.",
    "Section 6 — Électrode Adulte ou Mixte : Modèle.",
    "Section 6 — Électrode Adulte ou Mixte : Lot.",
    "Section 6 — Électrode Adulte ou Mixte : Insertion.",
    "Section 6 — Électrode Adulte ou Mixte : Péremption.",
    "Section 6 — Électrode Adulte ou Mixte : Livraison.",
    "Section 6 — Électrode Adulte ou Mixte : Modèle d’électrode de secours.",
    "Section 6 — Électrode Adulte ou Mixte : Lot de l’électrode de secours.",
    "Section 6 — Électrode Adulte ou Mixte : Péremption de l’électrode de secours.",
    "Section 6 — Électrode Adulte ou Mixte : Statut.",
    "Section 6 — Électrode Adulte ou Mixte : Commentaire.",
    "Section 7 — Électrode Pédiatrique : Modèle.",
    "Section 7 — Électrode Pédiatrique : Lot.",
    "Section 7 — Électrode Pédiatrique : Insertion.",
    "Section 7 — Électrode Pédiatrique : Péremption.",
    "Section 7 — Électrode Pédiatrique : Livraison.",
    "Section 7 — Électrode Pédiatrique : Modèle d’électrode de secours.",
    "Section 7 — Électrode Pédiatrique : Lot de l’électrode de secours.",
    "Section 7 — Électrode Pédiatrique : Péremption de l’électrode de secours.",
    "Section 7 — Électrode Pédiatrique : Statut.",
    "Section 7 — Électrode Pédiatrique : Commentaire.",
    "Section 8 — Batterie : Modèle.",
    "Section 8 — Batterie : Lot.",
    "Section 8 — Batterie : Insertion.",
    "Section 8 — Batterie : Péremption.",
    "Section 8 — Batterie : Livraison.",
    "Section 8 — Batterie : Statut.",
    "Section 8 — Batterie : Pourcentage constaté.",
    "Section 8 — Batterie : Commentaire.",
    "Section 9 — Catégories : Loué.",
    "Section 9 — Catégories : Prêté.",
    "Section 9 — Catégories : Stocké.",
    "Section 9 — Catégories : Archivé.",
    "Section 9 — Catégories : Conforme.",
    "Section 9 — Catégories : Opéré en sous-traitance.",
    "Section 9 — Catégories : Maintenance autorisée."
  ];

  let csvContent = '\uFEFF' + headers.join(';') + '\n';

  defibrillateurs.forEach(df => {
    const cl = clientMap.get(df.clientId);
    const row = [
      df.identifiant || '',
      df.numeroSerie || '',
      df.modeleId || '',
      df.commentaire || '',
      df.clientId || '',
      df.nomPrenomSite || '',
      df.telephoneSite || '',
      df.emailSite || '',
      df.nomContrat || '',
      df.contrat || 'Non',
      df.payeurId || (cl ? cl.payeurId : '') || '',
      df.clientIdField || (cl ? cl.clientIdField : '') || '',
      df.referenceContrat || '',
      df.debutContrat || '',
      df.finContrat || '',
      df.modeleCoffretId || '',
      df.numeroLotCoffret || '',
      df.commentaireCoffret || '',
      df.numVoie || '',
      df.ville || '',
      df.cp || '',
      df.region || '',
      df.pays || '',
      df.latitude || '',
      df.longitude || '',
      df.commentaireAdresse || '',
      df.finGarantie || '',
      df.fabrication || '',
      df.miseEnService || '',
      df.derniereMaintenance || '',
      df.sortieFabricant || '',
      computeProchaineMaintenance(df.derniereMaintenance),
      df.modeleElectrodeAId || '',
      df.lotElectrodeA || '',
      df.insertionElectrodeA || '',
      df.peremptionElectrodeA || '',
      df.livraisonElectrodeA || '',
      df.modeleElectrodeASecoursId || '',
      df.lotElectrodeASecours || '',
      df.peremptionSecoursElectrodeA || '',
      df.situationElectrodeA || 'Vert',
      df.commentaireElectrodeA || '',
      df.modeleElectrodePId || '',
      df.lotElectrodeP || '',
      df.insertionElectrodeP || '',
      df.peremptionElectrodeP || '',
      df.livraisonElectrodeP || '',
      df.modeleElectrodePSecoursId || '',
      df.lotElectrodePSecours || '',
      df.peremptionSecoursElectrodeP || '',
      df.situationElectrodeP || 'Vert',
      df.commentaireElectrodeP || '',
      df.modeleBatterieId || '',
      df.lotBatterie || '',
      df.insertionBatterie || '',
      df.peremptionBatterie || '',
      df.livraisonBatterie || '',
      df.situationBatterie || 'Vert',
      df.pourcentageBatterie || '100',
      df.commentaireBatterie || '',
      df.loue || 'Non',
      df.prete || 'Non',
      df.stocke || 'Non',
      df.archive || 'Non',
      df.conforme || 'Oui',
      df.sousTraitance || 'Non',
      df.fsmAutorise || 'Non'
    ];
    csvContent += row.map(val => {
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(';') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `export_defibrillateurs_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export const INITIAL_OTHER_EQUIPMENTS: OtherEquipment[] = [];

export const INITIAL_TICKETS: SupportTicket[] = [];

export const INITIAL_COMMERCIAL_DOCS: CommercialDoc[] = [];

export const INITIAL_GED_DOCS: GedDocument[] = [];

export const INITIAL_STOCKS: StockRecord[] = [];

export const INITIAL_DISTRIBUTED_STOCKS: DistributedStockLocation[] = [];

export const INITIAL_REVIEWS: any[] = [];

export const INITIAL_EXPENSES: any[] = [];

export const INITIAL_VEILLES: VeilleRecord[] = [];

export const INITIAL_REPORTS: any[] = [];

export const INITIAL_TOURS: any[] = [
  {
    id: 'fsm-tour-demo',
    title: 'Exemple de tournée.',
    techName: 'Jakub Démo',
    startDate: formatDateWithOffset(0, 10),
    status: 'À faire',
    missions: [
      {
        id: 'fsm-m-demo',
        clientName: 'Medical360 - SPO',
        defibIdentifiant: 'SPO-D26-DAE',
        reason: 'Maintenance',
        requiredParts: [],
        status: 'À faire',
        priority: 'Normale',
        time: '14:00'
      }
    ]
  }
];

export const INITIAL_MEMBERS: Member[] = [
  {
    name: 'Jakub Démo',
    email: 'techniciendemo1@demo.com',
    role: 'Technicien',
    pin: '1034',
    startAddress: 'Véhicule A',
    status: 'Actif',
    lastActive: 'En ligne'
  }
];

export function getLocationCustomName(originalName: string, customMap?: Record<string, string>): string {
  if (!originalName) return originalName || '';
  if (customMap && customMap[originalName]) return customMap[originalName];
  if (typeof window === 'undefined') return originalName;
  const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
  try {
    const saved = localStorage.getItem(`defib_${tenantId}_custom_location_names`) || localStorage.getItem(`defib_${tenantId}_location_names`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && parsed[originalName]) {
        return parsed[originalName];
      }
    }
  } catch (e) {
    // Ignore
  }
  return originalName;
}

export function getCapsuleBgColor(dateStr: string): string {
  if (!dateStr) return 'black';
  let date: Date | null = null;
  const partsDash = dateStr.split('-');
  if (partsDash.length === 3) {
    const [year, month, day] = partsDash.map(Number);
    date = new Date(year, month - 1, day);
  } else {
    const partsSlash = dateStr.split('/');
    if (partsSlash.length === 3) {
      const [day, month, year] = partsSlash.map(Number);
      date = new Date(year, month - 1, day);
    }
  }

  if (!date || isNaN(date.getTime())) return 'black';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffTime = date.getTime() - today.getTime();
  if (diffTime < 0) {
    return '#dc2626'; // Expired -> rouge
  }

  const threeMonthsMs = 3 * 30.44 * 24 * 60 * 60 * 1000;
  const sixMonthsMs = 6 * 30.44 * 24 * 60 * 60 * 1000;

  if (diffTime < threeMonthsMs) {
    return '#ea580c'; // Under 3 months -> orange
  } else if (diffTime <= sixMonthsMs) {
    return '#2563eb'; // Between 3 and 6 months -> bleu
  } else {
    return 'black'; // Above 6 months -> noir
  }
}


