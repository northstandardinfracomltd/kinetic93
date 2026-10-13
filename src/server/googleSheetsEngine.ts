import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type SheetTabType = 'defibrillateurs' | 'autresMateriels' | 'clients';

export interface GlobalGoogleSheetsConfig {
  apiKey?: string;
  serviceAccountJson?: string;
  appsScriptBridgeUrl?: string;
  updatedAt?: string;
}

interface MirrorOverlay {
  headers: string[];
  upsertedById: Record<string, any>;
  deletedIds: string[];
  lastSyncedAt: number;
}

interface CachedSheetResult {
  headers: string[];
  items: any[];
  fetchedAt: number;
  spreadsheetUrl: string;
}

const sheetMemoryCache = new Map<string, CachedSheetResult>();
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getMirrorDir(): string {
  const persistentDir = path.join(process.cwd(), '.data', 'sheets_mirror');
  try {
    if (!fs.existsSync(persistentDir)) {
      fs.mkdirSync(persistentDir, { recursive: true });
    }
    return persistentDir;
  } catch (_) {
    const fallbackDir = path.join(process.cwd(), 'data', 'sheets_mirror');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
}

function getGlobalConfigPaths(): string[] {
  return [
    path.join(process.cwd(), '.data', 'collections', 'global_google_sheets_config.json'),
    path.join(process.cwd(), 'data', 'collections', 'global_google_sheets_config.json'),
  ];
}

export function getGlobalGoogleConfig(): GlobalGoogleSheetsConfig {
  for (const p of getGlobalConfigPaths()) {
    if (fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          return {
            apiKey: parsed.apiKey || process.env.GOOGLE_SHEETS_API_KEY || '',
            serviceAccountJson: parsed.serviceAccountJson || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
            appsScriptBridgeUrl: parsed.appsScriptBridgeUrl || process.env.GOOGLE_APPS_SCRIPT_BRIDGE_URL || '',
            updatedAt: parsed.updatedAt || '',
          };
        }
      } catch (_) {}
    }
  }
  return {
    apiKey: process.env.GOOGLE_SHEETS_API_KEY || '',
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
    appsScriptBridgeUrl: process.env.GOOGLE_APPS_SCRIPT_BRIDGE_URL || '',
  };
}

export function saveGlobalGoogleConfig(config: GlobalGoogleSheetsConfig): GlobalGoogleSheetsConfig {
  const current = getGlobalGoogleConfig();
  const merged: GlobalGoogleSheetsConfig = {
    apiKey: config.apiKey !== undefined ? config.apiKey.trim() : current.apiKey,
    serviceAccountJson: config.serviceAccountJson !== undefined ? config.serviceAccountJson.trim() : current.serviceAccountJson,
    appsScriptBridgeUrl: config.appsScriptBridgeUrl !== undefined ? config.appsScriptBridgeUrl.trim() : current.appsScriptBridgeUrl,
    updatedAt: new Date().toISOString(),
  };
  cachedAccessToken = null;
  for (const p of getGlobalConfigPaths()) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (_) {}
  }
  return merged;
}

export function extractSpreadsheetIdAndGid(urlOrId: string): { spreadsheetId: string; gid: string | null } | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = trimmed.match(/[?#&]gid=([0-9]+)/);
  if (match && match[1]) {
    return {
      spreadsheetId: match[1],
      gid: gidMatch ? gidMatch[1] : null,
    };
  }

  if (/^[a-zA-Z0-9-_]{20,60}$/.test(trimmed)) {
    return { spreadsheetId: trimmed, gid: null };
  }
  return null;
}

async function getServiceAccountAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) {
    return cachedAccessToken.token;
  }
  const cfg = getGlobalGoogleConfig();
  if (!cfg.serviceAccountJson) return null;

  try {
    const sa = JSON.parse(cfg.serviceAccountJson);
    const clientEmail = sa.client_email;
    const privateKey = sa.private_key;
    if (!clientEmail || !privateKey) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: nowSec + 3600,
      iat: nowSec,
    };

    const base64UrlEncode = (obj: any) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(claimSet)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer
      .sign(privateKey, 'base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${unsignedToken}.${signature}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(jwt)}`,
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.access_token) {
      cachedAccessToken = {
        token: data.access_token,
        expiresAt: Date.now() + 50 * 60 * 1000,
      };
      return data.access_token;
    }
  } catch (err) {
    console.warn('[GoogleSheetsEngine] Service account token generation failed:', err);
  }
  return null;
}

export function parseCsvText(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const firstNewline = cleanText.indexOf('\n');
  const firstLine = firstNewline >= 0 ? cleanText.slice(0, firstNewline) : cleanText;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semiCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const nextCh = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && nextCh === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\r' && nextCh === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c !== '')) {
      rows.push(currentRow);
    }
  }
  return rows;
}

