import React, { useState, useEffect, useRef } from 'react';
import { Client, Defibrillateur, StockRecord, PointageLog, Variable } from '../types';
import { saveCollectionToFirestore, fetchCollectionFromFirestore } from '../firebase';
import { generateRandomShortCode, computeProchaineMaintenance } from '../utils';
import { t } from '../utils/translate';
import HelpBubble from './HelpBubble';

export interface ImportExportRecord {
  id: string;
  date: string;
  type: 'Importation.' | 'Exportation.';
  categorie: 'Défibrillateurs.' | 'Clients.' | 'Stocks.' | 'Temps.';
  format: 'CSV.';
  csvData?: string;
  expiresAt?: number;
  expirationDate?: string;
}

const INITIAL_RECORDS: ImportExportRecord[] = [
  {
    id: 'rec_1',
    date: '2026-06-10',
    type: 'Importation.',
    categorie: 'Clients.',
    format: 'CSV.',
  },
  {
    id: 'rec_2',
    date: '2026-06-11',
    type: 'Exportation.',
    categorie: 'Défibrillateurs.',
    format: 'CSV.',
  },
  {
    id: 'rec_3',
    date: '2026-06-12',
    type: 'Importation.',
    categorie: 'Stocks.',
    format: 'CSV.',
  }
];

function generateCSV(
  compartment: 'Défibrillateurs.' | 'Clients.' | 'Stocks.' | 'Temps.', 
  data: {
    defibrillateurs: Defibrillateur[];
    clients: Client[];
    stocks: StockRecord[];
    pointages: PointageLog[];
  }
): string {
  let headers: string[] = [];
  let keys: string[] = [];
  let items: any[] = [];

  switch (compartment) {
    case 'Défibrillateurs.':
      items = data.defibrillateurs || [];
      keys = [
        'identifiant', 'numeroSerie', 'modeleId', 'numeroAtlasante', 'commentaire', 'clientId', 
        'nomSite', 'categorieEtablissement', 'nomPrenomSite', 'telephoneSite', 'emailSite', 'nomContrat', 'contrat', 
        'payeurId', 'clientIdField', 'referenceContrat', 'debutContrat', 'finContrat', 
        'modeleCoffretId', 'numeroLotCoffret', 'commentaireCoffret', 'numVoie', 'ville', 
        'cp', 'region', 'pays', 'latitude', 'longitude', 
        'commentaireAdresse', 'finGarantie', 'fabrication', 'miseEnService', 'derniereMaintenance', 
        'sortieFabricant', 'prochaineMaintenance', 'modeleElectrodeAId', 'lotElectrodeA', 'insertionElectrodeA', 
        'peremptionElectrodeA', 'livraisonElectrodeA', 'modeleElectrodeASecoursId', 'lotElectrodeASecours', 'peremptionSecoursElectrodeA', 
        'situationElectrodeA', 'commentaireElectrodeA', 'lotPadpakA', 'peremptionPadpakA', 'modeleElectrodePId', 'lotElectrodeP', 'insertionElectrodeP', 
        'peremptionElectrodeP', 'livraisonElectrodeP', 'modeleElectrodePSecoursId', 'lotElectrodePSecours', 'peremptionSecoursElectrodeP', 
        'situationElectrodeP', 'commentaireElectrodeP', 'lotPadpakP', 'peremptionPadpakP', 'modeleBatterieId', 'lotBatterie', 'insertionBatterie', 
        'peremptionBatterie', 'livraisonBatterie', 'situationBatterie', 'pourcentageBatterie', 'commentaireBatterie', 
        'loue', 'prete', 'stocke', 'archive', 'conforme', 
        'sousTraitance', 'fsmAutorise'
      ];
      headers = [
        "Section 1 — Identification : Identifiant.",
        "Section 1 — Identification : Série.",
        "Section 1 — Identification : Modèle. (Identifiant unique)",
        "Section 1 — Identification : Numero Atlasante.",
        "Section 1 — Identification : Commentaire.",
        "Section 2 — Client : Client. (Identifiant unique)",
        "Section 2 — Client : Site.",
        "Section 2 — Client : Categorie etablissement.",
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
        "Section 6 — Électrode Adulte ou Mixte : Lot PadPak A.",
        "Section 6 — Électrode Adulte ou Mixte : Péremption PadPak A.",
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
        "Section 7 — Électrode Pédiatrique : Lot PadPak P.",
        "Section 7 — Électrode Pédiatrique :  Péremption PadPak P.",
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
      break;

    case 'Clients.':
      items = data.clients || [];
      keys = [
        'id', 'denomination', 'siret', 'email', 'phone', 'accessKey', 
        'nomPrenomSite', 'telephoneSite', 'emailSite', 'contrat', 
        'nomContrat', 'referenceContrat', 'debutContrat', 'finContrat'
      ];
      headers = [
        "ID Client", "Dénomination", "SIRET", "Email", "Téléphone", "Clé d'Accès", 
        "Nom Prénom Site", "Téléphone Site", "Email Site", "Contrat Actif", 
        "Nom Contrat", "Référence Contrat", "Début Contrat", "Fin Contrat"
      ];
      break;

    case 'Stocks.':
      items = data.stocks || [];
      keys = [
        'id', 'denominationPieceId', 'quantite', 'quantiteReservee', 
        'livraisonDate', 'reapprovisionnementDate', 'valeurAchat', 'marge', 
        'prixVenteHt', 'stockage'
      ];
      headers = [
        "ID Stock", "ID Modèle Pièce", "Quantité", "Quantité Réservée", 
        "Date Livraison", "Date Réapprovisionnement", "Valeur d'Achat (€ HT)", 
        "Marge (%)", "Prix de Vente HT (€)", "Zone de Stockage"
      ];
      break;

    case 'Temps.':
      items = data.pointages || [];
      keys = [
        'id', 'techName', 'startDate', 'startTime', 'endDate', 
        'endTime', 'durationSeconds', 'isOngoing', 'comment'
      ];
      headers = [
        "ID Pointage", "Nom Technicien", "Date Début", "Heure Début", 
        "Date Fin", "Heure Fin", "Durée (secondes)", "En Cours", "Commentaire"
      ];
      break;
  }

  // Generate CSV lines
  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '';
    let str = typeof val === 'boolean' ? (val ? 'Oui' : 'Non') : String(val);
    if (str.includes(';') || str.includes('\n') || str.includes('"')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const lines = [
    headers.join(';'),
    ...items.map(item => keys.map(k => {
      if (k === 'prochaineMaintenance') {
        return escapeCSV(computeProchaineMaintenance(item['derniereMaintenance']));
      }
      return escapeCSV(item[k]);
    }).join(';'))
  ];

  return lines.join('\n');
}

interface ImportExportTabProps {
  tenantId: string;
  isFirebaseLoaded?: boolean;
  defibrillateurs?: Defibrillateur[];
  clients?: Client[];
  stocks?: StockRecord[];
  pointages?: PointageLog[];
  variables?: Variable[];
  saveDefibs?: (newDefibs: Defibrillateur[]) => void;
  saveClients?: (newClients: Client[]) => void;
  saveStocks?: (newStocks: StockRecord[]) => void;
  setActiveTab?: (tab: any) => void;
  dropboxActive?: boolean;
  dropboxAccessToken?: string;
}

// Helper function to robustly parse CSV
function parseCSV(text: string): { headers: string[], rows: string[][] } {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  
  // Detect separator (semicolon or comma)
  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const sep = semicolonCount >= commaCount ? ';' : ',';
  
  const parseRow = (rowText: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < rowText.length; i++) {
      const char = rowText[i];
      if (char === '"') {
        if (inQuotes && rowText[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === sep && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

// Validation & Parsing Helpers
const validateAndParseDefibs = (
  csvText: string,
  currentVars: Variable[],
  existingDefibs: Defibrillateur[]
): { success: boolean; data: Defibrillateur[]; errors: string[] } => {
  const { headers, rows } = parseCSV(csvText);
  const errorsSet = new Set<string>();

  const expected = [
    "Section 1 — Identification : Identifiant.",
    "Section 1 — Identification : Série.",
    "Section 1 — Identification : Modèle. (Identifiant unique)",
    "Section 1 — Identification : Numero Atlasante.",
    "Section 1 — Identification : Commentaire.",
    "Section 2 — Client : Client. (Identifiant unique)",
    "Section 2 — Client : Site.",
    "Section 2 — Client : Categorie etablissement.",
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
    "Section 6 — Électrode Adulte ou Mixte : Lot PadPak A.",
    "Section 6 — Électrode Adulte ou Mixte : Péremption PadPak A.",
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
    "Section 7 — Électrode Pédiatrique : Lot PadPak P.",
    "Section 7 — Électrode Pédiatrique :  Péremption PadPak P.",
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

  if (rows.length < 1) {
    return { success: false, data: [], errors: ["Fichier vide ou sans données."] };
  }

  const normalizeStr = (s: string) => (s || '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim();

  if (headers.length !== expected.length) {
    return { success: false, data: [], errors: ["Nombre de colonnes incorrect dans l'en-tête du fichier."] };
  } else {
    const hMatch = headers.every((h, i) => normalizeStr(h) === normalizeStr(expected[i]));
    if (!hMatch) {
      return { success: false, data: [], errors: ["Les entêtes du fichier CSV ne correspondent pas au format attendu."] };
    }
  }

  const findVar = (val: string, categoryFilter?: string): Variable | undefined => {
    if (!val) return undefined;
    const cleanVal = val.trim();
    if (!cleanVal) return undefined;
    const norm = cleanVal.toLowerCase().replace(/\s+/g, ' ');

    // 1. Direct ID match (exact or normalized)
    let found = (currentVars || []).find(v => v.id === cleanVal || (v.id && v.id.trim().toLowerCase() === norm));
    if (found) return found;

    // 2. Name match with category filter
    if (categoryFilter) {
      found = (currentVars || []).find(v => v.category === categoryFilter && v.nom && v.nom.trim().toLowerCase().replace(/\s+/g, ' ') === norm);
      if (found) return found;
    }

    // 3. Name match across all categories
    found = (currentVars || []).find(v => v.nom && v.nom.trim().toLowerCase().replace(/\s+/g, ' ') === norm);
    return found;
  };

  const parsedItems: Defibrillateur[] = [];
  const existingIds = [...existingDefibs.map(df => df.identifiant)];

  const mapStatusToDb = (val: string): 'Vert' | 'Orange' | 'Rouge' => {
    const trimmed = (val || '').trim();
    if (trimmed === 'Conforme') return 'Vert';
    if (trimmed === 'Attention') return 'Orange';
    if (trimmed === 'Alerte') return 'Rouge';
    return 'Vert';
  };

  const sanitizeYesNo = (val: string, fallback: 'Oui' | 'Non'): 'Oui' | 'Non' => {
    if (val === 'Oui' || val === 'Non') return val;
    return fallback;
  };

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (row.length !== expected.length) {
      continue;
    }

    const identifiant = row[0] ? row[0].trim() : "";
    const serie = row[1] ? row[1].trim() : "";
    const modelVal = row[2] ? row[2].trim() : "";
    const numeroAtlasante = row[3] ? row[3].trim() : "";
    const commentaire = row[4] ? row[4].trim() : "";
    const clientVal = row[5] ? row[5].trim() : "";
    const nomSite = row[6] ? row[6].trim() : "";
    const categorieEtablissement = row[7] ? row[7].trim() : "";
    const nomPrenomSite = row[8] ? row[8].trim() : "";
    const telephoneSite = row[9] ? row[9].trim() : "";
    const emailSite = row[10] ? row[10].trim() : "";
    const nomContrat = row[11] ? row[11].trim() : "";
    const contrat = sanitizeYesNo(row[12] ? row[12].trim() : "", 'Non');
    const payeurId = row[13] ? row[13].trim() : "";
    const clientIdField = row[14] ? row[14].trim() : "";
    const referenceContrat = row[15] ? row[15].trim() : "";
    const debutContrat = row[16] ? row[16].trim() : "";
    const finContrat = row[17] ? row[17].trim() : "";
    const modeleCoffretId = row[18] ? row[18].trim() : "";
    const numeroLotCoffret = row[19] ? row[19].trim() : "";
    const commentaireCoffret = row[20] ? row[20].trim() : "";
    const numVoie = row[21] ? row[21].trim() : "";
    const ville = row[22] ? row[22].trim() : "";
    const cp = row[23] ? row[23].trim() : "";
    const region = row[24] ? row[24].trim() : "";
    const pays = row[25] ? row[25].trim() : "";
    const latitude = row[26] ? row[26].trim() : "";
    const longitude = row[27] ? row[27].trim() : "";
    const commentaireAdresse = row[28] ? row[28].trim() : "";
    const finGarantie = row[29] ? row[29].trim() : "";
    const fabrication = row[30] ? row[30].trim() : "";
    const miseEnService = row[31] ? row[31].trim() : "";
    const derniereMaintenance = row[32] ? row[32].trim() : "";
    const sortieFabricant = row[33] ? row[33].trim() : "";
    
    const modeleElectrodeAId = row[35] ? row[35].trim() : "";
    const lotElectrodeA = row[36] ? row[36].trim() : "";
    const insertionElectrodeA = row[37] ? row[37].trim() : "";
    const peremptionElectrodeA = row[38] ? row[38].trim() : "";
    const livraisonElectrodeA = row[39] ? row[39].trim() : "";
    const modeleElectrodeASecoursId = row[40] ? row[40].trim() : "";
    const lotElectrodeASecours = row[41] ? row[41].trim() : "";
    const peremptionSecoursElectrodeA = row[42] ? row[42].trim() : "";
    const situationElectrodeAVal = row[43] ? row[43].trim() : "";
    const commentaireElectrodeA = row[44] ? row[44].trim() : "";
    const lotPadpakA = row[45] ? row[45].trim() : "";
    const peremptionPadpakA = row[46] ? row[46].trim() : "";

    const modeleElectrodePId = row[47] ? row[47].trim() : "";
    const lotElectrodeP = row[48] ? row[48].trim() : "";
    const insertionElectrodeP = row[49] ? row[49].trim() : "";
    const peremptionElectrodeP = row[50] ? row[50].trim() : "";
    const livraisonElectrodeP = row[51] ? row[51].trim() : "";
    const modeleElectrodePSecoursId = row[52] ? row[52].trim() : "";
    const lotElectrodePSecours = row[53] ? row[53].trim() : "";
    const peremptionSecoursElectrodeP = row[54] ? row[54].trim() : "";
    const situationElectrodePVal = row[55] ? row[55].trim() : "";
    const commentaireElectrodeP = row[56] ? row[56].trim() : "";
    const lotPadpakP = row[57] ? row[57].trim() : "";
    const peremptionPadpakP = row[58] ? row[58].trim() : "";

    const modeleBatterieId = row[59] ? row[59].trim() : "";
    const lotBatterie = row[60] ? row[60].trim() : "";
    const insertionBatterie = row[61] ? row[61].trim() : "";
    const peremptionBatterie = row[62] ? row[62].trim() : "";
    const livraisonBatterie = row[63] ? row[63].trim() : "";
    const situationBatterieVal = row[64] ? row[64].trim() : "";
    const pourcentageBatterie = row[65] ? row[65].trim() : "";
    const commentaireBatterie = row[66] ? row[66].trim() : "";
    const loue = row[67] ? row[67].trim() : "";
    const prete = row[68] ? row[68].trim() : "";
    const stocke = row[69] ? row[69].trim() : "";
    const archive = row[70] ? row[70].trim() : "";
    const conforme = row[71] ? row[71].trim() : "";
    const sousTraitance = row[72] ? row[72].trim() : "";
    const fsmAutorise = row[73] ? row[73].trim() : "";

    // Erreur A : Identifiant must be empty
    if (identifiant !== "") {
      errorsSet.add("Erreur A");
    }

    // Erreur B : Série is mandatory
    if (serie === "") {
      errorsSet.add("Erreur B");
    }

    // Resolve Defibrillator Model
    let matchingVar = findVar(modelVal, 'Modèle Défibrillateur');
    if (modelVal !== "") {
      if (!matchingVar) {
        errorsSet.add("Erreur P");
        if (!modelVal.startsWith("v_")) {
          errorsSet.add("Erreur C");
        }
      }
    } else {
      matchingVar = (currentVars || []).find(v => v.category === 'Modèle Défibrillateur');
      if (!matchingVar) {
        errorsSet.add("Erreur P");
      }
    }

    // Client. (Identifiant unique) starts with "c_" (if provided)
    if (clientVal !== "" && !clientVal.startsWith("c_")) {
      errorsSet.add("Erreur D");
    }

    // Resolve Coffret
    const coffretVar = findVar(modeleCoffretId, 'Modèle Coffret');
    const finalCoffretId = coffretVar ? coffretVar.id : modeleCoffretId;
    if (modeleCoffretId !== "" && !coffretVar && !modeleCoffretId.startsWith("v_")) {
      errorsSet.add("Erreur E");
    }

    // Resolve Electrode Adulte
    const elecAVar = findVar(modeleElectrodeAId, 'Modèle Électrode');
    const finalElectrodeAId = elecAVar ? elecAVar.id : modeleElectrodeAId;
    if (modeleElectrodeAId !== "" && !elecAVar && !modeleElectrodeAId.startsWith("v_")) {
      errorsSet.add("Erreur F");
    }

    // Resolve Electrode Adulte Secours
    const elecASecVar = findVar(modeleElectrodeASecoursId, 'Modèle Électrode');
    const finalElectrodeASecoursId = elecASecVar ? elecASecVar.id : modeleElectrodeASecoursId;
    if (modeleElectrodeASecoursId !== "" && !elecASecVar && !modeleElectrodeASecoursId.startsWith("v_")) {
      errorsSet.add("Erreur G");
    }

    // Erreur H : Section 6 — Électrode Adulte ou Mixte : Statut
    if (situationElectrodeAVal !== "" && !["Conforme", "Attention", "Alerte"].includes(situationElectrodeAVal)) {
      errorsSet.add("Erreur H");
    }

    // Resolve Electrode Pédiatrique
    const elecPVar = findVar(modeleElectrodePId, 'Modèle Électrode');
    const finalElectrodePId = elecPVar ? elecPVar.id : modeleElectrodePId;
    if (modeleElectrodePId !== "" && !elecPVar && !modeleElectrodePId.startsWith("v_")) {
      errorsSet.add("Erreur I");
    }

    // Resolve Electrode Pédiatrique Secours
    const elecPSecVar = findVar(modeleElectrodePSecoursId, 'Modèle Électrode');
    const finalElectrodePSecoursId = elecPSecVar ? elecPSecVar.id : modeleElectrodePSecoursId;
    if (modeleElectrodePSecoursId !== "" && !elecPSecVar && !modeleElectrodePSecoursId.startsWith("v_")) {
      errorsSet.add("Erreur J");
    }

    // Erreur K : Section 7 — Électrode Pédiatrique : Statut
    if (situationElectrodePVal !== "" && !["Conforme", "Attention", "Alerte"].includes(situationElectrodePVal)) {
      errorsSet.add("Erreur K");
    }

    // Resolve Batterie
    const batVar = findVar(modeleBatterieId, 'Modèle Batterie');
    const finalBatterieId = batVar ? batVar.id : modeleBatterieId;
    if (modeleBatterieId !== "" && !batVar && !modeleBatterieId.startsWith("v_")) {
      errorsSet.add("Erreur L");
    }

    // Erreur M : Section 8 — Batterie : Statut
    if (situationBatterieVal !== "" && !["Conforme", "Attention", "Alerte"].includes(situationBatterieVal)) {
      errorsSet.add("Erreur M");
    }

    // Erreur N : Section 8 — Batterie : Pourcentage constaté
    if (pourcentageBatterie !== "" && isNaN(Number(pourcentageBatterie))) {
      errorsSet.add("Erreur N");
    }

    // Erreur O : Section 9 categories
    const catVals = [loue, prete, stocke, archive, conforme, sousTraitance, fsmAutorise];
    const invalidCat = catVals.some(v => v !== "" && v !== "Oui" && v !== "Non");
    if (invalidCat) {
      errorsSet.add("Erreur O");
    }

    if (errorsSet.size > 0) {
      continue;
    }

    const assignedIdentifiant = generateRandomShortCode(existingIds);
    existingIds.push(assignedIdentifiant);

    parsedItems.push({
      id: 'df_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000),
      identifiant: assignedIdentifiant,
      numeroSerie: serie,
      modeleId: matchingVar ? matchingVar.id : '',
      numeroAtlasante: numeroAtlasante,
      commentaire: commentaire,
      clientId: clientVal,
      nomSite: nomSite,
      categorieEtablissement: categorieEtablissement,
      nomPrenomSite: nomPrenomSite,
      telephoneSite: telephoneSite,
      emailSite: emailSite,
      contrat: sanitizeYesNo(contrat, 'Non'),
      nomContrat: nomContrat,
      referenceContrat: referenceContrat,
      debutContrat: debutContrat,
      finContrat: finContrat,
      payeurId: payeurId,
      clientIdField: clientIdField,
      modeleCoffretId: finalCoffretId,
      numeroLotCoffret: numeroLotCoffret,
      commentaireCoffret: commentaireCoffret,
      numVoie: numVoie,
      ville: ville,
      cp: cp,
      region: region,
      pays: pays,
      latitude: latitude,
      longitude: longitude,
      commentaireAdresse: commentaireAdresse,
      acces247: false,
      accesSemaine: false,
      accesWeekend: false,
      exterieur: false,
      finGarantie: finGarantie,
      fabrication: fabrication,
      miseEnService: miseEnService,
      derniereMaintenance: derniereMaintenance,
      sortieFabricant: sortieFabricant,
      modeleElectrodeAId: finalElectrodeAId,
      lotElectrodeA: lotElectrodeA,
      insertionElectrodeA: insertionElectrodeA,
      peremptionElectrodeA: peremptionElectrodeA,
      livraisonElectrodeA: livraisonElectrodeA,
      situationElectrodeA: mapStatusToDb(situationElectrodeAVal),
      commentaireElectrodeA: commentaireElectrodeA,
      peremptionSecoursElectrodeA: peremptionSecoursElectrodeA,
      modeleElectrodeASecoursId: finalElectrodeASecoursId,
      lotElectrodeASecours: lotElectrodeASecours,
      lotPadpakA: lotPadpakA,
      peremptionPadpakA: peremptionPadpakA,
      modeleElectrodePId: finalElectrodePId,
      lotElectrodeP: lotElectrodeP,
      insertionElectrodeP: insertionElectrodeP,
      peremptionElectrodeP: peremptionElectrodeP,
      livraisonElectrodeP: livraisonElectrodeP,
      situationElectrodeP: mapStatusToDb(situationElectrodePVal),
      commentaireElectrodeP: commentaireElectrodeP,
      peremptionSecoursElectrodeP: peremptionSecoursElectrodeP,
      modeleElectrodePSecoursId: finalElectrodePSecoursId,
      lotElectrodePSecours: lotElectrodePSecours,
      lotPadpakP: lotPadpakP,
      peremptionPadpakP: peremptionPadpakP,
      modeleBatterieId: finalBatterieId,
      lotBatterie: lotBatterie,
      insertionBatterie: insertionBatterie,
      peremptionBatterie: peremptionBatterie,
      livraisonBatterie: livraisonBatterie,
      situationBatterie: mapStatusToDb(situationBatterieVal),
      pourcentageBatterie: pourcentageBatterie || '100',
      commentaireBatterie: commentaireBatterie,
      loue: sanitizeYesNo(loue, 'Non'),
      prete: sanitizeYesNo(prete, 'Non'),
      stocke: sanitizeYesNo(stocke, 'Non'),
      archive: sanitizeYesNo(archive, 'Non'),
      conforme: sanitizeYesNo(conforme, 'Oui'),
      sousTraitance: sanitizeYesNo(sousTraitance, 'Non'),
      fsmAutorise: sanitizeYesNo(fsmAutorise, 'Non'),
      victimeSurvie: 'Non',
      victimeSansSurvie: 'Non',
      ageVictime: '',
      commentaireCampagneRappel: ''
    });
  }

  if (errorsSet.size > 0) {
    const sortedErrors = Array.from(errorsSet).sort();
    return {
      success: false,
      data: [],
      errors: sortedErrors
    };
  }

  return {
    success: true,
    data: parsedItems,
    errors: []
  };
};

const validateAndParseClients = (csvText: string): Client[] | null => {
  const { headers, rows } = parseCSV(csvText);
  if (rows.length < 5) return null;

  const expected = [
    'Entreprise.', 'Identifiant fiscal.', 'Email.', 'Téléphone.'
  ];
  if (headers.length !== expected.length) return null;
  const hMatch = headers.every((h, i) => h.replace(/^\uFEFF/, '').trim() === expected[i]);
  if (!hMatch) return null;

  const parsedItems: Client[] = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (row.length !== expected.length) return null;

    const entreprise = row[0];
    const idFiscal = row[1];
    const email = row[2];
    const phone = row[3];

    parsedItems.push({
      id: 'cl_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000),
      denomination: entreprise,
      siret: idFiscal,
      email: email,
      phone: phone,
      accessKey: 'AC-' + Math.floor(100 + Math.random() * 900),
      nomPrenomSite: '',
      telephoneSite: '',
      emailSite: '',
      contrat: 'Non',
      nomContrat: '',
      referenceContrat: '',
      debutContrat: '',
      finContrat: ''
    });
  }

  return parsedItems;
};

const validateAndParseStocks = (csvText: string, currentVars: Variable[]): StockRecord[] | null => {
  const { headers, rows } = parseCSV(csvText);
  if (rows.length < 5) return null;

  const expected = [
    'Pièce ou service.', 'Quantité disponible.', 'Quantité réservée.', 'Quantité totale.',
    'Stockage.', 'Tarif fournisseur.', 'Marge.', 'Tarif de vente.'
  ];
  if (headers.length !== expected.length) return null;
  const hMatch = headers.every((h, i) => h.replace(/^\uFEFF/, '').trim() === expected[i]);
  if (!hMatch) return null;

  const validStockages = [
    'Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E', 'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J',
    'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E', 'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J',
    'Non approprié.'
  ];

  const parsedItems: StockRecord[] = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (row.length !== expected.length) return null;

    const pieceNom = row[0];
    const qtyDispStr = row[1];
    const qtyResStr = row[2];
    const qtyTotStr = row[3];
    const stockage = row[4];
    const costStr = row[5];
    const marginStr = row[6];
    const priceStr = row[7];

    const normPiece = (pieceNom || '').trim().toLowerCase();
    const matchingVar = (currentVars || []).find(v => 
      v.id === pieceNom || 
      (v.id && v.id.trim().toLowerCase() === normPiece) || 
      v.nom === pieceNom || 
      (v.nom && v.nom.trim().toLowerCase().replace(/\s+/g, ' ') === normPiece.replace(/\s+/g, ' '))
    );
    if (!matchingVar) return null;

    if (!validStockages.includes(stockage)) return null;

    const parseNum = (val: string): number | null => {
      if (!val) return null;
      const parsed = parseFloat(val.replace(',', '.'));
      return isNaN(parsed) ? null : parsed;
    };

    const quantiteDisp = parseNum(qtyDispStr);
    const quantiteRes = parseNum(qtyResStr);
    const qtyTot = parseNum(qtyTotStr); // Must be a valid numeric

    const cost = parseNum(costStr);
    const margin = parseNum(marginStr);
    const price = parseNum(priceStr);

    if (quantiteDisp === null || quantiteRes === null || qtyTot === null || cost === null || margin === null || price === null) {
      return null;
    }

    parsedItems.push({
      id: 'st_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000),
      denominationPieceId: matchingVar.id,
      quantite: quantiteDisp,
      quantiteReservee: quantiteRes,
      livraisonDate: new Date().toISOString().split('T')[0],
      reapprovisionnementDate: '',
      valeurAchat: cost,
      marge: margin,
      prixVenteHt: price,
      stockage: stockage
    });
  }

  return parsedItems;
};

export default function ImportExportTab({ 
  tenantId,
  isFirebaseLoaded,
  defibrillateurs = [],
  clients = [],
  stocks = [],
  pointages = [],
  variables = [],
  saveDefibs,
  saveClients,
  saveStocks,
  setActiveTab,
  dropboxActive = false,
  dropboxAccessToken = '',
}: ImportExportTabProps) {
  const isRecordExpired = (r: ImportExportRecord): boolean => {
    if (r.expiresAt) {
      return Date.now() > r.expiresAt;
    }
    const d = new Date(r.date);
    d.setHours(d.getHours() + 48);
    return Date.now() > d.getTime();
  };

  const [records, setRecords] = useState<ImportExportRecord[]>(() => {
    const key = `defib_import_export_records_${tenantId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as any[];
        const mapped = parsed.map((r) => ({
          ...r,
          format: 'CSV.' as const
         }));
        return mapped.filter(r => {
          if (r.expiresAt) return Date.now() <= r.expiresAt;
          const d = new Date(r.date);
          d.setHours(d.getHours() + 48);
          return Date.now() <= d.getTime();
        });
      } catch (e) {
        return tenantId === 'demo' ? INITIAL_RECORDS : [];
      }
    }
    return tenantId === 'demo' ? INITIAL_RECORDS : [];
  });

  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  // Form visibility
  const [showForm, setShowForm] = useState(false);

  // Form states
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formExpirationDate, setFormExpirationDate] = useState('');
  const [formType, setFormType] = useState<'Importation.' | 'Exportation.'>('Importation.');
  const [formCategorie, setFormCategorie] = useState<'Défibrillateurs.' | 'Clients.' | 'Stocks.' | 'Temps.'>('Défibrillateurs.');
  const [formFormat, setFormFormat] = useState<'CSV.'>('CSV.');

  // Import states
  const [uploadedCsvContent, setUploadedCsvContent] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [dropboxError, setDropboxError] = useState<string | null>(null);

  // Set expiration date automatically: today + 1 day
  useEffect(() => {
    if (formDate) {
      const d = new Date(formDate);
      d.setDate(d.getDate() + 1);
      setFormExpirationDate(d.toISOString().split('T')[0]);
    }
  }, [formDate]);

  // Sync format automatically when type changes (always CSV now)
  useEffect(() => {
    setFormFormat('CSV.');
  }, [formType]);

  // Remove Temps. option and auto-switch to Defibrillateurs. if importation was chosen
  useEffect(() => {
    if (formType === 'Importation.' && formCategorie === 'Temps.') {
      setFormCategorie('Défibrillateurs.');
    }
    setUploadedCsvContent('');
    setSelectedFileName('');
    setValidationError(null);
    setImportSuccessMessage(null);
  }, [formType, formCategorie]);

  // Load records from LocalStorage / Firestore on tenantId or isFirebaseLoaded change
  useEffect(() => {
    const loadRecords = async () => {
      const key = `defib_import_export_records_${tenantId}`;
      let localRecords: ImportExportRecord[] = [];
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          localRecords = JSON.parse(saved) as ImportExportRecord[];
        } catch (e) {
          localRecords = tenantId === 'demo' ? INITIAL_RECORDS : [];
        }
      } else {
        localRecords = tenantId === 'demo' ? INITIAL_RECORDS : [];
      }

      if (isFirebaseLoaded) {
        const cloudRecords = await fetchCollectionFromFirestore<ImportExportRecord[]>('importExportRecords', tenantId);
        if (cloudRecords && Array.isArray(cloudRecords)) {
          // Expiration and cleanup check using isRecordExpired
          const cleanedRecords = cloudRecords.filter(r => !isRecordExpired(r));
          
          setRecords(cleanedRecords);
          localStorage.setItem(key, JSON.stringify(cleanedRecords));
          
          // Save back if some were cleaned up
          if (cleanedRecords.length !== cloudRecords.length) {
            await saveCollectionToFirestore('importExportRecords', cleanedRecords);
          }
          return;
        }
      }

      // Fallback local expirations check using isRecordExpired
      const cleaned = localRecords.filter(r => !isRecordExpired(r));

      setRecords(cleaned);
      localStorage.setItem(key, JSON.stringify(cleaned));
      if (isFirebaseLoaded) {
        await saveCollectionToFirestore('importExportRecords', cleaned);
      }
    };

    loadRecords();
    setSearch('');
    setShowForm(false);
  }, [tenantId, isFirebaseLoaded]);

  // Periodic cleanup of expired records (every 60 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      let expiredFound = false;
      const cleaned = records.filter(r => {
        if (isRecordExpired(r)) {
          expiredFound = true;
          return false;
        }
        return true;
      });

      if (expiredFound) {
        setRecords(cleaned);
        const key = `defib_import_export_records_${tenantId}`;
        localStorage.setItem(key, JSON.stringify(cleaned));
        if (isFirebaseLoaded) {
          await saveCollectionToFirestore('importExportRecords', cleaned);
        }
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [records, tenantId, isFirebaseLoaded]);

  // Clean filters
  const filteredRecords = records.filter((r) => {
    if (isRecordExpired(r)) {
      return false;
    }
    const term = search.toLowerCase();
    return (
      r.date.toLowerCase().includes(term) ||
      r.type.toLowerCase().includes(term) ||
      r.categorie.toLowerCase().includes(term) ||
      (r.format && r.format.toLowerCase().includes(term))
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formType === 'Importation.') {
      if (!uploadedCsvContent) {
        setValidationError('Fichier invalide, veuillez vérifier votre CSV et essayer à nouveau.');
        return;
      }

      let parsedData: any[] | null = null;
      if (formCategorie === 'Défibrillateurs.') {
        const valResult = validateAndParseDefibs(uploadedCsvContent, variables, defibrillateurs);
        if (!valResult.success) {
          const errorListStr = valResult.errors.join(', ');
          setValidationError(`Votre fichier contient une ou plusieurs erreurs : ${errorListStr}. Vous trouverez sur notre aide en ligne (https://defibeo.com/school/) les solutions correspondantes pour résoudre ces anomalies. Pour obtenir un tableau d'exemple d'importation, téléchargez un fichier d'exportation comme exemple pour récupérer les entêtes.`);
          return;
        }
        parsedData = valResult.data;
        setImportSuccessMessage("Votre fichier est valide, en cours d’importation.");
      } else if (formCategorie === 'Clients.') {
        parsedData = validateAndParseClients(uploadedCsvContent);
        if (!parsedData) {
          setValidationError('Fichier invalide, veuillez vérifier votre CSV et essayer à nouveau.');
          return;
        }
      } else if (formCategorie === 'Stocks.') {
        parsedData = validateAndParseStocks(uploadedCsvContent, variables);
        if (!parsedData) {
          setValidationError('Fichier invalide, veuillez vérifier votre CSV et essayer à nouveau.');
          return;
        }
      }

      setValidationError(null);
      setIsSaving(true);

      // Simulated saving time
      setTimeout(async () => {
        try {
          if (formCategorie === 'Défibrillateurs.' && saveDefibs) {
            saveDefibs([...defibrillateurs, ...parsedData]);
          } else if (formCategorie === 'Clients.' && saveClients) {
            saveClients([...clients, ...parsedData]);
          } else if (formCategorie === 'Stocks.' && saveStocks) {
            saveStocks([...stocks, ...parsedData]);
          }

          const dExp = new Date();
          dExp.setHours(dExp.getHours() + 48);
          const expiresTime = dExp.getTime();
          const expDateStr = dExp.toISOString().split('T')[0];

          // Add transaction list record
          const newRecord: ImportExportRecord = {
            id: 'rec_' + Date.now(),
            date: formDate,
            type: formType,
            categorie: formCategorie,
            format: 'CSV.',
            expiresAt: expiresTime,
            expirationDate: expDateStr
          };

          const updated = [newRecord, ...records];
          setRecords(updated);
          const key = `defib_import_export_records_${tenantId}`;
          localStorage.setItem(key, JSON.stringify(updated));
          if (isFirebaseLoaded) {
            await saveCollectionToFirestore('importExportRecords', updated);
          }

          setIsSaving(false);
          setShowForm(false);
          setUploadedCsvContent('');
          setSelectedFileName('');
          setImportSuccessMessage(null);
          
          if (formCategorie === 'Défibrillateurs.' && setActiveTab) {
            setActiveTab('defibrillateurs');
          }
        } catch (err) {
          console.error(err);
          setIsSaving(false);
          setValidationError('Une erreur est survenue lors de l’importation.');
          setImportSuccessMessage(null);
        }
      }, 1500);

      return;
    }

    // Exportation path
    setValidationError(null);
    setIsSaving(true);

    setTimeout(async () => {
      try {
        let csv = '';
        let expiresTime: number | undefined = undefined;
        let expDateStr: string | undefined = undefined;

        // Calculate expiration: 48h from now
        const dExp = new Date();
        dExp.setHours(dExp.getHours() + 48);
        expiresTime = dExp.getTime();
        expDateStr = dExp.toISOString().split('T')[0];

        // Generate the CSV
        csv = generateCSV(formCategorie, {
          defibrillateurs: defibrillateurs || [],
          clients: clients || [],
          stocks: stocks || [],
          pointages: pointages || []
        });

        const newRecord: ImportExportRecord = {
          id: 'rec_' + Date.now(),
          date: formDate,
          type: formType,
          categorie: formCategorie,
          format: 'CSV.',
          csvData: csv,
          expiresAt: expiresTime,
          expirationDate: expDateStr
        };

        const updated = [newRecord, ...records];
        setRecords(updated);
        
        // Save to LocalStorage and Firestore
        const key = `defib_import_export_records_${tenantId}`;
        localStorage.setItem(key, JSON.stringify(updated));
        if (isFirebaseLoaded) {
          await saveCollectionToFirestore('importExportRecords', updated);
        }

        setDropboxError(null);
        if (dropboxActive && dropboxAccessToken) {
          try {
            const { uploadToDropbox } = await import('../utils/dropbox');
            const sanitizedCat = formCategorie.replace(/\./g, '').toLowerCase().replace(/é/g, 'e');
            const fileName = `export_${sanitizedCat}_${formDate}.csv`;
            await uploadToDropbox(dropboxAccessToken, fileName, csv);
          } catch (dropboxErr: any) {
            console.error("Dropbox upload error during export:", dropboxErr);
            let cleanMsg = "Impossible de synchroniser avec Dropbox, vérifiez les identifiants.";
            if (dropboxErr.message && (dropboxErr.message.includes("401") || dropboxErr.message.includes("expired") || dropboxErr.message.includes("invalid_access_token") || dropboxErr.message.includes("Unauthorized"))) {
              cleanMsg = "Erreur Dropbox 401 : Le token d'accès est invalide ou expiré (les tokens temporaires Dropbox expirent au bout de 4 heures). Veuillez générer un nouveau token d'accès dans votre console Dropbox Developer.";
            } else if (dropboxErr.message && dropboxErr.message.includes("missing_scope")) {
              cleanMsg = "Erreur Dropbox : Autorisation insuffisante. Veuillez activer la permission 'files.content.write' dans votre console Dropbox Developer, puis générez un nouveau token.";
            }
            setDropboxError(cleanMsg);
          }
        }

        setIsSaving(false);
        setShowForm(false);

        // Reset fields to today and defaults
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormType('Importation.');
        setFormCategorie('Défibrillateurs.');
      } catch (err) {
        console.error(err);
        setIsSaving(false);
        setValidationError('Une erreur est survenue lors de l’exportation.');
      }
    }, 1000);
  };

  const handleDelete = async (id: string) => {
    const updated = records.filter((r) => r.id !== id);
    setRecords(updated);
    
    const key = `defib_import_export_records_${tenantId}`;
    localStorage.setItem(key, JSON.stringify(updated));
    if (isFirebaseLoaded) {
      await saveCollectionToFirestore('importExportRecords', updated);
    }
  };


  // Harmonized styles for consistency
  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000',
    cursor: 'default',
    fontSize: '16px',
  };

  const roundedButtonStyle: React.CSSProperties = {
    backgroundColor: '#000000',
    color: '#ffffff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '10px',
    fontSize: '16px',
    padding: '11px 22px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
  };

  const roundedButton18Style: React.CSSProperties = {
    ...roundedButtonStyle,
    fontSize: '18px',
    padding: '9px 19px',
  };

  const searchInputStyle: React.CSSProperties = {
    border: '1px solid #dedede',
    borderRadius: '13px',
    padding: '9px 19px',
    fontSize: '18px',
    fontWeight: '100',
    color: '#000000',
    backgroundColor: '#ffffff',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    outline: (isSearchHovered || isSearchFocused) ? '2.5px solid #fa53d5' : 'none',
    outlineOffset: (isSearchHovered || isSearchFocused) ? '2px' : '0px',
    transition: 'all 0s',
  };

  const formatDateToDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div className="space-y-6 text-black font-sans pb-12" id="import-export-tab-container-harmonized">
      <style>{`
        #import-export-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]),
        #import-export-tab-container-harmonized select {
          padding: 12px !important;
          border: 1px solid #dedede !important;
          border-radius: 13px !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
        #import-export-tab-container-harmonized input.search-input-field {
          font-size: 18px !important;
        }
        #import-export-tab-container-harmonized input.search-input-field::placeholder {
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          font-weight: 100 !important;
        }
        #import-export-tab-container-harmonized select {
          background-image: none !important;
        }
        #import-export-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled),
        #import-export-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled),
        #import-export-tab-container-harmonized select:hover:not(:disabled),
        #import-export-tab-container-harmonized select:focus:not(:disabled) {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }

        /* Hide raw date picker icon indicator */
        #import-export-tab-container-harmonized input[type="date"]::-webkit-calendar-picker-indicator {
          display: none !important;
          -webkit-appearance: none !important;
          background: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        #import-export-tab-container-harmonized input[type="date"] {
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
      `}</style>



      {/* Main Container - Full page width */}
      <div className="w-full flex flex-col space-y-6">
        
        {/* Harmonized Header - only visible when not filling creation form */}
        {!showForm && (
          <div 
            className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            style={{
              border: '1px solid #dadada',
              borderTop: 'none',
              borderRadius: '0px 0px 18px 18px',
              maxWidth: '98%',
              margin: 'auto',
              padding: '20px',
              backgroundColor: '#ffffff',
              width: '100%'
            }}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-bold text-black font-gochi cursor-default" style={{ cursor: 'default' }}>Importer Exporter</h3>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search Input block */}
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher."
                  className="w-full sm:w-[220px] search-input-field"
                  style={searchInputStyle}
                  onMouseEnter={() => setIsSearchHovered(true)}
                  onMouseLeave={() => setIsSearchHovered(false)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                />
              </div>

              {/* Nouveau Button */}
              <button
                onClick={() => setShowForm(true)}
                style={{
                  ...roundedButton18Style,
                  backgroundColor: 'rgb(53, 86, 236)',
                  color: '#ffffff',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                }}
                className="transition-all cursor-pointer"
              >
                <span>Nouveau</span>
              </button>
            </div>
          </div>
        )}

        {!showForm && (
          <>
            <HelpBubble 
              cacheKey="help_dismissed_import_export" 
              text="Astuce : Vous souhaitez importer un fichier de données et vous avez besoin d’un fichier d’exemple, il vous suffit de télécharger un fichier d’exportation pour obtenir les entêtes des colonnes (ne les changez pas) ainsi qu’un jeu de données exemple avec les lignes exportées." 
            />
            {dropboxError && (
              <div className="space-y-2 my-4">
                <div className="text-red-600 font-sans font-light text-sm text-left">
                  {dropboxError}
                </div>
                {(dropboxError.includes("Autorisation insuffisante") || dropboxError.includes("401") || dropboxError.includes("expiré")) && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2 max-w-2xl">
                    <p className="font-bold text-red-900">💡 Guide de configuration & génération de Token Dropbox :</p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-red-700">
                      <li>Allez sur la <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-red-900">Console Dropbox Developer</a>.</li>
                      <li>Sélectionnez votre application Dropbox.</li>
                      <li>Allez dans l'onglet <strong className="font-bold">Permissions</strong>.</li>
                      <li>Cochez la case <strong className="font-bold">files.content.write</strong> (et <strong className="font-bold">files.content.read</strong>).</li>
                      <li>Cliquez sur <strong className="font-bold">Submit</strong> en bas de la page.</li>
                      <li>Retournez dans <strong className="font-bold">Settings</strong>, puis cliquez sur <strong className="font-bold">Generate</strong> pour obtenir un nouveau token.</li>
                      <li>Mettez à jour le token dans les réglages de l'application (bouton engrenage ⚙️).</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 🛠️ Matches DefibTab's Form Structure when form is open 🛠️ */}
        {showForm && (
          <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="import-export-form-overlay">
            
            {/* Form Header */}
            <div 
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
              style={{ 
                border: '1px solid #dadada', 
                borderTop: 'none', 
                borderRadius: '0px 0px 18px 18px', 
                maxWidth: '98%', 
                margin: 'auto', 
                padding: '20px' 
              }}
              id="import-export-form-header-box"
            >
              <div>
                <h3 className="text-2xl font-bold font-gochi" id="form-modal-title" style={{ color: '#000000', cursor: 'default' }}>
                  Nouveau Transfert
                </h3>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={roundedButton18Style}
                  className="transition-colors cursor-pointer"
                  disabled={isSaving}
                >
                  <span>Fermer</span>
                </button>

                <button
                  type="submit"
                  form="import-export-creation-form"
                  style={{
                    ...roundedButton18Style,
                    backgroundColor: isSaving ? '#6b7280' : 'rgb(53, 86, 236)',
                    color: '#ffffff',
                    opacity: isSaving ? 0.6 : 1,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    boxShadow: isSaving ? 'none' : 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                  }}
                  className="transition-all"
                  disabled={isSaving}
                >
                  {isSaving ? (formType === 'Importation.' ? 'Importation...' : 'Exportation...') : 'Enregistrer'}
                </button>
              </div>
            </div>

            {/* Form Body Box with top margin spacing */}
            <div 
              className="w-full animate-fadeIn mt-6"
              style={{ marginTop: '24px' }}
              id="import-export-form-box"
            >
              <form 
                onSubmit={handleCreate} 
                id="import-export-creation-form"
                style={{ maxWidth: '98%', margin: 'auto' }}
              >
                <div 
                  className="bg-white p-5 relative space-y-3"
                  style={{
                    border: '1px solid rgb(218, 218, 218)',
                    borderRadius: '18px',
                  }}
                >
                  <div className="mb-2 bg-transparent">
                    <span 
                      className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                      style={{
                        backgroundColor: 'oklch(0.44 0.16 324.65)',
                        borderRadius: '1000px',
                        cursor: 'default',
                        fontWeight: 100,
                        textTransform: 'none',
                      }}
                    >
                      1 — Paramètres du transfert
                    </span>
                  </div>

                  {/* Form grid matches fields requested */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Date field */}
                    <div className="space-y-1">
                      <label htmlFor="form-ie-date" className="block text-black font-bold font-sans" style={{ color: '#000000', fontSize: '16px', letterSpacing: 'normal', textTransform: 'none' }}>
                        Date.
                      </label>
                      <input
                        type="date"
                        id="form-ie-date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
                        disabled
                        required
                      />
                    </div>

                    {/* Date d'expiration field */}
                    <div className="space-y-1">
                      <label htmlFor="form-ie-expiration" className="block text-black font-bold font-sans" style={{ color: '#000000', fontSize: '16px', letterSpacing: 'normal', textTransform: 'none' }}>
                        Date d'expiration.
                      </label>
                      <input
                        type="date"
                        id="form-ie-expiration"
                        value={formExpirationDate}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
                        disabled
                        required
                      />
                    </div>

                    {/* Type select */}
                    <div className="space-y-1">
                      <label htmlFor="form-ie-type" className="block text-black font-bold font-sans" style={{ color: '#000000', fontSize: '16px', letterSpacing: 'normal', textTransform: 'none' }}>
                        {t("Type de transfert.")}
                      </label>
                      <select
                        id="form-ie-type"
                        value={formType}
                        onChange={(e) => {
                          const val = e.target.value as 'Importation.' | 'Exportation.';
                          setFormType(val);
                          if (val === 'Importation.') {
                            setFormCategorie('Défibrillateurs.');
                          }
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-black cursor-pointer"
                      >
                        <option value="Importation.">{t("Importation.")}</option>
                        <option value="Exportation.">{t("Exportation.")}</option>
                      </select>
                    </div>

                    {/* Catégorie select */}
                    <div className="space-y-1">
                      <label htmlFor="form-ie-cat" className="block text-black font-bold font-sans" style={{ color: '#000000', fontSize: '16px', letterSpacing: 'normal', textTransform: 'none' }}>
                        {t("Compartiment de données.")}
                      </label>
                      <select
                        id="form-ie-cat"
                        value={formCategorie}
                        onChange={(e) => setFormCategorie(e.target.value as any)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-black cursor-pointer"
                      >
                        <option value="Défibrillateurs.">{t("Défibrillateurs.")}</option>
                        {formType !== 'Importation.' && (
                          <>
                            <option value="Clients.">{t("Clients.")}</option>
                            <option value="Stocks.">{t("Stocks.")}</option>
                            <option value="Temps.">{t("Temps.")}</option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* Format disabled select */}
                    <div className="space-y-1">
                      <label htmlFor="form-ie-fmt" className="block text-black font-bold font-sans" style={{ color: '#000000', fontSize: '16px', letterSpacing: 'normal', textTransform: 'none' }}>
                        {t("Format.")}
                      </label>
                      <select
                        id="form-ie-fmt"
                        value="CSV."
                        disabled
                        className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-500 cursor-not-allowed"
                      >
                        <option value="CSV.">CSV.</option>
                      </select>
                    </div>

                    {formType === 'Importation.' && (
                      <div className="flex flex-col gap-1 sm:col-span-2 bg-white">
                        <label className="font-bold text-black font-sans" style={{ fontSize: '18px' }}>
                          {t("Téléchargement du fichier.")}
                        </label>
                        <div 
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (!file) return;
                            if (!file.name.endsWith('.csv')) {
                              alert(t("Veuillez sélectionner un fichier au format .csv"));
                              return;
                            }
                            setSelectedFileName(file.name);
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              const text = evt.target?.result;
                              if (typeof text === 'string') {
                                setUploadedCsvContent(text);
                              }
                            };
                            reader.readAsText(file, 'utf-8');
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          className="p-8 text-center space-y-4 hover:bg-[#ffecf8]/20 transition-all cursor-pointer"
                          style={{ borderRadius: '13px', border: 'none', backgroundColor: '#fdecff' }}
                        >
                          <input
                            type="file"
                            ref={fileInputRef}
                            id="form-ie-file"
                            accept=".csv"
                            className="hidden"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (!file.name.endsWith('.csv')) {
                                  alert(t("Veuillez sélectionner un fichier au format .csv"));
                                  return;
                                }
                                setSelectedFileName(file.name);
                                const reader = new FileReader();
                                reader.onload = (evt) => {
                                  const text = evt.target?.result;
                                  if (typeof text === 'string') {
                                    setUploadedCsvContent(text);
                                  }
                                };
                                reader.readAsText(file, 'utf-8');
                              } else {
                                setSelectedFileName('');
                                setUploadedCsvContent('');
                              }
                            }}
                          />
                          
                          <div className="font-sans" style={{ fontSize: '16px', color: '#000000' }}>
                            {selectedFileName ? (
                              <span className="font-bold inline-block animate-fadeIn" style={{ fontSize: '16px', padding: '9px 16px', backgroundColor: '#501655', border: 'none', color: '#ffffff', borderRadius: '9999px' }}>
                                {t("Votre fichier téléchargé :")} {selectedFileName}
                              </span>
                            ) : (
                              <span style={{ color: '#000000', fontSize: '16px' }}>
                                {t("Cliquez dans cette zone ou glissez directement votre fichier.")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  {validationError && (
                    <div className="pt-2 text-center" id="validation-error-msg">
                      <p className="text-red-600 font-bold font-sans animate-pulse-once" style={{ color: '#dc2626', fontSize: '18px', lineHeight: '1.5' }}>
                        {validationError.includes('https://defibeo.com/school/') ? (
                          <>
                            {validationError.split('https://defibeo.com/school/')[0]}
                            <a 
                              href="https://defibeo.com/school/" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="underline text-red-700 hover:text-red-900 transition-colors duration-150 decoration-2 font-extrabold"
                            >
                              https://defibeo.com/school/
                            </a>
                            {validationError.split('https://defibeo.com/school/')[1]}
                          </>
                        ) : (
                          validationError
                        )}
                      </p>
                    </div>
                  )}

                  {importSuccessMessage && (
                    <div className="pt-2 text-center" id="validation-success-msg">
                      <p className="text-emerald-600 font-bold font-sans" style={{ color: '#059669', fontSize: '18px' }}>
                        {importSuccessMessage}
                      </p>
                    </div>
                  )}
                </div>
              </form>
            </div>

          </div>
        )}

        {/* REPORT / List of Transfers - full width - only visible when not filling creation form */}
        {!showForm && (
          <div 
            className="bg-white overflow-hidden mt-6 rounded-none animate-fadeIn"
            style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}
            id="import-export-report-container"
          >
            {filteredRecords.length === 0 ? (
              <div className="p-16 text-center font-sans lg:py-24" id="no-records-view">
                <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                  {t("Aucun résultat.")}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table 
                  className="w-full text-left font-sans border-collapse text-xs" 
                  id="records-table" 
                  style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}
                >
                  <thead>
                    <tr className="bg-transparent">
                      <th className="px-4 py-3.5 w-[20%]" style={thStyle}>{t("Horodatage.")}</th>
                      <th className="px-4 py-3.5 w-[15%]" style={thStyle}>{t("Expiration")}</th>
                      <th className="px-4 py-3.5 w-[20%]" style={thStyle}>{t("Circulation.")}</th>
                      <th className="px-4 py-3.5 w-[20%]" style={thStyle}>{t("Compartiment.")}</th>
                      <th className="px-4 py-3.5 w-[10%]" style={thStyle}>{t("Format.")}</th>
                      <th className="px-4 py-3.5 text-right w-[15%]" style={thStyle}>{t("Actions.")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-705 text-xs text-black">
                    {filteredRecords.map((r) => (
                      <tr 
                        key={r.id} 
                        className="hover:bg-[#ffecf8] transition-all cursor-default"
                      >
                        {/* Date column (exactly mimicking text styling from DefibTab) */}
                        <td 
                          className="px-4 py-5 font-sans whitespace-nowrap"
                          style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
                        >
                          {formatDateToDDMMYYYY(r.date)}
                        </td>

                        {/* Expiration column */}
                        <td 
                          className="px-4 py-5 font-sans whitespace-nowrap"
                          style={{ fontSize: '16px', color: '#dc2626', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
                        >
                          {(() => {
                            if (!r.expiresAt) {
                              const d = new Date(r.date);
                              d.setHours(d.getHours() + 48);
                              const remainingMs = d.getTime() - Date.now();
                              if (remainingMs <= 0) return t("Expiré");
                              const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
                              if (remainingHours > 24) {
                                return `${Math.floor(remainingHours / 24)}j ${remainingHours % 24}h`;
                              }
                              return `${remainingHours}h`;
                            }
                            const remainingMs = r.expiresAt - Date.now();
                            if (remainingMs <= 0) return t("Expiré");
                            const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
                            if (remainingHours > 24) {
                              return `${Math.floor(remainingHours / 24)}j ${remainingHours % 24}h`;
                            }
                            return `${remainingHours}h`;
                          })()}
                        </td>

                        {/* Type badge column without color dot */}
                        <td className="px-4 py-5 font-sans whitespace-nowrap text-left">
                          <div 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              border: '1px solid rgb(231, 231, 231)',
                              borderRadius: '1000px',
                              padding: '4px 12px',
                              backgroundColor: '#ffffff'
                            }} 
                            className="whitespace-nowrap"
                          >
                            <span style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                              {t(r.type)}
                            </span>
                          </div>
                        </td>

                        {/* Catégorie column */}
                        <td 
                          className="px-4 py-5 font-sans whitespace-nowrap"
                          style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
                        >
                          {t(r.categorie)}
                        </td>

                        {/* Format column without color dot */}
                        <td className="px-4 py-5 font-sans whitespace-nowrap text-left">
                          <div 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              border: '1px solid rgb(231, 231, 231)',
                              borderRadius: '1000px',
                              padding: '4px 12px',
                              backgroundColor: '#ffffff'
                            }} 
                            className="whitespace-nowrap"
                          >
                            <span style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                              {t(r.format)}
                            </span>
                          </div>
                        </td>

                        {/* Consulter & Supprimer buttons */}
                        <td className="px-4 py-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {r.type === 'Importation.' ? (
                              <button
                                type="button"
                                disabled
                                style={{
                                  ...roundedButton18Style,
                                  backgroundColor: '#dedede',
                                  color: '#959595',
                                  cursor: 'not-allowed',
                                  boxShadow: 'none'
                                }}
                                className="opacity-60"
                              >
                                <span>{t("Télécharger")}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!r.csvData) {
                                    alert("Aucune donnée CSV disponible pour ce record.");
                                    return;
                                  }
                                  const csvContent = "\ufeff" + r.csvData;
                                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                  const url = URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  const sanitizedCat = r.categorie.replace(/\./g, '').toLowerCase().replace(/é/g, 'e');
                                  link.download = `export_${sanitizedCat}_${r.date}.csv`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  URL.revokeObjectURL(url);
                                }}
                                style={{
                                  ...roundedButton18Style,
                                  backgroundColor: '#000000',
                                  color: '#ffffff'
                                }}
                                className="transition-all hover:opacity-80"
                              >
                                <span>{t("Télécharger")}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(r.id)}
                              style={roundedButton18Style}
                              className="transition-all text-white bg-black rounded cursor-pointer"
                            >
                              <span>{t("Supprimer")}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