function normalizeHeaderKey(rawHeader: string): string {
  return String(rawHeader || '')
    .replace(/^Section\s*\d+\s*[—–-]\s*/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeYesNo(val: any, defaultVal: 'Oui' | 'Non' = 'Non'): 'Oui' | 'Non' {
  if (val === undefined || val === null || val === '') return defaultVal;
  const s = String(val).trim().toLowerCase();
  if (s === 'oui' || s === 'true' || s === '1' || s === 'vrai' || s === 'yes' || s === 'o') return 'Oui';
  if (s === 'non' || s === 'false' || s === '0' || s === 'faux' || s === 'no' || s === 'n') return 'Non';
  return defaultVal;
}

function normalizeBool(val: any, defaultVal = false): boolean {
  if (typeof val === 'boolean') return val;
  if (val === undefined || val === null || val === '') return defaultVal;
  const s = String(val).trim().toLowerCase();
  if (s === 'oui' || s === 'true' || s === '1' || s === 'vrai' || s === 'yes' || s === 'x') return true;
  if (s === 'non' || s === 'false' || s === '0' || s === 'faux' || s === 'no') return false;
  return defaultVal;
}

function normalizeDateStr(val: any): string {
  if (!val) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmY) {
    return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
  }
  return s;
}

// ==========================================
// 1. DEFIBRILLATEURS MAPPING (GET & POST)
// ==========================================
export const DEFIB_CANONICAL_HEADERS: Array<{ header: string; field: string; aliases: string[]; type?: 'yesno' | 'bool' | 'date' }> = [
  { header: 'Identifiant', field: 'identifiant', aliases: ['identifiant', 'id', 'identifiantdae', 'code', 'identifiantunique'] },
  { header: 'Numéro Atlasanté', field: 'numeroAtlasante', aliases: ['numeroatlasante', 'atlasante', 'idatlasante', 'geodae'] },
  { header: 'Version logiciel', field: 'versionLogiciel', aliases: ['versionlogiciel', 'firmware', 'version'] },
  { header: 'Numéro de série', field: 'numeroSerie', aliases: ['numerodeserie', 'numeroserie', 'numserie', 'serie', 'sn', 'serial'] },
  { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentairedae', 'notes', 'note', 'observation'] },
  { header: 'Modèle', field: 'modeleId', aliases: ['modele', 'modeledae', 'modeledefibrillateur', 'modeleid', 'model'] },

  { header: 'Client lié', field: 'clientNom', aliases: ['clientlie', 'client', 'clientnom', 'entreprise', 'denominationclient'] },
  { header: 'Nom du site', field: 'nomSite', aliases: ['nomdusite', 'nomsite', 'site', 'etablissement'] },
  { header: "Catégorie d'établissement", field: 'categorieEtablissement', aliases: ['categoriedetablissement', 'categorieetablissement', 'typeetablissement'] },
  { header: 'Nom et prénom sur site', field: 'nomPrenomSite', aliases: ['nometprenomsursite', 'nomprenomsite', 'contactsursite', 'contactsite', 'responsablesite'] },
  { header: 'Téléphone portable sur site', field: 'telephoneSite', aliases: ['telephoneportablesursite', 'telephonesursite', 'telephonesite', 'telsite', 'portablesite'] },
  { header: 'Email sur site', field: 'emailSite', aliases: ['emailsursite', 'emailsite', 'mailsite', 'courrielsite'] },
  { header: 'Contrat', field: 'contrat', aliases: ['contrat', ' aveccontrat', 'souscontrat'], type: 'yesno' },
  { header: 'Nom du contrat', field: 'nomContrat', aliases: ['nomducontrat', 'nomcontrat', 'typecontrat'] },
  { header: 'Référence contrat', field: 'referenceContrat', aliases: ['referencecontrat', 'refcontrat', 'numerocontrat'] },
  { header: 'Début du contrat', field: 'debutContrat', aliases: ['debutducontrat', 'debutcontrat', 'datedebutcontrat'], type: 'date' },
  { header: 'Fin du contrat', field: 'finContrat', aliases: ['finducontrat', 'fincontrat', 'datefincontrat', 'echeancecontrat'], type: 'date' },
  { header: 'Payeur ID', field: 'payeurId', aliases: ['payeurid', 'idpayeur', 'codepayeur'] },
  { header: 'Client ID', field: 'clientIdField', aliases: ['clientid', 'idclient', 'codeclient', 'clientidfield'] },

  { header: 'Modèle coffret', field: 'modeleCoffretId', aliases: ['modelecoffret', 'coffret', 'modeleboitier', 'boitiermodele', 'modelecoffretid'] },
  { header: 'Numéro de lot coffret', field: 'numeroLotCoffret', aliases: ['numerodelotcoffret', 'numerolotcoffret', 'lotcoffret', 'boitierlot'] },
  { header: 'Commentaire coffret', field: 'commentaireCoffret', aliases: ['commentairecoffret', 'notecoffret'] },
  { header: 'Date péremption trousse', field: 'peremptionTrousse', aliases: ['dateperemptiontrousse', 'peremptiontrousse', 'peremptionkit', 'dateperemptionkit'], type: 'date' },
  { header: 'Ciseaux présents', field: 'kitCiseauxPresents', aliases: ['ciseauxpresents', 'kitciseauxpresents', 'ciseaux'], type: 'yesno' },
  { header: 'Masque présent', field: 'kitMasquePresent', aliases: ['masquepresent', 'kitmasquepresent', 'masque'], type: 'yesno' },
  { header: 'Péremption masque', field: 'kitPeremptionMasque', aliases: ['peremptionmasque', 'kitperemptionmasque', 'dateperemptionmasque'], type: 'date' },
  { header: 'Serviettes présentes', field: 'kitServiettesPresentes', aliases: ['serviettespresentes', 'kitserviettespresentes', 'serviettes'], type: 'yesno' },
  { header: 'Péremption serviettes', field: 'kitPeremptionServiettes', aliases: ['peremptionserviettes', 'kitperemptionserviettes', 'dateperemptionserviettes'], type: 'date' },
  { header: 'Gants présents', field: 'kitGantsPresents', aliases: ['gantspresents', 'kitgantspresents', 'gants'], type: 'yesno' },
  { header: 'Rasoir présent', field: 'kitRasoirPresent', aliases: ['rasoirpresent', 'kitrasoirpresent', 'rasoir'], type: 'yesno' },

  { header: 'Numéro et voie', field: 'numVoie', aliases: ['numeroetvoie', 'numvoie', 'adresse', 'rue', 'voie'] },
  { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city'] },
  { header: 'Code postal', field: 'cp', aliases: ['codepostal', 'cp', 'zip', 'postalcode'] },
  { header: 'Région', field: 'region', aliases: ['region', 'departementregion'] },
  { header: 'Pays', field: 'pays', aliases: ['pays', 'country'] },
  { header: 'Latitude', field: 'latitude', aliases: ['latitude', 'lat', 'coordlat'] },
  { header: 'Longitude', field: 'longitude', aliases: ['longitude', 'lng', 'lon', 'long', 'coordlng'] },
  { header: "Aide à l'accès", field: 'commentaireAdresse', aliases: ['aidealacces', 'aideacces', 'commentaireadresse', 'emplacement', 'localisationprecise'] },
  { header: 'Accès 24/7', field: 'acces247', aliases: ['acces247', 'acces24h24', '247'], type: 'bool' },
  { header: 'Accès semaine', field: 'accesSemaine', aliases: ['accessemaine', 'semaine'], type: 'bool' },
  { header: 'Accès week-end', field: 'accesWeekend', aliases: ['accesweekend', 'weekend'], type: 'bool' },
  { header: 'Extérieur', field: 'exterieur', aliases: ['exterieur', 'ext'], type: 'bool' },
  { header: "Horaires d'ouverture", field: 'horaires', aliases: ['horairesdouverture', 'horaires', 'heuresouverture'] },

  { header: 'Expiration garantie', field: 'finGarantie', aliases: ['expirationgarantie', 'fingarantie', 'garantie', 'datefingarantie'], type: 'date' },
  { header: 'Date de fabrication', field: 'fabrication', aliases: ['datedefabrication', 'fabrication', 'datefabrication'], type: 'date' },
  { header: 'Mise en service', field: 'miseEnService', aliases: ['miseenservice', 'datemiseenservice', 'installation'], type: 'date' },
  { header: 'Dernière maintenance', field: 'derniereMaintenance', aliases: ['dernieremaintenance', 'datedernieremaintenance', 'dernierevisite', 'dermnt'], type: 'date' },
  { header: 'Prochaine maintenance', field: 'prochaineMaintenance', aliases: ['prochainemaintenance', 'prochainevisite', 'dateprochainemaintenance', 'prochainev'], type: 'date' },
  { header: 'Sortie fabricant', field: 'sortieFabricant', aliases: ['sortiefabricant', 'datesortiefabricant'], type: 'date' },

  { header: 'Modèle électrode A', field: 'modeleElectrodeAId', aliases: ['modeleelectrodea', 'modelea', 'electrodeamodele', 'modeleelectrodeaid'] },
  { header: 'Lot électrode A', field: 'lotElectrodeA', aliases: ['lotelectrodea', 'lota', 'electrodealot'] },
  { header: 'Insertion électrode A', field: 'insertionElectrodeA', aliases: ['insertionelectrodea', 'insertiona', 'dateinsertionelectrodea'], type: 'date' },
  { header: 'Péremption électrode A', field: 'peremptionElectrodeA', aliases: ['peremptionelectrodea', 'peremptiona', 'dateperemptionelectrodea', 'dateperemptiona'], type: 'date' },
  { header: 'Livraison électrode A', field: 'livraisonElectrodeA', aliases: ['livraisonelectrodea', 'livraisona', 'datelivraisonelectrodea'], type: 'date' },
  { header: 'Situation électrode A', field: 'situationElectrodeA', aliases: ['situationelectrodea', 'situationa', 'etatelectrodea'] },
  { header: 'Commentaire électrode A', field: 'commentaireElectrodeA', aliases: ['commentaireelectrodea', 'commentairea', 'noteelectrodea'] },
  { header: 'Électrode secours A', field: 'hasElectrodeASecours', aliases: ['electrodesecoursa', 'haselectrodeasecours', 'secoursa'], type: 'yesno' },
  { header: 'Modèle secours A', field: 'modeleElectrodeASecoursId', aliases: ['modelesecoursa', 'modeleelectrodeasecours', 'modeleelectrodeasecoursid'] },
  { header: 'Lot secours A', field: 'lotElectrodeASecours', aliases: ['lotsecoursa', 'lotelectrodeasecours'] },
  { header: 'Péremption secours A', field: 'peremptionSecoursElectrodeA', aliases: ['peremptionsecoursa', 'peremptionsecourselectrodea', 'dateperemptionsecoursa'], type: 'date' },
  { header: 'Pad-Pak Adulte', field: 'hasPadpakA', aliases: ['padpakadulte', 'haspadpaka', 'padpaka'], type: 'yesno' },
  { header: 'Lot Pad-Pak A', field: 'lotPadpakA', aliases: ['lotpadpaka', 'lotpadpakadulte'] },
  { header: 'Péremption Pad-Pak A', field: 'peremptionPadpakA', aliases: ['peremptionpadpaka', 'peremptionpadpakadulte', 'dateperemptionpadpaka'], type: 'date' },

  { header: 'Modèle électrode P', field: 'modeleElectrodePId', aliases: ['modeleelectrodep', 'modelep', 'electrodepModele', 'modeleelectrodepid'] },
  { header: 'Lot électrode P', field: 'lotElectrodeP', aliases: ['lotelectrodep', 'lotp', 'electrodeplot'] },
  { header: 'Insertion électrode P', field: 'insertionElectrodeP', aliases: ['insertionelectrodep', 'insertionp', 'dateinsertionelectrodep'], type: 'date' },
  { header: 'Péremption électrode P', field: 'peremptionElectrodeP', aliases: ['peremptionelectrodep', 'peremptionp', 'dateperemptionelectrodep', 'dateperemptionp'], type: 'date' },
  { header: 'Livraison électrode P', field: 'livraisonElectrodeP', aliases: ['livraisonelectrodep', 'livraisonp', 'datelivraisonelectrodep'], type: 'date' },
  { header: 'Situation électrode P', field: 'situationElectrodeP', aliases: ['situationelectrodep', 'situationp', 'etatelectrodep'] },
  { header: 'Commentaire électrode P', field: 'commentaireElectrodeP', aliases: ['commentaireelectrodep', 'commentairep', 'noteelectrodep'] },
  { header: 'Électrode secours P', field: 'hasElectrodePSecours', aliases: ['electrodesecoursp', 'haselectrodepsecours', 'secoursp'], type: 'yesno' },
  { header: 'Modèle secours P', field: 'modeleElectrodePSecoursId', aliases: ['modelesecoursp', 'modeleelectrodepsecours', 'modeleelectrodepsecoursid'] },
  { header: 'Lot secours P', field: 'lotElectrodePSecours', aliases: ['lotsecoursp', 'lotelectrodepsecours'] },
  { header: 'Péremption secours P', field: 'peremptionSecoursElectrodeP', aliases: ['peremptionsecoursp', 'peremptionsecourselectrodep', 'dateperemptionsecoursp'], type: 'date' },
  { header: 'Pad-Pak Pédiatrique', field: 'hasPadpakP', aliases: ['padpakpediatrique', 'haspadpakp', 'padpakp'], type: 'yesno' },
  { header: 'Lot Pad-Pak P', field: 'lotPadpakP', aliases: ['lotpadpakp', 'lotpadpakpediatrique'] },
  { header: 'Péremption Pad-Pak P', field: 'peremptionPadpakP', aliases: ['peremptionpadpakp', 'peremptionpadpakpediatrique', 'dateperemptionpadpakp'], type: 'date' },

  { header: 'Modèle batterie B', field: 'modeleBatterieId', aliases: ['modelebatterieb', 'modelebatterie', 'modeleb', 'batteriemodele', 'modelebatterieid'] },
  { header: 'Lot batterie B', field: 'lotBatterie', aliases: ['lotbatterieb', 'lotbatterie', 'lotb', 'batterielot'] },
  { header: 'Insertion batterie B', field: 'insertionBatterie', aliases: ['insertionbatterieb', 'insertionbatterie', 'insertionb', 'dateinsertionbatterie'], type: 'date' },
  { header: 'Fabrication batterie B', field: 'fabricationBatterie', aliases: ['fabricationbatterieb', 'fabricationbatterie', 'fabricationb', 'datefabricationbatterie'], type: 'date' },
  { header: 'Péremption batterie B', field: 'peremptionBatterie', aliases: ['peremptionbatterieb', 'peremptionbatterie', 'peremptionb', 'dateperemptionbatterie', 'dateperemptionb'], type: 'date' },
  { header: 'Livraison batterie B', field: 'livraisonBatterie', aliases: ['livraisonbatterieb', 'livraisonbatterie', 'livraisonb', 'datelivraisonbatterie'], type: 'date' },
  { header: 'Situation batterie B', field: 'situationBatterie', aliases: ['situationbatterieb', 'situationbatterie', 'situationb', 'etatbatterie'] },
  { header: 'Pourcentage batterie B', field: 'pourcentageBatterie', aliases: ['pourcentagebatterieb', 'pourcentagebatterie', 'pourcentageb', 'pourcentageconstateb', 'batteriepourcentage'] },
  { header: 'Commentaire batterie B', field: 'commentaireBatterie', aliases: ['commentairebatterieb', 'commentairebatterie', 'commentaireb', 'notebatterie'] },
  { header: 'Batterie secours B', field: 'hasBatterieSecours', aliases: ['batteriesecoursb', 'hasbatteriesecours', 'secoursb', 'batteriesecours'], type: 'yesno' },
  { header: 'Modèle secours B', field: 'modeleBatterieSecoursId', aliases: ['modelesecoursb', 'modelebatteriesecours', 'modelebatteriesecoursid'] },
  { header: 'Lot secours B', field: 'lotBatterieSecours', aliases: ['lotsecoursb', 'lotbatteriesecours'] },
  { header: 'Péremption secours B', field: 'peremptionBatterieSecours', aliases: ['peremptionsecoursb', 'peremptionbatteriesecours', 'dateperemptionsecoursb'], type: 'date' },

  { header: 'Loué', field: 'loue', aliases: ['loue', 'location', 'enlocation'], type: 'yesno' },
  { header: 'Prêté', field: 'prete', aliases: ['prete', 'pret', 'enpret'], type: 'yesno' },
  { header: 'Stocké', field: 'stocke', aliases: ['stocke', 'enstock'], type: 'yesno' },
  { header: 'Archivé', field: 'archive', aliases: ['archive', 'inactif'], type: 'yesno' },
  { header: 'Conforme', field: 'conforme', aliases: ['conforme', 'conformite'], type: 'yesno' },
  { header: 'Sous-traitance', field: 'sousTraitance', aliases: ['soustraitance', 'soustraitant'], type: 'yesno' },
  { header: 'Maintenance autorisée', field: 'fsmAutorise', aliases: ['maintenanceautorisee', 'fsmautorise', 'maintenance', 'autorisationmaintenance'], type: 'yesno' },
  { header: 'Victime avec survie', field: 'victimeSurvie', aliases: ['victimeavecsurvie', 'victimesurvie'], type: 'yesno' },
  { header: 'Victime sans survie', field: 'victimeSansSurvie', aliases: ['victimesanssurvie'], type: 'yesno' },
  { header: 'Âge victime', field: 'ageVictime', aliases: ['agevictime', 'age'] },
  { header: 'Commentaire campagne rappel', field: 'commentaireCampagneRappel', aliases: ['commentairecampagnerappel', 'campagnerappel'] },
  { header: 'Rappel mensuel auto', field: 'rappelMensuelAuto', aliases: ['rappelmensuelauto', 'rappelmensuel'], type: 'yesno' },
  { header: 'Rappel hebdo auto', field: 'rappelHebdoAuto', aliases: ['rappelhebdoauto', 'rappelhebdo', 'rappelhebdomadaire'], type: 'yesno' },
  { header: 'Rappel journalier auto', field: 'rappelJournalierAuto', aliases: ['rappeljournalierauto', 'rappeljournalier'], type: 'yesno' },
];

// ==========================================
// 2. AUTRES MATERIELS MAPPING (GET & POST)
// ==========================================
export const AUTRES_CANONICAL_HEADERS: Array<{ header: string; field: string; aliases: string[]; isSpecifique?: boolean; type?: 'yesno' | 'bool' | 'date' }> = [
  { header: 'Identifiant', field: 'identifiant', aliases: ['identifiant', 'id', 'code', 'identifiantmateriel'] },
  { header: 'Catégorie', field: 'categorie', aliases: ['categorie', 'categoriedemateriel', 'categoriemateriel', 'type', 'typemateriel'] },
  { header: 'Client lié', field: 'clientNom', aliases: ['clientlie', 'client', 'clientnom', 'entreprise', 'denomination'] },
  { header: 'Nom et prénom sur site', field: 'nomPrenomSite', aliases: ['nometprenomsursite', 'nomprenomsite', 'contactsite', 'contactsursite'] },
  { header: 'Téléphone portable sur site', field: 'telephoneSite', aliases: ['telephoneportablesursite', 'telephonesite', 'telsite'] },
  { header: 'Email sur site', field: 'emailSite', aliases: ['emailsursite', 'emailsite', 'mailsite'] },
  { header: 'Contrat', field: 'contrat', aliases: ['contrat', 'aveccontrat'], type: 'yesno' },
  { header: 'Nom du contrat', field: 'nomContrat', aliases: ['nomducontrat', 'nomcontrat'] },
  { header: 'Référence contrat', field: 'referenceContrat', aliases: ['referencecontrat', 'refcontrat'] },
  { header: 'Début du contrat', field: 'debutContrat', aliases: ['debutducontrat', 'debutcontrat'], type: 'date' },
  { header: 'Fin du contrat', field: 'finContrat', aliases: ['finducontrat', 'fincontrat'], type: 'date' },
  { header: 'Payeur ID', field: 'payeurId', aliases: ['payeurid', 'idpayeur'] },
  { header: 'Client ID', field: 'clientIdField', aliases: ['clientid', 'idclient', 'clientidfield'] },

  { header: 'Numéro et voie', field: 'numeroVoie', aliases: ['numeroetvoie', 'numerovoie', 'numvoie', 'adresse', 'rue'] },
  { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'city'] },
  { header: 'Code postal', field: 'codePostal', aliases: ['codepostal', 'cp', 'zip'] },
  { header: 'Région', field: 'region', aliases: ['region'] },
  { header: 'Pays', field: 'pays', aliases: ['pays', 'country'] },
  { header: 'Latitude', field: 'latitude', aliases: ['latitude', 'lat'] },
  { header: 'Longitude', field: 'longitude', aliases: ['longitude', 'lng', 'lon'] },
  { header: "Aide à l'accès", field: 'aideAcces', aliases: ['aidealacces', 'aideacces', 'commentaireadresse', 'emplacement'] },
  { header: 'Accès 24/7', field: 'acces247', aliases: ['acces247', '247'], type: 'bool' },
  { header: 'Accès semaine', field: 'accesSemaine', aliases: ['accessemaine'], type: 'bool' },
  { header: 'Accès week-end', field: 'accesWeekend', aliases: ['accesweekend'], type: 'bool' },
  { header: 'Extérieur', field: 'exterieur', aliases: ['exterieur'], type: 'bool' },
  { header: "Horaires d'ouverture", field: 'horaires', aliases: ['horairesdouverture', 'horaires'] },

  { header: 'Expiration garantie', field: 'expirationGarantie', aliases: ['expirationgarantie', 'fingarantie', 'garantie'], type: 'date' },
  { header: 'Date de fabrication', field: 'dateFabrication', aliases: ['datedefabrication', 'datefabrication', 'fabrication'], type: 'date' },
  { header: 'Mise en service', field: 'miseEnService', aliases: ['miseenservice', 'datemiseenservice'], type: 'date' },
  { header: 'Dernière maintenance', field: 'derniereMaintenance', aliases: ['dernieremaintenance', 'dernierevisite'], type: 'date' },
  { header: 'Prochaine maintenance', field: 'prochaineMaintenance', aliases: ['prochainemaintenance', 'prochainevisite'], type: 'date' },
  { header: 'Tournée', field: 'tournee', aliases: ['tournee', 'secteur'] },

  { header: 'Loué', field: 'loue', aliases: ['loue'], type: 'yesno' },
  { header: 'Prêté', field: 'prete', aliases: ['prete'], type: 'yesno' },
  { header: 'Stocké', field: 'stocke', aliases: ['stocke'], type: 'yesno' },
  { header: 'Archivé', field: 'archive', aliases: ['archive'], type: 'yesno' },
  { header: 'Conforme', field: 'conforme', aliases: ['conforme'], type: 'yesno' },
  { header: 'Sous-traitance', field: 'sousTraitance', aliases: ['soustraitance'], type: 'yesno' },
  { header: 'Maintenance autorisée', field: 'fsmAutorise', aliases: ['maintenanceautorisee', 'fsmautorise'], type: 'yesno' },
  { header: 'Rappel mensuel auto', field: 'rappelMensuelAuto', aliases: ['rappelmensuelauto'], type: 'yesno' },
  { header: 'Rappel hebdo auto', field: 'rappelHebdoAuto', aliases: ['rappelhebdoauto'], type: 'yesno' },
  { header: 'Rappel journalier auto', field: 'rappelJournalierAuto', aliases: ['rappeljournalierauto'], type: 'yesno' },

  // Specifiques fields
  { header: 'Numéro de série', field: 'numSerie', aliases: ['numerodeserie', 'numeroserie', 'numserie', 'serie'], isSpecifique: true },
  { header: 'Marque / Modèle', field: 'marqueModele', aliases: ['marquemodele', 'modele', 'marque'], isSpecifique: true },
  { header: 'Agent extincteur', field: 'agentExtincteur', aliases: ['agentextincteur', 'typeextincteur', 'agent'], isSpecifique: true },
  { header: 'Capacité / Poids', field: 'capacite', aliases: ['capacitepoids', 'capacite', 'poids', 'volume'], isSpecifique: true },
  { header: 'Pression', field: 'pression', aliases: ['pression', 'typepression'], isSpecifique: true },
  { header: "Date d'épreuve", field: 'dateEpreuve', aliases: ['datedepreuve', 'dateepreuve', 'epreuve'], isSpecifique: true, type: 'date' },
  { header: 'Date de recharge', field: 'dateRecharge', aliases: ['datederecharge', 'daterecharge', 'recharge'], isSpecifique: true, type: 'date' },
  { header: 'Emplacements', field: 'emplacements', aliases: ['emplacements', 'emplacement'], isSpecifique: true },
  { header: 'Commentaire spécifique', field: 'commentaireSpecifique', aliases: ['commentairespecifique', 'commentaire', 'observationspecifique'], isSpecifique: true },
];

// ==========================================
// 3. CLIENTS MAPPING (GET & POST)
// ==========================================
export const CLIENTS_CANONICAL_HEADERS: Array<{ header: string; field: string; aliases: string[]; type?: 'yesno' | 'date' }> = [
  { header: 'Dénomination', field: 'denomination', aliases: ['denomination', 'entreprise', 'raisonsociale', 'nomclient', 'societe', 'nom'] },
  { header: "Numéro d'entreprise", field: 'siret', aliases: ['numerodentreprise', 'numeroentreprise', 'siret', 'siren', 'numerofiscal', 'identifiantfiscal'] },
  { header: 'TVA Intracommunautaire', field: 'tvaIntra', aliases: ['tvaintracommunautaire', 'tvaintra', 'numerotva', 'tva'] },
  { header: 'Numéro et voie', field: 'adresse', aliases: ['numeroetvoie', 'adresse', 'numvoie', 'rue', 'voie'] },
  { header: 'Code postal', field: 'codePostal', aliases: ['codepostal', 'cp', 'zip'] },
  { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city'] },
  { header: 'Pays', field: 'pays', aliases: ['pays', 'country'] },
  { header: 'Nom et prénom', field: 'nomPrenom', aliases: ['nometprenom', 'nomprenom', 'contact', 'interlocuteur', 'responsable'] },
  { header: 'Téléphone', field: 'phone', aliases: ['telephone', 'phone', 'tel', 'telephoneprincipal'] },
  { header: 'Email', field: 'email', aliases: ['email', 'mail', 'courriel', 'emailprincipal'] },
  { header: 'Nom et prénom sur site', field: 'nomPrenomSite', aliases: ['nometprenomsursite', 'nomprenomsite', 'contactsursite', 'contactsite'] },
  { header: 'Téléphone portable sur site', field: 'telephoneSite', aliases: ['telephoneportablesursite', 'telephonesursite', 'telephonesite', 'telsite'] },
  { header: 'Email sur site', field: 'emailSite', aliases: ['emailsursite', 'emailsite', 'mailsite'] },
  { header: 'Contrat', field: 'contrat', aliases: ['contrat', 'aveccontrat', 'souscontrat'], type: 'yesno' },
  { header: 'Nom du contrat', field: 'nomContrat', aliases: ['nomducontrat', 'nomcontrat', 'typecontrat'] },
  { header: 'Référence contrat', field: 'referenceContrat', aliases: ['referencecontrat', 'refcontrat', 'numerocontrat'] },
  { header: 'Début du contrat', field: 'debutContrat', aliases: ['debutducontrat', 'debutcontrat', 'datedebutcontrat'], type: 'date' },
  { header: 'Fin du contrat', field: 'finContrat', aliases: ['finducontrat', 'fincontrat', 'datefincontrat'], type: 'date' },
  { header: 'Payeur ID', field: 'payeurId', aliases: ['payeurid', 'idpayeur', 'codepayeur'] },
  { header: 'Client ID', field: 'clientIdField', aliases: ['clientid', 'idclient', 'codeclient', 'clientidfield'] },
  { header: 'Code PIN Signature', field: 'signaturePin', aliases: ['codepinsignature', 'signaturepin', 'pin', 'codepin'] },
  { header: 'Accès Portail Client', field: 'accesPortail', aliases: ['accesportailclient', 'accesportail', 'portailclient'], type: 'yesno' },
  { header: 'Identifiant Portail', field: 'identifiantPortail', aliases: ['identifiantportail', 'loginportail'] },
  { header: 'Mot de passe Portail', field: 'motDePassePortail', aliases: ['motdepasseportail', 'passwordportail'] },
  { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'notes', 'observation'] },
];

export function mapRowToDefib(headers: string[], row: string[], rowIndex: number, tenantId: string): any {
  const normHeaders = headers.map(normalizeHeaderKey);
  const rawByHeader: Record<string, string> = {};
  headers.forEach((h, idx) => {
    rawByHeader[h] = row[idx] !== undefined ? String(row[idx]).trim() : '';
  });

  const obj: any = {
    envId: tenantId,
    tenantId: tenantId,
    _sheetRowNumber: rowIndex + 2, // 1-based header = row 1, first data row = row 2
    _rawSheetRow: rawByHeader,
    pays: 'France',
    contrat: 'Non',
    kitCiseauxPresents: 'Oui',
    kitMasquePresent: 'Oui',
    kitServiettesPresentes: 'Oui',
    kitGantsPresents: 'Oui',
    kitRasoirPresent: 'Oui',
    situationElectrodeA: 'Vert',
    situationElectrodeP: 'Vert',
    situationBatterie: 'Vert',
    hasElectrodeASecours: 'Non',
    hasElectrodePSecours: 'Non',
    hasBatterieSecours: 'Non',
    hasPadpakA: 'Non',
    hasPadpakP: 'Non',
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
    rappelMensuelAuto: 'Non',
    rappelHebdoAuto: 'Non',
    rappelJournalierAuto: 'Non',
  };

  for (const def of DEFIB_CANONICAL_HEADERS) {
    let matchedIdx = -1;
    for (let i = 0; i < normHeaders.length; i++) {
      if (def.aliases.includes(normHeaders[i])) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      const rawVal = row[matchedIdx] !== undefined ? String(row[matchedIdx]).trim() : '';
      if (def.type === 'yesno') {
        const defVal = ['conforme', 'fsmAutorise', 'kitCiseauxPresents', 'kitMasquePresent', 'kitServiettesPresentes', 'kitGantsPresents', 'kitRasoirPresent'].includes(def.field) ? 'Oui' : 'Non';
        obj[def.field] = normalizeYesNo(rawVal, defVal);
      } else if (def.type === 'bool') {
        obj[def.field] = normalizeBool(rawVal, false);
      } else if (def.type === 'date') {
        obj[def.field] = normalizeDateStr(rawVal);
      } else {
        obj[def.field] = rawVal;
      }
    }
  }

  // Keep convenient aliases so both table and form work seamlessly
  if (obj.modeleId && !obj.modele) obj.modele = obj.modeleId;
  if (obj.clientNom && !obj.nomSite) obj.nomSite = obj.clientNom;
  if (obj.nomSite && !obj.clientNom) obj.clientNom = obj.nomSite;
  if (obj.clientIdField && !obj.clientId) obj.clientId = obj.clientIdField;

  const cleanIdent = String(obj.identifiant || '').trim();
  const cleanSn = String(obj.numeroSerie || '').trim();
  obj.id = cleanIdent || cleanSn || `sheet_df_${tenantId}_${rowIndex + 2}`;
  if (!obj.identifiant) obj.identifiant = obj.id;

  return obj;
}

export function mapDefibToRow(headers: string[], defib: any, existingRow?: string[]): string[] {
  const effectiveHeaders = headers && headers.length > 0 ? headers : DEFIB_CANONICAL_HEADERS.map(d => d.header);
  const normHeaders = effectiveHeaders.map(normalizeHeaderKey);
  const outRow: string[] = effectiveHeaders.map((h, i) => {
    if (existingRow && existingRow[i] !== undefined) return existingRow[i];
    if (defib._rawSheetRow && defib._rawSheetRow[h] !== undefined) return defib._rawSheetRow[h];
    return '';
  });

  for (const def of DEFIB_CANONICAL_HEADERS) {
    let matchedIdx = -1;
    for (let i = 0; i < normHeaders.length; i++) {
      if (def.aliases.includes(normHeaders[i])) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      let val = defib[def.field];
      if (def.field === 'modeleId' && defib.modele && !String(defib.modele).startsWith('v_')) {
        val = defib.modele;
      }
      if (def.field === 'clientNom') {
        val = defib.clientNom || defib.nomSite || '';
      }
      if (val !== undefined && val !== null) {
        if (def.type === 'bool') {
          outRow[matchedIdx] = val ? 'Oui' : 'Non';
        } else {
          outRow[matchedIdx] = String(val);
        }
      }
    }
  }
  return outRow;
}

export function mapRowToAutreMateriel(headers: string[], row: string[], rowIndex: number, tenantId: string): any {
  const normHeaders = headers.map(normalizeHeaderKey);
  const rawByHeader: Record<string, string> = {};
  headers.forEach((h, idx) => {
    rawByHeader[h] = row[idx] !== undefined ? String(row[idx]).trim() : '';
  });

  const specifiques: Record<string, any> = {};
  const obj: any = {
    envId: tenantId,
    tenantId: tenantId,
    _sheetRowNumber: rowIndex + 2,
    _rawSheetRow: rawByHeader,
    categorie: 'Extincteur',
    pays: 'France',
    loue: 'Non',
    prete: 'Non',
    stocke: 'Non',
    archive: 'Non',
    conforme: 'Oui',
    sousTraitance: 'Non',
    fsmAutorise: 'Oui',
    rappelMensuelAuto: 'Non',
    rappelHebdoAuto: 'Non',
    rappelJournalierAuto: 'Non',
    specifiques,
  };

  const matchedColIndices = new Set<number>();
  for (const def of AUTRES_CANONICAL_HEADERS) {
    let matchedIdx = -1;
    for (let i = 0; i < normHeaders.length; i++) {
      if (def.aliases.includes(normHeaders[i])) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      matchedColIndices.add(matchedIdx);
      const rawVal = row[matchedIdx] !== undefined ? String(row[matchedIdx]).trim() : '';
      let formatted: any = rawVal;
      if (def.type === 'yesno') {
        const defVal = ['conforme', 'fsmAutorise'].includes(def.field) ? 'Oui' : 'Non';
        formatted = normalizeYesNo(rawVal, defVal);
      } else if (def.type === 'bool') {
        formatted = normalizeBool(rawVal, false);
      } else if (def.type === 'date') {
        formatted = normalizeDateStr(rawVal);
      }
      if (def.isSpecifique) {
        if (formatted !== '') specifiques[def.field] = formatted;
      } else {
        obj[def.field] = formatted;
      }
    }
  }

  // Also preserve any extra non-empty columns into specifiques so no category field is ever lost
  headers.forEach((h, i) => {
    if (!matchedColIndices.has(i) && row[i] && String(row[i]).trim() !== '') {
      specifiques[h] = String(row[i]).trim();
    }
  });

  if (obj.clientIdField && !obj.clientId) obj.clientId = obj.clientIdField;
  if (obj.clientNom && !obj.clientId) obj.clientId = obj.clientNom;

  const cleanIdent = String(obj.identifiant || '').trim();
  obj.id = cleanIdent || `sheet_am_${tenantId}_${rowIndex + 2}`;
  if (!obj.identifiant) obj.identifiant = obj.id;

  return obj;
}

export function mapAutreMaterielToRow(headers: string[], item: any, existingRow?: string[]): string[] {
  const effectiveHeaders = headers && headers.length > 0 ? headers : AUTRES_CANONICAL_HEADERS.map(d => d.header);
  const normHeaders = effectiveHeaders.map(normalizeHeaderKey);
  const outRow: string[] = effectiveHeaders.map((h, i) => {
    if (existingRow && existingRow[i] !== undefined) return existingRow[i];
    if (item._rawSheetRow && item._rawSheetRow[h] !== undefined) return item._rawSheetRow[h];
    if (item.specifiques && item.specifiques[h] !== undefined) return String(item.specifiques[h]);
    return '';
  });

  for (const def of AUTRES_CANONICAL_HEADERS) {
    let matchedIdx = -1;
    for (let i = 0; i < normHeaders.length; i++) {
      if (def.aliases.includes(normHeaders[i])) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      const val = def.isSpecifique ? item.specifiques?.[def.field] : item[def.field];
      if (val !== undefined && val !== null) {
        if (def.type === 'bool') {
          outRow[matchedIdx] = val ? 'Oui' : 'Non';
        } else {
          outRow[matchedIdx] = String(val);
        }
      }
    }
  }
  return outRow;
}

export function mapRowToClient(headers: string[], row: string[], rowIndex: number, tenantId: string): any {
  const normHeaders = headers.map(normalizeHeaderKey);
  const rawByHeader: Record<string, string> = {};
  headers.forEach((h, idx) => {
    rawByHeader[h] = row[idx] !== undefined ? String(row[idx]).trim() : '';
  });

  const obj: any = {
    envId: tenantId,
    tenantId: tenantId,
    _sheetRowNumber: rowIndex + 2,
    _rawSheetRow: rawByHeader,
    pays: 'France',
    contrat: 'Non',
    accesPortail: 'Non',
  };

  for (const def of CLIENTS_CANONICAL_HEADERS) {
    let matchedIdx = -1;
    for (let i = 0; i < normHeaders.length; i++) {
      if (def.aliases.includes(normHeaders[i])) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      const rawVal = row[matchedIdx] !== undefined ? String(row[matchedIdx]).trim() : '';
      if (def.type === 'yesno') {
        obj[def.field] = normalizeYesNo(rawVal, 'Non');
      } else if (def.type === 'date') {
        obj[def.field] = normalizeDateStr(rawVal);
      } else {
        obj[def.field] = rawVal;
      }
    }
  }

  const cleanClientId = String(obj.clientIdField || '').trim();
  const cleanSiret = String(obj.siret || '').trim();
  const cleanDenom = String(obj.denomination || '').trim();
  obj.id = cleanClientId || cleanSiret || (cleanDenom ? `cli_${cleanDenom.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : `sheet_cli_${tenantId}_${rowIndex + 2}`);
  if (!obj.clientIdField) obj.clientIdField = obj.id;

  return obj;
}

export function mapClientToRow(headers: string[], client: any, existingRow?: string[]): string[] {
  const effectiveHeaders = headers && headers.length > 0 ? headers : CLIENTS_CANONICAL_HEADERS.map(d => d.header);
  const normHeaders = effectiveHeaders.map(normalizeHeaderKey);
  const outRow: string[] = effectiveHeaders.map((h, i) => {
    if (existingRow && existingRow[i] !== undefined) return existingRow[i];
    if (client._rawSheetRow && client._rawSheetRow[h] !== undefined) return client._rawSheetRow[h];
    return '';
  });

  for (const def of CLIENTS_CANONICAL_HEADERS) {
    let matchedIdx = -1;
    for (let i = 0; i < normHeaders.length; i++) {
      if (def.aliases.includes(normHeaders[i])) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      const val = client[def.field];
      if (val !== undefined && val !== null) {
        outRow[matchedIdx] = String(val);
      }
    }
  }
  return outRow;
}

// ==========================================
// 4. MIRROR OVERLAY MANAGEMENT (Disk Persistence)
// ==========================================
function getMirrorFilePath(tenantId: string, tabType: SheetTabType, spreadsheetId: string): string {
  const safeTenant = String(tenantId || 'demo').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeSheet = String(spreadsheetId || 'default').slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(getMirrorDir(), `${safeTenant}_${tabType}_${safeSheet}.json`);
}

function loadMirrorOverlay(tenantId: string, tabType: SheetTabType, spreadsheetId: string): MirrorOverlay {
  const p = getMirrorFilePath(tenantId, tabType, spreadsheetId);
  if (fs.existsSync(p)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        return {
          headers: Array.isArray(parsed.headers) ? parsed.headers : [],
          upsertedById: parsed.upsertedById || {},
          deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
          lastSyncedAt: parsed.lastSyncedAt || 0,
        };
      }
    } catch (_) {}
  }
  return { headers: [], upsertedById: {}, deletedIds: [], lastSyncedAt: 0 };
}

function saveMirrorOverlay(tenantId: string, tabType: SheetTabType, spreadsheetId: string, overlay: MirrorOverlay): void {
  const p = getMirrorFilePath(tenantId, tabType, spreadsheetId);
  try {
    fs.writeFileSync(p, JSON.stringify(overlay), 'utf-8');
  } catch (err) {
    console.warn('[GoogleSheetsEngine] Mirror save error:', err);
  }
}

function getRecordLookupKeys(item: any, tabType: SheetTabType): string[] {
  if (!item || typeof item !== 'object') return [];
  if (tabType === 'clients') {
    return [item.id, item.clientIdField, item.siret, item.denomination]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  return [item.id, item.identifiant, item.numeroSerie]
    .filter(Boolean)
    .map(s => String(s).trim().toLowerCase());
}

// ==========================================
// 5. LIVE GOOGLE SHEET FETCHING & WRITING
// ==========================================
async function fetchRawSheetMatrix(spreadsheetUrl: string): Promise<{ headers: string[]; rows: string[][] } | null> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted) return null;
  const { spreadsheetId, gid } = extracted;
  const cfg = getGlobalGoogleConfig();

  // Strategy 1: Google Sheets API v4 (if Service Account or API Key is configured)
  const accessToken = await getServiceAccountAccessToken();
  if (accessToken || cfg.apiKey) {
    try {
      const authQuery = !accessToken && cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
      const headersInit: Record<string, string> = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const apiRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:ZZ50000${authQuery}`,
        { headers: headersInit, signal: AbortSignal.timeout(15000) }
      );
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (Array.isArray(json?.values) && json.values.length > 0) {
          const headers = (json.values[0] || []).map((c: any) => String(c || '').trim());
          const rows = json.values.slice(1).map((r: any[]) => r.map(c => String(c ?? '').trim()));
          return { headers, rows };
        }
      }
    } catch (_) {}
  }

  // Strategy 2: Direct Google Sheets CSV Export (works on any link shared with "Anyone with link")
  const csvUrls = [
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ''}`,
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?tqx=out:csv${gid ? `&gid=${encodeURIComponent(gid)}` : ''}`,
  ];

  for (const csvUrl of csvUrls) {
    try {
      const res = await fetch(csvUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DefibeoSheetsEngine/1.0)',
          Accept: 'text/csv,text/plain,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        if (text && !text.trim().startsWith('<!DOCTYPE html') && !text.trim().startsWith('<html') && !contentType.includes('text/html')) {
          const parsed = parseCsvText(text);
          if (parsed.length > 0) {
            return {
              headers: parsed[0],
              rows: parsed.slice(1),
            };
          }
        }
      }
    } catch (_) {}
  }

  // Strategy 3: Global Apps Script Bridge URL (if configured)
  if (cfg.appsScriptBridgeUrl) {
    try {
      const bridgeRes = await fetch(cfg.appsScriptBridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'readSheet',
          spreadsheetUrl,
          spreadsheetId,
          gid,
        }),
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (bridgeRes.ok) {
        const json = await bridgeRes.json();
        if (Array.isArray(json?.headers) && Array.isArray(json?.rows)) {
          return { headers: json.headers, rows: json.rows };
        }
      }
    } catch (_) {}
  }

  return null;
}

export async function fetchTenantSheetCollection(
  spreadsheetUrl: string,
  tenantId: string,
  tabType: SheetTabType,
  forceRefresh = false
): Promise<{ items: any[]; headers: string[]; totalCount: number; fromSpreadsheet: boolean }> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted) {
    return { items: [], headers: [], totalCount: 0, fromSpreadsheet: false };
  }

  const cacheKey = `${tenantId}_${tabType}_${extracted.spreadsheetId}_${extracted.gid || '0'}`;
  if (!forceRefresh && sheetMemoryCache.has(cacheKey)) {
    const cached = sheetMemoryCache.get(cacheKey)!;
    if (Date.now() - cached.fetchedAt < 15000) {
      return {
        items: cached.items,
        headers: cached.headers,
        totalCount: cached.items.length,
        fromSpreadsheet: true,
      };
    }
  }

  const overlay = loadMirrorOverlay(tenantId, tabType, extracted.spreadsheetId);
  const rawMatrix = await fetchRawSheetMatrix(spreadsheetUrl);

  const defaultHeaders =
    tabType === 'defibrillateurs'
      ? DEFIB_CANONICAL_HEADERS.map(d => d.header)
      : tabType === 'autresMateriels'
      ? AUTRES_CANONICAL_HEADERS.map(d => d.header)
      : CLIENTS_CANONICAL_HEADERS.map(d => d.header);

  const headers = rawMatrix && rawMatrix.headers.length > 0
    ? rawMatrix.headers
    : (overlay.headers.length > 0 ? overlay.headers : defaultHeaders);

  if (rawMatrix && rawMatrix.headers.length > 0 && overlay.headers.length === 0) {
    overlay.headers = rawMatrix.headers;
    saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);
  }

  const deletedSet = new Set((overlay.deletedIds || []).map(k => String(k).trim().toLowerCase()));
  const baseItems: any[] = [];

  if (rawMatrix && Array.isArray(rawMatrix.rows)) {
    for (let i = 0; i < rawMatrix.rows.length; i++) {
      const r = rawMatrix.rows[i];
      if (!r || r.every(c => !c || String(c).trim() === '')) continue;

      const mapped =
        tabType === 'defibrillateurs'
          ? mapRowToDefib(headers, r, i, tenantId)
          : tabType === 'autresMateriels'
          ? mapRowToAutreMateriel(headers, r, i, tenantId)
          : mapRowToClient(headers, r, i, tenantId);

      const keys = getRecordLookupKeys(mapped, tabType);
      if (keys.some(k => deletedSet.has(k))) continue;

      baseItems.push(mapped);
    }
  }

  // Merge upserted records from overlay (matching by ID / Identifiant / SIRET)
  const upsertedEntries = Object.values(overlay.upsertedById || {});
  if (upsertedEntries.length > 0) {
    for (const upItem of upsertedEntries) {
      const upKeys = getRecordLookupKeys(upItem, tabType);
      if (upKeys.some(k => deletedSet.has(k))) continue;

      const existingIdx = baseItems.findIndex(b => {
        const bKeys = getRecordLookupKeys(b, tabType);
        return bKeys.some(bk => upKeys.includes(bk));
      });

      if (existingIdx >= 0) {
        baseItems[existingIdx] = {
          ...baseItems[existingIdx],
          ...upItem,
          _sheetRowNumber: baseItems[existingIdx]._sheetRowNumber || upItem._sheetRowNumber,
          _rawSheetRow: {
            ...(baseItems[existingIdx]._rawSheetRow || {}),
            ...(upItem._rawSheetRow || {}),
          },
        };
      } else {
        baseItems.push(upItem);
      }
    }
  }

  sheetMemoryCache.set(cacheKey, {
    headers,
    items: baseItems,
    fetchedAt: Date.now(),
    spreadsheetUrl,
  });

  return {
    items: baseItems,
    headers,
    totalCount: baseItems.length,
    fromSpreadsheet: true,
  };
}

function columnIndexToLetter(colIdxZeroBased: number): string {
  let temp = colIdxZeroBased + 1;
  let letter = '';
  while (temp > 0) {
    const rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter || 'A';
}

export async function upsertRecordsToTenantSheet(
  spreadsheetUrl: string,
  tenantId: string,
  tabType: SheetTabType,
  records: any[]
): Promise<{ success: boolean; count: number; syncedToRemoteSheet: boolean }> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted || !Array.isArray(records) || records.length === 0) {
    return { success: false, count: 0, syncedToRemoteSheet: false };
  }

  const currentData = await fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, false);
  const headers = currentData.headers.length > 0
    ? currentData.headers
    : tabType === 'defibrillateurs'
    ? DEFIB_CANONICAL_HEADERS.map(d => d.header)
    : tabType === 'autresMateriels'
    ? AUTRES_CANONICAL_HEADERS.map(d => d.header)
    : CLIENTS_CANONICAL_HEADERS.map(d => d.header);

  const overlay = loadMirrorOverlay(tenantId, tabType, extracted.spreadsheetId);
  overlay.headers = headers;

  const deletedSet = new Set((overlay.deletedIds || []).map(k => String(k).trim().toLowerCase()));
  const rowsToUpdateRemote: Array<{ rowNumber: number; values: string[] }> = [];
  const rowsToAppendRemote: Array<{ values: string[]; key: string }> = [];

  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    const recKeys = getRecordLookupKeys(rec, tabType);
    const primaryKey = recKeys[0] || `item_${Date.now()}_${Math.random()}`;
    recKeys.forEach(k => deletedSet.delete(k));

    // Find if record already exists in currentData.items
    const existingItem = currentData.items.find(b => {
      const bKeys = getRecordLookupKeys(b, tabType);
      return bKeys.some(bk => recKeys.includes(bk));
    });

    const mergedItem = existingItem
      ? { ...existingItem, ...rec, _sheetRowNumber: existingItem._sheetRowNumber }
      : { ...rec };

    const rowValues =
      tabType === 'defibrillateurs'
        ? mapDefibToRow(headers, mergedItem)
        : tabType === 'autresMateriels'
        ? mapAutreMaterielToRow(headers, mergedItem)
        : mapClientToRow(headers, mergedItem);

    const rawByHeader: Record<string, string> = {};
    headers.forEach((h, i) => {
      rawByHeader[h] = rowValues[i] ?? '';
    });
    mergedItem._rawSheetRow = rawByHeader;

    overlay.upsertedById[primaryKey] = mergedItem;

    if (mergedItem._sheetRowNumber && typeof mergedItem._sheetRowNumber === 'number' && mergedItem._sheetRowNumber >= 2) {
      rowsToUpdateRemote.push({ rowNumber: mergedItem._sheetRowNumber, values: rowValues });
    } else {
      rowsToAppendRemote.push({ values: rowValues, key: primaryKey });
    }
  }

  overlay.deletedIds = Array.from(deletedSet);
  overlay.lastSyncedAt = Date.now();
  saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);

  // Invalidate memory cache so next read immediately reflects updated items
  const cacheKey = `${tenantId}_${tabType}_${extracted.spreadsheetId}_${extracted.gid || '0'}`;
  sheetMemoryCache.delete(cacheKey);

  // Push to live Google Sheet if Service Account or Apps Script Bridge is configured
  let syncedToRemoteSheet = false;
  const accessToken = await getServiceAccountAccessToken();
  const cfg = getGlobalGoogleConfig();

  if (accessToken) {
    try {
      const lastColLetter = columnIndexToLetter(headers.length - 1);
      if (rowsToUpdateRemote.length > 0) {
        const dataPayload = rowsToUpdateRemote.map(u => ({
          range: `A${u.rowNumber}:${lastColLetter}${u.rowNumber}`,
          values: [u.values],
        }));
        const batchRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(extracted.spreadsheetId)}/values:batchUpdate`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              valueInputOption: 'USER_ENTERED',
              data: dataPayload,
            }),
          }
        );
        if (batchRes.ok) syncedToRemoteSheet = true;
      }

      if (rowsToAppendRemote.length > 0) {
        const appendRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(extracted.spreadsheetId)}/values/A1:${lastColLetter}1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: rowsToAppendRemote.map(r => r.values),
            }),
          }
        );
        if (appendRes.ok) syncedToRemoteSheet = true;
      }
    } catch (err) {
      console.warn('[GoogleSheetsEngine] Remote Sheets API write warning:', err);
    }
  } else if (cfg.appsScriptBridgeUrl) {
    try {
      const bridgeRes = await fetch(cfg.appsScriptBridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsertRows',
          spreadsheetUrl,
          spreadsheetId: extracted.spreadsheetId,
          gid: extracted.gid,
          headers,
          updates: rowsToUpdateRemote,
          appends: rowsToAppendRemote,
        }),
        redirect: 'follow',
      });
      if (bridgeRes.ok) syncedToRemoteSheet = true;
    } catch (err) {
      console.warn('[GoogleSheetsEngine] Apps Script Bridge write warning:', err);
    }
  }

  return { success: true, count: records.length, syncedToRemoteSheet };
}

export async function deleteRecordsFromTenantSheet(
  spreadsheetUrl: string,
  tenantId: string,
  tabType: SheetTabType,
  targetKeys: string[]
): Promise<{ success: boolean; deletedCount: number; syncedToRemoteSheet: boolean }> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted || !Array.isArray(targetKeys) || targetKeys.length === 0) {
    return { success: false, deletedCount: 0, syncedToRemoteSheet: false };
  }

  const currentData = await fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, false);
  const overlay = loadMirrorOverlay(tenantId, tabType, extracted.spreadsheetId);
  const normTargets = new Set(targetKeys.filter(Boolean).map(k => String(k).trim().toLowerCase()));

  const rowNumbersToClear: number[] = [];
  for (const item of currentData.items) {
    const iKeys = getRecordLookupKeys(item, tabType);
    if (iKeys.some(k => normTargets.has(k))) {
      if (item._sheetRowNumber && typeof item._sheetRowNumber === 'number') {
        rowNumbersToClear.push(item._sheetRowNumber);
      }
      iKeys.forEach(k => normTargets.add(k));
    }
  }

  for (const [upKey, upVal] of Object.entries(overlay.upsertedById)) {
    const uKeys = getRecordLookupKeys(upVal, tabType);
    if (normTargets.has(upKey.toLowerCase()) || uKeys.some(k => normTargets.has(k))) {
      delete overlay.upsertedById[upKey];
    }
  }

  overlay.deletedIds = Array.from(new Set([...(overlay.deletedIds || []), ...Array.from(normTargets)]));
  overlay.lastSyncedAt = Date.now();
  saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);

  const cacheKey = `${tenantId}_${tabType}_${extracted.spreadsheetId}_${extracted.gid || '0'}`;
  sheetMemoryCache.delete(cacheKey);

  let syncedToRemoteSheet = false;
  const accessToken = await getServiceAccountAccessToken();
  const cfg = getGlobalGoogleConfig();

  if (accessToken && rowNumbersToClear.length > 0) {
    try {
      const lastColLetter = columnIndexToLetter((currentData.headers.length || 90) - 1);
      const ranges = rowNumbersToClear.map(rn => `A${rn}:${lastColLetter}${rn}`);
      const clearRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(extracted.spreadsheetId)}/values:batchClear`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ranges }),
        }
      );
      if (clearRes.ok) syncedToRemoteSheet = true;
    } catch (_) {}
  } else if (cfg.appsScriptBridgeUrl && rowNumbersToClear.length > 0) {
    try {
      const bridgeRes = await fetch(cfg.appsScriptBridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteRows',
          spreadsheetUrl,
          spreadsheetId: extracted.spreadsheetId,
          gid: extracted.gid,
          rowNumbers: rowNumbersToClear,
        }),
        redirect: 'follow',
      });
      if (bridgeRes.ok) syncedToRemoteSheet = true;
    } catch (_) {}
  }

  return { success: true, deletedCount: normTargets.size, syncedToRemoteSheet };
}
